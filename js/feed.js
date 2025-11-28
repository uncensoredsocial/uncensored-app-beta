// js/feed.js

// Base URL of your backend API
const API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/api';

class FeedManager {
    constructor() {
        this.posts = [];
        this.isLoading = false;
        this.currentFeed = 'for-you';
    }

    // Initialize feed on page load
    async initialize() {
        this.setupEventListeners();
        this.updateUI();
        this.updateCharCounter();  // make sure 0/280 shows correctly
        this.updatePostButton();

        await this.loadInitialPosts();
    }

    // --------- DATA LOADING ----------

    async loadInitialPosts() {
        if (this.isLoading) return;
        const feedContainer = document.getElementById('feedContainer');
        if (!feedContainer) return;

        this.isLoading = true;
        this.showLoading();

        try {
            const response = await fetch(`${API_BASE_URL}/posts`, {
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`Failed to load posts (status ${response.status})`);
            }

            const posts = await response.json();
            this.posts = Array.isArray(posts) ? posts : [];

            if (this.posts.length === 0) {
                this.showEmptyState();
            } else {
                this.renderPosts(this.posts);
            }
        } catch (error) {
            console.error('Error loading posts:', error);
            this.showError('Failed to load posts. Please try again.');
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    // Create new post (only when logged in)
    async createPost(content) {
        const currentUser = getCurrentUser?.();
        if (!currentUser) {
            this.showError('Please log in to create posts.');
            return null;
        }

        if (!content || !content.trim()) {
            this.showError('Post content cannot be empty.');
            return null;
        }

        if (content.length > 280) {
            this.showError('Post must be 280 characters or less.');
            return null;
        }

        try {
            this.setPostButtonLoading(true);

            const response = await fetch(`${API_BASE_URL}/posts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken?.() || ''}`
                },
                body: JSON.stringify({ content: content.trim() })
            });

            if (!response.ok) {
                let msg = 'Failed to create post';
                try {
                    const errData = await response.json();
                    if (errData?.error) msg = errData.error;
                } catch (_) {}
                throw new Error(msg);
            }

            const newPost = await response.json();

            // Keep local state in sync
            this.posts.unshift(newPost);
            this.prependPost(newPost);

            // Reset input
            const postInput = document.getElementById('postInput');
            if (postInput) {
                postInput.value = '';
            }
            this.updateCharCounter();
            this.updatePostButton();

            this.showSuccess('Post created!');
            return newPost;
        } catch (error) {
            console.error('Error creating post:', error);
            this.showError(error.message || 'Failed to create post.');
            return null;
        } finally {
            this.setPostButtonLoading(false);
        }
    }

    // --------- RENDERING ----------

    prependPost(post) {
        const feedContainer = document.getElementById('feedContainer');
        if (!feedContainer) return;

        // Remove empty state if present
        const emptyState = feedContainer.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        const postElement = this.createPostElement(post);
        feedContainer.insertBefore(postElement, feedContainer.firstChild);
    }

    renderPosts(posts) {
        const feedContainer = document.getElementById('feedContainer');
        if (!feedContainer) return;

        this.hideLoading();
        feedContainer.innerHTML = '';

        if (!posts || posts.length === 0) {
            this.showEmptyState();
            return;
        }

        posts.forEach(post => {
            const el = this.createPostElement(post);
            feedContainer.appendChild(el);
        });
    }

