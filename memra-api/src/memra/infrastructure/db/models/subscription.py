"""Subscription SQLModel table for Paystack subscription tracking."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from memra.infrastructure.db.models.base import utcnow


class Subscription(SQLModel, table=True):
    __tablename__ = "subscriptions"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=sa.Column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )
    org_id: uuid.UUID = Field(
        sa_column=sa.Column(sa.UUID(as_uuid=True), sa.ForeignKey("organisations.id"), unique=True, nullable=False),
    )

    paystack_subscription_code: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text, nullable=True))
    paystack_customer_code: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text, nullable=True))
    paystack_plan_code: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text, nullable=True))
    paystack_email_token: Optional[str] = Field(default=None, sa_column=sa.Column(sa.Text, nullable=True))

    # active | cancelled | non_renewing | attention
    status: str = Field(
        default="active",
        sa_column=sa.Column(sa.Text, nullable=False, server_default="active"),
    )

    current_period_start: Optional[datetime] = Field(
        default=None, sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True)
    )
    current_period_end: Optional[datetime] = Field(
        default=None, sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True)
    )
    cancelled_at: Optional[datetime] = Field(
        default=None, sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True)
    )

    created_at: datetime = Field(default_factory=utcnow, sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=utcnow, sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False))

