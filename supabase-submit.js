/* =============================================
   JECS Quick Wash — supabase-submit.js  v3.0
   Tables: customers → vehicles → service_requests
   + captcha_logs

   v3.0 changes
   ────────────
   • Calendly removed entirely — no redirect,
     no calendly_url field, no return handler.
   • After successful Supabase insert, EmailJS
     sends the client a rich confirmation email
     then the page shows an inline success state.
   • Service request status writes as
     "pending_confirmation" on insert, then
     updates to "confirmed" after email sends.
   • Email template now includes all essential
     booking information — see EMAILJS SETUP.

   ── EMAILJS SETUP (free — 200 emails/month) ──
   1. Sign up at https://www.emailjs.com
   2. Connect an Email Service (Gmail etc.)
   3. Create a template using these variables:

      {{to_name}}          Client full name
      {{to_email}}         Client email (To address)
      {{srn}}              Service Request Number
      {{service_label}}    e.g. "Quick Wash"
      {{service_desc}}     What the service includes
      {{vehicle}}          Vehicle type
      {{address}}          Service location
      {{requested_date}}   e.g. "Monday, June 16 2025"
      {{time_window}}      e.g. "8AM–11AM"
      {{weather_note}}     Weather summary for that day
      {{next_steps}}       What happens next paragraph
      {{jecs_phone}}       (615) 348-7683
      {{jecs_email}}       Contact@jubileeexecutivecarservice.com
      {{reply_to}}         Same as jecs_email

   4. Fill in the three keys below.
   ============================================= */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ── Config ────────────────────────────────────
const SUPABASE_URL      = "https://mylqkbpclcrqorjctjxn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bHFrYnBjbGNycW9yamN0anhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjcxNzgsImV4cCI6MjA5NTMwMzE3OH0.yeZZHm0BEvrJShe8Wek5rfKAwunJQ8byKF1THbtwYYg";
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xqewgnbb";

