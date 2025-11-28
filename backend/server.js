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

// --- Supabase Client ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Service key, NOT anon key
);

// --- Middleware ---
app.use(cors({
    origin: ['https://spepdb.github.io', 'http://localhost:8000'],
    credentials: true
}));
app.use(express.json());

// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Token required" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: "Invalid token" });
    }
};

// --- Health Check ---
app.get("/api/health", async (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
});


// ============================================================
// 🔐 AUTH ROUTES
// ============================================================

// --- Signup ---
app.post("/api/auth/signup", async (req, res) => {
    const { email, password, username, displayName } = req.body;

    if (!email || !password || !username)
        return res.status(400).json({ error: "Email, password and username required" });

    if (password.length < 6)
        return res.status(400).json({ error: "Password must be 6+ characters" });

    // Check if user exists
    const { data: existingUser } = await supabase
        .from("users")
        .select("*")
        .or(`email.eq.${email},username.eq.${username}`)
        .maybeSingle();

    if (existingUser)
        return res.status(400).json({ error: "Email or username already exists" });

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert new user
    const { data, error } = await supabase
        .from("users")
        .insert([{
            id: uuidv4(),
            email,
            username,
            display_name: displayName || username,
            password_hash: passwordHash,
        }])
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    const token = jwt.sign({ userId: data.id }, JWT_SECRET, { expiresIn: "24h" });

    res.status(201).json({ user: data, token });
});


// --- Login ---
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;

    const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

    if (!user) return res.status(401).json({ error: "Invalid login" });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: "Invalid login" });

    const token = jwt.sign(
        { userId: user.id },
        JWT_SECRET,
        { expiresIn: "24h" }
    );

    res.json({ user, token });
});


// --- Get Logged-in User ---
app.get("/api/auth/me", authenticateToken, async (req, res) => {
    const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("id", req.user.userId)
        .single();

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
});


// ============================================================
// 📝 POSTS
// ============================================================

// --- Get All Posts ---
app.get("/api/posts", async (req, res) => {
    const { data: posts, error } = await supabase
        .from("posts")
        .select(`
            id,
            content,
            created_at,
            user_id,
            users (
                username,
                display_name,
                avatar_url
            ),
            likes(count),
            comments(count)
        `)
        .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    res.json(posts);
});


// --- Create Post ---
app.post("/api/posts", authenticateToken, async (req, res) => {
    const { content } = req.body;

    if (!content || content.trim().length === 0)
        return res.status(400).json({ error: "Content required" });

    if (content.length > 280)
        return res.status(400).json({ error: "Max 280 chars" });

    const { data, error } = await supabase
        .from("posts")
        .insert([{
            id: uuidv4(),
            user_id: req.user.userId,
            content: content.trim()
        }])
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json(data);
});


// ============================================================
// ❤️ LIKE / UNLIKE
// ============================================================

app.post("/api/posts/:id/like", authenticateToken, async (req, res) => {
    const postId = req.params.id;
    const userId = req.user.userId;

    // Check if already liked
    const { data: existing } = await supabase
        .from("likes")
        .select("*")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .maybeSingle();

    if (existing) {
        // unlike
        await supabase.from("likes").delete().eq("id", existing.id);
        return res.json({ liked: false });
    }

    // like
    const { error } = await supabase
        .from("likes")
        .insert([{ id: uuidv4(), post_id: postId, user_id: userId }]);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ liked: true });
});


// ============================================================
// 👤 USER PROFILE ENDPOINT
// ============================================================

// /api/users/:username
app.get("/api/users/:username", async (req, res) => {
    const username = req.params.username;

    const { data: user, error } = await supabase
        .from("users")
        .select("*, follower_count:follows(count), following_count:follows!follows_follower_id_fkey(count)")
        .eq("username", username)
        .single();

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
});


// ============================================================
// 🚀 Start Server
// ============================================================

app.listen(PORT, () => {
    console.log(`Supabase backend running on port ${PORT}`);
});
