"""
Cost constants and calculators.

Prices as of 2025 — update these when provider pricing changes.
"""

# ── Embedding models ───────────────────────────────────────────────────────────

EMBEDDING_MODELS: dict[str, float] = {
    # model_id: cost_per_token
    "text-embedding-3-small": 0.02 / 1_000_000,
    "text-embedding-3-large": 0.13 / 1_000_000,
}

# ── Generation models ──────────────────────────────────────────────────────────

ANTHROPIC_MODELS = [
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
]

OPENAI_GEN_MODELS = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
]

# (input_cost_per_token, output_cost_per_token)
GENERATION_COSTS: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5-20251001": (0.25 / 1_000_000, 1.25 / 1_000_000),
    "claude-sonnet-4-6":         (3.00 / 1_000_000, 15.0 / 1_000_000),
    "claude-opus-4-6":           (15.0 / 1_000_000, 75.0 / 1_000_000),
    "gpt-4o":                    (2.50 / 1_000_000, 10.0 / 1_000_000),
    "gpt-4o-mini":               (0.15 / 1_000_000, 0.60 / 1_000_000),
    "gpt-4.1":                   (2.00 / 1_000_000,  8.0 / 1_000_000),
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def embedding_cost(token_count: int, model: str) -> float:
    rate = EMBEDDING_MODELS.get(model, 0.02 / 1_000_000)
    return round(token_count * rate, 8)


def generation_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    in_rate, out_rate = GENERATION_COSTS.get(model, (0.0, 0.0))
    return round(input_tokens * in_rate + output_tokens * out_rate, 8)
