from fastapi import APIRouter, HTTPException, Response, Cookie, Depends, Request
from typing import Optional
from app.schemas.schemas import RegisterRequest, LoginRequest, GoogleAuthRequest, GoogleLinkRequest, ForgotPasswordRequest, ResetPasswordRequest
from app.services import auth_service
from app.middleware.auth_dep import get_current_user
from app.models.user import User
from app.core.config import settings
from app.core.security import decode_token
from app.middleware.auth_dep import oauth2_scheme
from app.models.workspace import AuthSession
from datetime import datetime, timezone

router = APIRouter(prefix="/api/auth", tags=["auth"])


def set_refresh_cookie(response, token):
    response.set_cookie("refresh_token", token, httponly=True, secure=not settings.DEBUG,
        samesite=settings.REFRESH_COOKIE_SAMESITE, path="/api/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)


def check_browser_origin(request: Request):
    # CORS alone does not stop a cross-origin form from mutating cookies.
    # Browser requests supply Origin; non-browser API clients may omit it.
    origin = request.headers.get("origin")
    allowed = {settings.FRONTEND_URL.rstrip("/")}
    if settings.DEBUG:
        allowed |= {"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"}
    if origin and origin not in allowed:
        raise HTTPException(403, "This frontend origin is not allowed")


@router.get("/config")
async def auth_configuration():
    return {"google_client_id": settings.GOOGLE_CLIENT_ID or None,
            "google_enabled": bool(settings.GOOGLE_CLIENT_ID), "password_login": True,
            "email_verification": not (settings.DEBUG and not settings.MAIL_USERNAME)}


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


@router.post("/resend-verification")
async def resend_verification(body: ForgotPasswordRequest):
    await auth_service.resend_verification(body.email)
    return {"message": "If this account needs verification, a new link was sent. Check your inbox."}


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    try:
        result = await auth_service.login_user(body.email, body.password)
        set_refresh_cookie(response, result["refresh_token"])
        return {"access_token": result["access_token"], "token_type": "bearer", "user": result["user"]}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/google")
async def google_auth(body: GoogleAuthRequest, response: Response):
    try:
        result = await auth_service.google_login(body.credential)
        set_refresh_cookie(response, result["refresh_token"])
        return {"access_token": result["access_token"], "token_type": "bearer", "user": result["user"]}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/google/link")
async def link_google(body: GoogleLinkRequest, current_user: User = Depends(get_current_user)):
    try:
        return await auth_service.link_google(current_user, body.credential, body.current_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/refresh")
async def refresh(response: Response, refresh_token: Optional[str] = Cookie(None), _=Depends(check_browser_origin)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        result = await auth_service.refresh_tokens(refresh_token)
        set_refresh_cookie(response, result["refresh_token"])
        return {"access_token": result["access_token"], "token_type": "bearer"}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/logout")
async def logout(response: Response, request: Request, refresh_token: Optional[str] = Cookie(None), _=Depends(check_browser_origin)):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    await auth_service.logout_user(refresh_token or "", token)
    response.delete_cookie("refresh_token", path="/api/auth")
    return {"message": "Logged out"}


@router.get("/session")
async def verify_session(current_user: User = Depends(get_current_user), token: str = Depends(oauth2_scheme),
                         refresh_token: Optional[str] = Cookie(None)):
    # get_current_user has already checked signature, claims, expiry,
    # revocation, active account and auth_version against the database.
    payload = decode_token(token)
    refresh_payload = decode_token(refresh_token) if refresh_token else None
    cookie_active = False
    if (refresh_payload and refresh_payload["type"] == "refresh" and
        refresh_payload["sub"] == str(current_user.id) and refresh_payload["sv"] == current_user.auth_version):
        cookie_active = bool(await AuthSession.find_one({"user_id": str(current_user.id),
            "token_hash": auth_service.token_hash(refresh_token), "revoked": False,
            "expires_at": {"$gt": datetime.utcnow()}}))
    return {"verified": True, "checked_at": datetime.now(timezone.utc),
        "user_id": str(current_user.id), "email_verified": current_user.is_verified,
        "sign_in_method": payload["amr"], "issuer": payload["iss"], "audience": payload["aud"],
        "issued_at": datetime.fromtimestamp(payload["iat"], timezone.utc),
        "expires_at": datetime.fromtimestamp(payload["exp"], timezone.utc),
        "refresh_cookie_active": cookie_active, "auth_methods": current_user.safe_dict()["auth_methods"]}


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
