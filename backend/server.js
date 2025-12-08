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

// ======================================================
//                     SUPABASE SETUP
// ======================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

// Add JWT_SECRET check
if (!process.env.JWT_SECRET) {
  console.error('❌ Missing JWT_SECRET in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Buckets
const USER_MEDIA_BUCKET = 'user-media';
const POST_MEDIA_BUCKET = 'post-media';

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
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
);

// allow larger JSON bodies for base64 images + videos
app.use(express.json({ limit: '75mb' }));

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
//            POST IMAGE / VIDEO MEDIA UPLOAD
// ======================================================

app.post('/api/posts/upload-media', authMiddleware, async (req, res) => {
  try {
    const { mediaData, mimeType } = req.body;

    console.log('Media upload request:', { mimeType, dataLength: mediaData?.length });

    if (!mediaData || typeof mediaData !== 'string') {
      return res.status(400).json({ error: 'Missing media data' });
    }

    if (!mimeType || typeof mimeType !== 'string') {
      return res.status(400).json({ error: 'Missing mimeType' });
    }

    // Clean the base64 string (remove data:image/jpeg;base64, prefix if present)
    let cleanBase64 = mediaData;
    if (mediaData.includes('base64,')) {
      cleanBase64 = mediaData.split('base64,')[1];
    }

    const buffer = Buffer.from(cleanBase64, 'base64');
    
    console.log('Buffer created, size:', buffer.length);

    const isImage = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');

    if (!isImage && !isVideo) {
      return res.status(400).json({ error: 'Only image/* or video/* media are allowed' });
    }

    // Derive file extension
    let ext = 'bin';
    const parts = mimeType.split('/');
    if (parts.length === 2) {
      ext = parts[1].toLowerCase().split(';')[0];
      if (ext === 'jpeg') ext = 'jpg';
      if (ext === 'quicktime') ext = 'mov';
    }

    const folder = isVideo ? 'videos' : 'images';
    const fileName = `${folder}/${req.user.id}-${Date.now()}.${ext}`;

    console.log('Uploading to:', fileName);

    const { error: uploadError } = await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload media: ' + uploadError.message });
    }

    const { data: publicData } = supabase.storage
      .from(POST_MEDIA_BUCKET)
      .getPublicUrl(fileName);

    const publicUrl = publicData && publicData.publicUrl;
    if (!publicUrl) {
      return res.status(500).json({ error: 'Could not get public URL' });
    }

    console.log('Upload successful, URL:', publicUrl);

    const media_type = isVideo ? 'video' : 'image';

    res.status(201).json({
      url: publicUrl,
      media_type
    });
  } catch (err) {
    console.error('POST /posts/upload-media error:', err);
    res.status(500).json({ error: 'Media upload failed: ' + err.message });
  }
});

// ======================================================
//                          POSTS
// ======================================================

