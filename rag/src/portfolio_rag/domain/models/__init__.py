"""
Schemas package — re-exports everything for backward compatibility.

Import from submodules for clarity in new code:
  from portfolio_rag.domain.models.document import CorpusDocDetail
  from portfolio_rag.domain.models.rag import QueryRequest
"""

from portfolio_rag.domain.models.rag import (
    QueryRequest,
    QueryResponse,
    RetrievedChunk,
    RetrieveResponse,
)
from portfolio_rag.domain.models.document import (
    PaginatedDocs,
    ReindexResponse,
    ReindexStatus,
    CorpusDocCreate,
    CorpusDocDetail,
    CorpusDocSummary,
    CorpusDocUpdate,
)
from portfolio_rag.domain.models.settings import SettingsRead, SettingsUpdate
from portfolio_rag.domain.models.conversation import (
    ConversationSummary,
    ConversationDetail,
    ConversationPatch,
    MessageRead,
    MessageCreate,
)
from portfolio_rag.domain.models.chat import ChatMessage, ChatStreamRequest

__all__ = [
    "QueryRequest",
    "QueryResponse",
    "RetrievedChunk",
    "RetrieveResponse",
    "PaginatedDocs",
    "ReindexResponse",
    "ReindexStatus",
    "CorpusDocCreate",
    "CorpusDocDetail",
    "CorpusDocSummary",
    "CorpusDocUpdate",
]
