/* =============================================
   JECS Quick Wash — supabase-submit.js
   Phase 2: Multi-table insert flow
   Tables: customers → vehicles → service_requests
   + captcha_logs
   ============================================= */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ── Config ──────────────────────────────────
const SUPABASE_URL      = "https://mylqkbpclcrqorjctjxn.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bHFrYnBjbGNycW9yamN0anhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjcxNzgsImV4cCI6MjA5NTMwMzE3OH0.yeZZHm0BEvrJShe8Wek5rfKAwunJQ8byKF1THbtwYYg";
const CALENDLY_BASE     = "https://calendly.com/aarmstrong1234/30min";
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xqewgnbb";

// ── Supabase Client ──────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── DOM References ───────────────────────────
const form        = document.getElementById("customerForm");
const formMessage = document.getElementById("formMessage");
const submitBtn   = document.getElementById("submitBtn");
const srnInput    = document.getElementById("serviceRequestId");
const srnBanner   = document.getElementById("srnBanner");
const srnDisplay  = document.getElementById("srnDisplay");

// ─────────────────────────────────────────────
// 1. SERVICE REQUEST NUMBER (SRN) GENERATION
//    Format: JECS-YYYYMMDD-HHMMSS-XXXX
// ─────────────────────────────────────────────
function generateSrn() {
  const now  = new Date();
  const pad  = (n, w = 2) => String(n).padStart(w, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand4 = Math.floor(1000 + Math.random() * 9000);
  return `JECS-${date}-${time}-${rand4}`;
}

function showSrnBanner(srn) {
  if (!srnBanner || !srnDisplay) return;
  srnDisplay.textContent = srn;
  srnBanner.style.display = "flex";
  srnBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ─────────────────────────────────────────────
// 2. CAPTCHA VERIFICATION
// ─────────────────────────────────────────────
async function verifyTurnstile(token) {
  if (!token) return { ok: false, reason: "missing_token" };

  try {
    const { data, error } = await supabase.functions.invoke("verify-turnstile", {
      body: { token },
    });

    if (error) {
      console.warn("[JECS CAPTCHA] Edge function unavailable:", error.message);
      return { ok: true, reason: "edge_unavailable", token };
    }

    if (!data?.success) {
      console.warn("[JECS CAPTCHA] Verification failed:", data);
      return { ok: false, reason: "verification_failed" };
    }

    return { ok: true, reason: "verified" };
  } catch (err) {
    console.error("[JECS CAPTCHA] Unexpected error:", err);
    return { ok: true, reason: "edge_unavailable", token };
  }
}

// ─────────────────────────────────────────────
// 3. CALENDLY URL BUILDER
// ─────────────────────────────────────────────
function buildCalendlyUrl(fd, srn) {
  const url     = new URL(CALENDLY_BASE);
  const name    = String(fd.get("full_name")         || "").trim();
  const email   = String(fd.get("email")             || "").trim();
  const service = String(fd.get("package_id")        || "").trim();
  const vehicle = String(fd.get("vehicle_type")      || "").trim();
  const address = String(fd.get("formatted_address") || "").trim();
  const notes   = String(fd.get("special_notes")     || "").trim();

  if (name)  url.searchParams.set("name", name);
  if (email) url.searchParams.set("email", email);

  url.searchParams.set("a1", `SRN: ${srn} | Service: ${service}${vehicle ? ` | Vehicle: ${vehicle}` : ""}`);
  url.searchParams.set("a2", address);
  url.searchParams.set("a3", notes || "(no additional notes)");

  return url.toString();
}

// ─────────────────────────────────────────────
// 4. GEO / CLUSTER HELPER
//    cluster_key groups requests by ZIP for
//    efficient route dispatch
// ─────────────────────────────────────────────
function buildGeoPayload(fd) {
  const lat     = parseFloat(fd.get("latitude"));
  const lng     = parseFloat(fd.get("longitude"));
  const address = String(fd.get("address") || "").trim();
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zipCode  = zipMatch ? zipMatch[1] : null;

  return {
    latitude:    isFinite(lat) ? lat : null,
    longitude:   isFinite(lng) ? lng : null,
    place_id:    fd.get("place_id") || null,
    zip_code:    zipCode,
    cluster_key: zipCode || "unzoned",
  };
}

// ─────────────────────────────────────────────
// 5. PACKAGE LOOKUP
//    Resolves the human-readable service selection
//    to a package_id UUID from service_packages
// ─────────────────────────────────────────────

// Maps form select values to package_name values in service_packages table
const SERVICE_PACKAGE_MAP = {
  "quick-wash":   "Quick Wash",
  "wash-vacuum":  "Wash + Vacuum",
  "fleet":        "Fleet Service",
};

async function resolvePackageId(serviceValue) {
  const packageName = SERVICE_PACKAGE_MAP[serviceValue];
  if (!packageName) return null;

  const { data, error } = await supabase
    .from("service_packages")
    .select("package_id")
    .eq("package_name", packageName)
    .single();

  if (error || !data) {
    console.warn("[JECS] Could not resolve package_id for:", serviceValue, error?.message);
    return null;
  }

  return data.package_id;
}

// ─────────────────────────────────────────────
// 6. UI HELPERS
// ─────────────────────────────────────────────
function setStatus(msg, type = "info") {
  if (!formMessage) return;
  formMessage.textContent = msg;
  formMessage.className = `form-status ${type}`;
}

function setLoading(loading) {
  if (!submitBtn) return;
  const textEl    = submitBtn.querySelector(".btn-text");
  const loadingEl = submitBtn.querySelector(".btn-loading");
  submitBtn.disabled = loading;
  if (textEl)    textEl.style.display    = loading ? "none" : "inline";
  if (loadingEl) loadingEl.style.display = loading ? "inline" : "none";
}

// ─────────────────────────────────────────────
// 7. FORM SUBMISSION HANDLER
//    Step 1 → insert customers
//    Step 2 → insert vehicles
//    Step 3 → insert service_requests
// ─────────────────────────────────────────────
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setLoading(true);
    setStatus("Validating your request…");

    // ── CAPTCHA ──
    const turnstileToken = form.querySelector('[name="cf-turnstile-response"]')?.value;
    const captchaResult  = await verifyTurnstile(turnstileToken);

    if (!captchaResult.ok) {
      setStatus("CAPTCHA validation failed. Please refresh and try again.", "error");
      setLoading(false);
      return;
    }

    // ── Generate SRN ──
    const srn = generateSrn();
    if (srnInput) srnInput.value = srn;
    showSrnBanner(srn);
    setStatus(`SRN generated: ${srn}`);

    // ── Collect form data ──
    const fd  = new FormData(form);
    const geo = buildGeoPayload(fd);

   const name    = String(fd.get("full_name")         || "").trim() || null;
   const email   = String(fd.get("email")             || "").trim() || null;
   const phone   = String(fd.get("phone_number")      || "").trim() || null;
   const address = String(fd.get("formatted_address") || "").trim() || null;
   const service = String(fd.get("package_id")        || "").trim() || null;
   const vehicle = String(fd.get("vehicle_type")      || "").trim() || null;
   const notes   = String(fd.get("special_notes")     || "").trim() || null;

    // ── Persist to localStorage (survives Calendly redirect) ──
    try {
      localStorage.setItem("jecs_last_srn", srn);
      localStorage.setItem("jecs_submission_ts", Date.now().toString());
      localStorage.setItem("jecs_last_payload", JSON.stringify({
        srn, name, email, phone, address, service, vehicle, notes, geo,
      }));
    } catch (_) { /* quota exceeded — non-fatal */ }

    setStatus("Saving your request…");

    // ── Parallel: Formspree backup ──
    const formspreePromise = fetch(FORMSPREE_ENDPOINT, {
      method: "POST",
      body: fd,
      headers: { Accept: "application/json" },
    });

    // ────────────────────────────────────────
    // STEP 1 — Insert into customers
    // ────────────────────────────────────────
    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .insert({
        full_name:         name,
        email:             email,
        phone_number:      phone,
        formatted_address: address,
        google_place_id:   geo.place_id,
        zip_code:          geo.zip_code,
        latitude:          geo.latitude,
        longitude:         geo.longitude,
        created_at:        new Date().toISOString(),
      })
      .select("customer_id")
      .single();

    if (customerError || !customerData) {
      console.error("[JECS] customers insert failed:", customerError?.message);
      setStatus("Submission failed at customer step. Please try again or call (615) 348-7683.", "error");
      setLoading(false);
      return;
    }

    const customerId = customerData.customer_id;

    // ────────────────────────────────────────
    // STEP 2 — Insert into vehicles
    // ────────────────────────────────────────
    let vehicleId = null;

    if (vehicle) {
      const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicles")
        .insert({
          customer_id:  customerId,
          vehicle_type: vehicle,
          created_at:   new Date().toISOString(),
        })
        .select("vehicle_id")
        .single();

      if (vehicleError || !vehicleData) {
        console.warn("[JECS] vehicles insert failed:", vehicleError?.message);
        // Non-fatal — service request can proceed without vehicle_id
      } else {
        vehicleId = vehicleData.vehicle_id;
      }
    }

    // ────────────────────────────────────────
    // STEP 3 — Resolve package_id + Insert into service_requests
    // ────────────────────────────────────────
    const packageId = await resolvePackageId(service);

    const { data: srData, error: srError } = await supabase
      .from("service_requests")
      .insert({
        service_request_number: srn,
        customer_id:            customerId,
        vehicle_id:             vehicleId,
        package_id:             packageId,
        special_notes:          notes,
        status:                 "pending_calendly",
        cluster_key:            geo.cluster_key,
        requested_date:         new Date().toISOString().split("T")[0],
        created_at:             new Date().toISOString(),
      })
      .select("request_id")
      .single();

    if (srError || !srData) {
      console.error("[JECS] service_requests insert failed:", srError?.message);
      setStatus("Submission failed at request step. Please try again or call (615) 348-7683.", "error");
      setLoading(false);
      return;
    }

    // ── Evaluate Formspree result ──
    const formspreeResult = await Promise.allSettled([formspreePromise]);
    const formspreeOk = formspreeResult[0].status === "fulfilled" && formspreeResult[0].value.ok;
    if (!formspreeOk) {
      console.warn("[JECS] Formspree backup failed — Supabase succeeded, continuing.");
    }

    // ────────────────────────────────────────
    // CAPTCHA LOG — only for non-verified cases
    // ────────────────────────────────────────
    if (captchaResult.reason !== "verified") {
      try {
        await supabase.from("captcha_logs").insert({
          id:               crypto.randomUUID(),
          srn:              srn,
          reason:           captchaResult.reason,
          captcha_verified: captchaResult.ok,
          captcha_method:   captchaResult.reason,
          ts:               new Date().toISOString(),
        });
      } catch (_) { /* non-fatal */ }
    }

    setStatus(`Request saved! SRN: ${srn} — redirecting to scheduling…`, "success");

    // ── Build Calendly URL + redirect ──
    const calendlyUrl = buildCalendlyUrl(fd, srn);
    await new Promise((r) => setTimeout(r, 1800));
    window.location.assign(calendlyUrl);
  });
}

