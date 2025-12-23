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
  baseUrl: "https://uncensoredsocial.github.io/uncensored-app-beta/"
};
