"""QueryLog SQLModel table — tracks LLM generation cost per chat query."""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel

from portfolio_rag.infrastructure.db.models.base import utcnow


class QueryLog(SQLModel, table=True):
    __tablename__ = "query_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    question: str
    model: Optional[str] = None
    provider: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    cost_usd: Optional[float] = None
    created_at: datetime = Field(default_factory=utcnow)
