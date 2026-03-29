# Brag Sheet

> Add to this immediately when something good happens. Don't rely on memory.
> Format: date, what happened, context, any numbers or names worth noting.
> This feeds your resume bullets, performance reviews, and LinkedIn posts.

---

## How to use this

1. **Add wins as they happen** — a sentence or two is enough
2. **Review quarterly** — pull the best entries into your resume or LinkedIn
3. **Use it in performance reviews** — your manager will thank you
4. **Mine it before interviews** — it's your story bank

---

## Ongoing

**Started 2025 — Co-founded Ri-Tech, a technology company delivering client projects across Ghana**
Co-founded Ri-Tech with a partner, serving as Co-Founder & CTO. The company has delivered 12+ projects across web development, mobile apps, networking, and branding for real clients including KGL Group, Allied Ghana, Bonvas Tours, and St. Joseph's Catholic Hospital. Built and maintain the company's own portfolio site using Next.js and Sanity CMS. The team has grown to 5 members covering development, networking, design, and PR.

**Key outcome:** 12+ live client projects · 5-person team · multiple industries served · 100% client satisfaction rate

_Categories: Shipped something · Represented the team · Went above and beyond_

---

## 2026

### Dec 2025–Present

**Dec 2025–Present — Built a working prototype of a smart laundry pickup/dropoff kiosk (hardware + software)**
Designed and built a full IoT laundry kiosk system — like an Amazon locker, but for laundry — from scratch with a co-founder who provided resources and hardware. Solely responsible for all technical development across four layers: embedded hardware communication, Android kiosk app, backend API, and admin dashboard.

**Hardware:** Integrated an AL1645 TCP/IP locker controller board to control a 16-locker cabinet (6 small, 6 medium, 4 large). Initially attempted RS485 serial communication — spent significant time troubleshooting direct serial and USB-to-RS485 adapters to establish communication with the Android device. After a board failure during testing, switched to a TCP/IP-based controller which resolved the communication issues entirely. Identified and worked around a mechanical constraint: the locker cabinet (modified school lockers) uses flexible sheet metal that requires the unit to be fixed in place for doors to latch reliably.

**End-to-end flow:** Customer walks up → selects drop-off → enters mobile number → verifies OTP → selects service and locker size → locker opens automatically → customer places items → system detects door closure and creates an order (status: CREATED). Staff collects items via admin panel, processes the order, and creates an invoice sent to the customer via SMS with a Paystack payment link. When ready, customer receives an SMS with a unique pickup code. If unpaid at pickup, the kiosk displays a QR code to complete payment before the locker opens.

**Stack:** Flutter (Android kiosk app) · NestJS (backend API) · Next.js (admin dashboard) · Paystack · SMS notifications · AL1645 TCP/IP locker controller  
**Status:** Working prototype built and tested with real users indoors. Next step: rewire and deploy publicly at a university campus.

_Categories: Shipped something · Solved a hard problem · Learned something significant · Went above and beyond_

---

### March

**Mar 2026 — Built and launched Memraiq: a full-stack AI SaaS platform with a custom RAG pipeline**
Designed and shipped Memraiq (memraiq.com) entirely solo — an AI-powered platform that lets users query their personal knowledge vault using natural language and get grounded, cited answers. Started with a working v1 using LightRAG to validate the concept fast, then identified the ceiling of the third-party dependency and built the entire RAG pipeline from scratch. The custom system (memra-rag) handles semantic chunking, embedding, Qdrant vector search, Neo4j graph retrieval, query classification, cross-encoder reranking, and streaming generation — all as a standalone FastAPI service. Also built the full frontend (Next.js 15, streaming answers, vault editor, SSE pipeline control), the multi-tenant API (auth, encrypted secrets, cost tracking, conversation history), and a second API version integrating the custom RAG. Four codebases, three live deployments (memraiq.com, app.memraiq.com, admin.memraiq.com), four infra providers — shipped and maintained solo.

