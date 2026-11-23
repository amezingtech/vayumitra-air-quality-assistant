/* VayuMitra — tests for core.js. Run: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');
const {
  aqiFromPm25, aqiCategory, doseEstimate, vulnerabilityMultiplier,
  riskScore, riskVerdict, riskReasons, bestWindow, shiftComparison, windowAverage,
  epaSubIndex, epaAqiFromReadings, cpcbSubIndex, cpcbO3SubIndex,
  cpcbAqiFromReadings, cpcbCategory, trailingMean, apiTimeToMs,
  ugm3ToPpmO3, ugm3ToPpbNo2, ugm3ToPpbSo2, ugm3ToPpmCo,
} = core;

/* ---------- EPA AQI from PM2.5 — CURRENT 2024 table ----------
 * EPA-454/B-24-002 Table 6 (May 2024): Good ends at 9.0 µg/m³ (was 12.0
 * before the 2024 revision); bands 55.5–125.4 -> 151–200, 125.5–225.4
 * -> 201–300, 225.5–325.4 -> 301–500 (AQI 500 at 325.4). */

test('EPA AQI: clean air values (2024 table)', () => {
  assert.equal(aqiFromPm25(0), 0);
  assert.equal(aqiFromPm25(4.5), 25); // halfway through 0–9.0
  assert.equal(aqiFromPm25(9.0), 50); // top of Good (was 12.0 pre-2024)
});

test('EPA AQI: boundary 9.0 -> 50 and 9.1 -> 51', () => {
  assert.equal(aqiFromPm25(9.0), 50);
  assert.equal(aqiFromPm25(9.1), 51);
});

test('EPA AQI: boundary 35.4 -> 100 (top of Moderate)', () => {
  assert.equal(aqiFromPm25(35.4), 100);
  assert.equal(aqiFromPm25(35.5), 101);
});

test('EPA AQI: boundary 55.4 -> 150 (top of USG)', () => {
  assert.equal(aqiFromPm25(55.4), 150);
  assert.equal(aqiFromPm25(55.5), 151);
});

test('EPA AQI: boundary 125.4 -> 200 (top of Unhealthy, 2024 table)', () => {
  assert.equal(aqiFromPm25(125.4), 200);
  assert.equal(aqiFromPm25(125.5), 201);
});

test('EPA AQI: boundary 225.4 -> 300 (top of Very Unhealthy, 2024 table)', () => {
  assert.equal(aqiFromPm25(225.4), 300);
  assert.equal(aqiFromPm25(225.5), 301);
});

test('EPA AQI: 325.4 -> 500 and above the table caps at 501', () => {
  assert.equal(aqiFromPm25(325.4), 500);
  assert.equal(aqiFromPm25(400), 501);
  assert.equal(aqiFromPm25(600), 501);
  assert.equal(aqiFromPm25(-1), null);
  assert.equal(aqiFromPm25(NaN), null);
  assert.equal(aqiFromPm25('42'), null);
  assert.equal(aqiFromPm25(undefined), null);
});

test('EPA AQI: mid-band interpolation is correct (2024 table)', () => {
  // 22.25 µg/m³ is halfway through 9.1–35.4, so AQI is halfway 51–100 ≈ 76
  assert.equal(aqiFromPm25(22.25), 76);
  // Delhi-style winter smog: 121.5 µg/m³ -> band 55.5–125.4, AQI = 151 + 49×(66/69.9) ≈ 197
  assert.equal(aqiFromPm25(121.5), 197);
  // Live cross-check, Delhi 23 Nov 16:00 UTC: PM2.5 71.5 -> 151 + 49×(16/69.9) = 162
  assert.equal(aqiFromPm25(71.5), 162);
});

/* ---------- EPA sub-indices for the other pollutants ---------- */

