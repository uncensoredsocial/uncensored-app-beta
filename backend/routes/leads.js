// backend/routes/leads.js
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ===============================
// In-memory rate limit (no DB storage)
// ===============================
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 10;
const ipHits = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const entry = ipHits.get(ip);

  if (!entry) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }

  if (now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }

  if (entry.count >= RATE_MAX) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }

  entry.count += 1;
  ipHits.set(ip, entry);
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipHits.entries()) {
    if (now > entry.resetAt + 5 * 60 * 1000) ipHits.delete(ip);
  }
}, 10 * 60 * 1000);

// ===============================
// Validators
// ===============================
function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
}

function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

// ===============================
// POST /api/leads
// ===============================
router.post("/", rateLimit, async (req, res) => {
  try {
    const {
      email,
      phone_e164,        // frontend should send E.164 like +14155552671 (or null)
      phone_country,
      phone_dial,
      consent_updates,   // your single checkbox
      website,           // honeypot
      ts                 // timing
    } = req.body || {};

    // honeypot
    if (typeof website === "string" && website.trim() !== "") {
      return res.status(200).json({ ok: true });
    }

    // timing check
    if (typeof ts === "number") {
      const delta = Date.now() - ts;
      if (delta < 1200) return res.status(429).json({ error: "Too fast. Try again." });
      if (delta > 1000 * 60 * 60 * 24 * 7) return res.status(400).json({ error: "Invalid request." });
    }

    const e = normalizeEmail(email);
    if (!e || !isValidEmail(e)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    // You have ONE checkbox now:
    // - it must be checked
    // - it covers email updates AND SMS (if they provide a phone)
    if (!consent_updates) {
      return res.status(400).json({ error: "Consent required" });
    }

    let p = null;
    if (phone_e164) {
      const cleaned = String(phone_e164).trim();
      if (!isValidE164(cleaned)) {
        return res.status(400).json({ error: "Invalid phone number" });
      }
      p = cleaned;
    }

    // ✅ IMPORTANT:
    // Your table has BOTH phone and phone_e164.
    // Store the phone number in both (so it shows in the `phone` column too).
    const insertRow = {
      email: e,

      // show up in your DB phone column:
      phone: p,          // store E.164 in phone too (passes your phone CHECK)
      phone_e164: p,

      phone_country: p ? (phone_country || null) : null,
      phone_dial: p ? (phone_dial || null) : null,

      // map your single checkbox into your existing schema:
      consent_updates: true,
      consent_email: true,
      consent_sms: !!p,              // only true if phone provided

      // keep these empty to respect "no IP tracking"
      consent_ip: null,
      consent_user_agent: null
    };

    const { error } = await supabase.from("leads").insert(insertRow);

    if (error) {
      // If you add unique indexes later, duplicates return 23505
      if (error.code === "23505") {
        return res.status(200).json({ ok: true, duplicate: true });
      }
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: "Server error" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Lead endpoint failed:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
