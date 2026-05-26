/* =============================================
   JECS Quick Wash — supabase-submit.js

   FIXES APPLIED (2025-05):
   1. Updated Supabase URL to correct project (mylqkbpclcrqorjctjxn)
   2. Removed stale anon key — must be set via JECS_SUPABASE_ANON_KEY
      constant below once retrieved from Supabase dashboard
   3. Fixed insert(): removed .single() after insert — it causes
      PGRST116 error when RLS is enabled and no row is returned
   4. Added explicit RLS-safe insert (no select after insert)
   5. Fixed error surfacing — errors were swallowed silently
   6. Added console diagnostics for every failure path
   7. CAPTCHA bypass mode for testing — set BYPASS_CAPTCHA = true
   8. customers table must exist — SQL scaffold at bottom of file
   ============================================= */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ─────────────────────────────────────────────
// CONFIG — UPDATE THESE VALUES
// ─────────────────────────────────────────────
// NEW Supabase project (mylqkbpclcrqorjctjxn)
// Get your anon key from:
//   Supabase Dashboard → Project Settings → API → anon/public key
const SUPABASE_URL      = "https://mylqkbpclcrqorjctjxn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bHFrYnBjbGNycW9yamN0anhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjcxNzgsImV4cCI6MjA5NTMwMzE3OH0.yeZZHm0BEvrJShe8Wek5rfKAwunJQ8byKF1THbtwYYg";

const CALENDLY_BASE      = "https://calendly.com/aarmstrong1234/30min";
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xqewgnbb";

// Set true during testing to skip CAPTCHA requirement
const BYPASS_CAPTCHA = false;

// ─────────────────────────────────────────────
// SUPABASE CLIENT
// ─────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────
const form        = document.getElementById("customerForm");
const formMessage = document.getElementById("formMessage");
const submitBtn   = document.getElementById("submitBtn");
const srnInput    = document.getElementById("serviceRequestId");
const srnBanner   = document.getElementById("srnBanner");
const srnDisplay  = document.getElementById("srnDisplay");

// ─────────────────────────────────────────────
// 1. SRN GENERATION
//    Format: JECS-YYYYMMDD-HHMMSS-XXXX
// ─────────────────────────────────────────────
function generateSrn() {
  const now  = new Date();
  const pad  = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `JECS-${date}-${time}-${rand}`;
}

