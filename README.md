# VayuMitra — Urban Air Quality Assistant

**वायुमित्र** · A free, GenAI-powered assistant that helps families and communities
navigate severe winter smog and urban air pollution. Built for
**PromptWars Virtual Challenge 06: Urban Air Quality Assistant**.

Live air quality, a family activity planner with a transparent risk score,
low-emission daily routines, indoor air hacks, sustainable swaps, and a
Gemini-powered assistant (bring your own key) — in English, Hindi and Marathi.

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
| Air quality (PM2.5, PM10, O₃, NO₂, SO₂, CO, US AQI, EU AQI, 48 h) | [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | No — free, CORS-enabled |
| Place search / geocoding | [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) | No |
| Location | Browser `navigator.geolocation` (optional, with fallback) | — |
| AQI categories | US EPA AQI breakpoints (40 CFR Part 58, Appendix G) | — |
| Guideline values | WHO Global Air Quality Guidelines 2021 — PM2.5 24-hour 15 µg/m³, annual 5 µg/m³; PM10 24-hour 45; NO₂ 24-hour 25; O₃ peak-season 8-hour 60; SO₂ 24-hour 40; CO 24-hour 4 mg/m³ | — |

If the API is unreachable, the app shows a clear error state and a **labelled
demo dataset** ("Demo data — live API unavailable"). Demo data is never
presented as live.

## Features

1. **City search** + quick chips (Delhi, Mumbai, Pune, Satara, Bengaluru,
   Lucknow, Kolkata, Chennai) + Use my location.
2. **Current AQI card** — big US AQI number, EPA category (Good → Hazardous),
   dominant pollutant, all 6 pollutants in µg/m³ vs the WHO guideline,
   EU AQI, last-updated time.
3. **24-hour hourly AQI forecast chart** — hand-drawn SVG, no library — plus
   the cleanest and worst hour.
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
node --test            # 26 tests, no dependencies (Node's built-in runner)
```

Covers: EPA AQI breakpoints (incl. boundaries 12.0, 35.4, 55.4, 150.4,
250.4 µg/m³), AQI category mapping, risk-score monotonicity (higher AQI →
higher risk; asthma > healthy adult; longer duration → higher risk),
best-window finder, shift comparison, dose estimate.

## Accessibility & security notes

- Every input has a `<label>`; results use `aria-live`; AQI categories always
  show text, not colour alone; focus is visible; reduced-motion is respected.
- No `eval()`; no `innerHTML` with untrusted data; city/key/chat inputs are
  length-limited and validated; CSP meta tag restricts sources to self +
  the two Open-Meteo APIs + Google's Generative Language API.
- No trackers, no cookies, no analytics, no server-side storage.

## Known limits

- Open-Meteo is a **modelled forecast**, not a monitoring station — values can
  differ from a local station reading.
- The risk score and inhaled dose are **modelled planning estimates**, not
  measurements and not medical advice.
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
