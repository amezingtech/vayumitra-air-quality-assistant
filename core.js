/* VayuMitra — core.js
 * Pure logic shared by the browser app (app.js) and the Node test suite.
 * No DOM, no network, no secrets. Works in the browser as a classic
 * script (exposes window.VayuMitraCore) and in Node (module.exports).
 * All numbers below come from public, cited sources — see README.md.
 *
 * ACCURACY NOTES (verified 23 Nov 2026 against live Open-Meteo data):
 * - US EPA PM2.5 breakpoints use the CURRENT EPA table (EPA-454/B-24-002,
 *   Table 6, May 2024; 40 CFR Part 58, Appendix G as amended): Good ends
 *   at 9.0 µg/m³, not 12.0. The pre-2024 table is NOT used.
 * - Open-Meteo's `us_aqi` is a DAILY AQI (built from trailing 24-hour
 *   averages, so it moves slowly). The app shows it as the headline daily
 *   value, and separately shows the CURRENT HOUR's AQI computed here from
 *   that hour's PM2.5. The two legitimately differ (e.g. Delhi 23 Nov
 *   16:00 UTC: daily 181, this hour 162).
 * - CPCB (India) AQI is computed here from trailing averages — 24-hour
 *   means for PM2.5/PM10/NO2/SO2, 8-hour means for O3/CO — exactly as
 *   CPCB specifies. At least 16 hours of trailing data are required
 *   (CPCB's own minimum); fewer than that returns null.
 * - EPA/CPCB sub-indices officially use averaged concentrations, NOT a
 *   single hourly reading. Where the app only has one hour (planner,
 *   chart), it uses that hour's value as the averaging input and says so.
 */

/* ---- Generic piecewise-linear sub-index ----
 * bands: [{ cLo, cHi, iLo, iHi }] in concentration units, contiguous
 * (each band's cLo equals the previous band's cHi). A value exactly on
 * a shared boundary takes the LOWER band's top index (e.g. 9.0 -> 50).
 * aboveTop: value returned when the concentration is above the last
 * band (EPA: 501 — beyond the index scale; CPCB: 500 — CPCB caps at 500).
 */
function subIndexFromBreakpoints(value, bands, aboveTop) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  for (const bp of bands) {
    if (value >= bp.cLo && value <= bp.cHi) {
      const idx = ((bp.iHi - bp.iLo) / (bp.cHi - bp.cLo)) * (value - bp.cLo) + bp.iLo;
      return Math.round(idx);
    }
  }
  return aboveTop;
}

/* ---- US EPA breakpoints (40 CFR Part 58, Appendix G, Table 2;
 * current version per EPA-454/B-24-002, Table 6, May 2024) ---- */

/* PM2.5, 24-hour, µg/m³ — REVISED May 2024 (Good now ends at 9.0).
 *   0.0–9.0     ->   0–50    Good
 *   9.1–35.4    ->  51–100   Moderate
 *  35.5–55.4    -> 101–150   Unhealthy for Sensitive Groups
 *  55.5–125.4   -> 151–200   Unhealthy
 * 125.5–225.4   -> 201–300   Very Unhealthy
 * 225.5–325.4   -> 301–500   Hazardous (AQI 500 at 325.4 µg/m³)
 */
const EPA_PM25_BREAKPOINTS = [
  { cLo: 0.0,   cHi: 9.0,    iLo: 0,   iHi: 50  },
  { cLo: 9.0,   cHi: 35.4,   iLo: 51,  iHi: 100 },
  { cLo: 35.4,  cHi: 55.4,   iLo: 101, iHi: 150 },
  { cLo: 55.4,  cHi: 125.4,  iLo: 151, iHi: 200 },
  { cLo: 125.4, cHi: 225.4,  iLo: 201, iHi: 300 },
  { cLo: 225.4, cHi: 325.4,  iLo: 301, iHi: 500 },
];

