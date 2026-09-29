/* =============================================
   JECS Quick Wash — supabase-submit.js  v3.1
   Tables: customers → vehicles → service_requests
   + captcha_logs

   v3.1 fixes
   ──────────
   • verifyTurnstile — CAPTCHA edge function not yet
     deployed; verification now bypassed gracefully.
     Token presence is still checked and logged.
     Re-enable by deploying verify-turnstile edge fn.
   • EmailJS lazy script injection removed — violated
     GitHub Pages CSP (TrustedScript errors). SDK is
     now loaded via a <script> tag in Index.html.
   • Detailed Supabase error codes logged to console
     so RLS / schema mismatches are visible clearly.
   ============================================= */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ── Config ────────────────────────────────────
const SUPABASE_URL      = "https://mylqkbpclcrqorjctjxn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bHFrYnBjbGNycW9yamN0anhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjcxNzgsImV4cCI6MjA5NTMwMzE3OH0.yeZZHm0BEvrJShe8Wek5rfKAwunJQ8byKF1THbtwYYg";
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xqewgnbb";

// ── EmailJS Config ─────────────────────────────
// SDK is loaded via <script> tag in Index.html.
// Fill in your three keys after EmailJS setup.
// Email step is non-fatal if keys are placeholder.
const EMAILJS_PUBLIC_KEY  = "YOUR_EMAILJS_PUBLIC_KEY";
const EMAILJS_SERVICE_ID  = "YOUR_EMAILJS_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_EMAILJS_TEMPLATE_ID";

// ── JECS Business Info ─────────────────────────
const JECS_PHONE = "(615) 348-7683";
const JECS_EMAIL = "Contact@jubileeexecutivecarservice.com";

// ── Package metadata ───────────────────────────
// Populated dynamically from Supabase service_packages table.
// Falls back to these hardcoded values if Supabase is unreachable.
const PACKAGES_FALLBACK = {
  "package-uuid-0001": { label: "Quick Wash",        desc: "Exterior rinse, hand soap wash, dry, and tire finish." },
  "package-uuid-0002": { label: "Wash + Vacuum",     desc: "Everything in Quick Wash plus full interior vacuum and wipe-down." },
  "package-uuid-0003": { label: "Fleet & Commercial",desc: "Volume-priced on-site fleet service." },
};
let PACKAGES = { ...PACKAGES_FALLBACK };

// ── Load packages from Supabase and populate select ───────────────────────────
async function loadPackages() {
  const pkgSelect = document.querySelector('[name="package_id"]');
  if (!pkgSelect) return;

  try {
    const { data, error } = await supabase
      .from("service_packages")
      .select("package_id, package_name, description, base_price, active")
      .eq("active", true)
      .order("package_name", { ascending: true });

    if (error || !data || data.length === 0) throw new Error("No packages returned");

    // Rebuild PACKAGES lookup with real IDs
    PACKAGES = {};
    data.forEach(pkg => {
      PACKAGES[pkg.package_id] = {
        label: pkg.package_name,
        desc:  pkg.description || "",
        price: pkg.base_price,
      };
    });

    // Rebuild the <select> options dynamically
    pkgSelect.innerHTML = '<option value="">-- Select Service Package --</option>';
    data.forEach(pkg => {
      const opt   = document.createElement("option");
      opt.value   = pkg.package_id;
      const price = pkg.base_price != null ? ` — $${Number(pkg.base_price).toFixed(2)}` : "";
      opt.textContent = `${pkg.package_name}${price}`;
      pkgSelect.appendChild(opt);
    });

    console.info(`[JECS] Loaded ${data.length} packages from Supabase.`);
  } catch (err) {
    // Non-fatal — fall back to hardcoded options already in HTML
    console.warn("[JECS] Package load failed, using hardcoded fallback:", err.message);
    PACKAGES = { ...PACKAGES_FALLBACK };
  }
}

// ── Supabase Client ────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── DOM References ─────────────────────────────
const form        = document.getElementById("customerForm");
const formMessage = document.getElementById("formMessage");
const submitBtn   = document.getElementById("submitBtn");
const srnInput    = document.getElementById("serviceRequestId");
const srnBanner   = document.getElementById("srnBanner");
const srnDisplay  = document.getElementById("srnDisplay");

