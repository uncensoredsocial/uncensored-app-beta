// js/launch-guard.js
(async function () {
  const cfg = window.__UNCENSORED_LAUNCH__ || {};
  if (cfg.enabled === true) return;

  const redirect = cfg.redirect || "waitlist.html";
  const path = window.location.pathname;

  // ✅ Allow public pages always (no redirect loops)
  const allow = new Set(cfg.publicPathsAllow || []);
  if (allow.has(path)) return;

  // Must have supabase loaded BEFORE this script
  if (!window.supabase) {
    window.location.replace(redirect);
    return;
  }

  const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  try {
    // 1) Must be logged in
    const { data: userData } = await sb.auth.getUser();
    const user = userData?.user;
    const email = (user?.email || "").toLowerCase();

    if (!user || !email) {
      window.location.replace(redirect);
      return;
    }

    // 2) Quick allowlist bypass (optional)
    const admins = (cfg.adminEmails || []).map(e => String(e).toLowerCase());
    if (cfg.adminBypassAllPages === true && admins.includes(email)) {
      return; // ✅ admin can access ANY page
    }

    // 3) Strong check: confirm is_admin from public.users
    const { data: row, error } = await sb
      .from("users")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      window.location.replace(redirect);
      return;
    }

    if (row?.is_admin === true) {
      return; // ✅ admin can access ANY page
    }

    // Non-admin -> blocked prelaunch
    window.location.replace(cfg.prelaunchPage || redirect);
  } catch (e) {
    window.location.replace(redirect);
  }
})();
