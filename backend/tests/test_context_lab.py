import json
from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.chat import Chat, Message
from app.models.memory import Memory
from app.models.project import Project
from app.models.workspace import Commitment, MemoryEdge
from app.models.context_lab import ContextChange, ClaimSupport, ContextReplay, AnswerReview
from app.services.context_logic import digest, reference
from app.services.memory_guard import memory_write_guard
from app.core.security import create_access_token
from app.services.memory_service import recall


async def fact(client, text="We use Flask for the API", **kwargs):
    response = await client.post("/api/memory/", json={"fact": text, **kwargs})
    assert response.status_code == 201, response.text
    return response.json()["memory"]


async def scenario(client, owner, project_id=None):
    memory = await fact(client, project_id=project_id, slot="architecture.backend")
    question = Message(role="user", content="Which backend should I use?")
    answer = Message(role="assistant", content="Use Flask for the API. Keep the database independent.",
                     memory_receipt={"used": [{"id": memory["id"], "version": memory["version"], "kind": "memory"}]})
    chat = Chat(user_id=str(owner.id), project_id=project_id, title="Architecture", messages=[question, answer])
    await chat.insert()
    task = await client.post("/api/continuity/tasks", json={"title": "Build the Flask API", "notes": "Keep the database independent",
        "source_chat_id": str(chat.id), "source_message_id": answer.id, "project_id": project_id, "due_at": "2026-12-01T12:00:00Z"})
    assert task.status_code == 201, task.text
    return memory, chat, answer, task.json()["task"]


async def correct(client, memory):
    response = await client.patch(f"/api/memory/{memory['id']}", json={"fact": "We use FastAPI for the API", "expected_version": memory["version"]})
    assert response.status_code == 200, response.text
    return response.json()["change_id"]


async def replay(client, change_id, kind, target_id):
    response = await client.post("/api/context/replays", json={"change_id": change_id, "target_kind": kind, "target_id": target_id})
    assert response.status_code == 201, response.text
    return response.json()


async def test_exact_preview_is_read_only_and_committed_with_version_and_revision(client, owner):
    memory, chat, answer, task = await scenario(client, owner)
    body = {"memory_id": memory["id"], "expected_version": 1, "action": "correct", "fact": "We use FastAPI for the API"}
    preview = (await client.post("/api/context/preview", json=body)).json()
    assert preview["counts"] == {"review": 1, "possible": 1, "supported": 0, "reviewed": 0}
    assert (await Memory.get(memory["id"])).version == 1
    commit = await client.post("/api/context/changes", json={**body, "expected_context_revision": preview["context_revision"], "preview_token": preview["preview_token"]})
    assert commit.status_code == 201, commit.text
    updated = commit.json()
    assert updated["memory"]["version"] == 2 and updated["change_id"]
    assert (await Chat.get(chat.id)).messages[-1].content == answer.content


@pytest.mark.parametrize("tamper", [{"fact": "Another unreviewed decision"}, {"action": "revoke"}, {"expected_context_revision": 999}])
async def test_preview_cannot_authorize_a_different_change(client, tamper):
    memory = await fact(client)
    body = {"memory_id": memory["id"], "expected_version": 1, "action": "correct", "fact": "Use FastAPI"}
    preview = (await client.post("/api/context/preview", json=body)).json()
    response = await client.post("/api/context/changes", json={**body, "expected_context_revision": preview["context_revision"], "preview_token": preview["preview_token"], **tamper})
    assert response.status_code == 409
    assert (await Memory.get(memory["id"])).fact == memory["fact"]


async def test_independent_owner_confirmed_support_survives_a_source_change(client, owner):
    memory, chat, answer, _ = await scenario(client, owner)
    alternative = await fact(client, "The compatibility spec also supports Flask", slot="compatibility.spec")
    body = {"chat_id": str(chat.id), "message_id": answer.id, "quote": "Use Flask for the API.",
            "answer_fingerprint": digest(answer.content), "support_sets": [[{"id": memory["id"], "version": 1}], [{"id": alternative["id"], "version": 1}]]}
    assert (await client.post("/api/context/support", json=body)).status_code == 201
    change_id = await correct(client, memory)
    report = (await client.get(f"/api/context/changes/{change_id}")).json()
    row = next(item for item in report["items"] if item["kind"] == "answer")
    assert row["classification"] == "supported" and row["unknown_dependencies"]
    assert row["claims"][0]["independent_support_survives"]
    stored = await ClaimSupport.find_one({"chat_id": str(chat.id)})
    assert "Flask" not in json.dumps(stored.model_dump(mode="json"))  # offsets and references only