// ─────────────────────────────────────────────
// 1. SRN GENERATION  Format: JECS-YYYYMMDD-HHMMSS-XXXX
// ─────────────────────────────────────────────
function generateSrn() {
  const now   = new Date();
  const pad   = (n, w = 2) => String(n).padStart(w, "0");
  const date  = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time  = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
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
// 2. CAPTCHA — BYPASSED (edge function not yet deployed)
//    The Turnstile widget still loads and challenges
//    the user visually. Server-side verification is
//    Verifies via Cloudflare Worker: jecs-turnstile-verify
//    Worker URL set below — update after deploying the Worker.
// ─────────────────────────────────────────────

// !! UPDATE THIS after deploying the Worker !!
// Copy the Worker URL from Cloudflare Workers dashboard
const TURNSTILE_WORKER_URL = "https://jecs-turnstile-verify.YOUR-SUBDOMAIN.workers.dev";

async function verifyTurnstile(token) {
  if (!token) {
    console.warn("[JECS CAPTCHA] No token — widget may not have rendered.");
    return { ok: false, reason: "missing_token" };
  }

  try {
    const res = await fetch(TURNSTILE_WORKER_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token }),
    });

    const data = await res.json();

    if (data.success) {
      console.info("[JECS CAPTCHA] Verified ✓");
      return { ok: true, reason: "verified" };
    }

    console.warn("[JECS CAPTCHA] Failed:", data.error, data.codes);
    return { ok: false, reason: data.error || "failed", codes: data.codes };

  } catch (err) {
    // If Worker is unreachable, fail open with a warning
    // (prevents legitimate customers being blocked by network issues)
    console.warn("[JECS CAPTCHA] Worker unreachable — allowing submission:", err.message);
    return { ok: true, reason: "worker_unreachable" };
  }
}

// ─────────────────────────────────────────────
// 3. WEATHER NOTE HELPER
//    Reads forecast stored in sessionStorage by
//    weather-calendar.js after Open-Meteo fetch.
// ─────────────────────────────────────────────
function getWeatherNote(requestedDate) {
  try {
    const raw = sessionStorage.getItem("jecs_forecast");
    if (!raw) return null;
    const forecast = JSON.parse(raw);
    const wx = forecast[requestedDate];
    if (!wx) return null;
    const precip = wx.precip != null ? `${wx.precip}mm rain`           : null;
    const wind   = wx.wind   != null ? `${wx.wind}km/h wind`           : null;
    const temp   = (wx.tempMin != null && wx.tempMax != null)
                   ? `${wx.tempMin}–${wx.tempMax}°C`                   : null;
    const stats  = [precip, wind, temp].filter(Boolean).join(", ");
    return `${wx.icon || ""} ${wx.label || ""}${stats ? ` (${stats})` : ""}`.trim();
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────
// 4. EMAILJS CONFIRMATION EMAIL
//    SDK loaded via <script> tag in Index.html —
//    NOT injected at runtime (CSP-safe).
//    window.emailjs is available by the time this
//    function runs if the tag is present.
// ─────────────────────────────────────────────
async function sendConfirmationEmail({
  name, email, srn, service, vehicle,
  address, requestedDate, timeWindow, notes,
}) {
  if (
    EMAILJS_PUBLIC_KEY  === "YOUR_EMAILJS_PUBLIC_KEY"  ||
    EMAILJS_SERVICE_ID  === "YOUR_EMAILJS_SERVICE_ID"  ||
    EMAILJS_TEMPLATE_ID === "YOUR_EMAILJS_TEMPLATE_ID"
  ) {
    console.info("[JECS Email] EmailJS not yet configured — skipping confirmation email.");
    return { ok: false, reason: "not_configured" };
  }

  if (!window.emailjs) {
    console.warn("[JECS Email] window.emailjs not found — check <script> tag in Index.html.");
    return { ok: false, reason: "sdk_missing" };
  }

  // Init only once
  if (!window._jecsEmailJsInited) {
    window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    window._jecsEmailJsInited = true;
  }

  // Formatted date
  const formattedDate = requestedDate
    ? new Date(requestedDate + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      })
    : "To be confirmed";

  const pkg          = PACKAGES[service] || {};
  const serviceLabel = pkg.label || service || "Not specified";
  const serviceDesc  = pkg.desc  || "";
  const timeLabel    = timeWindow
    ? timeWindow.replace("-", "–")
    : "Flexible — our team will confirm your window";
  const weatherRaw   = getWeatherNote(requestedDate);
  const weatherNote  = weatherRaw
    || "Weather data unavailable. We monitor conditions and will contact you with any changes.";

  const isFleet  = service === "package-uuid-0003";
  const nextSteps = isFleet
    ? `Your fleet request has been received. A JECS coordinator will contact you within 1 business day to confirm route planning, vehicle count, and on-site arrival window. Reference SRN ${srn} in all communications.`
    : `Your wash is confirmed for ${formattedDate} during the ${timeLabel} window. Our tech will arrive within that window — no need to wait by your vehicle. Call or text ${JECS_PHONE} at least 2 hours before your window if you need to reschedule.`;

  try {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_name:        name           || "Valued Customer",
      to_email:       email,
      srn,
      service_label:  serviceLabel,
      service_desc:   serviceDesc,
      vehicle:        vehicle        || "Not specified",
      address:        address        || "Not specified",
      requested_date: formattedDate,
      time_window:    timeLabel,
      weather_note:   weatherNote,
      next_steps:     nextSteps,
      notes:          notes          || "None",
      jecs_phone:     JECS_PHONE,
      jecs_email:     JECS_EMAIL,
      reply_to:       JECS_EMAIL,
    });
    console.info("[JECS Email] Confirmation sent to:", email);
    return { ok: true };
  } catch (err) {
    console.warn("[JECS Email] Send failed:", err?.text || err?.message || err);
    return { ok: false, reason: "send_failed" };
  }
}

