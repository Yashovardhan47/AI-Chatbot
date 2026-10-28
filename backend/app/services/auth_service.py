import secrets
import hashlib
import asyncio
from beanie import PydanticObjectId
from bson.errors import InvalidId
from pymongo.errors import DuplicateKeyError
from datetime import datetime, timedelta, timezone

from app.models.user import User, Provider, Preferences, Stats
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.core.config import settings
from app.db.database import get_redis
from app.services.email_service import send_verification_email, send_reset_email
from app.models.workspace import AuthSession, TokenRevocation
from app.services.memory_guard import memory_write_guard
from app.services.workspace_write import require_actor


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


async def is_revoked(token):
    return bool(await TokenRevocation.find_one({"token_hash": token_hash(token)}))


async def issue_tokens(user, method=None):
    async with memory_write_guard(str(user.id)):
        user = await require_actor(str(user.id), user.auth_version)
        method = method or ("google" if user.provider == Provider.google else "password")
        refresh = create_refresh_token(str(user.id), user.auth_version, method)
        await AuthSession(user_id=str(user.id), token_hash=token_hash(refresh), expires_at=datetime.utcnow()+timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)).insert()
        return {"access_token": create_access_token(str(user.id), user.auth_version, method), "refresh_token": refresh, "user": user.safe_dict()}


async def register_user(name: str, email: str, password: str) -> dict:
    email = email.strip().lower()
    existing = await User.find_one(User.email == email)
    if existing:
        raise ValueError("Email already registered. Please log in instead.")

    token = secrets.token_urlsafe(32)
    user  = User(
        name=name, email=email,
        password=await asyncio.to_thread(hash_password, password),
        verify_token=token_hash(token),
        verify_expires=datetime.now(timezone.utc) + timedelta(hours=24),
        # Auto-verify if email not configured — required for dev mode to work
        is_verified=(settings.DEBUG and not settings.MAIL_USERNAME),
        preferences=Preferences(),
        stats=Stats(),
    )
    try:
        await user.insert()
    except DuplicateKeyError:
        raise ValueError("Email already registered. Please log in instead.")

    try:
        await send_verification_email(user.email, user.name, token)
    except Exception:
        pass

    if settings.DEBUG and not settings.MAIL_USERNAME:
        return {"message": "Account created and verified! You can log in right now."}
    return {"message": "Registered! Check your email for the verification link."}


async def verify_email(token: str) -> dict:
    result = await User.get_motor_collection().update_one(
        {"verify_token": token_hash(token), "verify_expires": {"$gt": datetime.now(timezone.utc)}, "is_active": True},
        {"$set": {"is_verified": True, "verify_token": None, "verify_expires": None}})
    if not result.matched_count:
        raise ValueError("Invalid or expired verification token")
    return {"message": "Email verified! You can now log in."}


async def resend_verification(email: str):
    user = await User.find_one({"email": email.strip().lower(), "provider": Provider.local,
                                "is_verified": False, "is_active": True})
    if not user:
        return
    token = secrets.token_urlsafe(32)
    result = await User.get_motor_collection().update_one(
        {"_id": user.id, "is_active": True, "is_verified": False, "auth_version": user.auth_version},
        {"$set": {"verify_token": token_hash(token), "verify_expires": datetime.now(timezone.utc) + timedelta(hours=24)}})
    if result.matched_count:
        await send_verification_email(user.email, user.name, token)


async def login_user(email: str, password: str) -> dict:
    email = email.strip().lower()
    user = await User.find_one(User.email == email, User.provider == Provider.local)
    if not user or not user.password or not await asyncio.to_thread(verify_password, password, user.password):
        raise ValueError("Email or password is incorrect")
    if not user.is_verified:
        raise ValueError("Email not verified. Check your email for the verification link.")
    if not user.is_active:
        raise ValueError("Account deactivated")

    await User.get_motor_collection().update_one({"_id": user.id}, {"$set": {"last_login": datetime.utcnow()}, "$inc": {"stats.total_sessions": 1}})
    return await issue_tokens(user)


async def verify_google_identity(credential: str) -> dict:
    if not settings.GOOGLE_CLIENT_ID:
        raise ValueError("Google OAuth not configured")
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as greq
        info = await asyncio.to_thread(id_token.verify_oauth2_token, credential, greq.Request(), settings.GOOGLE_CLIENT_ID)
    except Exception:
        raise ValueError("Invalid Google credential")

    if info.get("email_verified") is not True or info.get("iss") not in {"accounts.google.com", "https://accounts.google.com"} or not info.get("sub") or not info.get("email"):
        raise ValueError("Google account email must be verified")
    return info


