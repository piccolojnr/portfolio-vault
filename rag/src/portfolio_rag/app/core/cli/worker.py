"""Worker command: start the background job-queue worker."""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import time
import traceback

import typer

app = typer.Typer(help="Job-queue worker.")

WORKER_ID = f"{socket.gethostname()}-{os.getpid()}"
POLL_INTERVAL_SECONDS = 2


@app.command()
def worker(
    log_level: str = typer.Option("INFO", help="Logging level (DEBUG/INFO/WARNING/ERROR)."),
):
    """Start the background job-queue worker (polls Postgres every 2 s)."""
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    asyncio.run(_run_worker())


async def _run_worker() -> None:
    from portfolio_rag.app.core.config import get_settings
    from portfolio_rag.app.core.db import open_db_engine
    from portfolio_rag.domain.services import job_queue
    from portfolio_rag.domain.services.job_handlers import (
        handle_ingest_document,
        handle_reingest_document,
        handle_summarise_conversation,
    )

    handlers = {
        "ingest_document": handle_ingest_document,
        "reingest_document": handle_reingest_document,
        "summarise_conversation": handle_summarise_conversation,
    }

    settings = get_settings()
    engine, factory = await open_db_engine(settings.database_url)
    logging.info("worker started worker_id=%s", WORKER_ID)

    try:
        while True:
            async with factory() as session:
                job = await job_queue.dequeue(session, WORKER_ID)
                await session.commit()

            if job is None:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                continue

            handler = handlers.get(job["type"])
            t0 = time.monotonic()
            job_id = str(job["id"])

            try:
                logging.info("job_start job_id=%s type=%s", job_id, job["type"])
                if handler:
                    await handler(job["payload"])
                else:
                    raise ValueError(f"Unknown job type: {job['type']}")

                async with factory() as session:
                    await job_queue.complete(session, job_id)
                    await session.commit()

                ms = int((time.monotonic() - t0) * 1000)
                logging.info("job_done job_id=%s type=%s duration_ms=%d", job_id, job["type"], ms)

            except Exception as exc:
                ms = int((time.monotonic() - t0) * 1000)
                logging.exception("job_fail job_id=%s type=%s duration_ms=%d", job_id, job["type"], ms)
                async with factory() as session:
                    await job_queue.fail(session, job_id, str(exc), traceback.format_exc())
                    await session.commit()
    finally:
        await engine.dispose()
