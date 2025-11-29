// js/feed.js

const API_BASE_URL = "https://uncensored-app-beta-production.up.railway.app/api";

class FeedManager {
    constructor() {
        this.posts = [];
        this.isLoading = false;
    }

    async init() {
        this.cacheDom();
        this.bindEvents();
        this.updateAuthUI();
        await this.loadPosts();
    }

    cacheDom() {
        this.feedContainer = document.getElementById("feedContainer");
        this.postInput = document.getElementById("postInput");
        this.postButton = document.getElementById("postButton");
        this.charCounter = document.getElementById("charCounter");
        this.postCreation = document.getElementById("postCreation");
    }

    bindEvents() {
        if (this.postInput) {
            this.postInput.addEventListener("input", () => {
                this.updateCharCounter();
                this.updatePostButtonState();
            });

            this.postInput.addEventListener("keydown", (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    this.handleCreatePost();
                }
            });
        }

        if (this.postButton) {
            this.postButton.addEventListener("click", () => {
                this.handleCreatePost();
            });
        }

        // NEW: delegated click handlers for like/comment/share
        if (this.feedContainer) {
            this.feedContainer.addEventListener("click", (e) => {
                const likeBtn = e.target.closest(".like-btn");
                const commentBtn = e.target.closest(".comment-btn");
                const shareBtn = e.target.closest(".share-btn");

                if (likeBtn) {
                    const postEl = likeBtn.closest(".post");
                    const postId = postEl?.dataset.postId;
                    if (postId) this.toggleLike(postId, likeBtn);
                    return;
                }

                if (commentBtn) {
                    const postEl = commentBtn.closest(".post");
                    const postId = postEl?.dataset.postId;
                    if (postId) this.openPostComments(postId);
                    return;
                }

                if (shareBtn) {
                    const postEl = shareBtn.closest(".post");
                    const postId = postEl?.dataset.postId;
                    if (postId) this.sharePost(postId);
                    return;
                }
            });
        }
    }

    /* ----------------------- AUTH / UI ----------------------- */

    updateAuthUI() {
        const loggedIn = typeof isLoggedIn === "function" ? isLoggedIn() : false;

        // Show or hide post creation
        if (this.postCreation) {
            this.postCreation.style.display = loggedIn ? "block" : "none";
        }

        this.updatePostButtonState();
    }

    updateCharCounter() {
        if (!this.charCounter || !this.postInput) return;

        const length = this.postInput.value.length;
        this.charCounter.textContent = `${length}/280`;

        this.charCounter.classList.remove("warning", "error");
        if (length > 280) this.charCounter.classList.add("error");
        else if (length > 240) this.charCounter.classList.add("warning");
    }

    updatePostButtonState() {
        if (!this.postButton || !this.postInput) return;

        const text = this.postInput.value.trim();
        const loggedIn = typeof isLoggedIn === "function" ? isLoggedIn() : false;

        this.postButton.disabled =
            !loggedIn || text.length === 0 || text.length > 280;
    }

    setPostButtonLoading(loading) {
        if (!this.postButton) return;

        if (loading) {
            this.postButton.disabled = true;
            this.postButton.innerHTML = "Posting…";
        } else {
            this.updatePostButtonState();
            this.postButton.textContent = "Post";
        }
    }

    /* ----------------------- LOAD POSTS ----------------------- */

    async loadPosts() {
        if (!this.feedContainer || this.isLoading) return;

        this.isLoading = true;
        this.feedContainer.innerHTML = `
            <div class="loading-indicator">Loading posts...</div>
        `;

        try {
            const res = await fetch(`${API_BASE_URL}/posts`);
            if (!res.ok) throw new Error("Failed to load posts");

            this.posts = await res.json();

            if (!this.posts || this.posts.length === 0) {
                this.feedContainer.innerHTML = `
                    <div class="empty-state">
                        <h3>No posts yet</h3>
                        <p>Be the first to post something!</p>
                    </div>
                `;
                return;
            }

            this.renderPosts();
        } catch (err) {
            console.error(err);
            this.feedContainer.innerHTML = `
                <div class="empty-state">
                    <h3>Error loading posts</h3>
                    <p>Please try again later.</p>
                </div>
            `;
        } finally {
            this.isLoading = false;
        }
    }

    renderPosts() {
        this.feedContainer.innerHTML = "";
        this.posts.forEach((post) => {
            this.feedContainer.appendChild(this.createPostElement(post));
        });
    }

    /* ----------------------- CREATE POST ----------------------- */

    async handleCreatePost() {
        if (!this.postInput) return;

        const text = this.postInput.value.trim();
        if (!text || text.length > 280) return;

        const loggedIn = typeof isLoggedIn === "function" ? isLoggedIn() : false;
        if (!loggedIn) {
            window.location.href = "login.html";
            return;
        }

        this.setPostButtonLoading(true);

        try {
            const res = await fetch(`${API_BASE_URL}/posts`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({ content: text })
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                alert(error.error || "Error creating post");
                return;
            }

            const newPost = await res.json();

            // prepend new post
            this.posts.unshift(newPost);
            this.feedContainer.prepend(this.createPostElement(newPost));

            this.postInput.value = "";
            this.updateCharCounter();
            this.updatePostButtonState();
        } catch (err) {
            console.error(err);
            alert("Error creating post");
        } finally {
            this.setPostButtonLoading(false);
        }
    }

    /* ----------------------- LIKE / COMMENT / SHARE ----------------------- */

    async toggleLike(postId, buttonEl) {
        const loggedIn = typeof isLoggedIn === "function" ? isLoggedIn() : false;
        if (!loggedIn) {
            window.location.href = "login.html";
            return;
        }

        try {
            buttonEl.disabled = true;

            const res = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${getAuthToken()}`
                }
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error("Like error:", data);
                return;
            }

            // update UI
            const countSpan = buttonEl.querySelector(".post-action-count");
            if (countSpan) {
                countSpan.textContent = data.likes ?? 0;
            }
            buttonEl.classList.toggle("liked", !!data.liked);
        } catch (err) {
            console.error("toggleLike error:", err);
        } finally {
            buttonEl.disabled = false;
        }
    }

    openPostComments(postId) {
        // For now, send them to a post detail page (you can build post.html later)
        window.location.href = `post.html?id=${encodeURIComponent(postId)}`;
    }

    async sharePost(postId) {
        const url = `${window.location.origin}/post.html?id=${encodeURIComponent(
            postId
        )}`;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: "UncensoredSocial",
                    text: "Check out this post",
                    url
                });
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(url);
                alert("Link copied to clipboard");
            } else {
                alert(url);
            }
        } catch (err) {
            console.error("sharePost error:", err);
        }
    }

    /* ----------------------- POST ELEMENT ----------------------- */

    createPostElement(post) {
        const div = document.createElement("div");
        div.className = "post";
        div.dataset.postId = post.id;

        const user = post.user || {};
        const avatar = user.avatar_url || "assets/icons/default-profile.png";

        const currentUser =
            typeof getCurrentUser === "function" ? getCurrentUser() : null;

        const likeCount = Array.isArray(post.post_likes)
            ? post.post_likes.length
            : post.likes || 0;

        const commentCount = Array.isArray(post.comments)
            ? post.comments.length
            : post.comment_count || 0;

        const likedByCurrentUser =
            currentUser &&
            Array.isArray(post.post_likes) &&
            post.post_likes.some((l) => l.user_id === currentUser.id);

        const created = post.created_at ? new Date(post.created_at) : null;
        const timestamp = created
            ? created.toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit"
              })
            : "";

        div.innerHTML = `
            <div class="post-header">
                <img src="${avatar}" class="post-user-avatar" alt="Avatar">
                <div class="post-user-info">
                    <div class="post-display-name">${this.escape(
                        user.display_name || "Unknown"
                    )}</div>
                    <div class="post-username">@${this.escape(
                        user.username || "user"
                    )}</div>
                </div>
            </div>

            <div class="post-content">
                ${this.escape(post.content || "")}
            </div>

            <div class="post-footer">
                <span class="post-timestamp">${timestamp}</span>
                <div class="post-actions">
                    <button class="post-action-btn like-btn ${
                        likedByCurrentUser ? "liked" : ""
                    }" type="button" aria-label="Like">
                        <span class="post-action-icon">♥</span>
                        <span class="post-action-count">${likeCount}</span>
                    </button>
                    <button class="post-action-btn comment-btn" type="button" aria-label="Comment">
                        <span class="post-action-icon">💬</span>
                        <span class="post-action-count">${commentCount}</span>
                    </button>
                    <button class="post-action-btn share-btn" type="button" aria-label="Share">
                        <span class="post-action-icon">⤴</span>
                    </button>
                </div>
            </div>
        `;

        return div;
    }

    /* ----------------------- UTILITIES ----------------------- */

    escape(str) {
        return String(str).replace(/[&<>"']/g, (m) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[m]);
    }
}

/* ----------------------- INIT FEED ----------------------- */

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("feedContainer")) {
        window.feedManager = new FeedManager();
        feedManager.init();
    }
});
