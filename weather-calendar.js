/* =============================================
   JECS Quick Wash — weather-calendar.js  v2.1
   Weather-aware + Schedule-aware date picker

   Three signals layered on every calendar day:
     1. Weather score      (Open-Meteo, no API key)
     2. Zone capacity      (Supabase service_requests)
     3. Combined status    → Open / Filling / Full / Unavailable

   Scheduling model
   ────────────────────────────────────────────
   • Service day window: 8 AM–5 PM = 540 min
   • One tech works one ZIP zone per day
   • Service durations per package:
       Quick Wash           → 20 min / vehicle
       Wash + Vacuum        → 35 min / vehicle
       Fleet & Commercial   → 540 min (full-day block)
   • Travel buffer between stops (same zone): 8 min
   • Max vehicles per day derived from minutes remaining
   • Soft cap at 80 % → "Filling fast" warning
   • No same-day booking; minimum 1 business day lead
   • Weekends blocked (closed)
   • Adjacent ZIP clusters counted together for routing
     e.g. tech serving 372xx serves 371xx–373xx

   v2.1 fix: all date comparisons use noon-anchored
   local date strings to prevent timezone-offset
   issues that caused all days to appear locked.
   ============================================= */

(function () {
  "use strict";

  // ── Config ───────────────────────────────────
  const CALENDAR_ID       = "jecsWeatherCal";
  const DATE_INPUT_NAME   = "requested_date";
  const FORECAST_DAYS     = 14;
  const SUPABASE_URL      = "https://mylqkbpclcrqorjctjxn.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bHFrYnBjbGNycW9yamN0anhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjcxNzgsImV4cCI6MjA5NTMwMzE3OH0.yeZZHm0BEvrJShe8Wek5rfKAwunJQ8byKF1THbtwYYg";

  // ── Scheduling constants ──────────────────────
  const DAY_MINUTES     = 540;
  const TRAVEL_BUFFER   = 8;
  const SOFT_CAP_PCT    = 0.80;

  const SERVICE_DURATIONS = {
    "package-uuid-0001":  20,
    "package-uuid-0002":  35,
    "package-uuid-0003":  540,
    "quick wash":         20,
    "wash + vacuum":      35,
    "fleet":              540,
    "fleet & commercial": 540,
    "fleet service":      540,
  };

  // ── State ─────────────────────────────────────
  let forecastData    = {};
  let scheduleData    = {};
  let selectedDate    = null;
  let currentMonth    = null;
  let userLat         = null;
  let userLng         = null;
  let userZip         = null;
  let selectedService = null;

  // ── Date helpers (all timezone-safe) ──────────
  // KEY FIX: always anchor to noon local time so
  // date string comparisons are never shifted by
  // UTC offset. "2026-06-27" < "2026-06-28" works
  // correctly regardless of the user's timezone.

  const pad = n => String(n).padStart(2, "0");

  // Build YYYY-MM-DD from a Date object using LOCAL date parts
  function toDateKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Today as YYYY-MM-DD in local time
  function todayKey() {
    return toDateKey(new Date());
  }

  // Parse a YYYY-MM-DD key back to a noon-anchored local Date
  // so comparisons like dateA < dateB work correctly
  function keyToDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }

  function isWeekend(key) {
    return keyToDate(key).getDay() === 0 || keyToDate(key).getDay() === 6;
  }

  // Earliest selectable date = next business day
  function nextBusinessDayKey() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    return toDateKey(d);
  }

  function serviceDuration(pkgValue) {
    if (!pkgValue) return 30;
    const key = String(pkgValue).toLowerCase().trim();
    return SERVICE_DURATIONS[pkgValue] || SERVICE_DURATIONS[key] || 30;
  }

  function extractZip(text) {
    const m = String(text || "").match(/\b(\d{5})(?:-\d{4})?\b/);
    return m ? m[1] : null;
  }

  function clusterGroup(zip) {
    if (!zip || zip.length < 3) return ["unzoned"];
    const n = parseInt(zip.slice(0, 3), 10);
    return [n - 1, n, n + 1]
      .filter(x => x >= 0)
      .map(x => String(x).padStart(3, "0") + "xx");
  }

  // ── Weather scoring ───────────────────────────
  function calcWashScore({ precipMm, windKph, tempMax, tempMin }) {
    let s = 100;
    if      (precipMm >= 10)  s -= 65;
    else if (precipMm >= 3)   s -= 42;
    else if (precipMm >= 0.5) s -= 22;
    if      (windKph  >= 50)  s -= 25;
    else if (windKph  >= 30)  s -= 12;
    else if (windKph  >= 20)  s -= 5;
    if      (tempMin  <= 0)   s -= 25;
    else if (tempMin  <= 4)   s -= 10;
    if      (tempMax  >= 38)  s -= 15;
    else if (tempMax  >= 35)  s -= 8;
    return Math.max(0, Math.min(100, s));
  }

  function weatherTier(score) {
    if (score >= 75) return { tier: "great",       icon: "☀️",  label: "Great wash day" };
    if (score >= 45) return { tier: "fair",         icon: "🌤️", label: "Decent — watch forecast" };
    if (score >= 20) return { tier: "poor",         icon: "🌦️", label: "Not ideal" };
    return               { tier: "weather-bad",  icon: "🌧️", label: "Rain or wind likely" };
  }

  // ── Capacity status ───────────────────────────
  function capacityStatus(dateKey, pkgValue) {
    const entry   = scheduleData[dateKey] || { usedMin: 0, jobCount: 0, hasFleet: false };
    const dur     = serviceDuration(pkgValue);
    const jobCost = dur + TRAVEL_BUFFER;
    const used    = entry.usedMin;
    const usedPct = used / DAY_MINUTES;
    const remain  = DAY_MINUTES - used;

    if (entry.hasFleet) {
      return { status: "full", slotsLabel: "Zone full — fleet booking", usedPct: 1 };
    }
    if (dur >= DAY_MINUTES && used > 0) {
      return { status: "full", slotsLabel: "Fleet block unavailable", usedPct };
    }
    if (remain < jobCost) {
      return { status: "full", slotsLabel: "Fully booked", usedPct: 1 };
    }
    if (usedPct >= SOFT_CAP_PCT) {
      const slots = Math.floor(remain / jobCost);
      return { status: "filling", slotsLabel: `~${slots} slot${slots !== 1 ? "s" : ""} left`, usedPct };
    }
    const slots = Math.floor(remain / jobCost);
    return { status: "open", slotsLabel: `${slots} slot${slots !== 1 ? "s" : ""} open`, usedPct };
  }

  // ── Combined day status ───────────────────────
  function dayStatus(dateKey, pkgValue) {
    const minLead  = nextBusinessDayKey();
    const todayStr = todayKey();

    // Past or today — blocked
    if (dateKey <= todayStr) {
      return { blocked: true, tier: "blocked", icon: "🚫", label: "Past date" };
    }

    // Too soon (before next business day) — blocked
    if (dateKey < minLead) {
      return { blocked: true, tier: "blocked", icon: "🚫", label: "Too soon to book" };
    }

    // Weekend — blocked
    if (isWeekend(dateKey)) {
      return { blocked: true, tier: "blocked", icon: "📵", label: "Closed weekends" };
    }

    const cap = capacityStatus(dateKey, pkgValue);
    if (cap.status === "full") {
      return { blocked: true, tier: "blocked", icon: "🔒", label: cap.slotsLabel, cap };
    }

    const wx = forecastData[dateKey];

    if (!wx) {
      if (cap.status === "filling") {
        return { blocked: false, tier: "filling", icon: "⚡", label: cap.slotsLabel, cap };
      }
      return { blocked: false, tier: "no-data", icon: "📅", label: cap.slotsLabel || "Open", cap };
    }

    const wt = weatherTier(wx.score);

    if (wt.tier === "weather-bad") {
      return { blocked: false, tier: "weather-bad", icon: "🌧️", label: "Rain likely", cap, wx };
    }
    if (cap.status === "filling") {
      return { blocked: false, tier: "filling", icon: "⚡", label: cap.slotsLabel, cap, wx };
    }

    return { blocked: false, tier: wt.tier, icon: wt.icon, label: wt.label, cap, wx };
  }

  // ── Open-Meteo forecast ───────────────────────
  async function fetchForecast(lat, lng) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude",  lat.toFixed(4));
    url.searchParams.set("longitude", lng.toFixed(4));
    url.searchParams.set("daily", [
      "precipitation_sum",
      "windspeed_10m_max",
      "temperature_2m_max",
      "temperature_2m_min",
    ].join(","));
    url.searchParams.set("forecast_days", FORECAST_DAYS);
    url.searchParams.set("timezone", "auto");
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    return r.json();
  }

  function processForecast(json) {
    const d = json.daily;
    const out = {};
    d.time.forEach((key, i) => {
      const score = calcWashScore({
        precipMm: d.precipitation_sum[i]  ?? 0,
        windKph:  d.windspeed_10m_max[i]  ?? 0,
        tempMax:  d.temperature_2m_max[i] ?? 20,
        tempMin:  d.temperature_2m_min[i] ?? 10,
      });
      out[key] = {
        score,
        precip:  (d.precipitation_sum[i] ?? 0).toFixed(1),
        wind:    Math.round(d.windspeed_10m_max[i]  ?? 0),
        tempMax: Math.round(d.temperature_2m_max[i] ?? 20),
        tempMin: Math.round(d.temperature_2m_min[i] ?? 10),
        ...weatherTier(score),
      };
    });
    try { sessionStorage.setItem("jecs_forecast", JSON.stringify(out)); } catch (_) {}
    return out;
  }

  // ── Supabase capacity fetch ───────────────────
  async function fetchSchedule(zip) {
    const from     = todayKey();
    const toDate   = new Date();
    toDate.setDate(toDate.getDate() + FORECAST_DAYS);
    const to       = toDateKey(toDate);
    const clusters = clusterGroup(zip);

    const qs = [
      `select=requested_date,package_id,status,customers(zip_code)`,
      `requested_date=gte.${from}`,
      `requested_date=lte.${to}`,
      `status=neq.cancelled`,
    ].join("&");

    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/service_requests?${qs}`,
        {
          headers: {
            "apikey":        SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (!r.ok) throw new Error(`Supabase ${r.status}`);
      const rows = await r.json();

      const agg = {};
      rows.forEach(row => {
        const dateKey = row.requested_date;
        if (!dateKey) return;
        const rowZip    = row.customers?.zip_code || null;
        const rowPrefix = rowZip ? rowZip.slice(0, 3) : null;
        const inZone    = !rowZip || clusters.some(c => c.replace("xx", "") === rowPrefix);
        if (!inZone) return;

        if (!agg[dateKey]) agg[dateKey] = { usedMin: 0, jobCount: 0, hasFleet: false };
        const dur = serviceDuration(row.package_id);
        if (dur >= DAY_MINUTES) {
          agg[dateKey].hasFleet = true;
          agg[dateKey].usedMin  = DAY_MINUTES;
        } else {
          agg[dateKey].usedMin += dur + TRAVEL_BUFFER;
        }
        agg[dateKey].jobCount++;
      });

      return agg;
    } catch (err) {
      console.warn("[JECS Schedule] Could not load capacity:", err.message);
      return {};
    }
  }

  // ── Calendar HTML builder ─────────────────────
  function buildHTML() {
    const todayStr  = todayKey();
    const yr        = currentMonth.getFullYear();
    const mo        = currentMonth.getMonth();
    const moLabel   = currentMonth.toLocaleString("default", { month: "long", year: "numeric" });
    const first     = new Date(yr, mo, 1).getDay();
    const days      = new Date(yr, mo + 1, 0).getDate();
    const thisMonth = new Date().getMonth();
    const thisYear  = new Date().getFullYear();
    const canPrev   = !(yr === thisYear && mo === thisMonth);

    let h = `
      <div class="jecs-cal-header">
        <button type="button" class="jecs-cal-nav" id="jecsPrev"
          ${!canPrev ? "disabled" : ""} aria-label="Previous month">&#8249;</button>
        <span class="jecs-cal-month">${moLabel}</span>
        <button type="button" class="jecs-cal-nav" id="jecsNext"
          aria-label="Next month">&#8250;</button>
      </div>

      <div class="jecs-cal-legend">
        <span class="jecs-leg l-great">&#9728;&#65039; Great</span>
        <span class="jecs-leg l-fair">&#127780;&#65039; Fair</span>
        <span class="jecs-leg l-filling">&#9889; Filling</span>
        <span class="jecs-leg l-rain">&#127783;&#65039; Rain</span>
        <span class="jecs-leg l-blocked">&#128274; Closed/Full</span>
      </div>

      <div class="jecs-cal-grid">
        <div class="jecs-dow">Su</div><div class="jecs-dow">Mo</div>
        <div class="jecs-dow">Tu</div><div class="jecs-dow">We</div>
        <div class="jecs-dow">Th</div><div class="jecs-dow">Fr</div>
        <div class="jecs-dow">Sa</div>`;

    for (let s = 0; s < first; s++) {
      h += `<div class="jecs-cal-day empty"></div>`;
    }

    for (let d = 1; d <= days; d++) {
      const key  = `${yr}-${pad(mo + 1)}-${pad(d)}`;
      const past = key <= todayStr;
      const tod  = key === todayStr;
      const sel  = key === selectedDate;

      if (past) {
        h += `<div class="jecs-cal-day past" aria-disabled="true" title="Past date">
                <span class="jecs-day-num">${tod ? `<span class="tod-ring">${d}</span>` : d}</span>
              </div>`;
        continue;
      }

      const st   = dayStatus(key, selectedService);
      const cap  = st.cap || {};
      const barW = Math.round((cap.usedPct || 0) * 100);
      const tip  = buildTooltip(key, st);
      const cls  = `jecs-cal-day t-${st.tier}${st.blocked ? " blocked" : ""}${sel ? " selected" : ""}`;

      h += `
        <div class="${cls}"
             data-date="${key}"
             data-blocked="${st.blocked}"
             title="${tip}"
             role="button"
             tabindex="${st.blocked ? -1 : 0}"
             aria-label="Day ${d}, ${st.label}"
             aria-pressed="${sel}"
             aria-disabled="${st.blocked}">
          <span class="jecs-day-num">${d}</span>
          <span class="jecs-day-icon">${st.icon}</span>
          ${barW > 0 ? `<div class="jecs-bar"><div class="jecs-bar-fill" style="width:${barW}%"></div></div>` : ""}
        </div>`;
    }

    h += `</div>`;

    if (selectedDate) {
      const st  = dayStatus(selectedDate, selectedService);
      const cap = st.cap || {};
      const wx  = st.wx;
      h += `
        <div class="jecs-detail t-${st.tier}">
          <div class="jecs-detail-top">
            <strong>${st.icon} ${st.label}</strong>
            <span class="jecs-badge ${st.blocked ? "badge-blocked" : "badge-open"}">
              ${st.blocked ? "Not available" : "Available ✓"}
            </span>
          </div>
          <div class="jecs-detail-stats">
            ${wx ? `<span>🌧 ${wx.precip}mm rain</span><span>💨 ${wx.wind}km/h wind</span><span>🌡 ${wx.tempMin}–${wx.tempMax}°C</span>` : ""}
            <span>📋 ${cap.slotsLabel || "Checking slots…"}</span>
          </div>
        </div>`;
    }

    const openCount = countOpenDays();
    h += `
      <div class="jecs-zone-bar">
        <span>📍 ${userZip ? `Zone ${userZip}` : "Your area"}</span>
        <span>${openCount} good day${openCount !== 1 ? "s" : ""} in the next ${FORECAST_DAYS} days</span>
      </div>`;

    return h;
  }

  function buildTooltip(key, st) {
    const wx  = st.wx;
    const cap = st.cap;
    let parts = [st.label];
    if (wx)  parts.push(`${wx.precip}mm rain`, `${wx.wind}km/h wind`, `${wx.tempMin}–${wx.tempMax}°C`);
    if (cap) parts.push(cap.slotsLabel);
    return parts.join(" · ");
  }

  function countOpenDays() {
    let n = 0;
    for (let i = 1; i <= FORECAST_DAYS; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const key = toDateKey(d);
      const st  = dayStatus(key, selectedService);
      if (!st.blocked && st.tier !== "weather-bad") n++;
    }
    return n;
  }

  // ── Render ────────────────────────────────────
  function render() {
    const cal = document.getElementById(CALENDAR_ID);
    if (cal) { cal.innerHTML = buildHTML(); bindEvents(); }
  }

  function bindEvents() {
    document.getElementById("jecsPrev")?.addEventListener("click", () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      render();
    });
    document.getElementById("jecsNext")?.addEventListener("click", () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
      render();
    });

    document.querySelectorAll(".jecs-cal-day:not(.past):not(.empty):not(.blocked)").forEach(cell => {
      const pick = () => {
        const key = cell.dataset.date;
        if (!key || cell.dataset.blocked === "true") return;
        selectedDate = key;
        const hidden = document.querySelector(`[name="${DATE_INPUT_NAME}"]`);
        if (hidden) hidden.value = key;
        render();
      };
      cell.addEventListener("click", pick);
      cell.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      });
    });
  }

  // ── Data load ─────────────────────────────────
  async function loadAll(lat, lng, zip) {
    userZip = zip || userZip || null;
    const cal = document.getElementById(CALENDAR_ID);
    if (cal) cal.innerHTML = `<p class="jecs-cal-loading">Checking weather &amp; availability&hellip;</p>`;

    const [wxRes, schRes] = await Promise.allSettled([
      fetchForecast(lat, lng).then(processForecast),
      fetchSchedule(zip),
    ]);

    forecastData = wxRes.status  === "fulfilled" ? wxRes.value  : {};
    scheduleData = schRes.status === "fulfilled" ? schRes.value : {};

    if (wxRes.status  !== "fulfilled") console.warn("[JECS Weather]",   wxRes.reason?.message);
    if (schRes.status !== "fulfilled") console.warn("[JECS Schedule]", schRes.reason?.message);

    render();
  }

  // ── Location resolution ───────────────────────
  function tryGetLocation() {
    const latEl  = document.getElementById("lat");
    const lngEl  = document.getElementById("lng");
    const zipEl  = document.querySelector('[name="zip_code"]');
    const addrEl = document.getElementById("address");

    const lat = parseFloat(latEl?.value);
    const lng = parseFloat(lngEl?.value);
    const zip = zipEl?.value || extractZip(addrEl?.value);

    if (isFinite(lat) && isFinite(lng)) {
      userLat = lat; userLng = lng;
      loadAll(lat, lng, zip);
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => { userLat = p.coords.latitude; userLng = p.coords.longitude; loadAll(userLat, userLng, zip); },
        ()  => { loadAll(36.1627, -86.7816, zip || "37201"); },
        { timeout: 5000 }
      );
    } else {
      loadAll(36.1627, -86.7816, zip || "37201");
    }
  }

  // ── Form field watchers ───────────────────────
  function watchFormFields() {
    const pkgEl  = document.querySelector('[name="package_id"]');
    const zipEl  = document.querySelector('[name="zip_code"]');
    const addrEl = document.getElementById("address");
    const latEl  = document.getElementById("lat");
    const lngEl  = document.getElementById("lng");

    pkgEl?.addEventListener("change", () => { selectedService = pkgEl.value; render(); });
    if (pkgEl?.value) selectedService = pkgEl.value;

    zipEl?.addEventListener("change", () => {
      const z = zipEl.value;
      if (z && z !== userZip && isFinite(userLat) && isFinite(userLng)) {
        userZip = z;
        loadAll(userLat, userLng, z);
      }
    });

    const onPlace = () => setTimeout(() => {
      const lat2 = parseFloat(latEl?.value);
      const lng2 = parseFloat(lngEl?.value);
      const zip2 = zipEl?.value || extractZip(addrEl?.value);
      if (isFinite(lat2) && isFinite(lng2) && (lat2 !== userLat || lng2 !== userLng || zip2 !== userZip)) {
        userLat = lat2; userLng = lng2; userZip = zip2;
        loadAll(lat2, lng2, zip2);
      }
    }, 500);

    addrEl?.addEventListener("change", onPlace);

    if (latEl && lngEl) {
      const obs = new MutationObserver(onPlace);
      obs.observe(latEl, { attributes: true, attributeFilter: ["value"] });
      obs.observe(lngEl, { attributes: true, attributeFilter: ["value"] });
    }
  }

  // ── Styles ────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("jecs-cal-css")) return;
    const el = document.createElement("style");
    el.id = "jecs-cal-css";
    el.textContent = `
      #jecsWeatherCal {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px;
        margin-top: 8px;
        font-family: inherit;
        box-shadow: 0 2px 12px rgba(0,0,0,.07);
      }
      .jecs-cal-header {
        display: flex; align-items: center;
        justify-content: space-between; margin-bottom: 10px;
      }
      .jecs-cal-month { font-weight: 700; font-size: .93rem; color: #1a202c; }
      .jecs-cal-nav {
        background: none; border: 1px solid #cbd5e0;
        border-radius: 6px; width: 28px; height: 28px;
        cursor: pointer; font-size: 1.1rem; color: #4a5568;
        transition: background .15s; line-height: 1;
      }
      .jecs-cal-nav:hover:not([disabled]) { background: #f7fafc; }
      .jecs-cal-nav[disabled] { opacity: .3; cursor: default; }
      .jecs-cal-legend {
        display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;
      }
      .jecs-leg {
        font-size: .67rem; font-weight: 600;
        padding: 2px 8px; border-radius: 20px;
      }
      .l-great   { background: #f0fff4; color: #276749; }
      .l-fair    { background: #fffff0; color: #744210; }
      .l-filling { background: #fffbeb; color: #7b4f00; border: 1px solid #f6ad55; }
      .l-rain    { background: #ebf8ff; color: #2b6cb0; }
      .l-blocked { background: #f7f7f7; color: #718096; }
      .jecs-cal-grid {
        display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px;
      }
      .jecs-dow {
        text-align: center; font-size: .63rem; font-weight: 700;
        color: #a0aec0; padding: 3px 0;
        text-transform: uppercase; letter-spacing: .04em;
      }
      .jecs-cal-day {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        border-radius: 8px; padding: 5px 2px;
        min-height: 50px; cursor: pointer;
        transition: transform .12s, box-shadow .12s;
        border: 2px solid transparent;
        user-select: none; position: relative; overflow: hidden;
      }
      .jecs-cal-day:not(.past):not(.empty):not(.blocked):hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,.14);
        z-index: 2;
      }
      .jecs-cal-day.empty   { cursor: default; }
      .jecs-cal-day.past    { opacity: .25; cursor: not-allowed; background: #f9fafb; }
      .jecs-cal-day.blocked { opacity: .45; cursor: not-allowed; }
      .jecs-cal-day.selected {
        border-color: #3182ce !important;
        box-shadow: 0 0 0 3px rgba(49,130,206,.28) !important;
        transform: translateY(-1px);
      }
      .jecs-day-num  { font-size: .8rem; font-weight: 700; line-height: 1; z-index: 1; }
      .jecs-day-icon { font-size: .82rem; margin-top: 2px; z-index: 1; }
      .tod-ring {
        display: inline-flex; align-items: center; justify-content: center;
        background: #2d3748; color: #fff;
        border-radius: 50%; width: 20px; height: 20px;
      }
      .t-great       { background: #f0fff4; }
      .t-fair        { background: #fffff0; }
      .t-poor        { background: #fff5f0; }
      .t-weather-bad { background: #ebf8ff; }
      .t-filling     { background: #fffbeb; border-color: #f6ad55 !important; }
      .t-blocked     { background: #f7f7f7; }
      .t-no-data     { background: #f9fafb; }
      .jecs-bar {
        position: absolute; bottom: 0; left: 0; right: 0;
        height: 3px; background: rgba(0,0,0,.08);
        border-radius: 0 0 6px 6px;
      }
      .jecs-bar-fill {
        height: 100%; border-radius: 0 0 6px 6px;
        background: linear-gradient(90deg,#48bb78 0%,#f6ad55 60%,#e53e3e 100%);
        background-size: 300% 100%;
        transition: width .3s ease;
      }
      .jecs-detail {
        margin-top: 12px; border-radius: 9px;
        padding: 11px 14px; font-size: .8rem;
      }
      .jecs-detail.t-great       { background: #c6f6d5; color: #22543d; }
      .jecs-detail.t-fair        { background: #fefcbf; color: #744210; }
      .jecs-detail.t-filling     { background: #feebc8; color: #7b341e; }
      .jecs-detail.t-weather-bad { background: #bee3f8; color: #2a4365; }
      .jecs-detail.t-blocked     { background: #f7f7f7; color: #718096; }
      .jecs-detail.t-no-data     { background: #edf2f7; color: #4a5568; }
      .jecs-detail-top {
        display: flex; align-items: center;
        justify-content: space-between; flex-wrap: wrap;
        gap: 6px; font-weight: 600; margin-bottom: 6px;
      }
      .jecs-detail-stats {
        display: flex; flex-wrap: wrap;
        gap: 12px; opacity: .88; font-size: .77rem;
      }
      .jecs-badge {
        font-size: .7rem; padding: 2px 9px;
        border-radius: 20px; font-weight: 700;
      }
      .badge-open    { background: rgba(0,0,0,.10); }
      .badge-blocked { background: rgba(220,38,38,.12); color: #c53030; }
      .jecs-zone-bar {
        display: flex; justify-content: space-between;
        flex-wrap: wrap; gap: 4px;
        font-size: .71rem; color: #718096;
        margin-top: 10px; padding-top: 8px;
        border-top: 1px solid #edf2f7;
      }
      .jecs-cal-loading {
        text-align: center; color: #718096;
        font-size: .85rem; padding: 28px 0; margin: 0;
      }
      .jecs-cal-label {
        font-size: .82rem; font-weight: 600;
        color: #4a5568; margin-bottom: 4px;
        display: flex; align-items: center; gap: 6px;
      }
    `;
    document.head.appendChild(el);
  }

  // ── Mount ─────────────────────────────────────
  function mount() {
    const dateInput = document.querySelector(`[name="${DATE_INPUT_NAME}"]`);
    if (!dateInput) return;

    dateInput.type = "hidden";

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <p class="jecs-cal-label">📅 Pick your wash date — weather &amp; availability checked</p>
      <div id="${CALENDAR_ID}"><p class="jecs-cal-loading">Checking your area…</p></div>
    `;
    dateInput.insertAdjacentElement("afterend", wrapper);

    injectStyles();
    currentMonth = new Date();
    currentMonth.setDate(1);

    const pkgEl = document.querySelector('[name="package_id"]');
    if (pkgEl?.value) selectedService = pkgEl.value;

    watchFormFields();
    tryGetLocation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

})();
