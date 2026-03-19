# Portfolio Assistant — Next.js Frontend

Next.js App Router frontend for the Portfolio Vault RAG system. Provides a chat interface, vault document editor, pipeline control panel, and settings management.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |
| UI | shadcn/ui components |
| Markdown editor | `@uiw/react-md-editor` |
| Package manager | pnpm |

## Project Structure

```
portfolio-assistant/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout: global header + nav
│   │   ├── page.tsx             # Chat page (default route)
│   │   ├── vault/
│   │   │   ├── page.tsx         # Document list with search + reindex
│   │   │   └── [slug]/page.tsx  # Markdown editor for a single document
│   │   ├── pipeline/
│   │   │   └── page.tsx         # Pipeline control panel + run history
│   │   ├── settings/
│   │   │   └── page.tsx         # API keys + model config
│   │   └── api/                 # Next.js API proxy routes (forward to FastAPI)
│   │       ├── chat/route.ts
│   │       ├── vault/
│   │       │   ├── documents/route.ts
│   │       │   ├── documents/[slug]/route.ts
│   │       │   ├── reindex/route.ts
│   │       │   └── reindex/[runId]/route.ts
│   │       ├── pipeline/
│   │       │   ├── runs/route.ts
│   │       │   ├── runs/[runId]/route.ts
│   │       │   ├── cost-estimate/route.ts
│   │       │   └── run/route.ts      # SSE passthrough
│   │       └── settings/route.ts
│   ├── components/
│   │   ├── header-nav.tsx       # Top navigation (chat / vault / pipeline / settings)
│   │   └── ui/                  # shadcn/ui components
│   └── lib/
│       ├── vault.ts             # Typed API client for vault endpoints
│       ├── pipeline.ts          # Typed API client for pipeline endpoints + SSE
│       └── settings.ts          # Typed API client for settings endpoints
└── package.json / pnpm-lock.yaml
```

## Setup

### 1. Install dependencies

```bash
cd portfolio-assistant
pnpm install
```

### 2. Configure environment

Create `.env.local` in `memra-app/`:

```env
# Backend API base URL used by Next.js API proxy routes
RAG_BACKEND_URL=http://localhost:8000

# Cookie/JWT verification secrets (server-side middleware)
JWT_SECRET=your-org-jwt-secret
ADMIN_JWT_SECRET=your-platform-admin-jwt-secret

# Domain routing (subdomain middleware)
APP_DOMAIN=app.memra.local
ADMIN_DOMAIN=admin.memra.local

# Optional client-side metadata
NEXT_PUBLIC_APP_NAME=Memra
NEXT_PUBLIC_APP_URL=http://app.memra.local
```

If `RAG_BACKEND_URL` is omitted, it defaults to `http://localhost:8000`.

### 3. Run the development server

```bash
pnpm dev
```

The app is available at `http://localhost:3000`.

## Pages

### Chat — `/`

The main interface. Type a question and the assistant answers using the RAG pipeline.

- Questions are sent to `POST /api/v1/query` on the Python server.
- Responses include the generated answer and the source chunks used.
- Demo mode (no API keys configured) returns a placeholder response.

### Vault — `/vault`

Browse and manage vault documents.

- Search by title or slug.
- Documents grouped by type (project, bio, skills, experience, brag).
- Paginated list with quick links to the editor.
- **Reindex** button runs the full pipeline and shows live SSE progress.
- **New document** form creates a document directly in the DB.

### Vault Editor — `/vault/[slug]`

Full-page markdown editor for a single document.

- Live preview using `@uiw/react-md-editor` in dark mode.
- Dirty state detection — unsaved changes show a warning badge.
- **Cmd+S** / **Ctrl+S** saves without clicking.
- **Auto-reindex** toggle: when enabled, saving automatically triggers a background pipeline reindex.

### Pipeline — `/pipeline`

Control panel for the embedding pipeline.

- **Cost estimate** cards showing word count, estimated tokens, and estimated USD cost before running.
- **Run full pipeline** button streams live progress events over SSE (chunked → embedded → done).
- **Run history** table with paginated past runs: date, status, chunk count, token count, cost.

### Settings — `/settings`

Runtime configuration persisted to the DB (encrypted at rest).

- **API Keys**: set or clear OpenAI and Anthropic keys. Status shown as `● set` / `○ not set`; the actual key is never returned.
- **Models**: dropdowns for embedding model, Anthropic generation model, and OpenAI generation model.
- **Cost limit**: USD cap per pipeline run (0 = no limit).

## API Proxy Design

All backend requests go through Next.js API routes under `src/app/api/`. This avoids CORS issues and keeps `NEXT_PUBLIC_API_URL` server-side only.

Each proxy route forwards the request to the Python server. The SSE pipeline run route passes through the `ReadableStream` body directly:

```ts
// src/app/api/pipeline/run/route.ts
const res = await fetch(`${API_URL}/api/v1/pipeline/run`, {
  method: "POST",
  signal: req.signal,
});
return new Response(res.body, {
  headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
});
```

The frontend reads SSE from `POST` requests via `fetch()` + `ReadableStream` reader — not `EventSource`, which only supports GET.

## API Client Libraries

### `src/lib/vault.ts`

```ts
listDocuments(page?, search?, type?)  → Promise<PaginatedDocs>
getDocument(slug)                      → Promise<VaultDocDetail>
updateDocument(slug, content)          → Promise<VaultDocDetail>
deleteDocument(slug)                   → Promise<void>
triggerReindex(slug?)                  → Promise<ReindexResponse>
getReindexStatus(slug, runId)          → Promise<ReindexStatus>
```

### `src/lib/pipeline.ts`

```ts
listRuns(page?)          → Promise<PipelineRunList>
getRun(runId)            → Promise<PipelineRunSummary>
getCostEstimate()        → Promise<CostEstimate>
runPipeline(onEvent)     → Promise<void>   // streams SSE, calls onEvent per event
```

### `src/lib/settings.ts`

```ts
getSettings()            → Promise<SettingsRead>
updateSettings(patch)    → Promise<SettingsRead>
```

## Navigation

`HeaderNav` (`src/components/header-nav.tsx`) renders four links, with the active route highlighted via `usePathname()`:

| Label | Route |
|---|---|
| `chat` | `/` |
| `vault` | `/vault` |
| `pipeline` | `/pipeline` |
| `settings` | `/settings` |

## Development Notes

- Use **pnpm**, not npm or yarn.
- The markdown editor requires `"use client"` and a `<div data-color-mode="dark">` wrapper for dark theme.
- Tailwind v4 config lives in `globals.css` — add new utility tokens there, not in a config file.
- Add shadcn/ui components with `pnpm dlx shadcn add <component>`.
