// =====================================
// CONFIG
// =====================================
const WAITLIST_ENDPOINT =
  "https://uncensored-app-beta-production.up.railway.app/api/leads";

// =====================================
// Smooth scroll
// =====================================
document.querySelectorAll("[data-scroll]").forEach(link => {
  link.addEventListener("click", e => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// =====================================
// Countdown (Feb 28, 2026)
// =====================================
const targetDate = new Date(2026, 1, 28, 0, 0, 0);
const cdDays = document.getElementById("cdDays");
const cdHours = document.getElementById("cdHours");
const cdMins = document.getElementById("cdMins");
const cdSecs = document.getElementById("cdSecs");
const statusPill = document.getElementById("statusPill");

function pad(n) {
  return String(n).padStart(2, "0");
}

function updateCountdown() {
  const now = new Date();
  let diff = targetDate - now;

  if (diff <= 0) {
    cdDays.textContent = "0";
    cdHours.textContent = "00";
    cdMins.textContent = "00";
    cdSecs.textContent = "00";
    statusPill && (statusPill.textContent = "LIVE");
    return;
  }

  const s = Math.floor(diff / 1000);
  cdDays.textContent = Math.floor(s / 86400);
  cdHours.textContent = pad(Math.floor((s % 86400) / 3600));
  cdMins.textContent = pad(Math.floor((s % 3600) / 60));
  cdSecs.textContent = pad(s % 60);
}
updateCountdown();
setInterval(updateCountdown, 1000);

// =====================================
// Footer year
// =====================================
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// =====================================
// Country list (Telegram / libphonenumber coverage)
// Israel (IL) intentionally removed
// =====================================
const countries = [
  { cc: "US", name: "United States", dial: "+1" },
  { cc: "CA", name: "Canada", dial: "+1" },
  { cc: "MX", name: "Mexico", dial: "+52" },
  { cc: "GB", name: "United Kingdom", dial: "+44" },
  { cc: "AF", name: "Afghanistan", dial: "+93" },
  { cc: "AL", name: "Albania", dial: "+355" },
  { cc: "DZ", name: "Algeria", dial: "+213" },
  { cc: "AR", name: "Argentina", dial: "+54" },
  { cc: "AM", name: "Armenia", dial: "+374" },
  { cc: "AU", name: "Australia", dial: "+61" },
  { cc: "AT", name: "Austria", dial: "+43" },
  { cc: "AZ", name: "Azerbaijan", dial: "+994" },
  { cc: "BD", name: "Bangladesh", dial: "+880" },
  { cc: "BY", name: "Belarus", dial: "+375" },
  { cc: "BE", name: "Belgium", dial: "+32" },
  { cc: "BO", name: "Bolivia", dial: "+591" },
  { cc: "BR", name: "Brazil", dial: "+55" },
  { cc: "BG", name: "Bulgaria", dial: "+359" },
  { cc: "KH", name: "Cambodia", dial: "+855" },
  { cc: "CL", name: "Chile", dial: "+56" },
  { cc: "CN", name: "China", dial: "+86" },
  { cc: "CO", name: "Colombia", dial: "+57" },
  { cc: "CR", name: "Costa Rica", dial: "+506" },
  { cc: "HR", name: "Croatia", dial: "+385" },
  { cc: "CZ", name: "Czech Republic", dial: "+420" },
  { cc: "DK", name: "Denmark", dial: "+45" },
  { cc: "DO", name: "Dominican Republic", dial: "+1" },
  { cc: "EG", name: "Egypt", dial: "+20" },
  { cc: "EE", name: "Estonia", dial: "+372" },
  { cc: "FI", name: "Finland", dial: "+358" },
  { cc: "FR", name: "France", dial: "+33" },
  { cc: "GE", name: "Georgia", dial: "+995" },
  { cc: "DE", name: "Germany", dial: "+49" },
  { cc: "GR", name: "Greece", dial: "+30" },
  { cc: "HK", name: "Hong Kong", dial: "+852" },
  { cc: "HU", name: "Hungary", dial: "+36" },
  { cc: "IN", name: "India", dial: "+91" },
  { cc: "ID", name: "Indonesia", dial: "+62" },
  { cc: "IR", name: "Iran", dial: "+98" },
  { cc: "IE", name: "Ireland", dial: "+353" },
  // IL intentionally excluded
  { cc: "IT", name: "Italy", dial: "+39" },
  { cc: "JP", name: "Japan", dial: "+81" },
  { cc: "KZ", name: "Kazakhstan", dial: "+7" },
  { cc: "KE", name: "Kenya", dial: "+254" },
  { cc: "KR", name: "South Korea", dial: "+82" },
  { cc: "LV", name: "Latvia", dial: "+371" },
  { cc: "LT", name: "Lithuania", dial: "+370" },
  { cc: "MY", name: "Malaysia", dial: "+60" },
  { cc: "NL", name: "Netherlands", dial: "+31" },
  { cc: "NZ", name: "New Zealand", dial: "+64" },
  { cc: "NG", name: "Nigeria", dial: "+234" },
  { cc: "NO", name: "Norway", dial: "+47" },
  { cc: "PK", name: "Pakistan", dial: "+92" },
  { cc: "PH", name: "Philippines", dial: "+63" },
  { cc: "PL", name: "Poland", dial: "+48" },
  { cc: "PT", name: "Portugal", dial: "+351" },
  { cc: "RO", name: "Romania", dial: "+40" },
  { cc: "RU", name: "Russia", dial: "+7" },
  { cc: "SA", name: "Saudi Arabia", dial: "+966" },
  { cc: "RS", name: "Serbia", dial: "+381" },
  { cc: "SG", name: "Singapore", dial: "+65" },
  { cc: "SK", name: "Slovakia", dial: "+421" },
  { cc: "SI", name: "Slovenia", dial: "+386" },
  { cc: "ZA", name: "South Africa", dial: "+27" },
  { cc: "ES", name: "Spain", dial: "+34" },
  { cc: "SE", name: "Sweden", dial: "+46" },
  { cc: "CH", name: "Switzerland", dial: "+41" },
  { cc: "TH", name: "Thailand", dial: "+66" },
  { cc: "TR", name: "Turkey", dial: "+90" },
  { cc: "UA", name: "Ukraine", dial: "+380" },
  { cc: "AE", name: "United Arab Emirates", dial: "+971" },
  { cc: "VN", name: "Vietnam", dial: "+84" }
];

// =====================================
// Emoji flag helper
// =====================================
function flagFromCC(cc) {
  return cc
    .toUpperCase()
    .replace(/./g, c =>
      String.fromCodePoint(127397 + c.charCodeAt())
    );
}

// =====================================
// Country selector logic
// =====================================
let selectedCountry = countries[0];

const countryBtn = document.getElementById("countryBtn");
const countryMenu = document.getElementById("countryMenu");
const countryFlag = document.getElementById("countryFlag");
const countryDial = document.getElementById("countryDial");
const phoneInput = document.getElementById("phone");

function renderCountry() {
  countryFlag.textContent = flagFromCC(selectedCountry.cc);
  countryDial.textContent = selectedCountry.dial;
}

function openCountryMenu() {
  countryMenu.innerHTML = "";
  countries.forEach(c => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "countryItem";
    btn.innerHTML = `
      <span class="countryLeft">
        <span class="flag">${flagFromCC(c.cc)}</span>
        <span class="countryName">${c.name}</span>
      </span>
      <span class="countryCode">${c.dial}</span>
    `;
    btn.onclick = () => {
      selectedCountry = c;
      renderCountry();
      countryMenu.classList.remove("open");
      phoneInput.focus();
    };
    countryMenu.appendChild(btn);
.toggle();
  });
  countryMenu.classList.add("open");
}

countryBtn.addEventListener("click", e => {
  e.preventDefault();
  countryMenu.classList.toggle("open");
});

document.addEventListener("click", e => {
  if (!countryMenu.contains(e.target) && !countryBtn.contains(e.target)) {
    countryMenu.classList.remove("open");
  }
});

renderCountry();

// =====================================
// Phone normalize
// =====================================
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return selectedCountry.dial + digits.replace(/^0+/, "");
}

// =====================================
// Form submit
// =====================================
const form = document.getElementById("waitlistForm");
const emailInput = document.getElementById("email");
const consent = document.getElementById("consentEmail");
const alertBox = document.getElementById("formAlert");
const submitBtn = document.getElementById("submitBtn");

function showAlert(type, msg) {
  alertBox.className = "alert " + (type === "ok" ? "ok" : "bad");
  alertBox.textContent = msg;
  alertBox.style.display = "block";
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  alertBox.style.display = "none";

  const email = emailInput.value.trim();
  if (!email || !emailInput.checkValidity()) {
    showAlert("bad", "Enter a valid email address.");
    return;
  }

  if (!consent.checked) {
    showAlert("bad", "You must agree to receive updates.");
    return;
  }

  const phone = normalizePhone(phoneInput.value);

  submitBtn.disabled = true;
  submitBtn.textContent = "Joining…";

  try {
    const res = await fetch(WAITLIST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        phone,
        consent_updates: true,
        phone_country: phone ? selectedCountry.name : null,
        phone_dial: phone ? selectedCountry.dial : null
      })
    });

    if (!res.ok) throw new Error();

    showAlert("ok", "You’re in. Watch your inbox for launch updates.");
    form.reset();
    renderCountry();
  } catch {
    showAlert("bad", "Network error. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Join waitlist";
  }
});