**Stack:** Next.js 15, FastAPI, Python, Qdrant, Neo4j, Anthropic Claude, OpenAI, Supabase, Railway, Vercel
**Key outcome:** Live AI SaaS product · custom RAG pipeline built from scratch · 4 services · 3 live deployments

_Categories: Shipped something · Solved a hard problem · Learned something significant · Went above and beyond_

---

**Mar 2026 — Resolved non-interactive CI/CD sudo permissions blocking production deployments**
While migrating a client's Laravel laundry POS from cPanel to a self-managed VPS, set up a GitLab CI/CD pipeline with separate staging and production environments. Hit a hard blocker: the deployment user needed sudo access to restart Supervisor (used for Laravel job queues), but the CI pipeline is non-interactive and couldn't accept a password prompt. Spent 1–2 days debugging and learning, ultimately configuring targeted sudoers permissions for the deploy user to resolve it without compromising server security. Strengthened hands-on knowledge of Linux server administration, Nginx, Supervisor, and GitLab CI/CD.

_Categories: Solved a hard problem · Learned something significant_

---

### January

**Jan 2026 — Delivered corporate website for Allied Ghana (Allied Oil) after nearly a year of client iterations**
Built the full corporate website for Allied Ghana (alliedghana.com), a Ghanaian fuel and lubricants company operating since 1998. Received a Figma design and implemented everything from frontend to Sanity CMS — including product/services pages, a station locator, fuel pricing display, the Allied+ loyalty card section, and partnership content (Afton Chemical, Castrol, Toyota, Mobil). Project came as a direct referral from the KGL Group client via Paper Merchant. Navigated a long client feedback cycle with frequent design changes across nearly a year, staying professional and responsive throughout until final delivery.

**Stack:** Next.js, Sanity CMS, TypeScript, Tailwind CSS  
**Key outcome:** Live corporate site · referral client · delivered despite ~1 year of design change cycles

_Categories: Shipped something · Solved a hard problem · Got recognised (referral)_

---

**Jan 2026 — Built and currently maintaining a multi-branch laundry POS system for a live client**
Independently designed and developed a full-featured point-of-sale system for a laundry business, currently in active testing with a real client. Features include order management (full CRUD), customer management, multi-branch support, analytics, Paystack payment integration, expense tracking, internal ledger, and order dispatching to track warehouse workflow. Implemented a multi-channel notification system (email, SMS, WhatsApp) where the channel is selected based on each customer's preference. Orders trigger automatic notifications with a payment link. Supports partial payments. Planning to evolve into a full SaaS product.

**Stack:** Laravel, React (Vite), Inertia.js, Paystack API  
**Key outcome:** Live with a paying client · multi-branch · partial payments · 3-channel notifications

_Categories: Shipped something · Solved a hard problem · Learned something significant_

---

## 2025

### August

**Aug 2025 — Built and delivered a full-stack e-commerce storefront for a live Ghanaian kitchenware brand**
Designed and developed Kitchen Comfort (kitchen-comfort.com), a production e-commerce platform for a kitchenware client in Ghana. Features 62 products across 8 categories, product variants, sale pricing, stock management, a full admin dashboard for managing products and orders, Paystack payment integration, Cloudinary for image storage, and Zoho Mail for transactional email. Handed over to client after completion. The store is live and has since processed 45 orders, with 23 delivered.

**Stack:** Next.js, Prisma ORM, PostgreSQL (Neon), Paystack, Cloudinary, Zoho Mail  
**Live site:** kitchen-comfort.com  
**Key outcome:** 62 products · 45 orders processed · 23 delivered · fully live in production

_Categories: Shipped something · Hit a number · Went above and beyond_

---

### July

