(() => {
  const launch = window.LAUNCH_ENABLED === true;

  // pages you want blocked until launch:
  const blockedPages = ["/login.html", "/signup.html"];

  const path = location.pathname.toLowerCase();
  if (!launch && blockedPages.includes(path)) {
    location.replace(window.PRELAUNCH_REDIRECT || "/waitlist.html");
  }
})();
