from datetime import datetime
import hashlib
import hmac
import json
import time
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.models.memory import Memory
from app.models.context_lab import ContextChange, ClaimSupport
from app.services.memory_guard import memory_write_guard, context_revision, invalidate_context
from app.services.workspace_write import require_actor
from app.services.context_logic import digest, eligible, reference, support_survives
from app.services.context_service import (owned, scope_allowed, eligible_memories, impact_report, create_replay,
    apply_replay, resolve_refs, load_target, decision_gate)
from app.services.memory_service import recall_ranking
from app.services.memory_logic import safe_fact, pack_context, utc_naive
from app.core.config import settings

router = APIRouter(prefix="/api/context", tags=["context research workflows"])


class MemoryReference(BaseModel):
    id: str = Field(pattern=r"^[0-9a-f]{24}$")
    version: int = Field(ge=1)


class DecisionInput(BaseModel):
    query: str = Field(min_length=2, max_length=2000)
    project_id: str | None = None
    choices: list[MemoryReference] = Field(default_factory=list, max_length=8)


class AuditInput(BaseModel):
    query: str = Field(min_length=2, max_length=2000)
    project_id: str | None = None
    budget: int = Field(default=6000, ge=200, le=16000)
    limit: int = Field(default=8, ge=1, le=20)


class ChangeInput(BaseModel):
    memory_id: str
    expected_version: int = Field(ge=1)
    action: Literal["correct", "revoke"] = "correct"
    fact: str | None = Field(default=None, min_length=2, max_length=1000)


class CommitChange(ChangeInput):
    expected_context_revision: int = Field(ge=0)
    preview_token: str = Field(max_length=100)


class ReplayInput(BaseModel):
    change_id: str
    target_kind: Literal["answer", "task"]
    target_id: str = Field(min_length=1, max_length=150)


class ApplyInput(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)


class SupportInput(BaseModel):
    chat_id: str
    message_id: str
    quote: str = Field(min_length=2, max_length=600)
    answer_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    support_sets: list[list[MemoryReference]] = Field(min_length=1, max_length=3)
    expected_version: int = Field(default=0, ge=0)


def change_record(change):
    return {"id": str(change.id), "memory_id": change.memory_id, "project_id": change.project_id,
            "before_version": change.before_version, "after_version": change.after_version,
            "action": change.action, "at": change.created_at}


def preview_signature(user, body, revision, timestamp):
    payload = {**body.model_dump(include={"memory_id", "expected_version", "action", "fact"}),
               "owner": str(user.id), "auth_version": user.auth_version, "revision": revision, "timestamp": timestamp}
    return hmac.new(settings.SECRET_KEY.encode(), json.dumps(payload, sort_keys=True).encode(), hashlib.sha256).hexdigest()


async def check_change(body, user):
    memory = await owned(Memory, body.memory_id, str(user.id))
    await scope_allowed(str(user.id), memory.project_id)
    if not memory.active:
        raise HTTPException(404, "Memory not found")
    if memory.version != body.expected_version:
        raise HTTPException(409, "Memory changed; reload before reviewing impact")
    if body.action == "correct" and (not body.fact or len(body.fact.strip()) < 2 or not safe_fact(body.fact)):
        raise HTTPException(422, "Enter a safe corrected fact")
    return memory


@router.get("/changes")
async def changes(offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=50), user: User = Depends(get_current_user)):
    key = {"user_id": str(user.id)}
    values = await ContextChange.find(key).sort("-created_at").skip(offset).limit(limit).to_list()
    rows = []
    for change in values:
        try:
            await scope_allowed(str(user.id), change.project_id)
        except HTTPException:
            continue
        evidence = await resolve_refs(user, change.project_id, [{"id": change.memory_id}], exact=False)
        rows.append({**change_record(change), "current_fact": evidence[0]["fact"] if evidence else None})
    return {"changes": rows, "total": await ContextChange.find(key).count(), "offset": offset,
            "next_offset": offset + len(values),
            "has_more": offset + len(values) < await ContextChange.find(key).count()}


