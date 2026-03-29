# Project: Memraiq — AI-Powered Portfolio RAG Platform

---

## Overview

| | |
|---|---|
| **Status** | Live — v1 deployed; v2 in active development |
| **Period** | March 2026 – Present |
| **Role** | Solo developer — designed, built, deployed, and maintaining |
| **Creator** | Daud Rahim |
| **Type** | Solo / Personal SaaS |
| **Client / Organisation** | Self — personal product |
| **Industry** | AI / Developer Tools / SaaS |
| **Confidential?** | No — live product; screenshots and live demo available |

---

## The problem

Professionals and developers accumulate large amounts of personal documentation — portfolios, notes, project writeups, CVs, experience logs — but have no intelligent way to query or surface insights from them. Static documents require manual searching and context-switching. There was no tool purpose-built for asking natural language questions against a personal knowledge vault and getting grounded, cited answers back. I built Memraiq to solve that.

---

## What I did

- Designed the entire platform architecture from scratch — service boundaries, data model, auth flow, RAG pipeline, and deployment topology
- Built and deployed the full-stack v1 application: Next.js frontend, FastAPI backend, Qdrant vector store, and LightRAG integration
- Built a custom RAG system from scratch (memra-rag) as the foundation for v2 — including custom semantic chunking, multi-stage retrieval, query classification, cross-encoder reranking, and Neo4j graph store integration
- Implemented a multi-tenant API with per-org data isolation, encrypted API key storage, conversation history, and cost tracking
- Built the frontend chat interface with streaming answers, source citations, a full markdown vault editor, and a real-time pipeline control panel with SSE progress streaming
- Set up the full deployment infrastructure across Vercel (frontend), Railway (API + RAG service), Supabase (PostgreSQL), and Qdrant cloud (vectors)
- Navigated LightRAG's limitations and made the architectural decision to build a custom RAG pipeline to gain full control over chunking, retrieval quality, and cost

---

## How I did it

**Tools & technologies:**

*Frontend (memra-app):*
- Next.js 15 (App Router), React 19, Tailwind CSS v4
- shadcn/ui component library
- TanStack Query (data fetching + caching)
- PDF.js (document viewing), react-markdown, Highlight.js
- Server-Sent Events (SSE) for streaming pipeline progress
- JWT-based auth with Next.js middleware

*Backend v1 (memra-api):*
- FastAPI + uvicorn, SQLModel, PostgreSQL via Supabase
- Qdrant (vector database — local file or cloud)
- LightRAG (RAG layer — used in v1 / deployed version)
- Anthropic Claude + OpenAI (LLM generation + embeddings)
- Fernet encryption for stored API keys
- python-docx + weasyprint for document export (DOCX, PDF)

*Custom RAG system (memra-rag — powers v2):*
- FastAPI service, sentence-transformers, spaCy
- Qdrant (vector search) + Neo4j (knowledge graph)
- Semantic chunker with heading/sentence/overlap strategies
- Query classifier and expansion module
- Cross-encoder reranker for result relevance scoring
- Called by API over Railway private network with shared-secret auth

*Backend v2 (memra-api-v2):*
- FastAPI, SQLModel + Alembic migrations, PostgreSQL
- PyJWT + bcrypt for auth, pytest for testing
- Replaces LightRAG dependency with memra-rag service

*Infrastructure:*
- Vercel (memra-app), Railway (memra-api, memra-rag), Supabase (database), Qdrant cloud (vectors)
- Domains: memraiq.com, app.memraiq.com, admin.memraiq.com

**Approach / methodology:**

Started with a working v1 to validate the concept quickly — integrated LightRAG as the RAG layer to move fast, built the frontend and API around it, and shipped a live product. Once v1 was stable and deployed, I identified the ceiling of LightRAG as a dependency (limited control over chunking granularity, retrieval tuning, and cost visibility) and made the call to build the RAG pipeline myself.

The custom RAG system (memra-rag) is a standalone FastAPI service. It handles document ingestion, semantic chunking, embedding, multi-stage retrieval (vector + graph), query expansion, and reranking — all under full control. Memra-api-v2 replaces the LightRAG calls with requests to this service over Railway's private network.

The frontend was designed as a proper SaaS product: role-based access, an admin dashboard at its own subdomain, a vault editor with live markdown preview, and a pipeline control panel that streams real-time embedding progress via SSE.

---

## Results & impact

