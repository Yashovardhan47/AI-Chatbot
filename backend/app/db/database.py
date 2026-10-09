from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.core.config import settings
from app.models.user    import User
from app.models.chat    import Chat
from app.models.memory  import Memory
from app.models.project import Project
import redis.asyncio as aioredis
from app.core.logger import logger

_redis_client = None


async def connect_db():
    try:
        client = AsyncIOMotorClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)
        await client.admin.command("ping")
        await init_beanie(
            database=client[settings.DB_NAME],
            document_models=[User, Chat, Memory, Project],
        )
        logger.info("MongoDB connected")
    except Exception as e:
        logger.error(f"MongoDB failed: {e}")
        logger.error("Make sure MongoDB is running: run 'mongod' in a terminal")
        raise


async def connect_redis():
    global _redis_client
    try:
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2)
        await _redis_client.ping()
        logger.info("Redis connected")
    except Exception as e:
        logger.warning(f"Redis not available ({e}) — running without it")
        _redis_client = None


def get_redis():
    return _redis_client
