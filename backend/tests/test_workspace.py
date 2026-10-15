import asyncio
import io
import json
import zipfile
from datetime import datetime, timedelta
from types import SimpleNamespace
import pytest
import httpx
from app.core.config import settings
from app.models.memory import Memory
from app.models.chat import Chat, Message
from app.models.project import Project
from app.models.user import User
from app.models.workspace import (KnowledgeDocument, MemoryEdge, MemoryFeedback, SessionDigest,
                                  Commitment, Notification, AuthSession)
from app.services.memory_service import capture_turn, recall
from app.services.knowledge_service import parse_file, make_chunks
from app.services.workspace_context import gather_context
from app.services.continuity_service import process_due_commitments, next_occurrence, deliver_reminder_emails
from app.services import embeddings, auth_service, email_service, ai_service
from app.core.security import create_access_token
from app.main import app


async def test_knowledge_import_query_original_and_delete(client, owner):
    text = "NeuroSense architecture uses FastAPI, MongoDB and source grounded temporal memory."
    upload = await client.post("/api/knowledge/upload", files={"file": ("design.txt", text.encode(), "text/plain")})
    assert upload.status_code == 201
    identifier = upload.json()["document"]["id"]
    duplicate = await client.post("/api/knowledge/upload", files={"file": ("design.txt", text.encode(), "text/plain")})
    assert not duplicate.json()["created"]
    evidence = (await client.post("/api/knowledge/query", json={"query": "FastAPI architecture"})).json()
    assert evidence["used"][0]["fact"] == text
    assert evidence["used"][0]["document_id"] == identifier
    assert (await client.get(f"/api/knowledge/{identifier}/download")).content == text.encode()
    assert (await client.get(f"/api/knowledge/{identifier}")).json()["passages"]
    assert (await client.delete(f"/api/knowledge/{identifier}")).status_code == 200
    assert not (await client.post("/api/knowledge/query", json={"query": "FastAPI"})).json()["used"]


async def test_knowledge_owner_scope_and_missing_fact(client, owner):
    project = Project(user_id=str(owner.id), name="Research"); await project.insert()
    note = (await client.post("/api/knowledge/notes", json={"title": "Private brief", "text": "Quantum memory uses photons.", "project_id": str(project.id)})).json()["document"]
    assert (await client.post("/api/knowledge/query", json={"query": "photons"})).json()["abstained"]
    scoped = await client.post("/api/knowledge/query", json={"query": "photons", "project_id": str(project.id)})
    assert scoped.json()["used"]
    foreign = KnowledgeDocument(user_id="other", title="Foreign", checksum="foreign"); await foreign.insert()
    for suffix in ("", "/download"):
        assert (await client.get(f"/api/knowledge/{foreign.id}{suffix}")).status_code == 404
    assert (await client.post("/api/knowledge/query", json={"query": "photons", "document_id": note["id"]})).status_code == 404
    assert (await client.get("/api/knowledge/invalid")).status_code == 404


@pytest.mark.parametrize("filename,data", [("script.exe", b"bad"), ("broken.json", b"not json"), ("null.txt", b"\x00abc"), ("scan.pdf", b"bad PDF")])
async def test_unsupported_or_malformed_documents_rejected(client, filename, data):
    assert (await client.post("/api/knowledge/upload", files={"file": (filename, data, "application/octet-stream")})).status_code == 422


async def test_upload_size_and_quota(client, monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 10)
    assert (await client.post("/api/knowledge/upload", files={"file": ("large.txt", b"a"*11, "text/plain")})).status_code == 413
    monkeypatch.setattr(settings, "MAX_DOCUMENTS_PER_USER", 1)
    assert (await client.post("/api/knowledge/notes", json={"title": "first", "text": "one fact"})).status_code == 201
    assert (await client.post("/api/knowledge/notes", json={"title": "second", "text": "second fact"})).status_code == 422


def test_docx_extraction_and_chunk_evidence():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>A durable memory workflow.</w:t></w:r></w:p></w:body></w:document>')
    pages, _ = parse_file("example.docx", buffer.getvalue())
    assert make_chunks(pages)[0].text == "A durable memory workflow."
    chunks = make_chunks([(3, "word "*600)])
    assert all(chunk.page == 3 and len(chunk.text) <= 1000 for chunk in chunks)


