// 🔒 PRE-LAUNCH SETTINGS (single source of truth)
window.__UNCENSORED_LAUNCH__ = {
  enabled: false, // 🔁 flip to true on launch day

  // Where NON-logged-in users get sent
  redirect: "waitlist.html",

  // Where logged-in users land after signup/login during pre-launch
  prelaunchPage: "prelaunch.html",

  // Launch countdown (used by prelaunch page)
  launchDateISO: "2026-02-28T20:00:00Z",
  launchDateText: "Feb 28, 2026 — 12:00 PM PST",

  // Repo base (important for referrals)
  baseUrl: "https://uncensoredsocial.github.io/uncensored-app-beta/",

  // ✅ Admin allowlist
  adminEmails: [
    "ssssss@gmail.com",
    "eeeeee@gmail.com"
  ],

  // ✅ Pages always accessible pre-launch (no redirect loops)
  // NOTE: these MUST match window.location.pathname values on GitHub Pages
  publicPathsAllow: [
    "/uncensored-app-beta/",
    "/uncensored-app-beta/index.html",

    "/uncensored-app-beta/waitlist.html",
    "/uncensored-app-beta/prelaunch.html",
    "/uncensored-app-beta/signup.html",
    "/uncensored-app-beta/login.html",
    "/uncensored-app-beta/referrals.html",
    "/uncensored-app-beta/donation.html"
  ],

  // ✅ Admins can access EVERYTHING pre-launch
  adminBypassAllPages: true
};