async def google_login(credential: str) -> dict:
    info = await verify_google_identity(credential)
    email = info["email"].strip().lower()
    # Google subjects are stable; an email address is not an account link.
    user = await User.find_one(User.provider_id == info["sub"])
    if not user:
        existing = await User.find_one(User.email == email)
        if existing:
            raise ValueError("Sign in with your existing method, then link Google in Account security.")
        user = User(
            name=info.get("name", email.split("@")[0]), email=email,
            avatar=info.get("picture", ""), provider=Provider.google,
            provider_id=info["sub"], is_verified=True,
            preferences=Preferences(), stats=Stats(),
        )
        try:
            await user.insert()
        except DuplicateKeyError:
            raise ValueError("This account already exists. Sign in with your existing method.")

    if not user.is_active:
        raise ValueError("Account deactivated")
    await User.get_motor_collection().update_one({"_id": user.id}, {"$set": {"last_login": datetime.utcnow()}, "$inc": {"stats.total_sessions": 1}})
    return await issue_tokens(user, "google")


async def link_google(user, credential: str, current_password: str) -> dict:
    if not user.password or not await asyncio.to_thread(verify_password, current_password, user.password):
        raise ValueError("Confirm your current account password to link Google")
    info = await verify_google_identity(credential)
    if info["email"].strip().lower() != user.email.lower():
        raise ValueError("Choose the Google account with the same email as this workspace")
    existing = await User.find_one(User.provider_id == info["sub"])
    if existing and existing.id != user.id:
        raise ValueError("This Google account is linked to another workspace")
    if user.provider_id and user.provider_id != info["sub"]:
        raise ValueError("This workspace already has a different Google identity")
    # The email index serializes this same-email linking policy. Use a compare
    # and set so concurrent link requests cannot replace an existing subject.
    result = await User.get_motor_collection().update_one(
        {"_id": user.id, "auth_version": user.auth_version, "is_active": True,
         "provider_id": {"$in": [None, info["sub"]]}},
        {"$set": {"provider_id": info["sub"]}})
    if not result.matched_count:
        raise ValueError("Account changed. Sign in again before linking Google")
    return {"user": (await User.get(user.id)).safe_dict()}


async def refresh_tokens(refresh_token: str) -> dict:
    from app.core.security import decode_token
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise ValueError("Invalid refresh token")
    try:
        user = await User.get(PydanticObjectId(payload.get("sub", "")))
    except (ValueError, InvalidId):
        user = None
    if not user or not user.is_active or payload.get("sv", 0) != user.auth_version:
        raise ValueError("Session invalidated; sign in again")
    result = await AuthSession.get_motor_collection().update_one({"token_hash": token_hash(refresh_token),
        "user_id": str(user.id), "revoked": False, "expires_at": {"$gt": datetime.utcnow()}}, {"$set": {"revoked": True}})
    if not result.matched_count:
        raise ValueError("Refresh session expired or already used")
    return await issue_tokens(user, payload["amr"])


async def logout_user(refresh_token: str, access_token: str):
    if refresh_token:
        await AuthSession.find({"token_hash": token_hash(refresh_token)}).update({"$set": {"revoked": True}})
    if access_token:
        from app.core.security import decode_token
        payload = decode_token(access_token)
        if payload:
            try:
                await TokenRevocation(token_hash=token_hash(access_token), expires_at=datetime.fromtimestamp(payload["exp"], timezone.utc).replace(tzinfo=None)).insert()
            except DuplicateKeyError:
                pass
    redis = get_redis()
    if redis and refresh_token:
        try:
            await redis.setex(f"bl:{refresh_token}", settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, "1")
            if access_token:
                await redis.setex(f"bl:{access_token}", settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, "1")
        except Exception:
            pass


async def forgot_password(email: str):
    email = email.strip().lower()
    user = await User.find_one(User.email == email, User.provider == Provider.local)
    if not user:
        return
    token = secrets.token_urlsafe(32)
    result = await User.get_motor_collection().update_one(
        {"_id": user.id, "auth_version": user.auth_version, "is_active": True},
        {"$set": {"reset_token": token_hash(token), "reset_expires": datetime.now(timezone.utc) + timedelta(hours=1)}})
    if not result.matched_count:
        return
    try:
        await send_reset_email(user.email, user.name, token)
    except Exception:
        pass


async def reset_password(token: str, new_password: str):
    hashed = hashlib.sha256(token.encode()).hexdigest()
    user   = await User.find_one(User.reset_token == hashed, User.reset_expires > datetime.now(timezone.utc))
    if not user:
        raise ValueError("Invalid or expired reset link")
    password_hash = await asyncio.to_thread(hash_password, new_password)
    async with memory_write_guard(str(user.id)):
        result = await User.get_motor_collection().update_one(
            {"_id": user.id, "is_active": True, "auth_version": user.auth_version,
             "reset_token": hashed, "reset_expires": {"$gt": datetime.now(timezone.utc)}},
            {"$set": {"password": password_hash, "reset_token": None, "reset_expires": None}, "$inc": {"auth_version": 1}})
        if not result.matched_count:
            raise ValueError("Invalid or expired reset link")
        await AuthSession.find({"user_id": str(user.id)}).update({"$set": {"revoked": True}})
