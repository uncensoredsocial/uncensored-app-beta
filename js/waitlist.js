// =============================
// Countdown + Waitlist Form
// =============================

// Countdown elements
const cdDays = document.getElementById("cdDays");
const cdHours = document.getElementById("cdHours");
const cdMins = document.getElementById("cdMins");
const cdSecs = document.getElementById("cdSecs");
const statusPill = document.getElementById("statusPill");

// Target: Feb 28, 2026 00:00:00 local time
const target = new Date(2026, 1, 28, 0, 0, 0);

function pad2(n) { return String(n).padStart(2, "0"); }

function tick() {
  const now = new Date();
  let diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    cdDays.textContent = "0";
    cdHours.textContent = "00";
    cdMins.textContent = "00";
    cdSecs.textContent = "00";
    statusPill.textContent = "LAUNCHED?";
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

// =============================
// Waitlist form submit
// =============================
const form = document.getElementById("waitlistForm");
const alertBox = document.getElementById("formAlert");
const submitBtn = document.getElementById("submitBtn");

function showAlert(type, msg) {
  alertBox.className = "alert " + (type === "ok" ? "ok" : "bad");
  alertBox.textContent = msg;
  alertBox.style.display = "block";
}

function normalizeUsername(u) {
  if (!u) return "";
  return u.trim().replace(/^@+/, "").replace(/\s+/g, "");
}

function normalizePhone(p) {
  if (!p) return "";
  // Keep digits and a leading plus. Strip everything else.
  return p.trim().replace(/(?!^\+)[^\d]/g, "").replace(/\s+/g, "");
}

function isValidUsername(u) {
  if (!u) return true; // optional
  return /^[a-zA-Z0-9_]{3,24}$/.test(u);
}

function isValidEmail(e) {
  if (!e) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertBox.style.display = "none";

  const usernameRaw = document.getElementById("username").value;
  const emailRaw = document.getElementById("email").value.trim();
  const phoneRaw = document.getElementById("phone").value;
  const source = (document.getElementById("source").value || "").trim() || "waitlist_page";

  const username = normalizeUsername(usernameRaw);
  const phone = normalizePhone(phoneRaw);
  const email = emailRaw;

  const consentEmail = document.getElementById("consentEmail").checked;
  const consentSms = document.getElementById("consentSms").checked;

  // Require email OR phone
  if (!email && !phone) {
    showAlert("bad", "Please enter an email or a phone number.");
    return;
  }

  if (email && !isValidEmail(email)) {
    showAlert("bad", "Please enter a valid email address.");
    return;
  }

  // If email provided, require email consent
  if (email && !consentEmail) {
    showAlert("bad", "Please check the Email updates box to submit an email.");
    return;
  }

  // If phone provided, require SMS consent (since phone field is for SMS alert)
  if (phone && !consentSms) {
    showAlert("bad", "Please check the SMS launch alert box to submit a phone number.");
    return;
  }

  if (!isValidUsername(username)) {
    showAlert("bad", "Username must be 3–24 characters (letters, numbers, underscore).");
    return;
  }

  const payload = {
    username: username || null,
    email: email || null,
    phone: phone || null,
    source,
    consent_email: !!(email && consentEmail),
    consent_sms: !!(phone && consentSms)
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  try {
    // IMPORTANT: change this to your real backend endpoint later.
    // Example: https://uncensored-app-beta-production.up.railway.app/api/leads
    const WAITLIST_ENDPOINT = "/api/leads";

    const res = await fetch(WAITLIST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showAlert("bad", data?.error || "Failed to join waitlist. Please try again.");
      return;
    }

    showAlert("ok", "You’re on the list. Watch for launch updates + early access.");
    form.reset();
    document.getElementById("source").value = "waitlist_page";
  } catch (err) {
    showAlert("bad", "Network error. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Join waitlist";
  }
});

// Donate buttons (placeholder behavior)
document.querySelectorAll("[data-donate]")?.forEach((btn) => {
  btn.addEventListener("click", () => {
    const amt = btn.getAttribute("data-donate");
    alert(`Hook this button to your payment/crypto checkout later. Amount: $${amt}`);
  });
});
