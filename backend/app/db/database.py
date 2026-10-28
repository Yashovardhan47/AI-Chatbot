from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.core.config import settings
from app.models.user    import User
from app.models.chat    import Chat
from app.models.memory  import Memory
from app.models.memory_state import MemoryState
from app.models.context_lab import ContextChange, ClaimSupport, ContextReplay, AnswerReview
from app.models.project import Project
from app.models.workspace import (KnowledgeDocument, MemoryEdge, MemoryFeedback, SessionDigest,
                                  Commitment, Notification, AuthSession, TokenRevocation, MemoryProposal)
import redis.asyncio as aioredis
from app.core.logger import logger

_redis_client = None
_mongo_client = None
DOCUMENT_MODELS = [User, Chat, Memory, MemoryState, Project, KnowledgeDocument, MemoryEdge,
                   MemoryFeedback, SessionDigest, Commitment, Notification, AuthSession, TokenRevocation, MemoryProposal,
                   ContextChange, ClaimSupport, ContextReplay, AnswerReview]


async def connect_db():
    global _mongo_client
    try:
        client = AsyncIOMotorClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)
        _mongo_client = client
        await client.admin.command("ping")
        await init_beanie(
            database=client[settings.DB_NAME],
            document_models=DOCUMENT_MODELS,
        )
        logger.info("MongoDB connected")
    except Exception:
        logger.error("MongoDB connection failed")
        logger.error("Make sure MongoDB is running: run 'mongod' in a terminal")
        raise


async def connect_redis():
    global _redis_client
    try:
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2)
        await _redis_client.ping()
        logger.info("Redis connected")
    except Exception:
        logger.warning("Redis not available — running without the optional revocation cache")
        _redis_client = None


def get_redis():
    return _redis_client


async def database_ready():
    if _mongo_client is None:
        return False
    try:
        await _mongo_client.admin.command("ping")
        return True
    except Exception:
        return False


async def disconnect_db():
    global _mongo_client, _redis_client
    if _redis_client:
        await _redis_client.aclose()
        _redis_client = None
    if _mongo_client:
        _mongo_client.close()
        _mongo_client = None
