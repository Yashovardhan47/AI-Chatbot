from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import List
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.schemas.schemas import UpdateProfileRequest, UpdatePreferencesRequest, ChangePasswordRequest
from app.core.security import verify_password, hash_password
from app.core.config import settings
import asyncio
import base64
from app.services.memory_guard import memory_write_guard, invalidate_captures
from app.services.workspace_write import require_actor

file_router   = APIRouter(prefix="/api/files", tags=["files"])
user_router   = APIRouter(prefix="/api/users", tags=["users"])


@file_router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...), current_user: User = Depends(get_current_user)):
    if not all((settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET)):
        raise HTTPException(503, "Attachment storage is unavailable. You can still send a text message.")
    if not files or len(files) > 5:
        raise HTTPException(status_code=400, detail="Max 5 files per upload")

    # Validate the whole batch before making any external writes.
    prepared = []
    for file in files:
        content = await file.read(settings.MAX_UPLOAD_BYTES + 1)
        if len(content) > settings.MAX_UPLOAD_BYTES:
            raise HTTPException(413, "An attachment exceeds the upload size limit")
        if not content:
            raise HTTPException(422, "Empty attachments are not supported")
        media = (file.content_type or "application/octet-stream").lower()
        if media.startswith("image/") and media not in {"image/png", "image/jpeg", "image/gif", "image/webp"}:
            raise HTTPException(415, "Use a PNG, JPEG, GIF or WebP image")
        name = (file.filename or "attachment").replace("\\", "/").split("/")[-1][:160]
        prepared.append((name, media, content))
    async with memory_write_guard(str(current_user.id)):
        await require_actor(str(current_user.id), current_user.auth_version)

    import cloudinary, cloudinary.uploader
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
    )
    results, uploaded = [], []
    try:
        for name, media, content in prepared:
            is_image = media.startswith("image/")
            file_type = "image" if is_image else "pdf" if media == "application/pdf" else "file"
            resource_type = "image" if is_image else "raw"
            result = await asyncio.to_thread(cloudinary.uploader.upload,
                f"data:{media};base64,{base64.b64encode(content).decode()}",
                resource_type=resource_type, folder=f"neurofusion/{current_user.id}", timeout=20)
            uploaded.append((result["public_id"], resource_type))
            text_content = None
            if file_type == "file" and len(content) < 500_000:
                try:
                    text_content = content.decode("utf-8")[:12000]
                except UnicodeDecodeError:
                    pass
            results.append({"name": name, "url": result["secure_url"], "public_id": result["public_id"],
                "file_type": file_type, "size": len(content), "text_content": text_content})
        async with memory_write_guard(str(current_user.id)):
            await require_actor(str(current_user.id), current_user.auth_version)
            await User.get_motor_collection().update_one({"_id": current_user.id}, {"$inc": {"stats.files_uploaded": len(results)}})
    except Exception as error:
        # Roll back completed external writes on a failed batch or stale session.
        for public_id, resource_type in uploaded:
            try:
                await asyncio.to_thread(cloudinary.uploader.destroy, public_id, resource_type=resource_type, timeout=10)
            except Exception:
                pass
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(503, "Attachment upload failed. Please try again.")
    return {"files": results}


@user_router.put("/profile")
async def update_profile(body: UpdateProfileRequest, current_user: User = Depends(get_current_user)):
    async with memory_write_guard(str(current_user.id)):
        fresh = await require_actor(str(current_user.id), current_user.auth_version)
        await fresh.set(body.model_dump(exclude_none=True))
        return {"user": fresh.safe_dict()}


@user_router.put("/preferences")
async def update_preferences(body: UpdatePreferencesRequest, current_user: User = Depends(get_current_user)):
    if body.timezone:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            ZoneInfo(body.timezone)
        except ZoneInfoNotFoundError:
            raise HTTPException(422, "Choose a valid IANA timezone")
    from app.services.memory_guard import memory_write_guard, invalidate_captures
    from app.services.workspace_write import require_actor
    async with memory_write_guard(str(current_user.id)):
        fresh = await require_actor(str(current_user.id), current_user.auth_version)
        prefs = fresh.preferences
        before = prefs.model_dump()
        for field, value in body.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(prefs, field, value)
        await fresh.set({"preferences": prefs.model_dump()})
        if any(before[key] != getattr(prefs, key) for key in
               ("memory_enabled", "memory_auto_capture", "memory_review_required", "session_memory_enabled", "knowledge_enabled")):
            await invalidate_captures(str(fresh.id))
        # Keep the request's auth object coherent for dependency overrides too.
        current_user.preferences = prefs
        return {"preferences": prefs.model_dump()}



@user_router.put("/password")
async def change_password(body: ChangePasswordRequest, current_user: User = Depends(get_current_user)):
    if not current_user.password or not await asyncio.to_thread(verify_password, body.current_password, current_user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    from app.models.workspace import AuthSession
    password_hash = await asyncio.to_thread(hash_password, body.new_password)
    async with memory_write_guard(str(current_user.id)):
        await require_actor(str(current_user.id), current_user.auth_version)
        result = await User.get_motor_collection().update_one(
            {"_id": current_user.id, "password": current_user.password, "auth_version": current_user.auth_version},
            {"$set": {"password": password_hash, "reset_token": None, "reset_expires": None}, "$inc": {"auth_version": 1}})
        if not result.matched_count:
            raise HTTPException(409, "Account changed. Sign in again before changing the password.")
        await AuthSession.find({"user_id": str(current_user.id)}).update({"$set": {"revoked": True}})
    return {"message": "Password updated"}


@user_router.get("/stats")
async def get_stats(current_user: User = Depends(get_current_user)):
    return {"stats": current_user.stats.model_dump(), "member_since": current_user.created_at, "last_login": current_user.last_login}


@user_router.delete("/")
async def deactivate_account(current_user: User = Depends(get_current_user)):
    from app.models.workspace import AuthSession
    async with memory_write_guard(str(current_user.id)):
        fresh = await require_actor(str(current_user.id), current_user.auth_version)
        await fresh.set({"is_active": False, "auth_version": fresh.auth_version + 1,
            "reset_token": None, "reset_expires": None, "verify_token": None, "verify_expires": None})
        await AuthSession.find({"user_id": str(current_user.id)}).update({"$set": {"revoked": True}})
        await invalidate_captures(str(current_user.id))
    return {"message": "Account deactivated"}
