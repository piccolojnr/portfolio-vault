"""
core/context.py
---------------
Token-aware history trimming using tiktoken (cl100k_base encoding).

Ports lib/token-budget.ts verbatim.

Per-message token cost:
  content tokens  +  ROLE_OVERHEAD (4)  — matches OpenAI's counting spec.
  cl100k_base is used by GPT-4 and Claude uses a similar BPE tokenizer,
  so this is a good-enough approximation for both providers.
"""

from __future__ import annotations

from dataclasses import dataclass

import tiktoken

# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_HISTORY_BUDGET = 3000
ROLE_OVERHEAD = 4

# ── Encoder singleton (initialised once) ──────────────────────────────────────

_enc = tiktoken.get_encoding("cl100k_base")


# ── Types ─────────────────────────────────────────────────────────────────────

@dataclass
class TrimResult:
    """Result of trimming a conversation history to a token budget."""
    kept_messages: list[dict]    # {"role": ..., "content": ...} — sent to the LLM
    dropped_messages: list       # MessageRead objects — still in DB, used for summarisation
    dropped_count: int
    newest_trimmed_message_id: str | None  # ID of the most recently dropped message


# ── Public API ────────────────────────────────────────────────────────────────

def count_tokens(messages: list[dict]) -> int:
    """Count the tokens in an array of messages (content + role overhead each)."""
    return sum(len(_enc.encode(m["content"])) + ROLE_OVERHEAD for m in messages)


def trim_to_token_budget(messages: list, budget: int = DEFAULT_HISTORY_BUDGET) -> TrimResult:
    """
    Walk messages backwards, keeping the most recent ones that fit within
    budget tokens. Returns kept + dropped + metadata.

    messages: list of MessageRead objects (with .id, .role, .content), oldest → newest.
    """
    tokens_accumulated = 0
    split_index = len(messages)  # exclusive upper bound of the dropped slice

    for i in range(len(messages) - 1, -1, -1):
        msg_tokens = len(_enc.encode(messages[i].content)) + ROLE_OVERHEAD
        if tokens_accumulated + msg_tokens > budget:
            split_index = i + 1  # everything before this index is dropped
            break
        tokens_accumulated += msg_tokens
        split_index = i  # keep expanding the kept window

    dropped = messages[:split_index]
    kept_raw = messages[split_index:]

    kept_messages = [{"role": m.role, "content": m.content} for m in kept_raw]
    newest_trimmed_message_id = str(dropped[-1].id) if dropped else None

    return TrimResult(
        kept_messages=kept_messages,
        dropped_messages=dropped,
        dropped_count=len(dropped),
        newest_trimmed_message_id=newest_trimmed_message_id,
    )


def inject_summary(summary: str, history: list[dict]) -> list[dict]:
    """Prepend a synthetic user/assistant pair carrying the rolling summary."""
    return [
        {"role": "user", "content": f"[Earlier context: {summary}]"},
        {"role": "assistant", "content": "Understood, I have context from our earlier conversation."},
        *history,
    ]
