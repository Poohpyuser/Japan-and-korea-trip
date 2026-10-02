# Trip Planner · Japan & Korea

A phone-first trip planner (Wanderlog / Plotline style) with the things those apps lack: **disaster alerts,
free Wi-Fi finder, transit help, Tabelog-style food ratings and an AI assistant** that can turn a reel into a plan.

The app itself is plain HTML/CSS/JS in `public/` (no build step; your data stays on each device, works offline,
installable to the home screen). One small serverless function (`netlify/functions/ai.mjs`) keeps your Anthropic
API key off the phone for the AI features.

## What's inside

| Tab | What it does |
| --- | --- |
| **Plan** | Hero header with D-day and cover photo · up to **90-day** trips · day chips + date jump · flights · booking-document vault · timeline cards (category colours, move mode, alarm, attachments, Directions / Maps / Calendar / Attach / Edit / Delete) · city plan for long trips · share link · .ics export |
| **Map** | Full-screen map with **English labels** (toggle to local) · tap anywhere to name/save/add to a day or search food, Wi-Fi, help there · bottom dock: **Route** (smart actions, optimize order, leg times) · **Food** · **Wi-Fi** · **Transit** (planner, station cheat-sheets, passes) · **Safety** (quakes, weather risk, hospitals, emergency card) · **AI** · ▶ **Play** your day with a pixel-art traveller that walks, drives or rides the real road/foot route |
| **Eat** | Your food list with Tabelog-style 1–5 ratings for both travellers + Tabelog/Google/Naver scores you type in; nearby finder |
| **AI** | Ask about your trip · **From a reel** (paste caption / screenshots → places → one tap to save) · **Plan a day** (drafts a timed day, you pick what to add) |
| **Tools** | Budget + yen/won converter + 50/50 settle-up · packing · tap-to-show phrases · hotel addresses · backup/restore · notifications |

Multiple trips: tap the trip name in the top bar (switch / edit / delete with a double tap) or **＋** for a new one.

## Deploy on Netlify

1. Push this repo to GitHub → Netlify → **Add new site → Import an existing project**. Netlify reads `netlify.toml`
   (publishes `public/`, bundles the function). No build command needed.
2. **Turn on the AI** (optional but recommended): Site configuration → Environment variables:
   - `ANTHROPIC_API_KEY`: from console.anthropic.com
   - `APP_PASSCODE`: any secret word. **Set this**, otherwise anyone who finds your URL can spend your API credit.
     Enter it once in the app (it asks on first AI use, or Tools → Settings → AI).
   - `AI_MODEL` (optional): defaults to `claude-opus-5-5`. Use `claude-sonnet-5-5` for faster/cheaper answers
     (also helps if you hit Netlify's function time limit on screenshot imports).
3. Redeploy, open the `https://….netlify.app` URL on your phone, **Add to Home Screen**.

Rename the site to something unguessable. Pages carry `noindex`, but the URL is otherwise public.

## Reels → plans (what works and what doesn't)

Instagram/TikTok don't let apps read a video from its link, and I won't scrape them. What works:
1. **Paste the caption** (⋯ → Copy) and/or **screenshot the frames** showing place names, maps or signs → *AI → From a reel*.
2. On **Android** (Chrome-installed app), use **Share → Trip Planner** from the reel: the link/caption arrives pre-filled.
   iOS doesn't support share targets for web apps, so use copy-paste there.
The AI lists the places with confidence levels; you tick what to save, then drop them into days.

## Run locally

```sh
npm install
npx netlify dev          # serves public/ + the AI function (needs ANTHROPIC_API_KEY in a .env)
# or just the static app (no AI):  python3 -m http.server -d public 8000
npm run test:fn          # unit tests for the AI function (no network or key needed)
```

## Data sources & limits

- Map tiles: CARTO Voyager (English labels) / OpenStreetMap. Places, Wi-Fi, hospitals: OpenStreetMap (Overpass, Nominatim).
  Routing: OSRM / OpenStreetMap.de (falls back to straight lines offline). Public servers are rate-limited: fine for two people.
- Earthquakes: USGS + P2PQuake (JMA data). Weather: Open-Meteo (16-day forecast max). Currency: open.er-api.com.
- **Tabelog has no public API**: the app opens a pre-filled search and you record the score.
- **Safety is pull-based** (checks when the app is open); it cannot push notifications. Keep Safety tips (Japan) /
  Emergency Ready (Korea) installed. **Alarms** ring only while the app is open; use the Calendar button for phone-level alarms.
- Attachments are stored in the browser (IndexedDB), not on the server, and aren't in share links or backups.
- AI can be wrong about hours, prices and closures. Verify before you go.