    createPostElement(post) {
        const postDiv = document.createElement('article');
        postDiv.className = 'post';
        postDiv.dataset.postId = post.id;
        postDiv.setAttribute('tabindex', '0');
        postDiv.setAttribute('aria-label', 'Post');

        const user = post.user || {};
        const displayName = user.display_name || 'Unknown user';
        const username = user.username || 'unknown';
        const avatar = user.avatar_url || 'assets/icons/default-profile.png';

        const createdAt = post.created_at || post.createdAt;
        const timestamp = this.formatTimestamp(createdAt);

        const likeCount = Array.isArray(post.likes) ? post.likes.length : (post.like_count || 0);
        const commentCount = Array.isArray(post.comments) ? post.comments.length : (post.comment_count || 0);
        const repostCount = Array.isArray(post.reposts) ? post.reposts.length : (post.repost_count || 0);

        const currentUser = getCurrentUser?.();
        const isLiked =
            !!currentUser &&
            (Array.isArray(post.likes) ? post.likes.includes(currentUser.id) : !!post.is_liked);

        postDiv.innerHTML = `
            <header class="post-header">
                <img src="${avatar}"
                     alt="${this.escapeHtml(displayName)}'s avatar"
                     class="post-user-avatar"
                     onerror="this.src='assets/icons/default-profile.png'">
                <div class="post-user-info">
                    <div class="post-display-name">${this.escapeHtml(displayName)}</div>
                    <div class="post-username">@${this.escapeHtml(username)}</div>
                </div>
                <time class="post-time" datetime="${createdAt || ''}">
                    ${timestamp}
                </time>
            </header>

            <div class="post-content">
                <p>${this.formatPostContent(post.content || '')}</p>
            </div>

            <footer class="post-footer">
                <div class="post-actions" aria-label="Post actions">
                    <button class="post-action like-btn ${isLiked ? 'liked' : ''}"
                            type="button"
                            aria-pressed="${isLiked}"
                            aria-label="Like post"
                            ${!isLoggedIn?.() ? 'disabled' : ''}>
                        <span class="post-action-icon" aria-hidden="true">
                            ${isLiked ? '❤️' : '🤍'}
                        </span>
                        <span class="post-action-label like-count">${likeCount}</span>
                    </button>

                    <button class="post-action comment-btn"
                            type="button"
                            aria-label="Comment on post"
                            ${!isLoggedIn?.() ? 'disabled' : ''}>
                        <span class="post-action-icon" aria-hidden="true">💬</span>
                        <span class="post-action-label comment-count">${commentCount}</span>
                    </button>

                    <button class="post-action repost-btn"
                            type="button"
                            aria-label="Repost"
                            ${!isLoggedIn?.() ? 'disabled' : ''}>
                        <span class="post-action-icon" aria-hidden="true">🔄</span>
                        <span class="post-action-label repost-count">${repostCount}</span>
                    </button>

                    <button class="post-action save-btn"
                            type="button"
                            aria-label="Save post"
                            ${!isLoggedIn?.() ? 'disabled' : ''}>
                        <span class="post-action-icon" aria-hidden="true">🔖</span>
                    </button>
                </div>
            </footer>
        `;

        // Wire up like / comment / repost / save handlers
        const likeBtn = postDiv.querySelector('.like-btn');
        if (likeBtn) {
            likeBtn.addEventListener('click', () => this.handleLike(post.id, likeBtn));
        }

        const commentBtn = postDiv.querySelector('.comment-btn');
        if (commentBtn) {
            commentBtn.addEventListener('click', () => this.handleComment(post.id));
        }

        const repostBtn = postDiv.querySelector('.repost-btn');
        if (repostBtn) {
            repostBtn.addEventListener('click', () => this.handleRepost(post.id));
        }

        const saveBtn = postDiv.querySelector('.save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.handleSave(post.id));
        }

        return postDiv;
    }

