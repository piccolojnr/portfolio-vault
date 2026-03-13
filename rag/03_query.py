"""
STAGE 1C: Retrieval + Generation (the full RAG loop)
====================================================

This is the complete pipeline:
  1. User asks a question
  2. Embed the question → query vector
  3. Vector DB finds the most similar chunks → retrieved context
  4. Build a prompt: system + retrieved chunks + question
  5. Send to Claude (or any LLM) → answer

The key insight: the LLM never sees ALL your vault files.
It only sees the 4-5 chunks the vector search decided were relevant.
That's what makes RAG scale to huge knowledge bases.

Run:
  OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-... python3 03_query.py
  DEMO_MODE=1 python3 03_query.py   (shows structure without real results)
"""

import os
import json
import math
import random
from pathlib import Path
import chromadb

# Load .env file
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ[key.strip()] = value.strip()

USE_DEMO = os.environ.get("DEMO_MODE") == "1"
OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")

if not USE_DEMO and not OPENAI_KEY and not ANTHROPIC_KEY:
    print("Missing API keys — running in DEMO_MODE.")
    USE_DEMO = True

# --- Load the ChromaDB collection we built in step 2 ---
PROJECT_PATH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chroma_path = os.path.join(PROJECT_PATH, "rag", "data", "chroma_db")
chroma_client = chromadb.PersistentClient(path=chroma_path)
collection = chroma_client.get_collection("portfolio_vault")
print(f"Loaded ChromaDB collection: {collection.count()} chunks\n")


def embed(texts):
    if USE_DEMO:
        vectors = []
        for text in texts:
            random.seed(hash(text) % (2**32))
            vec = [random.gauss(0, 1) for _ in range(16)]
            mag = math.sqrt(sum(x**2 for x in vec))
            vectors.append([x / mag for x in vec])
        return vectors
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_KEY)
    resp = client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [item.embedding for item in resp.data]


def retrieve(query: str, n: int = 5) -> list[dict]:
    """
    The retrieval step.
    Embed the query → find n nearest chunks → return them.
    
    This is the heart of RAG. Everything else is just plumbing.
    """
    query_vector = embed([query])[0]
    
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=n,
        include=["documents", "metadatas", "distances"],
    )
    
    retrieved = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        retrieved.append({
            "content":    doc,
            "source":     meta["source"],
            "heading":    meta["heading"],
            "similarity": round(1 - dist, 3),
        })
    
    return retrieved


def generate_with_anthropic(question: str, context_chunks: list[dict]) -> str:
    """
    Generate answer using Anthropic's Claude.
    """
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    
    # Format retrieved chunks into a readable context block
    context = "\n\n---\n\n".join([
        f"[Source: {c['source']} / {c['heading']}]\n{c['content']}"
        for c in context_chunks
    ])
    
    system = """You are Daud Rahim's personal career assistant.
Answer questions about his experience, skills, and projects using ONLY the context provided.
Be specific and concrete. Use numbers and project names when they appear in the context.
If the context doesn't contain enough information, say so."""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        system=system,
        messages=[{
            "role": "user",
            "content": f"Context from Daud's portfolio vault:\n\n{context}\n\n---\n\nQuestion: {question}"
        }]
    )
    
    return response.content[0].text


def generate_with_openai(question: str, context_chunks: list[dict]) -> str:
    """
    Generate answer using OpenAI's GPT.
    """
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_KEY)
    
    # Format retrieved chunks into a readable context block
    context = "\n\n---\n\n".join([
        f"[Source: {c['source']} / {c['heading']}]\n{c['content']}"
        for c in context_chunks
    ])
    
    system = """You are Daud Rahim's personal career assistant.
Answer questions about his experience, skills, and projects using ONLY the context provided.
Be specific and concrete. Use numbers and project names when they appear in the context.
If the context doesn't contain enough information, say so."""

    response = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=600,
        messages=[
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": f"Context from Daud's portfolio vault:\n\n{context}\n\n---\n\nQuestion: {question}"
            }
        ]
    )
    
    return response.choices[0].message.content


def generate(question: str, context_chunks: list[dict]) -> str:
    """
    The generation step.
    Build a prompt with the retrieved chunks as context, send to LLM.
    
    Defaults to Anthropic. Falls back to OpenAI if Anthropic key is unavailable.
    Notice: we're NOT sending all 130 chunks. Only the 5 most relevant.
    """
    if USE_DEMO:
        return "[DEMO MODE — no real LLM call. Would send these chunks to Claude as context.]"
    
    # Default to Anthropic, fall back to OpenAI
    if ANTHROPIC_KEY:
        return generate_with_anthropic(question, context_chunks)
    elif OPENAI_KEY:
        return generate_with_openai(question, context_chunks)
    else:
        return "[ERROR] No API keys available."


def ask(question: str):
    print(f"\nQuestion: {question}")
    print("-" * 50)
    
    # Step 1: Retrieve relevant chunks
    chunks = retrieve(question, n=5)
    
    print(f"Retrieved {len(chunks)} chunks:")
    for c in chunks:
        icon = "G" if c['similarity'] > 0.7 else "Y" if c['similarity'] > 0.4 else "R"
        print(f"  [{icon}] sim={c['similarity']}  {c['source']} / {c['heading']}")
    
    # Step 2: Generate answer using retrieved chunks as context
    print(f"\nAnswer:")
    answer = generate(question, chunks)
    print(answer)
    print()


# --- Run some test queries ---
ask("Which of Daud's projects involved payment processing?")
ask("What IoT or hardware work has Daud done?")
ask("How many users has Daud's work reached?")
ask("What is Daud's strongest technical skill?")

