// js/auth.js (SUPABASE AUTH VERSION)
// Keeps the same global API: setAuthToken/getAuthToken/getCurrentUser/isLoggedIn/logout/etc.

const TOKEN_KEY = 'us_auth_token';
const USER_KEY = 'us_current_user';

// Supabase project
const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

// Supabase stores session in localStorage under this key:
const SB_STORAGE_KEY = "sb-hbbbsreonwhvqfvbszne-auth-token";

// ===== Supabase client =====
function getSb() {
  if (!window.supabase) {
    throw new Error("Supabase SDK not loaded. Add <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script> BEFORE auth.js");
  }
  if (!window.__sbClient) {
    window.__sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return window.__sbClient;
}

// ===== Storage helpers =====
function setAuthToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
  try { localStorage.setItem('token', token); } catch (e) {}
}
function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token');
}
function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  try { localStorage.removeItem('token'); } catch (e) {}
}

function setCurrentUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
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
  localStorage.removeItem(USER_KEY);
}

// ✅ IMPORTANT FIX:
// If Supabase session exists, treat as logged in (even if TOKEN_KEY not set yet)
function isLoggedIn() {
  const t = (getAuthToken() || '').trim();
  if (t) return true;

  try {
    const raw = localStorage.getItem(SB_STORAGE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const access = obj?.access_token || obj?.currentSession?.access_token;
    return !!(access && String(access).trim());
  } catch {
    return false;
  }
}

async function logout() {
  try {
    const sb = getSb();
    await sb.auth.signOut();
  } catch {}
  clearAuthToken();
  clearCurrentUser();
  window.location.href = 'index.html';
}

// expose globally for other scripts
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
    if (u.includes('login.html') || u.includes('signup.html')) return;
    sessionStorage.setItem('returnTo', u);
  } catch (e) {}
}

function redirectAfterLogin(fallback = 'index.html') {
  try {
    const returnTo = sessionStorage.getItem('returnTo');
    if (returnTo) {
      sessionStorage.removeItem('returnTo');
      window.location.href = returnTo;
      return;
    }
  } catch (e) {}
  window.location.href = fallback;
}

function requireLoginOrRedirect(message) {
  const token = (getAuthToken() || '').trim();
  if (!token && !isLoggedIn()) {
    saveReturnUrl();
    if (message) {
      try { sessionStorage.setItem('authReason', message); } catch (e) {}
    }
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

window.saveReturnUrl = saveReturnUrl;
window.redirectAfterLogin = redirectAfterLogin;
window.requireLoginOrRedirect = requireLoginOrRedirect;

window.getAuthReason = function () {
  try {
    const msg = sessionStorage.getItem('authReason');
    if (msg) sessionStorage.removeItem('authReason');
    return msg;
  } catch (e) {
    return null;
  }
};

// ===== UI helpers =====
function showAuthMessage(el, message, type = 'error') {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.toggle('auth-error', type === 'error');
  el.classList.toggle('auth-success', type === 'success');
}

// ===== Admin check =====
function isAdminEmail(email) {
  const cfg = window.__UNCENSORED_LAUNCH__ || {};
  const allow = (cfg.adminEmails || ["ssssss@gmail.com","eeeeee@gmail.com"]).map(e => String(e).toLowerCase());
  return allow.includes(String(email || "").toLowerCase());
}

// ✅ NEW: bootstrap token immediately from Supabase storage (sync, no race)
function bootstrapFromSupabaseStorage() {
  try {
    const raw = localStorage.getItem(SB_STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const access = obj?.access_token || obj?.currentSession?.access_token;
    const user = obj?.user || obj?.currentSession?.user;

    if (access && String(access).trim()) {
      setAuthToken(String(access).trim());
    }

    // lightweight currentUser for header; real profile still loaded by syncSessionToLocal()
    if (user?.id) {
      const existing = getCurrentUser();
      if (!existing || existing.id !== user.id) {
        setCurrentUser({
          id: user.id,
          email: user.email || "",
          username: (user.user_metadata?.username || "").toLowerCase() || null,
          display_name: user.user_metadata?.display_name || null,
          is_admin: isAdminEmail(user.email || "")
        });
      }
    }

    return { access, user };
  } catch {
    return null;
  }
}

// ===== Sync session -> localStorage token + currentUser =====
async function syncSessionToLocal() {
  const sb = getSb();
  const { data: sess } = await sb.auth.getSession();
  const session = sess?.session || null;

  if (!session) {
    clearAuthToken();
    clearCurrentUser();
    return null;
  }

  setAuthToken(session.access_token);

  const email = session.user?.email || "";
  let profile = null;

  try {
    const { data, error } = await sb
      .from("users")
      .select("id,email,username,display_name,avatar_url,banner_url,bio,is_admin,is_verified,is_moderator,plan_slug")
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
      is_admin: isAdminEmail(email)
    };
  } else {
    if (isAdminEmail(email)) profile.is_admin = true;
  }

  setCurrentUser(profile);
  return profile;
}

// ===== SIGNUP =====
async function handleSignup(e) {
  e.preventDefault();

  const displayNameInput = document.getElementById('displayName');
  const usernameInput = document.getElementById('username');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const errorMessage = document.getElementById('errorMessage');
  const successMessage = document.getElementById('successMessage');
  const signupBtn = document.getElementById('signupBtn');

  if (!displayNameInput || !usernameInput || !emailInput || !passwordInput || !confirmPasswordInput) return;

  errorMessage?.classList.add('hidden');
  successMessage?.classList.add('hidden');

  const displayName = displayNameInput.value.trim();
  const username = usernameInput.value.trim().toLowerCase();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!displayName || !username || !email || !password || !confirmPassword) {
    showAuthMessage(errorMessage, 'Please fill in all fields.');
    return;
  }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    showAuthMessage(errorMessage, 'Username must be 3–20 chars: letters, numbers, underscores.');
    return;
  }
  if (password !== confirmPassword) {
    showAuthMessage(errorMessage, 'Passwords do not match.');
    return;
  }
  if (password.length < 6) {
    showAuthMessage(errorMessage, 'Password must be at least 6 characters.');
    return;
  }

  try {
    if (signupBtn) {
      signupBtn.disabled = true;
      signupBtn.textContent = 'Creating...';
    }

    const sb = getSb();

    const pendingRef =
      (localStorage.getItem("pending_ref") || "").trim() ||
      (new URLSearchParams(location.search).get("ref") || "").trim() ||
      null;

    const { error: signUpErr } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName, referred_by: pendingRef }
      }
    });

    if (signUpErr) throw new Error(signUpErr.message);

    const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
    if (signInErr) throw new Error(signInErr.message);

    if (pendingRef) localStorage.removeItem("pending_ref");

    await syncSessionToLocal();

    showAuthMessage(successMessage, 'Account created! Redirecting...', 'success');

    const cfg = window.__UNCENSORED_LAUNCH__ || {};
    const prelaunch = cfg.prelaunchPage || 'prelaunch.html';

    setTimeout(() => {
      const user = getCurrentUser();
      if (user?.is_admin === true) {
        window.location.href = 'admin.html';
      } else {
        if (cfg.enabled === true) redirectAfterLogin('index.html');
        else window.location.href = prelaunch;
      }
    }, 700);

  } catch (err) {
    console.error('Signup error:', err);
    showAuthMessage(errorMessage, err.message || 'Signup failed.');
  } finally {
    if (signupBtn) {
      signupBtn.disabled = false;
      signupBtn.textContent = 'Create Account';
    }
  }
}

