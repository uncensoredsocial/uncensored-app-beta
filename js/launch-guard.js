(() => {
  const cfg = window.__UNCENSORED_LAUNCH__;
  if (!cfg || cfg.enabled === true) return;

  // Pages allowed before launch
  const allowedPages = [
    "",                 // /
    "index.html",
    "waitlist.html",
    "referrals.html",
    "donation.html"     // remove this line if you want donation blocked too
  ];

  const file = (location.pathname.split("/").pop() || "").toLowerCase();

  // If someone hits a blocked page, redirect to waitlist
  if (!allowedPages.includes(file)) {
    location.replace(cfg.redirect);
  }
})();
