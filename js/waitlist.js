// waitlist.js
const WAITLIST_ENDPOINT = "https://uncensored-app-beta-production.up.railway.app/api/leads";

function pad2(n) { return String(n).padStart(2, "0"); }
function show(el, yes) { if (el) el.style.display = yes ? "block" : "none"; }

function showAlert(alertEl, type, msg) {
  if (!alertEl) return;
  alertEl.className = "alert " + (type === "ok" ? "ok" : "bad");
  alertEl.textContent = msg;
  alertEl.style.display = "block";
}

// ISO country -> emoji flag
function flagFromCC(cc) {
  return cc
    .toUpperCase()
    .replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

// Stronger email validation (still not “proof it exists”, but blocks junk)
function isValidEmailStrict(emailRaw) {
  const email = String(emailRaw || "").trim();
  if (!email) return false;
  if (email.length > 254) return false;

  const at = email.indexOf("@");
  if (at < 1) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  // local part checks
  if (local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (local.includes("..")) return false;

  // domain checks
  if (!domain || domain.length < 4) return false;
  if (domain.startsWith("-") || domain.endsWith("-")) return false;
  if (domain.includes("..")) return false;
  if (!domain.includes(".")) return false;

  // no spaces
  if (/\s/.test(email)) return false;

  // require a valid-ish domain and TLD
  // - labels: letters/numbers/hyphen
  // - tld: at least 2 letters
  const domainOk = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain);
  if (!domainOk) return false;

  const tld = domain.split(".").pop();
  if (!tld || tld.length < 2 || !/^[a-z]+$/i.test(tld)) return false;

  // basic allowed chars in local
  const localOk = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local);
  if (!localOk) return false;

  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  // Smooth scroll buttons
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

  // Countdown (UTC Feb 28, 2026 00:00:00)
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
      cdDays && (cdDays.textContent = "0");
      cdHours && (cdHours.textContent = "00");
      cdMins && (cdMins.textContent = "00");
      cdSecs && (cdSecs.textContent = "00");
      statusPill && (statusPill.textContent = "LIVE");
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    cdDays && (cdDays.textContent = String(days));
    cdHours && (cdHours.textContent = pad2(hours));
    cdMins && (cdMins.textContent = pad2(mins));
    cdSecs && (cdSecs.textContent = pad2(secs));
  }

  tick();
  setInterval(tick, 1000);

  // Footer year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ========= Country picker (ALL COUNTRIES) =========
  // Requires libphonenumber-js script loaded before this file.
  const lib = window.libphonenumber || window.libphonenumberJs || window.libphonenumberjs;
  const hasLib = !!(lib && (lib.getCountries || lib.parsePhoneNumberFromString));

  const countryBtn = document.getElementById("countryBtn");
  const countryMenu = document.getElementById("countryMenu");
  const countryFlag = document.getElementById("countryFlag");
  const countryDial = document.getElementById("countryDial");
  const phoneInput = document.getElementById("phone");

  const intlNames = (typeof Intl !== "undefined" && Intl.DisplayNames)
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

  function countryName(cc) {
    if (!intlNames) return cc;
    return intlNames.of(cc) || cc;
  }

  // Build countries list dynamically from lib metadata (every country supported)
  let countries = [];
  if (hasLib && lib.getCountries && lib.getCountryCallingCode) {
    const list = lib.getCountries(); // ["US","CA",...]
    countries = list
      .map(cc => ({
        cc,
        name: countryName(cc),
        dial: "+" + lib.getCountryCallingCode(cc)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // fallback minimal list if lib didn't load (still works for basic use)
    countries = [
      { cc: "US", name: "United States", dial: "+1" },
      { cc: "CA", name: "Canada", dial: "+1" },
      { cc: "GB", name: "United Kingdom", dial: "+44" }
    ];
  }

  let selected = countries.find(c => c.cc === "US") || countries[0];

  function renderSelected() {
    if (countryFlag) countryFlag.textContent = flagFromCC(selected.cc);
    if (countryDial) countryDial.textContent = selected.dial;
  }

  function buildMenu() {
    if (!countryMenu) return;
    countryMenu.innerHTML = "";

    for (const c of countries) {
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
    }
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

  countryMenu?.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => closeMenu());

  renderSelected();

  // Validate + convert phone by selected country rules
  function phoneToE164(raw) {
    const value = String(raw || "").trim();
    if (!value) return null;

    // if library exists, do real country-specific validation
    if (hasLib && lib.parsePhoneNumberFromString) {
      const parsed = lib.parsePhoneNumberFromString(value, selected.cc);
      if (!parsed) return null;
      if (!parsed.isValid()) return null;
      return parsed.number; // E.164 string
    }

    // fallback: basic digits -> E.164-ish
    const digits = value.replace(/\D/g, "");
    if (!digits) return null;
    const dialDigits = selected.dial.replace(/\D/g, "");
    const e164 = `+${dialDigits}${digits.replace(/^0+/, "")}`;
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
    return e164;
  }

  // ========= Form submit =========
  const form = document.getElementById("waitlistForm");
  const emailInput = document.getElementById("email");
  const consent = document.getElementById("consentEmail"); // your single checkbox
  const alertEl = document.getElementById("formAlert");
  const submitBtn = document.getElementById("submitBtn");

  const pageLoadTs = Date.now();

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    show(alertEl, false);

    const email = (emailInput?.value || "").trim();
    const phoneRaw = (phoneInput?.value || "").trim();

    if (!isValidEmailStrict(email)) {
      showAlert(alertEl, "bad", "Enter a real email (example: name@domain.com).");
      return;
    }

    if (!consent?.checked) {
      showAlert(alertEl, "bad", "Please agree to receive updates to join the waitlist.");
      return;
    }

    const phone_e164 = phoneRaw ? phoneToE164(phoneRaw) : null;
    if (phoneRaw && !phone_e164) {
      showAlert(alertEl, "bad", `Enter a valid phone number for ${selected.name}.`);
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
        website: "",
        ts: pageLoadTs
      };

      const res = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showAlert(alertEl, "bad", data?.error || "Failed to join. Try again.");
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
