// ===============================
// Global App Functionality (Uncensored Social)
// ===============================
class App {
  constructor() {
    this.sb = null; // supabase client
    this.isLoggedIn = false;
    this.currentUser = null; // profile-ish object (may be fallback)

    // Run when DOM is ready (safer on iOS Safari)
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init());
    } else {
      this.init();
    }
  }

  async init() {
    this.setupEventListeners();
    this.setActiveBottomNav();

    // Check auth and update UI (also triggers feed load)
    await this.checkAuthState();

    // If feedManager exists, make sure it's loaded at least once
    this.safeInitFeedUI();
    this.safeLoadFeed(true);
  }

  // ===============================
  // Event Listeners
  // ===============================
  setupEventListeners() {
    // Sidebar toggle
    const profileMenuBtn = document.getElementById("profileMenuBtn");
    const closeSidebar = document.getElementById("closeSidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");

    if (profileMenuBtn) {
      profileMenuBtn.addEventListener("click", () => this.toggleSidebar());
    }
    if (closeSidebar) {
      closeSidebar.addEventListener("click", () => this.toggleSidebar());
    }
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener("click", () => this.toggleSidebar());
    }

    // Feed tabs (Recent / Trending / Following)
    // Use ONE delegated listener so you don't get duplicate handlers.
    const feedTabs = document.getElementById("feedTabs");
    if (feedTabs) {
      feedTabs.addEventListener("click", (e) => {
        const btn = e.target.closest(".feed-tab-btn");
        if (!btn) return;

        const mode = btn.getAttribute("data-feed-mode");
        if (!mode) return;

        // UI active state
        feedTabs.querySelectorAll(".feed-tab-btn").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });

        // Tell FeedManager
        this.safeSwitchFeedMode(mode);
      });
    }

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => this.handleKeyboardShortcuts(e));
  }

  // ===============================
  // Sidebar
  // ===============================
  toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (!sidebar || !overlay) return;

    sidebar.classList.toggle("open");
    overlay.classList.toggle("open");
  }

  // ===============================
  // Keyboard shortcuts
  // ===============================
  handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + Enter to post
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

    // Escape closes sidebar
    if (e.key === "Escape") this.toggleSidebar();
  }

  // ===============================
  // Supabase init (lazy)
  // ===============================
  async ensureSupabase() {
    if (this.sb) return this.sb;

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      console.warn("Supabase SDK not found on window.");
      return null;
    }

    const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
    const SUPABASE_ANON =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    return this.sb;
  }

  // ===============================
  // Auth State (Supabase is source of truth)
  // ===============================
  async checkAuthState() {
    const sb = await this.ensureSupabase();

    // If Supabase not present, fall back to legacy getCurrentUser (won't crash)
    if (!sb) {
      let legacyUser = null;
      try {
        legacyUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;
      } catch {
        legacyUser = null;
      }

      this.isLoggedIn = !!legacyUser;
      this.currentUser = legacyUser || null;
      this.updateAuthUI(this.currentUser, this.isLoggedIn);

      // still try to load feed
      this.safeLoadFeed(true);
      return;
    }

    // ✅ Supabase auth user
    let authUser = null;
    try {
      const { data } = await sb.auth.getUser();
      authUser = data?.user || null;
    } catch {
      authUser = null;
    }

    const isLoggedIn = !!authUser;
    this.isLoggedIn = isLoggedIn;

    // Pages that require login
    const protectedPages = ["profile.html", "messages.html"];
    const currentPath = window.location.pathname;
    const mustBeAuthed = protectedPages.some((page) => currentPath.includes(page));

    if (!isLoggedIn && mustBeAuthed) {
      window.location.href = "login.html";
      return;
    }

    // Try to load profile row from public.users (optional)
    let profile = null;
    if (authUser?.id) {
      try {
        const { data, error } = await sb
          .from("users")
          .select("id, username, email, display_name, avatar_url, is_admin")
          .eq("id", authUser.id)
          .single();

        if (!error) profile = data || null;
      } catch {
        profile = null;
      }
    }

    // ✅ Always provide a UI user when logged in (even if profile fetch fails)
    const uiUser =
      profile ||
      (authUser
        ? {
            id: authUser.id,
            username: authUser.email?.split("@")[0] || null,
            email: authUser.email || null,
            display_name: null,
            avatar_url: null,
            is_admin: false,
          }
        : null);

    this.currentUser = uiUser;
    this.updateAuthUI(this.currentUser, this.isLoggedIn);

    // After auth check, ensure feed loads
    this.safeInitFeedUI();
    this.safeLoadFeed(true);

    // Update on auth changes while page is open
    sb.auth.onAuthStateChange(async () => {
      try {
        const { data } = await sb.auth.getUser();
        const u = data?.user || null;
        const loggedIn = !!u;

        this.isLoggedIn = loggedIn;

        if (!loggedIn) {
          this.currentUser = null;
          this.updateAuthUI(null, false);
          this.safeInitFeedUI();
          this.safeLoadFeed(true);
          return;
        }

        let p = null;
        try {
          const { data: pd } = await sb
            .from("users")
            .select("id, username, email, display_name, avatar_url, is_admin")
            .eq("id", u.id)
            .single();
          p = pd || null;
        } catch {
          p = null;
        }

        const uiU =
          p ||
          {
            id: u.id,
            username: u.email?.split("@")[0] || null,
            email: u.email || null,
            display_name: null,
            avatar_url: null,
            is_admin: false,
          };

        this.currentUser = uiU;
        this.updateAuthUI(uiU, true);

        this.safeInitFeedUI();
        this.safeLoadFeed(true);
      } catch {
        this.currentUser = null;
        this.isLoggedIn = false;
        this.updateAuthUI(null, false);
        this.safeInitFeedUI();
        this.safeLoadFeed(true);
      }
    });
  }

  // ===============================
  // Auth UI updates
  // ===============================
  updateAuthUI(currentUser, isLoggedIn) {
    // Show/hide composer + any auth-dependent elements
    document.querySelectorAll(".auth-dependent").forEach((el) => {
      el.style.display = isLoggedIn ? "block" : "none";
    });

    // Header: profile icon vs auth buttons
    const profileSection = document.getElementById("profileSection");
    const authButtons = document.getElementById("authButtons");

    if (profileSection && authButtons) {
      if (isLoggedIn) {
        profileSection.style.display = "flex";
        authButtons.style.display = "none";
      } else {
        profileSection.style.display = "none";
        authButtons.style.display = "flex";
      }
    }

    // Set avatar URLs
    const avatarUrl =
      isLoggedIn && currentUser?.avatar_url
        ? currentUser.avatar_url
        : "default-profile.PNG";

    const headerImg = document.getElementById("headerProfileImg");
    if (headerImg) headerImg.src = avatarUrl;

    const composerImg = document.getElementById("postUserAvatar");
    if (composerImg) composerImg.src = avatarUrl;

    document.querySelectorAll(".post-avatar").forEach((img) => {
      img.src = avatarUrl;
    });
  }

  // ===============================
  // Feed helpers (works with your feed.js FeedManager)
  // ===============================
  safeInitFeedUI() {
    // Make sure tabs exist and are exactly 3 on index (prevents duplicates)
    const feedTabs = document.getElementById("feedTabs");
    if (!feedTabs) return;

    const buttons = feedTabs.querySelectorAll(".feed-tab-btn");
    if (buttons.length !== 3) {
      // If something injected extra buttons, rebuild safely
      feedTabs.innerHTML = `
        <button class="feed-tab-btn active" data-feed-mode="recent">Recent</button>
        <button class="feed-tab-btn" data-feed-mode="trending">Trending</button>
        <button class="feed-tab-btn" data-feed-mode="following">Following</button>
      `;
      // re-bind handled by delegated listener already attached in setupEventListeners()
    }
  }

  safeSwitchFeedMode(mode) {
    if (!window.feedManager) {
      console.warn("feedManager not ready yet.");
      return;
    }

    // Prefer switchMode
    if (typeof window.feedManager.switchMode === "function") {
      window.feedManager.switchMode(mode);
      return;
    }

    // Fallback
    window.feedManager.currentMode = mode;
    if (typeof window.feedManager.loadPosts === "function") {
      window.feedManager.page = 1;
      window.feedManager.hasMore = true;
      window.feedManager.loadPosts(true);
    }
  }

  safeLoadFeed(force = false) {
    // Only attempt on pages that have feedContainer
    const feedContainer = document.getElementById("feedContainer");
    if (!feedContainer) return;

    if (!window.feedManager) {
      // feed.js might not have initialized yet; try again shortly
      setTimeout(() => {
        if (window.feedManager && typeof window.feedManager.loadPosts === "function") {
          window.feedManager.loadPosts(!!force);
        }
      }, 120);
      return;
    }

    if (typeof window.feedManager.loadPosts === "function") {
      window.feedManager.loadPosts(!!force);
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

      if ((path === "" || path === "index.html") && href.includes("index.html")) {
        item.classList.add("active");
      } else if (path === "search.html" && href.includes("search.html")) {
        item.classList.add("active");
      } else if (path === "notifications.html" && href.includes("notifications.html")) {
        item.classList.add("active");
      } else if (path === "messages.html" && href.includes("messages.html")) {
        item.classList.add("active");
      }
    });
  }
}

// ===============================
// Initialize app
// ===============================
window.app = new App();

// ===============================
// Service worker registration
// (Use relative path for GitHub Pages)
// ===============================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((registration) => {
        console.log("SW registered: ", registration);
      })
      .catch((err) => {
        console.log("SW registration failed: ", err);
      });
  });
}
