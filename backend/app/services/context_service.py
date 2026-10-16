"""Permission-aware, reference-only correction review and recall diagnostics.

No language-model output is asserted to be a causal proof. A replay re-resolves
current evidence and proposes a separate evidence note or an owner-edited task.
All writes run under the existing short owner mutation lease; no provider call
or unbounded job runs while holding it.
"""
import json
from datetime import datetime, timedelta
from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from app.models.user import User
from app.models.project import Project
from app.models.memory import Memory
from app.models.chat import Chat
from app.models.workspace import Commitment, MemoryEdge
from app.models.context_lab import ContextChange, ClaimSupport, ContextReplay, AnswerReview
from app.services.context_logic import digest, eligible, reference, support_survives, decision_request, conflict_pairs
from app.services.memory_logic import rank_memories, safe_fact, utc_naive
from app.services.memory_guard import context_revision, invalidate_context


async def owned(model, identifier, user_id):
    try:
        record = await model.get(PydanticObjectId(identifier))
    except (ValueError, InvalidId, TypeError):
        record = None
    if not record or record.user_id != user_id:
        raise HTTPException(404, "Item not found")
    return record


async def scope_allowed(user_id, project_id):
    if project_id:
        project = await owned(Project, project_id, user_id)
        if not project.is_active:
            raise HTTPException(404, "Project not available")


async def eligible_memories(user, project_id):
    await scope_allowed(str(user.id), project_id)
    if not user.preferences.memory_enabled:
        return []
    memories = await Memory.find({"user_id": str(user.id), "active": True,
                                  "project_id": {"$in": [None, project_id]}}).to_list()
    return [m for m in memories if eligible(m, project_id)]


def memory_refs(message):
    return [{"id": item["id"], "version": item.get("version", 0)}
            for item in (message.memory_receipt or {}).get("used", [])
            if item.get("kind", "memory") == "memory" and isinstance(item.get("id"), str)]


async def resolve_refs(user, project_id, refs, exact=True):
    if not user.preferences.memory_enabled:
        return []
    await scope_allowed(str(user.id), project_id)
    results = []
    for ref in refs[:12]:
        try:
            memory = await owned(Memory, ref["id"], str(user.id))
        except HTTPException:
            continue
        if eligible(memory, project_id) and (not exact or memory.version == ref.get("version")):
            results.append({**reference(memory), "fact": memory.fact, "project_id": memory.project_id})
    return results


async def record_change(memory, before_version, action="corrected"):
    change = ContextChange(user_id=memory.user_id, memory_id=str(memory.id), project_id=memory.project_id,
                           before_version=before_version, after_version=None if action == "revoked" else memory.version,
                           action=action)
    await change.insert()
    return change


async def decision_gate(user, query, project_id=None, choices=None):
    memories = await eligible_memories(user, project_id)
    by_id = {str(m.id): m for m in memories}
    choices = choices or []
    for choice in choices:
        selected = by_id.get(choice["id"])
        if not selected or selected.version != choice["version"]:
            raise HTTPException(409, "That context choice changed or is no longer allowed. Ask again.")
    if not decision_request(query):
        return {"needs_clarification": False, "exclude_ids": []}
    ranked = rank_memories([{"id": str(m.id), **m.model_dump(exclude={"id"})} for m in memories], query, project_id)
    relevant = {str(item["id"]) for item in ranked if item.get("reason", "").startswith("Matched:")}
    edges = await MemoryEdge.find({"user_id": str(user.id), "relation": "contradicts"}).to_list()
    pairs = conflict_pairs(memories, edges, relevant)
    if not pairs:
        return {"needs_clarification": False, "exclude_ids": []}
    # One disjoint conflict is clarified per turn; never pretend one answer
    # resolves a separate unresolved pair.
    selected_ids = {choice["id"] for choice in choices}
    if any(len(set(pair) & selected_ids) > 1 for pair in pairs):
        raise HTTPException(422, "Choose one side of each conflicting context pair")
    unresolved = [pair for pair in pairs if not set(pair) & selected_ids]
    if unresolved:
        pair = unresolved[0]
        return {"needs_clarification": True, "question": "Which remembered context should guide this decision?",
                "reason": "These eligible memories are explicitly contradictory or give different values for one stable context slot.",
                "alternatives": [{**reference(by_id[key]), "fact": by_id[key].fact,
                                  "scope": "Project" if by_id[key].project_id else "Personal"} for key in pair],
                "selected": choices, "remaining_conflicts": len(unresolved), "method": "explicit-edge-or-slot-v1"}
    excluded = sorted({key for pair in pairs for key in pair if key not in selected_ids})
    return {"needs_clarification": False, "exclude_ids": excluded, "selected": choices,
            "reason": "One-turn context selection. Stored memories are unchanged."}


