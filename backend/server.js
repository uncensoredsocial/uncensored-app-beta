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
const JWT_SECRET = process.env.JWT_SECRET;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !JWT_SECRET) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or JWT_SECRET in environment.');
  process.exit(1);
}

// Supabase client (use service role key)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// --------- Middleware ---------
app.use(cors()); // open CORS so mobile / any origin can hit the API
app.use(express.json());

// --------- Auth middleware ---------
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// --------- Routes ---------

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { count: userCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    const { count: postCount } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true });

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      users: userCount ?? 0,
      posts: postCount ?? 0
    });
  } catch (err) {
    console.error('Health error:', err);
    res.status(500).json({ status: 'ERROR' });
  }
});

// ---------- AUTH ----------

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, username, displayName } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password, and username are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check email exists
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingEmail) {
      return res.status(400).json({ error: 'Email is already in use' });
    }

    // Check username exists
    const { data: existingUsername } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existingUsername) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: user, error } = await supabase
      .from('users')
      .insert([
        {
          id: uuidv4(),
          email,
          username,
          display_name: displayName || username,
          password_hash: passwordHash
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Signup insert error:', error);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      user,
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body; // we’re logging in by email for now

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ user, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, username, display_name, avatar_url, created_at')
      .eq('id', req.user.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('Auth/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- POSTS ----------

// GET /api/posts
app.get('/api/posts', async (req, res) => {
  try {
    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, user_id, content, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get posts error:', error);
      return res.status(500).json({ error: 'Failed to fetch posts' });
    }

    if (!posts || posts.length === 0) {
      return res.json([]);
    }

    // Attach user info for each post
    const userIds = [...new Set(posts.map(p => p.user_id))];

    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds);

    if (userErr) {
      console.error('Get post users error:', userErr);
      return res.status(500).json({ error: 'Failed to fetch users for posts' });
    }

    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = u; });

    const postsWithUsers = posts.map(p => ({
      ...p,
      user: userMap[p.user_id] || null
    }));

    res.json(postsWithUsers);
  } catch (err) {
    console.error('Posts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts  (create post)
app.post('/api/posts', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post content is required' });
    }
    if (content.length > 280) {
      return res.status(400).json({ error: 'Post must be 280 characters or less' });
    }

    const { data: post, error } = await supabase
      .from('posts')
      .insert([
        {
          id: uuidv4(),
          user_id: req.user.userId,
          content: content.trim()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Create post error:', error);
      return res.status(500).json({ error: 'Failed to create post' });
    }

    res.status(201).json(post);
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts/:id/like  (toggle like)
app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.userId;

    // Does a like already exist?
    const { data: existing, error: existingErr } = await supabase
      .from('likes')
      .select('*')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingErr) {
      console.error('Like fetch error:', existingErr);
      return res.status(500).json({ error: 'Failed to update like' });
    }

    if (existing) {
      // unlike
      const { error: delErr } = await supabase
        .from('likes')
        .delete()
        .eq('id', existing.id);

      if (delErr) {
        console.error('Unlike error:', delErr);
        return res.status(500).json({ error: 'Failed to unlike post' });
      }

      return res.json({ liked: false });
    } else {
      // like
      const { error: insErr } = await supabase
        .from('likes')
        .insert([
          {
            id: uuidv4(),
            post_id: postId,
            user_id: userId
          }
        ]);

      if (insErr) {
        console.error('Like insert error:', insErr);
        return res.status(500).json({ error: 'Failed to like post' });
      }

      return res.json({ liked: true });
    }
  } catch (err) {
    console.error('Like route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------- Start server ---------
app.listen(PORT, () => {
  console.log(`Backend API listening on port ${PORT}`);
});
