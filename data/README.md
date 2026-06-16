# /data — HYROX Event Season Data

Each subfolder contains one JSON file that is the **source of truth** for that season's events.

```
data/
  s7/events.json   ← Season 7 (historical, not scraped)
  s8/events.json   ← Season 8 (historical, not scraped)
  s9/events.json   ← Season 9 (scraper updates ticketsOnSale)
  s10/events.json  ← Season 10 (scraper updates ticketsOnSale + new events)
```

## Event JSON schema

```json
{
  "id":             "s10-jakarta",
  "city":           "Jakarta",
  "country":        "Indonesia",
  "flag":           "🇮🇩",
  "venue":          "Nusantara International Convention Exhibition (NICE)",
  "date":           "2026-06-27",
  "dateLabel":      "27–28 Jun 2026",
  "isChampionship": false,
  "ticketsOnSale":  true,
  "venueUrl":       "https://hyrox.com/event/hyrox-jakarta/",
  "mapImg":         null,
  "mapImgDirect":   null,
  "wavesConfirmed": true,
  "waves": [
    { "day": 1, "category": "Men Open", "time": "09:00" }
  ]
}
```

## How to update

```bash
cd scripts
npm install          # first time only
node migrate.js      # ONE-TIME: creates JSON files from existing events-data.js
node scrape-events.js           # full update (s9 + s10)
node scrape-events.js --season s10   # single season
node scrape-events.js --dry-run      # preview without writing
```

The scraper:
1. Reads these JSON files
2. Visits `hyrox.com/find-my-race` to detect new events
3. **Auto-creates full event objects** for any new events found → appended to `data/s10/events.json`
4. Visits each upcoming event page → checks for **"Buy Tickets here"** button
5. Updates `ticketsOnSale` in the JSON files
6. Regenerates `js/events-data.js` (what the browser loads)

Then `git commit -am "chore: update event data" && git push` to deploy.
