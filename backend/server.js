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
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- Middleware ---
app.use(express.json());
app.use(
  cors({
    origin: [
      'https://spepdb.github.io', // your GitHub Pages frontend
      'https://uncensored-app-beta-production.up.railway.app' // backend origin / health
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// ======================================================
//                    AUTH HELPERS
// ======================================================

function signToken(user) {
  const payload = { id: user.id, username: user.username, email: user.email };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

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

// Admin / moderator check
async function adminMiddleware(req, res, next) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, is_admin, is_moderator')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!user.is_admin && !user.is_moderator) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = user;
    next();
  } catch (err) {
    console.error('adminMiddleware error:', err);
    return res.status(500).json({ error: 'Admin check failed' });
  }
}

// Profile stats helper
async function getUserStats(userId) {
  const [
    { count: postsCount },
    { count: followersCount },
    { count: followingCount }
  ] = await Promise.all([
    supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('followed_id', userId),
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId)
  ]);

  return {
    posts_count: postsCount || 0,
    followers_count: followersCount || 0,
    following_count: followingCount || 0
  };
}

// ======================================================
//                    HEALTH CHECK
// ======================================================

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
    res.status(500).json({ status: 'ERROR' });
  }
});

// ======================================================
//                    AUTH ROUTES
// ======================================================

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { displayName, username, email, password } = req.body;

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
      banner_url: null,
      bio: '',
      created_at: now,
      last_login_at: now,
      is_admin: false,
      is_moderator: false
    };

    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert(newUser)
      .select('*')
      .single();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return res.status(500).json({ error: 'Error creating user' });
    }

    const token = signToken(inserted);
    const stats = await getUserStats(inserted.id);

    res.status(201).json({
      user: {
        id: inserted.id,
        username: inserted.username,
        email: inserted.email,
        display_name: inserted.display_name,
        avatar_url: inserted.avatar_url,
        banner_url: inserted.banner_url,
        bio: inserted.bio,
        created_at: inserted.created_at,
        ...stats
      },
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Login (identifier = email OR username)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Missing email/username or password' });
    }

    const isEmail = identifier.includes('@');
    const baseQuery = supabase.from('users').select('*').limit(1);

    const { data, error: userError } = isEmail
      ? await baseQuery.eq('email', identifier)
      : await baseQuery.eq('username', identifier);

    if (userError || !data || data.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = data[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Update last_login_at
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    const token = signToken(user);
    const stats = await getUserStats(user.id);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        bio: user.bio,
        created_at: user.created_at,
        ...stats
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id,username,email,display_name,avatar_url,banner_url,bio,created_at,is_admin,is_moderator')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = await getUserStats(user.id);

    res.json({
      ...user,
      ...stats
    });
  } catch (err) {
    console.error('/auth/me error:', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// Update current user's profile
app.put('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { display_name, bio, avatar_url, banner_url } = req.body;

    const updates = {};
    if (typeof display_name === 'string') updates.display_name = display_name.trim();
    if (typeof bio === 'string') updates.bio = bio.trim();
    if (typeof avatar_url === 'string') updates.avatar_url = avatar_url.trim() || null;
    if (typeof banner_url === 'string') updates.banner_url = banner_url.trim() || null;

    const { data: updated, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select('id,username,email,display_name,avatar_url,banner_url,bio,created_at,is_admin,is_moderator')
      .single();

    if (error) {
      console.error('Profile update error:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    const stats = await getUserStats(updated.id);

    res.json({
      ...updated,
      ...stats
    });
  } catch (err) {
    console.error('PUT /auth/me error:', err);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

// ======================================================
//                      POSTS
// ======================================================

// Get global feed
app.get('/api/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        id,
        content,
        created_at,
        user:users (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Get posts error:', error);
      return res.status(500).json({ error: 'Failed to load posts' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('GET /posts error:', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// Create new post
app.post('/api/posts', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post content is required' });
    }
    if (content.length > 280) {
      return res.status(400).json({ error: 'Post must be 280 characters or less' });
    }

    const post = {
      id: uuidv4(),
      user_id: req.user.id,
      content: content.trim(),
      created_at: new Date().toISOString()
    };

    const { data: inserted, error } = await supabase
      .from('posts')
      .insert(post)
      .select('*')
      .single();

    if (error) {
      console.error('Create post error:', error);
      return res.status(500).json({ error: 'Failed to create post' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id,username,display_name,avatar_url')
      .eq('id', req.user.id)
      .single();

    res.status(201).json({
      ...inserted,
      user
    });
  } catch (err) {
    console.error('POST /posts error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Like / Unlike post
app.post('/api/posts/:id/like', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const { data: existing, error: checkError } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      console.error('Like check error:', checkError);
      return res.status(500).json({ error: 'Failed to like post' });
    }

    let liked;

    if (existing) {
      // Unlike
      const { error: delError } = await supabase
        .from('post_likes')
        .delete()
        .eq('id', existing.id);

      if (delError) {
        console.error('Unlike error:', delError);
        return res.status(500).json({ error: 'Failed to unlike post' });
      }
      liked = false;
    } else {
      // Like
      const { error: insError } = await supabase
        .from('post_likes')
        .insert({
          id: uuidv4(),
          post_id: postId,
          user_id: userId
        });

      if (insError) {
        console.error('Like error:', insError);
        return res.status(500).json({ error: 'Failed to like post' });
      }
      liked = true;
    }

    const { count } = await supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    res.json({
      liked,
      likes: count || 0
    });
  } catch (err) {
    console.error('POST /posts/:id/like error:', err);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// ======================================================
//                   PROFILE / USERS
// ======================================================

// Get user by username (for visiting other profiles)
app.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('id,username,display_name,avatar_url,banner_url,bio,created_at')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = await getUserStats(user.id);
    res.json({ ...user, ...stats });
  } catch (err) {
    console.error('GET /users/:username error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Get posts for a given username (profile page)
app.get('/api/users/:username/posts', async (req, res) => {
  try {
    const { username } = req.params;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { data: posts, error } = await supabase
      .from('posts')
      .select('id,content,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get profile posts error:', error);
      return res.status(500).json({ error: 'Failed to load posts' });
    }

    res.json(posts || []);
  } catch (err) {
    console.error('GET /users/:username/posts error:', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// Follow / unfollow by username
app.post('/api/users/:username/follow', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.user.id;

    const { data: target, error: targetError } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (targetError || !target) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (target.id === currentUserId) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    const { data: existing, error: checkError } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', currentUserId)
      .eq('followed_id', target.id)
      .maybeSingle();

    if (checkError) {
      console.error('Follow check error:', checkError);
      return res.status(500).json({ error: 'Failed to update follow status' });
    }

    let following;

    if (existing) {
      const { error: delError } = await supabase
        .from('follows')
        .delete()
        .eq('id', existing.id);

      if (delError) {
        console.error('Unfollow error:', delError);
        return res.status(500).json({ error: 'Failed to unfollow' });
      }
      following = false;
    } else {
      const { error: insError } = await supabase
        .from('follows')
        .insert({
          id: uuidv4(),
          follower_id: currentUserId,
          followed_id: target.id
        });

      if (insError) {
        console.error('Follow error:', insError);
        return res.status(500).json({ error: 'Failed to follow' });
      }
      following = true;
    }

    const stats = await getUserStats(target.id);

    res.json({
      following,
      ...stats
    });
  } catch (err) {
    console.error('POST /users/:username/follow error:', err);
    res.status(500).json({ error: 'Failed to update follow status' });
  }
});

// ======================================================
//                        SEARCH
// ======================================================

// Search users + posts + hashtags
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Missing search query' });
    }

    const pattern = `%${q}%`;

    const [
      { data: users, error: usersError },
      { data: posts, error: postsError },
      { data: hashtags, error: tagsError }
    ] = await Promise.all([
      supabase
        .from('users')
        .select('id,username,display_name,avatar_url,bio')
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .limit(10),
      supabase
        .from('posts')
        .select(`
          id,
          content,
          created_at,
          user:users (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .ilike('content', pattern)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('hashtags')
        .select('id,tag')
        .ilike('tag', pattern)
        .limit(10)
    ]);

    if (usersError || postsError || tagsError) {
      console.error('Search errors:', { usersError, postsError, tagsError });
      return res.status(500).json({ error: 'Search failed' });
    }

    res.json({
      users: users || [],
      posts: posts || [],
      hashtags: hashtags || []
    });
  } catch (err) {
    console.error('GET /search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Save search query to history
app.post('/api/search/history', authMiddleware, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const item = {
      id: uuidv4(),
      user_id: req.user.id,
      query: query.trim(),
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('search_history').insert(item);
    if (error) {
      console.error('Insert search history error:', error);
      return res.status(500).json({ error: 'Failed to save search history' });
    }

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('POST /search/history error:', err);
    res.status(500).json({ error: 'Failed to save search history' });
  }
});

// Get current user's recent search history
app.get('/api/search/history', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('search_history')
      .select('id,query,created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) {
      console.error('Get search history error:', error);
      return res.status(500).json({ error: 'Failed to load search history' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('GET /search/history error:', err);
    res.status(500).json({ error: 'Failed to load search history' });
  }
});

// ======================================================
//                     ADMIN ROUTES
// ======================================================

// Simple stats overview
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalUsers },
      { count: totalPosts },
      { count: totalLikes },
      { count: totalFollows },
      { count: signupsLast24h },
      { count: activeLast24h }
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('post_likes').select('*', { count: 'exact', head: true }),
      supabase.from('follows').select('*', { count: 'exact', head: true }),
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday),
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_login_at', yesterday)
    ]);

    res.json({
      total_users: totalUsers || 0,
      total_posts: totalPosts || 0,
      total_likes: totalLikes || 0,
      total_follows: totalFollows || 0,
      signups_last_24h: signupsLast24h || 0,
      active_users_last_24h: activeLast24h || 0
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    res.status(500).json({ error: 'Failed to load admin stats' });
  }
});

// List latest users (for admin dashboard)
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

    const { data, error } = await supabase
      .from('users')
      .select('id,username,email,display_name,created_at,last_login_at,is_admin,is_moderator')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('GET /admin/users error:', error);
      return res.status(500).json({ error: 'Failed to load users' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('GET /admin/users error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// List latest posts with author (for moderation)
app.get('/api/admin/posts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);

    const { data, error } = await supabase
      .from('posts')
      .select(`
        id,
        content,
        created_at,
        user:users (
          id,
          username,
          display_name,
          email
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('GET /admin/posts error:', error);
      return res.status(500).json({ error: 'Failed to load posts' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('GET /admin/posts error:', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// HARD DELETE a post (no hiding)
app.delete('/api/admin/posts/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;

    // Delete likes first (if any)
    await supabase.from('post_likes').delete().eq('post_id', postId);

    // Delete the post itself
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) {
      console.error('Delete post error:', error);
      return res.status(500).json({ error: 'Failed to delete post' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /admin/posts/:id error:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// (You can later add hard-delete for users, reports, etc. here)

// ======================================================
//                     START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(`🚀 Backend API listening on port ${PORT}`);
});
