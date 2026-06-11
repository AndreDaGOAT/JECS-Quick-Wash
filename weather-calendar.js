/* =============================================
   JECS Quick Wash — weather-calendar.js
   Weather-aware date picker for wash scheduling
   Uses Open-Meteo (free, no API key required)
   Replaces the plain <input type="date"> with
   a visual calendar showing wash-quality scores
   ============================================= */

(function () {
  "use strict";

  // ── Constants ──────────────────────────────
  const CALENDAR_ID     = "jecsWeatherCal";
  const DATE_INPUT_NAME = "requested_date";
  const FORECAST_DAYS   = 14;

  // Wash score thresholds (0–100)
  // Great: no rain, low wind, mild temp
  // Poor:  rain likely, high wind, extreme heat/cold

  // ── State ──────────────────────────────────
  let forecastData   = {};   // { "YYYY-MM-DD": { score, label, icon, details } }
  let selectedDate   = null;
  let currentMonth   = null; // Date object for the displayed month
  let userLat        = null;
  let userLng        = null;

  // ── Helpers ────────────────────────────────
  function pad(n) { return String(n).padStart(2, "0"); }

  function toDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function parseLocalDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // ── Wash Score Calculator ───────────────────
  // Inputs from Open-Meteo daily aggregates
  function calcWashScore({ precipMm, windKph, tempMax, tempMin, uvIndex }) {
    let score = 100;

    // Rain — biggest killer
    if (precipMm >= 10) score -= 60;
    else if (precipMm >= 3)  score -= 40;
    else if (precipMm >= 0.5) score -= 20;

    // Wind (dries soap too fast, blows dust back)
    if (windKph >= 50) score -= 25;
    else if (windKph >= 30) score -= 12;
    else if (windKph >= 20) score -= 5;

    // Freezing temps (water won't rinse properly)
    if (tempMin <= 0) score -= 25;
    else if (tempMin <= 4) score -= 10;

    // Extreme heat (soap dries before rinse)
    if (tempMax >= 38) score -= 15;
    else if (tempMax >= 35) score -= 8;

    score = Math.max(0, Math.min(100, score));
    return score;
  }

  function scoreToLabel(score) {
    if (score >= 75) return { label: "Great day to wash", tier: "great", icon: "☀️" };
    if (score >= 45) return { label: "Decent — watch forecast", tier: "fair", icon: "🌤️" };
    if (score >= 20) return { label: "Not ideal", tier: "poor", icon: "🌦️" };
    return          { label: "Skip — rain or wind likely", tier: "bad", icon: "🌧️" };
  }

  // ── Open-Meteo Fetch ────────────────────────
  async function fetchForecast(lat, lng) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude",  lat.toFixed(4));
    url.searchParams.set("longitude", lng.toFixed(4));
    url.searchParams.set("daily", [
      "precipitation_sum",
      "windspeed_10m_max",
      "temperature_2m_max",
      "temperature_2m_min",
      "uv_index_max",
    ].join(","));
    url.searchParams.set("forecast_days", FORECAST_DAYS);
    url.searchParams.set("timezone", "auto");

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`Open-Meteo error ${resp.status}`);
    return resp.json();
  }

  function processForecast(json) {
    const days   = json.daily;
    const result = {};
    days.time.forEach((dateStr, i) => {
      const score   = calcWashScore({
        precipMm: days.precipitation_sum[i]  ?? 0,
        windKph:  days.windspeed_10m_max[i]  ?? 0,
        tempMax:  days.temperature_2m_max[i] ?? 20,
        tempMin:  days.temperature_2m_min[i] ?? 10,
        uvIndex:  days.uv_index_max[i]       ?? 5,
      });
      const { label, tier, icon } = scoreToLabel(score);
      result[dateStr] = {
        score,
        label,
        tier,
        icon,
        precip:  (days.precipitation_sum[i] ?? 0).toFixed(1),
        wind:    Math.round(days.windspeed_10m_max[i] ?? 0),
        tempMax: Math.round(days.temperature_2m_max[i] ?? 20),
        tempMin: Math.round(days.temperature_2m_min[i] ?? 10),
      };
    });
    return result;
  }

  // ── Build Calendar HTML ─────────────────────
  function buildCalendarHTML() {
    const t       = today();
    const yr      = currentMonth.getFullYear();
    const mo      = currentMonth.getMonth();
    const moName  = currentMonth.toLocaleString("default", { month: "long", year: "numeric" });

    // Prev/next buttons
    const prevMo = new Date(yr, mo - 1, 1);
    const nextMo = new Date(yr, mo + 1, 1);
    const canPrev = prevMo >= new Date(t.getFullYear(), t.getMonth(), 1);

    // Days in month
    const firstDay = new Date(yr, mo, 1).getDay(); // 0=Sun
    const daysInMo = new Date(yr, mo + 1, 0).getDate();

    let html = `
      <div class="jecs-cal-header">
        <button type="button" class="jecs-cal-nav" id="jecsPrev" ${!canPrev ? "disabled" : ""} aria-label="Previous month">‹</button>
        <span class="jecs-cal-month">${moName}</span>
        <button type="button" class="jecs-cal-nav" id="jecsNext" aria-label="Next month">›</button>
      </div>
      <div class="jecs-cal-legend">
        <span class="jecs-leg great">☀️ Great</span>
        <span class="jecs-leg fair">🌤️ Fair</span>
        <span class="jecs-leg poor">🌦️ Poor</span>
        <span class="jecs-leg bad">🌧️ Skip</span>
      </div>
      <div class="jecs-cal-grid">
        <div class="jecs-dow">Su</div><div class="jecs-dow">Mo</div>
        <div class="jecs-dow">Tu</div><div class="jecs-dow">We</div>
        <div class="jecs-dow">Th</div><div class="jecs-dow">Fr</div>
        <div class="jecs-dow">Sa</div>
    `;

    // Empty leading cells
    for (let s = 0; s < firstDay; s++) {
      html += `<div class="jecs-cal-day empty"></div>`;
    }

    for (let d = 1; d <= daysInMo; d++) {
      const date    = new Date(yr, mo, d);
      const key     = toDateKey(date);
      const isPast  = date < t;
      const isTod   = key === toDateKey(t);
      const isSel   = key === selectedDate;
      const wx      = forecastData[key];
      const tier    = wx ? wx.tier : (isPast ? "past" : "no-data");
      const icon    = wx ? wx.icon : (isPast ? "" : "…");
      const tooltip = wx
        ? `${wx.label} · 🌧 ${wx.precip}mm · 💨 ${wx.wind}km/h · 🌡 ${wx.tempMin}–${wx.tempMax}°C`
        : (isPast ? "Past date" : "Forecast loading…");

      let cls = `jecs-cal-day tier-${tier}`;
      if (isPast)  cls += " past";
      if (isTod)   cls += " today";
      if (isSel)   cls += " selected";

      html += `
        <div class="${cls}"
             data-date="${key}"
             data-disabled="${isPast}"
             title="${tooltip}"
             role="button"
             tabindex="${isPast ? -1 : 0}"
             aria-label="${d} ${moName}${wx ? ": " + wx.label : ""}"
             aria-pressed="${isSel}">
          <span class="jecs-day-num">${d}</span>
          <span class="jecs-day-icon">${icon}</span>
        </div>`;
    }

    html += `</div>`;

    // Selected date detail strip
    if (selectedDate && forecastData[selectedDate]) {
      const wx = forecastData[selectedDate];
      html += `
        <div class="jecs-cal-detail tier-${wx.tier}">
          <strong>${wx.icon} ${wx.label}</strong>
          <span>🌧 ${wx.precip} mm rain &nbsp;·&nbsp; 💨 ${wx.wind} km/h wind &nbsp;·&nbsp; 🌡 ${wx.tempMin}–${wx.tempMax}°C</span>
        </div>`;
    } else if (selectedDate) {
      html += `<div class="jecs-cal-detail tier-no-data">No forecast data for this date yet.</div>`;
    }

    return html;
  }

  // ── Render ──────────────────────────────────
  function render() {
    const cal = document.getElementById(CALENDAR_ID);
    if (!cal) return;
    cal.innerHTML = buildCalendarHTML();
    bindCalendarEvents();
  }

  function bindCalendarEvents() {
    document.getElementById("jecsPrev")?.addEventListener("click", () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      render();
    });
    document.getElementById("jecsNext")?.addEventListener("click", () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
      render();
    });

    document.querySelectorAll(".jecs-cal-day:not(.past):not(.empty)").forEach(cell => {
      const handler = () => {
        const key = cell.dataset.date;
        if (!key || cell.dataset.disabled === "true") return;
        selectedDate = key;

        // Update the hidden date input
        const hiddenInput = document.querySelector(`[name="${DATE_INPUT_NAME}"]`);
        if (hiddenInput) hiddenInput.value = key;

        render();
      };
      cell.addEventListener("click", handler);
      cell.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); } });
    });
  }

  // ── Location & Bootstrap ────────────────────
  async function loadForecastForLocation(lat, lng) {
    const cal = document.getElementById(CALENDAR_ID);
    if (cal) cal.innerHTML = `<p class="jecs-cal-loading">Loading weather forecast…</p>`;

    try {
      const json = await fetchForecast(lat, lng);
      forecastData = processForecast(json);
    } catch (err) {
      console.warn("[JECS Weather] Forecast fetch failed:", err.message);
      forecastData = {};
      if (cal) cal.innerHTML = `<p class="jecs-cal-loading jecs-cal-error">Weather unavailable — pick any date.</p>`;
      // Still render calendar without forecast
    }
    render();
  }

  function tryGetLocation() {
    // 1. Check if Google Places already filled lat/lng
    const latEl = document.getElementById("lat");
    const lngEl = document.getElementById("lng");

    if (latEl?.value && lngEl?.value) {
      userLat = parseFloat(latEl.value);
      userLng = parseFloat(lngEl.value);
      if (isFinite(userLat) && isFinite(userLng)) {
        loadForecastForLocation(userLat, userLng);
        return;
      }
    }

    // 2. Browser geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          userLat = pos.coords.latitude;
          userLng = pos.coords.longitude;
          loadForecastForLocation(userLat, userLng);
        },
        () => {
          // 3. Fallback: Nashville, TN (JECS home base)
          loadForecastForLocation(36.1627, -86.7816);
        },
        { timeout: 5000 }
      );
    } else {
      loadForecastForLocation(36.1627, -86.7816);
    }
  }

  // Watch for Google Places updating the lat/lng fields
  function watchPlacesFields() {
    const latEl = document.getElementById("lat");
    const lngEl = document.getElementById("lng");
    if (!latEl || !lngEl) return;

    const observer = new MutationObserver(() => {
      const lat = parseFloat(latEl.value);
      const lng = parseFloat(lngEl.value);
      if (isFinite(lat) && isFinite(lng) && (lat !== userLat || lng !== userLng)) {
        userLat = lat;
        userLng = lng;
        loadForecastForLocation(lat, lng);
      }
    });
    observer.observe(latEl, { attributes: true, attributeFilter: ["value"] });
    observer.observe(lngEl, { attributes: true, attributeFilter: ["value"] });

    // Also catch when autocomplete fires (input event on address field)
    document.getElementById("address")?.addEventListener("change", () => {
      setTimeout(() => {
        const lat2 = parseFloat(latEl.value);
        const lng2 = parseFloat(lngEl.value);
        if (isFinite(lat2) && isFinite(lng2) && (lat2 !== userLat || lng2 !== userLng)) {
          userLat = lat2;
          userLng = lng2;
          loadForecastForLocation(lat2, lng2);
        }
      }, 600);
    });
  }

  // ── Inject Styles ───────────────────────────
  function injectStyles() {
    if (document.getElementById("jecs-cal-styles")) return;
    const style = document.createElement("style");
    style.id = "jecs-cal-styles";
    style.textContent = `
      /* ── JECS Weather Calendar ───────────── */
      #jecsWeatherCal {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px;
        margin-top: 8px;
        font-family: inherit;
        box-shadow: 0 2px 8px rgba(0,0,0,.06);
      }

      .jecs-cal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .jecs-cal-month {
        font-weight: 600;
        font-size: .95rem;
        color: #1a202c;
      }
      .jecs-cal-nav {
        background: none;
        border: 1px solid #cbd5e0;
        border-radius: 6px;
        width: 28px;
        height: 28px;
        cursor: pointer;
        font-size: 1rem;
        line-height: 1;
        color: #4a5568;
        transition: background .15s;
      }
      .jecs-cal-nav:hover:not(:disabled) { background: #f7fafc; }
      .jecs-cal-nav:disabled { opacity: .35; cursor: default; }

      .jecs-cal-legend {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        font-size: .72rem;
        margin-bottom: 10px;
        color: #4a5568;
      }
      .jecs-leg { display: flex; align-items: center; gap: 3px; }

      .jecs-cal-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 3px;
      }
      .jecs-dow {
        text-align: center;
        font-size: .68rem;
        font-weight: 600;
        color: #718096;
        padding: 4px 0;
      }
      .jecs-cal-day {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: 7px;
        padding: 5px 2px;
        min-height: 44px;
        cursor: pointer;
        transition: transform .1s, box-shadow .1s;
        border: 2px solid transparent;
        user-select: none;
        position: relative;
      }
      .jecs-cal-day:not(.past):not(.empty):hover {
        transform: translateY(-1px);
        box-shadow: 0 3px 8px rgba(0,0,0,.12);
      }
      .jecs-cal-day.empty { cursor: default; }
      .jecs-cal-day.past  { opacity: .35; cursor: not-allowed; }

      .jecs-day-num  { font-size: .78rem; font-weight: 600; line-height: 1; }
      .jecs-day-icon { font-size: .82rem; line-height: 1; margin-top: 2px; }

      /* Tier colours */
      .tier-great    { background: #f0fff4; }
      .tier-fair     { background: #fffbeb; }
      .tier-poor     { background: #fff5f0; }
      .tier-bad      { background: #fff0f0; }
      .tier-no-data  { background: #f7fafc; }
      .tier-past     { background: #f7fafc; }

      /* Selected */
      .jecs-cal-day.selected {
        border-color: #3182ce !important;
        box-shadow: 0 0 0 3px rgba(49,130,206,.25);
      }
      /* Today ring */
      .jecs-cal-day.today .jecs-day-num {
        background: #2d3748;
        color: #fff;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Detail strip */
      .jecs-cal-detail {
        margin-top: 12px;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: .8rem;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        justify-content: space-between;
      }
      .jecs-cal-detail.tier-great { background: #c6f6d5; color: #22543d; }
      .jecs-cal-detail.tier-fair  { background: #fefcbf; color: #744210; }
      .jecs-cal-detail.tier-poor  { background: #fed7aa; color: #7b341e; }
      .jecs-cal-detail.tier-bad   { background: #fed7d7; color: #742a2a; }
      .jecs-cal-detail.tier-no-data { background: #edf2f7; color: #4a5568; }

      .jecs-cal-loading {
        text-align: center;
        color: #718096;
        font-size: .85rem;
        padding: 20px 0;
        margin: 0;
      }
      .jecs-cal-error { color: #c53030; }

      /* Label above calendar */
      .jecs-cal-label {
        font-size: .82rem;
        font-weight: 600;
        color: #4a5568;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Mount ───────────────────────────────────
  function mount() {
    // Find the date input and replace it with our widget
    const dateInput = document.querySelector(`[name="${DATE_INPUT_NAME}"]`);
    if (!dateInput) return;

    // Hide original input (keep it for form submission)
    dateInput.type   = "hidden";
    dateInput.id     = dateInput.id || "requested_date_hidden";

    // Insert label + calendar wrapper after the input
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <p class="jecs-cal-label">📅 Pick a wash date — weather-rated</p>
      <div id="${CALENDAR_ID}"><p class="jecs-cal-loading">Locating you for forecast…</p></div>
    `;
    dateInput.insertAdjacentElement("afterend", wrapper);

    injectStyles();

    currentMonth = new Date();
    currentMonth.setDate(1);

    watchPlacesFields();
    tryGetLocation();
  }

  // ── Init ─────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
