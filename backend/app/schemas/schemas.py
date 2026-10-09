from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List


# Auth — NO password length restriction anywhere
class RegisterRequest(BaseModel):
    name:     str = Field(min_length=2, max_length=80)
    email:    EmailStr
    password: str


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str


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


# Chat
class AttachmentIn(BaseModel):
    name:         str
    url:          str
    file_type:    str
    text_content: Optional[str] = None
