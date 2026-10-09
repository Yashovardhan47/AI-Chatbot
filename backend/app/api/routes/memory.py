from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from beanie import PydanticObjectId
from bson.errors import InvalidId

from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.memory import Memory, MemoryCategory, MemoryKind
from app.services.memory_logic import Candidate, fingerprint, safe_fact, tokens, utc_naive, observation_order
from app.services.memory_service import recall, serialize, upsert_memory
from app.services.memory_guard import memory_write_guard, invalidate_captures

router = APIRouter(prefix="/api/memory", tags=["NeuroSense memory"])


class MemoryInput(BaseModel):
    fact: str = Field(min_length=2, max_length=1000)
    category: MemoryCategory = MemoryCategory.other
    kind: MemoryKind = MemoryKind.semantic
    project_id: Optional[str] = None
    slot: Optional[str] = Field(default=None, max_length=100, pattern=r"^[\w.:-]+$")
    expires_at: Optional[datetime] = None


class MemoryUpdate(BaseModel):
    fact: Optional[str] = Field(default=None, min_length=2, max_length=1000)
    pinned: Optional[bool] = None
    confirmed: Optional[bool] = None
    expected_version: int = Field(ge=1)


class RecallInput(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    project_id: Optional[str] = None
    budget: int = Field(default=6000, ge=200, le=16000)
    limit: int = Field(default=8, ge=1, le=20)
    as_of: Optional[datetime] = None


async def owned_project(project_id: Optional[str], user_id: str):
    if not project_id:
        return
    try:
        project = await Project.get(PydanticObjectId(project_id))
    except (ValueError, InvalidId):
        project = None
    if not project or project.user_id != user_id or not project.is_active:
        raise HTTPException(404, "Project not found")


async def owned_memory(memory_id: str, user_id: str) -> Memory:
    try:
        memory = await Memory.get(PydanticObjectId(memory_id))
    except (ValueError, InvalidId):
        memory = None
    if not memory or memory.user_id != user_id or not memory.active:
        raise HTTPException(404, "Memory not found")
    return memory


@router.get("/")
async def list_memories(offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200),
                        project_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    user_id = str(current_user.id)
    await owned_project(project_id, user_id)
    query = {"user_id": user_id, "active": True}
    if project_id:
        query["project_id"] = {"$in": [None, project_id]}
    memories = await Memory.find(query).sort("-updated_at").skip(offset).limit(limit).to_list()
    total = await Memory.find(query).count()
    return {"memories": [serialize(m) for m in memories], "total": total, "offset": offset,
            "has_more": offset + len(memories) < total}


@router.get("/stats")
async def memory_stats(current_user: User = Depends(get_current_user)):
    memories = await Memory.find({"user_id": str(current_user.id), "active": True}).to_list()
    return {"total": len(memories), "pinned": sum(m.pinned for m in memories),
            "review_needed": sum(m.provenance == "legacy" and not m.confirmed for m in memories),
            "revisions": sum(len(m.revisions) for m in memories),
            "memory_enabled": current_user.preferences.memory_enabled,
            "auto_capture": current_user.preferences.memory_auto_capture}


@router.post("/recall")
async def recall_memories(body: RecallInput, current_user: User = Depends(get_current_user)):
    await owned_project(body.project_id, str(current_user.id))
    if not current_user.preferences.memory_enabled:
        return {"context": "[]", "used": [], "context_chars": 2, "candidates": 0, "disabled": True}
    return await recall(str(current_user.id), body.query, body.project_id, body.budget, body.limit,
                        utc_naive(body.as_of) if body.as_of else None)


@router.post("/", status_code=201)
async def create_memory(body: MemoryInput, current_user: User = Depends(get_current_user)):
    fact = body.fact.strip()
    if len(fact) < 2 or not safe_fact(fact):
        raise HTTPException(422, "Use a personal fact without credentials or system instructions")
    await owned_project(body.project_id, str(current_user.id))
    expiry = utc_naive(body.expires_at) if body.expires_at else None
    if expiry and expiry <= datetime.utcnow():
        raise HTTPException(422, "Expiry must be in the future")
    candidate = Candidate(fact=fact, quote=fact, slot=body.slot or "note." + fingerprint(fact),
                          category=body.category, kind=body.kind, confidence=100, explicit=True)
    memory, action = await upsert_memory(str(current_user.id), candidate, body.project_id,
                                         provenance="user", confirmed=True, expires_at=expiry)
    return {"memory": serialize(memory), "action": action}


@router.delete("/")
async def clear_memories(current_user: User = Depends(get_current_user)):
    # Hard deletion includes all revisions and any old inactive records.
    async with memory_write_guard(str(current_user.id)):
        await Memory.find({"user_id": str(current_user.id)}).delete()
        await invalidate_captures(str(current_user.id))
    return {"message": "All memory facts and revisions deleted. Chat transcripts are separate."}


@router.get("/{memory_id}")
async def get_memory(memory_id: str, current_user: User = Depends(get_current_user)):
    return {"memory": serialize(await owned_memory(memory_id, str(current_user.id)))}


async def _update_memory(memory_id: str, body: MemoryUpdate, current_user: User):
    memory = await owned_memory(memory_id, str(current_user.id))
    if memory.version != body.expected_version:
        raise HTTPException(409, "Memory changed; reload before editing")
    changes = {"updated_at": datetime.utcnow()}
    if body.fact is not None:
        fact = body.fact.strip()
        if len(fact) < 2 or not safe_fact(fact):
            raise HTTPException(422, "Use a personal fact without credentials or system instructions")
        revision = {"fact": memory.fact, "version": memory.version, "valid_from": memory.valid_from,
                    "valid_until": changes["updated_at"], "source_quote": memory.source_quote,
                    "source_chat_id": memory.source_chat_id, "source_message_id": memory.source_message_id}
        changes.update(fact=fact, source_quote=fact, source_chat_id=None, source_message_id=None,
                       provenance="user", confirmed=True, valid_from=changes["updated_at"],
                       observed_us=observation_order(changes["updated_at"]),
                       keywords=sorted(tokens(fact + " " + (memory.slot or ""))))
    if body.pinned is not None:
        changes["pinned"] = body.pinned
    if body.confirmed is not None:
        changes["confirmed"] = body.confirmed
        if body.confirmed:
            changes["provenance"] = "user"
    update = {"$set": changes, "$inc": {"version": 1}}
    if body.fact is not None:
        update["$push"] = {"revisions": revision}
    version_query = {"$or": [{"version": body.expected_version}, {"version": {"$exists": False}}]}
    result = await Memory.get_motor_collection().update_one(
        {"_id": memory.id, "user_id": memory.user_id, **version_query}, update)
    if not result.matched_count:
        raise HTTPException(409, "Memory changed; reload before editing")
    await invalidate_captures(str(current_user.id))
    return {"memory": serialize(await owned_memory(memory_id, str(current_user.id)))}


@router.patch("/{memory_id}")
async def update_memory(memory_id: str, body: MemoryUpdate, current_user: User = Depends(get_current_user)):
    async with memory_write_guard(str(current_user.id)):
        return await _update_memory(memory_id, body, current_user)


@router.delete("/{memory_id}")
async def delete_memory(memory_id: str, current_user: User = Depends(get_current_user)):
    async with memory_write_guard(str(current_user.id)):
        memory = await owned_memory(memory_id, str(current_user.id))
        await memory.delete()
        await invalidate_captures(str(current_user.id))
    return {"message": "Memory and all its revisions deleted. Chat transcripts are separate."}
