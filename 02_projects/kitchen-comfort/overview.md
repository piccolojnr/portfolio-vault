# Project: Kitchen Comfort E-commerce Storefront

---

## Overview

| | |
|---|---|
| **Status** | Live — handed over to client |
| **Period** | August 2025 |
| **Role** | Solo developer — designed and built end-to-end |
| **Creator** | Daud Rahim |
| **Type** | Solo |
| **Client / Organisation** | Kitchen Comfort |
| **Industry** | E-commerce / Kitchenware / Retail |
| **Confidential?** | No — publicly live |

---

## The problem

A Ghanaian kitchenware brand needed a production-ready e-commerce store to sell their products online. They had no existing digital sales channel and needed a full storefront with product management, order handling, payments, and a way to manage inventory — all with minimal ongoing technical involvement from them after handover.

---

## What I did

- Designed and built the full e-commerce platform from scratch — no pre-existing design handed to me
- Structured 62 products across 8 categories with variant support and sale pricing
- Built a full admin dashboard for the client to manage products, orders, and stock independently
- Integrated Paystack for payments
- Set up Cloudinary for image storage and optimisation
- Configured Zoho Mail for transactional emails (order confirmations, notifications)
- Handed over to client after launch with full admin access

---

## How I did it

**Tools & technologies:**
- Next.js
- Prisma ORM
- PostgreSQL (Neon — serverless)
- Paystack
- Cloudinary
- Zoho Mail

**Approach / methodology:**

Full-stack Next.js application with a Prisma + PostgreSQL backend. Used Neon for serverless PostgreSQL hosting to keep infrastructure simple and cost-effective for a small business client. Cloudinary handles all product image uploads and delivery with automatic optimisation. Zoho Mail handles transactional email without requiring a dedicated mail server.

The admin dashboard is the key non-technical requirement — the client needed to be able to add products, update stock, and manage orders without developer help after handover. Built this as a first-class part of the product, not an afterthought.

---

## Results & impact

| Metric | Value | Notes |
|---|---|---|
| Products | 62 | Across 8 categories |
| Orders processed | 45 | Since launch |
| Orders delivered | 23 | As of last update |
| Categories | 8 | With variant and sale pricing support |

**In plain language:**
A fully live e-commerce store that has processed 45 real orders since launch. Built, delivered, and handed over — the client runs it independently using the admin dashboard.

---

## What made this hard

- Building a genuinely usable admin dashboard for a non-technical client — it needed to be simple enough that they'd actually use it
- Managing product variants and sale pricing in a clean data model
- Configuring the full transactional email and image pipeline so everything works automatically after handover without ongoing developer involvement

---

## What I'm proud of

The handover. The client runs the store independently — they add products, manage orders, and handle stock without calling me. That was the goal and it worked.

---

## What I'd do differently

I'd spend more time on the initial product data structure with the client — some category and variant decisions had to be revisited after launch as the client's needs became clearer.

---

## Artifacts & evidence

| Type | Description | Link / Location | Public? |
|---|---|---|---|
| Live link | kitchen-comfort.com | https://kitchen-comfort.com | Yes |

---

## How to pitch this project

### For a technical audience
Built a full-stack Next.js + Prisma + PostgreSQL (Neon) e-commerce platform with Paystack integration, Cloudinary image handling, and Zoho Mail transactional email. 62 products, variant support, sale pricing, full admin dashboard. 45 orders processed since launch.

### For a business / non-technical audience
Built a complete online store for a Ghanaian kitchenware brand — 62 products, real payments, and a self-service admin panel. 45 orders processed since launch, with the client managing it independently.

### One-line version
> Built a production e-commerce storefront for a Ghanaian kitchenware brand — 62 products, Paystack payments, 45 orders processed since launch.

---

## Tags

`web` `e-commerce` `next.js` `prisma` `postgresql` `paystack` `cloudinary` `zoho` `solo` `client` `retail` `ghana`
