// auth.js

// Use localhost in dev, Railway in production
const API_BASE_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://uncensored-app-beta-production.up.railway.app/api';

// ========================
// Session helpers
// ========================

// Check if user is logged in
function isLoggedIn() {
  return localStorage.getItem('authToken') !== null;
}

// Get current user from localStorage
function getCurrentUser() {
  const userStr = localStorage.getItem('currentUser');
  return userStr ? JSON.parse(userStr) : null;
}

// Get auth token
function getAuthToken() {
  return localStorage.getItem('authToken');
}

// Save user session
function saveUserSession(user, token) {
  localStorage.setItem('currentUser', JSON.stringify(user));
  localStorage.setItem('authToken', token);
}

// Clear user session
function clearUserSession() {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('authToken');
}

// ========================
// API helpers
// ========================

// Login function (pure API call)
async function login(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Login failed');
  }

  saveUserSession(data.user, data.token);
  return data;
}

// Signup function (pure API call)
async function signup(userData) {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(userData)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Signup failed');
  }

  saveUserSession(data.user, data.token);
  return data;
}

// Logout function
function logout() {
  clearUserSession();
  window.location.href = 'login.html';
}

// Verify token and get current user
async function verifyAuth() {
  if (!isLoggedIn()) {
    return null;
  }

  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Invalid token');
    }

    const user = await response.json();
    localStorage.setItem('currentUser', JSON.stringify(user));
    return user;
  } catch (error) {
    console.error('Auth verification failed:', error);
    clearUserSession();
    return null;
  }
}

// Redirect if not authenticated (for protected pages)
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// Redirect if already authenticated (for login/signup pages)
function redirectIfAuthenticated() {
  if (isLoggedIn()) {
    window.location.href = 'feed.html'; // or 'index.html' if you prefer
    return true;
  }
  return false;
}

// ========================
// Form wiring (Signup + Login)
// ========================

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');
  const logoutBtn = document.getElementById('logout-btn');

  // ---- SIGNUP ----
  if (signupForm) {
    // if user is already logged in, don’t show signup
    redirectIfAuthenticated();

    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault(); // IMPORTANT: stops the URL from filling with form data

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

      try {
        await signup({
          displayName,
          username,
          email,
          password
        });

        // Go to feed after successful signup
        window.location.href = 'feed.html';
      } catch (err) {
        console.error('Signup error:', err);
        alert(err.message || 'Signup failed.');
      }
    });
  }

  // ---- LOGIN ----
  if (loginForm) {
    // if user is already logged in, don’t show login
    redirectIfAuthenticated();

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('login-email')?.value.trim();
      const password = document.getElementById('login-password')?.value;

      if (!email || !password) {
        alert('Please enter email and password.');
        return;
      }

      try {
        await login(email, password);
        window.location.href = 'feed.html';
      } catch (err) {
        console.error('Login error:', err);
        alert(err.message || 'Login failed.');
      }
    });
  }

  // ---- LOGOUT BUTTON (optional) ----
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
});