/* PM10, 24-hour, µg/m³ (EPA truncates to integer; bands are contiguous here). */
const EPA_PM10_BREAKPOINTS = [
  { cLo: 0,   cHi: 54,  iLo: 0,   iHi: 50  },
  { cLo: 54,  cHi: 154, iLo: 51,  iHi: 100 },
  { cLo: 154, cHi: 254, iLo: 101, iHi: 150 },
  { cLo: 254, cHi: 354, iLo: 151, iHi: 200 },
  { cLo: 354, cHi: 424, iLo: 201, iHi: 300 },
  { cLo: 424, cHi: 504, iLo: 301, iHi: 400 },
  { cLo: 504, cHi: 604, iLo: 401, iHi: 500 },
];

/* Ozone, 8-hour, ppm. Above 0.200 ppm the EPA uses the 1-hour value. */
const EPA_O3_8H_BREAKPOINTS = [
  { cLo: 0.0,   cHi: 0.054, iLo: 0,   iHi: 50  },
  { cLo: 0.054, cHi: 0.070, iLo: 51,  iHi: 100 },
  { cLo: 0.070, cHi: 0.085, iLo: 101, iHi: 150 },
  { cLo: 0.085, cHi: 0.105, iLo: 151, iHi: 200 },
  { cLo: 0.105, cHi: 0.200, iLo: 201, iHi: 300 },
];
/* Ozone, 1-hour, ppm (used only when 8-hour O3 exceeds 0.200 ppm). */
const EPA_O3_1H_BREAKPOINTS = [
  { cLo: 0.125, cHi: 0.164, iLo: 101, iHi: 150 },
  { cLo: 0.164, cHi: 0.204, iLo: 151, iHi: 200 },
  { cLo: 0.204, cHi: 0.404, iLo: 201, iHi: 300 },
  { cLo: 0.404, cHi: 0.504, iLo: 301, iHi: 400 },
  { cLo: 0.504, cHi: 0.604, iLo: 401, iHi: 500 },
];

/* NO2, 1-hour, ppb. */
const EPA_NO2_BREAKPOINTS = [
  { cLo: 0,    cHi: 53,   iLo: 0,   iHi: 50  },
  { cLo: 53,   cHi: 100,  iLo: 51,  iHi: 100 },
  { cLo: 100,  cHi: 360,  iLo: 101, iHi: 150 },
  { cLo: 360,  cHi: 649,  iLo: 151, iHi: 200 },
  { cLo: 649,  cHi: 1249, iLo: 201, iHi: 300 },
  { cLo: 1249, cHi: 1649, iLo: 301, iHi: 400 },
  { cLo: 1649, cHi: 2049, iLo: 401, iHi: 500 },
];

/* SO2: 1-hour ppb up to AQI 200; 24-hour ppb above that (EPA rule). */
const EPA_SO2_1H_BREAKPOINTS = [
  { cLo: 0,   cHi: 35,  iLo: 0,   iHi: 50  },
  { cLo: 35,  cHi: 75,  iLo: 51,  iHi: 100 },
  { cLo: 75,  cHi: 185, iLo: 101, iHi: 150 },
  { cLo: 185, cHi: 304, iLo: 151, iHi: 200 },
];
const EPA_SO2_24H_BREAKPOINTS = [
  { cLo: 304, cHi: 604,  iLo: 201, iHi: 300 },
  { cLo: 604, cHi: 804,  iLo: 301, iHi: 400 },
  { cLo: 804, cHi: 1004, iLo: 401, iHi: 500 },
];

/* CO, 8-hour, ppm. */
const EPA_CO_BREAKPOINTS = [
  { cLo: 0.0,  cHi: 4.4,  iLo: 0,   iHi: 50  },
  { cLo: 4.4,  cHi: 9.4,  iLo: 51,  iHi: 100 },
  { cLo: 9.4,  cHi: 12.4, iLo: 101, iHi: 150 },
  { cLo: 12.4, cHi: 15.4, iLo: 151, iHi: 200 },
  { cLo: 15.4, cHi: 30.4, iLo: 201, iHi: 300 },
  { cLo: 30.4, cHi: 40.4, iLo: 301, iHi: 400 },
  { cLo: 40.4, cHi: 50.4, iLo: 401, iHi: 500 },
];

