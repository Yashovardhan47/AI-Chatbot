from fastapi import APIRouter, HTTPException, Response, Cookie, Depends, Request
from typing import Optional
from app.schemas.schemas import RegisterRequest, LoginRequest, GoogleAuthRequest, ForgotPasswordRequest, ResetPasswordRequest
from app.services import auth_service
from app.middleware.auth_dep import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    try:
        return await auth_service.register_user(body.name, body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/verify/{token}")
async def verify_email(token: str):
    try:
        return await auth_service.verify_email(token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    try:
        result = await auth_service.login_user(body.email, body.password)
        response.set_cookie(
            "refresh_token", result["refresh_token"],
            httponly=True, samesite="lax", secure=False,
            max_age=7 * 24 * 3600,
        )
        return {"access_token": result["access_token"], "token_type": "bearer", "user": result["user"]}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/google")
async def google_auth(body: GoogleAuthRequest, response: Response):
    try:
        result = await auth_service.google_login(body.credential)
        response.set_cookie("refresh_token", result["refresh_token"], httponly=True, samesite="lax", secure=False, max_age=7*24*3600)
        return {"access_token": result["access_token"], "token_type": "bearer", "user": result["user"]}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/refresh")
async def refresh(refresh_token: Optional[str] = Cookie(None)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        result = await auth_service.refresh_tokens(refresh_token)
        return {"access_token": result["access_token"], "token_type": "bearer"}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/logout")
async def logout(response: Response, request: Request, current_user: User = Depends(get_current_user), refresh_token: Optional[str] = Cookie(None)):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    await auth_service.logout_user(refresh_token or "", token)
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    await auth_service.forgot_password(body.email)
    return {"message": "If that email exists, a reset link was sent."}


@router.put("/reset-password/{token}")
async def reset_password(token: str, body: ResetPasswordRequest):
    try:
        await auth_service.reset_password(token, body.password)
        return {"message": "Password reset successfully."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {"user": current_user.safe_dict()}
