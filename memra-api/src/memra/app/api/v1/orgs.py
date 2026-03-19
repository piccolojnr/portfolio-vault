"""
Orgs Router
===========

Endpoints for org membership management.

Prefix: /orgs (mounted under /api/v1)

Route ordering: literal /invites/{token} routes are registered BEFORE /{org_id}/...
routes to prevent FastAPI treating "invites" as a UUID.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from memra.app.core.db import get_db_conn
from memra.app.core.dependencies import get_current_user, get_live_settings, require_role
from memra.domain.models.org import (
    CorpusRead,
    InviteMemberRequest,
    InvitePreview,
    InviteRead,
    MemberRead,
    OrgWithRole,
    TransferOwnershipRequest,
    UpdateOrgRequest,
    UpdateRoleRequest,
)
from memra.domain.services import org_service

router = APIRouter(prefix="/orgs", tags=["orgs"])

DBSession = Annotated[AsyncSession, Depends(get_db_conn)]


# ── List user's orgs ───────────────────────────────────────────────────────────

@router.get("", response_model=list[OrgWithRole])
async def list_orgs(
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    return await org_service.get_user_orgs(session, current_user["sub"])


# ── Invite preview + accept (literal paths — must be before /{org_id}) ─────────

@router.get("/invites/{token}", response_model=InvitePreview)
async def preview_invite(token: str, session: DBSession):
    """Public endpoint — no auth required."""
    try:
        data = await org_service.get_invite_preview(session, token)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return InvitePreview(**data)


@router.post("/invites/{token}/accept", response_model=MemberRead, status_code=201)
async def accept_invite(
    token: str,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    try:
        member = await org_service.accept_invite(session, token, current_user["sub"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Resolve email for the response
    from sqlmodel import select
    from memra.infrastructure.db.models.user import User
    user = (
        await session.execute(select(User).where(User.id == member.user_id))
    ).scalars().first()

    return MemberRead(
        user_id=str(member.user_id),
        email=user.email if user else "",
        role=member.role,
        joined_at=member.joined_at,
    )


# ── Per-org routes (/{org_id}/...) ─────────────────────────────────────────────

def _parse_org_id(org_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(org_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid org_id")


def _assert_org_scope(current_user: dict, org_id: uuid.UUID) -> None:
    """Verify token org_id matches path org_id (prevents cross-org access)."""
    token_org = current_user.get("org_id", "")
    if token_org != str(org_id):
        raise HTTPException(status_code=403, detail="Token is not scoped to this organisation")


@router.patch("/{org_id}", response_model=OrgWithRole)
async def update_org(
    org_id: str,
    body: UpdateOrgRequest,
    session: DBSession,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    from sqlmodel import select
    from memra.infrastructure.db.models.org import Organisation
    from memra.infrastructure.db.models.base import utcnow

    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)

    org = (
        await session.execute(select(Organisation).where(Organisation.id == oid))
    ).scalars().first()
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation not found")

    org.name = body.name
    org.updated_at = utcnow()
    session.add(org)
    await session.commit()
    await session.refresh(org)

    return OrgWithRole(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        plan=org.plan,
        role=current_user.get("role", "member"),
    )


@router.get("/{org_id}/members", response_model=list[MemberRead])
async def list_members(
    org_id: str,
    session: DBSession,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    try:
        members = await org_service.list_members(session, oid, current_user["sub"])
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return [MemberRead(**m) for m in members]


@router.get("/{org_id}/invites", response_model=list[InviteRead])
async def list_invites(
    org_id: str,
    session: DBSession,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    invites = await org_service.list_invites(session, oid, current_user["sub"])
    return [
        InviteRead(
            id=str(i.id),
            org_id=str(i.org_id),
            email=i.email,
            role=i.role,
            invited_by=str(i.invited_by) if i.invited_by else None,
            expires_at=i.expires_at,
            accepted=i.accepted,
            created_at=i.created_at,
        )
        for i in invites
    ]


@router.delete("/{org_id}/invites/{invite_id}", status_code=204)
async def revoke_invite(
    org_id: str,
    invite_id: str,
    session: DBSession,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    try:
        iid = uuid.UUID(invite_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invite_id")
    try:
        await org_service.revoke_invite(session, oid, iid, current_user["sub"])
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{org_id}/invites", response_model=InviteRead, status_code=201)
async def create_invite(
    org_id: str,
    body: InviteMemberRequest,
    session: DBSession,
    current_user: dict = Depends(require_role("owner", "admin")),
    settings=Depends(get_live_settings),
):
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    try:
        invite = await org_service.invite_member(
            session, oid, current_user["sub"], body.email, body.role, settings
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return InviteRead(
        id=str(invite.id),
        org_id=str(invite.org_id),
        email=invite.email,
        role=invite.role,
        invited_by=str(invite.invited_by) if invite.invited_by else None,
        expires_at=invite.expires_at,
        accepted=invite.accepted,
        created_at=invite.created_at,
    )


@router.delete("/{org_id}/members/{user_id}", status_code=204)
async def remove_member(
    org_id: str,
    user_id: str,
    session: DBSession,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    try:
        await org_service.remove_member(session, oid, current_user["sub"], user_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{org_id}/members/{user_id}/role", response_model=MemberRead)
async def update_member_role(
    org_id: str,
    user_id: str,
    body: UpdateRoleRequest,
    session: DBSession,
    current_user: dict = Depends(require_role("owner")),
):
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    try:
        member = await org_service.update_member_role(
            session, oid, current_user["sub"], user_id, body.role
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Resolve email
    from sqlmodel import select
    from memra.infrastructure.db.models.user import User
    user = (
        await session.execute(select(User).where(User.id == member.user_id))
    ).scalars().first()
    return MemberRead(
        user_id=str(member.user_id),
        email=user.email if user else "",
        role=member.role,
        joined_at=member.joined_at,
    )


@router.get("/{org_id}/corpora", response_model=list[CorpusRead])
async def list_corpora(
    org_id: str,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    corpora = await org_service.list_corpora(session, oid)
    return [
        CorpusRead(id=str(c.id), name=c.name, corpus_key=c.corpus_key, created_at=c.created_at)
        for c in corpora
    ]


class SetActiveCorpusRequest(BaseModel):
    corpus_id: str


@router.get("/{org_id}/active-corpus")
async def get_active_corpus(
    org_id: str,
    session: DBSession,
    current_user: dict = Depends(get_current_user),
):
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    try:
        corpus = await org_service.get_active_corpus(session, oid)
        return {"corpus": CorpusRead(id=str(corpus.id), name=corpus.name, corpus_key=corpus.corpus_key, created_at=corpus.created_at)}
    except LookupError:
        return {"corpus": None}


@router.post("/{org_id}/active-corpus")
async def set_active_corpus(
    org_id: str,
    body: SetActiveCorpusRequest,
    session: DBSession,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    try:
        corpus_id = uuid.UUID(body.corpus_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid corpus_id")
    try:
        corpus = await org_service.set_active_corpus(session, oid, corpus_id, current_user["sub"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"corpus": CorpusRead(id=str(corpus.id), name=corpus.name, corpus_key=corpus.corpus_key, created_at=corpus.created_at)}


class SystemPromptUpdate(BaseModel):
    system_prompt: str


@router.get("/{org_id}/system-prompt")
async def get_org_system_prompt(
    org_id: str,
    session: DBSession,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    from memra.domain.services.settings_db import load_org_system_prompt
    from memra.domain.models.settings import DEFAULT_PERSONA_PROMPT
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    prompt = await load_org_system_prompt(session, org_id)
    return {"system_prompt": prompt if prompt is not None else DEFAULT_PERSONA_PROMPT}


@router.patch("/{org_id}/system-prompt")
async def set_org_system_prompt(
    org_id: str,
    body: SystemPromptUpdate,
    session: DBSession,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    from memra.domain.services.settings_db import save_org_system_prompt
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    await save_org_system_prompt(session, org_id, body.system_prompt)
    return {"system_prompt": body.system_prompt}


@router.post("/{org_id}/transfer-ownership", status_code=204)
async def transfer_ownership(
    org_id: str,
    body: TransferOwnershipRequest,
    session: DBSession,
    current_user: dict = Depends(require_role("owner")),
):
    oid = _parse_org_id(org_id)
    _assert_org_scope(current_user, oid)
    try:
        await org_service.transfer_ownership(
            session, oid, current_user["sub"], body.new_owner_user_id
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
