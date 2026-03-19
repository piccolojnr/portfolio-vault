# Project: Laundry POS System

---

## Overview

| | |
|---|---|
| **Status** | Live — active testing / soft launch with paying client |
| **Period** | January 2026 – Present |
| **Role** | Solo developer — designed, built, deploying |
| **Creator** | Daud Rahim |
| **Type** | Solo |
| **Client / Organisation** | Confidential — laundry business in Ghana |
| **Industry** | Retail / Laundry / SaaS (planned) |
| **Confidential?** | Yes — client identity confidential |

---

## The problem

A laundry business with multiple branches had no centralised system to manage orders, customers, staff, payments, and finances. Operations were tracked manually, making it impossible to get visibility across branches or enforce consistent workflows. No existing off-the-shelf POS product fit the specific workflow of a laundry business.

---

## What I did

- Designed the full data model and system architecture for a multi-branch POS
- Built the complete application solo: frontend, backend, database, integrations
- Implemented multi-branch support — each branch operates independently but reports to a central admin view
- Built a full order dispatching system to track laundry through warehouse workflow stages
- Implemented a multi-channel notification system where the channel (email, SMS, or WhatsApp) is selected per customer based on their preference
- Integrated Paystack with support for partial payments
- Built an internal ledger and expense tracking module
- Deployed to a live client currently in active testing

---

## How I did it

**Tools & technologies:**
- Laravel (backend)
- React with Vite (frontend)
- Inertia.js (full-stack bridge)
- Paystack API
- Email, SMS, WhatsApp notifications

**Approach / methodology:**

Built as a Laravel + React monolith using Inertia.js, which allows React components to be served server-side without building a separate API. This kept the codebase lean and deployable without complex infrastructure. Multi-branch support is baked into the data model from the start — every order, customer, and transaction is scoped to a branch, with a super-admin view across all branches.

The notification system checks each customer's preferred channel before sending — so a customer who prefers WhatsApp gets WhatsApp, not SMS. Orders trigger automatic notifications with a payment link on creation. Partial payments are tracked against the order total with a running balance.

---

## Results & impact

| Metric | Value | Notes |
|---|---|---|
| Branches supported | Multi | Architecture supports unlimited branches |
| Notification channels | 3 | Email, SMS, WhatsApp — per customer preference |
| Payment support | Partial payments | Running balance tracked per order |
| Client status | Live / soft launch | Active testing with paying client |

**In plain language:**
A fully custom POS system built specifically for laundry businesses, live with a real paying client. Handles everything from order intake to payment to warehouse dispatch across multiple branches. Planning to evolve into a SaaS product.

---

## What made this hard

- No off-the-shelf reference for how a laundry POS should work — had to design the domain model from scratch
- Multi-channel notifications required careful per-customer preference logic and multiple API integrations
- Partial payment tracking adds complexity to the order lifecycle — a single order can have multiple payment events
- Designing for multi-branch from day one while keeping the codebase maintainable as a solo developer

---

## What I'm proud of

The notification system — automatically routing to the right channel per customer with no manual intervention is a genuinely thoughtful UX detail. Most small business software sends everything by one channel. Getting WhatsApp, SMS, and email working with per-customer preference routing was more complex than it sounds.

---

## What I'd do differently

I'd invest more time upfront defining the warehouse workflow stages with the client before building — the dispatch/tracking module required the most iteration because the workflow wasn't fully clear at the start.

---

## Artifacts & evidence

| Type | Description | Link / Location | Public? |
|---|---|---|---|
| Live system | Client deployment | — | No — confidential |

---

## How to pitch this project

### For a technical audience
Built a Laravel + React (Inertia.js) multi-branch laundry POS with Paystack partial payment support, a per-customer 3-channel notification system (email, SMS, WhatsApp), order dispatching for warehouse workflow tracking, and an internal ledger. Live with a paying client. Designed from the start as a foundation for a future SaaS product.

### For a business / non-technical audience
A custom point-of-sale system built for a laundry business with multiple branches. Handles orders, customers, payments, warehouse dispatch, and finances in one place. Live with a real client, with plans to turn it into a product other laundry businesses can use.

### One-line version
> Built a multi-branch laundry POS with partial payments and 3-channel customer notifications, live with a paying client and planned for SaaS evolution.

---

## Tags

`web` `full-stack` `laravel` `react` `inertia.js` `paystack` `pos` `saas` `multi-branch` `notifications` `solo` `client` `ghana`
