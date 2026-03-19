# Project: CSIR Real-Time Noise Monitoring Dashboard

---

## Overview

| | |
|---|---|
| **Status** | Completed — handed over |
| **Period** | June 2024 – August 2024 (3 months) |
| **Role** | Frontend developer (intern) |
| **Creator** | Daud Rahim |
| **Type** | Team (me + backend researcher/developer at CSIR) |
| **Client / Organisation** | Council for Scientific and Industrial Research — Institute of Industrial Research (CSIR-INSTI) |
| **Industry** | Government / Research / Environmental monitoring |
| **Confidential?** | Partially — government research project; screenshots/details available but not publicly deployed |

---

## The problem

CSIR-INSTI had deployed a network of IoT noise monitoring devices across the city to measure environmental noise levels in real time. The raw sensor data was being collected by a backend system but there was no frontend to visualise it — no way for researchers to see which devices were active, what noise levels they were reporting, or where they were located geographically.

---

## What I did

- Built the complete frontend dashboard for the noise monitoring system
- Consumed real-time IoT sensor data via MQTT protocol
- Displayed live decibel readings per device, updating in real time
- Implemented an interactive map showing all device locations across the city
- Built map clustering so the dashboard remains usable as the number of devices scales up
- Integrated with the backend system built by the CSIR researcher/developer
- Handed over a fully working frontend at the end of the 3-month internship

---

## How I did it

**Tools & technologies:**
- Next.js (first project using this framework)
- MQTT (real-time IoT data streaming)
- Map library with clustering support

**Approach / methodology:**

The backend pipeline was already built by the CSIR researcher — my job was to consume the MQTT data stream and present it usefully. MQTT is a lightweight publish/subscribe protocol designed for IoT — devices publish readings to topics, and the dashboard subscribes and updates in real time. The map clustering implementation was designed with future scale in mind: as more devices are deployed across the city, the map stays readable by grouping nearby sensors at lower zoom levels.

---

## Results & impact

| Metric | Value | Notes |
|---|---|---|
| Devices on map | Multiple | Live across the city |
| Real-time update | Yes | Via MQTT subscription |
| Supervisor recognition | Yes | Praised MQTT integration and clustering |
| Personal impact | High | Introduced me to Next.js — used in every project since |

**In plain language:**
Delivered a live dashboard for a government research institution that turns raw IoT sensor data into an interactive, real-time map. The supervisor specifically praised the MQTT integration and clustering — and this project introduced me to Next.js, which became my primary framework.

---

## What made this hard

- MQTT was a completely new protocol — had to learn it from scratch during the internship
- Next.js was also new — this was my first project using it
- Real-time data introduces complexity around state updates, connection handling, and keeping the UI in sync with the data stream
- Map clustering required understanding how to balance detail vs readability at different zoom levels

---

## What I'm proud of

Learning two new things (MQTT + Next.js) in a real production context, on a government research project, and delivering something the supervisor specifically called out as well done. This project set the technical direction for everything that came after.

---

## What I'd do differently

I'd spend more time on connection resilience — handling MQTT disconnects and reconnects more gracefully. In a production monitoring context, the dashboard needs to recover cleanly when the connection drops.

---

## Artifacts & evidence

| Type | Description | Link / Location | Public? |
|---|---|---|---|
| Internal | Government research project — not publicly deployed | — | No |

---

## How to pitch this project

### For a technical audience
Built a real-time IoT data dashboard in Next.js consuming live sensor readings via MQTT from a city-wide noise monitoring network. Implemented interactive map with device locations, live dB readouts, and clustering for scale. Delivered during a 3-month internship at CSIR-INSTI.

### For a business / non-technical audience
Built a live dashboard for a government research institution to monitor environmental noise levels across the city in real time — turning raw IoT sensor data into a visual, interactive map.

### One-line version
> Built a real-time IoT noise monitoring dashboard for CSIR-INSTI — live MQTT data, interactive city map, and clustering for scale.

---

## Tags

`web` `iot` `dashboard` `mqtt` `next.js` `maps` `clustering` `government` `research` `internship` `ghana`