test('EPA PM10 sub-index at every band boundary', () => {
  assert.equal(epaSubIndex('pm10', 0), 0);
  assert.equal(epaSubIndex('pm10', 54), 50);
  assert.equal(epaSubIndex('pm10', 55), 51);
  assert.equal(epaSubIndex('pm10', 154), 100);
  assert.equal(epaSubIndex('pm10', 155), 101);
  assert.equal(epaSubIndex('pm10', 254), 150);
  assert.equal(epaSubIndex('pm10', 354), 200);
  assert.equal(epaSubIndex('pm10', 424), 300);
  assert.equal(epaSubIndex('pm10', 504), 400);
  assert.equal(epaSubIndex('pm10', 604), 500);
  assert.equal(epaSubIndex('pm10', 700), 501);
});

test('EPA O3 / NO2 / SO2 / CO sub-indices at boundaries', () => {
  assert.equal(epaSubIndex('o3_8h', 0.054), 50);
  assert.equal(epaSubIndex('o3_8h', 0.055), 54); // 51 + 49×(0.001/0.016) = 54.1 -> 54
  assert.equal(epaSubIndex('o3_8h', 0.070), 100);
  assert.equal(epaSubIndex('o3_8h', 0.200), 300);
  assert.equal(epaSubIndex('o3_1h', 0.164), 150);
  assert.equal(epaSubIndex('o3_1h', 0.404), 300);
  assert.equal(epaSubIndex('o3_1h', 0.604), 500);
  assert.equal(epaSubIndex('no2_1h', 53), 50);
  assert.equal(epaSubIndex('no2_1h', 54), 52); // 51 + 49×(1/47) = 52.0
  assert.equal(epaSubIndex('no2_1h', 100), 100);
  assert.equal(epaSubIndex('no2_1h', 360), 150);
  assert.equal(epaSubIndex('no2_1h', 2049), 500);
  assert.equal(epaSubIndex('so2_1h', 35), 50);
  assert.equal(epaSubIndex('so2_1h', 36), 52); // 51 + 49×(1/40) = 52.2 -> 52
  assert.equal(epaSubIndex('so2_1h', 304), 200);
  assert.equal(epaSubIndex('co_8h', 4.4), 50);
  assert.equal(epaSubIndex('co_8h', 4.5), 52); // 51 + 49×(0.1/5) = 52.0
  assert.equal(epaSubIndex('co_8h', 9.4), 100);
  assert.equal(epaSubIndex('co_8h', 50.4), 500);
  assert.equal(epaSubIndex('bogus', 10), null);
});

test('EPA AQI from readings: highest sub-index wins (Delhi 24 Nov 16:00 UTC trailing means)', () => {
  // Trailing 24h mean PM2.5 60.1 -> 154 (2024 table); PM10 60.7 -> 54;
  // O3 8h 0.037 ppm -> 34; CO 8h 1.34 ppm -> 15; NO2 1h ~39 ppb -> 37; SO2 1h ~14 ppb -> 21.
  const r = epaAqiFromReadings({
    pm25_24h: 60.1, pm10_24h: 60.7,
    o3_8h_ppm: 72.5 / 1960, o3_1h_ppm: 25.0 / 1960,
    co_8h_ppm: 1532.6 / 1145,
    no2_1h_ppb: 73.4 / 1.88, so2_1h_ppb: 37.7 / 2.62, so2_24h_ppb: 26.6 / 2.62,
  });
  assert.equal(r.aqi, 154);
  assert.equal(r.dominant, 'pm2_5');
  assert.equal(epaAqiFromReadings({}), null);
  assert.equal(epaAqiFromReadings(null), null);
});

test('EPA O3 uses the 1-hour value when 8-hour exceeds 0.200 ppm; SO2 uses 24-hour above 304 ppb', () => {
  const o3 = epaAqiFromReadings({ o3_8h_ppm: 0.25, o3_1h_ppm: 0.30 });
  assert.equal(o3.aqi, 249); // 1-hour band 0.205–0.404 -> 201 + 99×(0.096/0.2) = 248.5 -> 249
  assert.equal(o3.dominant, 'ozone');
  const so2 = epaAqiFromReadings({ so2_1h_ppb: 400, so2_24h_ppb: 500 });
  assert.equal(so2.aqi, 266); // 24-hour band 304–604 -> 201 + 99×(196/300) = 265.7 -> 266
});

