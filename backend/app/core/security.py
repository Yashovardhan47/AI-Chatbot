from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from jwt import InvalidTokenError
from passlib.context import CryptContext
from app.core.config import settings
import hashlib
from uuid import uuid4

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _safe_password(password: str) -> str:
    """
    Pre-hash with SHA-256 before bcrypt so passwords of ANY length work.
    bcrypt has a hard 72-byte limit and raises an error beyond that;
    pre-hashing avoids ever hitting that limit, no matter how long the
    user's password is. This is the standard 'bcrypt+sha256' pattern.
    """
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    return pwd_context.hash(_safe_password(password))


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(_safe_password(plain), hashed)


def _create_token(subject: str, version: int, kind: str, method: str, lifetime: timedelta) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": subject, "iat": now, "exp": now + lifetime,
        "iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE,
        "type": kind, "sv": version, "amr": method, "jti": uuid4().hex},
        settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(subject: str, version: int = 0, method: str = "password") -> str:
    return _create_token(subject, version, "access", method, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(subject: str, version: int = 0, method: str = "password") -> str:
    return _create_token(subject, version, "refresh", method, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
            issuer=settings.JWT_ISSUER, audience=settings.JWT_AUDIENCE,
            options={"require": ["exp", "iat", "sub", "iss", "aud", "jti"]})
        if (payload.get("type") not in {"access", "refresh"} or
            type(payload.get("sv")) is not int or payload["sv"] < 0 or
            payload.get("amr") not in {"password", "google"} or
            not isinstance(payload.get("sub"), str) or not payload["sub"]):
            return None
        return payload
    except (InvalidTokenError, ValueError, TypeError):
        return None