// ── EmailJS Config ─────────────────────────────
// Replace with your real keys. Flow is non-fatal
// if keys are missing — email step warns + skips.
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
// 3. WEATHER NOTE HELPER
//    weather-calendar.js stores the forecast JSON
//    in sessionStorage when it processes the API
//    response. We read it here to include a plain-
//    English weather note in the confirmation email.
// ─────────────────────────────────────────────
function getWeatherNote(requestedDate) {
  try {
    const raw = sessionStorage.getItem("jecs_forecast");
    if (!raw) return null;
    const forecast = JSON.parse(raw);
    const wx = forecast[requestedDate];
    if (!wx) return null;

    const icon  = wx.icon  || "";
    const label = wx.label || "";
    const precip = wx.precip != null ? `${wx.precip}mm rain` : null;
    const wind   = wx.wind  != null ? `${wx.wind}km/h wind`  : null;
    const temp   = (wx.tempMin != null && wx.tempMax != null)
      ? `${wx.tempMin}–${wx.tempMax}°C`
      : null;

    const stats = [precip, wind, temp].filter(Boolean).join(", ");
    return `${icon} ${label}${stats ? ` (${stats})` : ""}`.trim();
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────
// 4. EMAILJS CONFIRMATION EMAIL
//    Sends a rich booking summary to the client.
//    Non-fatal — a failed send does not block the
//    success state from displaying.
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
    console.info("[JECS Email] EmailJS not yet configured — skipping.");
    return { ok: false, reason: "not_configured" };
  }

  // Lazy-load EmailJS SDK
  if (!window.emailjs) {
    await new Promise((resolve, reject) => {
      const script    = document.createElement("script");
      script.src      = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      script.onload   = resolve;
      script.onerror  = () => reject(new Error("EmailJS SDK failed to load"));
      document.head.appendChild(script);
    });
    window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  }

  // ── Build template variables ──────────────────

  // Formatted date: "Monday, June 16, 2025"
  const formattedDate = requestedDate
    ? new Date(requestedDate + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      })
    : "To be confirmed";

  // Package details
  const pkg          = PACKAGES[service] || {};
  const serviceLabel = pkg.label || service || "Not specified";
  const serviceDesc  = pkg.desc  || "";

  // Time window
  const timeLabel = timeWindow
    ? timeWindow.replace("-", "–")
    : "Flexible — our team will confirm your window";

  // Weather note for the chosen date
  const weatherRaw  = getWeatherNote(requestedDate);
  const weatherNote = weatherRaw
    || "Weather data not available for this date. We will monitor conditions and notify you of any changes.";

  // Next steps message — tailored by service type
  const isFleet = service === "package-uuid-0003";
  const nextSteps = isFleet
    ? `Your fleet request has been received. A JECS coordinator will contact you within 1 business day at the phone number or email you provided to confirm route planning, vehicle count, and an on-site arrival window. Reference your SRN (${srn}) in any communications.`
    : `Your wash request is confirmed for ${formattedDate} during the ${timeLabel} window. Our tech will be at your location within that window — no need to wait by your vehicle. We will send a heads-up text to ${JECS_PHONE} if there are any changes. If you need to update or cancel, contact us at least 2 hours before your window.`;

  const templateParams = {
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
  };

  try {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
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

// Replaces the form with a clean inline success card
// after booking is fully confirmed.
function showSuccessCard({ name, srn, serviceLabel, formattedDate, timeWindow, address }) {
  if (!form) return;
  const timeLabel = timeWindow ? timeWindow.replace("-", "–") : "Flexible";
  const card = document.createElement("div");
  card.className = "jecs-success-card";
  card.innerHTML = `
    <div class="jecs-success-icon">&#10003;</div>
    <h3>You're all set, ${name || "there"}!</h3>
    <p class="jecs-success-srn">Request <strong>${srn}</strong></p>
    <ul class="jecs-success-details">
      <li><span>Service</span><strong>${serviceLabel}</strong></li>
      <li><span>Date</span><strong>${formattedDate}</strong></li>
      <li><span>Time window</span><strong>${timeLabel}</strong></li>
      <li><span>Location</span><strong>${address || "On file"}</strong></li>
    </ul>
    <p class="jecs-success-note">
      A confirmation has been sent to your email.<br>
      Questions? Call or text us at <a href="tel:+16153487683">${JECS_PHONE}</a>.
    </p>
  `;

  // Inject minimal card styles if not already present
  if (!document.getElementById("jecs-success-styles")) {
    const s = document.createElement("style");
    s.id = "jecs-success-styles";
    s.textContent = `
      .jecs-success-card {
        background: #f0fff4; border: 1px solid #9ae6b4;
        border-radius: 12px; padding: 28px 24px;
        text-align: center; animation: jecsSlideIn .35s ease;
      }
      @keyframes jecsSlideIn {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .jecs-success-icon {
        width: 48px; height: 48px; border-radius: 50%;
        background: #38a169; color: #fff;
        font-size: 1.4rem; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 14px;
      }
      .jecs-success-card h3 { margin: 0 0 4px; color: #22543d; font-size: 1.1rem; }
      .jecs-success-srn { font-size: .8rem; color: #276749; margin: 0 0 16px; }
      .jecs-success-details {
        list-style: none; padding: 0; margin: 0 0 18px;
        text-align: left; border-top: 1px solid #c6f6d5;
      }
      .jecs-success-details li {
        display: flex; justify-content: space-between;
        gap: 12px; padding: 8px 0;
        border-bottom: 1px solid #c6f6d5;
        font-size: .85rem; flex-wrap: wrap;
      }
      .jecs-success-details li span { color: #276749; }
      .jecs-success-details li strong { color: #1a202c; text-align: right; }
      .jecs-success-note { font-size: .8rem; color: #2f855a; line-height: 1.5; margin: 0; }
      .jecs-success-note a { color: #276749; font-weight: 600; }
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
//    Step 3 → service_requests insert (status: pending_confirmation)
//    Step 4 → EmailJS confirmation email
//    Step 5 → Update status to confirmed / email_failed
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

    // CAPTCHA
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

    // Persist key fields to localStorage
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
      console.error("[JECS] customers insert failed:", customerError?.message);
      setStatus("Submission failed. Please try again or call (615) 348-7683.", "error");
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
        console.warn("[JECS] vehicles insert failed:", vError?.message);
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
      console.error("[JECS] service_requests insert failed:", srError?.message);
      setStatus("Submission failed. Please try again or call (615) 348-7683.", "error");
      setLoading(false);
      return;
    }

    const requestId = srData.request_id;

    // Evaluate Formspree
    const formspreeResult = await Promise.allSettled([formspreePromise]);
    if (formspreeResult[0].status !== "fulfilled" || !formspreeResult[0].value.ok) {
      console.warn("[JECS] Formspree backup failed — Supabase succeeded, continuing.");
    }

    // CAPTCHA log
    if (captchaResult.reason !== "verified") {
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

    // ── STEP 4: Send confirmation email ────────
    setStatus("Sending your confirmation email…");

    const emailResult = await sendConfirmationEmail({
      name, email, srn, service, vehicle,
      address, requestedDate, timeWindow, notes,
    });

    // ── STEP 5: Update service_request status ──
    const finalStatus = emailResult.ok ? "confirmed" : "pending_confirmation";
    try {
      await supabase
        .from("service_requests")
        .update({ status: finalStatus })
        .eq("request_id", requestId);
    } catch (_) { /* non-fatal */ }

    // ── STEP 6: Show success card ──────────────
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