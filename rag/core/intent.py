"""
core/intent.py
--------------
Fast intent classification for incoming chat messages.

Ports lib/intent.ts verbatim.

Four intents:
  conversational — small talk, greetings, thanks, short reactions
  retrieval      — questions about Daud's background/skills/projects
  document       — explicit request to generate CV / cover letter / bio
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
    has_prior_document: bool


CLASSIFIER_SYSTEM = """You are an intent classifier for a career assistant chatbot that helps a user named Daud with his portfolio, CV, cover letters, and job applications.

Classify the user's current message into exactly one intent:
- "conversational": small talk, greetings, thanks, short reactions, clarifying questions about the assistant itself
- "retrieval": questions about Daud's experience, skills, projects, background, or anything requiring portfolio information
- "document": explicit request to generate a new CV, cover letter, resume, or bio from scratch
- "refinement": request to modify, shorten, improve, or extend a document already in the conversation; OR a follow-up that references a previously generated document

Also output:
- needs_rag: true if vault chunks should be retrieved (true for retrieval/document; false for conversational; conditionally true for refinement if the request needs new information, e.g. "add my kiosk project" — true, "make it shorter" — false)
- has_prior_document: true if there is a <document ...> block in the recent conversation history

Respond with valid JSON only. No markdown fences, no explanation. Example:
{"intent":"retrieval","needs_rag":true,"has_prior_document":false}"""


def scan_for_document(history: list[dict]) -> bool:
    """Returns True if any assistant message in history contains a <document> block."""
    return any(m["role"] == "assistant" and "<document" in m["content"] for m in history)


def recent_history(history: list[dict], n: int = 4) -> list[dict]:
    """Trims history to the last N messages to keep the classifier prompt small."""
    return history[-n:]


async def classify_intent(message: str, history: list[dict], settings) -> Classification:
    """
    Classifies a user message into an intent + retrieval metadata.

    Falls back to Classification("retrieval", True, prior) if the classifier
    call fails or returns unparseable JSON — safe over-retrieval beats silent
    context loss.
    """
    prior = scan_for_document(history)
    fallback = Classification(intent="retrieval", needs_rag=True, has_prior_document=prior)

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
            text = await _classify_with_anthropic(
                user_content, settings.anthropic_api_key, settings.classifier_anthropic_model
            )
        else:
            text = await _classify_with_openai(
                user_content, settings.openai_api_key, settings.classifier_openai_model
            )

        parsed = json.loads(text)
        result = Classification(
            intent=parsed["intent"],
            needs_rag=bool(parsed["needs_rag"]),
            # Ground-truth override: if we can see a document in history, trust that
            # over the LLM's answer (it only saw the last 4 messages).
            has_prior_document=bool(parsed.get("has_prior_document", False)) or prior,
        )
        logger.info(
            "[intent] %s | needs_rag=%s | prior_doc=%s",
            result.intent, result.needs_rag, result.has_prior_document,
        )
        return result
    except Exception as err:
        logger.warning("[intent] Classification failed, using fallback: %s", err)
        return fallback


async def _classify_with_anthropic(user_content: str, api_key: str, model: str) -> str:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=model,
        max_tokens=128,
        system=CLASSIFIER_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    )
    return "".join(b.text for b in response.content if b.type == "text")


async def _classify_with_openai(user_content: str, api_key: str, model: str) -> str:
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
    return response.choices[0].message.content or ""