// ─────────────────────────────────────────────
// 8. POST-CALENDLY RETURN HANDLER
//    Updates service_requests.status on return
// ─────────────────────────────────────────────
(async function handleCalendlyReturn() {
  const params      = new URLSearchParams(window.location.search);
  const returnedSrn = params.get("srn") || localStorage.getItem("jecs_last_srn");
  const ts          = parseInt(localStorage.getItem("jecs_submission_ts") || "0", 10);
  const age         = Date.now() - ts;

  if (!returnedSrn || age > 7_200_000) return;

  const fromCalendly = document.referrer.includes("calendly.com");
  if (!fromCalendly && !params.get("srn")) return;

  // Update status on service_requests (correct table)
  try {
    await supabase
      .from("service_requests")
      .update({ status: "calendly_scheduled" })
      .eq("service_request_number", returnedSrn);
  } catch (_) { /* non-fatal */ }

  // Show confirmation banner
  if (srnBanner && srnDisplay) {
    srnDisplay.textContent = returnedSrn;
    const srnNote = srnBanner.querySelector(".srn-note");
    if (srnNote) srnNote.textContent = "✓ Scheduling complete — check your email for confirmation.";
    srnBanner.style.display = "flex";
    srnBanner.style.borderColor = "rgba(45,122,58,0.6)";
    srnBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
})();
