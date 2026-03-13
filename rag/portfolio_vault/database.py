"""
Vector Database Connection
===========================

Handles ChromaDB and Qdrant connections.
"""

import chromadb
from portfolio_vault.config import CHROMA_PATH, CHROMA_COLLECTION

# Global collection instance (lazy-loaded)
_chroma_collection = None

def get_chroma_collection():
    """Get or initialize ChromaDB collection."""
    global _chroma_collection
    
    if _chroma_collection is None:
        client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        _chroma_collection = client.get_collection(CHROMA_COLLECTION)
    
    return _chroma_collection

def get_collection():
    """Alias for backward compatibility."""
    return get_chroma_collection()
