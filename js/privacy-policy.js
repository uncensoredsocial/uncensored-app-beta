// privacy-policy.js
// Small helpers: footer year, smooth scroll, active TOC item

document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.getElementById("currentYear");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear().toString();
  }

  const tocLinks = document.querySelectorAll(".policy-toc-link");
  const sections = Array.from(document.querySelectorAll(".policy-section[id]"));

  // Smooth scroll
  tocLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      const top =
        target.getBoundingClientRect().top + window.scrollY - 90; // header offset
      window.scrollTo({ top, behavior: "smooth" });
    });
  });

  // Highlight active section
  const highlightActiveSection = () => {
    const scrollPos = window.scrollY;
    const mid = scrollPos + window.innerHeight / 2;
    let activeId = null;

    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = top + rect.height;
      if (mid >= top && mid <= bottom) {
        activeId = section.id;
        break;
      }
    }

    tocLinks.forEach((link) => {
      const href = link.getAttribute("href") || "";
      const id = href.startsWith("#") ? href.substring(1) : null;
      link.classList.toggle("active", id && id === activeId);
    });
  };

  highlightActiveSection();
  window.addEventListener("scroll", () =>
    window.requestAnimationFrame(highlightActiveSection)
  );
});