// ─────────────────────────────────────────────
// 5. GEO HELPER
// ─────────────────────────────────────────────
function buildGeoPayload(fd) {
  const lat         = parseFloat(fd.get("latitude"));
  const lng         = parseFloat(fd.get("longitude"));
  const explicitZip = String(fd.get("zip_code")          || "").trim();
  const address     = String(fd.get("formatted_address") || "").trim();
  const zipMatch    = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zipCode     = explicitZip || (zipMatch ? zipMatch[1] : null);
  return {
    latitude:  isFinite(lat) ? lat : null,
    longitude: isFinite(lng) ? lng : null,
    place_id:  fd.get("google_place_id") || fd.get("place_id") || null,
    zip_code:  zipCode,
  };
}

// ─────────────────────────────────────────────
// 6. PACKAGE LOOKUP
//    Maps form select values to real UUIDs in the
//    service_packages table via package_name.
//    "package-uuid-000x" stubs in the form select
//    are NOT valid UUIDs — always look up by name.
//    If the lookup fails, insert proceeds with
//    package_id = null (non-fatal for build phase).
// ─────────────────────────────────────────────

// Maps form select option values to service_packages.package_name
const SERVICE_PACKAGE_MAP = {
  "package-uuid-0001": "Quick Wash",
  "package-uuid-0002": "Wash + Vacuum",
  "package-uuid-0003": "Fleet & Commercial",
  // legacy slug keys kept for safety
  "quick-wash":        "Quick Wash",
  "wash-vacuum":       "Wash + Vacuum",
  "fleet":             "Fleet & Commercial",
};

async function resolvePackageId(serviceValue) {
  if (!serviceValue) return null;

  // Always look up by name — stub values like "package-uuid-0002"
  // are NOT real UUIDs and will cause a Postgres type error if inserted.
  const packageName = SERVICE_PACKAGE_MAP[serviceValue];
  if (!packageName) {
    console.warn("[JECS] No package name mapping for value:", serviceValue);
    return null;
  }

  const { data, error } = await supabase
    .from("service_packages")
    .select("package_id")
    .eq("package_name", packageName)
    .maybeSingle(); // maybeSingle returns null instead of error when no row found

  if (error) {
    console.warn("[JECS] package lookup error:", error.code, error.message);
    return null;
  }
  if (!data) {
    console.warn("[JECS] No row found in service_packages for name:", packageName,
      "— insert will proceed with package_id = null.");
    return null;
  }

  return data.package_id;
}

