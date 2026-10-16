import json
from app.core.config import settings
from app.services.memory_service import recall
from app.services.knowledge_service import retrieve_documents
from app.services.continuity_service import retrieve_continuity
from app.services.context_service import decision_gate
from app.services.memory_guard import context_revision


async def gather_context(user, query, project_id=None, choices=None):
    revision = await context_revision(str(user.id))
    gate = await decision_gate(user, query, project_id, choices)
    if gate["needs_clarification"]:
        return {"context": "[]", "used": [], "candidates": 0, "context_chars": 2,
                "clarification": gate, "context_revision": revision, "algorithm": "neurosense-decision-gate-v1"}
    memory = await recall(str(user.id), query, project_id, exclude_ids=set(gate.get("exclude_ids", [])), prefer_refs=gate.get("selected"))
    if {item["id"] for item in gate.get("selected", [])} - {item["id"] for item in memory["used"]}:
        from fastapi import HTTPException
        raise HTTPException(422, "The selected context exceeds the memory budget. Resolve a conflicting fact in Memory Studio first.")
    packet = []; references = []; size = 2
    def admit(item, reference):
        nonlocal size
        encoded = json.dumps(item, ensure_ascii=False, default=str)
        cost = len(encoded) + bool(packet)
        if size + cost <= settings.WORKSPACE_CONTEXT_CHARS:
            packet.append(encoded); references.append(reference); size += cost
    by_id = {r["id"]: r for r in memory["used"]}
    for item in json.loads(memory["context"]):
        admit({"kind": "memory", **item}, {**by_id[item["id"]], "kind": "memory"})
    for hit in await retrieve_continuity(str(user.id), query, project_id):
        admit({"kind": hit["kind"], "id": hit["id"], "fact": hit["fact"], "version": hit["version"], "due_at": hit.get("due_at")},
            {k:v for k,v in hit.items() if k in {"id", "kind", "version", "reason", "score", "chat_id"}})
    if user.preferences.knowledge_enabled:
        documents = await retrieve_documents(str(user.id), query, project_id)
        for hit in documents["used"]:
            admit({"kind": "document", "id": hit["id"], "document_id": hit["document_id"], "title": hit["title"], "quote": hit["fact"], "page": hit["page"]},
                {k:v for k,v in hit.items() if k not in {"fact", "title"}})
    return {"context": "["+",".join(packet)+"]", "used": references, "context_chars": size, "context_budget": settings.WORKSPACE_CONTEXT_CHARS,
            "context_revision": revision, "decision": gate,
            "candidates": memory["candidates"], "algorithm": "neurosense-workspace-v3", "retrieval_mode": memory.get("retrieval_mode", "lexical")}
