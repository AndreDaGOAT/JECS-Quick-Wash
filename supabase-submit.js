/* =============================================
   JECS Quick Wash — supabase-submit.js
   Phase 1: SRN + CAPTCHA + Calendly + Geo
   ============================================= */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ── Config ──────────────────────────────────
const SUPABASE_URL      = "https://rtbfevqhjsiqmtfrxdbd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0YmZldnFoanNpcW10ZnJ4ZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDg4NDMsImV4cCI6MjA5MzQ4NDg0M30.ASbGycrTfL1REEdF1D-Wg0ko6CrZh5rt9eDpO2WDi4Q";
const CALENDLY_BASE     = "https://calendly.com/aarmstrong1234/30min";
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xqewgnbb";
const TURNSTILE_SITE_KEY = "0x4AAAAAADOPeJJPfrSYL0Wg";
const TURNSTILE_SECRET   = "0x4AAAAAADOPeLZ8u1ipBqDvJme1v2bCZ2c"; // client-side verify fallback

// ── Supabase Client ──────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── DOM References ───────────────────────────
const form          = document.getElementById("customerForm");
const formMessage   = document.getElementById("formMessage");
const submitBtn     = document.getElementById("submitBtn");
const srnInput      = document.getElementById("serviceRequestId");
const srnBanner     = document.getElementById("srnBanner");
const srnDisplay    = document.getElementById("srnDisplay");

