/* =============================================
   JECS Quick Wash — vehicle-picker.js  v2.0
   Guided vehicle entry: Year → Make → Model,
   plus Color and License Plate.

   Make and Model use searchable autocomplete
   inputs — user types to filter, clicks to
   select — instead of long <select> dropdowns.

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
  const NHTSA_BASE       = "https://vpic.nhtsa.dot.gov/api/vehicles";
  const FETCH_TIMEOUT_MS = 5000;

  function init() {
    const yearSel      = document.getElementById("vp_year");
    const makeSel      = document.getElementById("vp_make");
    const modelSel     = document.getElementById("vp_model");
    const colorIn      = document.getElementById("vp_color");
    const plateIn      = document.getElementById("vp_plate");
    const fallbackRow  = document.getElementById("vp_fallback_row");
    const fallbackHint = document.getElementById("vp_fallback_hint");
    const makeTextIn   = document.getElementById("vp_make_text");
    const modelTextIn  = document.getElementById("vp_model_text");
    const summaryField = document.getElementById("vehicleTypeSummary");

    if (!yearSel || !makeSel || !modelSel) return;

    // Remove disabled so createAutocomplete can work with them
    makeSel.removeAttribute("disabled");
    modelSel.removeAttribute("disabled");

  let usingFallback = false;
  let makesCache    = null;

  /* ── Autocomplete widget ──────────────────────────────────────────────────
     Replaces a <select> with a styled text input + filtered dropdown list.
     Returns a control object: getValue / setItems / clear / disable / enable
  ── */
  function createAutocomplete(originalSelect, placeholder) {
    originalSelect.style.display = "none";

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative;display:inline-block;width:100%;";
    originalSelect.parentNode.insertBefore(wrapper, originalSelect);
    wrapper.appendChild(originalSelect);

    const input = document.createElement("input");
    input.type         = "text";
    input.placeholder  = placeholder;
    input.autocomplete = "off";
    input.setAttribute("aria-label", placeholder);
    input.style.cssText = "width:100%;box-sizing:border-box;";
    wrapper.insertBefore(input, originalSelect);

    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = originalSelect.name;
    originalSelect.removeAttribute("name");
    wrapper.appendChild(hidden);

    const list = document.createElement("ul");
    list.style.cssText = [
      "position:absolute","top:100%","left:0","right:0","z-index:9999",
      "max-height:220px","overflow-y:auto","margin:0","padding:0",
      "list-style:none","background:#fff","border:1px solid #ccc",
      "border-top:none","border-radius:0 0 6px 6px",
      "box-shadow:0 4px 12px rgba(0,0,0,.15)","display:none",
    ].join(";");
    wrapper.appendChild(list);

    let allItems  = [];
    let disabled  = true;

    function renderList(items) {
      list.innerHTML = "";
      if (!items.length) { list.style.display = "none"; return; }
      items.slice(0, 80).forEach(function(item) {
        const li = document.createElement("li");
        li.textContent = item;
        li.style.cssText = "padding:9px 12px;cursor:pointer;font-size:14px;border-bottom:1px solid #f0f0f0;";
        li.addEventListener("mouseover", function(){ li.style.background="#f5f7fa"; });
        li.addEventListener("mouseout",  function(){ li.style.background=""; });
        li.addEventListener("mousedown", function(e){
          e.preventDefault();
          confirm(item);
        });
        list.appendChild(li);
      });
      list.style.display = "block";
    }

    function confirm(item) {
      input.value  = item;
      hidden.value = item;
      list.style.display = "none";
      input.dispatchEvent(new Event("vp:selected", { bubbles: true }));
    }

    function filter() {
      if (disabled) return;
      const q = input.value.trim().toLowerCase();
      if (!q) { list.style.display = "none"; return; }
      renderList(allItems.filter(function(i){ return i.toLowerCase().includes(q); }));
    }

    input.addEventListener("input", function(){
      hidden.value = "";
      filter();
      input.dispatchEvent(new Event("vp:cleared", { bubbles: true }));
    });
    input.addEventListener("focus", filter);
    input.addEventListener("blur",  function(){ setTimeout(function(){ list.style.display="none"; }, 180); });
    input.addEventListener("keydown", function(e){
      const items  = list.querySelectorAll("li");
      const active = list.querySelector("li.vp-hi");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nxt = active ? (active.nextSibling || items[0]) : items[0];
        if (active){ active.classList.remove("vp-hi"); active.style.background=""; }
        if (nxt)   { nxt.classList.add("vp-hi");       nxt.style.background="#f5f7fa"; nxt.scrollIntoView({block:"nearest"}); }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prv = active ? (active.previousSibling || items[items.length-1]) : items[items.length-1];
        if (active){ active.classList.remove("vp-hi"); active.style.background=""; }
        if (prv)   { prv.classList.add("vp-hi");       prv.style.background="#f5f7fa"; prv.scrollIntoView({block:"nearest"}); }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (active) confirm(active.textContent);
      } else if (e.key === "Escape") {
        list.style.display = "none";
      }
    });

    return {
      input:     input,
      getValue:  function(){ return hidden.value; },
      setItems:  function(items){ allItems = items; },
      clear:     function(){ input.value=""; hidden.value=""; list.style.display="none"; allItems=[]; },
      disable:   function(msg){ disabled=true;  input.disabled=true;  input.placeholder=msg||placeholder; list.style.display="none"; },
      setStatus: function(msg){ disabled=true;  input.disabled=true;  input.placeholder=msg; },
      enable:    function()   { disabled=false; input.disabled=false; input.placeholder=placeholder; },
    };
  }

  /* ── Build widgets ── */
  const makeAC  = createAutocomplete(makeSel,  "Type to search make\u2026");
  const modelAC = createAutocomplete(modelSel, "Type to search model\u2026");
  makeAC.disable("Select a year first");
  modelAC.disable("Select a make first");

  /* ── Helpers ── */
  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function(_,rej){
      setTimeout(function(){ rej(new Error("timeout")); }, ms);
    })]);
  }
  function fetchJson(url) {
    return withTimeout(fetch(url, {headers:{Accept:"application/json"}}), FETCH_TIMEOUT_MS)
      .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); });
  }
  function loadMakes() {
    if (makesCache) return Promise.resolve(makesCache);
    return fetchJson(NHTSA_BASE+"/GetAllMakes?format=json").then(function(data){
      var names = (data.Results||[]).map(function(r){return r.Make_Name;}).filter(Boolean)
        .sort(function(a,b){return a.localeCompare(b);});
      makesCache = names.filter(function(v,i,a){return a.indexOf(v)===i;});
      return makesCache;
    });
  }
  function loadModels(make, year) {
    var url = NHTSA_BASE+"/GetModelsForMakeYear/make/"+encodeURIComponent(make)+"/modelyear/"+encodeURIComponent(year)+"?format=json";
    return fetchJson(url).then(function(data){
      var names = (data.Results||[]).map(function(r){return r.Model_Name;}).filter(Boolean)
        .sort(function(a,b){return a.localeCompare(b);});
      return names.filter(function(v,i,a){return a.indexOf(v)===i;});
    });
  }
  function enableFallbackMode(reason) {
    if (usingFallback) return;
    usingFallback = true;
    console.warn("[JECS Vehicle Picker] Fallback:", reason);
    makeAC.disable("API unavailable");
    modelAC.disable("API unavailable");
    if (fallbackRow)  fallbackRow.style.display  = "grid";
    if (fallbackHint) fallbackHint.style.display = "block";
  }
  function buildYearOptions() {
    var cur = new Date().getFullYear() + 1;
    yearSel.innerHTML = '<option value="">Year</option>';
    for (var y = cur; y >= 1990; y--) {
      var o = document.createElement("option");
      o.value = o.textContent = String(y);
      yearSel.appendChild(o);
    }
  }
  function updateSummary() {
    var year  = yearSel.value || "";
    var make  = usingFallback ? (makeTextIn  ? makeTextIn.value.trim()  : "") : (makeAC.getValue()  || "");
    var model = usingFallback ? (modelTextIn ? modelTextIn.value.trim() : "") : (modelAC.getValue() || "");
    var color = colorIn ? colorIn.value.trim() : "";
    summaryField.value = [year, color, make, model].filter(Boolean).join(" ").trim();
  }

  /* ── Event wiring ── */
  yearSel.addEventListener("change", function(){
    updateSummary();
    if (usingFallback) return;
    makeAC.clear();
    modelAC.clear();
    if (!yearSel.value) {
      makeAC.disable("Select a year first");
      modelAC.disable("Select a make first");
      return;
    }
    makeAC.setStatus("Loading makes\u2026");
    modelAC.disable("Select a make first");
    loadMakes().then(function(makes){
      makeAC.setItems(makes);
      makeAC.enable();
    }).catch(function(err){ enableFallbackMode(err.message); updateSummary(); });
  });

  makeAC.input.addEventListener("vp:selected", function(){
    var make = makeAC.getValue();
    modelAC.clear();
    updateSummary();
    if (!make || !yearSel.value) return;
    modelAC.setStatus("Loading models\u2026");
    loadModels(make, yearSel.value).then(function(models){
      if (!models.length) {
        modelAC.disable("No models found \u2014 type below");
        if (fallbackRow)  fallbackRow.style.display  = "grid";
        if (makeTextIn)   makeTextIn.style.display   = "none";
        if (modelTextIn)  modelTextIn.placeholder    = "Model (not listed)";
        if (fallbackHint) { fallbackHint.style.display="block"; fallbackHint.textContent="No exact models found \u2014 just type yours below."; }
      } else {
        modelAC.setItems(models);
        modelAC.enable();
        if (fallbackRow)  fallbackRow.style.display  = "none";
        if (fallbackHint) fallbackHint.style.display = "none";
      }
    }).catch(function(err){ enableFallbackMode(err.message); updateSummary(); });
  });

  makeAC.input.addEventListener("vp:cleared", function(){
    modelAC.clear();
    modelAC.disable("Select a make first");
    updateSummary();
  });

  modelAC.input.addEventListener("vp:selected", updateSummary);
  modelAC.input.addEventListener("vp:cleared",  updateSummary);

  [colorIn, plateIn, makeTextIn, modelTextIn].forEach(function(el){
    if (el) { el.addEventListener("input", updateSummary); el.addEventListener("change", updateSummary); }
  });

  /* ── Init ── */
  buildYearOptions();
  loadMakes().catch(function(err){ enableFallbackMode(err.message); });

  } // end init()

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
