"""
STAGE 1B: Embedding + Storage
==============================

Embed chunks and store them in Qdrant (local or cloud).
Records a PipelineRun in the DB for audit purposes.

Run:
  cd rag
  .venv/Scripts/python.exe scripts/02_embed_and_store.py
"""

from memra.app.core.config import get_settings
from memra.domain.services.indexer import index_all_docs
from memra.infrastructure.db.repository import get_docs, start_pipeline_run


if __name__ == "__main__":
    settings = get_settings()

    # Start pipeline run audit record
    docs = get_docs(settings.database_url) if settings.database_url else []
    doc_ids = [str(doc.id) for doc in docs]

    run_id: str | None = None
    if settings.database_url and doc_ids:
        run_id = start_pipeline_run(
            settings.database_url,
            doc_ids=doc_ids,
            model=settings.embedding_model,
        )
        print(f"Pipeline run started: {run_id}")

    count = index_all_docs(settings, run_id=run_id)
    print(f"\nStored {count} chunks in Qdrant")
    if run_id:
        print(f"Pipeline run {run_id} → success ({count} chunks)")
