(() => {
  const cfg = window.__UNCENSORED_LAUNCH__;
  if (!cfg || cfg.enabled === true) return;

  const allowedPages = [
    "",                 // /
    "index.html",
    "waitlist.html",
    "referrals.html"
  ];

  const file = (location.pathname.split("/").pop() || "").toLowerCase();

  if (!allowedPages.includes(file)) {
    location.replace(cfg.redirect);
  }
})();
