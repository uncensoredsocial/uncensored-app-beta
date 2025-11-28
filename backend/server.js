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
      'https://uncensored-app-beta-production.up.railway.app',
      'http://localhost:3000',
      'http://127.0.0.1:5500'
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
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Health error:', error);
    }

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      users: count ?? 0
    });
  } catch (err) {
    console.error('Health error:', err);
    res.status(500).json({ status: 'ERROR' });
  }
});

// ---------- AUTH ----------

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { displayName, username, email, password } = req.body;

    if (!displayName || !username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if username or email already exists
    const { data: existing, error: checkError } = await supabase
      .from('users')
      .select('id')
      .or(`username.eq.${username},email.eq.${email}`)
      .limit(1);

    if (checkError) {
      console.error('Supabase check error:', checkError);
      return res.status(500).json({ error: 'Error checking user' });
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
    };

    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert(newUser)
      .select('id,username,email,display_name,avatar_url,bio,created_at')
      .single();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return res.status(500).json({ error: 'Error creating user' });
    }

    const token = signToken(inserted);

    res.status(201).json({
      user: inserted,
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Login (email OR username + password)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, email, username, password } = req.body;
    const loginId = (identifier || email || username || '').trim();

    if (!loginId || !password) {
      return res
        .status(400)
        .json({ error: 'Please enter your username/email and password.' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${loginId},username.eq.${loginId}`)
      .single();

    if (userError || !user) {
      console.error('Login user error:', userError);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);

    const safeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      bio: user.bio || '',
      created_at: user.created_at
    };

    res.json({
      user: safeUser,
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Current user (simple)
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id,username,email,display_name,avatar_url,bio,created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('/api/auth/me error:', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// ---------- PROFILE / USERS ----------

// Get current user's profile (for profile.html)
app.get('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id,username,email,display_name,avatar_url,bio,created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !data) {
      console.error('/api/users/me error:', error);
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(data);
  } catch (err) {
    console.error('/api/users/me unexpected error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Update current user's profile
app.put('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const { display_name, bio, avatar_url } = req.body;

    if (!display_name || !display_name.trim()) {
      return res.status(400).json({ error: 'Display name is required' });
    }

    const updates = {
      display_name: display_name.trim(),
      bio: bio ? bio.trim() : '',
      avatar_url: avatar_url || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select('id,username,email,display_name,avatar_url,bio,created_at')
      .single();

    if (error || !data) {
      console.error('update /api/users/me error:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json(data);
  } catch (err) {
    console.error('update /api/users/me unexpected error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ---------- POSTS (basic) ----------
// Supabase table "posts": id uuid, user_id uuid, content text, created_at timestamptz

// Get latest posts
app.get('/api/posts', async (req, res) => {
  try {
    const { data: posts, error } = await supabase
      .from('posts')
      .select('id,user_id,content,created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('/api/posts error:', error);
      return res.status(500).json({ error: 'Failed to load posts' });
    }

    if (!posts || posts.length === 0) {
      return res.json([]);
    }

    const userIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];

    let usersById = {};
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id,username,display_name,avatar_url')
        .in('id', userIds);

      if (usersError) {
        console.error('users lookup error:', usersError);
      } else {
        usersById = (users || []).reduce((acc, u) => {
          acc[u.id] = u;
          return acc;
        }, {});
      }
    }

    const result = posts.map(p => ({
      id: p.id,
      content: p.content,
      created_at: p.created_at,
      user: usersById[p.user_id] || null,
      likes: [],
      comments: [],
      reposts: []
    }));

    res.json(result);
  } catch (err) {
    console.error('GET /api/posts unexpected error:', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// Create new post
app.post('/api/posts', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post content cannot be empty' });
    }

    if (content.length > 280) {
      return res.status(400).json({ error: 'Post must be 280 characters or less' });
    }

    const now = new Date().toISOString();
    const newPost = {
      id: uuidv4(),
      user_id: req.user.id,
      content: content.trim(),
      created_at: now
    };

    const { data: inserted, error } = await supabase
      .from('posts')
      .insert(newPost)
      .select('id,user_id,content,created_at')
      .single();

    if (error || !inserted) {
      console.error('POST /api/posts insert error:', error);
      return res.status(500).json({ error: 'Failed to create post' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id,username,display_name,avatar_url')
      .eq('id', req.user.id)
      .single();

    if (userError || !user) {
      console.error('author lookup error:', userError);
    }

    const response = {
      id: inserted.id,
      content: inserted.content,
      created_at: inserted.created_at,
      user: user || null,
      likes: [],
      comments: [],
      reposts: []
    };

    res.status(201).json(response);
  } catch (err) {
    console.error('POST /api/posts unexpected error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Like / unlike post (stub for now so front-end doesn't break)
app.post('/api/posts/:id/like', authMiddleware, async (req, res) => {
  try {
    // TODO: Implement a "post_likes" table later.
    // Just return a dummy response for now.
    res.json({ liked: true, likes: 1 });
  } catch (err) {
    console.error('POST /api/posts/:id/like error:', err);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// ---------- START SERVER ----------

app.listen(PORT, () => {
  console.log(`🚀 Backend API listening on port ${PORT}`);
});
