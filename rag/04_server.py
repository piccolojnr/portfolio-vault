"""
STAGE 1D: REST API Server — Expose RAG pipeline as HTTP endpoints
==================================================================

A FastAPI server that wraps the query logic from 03_query.py and exposes it
as JSON REST endpoints.

Run:
  pip install fastapi uvicorn
  python 04_server.py

Access:
  POST http://localhost:8000/query
    {"question": "Which projects involved payment processing?"}
  
  GET http://localhost:8000/health
  GET http://localhost:8000/docs  (interactive API docs)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
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
    print("Warning: Missing API keys. Using DEMO_MODE.")
    USE_DEMO = True

# Load ChromaDB
PROJECT_PATH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chroma_path = os.path.join(PROJECT_PATH, "rag", "data", "chroma_db")
chroma_client = chromadb.PersistentClient(path=chroma_path)
collection = chroma_client.get_collection("portfolio_vault")

print(f"✓ Loaded ChromaDB collection: {collection.count()} chunks")
print(f"✓ DEMO_MODE: {USE_DEMO}")
print(f"✓ OpenAI API Key: {'✓' if OPENAI_KEY else '✗'}")
print(f"✓ Anthropic API Key: {'✓' if ANTHROPIC_KEY else '✗'}")

# FastAPI app
app = FastAPI(
    title="Portfolio Vault RAG API",
    description="Ask questions about Daud Rahim's experience, skills, and projects",
    version="1.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class QueryRequest(BaseModel):
    question: str
    n_results: int = 5
    max_per_source: int = 2


class RetrievedChunk(BaseModel):
    content: str
    source: str
    heading: str
    similarity: float


class QueryResponse(BaseModel):
    question: str
    retrieved_chunks: list[RetrievedChunk]
    answer: str
    mode: str  # "demo" or "real"


# Embedding function
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


# Query routing
def route_query(query: str):
    """Determine which sources to search based on query intent."""
    query_lower = query.lower()
    
    if any(x in query_lower for x in ["which project", "what project", "built a", "created a", "developed a", "launched"]):
        return {"source": {"$contains": "project_"}}
    
    if any(x in query_lower for x in ["how many", "how much", "users", "processed", "revenue", "impact", "reach"]):
        return {"source": {"$contains": "brag"}}
    
    if any(x in query_lower for x in ["skill", "expertise", "best at", "experience with", "proficient", "strong in"]):
        return None
    
    return None


# Retrieval
def retrieve(query: str, n: int = 5, max_per_source: int = 2, confidence_threshold: float = 0.4):
    """Retrieve relevant chunks from the vector database."""
    query_vector = embed([query])[0]
    where_filter = route_query(query)
    routing_attempted = where_filter is not None
    
    results = collection.query(
        query_embeddings=[query_vector],
        n_results=n * 3,
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )
    
    all_results = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        all_results.append({
            "content": doc,
            "source": meta["source"],
            "heading": meta["heading"],
            "similarity": round(1 - dist, 3),
        })
    
    # Confidence-based fallback
    if routing_attempted and all_results and all_results[0]["similarity"] < confidence_threshold:
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
                "content": doc,
                "source": meta["source"],
                "heading": meta["heading"],
                "similarity": round(1 - dist, 3),
            })
    elif routing_attempted and not all_results:
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
                "content": doc,
                "source": meta["source"],
                "heading": meta["heading"],
                "similarity": round(1 - dist, 3),
            })
    
    # Source capping
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


# Generation
def generate(question: str, context_chunks: list[dict]) -> str:
    """Generate answer using LLM."""
    if USE_DEMO:
        return "[DEMO MODE — no real LLM call]"
    
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

    if ANTHROPIC_KEY:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
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
    elif OPENAI_KEY:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_KEY)
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
    else:
        return "[ERROR] No API keys available."


# Routes
@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "chunks_loaded": collection.count(),
        "demo_mode": USE_DEMO,
    }


@app.post("/query", response_model=QueryResponse)
async def query_endpoint(request: QueryRequest):
    """
    Ask a question about Daud's experience.
    
    Returns the question, retrieved chunks, and generated answer.
    """
    try:
        # Retrieve relevant chunks
        chunks = retrieve(request.question, n=request.n_results, max_per_source=request.max_per_source)
        
        if not chunks:
            raise HTTPException(status_code=404, detail="No relevant chunks found")
        
        # Generate answer
        answer = generate(request.question, chunks)
        
        return QueryResponse(
            question=request.question,
            retrieved_chunks=[
                RetrievedChunk(
                    content=c["content"],
                    source=c["source"],
                    heading=c["heading"],
                    similarity=c["similarity"],
                )
                for c in chunks
            ],
            answer=answer,
            mode="demo" if USE_DEMO else "real",
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    """Welcome endpoint with documentation."""
    return {
        "name": "Portfolio Vault RAG API",
        "description": "Ask questions about Daud Rahim's experience, skills, and projects",
        "endpoints": {
            "health": "GET /health",
            "query": "POST /query",
            "docs": "GET /docs (interactive Swagger UI)",
        },
        "example_questions": [
            "Which of Daud's projects involved payment processing?",
            "What IoT or hardware work has Daud done?",
            "How many users has Daud's work reached?",
            "What is Daud's strongest technical skill?",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print("Starting Portfolio Vault RAG API Server")
    print("=" * 60)
    print("📚 Interactive docs: http://localhost:8000/docs")
    print("💬 Query endpoint:   POST http://localhost:8000/query")
    print("=" * 60 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
