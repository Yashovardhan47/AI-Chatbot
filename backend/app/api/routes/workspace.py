import re
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from typing import Literal
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.models.chat import Chat
from app.models.memory import Memory
from app.models.workspace import KnowledgeDocument, Commitment, MemoryProposal, AuthSession
from app.api.routes.memory import owned_project
from app.api.routes.continuity import owned_record, public_record
from app.services.memory_guard import memory_write_guard, invalidate_captures
from app.services.workspace_write import require_actor
from app.services.memory_logic import Candidate, grounded, normalize
from app.services.memory_service import _write_memory
from app.services.ai_service import provider_status
from app.core.config import settings

router = APIRouter(prefix="/api/workspace", tags=["workspace tools"])


@router.get("/search")
async def search(q: str = Query(min_length=2, max_length=120), project_id: str | None = None,
                 user: User = Depends(get_current_user)):
    await owned_project(project_id, str(user.id))
    key = {"user_id": str(user.id), "project_id": {"$in": [None, project_id]}}
    pattern = {"$regex": re.escape(q.strip()), "$options": "i"}
    if len(q.strip()) < 2:
        raise HTTPException(422, "Enter at least two characters")
    results = []
    for m in await Memory.find({**key, "active": True, "fact": pattern}).limit(10).to_list():
        results.append({"id": str(m.id), "kind": "memory", "title": m.fact[:160], "detail": f"{m.category.value} · version {m.version}", "href": f"/memory?memory={m.id}"})
    for d in await KnowledgeDocument.find({**key, "$or": [{"title": pattern}, {"chunks.text": pattern}]}).limit(10).to_list():
        results.append({"id": str(d.id), "kind": "document", "title": d.title, "detail": d.filename, "href": f"/knowledge?document={d.id}"})
    for c in await Chat.find({**key, "is_active": True, "$or": [{"title": pattern}, {"messages.content": pattern}]}).limit(10).to_list():
        results.append({"id": str(c.id), "kind": "chat", "title": c.title, "detail": f"{len(c.messages)} messages", "href": f"/chat/{c.id}"})
    for t in await Commitment.find({**key, "$or": [{"title": pattern}, {"notes": pattern}]}).limit(10).to_list():
        results.append({"id": str(t.id), "kind": "commitment", "title": t.title, "detail": t.status, "href": "/continuity"})
    return {"results": results, "query": q, "project_id": project_id}


@router.get("/activity")
async def activity(user: User = Depends(get_current_user)):
    key = {"user_id": str(user.id)}
    events = []
    for model, label, field, href in [(Memory, "Memory", "updated_at", "/memory"),
        (KnowledgeDocument, "Knowledge", "created_at", "/knowledge"), (Commitment, "Commitment", "updated_at", "/continuity")]:
        for record in await model.find(key).sort("-" + field).limit(8).to_list():
            events.append({"id": str(record.id), "kind": label.lower(), "title": getattr(record, "title", None) or record.fact,
                           "at": getattr(record, field), "href": href})
    return {"events": sorted(events, key=lambda e: e["at"], reverse=True)[:12]}


@router.get("/system")
async def system_status(user: User = Depends(get_current_user)):
    return {"version": "6.0.0", "provider": provider_status(), "google_enabled": bool(settings.GOOGLE_CLIENT_ID),
        "embeddings_configured": settings.EMBEDDINGS_PROVIDER != "none", "email_configured": bool(settings.MAIL_USERNAME and settings.MAIL_PASSWORD),
        "memory_review_required": user.preferences.memory_review_required, "production_mode": not settings.DEBUG}


@router.get("/review")
async def review(status: Literal["pending", "approved", "rejected"] = "pending", user: User = Depends(get_current_user)):
    key = {"user_id": str(user.id), "status": status}
    return {"proposals": [public_record(p) for p in await MemoryProposal.find(key).sort("-created_at").limit(100).to_list()],
            "total": await MemoryProposal.find(key).count()}


class ReviewInput(BaseModel):
    action: Literal["approve", "reject"]


@router.post("/review/{proposal_id}")
async def resolve_proposal(proposal_id: str, body: ReviewInput, user: User = Depends(get_current_user)):
    async with memory_write_guard(str(user.id)):
        fresh = await require_actor(str(user.id), user.auth_version)
        proposal = await owned_record(MemoryProposal, proposal_id, str(user.id))
        if proposal.status != "pending":
            raise HTTPException(409, "This proposal was already resolved")
        if body.action == "reject":
            await proposal.set({"status": "rejected", "resolved_at": datetime.utcnow()})
            return {"proposal": public_record(proposal)}
        if not fresh.preferences.memory_enabled:
            raise HTTPException(409, "Enable memory before approving a fact")
        await owned_project(proposal.project_id, str(user.id))
        from app.api.routes.chat import owned_chat
        chat = await owned_chat(proposal.chat_id, str(user.id))
        source = next((m for m in chat.messages if m.id == proposal.message_id and m.role == "user" and not m.private), None)
        candidate = Candidate.model_validate(proposal.candidate)
        if not source or not grounded(candidate, source.content):
            raise HTTPException(409, "The original user quotation is no longer eligible")
        memory, action = await _write_memory(str(user.id), candidate, proposal.project_id, proposal.chat_id,
            proposal.message_id, provenance="user", confirmed=True,
            observed_at=datetime(1970, 1, 1) + timedelta(microseconds=proposal.observed_us) if proposal.observed_us else proposal.observed_at)
        if action == "unchanged" and normalize(memory.fact) != normalize(candidate.fact):
            raise HTTPException(409, "A newer fact already exists. Reject this outdated proposal.")
        await proposal.set({"status": "approved", "resolved_at": datetime.utcnow()})
        await invalidate_captures(str(user.id))
        return {"proposal": public_record(proposal), "memory_id": str(memory.id)}


@router.get("/sessions")
async def active_sessions(user: User = Depends(get_current_user)):
    sessions = await AuthSession.find({"user_id": str(user.id), "revoked": False, "expires_at": {"$gt": datetime.utcnow()}}).sort("-created_at").limit(50).to_list()
    return {"sessions": [{"id": str(s.id), "created_at": s.created_at, "expires_at": s.expires_at} for s in sessions]}


@router.post("/sessions/revoke-all")
async def revoke_sessions(response: Response, user: User = Depends(get_current_user)):
    async with memory_write_guard(str(user.id)):
        await require_actor(str(user.id), user.auth_version)
        await User.get_motor_collection().update_one({"_id": user.id}, {"$inc": {"auth_version": 1}})
        await AuthSession.find({"user_id": str(user.id)}).update({"$set": {"revoked": True}})
    response.delete_cookie("refresh_token", path="/api/auth")
    return {"message": "Signed out all sessions. Sign in again to continue."}
