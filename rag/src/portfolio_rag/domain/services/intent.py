"""
core/intent.py
--------------
Fast intent classification for incoming chat messages.

Four intents:
  conversational — small talk, greetings, thanks, short reactions
  retrieval      — any question that requires knowledge base context to answer
  document       — explicit request to generate a structured document (report, summary, etc.)
  refinement     — modify / improve a document already in the conversation
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Literal

logger = logging.getLogger(__name__)

IntentType = Literal["conversational", "retrieval", "document", "refinement"]
# NOTE: "document" NOT "document_generation" — must match the TS classifier prompt exactly


@dataclass
class Classification:
    intent: IntentType
    needs_rag: bool


CLASSIFIER_SYSTEM = """You are an intent classifier for a knowledge base assistant. Users ask questions about documents stored in their knowledge base.

Classify the user's current message into exactly one intent:
- "conversational": pure small talk, greetings, thanks, short reactions ("hi", "thanks", "great"), or questions about the assistant itself ("what can you do?")
- "retrieval": ANY question that might be answered using the knowledge base — questions about topics, people, projects, technologies, events, facts, summaries, comparisons, or anything where context from stored documents would help. When in doubt, use "retrieval".
- "document": explicit request to generate a new structured document (report, summary document, briefing, etc.) based on knowledge base content
- "refinement": request to modify, shorten, improve, or extend a document already present in the conversation history

Also output:
- needs_rag: true if knowledge base chunks should be retrieved (true for retrieval/document; false for conversational; conditionally true for refinement if the request needs new information beyond what is already in the conversation — e.g. "add information about X" → true, "make it shorter" → false)

IMPORTANT: Err on the side of "retrieval" with needs_rag=true. Only use "conversational" for messages that are clearly pure small talk with no informational intent.

Respond with valid JSON only. No markdown fences, no explanation. Example:
{"intent":"retrieval","needs_rag":true}"""


def scan_for_document(history: list[dict]) -> bool:
    """Returns True if any assistant message in history contains a <document> block."""
    return any(m["role"] == "assistant" and "<document" in m["content"] for m in history)


def recent_history(history: list[dict], n: int = 4) -> list[dict]:
    """Trims history to the last N messages to keep the classifier prompt small."""
    return history[-n:]


async def classify_intent(
    message: str,
    history: list[dict],
    settings,
    *,
    db_session_factory=None,
    conversation_id: str | None = None,
    org_id=None,
) -> Classification:
    """
    Classifies a user message into an intent + retrieval metadata.

    Falls back to Classification("retrieval", True, prior) if the classifier
    call fails or returns unparseable JSON — safe over-retrieval beats silent
    context loss.
    """
    fallback = Classification(intent="retrieval", needs_rag=True)

    if not settings.anthropic_api_key and not settings.openai_api_key:
        return fallback

    context = recent_history(history)
    if context:
        user_content = (
            f"Conversation history (last {len(context)} messages):\n"
            f"{json.dumps(context, indent=2)}\n\n"
            f"Current message: {message}"
        )
    else:
        user_content = f"Current message: {message}"

    try:
        if settings.anthropic_api_key:
            text, usage = await _classify_with_anthropic(
                user_content, settings.anthropic_api_key, settings.classifier_anthropic_model
            )
        else:
            text, usage = await _classify_with_openai(
                user_content, settings.openai_api_key, settings.classifier_openai_model
            )

        parsed = json.loads(text)
        result = Classification(
            intent=parsed["intent"],
            needs_rag=bool(parsed["needs_rag"]),
        )
        logger.info("[intent] %s | needs_rag=%s", result.intent, result.needs_rag)

        # Log best-effort
        if db_session_factory and usage:
            try:
                from portfolio_rag.domain.services.ai_calls import log_call
                async with db_session_factory() as _session:
                    await log_call(
                        _session, "intent",
                        model=usage["model"],
                        provider=usage["provider"],
                        input_tokens=usage["input_tokens"],
                        output_tokens=usage["output_tokens"],
                        conversation_id=conversation_id,
                        org_id=org_id,
                    )
                    await _session.commit()
            except Exception:
                pass

        return result
    except Exception as err:
        logger.warning("[intent] Classification failed, using fallback: %s", err)
        return fallback


async def _classify_with_anthropic(user_content: str, api_key: str, model: str) -> tuple[str, dict]:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=model,
        max_tokens=128,
        system=CLASSIFIER_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    )
    text = "".join(b.text for b in response.content if b.type == "text")
    usage = {
        "model": model,
        "provider": "anthropic",
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    return text, usage


async def _classify_with_openai(user_content: str, api_key: str, model: str) -> tuple[str, dict]:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model=model,
        max_tokens=128,
        messages=[
            {"role": "system", "content": CLASSIFIER_SYSTEM},
            {"role": "user", "content": user_content},
        ],
    )
    text = response.choices[0].message.content or ""
    usage = {
        "model": model,
        "provider": "openai",
        "input_tokens": response.usage.prompt_tokens if response.usage else None,
        "output_tokens": response.usage.completion_tokens if response.usage else None,
    }
    return text, usage