// ===== LOGIN =====
async function handleLogin(e) {
  e.preventDefault();

  const identifierInput =
    document.getElementById('loginIdentifier') ||
    document.getElementById('loginEmail') ||
    document.getElementById('email');

  const passwordInput =
    document.getElementById('loginPassword') ||
    document.getElementById('password');

  const errorMessage = document.getElementById('errorMessage');
  const loginBtn = document.getElementById('loginBtn');

  if (!identifierInput || !passwordInput) return;

  errorMessage?.classList.add('hidden');

  const identifier = identifierInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!identifier || !password) {
    showAuthMessage(errorMessage, 'Please enter your email and password.');
    return;
  }

  try {
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = 'Signing in...';
    }

    const sb = getSb();

    if (!identifier.includes("@")) {
      throw new Error("Use your email to log in (username login is disabled for now).");
    }

    const { error } = await sb.auth.signInWithPassword({ email: identifier, password });
    if (error) throw new Error(error.message);

    // ✅ immediately sync + set token
    await syncSessionToLocal();

    const cfg = window.__UNCENSORED_LAUNCH__ || {};
    const prelaunch = cfg.prelaunchPage || 'prelaunch.html';

    const user = getCurrentUser();
    if (user?.is_admin === true) window.location.href = 'admin.html';
    else {
      if (cfg.enabled === true) redirectAfterLogin('index.html');
      else window.location.href = prelaunch;
    }

  } catch (err) {
    console.error('Login error:', err);
    showAuthMessage(errorMessage, err.message || 'Login failed.');
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In';
    }
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // ✅ bootstrap ASAP (prevents “logged out” race on Home)
  bootstrapFromSupabaseStorage();

  const signupForm = document.getElementById('signupForm');
  const loginForm = document.getElementById('loginForm');

  if (signupForm) signupForm.addEventListener('submit', handleSignup);
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);

    const reason = window.getAuthReason ? window.getAuthReason() : null;
    const errorMessage = document.getElementById('errorMessage');
    if (reason && errorMessage) showAuthMessage(errorMessage, reason, 'error');
  }

  // Keep localStorage in sync if already logged in
  try { await syncSessionToLocal(); } catch {}

  // Header auth/profile toggle
  const authButtons = document.getElementById('authButtons');
  const profileSection = document.getElementById('profileSection');
  const headerProfileImg = document.getElementById('headerProfileImg');

  if (authButtons || profileSection || headerProfileImg) {
    const loggedIn = isLoggedIn();
    if (authButtons) authButtons.style.display = loggedIn ? 'none' : 'flex';
    if (profileSection) profileSection.style.display = loggedIn ? 'flex' : 'none';

    if (loggedIn) {
      const user = getCurrentUser();
      if (user?.avatar_url && headerProfileImg) headerProfileImg.src = user.avatar_url;
    }
  }
});
