from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, StringConstraints
from typing import Optional, Annotated
from beanie import PydanticObjectId
from bson.errors import InvalidId
from datetime import datetime
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.chat import Chat
from app.services.memory_guard import memory_write_guard, invalidate_captures
from app.services.workspace_write import require_actor

router = APIRouter(prefix="/api/projects", tags=["projects"])
ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class ProjectIn(BaseModel):
    name: ProjectName
    description: str = Field(default="", max_length=2000)
    icon: str = Field(default="🚀", max_length=32)
    color: str = Field(default="#534AB7", pattern=r"^#[0-9a-fA-F]{6}$")


class ProjectUpdate(BaseModel):
    name: Optional[ProjectName] = None
    description: Optional[str] = Field(default=None, max_length=2000)
    icon: Optional[str] = Field(default=None, max_length=32)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


async def owned_active_project(project_id, user_id):
    try:
        project = await Project.get(PydanticObjectId(project_id))
    except (ValueError, InvalidId):
        project = None
    if not project or project.user_id != user_id or not project.is_active:
        raise HTTPException(404, "Project not found")
    return project


@router.get("/")
async def get_projects(current_user: User = Depends(get_current_user)):
    projects = await Project.find(Project.user_id == str(current_user.id), Project.is_active == True).sort(-Project.updated_at).to_list()
    result = []
    for p in projects:
        count = await Chat.find(Chat.user_id == str(current_user.id), Chat.project_id == str(p.id), Chat.is_active == True).count()
        d = p.model_dump(); d["id"] = str(p.id); d["chat_count"] = count
        result.append(d)
    return {"projects": result}


@router.post("/", status_code=201)
async def create_project(body: ProjectIn, current_user: User = Depends(get_current_user)):
    async with memory_write_guard(str(current_user.id)):
        await require_actor(str(current_user.id), current_user.auth_version)
        project = Project(user_id=str(current_user.id), **body.model_dump())
        await project.insert()
    d = project.model_dump(); d["id"] = str(project.id)
    return {"project": d}


@router.get("/{project_id}")
async def get_project(project_id: str, current_user: User = Depends(get_current_user)):
    project = await owned_active_project(project_id, str(current_user.id))
    d = project.model_dump(); d["id"] = str(project.id)
    return {"project": d}


@router.put("/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate, current_user: User = Depends(get_current_user)):
    async with memory_write_guard(str(current_user.id)):
        await require_actor(str(current_user.id), current_user.auth_version)
        project = await owned_active_project(project_id, str(current_user.id))
        await project.set({**body.model_dump(exclude_none=True), "updated_at": datetime.utcnow()})
    d = project.model_dump(); d["id"] = str(project.id)
    return {"project": d}


@router.delete("/{project_id}")
async def delete_project(project_id: str, current_user: User = Depends(get_current_user)):
    async with memory_write_guard(str(current_user.id)):
        await require_actor(str(current_user.id), current_user.auth_version)
        project = await owned_active_project(project_id, str(current_user.id))
        await project.set({"is_active": False})
        await invalidate_captures(str(current_user.id))
    return {"message": "Project deleted"}
