// ============================================
// feed.js — Stable Version (JSON + Media Ready)
// ============================================

// Prefer global API_BASE_URL from auth.js
const FEED_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class FeedManager {
  constructor() {
    // Feed state
    this.posts = [];
    this.isLoading = false;
    this.isPosting = false;
    this.currentMode = "recent"; // recent | following
    this.hasMore = true;
    this.page = 1;
    this.pageSize = 20;

    // Character limit
    this.maxChars = 280;

    // Media
    this.selectedMediaFile = null;
    this.selectedMediaPreviewUrl = null;
  }

  async init() {
    this.cacheDom();
    this.bindEvents();
    this.updateAuthUI();
    this.updateCharCounter();
    await this.loadPosts(true);
  }

  // ============================================
  // DOM CACHE
  // ============================================

  cacheDom() {
    this.feedContainer = document.getElementById("feedContainer");
    this.postInput = document.getElementById("postInput");
    this.postButton = document.getElementById("postButton");
    this.charCounter = document.getElementById("charCounter");
    this.postCreation = document.getElementById("postCreation");
    this.guestMessage = document.getElementById("guestMessage");
    this.postUserAvatar = document.getElementById("postUserAvatar");

    // Media picker
    this.postMediaInput = document.getElementById("postMediaInput");
    this.addMediaBtn = document.getElementById("addMediaBtn");
    this.mediaFileName = document.getElementById("mediaFileName");

    // Tabs
    this.feedTabs = document.getElementById("feedTabs");
    this.tabButtons = this.feedTabs
      ? this.feedTabs.querySelectorAll(".feed-tab-btn")
      : [];

    // Loading / empty
    this.feedLoading = document.getElementById("feedLoading");
    this.feedEmpty = document.getElementById("feedEmpty");

    // Header auth UI
    this.profileSection = document.getElementById("profileSection");
    this.authButtons = document.getElementById("authButtons");
    this.headerProfileImg = document.getElementById("headerProfileImg");
  }

  // ============================================
  // EVENTS
  // ============================================

  bindEvents() {
    // Post Input typing
    if (this.postInput) {
      this.postInput.addEventListener("input", () => this.updateCharCounter());
      this.postInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          this.handleCreatePost();
        }
      });
    }

    // Post button
    if (this.postButton) {
      this.postButton.addEventListener("click", () => this.handleCreatePost());
    }

    // Media picker UI
    if (this.addMediaBtn && this.postMediaInput) {
      this.addMediaBtn.addEventListener("click", () => {
        this.postMediaInput.click();
      });
    }

    if (this.postMediaInput) {
      this.postMediaInput.addEventListener("change", () => {
        const file = this.postMediaInput.files[0];
        this.selectedMediaFile = file || null;
        if (this.mediaFileName) {
          this.mediaFileName.textContent = file ? file.name : "";
        }
        this.updateCharCounter();
      });
    }

    // Tabs
    if (this.tabButtons.length > 0) {
      this.tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.tab;
          if (!mode || mode === this.currentMode) return;
          this.switchMode(mode);
        });
      });
    }

    // Infinite scrolling
    window.addEventListener("scroll", () => this.handleScroll());
  }

  // ============================================
  // AUTH HELPERS
  // ============================================

  isLoggedIn() {
    try {
      return typeof isLoggedIn === "function" ? isLoggedIn() : false;
    } catch {
      return false;
    }
  }

  getCurrentUser() {
    try {
      return typeof getCurrentUser === "function" ? getCurrentUser() : null;
    } catch {
      return null;
    }
  }

  getAuthToken() {
    try {
      return typeof getAuthToken === "function"
        ? getAuthToken()
        : localStorage.getItem("authToken");
    } catch {
      return null;
    }
  }

  updateAuthUI() {
    const user = this.getCurrentUser();
    const loggedIn = !!user;

    // Composer visibility
    if (this.postCreation)
      this.postCreation.style.display = loggedIn ? "block" : "none";

    // Guest message
    if (this.guestMessage)
      this.guestMessage.style.display = loggedIn ? "none" : "block";

    // Header UI
    if (this.profileSection && this.authButtons) {
      if (loggedIn) {
        this.profileSection.style.display = "flex";
        this.authButtons.style.display = "none";

        if (this.headerProfileImg && user.avatar_url) {
          this.headerProfileImg.src = user.avatar_url;
        }
      } else {
        this.profileSection.style.display = "none";
        this.authButtons.style.display = "flex";
      }
    }

    // Composer avatar
    if (this.postUserAvatar) {
      this.postUserAvatar.src =
        user && user.avatar_url
          ? user.avatar_url
          : "assets/icons/default-profile.png";
    }
  }

  // ============================================
  // CHARACTER COUNTER
  // ============================================

  updateCharCounter() {
    if (!this.postInput || !this.charCounter) return;

    const text = this.postInput.value || "";
    const length = text.length;

    this.charCounter.textContent = `${length}/${this.maxChars}`;

    this.charCounter.classList.remove("warning", "error");
    if (length > this.maxChars) {
      this.charCounter.classList.add("error");
    } else if (length > this.maxChars - 40) {
      this.charCounter.classList.add("warning");
    }

    const canPost = this.isLoggedIn() && (length > 0 || this.selectedMediaFile);
    if (this.postButton) this.postButton.disabled = !canPost;
  }

  // ============================================
  // TABS
  // ============================================

  switchMode(mode) {
    this.currentMode = mode;
    this.page = 1;
    this.hasMore = true;

    this.tabButtons.forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.tab === mode)
    );

    this.loadPosts(true);
  }

  // ============================================
  // LOAD POSTS
  // ============================================

  async loadPosts(reset = false) {
    if (this.isLoading || (!this.hasMore && !reset)) return;
    this.isLoading = true;

    if (reset) {
      if (this.feedLoading) this.feedLoading.style.display = "flex";
      if (this.feedContainer) this.feedContainer.innerHTML = "";
    }

    try {
      const url = new URL(`${FEED_API_BASE_URL}/posts`);
      url.searchParams.set("mode", this.currentMode);
      url.searchParams.set("page", this.page);
      url.searchParams.set("pageSize", this.pageSize);

      const token = this.getAuthToken();
      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, { headers });
      const data = await res.json();

      const posts = Array.isArray(data)
        ? data
        : Array.isArray(data.posts)
        ? data.posts
        : [];

      if (reset) this.posts = posts;
      else this.posts = this.posts.concat(posts);

      if (posts.length < this.pageSize) this.hasMore = false;
      else this.page++;

      this.renderPosts();
    } catch (err) {
      console.error("loadPosts error:", err);
    }

    this.isLoading = false;
    if (this.feedLoading) this.feedLoading.style.display = "none";
  }

  // ============================================
  // RENDER POSTS
  // ============================================

  renderPosts() {
    if (!this.feedContainer) return;

    if (this.posts.length === 0) {
      this.feedContainer.innerHTML = "";
      return;
    }

    this.feedContainer.innerHTML = this.posts
      .map((post) => this.renderPostHtml(post))
      .join("");

    this.attachPostEvents();
  }

  renderPostHtml(post) {
    const user = post.user || {};
    const username = user.username || "unknown";
    const displayName = user.display_name || username;
    const avatar = user.avatar_url || "assets/icons/default-profile.png";

    const createdAt = post.created_at;
    const time = this.formatTime(createdAt);

    const liked = !!post.is_liked;
    const saved = !!post.is_saved;

    const likeCount =
      post.like_count ||
      post.likes ||
      (Array.isArray(post.likes) ? post.likes.length : 0);
    const commentCount = post.comment_count || post.comments || 0;

    const mediaUrl = post.media_url || null;

    return `
      <article class="post" data-post-id="${post.id}">
        <header class="post-header">
          <div class="post-user" data-username="${this.escape(username)}">
            <img class="post-avatar" src="${avatar}" onerror="this.src='assets/icons/default-profile.png'">
            <div class="post-user-meta">
              <span class="post-display-name">${this.escape(displayName)}</span>
              <span class="post-username">@${this.escape(username)}</span>
            </div>
          </div>
          <span class="post-time">${time}</span>
        </header>

        <div class="post-body">
          <div class="post-text">${this.formatPostContent(
            post.content || ""
          )}</div>

          ${
            mediaUrl
              ? `<div class="post-media"><img src="${mediaUrl}" loading="lazy"></div>`
              : ""
          }
        </div>

        <footer class="post-footer">
          <div class="post-actions">

            <button class="post-action like-btn ${liked ? "liked" : ""}">
              <i class="fa-${liked ? "solid" : "regular"} fa-heart"></i>
              <span class="like-count">${likeCount}</span>
            </button>

            <button class="post-action comment-btn">
              <i class="fa-regular fa-comment"></i>
              <span class="comment-count">${commentCount}</span>
            </button>

            <button class="post-action share-btn">
              <i class="fa-solid fa-arrow-up-from-bracket"></i>
            </button>

            <button class="post-action save-btn ${saved ? "saved" : ""}">
              <i class="fa-${saved ? "solid" : "regular"} fa-bookmark"></i>
            </button>

          </div>
        </footer>
      </article>
    `;
  }

  // ============================================
  // POST EVENTS
  // ============================================

  attachPostEvents() {
    const posts = document.querySelectorAll(".post");

    posts.forEach((postEl) => {
      const postId = postEl.dataset.postId;

      // Click post -> open post page
      postEl.addEventListener("click", (e) => {
        if (e.target.closest(".post-actions") || e.target.closest(".post-user"))
          return;
        window.location.href = `post.html?id=${postId}`;
      });

      // User click
      const userEl = postEl.querySelector(".post-user");
      if (userEl) {
        userEl.addEventListener("click", (e) => {
          e.stopPropagation();
          const username = userEl.dataset.username;
          const me = this.getCurrentUser();
          if (me && me.username === username)
            window.location.href = "profile.html";
          else
            window.location.href = `user.html?user=${encodeURIComponent(
              username
            )}`;
        });
      }

      // Like
      const likeBtn = postEl.querySelector(".like-btn");
      if (likeBtn) {
        likeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.handleLike(postId, likeBtn);
        });
      }

      // Comment
      const commentBtn = postEl.querySelector(".comment-btn");
      if (commentBtn) {
        commentBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          window.location.href = `post.html?id=${postId}#comments`;
        });
      }

      // Share
      const shareBtn = postEl.querySelector(".share-btn");
      if (shareBtn) {
        shareBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const postUrl = `${window.location.origin}/post.html?id=${postId}`;
          navigator.clipboard.writeText(postUrl);
          this.showToast("Link copied!", "success");
        });
      }

      // Save
      const saveBtn = postEl.querySelector(".save-btn");
      if (saveBtn) {
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.handleSave(postId, saveBtn);
        });
      }
    });
  }

  // ============================================
  // CREATE POST
  // ============================================

  async handleCreatePost() {
    const user = this.getCurrentUser();
    if (!user) return this.showToast("Please log in to post.", "error");

    if (this.isPosting) return;

    const content = (this.postInput?.value || "").trim();
    const hasMedia = !!this.selectedMediaFile;

    if (!content && !hasMedia) {
      this.showToast("Write something or add media.", "error");
      return;
    }

    if (content.length > this.maxChars) {
      this.showToast("Post is over 280 characters.", "error");
      return;
    }

    const token = this.getAuthToken();
    if (!token) {
      this.showToast("Missing auth token.", "error");
      return;
    }

    this.isPosting = true;
    if (this.postButton) this.postButton.disabled = true;

    try {
      const endpoint = `${FEED_API_BASE_URL}/posts`;
      let res;

      if (hasMedia) {
        // BACKEND MUST ACCEPT multipart/form-data FOR THIS
        const formData = new FormData();
        formData.append("content", content);
        formData.append("media", this.selectedMediaFile);

        res = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        // Works with your current JSON backend
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create post.");

      // Prepend new post
      this.posts.unshift(data);
      this.renderPosts();

      // Reset composer
      if (this.postInput) this.postInput.value = "";
      this.selectedMediaFile = null;
      if (this.mediaFileName) this.mediaFileName.textContent = "";
      this.updateCharCounter();

      this.showToast("Posted!", "success");
    } catch (err) {
      console.error("Create post failed:", err);
      this.showToast("Failed to create post.", "error");
    }

    this.isPosting = false;
    if (this.postButton) this.postButton.disabled = false;
  }

  // ============================================
  // LIKE / SAVE
  // ============================================

  async handleLike(postId, btn) {
    const user = this.getCurrentUser();
    if (!user) return this.showToast("Log in to like posts", "error");

    const token = this.getAuthToken();
    if (!token) return this.showToast("Missing token", "error");

    const countEl = btn.querySelector(".like-count");
    const icon = btn.querySelector("i");

    const wasLiked = btn.classList.contains("liked");
    let newCount = parseInt(countEl.textContent || "0", 10);

    // Optimistic UI
    if (wasLiked) {
      btn.classList.remove("liked");
      icon.classList.replace("fa-solid", "fa-regular");
      newCount--;
    } else {
      btn.classList.add("liked");
      icon.classList.replace("fa-regular", "fa-solid");
      newCount++;
    }
    countEl.textContent = newCount;

    try {
      const res = await fetch(`${FEED_API_BASE_URL}/posts/${postId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) throw new Error("Failed to update like");

      if (typeof data.likes === "number")
        countEl.textContent = data.likes.toString();
    } catch (err) {
      console.error(err);
      this.showToast("Failed to update like", "error");
    }
  }

  async handleSave(postId, btn) {
    const user = this.getCurrentUser();
    if (!user) return this.showToast("Log in to save posts", "error");

    const token = this.getAuthToken();
    if (!token) return this.showToast("Missing token", "error");

    const icon = btn.querySelector("i");
    const wasSaved = btn.classList.contains("saved");

    // Optimistic UI
    if (wasSaved) {
      btn.classList.remove("saved");
      icon.classList.replace("fa-solid", "fa-regular");
    } else {
      btn.classList.add("saved");
      icon.classList.replace("fa-regular", "fa-solid");
    }

    try {
      await fetch(`${FEED_API_BASE_URL}/posts/${postId}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error(err);
      this.showToast("Failed to update save", "error");
    }
  }

  // ============================================
  // UTILITIES
  // ============================================

  handleScroll() {
    if (!this.hasMore || this.isLoading) return;
    const scrollY = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 600;
    if (scrollY >= threshold) this.loadPosts(false);
  }

  escape(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  formatTime(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return "";
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    if (diff < 604800) return Math.floor(diff / 86400) + "d";
    return d.toLocaleDateString();
  }

  formatPostContent(text) {
    let t = this.escape(text);
    t = t.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank">$1</a>'
    );
    t = t.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
    t = t.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    return t;
  }

  showToast(message, type = "info") {
    const old = document.querySelector(".status-message");
    if (old) old.remove();

    const d = document.createElement("div");
    d.className = `status-message status-${type}`;
    d.textContent = message;
    d.style.position = "fixed";
    d.style.top = "70px";
    d.style.left = "50%";
    d.style.transform = "translateX(-50%)";
    d.style.padding = "8px 14px";
    d.style.borderRadius = "999px";
    d.style.background =
      type === "error"
        ? "#3b0f0f"
        : type === "success"
        ? "#0f3b1f"
        : "#111";
    d.style.border = "1px solid #333";
    d.style.color = "#fff";
    d.style.zIndex = "9999";

    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }
}

// ============================================
// Initialize
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  window.feedManager = new FeedManager();
  window.feedManager.init();
});

window.refreshFeed = function () {
  if (window.feedManager) {
    window.feedManager.page = 1;
    window.feedManager.hasMore = true;
    window.feedManager.loadPosts(true);
  }
};
