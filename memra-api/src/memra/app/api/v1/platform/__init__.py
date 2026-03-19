"""
Platform Admin API
===================

All routes require platform admin authentication.
Mounted under /api/v1/platform.
"""

from fastapi import APIRouter

from memra.app.api.v1.platform import (
    auth,
    settings,
    models,
    users,
    orgs,
    logs,
    audit_logs,
    analytics,
    jobs,
    billing_admin,
    health,
)

router = APIRouter(prefix="/platform", tags=["platform-admin"])
router.include_router(auth.router)
router.include_router(settings.router)
router.include_router(models.router)
router.include_router(users.router)
router.include_router(orgs.router)
router.include_router(logs.router)
router.include_router(audit_logs.router)
router.include_router(analytics.router)
router.include_router(jobs.router)
router.include_router(billing_admin.router)
router.include_router(health.router)
