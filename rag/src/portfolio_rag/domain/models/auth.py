"""Auth domain schemas — pure Pydantic, no SQLModel."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class RegisterRequest(BaseModel):
    email: str
    password: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class MagicLinkRequest(BaseModel):
    email: str
    redirect_url: str | None = None


class VerifyTokenRequest(BaseModel):
    token: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class SwitchOrgRequest(BaseModel):
    org_id: str


class OnboardingRequest(BaseModel):
    use_case: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    id: str
    email: str
    email_verified: bool
    onboarding_completed_at: Optional[datetime] = None
    created_at: datetime


class OrgRead(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    role: str


class MeResponse(BaseModel):
    user: UserRead
    org: OrgRead
