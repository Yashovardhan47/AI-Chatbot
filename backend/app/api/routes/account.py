import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response
from pydantic import BaseModel
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.models.chat import Chat
from app.models.memory import Memory
from app.models.project import Project
from app.models.workspace import KnowledgeDocument, MemoryEdge, MemoryFeedback, SessionDigest, Commitment, Notification, AuthSession, MemoryProposal
from app.services.memory_guard import memory_write_guard, invalidate_captures
from app.services.continuity_service import public_record

router = APIRouter(prefix="/api/account", tags=["account data controls"])
DATA_MODELS = {"chats": Chat, "memories": Memory, "projects": Project, "documents": KnowledgeDocument,
    "relationships": MemoryEdge, "feedback": MemoryFeedback, "session_snapshots": SessionDigest, "commitments": Commitment, "notifications": Notification, "memory_proposals": MemoryProposal}


class EraseInput(BaseModel):
    confirmation: str


@router.get("/export")
async def export_account(user: User = Depends(get_current_user)):
    data = {"format": "neurosense-account-v1", "profile": user.safe_dict()}
    for label, model in DATA_MODELS.items():
        data[label] = [public_record(r) for r in await model.find({"user_id": str(user.id)}).to_list()]
    return Response(json.dumps(jsonable_encoder(data), ensure_ascii=False), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="neurosense-account.json"'})


@router.delete("/data")
async def erase_data(body: EraseInput, user: User = Depends(get_current_user)):
    if body.confirmation != "DELETE MY DATA":
        raise HTTPException(422, "Type DELETE MY DATA to erase stored workspace data")
    async with memory_write_guard(str(user.id)):
        await User.get_motor_collection().update_one({"_id": user.id}, {"$inc": {"auth_version": 1}, "$set": {"stats": {"total_messages": 0, "total_sessions": 0, "files_uploaded": 0, "tokens_used": 0}}})
        await AuthSession.find({"user_id": str(user.id)}).update({"$set": {"revoked": True}})
        for model in DATA_MODELS.values():
            await model.find({"user_id": str(user.id)}).delete()
        await invalidate_captures(str(user.id))
    return {"message": "Workspace erased and sessions invalidated. Sign in again to start fresh."}
