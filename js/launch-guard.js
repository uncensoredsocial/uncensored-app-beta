(((() => {
  if (window.LAUNCH_ENABLED === true) return;

  // allowed pre-launch pages
  const allowed = ["referrals.html", "waitlist.html", "index.html", ""];
  const file = (location.pathname.split("/").pop() || "").toLowerCase();

  if (!allowed.includes(file)) {
    location.replace(window.PRELAUNCH_REDIRECT || "referrals.html");
  }
})();
