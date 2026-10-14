from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "NeuroFusion AI"
    DEBUG: bool = True
    SECRET_KEY: str = "neurofusion_dev_secret_key_change_in_production_abc123xyz"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    REFRESH_COOKIE_SAMESITE: str = "lax"

    MONGO_URI: str = "mongodb://localhost:27017"
    DB_NAME: str = "neurofusion"
    REDIS_URL: str = "redis://localhost:6379"

    ANTHROPIC_API_KEY: str = ""
    AI_PROVIDER: str = "auto"
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_CHAT_MODEL: str = "llama3.2"
    EMBEDDINGS_PROVIDER: str = "none"
    EMBEDDINGS_MODEL: str = "embeddinggemma"
    EMBEDDINGS_MIN_SIMILARITY: float = 0.45
    MAX_UPLOAD_BYTES: int = 5_000_000
    MAX_KNOWLEDGE_CHARS: int = 100_000
    MAX_DOCUMENTS_PER_USER: int = 100
    WORKSPACE_CONTEXT_CHARS: int = 12000
    REMINDER_POLL_SECONDS: int = 30
    # Rule extraction is free/offline. The optional extractor makes one extra
    # provider call for messages not handled by rules; quotes are validated.
    MEMORY_LLM_EXTRACTION: bool = False
    MEMORY_EXTRACTOR_MODEL: str = "claude-haiku-4-5"
    MEMORY_CONTEXT_CHARS: int = 6000
    MEMORY_MAX_RESULTS: int = 8
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    GOOGLE_CLIENT_ID: str = ""

    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False

    FRONTEND_URL: str = "http://localhost:5173"

    def validate_runtime(self):
        if not self.DEBUG and (len(self.SECRET_KEY) < 32 or self.SECRET_KEY.startswith("neurofusion_dev")):
            raise ValueError("Set a private SECRET_KEY of at least 32 characters for production")
        if self.AI_PROVIDER not in {"auto", "anthropic", "ollama"}:
            raise ValueError("AI_PROVIDER must be auto, anthropic or ollama")
        if self.EMBEDDINGS_PROVIDER not in {"none", "ollama"}:
            raise ValueError("EMBEDDINGS_PROVIDER must be none or ollama")
        if self.REFRESH_COOKIE_SAMESITE not in {"lax", "strict", "none"} or (self.REFRESH_COOKIE_SAMESITE == "none" and self.DEBUG):
            raise ValueError("Use lax/strict cookies locally; cross-site cookies require DEBUG=false and SameSite=none")

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
