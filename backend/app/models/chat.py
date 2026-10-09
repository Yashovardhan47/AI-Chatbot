from beanie import Document
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class Attachment(BaseModel):
    name:      str
    url:       str
    file_type: str
    public_id: Optional[str] = None


class Message(BaseModel):
    role:        str
    content:     str
    confidence:  Optional[int]  = None
    reasoning:   Optional[str]  = None
    sources:     Optional[str]  = None
    memory_note: Optional[str]  = None
    attachments: List[Attachment] = Field(default_factory=list)
    tokens_used: int = 0
    created_at:  datetime = Field(default_factory=datetime.utcnow)


class Chat(Document):
    user_id:      str
    project_id:   Optional[str]  = None
    session_date: Optional[str]  = None   # "2025-06-30" — daily session date
    is_daily:     bool           = False
    title:        str            = "New Conversation"
    mode:         str            = "auto"
    messages:     List[Message]  = Field(default_factory=list)
    is_active:    bool           = True
    pinned:       bool           = False
    starred:      bool           = False
    tags:         List[str]      = Field(default_factory=list)
    total_tokens: int            = 0
    created_at:   datetime       = Field(default_factory=datetime.utcnow)
    updated_at:   datetime       = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "chats"
