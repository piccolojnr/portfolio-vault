# Work Experience

> This is your full employment history — unfiltered.
> When generating a CV/resume, you'll select and trim from here.
> Write each role with as much detail as you can now, while it's fresh.

---

## Founder & Solo Developer — Memraiq

**Type:** Personal product / SaaS
**Period:** March 2026 – Present
**Location:** Ghana (remote-capable)

### What the role was

Memraiq is an AI-powered SaaS platform I designed and built from scratch — entirely solo. It lets users query their personal knowledge vault (portfolio documents, notes, project writeups, experience logs) using natural language and get grounded, cited answers back. Built as a real multi-tenant product: separate frontend, API, and custom RAG service, all deployed and live.

### What I actually did day-to-day

- Designed the full system architecture: service boundaries, data model, auth, RAG pipeline, and deployment topology — entirely solo with no team to sanity-check decisions
- Built and shipped v1 using LightRAG as the RAG layer to validate the concept quickly
- Identified LightRAG's ceiling (limited control over chunking, retrieval tuning, cost visibility) and made the call to build the entire RAG pipeline from scratch
- Built memra-rag: a standalone FastAPI RAG service with semantic chunking, Qdrant vector search, Neo4j graph retrieval, query classification, cross-encoder reranking, and streaming generation
- Built memra-api-v2: a full rewrite of the backend integrating the custom RAG service in place of LightRAG
- Maintained and iterated on the live v1 deployment throughout — no downtime
- Managed the full deployment infrastructure: Vercel, Railway, Supabase, Qdrant cloud

### What I built or delivered

- **memra-app** — Next.js 15 frontend with chat interface, streaming answers, source citations, markdown vault editor, and real-time pipeline control panel (SSE)
- **memra-api** — FastAPI multi-tenant backend: auth, vault CRUD, pipeline control, conversation history, cost tracking, encrypted API key storage, DOCX/PDF export
- **memra-rag** — Custom RAG service: semantic chunker, embedding pipeline, Qdrant vector search, Neo4j graph traversal, query classification, cross-encoder reranker, streaming generation
- **memra-api-v2** — Backend rewrite integrating memra-rag over Railway's private network, with Alembic migrations and improved auth
- Live deployments: memraiq.com · app.memraiq.com · admin.memraiq.com

### Impact & results

- Shipped a fully functional AI SaaS product solo in weeks
- Custom RAG pipeline gives full control over retrieval quality, chunking granularity, and cost — not possible with LightRAG
- Four separate codebases, three live deployments, four infrastructure providers — all maintained by one person
- Validated the concept with a working v1 before rebuilding the core

### What I learned

- How to design, build, and maintain a multi-service distributed system solo
- RAG system internals — not just wiring up a library, but building each layer: chunking, embedding, retrieval, reranking, generation
- Multi-tenant SaaS patterns: per-org data isolation, encrypted secrets, settings layering, cost tracking
- When to use a third-party library and when the ceiling of that library justifies building your own
- Infrastructure management across Vercel, Railway, Supabase, and Qdrant cloud

### Why I left

<!-- Ongoing -->

---

## Freelance Full-Stack Developer

**Type:** Freelance  
**Period:** 2024 – Present  
**Location:** Ghana (remote-capable)

### What the role was

Independent freelance development work across web applications, e-commerce, IoT systems, and institutional platforms. All clients have come through referrals — no cold outreach or platforms. Projects span corporate websites, SaaS products, e-commerce, and institutional software. Collaborate with a small network of designers, networking engineers, and a PR person to deliver full-service projects where needed.

### What I actually did day-to-day

- Took briefs directly from clients, scoped projects, quoted, and delivered end-to-end
- Architected and built all products — from requirements through to deployment and ongoing maintenance
- Managed all client communication — feedback cycles, revisions, delivery timelines
- Made all stack and infrastructure decisions independently
- Handled production deployments, VPS setup, CI/CD pipelines, and post-launch support
- Navigated real-world constraints: shifting requirements, payment provider restrictions, tight budgets, hardware failures

### What I built or delivered