def _used_before(refs, memory_id, version):
    return any(ref.get("id") == memory_id and ref.get("version", 0) <= version for ref in refs)


async def impact_report(user, memory_id, before_version, project_id, *, offset=0, limit=30, preview=False, change_id=None):
    await scope_allowed(str(user.id), project_id)
    owner = str(user.id)
    claims = await ClaimSupport.find({"user_id": owner, "memory_ids": memory_id}).limit(501).to_list()
    claim_chats = [PydanticObjectId(c.chat_id) for c in claims[:500]]
    key = {"user_id": owner, "is_active": True, "$or": [
        {"messages.memory_receipt.used.id": memory_id}, {"_id": {"$in": claim_chats}}]}
    if project_id:
        key["project_id"] = project_id
    chats = await Chat.find(key).sort("-updated_at").limit(201).to_list()
    task_key = {"user_id": owner, "status": "pending", "$or": [
        {"source_memory_id": memory_id}, {"evidence_refs.id": memory_id}]}
    if project_id:
        task_key["project_id"] = project_id
    tasks = await Commitment.find(task_key).sort("-updated_at").limit(201).to_list()
    rows, scopes = [], {}

    async def versions(scope):
        if scope not in scopes:
            try:
                values = {str(m.id): m.version for m in await eligible_memories(user, scope)}
            except HTTPException:
                values = None
            if values is not None and preview:
                values.pop(memory_id, None)  # Proposed correction/revocation invalidates the old version.
            scopes[scope] = values
        return scopes[scope]

    reviews = await AnswerReview.find({"user_id": owner, "change_id": change_id}).limit(1000).to_list() if change_id else []
    reviewed = {(r.chat_id, r.message_id): r for r in reviews}
    for chat in chats[:200]:
        current = await versions(chat.project_id)
        if current is None:
            continue
        for message in chat.messages:
            if message.role != "assistant" or message.private:
                continue
            linked = [c for c in claims if c.chat_id == str(chat.id) and c.message_id == message.id
                      and c.answer_fingerprint == digest(message.content)
                      and any(_used_before(group, memory_id, before_version) for group in c.support_sets)]
            if not linked and not _used_before(memory_refs(message), memory_id, before_version):
                continue
            survives = bool(linked) and all(support_survives(c.support_sets, current) for c in linked)
            state = "supported" if survives else "review" if linked else "possible"
            review = reviewed.get((str(chat.id), message.id))
            if review and review.answer_fingerprint == digest(message.content) and all(
                    current.get(r["id"]) == r["version"] for r in review.references):
                state = "reviewed"
            rows.append({"kind": "answer", "id": f"{chat.id}:{message.id}", "chat_id": str(chat.id),
                         "message_id": message.id, "title": chat.title, "excerpt": message.content[:260],
                         "classification": state, "confirmed_claims": len(linked), "unknown_dependencies": True,
                         "claims": [{"id": str(c.id), "quote": message.content[c.start:c.end],
                                     "independent_support_survives": support_survives(c.support_sets, current)} for c in linked],
                         "href": f"/chat/{chat.id}"})
    for task in tasks[:200]:
        current = await versions(task.project_id)
        if current is None:
            continue
        refs = task.evidence_refs or ([{"id": task.source_memory_id, "version": 0}] if task.source_memory_id else [])
        if _used_before(refs, memory_id, before_version):
            rows.append({"kind": "task", "id": str(task.id), "title": task.title, "excerpt": task.notes[:260],
                         "classification": "review", "version": task.version, "href": "/continuity",
                         "confirmed_claims": 0, "unknown_dependencies": True})
    return {"items": rows[offset:offset + limit], "total": len(rows), "offset": offset,
            "has_more": offset + limit < len(rows),
            "scan_complete": len(chats) <= 200 and len(tasks) <= 200 and len(claims) <= 500 and len(reviews) < 1000,
            "counts": {name: sum(r["classification"] == name for r in rows) for name in ("review", "possible", "supported", "reviewed")},
            "context_revision": await context_revision(owner),
            "method": "versioned-receipts-and-owner-confirmed-support-v1",
            "limitations": "Retrieved evidence shows possible impact, not causal proof. Untracked dependencies may exist. Large workspaces use bounded scans."}