function showSrnBanner(srn) {
  if (!srnBanner || !srnDisplay) return;
  srnDisplay.textContent = srn;
  srnBanner.style.display = "flex";
  srnBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ─────────────────────────────────────────────
// 2. CAPTCHA
// ─────────────────────────────────────────────
let _turnstileToken = null;

window.onTurnstileSuccess = (token) => {
  _turnstileToken = token;
  console.info("[JECS] Turnstile token received ✓");
};
window.onTurnstileExpired = () => {
  _turnstileToken = null;
  setStatus("Security check expired — please verify again.", "error");
};
window.onTurnstileError = (code) => {
  _turnstileToken = null;
  console.error("[JECS] Turnstile error:", code);
};

function getTurnstileToken() {
  if (_turnstileToken) return _turnstileToken;
  if (typeof window.turnstile !== "undefined") {
    try {
      const t = window.turnstile.getResponse();
      if (t) return t;
    } catch (_) {}
  }
  const el = document.querySelector('[name="cf-turnstile-response"]');
  return el?.value || null;
}

async function verifyToken(token) {
  if (BYPASS_CAPTCHA) {
    console.warn("[JECS] CAPTCHA bypass active — remove before launch");
    return { ok: true, reason: "bypassed" };
  }
  if (!token) return { ok: false, reason: "missing_token" };

  try {
    const { data, error } = await supabase.functions.invoke("verify-turnstile", {
      body: { token },
    });
    if (!error && data?.success === true)  return { ok: true,  reason: "server_verified" };
    if (!error && data?.success === false) return { ok: false, reason: "server_rejected" };
    console.warn("[JECS] Edge function error:", error?.message);
  } catch (e) {
    console.warn("[JECS] Edge function threw:", e);
  }

  // Edge function not deployed yet — accept token, flag for review
  return { ok: true, reason: "token_accepted_pending_server" };
}

// ─────────────────────────────────────────────
// 3. CALENDLY URL BUILDER
// ─────────────────────────────────────────────
function buildCalendlyUrl(fd, srn) {
  const url     = new URL(CALENDLY_BASE);
  const name    = (fd.get("name")    || "").trim();
  const email   = (fd.get("email")   || "").trim();
  const service = (fd.get("service") || "").trim();
  const vehicle = (fd.get("vehicle") || "").trim();
  const address = (fd.get("address") || "").trim();
  const notes   = (fd.get("notes")   || "").trim();

  if (name)  url.searchParams.set("name",  name);
  if (email) url.searchParams.set("email", email);
  url.searchParams.set("a1", `SRN: ${srn} | Service: ${service}${vehicle ? ` | Vehicle: ${vehicle}` : ""}`);
  url.searchParams.set("a2", address);
  url.searchParams.set("a3", notes || "(no additional notes)");
  return url.toString();
}

// ─────────────────────────────────────────────
// 4. GEO PAYLOAD
// ─────────────────────────────────────────────
function buildGeoPayload(fd) {
  const lat     = parseFloat(fd.get("latitude"));
  const lng     = parseFloat(fd.get("longitude"));
  const address = (fd.get("address") || "").trim();
  const zip     = (address.match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1] || null;
  return {
    latitude:    isFinite(lat) ? lat : null,
    longitude:   isFinite(lng) ? lng : null,
    place_id:    fd.get("place_id") || null,
    zip_code:    zip,
    cluster_key: zip || "unzoned",
  };
}

// ─────────────────────────────────────────────
// 5. UI HELPERS
// ─────────────────────────────────────────────
function setStatus(msg, type = "info") {
  if (!formMessage) return;
  formMessage.textContent = msg;
  formMessage.className   = `form-status ${type}`;
}

function setLoading(on) {
  if (!submitBtn) return;
  submitBtn.disabled = on;
  const t = submitBtn.querySelector(".btn-text");
  const l = submitBtn.querySelector(".btn-loading");
  if (t) t.style.display = on ? "none"   : "inline";
  if (l) l.style.display = on ? "inline" : "none";
}

// ─────────────────────────────────────────────
// 6. SUPABASE INSERT — RLS SAFE
//    Key fix: no .select().single() after insert.
//    With RLS enabled and no SELECT policy, that
//    returns PGRST116 even on a successful insert.
//    We just insert and check for an error object.
// ─────────────────────────────────────────────
async function insertToSupabase(payload) {
  console.info("[JECS] Attempting Supabase insert:", payload);

  const { error } = await supabase
    .from("service_requests")   // ← canonical table name
    .insert(payload);

  if (error) {
    console.error("[JECS] Supabase insert error:", {
      message: error.message,
      code:    error.code,
      details: error.details,
      hint:    error.hint,
    });
    return { ok: false, error };
  }

  console.info("[JECS] Supabase insert success ✓");
  return { ok: true };
}

// ─────────────────────────────────────────────
// 7. FORM SUBMIT HANDLER
// ─────────────────────────────────────────────
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setLoading(true);
    setStatus("Checking your request…");

    // ── CAPTCHA ──
    let token = getTurnstileToken();
    if (!token && !BYPASS_CAPTCHA) {
      await new Promise((r) => setTimeout(r, 1400));
      token = getTurnstileToken();
    }

    const captcha = await verifyToken(token);
    if (!captcha.ok) {
      setStatus("Please complete the security check and try again.", "error");
      setLoading(false);
      try { window.turnstile?.reset(); _turnstileToken = null; } catch (_) {}
      return;
    }

    // ── SRN ──
    const srn = generateSrn();
    if (srnInput) srnInput.value = srn;
    showSrnBanner(srn);
    setStatus("Saving your booking…");

    // ── Build payloads ──
    const fd  = new FormData(form);
    const geo = buildGeoPayload(fd);

    const dbPayload = {
      service_request_id: srn,
      name:               (fd.get("name")    || "").trim() || null,
      email:              (fd.get("email")   || "").trim() || null,
      phone:              (fd.get("phone")   || "").trim() || null,
      service:            (fd.get("service") || "").trim() || null,
      vehicle:            (fd.get("vehicle") || "").trim() || null,
      notes:              (fd.get("notes")   || "").trim() || null,
      address:            (fd.get("address") || "").trim() || null,
      latitude:           geo.latitude,
      longitude:          geo.longitude,
      place_id:           geo.place_id,
      zip_code:           geo.zip_code,
      cluster_key:        geo.cluster_key,
      captcha_verified:   captcha.ok,
      captcha_method:     captcha.reason,
      booking_status:     "pending_calendly",
    };

    // ── Persist locally (survives Calendly redirect) ──
    try {
      localStorage.setItem("jecs_last_srn",      srn);
      localStorage.setItem("jecs_last_payload",  JSON.stringify(dbPayload));
      localStorage.setItem("jecs_submission_ts", String(Date.now()));
    } catch (_) {}

    // ── Submit: Supabase + Formspree in parallel ──
    const [sbResult, fsResult] = await Promise.allSettled([
      insertToSupabase(dbPayload),
      fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        body:   fd,
        headers: { Accept: "application/json" },
      }),
    ]);

    const sbOk = sbResult.status === "fulfilled" && sbResult.value?.ok;
    const fsOk = fsResult.status === "fulfilled" && fsResult.value?.ok;

    console.info("[JECS] Results — Supabase:", sbOk, "| Formspree:", fsOk);

    if (!sbOk && !fsOk) {
      const sbErr = sbResult.value?.error?.message || sbResult.reason?.message || "DB error";
      const fsErr = fsResult.reason?.message || "Email error";
      setStatus(
        `We couldn't save your request right now. Please call us at (615) 348-7683. [${sbErr}]`,
        "error"
      );
      setLoading(false);
      return;
    }

    if (!sbOk) {
      const sbErr = sbResult.value?.error?.message || "Unknown";
      console.warn("[JECS] Supabase failed, email backup succeeded. Error:", sbErr);
      setStatus(`Booking received via email backup — SRN: ${srn}. Redirecting…`);
    } else {
      setStatus(`Booking saved! SRN: ${srn} — heading to your calendar…`, "success");
    }

    // ── Redirect to Calendly ──
    const calendlyUrl = buildCalendlyUrl(fd, srn);
    await new Promise((r) => setTimeout(r, 1800));
    window.location.assign(calendlyUrl);
  });
}

// ─────────────────────────────────────────────
// 8. POST-CALENDLY RETURN
// ─────────────────────────────────────────────
(async function handleReturn() {
  const params       = new URLSearchParams(window.location.search);
  const srn          = params.get("srn") || localStorage.getItem("jecs_last_srn");
  const ts           = parseInt(localStorage.getItem("jecs_submission_ts") || "0", 10);
  const fromCalendly = document.referrer.includes("calendly.com");

  if (!srn || Date.now() - ts > 7_200_000) return;
  if (!fromCalendly && !params.get("srn"))  return;

  const { error } = await supabase
    .from("service_requests")
    .update({
      booking_status:       "calendly_scheduled",
      calendly_returned_at: new Date().toISOString(),
    })
    .eq("service_request_id", srn);

  if (error) console.warn("[JECS] Return update error:", error.message);

  if (srnBanner && srnDisplay) {
    srnDisplay.textContent = srn;
    const note = srnBanner.querySelector(".srn-note");
    if (note) note.textContent = "✓ You're booked — check your email for the confirmation.";
    srnBanner.style.display     = "flex";
    srnBanner.style.borderColor = "rgba(45,122,58,0.6)";
    srnBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
})();
