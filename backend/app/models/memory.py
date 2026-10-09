from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import IndexModel, ASCENDING, DESCENDING
from typing import Optional, List
from datetime import datetime
from enum import Enum


class MemoryCategory(str, Enum):
    personal   = "personal"
    skill      = "skill"
    preference = "preference"
    project    = "project"
    goal       = "goal"
    other      = "other"


class MemoryKind(str, Enum):
    semantic = "semantic"
    episodic = "episodic"
    procedural = "procedural"


class MemoryRevision(BaseModel):
    fact: str
    version: int
    valid_from: datetime
    valid_until: datetime
    source_chat_id: Optional[str] = None
    source_message_id: Optional[str] = None
    source_quote: str = ""


class Memory(Document):
    user_id:        Indexed(str)
    fact:           str
    category:       MemoryCategory = MemoryCategory.other
    confidence:     int = 90
    source_chat_id: Optional[str] = None
    confirmed:      bool = False
    active:         bool = True
    tags:           List[str] = Field(default_factory=list)
    created_at:     datetime = Field(default_factory=datetime.utcnow)
    # Defaults keep existing documents readable. Existing ungrounded memories
    # can be reviewed, but are excluded from automatic recall until confirmed.
    project_id: Optional[str] = None
    slot: Optional[str] = None
    kind: MemoryKind = MemoryKind.semantic
    source_message_id: Optional[str] = None
    source_quote: str = ""
    provenance: str = "legacy"
    pinned: bool = False
    importance: float = Field(default=0.6, ge=0, le=1)
    version: int = 1
    revisions: List[MemoryRevision] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    valid_from: datetime = Field(default_factory=datetime.utcnow)
    # BSON datetimes have millisecond precision; retain microsecond ordering
    # separately so two fast turns cannot complete out of order.
    observed_us: int = 0
    expires_at: Optional[datetime] = None

    class Settings:
        name = "memories"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("project_id", ASCENDING), ("slot", ASCENDING)],
                       unique=True, partialFilterExpression={"slot": {"$type": "string"}},
                       name="memory_owner_scope_slot"),
            IndexModel([("user_id", ASCENDING), ("active", ASCENDING), ("project_id", ASCENDING),
                        ("keywords", ASCENDING)], name="memory_recall"),
            IndexModel([("user_id", ASCENDING), ("updated_at", DESCENDING)], name="memory_timeline"),
        ]
