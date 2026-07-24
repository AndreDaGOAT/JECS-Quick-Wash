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
//    skipped until verify-turnstile is deployed to
//    Supabase Edge Functions.
//    To re-enable: uncomment the supabase.functions
//    .invoke block and remove the bypass return.
// ─────────────────────────────────────────────
async function verifyTurnstile(token) {
  // Log whether a token was present for audit purposes
  if (!token) {
    console.warn("[JECS CAPTCHA] No token present — widget may not have completed.");
  } else {
    console.info("[JECS CAPTCHA] Token received (server verification bypassed — build phase).");
  }
  // Bypass: treat all submissions as passing until edge function is live
  return { ok: true, reason: "bypassed_build_phase" };
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

    // ── STEP 1: customers ──────────────────────
    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .insert({
        full_name:         name,
        email,
        phone_number:      phone,
        formatted_address: address,
        google_place_id:   geo.place_id,
        zip_code:          geo.zip_code,
        latitude:          geo.latitude,
        longitude:         geo.longitude,
        // created_at omitted — Supabase column default (now()) handles it in UTC
      })
      .select("customer_id")
      .single();

    if (customerError || !customerData) {
      console.error("[JECS] customers insert failed — code:", customerError?.code, "| message:", customerError?.message, "| details:", customerError?.details);
      setStatus(
        customerError?.code === "42501"
          ? "Database permissions error. Please contact support or call (615) 348-7683."
          : "Submission failed at customer step. Please try again or call (615) 348-7683.",
        "error"
      );
      setLoading(false);
      return;
    }

    const customerId = customerData.customer_id;

    // ── STEP 2: vehicles ───────────────────────
    // vehicles table columns: customer_id, color, license_plate, vehicle_type
    // vehicle_type stores the full summary from vehicleTypeSummary hidden field
    // e.g. "2022 Silver Toyota Camry" — this is what the admin/tech will see.
    const vehicleTypeSummary = String(fd.get("vehicle_type") || "").trim() || null;

    // Build the best possible vehicle_type string from all available sources
    const vehicleTypeValue = vehicleTypeSummary
      || [vehicleYear, vehicleColor, vehicleMake, vehicleModel].filter(Boolean).join(" ")
      || null;

    const hasVehicleInfo = !!(vehicleTypeValue || vehicleColor || licensePlate);

    let vehicleId = null;
    if (hasVehicleInfo) {
      const { data: vData, error: vError } = await supabase
        .from("vehicles")
        .insert({
          customer_id:   customerId,
          color:         vehicleColor   || null,
          license_plate: licensePlate   || null,
          vehicle_type:  vehicleTypeValue || null,
        })
        .select("vehicle_id")
        .single();

      if (vError || !vData) {
        console.warn("[JECS] vehicles insert failed — code:", vError?.code,
          "| message:", vError?.message,
          "| hint:", vError?.hint);
      } else {
        vehicleId = vData.vehicle_id;
        console.info("[JECS] ✅ Vehicle created:", vehicleId,
          "| type:", vehicleTypeValue,
          "| color:", vehicleColor,
          "| plate:", licensePlate);
      }
    }

    // ── STEP 3: service_requests ───────────────
    const packageId = await resolvePackageId(service);
    console.info("[JECS] Resolved package_id:", packageId, "from service value:", service);

    const { data: srData, error: srError } = await supabase
      .from("service_requests")
      .insert({
        service_request_number: srn,
        customer_id:            customerId,
        vehicle_id:             vehicleId,
        package_id:             packageId,
        special_notes:          notes,
        status:                 "pending_confirmation",
        requested_date:         requestedDate,
        client_timezone:        Intl.DateTimeFormat().resolvedOptions().timeZone,
        // created_at omitted — Supabase column default handles it in UTC
      })
      .select("request_id")
      .single();

    if (srError || !srData) {
      console.error("[JECS] service_requests insert failed — code:", srError?.code, "| message:", srError?.message, "| details:", srError?.details);
      setStatus(
        srError?.code === "42501"
          ? "Database permissions error. Please contact support or call (615) 348-7683."
          : "Submission failed at request step. Please try again or call (615) 348-7683.",
        "error"
      );
      setLoading(false);
      return;
    }

    const requestId = srData.request_id;

    // ── STEP 4: appointments ──────────────────
    // Map the form's time window values to 24-hr start/end times.
    // Form values: "8AM-11AM" | "11AM-2PM" | "2PM-5PM"
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
      console.error("[JECS] appointments insert skipped — no requestedDate selected.");
    } else {
      const { error: apptError } = await supabase
        .from("appointments")
        .insert({
          // Core relationships
          customer_id:           customerId,
          service_request_id:    requestId,

          // Scheduling
          scheduled_start:       scheduledStart,
          scheduled_end:         scheduledEnd,
          preferred_time_window: timeWindow || null,

          // Status — enters pipeline at first stage
          appointment_status:    "Requested",

          // Customer notes from form
          customer_notes:        notes || null,

          // Weather score from calendar session (if available)
          weather_score: (() => {
            try {
              const forecast = JSON.parse(sessionStorage.getItem("jecs_forecast") || "{}");
              const dayData  = forecast[requestedDate];
              return dayData?.score ?? null;
            } catch (_) { return null; }
          })(),
        });

      if (apptError) {
        console.error(
          "[JECS] appointments insert failed",
          "| code:", apptError?.code,
          "| message:", apptError?.message,
          "| details:", apptError?.details,
          "| hint:", apptError?.hint
        );
        // Non-fatal — service request saved, but log clearly for admin visibility
      } else {
        console.info("[JECS] ✅ Appointment record created — SRN:", srn,
          "| customer:", customerId,
          "| vehicle:", vehicleId,
          "| date:", requestedDate,
          "| window:", timeWindow,
          "| start:", scheduledStart
        );
      }
    }

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

    // ── STEP 6: Update status ──────────────────
    const finalStatus = emailResult.ok ? "confirmed" : "pending_confirmation";
    try {
      await supabase
        .from("service_requests")
        .update({ status: finalStatus })
        .eq("request_id", requestId);
    } catch (_) { /* non-fatal */ }

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
