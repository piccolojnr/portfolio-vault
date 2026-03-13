"""
LLM Generation
==============

Generate answers using Anthropic Claude or OpenAI GPT.
"""

from portfolio_vault.config import (
    USE_DEMO, ANTHROPIC_KEY, OPENAI_KEY,
    ANTHROPIC_MODEL, OPENAI_MODEL
)

SYSTEM_PROMPT = """You are Daud Rahim's personal career assistant.

Guidelines:
- Answer ONLY using the context provided. Do not speculate or use external knowledge.
- Be specific and concrete: mention actual project names, numbers, technologies, and companies when they appear.
- If uncertain about a skill or experience, admit it rather than guessing.
- If the context doesn't contain enough information to answer, clearly state that.
- Highlight impact where possible: users reached, revenue processed, companies served, etc.
- Format lists clearly when appropriate."""


def generate(question: str, context_chunks: list[dict]) -> str:
    """
    Generate answer using the configured LLM.
    Defaults to Anthropic Claude, falls back to OpenAI GPT.
    """
    if USE_DEMO:
        return "[DEMO MODE — no real LLM call]"
    
    if ANTHROPIC_KEY:
        return generate_with_anthropic(question, context_chunks)
    elif OPENAI_KEY:
        return generate_with_openai(question, context_chunks)
    else:
        return "[ERROR] No API keys available."


def generate_with_anthropic(question: str, context_chunks: list[dict]) -> str:
    """Generate answer using Anthropic's Claude."""
    import anthropic
    
    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    
    # Format context
    context = "\n\n---\n\n".join([
        f"[Source: {c['source']} / {c['heading']}]\n{c['content']}"
        for c in context_chunks
    ])
    
    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=600,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"Context from Daud's portfolio vault:\n\n{context}\n\n---\n\nQuestion: {question}"
        }]
    )
    
    return response.content[0].text


def generate_with_openai(question: str, context_chunks: list[dict]) -> str:
    """Generate answer using OpenAI's GPT."""
    from openai import OpenAI
    
    client = OpenAI(api_key=OPENAI_KEY)
    
    # Format context
    context = "\n\n---\n\n".join([
        f"[Source: {c['source']} / {c['heading']}]\n{c['content']}"
        for c in context_chunks
    ])
    
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        max_tokens=600,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Context from Daud's portfolio vault:\n\n{context}\n\n---\n\nQuestion: {question}"
            }
        ]
    )
    
    return response.choices[0].message.content
