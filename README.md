# VayuMitra — Urban Air Quality Assistant

**वायुमित्र** · A free, GenAI-powered assistant that helps families and communities
navigate severe winter smog and urban air pollution. Built for
**PromptWars Virtual Challenge 06: Urban Air Quality Assistant**.

Live air quality, a family activity planner with a transparent risk score,
low-emission daily routines, indoor air hacks, sustainable swaps, and a
Gemini-powered assistant (bring your own key) — in English, Hindi and Marathi.

Three AQI scales are shown side by side: the daily **US AQI** from
Open-Meteo, the **CPCB AQI (India)** computed here from trailing
averages, and the **EU AQI** from Open-Meteo — plus this hour's AQI.

## Problem statement (PromptWars Challenge 06)

> "Create a GenAI-powered assistant that helps families and communities
> navigate severe winter smog and urban air pollution. The application should
> suggest low-emission daily routines, indoor air quality hacks, and
> sustainable alternatives tailored to their location and lifestyle, while
> clearly explaining the direct impact of their choices."

## Run locally

No build step, no dependencies, no backend. Any static server works:

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

Or deploy the folder as-is to GitHub Pages (Settings → Pages → Deploy from
branch). The app is pure `index.html` + `styles.css` + `app.js` + `core.js`.

## Live data sources (real data only — nothing invented)

