"""Plan limits SQLModel table for billing enforcement."""

from __future__ import annotations

import uuid
from typing import Optional

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class PlanLimit(SQLModel, table=True):
    __tablename__ = "plan_limits"

    plan_tier: str = Field(
        sa_column=sa.Column(sa.Text, primary_key=True),
    )

    # NULL = unlimited
    monthly_token_limit: Optional[int] = Field(
        default=None, sa_column=sa.Column(sa.BigInteger, nullable=True)
    )

    # NULL = unlimited
    max_documents: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer, nullable=True))
    max_corpora: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer, nullable=True))
    max_members: Optional[int] = Field(default=None, sa_column=sa.Column(sa.Integer, nullable=True))

    overage_rate_per_500k_tokens: float = Field(
        default=0, sa_column=sa.Column(sa.Numeric(10, 6), nullable=False, server_default="0")
    )

