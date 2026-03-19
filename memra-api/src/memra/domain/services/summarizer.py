"""
core/summarizer.py
------------------
Background summarisation job for long conversations.

Ports lib/summarizer.ts verbatim.

When trimming occurs, the messages that were cut are lost from the LLM's
context window. This module produces a 3-5 sentence rolling summary of
those dropped messages and writes it back to the DB, so future requests
can inject it as "[Earlier context: ...]".

Key design rules:
  - Never await this from the request path — fire-and-forget only.
  - Never regenerate the full conversation. Always extend from the existing
    summary, processing only the newly-trimmed messages.
  - Only run if newest_trimmed_id != summarised_up_to_id (i.e. the
    summary is stale) AND more than MIN_DROPPED_TO_SUMMARISE were cut.
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

logger = logging.getLogger(__name__)

MIN_DROPPED_TO_SUMMARISE = 5


def maybe_trigger_summarization(
    conv_id: str,
    dropped_messages: list,
    newest_trimmed_id: str | None,
    existing_summary: str | None,
    summarised_up_to_id: str | None,
    settings,
    db_session_factory,
) -> None:
    """
    Fire-and-forget — call this after streaming finishes.
    Returns immediately; summarisation runs in the background.
    """
    if not newest_trimmed_id:
        return
    if len(dropped_messages) <= MIN_DROPPED_TO_SUMMARISE:
        return
    if newest_trimmed_id == summarised_up_to_id:
        return

    task = asyncio.create_task(
        _run_summarization(
            conv_id, dropped_messages, newest_trimmed_id,
            existing_summary, settings, db_session_factory,
        )
    )
    task.add_done_callback(
        lambda t: (
            logger.warning("[summarizer] Background job failed: %s", t.exception())
            if not t.cancelled() and t.exception()
            else None
        )
    )


async def _run_summarization(
    conv_id: str,
    dropped_messages: list,
    newest_trimmed_id: str,
    existing_summary: str | None,
    settings,
    db_session_factory,
) -> None:
    prompt = _build_prompt(dropped_messages, existing_summary)

    if settings.anthropic_api_key:
        new_summary, _ = await _summarise_with_anthropic(
            prompt, settings.anthropic_api_key, settings.summarizer_anthropic_model
        )
    else:
        new_summary, _ = await _summarise_with_openai(
            prompt, settings.openai_api_key, settings.summarizer_openai_model
        )

    # Persist directly via service — no HTTP round-trip needed
    from memra.domain.services import conversations as conv_svc
    async with db_session_factory() as session:
        await conv_svc.update_summary(
            session,
            UUID(conv_id),
            new_summary,
            UUID(newest_trimmed_id),
        )
    logger.info("[summarizer] Updated summary for conversation %s", conv_id)


def _build_prompt(dropped: list, existing_summary: str | None) -> str:
    """
    Builds the summarisation prompt.
    Always extends from the existing summary — never starts from scratch.
    """
    transcript = "\n\n".join(f"{m.role.upper()}: {m.content}" for m in dropped)
    seed_section = (
        f"Existing summary (do not repeat this verbatim — extend it):\n{existing_summary}\n\n"
        if existing_summary else ""
    )
    return (
        f"{seed_section}"
        f"New messages to incorporate:\n\n{transcript}\n\n"
        "Write an updated 3-5 sentence summary of this conversation so far. "
        "Cover: the user's goal, any documents generated (type + key decisions), "
        "preferences stated, and important facts established. "
        "Write in present tense. Reply with only the summary text."
    )


async def _summarise_with_anthropic(
    prompt: str, api_key: str, model: str
) -> tuple[str, dict]:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=model,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    usage = {
        "provider": "anthropic",
        "model": model,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    return text, usage


async def _summarise_with_openai(
    prompt: str, api_key: str, model: str
) -> tuple[str, dict]:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model=model,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    text = (response.choices[0].message.content or "").strip()
    usage = {
        "provider": "openai",
        "model": model,
        "input_tokens": response.usage.prompt_tokens if response.usage else None,
        "output_tokens": response.usage.completion_tokens if response.usage else None,
    }
    return text, usage
