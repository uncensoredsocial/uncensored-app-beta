/// js/launch-guard.js
(async function () {
  const cfg = window.__UNCENSORED_LAUNCH__ || {};

  // ✅ If platform is live, do NOTHING
  if (cfg.enabled === true) return;

  const redirectGuest = cfg.redirect || "waitlist.html";
  const redirectUser = cfg.prelaunchPage || "prelaunch.html";

  const path = window.location.pathname;

  // ✅ Always-allowed pages (no guards)
  const allow = new Set(cfg.publicPathsAllow || []);
  if (allow.has(path)) return;

  // Supabase must exist
  if (!window.supabase) {
    window.location.replace(redirectGuest);
    return;
  }

  const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
  const SUPABASE_ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  try {
    const { data } = await sb.auth.getUser();
    const user = data?.user;
    const email = (user?.email || "").toLowerCase();

    // ❌ Not logged in → waitlist
    if (!user || !email) {
      window.location.replace(redirectGuest);
      return;
    }

    // ✅ ADMIN BYPASS — EXIT IMMEDIATELY
    const admins = (cfg.adminEmails || []).map(e => e.toLowerCase());
    if (admins.includes(email)) {
      // ✅ Admins ALWAYS stay on index.html or wherever they navigated
      return;
    }

    // 👤 Logged-in non-admin → prelaunch
    window.location.replace(redirectUser);

  } catch (err) {
    // Any unexpected error → waitlist
    window.location.replace(redirectGuest);
  }
})();