    formatPostContent(content) {
        if (!content) return '';

        let formatted = this.escapeHtml(content);

        // URLs
        formatted = formatted.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        // Hashtags
        formatted = formatted.replace(
            /#(\w+)/g,
            '<span class="hashtag">#$1</span>'
        );

        // Mentions
        formatted = formatted.replace(
            /@(\w+)/g,
            '<span class="mention">@$1</span>'
        );

        return formatted;
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'just now';
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return 'just now';

        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}d`;

        return date.toLocaleDateString();
    }

    // --------- INTERACTIONS ----------

    async handleLike(postId, buttonEl) {
        const currentUser = getCurrentUser?.();
        if (!currentUser) {
            this.showError('Please log in to like posts.');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken?.() || ''}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to like post.');
            }

            const result = await response.json();
            const liked = !!result.liked;
            const likes = result.likes ?? 0;

            const likeCountSpan = buttonEl.querySelector('.like-count');
            if (likeCountSpan) likeCountSpan.textContent = likes;

            buttonEl.classList.toggle('liked', liked);
            buttonEl.setAttribute('aria-pressed', liked.toString());

            const icon = buttonEl.querySelector('.post-action-icon');
            if (icon) icon.textContent = liked ? '❤️' : '🤍';
        } catch (error) {
            console.error('Error handling like:', error);
            this.showError('Failed to like post.');
        }
    }

    handleComment(postId) {
        if (!isLoggedIn?.()) {
            this.showError('Please log in to comment.');
            return;
        }
        this.showMessage('Comments coming soon.');
    }

    handleRepost(postId) {
        if (!isLoggedIn?.()) {
            this.showError('Please log in to repost.');
            return;
        }
        this.showMessage('Reposts coming soon.');
    }

    handleSave(postId) {
        if (!isLoggedIn?.()) {
            this.showError('Please log in to save posts.');
            return;
        }
        this.showMessage('Save feature coming soon.');
    }

    // --------- INPUT / UI ----------

    setupEventListeners() {
        const postInput = document.getElementById('postInput');
        const postButton = document.getElementById('postButton');

        if (postInput) {
            postInput.addEventListener('input', () => {
                this.updateCharCounter();
                this.updatePostButton();
            });

            postInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this.handlePostCreation();
                }
            });
        }

        if (postButton) {
            postButton.addEventListener('click', () => this.handlePostCreation());
        }

        this.setupPullToRefresh();
    }

    updateCharCounter() {
        const postInput = document.getElementById('postInput');
        const charCounter = document.getElementById('charCounter');
        if (!postInput || !charCounter) return;

        const length = postInput.value.length;
        charCounter.textContent = `${length}/280`;

        charCounter.classList.remove('warning', 'error');
        if (length > 280) {
            charCounter.classList.add('error');
        } else if (length > 250) {
            charCounter.classList.add('warning');
        }
    }

    updatePostButton() {
        const postInput = document.getElementById('postInput');
        const postButton = document.getElementById('postButton');
        if (!postInput || !postButton) return;

        const length = postInput.value.trim().length;
        const overLimit = postInput.value.length > 280;
        const loggedIn = !!isLoggedIn?.();

        postButton.disabled = !loggedIn || length === 0 || overLimit;
    }

    async handlePostCreation() {
        const postInput = document.getElementById('postInput');
        if (!postInput) return;

        const content = postInput.value.trim();
        if (!content) return;

        await this.createPost(content);
    }

    setPostButtonLoading(isLoading) {
        const postButton = document.getElementById('postButton');
        if (!postButton) return;

        if (isLoading) {
            postButton.disabled = true;
            postButton.innerHTML = '<span class="loading-spinner small"></span><span class="loading-label">Posting…</span>';
        } else {
            this.updatePostButton();
            postButton.textContent = 'Post';
        }
    }

    setupPullToRefresh() {
        let touchStartY = 0;

        document.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                touchStartY = e.touches[0].clientY;
            }
        });

        document.addEventListener('touchmove', (e) => {
            if (window.scrollY === 0 && e.touches[0].clientY - touchStartY > 120) {
                this.loadInitialPosts();
            }
        });
    }

    // --------- UI HELPERS ----------

    showLoading() {
        const feedContainer = document.getElementById('feedContainer');
        if (!feedContainer) return;

        feedContainer.innerHTML = `
            <div class="loading-indicator" id="feedLoading" aria-live="polite">
                <span class="loading-spinner"></span>
                <span class="loading-text">Loading posts…</span>
            </div>
        `;
    }

    hideLoading() {
        const loading = document.getElementById('feedLoading');
        if (loading && loading.parentNode) {
            loading.parentNode.removeChild(loading);
        }
    }

    showEmptyState() {
        const feedContainer = document.getElementById('feedContainer');
        if (!feedContainer) return;

        const loggedIn = !!isLoggedIn?.();

        feedContainer.innerHTML = `
            <div class="empty-state">
                <h3>No posts yet</h3>
                <p>${loggedIn ? 'Be the first to post something.' : 'Log in to create the first post.'}</p>
                ${
                    loggedIn
                        ? `<button class="btn btn-primary" type="button" onclick="document.getElementById('postInput').focus()">Create First Post</button>`
                        : `<button class="btn btn-primary" type="button" onclick="window.location.href='login.html'">Log In</button>`
                }
            </div>
        `;
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type = 'info') {
        // Remove any existing message
        const existing = document.querySelector('.status-message');
        if (existing) existing.remove();

        const msg = document.createElement('div');
        msg.className = `status-message status-${type}`;
        msg.setAttribute('role', 'status');
        msg.setAttribute('aria-live', 'polite');
        msg.textContent = message;

        document.body.appendChild(msg);

        setTimeout(() => {
            if (msg.parentNode) msg.parentNode.removeChild(msg);
        }, 3000);
    }

    escapeHtml(unsafe = '') {
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    updateUI() {
        const currentUser = getCurrentUser?.();
        const postCreation = document.getElementById('postCreation');
        const guestMessage = document.getElementById('guestMessage');
        const headerProfileImg = document.getElementById('headerProfileImg');
        const postUserAvatar = document.getElementById('postUserAvatar');
        const authButtons = document.getElementById('authButtons');
        const profileSection = document.getElementById('profileSection');

        const loggedIn = !!currentUser;

        if (postCreation) {
            postCreation.style.display = loggedIn ? 'block' : 'none';
        }
        if (guestMessage) {
            guestMessage.style.display = loggedIn ? 'none' : 'block';
        }

        if (authButtons) {
            authButtons.style.display = loggedIn ? 'none' : 'flex';
        }
        if (profileSection) {
            profileSection.style.display = loggedIn ? 'flex' : 'none';
        }

        if (headerProfileImg && currentUser?.avatar_url) {
            headerProfileImg.src = currentUser.avatar_url;
        }
        if (postUserAvatar && currentUser?.avatar_url) {
            postUserAvatar.src = currentUser.avatar_url;
        }

        this.updatePostButton();
    }
}

// Global instance
const feedManager = new FeedManager();

// Refresh helper
function refreshFeed() {
    feedManager.loadInitialPosts();
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('feedContainer')) {
        feedManager.initialize();
    }
});
