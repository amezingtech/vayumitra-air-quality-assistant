/* VayuMitra — core.js
 * Pure logic shared by the browser app (app.js) and the Node test suite.
 * No DOM, no network, no secrets. Works in the browser as a classic
 * script (exposes window.VayuMitraCore) and in Node (module.exports).
 * All numbers below come from public, cited sources — see README.md.
 */

/* ---- US EPA PM2.5 (24-hour) AQI breakpoints ----
 * Source: US EPA, "Air Quality Index (AQI) Basics" / 40 CFR Part 58
 * Appendix G. Concentrations in µg/m³, AQI is unitless.
 *   0.0–12.0   ->   0–50    Good
 *  12.1–35.4   ->  51–100   Moderate
 *  35.5–55.4   -> 101–150   Unhealthy for Sensitive Groups
 *  55.5–150.4  -> 151–200   Unhealthy
 * 150.5–250.4  -> 201–300   Very Unhealthy
 * 250.5–350.4  -> 301–400   Hazardous
 * 350.5–500.4  -> 401–500   Hazardous
 */
const EPA_PM25_BREAKPOINTS = [
  { cLo: 0.0,   cHi: 12.0,   iLo: 0,   iHi: 50  },
  { cLo: 12.1,  cHi: 35.4,   iLo: 51,  iHi: 100 },
  { cLo: 35.5,  cHi: 55.4,   iLo: 101, iHi: 150 },
  { cLo: 55.5,  cHi: 150.4,  iLo: 151, iHi: 200 },
  { cLo: 150.5, cHi: 250.4,  iLo: 201, iHi: 300 },
  { cLo: 250.5, cHi: 350.4,  iLo: 301, iHi: 400 },
  { cLo: 350.5, cHi: 500.4,  iLo: 401, iHi: 500 },
];

const AQI_CATEGORIES = [
  { max: 50,  key: 'good',      label: 'Good',                          advice: 'Air quality is satisfactory. Enjoy outdoor activities.' },
  { max: 100, key: 'moderate',  label: 'Moderate',                      advice: 'Acceptable. Unusually sensitive people should watch for symptoms.' },
  { max: 150, key: 'usg',       label: 'Unhealthy for Sensitive Groups', advice: 'Sensitive groups should reduce prolonged or heavy outdoor exertion.' },
  { max: 200, key: 'unhealthy', label: 'Unhealthy',                     advice: 'Everyone may feel effects. Reduce prolonged or heavy outdoor exertion.' },
  { max: 300, key: 'very-unhealthy', label: 'Very Unhealthy',          advice: 'Health alert: everyone is at higher risk. Avoid outdoor exertion.' },
  { max: 500, key: 'hazardous', label: 'Hazardous',                     advice: 'Emergency conditions. Stay indoors and keep windows closed.' },
];

/* WHO 2021 Air Quality Guidelines — the ONLY guideline numbers we cite.
 * PM2.5: annual mean 5 µg/m³, 24-hour mean 15 µg/m³.
 * PM10:  annual mean 15 µg/m³, 24-hour mean 45 µg/m³.
 * NO2:   annual mean 10 µg/m³, 24-hour mean 25 µg/m³.
 * O3:    peak-season 8-hour mean 60 µg/m³.
 * SO2:   24-hour mean 40 µg/m³.  CO: 24-hour mean 4 mg/m³ (= 4000 µg/m³).
 * Source: WHO Global Air Quality Guidelines 2021.
 * We show the 24-hour (or closest) guideline next to each pollutant.
 */
const WHO_GUIDELINES_24H = {
  pm2_5: 15,
  pm10: 45,
  ozone: 60,            // peak-season 8-hour mean — labelled as such in the UI
  nitrogen_dioxide: 25,
  sulphur_dioxide: 40,
  carbon_monoxide: 4000, // 4 mg/m³ expressed in µg/m³
};

/* Breathing rates used ONLY as standard planning assumptions for the
 * modelled inhaled-dose estimate. They are NOT measured values.
 * Source basis: US EPA Exposure Factors Handbook, typical adult
 * ventilation rates, rounded for planning: rest 0.5, walk 1.1,
 * cycle 2.2, run 3.0 m³/hour.
 */
const BREATHING_RATES = {
  rest: 0.5,
  walk: 1.1,
  cycling: 2.2,
  run: 3.0,
  'outdoor-work': 1.6, // moderate manual work, planning assumption
  'school-pickup': 1.1, // walking pace, planning assumption
};

