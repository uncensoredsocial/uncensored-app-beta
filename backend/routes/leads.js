// backend/routes/leads.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// In-memory rate limit (does not store IP in DB)
const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                  // 10/hour per IP
  standardHeaders: true,
  legacyHeaders: false
});

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
}

function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

router.post("/", leadLimiter, async (req, res) => {
  try {
    const {
      email,
      phone_e164,       // expect E.164 from frontend OR null
      phone_country,    // optional
      phone_dial,       // optional
      consent_updates,
      website,          // honeypot (should be empty)
      ts                // timing (ms) - optional
    } = req.body || {};

    // Honeypot: bots fill hidden fields
    if (typeof website === "string" && website.trim() !== "") {
      return res.status(200).json({ ok: true });
    }

    // Timing check: blocks instant-submit bots
    if (typeof ts === "number") {
      const delta = Date.now() - ts;
      if (delta < 1200) return res.status(429).json({ error: "Too fast. Try again." });
      if (delta > 1000 * 60 * 60 * 24 * 7) return res.status(400).json({ error: "Invalid request." });
    }

    const e = normalizeEmail(email);
    if (!e || !isValidEmail(e)) {
      return res.status(400).json({ error: "Invalid email" });
    }

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

    const { error } = await supabase.from("leads").insert({
      email: e,
      phone_e164: p,
      phone_country: p ? (phone_country || null) : null,
      phone_dial: p ? (phone_dial || null) : null,
      consent_updates: true
    });

    if (error) {
      // Unique violation => treat as success
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
