from fastapi import HTTPException
from app.models.user import User


async def require_actor(user_id, expected_version):
    """Check the account generation again inside the owner mutation lease."""
    user = await User.get(user_id)
    if not user or not user.is_active or (expected_version is not None and user.auth_version != expected_version):
        raise HTTPException(401, "Session changed; sign in again before writing workspace data")
    return user
