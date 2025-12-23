// js/ref-capture.js
(function () {
  try {
    const p = new URLSearchParams(window.location.search);
    const ref = (p.get("ref") || "").trim();
    if (ref) {
      localStorage.setItem("pending_ref", ref);

      // optional: clean URL so it looks nicer after capture
      const clean = window.location.pathname;
      history.replaceState({}, "", clean);
    }
  } catch {}
})();
