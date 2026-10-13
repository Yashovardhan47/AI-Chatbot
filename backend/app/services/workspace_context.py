import json
from app.core.config import settings
from app.services.memory_service import recall
from app.services.knowledge_service import retrieve_documents
from app.services.continuity_service import retrieve_continuity


async def gather_context(user, query, project_id=None):
    memory = await recall(str(user.id), query, project_id)
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
            "candidates": memory["candidates"], "algorithm": "neurosense-workspace-v3", "retrieval_mode": memory.get("retrieval_mode", "lexical")}
