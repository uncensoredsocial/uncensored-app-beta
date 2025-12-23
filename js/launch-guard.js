// js/launch-guard.js
(async function () {
  const cfg = window.__UNCENSORED_LAUNCH__ || {};
  if (cfg.enabled === true) return; // launch live

  const redirect = cfg.redirect || "waitlist.html";
  const admins = (cfg.adminEmails || []).map(e => String(e).toLowerCase());
  const adminBypassAll = cfg.adminBypassAllPages !== false;

  const path = window.location.pathname;

  // ✅ Always allow these pages to load prelaunch
  const allow = new Set(cfg.publicPathsAllow || []);
  if (allow.has(path)) return;

  // If Supabase isn’t present, we cannot check admin => redirect
  if (!window.supabase) {
    window.location.replace(redirect);
    return;
  }

  // Create Supabase client
  const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  try {
    const { data } = await sb.auth.getUser();
    const email = (data?.user?.email || "").toLowerCase();

    // Not logged in => block platform pages
    if (!email) {
      window.location.replace(redirect);
      return;
    }

    // Logged in but not admin => block platform pages
    const isAdmin = admins.includes(email);
    if (!isAdmin) {
      window.location.replace(redirect);
      return;
    }

    // Admin => allow everything (or allow only adminPathsAllowAll if you ever want to tighten)
    if (adminBypassAll) return;

    const adminAllow = new Set(cfg.adminPathsAllowAll || []);
    if (!adminAllow.has(path)) {
      window.location.replace(redirect);
    }
  } catch {
    window.location.replace(redirect);
  }
})();