/* Vulnerability multipliers — planning assumptions, documented in README.
 * The highest multiplier among the selected household members applies.
 */
const VULNERABILITY = {
  healthy: 1.0,
  child: 1.3,    // children under 12
  senior: 1.3,   // adults 65+
  asthma: 1.6,   // asthma or other lung condition
  pregnant: 1.4,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** US EPA AQI from a PM2.5 concentration (µg/m³). Linear interpolation
 *  inside the matching breakpoint band; 501 above 500.4 µg/m³.
 *  Returns an integer, or null for invalid input. */
function aqiFromPm25(pm25) {
  if (typeof pm25 !== 'number' || !Number.isFinite(pm25) || pm25 < 0) return null;
  if (pm25 > 500.4) return 501;
  for (const bp of EPA_PM25_BREAKPOINTS) {
    if (pm25 >= bp.cLo && pm25 <= bp.cHi) {
      const aqi = ((bp.iHi - bp.iLo) / (bp.cHi - bp.cLo)) * (pm25 - bp.cLo) + bp.iLo;
      return Math.round(aqi);
    }
  }
  return null;
}

/** AQI category object { key, label, advice } for a US AQI value. */
function aqiCategory(aqi) {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi) || aqi < 0) return null;
  for (const cat of AQI_CATEGORIES) {
    if (aqi <= cat.max) return { key: cat.key, label: cat.label, advice: cat.advice };
  }
  return { key: 'hazardous', label: 'Hazardous', advice: AQI_CATEGORIES[5].advice };
}

/** Modelled inhaled PM2.5 dose in micrograms.
 *  dose = PM2.5 (µg/m³) × breathing rate (m³/h) × duration (h).
 *  Labelled in the UI as a modelled estimate, never a measured fact. */
function doseEstimate(pm25, activity, durationMinutes) {
  if (typeof pm25 !== 'number' || !Number.isFinite(pm25) || pm25 < 0) return null;
  if (typeof durationMinutes !== 'number' || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  const rate = BREATHING_RATES[activity];
  if (rate === undefined) return null;
  // Round to 2 decimals so 100 × 1.1 × 1 is exactly 110, not 110.00000000000001.
  return Math.round(pm25 * rate * (durationMinutes / 60) * 100) / 100;
}

/** Highest vulnerability multiplier among selected profile keys. */
function vulnerabilityMultiplier(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0) return VULNERABILITY.healthy;
  let mult = VULNERABILITY.healthy;
  for (const p of profiles) {
    if (VULNERABILITY[p] !== undefined) mult = Math.max(mult, VULNERABILITY[p]);
  }
  return mult;
}

/* ---- Personal risk score (0–100), deterministic and transparent ----
 * Formula (also in README.md and in the app's "How the score works"):
 *   dose  = PM2.5 × breathing rate × duration (µg, modelled estimate)
 *   score = round( clamp( (AQI × 0.30 + dose ÷ 8) × vulnerability, 0, 100 ) )
 * AQI carries the ambient hazard; dose carries how much of it you would
 * actually breathe in during this activity; vulnerability scales for
 * children, seniors, asthma/lung conditions and pregnancy.
 * Verdicts: 0–24 Go · 25–49 Go with care · 50–74 Avoid · 75–100 Skip.
 */
function riskScore({ pm25, aqi, activity, durationMinutes, profiles }) {
  const aqiValue = (typeof aqi === 'number' && Number.isFinite(aqi))
    ? aqi
    : aqiFromPm25(pm25);
  if (aqiValue === null || aqiValue === undefined) return null;
  const dose = doseEstimate(pm25, activity, durationMinutes);
  if (dose === null) return null;
  const vuln = vulnerabilityMultiplier(profiles);
  const raw = (aqiValue * 0.30 + dose / 8) * vuln;
  return clamp(Math.round(raw), 0, 100);
}

function riskVerdict(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score <= 24) return { key: 'go', label: 'Go' };
  if (score <= 49) return { key: 'care', label: 'Go with care' };
  if (score <= 74) return { key: 'avoid', label: 'Avoid' };
  return { key: 'skip', label: 'Skip' };
}

