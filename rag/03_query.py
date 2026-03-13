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
env_path = Path(__file__).parent / ".env"
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


def route_query(query: str):
    """
    Determine which sources to search based on query intent.
    Returns metadata filter or None (no filter = search all sources).
    """
    query_lower = query.lower()
    
    # Project-specific queries: "which project", "built a", etc.
    if any(x in query_lower for x in ["which project", "what project", "built a", "created a", "developed a", "launched"]):
        return {"source": {"$contains": "project_"}}
    
    # Impact/metric queries: focus on brag_sheet (has the wins and numbers)
    if any(x in query_lower for x in ["how many", "how much", "users", "processed", "revenue", "impact", "reach"]):
        return {"source": {"$contains": "brag"}}
    
    # Skills/tech queries: search everything (skills, bio, and projects all relevant)
    if any(x in query_lower for x in ["skill", "expertise", "best at", "experience with", "proficient", "strong in"]):
        return None  # No filter
    
    # Default: search everything
    return None


def retrieve(query: str, n: int = 5, max_per_source: int = 2, confidence_threshold: float = 0.4) -> list[dict]:
    """
    The retrieval step with intelligent routing, confidence fallback, and source capping.
    
    Features:
    1. Intent-based query routing: detects query type and applies smart filters
    2. Confidence threshold: if top result < threshold, fall back to unfiltered search
    3. Source capping: prevents one source from dominating results
    4. Similarity sorting: applies source cap AFTER sorting by relevance
    
    Embed the query → route based on intent → retrieve → apply caps → return.
    """
    query_vector = embed([query])[0]
    
    # Step 1: Determine routing intent
    where_filter = route_query(query)
    routing_attempted = where_filter is not None
    
    # Step 2: Retrieve 3x what we need to account for filtering
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=n * 3,
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )
    
    # Step 3: Build results list (already sorted by similarity from ChromaDB)
    all_results = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        all_results.append({
            "content":    doc,
            "source":     meta["source"],
            "heading":    meta["heading"],
            "similarity": round(1 - dist, 3),
        })
    
    # Step 4: Confidence-based fallback
    # If routing was attempted but top result is below threshold, retry without filter
    if routing_attempted and all_results and all_results[0]["similarity"] < confidence_threshold:
        print(f"  [ROUTING] Low confidence ({all_results[0]['similarity']}). Falling back to full search.\n")
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=n * 3,
            include=["documents", "metadatas", "distances"],
        )
        all_results = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            all_results.append({
                "content":    doc,
                "source":     meta["source"],
                "heading":    meta["heading"],
                "similarity": round(1 - dist, 3),
            })
    elif routing_attempted and all_results:
        print(f"  [ROUTING] Filtered: {all_results[0]['source']} (confidence: {all_results[0]['similarity']}).\n")
    elif routing_attempted:
        print(f"  [ROUTING] Filter returned no results. Falling back to full search.\n")
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=n * 3,
            include=["documents", "metadatas", "distances"],
        )
        all_results = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            all_results.append({
                "content":    doc,
                "source":     meta["source"],
                "heading":    meta["heading"],
                "similarity": round(1 - dist, 3),
            })
    
    # Step 5: Source capping with proper sorting
    # All_results are already sorted by similarity. Now apply per-source limit.
    source_counts = {}
    retrieved = []
    
    for result in all_results:
        source = result["source"]
        count = source_counts.get(source, 0)
        
        if count < max_per_source:
            retrieved.append(result)
            source_counts[source] = count + 1
        
        if len(retrieved) >= n:
            break
    
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

Guidelines:
- Answer ONLY using the context provided. Do not speculate or use external knowledge.
- Be specific and concrete: mention actual project names, numbers, technologies, and companies when they appear.
- If uncertain about a skill or experience, admit it rather than guessing.
- If the context doesn't contain enough information to answer, clearly state that.
- Highlight impact where possible: users reached, revenue processed, companies served, etc.
- Format lists clearly when appropriate."""

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

Guidelines:
- Answer ONLY using the context provided. Do not speculate or use external knowledge.
- Be specific and concrete: mention actual project names, numbers, technologies, and companies when they appear.
- If uncertain about a skill or experience, admit it rather than guessing.
- If the context doesn't contain enough information to answer, clearly state that.
- Highlight impact where possible: users reached, revenue processed, companies served, etc.
- Format lists clearly when appropriate."""

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

