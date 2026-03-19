# Project: Smart Laundry Pickup/Dropoff Kiosk

---

## Overview

| | |
|---|---|
| **Status** | Working prototype — awaiting public deployment |
| **Period** | December 2025 – Present |
| **Role** | Sole technical developer — all four layers |
| **Creator** | Daud Rahim |
| **Type** | Team (2 people: me + co-founder who provided resources/hardware) |
| **Client / Organisation** | Internal / startup project |
| **Industry** | IoT / Laundry / Consumer tech |
| **Confidential?** | Partially — concept is public, business details are not |

---

## The problem

Laundry businesses have no convenient, self-service way for customers to drop off and pick up items outside of staffed hours. The goal was to build a smart kiosk — similar to an Amazon locker — that lets customers drop off laundry, pay remotely, and collect items using a unique code, all without staff involvement at the point of handoff.

---

## What I did

- Designed the full 4-layer system architecture: hardware control → Android kiosk app → backend API → admin dashboard
- Integrated the AL1645 TCP/IP locker controller board to control a 16-locker cabinet (6 small, 6 medium, 4 large)
- Built the Android kiosk app in Flutter — locked-down, public-facing, runs the full customer drop-off and pickup flow
- Built the NestJS backend API handling order creation, status tracking, OTP verification, and payment
- Built the Next.js admin dashboard for staff to manage orders, process laundry, create invoices, and trigger locker opens
- Wired up SMS notifications and a Paystack payment link flow triggered at invoice creation
- Debugged and resolved hardware communication issues — initially attempted RS485 serial, switched to TCP/IP after identifying the board mismatch
- Identified and documented a mechanical constraint: the modified school locker cabinet requires fixed mounting for doors to latch reliably

---

## How I did it

**Tools & technologies:**
- Flutter (Android kiosk app — locked-down public mode)
- NestJS (backend API)
- Next.js (admin dashboard)
- AL1645 TCP/IP locker controller board
- Paystack (payment links)
- SMS notifications (OTP + pickup codes)

**Approach / methodology:**

The system works across four distinct layers that all have to work together reliably. The customer flow runs entirely on the kiosk: select drop-off → enter mobile number → verify OTP → choose service and locker size → locker opens → customer places items → door closure is detected → order created (status: CREATED).

Staff manage the rest through the admin panel: collect items, process laundry, create an invoice sent to the customer by SMS with a Paystack payment link. When ready, the customer gets an SMS with a unique pickup code. If payment is incomplete at pickup, the kiosk displays a QR code to complete payment before the locker opens.

Hardware integration required significant debugging. Initially attempted RS485 serial communication via USB-to-RS485 adapter — spent substantial time troubleshooting before the controller board failed during testing. Switched to the AL1645 TCP/IP-based controller which resolved the communication issues entirely.

---

## Results & impact

| Metric | Value | Notes |
|---|---|---|
| Lockers controlled | 16 | 6 small, 6 medium, 4 large |
| Layers built | 4 | Hardware, Android app, API, dashboard |
| Real user testing | Yes | Tested indoors with real users |
| Status | Prototype complete | Rewiring and campus deployment next |

**In plain language:**
A fully working smart laundry kiosk — the only thing standing between prototype and public deployment is rewiring and a fixed installation point. The entire system was built solo from hardware integration up to the admin dashboard.

---

## What made this hard

- Hardware debugging with no prior locker controller experience — had to learn the RS485 protocol, troubleshoot adapters, deal with a board failure, and switch approaches entirely
- Coordinating four independent technical layers that all need to work in sync under real-world conditions
- A mechanical constraint (flexible sheet metal cabinet) that required identifying and documenting a physical installation requirement before public deployment
- Building a Flutter kiosk app in locked-down Android mode for untrusted public use

---

## What I'm proud of

The end-to-end system working as a coherent product — not just individual parts. The moment a customer walks up, drops off their laundry, pays by SMS link, and collects using a code with no staff involved is genuinely novel for this context. Getting the hardware and software to talk reliably, especially after the RS485 dead end, was a real technical win.

---

## What I'd do differently

Start with TCP/IP hardware from the beginning — the RS485 attempt cost significant time. Also, I'd design the cabinet with fixed mounting as a hard requirement from day one rather than discovering it during testing.

---

## Artifacts & evidence

| Type | Description | Link / Location | Public? |
|---|---|---|---|
| Video recording | Prototype demo recording | See `artifacts/` folder | Partially |
| Live link | Admin dashboard | — | No |

---

## How to pitch this project

### For a technical audience
Built a full IoT laundry kiosk system across four layers: AL1645 TCP/IP locker controller integration, Flutter Android kiosk app (locked-down public mode), NestJS backend API, and Next.js admin dashboard. Handled hardware communication debugging (RS485 → TCP/IP pivot), OTP flows, Paystack payment links, and SMS notifications end-to-end. Working prototype tested with real users.

### For a business / non-technical audience
Built a smart self-service laundry dropoff and pickup kiosk — like an Amazon locker, but for laundry. Customers drop off items, receive a payment link by SMS, and collect using a unique code. No staff needed at the point of handoff. Working prototype ready for deployment.

### One-line version
> Designed and built a full IoT laundry kiosk system across hardware, Android app, backend API, and admin dashboard — working prototype tested with real users.

---

## Tags

`iot` `hardware` `flutter` `android` `nestjs` `next.js` `tcp-ip` `locker-controller` `paystack` `sms` `kiosk` `solo` `prototype` `ghana`
