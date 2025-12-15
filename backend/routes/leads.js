// backend/routes/leads.js
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ===============================
// In-memory rate limiter (NO DB, NO extra deps)
// ===============================
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 10; // 10 submissions/hour/IP
const ipHits = new Map();

function rateLimit(req, res, next) {
  // req.ip works properly if trust proxy is set in server.js (see below)
  const ip = req.ip || "unknown";

  const now = Date.now();
  const entry = ipHits.get(ip);

  if (!entry) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }

  // reset window
  if (now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }

  // block if over limit
  if (entry.count >= RATE_MAX) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }

  entry.count += 1;
  ipHits.set(ip, entry);
  return next();
}

// cleanup map occasionally so it doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipHits.entries()) {
    if (now > entry.resetAt + 5 * 60 * 1000) {
      ipHits.delete(ip);
    }
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
      phone_e164,
      phone_country,
      phone_dial,
      consent_updates,
      website, // honeypot (must be empty)
      ts       // timing (ms since epoch)
    } = req.body || {};

    // Honeypot (bots fill hidden fields)
    if (typeof website === "string" && website.trim() !== "") {
      return res.status(200).json({ ok: true });
    }

    // Timing check (blocks instant-submit bots)
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
      // Unique violation => treat as success (prevents retries spamming)
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