test('unit conversions µg/m³ -> EPA units (25 °C, 1 atm)', () => {
  assert.ok(Math.abs(ugm3ToPpmO3(1960) - 1) < 1e-9);
  assert.ok(Math.abs(ugm3ToPpbNo2(188) - 100) < 1e-9);
  assert.ok(Math.abs(ugm3ToPpbSo2(262) - 100) < 1e-9);
  assert.ok(Math.abs(ugm3ToPpmCo(1145) - 1) < 1e-9);
});

/* ---------- CPCB (India) AQI ---------- */

test('CPCB PM2.5 sub-index at every band boundary', () => {
  assert.equal(cpcbSubIndex('pm2_5', 0), 0);
  assert.equal(cpcbSubIndex('pm2_5', 30), 50);
  assert.equal(cpcbSubIndex('pm2_5', 31), 52); // 50 + 50×(1/30) = 51.7 -> 52
  assert.equal(cpcbSubIndex('pm2_5', 60), 100);
  assert.equal(cpcbSubIndex('pm2_5', 90), 200);
  assert.equal(cpcbSubIndex('pm2_5', 120), 300);
  assert.equal(cpcbSubIndex('pm2_5', 250), 400);
  assert.equal(cpcbSubIndex('pm2_5', 500), 500);
  assert.equal(cpcbSubIndex('pm2_5', 900), 500); // CPCB caps at 500
  assert.equal(cpcbSubIndex('pm2_5', -1), null);
});

test('CPCB sub-indices for the other pollutants at boundaries', () => {
  assert.equal(cpcbSubIndex('pm10', 50), 50);
  assert.equal(cpcbSubIndex('pm10', 100), 100);
  assert.equal(cpcbSubIndex('pm10', 250), 200);
  assert.equal(cpcbSubIndex('pm10', 430), 400);
  assert.equal(cpcbSubIndex('nitrogen_dioxide', 40), 50);
  assert.equal(cpcbSubIndex('nitrogen_dioxide', 80), 100);
  assert.equal(cpcbSubIndex('nitrogen_dioxide', 180), 200);
  assert.equal(cpcbSubIndex('sulphur_dioxide', 40), 50);
  assert.equal(cpcbSubIndex('sulphur_dioxide', 380), 200);
  assert.equal(cpcbSubIndex('sulphur_dioxide', 1600), 400);
  assert.equal(cpcbSubIndex('carbon_monoxide', 1.0), 50);
  assert.equal(cpcbSubIndex('carbon_monoxide', 2.0), 100);
  assert.equal(cpcbSubIndex('carbon_monoxide', 10), 200);
  assert.equal(cpcbSubIndex('carbon_monoxide', 34), 400);
  assert.equal(cpcbSubIndex('bogus', 10), null);
});

test('CPCB ozone: 8-hour value up to 208, 1-hour value above that', () => {
  assert.equal(cpcbO3SubIndex(50, 40), 50);
  assert.equal(cpcbO3SubIndex(100, 90), 100);
  assert.equal(cpcbO3SubIndex(208, 150), 300);
  assert.equal(cpcbO3SubIndex(250, 300), 317); // 1-hour band 208–748 -> 300–400
  assert.equal(cpcbO3SubIndex(250, 748), 400);
  assert.equal(cpcbO3SubIndex(300, null), null); // above 208 needs a 1-hour value
});

test('CPCB AQI from readings: max sub-index wins (Delhi 24 Nov 16:00 UTC trailing means)', () => {
  // PM2.5 24h 60.1 -> 100; PM10 60.7 -> 61; NO2 35.0 -> 44; SO2 26.6 -> 33;
  // O3 8h 72.5 -> 73; CO 8h 1.53 mg/m³ -> 77. Overall 100, Satisfactory, PM2.5.
  const r = cpcbAqiFromReadings({
    pm25_24h: 60.1, pm10_24h: 60.7, no2_24h: 35.0, so2_24h: 26.6,
    o3_8h: 72.5, o3_1h: 25.0, co_8h_mg: 1.53,
  });
  assert.equal(r.aqi, 100);
  assert.equal(r.dominant, 'pm2_5');
  assert.equal(cpcbCategory(r.aqi).label, 'Satisfactory');
});

