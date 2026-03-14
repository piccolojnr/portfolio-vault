"""
LLM Generation
==============

Generate answers using Anthropic Claude or OpenAI GPT.
Returns (answer, usage_info) where usage_info carries token counts and cost.
"""

from __future__ import annotations

SYSTEM_PROMPT = """You are Daud Rahim's personal career assistant.

Guidelines:
- Answer ONLY using the context provided. Do not speculate or use external knowledge.
- Be specific and concrete: mention actual project names, numbers, technologies, and companies when they appear.
- If uncertain about a skill or experience, admit it rather than guessing.
- If the context doesn't contain enough information to answer, clearly state that.
- Highlight impact where possible: users reached, revenue processed, companies served, etc.
- Format lists clearly when appropriate."""


def generate(
    question: str,
    context_chunks: list[dict],
    settings=None,
) -> tuple[str, dict]:
    """
    Generate answer using the configured LLM.

    Returns:
        (answer_text, usage_info)
        usage_info keys: provider, model, input_tokens, output_tokens, total_tokens, cost_usd
    """
    if settings is None:
        from app.config import get_settings
        settings = get_settings()

    if settings.use_demo:
        return "[DEMO MODE — no real LLM call]", {}

    if settings.anthropic_api_key:
        return _generate_anthropic(question, context_chunks, settings)
    elif settings.openai_api_key:
        return _generate_openai(question, context_chunks, settings)
    else:
        return "[ERROR] No API keys available.", {}


def _build_context(context_chunks: list[dict]) -> str:
    return "\n\n---\n\n".join(
        f"[Source: {c['source']} / {c['heading']}]\n{c['content']}"
        for c in context_chunks
    )


def _generate_anthropic(
    question: str, context_chunks: list[dict], settings
) -> tuple[str, dict]:
    import anthropic
    from core.costs import generation_cost

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    context = _build_context(context_chunks)

    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=600,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"Context from Daud's portfolio vault:\n\n{context}\n\n---\n\nQuestion: {question}",
        }],
    )

    in_tok = response.usage.input_tokens
    out_tok = response.usage.output_tokens
    usage = {
        "provider": "anthropic",
        "model": settings.anthropic_model,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "total_tokens": in_tok + out_tok,
        "cost_usd": generation_cost(in_tok, out_tok, settings.anthropic_model),
    }
    return response.content[0].text, usage


def _generate_openai(
    question: str, context_chunks: list[dict], settings
) -> tuple[str, dict]:
    from openai import OpenAI
    from core.costs import generation_cost

    client = OpenAI(api_key=settings.openai_api_key)
    context = _build_context(context_chunks)

    response = client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=600,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Context from Daud's portfolio vault:\n\n{context}\n\n---\n\nQuestion: {question}",
            },
        ],
    )

    in_tok = response.usage.prompt_tokens
    out_tok = response.usage.completion_tokens
    usage = {
        "provider": "openai",
        "model": settings.openai_model,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "total_tokens": in_tok + out_tok,
        "cost_usd": generation_cost(in_tok, out_tok, settings.openai_model),
    }
    return response.choices[0].message.content, usage
