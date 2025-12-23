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

  /* ============================================================
     ✅ Admin allowlist (ONLY these emails can use the real app
     during pre-launch; everyone else gets redirected)
     ============================================================ */
  adminEmails: [
    "ssssss@gmail.com",
    "eeeeee@gmail.com"
  ],

  /* ============================================================
     ✅ Pages that should ALWAYS be accessible pre-launch
     (public funnel pages). This prevents redirect loops.
     ============================================================ */
  publicPathsAllow: [
    "/uncensored-app-beta/",
    "/uncensored-app-beta/index.html",

    "/uncensored-app-beta/waitlist.html",
    "/uncensored-app-beta/prelaunch.html",
    "/uncensored-app-beta/referrals.html",

    // signup for referrals
    "/uncensored-app-beta/signup.html",

    // ✅ LOGIN PAGE MUST BE ALLOWED
    "/uncensored-app-beta/login.html",

    // optional
    "/uncensored-app-beta/donation.html"
  ],

  /* ============================================================
     ✅ Admin bypass for ALL pages
     ============================================================ */
  adminBypassAllPages: true,

  /* ============================================================
     ✅ Optional extra admin-only pages
     ============================================================ */
  adminPathsAllowAll: [
    "/uncensored-app-beta/index.html",
    "/uncensored-app-beta/messages.html",
    "/uncensored-app-beta/search.html",
    "/uncensored-app-beta/notifications.html",
    "/uncensored-app-beta/profile.html",
    "/uncensored-app-beta/settings.html",
    "/uncensored-app-beta/admin.html"
    "/uncensored-app-beta/post.html"
    "/uncensored-app-beta/user.html
  ]
};