/* Unit conversions, µg/m³ -> EPA units (25 °C, 1 atm; standard factors:
 * O3 1 ppb = 1.96 µg/m³ (so 1 ppm = 1960 µg/m³); NO2 1 ppb = 1.88 µg/m³;
 * SO2 1 ppb = 2.62 µg/m³; CO 1 ppm = 1.145 mg/m³ = 1145 µg/m³. */
function ugm3ToPpmO3(v) { return v / 1960; }
function ugm3ToPpbNo2(v) { return v / 1.88; }
function ugm3ToPpbSo2(v) { return v / 2.62; }
function ugm3ToPpmCo(v) { return v / 1145; }

/* ---- CPCB (India) National Air Quality Index breakpoints ----
 * Source: CPCB, "National Air Quality Index" (Oct 2014), Table 2.
 * Averaging: PM2.5, PM10, NO2, SO2 use 24-hour means; O3 and CO use
 * 8-hour means (O3's two top bands use the 1-hour value instead).
 * Categories: Good 0–50, Satisfactory 51–100, Moderately Polluted
 * 101–200, Poor 201–300, Very Poor 301–400, Severe 401–500.
 * Overall CPCB AQI = maximum sub-index; CPCB caps the index at 500.
 * A station needs at least 3 pollutants (incl. PM2.5 or PM10) and at
 * least 16 hours of data — enforced in cpcbAqiFromReadings. */
const CPCB_BREAKPOINTS = {
  pm2_5: [ // 24-hour, µg/m³
    { cLo: 0,   cHi: 30,  iLo: 0,   iHi: 50  },
    { cLo: 30,  cHi: 60,  iLo: 50,  iHi: 100 },
    { cLo: 60,  cHi: 90,  iLo: 100, iHi: 200 },
    { cLo: 90,  cHi: 120, iLo: 200, iHi: 300 },
    { cLo: 120, cHi: 250, iLo: 300, iHi: 400 },
    { cLo: 250, cHi: 500, iLo: 400, iHi: 500 },
  ],
  pm10: [ // 24-hour, µg/m³
    { cLo: 0,   cHi: 50,  iLo: 0,   iHi: 50  },
    { cLo: 50,  cHi: 100, iLo: 50,  iHi: 100 },
    { cLo: 100, cHi: 250, iLo: 100, iHi: 200 },
    { cLo: 250, cHi: 350, iLo: 200, iHi: 300 },
    { cLo: 350, cHi: 430, iLo: 300, iHi: 400 },
    { cLo: 430, cHi: 600, iLo: 400, iHi: 500 },
  ],
  nitrogen_dioxide: [ // 24-hour, µg/m³
    { cLo: 0,   cHi: 40,  iLo: 0,   iHi: 50  },
    { cLo: 40,  cHi: 80,  iLo: 50,  iHi: 100 },
    { cLo: 80,  cHi: 180, iLo: 100, iHi: 200 },
    { cLo: 180, cHi: 280, iLo: 200, iHi: 300 },
    { cLo: 280, cHi: 400, iLo: 300, iHi: 400 },
    { cLo: 400, cHi: 800, iLo: 400, iHi: 500 },
  ],
  sulphur_dioxide: [ // 24-hour, µg/m³
    { cLo: 0,    cHi: 40,   iLo: 0,   iHi: 50  },
    { cLo: 40,   cHi: 80,   iLo: 50,  iHi: 100 },
    { cLo: 80,   cHi: 380,  iLo: 100, iHi: 200 },
    { cLo: 380,  cHi: 800,  iLo: 200, iHi: 300 },
    { cLo: 800,  cHi: 1600, iLo: 300, iHi: 400 },
    { cLo: 1600, cHi: 3200, iLo: 400, iHi: 500 },
  ],
  ozone_8h: [ // 8-hour, µg/m³ (top two bands use the 1-hour value)
    { cLo: 0,   cHi: 50,  iLo: 0,   iHi: 50  },
    { cLo: 50,  cHi: 100, iLo: 50,  iHi: 100 },
    { cLo: 100, cHi: 168, iLo: 100, iHi: 200 },
    { cLo: 168, cHi: 208, iLo: 200, iHi: 300 },
  ],
  ozone_1h: [ // 1-hour, µg/m³ — only for CPCB AQI above 300
    { cLo: 208, cHi: 748,  iLo: 300, iHi: 400 },
    { cLo: 748, cHi: 1000, iLo: 400, iHi: 500 },
  ],
  carbon_monoxide: [ // 8-hour, mg/m³
    { cLo: 0,  cHi: 1,  iLo: 0,   iHi: 50  },
    { cLo: 1,  cHi: 2,  iLo: 50,  iHi: 100 },
    { cLo: 2,  cHi: 10, iLo: 100, iHi: 200 },
    { cLo: 10, cHi: 17, iLo: 200, iHi: 300 },
    { cLo: 17, cHi: 34, iLo: 300, iHi: 400 },
    { cLo: 34, cHi: 50, iLo: 400, iHi: 500 },
  ],
};