async def test_graph_two_hops_scope_and_delete(client, owner):
    first = (await client.post("/api/memory/", json={"fact": "I prefer Python", "slot": "first"})).json()["memory"]
    second = (await client.post("/api/memory/", json={"fact": "My workflow includes code review", "slot": "second"})).json()["memory"]
    third = (await client.post("/api/memory/", json={"fact": "My routine includes writing tests", "slot": "third"})).json()["memory"]
    for source, target in [(first, second), (second, third)]:
        assert (await client.post("/api/memory-graph/", json={"source_id": source["id"], "target_id": target["id"], "relation": "depends_on"})).status_code == 201
    result = await recall(str(owner.id), "Python")
    assert {hit["id"] for hit in result["used"]} == {first["id"], second["id"], third["id"]}
    assert any("hop 2" in hit["reason"] for hit in result["used"])
    foreign = Memory(user_id="other", fact="Hidden", provenance="user"); await foreign.insert()
    assert (await client.post("/api/memory-graph/", json={"source_id": first["id"], "target_id": str(foreign.id)})).status_code == 404
    await client.delete(f"/api/memory/{second['id']}")
    assert not (await client.get("/api/memory-graph/")).json()["edges"]


async def test_expired_linked_fact_never_recalled(owner):
    await capture_turn(str(owner.id), "I use Python.", "s", "m")
    first = await Memory.find_one({"user_id": str(owner.id)})
    expired = Memory(user_id=str(owner.id), fact="Expired secret project", provenance="user", expires_at=datetime.utcnow()-timedelta(days=1)); await expired.insert()
    await MemoryEdge(user_id=str(owner.id), source_id=str(first.id), target_id=str(expired.id)).insert()
    assert "Expired secret" not in (await recall(str(owner.id), "Python"))["context"]


async def test_semantic_nonliteral_retrieval_and_stale_vector(owner, monkeypatch):
    from app.services.memory_logic import fingerprint
    memory = Memory(user_id=str(owner.id), fact="I enjoy studying astronomy", provenance="user", embedding=[1.,0.],
        embedding_model="test-model", embedding_fingerprint=fingerprint("I enjoy studying astronomy")); await memory.insert()
    monkeypatch.setattr(settings, "EMBEDDINGS_PROVIDER", "ollama"); monkeypatch.setattr(settings, "EMBEDDINGS_MODEL", "test-model")
    async def encode(texts): return [[1.,0.] for _ in texts]
    monkeypatch.setattr(embeddings, "encode_texts", encode)
    assert (await recall(str(owner.id), "celestial exploration"))["used"][0]["id"] == str(memory.id)
    await memory.set({"fact": "I collect vintage stamps"})
    assert not (await recall(str(owner.id), "celestial exploration"))["used"]


async def test_saved_session_uses_user_quotes_and_clear_removes_it(client, owner):
    chat = Chat(user_id=str(owner.id), messages=[Message(role="user", content="We need a retrieval evaluation next week."),
        Message(role="assistant", content="Invented claim: you are a doctor")]); await chat.insert()
    snapshot = await client.post(f"/api/continuity/sessions/{chat.id}")
    assert snapshot.status_code == 200
    assert "doctor" not in json.dumps(snapshot.json())
    assert (await gather_context(owner, "retrieval evaluation"))["used"][0]["kind"] == "episode"
    await client.delete("/api/memory/")
    assert await SessionDigest.find({"user_id": str(owner.id)}).count() == 0


async def test_snapshot_never_recaptures_private_turns(client, owner):
    chat = Chat(user_id=str(owner.id), messages=[
        Message(role="user", content="Public plan is to evaluate retrieval."),
        Message(role="user", content="Private plan concerns confidential research.", private=True),
        Message(role="assistant", content="An assistant invention")])
    await chat.insert()
    response = await client.post(f"/api/continuity/sessions/{chat.id}")
    assert response.status_code == 200
    assert [q["quote"] for q in response.json()["session"]["quotes"]] == ["Public plan is to evaluate retrieval."]
    assert not (await gather_context(owner, "confidential research"))["used"]


async def test_combined_context_budget_and_library_preference(client, owner, monkeypatch):
    await client.post("/api/knowledge/notes", json={"title": "Python guide", "text": "Python asynchronous code uses coroutines."})
    await capture_turn(str(owner.id), "I use Python.", "s", "m")
    monkeypatch.setattr(settings, "WORKSPACE_CONTEXT_CHARS", 450)
    result = await gather_context(owner, "Python")
    assert len(result["context"]) <= 450 and result["context_chars"] == len(result["context"])
    owner.preferences.knowledge_enabled = False
    assert all(item["kind"] != "document" for item in (await gather_context(owner, "Python"))["used"])


async def test_commitments_versioning_due_idempotence_and_mark_read(client, owner):
    now = datetime.utcnow()
    response = await client.post("/api/continuity/tasks", json={"title": "Run memory experiments", "due_at": (now-timedelta(minutes=1)).isoformat()})
    assert response.status_code == 201
    task = response.json()["task"]
    results = await asyncio.gather(process_due_commitments(now), process_due_commitments(now))
    assert sum(results) == 1
    assert await process_due_commitments(now) == 0
    inbox = (await client.get("/api/continuity/notifications")).json()
    assert len(inbox["notifications"]) == 1 and inbox["unread"] == 1
    await client.patch(f"/api/continuity/notifications/{inbox['notifications'][0]['id']}/read")
    assert (await client.get("/api/continuity/notifications")).json()["unread"] == 0
    assert (await client.patch(f"/api/continuity/tasks/{task['id']}", json={"status": "done", "expected_version": 1})).status_code == 200
    assert (await client.patch(f"/api/continuity/tasks/{task['id']}", json={"status": "pending", "expected_version": 1})).status_code == 409
    await client.delete(f"/api/continuity/tasks/{task['id']}")
    assert not (await client.get("/api/continuity/notifications")).json()["notifications"]


