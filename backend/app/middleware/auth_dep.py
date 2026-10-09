from fastapi import Depends, HTTPException, status, WebSocket
from fastapi.security import OAuth2PasswordBearer
from app.core.security import decode_token
from app.models.user import User
from app.db.database import get_redis

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise credentials_exc

    redis = get_redis()
    if redis:
        try:
            if await redis.get(f"bl:{token}"):
                raise credentials_exc
        except Exception:
            pass

    user = await User.get(payload["sub"])
    if not user or not user.is_active:
        raise credentials_exc
    return user


async def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def ws_auth(websocket: WebSocket, token: str) -> User:
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=1008)
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await User.get(payload["sub"])
    if not user:
        await websocket.close(code=1008)
        raise HTTPException(status_code=401, detail="User not found")
    return user
