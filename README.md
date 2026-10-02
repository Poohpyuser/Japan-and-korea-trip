# Trip Planner · Japan & Korea

A phone-friendly trip planner (Wanderlog-style itinerary + map) with the things those apps lack:
**disaster/safety alerts, free Wi-Fi finder, transit & station help, and a Tabelog-style food list.**

Plain HTML/CSS/JS. No build step, no accounts, no API keys. Data is saved on your device and the app
works offline once loaded (installable to the home screen).

## Features

| Tab | What it does |
| --- | --- |
| **Plan** | Day-by-day itinerary, per-day city + weather, places / transit legs / notes, time-sorted stops, saved-places wishlist, day route in Google Maps, calendar export (.ics), share link for your sister |
| **Map** | OpenStreetMap map of the day’s route, saved places, Wi-Fi spots, help spots and recent earthquakes |
| **Eat** | Find restaurants nearby (OpenStreetMap), one-tap Tabelog / Naver / Kakao / Google review lookups, your own 1–5 ratings for both travellers, plus Tabelog/Google/Naver scores you type in |
| **Transit** | Journey planner (Google Maps / Kakao), save legs into a day with platform & ticket info, station cheat-sheets, IC card / T-money / pass guide |
| **Wi-Fi** | Free Wi-Fi tagged in OpenStreetMap + chains that usually have it, and a guide to the official free-Wi-Fi apps |
| **Safety** | Earthquakes (USGS + JMA via P2PQuake), weather risk (typhoon-level wind, heavy rain, heat) for your itinerary cities, nearby hospitals / police / evacuation points, emergency numbers, “I’m safe” check-in message, show-to-staff emergency card, preparedness guide |
| **Tools** | Budget with live JPY/KRW conversion and 50/50 settle-up, packing list, tap-to-show phrases, hotel addresses, backup / restore |

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy to Netlify

1. Push this repo to GitHub.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Leave the build command empty and the publish directory as `.` (already set in `netlify.toml`).
4. Open the `https://….netlify.app` URL on your phone and **Add to Home Screen**.

Tip: rename the site to something unguessable (Site configuration → Change site name). `netlify.toml` adds
`noindex` so search engines skip it, but the URL is otherwise public to anyone who has it. Nothing secret
is stored on the server: all trip data stays in each person’s browser.

## Sharing between two phones

Data lives in each browser, so use **Plan → Share** to send your sister a link that imports the itinerary,
saved places and food ratings (**Tools → Settings → Export backup** also works). It is a one-way copy, not live sync.

## Data sources & limits

- Maps/places/Wi-Fi/hospitals: OpenStreetMap (Overpass + Nominatim). Coverage is good in cities, patchy for Wi-Fi tags.
- Earthquakes: USGS and P2PQuake (JMA data). Weather: Open-Meteo. Currency: open.er-api.com.
- **Tabelog has no public API**, so live scores are not fetched; the app opens a pre-filled search and you record the score.
- **Safety is pull-based**: it checks when the app is open. It cannot push notifications and is not an official warning
  system. Keep Safety tips (Japan) / Emergency Ready (Korea) installed too.
- Check entry requirements, prices and pass rules on official sites; they change.