const CPCB_CATEGORIES = [
  { max: 50,  key: 'good',        label: 'Good' },
  { max: 100, key: 'satisfactory', label: 'Satisfactory' },
  { max: 200, key: 'moderate',    label: 'Moderately Polluted' },
  { max: 300, key: 'poor',        label: 'Poor' },
  { max: 400, key: 'very-poor',   label: 'Very Poor' },
  { max: 500, key: 'severe',      label: 'Severe' },
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

/** US EPA AQI from a PM2.5 concentration (µg/m³), current 2024 table.
 *  Linear interpolation inside the matching breakpoint band; 501 above
 *  325.4 µg/m³ (beyond the index scale). Returns an integer, or null
 *  for invalid input. */
function aqiFromPm25(pm25) {
  return subIndexFromBreakpoints(pm25, EPA_PM25_BREAKPOINTS, 501);
}

/** US EPA sub-index for a single pollutant, from a concentration in
 *  EPA native units. `pollutant` is one of: pm10 (µg/m³, 24h), o3_8h
 *  (ppm), o3_1h (ppm), no2_1h (ppb), so2_1h (ppb), co_8h (ppm).
 *  Returns an integer sub-index, or null for invalid input. */
function epaSubIndex(pollutant, value) {
  switch (pollutant) {
    case 'pm10': return subIndexFromBreakpoints(value, EPA_PM10_BREAKPOINTS, 501);
    case 'o3_8h': return subIndexFromBreakpoints(value, EPA_O3_8H_BREAKPOINTS, null);
    case 'o3_1h': return subIndexFromBreakpoints(value, EPA_O3_1H_BREAKPOINTS, 501);
    case 'no2_1h': return subIndexFromBreakpoints(value, EPA_NO2_BREAKPOINTS, 501);
    case 'so2_1h': return subIndexFromBreakpoints(value, EPA_SO2_1H_BREAKPOINTS, null);
    case 'co_8h': return subIndexFromBreakpoints(value, EPA_CO_BREAKPOINTS, 501);
    default: return null;
  }
}

/** US EPA AQI from averaged readings (the official method: the AQI is
 *  the highest sub-index across pollutants). `readings` may carry:
 *  pm25_24h (µg/m³), pm10_24h (µg/m³), o3_8h_ppm, o3_1h_ppm,
 *  co_8h_ppm, no2_1h_ppb, so2_1h_ppb, so2_24h_ppb.
 *  Ozone: the 8-hour value defines AQI up to 300; above 0.200 ppm the
 *  1-hour value is used instead. SO2: the 1-hour value defines AQI up
 *  to 200; above 304 ppb the 24-hour value is used instead.
 *  Returns { aqi, dominant, subIndices } or null when no sub-index
 *  could be computed. */
function epaAqiFromReadings(readings) {
  if (!readings || typeof readings !== 'object') return null;
  const sub = {};
  if (readings.pm25_24h !== undefined) sub.pm2_5 = aqiFromPm25(readings.pm25_24h);
  if (readings.pm10_24h !== undefined) sub.pm10 = epaSubIndex('pm10', readings.pm10_24h);
  if (readings.o3_8h_ppm !== undefined && readings.o3_8h_ppm !== null) {
    if (readings.o3_8h_ppm <= 0.200) {
      sub.ozone = epaSubIndex('o3_8h', readings.o3_8h_ppm);
    } else if (readings.o3_1h_ppm !== undefined) {
      sub.ozone = epaSubIndex('o3_1h', readings.o3_1h_ppm);
    }
  }
  if (readings.co_8h_ppm !== undefined) sub.carbon_monoxide = epaSubIndex('co_8h', readings.co_8h_ppm);
  if (readings.no2_1h_ppb !== undefined) sub.nitrogen_dioxide = epaSubIndex('no2_1h', readings.no2_1h_ppb);
  if (readings.so2_1h_ppb !== undefined && readings.so2_1h_ppb !== null) {
    if (readings.so2_1h_ppb <= 304) {
      sub.sulphur_dioxide = epaSubIndex('so2_1h', readings.so2_1h_ppb);
    } else if (readings.so2_24h_ppb !== undefined) {
      sub.sulphur_dioxide = subIndexFromBreakpoints(readings.so2_24h_ppb, EPA_SO2_24H_BREAKPOINTS, 501);
    }
  }
  let bestKey = null, bestVal = null;
  for (const key of Object.keys(sub)) {
    const v = sub[key];
    if (v !== null && v !== undefined && (bestVal === null || v > bestVal)) {
      bestVal = v; bestKey = key;
    }
  }
  if (bestVal === null) return null;
  return { aqi: bestVal, dominant: bestKey, subIndices: sub };
}

/** CPCB sub-index for one pollutant. `pollutant` is a key of
 *  CPCB_BREAKPOINTS except ozone, which needs the special handling in
 *  cpcbO3SubIndex below. `value` is in µg/m³, except CO in mg/m³.
 *  Returns an integer sub-index (capped at 500), or null. */
function cpcbSubIndex(pollutant, value) {
  const bands = CPCB_BREAKPOINTS[pollutant];
  if (!bands) return null;
  return subIndexFromBreakpoints(value, bands, 500);
}

/** CPCB ozone sub-index. The 8-hour mean defines AQI up to 300
 *  (208 µg/m³); above that the 1-hour value defines it. Pass the
 *  8-hour mean as o3_8h and the current hour's value as o3_1h. */
function cpcbO3SubIndex(o3_8h, o3_1h) {
  if (typeof o3_8h === 'number' && Number.isFinite(o3_8h) && o3_8h >= 0) {
    if (o3_8h <= 208) return subIndexFromBreakpoints(o3_8h, CPCB_BREAKPOINTS.ozone_8h, 500);
    if (typeof o3_1h === 'number' && Number.isFinite(o3_1h) && o3_1h >= 0) {
      return subIndexFromBreakpoints(o3_1h, CPCB_BREAKPOINTS.ozone_1h, 500);
    }
  }
  return null;
}

/** CPCB (India) AQI from averaged readings. `readings` may carry:
 *  pm25_24h, pm10_24h, no2_24h, so2_24h (µg/m³, 24-hour means),
 *  o3_8h, o3_1h (µg/m³), co_8h_mg (mg/m³, 8-hour mean).
 *  CPCB requires at least 3 pollutants with PM2.5 or PM10 among them;
 *  otherwise returns null. Overall AQI = maximum sub-index, capped
 *  at 500. Returns { aqi, dominant, subIndices } or null. */
function cpcbAqiFromReadings(readings) {
  if (!readings || typeof readings !== 'object') return null;
  const sub = {};
  const put = (key, v) => { if (v !== null && v !== undefined) sub[key] = v; };
  put('pm2_5', cpcbSubIndex('pm2_5', readings.pm25_24h));
  put('pm10', cpcbSubIndex('pm10', readings.pm10_24h));
  put('nitrogen_dioxide', cpcbSubIndex('nitrogen_dioxide', readings.no2_24h));
  put('sulphur_dioxide', cpcbSubIndex('sulphur_dioxide', readings.so2_24h));
  put('ozone', cpcbO3SubIndex(readings.o3_8h, readings.o3_1h));
  put('carbon_monoxide', cpcbSubIndex('carbon_monoxide', readings.co_8h_mg));
  const keys = Object.keys(sub);
  const hasPm = sub.pm2_5 !== undefined || sub.pm10 !== undefined;
  if (keys.length < 3 || !hasPm) return null;
  let bestKey = null, bestVal = null;
  for (const key of keys) {
    if (sub[key] > bestVal || bestVal === null) { bestVal = sub[key]; bestKey = key; }
  }
  return { aqi: bestVal, dominant: bestKey, subIndices: sub };
}

/** CPCB category { key, label } for a CPCB AQI value. */
function cpcbCategory(aqi) {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi) || aqi < 0) return null;
  for (const cat of CPCB_CATEGORIES) {
    if (aqi <= cat.max) return { key: cat.key, label: cat.label };
  }
  return { key: 'severe', label: 'Severe' };
}

