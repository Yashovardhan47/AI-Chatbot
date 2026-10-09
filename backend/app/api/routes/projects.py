from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.chat import Chat

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectIn(BaseModel):
    name: str
    description: str = ""
    icon: str = "🚀"
    color: str = "#534AB7"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


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
    project = Project(user_id=str(current_user.id), **body.model_dump())
    await project.insert()
    d = project.model_dump(); d["id"] = str(project.id)
    return {"project": d}


@router.get("/{project_id}")
async def get_project(project_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(project_id)
    if not project or project.user_id != str(current_user.id):
        raise HTTPException(status_code=404, detail="Project not found")
    d = project.model_dump(); d["id"] = str(project.id)
    return {"project": d}


@router.put("/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate, current_user: User = Depends(get_current_user)):
    project = await Project.get(project_id)
    if not project or project.user_id != str(current_user.id):
        raise HTTPException(status_code=404, detail="Project not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(project, k, v)
    project.updated_at = datetime.utcnow()
    await project.save()
    d = project.model_dump(); d["id"] = str(project.id)
    return {"project": d}


@router.delete("/{project_id}")
async def delete_project(project_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(project_id)
    if not project or project.user_id != str(current_user.id):
        raise HTTPException(status_code=404, detail="Project not found")
    project.is_active = False
    await project.save()
    return {"message": "Project deleted"}