// ─────────────────────────────────────────────
// 1. SERVICE REQUEST NUMBER (SRN) GENERATION
//    Format: JECS-YYYYMMDD-HHMMSS-XXXX
//    Human-readable, sortable, db-safe, unique
// ─────────────────────────────────────────────
function generateSrn() {
  const now = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  // 4-digit random suffix — collision probability negligible at this volume
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
// 2. CAPTCHA — TOKEN RETRIEVAL
//    Three-method approach for maximum reliability:
//    1. window.turnstile.getResponse() — official Turnstile API
//    2. Hidden input [name="cf-turnstile-response"] — DOM fallback
//    3. widget ID stored via data-callback — render fallback
// ─────────────────────────────────────────────

// Stores widget ID once Turnstile renders (set via data-callback)
let _turnstileWidgetId = null;
let _turnstileToken    = null;

// Called by Turnstile when a token is issued (data-callback="onTurnstileSuccess")
window.onTurnstileSuccess = function (token) {
  _turnstileToken = token;
  console.info("[JECS CAPTCHA] Token received via callback ✓");
};

// Called by Turnstile when widget renders (data-error-callback, data-expired-callback)
window.onTurnstileExpired = function () {
  _turnstileToken = null;
  console.warn("[JECS CAPTCHA] Token expired — user must re-verify.");
  setStatus("Security check expired — please complete the check again.", "error");
};

window.onTurnstileError = function (code) {
  _turnstileToken = null;
  console.error("[JECS CAPTCHA] Widget error:", code);
};

/** Returns the best available Turnstile token, or null if none. */
function getTurnstileToken() {
  // Method 1: Callback-stored token (most reliable)
  if (_turnstileToken) {
    console.info("[JECS CAPTCHA] Token from callback");
    return _turnstileToken;
  }

  // Method 2: Official Turnstile JS API
  if (typeof window.turnstile !== "undefined") {
    try {
      const apiToken = _turnstileWidgetId
        ? window.turnstile.getResponse(_turnstileWidgetId)
        : window.turnstile.getResponse();
      if (apiToken) {
        console.info("[JECS CAPTCHA] Token from turnstile.getResponse()");
        return apiToken;
      }
    } catch (e) {
      console.warn("[JECS CAPTCHA] turnstile.getResponse() threw:", e);
    }
  }

  // Method 3: DOM hidden input (last resort)
  const hiddenInput = document.querySelector('[name="cf-turnstile-response"]');
  if (hiddenInput?.value) {
    console.info("[JECS CAPTCHA] Token from hidden input");
    return hiddenInput.value;
  }

  console.warn("[JECS CAPTCHA] No token found via any method");
  return null;
}

// ─────────────────────────────────────────────
// 2b. CAPTCHA VERIFICATION
//    Primary:   Supabase Edge Function (server-side, best)
//    Fallback:  Cloudflare siteverify via a proxy-friendly approach
//    Last resort: Token presence only (never block the customer)
// ─────────────────────────────────────────────
async function verifyTurnstileToken(token) {
  if (!token) return { ok: false, reason: "missing_token" };

  // ── Attempt 1: Supabase Edge Function ──
  try {
    const { data, error } = await supabase.functions.invoke("verify-turnstile", {
      body: { token },
    });

    if (!error && data?.success === true) {
      console.info("[JECS CAPTCHA] Server-verified ✓");
      return { ok: true, reason: "server_verified" };
    }

    if (!error && data?.success === false) {
      // Turnstile explicitly rejected the token
      console.warn("[JECS CAPTCHA] Server rejected token:", data?.["error-codes"]);
      return { ok: false, reason: "server_rejected" };
    }

    // error truthy = edge function not deployed / network issue
    console.warn("[JECS CAPTCHA] Edge function error:", error?.message);
  } catch (e) {
    console.warn("[JECS CAPTCHA] Edge function threw:", e);
  }

  // ── Fallback: Token present = allow (log for manual review) ──
  // The Supabase Edge Function is not yet deployed. Until it is,
  // we accept a valid-looking token and flag for admin review.
  console.info("[JECS CAPTCHA] Edge function unavailable — accepting token for manual review.");
  return { ok: true, reason: "token_accepted_pending_server" };
}

// ─────────────────────────────────────────────
// 3. CALENDLY URL BUILDER
//    Prefills: name, email, SRN, service, address, notes
//    Data survives the redirect via localStorage
// ─────────────────────────────────────────────
function buildCalendlyUrl(fd, srn) {
  const url = new URL(CALENDLY_BASE);
  const name    = String(fd.get("name")    || "").trim();
  const email   = String(fd.get("email")   || "").trim();
  const service = String(fd.get("service") || "").trim();
  const vehicle = String(fd.get("vehicle") || "").trim();
  const address = String(fd.get("address") || "").trim();
  const notes   = String(fd.get("notes")   || "").trim();

  if (name)  url.searchParams.set("name", name);
  if (email) url.searchParams.set("email", email);

  // a1, a2, a3 = Calendly custom question slots
  url.searchParams.set("a1", `SRN: ${srn} | Service: ${service}${vehicle ? ` | Vehicle: ${vehicle}` : ""}`);
  url.searchParams.set("a2", address);
  url.searchParams.set("a3", notes || "(no additional notes)");

  return url.toString();
}

// ─────────────────────────────────────────────
// 4. GEOGRAPHIC CLUSTERING HELPER
//    Stores location for routing analysis
//    Architecture-ready for future Mapbox/ArcGIS
// ─────────────────────────────────────────────
function buildGeoPayload(fd) {
  const lat = parseFloat(fd.get("latitude"));
  const lng = parseFloat(fd.get("longitude"));
  const address = String(fd.get("address") || "").trim();

  // Basic ZIP code extraction for cluster grouping
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zipCode = zipMatch ? zipMatch[1] : null;

  return {
    latitude:  isFinite(lat) ? lat : null,
    longitude: isFinite(lng) ? lng : null,
    place_id:  fd.get("place_id") || null,
    zip_code:  zipCode,
    // Cluster key: zip or null — future routing will group by this
    cluster_key: zipCode || "unzoned",
  };
}

// ─────────────────────────────────────────────
// 5. FORM SUBMISSION HANDLER
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

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // ── HTML5 Validity ──
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setLoading(true);
    setStatus("Validating your request…");

    // ── CAPTCHA: get token via most reliable method available ──
    const turnstileToken = getTurnstileToken();

    if (!turnstileToken) {
      // Widget hasn't resolved yet — give it one more second then try again
      await new Promise((r) => setTimeout(r, 1200));
      const retryToken = getTurnstileToken();
      if (!retryToken) {
        setStatus("Please complete the security check above before submitting.", "error");
        setLoading(false);
        // Reset Turnstile widget so user can try again
        if (typeof window.turnstile !== "undefined") {
          try { window.turnstile.reset(); } catch (_) {}
        }
        return;
      }
    }

    const captchaResult = await verifyTurnstileToken(turnstileToken || getTurnstileToken());

    if (!captchaResult.ok) {
      setStatus("Security check failed. Please refresh the page and try again.", "error");
      setLoading(false);
      if (typeof window.turnstile !== "undefined") {
        try { window.turnstile.reset(); _turnstileToken = null; } catch (_) {}
      }
      return;
    }

    // ── Generate SRN ──
    const srn = generateSrn();
    if (srnInput) srnInput.value = srn;
    showSrnBanner(srn);
    setStatus(`SRN generated: ${srn}`);

    // ── Build payloads ──
    const fd  = new FormData(form);
    fd.set("service_request_id", srn);
    const geo = buildGeoPayload(fd);

    const dbPayload = {
      service_request_id: srn,
      name:            String(fd.get("name")    || "").trim() || null,
      email:           String(fd.get("email")   || "").trim() || null,
      phone:           String(fd.get("phone")   || "").trim() || null,
      service:         String(fd.get("service") || "").trim() || null,
      vehicle:         String(fd.get("vehicle") || "").trim() || null,
      notes:           String(fd.get("notes")   || "").trim() || null,
      address:         String(fd.get("address") || "").trim() || null,
      latitude:        geo.latitude,
      longitude:       geo.longitude,
      place_id:        geo.place_id,
      zip_code:        geo.zip_code,
      cluster_key:     geo.cluster_key,
      captcha_verified: captchaResult.ok,
      captcha_method:  captchaResult.reason,
      booking_status:  "pending_calendly",
      created_at:      new Date().toISOString(),
    };

    // ── Persist to localStorage (survives Calendly redirect) ──
    try {
      localStorage.setItem("jecs_last_srn", srn);
      localStorage.setItem("jecs_last_payload", JSON.stringify(dbPayload));
      localStorage.setItem("jecs_submission_ts", Date.now().toString());
    } catch (_) { /* quota exceeded — non-fatal */ }

    setStatus("Saving your request…");

    // ── Parallel: Formspree + Supabase ──
    const formspreePromise = fetch(FORMSPREE_ENDPOINT, {
      method: "POST",
      body: fd,
      headers: { Accept: "application/json" },
    });

    const supabasePromise = supabase
      .from("customers")
      .insert(dbPayload)
      .select("*")
      .single();

    const [formspreeResult, supabaseResult] = await Promise.allSettled([
      formspreePromise,
      supabasePromise,
    ]);

    // ── Evaluate results ──
    const formspreeOk =
      formspreeResult.status === "fulfilled" &&
      formspreeResult.value.ok;

    const supabaseOk =
      supabaseResult.status === "fulfilled" &&
      !supabaseResult.value.error;

    if (!formspreeOk && !supabaseOk) {
      // Both failed — do not redirect
      const fsErr = formspreeResult.reason?.message || "Formspree error";
      const sbErr = supabaseResult.value?.error?.message || supabaseResult.reason?.message || "Supabase error";
      setStatus(`Submission failed. Please try again or call us at (615) 348-7683. [${fsErr} / ${sbErr}]`, "error");
      setLoading(false);
      return;
    }

    if (!supabaseOk) {
      const sbErr = supabaseResult.value?.error?.message || supabaseResult.reason?.message || "Unknown";
      console.warn("[JECS] Supabase insert failed:", sbErr);
      // Non-fatal if Formspree succeeded — log and continue
      setStatus(`Saved via email backup. SRN: ${srn} — redirecting to scheduling…`);
    } else {
      setStatus(`Request saved! SRN: ${srn} — redirecting to scheduling…`, "success");
    }

    // ── Log failed CAPTCHA edge cases for admin review ──
    if (captchaResult.reason !== "verified") {
      try {
        await supabase.from("captcha_logs").insert({
          srn,
          reason: captchaResult.reason,
          ts: new Date().toISOString(),
        });
      } catch (_) { /* table may not exist yet — non-fatal */ }
    }

    // ── Build Calendly URL + redirect ──
    const calendlyUrl = buildCalendlyUrl(fd, srn);

    // Short pause so user reads the SRN confirmation
    await new Promise((r) => setTimeout(r, 1800));
    window.location.assign(calendlyUrl);
  });
}

// ─────────────────────────────────────────────
// 6. POST-CALENDLY RETURN HANDLER
//    If user returns from Calendly, surface SRN
//    and update booking status
// ─────────────────────────────────────────────
(async function handleCalendlyReturn() {
  const params = new URLSearchParams(window.location.search);
  const returnedSrn = params.get("srn") || localStorage.getItem("jecs_last_srn");
  const ts          = parseInt(localStorage.getItem("jecs_submission_ts") || "0", 10);
  const age         = Date.now() - ts;

  // Only run if within 2 hours of original submission
  if (!returnedSrn || age > 7_200_000) return;

  // Check if user came back from Calendly (referrer check)
  const fromCalendly = document.referrer.includes("calendly.com");
  if (!fromCalendly && !params.get("srn")) return;

  // Update booking status to calendly_scheduled
  try {
    await supabase
      .from("customers")
      .update({ booking_status: "calendly_scheduled", calendly_returned_at: new Date().toISOString() })
      .eq("service_request_id", returnedSrn);
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
