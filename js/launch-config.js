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
     ✅ NEW: Admin allowlist (ONLY these emails can use the real app
     during pre-launch; everyone else gets redirected)
     ============================================================ */
  adminEmails: [
    // TODO: put your real admin emails here (lowercase preferred)
    "ssssss@gmail.com"
    "eeeeee@gmail.com
  ],

  /* ============================================================
     ✅ NEW: Pages that should ALWAYS be accessible pre-launch
     (public funnel pages). This prevents redirect loops.
     Use pathnames that match your repo base.
     ============================================================ */
  publicPathsAllow: [
    "/uncensored-app-beta/",
    "/uncensored-app-beta/index.html",

    "/uncensored-app-beta/waitlist.html",
    "/uncensored-app-beta/prelaunch.html",
    "/uncensored-app-beta/referrals.html",

    // if you keep signup enabled for referrals:
    "/uncensored-app-beta/signup.html",

    // donation page etc if you want them public:
    "/uncensored-app-beta/donation.html"
  ],

  /* ============================================================
     ✅ NEW: Admin bypass for ALL pages
     If true, admins can access any page pre-launch (recommended).
     ============================================================ */
  adminBypassAllPages: true,

  /* ============================================================
     ✅ NEW: Optional extra admin-only pages you always want allowed,
     even if you later tighten publicPathsAllow.
     (Only used if your guard checks it.)
     ============================================================ */
  adminPathsAllowAll: [
    "/uncensored-app-beta/index.html",
    "/uncensored-app-beta/messages.html",
    "/uncensored-app-beta/search.html",
    "/uncensored-app-beta/notifications.html",
    "/uncensored-app-beta/profile.html",
    "/uncensored-app-beta/settings.html",
    "/uncensored-app-beta/admin.html"
  ]
};