async def test_commitment_isolation_and_invalid_values(client):
    foreign = Commitment(user_id="other", title="private"); await foreign.insert()
    assert (await client.patch(f"/api/continuity/tasks/{foreign.id}", json={"title": "bad", "expected_version": 1})).status_code == 404
    assert (await client.delete(f"/api/continuity/tasks/{foreign.id}")).status_code == 404
    assert (await client.post("/api/continuity/tasks", json={"title": "daily", "recurrence": "daily"})).status_code == 422
    assert (await client.post("/api/continuity/tasks", json={"title": "daily", "timezone": "bad-zone"})).status_code == 422


def test_daily_repeat_keeps_wall_clock_across_dst():
    # 09:00 New York before and after the spring DST change.
    due = datetime(2026,3,7,14,0)
    assert next_occurrence(due, "daily", "America/New_York", due) == datetime(2026,3,8,13,0)


async def test_recurring_commitment_advances_without_duplicate(owner):
    now = datetime.utcnow()
    task = Commitment(user_id=str(owner.id), title="Daily research", due_at=now-timedelta(days=3), recurrence="daily"); await task.insert()
    assert await process_due_commitments(now) == 1
    updated = await Commitment.get(task.id)
    assert updated.due_at > now and updated.version == 2
    assert await process_due_commitments(now) == 0


async def test_reminder_email_retry_and_opt_out(owner, monkeypatch):
    owner.preferences.reminder_emails = True; await owner.save()
    monkeypatch.setattr(settings, "MAIL_USERNAME", "test@example.com"); monkeypatch.setattr(settings, "MAIL_PASSWORD", "test-only")
    now = datetime.utcnow()
    task = Commitment(user_id=str(owner.id), title="test"); await task.insert()
    notice = Notification(user_id=str(owner.id), dedupe_key="test", task_id=str(task.id), title="test", message="test", email_status="queued", next_attempt_at=now); await notice.insert()
    async def fail(*args): raise RuntimeError("mail unavailable")
    monkeypatch.setattr(email_service, "send_reminder_email", fail)
    assert await deliver_reminder_emails(now) == 0
    retry = await Notification.get(notice.id)
    assert retry.attempts == 1 and retry.email_status == "retry" and retry.next_attempt_at > now
    owner.preferences.reminder_emails = False; await owner.save()
    assert await deliver_reminder_emails(retry.next_attempt_at+timedelta(seconds=1)) == 0
    assert (await Notification.get(notice.id)).email_status == "disabled"


async def test_feedback_is_receipt_bound_and_not_counted_twice(client, owner):
    saved = await capture_turn(str(owner.id), "I use Python.", "s", "m")
    chat = Chat(user_id=str(owner.id), messages=[Message(role="assistant", content="Answer", memory_receipt={"used": [{"id": saved[0]["id"], "version": 1}]})]); await chat.insert()
    endpoint = f"/api/chat/{chat.id}/messages/{chat.messages[0].id}/feedback"
    for _ in range(3):
        assert (await client.post(endpoint, json={"rating": 1})).status_code == 200
    assert await MemoryFeedback.find({"user_id": str(owner.id)}).count() == 1
    assert "feedback" in (await recall(str(owner.id), "Python"))["used"][0]["reason"]
    assert (await client.post(f"/api/chat/{chat.id}/messages/invalid/feedback", json={"rating": 1})).status_code == 404


async def test_local_registration_rotation_logout_without_redis(client, monkeypatch):
    app.dependency_overrides.clear()
    monkeypatch.setattr(auth_service, "get_redis", lambda: None)
    registered = await client.post("/api/auth/register", json={"name": "Local user", "email": "local@example.com", "password": "test-password"})
    assert registered.status_code == 201
    login = await client.post("/api/auth/login", json={"email": "local@example.com", "password": "test-password"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    old_cookie = client.cookies.get("refresh_token")
    assert (await client.post("/api/auth/refresh")).status_code == 200
    assert client.cookies.get("refresh_token") != old_cookie
    with pytest.raises(ValueError): await auth_service.refresh_tokens(old_cookie)
    assert (await client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})).status_code == 200
    assert (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})).status_code == 401


