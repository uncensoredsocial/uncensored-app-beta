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
    }

    /* ----------------------- AUTH / UI ----------------------- */

    updateAuthUI() {
        const loggedIn = isLoggedIn();

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
        const loggedIn = isLoggedIn();

        this.postButton.disabled = !loggedIn || text.length === 0 || text.length > 280;
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
        }

        this.isLoading = false;
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

        this.setPostButtonLoading(true);

        try {
            const res = await fetch(`${API_BASE_URL}/posts`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({ content: text })
            });

            if (!res.ok) {
                const error = await res.json();
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
        }

        this.setPostButtonLoading(false);
    }

    /* ----------------------- POST ELEMENT ----------------------- */

    createPostElement(post) {
        const div = document.createElement("div");
        div.className = "post";

        const user = post.user || {};
        const avatar = user.avatar_url || "assets/icons/default-profile.png";

        div.innerHTML = `
            <div class="post-header">
                <img src="${avatar}" class="post-user-avatar">
                <div class="post-user-info">
                    <div class="post-display-name">${user.display_name || "Unknown"}</div>
                    <div class="post-username">@${user.username || "user"}</div>
                </div>
            </div>

            <div class="post-content">${this.escape(post.content)}</div>

            <div class="post-actions">
                <span>❤️ ${post.likes?.length || 0}</span>
                <span>💬 ${post.comments?.length || 0}</span>
            </div>
        `;

        return div;
    }

    /* ----------------------- UTILITIES ----------------------- */

    escape(str) {
        return str.replace(/[&<>"']/g, (m) => ({
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
