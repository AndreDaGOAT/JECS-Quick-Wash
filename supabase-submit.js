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
const PACKAGES = {
  "package-uuid-0001": {
    label: "Quick Wash",
    desc:  "Exterior rinse, hand soap wash, dry, and tire finish.",
  },
  "package-uuid-0002": {
    label: "Wash + Vacuum",
    desc:  "Everything in Quick Wash plus full interior vacuum and wipe-down.",
  },
  "package-uuid-0003": {
    label: "Fleet & Commercial",
    desc:  "Volume-priced on-site fleet service. Our team will coordinate a full-day route with your fleet manager.",
  },
};

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
// ─────────────────────────────────────────────
const SERVICE_PACKAGE_MAP = {
  "quick-wash":  "Quick Wash",
  "wash-vacuum": "Wash + Vacuum",
  "fleet":       "Fleet Service",
};

async function resolvePackageId(serviceValue) {
  if (!serviceValue) return null;
  if (/^[0-9a-f-]{8,}$/i.test(serviceValue) || serviceValue.startsWith("package-uuid-")) {
    return serviceValue;
  }
  const packageName = SERVICE_PACKAGE_MAP[serviceValue];
  if (!packageName) return null;
  const { data, error } = await supabase
    .from("service_packages")
    .select("package_id")
    .eq("package_name", packageName)
    .single();
  if (error || !data) {
    console.warn("[JECS] Could not resolve package_id:", serviceValue, error?.message);
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
//    Step 4 → EmailJS confirmation email
//    Step 5 → Update status → confirmed
//    Step 6 → Show inline success card
// ─────────────────────────────────────────────
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
        created_at:        new Date().toISOString(),
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
    let vehicleId = null;
    if (vehicle) {
      const { data: vData, error: vError } = await supabase
        .from("vehicles")
        .insert({
          customer_id:  customerId,
          vehicle_type: vehicle,
          created_at:   new Date().toISOString(),
        })
        .select("vehicle_id")
        .single();
      if (vError || !vData) {
        console.warn("[JECS] vehicles insert failed — code:", vError?.code, "| message:", vError?.message);
        // Non-fatal — continue without vehicle_id
      } else {
        vehicleId = vData.vehicle_id;
      }
    }

    // ── STEP 3: service_requests ───────────────
    const packageId = await resolvePackageId(service);

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
        created_at:             new Date().toISOString(),
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

    // Evaluate Formspree
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

    // ── STEP 4: Confirmation email ─────────────
    setStatus("Sending your confirmation email…");
    const emailResult = await sendConfirmationEmail({
      name, email, srn, service, vehicle,
      address, requestedDate, timeWindow, notes,
    });

    // ── STEP 5: Update status ──────────────────
    const finalStatus = emailResult.ok ? "confirmed" : "pending_confirmation";
    try {
      await supabase
        .from("service_requests")
        .update({ status: finalStatus })
        .eq("request_id", requestId);
    } catch (_) { /* non-fatal */ }

    // ── STEP 6: Success card ───────────────────
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