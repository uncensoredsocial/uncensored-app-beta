const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors({
    origin: ['https://spepdb.github.io', 'http://localhost:8000'],
    credentials: true
}));
app.use(express.json());

// In-memory storage (will reset on server restart - add database later)
let users = [];
let posts = [];

// Helper to find user
const findUserById = (id) => users.find(u => u.id === id);
const findUserByEmail = (email) => users.find(u => u.email === email);
const findUserByUsername = (username) => users.find(u => u.username === username);

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        users: users.length,
        posts: posts.length
    });
});

// User Registration
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, username, displayName } = req.body;

        if (!email || !password || !username) {
            return res.status(400).json({ error: 'Email, password, and username are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if user already exists
        if (findUserByEmail(email) || findUserByUsername(username)) {
            return res.status(400).json({ error: 'User already exists with this email or username' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = {
            id: uuidv4(),
            email,
            username,
            displayName: displayName || username,
            password: hashedPassword,
            avatar_url: 'assets/icons/default-profile.png',
            created_at: new Date().toISOString(),
            followers: [],
            following: []
        };

        users.push(user);

        // Generate token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        res.status(201).json({
            user: userWithoutPassword,
            token
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user
        const user = findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            user: userWithoutPassword,
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
    const user = findUserById(req.user.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
});

// Posts - Get all posts (public - no auth required)
app.get('/api/posts', (req, res) => {
    try {
        // Add user data to posts
        const postsWithUsers = posts.map(post => {
            const user = findUserById(post.userId);
            return {
                ...post,
                user: user ? {
                    id: user.id,
                    username: user.username,
                    display_name: user.displayName,
                    avatar_url: user.avatar_url
                } : null
            };
        });

        // Sort by newest first
        const sortedPosts = postsWithUsers.sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );

        res.json(sortedPosts);

    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// Create post (requires auth)
app.post('/api/posts', authenticateToken, (req, res) => {
    try {
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Post content is required' });
        }

        if (content.length > 280) {
            return res.status(400).json({ error: 'Post must be 280 characters or less' });
        }

        const user = findUserById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const post = {
            id: uuidv4(),
            userId: user.id,
            content: content.trim(),
            created_at: new Date().toISOString(),
            likes: [],
            comments: [],
            reposts: []
        };

        posts.unshift(post);

        // Return post with user data
        const postWithUser = {
            ...post,
            user: {
                id: user.id,
                username: user.username,
                display_name: user.displayName,
                avatar_url: user.avatar_url
            }
        };

        res.status(201).json(postWithUser);

    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// Like a post
app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.userId;

        const post = posts.find(p => p.id === postId);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        const likeIndex = post.likes.indexOf(userId);
        if (likeIndex > -1) {
            // Unlike
            post.likes.splice(likeIndex, 1);
        } else {
            // Like
            post.likes.push(userId);
        }

        res.json({ 
            likes: post.likes.length, 
            liked: likeIndex === -1 
        });

    } catch (error) {
        console.error('Error liking post:', error);
        res.status(500).json({ error: 'Failed to like post' });
    }
});

// Add some demo posts if empty
if (posts.length === 0) {
    const demoUser = {
        id: 'demo-user-1',
        email: 'demo@uncensored.social',
        username: 'uncensored_demo',
        displayName: 'Uncensored Demo',
        password: '$2a$10$demo', // not usable
        avatar_url: 'assets/icons/default-profile.png',
        created_at: new Date().toISOString(),
        followers: [],
        following: []
    };
    users.push(demoUser);

    posts.push({
        id: 'demo-post-1',
        userId: demoUser.id,
        content: 'Welcome to Uncensored Social! This is a live demo post from the backend server.',
        created_at: new Date().toISOString(),
        likes: [],
        comments: [],
        reposts: []
    });
}

// Start server
app.listen(PORT, () => {
    console.log(`Uncensored Social Backend running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});