async def load_target(user, kind, target_id):
    owner = str(user.id)
    if kind == "task":
        task = await owned(Commitment, target_id, owner)
        await scope_allowed(owner, task.project_id)
        if task.status != "pending":
            raise HTTPException(409, "Only a pending commitment can be repaired here")
        payload = {key: getattr(task, key) for key in ("title", "notes", "version", "status", "source_memory_id", "evidence_refs")}
        return task, task.project_id, digest(json.dumps(payload, sort_keys=True)), task.evidence_refs
    try:
        chat_id, message_id = target_id.split(":", 1)
    except ValueError:
        raise HTTPException(404, "Answer not found")
    chat = await owned(Chat, chat_id, owner)
    await scope_allowed(owner, chat.project_id)
    message = next((m for m in chat.messages if m.id == message_id and m.role == "assistant" and not m.private), None)
    if not chat.is_active or not message or message.clarification or (message.memory_receipt or {}).get("disabled"):
        raise HTTPException(404, "Answer not available")
    return (chat, message), chat.project_id, digest(message.content), memory_refs(message)


async def replay_packet(user, replay, target=None):
    evidence = await resolve_refs(user, replay.project_id, replay.references)
    return {"id": str(replay.id), "status": replay.status, "target_kind": replay.target_kind,
            "target_id": replay.target_id, "expires_at": replay.expires_at, "evidence": evidence,
            "proposal": "Attach a reviewed note with the currently eligible evidence. The original answer remains historical."
                        if replay.target_kind == "answer" else "Review the commitment title and notes using current evidence. Its due date and completion status are preserved.",
            "task": {"title": target.title, "notes": target.notes, "version": target.version} if replay.target_kind == "task" and target else None,
            "method": "scoped-evidence-replay-v1", "model_calls": 0}


async def create_replay(user, change_id, kind, target_id):
    owner = str(user.id)
    if not user.preferences.memory_enabled:
        raise HTTPException(409, "Enable memory before replaying its evidence")
    change = await owned(ContextChange, change_id, owner)
    await scope_allowed(owner, change.project_id)
    target, scope, fingerprint, refs = await load_target(user, kind, target_id)
    if change.project_id and scope != change.project_id:
        raise HTTPException(404, "Change not available in this scope")
    candidates = list(refs)
    if kind == "answer":
        chat, message = target
        claims = await ClaimSupport.find({"user_id": owner, "chat_id": str(chat.id), "message_id": message.id,
                                          "memory_ids": change.memory_id}).limit(20).to_list()
        candidates += [r for c in claims if c.answer_fingerprint == fingerprint for group in c.support_sets for r in group]
    elif target.source_memory_id == change.memory_id and not refs:
        candidates.append({"id": change.memory_id, "version": 0})
    if not _used_before(candidates, change.memory_id, change.before_version):
        raise HTTPException(409, "This item no longer depends on that memory version")
    # Resolve only the original evidence IDs plus explicitly confirmed support.
    # No deleted quote, stale prompt, full old answer or unrelated source is
    # copied into the replay record.
    candidates = list({r["id"]: r for r in candidates}.values())
    current = await resolve_refs(user, scope, candidates, exact=False)
    admitted, size = [], 0
    for item in current:
        if size + len(item["fact"]) <= 6000 and len(admitted) < 8:
            admitted.append({"id": item["id"], "version": item["version"]})
            size += len(item["fact"])
    replay = ContextReplay(user_id=owner, change_id=change_id, project_id=scope, target_kind=kind, target_id=target_id,
                           target_fingerprint=fingerprint, context_revision=await context_revision(owner),
                           auth_version=user.auth_version, references=admitted, expires_at=datetime.utcnow() + timedelta(minutes=15))
    await replay.insert()
    return await replay_packet(user, replay, target if kind == "task" else None)


