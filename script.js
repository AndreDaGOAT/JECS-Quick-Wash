/* =============================================
   JECS Quick Wash — script.js
   Core utilities: nav, geolocation, places
   ============================================= */

const settings = {
  businessName: "JECS Quick Wash",
  phone: "+16153487683",
  displayPhone: "(615) 348-7683",
  email: "Contact@jubileeexecutivecarservice.com",
};

// ── Year ──
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

// ── Mobile menu ──
const menuToggle = document.getElementById("menuToggle");
const mobileMenu = document.getElementById("mobileMenu");
if (menuToggle && mobileMenu) {
  menuToggle.addEventListener("click", () => {
    mobileMenu.classList.toggle("open");
  });
  mobileMenu.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => mobileMenu.classList.remove("open"));
  });
}

// ── Smooth active nav highlight ──
const navLinks = document.querySelectorAll(".nav a, .mobile-menu a");
function setActiveNav() {
  let current = "";
  document.querySelectorAll("section[id]").forEach((sec) => {
    if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
  });
  navLinks.forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === `#${current}`);
  });
}
window.addEventListener("scroll", setActiveNav, { passive: true });

// ── Scroll reveal ──
const revealEls = document.querySelectorAll(
  ".service-card, .step, .location-pill, .geo-panel, .sidebar-card, .pipeline-step, .srn-banner"
);
const revealObserver = new IntersectionObserver(
  (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
  { threshold: 0.12 }
);
revealEls.forEach((el) => { el.classList.add("reveal"); revealObserver.observe(el); });

// ── Geolocation ──
const latInput = document.getElementById("lat");
const lngInput = document.getElementById("lng");
const locationHint = document.getElementById("locationHint");

function getLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (latInput) latInput.value = String(pos.coords.latitude);
      if (lngInput) lngInput.value = String(pos.coords.longitude);
      if (locationHint) locationHint.textContent = "📍 Location captured — routing accuracy improved.";
    },
    () => {
      if (locationHint) locationHint.textContent = "📍 Enter your full location for accurate dispatch.";
    }
  );
}
getLocation();

// ── Google Places Autocomplete ──
const addressInput = document.getElementById("address");
const placeIdInput = document.getElementById("placeId");

window.initGooglePlaces = function initGooglePlaces() {
  if (!window.google?.maps?.places || !addressInput) {
    if (locationHint) locationHint.textContent = "Enter your full workplace or parking address.";
    return;
  }
  const autocomplete = new google.maps.places.Autocomplete(addressInput, {
    fields: ["formatted_address", "geometry", "place_id"],
    types: ["address"],
  });
  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place?.formatted_address) return;
    addressInput.value = place.formatted_address;
    if (placeIdInput) placeIdInput.value = place.place_id || "";
    if (place.geometry?.location) {
      if (latInput) latInput.value = String(place.geometry.location.lat());
      if (lngInput) lngInput.value = String(place.geometry.location.lng());
    }
  });
};

// ── Sticky header shadow on scroll ──
const header = document.querySelector(".site-header");
window.addEventListener("scroll", () => {
  if (!header) return;
  header.style.boxShadow = window.scrollY > 20
    ? "0 2px 24px rgba(0,0,0,0.35)"
    : "none";
}, { passive: true });