/** AQI category object { key, label, advice } for a US AQI value. */
function aqiCategory(aqi) {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi) || aqi < 0) return null;
  for (const cat of AQI_CATEGORIES) {
    if (aqi <= cat.max) return { key: cat.key, label: cat.label, advice: cat.advice };
  }
  return { key: 'hazardous', label: 'Hazardous', advice: AQI_CATEGORIES[5].advice };
}

/** Mean of up to `hours` finite values ending at `endIndex` (inclusive)
 *  in a numeric array. Returns { mean, n } or null when there are no
 *  usable values, or when n < minCount (default 1). Used for the
 *  trailing 24-hour / 8-hour averages that EPA and CPCB require. */
function trailingMean(values, endIndex, hours, minCount) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const need = minCount === undefined ? 1 : minCount;
  const start = Math.max(0, endIndex - hours + 1);
  let sum = 0, n = 0;
  for (let i = start; i <= Math.min(endIndex, values.length - 1); i++) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) { sum += v; n++; }
  }
  if (n < need || n === 0) return null;
  return { mean: sum / n, n };
}

/** Convert an Open-Meteo time string ("YYYY-MM-DDTHH:MM", wall time in
 *  the data's timezone) to milliseconds since the epoch, using the
 *  utc_offset_seconds the API returns (0 for the default UTC/GMT data).
 *  Returns null for malformed input. */
