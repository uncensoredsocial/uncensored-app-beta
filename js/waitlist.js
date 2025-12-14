// ===============================
// Countdown (Feb 28, 2026)
// ===============================
const cdDays = document.getElementById("cdDays");
const cdHours = document.getElementById("cdHours");
const cdMins = document.getElementById("cdMins");
const cdSecs = document.getElementById("cdSecs");
const statusPill = document.getElementById("statusPill");

const target = new Date(2026, 1, 28, 0, 0, 0); // local time

function pad2(n) { return String(n).padStart(2, "0"); }

function tick() {
  const now = new Date();
  let diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    cdDays.textContent = "0";
    cdHours.textContent = "00";
    cdMins.textContent = "00";
    cdSecs.textContent = "00";
    if (statusPill) statusPill.textContent = "LAUNCHED";
    return;
  }

  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;

  cdDays.textContent = String(days);
  cdHours.textContent = pad2(hours);
  cdMins.textContent = pad2(mins);
  cdSecs.textContent = pad2(secs);
}

tick();
setInterval(tick, 1000);

// Footer year
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();


// ===============================
// Waitlist form submit
// ===============================
const form = document.getElementById("waitlistForm");
const emailEl = document.getElementById("email");
const phoneEl = document.getElementById("phone");
const consentEmailEl = document.getElementById("consentEmail");
const consentSmsEl = document.getElementById("consentSms");
const alertEl = document.getElementById("formAlert");
const submitBtn = document.getElementById("submitBtn");

function showAlert(type, msg) {
  alertEl.className = "alert " + (type === "ok" ? "ok" : "bad");
  alertEl.textContent = msg;
  alertEl.style.display = "block";
}

function normalizePhone(p) {
  if (!p) return "";
  // keep digits + optional leading plus
  return p.trim().replace(/(?!^\\+)[^\\d]/g, "");
}

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertEl.style.display = "none";

  const email = (emailEl.value || "").trim();
  const phone = normalizePhone(phoneEl.value || "");
  const consentEmail = !!consentEmailEl.checked;
  const consentSms = !!consentSmsEl.checked;

  // Email required
  if (!email) {
    showAlert("bad", "Please enter your email to join the waitlist.");
    return;
  }
  if (!isValidEmail(email)) {
    showAlert("bad", "Please enter a valid email address.");
    return;
  }
  if (!consentEmail) {
    showAlert("bad", "Please agree to receive launch updates to join the waitlist.");
    return;
  }

  // Phone optional — but if provided require SMS consent
  if (phone && !consentSms) {
    showAlert("bad", "Check the SMS box if you want to submit a phone number for launch alerts.");
    return;
  }

  const payload = {
    email,
    phone: phone || null,
    consent_email: true,
    consent_sms: !!phone && consentSms
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Joining…";

  try {
    // Change this to your real backend endpoint
    // e.g. https://uncensored-app-beta-production.up.railway.app/api/leads
    const WAITLIST_ENDPOINT = "/api/leads";

    const res = await fetch(WAITLIST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showAlert("bad", data?.error || "Failed to join. Please try again.");
      return;
    }

    showAlert("ok", "You’re in. Watch your inbox for early access + launch updates.");
    form.reset();
  } catch (err) {
    showAlert("bad", "Network error. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Join waitlist";
  }
});

// Donation buttons (placeholder)
document.querySelectorAll("[data-donate]")?.forEach((btn) => {
  btn.addEventListener("click", () => {
    const amt = btn.getAttribute("data-donate");
    alert(`Hook this to your payment/crypto checkout later. Amount: $${amt}`);
  });
});

// Crypto checkout placeholder
document.getElementById("cryptoCheckoutBtn")?.addEventListener("click", () => {
  alert("Hook this to your crypto checkout page later.");
});
