"""Pydantic schemas for org management endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class OrgWithRole(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    role: str


class MemberRead(BaseModel):
    user_id: str
    email: str
    role: str
    joined_at: datetime


class InvitePreview(BaseModel):
    org_name: str
    org_slug: str
    invited_by_email: Optional[str]
    email: str
    role: str
    expires_at: datetime


class InviteRead(BaseModel):
    id: str
    org_id: str
    email: str
    role: str
    invited_by: Optional[str]
    expires_at: datetime
    accepted: bool
    created_at: datetime


class InviteMemberRequest(BaseModel):
    email: str
    role: str = "member"  # "member" | "admin" only


class UpdateRoleRequest(BaseModel):
    role: str  # "member" | "admin" — cannot set "owner" via this endpoint


class TransferOwnershipRequest(BaseModel):
    new_owner_user_id: str


class UpdateOrgRequest(BaseModel):
    name: str
