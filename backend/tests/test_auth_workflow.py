"""Real JWT and Google-library cryptographic checks using local signing keys.

No real Google account, remote identity service, paid AI or live SMTP is used.
"""
import json
import time
from datetime import datetime
from types import SimpleNamespace
import pytest
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from google.auth import jwt as google_jwt, crypt
from google.auth.transport import requests as google_requests
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password
from app.main import app
from app.models.user import User
from app.models.workspace import AuthSession
from app.services import auth_service

pytestmark = pytest.mark.asyncio


@pytest.fixture
def google_keys(monkeypatch):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    public_pem = private.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "neurosense-test.apps.googleusercontent.com")
    transport = lambda *args, **kwargs: SimpleNamespace(status=200, data=json.dumps({"test-key": public_pem.decode()}).encode())
    monkeypatch.setattr(google_requests, "Request", lambda: transport)
    def sign(changes=None, other_key=False):
        claims = {"aud": settings.GOOGLE_CLIENT_ID, "iss": "https://accounts.google.com", "sub": "google-stable-subject",
                  "email": "federated@example.com", "email_verified": True, "name": "Federated user", "iat": int(time.time()), "exp": int(time.time()) + 600}
        claims.update(changes or {})
        pem = private_pem
        if other_key:
            pem = rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        return google_jwt.encode(crypt.RSASigner.from_string(pem, key_id="test-key"), claims).decode()
    return sign


async def test_google_library_verifies_signature_and_issues_application_session(client, google_keys):
    app.dependency_overrides.clear()
    provider_token = google_keys()
    response = await client.post("/api/auth/google", json={"credential": provider_token})
    assert response.status_code == 200
    data = response.json()
    payload = decode_token(data["access_token"])
    assert payload["amr"] == "google" and payload["iss"] == settings.JWT_ISSUER
    assert "refresh_token" not in data
    checked = await client.get("/api/auth/session", headers={"Authorization": "Bearer " + data["access_token"]})
    assert checked.json()["verified"] is True and checked.json()["refresh_cookie_active"] is True
    assert checked.json()["sign_in_method"] == "google"
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer " + provider_token})).status_code == 401
    assert (await client.post("/api/auth/refresh")).status_code == 200


@pytest.mark.parametrize("claims,other_key", [({"aud": "another-app"}, False), ({"iss": "https://untrusted.example"}, False),
    ({"exp": 1}, False), ({"email_verified": False}, False), ({"email_verified": "true"}, False), ({}, True)])
async def test_google_rejects_invalid_identity_with_real_library(client, google_keys, claims, other_key):
    app.dependency_overrides.clear()
    result = await client.post("/api/auth/google", json={"credential": google_keys(claims, other_key)})
    assert result.status_code == 401
    assert await AuthSession.find_all().count() == 0


async def test_google_subject_remains_identity_after_email_changes(client, google_keys):
    app.dependency_overrides.clear()
    first = (await client.post("/api/auth/google", json={"credential": google_keys()})).json()
    second = (await client.post("/api/auth/google", json={"credential": google_keys({"email": "changed@example.com"})})).json()
    assert first["user"]["id"] == second["user"]["id"]
    assert await User.find(User.provider_id == "google-stable-subject").count() == 1


async def test_existing_password_account_requires_explicit_google_link(client, owner, google_keys):
    app.dependency_overrides.clear()
    await owner.set({"password": hash_password("strong-password")})
    credential = google_keys({"email": owner.email})
    assert (await client.post("/api/auth/google", json={"credential": credential})).status_code == 401
    headers = {"Authorization": "Bearer " + create_access_token(str(owner.id))}
    bad = await client.post("/api/auth/google/link", headers=headers, json={"credential": credential, "current_password": "incorrect"})
    assert bad.status_code == 400
    linked = await client.post("/api/auth/google/link", headers=headers, json={"credential": credential, "current_password": "strong-password"})
    assert linked.status_code == 200 and linked.json()["user"]["auth_methods"] == {"password": True, "google": True}
    assert "provider_id" not in linked.json()["user"]
    assert (await client.post("/api/auth/google", json={"credential": credential})).status_code == 200
    assert (await client.post("/api/auth/login", json={"email": owner.email, "password": "strong-password"})).status_code == 200


