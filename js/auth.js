// js/auth.js

const API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/api';
const TOKEN_KEY = 'us_auth_token';
const USER_KEY = 'us_current_user';

// ===== Storage helpers =====
function setAuthToken(token) {
    localStorage.setItem(TOKEN_KEY, token);

    // --- COMPAT: some older scripts might read "token" ---
    // Keep them in sync so payments / other pages don’t break.
    try {
        localStorage.setItem('token', token);
    } catch (e) {}
}
function getAuthToken() {
    // Prefer the real key, but fallback to older "token" if it exists.
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token');
}
function clearAuthToken() {
    localStorage.removeItem(TOKEN_KEY);

    // --- COMPAT ---
    try {
        localStorage.removeItem('token');
    } catch (e) {}
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

function isLoggedIn() {
    return !!getAuthToken();
}

function logout() {
    clearAuthToken();
    clearCurrentUser();
    window.location.href = 'index.html';
}

// expose globally for feed.js / profile.js
window.setAuthToken = setAuthToken;
window.getAuthToken = getAuthToken;
window.setCurrentUser = setCurrentUser;
window.getCurrentUser = getCurrentUser;
window.isLoggedIn = isLoggedIn;
window.logout = logout;

// ======================================================
// NEW: Redirect-back + require login helpers (site-wide)
// ======================================================

// Save current page so login can return you back here
function saveReturnUrl(url) {
    try {
        const u = url || window.location.href;

        // Don’t store login/signup as return targets
        if (u.includes('login.html') || u.includes('signup.html')) return;

        sessionStorage.setItem('returnTo', u);
    } catch (e) {}
}

// Go back to saved page, otherwise go home
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

// Guard for pages/actions that require auth (payments, settings, etc)
function requireLoginOrRedirect(message) {
    const token = (getAuthToken() || '').trim();
    if (!token) {
        saveReturnUrl();
        if (message) {
            try { sessionStorage.setItem('authReason', message); } catch (e) {}
        }
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Expose globally so payment.js etc can use it
window.saveReturnUrl = saveReturnUrl;
window.redirectAfterLogin = redirectAfterLogin;
window.requireLoginOrRedirect = requireLoginOrRedirect;

// Optional: read reason on login page (if you want to display it)
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

    if (!displayNameInput || !usernameInput || !emailInput || !passwordInput || !confirmPasswordInput) {
        return; // not on signup page
    }

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

        const res = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                displayName,
                username,
                email,
                password
            })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || 'Signup failed');
        }

        setAuthToken(data.token);
        setCurrentUser(data.user);

        showAuthMessage(successMessage, 'Account created! Redirecting...', 'success');

        setTimeout(() => {
            // NEW: if we came here from another page, go back there
            redirectAfterLogin('index.html');
        }, 800);
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

    // Support multiple possible IDs, just in case
    const identifierInput =
        document.getElementById('loginIdentifier') ||
        document.getElementById('loginEmail') ||
        document.getElementById('email');

    const passwordInput =
        document.getElementById('loginPassword') ||
        document.getElementById('password');

    const errorMessage = document.getElementById('errorMessage');
    const loginBtn = document.getElementById('loginBtn');

    if (!identifierInput || !passwordInput) {
        // form not on this page
        return;
    }

    errorMessage?.classList.add('hidden');

    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;

    if (!identifier || !password) {
        showAuthMessage(errorMessage, 'Please enter your username/email and password.');
        return;
    }

    try {
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = 'Signing in...';
        }

        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error || 'Login failed');
        }

        const { token, user } = data;

        setAuthToken(token);
        setCurrentUser(user);

        // Redirect based on admin status
        if (user && user.is_admin === true) {
            // Admin -> dashboard
            window.location.href = 'admin.html';
        } else {
            // NEW: go back to the page the user was trying to view
            redirectAfterLogin('index.html');
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
document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');

    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);

        // Optional: if you want to show why user was redirected to login
        const reason = window.getAuthReason ? window.getAuthReason() : null;
        const errorMessage = document.getElementById('errorMessage');
        if (reason && errorMessage) {
            showAuthMessage(errorMessage, reason, 'error');
        }
    }

    // Header auth/profile toggle (only on pages that have these)
    const authButtons = document.getElementById('authButtons');
    const profileSection = document.getElementById('profileSection');
    const headerProfileImg = document.getElementById('headerProfileImg');

    if (authButtons || profileSection || headerProfileImg) {
        const loggedIn = isLoggedIn();
        if (authButtons) authButtons.style.display = loggedIn ? 'none' : 'flex';
        if (profileSection) profileSection.style.display = loggedIn ? 'flex' : 'none';

        if (loggedIn) {
            const user = getCurrentUser();
            if (user?.avatar_url && headerProfileImg) {
                headerProfileImg.src = user.avatar_url;
            }
        }
    }
});