async def test_joint_support_is_invalidated_and_untracked_receipts_remain_uncertain(client, owner):
    memory, chat, answer, _ = await scenario(client, owner)
    other = await fact(client, "The database uses PostgreSQL")
    await client.post("/api/context/support", json={"chat_id": str(chat.id), "message_id": answer.id, "quote": "Use Flask for the API.",
        "answer_fingerprint": digest(answer.content), "support_sets": [[{"id": memory["id"], "version": 1}, {"id": other["id"], "version": 1}]]})
    change_id = await correct(client, memory)
    report = (await client.get(f"/api/context/changes/{change_id}")).json()
    assert next(r for r in report["items"] if r["kind"] == "answer")["classification"] == "review"
    await ClaimSupport.find({"chat_id": str(chat.id)}).delete()
    report = (await client.get(f"/api/context/changes/{change_id}")).json()
    assert next(r for r in report["items"] if r["kind"] == "answer")["classification"] == "possible"


async def test_claim_quote_scope_and_source_version_are_checked(client, owner):
    memory, chat, answer, _ = await scenario(client, owner)
    base = {"chat_id": str(chat.id), "message_id": answer.id, "quote": "Not in this answer", "answer_fingerprint": digest(answer.content),
            "support_sets": [[{"id": memory["id"], "version": 1}]]}
    assert (await client.post("/api/context/support", json=base)).status_code == 422
    assert (await client.post("/api/context/support", json={**base, "quote": "Use Flask", "support_sets": [[{"id": memory["id"], "version": 99}]]})).status_code == 409
    foreign = Memory(user_id="another-owner", fact="Never expose this", provenance="user"); await foreign.insert()
    response = await client.post("/api/context/support", json={**base, "quote": "Use Flask", "support_sets": [[reference(foreign)]]})
    assert response.status_code == 409 and "Never expose" not in response.text


async def test_task_repair_inherits_evidence_preserves_schedule_and_is_idempotent(client, owner):
    memory, _, _, task = await scenario(client, owner)
    assert task["evidence_refs"] == [{"id": memory["id"], "version": 1}]
    change_id = await correct(client, memory)
    prepared = await replay(client, change_id, "task", task["id"])
    assert prepared["evidence"][0]["version"] == 2 and prepared["model_calls"] == 0
    payload = {"title": "Build the FastAPI API", "notes": "Keep the database independent"}
    assert (await client.post(f"/api/context/replays/{prepared['id']}/apply", json=payload)).status_code == 200
    repeated = await client.post(f"/api/context/replays/{prepared['id']}/apply", json=payload)
    assert repeated.json()["already_applied"]
    stored = await Commitment.get(task["id"])
    assert stored.title == payload["title"] and stored.version == 2 and stored.status == "pending"
    assert stored.due_at == datetime(2026, 12, 1, 12) and stored.evidence_refs[0]["version"] == 2
    health = (await client.get("/api/continuity/tasks")).json()["tasks"][0]
    assert health["context_health"] == "current"


async def test_answer_repair_is_separate_and_resolves_only_current_allowed_evidence(client, owner):
    memory, chat, answer, _ = await scenario(client, owner)
    change_id = await correct(client, memory)
    prepared = await replay(client, change_id, "answer", f"{chat.id}:{answer.id}")
    assert (await client.post(f"/api/context/replays/{prepared['id']}/apply", json={})).status_code == 200
    data = (await client.get(f"/api/chat/{chat.id}")).json()["chat"]["messages"][-1]
    assert data["content"] == answer.content
    assert data["context_reviews"][0]["evidence"][0]["fact"] == "We use FastAPI for the API"
    await client.delete(f"/api/memory/{memory['id']}")
    data = (await client.get(f"/api/chat/{chat.id}")).json()["chat"]["messages"][-1]
    assert data["context_reviews"][0]["evidence"] == [] and data["context_reviews"][0]["state"] == "evidence_unavailable"
    for model in (ContextChange, ContextReplay, AnswerReview):
        for record in await model.find({"user_id": str(owner.id)}).to_list():
            assert "FastAPI" not in json.dumps(record.model_dump(mode="json"))