async def apply_replay(user, replay_id, title=None, notes=None):
    owner = str(user.id)
    replay = await owned(ContextReplay, replay_id, owner)
    if replay.status == "applied":
        return {"status": "applied", "id": str(replay.id), "already_applied": True}
    if replay.status != "draft" or replay.expires_at <= datetime.utcnow():
        raise HTTPException(409, "This replay expired. Run it again with current evidence.")
    if (replay.auth_version != user.auth_version or not user.preferences.memory_enabled
            or replay.context_revision != await context_revision(owner)):
        raise HTTPException(409, "Your context or permissions changed. Run the replay again.")
    await owned(ContextChange, replay.change_id, owner)
    target, scope, fingerprint, _ = await load_target(user, replay.target_kind, replay.target_id)
    resolved = await resolve_refs(user, scope, replay.references)
    if len(resolved) != len(replay.references):
        raise HTTPException(409, "Evidence changed or was revoked. Run the replay again.")
    if replay.target_kind == "task" and target.last_context_replay == str(replay.id):
        await replay.set({"status": "applied"})
        return {"status": "applied", "id": str(replay.id), "already_applied": True}
    if fingerprint != replay.target_fingerprint:
        raise HTTPException(409, "The target changed. Review a fresh replay before applying.")
    if replay.target_kind == "answer":
        chat, message = target
        key = {"user_id": owner, "change_id": replay.change_id, "chat_id": str(chat.id), "message_id": message.id}
        existing = await AnswerReview.find_one(key)
        values = {"answer_fingerprint": fingerprint, "references": replay.references, "created_at": datetime.utcnow()}
        if existing:
            await existing.set(values)
        else:
            await AnswerReview(**key, **values).insert()
    else:
        if not title or not 2 <= len(title.strip()) <= 200 or not safe_fact(title) or (notes is not None and (len(notes) > 2000 or not safe_fact(notes))):
            raise HTTPException(422, "Review a safe commitment title and notes before applying")
        result = await Commitment.get_motor_collection().update_one({"_id": target.id, "user_id": owner, "version": target.version},
            {"$set": {"title": title.strip(), "notes": notes if notes is not None else target.notes,
                      "evidence_refs": replay.references, "source_memory_id": replay.references[0]["id"] if replay.references else None,
                      "last_context_replay": str(replay.id), "updated_at": datetime.utcnow(),
                      "lease_token": "", "lease_until": datetime(1970, 1, 1)}, "$inc": {"version": 1}})
        if not result.matched_count:
            raise HTTPException(409, "The commitment changed. Run a fresh replay.")
        await invalidate_context(owner)
    await replay.set({"status": "applied"})
    return {"status": "applied", "id": str(replay.id), "target_kind": replay.target_kind, "target_id": replay.target_id}


async def chat_context_details(user, chat):
    await scope_allowed(str(user.id), chat.project_id)
    data = chat.model_dump(); data["id"] = str(chat.id)
    reviews = await AnswerReview.find({"user_id": str(user.id), "chat_id": str(chat.id)}).sort("-created_at").limit(100).to_list()
    by_id = {m.id: m for m in chat.messages}
    for item in data["messages"]:
        if item.get("clarification"):
            refs = item["clarification"].get("alternatives", [])
            item["clarification"] = {"question": item["content"], "alternatives": await resolve_refs(user, chat.project_id, refs),
                                     "selected": item["clarification"].get("selected", []),
                                     "query": by_id[item["clarification"]["query_message_id"]].content
                                     if item["clarification"].get("query_message_id") in by_id else ""}
        item["context_reviews"] = []
        for review in [r for r in reviews if r.message_id == item["id"] and r.answer_fingerprint == digest(item["content"])][:3]:
            resolved = await resolve_refs(user, chat.project_id, review.references)
            item["context_reviews"].append({"change_id": review.change_id, "at": review.created_at, "evidence": resolved,
                "state": "current" if len(resolved) == len(review.references) and resolved else "evidence_unavailable"})
    return data
