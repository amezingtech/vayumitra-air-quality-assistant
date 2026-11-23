# VayuMitra — Architecture

Static site, no build step, no backend, no dependencies. Deployable to
GitHub Pages by copying the folder.

```
air-quality-assistant/
├── index.html      # structure + all copy; CSP meta tag; loads core.js then app.js
├── styles.css      # all styling; system fonts; prefers-reduced-motion respected
├── core.js         # pure logic, no DOM, no network
│                   #   - EPA PM2.5 → US AQI breakpoints + category mapping
│                   #   - WHO 2021 guideline table (24-hour values)
│                   #   - breathing rates (planning assumptions)
│                   #   - dose estimate, risk score + verdict, reasons
│                   #   - best-window finder, shift comparison, window average
│                   #   Exposes window.VayuMitraCore in the browser and
│                   #   module.exports in Node, so tests exercise the exact
│                   #   code the app runs.
├── app.js          # browser logic only (fetch, render, planner, chat, i18n)
│                   #   - Open-Meteo Air Quality + Geocoding fetches (12 s timeout)
│                   #   - labelled demo dataset as fallback, never as live data
│                   #   - hand-drawn SVG hourly chart (no chart library)
│                   #   - offline briefing + Gemini 2.5 Flash BYOK chat
│                   #   - English / Hindi / Marathi strings for verdicts,
│                   #     key advice and health notes
├── tests/
│   └── core.test.js  # node:test, 26 tests over core.js
├── README.md
├── ARCHITECTURE.md   # this file
├── LICENSE           # MIT
└── .gitignore
```

## Data flow

1. On load (and on every city change) `app.js` fetches 48 hours of hourly
   data from the Open-Meteo Air Quality API for the chosen coordinates.
2. The current hour is picked by matching the latest hourly timestamp at or
   before `Date.now()` (API times are UTC).
3. `core.js` converts PM2.5 → US AQI (EPA breakpoints), maps the AQI to its
   category, finds the dominant pollutant (highest ratio vs its WHO
   guideline) and computes risk scores / best windows from the hourly series.
4. The planner reads the chosen start hour's PM2.5 + US AQI, the household
   profile, activity and duration, and returns score + verdict + reasons.
5. The assistant either builds an offline briefing from the same live data
   or, when the user has saved a Gemini key, calls
   `generativelanguage.googleapis.com` with a prompt that includes the live
   numbers. The key lives only in `localStorage`.

## Why this shape

- **Static + no dependencies** keeps the repo far under the 10 MB
  submission limit, makes GitHub Pages deployment trivial, and removes any
  supply-chain risk from npm packages.
- **core.js shared by app and tests** means the tested formula is the shipped
  formula — there is no second implementation to drift.
- **No backend** means no user data ever leaves the browser except the two
  public, keyless Open-Meteo calls and (only with a user-supplied key) the
  Gemini call.
- **Demo fallback** keeps the app usable offline, but it is always labelled,
  so demo numbers can never be mistaken for live measurements.