// ─────────────────────────────────────────────
// 7. UI HELPERS
// ─────────────────────────────────────────────
function setStatus(msg, type = "info") {
  if (!formMessage) return;
  formMessage.textContent = msg;
  formMessage.className   = `form-status ${type}`;
}

function setLoading(loading) {
  if (!submitBtn) return;
  const textEl    = submitBtn.querySelector(".btn-text");
  const loadingEl = submitBtn.querySelector(".btn-loading");
  submitBtn.disabled = loading;
  if (textEl)    textEl.style.display    = loading ? "none"   : "inline";
  if (loadingEl) loadingEl.style.display = loading ? "inline" : "none";
}

function showSuccessCard({ name, srn, serviceLabel, formattedDate, timeWindow, address }) {
  if (!form) return;
  const timeLabel = timeWindow ? timeWindow.replace("-", "–") : "Flexible";
  const card = document.createElement("div");
  card.className = "jecs-success-card";
  card.innerHTML = `
    <div class="jecs-success-icon">&#10003;</div>
    <h3>You're all set${name ? ", " + name.split(" ")[0] : ""}!</h3>
    <p class="jecs-success-srn">Request <strong>${srn}</strong></p>
    <ul class="jecs-success-details">
      <li><span>Service</span><strong>${serviceLabel}</strong></li>
      <li><span>Date</span><strong>${formattedDate}</strong></li>
      <li><span>Time window</span><strong>${timeLabel}</strong></li>
      <li><span>Location</span><strong>${address || "On file"}</strong></li>
    </ul>
    <p class="jecs-success-note">
      A confirmation has been sent to your email.<br>
      Questions? Call or text <a href="tel:+16153487683">${JECS_PHONE}</a>.
    </p>
  `;

  if (!document.getElementById("jecs-success-styles")) {
    const s = document.createElement("style");
    s.id = "jecs-success-styles";
    s.textContent = `
      .jecs-success-card {
        background:#f0fff4; border:1px solid #9ae6b4;
        border-radius:12px; padding:28px 24px;
        text-align:center; animation:jecsSlideIn .35s ease;
      }
      @keyframes jecsSlideIn {
        from { opacity:0; transform:translateY(10px); }
        to   { opacity:1; transform:translateY(0); }
      }
      .jecs-success-icon {
        width:48px; height:48px; border-radius:50%;
        background:#38a169; color:#fff;
        font-size:1.4rem; font-weight:700;
        display:flex; align-items:center; justify-content:center;
        margin:0 auto 14px;
      }
      .jecs-success-card h3 { margin:0 0 4px; color:#22543d; font-size:1.1rem; }
      .jecs-success-srn { font-size:.8rem; color:#276749; margin:0 0 16px; }
      .jecs-success-details {
        list-style:none; padding:0; margin:0 0 18px;
        text-align:left; border-top:1px solid #c6f6d5;
      }
      .jecs-success-details li {
        display:flex; justify-content:space-between;
        gap:12px; padding:8px 0;
        border-bottom:1px solid #c6f6d5;
        font-size:.85rem; flex-wrap:wrap;
      }
      .jecs-success-details li span { color:#276749; }
      .jecs-success-details li strong { color:#1a202c; text-align:right; }
      .jecs-success-note { font-size:.8rem; color:#2f855a; line-height:1.5; margin:0; }
      .jecs-success-note a { color:#276749; font-weight:600; }
    `;
    document.head.appendChild(s);
  }

  form.replaceWith(card);
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ─────────────────────────────────────────────
// 8. FORM SUBMISSION HANDLER
//    Step 1 → customers insert
//    Step 2 → vehicles insert
//    Step 3 → service_requests insert
//    Step 4 → appointments insert
//    Step 5 → EmailJS confirmation email
//    Step 6 → Update status → confirmed
//    Step 7 → Show inline success card
// ─────────────────────────────────────────────
// ── Init — load packages dynamically then wire form ──────────────────────────
// loadPackages() runs first so the select is populated before the user sees it.
// The form listener is attached regardless — if packages fail to load,
// the hardcoded HTML options remain and PACKAGES falls back gracefully.
loadPackages();

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // Guard: date must be selected from the weather calendar
    const rawDate = String(
      document.querySelector('[name="requested_date"]')?.value || ""
    ).trim();
    if (!rawDate) {
      setStatus("Please select a wash date from the calendar above.", "error");
      document.getElementById("jecsWeatherCal")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setLoading(true);
    setStatus("Validating your request…");

    // CAPTCHA (bypassed during build phase — see section 2)
    const turnstileToken = form.querySelector('[name="cf-turnstile-response"]')?.value;
    const captchaResult  = await verifyTurnstile(turnstileToken);
    if (!captchaResult.ok) {
      setStatus("CAPTCHA validation failed. Please refresh and try again.", "error");
      setLoading(false);
      return;
    }

    // Generate SRN
    const srn = generateSrn();
    if (srnInput) srnInput.value = srn;
    showSrnBanner(srn);
    setStatus(`SRN generated: ${srn}`);

    // Collect form data
    const fd         = new FormData(form);
    const geo        = buildGeoPayload(fd);
    const name       = String(fd.get("full_name")             || "").trim() || null;
    const email      = String(fd.get("email")                 || "").trim() || null;
    const phone      = String(fd.get("phone_number")          || "").trim() || null;
    const address    = String(fd.get("formatted_address")     || "").trim() || null;
    const service    = String(fd.get("package_id")            || "").trim() || null;
    const vehicle    = String(fd.get("vehicle_type")          || "").trim() || null;
    const vehicleYear  = String(fd.get("vehicle_year")  || "").trim() || null;
    const vehicleMakeText  = String(fd.get("vehicle_make_text")  || "").trim();
    const vehicleModelText = String(fd.get("vehicle_model_text") || "").trim();
    const vehicleMake  = String(fd.get("vehicle_make")  || "").trim() || vehicleMakeText  || null;
    const vehicleModel = String(fd.get("vehicle_model") || "").trim() || vehicleModelText || null;
    const vehicleColor = String(fd.get("vehicle_color") || "").trim() || null;
    const licensePlate = String(fd.get("license_plate") || "").trim().toUpperCase() || null;
    const notes      = String(fd.get("special_notes")         || "").trim() || null;
    const timeWindow = String(fd.get("preferred_time_window") || "").trim() || null;
    const requestedDate = rawDate;

    // Persist to localStorage
    try {
      localStorage.setItem("jecs_last_srn", srn);
      localStorage.setItem("jecs_submission_ts", Date.now().toString());
      localStorage.setItem("jecs_last_payload", JSON.stringify({
        srn, name, email, phone, address, service,
        vehicle, notes, geo, requestedDate, timeWindow,
      }));
    } catch (_) { /* quota exceeded — non-fatal */ }

    setStatus("Saving your request…");

    // Parallel: Formspree backup
    const formspreePromise = fetch(FORMSPREE_ENDPOINT, {
      method:  "POST",
      body:    fd,
      headers: { Accept: "application/json" },
    });

    // ── STEPS 1–4: one atomic booking via RPC ──
    // create_booking (Supabase, SECURITY DEFINER) inserts customer, vehicle,
    // service request and appointment in a single transaction. The browser no
    // longer needs write access to any table.
    const vehicleTypeSummary = String(fd.get("vehicle_type") || "").trim() || null;
    const vehicleTypeValue = vehicleTypeSummary
      || [vehicleYear, vehicleColor, vehicleMake, vehicleModel].filter(Boolean).join(" ")
      || null;

    const packageId = await resolvePackageId(service);

    let scheduledStart = null;
    let scheduledEnd   = null;

    const windowMap = {
      // Form dropdown values (exact match)
      "8am-11am":  ["08:00", "11:00"],
      "11am-2pm":  ["11:00", "14:00"],
      "2pm-5pm":   ["14:00", "17:00"],
      // Legacy 24-hr format fallbacks
      "morning":   ["08:00", "12:00"],
      "afternoon": ["12:00", "17:00"],
      "evening":   ["17:00", "20:00"],
      "08:00-10:00": ["08:00", "10:00"],
      "10:00-12:00": ["10:00", "12:00"],
      "12:00-14:00": ["12:00", "14:00"],
      "14:00-16:00": ["14:00", "16:00"],
      "16:00-18:00": ["16:00", "18:00"],
    };

    if (requestedDate) {
      const tw = (timeWindow || "").toLowerCase().trim();
      const [startTime, endTime] = windowMap[tw] || ["08:00", "17:00"];
      scheduledStart = `${requestedDate}T${startTime}:00`;
      scheduledEnd   = `${requestedDate}T${endTime}:00`;
    }

    if (!scheduledStart) {
      console.error("[JECS] No requestedDate selected — booking saved without an appointment.");
    }

    const weatherScore = (() => {
      try {
        const forecast = JSON.parse(sessionStorage.getItem("jecs_forecast") || "{}");
        return forecast[requestedDate]?.score ?? null;
      } catch (_) { return null; }
    })();

    const { data: booking, error: bookingError } = await supabase.rpc("create_booking", {
      p: {
        customer: {
          full_name:         name,
          email,
          phone_number:      phone,
          formatted_address: address,
          google_place_id:   geo.place_id,
          zip_code:          geo.zip_code,
          latitude:          geo.latitude,
          longitude:         geo.longitude,
        },
        vehicle: {
          color:         vehicleColor     || null,
          license_plate: licensePlate     || null,
          vehicle_type:  vehicleTypeValue || null,
        },
        request: {
          service_request_number: srn,
          package_id:             packageId,
          special_notes:          notes,
          requested_date:         requestedDate,
          client_timezone:        Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        appointment: scheduledStart ? {
          scheduled_start:       scheduledStart,
          scheduled_end:         scheduledEnd,
          preferred_time_window: timeWindow || null,
          customer_notes:        notes || null,
          weather_score:         weatherScore,
        } : null,
      },
    });

    if (bookingError || !booking) {
      console.error("[JECS] create_booking failed — code:", bookingError?.code,
        "| message:", bookingError?.message, "| details:", bookingError?.details);
      setStatus(
        "Submission failed. Please try again or call (615) 348-7683.",
        "error"
      );
      setLoading(false);
      return;
    }

    console.info("[JECS] ✅ Booking created — SRN:", srn, "| request:", booking.request_id);

    // Notify weather-calendar.js to refresh slot counts
    document.dispatchEvent(new CustomEvent("jecs:submitted", {
      detail: { srn, requestedDate, service },
    }));

    // Evaluate Formspree backup result
    const formspreeResult = await Promise.allSettled([formspreePromise]);
    if (formspreeResult[0].status !== "fulfilled" || !formspreeResult[0].value.ok) {
      console.warn("[JECS] Formspree backup failed — Supabase succeeded, continuing.");
    }

    // CAPTCHA log (only for non-standard results)
    if (captchaResult.reason !== "verified" && captchaResult.reason !== "bypassed_build_phase") {
      try {
        await supabase.from("captcha_logs").insert({
          id:               crypto.randomUUID(),
          srn,
          reason:           captchaResult.reason,
          captcha_verified: captchaResult.ok,
          captcha_method:   captchaResult.reason,
          ts:               new Date().toISOString(),
        });
      } catch (_) { /* non-fatal */ }
    }

    // ── STEP 5: Confirmation email ─────────────
    setStatus("Sending your confirmation email…");
    const emailResult = await sendConfirmationEmail({
      name, email, srn, service, vehicle,
      address, requestedDate, timeWindow, notes,
    });

    // ── STEP 7: Success card ───────────────────
    const pkg           = PACKAGES[service] || {};
    const serviceLabel  = pkg.label || service || "Service";
    const formattedDate = requestedDate
      ? new Date(requestedDate + "T12:00:00").toLocaleDateString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        })
      : "To be confirmed";

    showSuccessCard({ name, srn, serviceLabel, formattedDate, timeWindow, address });
  });
}
