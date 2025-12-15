// ===== CONFIG =====
const WAITLIST_ENDPOINT = "https://uncensored-app-beta-production.up.railway.app/api/leads";

// ===== Helpers =====
function pad2(n) { return String(n).padStart(2, "0"); }
function show(el, yes) { if (el) el.style.display = yes ? "block" : "none"; }

function showAlert(alertEl, type, msg) {
  if (!alertEl) return;
  alertEl.className = "alert " + (type === "ok" ? "ok" : "bad");
  alertEl.textContent = msg;
  alertEl.style.display = "block";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Convert ISO CC -> emoji flag
function flagFromCC(cc) {
  return cc
    .toUpperCase()
    .replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

document.addEventListener("DOMContentLoaded", () => {
  // ===== Smooth scroll =====
  document.querySelectorAll("[data-scroll]").forEach(a => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", href);
    });
  });

  // ===== Countdown (UTC Feb 28, 2026 00:00:00) =====
  const cdDays = document.getElementById("cdDays");
  const cdHours = document.getElementById("cdHours");
  const cdMins = document.getElementById("cdMins");
  const cdSecs = document.getElementById("cdSecs");
  const statusPill = document.getElementById("statusPill");

  const targetUTC = Date.UTC(2026, 1, 28, 0, 0, 0);

  function tick() {
    const now = Date.now();
    let diff = targetUTC - now;

    if (diff <= 0) {
      if (cdDays) cdDays.textContent = "0";
      if (cdHours) cdHours.textContent = "00";
      if (cdMins) cdMins.textContent = "00";
      if (cdSecs) cdSecs.textContent = "00";
      if (statusPill) statusPill.textContent = "LIVE";
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (cdDays) cdDays.textContent = String(days);
    if (cdHours) cdHours.textContent = pad2(hours);
    if (cdMins) cdMins.textContent = pad2(mins);
    if (cdSecs) cdSecs.textContent = pad2(secs);
  }

  tick();
  setInterval(tick, 1000);

  // Footer year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ===== Country dropdown (emoji + dial) =====
  // (If you already have a bigger list, keep it — this is the working logic.)
  const countries = [
    { cc: "US", name: "United States", dial: "+1" },
    { cc: "CA", name: "Canada", dial: "+1" },
    { cc: "GB", name: "United Kingdom", dial: "+44" },
    { cc: "AU", name: "Australia", dial: "+61" },
    { cc: "DE", name: "Germany", dial: "+49" },
    { cc: "FR", name: "France", dial: "+33" },
    { cc: "ES", name: "Spain", dial: "+34" },
    { cc: "IT", name: "Italy", dial: "+39" },
    { cc: "IN", name: "India", dial: "+91" },
    { cc: "JP", name: "Japan", dial: "+81" },
    { cc: "KR", name: "South Korea", dial: "+82" },
    { cc: "MX", name: "Mexico", dial: "+52" }
  ];

  let selected = countries[0];

  const countryBtn = document.getElementById("countryBtn");
  const countryMenu = document.getElementById("countryMenu");
  const countryFlag = document.getElementById("countryFlag");
  const countryDial = document.getElementById("countryDial");
  const phoneInput = document.getElementById("phone");

  function renderSelected() {
    if (countryFlag) countryFlag.textContent = flagFromCC(selected.cc);
    if (countryDial) countryDial.textContent = selected.dial;
  }

  function buildMenu() {
    if (!countryMenu) return;
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
      btn.addEventListener("click", () => {
        selected = c;
        renderSelected();
        countryMenu.classList.remove("open");
        phoneInput && phoneInput.focus();
      });
      countryMenu.appendChild(btn);
    });
  }

  function openMenu() {
    buildMenu();
    countryMenu.classList.add("open");
    countryMenu.setAttribute("aria-hidden", "false");
  }
  function closeMenu() {
    countryMenu.classList.remove("open");
    countryMenu.setAttribute("aria-hidden", "true");
  }

  countryBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (countryMenu.classList.contains("open")) closeMenu();
    else openMenu();
  });

  countryMenu?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.addEventListener("click", () => closeMenu());

  renderSelected();

  // Normalize phone to E.164-ish: +<countrycode><digits>
  function toE164(raw) {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (!digits) return null;
    const cleaned = digits.replace(/^0+/, "");
    // combine dial code digits + local digits
    const dialDigits = selected.dial.replace(/\D/g, "");
    const e164 = `+${dialDigits}${cleaned}`;
    // basic length check
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
    return e164;
  }

  // ===== Form submit =====
  const form = document.getElementById("waitlistForm");
  const emailInput = document.getElementById("email");
  const consent = document.getElementById("consentEmail");
  const alertEl = document.getElementById("formAlert");
  const submitBtn = document.getElementById("submitBtn");

  // honeypot + timing
  const pageLoadTs = Date.now();

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    show(alertEl, false);

    const email = (emailInput?.value || "").trim();
    const phoneRaw = (phoneInput?.value || "").trim();

    if (!email || !isValidEmail(email)) {
      showAlert(alertEl, "bad", "Please enter a valid email address.");
      return;
    }
    if (!consent?.checked) {
      showAlert(alertEl, "bad", "Please agree to receive updates to join the waitlist.");
      return;
    }

    const phone_e164 = phoneRaw ? toE164(phoneRaw) : null;
    if (phoneRaw && !phone_e164) {
      showAlert(alertEl, "bad", "Please enter a valid phone number for the selected country.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Joining…";

    try {
      const payload = {
        email,
        phone_e164,
        phone_country: phone_e164 ? selected.name : null,
        phone_dial: phone_e164 ? selected.dial : null,
        consent_updates: true,

        // spam controls
        website: "",           // honeypot
        ts: pageLoadTs         // timing
      };

      const res = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showAlert(alertEl, "bad", data?.error || "Failed to join. Please try again.");
        return;
      }

      if (data?.duplicate) {
        showAlert(alertEl, "ok", "You’re already on the list — you’re good.");
      } else {
        showAlert(alertEl, "ok", "Success — you’re on the waitlist. Watch your inbox.");
      }

      form.reset();
      renderSelected();
    } catch {
      showAlert(alertEl, "bad", "Network error. Please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Join waitlist";
    }
  });
});
