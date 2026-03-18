"""
Org Service
===========

Business logic for org membership management.

All functions take AsyncSession as first arg.
Raises:
  ValueError      — bad input or constraint violation
  LookupError     — entity not found
  PermissionError — actor lacks the required role
"""

from __future__ import annotations

import secrets
import uuid
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from portfolio_rag.infrastructure.db.models.base import utcnow
from portfolio_rag.infrastructure.db.models.org import (
    Organisation,
    OrganisationInvite,
    OrganisationMember,
)
from portfolio_rag.infrastructure.db.models.user import User
from portfolio_rag.app.core.security import hash_token
from portfolio_rag.domain.models.org import OrgWithRole


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_member(
    session: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> OrganisationMember | None:
    return (
        await session.execute(
            select(OrganisationMember).where(
                OrganisationMember.org_id == org_id,
                OrganisationMember.user_id == user_id,
            )
        )
    ).scalars().first()


async def _require_actor_role(
    session: AsyncSession,
    org_id: uuid.UUID,
    actor_user_id: str,
    *allowed_roles: str,
) -> OrganisationMember:
    """Return actor membership row or raise PermissionError."""
    member = await _get_member(session, org_id, uuid.UUID(actor_user_id))
    if member is None or member.role not in allowed_roles:
        raise PermissionError("Insufficient permissions for this action")
    return member


# ── Public API ─────────────────────────────────────────────────────────────────

async def get_user_orgs(
    session: AsyncSession, user_id: str
) -> list[OrgWithRole]:
    """Return all orgs the user belongs to, with their role in each."""
    uid = uuid.UUID(user_id)
    rows = (
        await session.execute(
            select(OrganisationMember, Organisation)
            .join(Organisation, Organisation.id == OrganisationMember.org_id)
            .where(OrganisationMember.user_id == uid)
        )
    ).all()
    return [
        OrgWithRole(
            id=str(org.id),
            name=org.name,
            slug=org.slug,
            plan=org.plan,
            role=member.role,
        )
        for member, org in rows
    ]


async def invite_member(
    session: AsyncSession,
    org_id: uuid.UUID,
    actor_user_id: str,
    email: str,
    role: str,
    settings,
) -> OrganisationInvite:
    """Create an invite for email to join org_id with the given role."""
    await _require_actor_role(session, org_id, actor_user_id, "owner", "admin")

    if role not in ("member", "admin"):
        raise ValueError("role must be 'member' or 'admin'")

    # Check for existing un-accepted invite
    existing = (
        await session.execute(
            select(OrganisationInvite).where(
                OrganisationInvite.org_id == org_id,
                OrganisationInvite.email == email,
                OrganisationInvite.accepted == False,  # noqa: E712
            )
        )
    ).scalars().first()
    if existing:
        raise ValueError(f"An open invite already exists for {email}")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_token(raw_token)

    invite = OrganisationInvite(
        org_id=org_id,
        email=email,
        role=role,
        token_hash=token_hash,
        invited_by=uuid.UUID(actor_user_id),
        expires_at=utcnow() + timedelta(days=7),
    )
    session.add(invite)
    await session.flush()  # get invite.id before commit

    # Enqueue invite email
    try:
        org = await session.get(Organisation, org_id)
        actor = await session.get(User, uuid.UUID(actor_user_id))
        actor_email = actor.email if actor else None
        org_name = org.name if org else str(org_id)

        app_url = getattr(settings, "app_url", "http://localhost:3000")
        invite_url = f"{app_url}/orgs/invites/{raw_token}"

        from portfolio_rag.domain.services import job_queue
        await job_queue.enqueue(
            session,
            "send_org_invite_email",
            {
                "to_email": email,
                "invited_by_email": actor_email,
                "org_name": org_name,
                "invite_url": invite_url,
                "expiry_days": 7,
            },
        )
    except Exception:
        pass  # email enqueue is best-effort; don't fail the invite creation

    await session.commit()
    await session.refresh(invite)
    return invite


async def accept_invite(
    session: AsyncSession, token: str, accepting_user_id: str
) -> OrganisationMember:
    """Validate token and add accepting_user_id as a member of the org."""
    token_hash = hash_token(token)
    now = utcnow()

    invite = (
        await session.execute(
            select(OrganisationInvite).where(
                OrganisationInvite.token_hash == token_hash,
                OrganisationInvite.accepted == False,  # noqa: E712
                OrganisationInvite.expires_at > now,
            )
        )
    ).scalars().first()
    if invite is None:
        raise ValueError("Invite not found or has expired")

    invite.accepted = True
    session.add(invite)

    # Upsert membership
    user_uuid = uuid.UUID(accepting_user_id)
    existing_member = await _get_member(session, invite.org_id, user_uuid)
    if existing_member:
        existing_member.role = invite.role
        session.add(existing_member)
        member = existing_member
    else:
        member = OrganisationMember(
            user_id=user_uuid,
            org_id=invite.org_id,
            role=invite.role,
        )
        session.add(member)

    await session.commit()
    await session.refresh(member)
    return member


async def get_invite_preview(
    session: AsyncSession, token: str
) -> dict:
    """Return invite metadata for the pre-accept preview (public endpoint)."""
    token_hash = hash_token(token)
    now = utcnow()

    invite = (
        await session.execute(
            select(OrganisationInvite).where(
                OrganisationInvite.token_hash == token_hash,
                OrganisationInvite.accepted == False,  # noqa: E712
                OrganisationInvite.expires_at > now,
            )
        )
    ).scalars().first()
    if invite is None:
        raise LookupError("Invite not found or has expired")

    org = await session.get(Organisation, invite.org_id)
    invited_by_email: str | None = None
    if invite.invited_by:
        actor = await session.get(User, invite.invited_by)
        if actor:
            invited_by_email = actor.email

    return {
        "org_name": org.name if org else str(invite.org_id),
        "org_slug": org.slug if org else "",
        "invited_by_email": invited_by_email,
        "email": invite.email,
        "role": invite.role,
        "expires_at": invite.expires_at,
    }


async def list_members(
    session: AsyncSession, org_id: uuid.UUID, actor_user_id: str
) -> list[dict]:
    """Return all members of the org (actor must be owner or admin)."""
    await _require_actor_role(session, org_id, actor_user_id, "owner", "admin")

    rows = (
        await session.execute(
            select(OrganisationMember, User)
            .join(User, User.id == OrganisationMember.user_id)
            .where(OrganisationMember.org_id == org_id)
        )
    ).all()
    return [
        {
            "user_id": str(member.user_id),
            "email": user.email,
            "role": member.role,
            "joined_at": member.joined_at,
        }
        for member, user in rows
    ]


async def remove_member(
    session: AsyncSession,
    org_id: uuid.UUID,
    actor_user_id: str,
    target_user_id: str,
) -> None:
    """Remove target_user_id from the org."""
    actor = await _require_actor_role(session, org_id, actor_user_id, "owner", "admin")

    target_uuid = uuid.UUID(target_user_id)
    target = await _get_member(session, org_id, target_uuid)
    if target is None:
        raise LookupError("Member not found")

    if target.role == "owner":
        raise ValueError("Cannot remove the owner")

    if actor.role == "admin" and target.role == "admin":
        raise ValueError("Admins cannot remove other admins")

    await session.delete(target)
    await session.commit()


async def update_member_role(
    session: AsyncSession,
    org_id: uuid.UUID,
    actor_user_id: str,
    target_user_id: str,
    new_role: str,
) -> OrganisationMember:
    """Update a member's role (only owner can do this)."""
    await _require_actor_role(session, org_id, actor_user_id, "owner")

    if new_role not in ("member", "admin"):
        raise ValueError("role must be 'member' or 'admin'; use transfer-ownership to change owner")

    target_uuid = uuid.UUID(target_user_id)
    target = await _get_member(session, org_id, target_uuid)
    if target is None:
        raise LookupError("Member not found")

    if target.role == "owner":
        raise ValueError("Cannot change the owner's role; use transfer-ownership instead")

    target.role = new_role
    session.add(target)
    await session.commit()
    await session.refresh(target)
    return target


async def transfer_ownership(
    session: AsyncSession,
    org_id: uuid.UUID,
    current_owner_id: str,
    new_owner_id: str,
) -> None:
    """Transfer org ownership from current_owner_id to new_owner_id."""
    await _require_actor_role(session, org_id, current_owner_id, "owner")

    new_owner_uuid = uuid.UUID(new_owner_id)
    new_owner = await _get_member(session, org_id, new_owner_uuid)
    if new_owner is None:
        raise LookupError("New owner is not a member of this organisation")

    # Demote current owner
    current = await _get_member(session, org_id, uuid.UUID(current_owner_id))
    current.role = "admin"  # type: ignore[union-attr]
    session.add(current)

    # Promote new owner
    new_owner.role = "owner"
    session.add(new_owner)

    await session.flush()
    await session.commit()
