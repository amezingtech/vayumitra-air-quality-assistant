/* VayuMitra — tests for core.js. Run: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');
const {
  aqiFromPm25, aqiCategory, doseEstimate, vulnerabilityMultiplier,
  riskScore, riskVerdict, riskReasons, bestWindow, shiftComparison, windowAverage,
} = core;

/* ---------- EPA AQI from PM2.5 (incl. all band boundaries) ---------- */

test('EPA AQI: clean air values', () => {
  assert.equal(aqiFromPm25(0), 0);
  assert.equal(aqiFromPm25(6.0), 25);
  assert.equal(aqiFromPm25(12.0), 50); // top of Good
});

test('EPA AQI: boundary 12.0 -> 50 and 12.1 -> 51', () => {
  assert.equal(aqiFromPm25(12.0), 50);
  assert.equal(aqiFromPm25(12.1), 51);
});

test('EPA AQI: boundary 35.4 -> 100 (top of Moderate)', () => {
  assert.equal(aqiFromPm25(35.4), 100);
  assert.equal(aqiFromPm25(35.5), 101);
});

test('EPA AQI: boundary 55.4 -> 150 (top of USG)', () => {
  assert.equal(aqiFromPm25(55.4), 150);
  assert.equal(aqiFromPm25(55.5), 151);
});

test('EPA AQI: boundary 150.4 -> 200 (top of Unhealthy)', () => {
  assert.equal(aqiFromPm25(150.4), 200);
  assert.equal(aqiFromPm25(150.5), 201);
});

test('EPA AQI: boundary 250.4 -> 300 (top of Very Unhealthy)', () => {
  assert.equal(aqiFromPm25(250.4), 300);
  assert.equal(aqiFromPm25(250.5), 301);
});

test('EPA AQI: boundary 350.4 -> 400 and 500.4 -> 500', () => {
  assert.equal(aqiFromPm25(350.4), 400);
  assert.equal(aqiFromPm25(350.5), 401);
  assert.equal(aqiFromPm25(500.4), 500);
});

test('EPA AQI: above the table caps at 501; invalid input returns null', () => {
  assert.equal(aqiFromPm25(600), 501);
  assert.equal(aqiFromPm25(-1), null);
  assert.equal(aqiFromPm25(NaN), null);
  assert.equal(aqiFromPm25('42'), null);
  assert.equal(aqiFromPm25(undefined), null);
});

test('EPA AQI: mid-band interpolation is correct', () => {
  // 23.75 µg/m³ is halfway through 12.1–35.4, so AQI is halfway 51–100 ≈ 76 (75.5 rounds to 76)
  assert.equal(aqiFromPm25(23.75), 76);
  // Delhi-style winter smog: 121.5 µg/m³ -> band 55.5–150.4, AQI = 151 + 49×(66/94.9) ≈ 185
  assert.equal(aqiFromPm25(121.5), 185);
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
  const explicit = riskScore({ pm25: 12.0, aqi: 50, activity: 'walk', durationMinutes: 30, profiles: ['healthy'] });
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
