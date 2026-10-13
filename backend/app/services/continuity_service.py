from datetime import datetime, timedelta, timezone as tz
from uuid import uuid4
from zoneinfo import ZoneInfo
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from beanie import PydanticObjectId
from bson.errors import InvalidId
from app.models.user import User
from app.models.workspace import Commitment, Notification, SessionDigest
from app.services.memory_logic import safe_fact, rank_memories
from app.services.memory_guard import memory_epoch, memory_write_guard
from app.core.config import settings


def public_record(record):
    return {"id": str(record.id), **record.model_dump(exclude={"id", "revision_id", "lease_token", "lease_until"})}


async def capture_session(chat, user_id):
    epoch = await memory_epoch(user_id)
    from app.services.knowledge_service import make_chunks
    from app.models.chat import Chat
    quotes = []
    for message in chat.messages:
        if message.role == "user" and not message.private and message.content.strip() and safe_fact(message.content):
            for chunk in make_chunks([(None, message.content)]):
                quotes.append({"message_id": message.id, "part": chunk.ordinal,
                               "quote": chunk.text, "observed_at": message.created_at})
    if len(quotes) > 2000:
        raise ValueError("Session exceeds the snapshot limit; save its source as separate documents")
    if not quotes:
        return None
    async with memory_write_guard(user_id) as state:
        user = await User.get(user_id)
        source = await Chat.get(chat.id)
        if state["epoch"] != epoch or not source or not source.is_active or not user or not user.is_active or not user.preferences.memory_enabled:
            return None
        key = {"user_id": user_id, "chat_id": str(chat.id)}
        existing = await SessionDigest.find_one(key)
        if existing:
            await existing.set({"quotes": quotes, "title": chat.title, "updated_at": datetime.utcnow()})
            return existing
        digest = SessionDigest(**key, project_id=chat.project_id, title=chat.title, quotes=quotes)
        await digest.insert(); return digest


async def retrieve_continuity(user_id, query, project_id=None):
    scope = {"user_id": user_id, "project_id": {"$in": [None, project_id]}}
    tasks = await Commitment.find({**scope, "status": "pending"}).to_list()
    records = [{"id": str(t.id), "fact": t.title + (": " + t.notes if t.notes else ""), "slot": "commitment",
                "created_at": t.created_at, "project_id": t.project_id, "provenance": "user", "confirmed": True,
                "kind": "task", "version": t.version, "due_at": t.due_at} for t in tasks]
    for digest in await SessionDigest.find(scope).to_list():
        for number, quote in enumerate(digest.quotes):
            records.append({"id": f"{digest.id}:{number}", "chat_id": digest.chat_id, "fact": quote["quote"],
                "created_at": quote["observed_at"], "project_id": digest.project_id, "provenance": "user", "confirmed": True,
                "kind": "episode", "version": 1})
    ranked = rank_memories(records, query, project_id)
    if any(phrase in query.lower() for phrase in ("next task", "what next", "do next", "pending task", "follow up")):
        present = {r["id"] for r in ranked}
        ranked += [{**r, "score": .8, "reason": "Pending commitment"} for r in records if r["kind"] == "task" and r["id"] not in present]
    return ranked[:4]


def next_occurrence(due_at, recurrence, timezone, now):
    if recurrence == "none":
        return None
    local = due_at.replace(tzinfo=tz.utc).astimezone(ZoneInfo(timezone))
    step = timedelta(days=1 if recurrence == "daily" else 7)
    target = local + step
    while target.astimezone(tz.utc).replace(tzinfo=None) <= now:
        target += step
    return target.astimezone(tz.utc).replace(tzinfo=None)


async def process_due_commitments(now=None, limit=100):
    now = now or datetime.utcnow(); count = 0
    collection = Commitment.get_motor_collection()
    for _ in range(limit):
        token = uuid4().hex
        raw = await collection.find_one_and_update({"status": "pending", "due_at": {"$ne": None, "$lte": now},
            "lease_until": {"$lte": now}, "$expr": {"$lt": ["$reminded_version", "$version"]}},
            {"$set": {"lease_token": token, "lease_until": now + timedelta(seconds=60)}},
            sort=[("due_at", 1)], return_document=ReturnDocument.AFTER)
        if not raw:
            break
        task = Commitment.model_validate(raw); user = await User.get(task.user_id)
        if not user or not user.is_active:
            await collection.update_one({"_id": task.id, "lease_token": token}, {"$set": {"reminded_version": task.version, "lease_until": datetime(1970, 1, 1)}})
            continue
        dedupe = f"commitment:{task.id}:v{task.version}"
        try:
            await Notification(user_id=task.user_id, dedupe_key=dedupe, task_id=str(task.id), title=task.title,
                message=task.notes or "This commitment is due. Open Continuity to follow through.",
                email_status="queued" if user.preferences.reminder_emails else "disabled", next_attempt_at=now).insert()
        except DuplicateKeyError:
            pass
        following = next_occurrence(task.due_at, task.recurrence, task.timezone, now)
        changes = {"reminded_version": task.version, "lease_until": datetime(1970, 1, 1), "lease_token": ""}
        if following:
            changes.update(due_at=following, version=task.version+1)
        result = await collection.update_one({"_id": task.id, "version": task.version, "status": "pending", "lease_token": token}, {"$set": changes})
        if result.matched_count:
            count += 1
        else:
            await Notification.find({"dedupe_key": dedupe}).delete()
    return count


async def deliver_reminder_emails(now=None, limit=20):
    if not settings.MAIL_USERNAME or not settings.MAIL_PASSWORD:
        return 0
    now = now or datetime.utcnow(); sent = 0
    collection = Notification.get_motor_collection()
    for _ in range(limit):
        token = uuid4().hex
        raw = await collection.find_one_and_update({"email_status": {"$in": ["queued", "retry"]}, "next_attempt_at": {"$lte": now},
            "lease_until": {"$lte": now}, "attempts": {"$lt": 5}}, {"$set": {"lease_token": token, "lease_until": now+timedelta(seconds=60)}, "$inc": {"attempts": 1}}, return_document=ReturnDocument.AFTER)
        if not raw:
            break
        notice = Notification.model_validate(raw); user = await User.get(notice.user_id)
        try:
            task = await Commitment.get(PydanticObjectId(notice.task_id))
        except (ValueError, InvalidId):
            task = None
        if not user or not user.is_active or not user.preferences.reminder_emails or not task or task.status != "pending":
            status = "disabled"
        else:
            try:
                from app.services.email_service import send_reminder_email
                await send_reminder_email(user.email, notice.title, notice.message)
                status = "sent"; sent += 1
            except Exception:
                status = "failed" if notice.attempts >= 5 else "retry"
        await collection.update_one({"_id": notice.id, "lease_token": token}, {"$set": {"email_status": status,
            "next_attempt_at": now+timedelta(seconds=min(3600, 60*2**notice.attempts)), "lease_until": datetime(1970,1,1), "lease_token": ""}})
    return sent
