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

// ---------- Supabase setup ----------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// bucket name for profile / banner images
const USER_MEDIA_BUCKET = 'user-media';

// admin emails (hard-coded + env)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'ssssss@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// ---------- Middleware ----------
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

// allow bigger JSON bodies for base64 images
app.use(express.json({ limit: '10mb' }));

// ---------- Auth helpers ----------
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

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const email = String(req.user.email).toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Utility: stats for a user
async function getUserStats(userId) {
  const [{ count: postsCount }, { count: followersCount }, { count: followingCount }] =
    await Promise.all([
      supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', userId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
    ]);

  return {
    posts_count: postsCount || 0,
    followers_count: followersCount || 0,
    following_count: followingCount || 0
  };
}

// ======================================================
//                        HEALTH
// ======================================================

app.get('/api/health', async (req, res) => {
  try {
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });

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
//                        AUTH
// ======================================================

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { displayName, username, email, password } = req.body;

    if (!displayName || !username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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
      last_login_at: now
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

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body; // email or username

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Missing email/username or password' });
    }

    const isEmail = identifier.includes('@');
    const query = supabase.from('users').select('*').limit(1);
    const { data, error: userError } = isEmail
      ? await query.eq('email', identifier)
      : await query.eq('username', identifier);

    if (userError || !data || data.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = data[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // update last login
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

// Current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id,username,email,display_name,avatar_url,banner_url,bio,created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = await getUserStats(user.id);
    res.json({ ...user, ...stats });
  } catch (err) {
    console.error('/auth/me error:', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

// Update current user profile
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
      .select('id,username,email,display_name,avatar_url,banner_url,bio,created_at')
      .single();

    if (error) {
      console.error('Profile update error:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    const stats = await getUserStats(updated.id);
    res.json({ ...updated, ...stats });
  } catch (err) {
    console.error('PUT /auth/me error:', err);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

// ======================================================
//                  IMAGE UPLOAD (PROFILE/BANNER)
// ======================================================

app.post('/api/profile/upload-image', authMiddleware, async (req, res) => {
  try {
    const { imageData, kind } = req.body; // base64 string (no data: prefix), kind: 'avatar' | 'banner'

    if (!imageData || !kind || !['avatar', 'banner'].includes(kind)) {
      return res.status(400).json({ error: 'Missing image data or kind' });
    }

    const buffer = Buffer.from(imageData, 'base64');
    const folder = kind === 'avatar' ? 'avatars' : 'banners';
    const fileName = `${folder}/${req.user.id}-${Date.now()}.jpg`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(USER_MEDIA_BUCKET)
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload image' });
    }

    const { data: publicData } = supabase.storage
      .from(USER_MEDIA_BUCKET)
      .getPublicUrl(fileName);

    const publicUrl = publicData && publicData.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ error: 'Could not get public URL' });
    }

    res.status(201).json({ url: publicUrl });
  } catch (err) {
    console.error('POST /profile/upload-image error:', err);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

// ======================================================
//                        POSTS
// ======================================================

// Global feed
app.get('/api/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(
        `
        id,
        content,
        created_at,
        user:users (
          id,
          username,
          display_name,
          avatar_url
        )
      `
      )
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

// Create post
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

    const { data: inserted, error } = await supabase.from('posts').insert(post).select('*').single();

    if (error) {
      console.error('Create post error:', error);
      return res.status(500).json({ error: 'Failed to create post' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id,username,display_name,avatar_url')
      .eq('id', req.user.id)
      .single();

    res.status(201).json({ ...inserted, user });
  } catch (err) {
    console.error('POST /posts error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Like / unlike
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
      const { error: delError } = await supabase.from('post_likes').delete().eq('id', existing.id);
      if (delError) {
        console.error('Unlike error:', delError);
        return res.status(500).json({ error: 'Failed to unlike post' });
      }
      liked = false;
    } else {
      const { error: insError } = await supabase.from('post_likes').insert({
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

    res.json({ liked, likes: count || 0 });
  } catch (err) {
    console.error('POST /posts/:id/like error:', err);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// ======================================================
//                     PROFILE / FOLLOWS
// ======================================================

// Get user by username
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

// Posts for a user
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

// Follow / unfollow
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
      const { error: delError } = await supabase.from('follows').delete().eq('id', existing.id);
      if (delError) {
        console.error('Unfollow error:', delError);
        return res.status(500).json({ error: 'Failed to unfollow' });
      }
      following = false;
    } else {
      const { error: insError } = await supabase.from('follows').insert({
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
    res.json({ following, ...stats });
  } catch (err) {
    console.error('POST /users/:username/follow error:', err);
    res.status(500).json({ error: 'Failed to update follow status' });
  }
});

// ======================================================
//                         SEARCH
// ======================================================

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
        .select(
          `
          id,
          content,
          created_at,
          user:users (
            id,
            username,
            display_name,
            avatar_url
          )
        `
        )
        .ilike('content', pattern)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('hashtags').select('id,tag').ilike('tag', pattern).limit(10)
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

// search history: save
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

// search history: get
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
//                        ADMIN
// ======================================================

// basic stats
app.get('/api/admin/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const now = new Date().toISOString();

    const [
      { count: userCount },
      { count: postCount },
      { count: likeCount },
      { count: followCount },
      { count: hashtagCount },
      { count: searchCount }
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('post_likes').select('*', { count: 'exact', head: true }),
      supabase.from('follows').select('*', { count: 'exact', head: true }),
      supabase.from('hashtags').select('*', { count: 'exact', head: true }),
      supabase.from('search_history').select('*', { count: 'exact', head: true })
    ]);

    res.json({
      timestamp: now,
      users: userCount || 0,
      posts: postCount || 0,
      likes: likeCount || 0,
      follows: followCount || 0,
      hashtags: hashtagCount || 0,
      searches: searchCount || 0
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// list users (simple)
app.get('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id,username,email,display_name,created_at,last_login_at')
      .order('created_at', { ascending: false })
      .limit(100);

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

// list posts (simple)
app.get('/api/admin/posts', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(
        `
        id,
        content,
        created_at,
        user:users (
          id,
          username,
          display_name
        )
      `
      )
      .order('created_at', { ascending: false })
      .limit(200);

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

// hard delete a post
app.delete('/api/admin/posts/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const postId = req.params.id;

    // delete likes for that post
    await supabase.from('post_likes').delete().eq('post_id', postId);

    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      console.error('DELETE /admin/posts/:id error:', error);
      return res.status(500).json({ error: 'Failed to delete post' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /admin/posts/:id error:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// hard delete a user (and related data)
app.delete('/api/admin/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // delete in reasonable order
    await supabase.from('post_likes').delete().eq('user_id', userId);
    await supabase.from('follows').delete().or(`follower_id.eq.${userId},followed_id.eq.${userId}`);
    await supabase.from('search_history').delete().eq('user_id', userId);
    await supabase.from('posts').delete().eq('user_id', userId);

    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) {
      console.error('DELETE /admin/users/:id error:', error);
      return res.status(500).json({ error: 'Failed to delete user' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /admin/users/:id error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ======================================================
//                      START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(`🚀 Backend API listening on port ${PORT}`);
});