test('CPCB AQI from readings: Delhi 23 Nov 16:00 UTC (17 trailing hours)', () => {
  // PM2.5 24h-mean-of-17h 83.6 -> 179; PM10 84.3 -> 84; NO2 30.5 -> 38;
  // SO2 29.8 -> 37; O3 8h 97.4 -> 97; CO 8h 1.17 mg/m³ -> 58. Overall 179.
  const r = cpcbAqiFromReadings({
    pm25_24h: 83.6, pm10_24h: 84.3, no2_24h: 30.5, so2_24h: 29.8,
    o3_8h: 97.4, o3_1h: 57.0, co_8h_mg: 1.17,
  });
  assert.equal(r.aqi, 179);
  assert.equal(r.dominant, 'pm2_5');
  assert.equal(cpcbCategory(r.aqi).label, 'Moderately Polluted');
});

test('CPCB AQI needs at least 3 pollutants incl. PM2.5 or PM10', () => {
  assert.equal(cpcbAqiFromReadings({ no2_24h: 35, so2_24h: 27, co_8h_mg: 1.5 }), null);
  assert.equal(cpcbAqiFromReadings({ pm25_24h: 60, no2_24h: 35 }), null);
  assert.equal(cpcbAqiFromReadings({}), null);
  assert.equal(cpcbAqiFromReadings(null), null);
});

test('CPCB categories map at every boundary', () => {
  assert.equal(cpcbCategory(0).label, 'Good');
  assert.equal(cpcbCategory(50).label, 'Good');
  assert.equal(cpcbCategory(51).label, 'Satisfactory');
  assert.equal(cpcbCategory(100).label, 'Satisfactory');
  assert.equal(cpcbCategory(101).label, 'Moderately Polluted');
  assert.equal(cpcbCategory(200).label, 'Moderately Polluted');
  assert.equal(cpcbCategory(201).label, 'Poor');
  assert.equal(cpcbCategory(300).label, 'Poor');
  assert.equal(cpcbCategory(301).label, 'Very Poor');
  assert.equal(cpcbCategory(400).label, 'Very Poor');
  assert.equal(cpcbCategory(401).label, 'Severe');
  assert.equal(cpcbCategory(500).label, 'Severe');
  assert.equal(cpcbCategory(-5), null);
});

/* ---------- Trailing means & API time parsing ---------- */

test('trailingMean averages the last N values ending at an index', () => {
  const vals = [10, 20, 30, 40, 50];
  assert.deepEqual(trailingMean(vals, 4, 24), { mean: 30, n: 5 });
  assert.deepEqual(trailingMean(vals, 4, 2), { mean: 45, n: 2 });
  assert.deepEqual(trailingMean(vals, 1, 24), { mean: 15, n: 2 });
  assert.equal(trailingMean(vals, 4, 24, 6), null); // needs 6, only 5 exist
  assert.equal(trailingMean([], 0, 24), null);
  assert.deepEqual(trailingMean([10, NaN, 30], 2, 24), { mean: 20, n: 2 });
});

test('apiTimeToMs parses API wall times with the returned UTC offset', () => {
  // UTC data (offset 0): 16:00 UTC is 16:00 UTC.
  assert.equal(apiTimeToMs('2026-11-23T16:00', 0), Date.UTC(2026, 10, 23, 16, 0));
  // Delhi local time (offset +19800s): 21:30 in Delhi is 16:00 UTC.
  assert.equal(apiTimeToMs('2026-11-23T21:30', 19800), Date.UTC(2026, 10, 23, 16, 0));
  assert.equal(apiTimeToMs('2026-11-23T16:00:30', 0), Date.UTC(2026, 10, 23, 16, 0, 30));
  assert.equal(apiTimeToMs('not-a-time', 0), null);
  assert.equal(apiTimeToMs(null, 0), null);
});

/* ---------- AQI category mapping ---------- */

