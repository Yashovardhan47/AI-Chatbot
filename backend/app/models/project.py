from beanie import Document, Indexed
from pydantic import Field
from typing import Optional
from datetime import datetime


class Project(Document):
    user_id:     Indexed(str)
    name:        str
    description: str = ""
    icon:        str = "🚀"
    color:       str = "#534AB7"
    is_active:   bool = True
    chat_count:  int = 0
    created_at:  datetime = Field(default_factory=datetime.utcnow)
    updated_at:  datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "projects"
