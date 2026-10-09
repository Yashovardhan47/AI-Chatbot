from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import List
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.models.memory import Memory
from app.schemas.schemas import UpdateProfileRequest, UpdatePreferencesRequest, ChangePasswordRequest
from app.core.security import verify_password, hash_password
from app.core.config import settings

memory_router = APIRouter(prefix="/api/memory", tags=["memory"])
file_router   = APIRouter(prefix="/api/files", tags=["files"])
user_router   = APIRouter(prefix="/api/users", tags=["users"])


@memory_router.get("/")
async def get_memories(current_user: User = Depends(get_current_user)):
    memories = await Memory.find(Memory.user_id == str(current_user.id), Memory.active == True).sort(-Memory.created_at).to_list()
    return {"memories": [{"id": str(m.id), "fact": m.fact, "category": m.category, "confirmed": m.confirmed, "created_at": m.created_at} for m in memories]}


@memory_router.delete("/{memory_id}")
async def delete_memory(memory_id: str, current_user: User = Depends(get_current_user)):
    mem = await Memory.get(memory_id)
    if not mem or mem.user_id != str(current_user.id):
        raise HTTPException(status_code=404, detail="Memory not found")
    mem.active = False
    await mem.save()
    return {"message": "Memory deleted"}


@memory_router.delete("/")
async def clear_memories(current_user: User = Depends(get_current_user)):
    await Memory.find(Memory.user_id == str(current_user.id)).update({"$set": {"active": False}})
    return {"message": "All memories cleared"}


@file_router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...), current_user: User = Depends(get_current_user)):
    if not settings.CLOUDINARY_CLOUD_NAME:
        raise HTTPException(500, "File upload not configured. Add CLOUDINARY keys to .env")
    if len(files) > 5:
        raise HTTPException(status_code=400, detail="Max 5 files per upload")

    import cloudinary, cloudinary.uploader, base64
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
    )
    results = []
    for file in files:
        content = await file.read()
        is_image = file.content_type.startswith("image/")
        is_pdf   = file.content_type == "application/pdf"
        file_type = "image" if is_image else "pdf" if is_pdf else "file"
        b64 = base64.b64encode(content).decode()
        result = cloudinary.uploader.upload(
            f"data:{file.content_type};base64,{b64}",
            resource_type="image" if is_image else "raw",
            folder=f"neurofusion/{current_user.id}",
        )
        text_content = None
        if file_type == "file" and len(content) < 500_000:
            try: text_content = content.decode("utf-8")[:12000]
            except Exception: pass
        results.append({
            "name": file.filename, "url": result["secure_url"], "public_id": result["public_id"],
            "file_type": file_type, "size": len(content), "text_content": text_content,
        })
    current_user.stats.files_uploaded += len(files)
    await current_user.save()
    return {"files": results}


@user_router.put("/profile")
async def update_profile(body: UpdateProfileRequest, current_user: User = Depends(get_current_user)):
    if body.name:   current_user.name   = body.name
    if body.avatar: current_user.avatar = body.avatar
    await current_user.save()
    return {"user": current_user.safe_dict()}


@user_router.put("/preferences")
async def update_preferences(body: UpdatePreferencesRequest, current_user: User = Depends(get_current_user)):
    prefs = current_user.preferences
    if body.mode        is not None: prefs.mode        = body.mode
    if body.web_search  is not None: prefs.web_search  = body.web_search
    if body.tts_enabled is not None: prefs.tts_enabled = body.tts_enabled
    if body.theme       is not None: prefs.theme       = body.theme
    if body.language    is not None: prefs.language    = body.language
    current_user.preferences = prefs
    await current_user.save()
    return {"preferences": prefs.model_dump()}


@user_router.put("/password")
async def change_password(body: ChangePasswordRequest, current_user: User = Depends(get_current_user)):
    if not current_user.password or not verify_password(body.current_password, current_user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password = hash_password(body.new_password)
    await current_user.save()
    return {"message": "Password updated"}


@user_router.get("/stats")
async def get_stats(current_user: User = Depends(get_current_user)):
    return {"stats": current_user.stats.model_dump(), "member_since": current_user.created_at, "last_login": current_user.last_login}


@user_router.delete("/")
async def deactivate_account(current_user: User = Depends(get_current_user)):
    current_user.is_active = False
    await current_user.save()
    return {"message": "Account deactivated"}
