/* =============================================
   JECS Quick Wash — vehicle-picker.js  v1.0
   Guided vehicle entry: Year → Make → Model,
   plus Color and License Plate.

   Data source: NHTSA vPIC API (free, no key)
     https://vpic.nhtsa.dot.gov/api/
   Falls back to free-text Make/Model entry if the
   API is unreachable or returns no data, so the
   client is never blocked from submitting.

   Writes into hidden field #vehicleTypeSummary as
   "YYYY Make Model" for human-readable display in
   the admin dashboard's existing vehicle_type slot,
   while vehicle_year / vehicle_make / vehicle_model /
   vehicle_color / license_plate are submitted as
   their own named fields for supabase-submit.js to
   map into the vehicles table columns.
   ============================================= */

(function () {
  const NHTSA_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
  const FETCH_TIMEOUT_MS = 5000;

  const yearSel   = document.getElementById("vp_year");
  const makeSel   = document.getElementById("vp_make");
  const modelSel  = document.getElementById("vp_model");
  const colorIn   = document.getElementById("vp_color");
  const plateIn   = document.getElementById("vp_plate");

  const fallbackRow  = document.getElementById("vp_fallback_row");
  const fallbackHint = document.getElementById("vp_fallback_hint");
  const makeTextIn   = document.getElementById("vp_make_text");
  const modelTextIn  = document.getElementById("vp_model_text");

  const summaryField = document.getElementById("vehicleTypeSummary");

  if (!yearSel || !makeSel || !modelSel) return; // picker not on this page

  let usingFallback = false;
  let makesCache     = null; // cached list of all makes (fetched once)

  // ── Helpers ───────────────────────────────────
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
  }

  async function fetchJson(url) {
    const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }), FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function setOptions(select, items, placeholder) {
    select.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder;
    select.appendChild(opt0);
    items.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });
  }

  function enableFallbackMode(reason) {
    if (usingFallback) return;
    usingFallback = true;
    console.warn("[JECS Vehicle Picker] Falling back to free-text entry:", reason);

    makeSel.style.display  = "none";
    modelSel.style.display = "none";
    fallbackRow.style.display  = "grid";
    fallbackHint.style.display = "block";

    makeSel.disabled  = true;
    modelSel.disabled = true;
  }

  function buildYearOptions() {
    const currentYear = new Date().getFullYear() + 1; // allow next model year
    const years = [];
    for (let y = currentYear; y >= 1990; y--) years.push(String(y));
    setOptions(yearSel, years, "Year");
  }

  async function loadMakes() {
    if (makesCache) return makesCache;
    const data = await fetchJson(`${NHTSA_BASE}/GetAllMakes?format=json`);
    const names = (data.Results || [])
      .map((r) => r.Make_Name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    makesCache = [...new Set(names)];
    return makesCache;
  }

  async function loadModels(make, year) {
    const url = `${NHTSA_BASE}/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${encodeURIComponent(year)}?format=json`;
    const data = await fetchJson(url);
    const names = (data.Results || [])
      .map((r) => r.Model_Name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return [...new Set(names)];
  }

  function updateSummary() {
    const year  = usingFallback ? "" : (yearSel.value || "");
    const make  = usingFallback ? (makeTextIn.value || "").trim() : (makeSel.value || "");
    const model = usingFallback ? (modelTextIn.value || "").trim() : (modelSel.value || "");
    const color = (colorIn.value || "").trim();

    const parts = [year, color, make, model].filter(Boolean);
    summaryField.value = parts.join(" ").trim();
  }

  // ── Event wiring ────────────────────────────────
  yearSel.addEventListener("change", async () => {
    updateSummary();
    if (usingFallback) return;
    if (!yearSel.value) {
      makeSel.disabled = true;
      modelSel.disabled = true;
      setOptions(makeSel, [], "Make");
      setOptions(modelSel, [], "Model");
      return;
    }

    makeSel.disabled = true;
    setOptions(makeSel, [], "Loading makes…");
    modelSel.disabled = true;
    setOptions(modelSel, [], "Model");

    try {
      const makes = await loadMakes();
      setOptions(makeSel, makes, "Make");
      makeSel.disabled = false;
    } catch (err) {
      enableFallbackMode(err.message);
      updateSummary();
    }
  });

  makeSel.addEventListener("change", async () => {
    updateSummary();
    if (usingFallback) return;
    if (!makeSel.value || !yearSel.value) {
      modelSel.disabled = true;
      setOptions(modelSel, [], "Model");
      return;
    }

    modelSel.disabled = true;
    setOptions(modelSel, [], "Loading models…");

    try {
      const models = await loadModels(makeSel.value, yearSel.value);
      if (models.length === 0) {
        // No models found for this make/year — allow free text as a graceful fallback
        setOptions(modelSel, [], "Model not listed — type below");
        modelSel.disabled = true;
        fallbackRow.style.display = "grid";
        makeTextIn.style.display = "none"; // make is already known
        modelTextIn.placeholder = "Model (not listed)";
        fallbackHint.style.display = "block";
        fallbackHint.textContent = "We don't have exact models for this year/make — just type it in below.";
      } else {
        setOptions(modelSel, models, "Model");
        modelSel.disabled = false;
        fallbackRow.style.display = "none";
        fallbackHint.style.display = "none";
      }
    } catch (err) {
      enableFallbackMode(err.message);
      updateSummary();
    }
  });

  [modelSel, colorIn, plateIn, makeTextIn, modelTextIn].forEach((el) => {
    if (el) el.addEventListener("input", updateSummary);
    if (el) el.addEventListener("change", updateSummary);
  });

  // ── Init ────────────────────────────────────────
  buildYearOptions();

  // Pre-warm the makes list in the background so the first
  // year selection feels instant. If it fails, fallback mode
  // engages silently and the client never sees an error.
  loadMakes().catch((err) => enableFallbackMode(err.message));
})();