// Global feed – FIXED VERSION
app.get('/api/posts', async (req, res) => {
  try {
    const sort = (req.query.sort || 'recent').toLowerCase();
    const orderOptions = { column: 'created_at', ascending: false };

    const currentUserId = getUserIdFromAuthHeader(req);

    // FIXED: Use proper Supabase join syntax with users table
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select(`
        id, 
        user_id, 
        content, 
        media_url, 
        media_type, 
        created_at,
        users!inner (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (postsError) {
      console.error('Get posts error:', postsError);
      return res.status(500).json({ error: 'Failed to load posts: ' + postsError.message });
    }

    if (!posts || posts.length === 0) {
      return res.json([]);
    }

    const postIds = posts.map((p) => p.id);

    // Get counts using separate queries (more reliable)
    const [
      { data: likesRows, error: likesError },
      { data: commentsRows, error: commentsError },
      { data: savesRows, error: savesError }
    ] = await Promise.all([
      supabase
        .from('post_likes')
        .select('post_id, user_id')
        .in('post_id', postIds),
      supabase
        .from('post_comments')
        .select('id, post_id')
        .in('post_id', postIds),
      supabase
        .from('post_saves')
        .select('post_id, user_id')
        .in('post_id', postIds)
    ]);

    // DEBUG: Log what we're getting
    console.log('Posts loaded:', posts.length);
    console.log('Likes rows:', likesRows?.length || 0);
    console.log('Comments rows:', commentsRows?.length || 0);
    console.log('Saves rows:', savesRows?.length || 0);

    // Create maps
    const likesByPost = new Map();
    (likesRows || []).forEach((row) => {
      if (!likesByPost.has(row.post_id)) likesByPost.set(row.post_id, []);
      likesByPost.get(row.post_id).push(row.user_id);
    });

    const commentsByPost = new Map();
    (commentsRows || []).forEach((row) => {
      const arr = commentsByPost.get(row.post_id) || [];
      arr.push(row.id);
      commentsByPost.set(row.post_id, arr);
    });

    const savesByPost = new Map();
    (savesRows || []).forEach((row) => {
      if (!savesByPost.has(row.post_id)) savesByPost.set(row.post_id, []);
      savesByPost.get(row.post_id).push(row.user_id);
    });

    // Shape the response
    const shaped = posts.map((p) => {
      const likesArr = likesByPost.get(p.id) || [];
      const commentsArr = commentsByPost.get(p.id) || [];
      const savesArr = savesByPost.get(p.id) || [];

      const likedByMe = currentUserId ? likesArr.includes(currentUserId) : false;
      const savedByMe = currentUserId ? savesArr.includes(currentUserId) : false;

      return {
        id: p.id,
        content: p.content,
        media_url: p.media_url || null,
        media_type: p.media_type || null,
        created_at: p.created_at,
        user: p.users || null,
        likes: likesArr.length,
        comments_count: commentsArr.length,
        saves_count: savesArr.length,
        liked_by_me: likedByMe,
        saved_by_me: savedByMe
      };
    });

    console.log('Sending shaped posts:', shaped.length);
    res.json(shaped);
  } catch (err) {
    console.error('GET /api/posts error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to load posts: ' + err.message });
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

// ======================================================
//                   PROFILE / FOLLOWS
// ======================================================

// Get user by username
app.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const currentUserId = getUserIdFromAuthHeader(req);

    const { data: user, error } = await supabase
      .from('users')
      .select(
        'id,username,display_name,avatar_url,banner_url,bio,created_at'
      )
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = await getUserStats(user.id);

    let isFollowing = false;
    if (currentUserId && currentUserId !== user.id) {
      const { data: followRow, error: followError } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('followed_id', user.id)
        .maybeSingle();

      if (followError) {
        console.error('is_following check error:', followError);
      }
      isFollowing = !!followRow;
    }

    res.json({ ...user, ...stats, is_following: isFollowing });
  } catch (err) {
    console.error('GET /users/:username error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Get posts for a given username – same shape as feed
app.get('/api/users/:username/posts', async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = getUserIdFromAuthHeader(req);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id,username,display_name,avatar_url')
      .eq('username', username)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { data: posts, error } = await supabase
      .from('posts')
      .select(
        `
        id,
        content,
        media_url,
        media_type,
        created_at,
        post_likes ( user_id ),
        post_comments ( id ),
        post_saves ( user_id )
      `
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get profile posts error:', error);
      return res.status(500).json({ error: 'Failed to load posts' });
    }

    const shaped = (posts || []).map((p) => {
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
        user: {
          id: user.id,
          username: username,
          display_name: user.display_name,
          avatar_url: user.avatar_url
        },
        likes: likesArr.length,
        comments_count: commentsArr.length,
        saves_count: savesArr.length,
        liked_by_me: likedByMe,
        saved_by_me: savedByMe
      };
    });

    res.json(shaped);
  } catch (err) {
    console.error('GET /users/:username/posts error:', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// Get posts that a given user has liked – same shape as feed
app.get('/api/users/:username/likes', async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = getUserIdFromAuthHeader(req);

    // 1) Find the user whose likes we are showing
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id,username,display_name,avatar_url')
      .eq('username', username)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2) Get all post_ids that this user has liked
    const { data: likedRows, error: likesError } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', user.id);

    if (likesError) {
      console.error('Get liked posts error (likes table):', likesError);
      return res.status(500).json({ error: 'Failed to load liked posts' });
    }

    if (!likedRows || likedRows.length === 0) {
      return res.json([]);
    }

    const postIds = likedRows.map((row) => row.post_id);

    // 3) Fetch those posts with the same shape as the main feed
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select(
        `
        id,
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
        post_comments ( id ),
        post_saves ( user_id )
      `
      )
      .in('id', postIds)
      .order('created_at', { ascending: false });

    if (postsError) {
      console.error('Get liked posts error (posts table):', postsError);
      return res.status(500).json({ error: 'Failed to load liked posts' });
    }

    const shaped = (posts || []).map((p) => {
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
        user: p.user, // author of the post
        likes: likesArr.length,
        comments_count: commentsArr.length,
        saves_count: savesArr.length,
        liked_by_me: likedByMe,
        saved_by_me: savedByMe
      };
    });

    res.json(shaped);
  } catch (err) {
    console.error('GET /users/:username/likes error:', err);
    res.status(500).json({ error: 'Failed to load liked posts' });
  }
});

// Follow / unfollow user
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
//                          SEARCH
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
      supabase
        .from('hashtags')
        .select('id,tag')
        .ilike('tag', pattern)
        .limit(10)
    ]);

    if (usersError || postsError || tagsError) {
      console.error('Search errors:', {
        usersError,
        postsError,
        tagsError
      });
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
      users: userCount || 0,
      posts: postCount || 0,
      likes: likeCount || 0,
      follows: followCount || 0,
      hashtags: hashtagCount || 0,
      searches: searchCount || 0,
      comments: commentCount || 0,
      saved_posts: savedCount || 0
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
//                      START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(`🚀 Backend API listening on port ${PORT}`);
});
