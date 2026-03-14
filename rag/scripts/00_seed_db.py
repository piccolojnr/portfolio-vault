"""
STAGE 0B: Seed vault_documents
================================

Reads 11 markdown files and upserts them into the vault_documents table.
Prints 'inserted' or 'updated' per document.

Run:
  cd rag
  .venv/Scripts/python.exe scripts/00_seed_db.py
"""

from pathlib import Path

from sqlalchemy import create_engine, text

from app.config import get_settings

settings = get_settings()

# Explicit slug/type/title mapping (no string transformation)
DOC_META = {
    "bio":                   {"slug": "bio",                   "type": "bio",        "title": "Bio"},
    "skills":                {"slug": "skills",                "type": "skills",     "title": "Skills"},
    "experience":            {"slug": "experience",            "type": "experience", "title": "Experience"},
    "brag_sheet":            {"slug": "brag-sheet",            "type": "brag",       "title": "Brag Sheet"},
    "project_src_permit":    {"slug": "src-permit-system",     "type": "project",    "title": "SRC Permit System"},
    "project_laundry_kiosk": {"slug": "laundry-kiosk",         "type": "project",    "title": "Laundry Kiosk"},
    "project_laundry_pos":   {"slug": "laundry-pos",           "type": "project",    "title": "Laundry POS"},
    "project_kgl":           {"slug": "kgl-group-website",     "type": "project",    "title": "KGL Group Website"},
    "project_allied":        {"slug": "allied-ghana-website",  "type": "project",    "title": "Allied Ghana Website"},
    "project_kitchen":       {"slug": "kitchen-comfort",       "type": "project",    "title": "Kitchen Comfort"},
    "project_csir":          {"slug": "csir-noise-dashboard",  "type": "project",    "title": "CSIR Noise Dashboard"},
}

VAULT_FILES = {
    "bio":                   settings.project_dir / "bio.md",
    "skills":                settings.project_dir / "skills.md",
    "experience":            settings.project_dir / "experience.md",
    "brag_sheet":            settings.project_dir / "brag_sheet.md",
    "project_src_permit":    settings.project_dir / "02_projects/src-permit-system/overview.md",
    "project_laundry_kiosk": settings.project_dir / "02_projects/laundry-kiosk/overview.md",
    "project_laundry_pos":   settings.project_dir / "02_projects/laundry-pos/overview.md",
    "project_kgl":           settings.project_dir / "02_projects/kgl-group-website/overview.md",
    "project_allied":        settings.project_dir / "02_projects/allied-ghana-website/overview.md",
    "project_kitchen":       settings.project_dir / "02_projects/kitchen-comfort/overview.md",
    "project_csir":          settings.project_dir / "02_projects/csir-noise-dashboard/overview.md",
}

UPSERT_SQL = text("""
    INSERT INTO vault_documents (id, type, slug, title, content, metadata, updated_at, created_at)
    VALUES (gen_random_uuid(), :type, :slug, :title, :content, CAST(:metadata AS jsonb), now(), now())
    ON CONFLICT (slug) DO UPDATE
        SET type       = EXCLUDED.type,
            title      = EXCLUDED.title,
            content    = EXCLUDED.content,
            metadata   = EXCLUDED.metadata,
            updated_at = now()
    RETURNING (xmax = 0) AS inserted
""")


if __name__ == "__main__":
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is not set in .env")

    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        for key, filepath in VAULT_FILES.items():
            meta = DOC_META[key]
            content = Path(filepath).read_text(encoding="utf-8")

            result = conn.execute(
                UPSERT_SQL,
                {
                    "type":     meta["type"],
                    "slug":     meta["slug"],
                    "title":    meta["title"],
                    "content":  content,
                    "metadata": "{}",
                },
            )
            row = result.fetchone()
            action = "inserted" if row[0] else "updated"
            print(f"{action:8s}  {meta['slug']:30s}  ({meta['type']})")

        conn.commit()

    print(f"\nSeeded {len(VAULT_FILES)} documents.")
