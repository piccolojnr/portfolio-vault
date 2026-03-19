# Chat Performance — Implementation Notes

## Implemented

### 1. Parallelize intent classification + retrieval
**File:** `domain/services/chat.py`

Intent classification and RAG retrieval now run concurrently with `asyncio.create_task`.
The retrieval task is cancelled if intent comes back as `conversational` (no RAG needed).
Expected saving: **500–1 500 ms** on retrieval-heavy turns (intent ~300 ms, retrieval ~800–1 200 ms
when sequential; now they overlap).

### 2. LightRAG query mode: `local` instead of `hybrid`
**File:** `domain/services/chat_pipeline.py`, `_retrieve()`

`mode="local"` restricts LightRAG to entity-focused vector/graph retrieval and skips the
global community-summary traversal.  For career-assistant point-lookup questions this is
faster with no accuracy loss.  Switch back to `"hybrid"` (or `"global"`) for broad
thematic queries if answer quality degrades.

### 3. `llm_model_max_async` raised to 4
**File:** `domain/services/lightrag_service.py`

Was set to 2 to limit cost during early ingestion testing.  Ingestion now runs in the
separate worker process, not in the API process, so raising to 4 only affects concurrent
LLM calls inside a single query — no ingestion cost risk.

---

## Not yet implemented — production/infra strategies

### 4. Intent caching for short follow-ups
For follow-up messages ≤ 20 tokens (e.g. "make it shorter", "add bullet points") the
intent is almost certainly `refinement`.  A heuristic short-circuit before calling the
classifier would save ~300 ms and one API call per follow-up turn.

```python
# sketch — add near the top of build_event_stream, before create_task calls
SHORT_FOLLOWUP_RE = re.compile(r"^.{0,100}$")  # tune threshold
REFINEMENT_PHRASES = {"shorter", "longer", "bullet", "format", "rewrite", "fix"}
if (
    any(p in message.lower() for p in REFINEMENT_PHRASES)
    and len(message.split()) <= 15
    and any(m["role"] == "assistant" and DOC_RE.search(m.get("content","")) for m in history)
):
    classification = Classification(intent="refinement", needs_rag=False)
    # skip intent_task and retrieval_task entirely
```

Only add this once you have enough production data to validate the heuristic — a false
`refinement` classification suppresses retrieval and produces worse answers than a
false `retrieval` classification.

### 5. Speculative streaming (pipeline overlap)
Stream the first tokens of the LLM response to the browser while DB persistence and
source resolution happen after the stream ends.  This is already the architecture
(`_stream_llm` streams tokens, then persists); the remaining gap is the **retrieval
latency** before the first token.  Points 1–3 above reduce that gap.  True speculative
streaming (start the LLM before retrieval completes) would require streaming the context
in-flight to the LLM, which no major provider supports today.

### 6. Qdrant `n_results` tuning
LightRAG passes a fixed `top_k` to Qdrant (default: varies by mode).  For
`mode="local"` the default is already conservative.  If response quality is high and you
want to trade some accuracy for speed, pass `QueryParam(mode="local", top_k=3)`.  If
quality is low, raise to 10.  Requires benchmarking against your actual query set.

```python
# in _retrieve(), replace:
param = QueryParam(mode=mode)
# with:
param = QueryParam(mode=mode, top_k=5)   # default is usually 5–10; tune empirically
```

### 7. Keep LightRAG instance warm (deployment config)
`get_or_create_instance` initialises the LightRAG instance (opens PG pool, Qdrant
connection) on first query after a cold start.  On Render/Railway free tier this can
add 3–8 s to the first request after a long idle.

Options:
- **Health-check warm-up:** call `get_or_create_instance(CORPUS_ID, settings)` in the
  FastAPI lifespan after `open_db_engine`, so the instance is ready before the first
  user request.
- **Minimum instances:** set `minInstances: 1` (Render) or equivalent to prevent the
  container from sleeping.
- **Ping cron:** a UptimeRobot / cron-job.org ping every 10 minutes keeps the process
  alive on free-tier hosts.

### 8. Separate web and worker processes
Already implemented (Procfile + `rag worker` CLI command).  The key production benefit
is that long-running LightRAG ingestion jobs no longer block or delay web request
handling — they run in the worker process on a separate dyno/instance.

### 9. Connection pool sizing
`open_db_engine` uses `pool_size=5, max_overflow=10`.  Under concurrent chat load
each request holds a connection for the duration of history fetch + message persist
(~50–200 ms).  If p95 latency climbs under load, raise `pool_size` to 10.  Monitor
`pool_timeout` errors in logs as the signal.

### 10. Response streaming is already on
Tokens are streamed to the browser as they arrive from the LLM.  The perceived latency
is **time-to-first-token** (intent + retrieval + LLM TTFT), not total generation time.
Points 1–3 above are the highest-leverage improvements for TTFT.
