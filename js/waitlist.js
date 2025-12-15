// waitlist.js

const WAITLIST_ENDPOINT =
  "https://uncensored-app-beta-production.up.railway.app/api/leads";

// ---------- Small helpers ----------
const pad2 = (n) => String(n).padStart(2, "0");

function showAlert(alertEl, type, msg) {
  if (!alertEl) return;
  alertEl.className = "alert " + (type === "ok" ? "ok" : "bad");
  alertEl.textContent = msg;
  alertEl.style.display = "block";
}

function hideAlert(alertEl) {
  if (!alertEl) return;
  alertEl.style.display = "none";
}

// ISO country -> emoji flag
function flagFromCC(cc) {
  return String(cc || "")
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

// Strict-ish email validation (blocks obvious fake patterns)
function isValidEmailStrict(emailRaw) {
  const email = String(emailRaw || "").trim();
  if (!email) return false;
  if (email.length > 254) return false;
  if (/\s/.test(email)) return false;

  const at = email.indexOf("@");
  if (at < 1) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (!local || !domain) return false;
  if (local.length > 64) return false;

  // local part rules
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (local.includes("..")) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;

  // domain rules: must contain a dot + reasonable labels
  if (!domain.includes(".")) return false;
  if (domain.includes("..")) return false;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) return false;

  const parts = domain.split(".");
  const tld = parts[parts.length - 1];
  if (!tld || tld.length < 2 || !/^[a-z]+$/i.test(tld)) return false;

  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  // ======================================================
  // Smooth scroll for header buttons / anchor links
  // ======================================================
  document.querySelectorAll("a[href^='#'], [data-scroll]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const href = el.getAttribute("href") || el.getAttribute("data-scroll");
      if (!href || !href.startsWith("#")) return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", href);
    });
  });

  // ======================================================
  // Countdown (robust, won’t break if IDs vary)
  // ======================================================
  (function initCountdown() {
    const cdDays =
      document.getElementById("cdDays") ||
      document.getElementById("days") ||
      document.querySelector("[data-cd='days']");

    const cdHours =
      document.getElementById("cdHours") ||
      document.getElementById("hours") ||
      document.querySelector("[data-cd='hours']");

    const cdMins =
      document.getElementById("cdMins") ||
      document.getElementById("mins") ||
      document.getElementById("minutes") ||
      document.querySelector("[data-cd='mins']");

    const cdSecs =
      document.getElementById("cdSecs") ||
      document.getElementById("secs") ||
      document.getElementById("seconds") ||
      document.querySelector("[data-cd='secs']");

    const statusPill =
      document.getElementById("statusPill") ||
      document.getElementById("launchStatus");

    // Feb 28, 2026 00:00:00 UTC
    const targetUTC = Date.UTC(2026, 1, 28, 0, 0, 0);

    function setText(el, v) {
      if (el) el.textContent = v;
    }

    function tick() {
      const now = Date.now();
      let diff = targetUTC - now;

      if (diff <= 0) {
        setText(cdDays, "0");
        setText(cdHours, "00");
        setText(cdMins, "00");
        setText(cdSecs, "00");
        if (statusPill) statusPill.textContent = "LIVE";
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = totalSeconds % 60;

      setText(cdDays, String(days));
      setText(cdHours, pad2(hours));
      setText(cdMins, pad2(mins));
      setText(cdSecs, pad2(secs));
    }

    tick();
    setInterval(tick, 1000);
  })();

  // Footer year (if you have #year)
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ======================================================
  // Country dropdown + phone validation (ALL countries)
  // ======================================================
  const countryBtn = document.getElementById("countryBtn");
  const countryMenu = document.getElementById("countryMenu");
  const phoneInput = document.getElementById("phone");

  // Your CSS uses .cc and .dial inside the button (not IDs)
  const ccEl =
    countryBtn?.querySelector(".cc") ||
    document.getElementById("countryFlag");
  const dialEl =
    countryBtn?.querySelector(".dial") ||
    document.getElementById("countryDial");

  // libphonenumber-js global name differs depending on bundle
  const lib =
    window.libphonenumber ||
    window.libphonenumberJs ||
    window.libphonenumberjs ||
    null;

  const hasLib =
    !!lib && typeof lib.getCountries === "function" && typeof lib.getCountryCallingCode === "function" && typeof lib.parsePhoneNumberFromString === "function";

  // Region display names
  const intlNames =
    typeof Intl !== "undefined" && Intl.DisplayNames
      ? new Intl.DisplayNames(["en"], { type: "region" })
      : null;

  function countryName(cc) {
    if (!intlNames) return cc;
    return intlNames.of(cc) || cc;
  }

  // Build country list
  let countries = [];
  if (hasLib) {
    countries = lib
      .getCountries()
      .map((cc) => ({
        cc,
        name: countryName(cc),
        dial: "+" + lib.getCountryCallingCode(cc),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // Fallback if libphonenumber didn't load
    countries = [
      { cc: "US", name: "United States", dial: "+1" },
      { cc: "CA", name: "Canada", dial: "+1" },
      { cc: "GB", name: "United Kingdom", dial: "+44" },
    ];
  }

  // Default selection
  let selected =
    countries.find((c) => c.cc === "US") || countries[0] || { cc: "US", name: "United States", dial: "+1" };

  function renderSelected() {
    if (ccEl) ccEl.textContent = flagFromCC(selected.cc);
    if (dialEl) dialEl.textContent = selected.dial;
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

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selected = c;
        renderSelected();
        closeCountryMenu();
        phoneInput && phoneInput.focus();
      });

      countryMenu.appendChild(btn);
    }
  }

  function openCountryMenu() {
    if (!countryMenu) return;
    buildMenu();
    countryMenu.classList.add("open");
    countryMenu.setAttribute("aria-hidden", "false");
  }

  function closeCountryMenu() {
    if (!countryMenu) return;
    countryMenu.classList.remove("open");
    countryMenu.setAttribute("aria-hidden", "true");
  }

  function toggleCountryMenu() {
    if (!countryMenu) return;
    if (countryMenu.classList.contains("open")) closeCountryMenu();
    else openCountryMenu();
  }

  // IMPORTANT: prevent instant-close from outside click handler
  countryBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleCountryMenu();
  });

  countryMenu?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.addEventListener("click", () => closeCountryMenu());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCountryMenu();
  });

  renderSelected();

  function phoneToE164(raw) {
    const value = String(raw || "").trim();
    if (!value) return null;

    if (hasLib) {
      const parsed = lib.parsePhoneNumberFromString(value, selected.cc);
      if (!parsed) return null;
      if (!parsed.isValid()) return null;
      return parsed.number; // E.164
    }

    // fallback: basic digits + dial code
    const digits = value.replace(/\D/g, "");
    if (!digits) return null;
    const dialDigits = selected.dial.replace(/\D/g, "");
    const e164 = `+${dialDigits}${digits.replace(/^0+/, "")}`;
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
    return e164;
  }

  // ======================================================
  // Waitlist submit (success message + validation)
  // ======================================================
  const form = document.getElementById("waitlistForm");
  const emailInput = document.getElementById("email");
  const consent = document.getElementById("consentEmail"); // your single consent box
  const alertEl = document.getElementById("formAlert");
  const submitBtn = document.getElementById("submitBtn");

  // spam honeypot + timing (your backend can use this)
  const pageLoadTs = Date.now();

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert(alertEl);

    const email = (emailInput?.value || "").trim();
    const phoneRaw = (phoneInput?.value || "").trim();

    if (!isValidEmailStrict(email)) {
      showAlert(alertEl, "bad", "Enter a real email like name@domain.com.");
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

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Joining…";
    }

    try {
      const payload = {
        email,
        consent_updates: true,

        phone_e164: phone_e164,
        phone_dial: phone_e164 ? selected.dial : null,
        phone_country: phone_e164 ? selected.name : null,

        // spam helpers
        website: "",
        ts: pageLoadTs,
      };

      const res = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showAlert(alertEl, "bad", data?.error || "Failed to join. Try again.");
        return;
      }

      if (data?.duplicate) {
        showAlert(alertEl, "ok", "You’re already on the waitlist — you’re good.");
      } else {
        showAlert(alertEl, "ok", "Success — you’re on the waitlist. Watch your inbox.");
      }

      form.reset();
      renderSelected();
    } catch (err) {
      showAlert(alertEl, "bad", "Network error. Please try again.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Join waitlist";
      }
    }
  });
});