| Metric | Value | Notes |
|---|---|---|
| Live deployments | 3 | memraiq.com, app.memraiq.com, admin.memraiq.com |
| Services built | 4 | memra-app, memra-api, memra-rag, memra-api-v2 |
| RAG pipeline components | 6 | Chunker, embedder, classifier, retriever, reranker, generator |
| API endpoints | 15+ | Auth, vault CRUD, pipeline control, conversations, export, settings |
| Infrastructure providers | 4 | Vercel, Railway, Supabase, Qdrant cloud |

**In plain language:**
Built and shipped a live AI SaaS product entirely solo — from architecture design to production deployment. After validating the concept with a working v1, I built a custom RAG system from the ground up to replace the third-party dependency and gain full control over retrieval quality and cost. The platform is live at memraiq.com with a multi-tenant API, a real admin dashboard, and a production-ready frontend.

---

## What made this hard

- Designing a multi-service architecture solo with no team to sanity-check decisions — every service boundary, data model, and API contract had to be thought through alone
- LightRAG is opinionated and hard to debug when retrieval quality is poor — diagnosing problems meant reading source code rather than documentation
- Building a custom RAG pipeline required understanding and implementing chunking strategies, embedding pipelines, vector search tuning, graph retrieval, and cross-encoder reranking — not just wiring up a library
- Keeping three live deployments (frontend, API, RAG) in sync during iteration, especially when the v2 API and RAG service are being developed in parallel
- Building a SaaS product — auth, multi-tenancy, billing hooks, encrypted secrets, per-org data isolation — on top of a technically complex RAG core, as a solo developer

---

## What I'm proud of

Building the custom RAG pipeline. It would have been easy to stay on LightRAG and call it done — but I recognised the ceiling and built my way out of it. The memra-rag service is a proper, production-oriented RAG system: semantic chunking, Qdrant + Neo4j retrieval, query classification, and cross-encoder reranking. That's not a tutorial project — that's a system that required a real understanding of how retrieval works and the patience to build and test each layer. The fact that I did that while also maintaining the live v1 and continuing to ship the frontend is the part I'm most proud of.

---

## What I'd do differently

I'd define the RAG service's API contract earlier and mock it on the API side before the service was built, so memra-api-v2 and memra-rag could be developed truly in parallel without blocking each other. I also underestimated how much time the multi-tenancy and settings-layering logic in the API would take — I'd extract that into its own design phase next time before touching routes.

---

## Artifacts & evidence

| Type | Description | Link / Location | Public? |
|---|---|---|---|
| Live app | Frontend (chat, vault, pipeline) | [app.memraiq.com](https://app.memraiq.com) | Yes (sign-up required) |
| Marketing site | Landing page | [memraiq.com](https://memraiq.com) | Yes |
| Admin dashboard | Admin panel | [admin.memraiq.com](https://admin.memraiq.com) | Restricted |
| Screenshots | UI screenshots available | See `artifacts/` folder | Yes |
| Source code | All four repos in portfolio vault | `/portfolio-vault/` | Private |
| Architecture docs | Detailed system design + schema | `memraiq-architecture-plan.md`, `memraiq-system-design.md` | Private |

---

## How to pitch this project

### For a technical audience
Built a multi-tenant RAG SaaS platform across four services: a Next.js 15 frontend, a FastAPI multi-tenant API with encrypted secrets and SSE streaming, a custom RAG pipeline (semantic chunking, Qdrant + Neo4j retrieval, query classification, cross-encoder reranking), and a v2 API integrating it all. Deployed across Vercel, Railway, Supabase, and Qdrant cloud. Migrated from LightRAG to a fully custom retrieval system after identifying the limits of the third-party dependency.

### For a business / non-technical audience
Built a live AI product from scratch that lets users ask questions about their personal knowledge vault and get grounded, cited answers. Shipped a working v1, validated it, then rebuilt the core intelligence layer from scratch to improve quality. The product is live with a public-facing app, an admin dashboard, and a full subscription-ready backend — all built solo.

### One-line version
> Built and deployed a full-stack AI SaaS platform for querying personal knowledge vaults using a custom-built RAG pipeline — live at memraiq.com.

---

## Tags

`ai` `rag` `saas` `full-stack` `next.js` `fastapi` `python` `qdrant` `neo4j` `vector-search` `anthropic` `openai` `multi-tenant` `vercel` `railway` `supabase` `solo` `production` `developer-tools` `nlp`
