"""
Full Index Pipeline
====================

Single callable for chunk → embed → Qdrant upsert.
Used by both scripts (02_embed_and_store.py) and the API reindex background task.
"""

from __future__ import annotations

from qdrant_client.models import Distance, VectorParams, PointStruct, PayloadSchemaType

from portfolio_vault.chunking import chunk_document
from portfolio_vault.embedding import embed
from portfolio_vault.database import get_qdrant_client
from portfolio_vault.vault_db import get_docs, start_pipeline_run, finish_pipeline_run

TYPE_TO_CATEGORY = {
    "project":    "project",
    "brag":       "brag",
    "bio":        "general",
    "skills":     "general",
    "experience": "general",
}


def index_all_docs(
    settings,
    *,
    run_id: str | None = None,
    progress_cb=None,
) -> int:
    """Read all docs from DB, chunk, embed, upsert to Qdrant.

    If run_id is None, a new PipelineRun is created and finished automatically.
    If run_id is provided (pre-created by the caller), only finish_pipeline_run is called.

    progress_cb(event: str, data: dict) is called at key milestones when provided.

    Returns the number of chunks stored.
    """

    def _notify(event: str, **data):
        if progress_cb:
            progress_cb(event, data)

    docs = get_docs(settings.database_url)
    doc_ids = [str(d.id) for d in docs]
    slug_to_doc = {d.slug: d for d in docs}

    # Create pipeline run if not pre-created
    own_run = run_id is None
    if own_run and settings.database_url and doc_ids:
        run_id = start_pipeline_run(
            settings.database_url,
            doc_ids=doc_ids,
            model=settings.embedding_model,
        )

    _notify("started", doc_count=len(docs), run_id=run_id or "")

    try:
        all_chunks = [
            c
            for doc in docs
            for c in chunk_document(doc.slug, doc.content)
            if c["word_count"] >= 10
        ]

        _notify("chunked", chunk_count=len(all_chunks))

        vectors = embed([c["content"] for c in all_chunks], settings=settings)

        _notify("embedded", chunk_count=len(all_chunks))

        client = get_qdrant_client(settings)
        collection = settings.qdrant_collection

        if client.collection_exists(collection):
            client.delete_collection(collection)

        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=len(vectors[0]), distance=Distance.COSINE),
        )

        client.create_payload_index(
            collection_name=collection,
            field_name="source",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=collection,
            field_name="category",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        points = [
            PointStruct(
                id=i,
                vector=vector,
                payload={
                    "chunk_id": chunk["id"],
                    "source": chunk["source"],
                    "category": TYPE_TO_CATEGORY.get(
                        slug_to_doc[chunk["source"]].type if chunk["source"] in slug_to_doc else "",
                        "general",
                    ),
                    "heading": chunk["heading"],
                    "word_count": chunk["word_count"],
                    "content": chunk["content"],
                },
            )
            for i, (chunk, vector) in enumerate(zip(all_chunks, vectors))
        ]

        client.upsert(collection_name=collection, points=points)
        count = client.count(collection_name=collection).count

        if run_id and settings.database_url:
            finish_pipeline_run(
                settings.database_url,
                run_id=run_id,
                status="success",
                chunk_count=count,
            )

        _notify("done", chunk_count=count, run_id=run_id or "")
        return count

    except Exception as exc:
        if run_id and settings.database_url:
            finish_pipeline_run(
                settings.database_url,
                run_id=run_id,
                status="failed",
                error=str(exc),
            )
        raise
