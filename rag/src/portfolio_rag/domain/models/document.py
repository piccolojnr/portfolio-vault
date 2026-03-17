"""Corpus document schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

DEFAULT_CORPUS_ID = "portfolio_vault"


class CorpusDocSummary(BaseModel):
    id: str
    corpus_id: str
    slug: str
    type: str
    title: str
    updated_at: datetime


class PaginatedDocs(BaseModel):
    items: list[CorpusDocSummary]
    total: int
    page: int
    page_size: int
    pages: int


class CorpusDocDetail(CorpusDocSummary):
    extracted_text: str


class CorpusDocCreate(BaseModel):
    slug: str
    title: str
    type: str
    extracted_text: str = ""
    corpus_id: str = DEFAULT_CORPUS_ID


class CorpusDocUpdate(BaseModel):
    title: Optional[str] = None
    extracted_text: Optional[str] = None
    corpus_id: Optional[str] = None


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
