// js/launch-guard.js
(async function () {
  const cfg = window.__UNCENSORED_LAUNCH__ || {};
  if (cfg.enabled === true) return;

  const redirect = cfg.redirect || "waitlist.html";
  const prelaunch = cfg.prelaunchPage || "prelaunch.html";

  const path = window.location.pathname;

  // Public allowlist (funnel pages)
  const allow = new Set(cfg.publicPathsAllow || []);

  // Must have supabase loaded BEFORE this script
  if (!window.supabase) {
    // If you see this, add:
    // <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    // BEFORE <script src="js/launch-guard.js"></script> on every protected page.
    window.location.replace(redirect);
    return;
  }

  const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
  const SUPABASE_ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  const admins = new Set((cfg.adminEmails || []).map(e => String(e).toLowerCase()));

  // pages that should bounce admins to index (so they don’t get stuck on funnel pages)
  const adminBouncePaths = new Set([
    "/uncensored-app-beta/",
    "/uncensored-app-beta/waitlist.html",
    "/uncensored-app-beta/prelaunch.html",
    "/uncensored-app-beta/login.html",
    "/uncensored-app-beta/signup.html",
    "/uncensored-app-beta/donate.html",
    "/uncensored-app-beta/referrals.html"
  ]);

  try {
    // Get current auth user
    const { data: userData } = await sb.auth.getUser();
    const user = userData?.user;
    const email = (user?.email || "").toLowerCase();

    // 1) Not logged in
    if (!user || !email) {
      // if public page, allow
      if (allow.has(path)) return;

      // otherwise block
      window.location.replace(redirect);
      return;
    }

    // 2) Logged in admin (email allowlist) => allow everything
    if (cfg.adminBypassAllPages === true && admins.has(email)) {
      // If admin is on a funnel page, send them to index
      if (adminBouncePaths.has(path)) {
        window.location.replace("index.html");
        return;
      }
      return;
    }

    // 3) Logged in non-admin
    // If they are on a public page, allow it (login/signup/referrals/prelaunch/etc)
    if (allow.has(path)) return;

    // Otherwise, kick them to prelaunch
    window.location.replace(prelaunch);
  } catch (e) {
    window.location.replace(redirect);
  }
})();
