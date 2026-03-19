"""ModelPlanRestriction SQLModel table."""

from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel

from memra.infrastructure.db.models.base import utcnow


class ModelPlanRestriction(SQLModel, table=True):
    __tablename__ = "model_plan_restrictions"

    model_id: str = Field(sa_column=Column(sa.String, primary_key=True))
    model_name: str = Field(sa_column=Column(sa.String, nullable=False))
    model_type: str = Field(sa_column=Column(sa.String, nullable=False))
    provider: str = Field(sa_column=Column(sa.String, nullable=False))
    min_plan: str = Field(default="free", sa_column=Column(sa.String, nullable=False, server_default="free"))
    enabled: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)