| Data | Source | Key needed? |
|---|---|---|
| Air quality (PM2.5, PM10, O₃, NO₂, SO₂, CO, US AQI, EU AQI, 72 h: 24 past + 48 forecast) | [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | No — free, CORS-enabled |
| Place search / geocoding | [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) | No |
| Location | Browser `navigator.geolocation` (optional, with fallback) | — |
| US AQI breakpoints | US EPA, current table (EPA-454/B-24-002, Table 6, May 2024; 40 CFR Part 58, Appendix G as amended) — PM2.5 Good ends at 9.0 µg/m³ | — |
| CPCB AQI (India) breakpoints | CPCB, "National Air Quality Index" (Oct 2014), Table 2 — overall AQI is the maximum sub-index, capped at 500 | — |
| Guideline values | WHO Global Air Quality Guidelines 2021 — PM2.5 24-hour 15 µg/m³, annual 5 µg/m³; PM10 24-hour 45; NO₂ 24-hour 25; O₃ peak-season 8-hour 60; SO₂ 24-hour 40; CO 24-hour 4 mg/m³ | — |

## How the AQI numbers are computed (read this before comparing numbers)

Open-Meteo's `us_aqi` is a **daily AQI**: it is built from trailing
24-hour averages, so it moves slowly through the day. The app shows it
as the headline "Daily US AQI". Separately, the app shows **"this
hour"** — the AQI computed from the current hour's PM2.5 on the current
EPA table. The two legitimately differ. Verified 23 Nov 2026, Delhi,
16:00 UTC: PM2.5 71.5 µg/m³ → this hour 162, daily US AQI 181,
CPCB AQI 179 (Moderately Polluted).

- **US AQI, hourly:** from the hour's PM2.5 with the current EPA
  breakpoints (May 2024 revision). The chart, the planner and the
  start-time list all use this hourly value, because they are about the
  air in a specific hour. The full EPA sub-index tables for PM10, O3,
  NO2, SO2 and CO are also implemented in `core.js` and used as the
  fallback if Open-Meteo's `us_aqi` is ever missing; unit conversions
  use standard 25 °C / 1 atm factors (O3 1 ppb = 1.96 µg/m³, NO2
  1 ppb = 1.88, SO2 1 ppb = 2.62, CO 1 ppm = 1.145 mg/m³).
- **CPCB AQI (India):** computed here from trailing averages, exactly
  as CPCB specifies — 24-hour means for PM2.5/PM10/NO2/SO2 and 8-hour
  means for O3/CO (O3's two top bands use the 1-hour value). At least
  16 hours of trailing data are required (CPCB's own minimum); with
  less, the app shows "needs 16 hours of trailing data" instead of a
  number. Overall CPCB AQI is the maximum sub-index, capped at 500.
  Categories: Good, Satisfactory, Moderately Polluted, Poor, Very Poor,
  Severe. Verified: Delhi 24 Nov 16:00 UTC trailing means give CPCB
  100 (Satisfactory, driven by PM2.5).
- **Timezone:** the app requests `timezone=UTC` explicitly, plus
  `past_days=1` so a full trailing 24 hours exists at any hour of the
  day (without it the response starts at 00:00 UTC and the trailing
  averages would be unavailable before ~16:00 UTC). The API
  answers with `timezone: GMT`, `utc_offset_seconds: 0`, and the app
  parses every timestamp with that offset (`apiTimeToMs` in `core.js`),
  never by assuming. Times are displayed in the viewer's local time,
  and the data timezone is shown next to the AQI card. The "current
  hour" is the last API hour at or before now, matched on absolute
  instants — verified against the live response (23 Nov 16:10 UTC
  matched the 16:00 hour: PM2.5 71.5, US AQI 181).
- **EU AQI:** shown as returned by Open-Meteo.
- One honest difference: Open-Meteo's daily US AQI can sit a point or
  two from our own trailing-average EPA computation (e.g. 153 vs 154
  at one checked hour) — different averaging windows and the 2024
  table revision. The app shows Open-Meteo's value as the headline and
  documents the method here rather than hiding the gap.

If the API is unreachable, the app shows a clear error state and a **labelled
demo dataset** ("Demo data — live API unavailable"). Demo data is never
presented as live.

## Features

1. **City search** + quick chips (Delhi, Mumbai, Pune, Satara, Bengaluru,
   Lucknow, Kolkata, Chennai) + Use my location + **Refresh** button.
2. **Current AQI card** — big daily US AQI number with a 0–500 gauge,
   EPA category (Good → Hazardous), this hour's AQI, **CPCB AQI (India)**
   with its own category, dominant pollutant, all 6 pollutants as bars
   against their WHO guideline, EU AQI, data source, data timezone and
   last-updated time.
3. **24-hour hourly AQI forecast chart** — hand-drawn SVG, no library —
   computed from each hour's PM2.5, with the cleanest and worst hours
   marked.
4. **Family & activity planner** — household profile (healthy adult, child
   <12, senior 65+, asthma/lung condition, pregnant), activity (walk / run /
   cycling / school pickup / outdoor work), duration, start time. Deterministic
   risk score 0–100 + verdict (Go / Go with care / Avoid / Skip) + reasons.
5. **"What if I shift it?"** — compares the chosen slot with the cleanest
   1-hour window in the next 24 h and shows the % lower average PM2.5.
6. **Low-emission routines, indoor hacks, sustainable swaps** — each with a
   quantified *modelled* impact where one can be calculated from today's live
   data; every figure is labelled as an estimate from the modelled dose,
   never as a measured fact.
7. **GenAI assistant (Google Gemini, BYOK)** — see below.
8. **Language toggle** — English / Hindi / Marathi for verdicts, key
   recommendations and health notes.
9. **Accessibility** — semantic landmarks, labels on every input, `aria-live`
   results, keyboard-operable, visible focus, colour + text (never colour
   alone) for AQI categories, `prefers-reduced-motion` respected.
10. **Security** — no `eval`, no `innerHTML` with untrusted data (DOM built
    with `textContent`), input validation + length limits, no secrets in the
    repo, Content-Security-Policy meta tag.

## Risk-score formula (transparent, deterministic)

```
dose (µg, modelled estimate) = PM2.5 (µg/m³) × breathing rate (m³/h) × duration (h)
score = round( (US AQI × 0.30 + dose ÷ 8) × vulnerability ), capped at 0–100
```

- **Breathing rates** are standard planning assumptions, not measured values:
  rest 0.5, walk 1.1, cycling 2.2, run 3.0 m³/h; outdoor work 1.6, school
  pickup 1.1. (Basis: US EPA Exposure Factors Handbook typical adult
  ventilation rates, rounded for planning.)
- **Vulnerability multipliers** (highest selected applies): healthy adult ×1.0,
  child under 12 ×1.3, senior 65+ ×1.3, asthma/lung condition ×1.6,
  pregnant ×1.4.
- **Verdicts:** 0–24 Go · 25–49 Go with care · 50–74 Avoid · 75–100 Skip.
- The score is a planning aid, not medical advice. People with a lung
  condition should follow their doctor's advice first.

The same formula is implemented in `core.js`, documented in the app under
"How the score works", and covered by tests in `tests/`.

## Gemini assistant (BYOK — bring your own key)

- The assistant works **without a key**: it builds a clearly-labelled
  **offline briefing** from the live AQI data + risk engine.
- With a key, it calls **Google Gemini `gemini-2.5-flash`** via the
  Generative Language API. The prompt includes the live AQI numbers, household
  profile and planned activity, and asks for short, plain-language advice in
  the selected language.
- **Your key is stored only in your browser's `localStorage`** and is sent
  only to `generativelanguage.googleapis.com`. It is never sent anywhere else,
  never logged, and never leaves the repo (there is no server). A **Remove
  key** button deletes it.
- Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey).

## Tests

```bash
node --test            # 39 tests, no dependencies (Node's built-in runner)
```

Covers: EPA AQI breakpoints on the current 2024 table (incl. boundaries
9.0, 35.4, 55.4, 125.4, 225.4, 325.4 µg/m³), EPA sub-indices for PM10,
O3, NO2, SO2 and CO, CPCB sub-indices and categories (incl. boundaries
for all six pollutants, the 3-pollutant minimum rule, and the O3
8-hour/1-hour switch), trailing 24-hour/8-hour means, API-time parsing
with UTC offsets, AQI category mapping, risk-score monotonicity (higher
AQI → higher risk; asthma > healthy adult; longer duration → higher
risk), best-window finder, shift comparison, dose estimate. Two live
cross-checks are baked in as tests: Delhi 23 Nov 16:00 UTC (PM2.5 71.5
→ hourly AQI 162; trailing means → CPCB 179) and 24 Nov 16:00 UTC
(trailing means → EPA 154, CPCB 100).

## Accessibility & security notes

- Every input has a `<label>`; results use `aria-live`; AQI categories always
  show text, not colour alone; focus is visible; reduced-motion is respected.
- No `eval()`; no `innerHTML` with untrusted data; city/key/chat inputs are
  length-limited and validated; CSP meta tag restricts sources to self +
  the two Open-Meteo APIs + Google's Generative Language API.
- No trackers, no cookies, no analytics, no server-side storage.

## Known limits

- Open-Meteo is a **modelled forecast**, not a monitoring station — values can
  differ from a local station reading. Its daily US AQI may sit a point or
  two from our own trailing-average EPA computation (different averaging
  windows / the 2024 table revision) — see "How the AQI numbers are
  computed" above.
- The risk score and inhaled dose are **modelled planning estimates**, not
  measurements and not medical advice. The planner uses the *hourly* AQI
  for the planned hour, not the daily AQI.
- CPCB AQI needs 16 hours of trailing data; the request includes a
  full past day, so it is available at any hour in live mode — if the
  API ever returns a shorter window, the app shows it as unavailable
  rather than guessing.
- Gemini answers need your own key; without one you get the offline briefing.
- Geocoding picks the best match and prefers results in India when names
  collide (e.g. Delhi, India vs Delhi, USA).
- Forecast chart covers the next 24 hours from the current hour.

## PromptWars Challenge 06 — submission note

Public GitHub repository (under 10 MB, no build step, deployable to GitHub
Pages), deployed link and demo video are submitted through the PromptWars
platform. This repo contains no API keys, no `node_modules`, no large
binaries — the whole project is a few tens of kilobytes.

## Licence

MIT — see `LICENSE`.

## Author

Manoj Kadam / Amezing Tech — amezingtech.com
