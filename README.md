<div align="center">

# 🧭 Recall - Day Reconstruction

**A local-first, multi-modal life timeline engine that stitches together digital footprints into an interactive chronicle.**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![JavaScript](https://img.shields.io/badge/Vanilla_JS-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Privacy](https://img.shields.io/badge/Privacy-100%25_Local--First-00E5A3?style=for-the-badge&logo=shield&logoColor=white)](#-privacy--local-first-architecture)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com/)

[Key Features](#-key-features) • [Data Streams](#-supported-data-streams) • [Quick Start](#-quick-start) • [Map Providers](#-map-providers--geocoding) • [Architecture](#-architecture)

</div>

---

## 📖 Overview

**Recall** is an exploratory timeline platform that correlates disparate data exports from modern personal services- Google Timeline, Spotify Extended Streaming History, Chrome Takeout, Samsung Health, Chess.com PGNs, and Google Meet- into a cohesive daily chronicle.

Instead of siloed charts across multiple apps, Recall aligns your physical movement, listening habits, web research, physical activity, and meetings onto a shared 24-hour canvas with interactive maps and chronologies.

> **Zero Cloud Dependency:** All processing, indexing, and rendering happens 100% on your local machine. No analytics, no external tracking, no telemetry.

---

## ✨ Key Features

- **🌐 Multi-Modal Day Reconstruction**  
  Select any single day or date range across years of activity. Recall aligns events across all streams chronologically, highlighting concurrent actions (e.g., listening to a specific album while commuting or walking).

- **📍 High-Fidelity Geography & Route Tracing**  
  Interactive Leaflet-powered maps visualising paths, trips, visits (Home, Work, Places), and transport modes (Walking, Cycling, Driving, Trains, Flights) with customizable map providers.

- **⏱️ 24-Hour Diurnal Activity Pulse**  
  Aggregates hourly activity into an intuitive 24-hour diurnal profile- showing when you listened to music, walked, coded, played chess, or browsed the web.

- **📊 Comprehensive Analytics**  
  Instant metrics across days: top domains visited, transport distance and duration breakdowns, total music minutes, game win/loss records, and pedometer steps.

- **🧪 Preloaded with Realistic Sample Data**  
  Includes a fully synthetic multi-year sample dataset (spanning 2019–2026) out-of-the-box. Explore and test the UI immediately without needing your own personal exports upfront.

---

## 📡 Supported Data Streams

| Stream | Provider / Format | Captured Insights |
| :--- | :--- | :--- |
| **📍 Geography** | Google Timeline (`Timeline.json`) | Stops, semantic places (Home / Work), route GPS paths, transport modes (Walk, Cycle, Car, Rail, Air). |
| **🎵 Music** | Spotify Extended History (`JSON`) | Track plays, album artists, duration listened, podcasts, skip rates, and shuffle states. |
| **🌐 Web** | Google Chrome Takeout (`chrome History.json`) | Browsing history, top domains, research topics, visit timestamps. |
| **♟️ Chess** | Chess.com PGNs (`chess data/*.pgn`) | Match outcomes, Elo rating progression, opening repertoires (ECO tags), move counts. |
| **💪 Health** | Samsung Health (`CSV` + `10-min JSON Bins`) | Daily step counts, distance, calories burned, and 24-hour diurnal step distributions. |
| **📞 Meet** | Google Meet (`conference_history_records_IST.csv`) | Conference codes, call durations, participation status, UTC/IST time normalization. |
| **📱 Calls** | SMS Backup & Restore (`calls-*.xml`) | Call durations, call directions (incoming/outgoing/missed), and contact timestamps. |

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) `>= 18.0.0`
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/recall-day-reconstruction.git
cd recall-day-reconstruction

# 2. Start the local server
npm start
```

Open **`http://localhost:8088`** in your browser.

> On first launch, Recall indexes all source exports directly into memory. Subsequent date changes query the memory index with sub-millisecond response times.

---

## 🗺️ Map Providers & Geocoding

Recall includes built-in support for multiple open-source map tile providers directly selectable in the UI:

- **CARTO Dark** (Default -  high contrast dark theme)
- **CARTO Light**
- **CARTO Voyager**
- **OpenStreetMap Standard**
- **ESRI World Imagery** (Satellite view)

### Reverse Geocoding

When inspecting coordinates on the map, Recall resolves unnamed GPS points into human-readable street addresses:
- **Default (Free):** OpenStreetMap Nominatim (no configuration required).
- **Google Maps API (Optional):** Start the server with your API key for Google Geocoding:

```bash
GOOGLE_MAPS_API_KEY=your_api_key npm start
```

---

## 📂 Project Structure

```text
├── Timeline.json                       # Google Timeline semantic segments export
├── chrome History.json                 # Google Takeout Chrome browsing history
├── Spotify Extended Streaming History/ # Spotify extended audio & video streaming files
├── chess data/                         # Chess.com monthly PGN match records
├── Samsung Health/                     # Samsung Health daily trends & binning JSONs
├── conference_history_records_IST.csv  # Google Meet conference logs
├── calls-*.xml                         # SMS Backup & Restore call logs
├── public/                             # Client-side web application
│   ├── index.html                      # Single-page layout
│   ├── style.css                       # Modern dark-mode interface styling
│   ├── app.js                          # State management, views, routing & charts
│   └── vendor/                         # Leaflet map dependencies
├── server.js                           # In-memory correlation & local HTTP API
└── package.json                        # Scripts & metadata
```

---

## 🔒 Privacy & Local-First Architecture

Modern life data contains extremely sensitive patterns- locations of your home, places you visit, personal reading habits, and private communications. 

- **100% In-Memory Processing:** The server only loads and parses files locally.
- **Zero Third-Party Analytics:** No Google Analytics, no tracking pixels, and no remote database.
- **Portability:** To swap out the sample data for your own data, place your personal Takeout/export files in the project root following the names in the repository structure.

---

## 🛠️ Verification & Scripts

Ensure code integrity and syntax validation:

```bash
# Check syntax for server and client scripts
npm run check
```

---

## 📄 License

This project is not currently licensed. All rights reserved.
