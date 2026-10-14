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


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


async def is_revoked(token):
    return bool(await TokenRevocation.find_one({"token_hash": token_hash(token)}))


async def issue_tokens(user):
    refresh = create_refresh_token(str(user.id), user.auth_version)
    await AuthSession(user_id=str(user.id), token_hash=token_hash(refresh), expires_at=datetime.utcnow()+timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)).insert()
    return {"access_token": create_access_token(str(user.id), user.auth_version), "refresh_token": refresh, "user": user.safe_dict()}


async def register_user(name: str, email: str, password: str) -> dict:
    email = email.strip().lower()
    existing = await User.find_one(User.email == email)
    if existing:
        raise ValueError("Email already registered. Please log in instead.")

    token = secrets.token_urlsafe(32)
    user  = User(
        name=name, email=email,
        password=hash_password(password),
        verify_token=token,
        # Auto-verify if email not configured — required for dev mode to work
        is_verified=(settings.DEBUG and not settings.MAIL_USERNAME),
        preferences=Preferences(),
        stats=Stats(),
    )
    await user.insert()

    try:
        await send_verification_email(user.email, user.name, token)
    except Exception:
        pass

    if settings.DEBUG and not settings.MAIL_USERNAME:
        return {"message": "Account created and verified! You can log in right now."}
    return {"message": "Registered! Check your email for the verification link."}


async def verify_email(token: str) -> dict:
    user = await User.find_one(User.verify_token == token)
    if not user:
        raise ValueError("Invalid or expired verification token")
    user.is_verified  = True
    user.verify_token = None
    await user.save()
    return {"message": "Email verified! You can now log in."}


async def login_user(email: str, password: str) -> dict:
    email = email.strip().lower()
    user = await User.find_one(User.email == email, User.provider == Provider.local)
    if not user or not user.password:
        raise ValueError("No account found with this email")
    if not verify_password(password, user.password):
        raise ValueError("Wrong password")
    if not user.is_verified:
        raise ValueError("Email not verified. Check your email for the verification link.")
    if not user.is_active:
        raise ValueError("Account deactivated")

    await User.get_motor_collection().update_one({"_id": user.id}, {"$set": {"last_login": datetime.utcnow()}, "$inc": {"stats.total_sessions": 1}})
    return await issue_tokens(await User.get(user.id))


async def google_login(credential: str) -> dict:
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
    email = info["email"].strip().lower()
    user  = await User.find_one(User.email == email)
    if not user:
        user = User(
            name=info.get("name", email.split("@")[0]), email=email,
            avatar=info.get("picture", ""), provider=Provider.google,
            provider_id=info["sub"], is_verified=True,
            preferences=Preferences(), stats=Stats(),
        )
        await user.insert()

    if not user.is_active:
        raise ValueError("Account deactivated")
    if user.provider == Provider.google and user.provider_id != info["sub"]:
        raise ValueError("Google identity does not match the linked account")
    await User.get_motor_collection().update_one({"_id": user.id}, {"$set": {"last_login": datetime.utcnow()}, "$inc": {"stats.total_sessions": 1}})
    return await issue_tokens(await User.get(user.id))


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
    return await issue_tokens(user)


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
    user.reset_token   = hashlib.sha256(token.encode()).hexdigest()
    user.reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    await user.save()
    try:
        await send_reset_email(user.email, user.name, token)
    except Exception:
        pass


async def reset_password(token: str, new_password: str):
    hashed = hashlib.sha256(token.encode()).hexdigest()
    user   = await User.find_one(User.reset_token == hashed, User.reset_expires > datetime.now(timezone.utc))
    if not user:
        raise ValueError("Invalid or expired reset link")
    await User.get_motor_collection().update_one({"_id": user.id}, {"$set": {"password": hash_password(new_password), "reset_token": None, "reset_expires": None}, "$inc": {"auth_version": 1}})
    await AuthSession.find({"user_id": str(user.id)}).update({"$set": {"revoked": True}})
