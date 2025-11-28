// public/js/auth.js

const API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/api';

// --- Token helpers ---
function getAuthToken() {
  return localStorage.getItem('authToken');
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
}

// --- UI helpers ---
function updateAuthUI(isLoggedIn, user) {
  const authButtons = document.getElementById('authButtons');
  const profileSection = document.getElementById('profileSection');
  const postCreation = document.getElementById('postCreation');
  const guestMessage = document.getElementById('guestMessage');

  const headerProfileImg = document.getElementById('headerProfileImg');
  const sidebarProfileImg = document.getElementById('sidebarProfileImg');
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserHandle = document.getElementById('sidebarUserHandle');

  if (isLoggedIn) {
    if (authButtons) authButtons.style.display = 'none';
    if (profileSection) profileSection.style.display = 'flex';
    if (postCreation) postCreation.style.display = 'block';
    if (guestMessage) guestMessage.style.display = 'none';

    const avatar = user?.avatar_url || 'assets/icons/default-profile.png';
    const displayName = user?.display_name || user?.username || 'User';
    const handle = user?.username ? `@${user.username}` : '@user';

    if (headerProfileImg) headerProfileImg.src = avatar;
    if (sidebarProfileImg) sidebarProfileImg.src = avatar;
    if (sidebarUserName) sidebarUserName.textContent = displayName;
    if (sidebarUserHandle) sidebarUserHandle.textContent = handle;
  } else {
    if (authButtons) authButtons.style.display = 'flex';
    if (profileSection) profileSection.style.display = 'none';
    if (postCreation) postCreation.style.display = 'none';
    if (guestMessage) guestMessage.style.display = 'block';
  }
}

// --- Fetch helper ---
async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const headers = options.headers || {};

  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (!response.ok) {
    const msg =
      (data && (data.details || data.error)) ||
      `Request failed (${response.status})`;
    throw new Error(msg);
  }

  return data;
}

// --- Signup handler ---
async function handleSignup(event) {
  event.preventDefault();

  const displayName = document.getElementById('displayName')?.value.trim();
  const username = document.getElementById('username')?.value.trim();
  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;
  const confirmPassword = document.getElementById('confirmPassword')?.value;

  if (!displayName || !username || !email || !password || !confirmPassword) {
    alert('Please fill in all fields.');
    return;
  }

  if (password !== confirmPassword) {
    alert('Passwords do not match.');
    return;
  }

  const signupBtn = document.getElementById('signupBtn');
  if (signupBtn) {
    signupBtn.disabled = true;
    signupBtn.textContent = 'Creating...';
  }

  try {
    const data = await apiRequest('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ displayName, username, email, password })
    });

    // Save token and redirect to home
    setAuthToken(data.token);
    alert('Account created! Redirecting...');
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Signup error:', err);
    alert(err.message || 'Error creating user');
  } finally {
    if (signupBtn) {
      signupBtn.disabled = false;
      signupBtn.textContent = 'Create Account';
    }
  }
}

// --- Login handler ---
async function handleLogin(event) {
  event.preventDefault();

  const identifier = document.getElementById('loginIdentifier')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;

  if (!identifier || !password) {
    alert('Please enter your username/email and password.');
    return;
  }

  // For now we treat identifier as email (your login form says "username or email"
  // but backend currently expects email; we can extend later.)
  const email = identifier;

  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
  }

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    setAuthToken(data.token);
    alert('Logged in successfully!');
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Login error:', err);
    alert(err.message || 'Login failed');
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In';
    }
  }
}

// --- Logout (used by index.html onclick="logout()") ---
function logout() {
  setAuthToken(null);
  window.location.href = 'login.html';
}
window.logout = logout; // expose globally

// --- Check auth state on load (for index.html etc.) ---
async function checkAuthState() {
  const token = getAuthToken();
  if (!token) {
    updateAuthUI(false, null);
    return;
  }

  try {
    const user = await apiRequest('/auth/me', { method: 'GET' });
    updateAuthUI(true, user);
  } catch (err) {
    console.error('Auth state error:', err);
    setAuthToken(null);
    updateAuthUI(false, null);
  }
}

// --- Attach listeners ---
document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', handleSignup);
  }

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // Only check auth state on pages that have the home UI
  if (document.getElementById('authButtons') || document.getElementById('postCreation')) {
    checkAuthState();
  }
});
