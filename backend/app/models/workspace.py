from datetime import datetime
from typing import Optional
from uuid import uuid4
from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import IndexModel


class EvidenceChunk(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    ordinal: int
    text: str
    page: Optional[int] = None
    embedding: list[float] = Field(default_factory=list)
    embedding_model: str = ""


class KnowledgeDocument(Document):
    user_id: Indexed(str)
    project_id: Optional[str] = None
    title: str
    filename: str = ""
    media_type: str = "text/plain"
    checksum: str
    original_base64: str = ""
    text_chars: int = 0
    chunks: list[EvidenceChunk] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    class Settings:
        name = "knowledge_documents"
        indexes = [IndexModel([("user_id", 1), ("project_id", 1), ("checksum", 1)], unique=True)]


class MemoryEdge(Document):
    user_id: Indexed(str)
    source_id: str
    target_id: str
    relation: str = "related_to"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    class Settings:
        name = "memory_edges"
        indexes = [IndexModel([("user_id", 1), ("source_id", 1), ("target_id", 1), ("relation", 1)], unique=True)]


class MemoryFeedback(Document):
    user_id: Indexed(str)
    chat_id: str
    message_id: str
    rating: int
    references: list[dict] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    class Settings:
        name = "memory_feedback"
        indexes = [IndexModel([("user_id", 1), ("chat_id", 1), ("message_id", 1)], unique=True)]


class SessionDigest(Document):
    user_id: Indexed(str)
    chat_id: str
    project_id: Optional[str] = None
    title: str
    quotes: list[dict] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    class Settings:
        name = "session_digests"
        indexes = [IndexModel([("user_id", 1), ("chat_id", 1)], unique=True)]


class Commitment(Document):
    user_id: Indexed(str)
    project_id: Optional[str] = None
    title: str
    notes: str = ""
    source_chat_id: Optional[str] = None
    source_memory_id: Optional[str] = None
    status: str = "pending"
    due_at: Optional[datetime] = None
    timezone: str = "Asia/Kolkata"
    recurrence: str = "none"
    version: int = 1
    reminded_version: int = 0
    lease_until: datetime = Field(default_factory=lambda: datetime(1970, 1, 1))
    lease_token: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    class Settings:
        name = "commitments"
        indexes = [IndexModel([("status", 1), ("due_at", 1), ("lease_until", 1)]), IndexModel([("user_id", 1), ("updated_at", -1)])]


class Notification(Document):
    user_id: Indexed(str)
    dedupe_key: Indexed(str, unique=True)
    task_id: str
    title: str
    message: str
    read: bool = False
    email_status: str = "disabled"
    attempts: int = 0
    next_attempt_at: datetime = Field(default_factory=datetime.utcnow)
    lease_until: datetime = Field(default_factory=lambda: datetime(1970, 1, 1))
    lease_token: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    class Settings:
        name = "notifications"
        indexes = [IndexModel([("user_id", 1), ("read", 1), ("created_at", -1)])]


class AuthSession(Document):
    user_id: Indexed(str)
    token_hash: Indexed(str, unique=True)
    revoked: bool = False
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    class Settings:
        name = "auth_sessions"
        indexes = [IndexModel([("expires_at", 1)], expireAfterSeconds=0)]


class TokenRevocation(Document):
    token_hash: Indexed(str, unique=True)
    expires_at: datetime
    class Settings:
        name = "token_revocations"
        indexes = [IndexModel([("expires_at", 1)], expireAfterSeconds=0)]
