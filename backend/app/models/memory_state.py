from datetime import datetime
from beanie import Document, Indexed
from pydantic import Field


class MemoryState(Document):
    """Per-owner mutation lease and generation; stores no personal fact text."""
    user_id: Indexed(str, unique=True)
    epoch: int = 0
    lease_token: str = ""
    lease_until: datetime = Field(default_factory=lambda: datetime(1970, 1, 1))

    class Settings:
        name = "memory_states"
