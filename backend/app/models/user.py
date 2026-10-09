from beanie import Document, Indexed
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class Role(str, Enum):
    user  = "user"
    admin = "admin"


class Provider(str, Enum):
    local  = "local"
    google = "google"


# Must be BaseModel (embedded), NOT Document
class Preferences(BaseModel):
    mode:        str  = "auto"
    web_search:  bool = False
    tts_enabled: bool = False
    theme:       str  = "dark"
    language:    str  = "en"


class Stats(BaseModel):
    total_messages: int = 0
    total_sessions: int = 0
    files_uploaded: int = 0
    tokens_used:    int = 0


class User(Document):
    name:          str
    email:         Indexed(EmailStr, unique=True)
    password:      Optional[str]      = None
    avatar:        str                = ""
    provider:      Provider           = Provider.local
    provider_id:   Optional[str]      = None
    role:          Role               = Role.user
    is_verified:   bool               = False
    is_active:     bool               = True
    verify_token:  Optional[str]      = None
    reset_token:   Optional[str]      = None
    reset_expires: Optional[datetime] = None
    last_login:    Optional[datetime] = None
    preferences:   Preferences        = Field(default_factory=Preferences)
    stats:         Stats              = Field(default_factory=Stats)
    created_at:    datetime           = Field(default_factory=datetime.utcnow)
    updated_at:    datetime           = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "users"

    def safe_dict(self) -> dict:
        d = self.model_dump(exclude={"password", "verify_token", "reset_token"})
        d["id"] = str(self.id)
        return d