**Jul 2025 — Launched a live permit management platform now serving 1,687 students and processing 165,100 GHS**
Designed and developed a full-stack permit management system for my university's Student Representative Council (SRC) as my final year project. MVP launched July 2025 and has been continuously updated and maintained since. Handles role-based authentication, permit issuance, payment collection, and entry verification at exam halls. Navigated a real-world payment integration challenge: Paystack required formal business documents the SRC didn't have — after back-and-forth negotiations, secured starter access, hit their 30,000 GHS lifetime limit in the first semester alone, then migrated to ExpressPay (which required an official school authorisation letter to unlock API access). The system is live, has processed 165,100 GHS across two semesters, and is used by 1,687 registered students. School administration endorsed the project. Will be handed over to the incoming SRC administration upon graduation.

**Stack:** Next.js, Prisma ORM, MySQL, ExpressPay API  
**Key outcome:** 165,100 GHS processed · 1,687 registered users · live in production · school endorsement

_Categories: Shipped something · Hit a number · Got recognised · Solved a hard problem · Went above and beyond_

---

### Early 2025

**Early 2025 — Built corporate website for KGL Group, one of Ghana's top-ranked ICT conglomerates**
Delivered the full corporate website for KGL Group (kglgroup.com.gh), a major Ghanaian conglomerate with six subsidiaries spanning Fintech, Logistics, Agric, Property Development, and Commerce — ranked first in Ghana's ICT sector at the Ghana Club 100 Awards. Received a Figma design from Paper Merchant (a brand solutions agency) and built everything from scratch: frontend, multi-page navigation (subsidiaries, careers, press releases, gallery, sponsorships), and Sanity CMS for content management. Completed in approximately 2 months. The quality of the work led directly to a second referral project — Allied Ghana.

**Stack:** Next.js, Sanity CMS, TypeScript, Tailwind CSS  
**Key outcome:** Live enterprise site · completed in ~2 months · earned direct referral to second client

_Categories: Shipped something · Got recognised (referral) · Hit a number_

---

## 2024

### June–August

**Jun–Aug 2024 — Internship at CSIR: built a real-time noise monitoring dashboard with map clustering**
Completed a 3-month internship at the Council for Scientific and Industrial Research (CSIR), a national government research institution. Was tasked with building the frontend for a noise monitoring system — a network of IoT devices deployed across the city that measure decibel levels in real time. Built a live dashboard in Next.js that consumed data via MQTT, displayed device locations on an interactive map, showed live dB readings per device, and implemented map clustering to handle future scale. Supervisor (who built the backend) specifically praised the MQTT integration and clustering implementation. This project was also the introduction to Next.js, which became the primary framework used across all subsequent projects.

**Stack:** Next.js, MQTT, map/clustering library  
**Key outcome:** Supervisor praise for MQTT handling and map clustering · introduced to Next.js · real government research project

_Categories: Shipped something · Learned something significant · Got recognised_

---

### May 2024–May 2025

**May 2024–May 2025 — Completed ALX Software Engineering Programme (Cohort 17)**
Completed the 12-month ALX Software Engineering programme, one of Africa's most rigorous software engineering courses. Built projects including a full Airbnb clone and a bytecode interpreter for the Monty scripting language written in C — demonstrating low-level programming fundamentals beyond typical web development. Graduated with a certificate in May 2025, running the programme concurrently with client work and the permit system build.

**Key outcome:** Certificate earned · low-level C programming · 12-month structured engineering curriculum

_Categories: Learned something significant · Shipped something_

---

<!-- Keep adding entries above in reverse chronological order -->

---

## Categories to track

<!-- Not every win fits neatly — use these as prompts when you're not sure what to add -->

- **Shipped something** — feature, project, product, campaign
- **Solved a hard problem** — technical, organisational, creative
- **Helped someone** — mentored, unblocked, supported a colleague
- **Got recognised** — praise from a manager, client, stakeholder, or peer
- **Learned something significant** — skill, tool, domain knowledge
- **Represented the team** — presented, spoke, wrote publicly
- **Improved a process** — made something faster, cheaper, more reliable
- **Hit a number** — metric, target, milestone
- **Got a testimonial or strong feedback** — add to `testimonials.md` too
- **Went above and beyond** — did something outside your job description
