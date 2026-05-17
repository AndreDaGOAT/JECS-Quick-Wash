const settings = {
  businessName: "JECS Quick Wash",
  phone: "+6153487683",
  displayPhone: "(615) 348-7683",
  email: "Contact@jubileeexecutivecarservice.com",
  formspreeEndpoint: "https://formspree.io/f/xqewgnbb",
  supabaseUrl: "",
  supabaseAnonKey: "",
};

const washForm = document.getElementById("customerForm");
const formMessage = document.getElementById("formMessage");
const yearLabel = document.getElementById("year");
const businessNameLabel = document.getElementById("businessName");
const addressInput = document.getElementById("address");
const latInput = document.getElementById("lat");
const lngInput = document.getElementById("lng");
const placeIdInput = document.getElementById("placeId");
const locationHint = document.getElementById("locationHint");

if (yearLabel) yearLabel.textContent = String(new Date().getFullYear());
if (businessNameLabel) businessNameLabel.textContent = settings.businessName;
if (washForm) washForm.action = settings.formspreeEndpoint;

function getLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((position) => {
    if (latInput) latInput.value = String(position.coords.latitude);
    if (lngInput) lngInput.value = String(position.coords.longitude);
  });
}

getLocation();

window.initGooglePlaces = function initGooglePlaces() {
  if (!window.google?.maps?.places || !addressInput) {
    if (locationHint) locationHint.textContent = "Google Places unavailable. Enter your full location manually.";
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