- **KGL Group website** — corporate site for one of Ghana's top-ranked ICT conglomerates (6 subsidiaries, Sanity CMS); completed in ~2 months; led directly to a referral for Allied Ghana
- **Allied Ghana website** — corporate site for a Ghanaian fuel and lubricants company (alliedghana.com); referral via Paper Merchant; delivered after ~1 year of client-driven design iterations
- **Kitchen Comfort e-commerce** — full production storefront (kitchen-comfort.com); 62 products across 8 categories, Paystack, Cloudinary, full admin dashboard; 45 orders processed, 23 delivered
- **Laundry POS system** — multi-branch point-of-sale for a live client; order management, customer management, analytics, Paystack, expense tracking, internal ledger, partial payments, 3-channel notifications (email, SMS, WhatsApp); planned evolution into SaaS
- **Smart laundry kiosk (IoT)** — full 4-layer system: AL1645 TCP/IP locker controller, Flutter Android kiosk app, NestJS backend, Next.js admin dashboard; working prototype tested with real users; next step is public campus deployment
- **SRC Permit Management System** — full-stack platform for Knutsford University's Student Representative Council; 1,687 registered users, 165,100 GHS processed across two semesters; school administration endorsed; migrated payment provider mid-project from Paystack to ExpressPay after hitting volume limits

### Impact & results

- 12+ live client projects delivered · 100% client satisfaction rate
- 1,687 registered users on the permit system · 165,100 GHS processed across two semesters
- 45 orders processed on Kitchen Comfort e-commerce storefront
- All clients acquired through referrals — quality of work drove all growth
- KGL Group engagement led directly to Allied Ghana referral via Paper Merchant

### What I learned

- How to own a project completely — no senior dev to escalate to, no spec to hide behind
- Client management across long, messy feedback cycles without losing the relationship
- Infrastructure and DevOps in production — VPS migration, Nginx, Supervisor, GitLab CI/CD
- Full IoT system architecture spanning hardware, mobile, backend, and web
- How to negotiate with institutions and payment providers under real constraints

### Why I left

<!-- Ongoing -->

---

## Frontend Development Intern

**Company:** Council for Scientific and Industrial Research — Institute of Industrial Research (CSIR-INSTI)  
**Type:** Internship  
**Period:** June 2024 – August 2024 (3 months)  
**Location:** Ghana  
**Compensation:** Stipend

### What the role was

CSIR-INSTI is a national government research institution. I was placed in the software/research team and tasked with building the frontend for a real-time noise monitoring system — a network of IoT devices deployed across the city that measure and transmit decibel levels continuously. My supervisor was a researcher/developer at the institute who built the backend.

### What I actually did day-to-day

- Built the complete frontend dashboard for the noise monitoring system
- Integrated with the backend via MQTT for real-time IoT data streaming
- Displayed live decibel readings per device on an interactive map
- Implemented map clustering to handle future scale as more devices are deployed
- Collaborated directly with the backend researcher/developer who built the data pipeline

### What I built or delivered

- Live real-time dashboard consuming MQTT data from IoT noise sensors across the city
- Interactive map with device locations, live dB readings, and clustering for scale
- Fully functional frontend handed over and integrated with the backend system

### Impact & results

- Supervisor specifically praised the MQTT integration and map clustering implementation
- Delivered a working production dashboard for a live government research project
- This internship was my first exposure to Next.js — which became the primary framework across all subsequent work

### What I learned

- MQTT protocol and real-time IoT data consumption
- Next.js (first exposure — foundational to everything that came after)
- How to work within a research/government context with a real production system
- Map libraries, clustering, and handling live data in a frontend dashboard

### Why I left

End of internship period.

---

## Student Software Engineer

**Company:** ALX Africa — Software Engineering Programme (Cohort 17)  
**Type:** Full-time training programme  
**Period:** May 2024 – May 2025 (12 months)  
**Location:** Remote

### What the role was

ALX is one of Africa's most rigorous software engineering programmes — a 12-month, full-time curriculum covering software fundamentals, low-level programming, web development, and systems thinking. Cohort 17 ran concurrently with my university studies, freelance client work, and the permit system build.

### What I actually did day-to-day

- Completed daily and weekly projects under strict deadlines — the programme is heavily project-based
- Worked through low-level C programming: memory management, pointers, data structures, algorithms
- Built larger projects collaboratively and independently across the curriculum
- Peer-reviewed code and worked in a distributed cohort environment

### What I built or delivered

- **Airbnb clone** — full-stack web application replicating core Airbnb functionality
- **Monty bytecode interpreter** — a bytecode interpreter for the Monty scripting language, written in C; demonstrates stack/queue implementation and low-level language internals

### Impact & results

- Graduated with certificate, May 2025
- Low-level C programming gives me a systems foundation that most web developers lack
- Completed the programme while simultaneously delivering client projects and launching the SRC permit system

### What I learned

- Low-level C: memory allocation, pointers, data structures, file I/O
- Software engineering fundamentals beyond frameworks and libraries
- How to work under pressure, meet hard deadlines, and debug systematically
- Depth over speed — the programme pushed rigour, not just shipping

### Why I left

Programme completed. Graduated May 2025.
