// ===============================
// Global App Functionality
// ===============================
class App {
  constructor() {
    this.sb = null; // supabase client
    this.setupEventListeners();
    this.checkAuthState();
    this.setActiveBottomNav();
  }

  setupEventListeners() {
    // Sidebar toggle
    const profileMenuBtn = document.getElementById("profileMenuBtn");
    const closeSidebar = document.getElementById("closeSidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");

    if (profileMenuBtn) {
      profileMenuBtn.addEventListener("click", this.toggleSidebar.bind(this));
    }

    if (closeSidebar) {
      closeSidebar.addEventListener("click", this.toggleSidebar.bind(this));
    }

    if (sidebarOverlay) {
      sidebarOverlay.addEventListener("click", this.toggleSidebar.bind(this));
    }

    // Feeds toggle (if you ever use a single button to flip modes)
    const feedsToggle = document.getElementById("feedsToggle");
    if (feedsToggle) {
      feedsToggle.addEventListener("click", this.toggleFeeds.bind(this));
    }

    // Keyboard shortcuts
    document.addEventListener(
      "keydown",
      this.handleKeyboardShortcuts.bind(this)
    );
  }

  // ===============================
  // Sidebar
  // ===============================
  toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");

    if (sidebar && sidebarOverlay) {
      sidebar.classList.toggle("open");
      sidebarOverlay.classList.toggle("open");
    }
  }

  // ===============================
  // Feed mode toggle (Recent / Following)
  // ===============================
  toggleFeeds(e) {
    e.preventDefault();

    // Only run if the new FeedManager exists
    if (!window.feedManager) return;

    const feedsToggle = document.getElementById("feedsToggle");
    const currentMode = window.feedManager.currentMode || "recent";
    const newMode = currentMode === "recent" ? "following" : "recent";

    if (typeof window.feedManager.switchMode === "function") {
      window.feedManager.switchMode(newMode);
    } else if (typeof window.feedManager.loadPosts === "function") {
      // Fallback if switchMode ever changes
      window.feedManager.currentMode = newMode;
      window.feedManager.loadPosts(true);
    }

    if (feedsToggle) {
      const label = newMode === "recent" ? "Recent" : "Following";
      feedsToggle.innerHTML = `<span>📰</span> Feed: ${label}`;
    }
  }

  // ===============================
  // Keyboard shortcuts
  // ===============================
  handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + Enter to post from the composer
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const postInput = document.getElementById("postInput");
      if (
        postInput &&
        document.activeElement === postInput &&
        window.feedManager &&
        typeof window.feedManager.handleCreatePost === "function"
      ) {
        e.preventDefault();
        window.feedManager.handleCreatePost();
      }
    }

    // Escape to close sidebar
    if (e.key === "Escape") {
      this.toggleSidebar();
    }
  }

  // ===============================
  // Supabase init (lazy)
  // ===============================
  async ensureSupabase() {
    if (this.sb) return this.sb;

    // Supabase CDN must be included on app pages for this to work.
    // (Or your launch-guard auto-load version will already inject it.)
    if (!window.supabase) return null;

    const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
    const SUPABASE_ANON =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    return this.sb;
  }

  // ===============================
  // Auth state (Supabase)
  // ===============================
  async checkAuthState() {
    const sb = await this.ensureSupabase();

    // If Supabase not present, fall back to old behavior (won't crash)
    if (!sb) {
      let currentUser = null;
      try {
        currentUser =
          typeof getCurrentUser === "function" ? getCurrentUser() : null;
      } catch {
        currentUser = null;
      }

      const protectedPages = ["profile.html", "messages.html"];
      const currentPath = window.location.pathname;
      const mustBeAuthed = protectedPages.some((page) =>
        currentPath.includes(page)
      );

      if (!currentUser && mustBeAuthed) {
        window.location.href = "login.html";
        return;
      }

      this.updateAuthUI(currentUser);
      return;
    }

    // ✅ Supabase user
    let user = null;
    try {
      const { data } = await sb.auth.getUser();
      user = data?.user || null;
    } catch {
      user = null;
    }

    // Pages that require login
    const protectedPages = ["profile.html", "messages.html"];
    const currentPath = window.location.pathname;
    const mustBeAuthed = protectedPages.some((page) =>
      currentPath.includes(page)
    );

    if (!user && mustBeAuthed) {
      window.location.href = "login.html";
      return;
    }

    // Load profile from public.users for avatar/etc.
    let profile = null;
    if (user?.id) {
      try {
        const { data } = await sb
          .from("users")
          .select("id, username, email, display_name, avatar_url, is_admin")
          .eq("id", user.id)
          .single();
        profile = data || null;
      } catch {
        profile = null;
      }
    }

    this.updateAuthUI(profile);

    // Optional: update if auth changes while open
    sb.auth.onAuthStateChange(async () => {
      try {
        const { data } = await sb.auth.getUser();
        const u = data?.user || null;
        if (!u) {
          this.updateAuthUI(null);
          return;
        }
        const { data: p } = await sb
          .from("users")
          .select("id, username, email, display_name, avatar_url, is_admin")
          .eq("id", u.id)
          .single();
        this.updateAuthUI(p || null);
      } catch {
        this.updateAuthUI(null);
      }
    });
  }

  updateAuthUI(currentUser) {
    // Show / hide auth-dependent elements
    const authDependentElements = document.querySelectorAll(".auth-dependent");
    authDependentElements.forEach((el) => {
      el.style.display = currentUser ? "block" : "none";
    });

    // Update profile images (header + generic avatars)
    const profileImages = document.querySelectorAll(
      ".profile-icon img, .post-avatar, #postUserAvatar"
    );

    profileImages.forEach((img) => {
      if (currentUser && currentUser.avatar_url) {
        img.src = currentUser.avatar_url;
      } else if (img.id === "postUserAvatar") {
        // Fallback to your default avatar for composer
        img.src = "default-profile.PNG";
      }
    });

    // Header left auth buttons vs profile icon
    const profileSection = document.getElementById("profileSection");
    const authButtons = document.getElementById("authButtons");

    if (profileSection && authButtons) {
      if (currentUser) {
        profileSection.style.display = "flex";
        authButtons.style.display = "none";
      } else {
        profileSection.style.display = "none";
        authButtons.style.display = "flex";
      }
    }
  }

  // ===============================
  // Bottom nav active state
  // ===============================
  setActiveBottomNav() {
    const navItems = document.querySelectorAll(".bottom-nav .nav-item");
    if (!navItems.length) return;

    const path = window.location.pathname.split("/").pop() || "index.html";

    navItems.forEach((item) => {
      const href = item.getAttribute("href") || "";
      item.classList.remove("active");

      // Home
      if (
        (path === "" || path === "index.html") &&
        href.includes("index.html")
      ) {
        item.classList.add("active");
      }
      // Search
      else if (path === "search.html" && href.includes("search.html")) {
        item.classList.add("active");
      }
      // Notifications
      else if (
        path === "notifications.html" &&
        href.includes("notifications.html")
      ) {
        item.classList.add("active");
      }
      // Messages
      else if (path === "messages.html" && href.includes("messages.html")) {
        item.classList.add("active");
      }
    });
  }
}

// ===============================
// Initialize app
// ===============================
const app = new App();

// ===============================
// Service worker registration
// ===============================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("SW registered: ", registration);
      })
      .catch((registrationError) => {
        console.log("SW registration failed: ", registrationError);
      });
  });
}
