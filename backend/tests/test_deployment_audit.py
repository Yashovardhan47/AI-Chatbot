import asyncio
import io
import threading
import zipfile
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from app.core.config import Settings, settings
from app.core.security import create_access_token
from app.main import app
from app.models.user import User
from app.models.workspace import AuthSession
from app.services import auth_service
from app.preflight import production_issues

pytestmark = pytest.mark.asyncio


async def test_reset_link_is_consumed_once_even_with_concurrent_password_hashes(owner, monkeypatch):
    token = "single-use-reset"
    await owner.set({"reset_token": auth_service.token_hash(token), "reset_expires": datetime.now(timezone.utc) + timedelta(hours=1)})
    await auth_service.issue_tokens(owner)
    barrier = threading.Barrier(2)
    def hashing(password):
        barrier.wait(timeout=5)
        return "hash:" + password
    monkeypatch.setattr(auth_service, "hash_password", hashing)
    results = await asyncio.gather(auth_service.reset_password(token, "password-one"),
                                   auth_service.reset_password(token, "password-two"), return_exceptions=True)
    assert sum(result is None for result in results) == 1
    assert sum(isinstance(result, ValueError) for result in results) == 1
    fresh = await User.get(owner.id)
    assert fresh.auth_version == 1 and fresh.reset_token is None
    assert await AuthSession.find({"user_id": str(owner.id), "revoked": False}).count() == 0


async def test_email_verification_is_hashed_expiring_and_recoverable(client, monkeypatch):
    sent = []
    async def mail(email, name, token):
        sent.append(token)
    monkeypatch.setattr(auth_service, "send_verification_email", mail)
    monkeypatch.setattr(settings, "DEBUG", False)
    assert (await client.post("/api/auth/register", json={"name": "Verified Owner", "email": "verify@example.com", "password": "strong-password"})).status_code == 201
    user = await User.find_one({"email": "verify@example.com"})
    assert not user.is_verified and user.verify_token == auth_service.token_hash(sent[-1])
    assert user.verify_token != sent[-1] and "verify_expires" not in user.safe_dict()
    old = sent[-1]
    await user.set({"verify_expires": datetime.utcnow() - timedelta(seconds=1)})
    assert (await client.get("/api/auth/verify/" + old)).status_code == 400
    assert (await client.post("/api/auth/resend-verification", json={"email": user.email})).status_code == 200
    assert sent[-1] != old
    assert (await client.get("/api/auth/verify/" + old)).status_code == 400
    assert (await client.get("/api/auth/verify/" + sent[-1])).status_code == 200
    assert (await client.get("/api/auth/verify/" + sent[-1])).status_code == 400


@pytest.mark.parametrize("identifier", ["invalid", "0" * 24])
async def test_malformed_and_missing_project_ids_are_404(client, identifier):
    url = "/api/projects/" + identifier
    assert (await client.get(url)).status_code == 404
    assert (await client.put(url, json={"name": "Updated"})).status_code == 404
    assert (await client.delete(url)).status_code == 404


async def test_archived_projects_and_blank_fields_are_rejected(client):
    for body in ({"name": "   "}, {"name": "Valid", "color": "invalid"}, {"name": "x" * 101}):
        assert (await client.post("/api/projects/", json=body)).status_code == 422
    project = (await client.post("/api/projects/", json={"name": "  Research  "})).json()["project"]
    assert project["name"] == "Research"
    url = "/api/projects/" + project["id"]
    assert (await client.delete(url)).status_code == 200
    assert (await client.get(url)).status_code == 404
    assert (await client.put(url, json={"name": "Revive"})).status_code == 404
    assert (await client.post("/api/knowledge/notes", json={"title": "Test", "text": "A note", "project_id": project["id"]})).status_code == 404


async def test_delayed_profile_and_project_writes_cannot_follow_workspace_erasure(client):
    assert (await client.request("DELETE", "/api/account/data", json={"confirmation": "DELETE MY DATA"})).status_code == 200
    assert (await client.put("/api/users/profile", json={"name": "Stale name"})).status_code == 401
    assert (await client.post("/api/projects/", json={"name": "Stale project"})).status_code == 401