async def test_delayed_replay_cannot_restore_revoked_evidence(client, owner):
    memory, chat, answer, _ = await scenario(client, owner)
    change_id = await correct(client, memory)
    prepared = await replay(client, change_id, "answer", f"{chat.id}:{answer.id}")
    await client.delete(f"/api/memory/{memory['id']}")
    response = await client.post(f"/api/context/replays/{prepared['id']}/apply", json={})
    assert response.status_code == 409 and await Memory.get(memory["id"]) is None
    assert await AnswerReview.find({"user_id": str(owner.id)}).count() == 0


@pytest.mark.parametrize("mutation", ["expire", "target", "privacy", "archive"])
async def test_replay_revalidates_expiry_targets_privacy_and_projects(client, owner, mutation):
    project = Project(user_id=str(owner.id), name="API research"); await project.insert()
    memory, chat, answer, task = await scenario(client, owner, str(project.id))
    change_id = await correct(client, memory)
    prepared = await replay(client, change_id, "task", task["id"])
    if mutation == "expire":
        await (await Memory.get(memory["id"])).set({"expires_at": datetime.utcnow() - timedelta(seconds=1)})
    elif mutation == "target":
        await (await Commitment.get(task["id"])).set({"title": "Another owner edit", "version": 2})
    elif mutation == "privacy":
        await client.put("/api/users/preferences", json={"memory_enabled": False})
        await client.put("/api/users/preferences", json={"memory_enabled": True})
    else:
        await client.delete(f"/api/projects/{project.id}")
    response = await client.post(f"/api/context/replays/{prepared['id']}/apply", json={"title": "Build FastAPI"})
    assert response.status_code in {404, 409}, response.text
    assert (await Commitment.get(task["id"])).title != "Build FastAPI"


async def test_revocation_replay_can_add_a_warning_without_copying_removed_facts(client, owner):
    memory, chat, answer, _ = await scenario(client, owner)
    change_id = (await client.delete(f"/api/memory/{memory['id']}")).json()["change_id"]
    prepared = await replay(client, change_id, "answer", f"{chat.id}:{answer.id}")
    assert prepared["evidence"] == []
    assert (await client.post(f"/api/context/replays/{prepared['id']}/apply", json={})).status_code == 200
    assert await Memory.get(memory["id"]) is None


async def test_other_owners_cannot_read_or_apply_context_records(client, owner):
    foreign = ContextChange(user_id="another-owner", memory_id="0" * 24, before_version=1); await foreign.insert()
    assert (await client.get(f"/api/context/changes/{foreign.id}")).status_code == 404
    assert (await client.post("/api/context/replays", json={"change_id": str(foreign.id), "target_kind": "task", "target_id": "0" * 24})).status_code == 404
    assert not (await client.get("/api/context/changes")).json()["changes"]


async def test_recall_audit_uses_actual_budget_and_redacts_ineligible_sources(client, owner):
    await fact(client, "Python " * 100)
    await fact(client, "I use Python")
    await Memory(user_id=str(owner.id), fact="Expired Python detail", provenance="user", expires_at=datetime.utcnow()-timedelta(days=1)).insert()
    await Memory(user_id=str(owner.id), fact="Unconfirmed Python detail").insert()
    await Memory(user_id=str(owner.id), fact="Other project Python detail", project_id="other-project", provenance="user").insert()
    await Memory(user_id="another-owner", fact="Foreign Python detail", provenance="user").insert()
    result = (await client.post("/api/context/recall-audit", json={"query": "Python", "budget": 200, "limit": 20})).json()
    normal = await recall(str(owner.id), "Python", budget=200, limit=20)
    assert result["used"] == normal["used"] and result["context_chars"] <= 200
    assert result["counts"]["expired"] == result["counts"]["unconfirmed"] == result["counts"]["outside_scope"] == 1
    assert result["counts"]["budget_or_limit"] == 1
    assert all(value not in json.dumps(result) for value in ("Expired Python detail", "Unconfirmed Python detail", "Other project Python detail", "Foreign Python detail"))


