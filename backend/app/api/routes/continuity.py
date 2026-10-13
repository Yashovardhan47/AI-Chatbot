from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.models.memory import Memory
from app.models.project import Project
from app.models.workspace import Commitment, Notification, SessionDigest, KnowledgeDocument
from app.api.routes.memory import owned_project, owned_memory
from app.api.routes.chat import owned_chat
from app.services.memory_logic import utc_naive
from app.services.continuity_service import public_record, capture_session
from app.core.config import settings
from app.services.memory_guard import memory_write_guard
from app.services.workspace_write import require_actor

router = APIRouter(prefix="/api/continuity", tags=["continuity workspace"])


class TaskInput(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    notes: str = Field(default="", max_length=2000)
    project_id: str | None = None
    source_chat_id: str | None = None
    source_memory_id: str | None = None
    due_at: datetime | None = None
    timezone: str = "Asia/Kolkata"
    recurrence: Literal["none", "daily", "weekly"] = "none"


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    status: Literal["pending", "done", "cancelled"] | None = None
    due_at: datetime | None = None
    recurrence: Literal["none", "daily", "weekly"] | None = None
    expected_version: int = Field(ge=1)


async def owned_record(model, identifier, user_id):
    try:
        record = await model.get(PydanticObjectId(identifier))
    except (ValueError, InvalidId):
        record = None
    if not record or record.user_id != user_id:
        raise HTTPException(404, "Item not found")
    return record


@router.get("/overview")
async def overview(user: User = Depends(get_current_user)):
    key = {"user_id": str(user.id)}
    from app.services.ai_service import provider_status
    tasks = await Commitment.find({**key, "status": "pending"}).sort("due_at").limit(10).to_list()
    sessions = await SessionDigest.find(key).sort("-updated_at").limit(5).to_list()
    projects = await Project.find({**key, "is_active": True}).to_list()
    return {"counts": {"memories": await Memory.find({**key, "active": True}).count(), "documents": await KnowledgeDocument.find(key).count(),
        "sessions": await SessionDigest.find(key).count(), "pending_tasks": await Commitment.find({**key, "status": "pending"}).count(),
        "completed_tasks": await Commitment.find({**key, "status": "done"}).count(), "unread_notifications": await Notification.find({**key, "read": False}).count()},
        "tasks": [public_record(t) for t in tasks], "sessions": [public_record(s) for s in sessions],
        "projects": [{"id": str(p.id), "name": p.name} for p in projects], "provider": provider_status(),
        "semantics": {"enabled": settings.EMBEDDINGS_PROVIDER != "none", "model": settings.EMBEDDINGS_MODEL},
        "reminder_email_configured": bool(settings.MAIL_USERNAME and settings.MAIL_PASSWORD)}


@router.get("/tasks")
async def list_tasks(status: Literal["pending", "done", "cancelled"] | None = None, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200), user: User = Depends(get_current_user)):
    key = {"user_id": str(user.id)} | ({"status": status} if status else {})
    tasks = await Commitment.find(key).sort("-updated_at").skip(offset).limit(limit).to_list()
    return {"tasks": [public_record(t) for t in tasks], "total": await Commitment.find(key).count()}


@router.post("/tasks", status_code=201)
async def create_task(body: TaskInput, user: User = Depends(get_current_user)):
    await owned_project(body.project_id, str(user.id))
    if body.source_chat_id:
        chat = await owned_chat(body.source_chat_id, str(user.id))
        if chat.project_id and chat.project_id != body.project_id:
            raise HTTPException(422, "Source conversation belongs to a different project")
    if body.source_memory_id:
        memory = await owned_memory(body.source_memory_id, str(user.id))
        if memory.project_id and memory.project_id != body.project_id:
            raise HTTPException(422, "Source memory belongs to a different project")
    try:
        ZoneInfo(body.timezone)
    except ZoneInfoNotFoundError:
        raise HTTPException(422, "Choose a valid IANA timezone")
    if body.recurrence != "none" and not body.due_at:
        raise HTTPException(422, "Recurring commitments need a due time")
    if len(body.title.strip()) < 2:
        raise HTTPException(422, "Enter a commitment title")
    task = Commitment(user_id=str(user.id), **(body.model_dump() | {"due_at": utc_naive(body.due_at) if body.due_at else None}))
    async with memory_write_guard(str(user.id)):
        await require_actor(str(user.id), user.auth_version)
        await task.insert()
    return {"task": public_record(task)}


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, body: TaskUpdate, user: User = Depends(get_current_user)):
    task = await owned_record(Commitment, task_id, str(user.id))
    changes = body.model_dump(exclude_unset=True, exclude={"expected_version"})
    if any(value is None for key, value in changes.items() if key != "due_at"):
        raise HTTPException(422, "Only the due date may be cleared")
    if changes.get("due_at"):
        changes["due_at"] = utc_naive(changes["due_at"])
    if changes.get("recurrence", task.recurrence) != "none" and not changes.get("due_at", task.due_at):
        raise HTTPException(422, "Recurring commitments need a due time")
    changes.update(updated_at=datetime.utcnow(), lease_until=datetime(1970,1,1), lease_token="")
    result = await Commitment.get_motor_collection().update_one({"_id": task.id, "user_id": str(user.id), "version": body.expected_version}, {"$set": changes, "$inc": {"version": 1}})
    if not result.matched_count:
        raise HTTPException(409, "Commitment changed; reload before editing")
    return {"task": public_record(await owned_record(Commitment, task_id, str(user.id)))}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: User = Depends(get_current_user)):
    await (await owned_record(Commitment, task_id, str(user.id))).delete()
    await Notification.find({"user_id": str(user.id), "task_id": task_id}).delete()
    return {"message": "Commitment and notifications removed"}


@router.get("/sessions")
async def list_sessions(user: User = Depends(get_current_user)):
    return {"sessions": [public_record(s) for s in await SessionDigest.find({"user_id": str(user.id)}).sort("-updated_at").limit(100).to_list()]}


@router.post("/sessions/{chat_id}")
async def pin_session(chat_id: str, user: User = Depends(get_current_user)):
    digest = await capture_session(await owned_chat(chat_id, str(user.id)), str(user.id))
    if not digest:
        raise HTTPException(422, "Enable memory and provide safe user quotations before saving a snapshot")
    return {"session": public_record(digest)}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: User = Depends(get_current_user)):
    from app.services.memory_guard import memory_write_guard, invalidate_captures
    async with memory_write_guard(str(user.id)):
        await (await owned_record(SessionDigest, session_id, str(user.id))).delete()
        await invalidate_captures(str(user.id))
    return {"message": "Session snapshot removed"}


@router.get("/notifications")
async def get_notifications(user: User = Depends(get_current_user)):
    key = {"user_id": str(user.id)}
    return {"notifications": [public_record(n) for n in await Notification.find(key).sort("-created_at").limit(100).to_list()],
            "unread": await Notification.find({**key, "read": False}).count()}


@router.patch("/notifications/{notification_id}/read")
async def read_notification(notification_id: str, user: User = Depends(get_current_user)):
    await (await owned_record(Notification, notification_id, str(user.id))).set({"read": True})
    return {"message": "Marked as read"}
