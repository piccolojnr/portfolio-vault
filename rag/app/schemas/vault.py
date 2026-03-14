"""Vault document and reindex schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class VaultDocSummary(BaseModel):
    id: str
    slug: str
    type: str
    title: str
    updated_at: datetime


class PaginatedDocs(BaseModel):
    items: list[VaultDocSummary]
    total: int
    page: int
    page_size: int
    pages: int


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
