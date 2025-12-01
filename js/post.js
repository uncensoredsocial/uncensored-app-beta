// post.js — single post + comments page

const POST_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class PostPage {
  constructor() {
    this.postId = this.getPostIdFromUrl();
    this.maxCommentChars = 280;

    this.post = null;
    this.comments = [];
  }

  async init() {
    this.cacheDom();
    this.bindEvents();
    this.updateAuthUI();

    if (!this.postId) {
      this.showError("Invalid post ID.");
      return;
    }

    await this.loadPost();
    await this.loadComments();
  }

  // ========= DOM & AUTH =========

  cacheDom() {
    this.postWrapper = document.getElementById("postWrapper");
    this.postContainer = document.getElementById("postContainer");
    this.postLoading = document.getElementById("postLoading");

    this.commentsList = document.getElementById("commentsList");
    this.commentsLoading = document.getElementById("commentsLoading");
    this.commentsEmpty = document.getElementById("commentsEmpty");

    this.commentComposer = document.getElementById("commentComposer");
    this.commentsGuestMessage = document.getElementById(
      "commentsGuestMessage"
    );
    this.commentUserAvatar = document.getElementById("commentUserAvatar");
    this.commentInput = document.getElementById("commentInput");
    this.commentCharCounter =
      document.getElementById("commentCharCounter");
    this.commentButton = document.getElementById("commentButton");

    // header auth bits
    this.profileSection = document.getElementById("profileSection");
    this.authButtons = document.getElementById("authButtons");
    this.headerProfileImg = document.getElementById("headerProfileImg");
  }

  bindEvents() {
    if (this.commentInput) {
      this.commentInput.addEventListener("input", () =>
        this.updateCommentCharCounter()
      );
      this.commentInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          this.handleCreateComment();
        }
      });
    }

    if (this.commentButton) {
      this.commentButton.addEventListener("click", () =>
        this.handleCreateComment()
      );
    }
  }

  getPostIdFromUrl() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get("id");
    } catch {
      return null;
    }
  }

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

    if (this.commentComposer)
      this.commentComposer.style.display = loggedIn ? "block" : "none";
    if (this.commentsGuestMessage)
      this.commentsGuestMessage.style.display = loggedIn ? "none" : "block";

    if (this.commentUserAvatar) {
      this.commentUserAvatar.src =
        user && user.avatar_url
          ? user.avatar_url
          : "assets/icons/default-profile.png";
    }

    // header
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
  }

  updateCommentCharCounter() {
    if (!this.commentInput || !this.commentCharCounter) return;
    const text = this.commentInput.value || "";
    const length = text.length;

    this.commentCharCounter.textContent = `${length}/${this.maxCommentChars}`;
    this.commentCharCounter.classList.remove("warning", "error");

    if (length > this.maxCommentChars) {
      this.commentCharCounter.classList.add("error");
    } else if (length > this.maxCommentChars - 40) {
      this.commentCharCounter.classList.add("warning");
    }

    const canComment =
      this.isLoggedIn() && length > 0 && length <= this.maxCommentChars;
    if (this.commentButton) this.commentButton.disabled = !canComment;
  }

  reloadAll() {
    this.loadPost();
    this.loadComments();
  }

  // ========= POST LOAD & RENDER =========

  async loadPost() {
    if (!this.postId || !this.postContainer) return;

    if (this.postLoading) this.postLoading.style.display = "flex";

    try {
      const url = `${POST_API_BASE_URL}/posts/${this.postId}`;
      const token = this.getAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(url, { headers });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load post.");

      // some APIs nest: { post, comments }
      this.post = data.post || data;
      this.comments = data.comments || this.comments;

      this.renderPost();
    } catch (err) {
      console.error("loadPost error:", err);
      this.showError("Could not load post.");
    }

    if (this.postLoading) this.postLoading.style.display = "none";
  }

  renderPost() {
    if (!this.postContainer || !this.post) return;

    const post = this.post;
    const user = post.user || {};
    const username = user.username || "unknown";
    const displayName = user.display_name || username;
    const avatar = user.avatar_url || "assets/icons/default-profile.png";

    const createdAt = post.created_at;
    const time = this.formatTime(createdAt);

    const liked = !!post.is_liked;
    const saved = !!post.is_saved;

    // FIX: comment count – avoid [object Object]
    let commentCount = 0;
    if (typeof post.comment_count === "number") {
      commentCount = post.comment_count;
    } else if (Array.isArray(post.comments)) {
      commentCount = post.comments.length;
    }

    const likeCount =
      typeof post.like_count === "number"
        ? post.like_count
        : Array.isArray(post.likes)
        ? post.likes.length
        : post.likes || 0;

    const mediaUrl =
      post.media_url || post.media || post.image_url || post.video_url || null;
    const mediaType = post.media_type || "";

    this.postContainer.innerHTML = `
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
          ${this.renderMediaHtml(mediaUrl, mediaType)}
        </div>

        <footer class="post-footer">
          <div class="post-actions"
               style="display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;">
            <button class="post-action like-btn ${liked ? "liked" : ""}"
                    style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center;">
              <i class="fa-${liked ? "solid" : "regular"} fa-heart"></i>
              <span class="like-count">${likeCount}</span>
            </button>

            <button class="post-action comment-btn"
                    style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center;">
              <i class="fa-regular fa-comment"></i>
              <span class="comment-count">${commentCount}</span>
            </button>

            <button class="post-action share-btn"
                    style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center;">
              <i class="fa-solid fa-arrow-up-from-bracket"></i>
            </button>

            <button class="post-action save-btn ${saved ? "saved" : ""}"
                    style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center;">
              <i class="fa-${saved ? "solid" : "regular"} fa-bookmark"></i>
            </button>
          </div>
        </footer>
      </article>
    `;

    this.attachPostEvents();
  }

  renderMediaHtml(url, type) {
    if (!url) return "";
    const lower = url.toLowerCase();
    const isVideo =
      (type && type.startsWith("video/")) ||
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".ogg");

    if (isVideo) {
      return `
        <div class="post-media">
          <video controls playsinline preload="metadata">
            <source src="${url}">
            Your browser does not support video.
          </video>
        </div>
      `;
    }

    return `
      <div class="post-media">
        <img src="${url}" loading="lazy">
      </div>
    `;
  }

  attachPostEvents() {
    const postEl = this.postContainer.querySelector(".post");
    if (!postEl || !this.post) return;
    const postId = this.post.id;

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

    const shareBtn = postEl.querySelector(".share-btn");
    if (shareBtn) {
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = `${window.location.origin}${window.location.pathname}?id=${postId}`;
        navigator.clipboard.writeText(url);
        this.showToast("Link copied!", "success");
      });
    }

    const likeBtn = postEl.querySelector(".like-btn");
    if (likeBtn) {
      likeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handlePostLike(postId, likeBtn);
      });
    }

    const saveBtn = postEl.querySelector(".save-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handlePostSave(postId, saveBtn);
      });
    }
  }

  async handlePostLike(postId, btn) {
    const user = this.getCurrentUser();
    if (!user) return this.showToast("Log in to like posts", "error");

    const token = this.getAuthToken();
    if (!token) return this.showToast("Missing token", "error");

    const countEl = btn.querySelector(".like-count");
    const icon = btn.querySelector("i");

    const wasLiked = btn.classList.contains("liked");
    let newCount = parseInt(countEl.textContent || "0", 10);

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
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${postId}/like`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error("Failed to update like");
      if (typeof data.likes === "number")
        countEl.textContent = data.likes.toString();
    } catch (err) {
      console.error(err);
      this.showToast("Failed to update like", "error");
    }
  }

  async handlePostSave(postId, btn) {
    const user = this.getCurrentUser();
    if (!user) return this.showToast("Log in to save posts", "error");

    const token = this.getAuthToken();
    if (!token) return this.showToast("Missing token", "error");

    const icon = btn.querySelector("i");
    const wasSaved = btn.classList.contains("saved");

    if (wasSaved) {
      btn.classList.remove("saved");
      icon.classList.replace("fa-solid", "fa-regular");
    } else {
      btn.classList.add("saved");
      icon.classList.replace("fa-regular", "fa-solid");
    }

    try {
      await fetch(`${POST_API_BASE_URL}/posts/${postId}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error(err);
      this.showToast("Failed to update save", "error");
    }
  }

  // ========= COMMENTS =========

  async loadComments() {
    if (!this.postId || !this.commentsList) return;

    if (this.commentsLoading) this.commentsLoading.style.display = "flex";
    if (this.commentsEmpty) this.commentsEmpty.style.display = "none";

    try {
      const url = `${POST_API_BASE_URL}/posts/${this.postId}/comments`;
      const token = this.getAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(url, { headers });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load comments.");

      const comments = Array.isArray(data)
        ? data
        : Array.isArray(data.comments)
        ? data.comments
        : [];

      this.comments = comments;
      this.renderComments();
    } catch (err) {
      console.error("loadComments error:", err);
      this.showToast("Could not load comments.", "error");
    }

    if (this.commentsLoading) this.commentsLoading.style.display = "none";
  }

  renderComments() {
    if (!this.commentsList) return;

    if (!this.comments || this.comments.length === 0) {
      this.commentsList.innerHTML = "";
      if (this.commentsEmpty) this.commentsEmpty.style.display = "block";
      return;
    }

    if (this.commentsEmpty) this.commentsEmpty.style.display = "none";

    this.commentsList.innerHTML = this.comments
      .map((c) => this.renderCommentHtml(c))
      .join("");
  }

  renderCommentHtml(comment) {
    const user = comment.user || {};
    const username = user.username || "unknown";
    const displayName = user.display_name || username;
    const avatar =
      user.avatar_url || "assets/icons/default-profile.png";

    const createdAt = comment.created_at;
    const time = this.formatTime(createdAt);

    return `
      <article class="comment" data-comment-id="${comment.id}">
        <img class="comment-avatar-small" src="${avatar}" onerror="this.src='assets/icons/default-profile.png'">

        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-display-name">${this.escape(
              displayName
            )}</span>
            <span class="comment-username">@${this.escape(
              username
            )}</span>
            <span class="comment-time">${time}</span>
          </div>
          <div class="comment-text">
            ${this.formatPostContent(comment.content || "")}
          </div>
        </div>
      </article>
    `;
  }

  async handleCreateComment() {
    const user = this.getCurrentUser();
    if (!user) return this.showToast("Please log in to comment.", "error");

    if (!this.commentInput || !this.postId) return;

    const content = (this.commentInput.value || "").trim();
    if (!content) {
      this.showToast("Write a comment first.", "error");
      return;
    }
    if (content.length > this.maxCommentChars) {
      this.showToast("Comment is over 280 characters.", "error");
      return;
    }

    const token = this.getAuthToken();
    if (!token) {
      this.showToast("Missing auth token.", "error");
      return;
    }

    if (this.commentButton) this.commentButton.disabled = true;

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${this.postId}/comments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add comment.");

      // prepend new comment
      this.comments.unshift(data);
      this.renderComments();

      // clear input
      this.commentInput.value = "";
      this.updateCommentCharCounter();

      this.showToast("Comment added!", "success");
    } catch (err) {
      console.error("Create comment failed:", err);
      this.showToast("Failed to add comment.", "error");
    }

    if (this.commentButton) this.commentButton.disabled = false;
  }

  // ========= UTIL =========

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

  showError(msg) {
    if (!this.postContainer) return;
    this.postContainer.innerHTML = `<p>${this.escape(msg)}</p>`;
  }
}

// ======= Initialize =======
document.addEventListener("DOMContentLoaded", () => {
  window.postPage = new PostPage();
  window.postPage.init();
});
