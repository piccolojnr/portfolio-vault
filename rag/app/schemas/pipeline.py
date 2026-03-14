"""Pipeline run and cost-estimate schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PipelineRunSummary(BaseModel):
    run_id: str
    status: str
    triggered_by: str
    chunk_count: Optional[int]
    token_count: Optional[int]
    cost_usd: Optional[float]
    model: Optional[str]
    started_at: datetime
    finished_at: Optional[datetime]
    error: Optional[str]


class PipelineRunList(BaseModel):
    items: list[PipelineRunSummary]
    total: int
    page: int
    page_size: int
    pages: int


class CostEstimate(BaseModel):
    doc_count: int
    chunk_count: int
    token_count: int
    estimated_cost_usd: float
    model: str
