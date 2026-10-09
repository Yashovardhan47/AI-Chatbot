import pytest_asyncio
import os
import asyncio
from uuid import uuid4
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from httpx import AsyncClient, ASGITransport
from mongomock_motor import AsyncMongoMockClient
from app.models.memory import Memory
from app.models.memory_state import MemoryState
from app.models.user import User
from app.models.chat import Chat
from app.models.project import Project
from app.main import app
from app.middleware.auth_dep import get_current_user
from app.core.config import settings


@pytest_asyncio.fixture
async def database(monkeypatch):
    # Never use the repository .env credentials, a live DB or paid AI in tests.
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "MEMORY_LLM_EXTRACTION", False)
    monkeypatch.setattr(settings, "SECRET_KEY", "neurosense-test-key-only")
    uri = os.environ.get("NEUROSENSE_TEST_MONGO_URI")
    mongo = AsyncIOMotorClient(uri) if uri else AsyncMongoMockClient()
    if uri:
        # TestClient's WebSocket portal runs a second event loop. Resolve the
        # active loop per operation in tests; production uses one server loop.
        mongo.get_io_loop = asyncio.get_running_loop
    database = mongo["neurosense_tests_" + uuid4().hex]
    await init_beanie(database=database,
                      document_models=[Memory, MemoryState, User, Chat, Project])
    if not uri:
        # mongomock-motor.create_indexes loses partialFilterExpression. Install
        # the actual index explicitly; real MongoDB uses the model definition.
        await database.memories.drop_index("memory_owner_scope_slot")
        await database.memories.create_index([("user_id", 1), ("project_id", 1), ("slot", 1)],
            name="memory_owner_scope_slot", unique=True, partialFilterExpression={"slot": {"$type": "string"}})
    yield
    await mongo.drop_database(database.name)
    if uri:
        mongo.close()
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def owner(database):
    user = User(name="Memory Owner", email="owner@example.com", is_verified=True)
    await user.insert()
    return user


@pytest_asyncio.fixture
async def client(owner):
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
