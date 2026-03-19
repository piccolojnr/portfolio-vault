"""
Schemas package — re-exports everything for backward compatibility.

Import from submodules for clarity in new code:
  from memra.domain.models.document import CorpusDocDetail
  from memra.domain.models.rag import QueryRequest
"""

from memra.domain.models.rag import (
    QueryRequest,
    QueryResponse,
    RetrievedChunk,
    RetrieveResponse,
)
from memra.domain.models.document import (
    PaginatedDocs,
    ReindexResponse,
    ReindexStatus,
    CorpusDocCreate,
    CorpusDocDetail,
    CorpusDocSummary,
    CorpusDocUpdate,
)
from memra.domain.models.settings import SettingsRead, SettingsUpdate
from memra.domain.models.conversation import (
    ConversationSummary,
    ConversationDetail,
    ConversationPatch,
    MessageRead,
    MessageCreate,
)
from memra.domain.models.chat import ChatMessage, ChatStreamRequest

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