test('AQI categories map at every boundary', () => {
  assert.equal(aqiCategory(0).key, 'good');
  assert.equal(aqiCategory(50).key, 'good');
  assert.equal(aqiCategory(51).key, 'moderate');
  assert.equal(aqiCategory(100).key, 'moderate');
  assert.equal(aqiCategory(101).key, 'usg');
  assert.equal(aqiCategory(150).key, 'usg');
  assert.equal(aqiCategory(151).key, 'unhealthy');
  assert.equal(aqiCategory(200).key, 'unhealthy');
  assert.equal(aqiCategory(201).key, 'very-unhealthy');
  assert.equal(aqiCategory(300).key, 'very-unhealthy');
  assert.equal(aqiCategory(301).key, 'hazardous');
  assert.equal(aqiCategory(500).key, 'hazardous');
  assert.equal(aqiCategory(501).key, 'hazardous');
});

test('AQI category labels are human-readable and carry advice', () => {
  const cat = aqiCategory(180);
  assert.equal(cat.label, 'Unhealthy');
  assert.ok(cat.advice.length > 10);
  assert.equal(aqiCategory(-5), null);
});

/* ---------- Inhaled-dose estimate ---------- */

test('dose estimate: PM2.5 x breathing rate x hours', () => {
  // 100 µg/m³, walking (1.1 m³/h), 60 min -> 110 µg
  assert.equal(doseEstimate(100, 'walk', 60), 110);
  // running (3.0 m³/h), 30 min -> 150 µg
  assert.equal(doseEstimate(100, 'run', 30), 150);
  // cycling (2.2 m³/h), 45 min -> 165 µg
  assert.equal(doseEstimate(100, 'cycling', 45), 165);
  // rest (0.5 m³/h), 120 min -> 100 µg
  assert.equal(doseEstimate(100, 'rest', 120), 100);
});

test('dose estimate: invalid inputs return null', () => {
  assert.equal(doseEstimate(100, 'swim', 60), null);
  assert.equal(doseEstimate(100, 'walk', 0), null);
  assert.equal(doseEstimate(-5, 'walk', 60), null);
});

/* ---------- Risk score ---------- */

const base = { pm25: 80, aqi: 120, activity: 'walk', durationMinutes: 30, profiles: ['healthy'] };

test('risk score: monotonic in AQI (higher AQI -> higher risk)', () => {
  const low = riskScore({ ...base, pm25: 20, aqi: 68 });
  const mid = riskScore({ ...base, pm25: 80, aqi: 120 });
  const high = riskScore({ ...base, pm25: 180, aqi: 230 });
  assert.ok(low < mid, `low ${low} should be < mid ${mid}`);
  assert.ok(mid < high, `mid ${mid} should be < high ${high}`);
});

test('risk score: asthma scores higher than a healthy adult, same conditions', () => {
  const healthy = riskScore(base);
  const asthma = riskScore({ ...base, profiles: ['asthma'] });
  const child = riskScore({ ...base, profiles: ['child'] });
  const senior = riskScore({ ...base, profiles: ['senior'] });
  assert.ok(asthma > healthy, `asthma ${asthma} should be > healthy ${healthy}`);
  assert.ok(child > healthy);
  assert.ok(senior > healthy);
  assert.ok(asthma > child, 'asthma multiplier (1.6) exceeds child (1.3)');
});

test('risk score: longer duration -> higher risk', () => {
  const short = riskScore({ ...base, durationMinutes: 15 });
  const medium = riskScore({ ...base, durationMinutes: 60 });
  const long = riskScore({ ...base, durationMinutes: 180 });
  assert.ok(short < medium && medium < long, `${short} < ${medium} < ${long}`);
});

test('risk score: harder activity -> higher risk', () => {
  const walk = riskScore({ ...base, activity: 'walk' });
  const run = riskScore({ ...base, activity: 'run' });
  assert.ok(run > walk, `run ${run} should be > walk ${walk}`);
});