async def test_decision_clarification_requires_real_eligible_conflicts_and_one_turn_choices(client, owner):
    first = await fact(client, "Use Flask for the backend")
    second = await fact(client, "Use FastAPI for the backend")
    await MemoryEdge(user_id=str(owner.id), source_id=first["id"], target_id=second["id"], relation="contradicts").insert()
    body = {"query": "Which backend should I use?"}
    result = (await client.post("/api/context/clarify", json=body)).json()
    assert result["needs_clarification"] and len(result["alternatives"]) == 2
    resolved = (await client.post("/api/context/clarify", json={**body, "choices": [{"id": second["id"], "version": 1}]})).json()
    assert not resolved["needs_clarification"] and first["id"] in resolved["exclude_ids"]
    assert not (await client.post("/api/context/clarify", json={"query": "List earlier backend decisions"})).json()["needs_clarification"]
    assert (await client.post("/api/context/clarify", json={**body, "choices": [{"id": second["id"], "version": 99}]})).status_code == 409


async def test_stable_slot_scope_conflicts_ignore_expired_and_unconfirmed_values(client, owner):
    project = Project(user_id=str(owner.id), name="Research"); await project.insert()
    await fact(client, "We use Flask for the API", slot="architecture.backend")
    await fact(client, "We use FastAPI for the API", slot="architecture.backend", project_id=str(project.id))
    assert not (await client.post("/api/context/clarify", json={"query": "Which API should I build?"})).json()["needs_clarification"]
    assert (await client.post("/api/context/clarify", json={"query": "Which API should I build?", "project_id": str(project.id)})).json()["needs_clarification"]


async def test_websocket_clarifies_without_a_model_call_then_uses_selected_evidence(client, owner, monkeypatch):
    from app.api.routes import chat as chat_routes
    first = await fact(client, "Use Flask for the backend")
    second = await fact(client, "Use FastAPI for the backend")
    await MemoryEdge(user_id=str(owner.id), source_id=first["id"], target_id=second["id"], relation="contradicts").insert()
    chat = Chat(user_id=str(owner.id)); await chat.insert()
    prompts = []
    async def fake(content, history, system, *args):
        prompts.append(system)
        yield "Use the chosen backend."
    monkeypatch.setattr(chat_routes, "stream_ai_response", fake)
    with TestClient(app).websocket_connect(f"/api/chat/ws/{chat.id}") as socket:
        socket.send_json({"type": "authenticate", "token": create_access_token(str(owner.id))})
        socket.send_json({"type": "message", "content": "Which backend should I use?"})
        packet = socket.receive_json()
        while packet["type"] not in {"done", "error"}: packet = socket.receive_json()
        assert packet["type"] == "done" and packet["clarification"] and not prompts
        assert "Flask" not in json.dumps(packet["memory_receipt"])
        socket.send_json({"type": "message", "content": "Which backend should I use?", "context_choices": [{"id": second["id"], "version": 1}]})
        packet = socket.receive_json()
        while packet["type"] not in {"done", "error"}: packet = socket.receive_json()
        assert packet["type"] == "done" and not packet["clarification"]
    assert "FastAPI" in prompts[0] and "Flask" not in prompts[0]
    stored = await Chat.get(chat.id)
    assert "Flask" not in json.dumps(stored.messages[1].model_dump(mode="json"))


async def test_memory_erasure_clears_research_artifacts_and_delayed_reviews(client, owner):
    memory, chat, answer, _ = await scenario(client, owner)
    change_id = await correct(client, memory)
    prepared = await replay(client, change_id, "answer", f"{chat.id}:{answer.id}")
    await client.post(f"/api/context/replays/{prepared['id']}/apply", json={})
    assert (await client.delete("/api/memory/")).status_code == 200
    for model in (ContextChange, ClaimSupport, ContextReplay, AnswerReview):
        assert await model.find({"user_id": str(owner.id)}).count() == 0
    assert (await client.post(f"/api/context/replays/{prepared['id']}/apply", json={})).status_code == 404


