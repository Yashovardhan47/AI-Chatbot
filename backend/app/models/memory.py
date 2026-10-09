from beanie import Document, Indexed
from pydantic import Field
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


class Memory(Document):
    user_id:        Indexed(str)
    fact:           str
    category:       MemoryCategory = MemoryCategory.other
    confidence:     int = 90
    source_chat_id: Optional[str] = None
    confirmed:      bool = False
    active:         bool = True
    tags:           List[str] = []
    created_at:     datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "memories"
