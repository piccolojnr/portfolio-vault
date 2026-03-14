"""
API Request / Response Schemas
================================

All Pydantic models used by the routers live here.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class QueryRequest(BaseModel):
    question: str
    n_results: int = 5


class RetrievedChunk(BaseModel):
    content: str
    source: str
    heading: str
    similarity: float


class RetrieveResponse(BaseModel):
    question: str
    retrieved_chunks: list[RetrievedChunk]
    mode: str


class QueryResponse(BaseModel):
    question: str
    retrieved_chunks: list[RetrievedChunk]
    answer: str
    mode: str


# ── Vault schemas ─────────────────────────────────────────────────────────────

class PaginatedDocs(BaseModel):
    items: list["VaultDocSummary"]
    total: int
    page: int
    page_size: int
    pages: int


class VaultDocSummary(BaseModel):
    id: str
    slug: str
    type: str
    title: str
    updated_at: datetime


class VaultDocDetail(VaultDocSummary):
    content: str


class VaultDocCreate(BaseModel):
    slug: str
    title: str
    type: str
    content: str = ""


class VaultDocUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class ReindexResponse(BaseModel):
    run_id: str
    status: str = "running"


class ReindexStatus(BaseModel):
    run_id: str
    status: str
    chunk_count: Optional[int]
    started_at: datetime
    finished_at: Optional[datetime]
    error: Optional[str]


# ── Pipeline schemas ───────────────────────────────────────────────────────────

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