function apiTimeToMs(iso, utcOffsetSeconds) {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(iso);
  if (!m) return null;
  const offset = (typeof utcOffsetSeconds === 'number' && Number.isFinite(utcOffsetSeconds))
    ? utcOffsetSeconds : 0;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  return asUtc - offset * 1000;
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
 * The AQI used here is the HOURLY AQI for the planned hour (from that
 * hour's PM2.5 on the current EPA table), not the daily AQI.
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
  if (cat) reasons.push(`Air quality is ${cat.label} (hourly US AQI ${aqi}).`);
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
  EPA_PM10_BREAKPOINTS,
  EPA_O3_8H_BREAKPOINTS,
  EPA_O3_1H_BREAKPOINTS,
  EPA_NO2_BREAKPOINTS,
  EPA_SO2_1H_BREAKPOINTS,
  EPA_SO2_24H_BREAKPOINTS,
  EPA_CO_BREAKPOINTS,
  CPCB_BREAKPOINTS,
  CPCB_CATEGORIES,
  AQI_CATEGORIES,
  WHO_GUIDELINES_24H,
  BREATHING_RATES,
  VULNERABILITY,
  clamp,
  subIndexFromBreakpoints,
  aqiFromPm25,
  epaSubIndex,
  epaAqiFromReadings,
  cpcbSubIndex,
  cpcbO3SubIndex,
  cpcbAqiFromReadings,
  cpcbCategory,
  aqiCategory,
  trailingMean,
  apiTimeToMs,
  ugm3ToPpmO3,
  ugm3ToPpbNo2,
  ugm3ToPpbSo2,
  ugm3ToPpmCo,
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
