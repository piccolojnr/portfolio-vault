"""
Configuration & Environment Setup
==================================

Centralized .env loading and configuration constants.
All other modules import from here.
"""

import os
from pathlib import Path

# Root paths
RAG_DIR = Path(__file__).parent.parent
PROJECT_DIR = RAG_DIR.parent
DATA_DIR = RAG_DIR / "data"

# Ensure data dir exists
DATA_DIR.mkdir(exist_ok=True)

# Load .env file
def load_env():
    """Load environment variables from .env file."""
    env_path = RAG_DIR / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key.strip()] = value.strip()

# Execute on import
load_env()

# API Keys
OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")

# Flags
USE_DEMO = os.environ.get("DEMO_MODE") == "1"

# Default to DEMO if no API keys
if not USE_DEMO and not OPENAI_KEY and not ANTHROPIC_KEY:
    USE_DEMO = True

# ChromaDB
CHROMA_PATH = DATA_DIR / "chroma_db"
CHROMA_COLLECTION = "portfolio_vault"

# Chunks file
CHUNKS_FILE = DATA_DIR / "chunks.json"

# Embedding model
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMS = 1536

# LLM models
ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
OPENAI_MODEL = "gpt-4o"

# Status
def print_config():
    """Print configuration status."""
    print("="*60)
    print("Configuration Loaded")
    print("="*60)
    print(f"Project dir: {PROJECT_DIR}")
    print(f"RAG dir:     {RAG_DIR}")
    print(f"Data dir:    {DATA_DIR}")
    print(f"DEMO_MODE:   {USE_DEMO}")
    print(f"OpenAI key:  {'✓' if OPENAI_KEY else '✗'}")
    print(f"Anthropic key: {'✓' if ANTHROPIC_KEY else '✗'}")
    print(f"Qdrant URL:  {'✓' if QDRANT_URL else '✗'}")
    print("="*60)
