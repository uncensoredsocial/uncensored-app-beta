// js/supabase-auth.js
(function () {
  const cfg = window.__UNCENSORED_LAUNCH__ || {};

  const SUPABASE_URL =
    cfg.supabaseUrl || "https://hbbbsreonwhvqfvbszne.supabase.co";
  const SUPABASE_ANON =
    cfg.supabaseAnonKey ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

  if (!window.supabase) {
    console.error("Supabase JS not loaded (window.supabase missing).");
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  // ---------- helpers ----------
  async function getSession() {
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  }

  async function getAuthTokenAsync() {
    const session = await getSession();
    return session?.access_token || "";
  }

  async function getCurrentUserAsync() {
    const { data } = await sb.auth.getUser();
    const u = data?.user;
    if (!u) return null;

    // Pull profile fields (if you store them)
    let row = null;
    try {
      const res = await sb
        .from("users")
        .select("id,email,username,display_name,avatar_url,is_admin")
        .eq("id", u.id)
        .maybeSingle();
      if (!res.error) row = res.data || null;
    } catch {}

    return {
      id: u.id,
      email: (u.email || "").toLowerCase(),
      username:
        row?.username ||
        (u.user_metadata?.username ? String(u.user_metadata.username) : null),
      display_name:
        row?.display_name ||
        (u.user_metadata?.display_name
          ? String(u.user_metadata.display_name)
          : null),
      avatar_url: row?.avatar_url || null,
      is_admin: row?.is_admin === true || false,
    };
  }

  // ---------- UI sync ----------
  async function updateAuthUI() {
    const user = await getCurrentUserAsync();

    // Toggle auth-dependent elements
    document.querySelectorAll(".auth-dependent").forEach((el) => {
      el.style.display = user ? "block" : "none";
    });

    // Toggle header buttons vs profile section (your existing IDs)
    const profileSection = document.getElementById("profileSection");
    const authButtons = document.getElementById("authButtons");
    if (profileSection && authButtons) {
      profileSection.style.display = user ? "flex" : "none";
      authButtons.style.display = user ? "none" : "flex";
    }

    // Hide/show guest message (if you use #guestMessage)
    const guestMessage = document.getElementById("guestMessage");
    if (guestMessage) guestMessage.style.display = user ? "none" : "block";

    // Update avatars (same selectors your app.js uses)
    const imgs = document.querySelectorAll(
      ".profile-icon img, .post-avatar, #postUserAvatar"
    );
    imgs.forEach((img) => {
      if (user?.avatar_url) img.src = user.avatar_url;
      else if (img.id === "postUserAvatar") img.src = "default-profile.PNG";
    });

    // OPTIONAL: trigger feed load after auth state resolves
    // (only if feedManager exists)
    if (window.feedManager && typeof window.feedManager.loadPosts === "function") {
      // ensure it runs once when auth state becomes known
      if (!window.__FEED_BOOTED__) {
        window.__FEED_BOOTED__ = true;
        window.feedManager.loadPosts(true);
      }
    }
  }

  // ---------- expose legacy API so existing code keeps working ----------
  window.getCurrentUser = function () {
    // NOTE: app.js calls this sync; return a cached value if available
    return window.__SB_USER_CACHE__ || null;
  };

  window.isLoggedIn = function () {
    return !!window.__SB_SESSION_CACHE__?.access_token;
  };

  window.getAuthToken = function () {
    return window.__SB_SESSION_CACHE__?.access_token || "";
  };

  window.logout = async function () {
    try {
      await sb.auth.signOut();
    } catch {}
    window.location.href = "index.html";
  };

  // ---------- boot ----------
  (async function boot() {
    // cache session + user for sync callers (app.js)
    const session = await getSession();
    window.__SB_SESSION_CACHE__ = session;

    const user = await getCurrentUserAsync();
    window.__SB_USER_CACHE__ = user;

    await updateAuthUI();

    // keep in sync
    sb.auth.onAuthStateChange(async (_event, sess) => {
      window.__SB_SESSION_CACHE__ = sess || null;
      const u = await getCurrentUserAsync();
      window.__SB_USER_CACHE__ = u;
      await updateAuthUI();
    });
  })();
})();
