# Portfolio Assistant Setup

## Architecture

```
Browser (Next.js UI)
  ↓ POST /api/chat
Server (/api/chat)
  ├─ calls Python RAG backend: POST /query
  ├─ gets chunks + metadata from Python
  └─ enhances with Claude or GPT-4o for conversation
  ↓ streams response
Browser
```

## Prerequisites

1. **Python RAG Backend Running**

   ```bash
   cd rag
   .\.venv\Scripts\python.exe scripts\04_server.py
   # Server starts on http://localhost:8000
   ```

2. **Environment Variables** (`.env.local`)

   You need **at least one** LLM API key:

   ```
   # Python RAG Backend
   RAG_BACKEND_URL=http://localhost:8000

   # Option A: Use Claude (preferred)
   ANTHROPIC_API_KEY=sk-ant-...

   # Option B: Use GPT-4o (fallback)
   OPENAI_API_KEY=sk-...
   ```

   **Strategy:**
   - If `ANTHROPIC_API_KEY` is set → uses Claude Sonnet 4
   - Else if `OPENAI_API_KEY` is set → uses GPT-4o
   - Else → throws error at startup

## Quick Start

### Terminal 1: Start Python RAG Backend

```bash
cd rag
.\.venv\Scripts\Activate.ps1
python scripts/04_server.py
```

Wait for: `Server ready at http://localhost:8000`

### Terminal 2: Start Next.js Dev Server

```bash
cd portfolio-assistant
pnpm dev
```

Open http://localhost:3000

## How It Works

1. **User asks a question** in the chat
2. **Next.js /api/chat route:**
   - Calls Python backend's `/query` endpoint
   - Gets 5 most relevant chunks from portfolio vault (with source capping & filtering)
   - Formats chunks into context
   - Sends context + conversation history to Claude or GPT-4o (based on available API keys)
   - Streams response back to browser

3. **Key Features:**
   - ✅ RAG handled entirely by Python (embeddings, vector search, source capping)
   - ✅ Conversation layer handled by Next.js + dual LLM support (Claude or GPT-4o)
   - ✅ Automatic fallback: prefers Anthropic, uses OpenAI if needed
   - ✅ No API key exposure to browser
   - ✅ Single source of truth for portfolio data
   - ✅ Easy to swap LLM (Python side: edit generation.py)
   - ✅ Easy to swap vector DB (Python side: edit database.py or use Qdrant)

## What Python Backend Provides

See `/rag/scripts/04_server.py`:

- **POST /query** → Answer questions with RAG

  ```json
  {
    "question": "Which projects involved payment?",
    "n_results": 5
  }
  ```

  Returns: chunks + answer + metadata

- **GET /health** → Server status check

## Customization

### Change how many chunks to retrieve

In `portfolio-assistant/src/app/api/chat/route.ts`, line ~52:

```typescript
const ragResult = await retrieve(message, 5); // change 5 to something else
```

### Switch LLM Backend

The system prefers Claude (Anthropic) but automatically falls back to GPT-4o (OpenAI).

**To use Claude:**

```
ANTHROPIC_API_KEY=sk-ant-...
# Leave OPENAI_API_KEY empty or unset
```

**To use GPT-4o only:**

```
# Leave ANTHROPIC_API_KEY empty
OPENAI_API_KEY=sk-...
```

All LLM logic is centralized in `src/lib/config.ts` and `src/app/api/chat/route.ts`.

### Change LLM behavior

Edit `SYSTEM_PROMPT` in `src/lib/config.ts` to adjust tone, instructions, etc.

All models (both Anthropic and OpenAI) respect the same system prompt.

### Change model versions

In `src/lib/config.ts`, update `LLM_CONFIG`:

```typescript
export const LLM_CONFIG = {
  anthropic: {
    model: "claude-sonnet-4-20250514", // Change this
    max_tokens: 1024,
  },
  openai: {
    model: "gpt-4o", // Or change this
    max_tokens: 1024,
  },
};
```

### Add source filtering

Update Python `retrieval.py` to implement source-specific routing

### Switch to Qdrant in production

1. Run Python migration: `.\.venv\Scripts\python.exe scripts\04_migrate_to_qdrant.py`
2. Update Python `.env` with `QDRANT_URL` and `QDRANT_API_KEY`
3. Update Python `config.py` to use Qdrant instead of ChromaDB
4. Restart Python backend
5. No changes needed to Next.js!

## Troubleshooting

### "ModuleNotFoundError" in Python

```bash
cd rag
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### "RAG backend error" in Next.js

- Check Python backend is running: http://localhost:8000/health
- Check `.env.local` RAG_BACKEND_URL is correct
- Check Python server logs for errors

### "ANTHROPIC_API_KEY missing"

Set in `.env.local` or just use `OPENAI_API_KEY` instead. Example:

```
OPENAI_API_KEY=sk-...
# Leave ANTHROPIC_API_KEY empty
```

## Dependencies

| Component                    | Purpose                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| Python: `portfolio_vault`    | RAG core (config, database, embedding, retrieval, generation) |
| Python: `FastAPI`            | REST server for RAG                                           |
| Python: `chromadb`           | Local vector DB (can swap for Qdrant)                         |
| Python: `openai`             | Embeddings                                                    |
| Python: `anthropic`          | LLM generation (fallback for Python backend)                  |
| Next.js: `@anthropic-ai/sdk` | Claude API (preferred for conversation layer)                 |
| Next.js: `openai`            | GPT-4o API (fallback for conversation layer)                  |

## Next Steps

- [ ] Add source/project filtering to chat UI
- [ ] Add document upload for vault
- [ ] Add resume generation workflow
- [ ] Deploy Python backend to cloud (Railway, Heroku, etc.)
- [ ] Add caching for frequently asked questions
