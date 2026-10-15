from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List


# Passwords are pre-hashed before bcrypt; limits also bound request work.
class RegisterRequest(BaseModel):
    name:     str = Field(min_length=2, max_length=80)
    email:    EmailStr
    password: str = Field(min_length=8, max_length=1024)


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=1, max_length=1024)


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=1, max_length=10000)


class GoogleLinkRequest(GoogleAuthRequest):
    current_password: str = Field(min_length=1, max_length=1024)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=1024)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str = Field(min_length=8, max_length=1024)


# User
class UpdateProfileRequest(BaseModel):
    name:   Optional[str] = Field(None, min_length=2, max_length=80)
    avatar: Optional[str] = None


class UpdatePreferencesRequest(BaseModel):
    mode:        Optional[str]  = None
    web_search:  Optional[bool] = None
    tts_enabled: Optional[bool] = None
    theme:       Optional[str]  = None
    language:    Optional[str]  = None
    memory_enabled: Optional[bool] = None
    memory_auto_capture: Optional[bool] = None
    memory_review_required: Optional[bool] = None
    session_memory_enabled: Optional[bool] = None
    knowledge_enabled: Optional[bool] = None
    reminder_emails: Optional[bool] = None
    timezone: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    workspace_goal: Optional[str] = Field(None, max_length=160)


# Chat
class AttachmentIn(BaseModel):
    name:         str
    url:          str
    file_type:    str
    text_content: Optional[str] = None
