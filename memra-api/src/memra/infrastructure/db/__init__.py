"""
Infrastructure DB package — re-exports all SQLModel tables.

Import this package so SQLModel.metadata is fully populated
before create_all() is called:
  import memra.infrastructure.db  # noqa: F401
"""

from memra.infrastructure.db.models.base import utcnow
from memra.infrastructure.db.models.document import Document
from memra.infrastructure.db.models.pipeline import PipelineRun
from memra.infrastructure.db.models.settings import AppSetting
from memra.infrastructure.db.models.ai_call import AiCall
from memra.infrastructure.db.models.conversation import Conversation, Message
from memra.infrastructure.db.models.job import Job
from memra.infrastructure.db.models.user import User
from memra.infrastructure.db.models.auth_tokens import (
    RefreshToken,
    MagicLinkToken,
    PasswordResetToken,
)
from memra.infrastructure.db.models.org import (
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
