from datetime import datetime, timedelta
import pytest
from app.core.config import settings
from app.models.chat import Chat, Message
from app.models.memory import Memory
from app.models.project import Project
from app.models.workspace import MemoryProposal
from app.services.memory_service import capture_turn, recall
from app.services.auth_service import issue_tokens
from app.main import app


async def queue_fact(owner, text="I use Python.", at=None):
    at = at or datetime.utcnow()
    await owner.set({"preferences.memory_review_required": True})
    message = Message(role="user", content=text, created_at=at)
    chat = Chat(user_id=str(owner.id), messages=[message])
    await chat.insert()
    assert await capture_turn(str(owner.id), text, str(chat.id), message.id, observed_at=at) == []
    proposal = await MemoryProposal.find_one({"message_id": message.id})
    return chat, proposal


async def test_review_captures_stay_out_of_recall_until_explicit_approval(client, owner):
    chat, proposal = await queue_fact(owner)
    assert not (await recall(str(owner.id), "Python"))["used"]
    listing = (await client.get("/api/workspace/review")).json()
    assert listing["total"] == 1 and listing["proposals"][0]["candidate"]["quote"] == "I use Python"
    accepted = await client.post(f"/api/workspace/review/{proposal.id}", json={"action": "approve"})
    assert accepted.status_code == 200
    hit = (await recall(str(owner.id), "Python"))["used"][0]
    stored = await Memory.find_one({"user_id": str(owner.id)})
    assert hit["source_chat_id"] == str(chat.id) and stored.provenance == "user" and stored.confirmed
    assert (await client.post(f"/api/workspace/review/{proposal.id}", json={"action": "approve"})).status_code == 409


async def test_review_rejection_and_clear_never_save_a_fact(client, owner):
    _, proposal = await queue_fact(owner)
    assert (await client.post(f"/api/workspace/review/{proposal.id}", json={"action": "reject"})).status_code == 200
    assert await Memory.find({"user_id": str(owner.id)}).count() == 0
    await client.delete("/api/memory/")
    assert await MemoryProposal.find({"user_id": str(owner.id)}).count() == 0


async def test_review_cannot_approve_foreign_deleted_or_private_source(client, owner):
    chat, proposal = await queue_fact(owner)
    foreign = MemoryProposal(user_id="other", chat_id=str(chat.id), message_id=proposal.message_id,
        candidate=proposal.candidate, observed_at=datetime.utcnow(), epoch=0)
    # The owner-scoped unique key allows another owner but forbids read access.
    await foreign.insert()
    assert (await client.post(f"/api/workspace/review/{foreign.id}", json={"action": "approve"})).status_code == 404
    chat.messages[0].private = True; await chat.save()
    assert (await client.post(f"/api/workspace/review/{proposal.id}", json={"action": "approve"})).status_code == 409
    await chat.delete()
    assert (await client.post(f"/api/workspace/review/{proposal.id}", json={"action": "approve"})).status_code == 404


async def test_old_queued_proposal_cannot_overwrite_newer_fact(client, owner):
    _, old = await queue_fact(owner, "I live in Anantapur.", datetime.utcnow() - timedelta(days=1))
    await owner.set({"preferences.memory_review_required": False})
    await capture_turn(str(owner.id), "I now live in Bengaluru.", "new", "new")
    assert (await client.post(f"/api/workspace/review/{old.id}", json={"action": "approve"})).status_code == 409
    assert (await recall(str(owner.id), "Where do I live?"))["used"][0]["fact"] == "I now live in Bengaluru"


async def test_review_order_retains_microseconds_across_mongo_rounding(client, owner):
    start = datetime.utcnow().replace(microsecond=123100)
    _, old = await queue_fact(owner, "I live in Anantapur.", start)
    _, recent = await queue_fact(owner, "I live in Bengaluru.", start + timedelta(microseconds=200))
    assert (await client.post(f"/api/workspace/review/{recent.id}", json={"action": "approve"})).status_code == 200
    assert (await client.post(f"/api/workspace/review/{old.id}", json={"action": "approve"})).status_code == 409