def storage(monkeypatch):
    for field in ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"):
        monkeypatch.setattr(settings, field, "test-only")


async def test_attachment_size_limit_is_checked_before_external_upload(client, monkeypatch):
    import cloudinary.uploader
    storage(monkeypatch)
    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 10)
    def forbidden(*args, **kwargs):
        raise AssertionError("External storage must not be called")
    monkeypatch.setattr(cloudinary.uploader, "upload", forbidden)
    response = await client.post("/api/files/upload", files=[("files", ("good.txt", b"ok", "text/plain")),
        ("files", ("large.txt", b"x" * 11, "text/plain"))])
    assert response.status_code == 413


async def test_upload_does_not_overwrite_new_account_state_and_cleans_stale_batch(client, owner, monkeypatch):
    import cloudinary.uploader
    storage(monkeypatch)
    started, resume = threading.Event(), threading.Event()
    deleted = []
    def upload(*args, **kwargs):
        started.set()
        assert resume.wait(timeout=5)
        return {"secure_url": "https://example.com/file.txt", "public_id": "uploaded-file"}
    monkeypatch.setattr(cloudinary.uploader, "upload", upload)
    monkeypatch.setattr(cloudinary.uploader, "destroy", lambda public_id, **kwargs: deleted.append(public_id))
    pending = asyncio.create_task(client.post("/api/files/upload", files={"files": ("file.txt", b"text", "text/plain")}))
    assert await asyncio.to_thread(started.wait, 5)
    await User.get_motor_collection().update_one({"_id": owner.id}, {"$inc": {"auth_version": 1}, "$set": {"preferences.memory_enabled": False}})
    resume.set()
    assert (await pending).status_code == 401
    fresh = await User.get(owner.id)
    assert fresh.auth_version == 1 and not fresh.preferences.memory_enabled and fresh.stats.files_uploaded == 0
    assert deleted == ["uploaded-file"]


async def test_unconfigured_storage_is_a_service_error(client, monkeypatch):
    monkeypatch.setattr(settings, "CLOUDINARY_CLOUD_NAME", "")
    assert (await client.post("/api/files/upload", files={"files": ("file.txt", b"text", "text/plain")})).status_code == 503


async def test_docx_entities_are_not_expanded(client):
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("word/document.xml", '<!DOCTYPE d [<!ENTITY secret "EXPANDED">]><d>&secret;</d>')
    assert (await client.post("/api/knowledge/upload", files={"file": ("entities.docx", payload.getvalue(), "application/octet-stream")})).status_code == 422


async def test_websocket_rejects_query_tokens_untrusted_origins_and_bad_first_frames(owner):
    client = TestClient(app)
    token = create_access_token(str(owner.id))
    with client.websocket_connect("/api/chat/ws/new?token=" + token) as socket:
        with pytest.raises(WebSocketDisconnect):
            socket.receive_json()
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/chat/ws/new", headers={"origin": "https://untrusted.example"}):
            pass
    with client.websocket_connect("/api/chat/ws/new") as socket:
        socket.send_json({"type": "message", "token": token})
        with pytest.raises(WebSocketDisconnect):
            socket.receive_json()


async def test_readiness_reports_database_failure_without_affecting_liveness(client, monkeypatch):
    import importlib
    main = importlib.import_module("app.main")
    async def unavailable():
        return False
    monkeypatch.setattr(main, "database_ready", unavailable)
    assert (await client.get("/api/health")).status_code == 200
    assert (await client.get("/api/ready")).status_code == 503


async def test_production_preflight_reports_missing_configuration():
    config = Settings(_env_file=None)
    assert production_issues(config)
    config = Settings(_env_file=None, DEBUG=False, SECRET_KEY="a" * 64, FRONTEND_URL="https://app.example.com",
        GOOGLE_CLIENT_ID="real-client.apps.googleusercontent.com", MAIL_USERNAME="sender@example.com", MAIL_PASSWORD="private",
        AI_PROVIDER="ollama")
    assert production_issues(config) == []
    config.FRONTEND_URL = "http://app.example.com"
    assert any("HTTPS" in item for item in production_issues(config))