/** Reasons (plain strings) explaining a risk result, for transparency. */
function riskReasons({ pm25, aqi, activity, durationMinutes, profiles, score }) {
  const reasons = [];
  const cat = aqiCategory(aqi);
  if (cat) reasons.push(`Air quality is ${cat.label} (US AQI ${aqi}).`);
  if (typeof pm25 === 'number') {
    const ratio = pm25 / WHO_GUIDELINES_24H.pm2_5;
    reasons.push(`PM2.5 is ${pm25.toFixed(0)} µg/m³ — about ${ratio.toFixed(1)}× the WHO 24-hour guideline of 15 µg/m³.`);
  }
  const dose = doseEstimate(pm25, activity, durationMinutes);
  if (dose !== null) {
    reasons.push(`Modelled inhaled dose for this activity is about ${dose.toFixed(0)} µg of PM2.5 (estimate, not a measurement).`);
  }
  const vuln = vulnerabilityMultiplier(profiles);
  if (vuln > 1.0) {
    const who = (profiles || []).filter((p) => p !== 'healthy');
    reasons.push(`Risk is raised for ${who.join(', ')} (vulnerability ×${vuln.toFixed(1)}).`);
  }
  if (durationMinutes >= 60) reasons.push('Longer time outdoors means a larger inhaled dose.');
  if (score !== null && score !== undefined && score >= 50) {
    reasons.push('Consider shifting this activity to a cleaner hour — see “What if I shift it?” below.');
  }
  return reasons;
}

/** Find the cleanest window of `durationMinutes` inside an hourly PM2.5
 *  series. `hourlyPm25` is an array of { time, pm25 } (or numbers).
 *  Returns { startIndex, startTime, avgPm25 } or null. */
function bestWindow(hourlyPm25, durationMinutes) {
  if (!Array.isArray(hourlyPm25) || hourlyPm25.length === 0) return null;
  const hours = clamp(Math.max(1, Math.round((durationMinutes || 60) / 60)), 1, hourlyPm25.length);
  const values = hourlyPm25.map((h) => (typeof h === 'number' ? h : h.pm25));
  if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  let best = null;
  for (let i = 0; i + hours <= values.length; i++) {
    const slice = values.slice(i, i + hours);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    if (best === null || avg < best.avgPm25) {
      best = {
        startIndex: i,
        startTime: typeof hourlyPm25[i] === 'number' ? null : hourlyPm25[i].time,
        avgPm25: avg,
      };
    }
  }
  return best;
}

/** Compare a chosen slot's average PM2.5 with the cleanest window.
 *  Returns { chosenAvg, bestAvg, pctLower } where pctLower is how much
 *  lower the best window's PM2.5 is, in percent (0 when no improvement). */
function shiftComparison(hourlyPm25, chosenStartIndex, durationMinutes) {
  const best = bestWindow(hourlyPm25, durationMinutes);
  if (!best) return null;
  const hours = clamp(Math.max(1, Math.round((durationMinutes || 60) / 60)), 1, hourlyPm25.length);
  const values = hourlyPm25.map((h) => (typeof h === 'number' ? h : h.pm25));
  const start = clamp(chosenStartIndex || 0, 0, Math.max(0, values.length - hours));
  const slice = values.slice(start, start + hours);
  const chosenAvg = slice.reduce((a, b) => a + b, 0) / slice.length;
  const pctLower = chosenAvg > 0
    ? Math.max(0, Math.round(((chosenAvg - best.avgPm25) / chosenAvg) * 100))
    : 0;
  return { chosenAvg, bestAvg: best.avgPm25, bestStartIndex: best.startIndex, bestStartTime: best.startTime, pctLower };
}

/** Average of the next `count` hourly PM2.5 values starting at `startIndex`. */
function windowAverage(hourlyPm25, startIndex, durationMinutes) {
  if (!Array.isArray(hourlyPm25) || hourlyPm25.length === 0) return null;
  const hours = clamp(Math.max(1, Math.round((durationMinutes || 60) / 60)), 1, hourlyPm25.length);
  const values = hourlyPm25.map((h) => (typeof h === 'number' ? h : h.pm25));
  const start = clamp(startIndex || 0, 0, Math.max(0, values.length - hours));
  const slice = values.slice(start, start + hours);
  if (slice.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

const VayuMitraCore = {
  EPA_PM25_BREAKPOINTS,
  AQI_CATEGORIES,
  WHO_GUIDELINES_24H,
  BREATHING_RATES,
  VULNERABILITY,
  clamp,
  aqiFromPm25,
  aqiCategory,
  doseEstimate,
  vulnerabilityMultiplier,
  riskScore,
  riskVerdict,
  riskReasons,
  bestWindow,
  shiftComparison,
  windowAverage,
};

if (typeof module !== 'undefined' && module.exports) module.exports = VayuMitraCore;
if (typeof window !== 'undefined') window.VayuMitraCore = VayuMitraCore;
