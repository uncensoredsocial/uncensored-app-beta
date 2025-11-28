// auth.js
const API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/';

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

// Login function
async function login(email, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        saveUserSession(data.user, data.token);
        return data;

    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

// Signup function
async function signup(userData) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Signup failed');
        }

        saveUserSession(data.user, data.token);
        return data;

    } catch (error) {
        console.error('Signup error:', error);
        throw error;
    }
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
                'Authorization': `Bearer ${token}`
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

// Redirect if not authenticated
function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Redirect if already authenticated
function redirectIfAuthenticated() {
    if (isLoggedIn()) {
        window.location.href = 'index.html';
        return true;
    }
    return false;
}
