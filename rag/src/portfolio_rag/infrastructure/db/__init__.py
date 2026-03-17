"""
Infrastructure DB package — re-exports all SQLModel tables.

Import this package so SQLModel.metadata is fully populated
before create_all() is called:
  import portfolio_rag.infrastructure.db  # noqa: F401
"""

from portfolio_rag.infrastructure.db.models.base import utcnow
from portfolio_rag.infrastructure.db.models.document import Document
from portfolio_rag.infrastructure.db.models.pipeline import PipelineRun
from portfolio_rag.infrastructure.db.models.settings import AppSetting
from portfolio_rag.infrastructure.db.models.query import QueryLog
from portfolio_rag.infrastructure.db.models.conversation import Conversation, Message

__all__ = [
    "Document", "PipelineRun", "AppSetting", "QueryLog", "utcnow",
    "Conversation", "Message",
]