async def test_answer_is_not_persisted_if_memory_is_revoked_during_generation(client, owner, monkeypatch):
    from app.api.routes import chat as chat_routes
    from app.api.routes.memory import _delete_memory
    memory = await fact(client, "Use Flask for the backend")
    chat = Chat(user_id=str(owner.id)); await chat.insert()
    async def fake(*args):
        async with memory_write_guard(str(owner.id)):
            await _delete_memory(memory["id"], owner)
        yield "An answer based on an obsolete source."
    monkeypatch.setattr(chat_routes, "stream_ai_response", fake)
    with TestClient(app).websocket_connect(f"/api/chat/ws/{chat.id}") as socket:
        socket.send_json({"type": "authenticate", "token": create_access_token(str(owner.id))})
        socket.send_json({"type": "message", "content": "Tell me the backend"})
        packet = socket.receive_json()
        while packet["type"] not in {"done", "error"}: packet = socket.receive_json()
        assert packet["type"] == "error" and "context changed" in packet["message"]
    stored = await Chat.get(chat.id)
    assert len(stored.messages) == 1 and stored.messages[0].role == "user"
    assert await Memory.get(memory["id"]) is None


async def test_account_erasure_removes_context_records_and_revokes_pending_apply(client, owner):
    memory, chat, answer, _ = await scenario(client, owner)
    change_id = await correct(client, memory)
    prepared = await replay(client, change_id, "answer", f"{chat.id}:{answer.id}")
    response = await client.request("DELETE", "/api/account/data", json={"confirmation": "DELETE MY DATA"})
    assert response.status_code == 200
    for model in (ContextChange, ContextReplay, ClaimSupport, AnswerReview):
        assert await model.find({"user_id": str(owner.id)}).count() == 0
    assert (await client.post(f"/api/context/replays/{prepared['id']}/apply", json={})).status_code == 401


async def test_context_workflow_accepts_real_application_jwt_and_rejects_another_account(client):
    app.dependency_overrides.clear()
    credentials = {"name": "Context Tester", "email": "context-tester@example.com", "password": "strong-context-test-password"}
    assert (await client.post("/api/auth/register", json=credentials)).status_code == 201
    login = await client.post("/api/auth/login", json={"email": credentials["email"], "password": credentials["password"]})
    token = login.json()["access_token"]
    headers = {"Authorization": "Bearer " + token}
    created = await client.post("/api/memory/", headers=headers, json={"fact": "The backend uses Flask"})
    memory = created.json()["memory"]
    body = {"memory_id": memory["id"], "expected_version": 1, "fact": "The backend uses FastAPI", "action": "correct"}
    preview = (await client.post("/api/context/preview", headers=headers, json=body)).json()
    updated = await client.post("/api/context/changes", headers=headers, json={**body, "expected_context_revision": preview["context_revision"], "preview_token": preview["preview_token"]})
    assert updated.status_code == 201, updated.text
    audit = await client.post("/api/context/recall-audit", headers=headers, json={"query": "backend"})
    assert audit.status_code == 200 and audit.json()["used"][0]["fact"] == "The backend uses FastAPI"
    foreign = ContextChange(user_id="another-owner", memory_id=memory["id"], before_version=1); await foreign.insert()
    assert (await client.get(f"/api/context/changes/{foreign.id}", headers=headers)).status_code == 404


async def test_archived_change_pagination_advances_past_hidden_rows(client, owner):
    project = Project(user_id=str(owner.id), name="Archived", is_active=False); await project.insert()
    change = ContextChange(user_id=str(owner.id), memory_id="a" * 24, before_version=1, project_id=str(project.id)); await change.insert()
    result = (await client.get("/api/context/changes", params={"limit": 1})).json()
    assert result["changes"] == [] and result["next_offset"] == 1 and not result["has_more"]


async def test_clarification_question_is_not_treated_as_a_completed_answer(client, owner):
    message = Message(role="assistant", content="Which context?", clarification={"alternatives": []})
    chat = Chat(user_id=str(owner.id), messages=[message]); await chat.insert()
    assert (await client.get(f"/api/context/answers/{chat.id}/{message.id}")).status_code == 404
    response = await client.post("/api/continuity/tasks", json={"title": "Use this answer", "source_chat_id": str(chat.id), "source_message_id": message.id})
    assert response.status_code == 404
