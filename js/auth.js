// auth.js

// 🔗 Always talk to your Railway backend API
const API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/api';

// ========================
// Session helpers
// ========================

// Is there a logged-in user?
function isLoggedIn() {
  return localStorage.getItem('authToken') !== null;
}

// Get the current user object from localStorage
function getCurrentUser() {
  const raw = localStorage.getItem('currentUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Get stored JWT token
function getAuthToken() {
  return localStorage.getItem('authToken');
}

// Save user + token after login/signup
function saveUserSession(user, token) {
  localStorage.setItem('currentUser', JSON.stringify(user));
  localStorage.setItem('authToken', token);
}

// Clear auth info
function clearUserSession() {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('authToken');
}

// Log out and send to login page
function logout() {
  clearUserSession();
  window.location.href = 'login.html';
}

// ========================
// API helpers
// ========================

// Safely parse JSON (avoid JSON.parse errors on empty/body-less responses)
async function safeJson(response) {
  try {
    return await response.json();
  } catch (err) {
    console.error('Failed to parse JSON response:', err);
    return null;
  }
}

// Signup API call
async function signup(userData) {
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });

  const data = await safeJson(res);

  if (!res.ok) {
    const msg =
      (data && data.error) ||
      `Signup failed (status ${res.status})`;
    throw new Error(msg);
  }

  if (!data || !data.user || !data.token) {
    throw new Error('Signup succeeded but response was invalid.');
  }

  saveUserSession(data.user, data.token);
  return data;
}

// Login API call (email + password)
async function login(email, password) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await safeJson(res);

  if (!res.ok) {
    const msg =
      (data && data.error) ||
      `Login failed (status ${res.status})`;
    throw new Error(msg);
  }

  if (!data || !data.user || !data.token) {
    throw new Error('Login succeeded but response was invalid.');
  }

  saveUserSession(data.user, data.token);
  return data;
}

// Optional: verify the token with /auth/me
async function verifyAuth() {
  if (!isLoggedIn()) return null;

  const token = getAuthToken();
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error('Invalid token');
    }

    const user = await safeJson(res);
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    }
    return user;
  } catch (err) {
    console.error('verifyAuth failed:', err);
    clearUserSession();
    return null;
  }
}

// ========================
// Form wiring (signup + login)
// ========================

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');
  const logoutBtn = document.getElementById('logout-btn');

  // ----- SIGNUP PAGE -----
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault(); // stop the default HTML submit (no more query string in URL)

      const displayName = document.getElementById('displayName')?.value.trim();
      const username = document.getElementById('username')?.value.trim();
      const email = document.getElementById('email')?.value.trim();
      const password = document.getElementById('password')?.value;
      const confirmPassword = document.getElementById('confirmPassword')?.value;
      const accepted = document.getElementById('privacyPolicy')?.checked;

      if (!displayName || !username || !email || !password || !confirmPassword) {
        alert('Please fill in all fields.');
        return;
      }

      if (!accepted) {
        alert('You must agree to the Privacy Policy and Terms of Service.');
        return;
      }

      if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return;
      }

      try {
        await signup({ displayName, username, email, password });
        // On success, go to the feed
        window.location.href = 'feed.html';
      } catch (err) {
        console.error('Signup error:', err);
        alert(err.message || 'Signup failed. Please try again.');
      }
    });
  }

  // ----- LOGIN PAGE -----
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const emailInput = document.getElementById('login-email');
      const passwordInput = document.getElementById('login-password');

      const email = emailInput?.value.trim();
      const password = passwordInput?.value;

      if (!email || !password) {
        alert('Please enter email and password.');
        return;
      }

      try {
        await login(email, password);
        window.location.href = 'feed.html';
      } catch (err) {
        console.error('Login error:', err);
        alert(err.message || 'Login failed. Please try again.');
      }
    });
  }

  // ----- LOGOUT BUTTON (if present anywhere) -----
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
});