@router.post("/preview")
async def preview(body: ChangeInput, offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100), user: User = Depends(get_current_user)):
    async with memory_write_guard(str(user.id)):
        fresh = await require_actor(str(user.id), user.auth_version)
        memory = await check_change(body, fresh)
        report = await impact_report(fresh, str(memory.id), memory.version, memory.project_id, preview=True, offset=offset, limit=limit)
        timestamp = int(time.time())
        token = f"{timestamp}." + preview_signature(fresh, body, report["context_revision"], timestamp)
        return {**report, "memory": {"id": str(memory.id), "fact": memory.fact, "version": memory.version},
                "action": body.action, "proposed_fact": body.fact.strip() if body.action == "correct" else None, "preview_token": token}


@router.post("/changes", status_code=201)
async def commit_change(body: CommitChange, user: User = Depends(get_current_user)):
    from app.api.routes.memory import _update_memory, _delete_memory, MemoryUpdate
    async with memory_write_guard(str(user.id)):
        fresh = await require_actor(str(user.id), user.auth_version)
        if await context_revision(str(user.id)) != body.expected_context_revision:
            raise HTTPException(409, "Context changed since the preview. Preview the impact again.")
        try:
            stamp, signature = body.preview_token.split(".", 1)
            stamp = int(stamp)
            valid = 0 <= time.time() - stamp <= 900 and hmac.compare_digest(signature,
                preview_signature(fresh, body, body.expected_context_revision, stamp))
        except (ValueError, TypeError):
            valid = False
        if not valid:
            raise HTTPException(409, "The proposed change differs from its preview or has expired. Preview again.")
        await check_change(body, fresh)
        if body.action == "revoke":
            return await _delete_memory(body.memory_id, fresh, body.expected_version)
        return await _update_memory(body.memory_id, MemoryUpdate(fact=body.fact, expected_version=body.expected_version), fresh)


@router.get("/changes/{change_id}")
async def change_impact(change_id: str, offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100), user: User = Depends(get_current_user)):
    async with memory_write_guard(str(user.id)):
        fresh = await require_actor(str(user.id), user.auth_version)
        change = await owned(ContextChange, change_id, str(user.id))
        return {**await impact_report(fresh, change.memory_id, change.before_version, change.project_id, offset=offset, limit=limit, change_id=change_id),
                "change": change_record(change)}


@router.post("/replays", status_code=201)
async def replay(body: ReplayInput, user: User = Depends(get_current_user)):
    async with memory_write_guard(str(user.id)):
        fresh = await require_actor(str(user.id), user.auth_version)
        return await create_replay(fresh, body.change_id, body.target_kind, body.target_id)


@router.post("/replays/{replay_id}/apply")
async def approve(replay_id: str, body: ApplyInput, user: User = Depends(get_current_user)):
    async with memory_write_guard(str(user.id)):
        fresh = await require_actor(str(user.id), user.auth_version)
        return await apply_replay(fresh, replay_id, body.title, body.notes)


@router.get("/answers/{chat_id}/{message_id}")
async def answer_evidence(chat_id: str, message_id: str, user: User = Depends(get_current_user)):
    (chat, message), scope, fingerprint, refs = await load_target(user, "answer", f"{chat_id}:{message_id}")
    memories = await eligible_memories(user, scope)
    versions = {str(m.id): m.version for m in memories}
    claims = await ClaimSupport.find({"user_id": str(user.id), "chat_id": chat_id, "message_id": message_id}).limit(20).to_list()
    return {"answer_fingerprint": fingerprint, "retrieved_evidence": await resolve_refs(user, scope, refs),
            "available_evidence": [{**reference(m), "fact": m.fact} for m in memories[:100]],
            "has_more_evidence": len(memories) > 100,
            "claims": [{"id": str(c.id), "version": c.version, "quote": message.content[c.start:c.end],
                        "support_sets": c.support_sets, "supported": support_survives(c.support_sets, versions)}
                       for c in claims if c.answer_fingerprint == fingerprint],
            "limitations": "Support is explicitly confirmed by the owner. The system does not prove the model's causal reasoning."}


