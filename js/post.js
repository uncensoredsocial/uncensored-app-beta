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
    this.commentsGuestMessage = document.getElementById("commentsGuestMessage");
    this.commentUserAvatar = document.getElementById("commentUserAvatar");
    this.commentInput = document.getElementById("commentInput");
    this.commentCharCounter = document.getElementById("commentCharCounter");
    this.commentButton = document.getElementById("commentButton");

    // header bits (may not exist)
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

    if (this.profileSection && this.authButtons) {
      if (loggedIn) {
        this.profileSection.style.display = "flex";
        this.authButtons.style.display = "none";
        if (this.headerProfileImg && user.avatar_url)
          this.headerProfileImg.src = user.avatar_url;
      } else {
        this.profileSection.style.display = "none";
        this.authButtons.style.display = "flex";
      }
    }
  }

  // ========= COMMENT CHAR COUNTER =========

  updateCommentCharCounter() {
    if (!this.commentInput || !this.commentCharCounter) return;
    const text = this.commentInput.value || "";
    const length = text.length;

    this.commentCharCounter.textContent = `${length}/280`;
    this.commentCharCounter.classList.remove("warning", "error");

    if (length > 280) this.commentCharCounter.classList.add("error");
    else if (length > 240) this.commentCharCounter.classList.add("warning");

    const canComment = this.isLoggedIn() && length > 0 && length <= 280;
    if (this.commentButton) this.commentButton.disabled = !canComment;
  }

  // ========= LOAD POST =========

  async loadPost() {
    if (!this.postId || !this.postContainer) return;

    if (this.postLoading) this.postLoading.style.display = "flex";

    try {
      const token = this.getAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(`${POST_API_BASE_URL}/posts/${this.postId}`, {
        headers,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load post.");

      this.post = data.post || data;
      this.comments = data.comments || this.comments;

      this.renderPost();
    } catch (err) {
      console.error(err);
      this.showError("Could not load post.");
    }

    if (this.postLoading) this.postLoading.style.display = "none";
  }

  renderPost() {
    if (!this.post) return;

    const p = this.post;

    const user = p.user || {};
    const username = user.username || "unknown";
    const displayName = user.display_name || username;
    const avatar = user.avatar_url || "assets/icons/default-profile.png";

    const liked =
      p.liked_by_me === true ||
      p.is_liked === true ||
      p.isLiked === true;

    const saved =
      p.saved_by_me === true ||
      p.is_saved === true ||
      p.isSaved === true;

    const likeCount =
      typeof p.likes === "number"
        ? p.likes
        : Array.isArray(p.likes)
        ? p.likes.length
        : p.like_count || 0;

    const commentCount =
      typeof p.comments_count === "number"
        ? p.comments_count
        : p.comment_count || (Array.isArray(p.comments) ? p.comments.length : 0);

    const time = this.formatTime(p.created_at);

    const mediaHtml = this.renderMedia(p.media_url, p.media_type);

    this.postContainer.innerHTML = `
      <article class="post" data-post-id="${p.id}">
        <header class="post-header">
          <div class="post-user" data-username="${this.escape(username)}">
            <img class="post-avatar" src="${avatar}">
            <div>
              <span class="post-display-name">${this.escape(displayName)}</span>
              <span class="post-username">@${this.escape(username)}</span>
            </div>
          </div>
          <span class="post-time">${time}</span>
        </header>

        <div class="post-body">
          <div class="post-text">${this.formatPostContent(p.content)}</div>
          ${mediaHtml}
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

    this.attachPostEvents();
  }

  renderMedia(url, type) {
    if (!url) return "";
    const isVideo =
      (type && type.startsWith("video/")) ||
      url.endsWith(".mp4") ||
      url.endsWith(".webm");

    return isVideo
      ? `
      <div class="post-media">
        <video controls playsinline><source src="${url}"></video>
      </div>`
      : `
      <div class="post-media">
        <img src="${url}" loading="lazy">
      </div>`;
  }

  attachPostEvents() {
    const postEl = this.postContainer.querySelector(".post");
    if (!postEl) return;
    const postId = this.post.id;

    // Profile click
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

    // SHARE
    const shareBtn = postEl.querySelector(".share-btn");
    if (shareBtn) {
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = `${location.origin}/post.html?id=${postId}`;
        navigator.clipboard.writeText(url);
        this.showToast("Link copied!", "success");
      });
    }

    // LIKE
    const likeBtn = postEl.querySelector(".like-btn");
    if (likeBtn) {
      likeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleLike(postId, likeBtn);
      });
    }

    // SAVE
    const saveBtn = postEl.querySelector(".save-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleSave(postId, saveBtn);
      });
    }
  }

  // ========= LIKE =========

  async toggleLike(postId, btn) {
    const token = this.getAuthToken();
    if (!token) return this.showToast("Login required", "error");

    const countEl = btn.querySelector(".like-count");
    const icon = btn.querySelector("i");

    const wasLiked = btn.classList.contains("liked");
    let count = parseInt(countEl.textContent);

    // optimistic UI
    if (wasLiked) {
      btn.classList.remove("liked");
      icon.classList.replace("fa-solid", "fa-regular");
      count--;
    } else {
      btn.classList.add("liked");
      icon.classList.replace("fa-regular", "fa-solid");
      count++;
    }
    countEl.textContent = count;

    try {
      const res = await fetch(`${POST_API_BASE_URL}/posts/${postId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (typeof data.likes === "number") {
        countEl.textContent = data.likes;
      }
    } catch (err) {
      console.error(err);
      this.showToast("Failed to update like", "error");
    }
  }

  // ========= SAVE =========

  async toggleSave(postId, btn) {
    const token = this.getAuthToken();
    if (!token) return this.showToast("Login required", "error");

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
    const token = this.getAuthToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    if (this.commentsLoading) this.commentsLoading.style.display = "flex";
    if (this.commentsEmpty) this.commentsEmpty.style.display = "none";

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${this.postId}/comments`,
        { headers }
      );
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      this.comments = Array.isArray(data) ? data : data.comments || [];
      this.renderComments();
    } catch (err) {
      console.error(err);
      this.showToast("Could not load comments", "error");
    }

    if (this.commentsLoading) this.commentsLoading.style.display = "none";
  }

  renderComments() {
    if (!this.commentsList) return;

    if (this.comments.length === 0) {
      this.commentsList.innerHTML = "";
      if (this.commentsEmpty) this.commentsEmpty.style.display = "block";
      return;
    }

    if (this.commentsEmpty) this.commentsEmpty.style.display = "none";

    this.commentsList.innerHTML = this.comments
      .map((c) => this.renderCommentHTML(c))
      .join("");

    this.attachCommentEvents();
  }

  renderCommentHTML(comment) {
    const user = comment.user || {};
    return `
      <article class="comment" data-username="${user.username}">
        <img class="comment-avatar-small" src="${
          user.avatar_url || "assets/icons/default-profile.png"
        }">
        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-display-name">${this.escape(
              user.display_name || user.username
            )}</span>
            <span class="comment-username">@${this.escape(
              user.username
            )}</span>
            <span class="comment-time">${this.formatTime(
              comment.created_at
            )}</span>
          </div>
          <div class="comment-text">${this.formatPostContent(
            comment.content
          )}</div>
        </div>
      </article>
    `;
  }

  attachCommentEvents() {
    const comments = this.commentsList.querySelectorAll(".comment");

    comments.forEach((c) => {
      const username = c.dataset.username;

      const go = (e) => {
        e.stopPropagation();
        const me = this.getCurrentUser();
        if (me && me.username === username)
          window.location.href = "profile.html";
        else
          window.location.href = `user.html?user=${encodeURIComponent(
            username
          )}`;
      };

      c.addEventListener("click", go);
      c.querySelector(".comment-avatar-small")?.addEventListener("click", go);
      c.querySelector(".comment-header")?.addEventListener("click", go);
    });
  }

  // ========= ADD COMMENT =========

  async handleCreateComment() {
    const token = this.getAuthToken();
    if (!token) return this.showToast("Login required", "error");
    if (!this.commentInput) return;

    const content = this.commentInput.value.trim();
    if (!content) return this.showToast("Type something first", "error");
    if (content.length > 280) return;

    this.commentButton.disabled = true;

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
      if (!res.ok) throw new Error(data.error);

      this.comments.unshift(data);
      this.renderComments();

      // Update comment count on UI
      if (this.post) {
        if (typeof this.post.comments_count === "number")
          this.post.comments_count++;
        else this.post.comment_count = (this.post.comment_count || 0) + 1;
        this.renderPost();
      }

      this.commentInput.value = "";
      this.updateCommentCharCounter();
      this.showToast("Comment added!", "success");
    } catch (err) {
      console.error(err);
      this.showToast("Failed to add comment", "error");
    }

    this.commentButton.disabled = false;
  }

  // ========= UTILITIES =========

  escape(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  formatPostContent(text = "") {
    let t = this.escape(text);
    t = t.replace(
      /(https?:\/\/[^\s]+)/g,
      `<a href="$1" target="_blank">$1</a>`
    );
    t = t.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
    t = t.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    return t;
  }

  formatTime(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return "";
    const diff = (Date.now() - d) / 1000;

    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    if (diff < 604800) return Math.floor(diff / 86400) + "d";
    return d.toLocaleDateString();
  }

  showToast(msg, type = "info") {
    const old = document.querySelector(".status-message");
    if (old) old.remove();

    const div = document.createElement("div");
    div.className = `status-message status-${type}`;
    div.textContent = msg;

    div.style.position = "fixed";
    div.style.top = "70px";
    div.style.left = "50%";
    div.style.transform = "translateX(-50%)";
    div.style.padding = "8px 14px";
    div.style.borderRadius = "999px";
    div.style.background =
      type === "error" ? "#3b0f0f" : type === "success" ? "#0f3b1f" : "#111";
    div.style.border = "1px solid #333";
    div.style.color = "#fff";
    div.style.zIndex = "9999";

    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2500);
  }

  showError(msg) {
    this.postContainer.innerHTML = `<p>${this.escape(msg)}</p>`;
  }
}

// ======= Initialize =======
document.addEventListener("DOMContentLoaded", () => {
  window.postPage = new PostPage();
  window.postPage.init();
});
