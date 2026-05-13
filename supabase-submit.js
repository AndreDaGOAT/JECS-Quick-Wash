import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://rtbfevqhjsiqmtfrxdbd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0YmZldnFoanNpcW10ZnJ4ZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDg4NDMsImV4cCI6MjA5MzQ4NDg0M30.ASbGycrTfL1REEdF1D-Wg0ko6CrZh5rt9eDpO2WDi4Q";
const CALENDLY_BASE = "https://calendly.com/aarmstrong1234/30min";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  if (!token) return false;
  const { data, error } = await supabase.functions.invoke("verify-turnstile", {
    body: { token },
  });
  if (error) return false;
  return Boolean(data?.success);
}

function buildCalendlyUrl(formData, srn) {
  const url = new URL(CALENDLY_BASE);
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const service = String(formData.get("service") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

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
    const turnstileValid = await verifyTurnstileToken(turnstileToken);
    if (!turnstileValid) {
      if (formMessage) formMessage.textContent = "CAPTCHA validation failed. Please retry.";
      return;
    }

    const srn = generateSrn();
    if (srnInput) srnInput.value = srn;

    const formData = new FormData(form);
    formData.set("service_request_id", srn);
    const calendlyUrl = buildCalendlyUrl(formData, srn);

    const payload = {
      service_request_id: srn,
      name: form.name?.value ?? null,
      email: form.email?.value ?? null,
      phone: form.phone?.value ?? null,
      service: form.service?.value ?? null,
      notes: form.notes?.value ?? null,
      address: form.address?.value ?? null,
      latitude: form.latitude?.value ? Number(form.latitude.value) : null,
      longitude: form.longitude?.value ? Number(form.longitude.value) : null,
      place_id: form.place_id?.value ?? null,
      captcha_verified: true,
      booking_status: "pending_calendly",
    };

    if (formMessage) formMessage.textContent = "Submitting request...";

    const formspreePromise = fetch(FORMSPREE_ENDPOINT, { method: "POST", body: formData, headers: { Accept: "application/json" } });
    const supabasePromise = supabase.from("customers").insert(payload).select("*").single();

    const [formspreeRes, supabaseRes] = await Promise.allSettled([formspreePromise, supabasePromise]);

    if (formspreeRes.status === "rejected") {
      if (formMessage) formMessage.textContent = "Could not submit to Formspree. Please retry.";
      return;
    }
    if (supabaseRes.status === "rejected" || supabaseRes.value.error) {
      const message = supabaseRes.status === "rejected" ? "Supabase request failed." : supabaseRes.value.error.message;
      if (formMessage) formMessage.textContent = `Saved to Formspree, but Supabase failed: ${message}`;
      return;
    }

    localStorage.setItem("jecs_last_srn", srn);
    localStorage.setItem("jecs_last_payload", JSON.stringify(payload));
    if (formMessage) formMessage.textContent = `Saved! SRN: ${srn}. Redirecting to scheduling...`;
    window.location.assign(calendlyUrl);
  });
}
