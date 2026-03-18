"""Corpus document schemas."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

DEFAULT_CORPUS_ID = "portfolio_vault"


class CorpusDocSummary(BaseModel):
    id: str
    corpus_id: str
    slug: str
    type: str
    title: str
    created_at: datetime
    updated_at: datetime
    lightrag_status: Optional[str] = None  # "pending"|"processing"|"ready"|"failed"
    source_type: str = "text"              # "text" | "file"
    file_size: Optional[int] = None
    mimetype: Optional[str] = None


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
    type: Optional[str] = None


class DuplicateCheckFile(BaseModel):
    filename: str
    hash: str
    size: int
    mimetype: str


class DuplicateCheckRequest(BaseModel):
    corpus_id: Optional[str] = None  # ignored — backend resolves from org's active corpus
    files: list[DuplicateCheckFile]


class DuplicateCheckResult(BaseModel):
    filename: str
    hash: str
    status: Literal["new", "duplicate", "unsupported"]
    existing_title: Optional[str] = None


class DuplicateCheckResponse(BaseModel):
    results: list[DuplicateCheckResult]


class DocumentStatusResponse(BaseModel):
    id: str
    slug: str
    status: str
    error: Optional[str] = None


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
