"""Reference-only research workflow records; no copied memory fact text."""
from datetime import datetime
from beanie import Document, Indexed
from pydantic import Field
from pymongo import IndexModel


class ContextChange(Document):
    user_id: Indexed(str)
    memory_id: str
    project_id: str | None = None
    before_version: int
    after_version: int | None = None
    action: str = "corrected"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "context_changes"
        indexes = [IndexModel([("user_id", 1), ("created_at", -1)])]


class ClaimSupport(Document):
    user_id: Indexed(str)
    chat_id: str
    message_id: str
    start: int
    end: int
    answer_fingerprint: str
    support_sets: list[list[dict]] = Field(default_factory=list)
    memory_ids: list[str] = Field(default_factory=list)
    version: int = 1
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "claim_support"
        indexes = [IndexModel([("user_id", 1), ("chat_id", 1), ("message_id", 1), ("start", 1), ("end", 1)], unique=True),
                   IndexModel([("user_id", 1), ("memory_ids", 1)])]


class ContextReplay(Document):
    user_id: Indexed(str)
    change_id: str
    project_id: str | None = None
    target_kind: str
    target_id: str
    target_fingerprint: str
    context_revision: int
    auth_version: int
    references: list[dict] = Field(default_factory=list)
    status: str = "draft"
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "context_replays"
        indexes = [IndexModel([("expires_at", 1)], expireAfterSeconds=0)]


class AnswerReview(Document):
    user_id: Indexed(str)
    change_id: str
    chat_id: str
    message_id: str
    answer_fingerprint: str
    references: list[dict] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "answer_reviews"
        indexes = [IndexModel([("user_id", 1), ("change_id", 1), ("chat_id", 1), ("message_id", 1)], unique=True)]
