from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.logger import logger
from app.db.database import connect_db, connect_redis, disconnect_db
from app.api.routes.auth     import router as auth_router
from app.api.routes.chat     import router as chat_router
from app.api.routes.other    import file_router, user_router
from app.api.routes.memory   import router as memory_router
from app.api.routes.projects import router as project_router
from app.api.routes.agents   import router as agents_router
from app.api.routes.rag      import router as rag_router
from app.api.routes.knowledge import router as knowledge_router
from app.api.routes.graph import router as graph_router
from app.api.routes.continuity import router as continuity_router
from app.api.routes.account import router as account_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_runtime()
    logger.info("Starting NeuroFusion AI...")
    await connect_db()
    await connect_redis()
    logger.info("Ready at http://localhost:8000")
    logger.info("API Docs at http://localhost:8000/api/docs")
    try:
        yield
    finally:
        await disconnect_db()
        logger.info("Shutting down...")


app = FastAPI(
    title="NeuroSense AI Workspace", version="5.0.0",
    description="Personal AI assistant with grounded, versioned long-term NeuroSense memory",
    lifespan=lifespan, docs_url="/api/docs", redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(memory_router)
app.include_router(file_router)
app.include_router(user_router)
app.include_router(project_router)
app.include_router(agents_router)
app.include_router(rag_router)
app.include_router(knowledge_router)
app.include_router(graph_router)
app.include_router(continuity_router)
app.include_router(account_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": "5.0.0", "memory": "NeuroSense"}
