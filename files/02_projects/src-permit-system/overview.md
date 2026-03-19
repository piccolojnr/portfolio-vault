# Project: SRC Permit Management System

---

## Overview

| | |
|---|---|
| **Status** | Live — actively maintained |
| **Period** | July 2025 – Present |
| **Role** | Solo developer — designed, built, deployed, and maintaining |
| **Creator** | Daud Rahim |
| **Type** | Solo |
| **Client / Organisation** | Student Representative Council (SRC), Knutsford University |
| **Industry** | Education / Civic |
| **Confidential?** | No — school administration endorsed; screenshots available |

---

## The problem

Knutsford University's SRC had no system for managing exam hall entry permits. The process was manual, error-prone, and created bottlenecks at exam hall entry points. Students had no self-service way to obtain permits or pay fees, and the SRC had no visibility into who had paid or been issued a permit. This was also my final year project.

---

## What I did

- Designed the full system architecture from scratch — data model, payment flow, role structure
- Built the complete full-stack application solo: frontend, backend, database, payment integration
- Negotiated directly with Paystack to obtain starter API access for an informal student body that lacked formal business registration documents
- Managed the migration from Paystack to ExpressPay mid-production after hitting Paystack's 30,000 GHS lifetime limit in the first semester — required obtaining an official school authorisation letter to unlock ExpressPay API access
- Launched the MVP in July 2025 and have continuously updated and maintained it across two semesters
- Coordinated handover planning with the incoming SRC administration

---

## How I did it

**Tools & technologies:**
- Next.js (frontend + server-side rendering)
- Prisma ORM
- MySQL
- ExpressPay API (migrated from Paystack)

**Approach / methodology:**

Built as a full-stack Next.js application with role-based authentication covering three user types: students, SRC staff, and exam hall verifiers. Students register, pay, and receive permits through a self-service flow. Exam hall staff verify entry using the system at the door. The SRC admin panel gives full visibility into registrations, payments, and permit status.

Payment integration required unusual legwork — negotiated Paystack starter access for an unregistered student body, hit their GHS lifetime cap mid-semester, then navigated ExpressPay's onboarding which required a formal letter from the university. Both migrations were done without taking the system offline.

---

## Results & impact

| Metric | Value | Notes |
|---|---|---|
| Registered users | 1,687 | Across two semesters |
| Total payments processed | 165,100 GHS | Two semesters combined |
| Paystack limit hit | 30,000 GHS | First semester alone — triggered migration |
| Uptime | Continuous | No major downtime across two semesters |

**In plain language:**
The system replaced a fully manual process with a self-service platform used by nearly 1,700 students. It processed over 165,000 GHS in payments across two semesters and earned a formal endorsement from the school administration. It will be handed over to the incoming SRC on graduation.

---

## What made this hard

- The SRC had no formal business registration — getting any payment provider to work required negotiation and creative problem-solving
- Hitting the Paystack lifetime cap mid-semester meant migrating payment providers while the system was live with active users
- Navigating two different payment provider onboarding processes under time pressure
- Maintaining the system across two semesters as a student while completing coursework

---

## What I'm proud of

Getting the payment infrastructure to work at all. Most developers would have hit the "no business registration" wall and stopped. Instead I negotiated access, used it fully, migrated cleanly to a second provider, and kept the system running throughout. That's not just a technical win — it's a problem-solving and persistence win.

---

## What I'd do differently

I'd design the payment provider abstraction layer properly from the start, so swapping providers wouldn't require touching as much code. A clean payment interface would have made the Paystack → ExpressPay migration much faster.

---

## Artifacts & evidence

| Type | Description | Link / Location | Public? |
|---|---|---|---|
| Screenshots | UI screenshots available | See `artifacts/` folder | Yes |
| Live system | Active during exam periods | — | Restricted to students |

---

## How to pitch this project

### For a technical audience
Built a full-stack Next.js + MySQL permit management system with role-based auth, self-service student flows, and real-time entry verification. Navigated a live payment provider migration from Paystack to ExpressPay mid-production — triggered by hitting volume limits — without downtime. Maintained across two semesters as a solo developer.

### For a business / non-technical audience
Replaced a manual exam entry process with a self-service platform used by 1,687 students, processing over 165,000 GHS in fees. Delivered as a final year project and formally endorsed by the school administration.

### One-line version
> Built and launched a permit management platform for a university SRC, serving 1,687 students and processing 165,100 GHS across two semesters.

---

## Tags

`web` `full-stack` `next.js` `mysql` `prisma` `payments` `paystack` `expresspay` `education` `civic` `solo` `production` `ghana`
