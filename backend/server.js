// backend/server.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Supabase setup ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- Middleware ---
app.use(express.json());
app.use(
  cors({
    origin: [
      'https://spepdb.github.io',
      'https://uncensored-app-beta-production.up.railway.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// --- Helpers ---
function signToken(user) {
  const payload = { id: user.id, username: user.username, email: user.email };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// --- Routes ---

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      users: count ?? 0
    });
  } catch (err) {
    console.error('Health error:', err);
    res.status(500).json({ status: 'ERROR', details: err.message || err });
  }
});

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { displayName, username, email, password } = req.body;

    console.log('Signup request body:', req.body);

    if (!displayName || !username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if username/email already exists
    const { data: existing, error: checkError } = await supabase
      .from('users')
      .select('id')
      .or(`username.eq.${username},email.eq.${email}`)
      .limit(1);

    if (checkError) {
      console.error('Supabase check error:', checkError);
      return res.status(500).json({
        error: 'Error checking user',
        details: checkError.message || checkError
      });
    }

    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Username or email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    const newUser = {
      id: uuidv4(),
      username,
      email,
      display_name: displayName,
      password_hash: passwordHash,
      avatar_url: null,
      bio: '',
      created_at: now
      // ❌ last_login_at removed because the column doesn't exist
    };

    console.log('Inserting user:', newUser);

    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert(newUser)
      .select('*')
      .single();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return res.status(500).json({
        error: 'Supabase insert error',
        details: insertError.message || insertError
      });
    }

    const token = signToken(inserted);

    res.status(201).json({
      user: {
        id: inserted.id,
        username: inserted.username,
        email: inserted.email,
        display_name: inserted.display_name,
        avatar_url: inserted.avatar_url
      },
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({
      error: 'Signup failed',
      details: err.message || err
    });
  }
});

// Login (email + password)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login request body:', req.body);

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (userError || !user) {
      console.error('User lookup error:', userError);
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // we NO LONGER update last_login_at here,
    // because that column doesn't exist in your table.

    const token = signToken(user);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      error: 'Login failed',
      details: err.message || err
    });
  }
});

// Current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id,username,email,display_name,avatar_url')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      console.error('/auth/me error:', error);
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('/auth/me error:', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Backend API listening on port ${PORT}`);
});
