// js/auth.js (HYBRID SAFE VERSION)
// Keeps the same global API: setAuthToken/getAuthToken/getCurrentUser/isLoggedIn/logout/etc.
// FIX: Do NOT wipe backend JWT token just because Supabase session is missing.
// FIX: If backend token exists, load /api/auth/me to rebuild currentUser on every page.

const TOKEN_KEY = "us_auth_token";
const USER_KEY = "us_current_user";

// ===== API base (same pattern as other pages) =====
const AUTH_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

// ===== Supabase client (optional; used only if you actually logged in via Supabase) =====
const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

function getSb() {
  // Supabase is optional for your app auth. If SDK isn't loaded, just skip Supabase sync.
  if (!window.supabase) return null;
  if (!window.__sbClient) {
    window.__sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return window.__sbClient;
}

// ===== Storage helpers =====
function setAuthToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    // compat
    localStorage.setItem("token", token);
  } catch (e) {}
}

function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem("token");
  } catch {
    return null;
  }
}

function clearAuthToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("token");
  } catch (e) {}
}

function setCurrentUser(user) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {}
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearCurrentUser() {
  try {
    localStorage.removeItem(USER_KEY);
  } catch (e) {}
}

function isLoggedIn() {
  // Your app is token-based (Railway JWT). That’s the source of truth.
  return !!String(getAuthToken() || "").trim();
}

async function logout() {
  // If supabase is present, sign out there too (doesn't hurt).
  try {
    const sb = getSb();
    if (sb) await sb.auth.signOut();
  } catch {}

  clearAuthToken();
  clearCurrentUser();
  window.location.href = "index.html";
}

// expose globally
window.setAuthToken = setAuthToken;
window.getAuthToken = getAuthToken;
window.setCurrentUser = setCurrentUser;
window.getCurrentUser = getCurrentUser;
window.isLoggedIn = isLoggedIn;
window.logout = logout;

// ======================================================
// Redirect-back + require login helpers (unchanged)
// ======================================================
function saveReturnUrl(url) {
  try {
    const u = url || window.location.href;
    if (u.includes("login.html") || u.includes("signup.html")) return;
    sessionStorage.setItem("returnTo", u);
  } catch (e) {}
}

function redirectAfterLogin(fallback = "index.html") {
  try {
    const returnTo = sessionStorage.getItem("returnTo");
    if (returnTo) {
      sessionStorage.removeItem("returnTo");
      window.location.href = returnTo;
      return;
    }
  } catch (e) {}
  window.location.href = fallback;
}

function requireLoginOrRedirect(message) {
  const token = String(getAuthToken() || "").trim();
  if (!token) {
    saveReturnUrl();
    if (message) {
      try {
        sessionStorage.setItem("authReason", message);
      } catch (e) {}
    }
    window.location.href = "login.html";
    return false;
  }
  return true;
}

window.saveReturnUrl = saveReturnUrl;
window.redirectAfterLogin = redirectAfterLogin;
window.requireLoginOrRedirect = requireLoginOrRedirect;

window.getAuthReason = function () {
  try {
    const msg = sessionStorage.getItem("authReason");
    if (msg) sessionStorage.removeItem("authReason");
    return msg;
  } catch (e) {
    return null;
  }
};

