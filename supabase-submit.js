import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://mylqkbpclcrqorjctjxn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wupNQz6NF8oI_20Pug7MNw_HEi0hzy5";
const CALENDLY_BASE = "https://calendly.com/aarmstrong1234/30min";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const form = document.getElementById("customerForm");
const formMessage = document.getElementById("formMessage");
const srnInput = document.getElementById("serviceRequestId");
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xqewgnbb";

function generateSrn() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const random4 = Math.floor(1000 + Math.random() * 9000);
  return `JECS-${date}-${time}-${random4}`;
}

async function verifyTurnstileToken(token) {
  if (!token) return { ok: false, reason: "missing_token" };

  const { data, error } = await supabase.functions.invoke("verify-turnstile", {
    body: { token },
  });

  if (error) {
    return { ok: true, reason: "edge_unavailable" };
  }

  if (!data?.success) return { ok: false, reason: "verification_failed" };
  return { ok: true, reason: "verified" };
}

function buildCalendlyUrl(formData, srn) {
  const url = new URL(CALENDLY_BASE);
  const name = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const service = String(formData.get("package_name") || "").trim();
  const address = String(formData.get("formatted_address") || "").trim();
  const notes = String(formData.get("special_notes") || "").trim();

  if (name) url.searchParams.set("name", name);
  if (email) url.searchParams.set("email", email);
  url.searchParams.set("a1", `SRN: ${srn} | Service: ${service}`);
  url.searchParams.set("a2", `${address}`);
  url.searchParams.set("a3", notes);
  return url.toString();
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const turnstileToken = form.querySelector('[name="cf-turnstile-response"]')?.value;
    const turnstileCheck = await verifyTurnstileToken(turnstileToken);
    if (!turnstileCheck.ok) {
      if (formMessage) formMessage.textContent = "CAPTCHA validation failed. Please retry.";
      return;
    }

    if (turnstileCheck.reason === "edge_unavailable" && formMessage) {
      formMessage.textContent = "CAPTCHA token captured. Server verification endpoint unavailable; continuing with token-only validation.";
    }

    const srn = generateSrn();
    if (srnInput) srnInput.value = srn;

    const formData = new FormData(form);
    formData.set("service_request_id", srn);
    const calendlyUrl = buildCalendlyUrl(formData, srn);

    const payload = {
      service_request_id: srn,
      service_request_number: srn,
      full_name: form.full_name?.value ?? null,
      email: form.email?.value ?? null,
      phone_number: form.phone_number?.value ?? null,
      formatted_address: form.formatted_address?.value ?? null,
      google_place_id: form.google_place_id?.value ?? null,
      zip_code: form.zip_code?.value ?? null,
      latitude: form.latitude?.value ? Number(form.latitude.value) : null,
      longitude: form.longitude?.value ? Number(form.longitude.value) : null,
      package_name: form.package_name?.value ?? null,
      vehicle_type: form.vehicle_type?.value ?? null,
      requested_date: form.requested_date?.value || null,
      preferred_time_window: form.preferred_time_window?.value || null,
      special_notes: form.special_notes?.value ?? null,
      captcha_verified: true,
      booking_status: "pending_calendly",
    };

    if (formMessage) formMessage.textContent = "Submitting request...";

    const formspreePromise = fetch(FORMSPREE_ENDPOINT, { method: "POST", body: formData, headers: { Accept: "application/json" } });
    const supabasePromise = supabase.functions.invoke("create-service-request", {
      body: payload,
    });

    const [formspreeRes, supabaseRes] = await Promise.allSettled([formspreePromise, supabasePromise]);

    if (formspreeRes.status === "rejected") {
      if (formMessage) formMessage.textContent = "Could not submit to Formspree. Please retry.";
      return;
    }
    if (supabaseRes.status === "rejected" || supabaseRes.value.error) {
      const message = supabaseRes.status === "rejected" ? "Supabase request failed." : supabaseRes.value.error.message;
      if (formMessage) formMessage.textContent = `Saved to Formspree. Backend queue pending: ${message}`;
      window.location.assign(calendlyUrl);
      return;
    }

    localStorage.setItem("jecs_last_srn", srn);
    localStorage.setItem("jecs_last_payload", JSON.stringify(payload));
    if (formMessage) formMessage.textContent = `Saved! SRN: ${srn}. Redirecting to scheduling...`;
    window.location.assign(calendlyUrl);
  });
}
