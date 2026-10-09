import secrets
import hashlib
from datetime import datetime, timedelta, timezone

from app.models.user import User, Provider, Preferences, Stats
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.core.config import settings
from app.db.database import get_redis
from app.services.email_service import send_verification_email, send_reset_email


async def register_user(name: str, email: str, password: str) -> dict:
    existing = await User.find_one(User.email == email)
    if existing:
        raise ValueError("Email already registered. Please log in instead.")

    token = secrets.token_urlsafe(32)
    user  = User(
        name=name, email=email,
        password=hash_password(password),
        verify_token=token,
        # Auto-verify if email not configured — required for dev mode to work
        is_verified=(not settings.MAIL_USERNAME),
        preferences=Preferences(),
        stats=Stats(),
    )
    await user.insert()

    try:
        await send_verification_email(user.email, user.name, token)
    except Exception:
        pass

    if not settings.MAIL_USERNAME:
        return {"message": "Account created and verified! You can log in right now."}
    return {"message": "Registered! Check your email or the backend terminal for the verification link."}


async def verify_email(token: str) -> dict:
    user = await User.find_one(User.verify_token == token)
    if not user:
        raise ValueError("Invalid or expired verification token")
    user.is_verified  = True
    user.verify_token = None
    await user.save()
    return {"message": "Email verified! You can now log in."}


async def login_user(email: str, password: str) -> dict:
    user = await User.find_one(User.email == email, User.provider == Provider.local)
    if not user or not user.password:
        raise ValueError("No account found with this email")
    if not verify_password(password, user.password):
        raise ValueError("Wrong password")
    if not user.is_verified:
        raise ValueError("Email not verified. Check the backend terminal for the link.")
    if not user.is_active:
        raise ValueError("Account deactivated")

    user.last_login = datetime.now(timezone.utc)
    user.stats.total_sessions += 1
    await user.save()
    return {
        "access_token":  create_access_token(str(user.id)),
        "refresh_token": create_refresh_token(str(user.id)),
        "user":          user.safe_dict(),
    }


async def google_login(credential: str) -> dict:
    if not settings.GOOGLE_CLIENT_ID:
        raise ValueError("Google OAuth not configured")
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as greq
        info = id_token.verify_oauth2_token(credential, greq.Request(), settings.GOOGLE_CLIENT_ID)
    except Exception:
        raise ValueError("Invalid Google credential")

    email = info["email"]
    user  = await User.find_one(User.email == email)
    if not user:
        user = User(
            name=info.get("name", email.split("@")[0]), email=email,
            avatar=info.get("picture", ""), provider=Provider.google,
            provider_id=info["sub"], is_verified=True,
            preferences=Preferences(), stats=Stats(),
        )
        await user.insert()

    user.last_login = datetime.now(timezone.utc)
    user.stats.total_sessions += 1
    await user.save()
    return {
        "access_token":  create_access_token(str(user.id)),
        "refresh_token": create_refresh_token(str(user.id)),
        "user":          user.safe_dict(),
    }


async def refresh_tokens(refresh_token: str) -> dict:
    from app.core.security import decode_token
    redis = get_redis()
    if redis:
        try:
            if await redis.get(f"bl:{refresh_token}"):
                raise ValueError("Token revoked")
        except Exception:
            pass
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise ValueError("Invalid refresh token")
    user = await User.get(payload["sub"])
    if not user:
        raise ValueError("User not found")
    return {"access_token": create_access_token(str(user.id))}


async def logout_user(refresh_token: str, access_token: str):
    redis = get_redis()
    if redis and refresh_token:
        try:
            await redis.setex(f"bl:{refresh_token}", settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, "1")
            if access_token:
                await redis.setex(f"bl:{access_token}", settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, "1")
        except Exception:
            pass


async def forgot_password(email: str):
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
    user.password      = hash_password(new_password)
    user.reset_token   = None
    user.reset_expires = None
    await user.save()
