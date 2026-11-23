/* VayuMitra — app.js
 * Browser logic only. All math lives in core.js (window.VayuMitraCore).
 * Security: no innerHTML with untrusted data — everything is built with
 * textContent / createElement. Inputs are length-limited and validated.
 * No key, token or secret is ever stored except the user's own Gemini key
 * in this browser's localStorage, sent only to generativelanguage.googleapis.com.
 */
(function () {
  'use strict';
  var Core = window.VayuMitraCore;

  /* ---------------- fixed data ---------------- */

  var CITIES = [
    { name: 'Delhi', lat: 28.61, lon: 77.20 },
    { name: 'Mumbai', lat: 19.08, lon: 72.88 },
    { name: 'Pune', lat: 18.52, lon: 73.86 },
    { name: 'Satara', lat: 17.68, lon: 74.02 },
    { name: 'Bengaluru', lat: 12.97, lon: 77.59 },
    { name: 'Lucknow', lat: 26.85, lon: 80.95 },
    { name: 'Kolkata', lat: 22.57, lon: 88.36 },
    { name: 'Chennai', lat: 13.08, lon: 80.27 },
  ];

  var POLLUTANTS = [
    { key: 'pm2_5', label: 'PM2.5', note: 'fine particles' },
    { key: 'pm10', label: 'PM10', note: 'coarse particles' },
    { key: 'ozone', label: 'Ozone (O₃)', note: '' },
    { key: 'nitrogen_dioxide', label: 'Nitrogen dioxide (NO₂)', note: '' },
    { key: 'sulphur_dioxide', label: 'Sulphur dioxide (SO₂)', note: '' },
    { key: 'carbon_monoxide', label: 'Carbon monoxide (CO)', note: '' },
  ];

  /* Demo dataset — used ONLY when the live API is unreachable, and always
   * labelled "Demo data — live API unavailable" in the UI. */
  var DEMO = (function () {
    var times = [], pm25 = [], pm10 = [], o3 = [], no2 = [], so2 = [], co = [], us = [], eu = [];
    var base = new Date();
    base.setUTCMinutes(0, 0, 0);
    var pattern = [120, 122, 126, 128, 120, 111, 90, 68, 55, 47, 44, 48, 61, 68, 69, 70, 72, 72, 70, 67, 64, 62, 60, 60,
                   60, 64, 69, 71, 67, 63, 55, 43, 36, 34, 32, 33, 38, 45, 52, 58, 62, 66, 70, 74, 78, 82, 88, 95];
    // 72 hours like the live request (24 past + 48 forecast), so the
    // trailing-average CPCB computation works in demo mode too.
    for (var i = 0; i < 72; i++) {
      var t = new Date(base.getTime() - 36 * 3600 * 1000 + i * 3600 * 1000);
      times.push(t.toISOString().slice(0, 16));
      var p = pattern[i % pattern.length];
      pm25.push(p); pm10.push(Math.round(p * 1.9));
      o3.push(28 + (i % 5) * 6); no2.push(30 + (i % 4) * 8);
      so2.push(8 + (i % 3) * 3); co.push(900 + (i % 6) * 120);
      us.push(Core.aqiFromPm25(p)); eu.push(Math.min(100, Math.round(p / 1.6)));
    }
    return { time: times, pm2_5: pm25, pm10: pm10, ozone: o3, nitrogen_dioxide: no2,
             sulphur_dioxide: so2, carbon_monoxide: co, us_aqi: us, european_aqi: eu };
  })();

  /* ---------------- i18n (verdicts, key advice, health notes) ----------------
   * Simple, correct translations. Where a Marathi phrase is uncertain we
   * keep plain, short Marathi we are confident about. */

  var I18N = {
    en: {
      tagline: 'Urban Air Quality Assistant — breathe smarter through winter smog.',
      lede: 'Live air quality from the Open-Meteo Air Quality API (free, no key needed). Pick a city, search any place, or use your location.',
      plannerLede: 'Plan one outdoor activity. The score is deterministic — the same inputs always give the same score — and every reason is shown.',
      verdicts: { go: 'Go', care: 'Go with care', avoid: 'Avoid', skip: 'Skip' },
      healthNote: {
        good: 'Air is clean — safe to play outside.',
        moderate: 'Air is acceptable — unusually sensitive people should watch for symptoms.',
        usg: 'Sensitive groups should cut back on long outdoor activity.',
        unhealthy: 'Everyone may feel effects — cut back on long or heavy outdoor exertion.',
        'very-unhealthy': 'Health alert — avoid outdoor exertion.',
        hazardous: 'Emergency conditions — stay indoors, keep windows closed.',
      },
      advice: [
        'Check today\u2019s AQI before heading out.',
        'Go out early morning or late evening, when the air is usually cleanest.',
        'Keep windows closed during peak smog and run the exhaust fan while cooking.',
        'Wear a well-fitted N95 mask outdoors on bad-air days.',
        'No indoor burning — no smoke, incense or mosquito coils inside.',
        'Keep children and seniors out of the worst afternoon air.',
      ],
    },
    hi: {
      tagline: 'शहरी वायु गुणवत्ता सहायक — सर्दियों के धुएँ में समझदारी से साँस लें।',
      lede: 'Open-Meteo Air Quality API से लाइव वायु गुणवत्ता (मुफ़्त, कोई कुंजी नहीं चाहिए)। शहर चुनें, कोई जगह खोजें, या अपना स्थान इस्तेमाल करें।',
      plannerLede: 'एक बाहरी गतिविधि की योजना बनाएँ। स्कोर नियतात्मक है — समान जानकारी पर हमेशा समान स्कोर — और हर कारण दिखाया जाता है।',
      verdicts: { go: 'जाएँ', care: 'सावधानी से जाएँ', avoid: 'टालें', skip: 'न जाएँ' },
      healthNote: {
        good: 'हवा साफ़ है — बाहर खेलना सुरक्षित है।',
        moderate: 'हवा ठीक है — संवेदनशील लोगों को लक्षणों पर ध्यान देना चाहिए।',
        usg: 'संवेदनशील लोगों को लंबी बाहरी गतिविधि कम करनी चाहिए।',
        unhealthy: 'सबको असर हो सकता है — लंबी बाहरी मेहनत कम करें।',
        'very-unhealthy': 'स्वास्थ्य चेतावनी — बाहरी मेहनत से बचें।',
        hazardous: 'आपात स्थिति — घर के अंदर रहें, खिड़कियाँ बंद रखें।',
      },
      advice: [
        'बाहर जाने से पहले आज का AQI देखें।',
        'सुबह जल्दी या देर शाम को बाहर जाएँ, जब हवा साफ़ होती है।',
        'धुएँ के समय खिड़कियाँ बंद रखें और खाना बनाते समय एग्ज़ॉस्ट फैन चलाएँ।',
        'बाहर निकलते समय N95 मास्क पहनें।',
        'घर के अंदर धुआँ, अगरबत्ती या मच्छर कॉइल न जलाएँ।',
        'बच्चों और बुज़ुर्गों को दोपहर की सबसे खराब हवा से बचाएँ।',
      ],
    },
    mr: {
      tagline: 'शहरी हवेची गुणवत्ता सहाय्यक — हिवाळ्यातील धुरात शहाणपणाने श्वास घ्या.',
      lede: 'Open-Meteo Air Quality API मधून थेट हवेची गुणवत्ता (मोफत, कोणतीही की लागत नाही). शहर निवडा, कोणतेही ठिकाण शोधा किंवा तुमचे स्थान वापरा.',
      plannerLede: 'एक बाह्य कृती ठरवा. गुण निश्चित असतात — तीच माहिती दिल्यास नेहमी तोच गुण मिळतो — आणि प्रत्येक कारण दाखवले जाते.',
      verdicts: { go: 'जा', care: 'काळजी घेऊन जा', avoid: 'टाळा', skip: 'जाऊ नका' },
      healthNote: {
        good: 'हवा स्वच्छ आहे — बाहेर खेळणे सुरक्षित आहे.',
        moderate: 'हवा ठीक आहे — संवेदनशील लोकांनी लक्षणांकडे लक्ष द्यावे.',
        usg: 'संवेदनशील लोकांनी दीर्घ बाह्य क्रियाकलाप कमी करावेत.',
        unhealthy: 'सगळ्यांना त्रास होऊ शकतो — दीर्घ बाह्य श्रम कमी करा.',
        'very-unhealthy': 'आरोग्य सूचना — बाह्य श्रम टाळा.',
        hazardous: 'आणीबाणीची परिस्थिती — घरात रहा, खिडक्या बंद ठेवा.',
      },
      advice: [
        'बाहेर जाण्यापूर्वी आजचा AQI तपासा.',
        'सकाळी लवकर किंवा संध्याकाळी उशिरा बाहेर जा, तेव्हा हवा स्वच्छ असते.',
        'धुराच्या वेळी खिडक्या बंद ठेवा आणि स्वयंपाक करताना एक्झॉस्ट फॅन लावा.',
        'बाहेर जाताना N95 मास्क घाला.',
        'घरात धूर किंवा अगरबत्ती करू नका.',
        'मुले आणि वृद्धांना दुपारच्या खराब हवेत बाहेर जाऊ देऊ नका.',
      ],
    },
  };

  /* ---------------- state & helpers ---------------- */

  var state = {
    placeName: 'Delhi',
    lat: 28.61, lon: 77.20,
    hourly: null,      // Open-Meteo hourly object
    currentIndex: 0,   // index of the latest hour
    isDemo: false,
    lang: 'en',
    tz: 'UTC',         // timezone the API data is in (default UTC/GMT)
    utcOffset: 0,      // utc_offset_seconds returned by the API
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, text) {
    var n = document.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function setStatus(msg) { $('status').textContent = msg; }
  function fmtNum(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (Math.round(v * 10) / 10).toString();
  }
  function toMs(t) {
    // Accepts an API time string ("YYYY-MM-DDTHH:MM", wall time in the
    // data's timezone) or an epoch-ms number; returns epoch ms.
    if (typeof t === 'number') return t;
    return Core.apiTimeToMs(t, state.utcOffset);
  }
  function fmtTimeLocal(t) {
    // API times are wall times in the data timezone (UTC by default);
    // convert to an absolute instant, then show in the viewer's local time.
    var ms = toMs(t);
    if (ms === null || ms === undefined) return '—';
    return new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function fmtHourLocal(t) {
    var ms = toMs(t);
    if (ms === null || ms === undefined) return '—';
    return new Date(ms).toLocaleString(undefined, { hour: 'numeric' });
  }
  function t(key) { return I18N[state.lang][key] || I18N.en[key]; }

  /* ---------------- data fetching ---------------- */

  function fetchWithTimeout(url, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms || 12000);
    return fetch(url, { signal: ctrl.signal }).finally(function () { clearTimeout(timer); });
  }

  function loadAir(lat, lon, placeName) {
    state.lat = lat; state.lon = lon; state.placeName = placeName;
    setStatus('Loading air quality for ' + placeName + '…');
    $('demo-note').hidden = true;
    var url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + encodeURIComponent(lat) +
      '&longitude=' + encodeURIComponent(lon) +
      '&timezone=UTC' +
      // past_days=1 so a full trailing 24 hours exists at ANY hour of the
      // day (without it, the response starts at 00:00 UTC today and the
      // CPCB/EPA trailing averages would be unavailable before ~16:00 UTC).
      '&past_days=1' +
      '&hourly=pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,us_aqi,european_aqi&forecast_days=2';
    return fetchWithTimeout(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || !data.hourly || !Array.isArray(data.hourly.time) || !data.hourly.time.length) {
        throw new Error('Empty response');
      }
      state.hourly = data.hourly;
      // The API answers with the timezone it used; default (and the
      // explicit timezone=UTC above) is GMT, offset 0. Times are wall
      // times in that zone — parsed with apiTimeToMs, never assumed.
      state.tz = data.timezone || 'UTC';
      state.utcOffset = (typeof data.utc_offset_seconds === 'number') ? data.utc_offset_seconds : 0;
      state.isDemo = false;
      renderAll();
      setStatus('Live data for ' + placeName + ' — updated just now.');
    }).catch(function (err) {
      state.hourly = DEMO;
      state.tz = 'UTC';
      state.utcOffset = 0;
      state.isDemo = true;
      renderAll();
      $('demo-note').hidden = false;
      setStatus('Live API unavailable (' + (err && err.message ? err.message : 'network error') + '). Showing labelled demo data for ' + placeName + '.');
    });
  }

  function searchCity(query) {
    var q = (query || '').trim().slice(0, 80);
    if (!q) { setStatus('Type a city name first.'); return; }
    setStatus('Searching for ' + q + '…');
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) +
      '&count=5&language=en&format=json';
    fetchWithTimeout(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data.results || !data.results.length) {
        setStatus('No place found for "' + q + '". Try another spelling.');
        return;
      }
      // Prefer a result in India when several share the name (e.g. Delhi).
      var best = data.results[0];
      for (var i = 0; i < data.results.length; i++) {
        if (data.results[i].country_code === 'IN') { best = data.results[i]; break; }
      }
      var label = best.name + (best.admin1 ? ', ' + best.admin1 : '') + (best.country ? ', ' + best.country : '');
      loadAir(best.latitude, best.longitude, label);
    }).catch(function () {
      setStatus('Place search failed — check your connection and try again.');
    });
  }

  /* ---------------- rendering ---------------- */

  function currentIndex() {
    var times = state.hourly.time;
    var now = Date.now();
    var idx = 0;
    for (var i = 0; i < times.length; i++) {
      var t = Core.apiTimeToMs(times[i], state.utcOffset);
      if (t !== null && t <= now) idx = i; else break;
    }
    return idx;
  }

  /* Trailing averages ending at hour `i`, in the averaging periods the
   * official indices require: 24-hour means for PM2.5/PM10/NO2/SO2,
   * 8-hour means for O3/CO. The 24-hour means need at least 16 hours
   * of data (CPCB's own minimum); otherwise they are null. */
  function trailingReadings(i) {
    var h = state.hourly;
    function tm(key, hours, min) {
      var r = Core.trailingMean(h[key], i, hours, min);
      return r ? r.mean : null;
    }
    return {
      pm25_24h: tm('pm2_5', 24, 16),
      pm10_24h: tm('pm10', 24, 16),
      no2_24h: tm('nitrogen_dioxide', 24, 16),
      so2_24h: tm('sulphur_dioxide', 24, 16),
      o3_8h: tm('ozone', 8, 1),
      o3_1h: h.ozone ? h.ozone[i] : null,
      co_8h_mg: (function () {
        var r = Core.trailingMean(h.carbon_monoxide, i, 8, 1);
        return r ? r.mean / 1000 : null;
      })(),
    };
  }

  /* CPCB (India) AQI at hour `i`, from trailing averages. Null when
   * there is not enough trailing data yet (needs 16 hours). */
  function cpcbAt(i) {
    return Core.cpcbAqiFromReadings(trailingReadings(i));
  }

  /* US EPA AQI at hour `i`, computed here from trailing averages —
   * used ONLY as a fallback when Open-Meteo's us_aqi is missing. */
  function epaFallbackAt(i) {
    var h = state.hourly, t = trailingReadings(i);
    if (t.pm25_24h === null && t.pm10_24h === null) return null;
    return Core.epaAqiFromReadings({
      pm25_24h: t.pm25_24h,
      pm10_24h: t.pm10_24h,
      o3_8h_ppm: t.o3_8h !== null ? Core.ugm3ToPpmO3(t.o3_8h) : undefined,
      o3_1h_ppm: h.ozone ? Core.ugm3ToPpmO3(h.ozone[i]) : undefined,
      co_8h_ppm: t.co_8h_mg !== null ? Core.ugm3ToPpmCo(t.co_8h_mg * 1000) : undefined,
      no2_1h_ppb: h.nitrogen_dioxide ? Core.ugm3ToPpbNo2(h.nitrogen_dioxide[i]) : undefined,
      so2_1h_ppb: h.sulphur_dioxide ? Core.ugm3ToPpbSo2(h.sulphur_dioxide[i]) : undefined,
      so2_24h_ppb: t.so2_24h !== null ? Core.ugm3ToPpbSo2(t.so2_24h) : undefined,
    });
  }

  /* This hour's AQI, from this hour's PM2.5 on the current EPA table. */
  function hourlyAqiAt(i) {
    return Core.aqiFromPm25(state.hourly.pm2_5[i]);
  }

  function renderAll() {
    state.currentIndex = currentIndex();
    renderCurrent();
    renderChart();
    renderStartTimes();
    renderAdvice();
    renderRoutines();
  }

  function renderCurrent() {
    var h = state.hourly, i = state.currentIndex;
    // Headline daily US AQI: Open-Meteo's us_aqi is built from trailing
    // 24-hour averages, so it moves slowly and is the right "today" number.
    // If it is ever missing, fall back to our own EPA computation.
    var daily = null;
    if (h.us_aqi && h.us_aqi[i] !== null && h.us_aqi[i] !== undefined) {
      daily = h.us_aqi[i];
    } else {
      var fb = epaFallbackAt(i);
      daily = fb ? fb.aqi : hourlyAqiAt(i);
    }
    var cat = Core.aqiCategory(daily);
    var pm25 = h.pm2_5[i];
    var hourlyAqi = hourlyAqiAt(i);
    var cpcb = cpcbAt(i);

    var hero = $('aqi-big');
    hero.className = 'aqi-big' + (cat ? ' aqi-cat-' + cat.key : '');
    $('aqi-value').textContent = (daily === null || daily === undefined) ? '—' : String(daily);
    var badge = $('aqi-category-badge');
    badge.textContent = cat ? cat.label : '—';
    badge.className = 'badge ' + (cat ? 'badge-' + cat.key : 'badge-unknown');
    $('aqi-gauge-marker').style.left = (daily === null ? 0 : Math.min(100, (daily / 500) * 100)).toFixed(1) + '%';
    $('aqi-advice').textContent = cat ? (t('healthNote')[cat.key] || cat.advice) : '—';
    $('aqi-place').textContent = state.placeName + (state.isDemo ? ' (demo)' : '');
    $('aqi-updated').textContent = 'Updated ' + fmtTimeLocal(h.time[i]);
    $('aqi-hourly').textContent = (hourlyAqi === null || hourlyAqi === undefined)
      ? '—' : hourlyAqi + ' (' + (Core.aqiCategory(hourlyAqi) || {}).label + ')';
    $('aqi-eu').textContent = (h.european_aqi && h.european_aqi[i] !== null && h.european_aqi[i] !== undefined)
      ? String(h.european_aqi[i]) : '—';

    var cpcbEl = $('aqi-cpcb');
    var cpcbBadge = $('aqi-cpcb-badge');
    if (cpcb) {
      var cpcbCat = Core.cpcbCategory(cpcb.aqi);
      var domLabels = { pm2_5: 'PM2.5', pm10: 'PM10', nitrogen_dioxide: 'NO₂', sulphur_dioxide: 'SO₂', ozone: 'O₃', carbon_monoxide: 'CO' };
      cpcbEl.textContent = String(cpcb.aqi) + ' — driven by ' + (domLabels[cpcb.dominant] || cpcb.dominant);
      cpcbBadge.textContent = cpcbCat ? cpcbCat.label : '—';
      cpcbBadge.className = 'badge ' + (cpcbCat ? 'badge-cpcb-' + cpcbCat.key : 'badge-unknown');
    } else {
      cpcbEl.textContent = '— (needs 16 hours of trailing data)';
      cpcbBadge.textContent = '—';
      cpcbBadge.className = 'badge badge-unknown';
    }

    // Dominant pollutant = highest ratio vs its WHO guideline.
    var domKey = null, domRatio = 0;
    POLLUTANTS.forEach(function (p) {
      var v = h[p.key] ? h[p.key][i] : null;
      var g = Core.WHO_GUIDELINES_24H[p.key];
      if (typeof v === 'number' && g) {
        var r = v / g;
        if (r > domRatio) { domRatio = r; domKey = p.label; }
      }
    });
    $('aqi-dominant').textContent = domKey ? domKey + ' (' + domRatio.toFixed(1) + '× WHO guideline)' : '—';
    $('aqi-source').textContent = 'Source: Open-Meteo Air Quality API · Data timezone: ' +
      state.tz + ' · Times shown in your local time · CPCB AQI from trailing 24-hour / 8-hour means.';

    // Pollutant bars: each row shows the value, the WHO guideline, the
    // ratio, and a bar (track = 0 to 2× the guideline; the tick at the
    // middle marks the guideline itself).
    var list = $('pollutant-bars');
    while (list.firstChild) list.removeChild(list.firstChild);
    POLLUTANTS.forEach(function (p) {
      var v = h[p.key] ? h[p.key][i] : null;
      var g = Core.WHO_GUIDELINES_24H[p.key];
      var li = document.createElement('li');
      li.className = 'pollutant-row';
      var head = document.createElement('div');
      head.className = 'pollutant-head';
      head.appendChild(el('span', p.label + (p.note ? ' — ' + p.note : '')));
      head.appendChild(el('strong', (v === null || v === undefined) ? '—' : fmtNum(v) + ' µg/m³'));
      li.appendChild(head);
      var track = document.createElement('div');
      track.className = 'pollutant-track';
      var fill = document.createElement('span');
      fill.className = 'pollutant-fill';
      if (typeof v === 'number' && g) {
        var ratio = v / g;
        fill.style.width = Math.min(100, (ratio / 2) * 100).toFixed(1) + '%';
        fill.classList.add(ratio <= 1 ? 'fill-ok' : ratio <= 2 ? 'fill-warn' : 'fill-bad');
      }
      track.appendChild(fill);
      var tick = document.createElement('span');
      tick.className = 'pollutant-tick';
      tick.title = 'WHO guideline';
      track.appendChild(tick);
      li.appendChild(track);
      var meta = el('p', 'WHO guideline: ' + g + ' µg/m³ · ' +
        ((typeof v === 'number' && g) ? (v / g).toFixed(1) + '× the guideline' : '—'));
      meta.className = 'pollutant-meta';
      li.appendChild(meta);
      list.appendChild(li);
    });
    void pm25;
  }

  function renderChart() {
    var h = state.hourly;
    var start = state.currentIndex;
    var end = Math.min(h.time.length, start + 24);
    var container = $('chart');
    while (container.firstChild) container.removeChild(container.firstChild);
    if (end - start < 2) { container.textContent = 'Not enough forecast data.'; return; }

    var W = 900, H = 230, padL = 34, padB = 26, padT = 14;
    var maxAqi = 300;
    var n = end - start;
    var bw = (W - padL - 8) / n;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Hourly US AQI for the next 24 hours, computed from each hour\u2019s PM2.5');

    // Category colour per AQI value.
    function catClass(aqi) {
      var c = Core.aqiCategory(aqi);
      return c ? c.key : 'unknown';
    }
    var colors = { good: '#1a7f37', moderate: '#9a6700', usg: '#c2410c', unhealthy: '#b91c1c', 'very-unhealthy': '#7e22ce', hazardous: '#7f1d1d', unknown: '#666' };

    // Gridlines at 50/100/150/200/300.
    [50, 100, 150, 200, 300].forEach(function (v) {
      var y = padT + (H - padT - padB) * (1 - v / maxAqi);
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', padL); line.setAttribute('x2', W - 8);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      line.setAttribute('stroke', '#e3e9e5'); line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      var lab = document.createElementNS(svgNS, 'text');
      lab.setAttribute('x', 4); lab.setAttribute('y', y + 4);
      lab.setAttribute('font-size', '11'); lab.setAttribute('fill', '#4c5a52');
      lab.textContent = String(v);
      svg.appendChild(lab);
    });

    var bestIdx = -1, bestVal = Infinity, worstIdx = -1, worstVal = -Infinity;
    var hourlyAqis = [];
    for (var k = 0; k < n; k++) {
      // Hourly AQI from that hour's PM2.5 (current EPA table) — the
      // daily us_aqi from Open-Meteo moves too slowly to chart per hour.
      var aqi = hourlyAqiAt(start + k);
      hourlyAqis.push(aqi);
      if (aqi === null || aqi === undefined) aqi = 0;
      var barH = Math.min(aqi, maxAqi) / maxAqi * (H - padT - padB);
      var x = padL + k * bw + 1;
      var y = H - padB - barH;
      var rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', x.toFixed(1)); rect.setAttribute('y', y.toFixed(1));
      rect.setAttribute('width', Math.max(1, bw - 2).toFixed(1)); rect.setAttribute('height', Math.max(1, barH).toFixed(1));
      rect.setAttribute('fill', colors[catClass(aqi)] || '#666');
      var title = document.createElementNS(svgNS, 'title');
      title.textContent = fmtHourLocal(h.time[start + k]) + ' — hourly US AQI ' + aqi + ' (' + (Core.aqiCategory(aqi) || {}).label + ')';
      rect.appendChild(title);
      svg.appendChild(rect);
      if (k % 3 === 0) {
        var xl = document.createElementNS(svgNS, 'text');
        xl.setAttribute('x', (x + bw / 2).toFixed(1)); xl.setAttribute('y', H - 8);
        xl.setAttribute('font-size', '11'); xl.setAttribute('fill', '#4c5a52');
        xl.setAttribute('text-anchor', 'middle');
        xl.textContent = fmtHourLocal(h.time[start + k]);
        svg.appendChild(xl);
      }
      if (aqi < bestVal) { bestVal = aqi; bestIdx = k; }
      if (aqi > worstVal) { worstVal = aqi; worstIdx = k; }
    }
    // Mark the cleanest and worst hours with an outline + a label.
    [[bestIdx, 'Best', '#1a7f37'], [worstIdx, 'Worst', '#b91c1c']].forEach(function (mark) {
      var mk = mark[0];
      if (mk < 0) return;
      var aqi = hourlyAqis[mk];
      var barH = Math.min(aqi, maxAqi) / maxAqi * (H - padT - padB);
      var x = padL + mk * bw + 1;
      var y = H - padB - barH;
      var outline = document.createElementNS(svgNS, 'rect');
      outline.setAttribute('x', (x - 2).toFixed(1)); outline.setAttribute('y', (y - 2).toFixed(1));
      outline.setAttribute('width', (Math.max(1, bw - 2) + 4).toFixed(1));
      outline.setAttribute('height', (Math.max(1, barH) + 4).toFixed(1));
      outline.setAttribute('fill', 'none'); outline.setAttribute('stroke', mark[2]);
      outline.setAttribute('stroke-width', '2.5');
      svg.appendChild(outline);
      var tag = document.createElementNS(svgNS, 'text');
      tag.setAttribute('x', (x + bw / 2).toFixed(1));
      tag.setAttribute('y', Math.max(12, y - 6).toFixed(1));
      tag.setAttribute('font-size', '11'); tag.setAttribute('font-weight', '700');
      tag.setAttribute('fill', mark[2]); tag.setAttribute('text-anchor', 'middle');
      tag.textContent = mark[1];
      svg.appendChild(tag);
    });
    container.appendChild(svg);

    var best = $('best-worst');
    best.textContent = 'Cleanest hour: ' + fmtTimeLocal(h.time[start + bestIdx]) + ' (hourly US AQI ' + bestVal + '). ' +
      'Worst hour: ' + fmtTimeLocal(h.time[start + worstIdx]) + ' (hourly US AQI ' + worstVal + ').';
  }

  function renderStartTimes() {
    var sel = $('start-time');
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    var h = state.hourly;
    var start = state.currentIndex;
    var end = Math.min(h.time.length, start + 24);
    for (var k = 0; k < end - start; k++) {
      var opt = document.createElement('option');
      opt.value = String(k);
      opt.textContent = fmtTimeLocal(h.time[start + k]) +
        ' — hourly AQI ' + hourlyAqiAt(start + k);
      sel.appendChild(opt);
    }
  }

  function renderAdvice() {
    var list = $('advice-list');
    while (list.firstChild) list.removeChild(list.firstChild);
    t('advice').forEach(function (line) {
      list.appendChild(el('li', line));
    });
  }

  function renderRoutines() {
    var h = state.hourly;
    if (!h) return;
    var i = state.currentIndex;
    var pm25 = h.pm2_5[i];
    var hourlyPm25 = h.pm2_5.map(function (v, idx) { return { time: h.time[idx], pm25: v }; });

    // Modelled numbers from the live data (all labelled as estimates).
    var shift60 = Core.shiftComparison(hourlyPm25.slice(i, i + 24), 0, 60);
    var worst = Math.max.apply(null, hourlyPm25.slice(i, i + 24).map(function (d) { return d.pm25; }));
    var best = Core.bestWindow(hourlyPm25.slice(i, i + 24), 60);
    var doseWalkWorst = Core.doseEstimate(worst, 'walk', 30);
    var doseWalkBest = best ? Core.doseEstimate(best.avgPm25, 'walk', 30) : null;
    var doseSaved = (doseWalkWorst !== null && doseWalkBest !== null)
      ? Math.round(doseWalkWorst - doseWalkBest) : null;
    var doseIndoorPeak = Core.doseEstimate(worst, 'rest', 60);
    var doseWalkPeak = Core.doseEstimate(worst, 'walk', 60);
    var doseAvoided = (doseIndoorPeak !== null && doseWalkPeak !== null)
      ? Math.round(doseWalkPeak - doseIndoorPeak) : null;

    function tip(title, impact) {
      var li = document.createElement('li');
      li.appendChild(el('strong', title + ' '));
      li.appendChild(document.createTextNode(''));
      var span = el('span', impact);
      span.className = 'impact';
      li.appendChild(span);
      return li;
    }

    var routine = $('routine-list');
    while (routine.firstChild) routine.removeChild(routine.firstChild);
    routine.appendChild(tip('Walk or exercise in the cleanest hour, not the worst one.',
      shift60 && shift60.pctLower > 0
        ? 'Modelled estimate: shifting a 1-hour outing to the cleanest hour cuts average PM2.5 by about ' + shift60.pctLower + '% today.'
        : 'Modelled estimate: today\u2019s hours are similar — shifting changes little.'));
    routine.appendChild(tip('Move the school run or errands off the afternoon peak.',
      doseSaved !== null
        ? 'Modelled estimate: a 30-minute walk at the worst hour today breathes in about ' + doseSaved + ' µg more PM2.5 than at the best hour.'
        : 'Modelled estimate: no clear best hour today.'));
    routine.appendChild(tip('Carpool or take the bus twice a week instead of driving alone.',
      'Modelled estimate: sharing a car halves your personal exhaust exposure on those trips; two shared trips a week is roughly a 25–30% cut in weekly commute exposure.'));
    routine.appendChild(tip('Work from home on the worst smog day of the week if you can.',
      doseAvoided !== null
        ? 'Modelled estimate: staying in at rest instead of a 1-hour walk at today\u2019s peak avoids about ' + doseAvoided + ' µg of inhaled PM2.5.'
        : 'Modelled estimate: staying in avoids the whole outdoor dose for that hour.'));

    var hacks = $('hack-list');
    while (hacks.firstChild) hacks.removeChild(hacks.firstChild);
    hacks.appendChild(tip('Keep windows closed during peak smog; ventilate briefly in the cleanest hour.',
      'Modelled estimate: ventilating at the cleanest hour instead of the worst hour lets in air with about ' + (shift60 ? shift60.pctLower : 0) + '% lower PM2.5 today.'));
    hacks.appendChild(tip('Run the kitchen exhaust fan every time you cook — and for 10 minutes after.',
      'No modelled number claimed: the fan removes cooking smoke at the source, before it spreads through the home.'));
    hacks.appendChild(tip('DIY Corsi–Rosenthal box: a box fan + four MERV-13 furnace filters, taped into a cube.',
      'No modelled number claimed: independent tests report large indoor PM2.5 drops; treat any figure as an estimate and check with a low-cost sensor if you can.'));
    hacks.appendChild(tip('No indoor burning: no incense, candles, mosquito coils or wood smoke inside.',
      'Modelled estimate: one incense stick can push indoor PM2.5 well above today\u2019s outdoor level (' + Math.round(pm25) + ' µg/m³) for an hour — skipping it avoids that whole spike.'));
    hacks.appendChild(tip('Damp-dust and mop instead of dry sweeping.',
      'No modelled number claimed: wet cleaning keeps settled dust out of the air instead of throwing it back up.'));

    var swaps = $('swap-list');
    while (swaps.firstChild) swaps.removeChild(swaps.firstChild);
    swaps.appendChild(tip('Swap short car trips (under 3 km) for walking or cycling — in the cleanest hour.',
      'Modelled estimate: each swapped trip removes one cold-start car exhaust plume from your street; the walk itself is scored in the planner above.'));
    swaps.appendChild(tip('Swap an LPG/wood stove hour for an electric cooker or induction plate.',
      'No modelled number claimed: electric cooking adds no combustion smoke to your kitchen.'));
    swaps.appendChild(tip('Swap one weekly market drive for a delivery slot shared with neighbours.',
      'Modelled estimate: one shared delivery replaces several separate car trips on your street.'));
    swaps.appendChild(tip('Swap disposable masks for a reusable, well-fitted N95 on bad-air days.',
      'Modelled estimate: a fitted N95 filters far more fine particles than a cloth mask; fit matters more than brand.'));
  }

  /* ---------------- planner ---------------- */

  function selectedProfiles() {
    var boxes = document.querySelectorAll('input[name="profile"]:checked');
    var out = [];
    boxes.forEach(function (b) { out.push(b.value); });
    return out.length ? out : ['healthy'];
  }

  function planActivity() {
    var h = state.hourly;
    if (!h) { setStatus('Wait for the air data to load, then plan.'); return; }
    var profiles = selectedProfiles();
    var activity = $('activity').value;
    var duration = parseInt($('duration').value, 10);
    if (!isFinite(duration)) duration = 30;
    duration = Math.min(240, Math.max(5, duration));
    $('duration').value = String(duration);
    var startOffset = parseInt($('start-time').value, 10) || 0;
    var idx = Math.min(state.currentIndex + startOffset, h.time.length - 1);
    var pm25 = h.pm2_5[idx];
    // Hourly AQI for the planned hour (from that hour's PM2.5), so the
    // score matches the air you will actually breathe — not the daily AQI.
    var aqi = hourlyAqiAt(idx);

    var score = Core.riskScore({ pm25: pm25, aqi: aqi, activity: activity, durationMinutes: duration, profiles: profiles });
    var verdict = Core.riskVerdict(score);
    var dose = Core.doseEstimate(pm25, activity, duration);

    var result = $('planner-result');
    result.hidden = false;
    $('risk-score').textContent = String(score);
    var vBadge = $('risk-verdict');
    vBadge.textContent = t('verdicts')[verdict.key] + ' — ' + verdict.label;
    vBadge.className = 'badge badge-' + verdict.key;
    $('risk-dose').textContent = 'At ' + fmtTimeLocal(h.time[idx]) + ': PM2.5 ' + Math.round(pm25) +
      ' µg/m³, hourly US AQI ' + aqi + '. Modelled inhaled dose: about ' + Math.round(dose) +
      ' µg of PM2.5 (estimate, not a measurement).';
    var ul = $('risk-reasons');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    Core.riskReasons({ pm25: pm25, aqi: aqi, activity: activity, durationMinutes: duration, profiles: profiles, score: score })
      .forEach(function (r) { ul.appendChild(el('li', r)); });

    // "What if I shift it?"
    var hourlyPm25 = h.pm2_5.map(function (v, j) { return { time: h.time[j], pm25: v }; });
    var slice = hourlyPm25.slice(state.currentIndex, state.currentIndex + 24);
    var cmp = Core.shiftComparison(slice, startOffset, duration);
    var shiftBox = $('shift-result');
    shiftBox.hidden = false;
    if (cmp && cmp.pctLower > 0) {
      $('shift-text').textContent = 'The cleanest ' + Math.max(1, Math.round(duration / 60)) +
        '-hour window starts ' + fmtTimeLocal(cmp.bestStartTime) + ' (average PM2.5 ' +
        Math.round(cmp.bestAvg) + ' µg/m³ vs ' + Math.round(cmp.chosenAvg) + ' µg/m³ at your chosen time) — about ' +
        cmp.pctLower + '% lower. Shifting there cuts your modelled dose by roughly the same share.';
    } else {
      $('shift-text').textContent = 'Your chosen time is already one of the cleanest windows in the next 24 hours — shifting would not help today.';
    }
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------------- assistant ---------------- */

  var KEY_NAME = 'vayumitra_gemini_key';
  function getKey() {
    try { return localStorage.getItem(KEY_NAME) || ''; } catch (e) { return ''; }
  }
  function updateKeyStatus() {
    $('key-status').textContent = getKey()
      ? 'Key saved in this browser only. It is sent only to Google\u2019s Generative Language API.'
      : 'No key saved — the assistant will use the offline briefing.';
  }

  function contextSummary() {
    var h = state.hourly;
    if (!h) return 'Air data not loaded yet.';
    var i = state.currentIndex;
    var aqi = h.us_aqi ? h.us_aqi[i] : hourlyAqiAt(i);
    var cat = Core.aqiCategory(aqi);
    var cpcb = cpcbAt(i);
    return state.placeName + ': daily US AQI ' + aqi + ' (' + (cat ? cat.label : 'unknown') + '), ' +
      'this hour ' + hourlyAqiAt(i) + ', CPCB AQI ' +
      (cpcb ? cpcb.aqi + ' (' + Core.cpcbCategory(cpcb.aqi).label + ')' : 'not available yet') + ', ' +
      'PM2.5 ' + Math.round(h.pm2_5[i]) + ' µg/m³ (WHO 24-hour guideline 15), ' +
      'PM10 ' + Math.round(h.pm10[i]) + ', NO₂ ' + Math.round(h.nitrogen_dioxide[i]) +
      ', O₃ ' + Math.round(h.ozone[i]) + ' µg/m³. Household: ' +
      selectedProfiles().join(', ') + '. Planned activity: ' + $('activity').value +
      ' for ' + $('duration').value + ' minutes.';
  }

  function offlineBriefing(question) {
    var h = state.hourly;
    var i = state.currentIndex;
    var aqi = h.us_aqi ? h.us_aqi[i] : hourlyAqiAt(i);
    var cat = Core.aqiCategory(aqi);
    var cpcb = cpcbAt(i);
    var profiles = selectedProfiles();
    var score = Core.riskScore({
      pm25: h.pm2_5[i], aqi: hourlyAqiAt(i), activity: $('activity').value,
      durationMinutes: parseInt($('duration').value, 10) || 30, profiles: profiles,
    });
    var verdict = Core.riskVerdict(score);
    var best = Core.bestWindow(h.pm2_5.map(function (v, j) { return { time: h.time[j], pm25: v }; }).slice(i, i + 24), 60);
    var lines = [];
    lines.push('Offline briefing — add a Gemini key for a personalised AI answer.');
    lines.push('Right now in ' + state.placeName + ': daily US AQI ' + aqi + ' (' + (cat ? cat.label : 'unknown') +
      '), this hour ' + hourlyAqiAt(i) + ', CPCB AQI ' +
      (cpcb ? cpcb.aqi + ' (' + Core.cpcbCategory(cpcb.aqi).label + ')' : 'not available yet') +
      ', PM2.5 ' + Math.round(h.pm2_5[i]) + ' µg/m³, about ' +
      (h.pm2_5[i] / 15).toFixed(1) + '× the WHO 24-hour guideline.');
    lines.push('For your household (' + profiles.join(', ') + ') and a ' + $('duration').value +
      '-minute ' + $('activity').value + ': risk score ' + score + '/100 — ' + verdict.label + '.');
    if (best) lines.push('Cleanest hour in the next 24 hours: ' + fmtTimeLocal(best.startTime) +
      ' (average PM2.5 ' + Math.round(best.avgPm25) + ' µg/m³).');
    lines.push('General advice: ' + (cat ? cat.advice : ''));
    lines.push('Your question was: "' + question + '". For a tailored answer to this question, add a Gemini key above.');
    return lines.join('\n');
  }

  function addChatMessage(who, text, tag) {
    var log = $('chat-log');
    var div = document.createElement('div');
    div.className = 'chat-msg ' + (who === 'You' ? 'user' : 'assistant');
    var whoEl = el('strong', who + ': ');
    whoEl.className = 'who';
    div.appendChild(whoEl);
    if (tag) {
      var tagEl = el('span', tag);
      tagEl.className = 'tag';
      div.appendChild(tagEl);
      div.appendChild(document.createElement('br'));
    }
    div.appendChild(document.createTextNode(text));
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function askAssistant(question) {
    var q = (question || '').trim().slice(0, 300);
    if (!q) return;
    addChatMessage('You', q, null);
    var key = getKey();
    if (!key) {
      addChatMessage('VayuMitra', offlineBriefing(q), 'Offline briefing');
      return;
    }
    var thinkingEl = addChatMessage('VayuMitra', 'Thinking…', 'Gemini');
    var prompt = 'You are VayuMitra, a friendly urban air quality assistant for families in India. ' +
      'Answer in short, plain language in ' + (state.lang === 'hi' ? 'Hindi' : state.lang === 'mr' ? 'Marathi' : 'English') +
      ', under 120 words, no medical diagnosis. Current conditions: ' + contextSummary() +
      (state.isDemo ? ' (Note: these are labelled demo numbers because the live API is unavailable.)' : '') +
      ' User question: ' + q;
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(key);
    fetchWithTimeout(url, 20000).then(function (res) {
      if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      var text = '';
      try { text = data.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join(''); } catch (e) { text = ''; }
      // Remove exactly this question's "Thinking…" bubble (not the last
      // one in the log — two quick questions must not eat each other).
      if (thinkingEl && thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);
      if (text) addChatMessage('VayuMitra', text, 'Gemini · gemini-2.5-flash');
      else addChatMessage('VayuMitra', offlineBriefing(q), 'Offline briefing');
    }).catch(function () {
      if (thinkingEl && thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);
      addChatMessage('VayuMitra',
        'Gemini could not be reached (check the key and your connection). Here is the offline briefing instead:\n' + offlineBriefing(q),
        'Offline briefing');
    });
  }

  /* ---------------- language ---------------- */

  function applyLanguage(lang) {
    state.lang = I18N[lang] ? lang : 'en';
    document.documentElement.lang = state.lang;
    document.querySelector('[data-i18n="tagline"]').textContent = t('tagline');
    document.querySelector('[data-i18n="lede"]').textContent = t('lede');
    document.querySelector('[data-i18n="planner-lede"]').textContent = t('plannerLede');
    if (state.hourly) { renderCurrent(); renderAdvice(); }
  }

  /* ---------------- wiring ---------------- */

  function buildChips() {
    var wrap = document.querySelector('.chips');
    CITIES.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn';
      b.textContent = c.name;
      b.setAttribute('aria-pressed', c.name === 'Delhi' ? 'true' : 'false');
      b.addEventListener('click', function () {
        document.querySelectorAll('.chips .chip-btn').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        $('city-input').value = c.name;
        loadAir(c.lat, c.lon, c.name);
      });
      wrap.appendChild(b);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildChips();
    updateKeyStatus();

    $('search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      searchCity($('city-input').value);
    });

    $('refresh-btn').addEventListener('click', function () {
      loadAir(state.lat, state.lon, state.placeName);
    });

    $('geo-btn').addEventListener('click', function () {
      if (!navigator.geolocation) { setStatus('Geolocation is not supported by this browser.'); return; }
      setStatus('Finding your location…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        loadAir(pos.coords.latitude, pos.coords.longitude,
          'Your location (' + pos.coords.latitude.toFixed(2) + ', ' + pos.coords.longitude.toFixed(2) + ')');
      }, function () {
        setStatus('Could not get your location — permission denied or unavailable. Pick a city instead.');
      }, { timeout: 10000 });
    });

    $('planner-form').addEventListener('submit', function (e) {
      e.preventDefault();
      planActivity();
    });

    $('lang-select').addEventListener('change', function () {
      applyLanguage($('lang-select').value);
    });

    $('save-key-btn').addEventListener('click', function () {
      var k = $('gemini-key').value.trim().slice(0, 100);
      if (!k) { $('key-status').textContent = 'Paste a key first.'; return; }
      try { localStorage.setItem(KEY_NAME, k); } catch (e) { /* storage unavailable */ }
      $('gemini-key').value = '';
      updateKeyStatus();
    });
    $('remove-key-btn').addEventListener('click', function () {
      try { localStorage.removeItem(KEY_NAME); } catch (e) { /* ignore */ }
      updateKeyStatus();
    });

    $('chat-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('chat-input').value;
      $('chat-input').value = '';
      askAssistant(q);
    });
    document.querySelectorAll('.suggested .chip-btn').forEach(function (b) {
      b.addEventListener('click', function () { askAssistant(b.getAttribute('data-q') || ''); });
    });

    addChatMessage('VayuMitra',
      'Namaste! I can explain today\u2019s air, plan a walk or school run, and suggest low-emission routines. Ask me anything — or try a suggested question below.',
      'Offline briefing');

    loadAir(28.61, 77.20, 'Delhi');
  });
})();