// ======================================================
// FIX #1: If you have a backend token, refresh current user from Railway
// ======================================================
async function refreshUserFromBackend() {
  const token = String(getAuthToken() || "").trim();
  if (!token) return null;

  try {
    const res = await fetch(`${AUTH_API_BASE_URL}/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Token invalid/expired -> logout cleanly
      if (res.status === 401) {
        clearAuthToken();
        clearCurrentUser();
      }
      return null;
    }

    // Normalize shape to what your frontend expects
    const user = {
      id: data.id,
      username: data.username,
      email: data.email,
      display_name: data.display_name,
      avatar_url: data.avatar_url || null,
      banner_url: data.banner_url || null,
      bio: data.bio || "",
      created_at: data.created_at,
      posts_count: data.posts_count ?? 0,
      followers_count: data.followers_count ?? 0,
      following_count: data.following_count ?? 0,
      // keep extra fields if backend sends them
      ...data,
    };

    setCurrentUser(user);
    return user;
  } catch (e) {
    return null;
  }
}

// ======================================================
// FIX #2: OPTIONAL Supabase sync — but NEVER clears your backend token
// ======================================================
async function syncSupabaseSessionToLocalSafe() {
  const sb = getSb();
  if (!sb) return null;

  try {
    const { data: sess } = await sb.auth.getSession();
    const session = sess?.session || null;

    if (!session) {
      // ✅ IMPORTANT: do NOT clear backend token/user here
      return null;
    }

    // If you truly want to use Supabase auth tokens for your backend, you’d need to change backend JWT verification.
    // So we DO NOT overwrite your backend JWT token here.
    // We only use Supabase to optionally populate currentUser if it’s missing.
    const email = session.user?.email || "";

    // Try to load profile from your public.users (if you use it)
    let profile = null;
    try {
      const { data, error } = await sb
        .from("users")
        .select(
          "id,email,username,display_name,avatar_url,banner_url,bio,is_admin,is_verified,is_moderator,plan_slug"
        )
        .eq("id", session.user.id)
        .maybeSingle();

      if (!error && data) profile = data;
    } catch {}

    if (!profile) {
      profile = {
        id: session.user.id,
        email,
        username: (session.user.user_metadata?.username || "").toLowerCase() || null,
        display_name: session.user.user_metadata?.display_name || null,
      };
    }

    // Only setCurrentUser if you don't already have one
    if (!getCurrentUser()) setCurrentUser(profile);

    return profile;
  } catch {
    return null;
  }
}

// ======================================================
// FIX #3: One global "ready" promise all pages can wait for
// ======================================================
let __authReadyResolve;
window.__AUTH_READY__ = new Promise((resolve) => {
  __authReadyResolve = resolve;
});

async function ensureAuthUserLoaded() {
  // If we already have a user object, still try to refresh silently.
  // (This keeps avatar/name updated and fixes "null user" pages.)
  const token = String(getAuthToken() || "").trim();

  // 1) If backend token exists, backend is source of truth.
  if (token) {
    const u = await refreshUserFromBackend();
    if (u) return u;
    // if backend refresh fails but token still exists, keep whatever is cached
    return getCurrentUser();
  }

  // 2) No backend token -> optionally try Supabase session (does NOT clear anything)
  const su = await syncSupabaseSessionToLocalSafe();
  return su || getCurrentUser();
}

window.ensureAuthUserLoaded = ensureAuthUserLoaded;

// ======================================================
// UI helpers (unchanged)
// ======================================================
function showAuthMessage(el, message, type = "error") {
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  el.classList.toggle("auth-error", type === "error");
  el.classList.toggle("auth-success", type === "success");
}

// ======================================================
// INIT
// ======================================================
(async () => {
  // Kick auth loading ASAP (NOT waiting for DOMContentLoaded)
  try {
    await ensureAuthUserLoaded();
  } catch {}
  try {
    if (typeof __authReadyResolve === "function") __authReadyResolve(true);
  } catch {}
})();

document.addEventListener("DOMContentLoaded", async () => {
  // Keep local user refreshed once DOM exists (safe)
  try {
    await ensureAuthUserLoaded();
  } catch {}

  // Header auth/profile toggle (unchanged behavior)
  const authButtons = document.getElementById("authButtons");
  const profileSection = document.getElementById("profileSection");
  const headerProfileImg = document.getElementById("headerProfileImg");

  if (authButtons || profileSection || headerProfileImg) {
    const loggedIn = isLoggedIn();
    if (authButtons) authButtons.style.display = loggedIn ? "none" : "flex";
    if (profileSection) profileSection.style.display = loggedIn ? "flex" : "none";

    if (loggedIn) {
      const user = getCurrentUser();
      if (user?.avatar_url && headerProfileImg) headerProfileImg.src = user.avatar_url;
    }
  }
});
