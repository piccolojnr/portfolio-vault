"""
LLM Generation
==============

Generate answers using Anthropic Claude or OpenAI GPT.
Accepts a Settings instance for dependency injection.
"""

SYSTEM_PROMPT = """You are Daud Rahim's personal career assistant.

Guidelines:
- Answer ONLY using the context provided. Do not speculate or use external knowledge.
- Be specific and concrete: mention actual project names, numbers, technologies, and companies when they appear.
- If uncertain about a skill or experience, admit it rather than guessing.
- If the context doesn't contain enough information to answer, clearly state that.
- Highlight impact where possible: users reached, revenue processed, companies served, etc.
- Format lists clearly when appropriate."""


def generate(question: str, context_chunks: list[dict], settings=None) -> str:
    """
    Generate answer using the configured LLM.
    Defaults to Anthropic Claude, falls back to OpenAI GPT.
    """
    if settings is None:
        from app.config import get_settings
        settings = get_settings()

    if settings.use_demo:
        return "[DEMO MODE — no real LLM call]"

    if settings.anthropic_api_key:
        return _generate_with_anthropic(question, context_chunks, settings)
    elif settings.openai_api_key:
        return _generate_with_openai(question, context_chunks, settings)
    else:
        return "[ERROR] No API keys available."


def _generate_with_anthropic(question: str, context_chunks: list[dict], settings) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    context = "\n\n---\n\n".join([
        f"[Source: {c['source']} / {c['heading']}]\n{c['content']}"
        for c in context_chunks
    ])

    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=600,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"Context from Daud's portfolio vault:\n\n{context}\n\n---\n\nQuestion: {question}",
        }],
    )

    return response.content[0].text


def _generate_with_openai(question: str, context_chunks: list[dict], settings) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)

    context = "\n\n---\n\n".join([
        f"[Source: {c['source']} / {c['heading']}]\n{c['content']}"
        for c in context_chunks
    ])

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

    return response.choices[0].message.content
