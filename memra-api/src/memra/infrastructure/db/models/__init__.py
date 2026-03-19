"""
ORM models package — re-exports all SQLModel tables.

Import models here so SQLModel.metadata is fully populated
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
from memra.infrastructure.db.models.corpus import Corpus
from memra.infrastructure.db.models.org import (
    Organisation,
    OrganisationMember,
    OrganisationInvite,
    OrganisationSetting,
)
from memra.infrastructure.db.models.platform_admin import PlatformAdmin
from memra.infrastructure.db.models.platform_setting import PlatformSetting
from memra.infrastructure.db.models.model_plan_restriction import ModelPlanRestriction
from memra.infrastructure.db.models.admin_refresh_token import AdminRefreshToken
from memra.infrastructure.db.models.admin_audit_log import AdminAuditLog

__all__ = [
    "Document", "PipelineRun", "AppSetting", "AiCall", "utcnow",
    "Conversation", "Message", "Job",
    "User", "RefreshToken", "MagicLinkToken", "PasswordResetToken",
    "Organisation", "OrganisationMember", "OrganisationInvite", "OrganisationSetting",
    "Corpus",
    "PlatformAdmin", "PlatformSetting", "ModelPlanRestriction",
    "AdminRefreshToken", "AdminAuditLog",
]
