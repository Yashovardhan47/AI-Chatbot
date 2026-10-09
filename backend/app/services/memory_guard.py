import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from uuid import uuid4
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from app.models.memory_state import MemoryState


async def memory_epoch(user_id: str) -> int:
    collection = MemoryState.get_motor_collection()
    try:
        await collection.update_one({"user_id": user_id}, {"$setOnInsert": {
            "user_id": user_id, "epoch": 0, "lease_token": "", "lease_until": datetime(1970, 1, 1)}}, upsert=True)
    except DuplicateKeyError:
        pass
    state = await collection.find_one({"user_id": user_id})
    return state["epoch"]


@asynccontextmanager
async def memory_write_guard(user_id: str):
    """Serialize owner mutations across workers; crash leases expire after 60s.

    Expensive extraction runs OUTSIDE this lease. Memory CRUD must complete in
    under 60s; pathological stalls require MongoDB transactions in production.
    """
    await memory_epoch(user_id)
    collection = MemoryState.get_motor_collection()
    token = uuid4().hex
    state = None
    for _ in range(100):
        now = datetime.utcnow()
        state = await collection.find_one_and_update(
            {"user_id": user_id, "lease_until": {"$lte": now}},
            {"$set": {"lease_token": token, "lease_until": now + timedelta(seconds=60)}},
            return_document=ReturnDocument.AFTER)
        if state:
            break
        await asyncio.sleep(.03)
    if not state:
        raise RuntimeError("Memory is busy; please retry")
    try:
        yield state
    finally:
        await collection.update_one({"user_id": user_id, "lease_token": token},
                                    {"$set": {"lease_until": datetime(1970, 1, 1), "lease_token": ""}})


async def invalidate_captures(user_id: str):
    """Called inside the owner lease after delete/clear/correction."""
    await MemoryState.get_motor_collection().update_one({"user_id": user_id}, {"$inc": {"epoch": 1}})