@pytest.mark.parametrize("changes", [{"exp": 1}, {"aud": "other-app"}, {"iss": "other-issuer"}, {"type": "refresh"},
    {"sv": 99}, {"amr": "unknown"}, {"jti": None}, {"exp": None}])
async def test_invalid_application_jwts_cannot_access_protected_pages(client, owner, changes):
    app.dependency_overrides.clear()
    payload = jwt.decode(create_access_token(str(owner.id)), options={"verify_signature": False})
    payload.update(changes)
    payload = {key: value for key, value in payload.items() if value is not None}
    signed = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    assert (await client.get("/api/auth/session", headers={"Authorization": "Bearer " + signed})).status_code == 401


async def test_forged_signature_and_refresh_bearer_are_rejected(client, owner):
    app.dependency_overrides.clear()
    payload = jwt.decode(create_access_token(str(owner.id)), options={"verify_signature": False})
    forged = jwt.encode(payload, "different-signing-key-at-least-32-bytes", algorithm="HS256")
    for token in (forged, create_refresh_token(str(owner.id)), "not-a-token"):
        assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer " + token})).status_code == 401


async def test_registration_setup_memory_rotation_and_logout_workflow(client):
    app.dependency_overrides.clear()
    assert (await client.post("/api/auth/register", json={"name": "Real workflow", "email": "workflow@example.com", "password": "strong-password"})).status_code == 201
    login = await client.post("/api/auth/login", json={"email": "workflow@example.com", "password": "strong-password"})
    access = login.json()["access_token"]
    headers = {"Authorization": "Bearer " + access}
    preferences = {"onboarding_completed": True, "workspace_goal": "Build a research companion", "memory_review_required": True, "memory_auto_capture": True, "timezone": "UTC"}
    assert (await client.put("/api/users/preferences", headers=headers, json=preferences)).status_code == 200
    profile = (await client.get("/api/auth/me", headers=headers)).json()["user"]
    assert profile["preferences"]["onboarding_completed"] is True
    assert profile["preferences"]["memory_review_required"] is True
    assert (await client.post("/api/chat/", headers=headers, json={"mode": "auto"})).status_code == 201
    assert (await client.get("/api/auth/session", headers=headers)).json()["sign_in_method"] == "password"
    old_cookie = client.cookies.get("refresh_token")
    rotated = await client.post("/api/auth/refresh")
    assert rotated.status_code == 200 and client.cookies.get("refresh_token") != old_cookie
    with pytest.raises(ValueError): await auth_service.refresh_tokens(old_cookie)
    assert (await client.post("/api/auth/logout", headers=headers)).status_code == 200
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_cookie_mutations_reject_untrusted_browser_origin(client, owner):
    app.dependency_overrides.clear()
    tokens = await auth_service.issue_tokens(owner)
    client.cookies.set("refresh_token", tokens["refresh_token"])
    for route in ("refresh", "logout"):
        assert (await client.post("/api/auth/" + route, headers={"Origin": "https://evil.example"})).status_code == 403
    assert (await client.post("/api/auth/refresh", headers={"Origin": settings.FRONTEND_URL})).status_code == 200


async def test_logout_revokes_cookie_even_when_access_has_expired(client, owner):
    app.dependency_overrides.clear()
    tokens = await auth_service.issue_tokens(owner)
    client.cookies.set("refresh_token", tokens["refresh_token"])
    assert (await client.post("/api/auth/logout", headers={"Authorization": "Bearer expired-access"})).status_code == 200
    with pytest.raises(ValueError): await auth_service.refresh_tokens(tokens["refresh_token"])
