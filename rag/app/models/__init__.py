"""
Models package — re-exports all SQLModel tables.

Import models here so SQLModel.metadata is fully populated
before create_all() is called:
  import app.models  # noqa: F401
"""

from app.models.base import utcnow
from app.models.vault import VaultDocument
from app.models.pipeline import PipelineRun
from app.models.settings import AppSetting
from app.models.query import QueryLog
from app.models.conversation import Conversation, Message

__all__ = [
    "VaultDocument", "PipelineRun", "AppSetting", "QueryLog", "utcnow",
    "Conversation", "Message",
]
