// privacy-policy.js
// Small enhancements: smooth scroll, active TOC state, dynamic dates

document.addEventListener("DOMContentLoaded", () => {
  // Set current year in footer
  const yearEl = document.getElementById("currentYear");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear().toString();
  }

  // Optional: set last updated text here if you want to manage it in JS
  const lastUpdatedEl = document.getElementById("lastUpdatedText");
  if (lastUpdatedEl && !lastUpdatedEl.dataset.locked) {
    // You can change this date whenever you update the policy
    lastUpdatedEl.textContent = "2025-11-30";
  }

  // Smooth scroll for in-page links
  const tocLinks = document.querySelectorAll(".policy-toc-link");
  tocLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      const top =
        target.getBoundingClientRect().top + window.scrollY - 90; // adjust for header
      window.scrollTo({
        top,
        behavior: "smooth",
      });
    });
  });

  // Highlight active section in TOC while scrolling
  const sections = Array.from(
    document.querySelectorAll(".policy-section[id]")
  );

  const highlightActiveSection = () => {
    const scrollPos = window.scrollY;
    const bottomOfScreen = scrollPos + window.innerHeight / 2;

    let activeId = null;
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const sectionTop = rect.top + window.scrollY;
      const sectionBottom = sectionTop + rect.height;

      if (bottomOfScreen >= sectionTop && bottomOfScreen <= sectionBottom) {
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
  window.addEventListener("scroll", () => {
    window.requestAnimationFrame(highlightActiveSection);
  });
});