test('risk score: stays within 0–100 and derives AQI from PM2.5 when omitted', () => {
  const severe = riskScore({ pm25: 400, activity: 'run', durationMinutes: 120, profiles: ['asthma'] });
  assert.equal(severe, 100);
  const clean = riskScore({ pm25: 5, activity: 'walk', durationMinutes: 15, profiles: ['healthy'] });
  assert.ok(clean >= 0 && clean <= 24, `clean-air walk should be "Go", got ${clean}`);
  const derived = riskScore({ pm25: 12.0, activity: 'walk', durationMinutes: 30, profiles: ['healthy'] });
  // PM2.5 12.0 µg/m³ -> hourly AQI 56 on the 2024 EPA table
  const explicit = riskScore({ pm25: 12.0, aqi: 56, activity: 'walk', durationMinutes: 30, profiles: ['healthy'] });
  assert.equal(derived, explicit);
});

test('risk verdicts cover the full 0–100 range', () => {
  assert.equal(riskVerdict(0).key, 'go');
  assert.equal(riskVerdict(24).key, 'go');
  assert.equal(riskVerdict(25).key, 'care');
  assert.equal(riskVerdict(49).key, 'care');
  assert.equal(riskVerdict(50).key, 'avoid');
  assert.equal(riskVerdict(74).key, 'avoid');
  assert.equal(riskVerdict(75).key, 'skip');
  assert.equal(riskVerdict(100).key, 'skip');
  assert.equal(riskVerdict(NaN), null);
});

test('risk reasons explain the result in plain language', () => {
  const reasons = riskReasons({ ...base, score: riskScore(base) });
  assert.ok(Array.isArray(reasons) && reasons.length >= 2);
  assert.ok(reasons.some((r) => r.includes('WHO')));
  assert.ok(reasons.some((r) => r.includes('dose')));
  const asthmaReasons = riskReasons({ ...base, profiles: ['asthma'], score: 80 });
  assert.ok(asthmaReasons.some((r) => r.includes('asthma')));
});

/* ---------- Best window & shift comparison ---------- */

const hourly = [
  { time: '2026-11-23T06:00', pm25: 120 }, { time: '2026-11-23T07:00', pm25: 110 },
  { time: '2026-11-23T08:00', pm25: 90 },  { time: '2026-11-23T09:00', pm25: 60 },
  { time: '2026-11-23T10:00', pm25: 45 },  { time: '2026-11-23T11:00', pm25: 40 },
  { time: '2026-11-23T12:00', pm25: 55 },  { time: '2026-11-23T13:00', pm25: 80 },
];

test('best window finds the cleanest hour', () => {
  const best = bestWindow(hourly, 60);
  assert.equal(best.startIndex, 5);
  assert.equal(best.startTime, '2026-11-23T11:00');
  assert.equal(best.avgPm25, 40);
});

test('best window respects a 2-hour duration', () => {
  const best = bestWindow(hourly, 120);
  assert.equal(best.startIndex, 4); // 45 + 40 = lowest 2-hour average (42.5)
  assert.equal(best.avgPm25, 42.5);
});

test('best window returns null for bad input', () => {
  assert.equal(bestWindow([], 60), null);
  assert.equal(bestWindow([{ time: 'x', pm25: 'bad' }], 60), null);
});

test('shift comparison reports % lower PM2.5 for the cleanest window', () => {
  const cmp = shiftComparison(hourly, 0, 60); // chosen 06:00 (120) vs best 11:00 (40)
  assert.equal(cmp.chosenAvg, 120);
  assert.equal(cmp.bestAvg, 40);
  assert.equal(cmp.pctLower, 67); // (120-40)/120 = 66.7% -> 67
  assert.equal(cmp.bestStartIndex, 5);
});

test('shift comparison is 0% when the chosen slot is already the cleanest', () => {
  const cmp = shiftComparison(hourly, 5, 60);
  assert.equal(cmp.pctLower, 0);
});

test('window average covers the chosen slot', () => {
  assert.equal(windowAverage(hourly, 0, 60), 120);
  assert.equal(windowAverage(hourly, 4, 120), 42.5);
  assert.equal(windowAverage(hourly, 0, 30), 120); // under 1 hour rounds to 1 hour
});