async def test_google_verified_account_and_deactivation(owner, monkeypatch):
    from google.oauth2 import id_token
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client")
    await owner.set({"provider": "google", "provider_id": "google-sub"})
    info = {"email": owner.email, "email_verified": True, "sub": "google-sub", "iss": "https://accounts.google.com"}
    monkeypatch.setattr(id_token, "verify_oauth2_token", lambda *args: dict(info))
    assert (await auth_service.google_login("test-credential"))["access_token"]
    info["email_verified"] = False
    with pytest.raises(ValueError): await auth_service.google_login("test-credential")
    info["email_verified"] = True; await owner.set({"is_active": False})
    with pytest.raises(ValueError): await auth_service.google_login("test-credential")


async def test_export_has_no_auth_secrets_and_erasure_is_owner_scoped(client, owner):
    await capture_turn(str(owner.id), "My name is Alice.", "s", "m")
    foreign = Memory(user_id="other", fact="Must remain", provenance="user"); await foreign.insert()
    exported = (await client.get("/api/account/export")).json()
    assert exported["memories"] and "password" not in exported["profile"] and "auth_sessions" not in exported
    assert (await client.request("DELETE", "/api/account/data", json={"confirmation": "wrong"})).status_code == 422
    assert (await client.request("DELETE", "/api/account/data", json={"confirmation": "DELETE MY DATA"})).status_code == 200
    assert await Memory.find({"user_id": str(owner.id)}).count() == 0
    assert await Memory.get(foreign.id)
    assert (await User.get(owner.id)).auth_version == 1


async def test_import_cannot_resurrect_data_after_erasure(client, owner, monkeypatch):
    from app.api.routes import knowledge
    started, resume = asyncio.Event(), asyncio.Event()
    async def delayed(function, *args):
        started.set(); await resume.wait(); return function(*args)
    monkeypatch.setattr(knowledge.asyncio, "to_thread", delayed)
    pending = asyncio.create_task(client.post("/api/knowledge/upload", files={"file": ("old.txt", b"Old workspace document", "text/plain")}))
    await started.wait()
    await client.request("DELETE", "/api/account/data", json={"confirmation": "DELETE MY DATA"})
    resume.set()
    assert (await pending).status_code == 401
    assert await KnowledgeDocument.find({"user_id": str(owner.id)}).count() == 0


async def test_pdf_import_preserves_page_citation(client):
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    writer = PdfWriter(); page = writer.add_blank_page(width=240, height=120)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    stream = DecodedStreamObject(); stream.set_data(b"BT /F1 12 Tf 10 60 Td (Persistent PDF evidence) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(stream)
    content = io.BytesIO(); writer.write(content)
    upload = await client.post("/api/knowledge/upload", files={"file": ("source.pdf", content.getvalue(), "application/pdf")})
    assert upload.status_code == 201
    result = (await client.post("/api/knowledge/query", json={"query": "PDF evidence"})).json()
    assert result["used"][0]["page"] == 1 and "Persistent PDF evidence" in result["used"][0]["fact"]


async def test_snapshot_preserves_early_and_late_user_context(client, owner):
    chat = Chat(user_id=str(owner.id), messages=[Message(role="user", content=f"Research topic {index} concerns memory.") for index in range(20)])
    await chat.insert()
    response = await client.post(f"/api/continuity/sessions/{chat.id}")
    quotes = response.json()["session"]["quotes"]
    assert len(quotes) == 20
    assert any("topic 0 " in quote["quote"] for quote in quotes)
    assert any("topic 19 " in quote["quote"] for quote in quotes)


async def test_local_provider_stream_protocol(database, monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "ollama")
    real_client = httpx.AsyncClient
    def handler(request):
        body = json.loads(request.content)
        assert request.url.path == "/api/chat" and body["stream"] and body["messages"][0]["role"] == "system"
        return httpx.Response(200, text='{"message":{"content":"Hello "},"done":false}\n{"message":{"content":"world"},"done":true}\n')
    monkeypatch.setattr(ai_service.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler)))
    assert await ai_service.complete_ai("Hi", "Use context", "local") == "Hello world"


async def test_validated_plan_and_web_search_failure_are_explicit(client, monkeypatch):
    from app.api.routes import agents
    async def plan(*args): return json.dumps({"goal": "Evaluate memory", "weeks": [{"week": 1, "theme": "Measure recall", "tasks": ["Run held-out tests"], "milestone": "Results"}]})
    monkeypatch.setattr(agents, "complete_ai", plan)
    assert (await client.post("/api/agents/plan", json={"goal": "Evaluate memory", "weeks": 1, "model": "local"})).status_code == 200
    assert (await client.post("/api/agents/plan", json={"goal": "Evaluate memory", "weeks": 2})).status_code == 502
    assert (await client.post("/api/rag/web-search", json={"query": "latest memory research", "model": "local"})).status_code == 503
