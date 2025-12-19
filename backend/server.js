// backend/server.js

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ======================================================
//                     SUPABASE SETUP
// ======================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Buckets
const USER_MEDIA_BUCKET = 'user-media';
const POST_MEDIA_BUCKET = 'post-media';
const POST_DOWNLOADS_BUCKET = 'post-downloads'; // ✅ NEW private bucket for downloads

// Admin emails (hard-coded plus optional env override)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'ssssss@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// ======================================================
//                      MIDDLEWARE
// ======================================================

app.use(
  cors({
    origin: [
      'https://spepdb.github.io', // frontend
      'https://uncensored-app-beta-production.up.railway.app' // backend (for tests / tools)
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// allow larger JSON bodies for base64 images
app.use(express.json({ limit: '10mb' }));

// ======================================================
//                    AUTH HELPERS
// ======================================================

function signToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email
  };
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

// Helper to *optionally* get current user id from Authorization header
function getUserIdFromAuthHeader(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id; // signToken uses { id, username, email }
  } catch {
    return null;
  }
}

// Utility: stats for a single user
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

// Shared helper to shape a post row into what the frontend expects
function shapePostRow(p, currentUserId) {
  const likesArr = p.post_likes || [];
  const commentsArr = p.post_comments || [];
  const savesArr = p.post_saves || [];

  const likedByMe = currentUserId
    ? likesArr.some((l) => l.user_id === currentUserId)
    : false;
  const savedByMe = currentUserId
    ? savesArr.some((s) => s.user_id === currentUserId)
    : false;

  return {
    id: p.id,
    content: p.content,
    media_url: p.media_url || null,
    media_type: p.media_type || null,
    created_at: p.created_at,
    user: p.user,
    likes: likesArr.length,
    comments_count: commentsArr.length,
    saves_count: savesArr.length,
    liked_by_me: likedByMe,
    saved_by_me: savedByMe
  };
}

// ======================================================
//                        HEALTH
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
//                         AUTH
// ======================================================

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
      return res
        .status(400)
        .json({ error: 'Username or email already in use' });
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

// Login (email or username)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ error: 'Missing email/username or password' });
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

    // update last_login_at
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

// Get current user (for profile / app)
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select(
        'id,username,email,display_name,avatar_url,banner_url,bio,created_at'
      )
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
    if (typeof display_name === 'string') {
      updates.display_name = display_name.trim();
    }
    if (typeof bio === 'string') {
      updates.bio = bio.trim();
    }
    if (typeof avatar_url === 'string') {
      updates.avatar_url = avatar_url.trim() || null;
    }
    if (typeof banner_url === 'string') {
      updates.banner_url = banner_url.trim() || null;
    }

    const { data: updated, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select(
        'id,username,email,display_name,avatar_url,banner_url,bio,created_at'
      )
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
//                 PROFILE / BANNER IMAGE UPLOAD
// ======================================================

app.post('/api/profile/upload-image', authMiddleware, async (req, res) => {
  try {
    const { imageData, kind } = req.body; // base64 string (no "data:" prefix), kind: 'avatar' | 'banner'

    if (!imageData || !kind || !['avatar', 'banner'].includes(kind)) {
      return res
        .status(400)
        .json({ error: 'Missing image data or invalid kind' });
    }

    const buffer = Buffer.from(imageData, 'base64');
    const folder = kind === 'avatar' ? 'avatars' : 'banners';
    const fileName = `${folder}/${req.user.id}-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
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
//                          POSTS (FEED / FYP)
// ======================================================

/**
 * Global feed / FYP
 * Modes:
 *  - mode=recent    : all posts, newest first
 *  - mode=following : only posts from accounts the current user follows
 *  - mode=trending  : FYP-style ranking by engagement from *other* users
 *
 * Supports: ?mode=&page=&pageSize=
 */
app.get('/api/posts', async (req, res) => {
  try {
    const rawMode = (req.query.mode || req.query.sort || 'recent')
      .toString()
      .toLowerCase();
    const mode =
      rawMode === 'following' || rawMode === 'trending'
        ? rawMode
        : rawMode === 'popular'
        ? 'trending'
        : 'recent';

    let page = parseInt(req.query.page, 10);
    let pageSize = parseInt(req.query.pageSize, 10);
    if (Number.isNaN(page) || page < 1) page = 1;
    if (Number.isNaN(pageSize) || pageSize < 1) pageSize = 20;
    if (pageSize > 50) pageSize = 50;

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const currentUserId = getUserIdFromAuthHeader(req);

    // Base select used in all modes
    const baseSelect =
      `
        id,
        user_id,
        content,
        media_url,
        media_type,
        created_at,
        user:users (
          id,
          username,
          display_name,
          avatar_url
        ),
        post_likes ( user_id ),
        post_comments ( id, user_id ),
        post_saves ( user_id )
      `;

    let posts = [];

    if (mode === 'following') {
      // Need a logged-in user
      if (!currentUserId) {
        return res.json([]); // not logged in -> no following feed
      }

      // Find who this user follows
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('followed_id')
        .eq('follower_id', currentUserId);

      if (followsError) {
        console.error('Following feed: follows lookup error:', followsError);
        return res.status(500).json({ error: 'Failed to load feed' });
      }

      const followedIds = (follows || []).map((f) => f.followed_id);
      if (!followedIds.length) {
        return res.json([]);
      }

      const { data, error } = await supabase
        .from('posts')
        .select(baseSelect)
        .in('user_id', followedIds)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Following feed posts error:', error);
        return res.status(500).json({ error: 'Failed to load feed' });
      }

      posts = data || [];
    } else if (mode === 'trending') {
      // Trending = posts in recent window, ranked by engagement from OTHER users.
      const now = Date.now();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Pull a chunk of recent posts (e.g., last 7 days, up to 300)
      const { data, error } = await supabase
        .from('posts')
        .select(baseSelect)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) {
        console.error('Trending feed posts error:', error);
        return res.status(500).json({ error: 'Failed to load feed' });
      }

      const rawPosts = data || [];

      // Compute trending score per post
      const scored = rawPosts.map((p) => {
        const postAuthorId = (p.user && p.user.id) || p.user_id;

        const likesArr = (p.post_likes || []).filter(
          (l) => l.user_id && l.user_id !== postAuthorId
        );
        const commentsArr = (p.post_comments || []).filter(
          (c) => c.user_id && c.user_id !== postAuthorId
        );
        const savesArr = (p.post_saves || []).filter(
          (s) => s.user_id && s.user_id !== postAuthorId
        );

        const likeCount = likesArr.length;
        const commentCount = commentsArr.length;
        const saveCount = savesArr.length;

        const createdAt = new Date(p.created_at).getTime() || now;
        const ageHours = Math.max(1, (now - createdAt) / (1000 * 60 * 60));

        // Engagement score: saves > comments > likes, plus recency boost
        const rawEngagementScore =
          likeCount * 1 + commentCount * 2 + saveCount * 3;

        // Simple time decay: newer posts get higher weight for the same engagement
        const timeFactor = 24 / (24 + ageHours); // 0..1, ~1 if <1h old, drops over time

        const score = rawEngagementScore * timeFactor;

        return {
          ...p,
          _score: score
        };
      });

      // Sort by score desc, then by recency desc
      scored.sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      // Apply pagination in memory
      const paged = scored.slice(from, to + 1);
      posts = paged;
    } else {
      // mode === 'recent' (default)
      const { data, error } = await supabase
        .from('posts')
        .select(baseSelect)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Recent feed posts error:', error);
        return res.status(500).json({ error: 'Failed to load posts' });
      }

      posts = data || [];
    }

    const shaped = posts.map((p) => shapePostRow(p, currentUserId));
    res.json(shaped);
  } catch (err) {
    console.error('GET /api/posts error:', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// Create post
app.post('/api/posts', authMiddleware, async (req, res) => {
  try {
    const { content, media_url, media_type } = req.body;

    const hasText = content && content.trim().length > 0;
    const hasMedia = !!media_url;

    if (!hasText && !hasMedia) {
      return res
        .status(400)
        .json({ error: 'Post must have text or media.' });
    }

    if (hasText && content.trim().length > 280) {
      return res
        .status(400)
        .json({ error: 'Post must be 280 characters or less' });
    }

    const post = {
      id: uuidv4(),
      user_id: req.user.id,
      content: hasText ? content.trim() : '',
      created_at: new Date().toISOString(),
      media_url: media_url || null,
      media_type: media_type || null
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

// Single post with user + likes + comments + save status
app.get('/api/posts/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    const currentUserId = getUserIdFromAuthHeader(req);

    const { data, error } = await supabase
      .from('posts')
      .select(
        `
        id,
        user_id,
        content,
        media_url,
        media_type,
        created_at,
        user:users (
          id,
          username,
          display_name,
          avatar_url
        ),
        post_likes ( user_id ),
        post_saves ( user_id ),
        post_comments (
          id,
          content,
          created_at,
          user_id,
          user:users (
            id,
            username,
            display_name,
            avatar_url
          )
        )
      `
      )
      .eq('id', postId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const likesArr = data.post_likes || [];
    const savesArr = data.post_saves || [];
    const commentsArr = data.post_comments || [];

    const likedByMe = currentUserId
      ? likesArr.some((l) => l.user_id === currentUserId)
      : false;
    const savedByMe = currentUserId
      ? savesArr.some((s) => s.user_id === currentUserId)
      : false;

    res.json({
      id: data.id,
      content: data.content,
      media_url: data.media_url,
      media_type: data.media_type,
      created_at: data.created_at,
      user: data.user,
      likes: likesArr.length,
      saves_count: savesArr.length,
      comments_count: commentsArr.length,
      liked_by_me: likedByMe,
      saved_by_me: savedByMe,
      comments: commentsArr
    });
  } catch (err) {
    console.error('GET /posts/:id error:', err);
    res.status(500).json({ error: 'Failed to load post' });
  }
});

// Like / unlike a post
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

    res.json({
      liked,
      likes: count || 0
    });
  } catch (err) {
    console.error('POST /posts/:id/like error:', err);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Create a comment on a post
app.post('/api/posts/:id/comments', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const newComment = {
      id: uuidv4(),
      post_id: postId,
      user_id: req.user.id,
      content: content.trim(),
      created_at: new Date().toISOString()
    };

    const { data: inserted, error } = await supabase
      .from('post_comments')
      .insert(newComment)
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
      .single();

    if (error) {
      console.error('Create comment error:', error);
      return res.status(500).json({ error: 'Failed to create comment' });
    }

    res.status(201).json(inserted);
  } catch (err) {
    console.error('POST /posts/:id/comments error:', err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Get all comments for a post
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = req.params.id;

    const { data, error } = await supabase
      .from('post_comments')
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
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Get comments error:', error);
      return res.status(500).json({ error: 'Failed to load comments' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('GET /posts/:id/comments error:', err);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

// Delete a comment (only owner can delete)
app.delete('/api/comments/:id', authMiddleware, async (req, res) => {
  try {
    const commentId = req.params.id;
    const userId = req.user.id;

    // make sure it exists and belongs to this user
    const { data: comment, error: commentError } = await supabase
      .from('post_comments')
      .select('id, user_id')
      .eq('id', commentId)
      .single();

    if (commentError || !comment) {
      console.error('Delete comment: not found', commentError);
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.user_id !== userId) {
      return res
        .status(403)
        .json({ error: 'You can only delete your own comments' });
    }

    const { error: deleteError } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId);

    if (deleteError) {
      console.error('Delete comment error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete comment' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/comments/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Save / unsave (bookmark) a post
app.post('/api/posts/:id/save', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const { data: existing, error: checkError } = await supabase
      .from('post_saves')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      console.error('Save check error:', checkError);
      return res.status(500).json({ error: 'Failed to update save status' });
    }

    let saved;

    if (existing) {
      await supabase.from('post_saves').delete().eq('id', existing.id);
      saved = false;
    } else {
      await supabase.from('post_saves').insert({
        id: uuidv4(),
        post_id: postId,
        user_id: userId
      });
      saved = true;
    }

    res.json({ saved });
  } catch (err) {
    console.error('POST /posts/:id/save error:', err);
    res.status(500).json({ error: 'Failed to update save status' });
  }
});

// DELETE a post (owner only)
app.delete('/api/posts/:id', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    // 1) Make sure the post exists and belongs to this user
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id,user_id')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      console.error('Delete post: post not found', postError);
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.user_id !== userId) {
      return res
        .status(403)
        .json({ error: 'You can only delete your own posts' });
    }

    // 2) Delete related rows
    await supabase.from('post_likes').delete().eq('post_id', postId);
    await supabase.from('post_comments').delete().eq('post_id', postId);
    await supabase.from('post_saves').delete().eq('post_id', postId);

    // 3) Delete the post itself
    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (deleteError) {
      console.error('Delete post error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete post' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/posts/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ======================================================
//                  POST VIDEO DOWNLOAD
// ======================================================

app.get('/api/posts/:id/download', async (req, res) => {
  try {
    const postId = req.params.id;
    const wantWatermark = String(req.query.watermark || '0') === '1';

    // 1) Lookup the post paths from DB
    // NOTE: you said you already added SQL — so these columns should exist
    const { data: post, error: postErr } = await supabase
      .from('posts')
      .select('id, video_path, video_watermarked_path, video_mime')
      .eq('id', postId)
      .single();

    if (postErr || !post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const objectPath =
      wantWatermark && post.video_watermarked_path
        ? post.video_watermarked_path
        : post.video_path;

    if (!objectPath) {
      return res.status(404).json({ error: 'No video available for download' });
    }

    // 2) Create a signed URL for the private file in the PRIVATE bucket
    const { data: signed, error: signErr } = await supabase.storage
      .from(POST_DOWNLOADS_BUCKET)
      .createSignedUrl(objectPath, 60);

    if (signErr || !signed?.signedUrl) {
      console.error('Signed URL error:', signErr);
      return res.status(500).json({ error: 'Could not create download URL' });
    }

    const signedUrl = signed.signedUrl;

    // 3) Proxy stream with download headers so it ACTUALLY downloads
    const range = req.headers.range;

    const upstream = await fetch(signedUrl, {
      headers: range ? { Range: range } : {},
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(502).json({ error: 'Upstream download failed' });
    }

    const contentType =
      upstream.headers.get('content-type') ||
      post.video_mime ||
      'video/mp4';

    const filename = wantWatermark
      ? `uncensored-${postId}-watermarked.mp4`
      : `uncensored-${postId}.mp4`;

    res.setHeader('Content-Type', contentType);

    // ✅ This forces Save-As download instead of inline playback
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Forward useful headers (helps iOS + large files)
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges');

    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    res.status(upstream.status);

    if (!upstream.body) return res.status(500).end();

    upstream.body.pipe(res);
  } catch (err) {
    console.error('download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ======================================================
//            FOLLOWERS / FOLLOWING LIST ENDPOINTS
// ======================================================

// Get followers list for a username
app.get('/api/users/:username/followers', async (req, res) => {
  try {
    const { username } = req.params;

    // viewer (optional) so we can return is_following flags for buttons
    const viewerId = getUserIdFromAuthHeader(req);

    // target user
    const { data: target, error: targetErr } = await supabase
      .from('users')
      .select('id,username')
      .eq('username', username)
      .single();

    if (targetErr || !target) {
      return res.status(404).json({ error: 'User not found' });
    }

    // followers = rows where followed_id = target.id
    const { data: rows, error } = await supabase
      .from('follows')
      .select(`
        id,
        created_at,
        follower:users!follows_follower_id_fkey (
          id, username, display_name, avatar_url
        )
      `)
      .eq('followed_id', target.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('followers list error:', error);
      return res.status(500).json({ error: 'Failed to load followers' });
    }

    const followers = (rows || []).map(r => r.follower).filter(Boolean);
    const followerIds = followers.map(u => u.id);

    // viewer -> does viewer follow each follower?
    let viewerFollowingSet = new Set();
    if (viewerId && followerIds.length) {
      const { data: viewerFollows, error: vfErr } = await supabase
        .from('follows')
        .select('followed_id')
        .eq('follower_id', viewerId)
        .in('followed_id', followerIds);

      if (vfErr) {
        console.error('viewer following lookup error:', vfErr);
      } else {
        viewerFollowingSet = new Set((viewerFollows || []).map(x => x.followed_id));
      }
    }

    // For followers tab: follows_me is true (they follow the target user)
    const shaped = followers.map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      follows_me: true,
      is_following: viewerId ? viewerFollowingSet.has(u.id) : false
    }));

    const stats = await getUserStats(target.id);

    return res.json({
      users: shaped,
      followers_count: stats.followers_count || 0,
      following_count: stats.following_count || 0
    });
  } catch (err) {
    console.error('GET /users/:username/followers error:', err);
    return res.status(500).json({ error: 'Failed to load followers' });
  }
});

// Get following list for a username
app.get('/api/users/:username/following', async (req, res) => {
  try {
    const { username } = req.params;

    const viewerId = getUserIdFromAuthHeader(req);

    // target user
    const { data: target, error: targetErr } = await supabase
      .from('users')
      .select('id,username')
      .eq('username', username)
      .single();

    if (targetErr || !target) {
      return res.status(404).json({ error: 'User not found' });
    }

    // following = rows where follower_id = target.id
    const { data: rows, error } = await supabase
      .from('follows')
      .select(`
        id,
        created_at,
        followed:users!follows_followed_id_fkey (
          id, username, display_name, avatar_url
        )
      `)
      .eq('follower_id', target.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('following list error:', error);
      return res.status(500).json({ error: 'Failed to load following' });
    }

    const following = (rows || []).map(r => r.followed).filter(Boolean);
    const followedIds = following.map(u => u.id);

    // viewer -> does viewer follow each followed user?
    let viewerFollowingSet = new Set();
    if (viewerId && followedIds.length) {
      const { data: viewerFollows, error: vfErr } = await supabase
        .from('follows')
        .select('followed_id')
        .eq('follower_id', viewerId)
        .in('followed_id', followedIds);

      if (vfErr) {
        console.error('viewer following lookup error:', vfErr);
      } else {
        viewerFollowingSet = new Set((viewerFollows || []).map(x => x.followed_id));
      }
    }

    // do these followed users follow the target back? (optional, good for UI)
    let followsBackSet = new Set();
    if (followedIds.length) {
      const { data: backRows, error: backErr } = await supabase
        .from('follows')
        .select('follower_id,followed_id')
        .in('follower_id', followedIds)
        .eq('followed_id', target.id);

      if (backErr) {
        console.error('follow-back lookup error:', backErr);
      } else {
        followsBackSet = new Set((backRows || []).map(x => x.follower_id));
      }
    }

    const shaped = following.map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      // in "Following" tab, is_following means "viewer follows them" (for button state)
      is_following: viewerId ? viewerFollowingSet.has(u.id) : false,
      follows_me: followsBackSet.has(u.id) // they follow the target back
    }));

    const stats = await getUserStats(target.id);

    return res.json({
      users: shaped,
      followers_count: stats.followers_count || 0,
      following_count: stats.following_count || 0
    });
  } catch (err) {
    console.error('GET /users/:username/following error:', err);
    return res.status(500).json({ error: 'Failed to load following' });
  }
});

// ======================================================
//            USER PROFILE + USER POSTS + FOLLOW TOGGLE
// ======================================================

// Get a public user profile + stats (+ is_following if viewer has token)
app.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const viewerId = getUserIdFromAuthHeader(req);

    const { data: u, error } = await supabase
      .from('users')
      .select('id,username,display_name,avatar_url,banner_url,bio,created_at')
      .eq('username', username)
      .single();

    if (error || !u) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = await getUserStats(u.id);

    let isFollowing = false;
    if (viewerId) {
      const { data: row } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', viewerId)
        .eq('followed_id', u.id)
        .maybeSingle();

      isFollowing = !!row;
    }

    return res.json({
      ...u,
      ...stats,
      is_following: isFollowing
    });
  } catch (err) {
    console.error('GET /api/users/:username error:', err);
    return res.status(500).json({ error: 'Failed to load user' });
  }
});

// Get a user's posts (same shape as feed so your user.js render works)
app.get('/api/users/:username/posts', async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = getUserIdFromAuthHeader(req);

    const { data: target, error: targetErr } = await supabase
      .from('users')
      .select('id,username')
      .eq('username', username)
      .single();

    if (targetErr || !target) {
      return res.status(404).json({ error: 'User not found' });
    }

    const baseSelect = `
      id,
      user_id,
      content,
      media_url,
      media_type,
      created_at,
      user:users (
        id,
        username,
        display_name,
        avatar_url
      ),
      post_likes ( user_id ),
      post_comments ( id, user_id ),
      post_saves ( user_id )
    `;

    const { data, error } = await supabase
      .from('posts')
      .select(baseSelect)
      .eq('user_id', target.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/users/:username/posts error:', error);
      return res.status(500).json({ error: 'Failed to load posts' });
    }

    const shaped = (data || []).map(p => shapePostRow(p, currentUserId));
    return res.json(shaped);
  } catch (err) {
    console.error('GET /api/users/:username/posts error:', err);
    return res.status(500).json({ error: 'Failed to load posts' });
  }
});

// Get posts this user has liked (for your "Liked posts" tab)
app.get('/api/users/:username/likes', async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = getUserIdFromAuthHeader(req);

    const { data: target, error: targetErr } = await supabase
      .from('users')
      .select('id,username')
      .eq('username', username)
      .single();

    if (targetErr || !target) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 1) get post_ids liked by target
    const { data: likeRows, error: likesErr } = await supabase
      .from('post_likes')
      .select('post_id, created_at')
      .eq('user_id', target.id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (likesErr) {
      console.error('liked posts lookup error:', likesErr);
      return res.status(500).json({ error: 'Failed to load liked posts' });
    }

    const postIds = (likeRows || []).map(r => r.post_id).filter(Boolean);
    if (!postIds.length) return res.json([]);

    const baseSelect = `
      id,
      user_id,
      content,
      media_url,
      media_type,
      created_at,
      user:users (
        id,
        username,
        display_name,
        avatar_url
      ),
      post_likes ( user_id ),
      post_comments ( id, user_id ),
      post_saves ( user_id )
    `;

    // 2) fetch those posts
    const { data: posts, error: postsErr } = await supabase
      .from('posts')
      .select(baseSelect)
      .in('id', postIds)
      .order('created_at', { ascending: false });

    if (postsErr) {
      console.error('liked posts fetch error:', postsErr);
      return res.status(500).json({ error: 'Failed to load liked posts' });
    }

    const shaped = (posts || []).map(p => shapePostRow(p, currentUserId));
    return res.json(shaped);
  } catch (err) {
    console.error('GET /api/users/:username/likes error:', err);
    return res.status(500).json({ error: 'Failed to load liked posts' });
  }
});

// Follow / unfollow toggle (THIS fixes your Cannot POST error once frontend points to Railway)
app.post('/api/users/:username/follow', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const followerId = req.user.id;

    const { data: target, error: targetErr } = await supabase
      .from('users')
      .select('id,username')
      .eq('username', username)
      .single();

    if (targetErr || !target) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (target.id === followerId) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    const { data: existing, error: checkErr } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('followed_id', target.id)
      .maybeSingle();

    if (checkErr) {
      console.error('follow check error:', checkErr);
      return res.status(500).json({ error: 'Failed to update follow status' });
    }

    let following = false;

    if (existing) {
      const { error: delErr } = await supabase
        .from('follows')
        .delete()
        .eq('id', existing.id);

      if (delErr) {
        console.error('unfollow error:', delErr);
        return res.status(500).json({ error: 'Failed to unfollow user' });
      }

      following = false;
    } else {
      const { error: insErr } = await supabase
        .from('follows')
        .insert({
          id: uuidv4(),
          follower_id: followerId,
          followed_id: target.id,
          created_at: new Date().toISOString()
        });

      if (insErr) {
        console.error('follow insert error:', insErr);
        return res.status(500).json({ error: 'Failed to follow user' });
      }

      following = true;
    }

    const stats = await getUserStats(target.id);

    return res.json({
      following,
      followers_count: stats.followers_count || 0,
      following_count: stats.following_count || 0
    });
  } catch (err) {
    console.error('POST /api/users/:username/follow error:', err);
    return res.status(500).json({ error: 'Failed to update follow status' });
  }
});

// ======================================================
//                          SEARCH
// ======================================================

// Search users + posts + hashtags
app.get('/api/search', async (req, res) => {
  try {
    // ✅ Accept multiple parameter names for compatibility
    const rawQuery = req.query.q || req.query.query || req.query.term || req.query.search || '';
    const q = rawQuery.toString().trim();
    
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
          ),
          post_likes ( user_id ),
          post_comments ( id, user_id ),
          post_saves ( user_id )
        `
        )
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

    // Get current user for like/save status
    const currentUserId = getUserIdFromAuthHeader(req);
    
    // Format posts with like/save status
    const formattedPosts = (posts || []).map(p => shapePostRow(p, currentUserId));

    res.json({
      users: users || [],
      posts: formattedPosts || [],
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
    // ✅ Accept multiple parameter names
    const rawQuery = req.body?.query || req.body?.term || req.body?.q || req.body?.search || '';
    const query = rawQuery.toString().trim();
    
    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const item = {
      id: uuidv4(),
      user_id: req.user.id,
      query: query,
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

// Get current user's search history
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
//                    NOTIFICATIONS / ALERTS
// ======================================================

app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 100);

    // Fetch recent follows where current user is followed
    const { data: followers, error: followersErr } = await supabase
      .from('follows')
      .select(`
        id,
        created_at,
        follower:users!follows_follower_id_fkey (
          id, username, display_name, avatar_url
        )
      `)
      .eq('followed_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Fetch likes on current user's posts
    const { data: likes, error: likesErr } = await supabase
      .from('post_likes')
      .select(`
        id,
        created_at,
        post_id,
        user:users (
          id, username, display_name, avatar_url
        ),
        post:posts!inner (
          user_id, content
        )
      `)
      .eq('post.user_id', userId)
      .neq('user_id', userId) // Don't show self-likes
      .order('created_at', { ascending: false })
      .limit(limit);

    // Fetch comments on current user's posts
    const { data: comments, error: commentsErr } = await supabase
      .from('post_comments')
      .select(`
        id,
        created_at,
        post_id,
        content,
        user:users (
          id, username, display_name, avatar_url
        ),
        post:posts!inner (
          user_id, content
        )
      `)
      .eq('post.user_id', userId)
      .neq('user_id', userId) // Don't show self-comments
      .order('created_at', { ascending: false })
      .limit(limit);

    if (followersErr || likesErr || commentsErr) {
      console.error('notifications errors:', { followersErr, likesErr, commentsErr });
      return res.status(500).json({ error: 'Failed to load notifications' });
    }

    const feed = [];

    // Format follower notifications
    (followers || []).forEach(f => {
      feed.push({
        type: 'follow',
        id: f.id,
        created_at: f.created_at,
        actor: f.follower || null
      });
    });

    // Format like notifications
    (likes || []).forEach(l => {
      feed.push({
        type: 'like',
        id: l.id,
        created_at: l.created_at,
        actor: l.user || null,
        post_id: l.post_id,
        post_content: l.post?.content || ""
      });
    });

    // Format comment notifications
    (comments || []).forEach(c => {
      feed.push({
        type: 'comment',
        id: c.id,
        created_at: c.created_at,
        actor: c.user || null,
        post_id: c.post_id,
        post_content: c.post?.content || "",
        comment_text: c.content || ""
      });
    });

    // Sort by newest first
    feed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ notifications: feed.slice(0, limit) });
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// Alias for alerts (some frontends use /api/alerts)
app.get('/api/alerts', authMiddleware, (req, res) => {
  // Forward to notifications
  const originalUrl = req.originalUrl;
  const queryPart = originalUrl.includes('?') ? originalUrl.slice(originalUrl.indexOf('?')) : '';
  req.url = '/api/notifications' + queryPart;
  return app._router.handle(req, res);
});

// ======================================================
//                          ADMIN
// ======================================================

// Basic stats for admin dashboard
app.get('/api/admin/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const now = new Date().toISOString();

    const [
      { count: userCount },
      { count: postCount },
      { count: likeCount },
      { count: followCount },
      { count: hashtagCount },
      { count: searchCount },
      { count: commentCount },
      { count: savedCount }
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('post_likes').select('*', { count: 'exact', head: true }),
      supabase.from('follows').select('*', { count: 'exact', head: true }),
      supabase.from('hashtags').select('*', { count: 'exact', head: true }),
      supabase
        .from('search_history')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('post_comments')
        .select('*', { count: 'exact', head: true }),
      supabase.from('post_saves').select('*', { count: 'exact', head: true })
    ]);

    res.json({
      timestamp: now,
      
      // ✅ Original keys (keep for compatibility)
      users: userCount || 0,
      posts: postCount || 0,
      likes: likeCount || 0,
      follows: followCount || 0,
      hashtags: hashtagCount || 0,
      searches: searchCount || 0,
      comments: commentCount || 0,
      saved_posts: savedCount || 0,
      
      // ✅ New keys (what admin.js expects)
      total_users: userCount || 0,
      total_posts: postCount || 0,
      total_likes: likeCount || 0,
      total_follows: followCount || 0,
      total_hashtags: hashtagCount || 0,
      total_searches: searchCount || 0,
      total_comments: commentCount || 0,
      total_saved: savedCount || 0
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// List users (simple)
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

// List posts (simple)
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

// Hard delete a post (and related data)
app.delete(
  '/api/admin/posts/:id',
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const postId = req.params.id;

      await supabase.from('post_likes').delete().eq('post_id', postId);
      await supabase.from('post_comments').delete().eq('post_id', postId);
      await supabase.from('post_saves').delete().eq('post_id', postId);

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
  }
);

// Hard delete a user (and related data)
app.delete(
  '/api/admin/users/:id',
  authMiddleware,
  requireAdmin,
  async (req, res) => {
    try {
      const userId = req.params.id;

      await supabase.from('post_likes').delete().eq('user_id', userId);
      await supabase
        .from('follows')
        .delete()
        .or(`follower_id.eq.${userId},followed_id.eq.${userId}`);
      await supabase.from('search_history').delete().eq('user_id', userId);
      await supabase.from('post_comments').delete().eq('user_id', userId);
      await supabase.from('post_saves').delete().eq('user_id', userId);
      await supabase.from('posts').delete().eq('user_id', userId);

      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) {
        console.error('DELETE /admin/users/:id error:', error);
        return res.status(500).json({ error: 'Failed to delete user' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /admin/users/:id error:', err);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }
);

// ======================================================
//             POST MEDIA UPLOAD (IMAGES / VIDEOS)
// ======================================================

app.post('/api/posts/upload-media', authMiddleware, async (req, res) => {
  try {
    const { mediaData, mediaType } = req.body; // base64 string (no "data:" prefix), mediaType can be "image", "video", or a MIME type

    if (!mediaData || !mediaType) {
      return res
        .status(400)
        .json({ error: 'Missing media data or media type' });
    }

    // Convert base64 to Buffer
    const buffer = Buffer.from(mediaData, 'base64');

    // Optional size guard (roughly 25MB)
    const MAX_BYTES = 25 * 1024 * 1024;
    if (buffer.length > MAX_BYTES) {
      return res
        .status(413)
        .json({ error: 'Media file too large (limit ~25MB)' });
    }

    // Normalize type and extension
    let finalType = mediaType.toLowerCase();
    if (finalType === 'image') finalType = 'image/jpeg';
    if (finalType === 'video') finalType = 'video/mp4';

    let folder = 'images';
    if (finalType.startsWith('video/')) {
      folder = 'videos';
    }

    let ext = 'bin';
    if (finalType.includes('jpeg') || finalType.includes('jpg')) ext = 'jpg';
    else if (finalType.includes('png')) ext = 'png';
    else if (finalType.includes('webp')) ext = 'webp';
    else if (finalType.includes('mp4')) ext = 'mp4';
    else if (finalType.includes('quicktime') || finalType.includes('mov'))
      ext = 'mov';
    else if (finalType.includes('webm')) ext = 'webm';

    const fileName = `${folder}/${req.user.id}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .upload(fileName, buffer, {
        contentType: finalType,
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase post-media upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload media' });
    }

    const { data: publicData } = supabase.storage
      .from(POST_MEDIA_BUCKET)
      .getPublicUrl(fileName);

    const publicUrl = publicData && publicData.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ error: 'Could not get public media URL' });
    }

    return res.status(201).json({
      url: publicUrl,
      media_type: finalType
    });
  } catch (err) {
    console.error('POST /api/posts/upload-media error:', err);
    res.status(500).json({ error: 'Media upload failed' });
  }
});

// ======================================================
//                          PAYMENTS
//             Simple plans + payments + subscription
// ======================================================

// OPTION 1: USING DATABASE FOR PLANS - UPDATED VERSION

// Get available plans FROM DATABASE
app.get('/api/payments/plans', async (req, res) => {
  try {
    const { data: plans, error } = await supabase
      .from('plans')
      .select('*')
      .order('price_cents', { ascending: true });

    if (error) {
      console.error('Get plans error:', error);
      return res.status(500).json({ error: 'Failed to load plans' });
    }

    res.json({ plans: plans || [] });
  } catch (err) {
    console.error('GET /api/payments/plans error:', err);
    res.status(500).json({ error: 'Server error loading plans' });
  }
});

// Create an invoice for Monero payment
app.post('/api/payments/create', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { plan_slug, currency, amount_crypto, amount_usd } = req.body || {};

    if (!plan_slug) {
      return res.status(400).json({ error: 'Missing plan_slug' });
    }

    if (!currency) {
      return res.status(400).json({ error: 'Missing currency' });
    }

    // Only support XMR for now
    if (currency !== 'XMR') {
      return res.status(400).json({ error: 'Only XMR is supported at this time' });
    }

    // Look up plan from database
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('slug', plan_slug)
      .single();

    if (planError || !plan) {
      console.error('Plan lookup error:', planError);
      return res.status(400).json({ error: 'Unknown plan' });
    }

    // Calculate USD amount from plan price_cents
    const calculatedUsdAmount = plan.price_cents / 100;
    
    // Use provided amount_usd or calculate from plan
    const finalUsdAmount = amount_usd || calculatedUsdAmount;
    
    // Validate crypto amount is provided
    if (!amount_crypto || amount_crypto <= 0) {
      return res.status(400).json({ error: 'Invalid crypto amount' });
    }

    // Generate a unique payment address (in production, use Monero wallet RPC)
    // For now, use a placeholder that includes user ID and timestamp
    const paymentId = uuidv4().replace(/-/g, '').substring(0, 16);
    const placeholderAddress = `4${paymentId}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.substring(0, 95);

    // Create the invoice in the invoices table
    const invoice = {
      id: uuidv4(),
      user_id: userId,
      plan: plan_slug,
      currency: currency,
      amount_usd: finalUsdAmount,
      amount_crypto: amount_crypto,
      address: placeholderAddress,
      subaddr_index: Math.floor(Math.random() * 1000000), // Random index for demo
      qr_string: `monero:${placeholderAddress}?tx_amount=${amount_crypto}`,
      status: 'pending',
      confirmations: 0,
      required_confirmations: 10,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('invoices')
      .insert(invoice)
      .select('*')
      .single();

    if (error) {
      console.error('Supabase create invoice error:', error);
      return res.status(500).json({ error: 'Failed to create invoice.' });
    }

    // Return the invoice in the format your frontend expects
    res.json({
      id: data.id,
      plan: data.plan,
      currency: data.currency,
      amount_usd: data.amount_usd,
      amount_crypto: data.amount_crypto,
      address: data.address,
      qr_string: data.qr_string,
      status: data.status,
      confirmations: data.confirmations,
      required_confirmations: data.required_confirmations,
      created_at: data.created_at
    });

  } catch (err) {
    console.error('POST /api/payments/create error:', err);
    res.status(500).json({ error: 'Server error creating invoice.' });
  }
});

// Get payment/invoice status
app.get('/api/payments/status/:invoiceId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { invoiceId } = req.params;

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      console.error('Get invoice status error:', error);
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({
      id: data.id,
      status: data.status,
      confirmations: data.confirmations,
      required_confirmations: data.required_confirmations,
      address: data.address,
      amount_crypto: data.amount_crypto,
      amount_usd: data.amount_usd,
      currency: data.currency,
      created_at: data.created_at,
      paid_at: data.paid_at,
      confirmed_at: data.confirmed_at
    });
  } catch (err) {
    console.error('GET /api/payments/status/:invoiceId error:', err);
    res.status(500).json({ error: 'Server error fetching invoice status.' });
  }
});

// Get a single payment (for this user) - legacy endpoint, kept for compatibility
app.get('/api/payments/:paymentId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { paymentId } = req.params;

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', paymentId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      console.error('Supabase get payment error:', error);
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ payment: data });
  } catch (err) {
    console.error('GET /api/payments/:paymentId error:', err);
    res.status(500).json({ error: 'Server error fetching payment.' });
  }
});

// Manually mark a payment as completed (for now)
// Later this can be done by a webhook or watcher.
app.post(
  '/api/payments/:paymentId/mark-completed',
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { paymentId } = req.params;

      // 1) Load payment/invoice
      const { data: payment, error: fetchErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', paymentId)
        .eq('user_id', userId)
        .single();

      if (fetchErr || !payment) {
        console.error('Supabase fetch payment error:', fetchErr);
        return res.status(404).json({ error: 'Payment not found' });
      }

      // 2) Update payment -> completed
      const { data: updatedPayment, error: updateErr } = await supabase
        .from('invoices')
        .update({
          status: 'completed',
          confirmed_at: new Date().toISOString()
        })
        .eq('id', paymentId)
        .select('*')
        .single();

      if (updateErr) {
        console.error('Supabase update payment error:', updateErr);
        return res.status(500).json({ error: 'Failed to update payment.' });
      }

      // 3) Grant subscription on users table (e.g. 30 days)
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { error: userUpdateErr } = await supabase
        .from('users')
        .update({
          plan_slug: payment.plan,
          subscription_expires_at: thirtyDaysFromNow.toISOString(),
          is_verified: true
        })
        .eq('id', userId);

      if (userUpdateErr) {
        console.error('Supabase update user plan error:', userUpdateErr);
        // still return success for payment
      }

      res.json({
        payment: updatedPayment,
        message: 'Payment marked completed and plan activated.'
      });
    } catch (err) {
      console.error(
        'POST /api/payments/:paymentId/mark-completed error:',
        err
      );
      res.status(500).json({ error: 'Server error completing payment.' });
    }
  }
);

// Get my current subscription info from users table
app.get(
  '/api/payments/me/subscription',
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const { data: user, error } = await supabase
        .from('users')
        .select('plan_slug, subscription_expires_at, is_verified')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Supabase fetch subscription error:', error);
        return res
          .status(500)
          .json({ error: 'Failed to fetch subscription.' });
    }

      res.json({ subscription: user });
    } catch (err) {
      console.error(
        'GET /api/payments/me/subscription error:',
        err
      );
      res.status(500).json({ error: 'Server error fetching subscription.' });
    }
  }
);

// Get subscription status (for frontend compatibility)
app.get('/api/subscription/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: user, error } = await supabase
      .from('users')
      .select('plan_slug, subscription_expires_at, is_verified')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Get subscription error:', error);
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const active = user.is_verified && user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date();
    
    res.json({
      active: active,
      subscription: {
        plan: user.plan_slug,
        expires_at: user.subscription_expires_at,
        is_verified: user.is_verified
      }
    });
  } catch (err) {
    console.error('GET /api/subscription/me error:', err);
    res.status(500).json({ error: 'Server error fetching subscription.' });
  }
});

// ======================================================
//                    WAITLIST / LEADS
// ======================================================

const leadsRoute = require('./routes/leads');
app.use('/api/leads', leadsRoute);

// ======================================================
//                      START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(`🚀 Backend API listening on port ${PORT}`);
});
