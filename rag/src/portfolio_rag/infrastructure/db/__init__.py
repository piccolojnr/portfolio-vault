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
from portfolio_rag.infrastructure.db.models.ai_call import AiCall
from portfolio_rag.infrastructure.db.models.conversation import Conversation, Message
from portfolio_rag.infrastructure.db.models.job import Job
from portfolio_rag.infrastructure.db.models.user import User
from portfolio_rag.infrastructure.db.models.auth_tokens import (
    RefreshToken,
    MagicLinkToken,
    PasswordResetToken,
)
from portfolio_rag.infrastructure.db.models.org import (
    Organisation,
    OrganisationMember,
    OrganisationInvite,
    OrganisationSetting,
)

__all__ = [
    "Document", "PipelineRun", "AppSetting", "AiCall", "utcnow",
    "Conversation", "Message", "Job",
    "User", "RefreshToken", "MagicLinkToken", "PasswordResetToken",
    "Organisation", "OrganisationMember", "OrganisationInvite", "OrganisationSetting",
]
