"""
Export Router
=============

POST /api/v1/export/docx  — markdown → .docx download
POST /api/v1/export/pdf   — markdown → .pdf download
"""

from __future__ import annotations

import re
import unicodedata
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from memra.app.core.dependencies import get_current_user

router = APIRouter(prefix="/export", tags=["export"])


class ExportRequest(BaseModel):
    content: str          # raw markdown
    title: str = "document"


@router.post("/docx")
async def export_docx(
    body: ExportRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        from memra.domain.services.export import markdown_to_docx
        data = markdown_to_docx(body.content)
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"DOCX export requires python-docx: pip install python-docx ({e})",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Sanitize title for Content-Disposition header (latin-1 safe)
    safe_name = unicodedata.normalize("NFKD", body.title).encode("ascii", "ignore").decode("ascii")
    safe_name = re.sub(r"[^\w\s-]", "", safe_name).strip().replace(" ", "_")[:80] or "document"

    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.docx"'},
    )


@router.post("/pdf")
async def export_pdf(
    body: ExportRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        from memra.domain.services.export import markdown_to_pdf
        data = markdown_to_pdf(body.content)
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"PDF export requires weasyprint + markdown: pip install weasyprint markdown ({e})",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Sanitize title for Content-Disposition header (latin-1 safe)
    safe_name = unicodedata.normalize("NFKD", body.title).encode("ascii", "ignore").decode("ascii")
    safe_name = re.sub(r"[^\w\s-]", "", safe_name).strip().replace(" ", "_")[:80] or "document"

    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
    )