@router.post("/support", status_code=201)
async def save_support(body: SupportInput, user: User = Depends(get_current_user)):
    async with memory_write_guard(str(user.id)):
        fresh = await require_actor(str(user.id), user.auth_version)
        (chat, message), scope, fingerprint, _ = await load_target(fresh, "answer", f"{body.chat_id}:{body.message_id}")
        if fingerprint != body.answer_fingerprint:
            raise HTTPException(409, "The answer changed. Reload its evidence.")
        start = message.content.find(body.quote)
        if start < 0:
            raise HTTPException(422, "Choose an exact quotation from this answer")
        groups = [[ref.model_dump() for ref in group] for group in body.support_sets]
        if any(not group or len(group) > 4 or len({r["id"] for r in group}) != len(group) for group in groups):
            raise HTTPException(422, "Use one to four distinct memories in each support group")
        if len({json_group(group) for group in groups}) != len(groups):
            raise HTTPException(422, "Independent support groups must be different")
        for group in groups:
            if len(await resolve_refs(fresh, scope, group)) != len(group):
                raise HTTPException(409, "A supporting memory changed or is not eligible in this scope")
        key = {"user_id": str(user.id), "chat_id": body.chat_id, "message_id": body.message_id,
               "start": start, "end": start + len(body.quote)}
        existing = await ClaimSupport.find_one(key)
        if (existing.version if existing else 0) != body.expected_version:
            raise HTTPException(409, "Claim support changed. Reload before replacing it.")
        values = {"answer_fingerprint": fingerprint, "support_sets": groups,
                  "memory_ids": sorted({r["id"] for group in groups for r in group})}
        if existing:
            await existing.set({**values, "version": existing.version + 1})
            claim = existing
        else:
            if await ClaimSupport.find({"user_id": str(user.id), "chat_id": body.chat_id, "message_id": body.message_id}).count() >= 20:
                raise HTTPException(422, "This answer already has 20 tracked claims")
            claim = ClaimSupport(**key, **values); await claim.insert()
        await invalidate_context(str(user.id))
        return {"id": str(claim.id), "version": claim.version, "message": "Owner-confirmed support saved"}


def json_group(group):
    return tuple(sorted((r["id"], r["version"]) for r in group))


@router.post("/clarify")
async def clarify(body: DecisionInput, user: User = Depends(get_current_user)):
    return await decision_gate(user, body.query, body.project_id, [c.model_dump() for c in body.choices])


@router.post("/recall-audit")
async def audit(body: AuditInput, user: User = Depends(get_current_user)):
    await scope_allowed(str(user.id), body.project_id)
    revision = await context_revision(str(user.id))
    records = await Memory.find({"user_id": str(user.id)}).to_list()
    counts = {"outside_scope": 0, "inactive": 0, "expired": 0, "unconfirmed": 0, "memory_paused": 0,
              "not_relevant": 0, "budget_or_limit": 0, "included": 0}
    available = []
    for memory in records:
        reason = ("outside_scope" if memory.project_id not in {None, body.project_id} else
                  "memory_paused" if not user.preferences.memory_enabled else
                  "inactive" if not memory.active else
                  "expired" if memory.expires_at and utc_naive(memory.expires_at) <= datetime.utcnow() else
                  "unconfirmed" if not eligible(memory, body.project_id) else None)
        if reason:
            counts[reason] += 1
        else:
            available.append(memory)
    if not user.preferences.memory_enabled:
        return {"disabled": True, "counts": counts, "used": [], "decisions": [], "context_chars": 2}
    ranked, mode = await recall_ranking(str(user.id), body.query, body.project_id)
    context, used = pack_context(ranked, body.budget, body.limit)
    selected = {r["id"] for r in used}
    candidates = {str(r["id"]) for r in ranked}
    decisions = []
    for memory in available:
        key = str(memory.id)
        reason = "included" if key in selected else "budget_or_limit" if key in candidates else "not_relevant"
        counts[reason] += 1
        if len(decisions) < 200:
            decisions.append({**reference(memory), "fact": memory.fact, "decision": reason})
    if await context_revision(str(user.id)) != revision:
        raise HTTPException(409, "Context changed during the audit. Run it again.")
    return {"counts": counts, "decisions": decisions, "used": used, "context_chars": len(context),
            "budget": body.budget, "retrieval_mode": mode, "details_complete": len(available) <= 200,
            "excluded_details_redacted": True,
            "context_revision": revision,
            "limitations": "Ineligible memories are counted without their text or IDs. Selection uses the same ranking and character budget as memory recall; documents and session snapshots are separate sources."}