async def test_search_is_literal_owner_and_project_scoped(client, owner):
    project = Project(user_id=str(owner.id), name="Research"); await project.insert()
    await Memory(user_id=str(owner.id), fact="Python global", provenance="user").insert()
    await Memory(user_id=str(owner.id), project_id=str(project.id), fact="Python scoped", provenance="user").insert()
    await Memory(user_id="other", fact="Python foreign", provenance="user").insert()
    await client.post("/api/knowledge/notes", json={"title": "Python brief", "text": "Python source evidence"})
    personal = (await client.get("/api/workspace/search", params={"q": "Python"})).json()["results"]
    assert {r["title"] for r in personal} == {"Python global", "Python brief"}
    scoped = (await client.get("/api/workspace/search", params={"q": "Python", "project_id": str(project.id)})).json()["results"]
    assert "Python scoped" in {r["title"] for r in scoped}
    assert not (await client.get("/api/workspace/search", params={"q": ".*"})).json()["results"]


async def test_sign_out_everywhere_invalidates_access_and_refresh_tokens(client, owner):
    tokens = await issue_tokens(owner)
    assert (await client.get("/api/workspace/sessions")).json()["sessions"]
    assert (await client.post("/api/workspace/sessions/revoke-all")).status_code == 200
    app.dependency_overrides.clear()
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer " + tokens["access_token"]})).status_code == 401
    from app.services.auth_service import refresh_tokens
    with pytest.raises(ValueError): await refresh_tokens(tokens["refresh_token"])


async def test_google_config_exposes_only_public_id_and_refresh_cookie_is_scoped(client, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-public-client")
    config = (await client.get("/api/auth/config")).json()
    assert config["google_enabled"] and config["google_client_id"] == "test-public-client"
    assert "secret_key" not in str(config).lower() and "anthropic" not in str(config).lower()
    app.dependency_overrides.clear()
    await client.post("/api/auth/register", json={"name":"Example", "email":"new@example.com", "password":"strong-test-password"})
    response = await client.post("/api/auth/login", json={"email":"new@example.com", "password":"strong-test-password"})
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "path=/api/auth" in cookie and "samesite=lax" in cookie


async def test_activity_and_system_do_not_return_foreign_or_secret_data(client, owner):
    await Memory(user_id="other", fact="Foreign activity", provenance="user").insert()
    await Memory(user_id=str(owner.id), fact="My durable context", provenance="user").insert()
    events = (await client.get("/api/workspace/activity")).json()["events"]
    assert len(events) == 1 and events[0]["title"] == "My durable context"
    system = (await client.get("/api/workspace/system")).json()
    assert system["version"] == "6.0.0" and "SECRET_KEY" not in str(system)


async def test_google_route_issues_real_project_jwt_and_rejects_unverified_claim(client, owner, monkeypatch):
    from google.oauth2 import id_token
    app.dependency_overrides.clear()
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "public-test-client")
    info = {"email": owner.email, "email_verified": True, "sub": "stable-google-sub", "iss": "https://accounts.google.com"}
    def verified(credential, request, audience):
        assert audience == "public-test-client"
        return dict(info)
    monkeypatch.setattr(id_token, "verify_oauth2_token", verified)
    login = await client.post("/api/auth/google", json={"credential": "provider-test-token"})
    assert login.status_code == 200 and "httponly" in login.headers["set-cookie"].lower()
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer " + login.json()["access_token"]})).status_code == 200
    info["email_verified"] = False
    assert (await client.post("/api/auth/google", json={"credential": "provider-test-token"})).status_code == 401


async def test_google_changed_subject_cannot_take_over_existing_google_account(client, owner, monkeypatch):
    from google.oauth2 import id_token
    await owner.set({"provider": "google", "provider_id": "original-sub"})
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "public-test-client")
    monkeypatch.setattr(id_token, "verify_oauth2_token", lambda *args: {"email": owner.email, "email_verified": True, "sub": "different-sub", "iss": "https://accounts.google.com"})
    assert (await client.post("/api/auth/google", json={"credential": "provider-test-token"})).status_code == 401
