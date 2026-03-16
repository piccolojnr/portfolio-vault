"""RAG request/response schemas (retrieve + query endpoints)."""

from pydantic import BaseModel


class QueryRequest(BaseModel):
    question: str
    n_results: int = 5


class RetrievedChunk(BaseModel):
    content: str
    source: str
    heading: str
    similarity: float


class RetrieveResponse(BaseModel):
    question: str
    retrieved_chunks: list[RetrievedChunk]
    mode: str


class QueryResponse(BaseModel):
    question: str
    retrieved_chunks: list[RetrievedChunk]
    answer: str
    mode: str
