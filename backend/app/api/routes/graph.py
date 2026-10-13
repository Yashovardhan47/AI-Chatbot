from typing import Literal
from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.models.memory import Memory
from app.models.workspace import MemoryEdge
from app.api.routes.memory import owned_memory, owned_project
from app.services.memory_logic import rank_memories
from app.services.memory_service import serialize
from app.services.memory_guard import memory_write_guard
from app.services.workspace_write import require_actor

router = APIRouter(prefix="/api/memory-graph", tags=["memory relationships"])


class EdgeInput(BaseModel):
    source_id: str
    target_id: str
    relation: Literal["related_to", "supports", "depends_on", "contradicts"] = "related_to"


@router.get("/")
async def get_graph(project_id: str | None = None, limit: int = Query(60, ge=1, le=200), user: User = Depends(get_current_user)):
    await owned_project(project_id, str(user.id))
    records = [serialize(m) for m in await Memory.find({"user_id": str(user.id), "active": True, "project_id": {"$in": [None, project_id]}}).to_list()]
    allowed = rank_memories(records, "what do you remember about me?", project_id)
    nodes = allowed[:limit]; ids = [node["id"] for node in nodes]
    edges = await MemoryEdge.find({"user_id": str(user.id), "source_id": {"$in": ids}, "target_id": {"$in": ids}}).to_list()
    return {"nodes": [{key: n[key] for key in ("id", "fact", "category", "version", "tags")} for n in nodes],
        "edges": [{"id": str(e.id), "source_id": e.source_id, "target_id": e.target_id, "relation": e.relation} for e in edges],
        "total_nodes": len(allowed), "truncated": len(allowed) > limit}


@router.post("/", status_code=201)
async def create_edge(body: EdgeInput, user: User = Depends(get_current_user)):
    if body.source_id == body.target_id:
        raise HTTPException(422, "Choose two different facts")
    async with memory_write_guard(str(user.id)):
        await require_actor(str(user.id), user.auth_version)
        source = await owned_memory(body.source_id, str(user.id)); target = await owned_memory(body.target_id, str(user.id))
        if source.project_id and target.project_id and source.project_id != target.project_id:
            raise HTTPException(422, "Facts from different projects cannot be linked")
        key = {"user_id": str(user.id), **body.model_dump()}
        edge = await MemoryEdge.find_one(key)
        if not edge:
            edge = MemoryEdge(**key); await edge.insert()
        return {"edge": {"id": str(edge.id), **body.model_dump()}}


@router.delete("/{edge_id}")
async def delete_edge(edge_id: str, user: User = Depends(get_current_user)):
    try:
        edge = await MemoryEdge.get(PydanticObjectId(edge_id))
    except (ValueError, InvalidId):
        edge = None
    if not edge or edge.user_id != str(user.id):
        raise HTTPException(404, "Relationship not found")
    await edge.delete()
    return {"message": "Relationship removed"}
