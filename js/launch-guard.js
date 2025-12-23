// js/launch-guard.js
(async function () {
  const cfg = window.__UNCENSORED_LAUNCH__ || {};
  if (cfg.enabled === true) return;

  const redirect = cfg.redirect || "waitlist.html";
  const admins = (cfg.adminEmails || []).map(e => String(e).toLowerCase());
  const path = window.location.pathname;

  // ✅ Always allow public funnel pages
  const allow = new Set(cfg.publicPathsAllow || []);
  if (allow.has(path)) return;

  // If Supabase isn't loaded on this page, we can't check admin session.
  // For safety, redirect.
  if (!window.supabase) {
    window.location.replace(redirect);
    return;
  }

  const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  try {
    const { data } = await sb.auth.getUser();
    const email = (data?.user?.email || "").toLowerCase();

    // Not logged in => block
    if (!email) {
      window.location.replace(redirect);
      return;
    }

    // Admin bypass => allow everything
    if (cfg.adminBypassAllPages === true && admins.includes(email)) return;

    // Non-admin logged in pre-launch => still blocked from the real app
    window.location.replace(cfg.prelaunchPage || "prelaunch.html");
  } catch {
    window.location.replace(redirect);
  }
})();
