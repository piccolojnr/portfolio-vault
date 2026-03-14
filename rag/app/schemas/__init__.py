"""
Schemas package — re-exports everything for backward compatibility.

Import from submodules for clarity in new code:
  from app.schemas.vault import VaultDocDetail
  from app.schemas.pipeline import CostEstimate
  from app.schemas.rag import QueryRequest
"""

from app.schemas.rag import (
    QueryRequest,
    QueryResponse,
    RetrievedChunk,
    RetrieveResponse,
)
from app.schemas.vault import (
    PaginatedDocs,
    ReindexResponse,
    ReindexStatus,
    VaultDocCreate,
    VaultDocDetail,
    VaultDocSummary,
    VaultDocUpdate,
)
from app.schemas.pipeline import (
    CostEstimate,
    PipelineRunList,
    PipelineRunSummary,
)
from app.schemas.settings import SettingsRead, SettingsUpdate

__all__ = [
    "QueryRequest",
    "QueryResponse",
    "RetrievedChunk",
    "RetrieveResponse",
    "PaginatedDocs",
    "ReindexResponse",
    "ReindexStatus",
    "VaultDocCreate",
    "VaultDocDetail",
    "VaultDocSummary",
    "VaultDocUpdate",
    "CostEstimate",
    "PipelineRunList",
    "PipelineRunSummary",
]
