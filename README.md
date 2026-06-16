# HYROX Race Lab

A static web app for analysing and comparing HYROX race splits across athletes and events — no backend, no framework, runs entirely in the browser.

![Static Site](https://img.shields.io/badge/static-HTML%2FCSS%2FJS-blue)
![Chart.js](https://img.shields.io/badge/charts-Chart.js%204.4-orange)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What it does

- **Split comparison table** — run, workout, and roxzone times across all tracked races, with green/red best/worst highlighting and 🏆 on true personal bests
- **Radar chart** — field percentile strength across all 9 stations
- **Run & workout charts** — bar charts per station with datalabels
- **Roxzone charts** — entry/exit transition times per station
- **Category totals** — total · run · workout · roxzone breakdown per race
- **Events calendar** — upcoming HYROX Season 7–10 events with countdowns, maps, and wave times
- **News feed** — live HYROX RSS news ticker and card grid
- **Share URL** — encode active category + hidden races into a URL hash for sharing exact comparisons
- **Auto-sync** — discovers and imports new race results automatically from [hyresult.com](https://www.hyresult.com) (requires HTTP server, see below)

---

## Pages

| File | Description |
|---|---|
| `index.html` | Main race lab dashboard |
| `events.html` | HYROX Season 7–10 event calendar with maps |
| `news.html` | HYROX news feed (RSS) |

---

## Project structure

```
hyrox-app/
├── index.html          # Race dashboard
├── events.html         # Events calendar
├── news.html           # News page
├── css/
│   └── styles.css      # All styles (dark theme)
├── js/
│   ├── data.js         # Seed race data, athlete config, helpers
│   ├── store.js        # localStorage persistence (races + athletes)
│   ├── fetcher.js      # CORS proxy fetch, athlete lookup, auto-sync
│   ├── charts.js       # All Chart.js chart builders
│   ├── table.js        # Split table render, filter, CSV export
│   └── app.js          # UI logic, init, keyboard shortcuts
├── maps/               # Event venue map images (s7/, s8/, s9/)
└── scripts/
    ├── scrape-events.js # Playwright scraper for event data
    ├── migrate.js       # Data migration utility
    └── package.json
```

---

## Running locally

Open `index.html` directly in a browser for read-only use (charts, table, events). All seed data loads from `localStorage`.

For **auto-sync** (fetching new race results from hyresult.com), a local HTTP server is needed to avoid CORS restrictions:

```bash
npx serve .
# then open http://localhost:3000
```

---

## Adding athletes

1. Open the **👤 Athletes** panel (top-left of the dashboard)
2. Paste a hyresult.com athlete URL, slug, or name — e.g. `https://www.hyresult.com/athlete/tim-wenisch`
3. Click **+ Add** — the app will look up the athlete and queue their races for sync
4. Click **Sync** (or reload) to import their split data

> ⚠ Adding athletes requires the HTTP server (see above). Existing data always loads from `localStorage`.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `1` `2` `3` … | Toggle race columns on/off |
| `A` | Show all splits |
| `R` | Runs only |
| `W` | Workouts only |
| `X` | Roxzone only |
| `Esc` | Reset — show all races, clear filters |
| `?` | Show shortcut reference |

---

## Updating event data

Event data is maintained in `js/events-data.js`. To scrape fresh data from hyrox.com:

```bash
cd scripts
npm install
npm run scrape
```

Requires Node.js 18+ and Playwright.

---

## Tech stack

- Plain HTML / CSS / JavaScript — no build step, no framework
- [Chart.js 4.4](https://www.chartjs.org/) + [chartjs-plugin-datalabels](https://chartjs-plugin-datalabels.netlify.app/) via CDN
- [Playwright](https://playwright.dev/) for the event scraper (dev only)
- Data persisted in `localStorage` (`hyrox_races_v2`, `hyrox_athletes_v1`)
- CORS proxy via [corsproxy.io](https://corsproxy.io) / [allorigins.win](https://api.allorigins.win) for live fetches

---

## Data sources

- Race results: [hyresult.com](https://www.hyresult.com)
- Event info & news: [hyrox.com](https://hyrox.com)
