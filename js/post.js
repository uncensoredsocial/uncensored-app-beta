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
    this.postErrorEl = document.getElementById("postError");

    // comments
    this.commentsSection = document.getElementById("commentsSection");
    this.commentsList = document.getElementById("commentsList");
    this.commentsLoading = document.getElementById("commentsLoading");
    this.commentsEmpty = document.getElementById("commentsEmpty");

    // comment composer
    this.commentForm = document.getElementById("commentForm");
    this.commentInput = document.getElementById("commentInput");
    this.commentSubmitBtn = document.getElementById("commentSubmitBtn");
    this.commentCharCounter = document.getElementById("commentCharCounter");

    // guest message (if you have one)
    this.guestMessage = document.getElementById("guestCommentMessage");
  }

  bindEvents() {
    // comment char counter
    if (this.commentInput && this.commentCharCounter) {
      this.commentInput.addEventListener("input", () => {
        const len = this.commentInput.value.length;
        this.commentCharCounter.textContent = `${len}/${this.maxCommentChars}`;
        this.commentCharCounter.classList.toggle(
          "warning",
          len > this.maxCommentChars - 40 && len <= this.maxCommentChars
        );
        this.commentCharCounter.classList.toggle(
          "error",
          len > this.maxCommentChars
        );
      });
    }

    // submit comment
    if (this.commentForm) {
      this.commentForm.addEventListener("submit", (e) =>
        this.handleCommentSubmit(e)
      );
    }
  }

  updateAuthUI() {
    const loggedIn =
      typeof isLoggedIn === "function" ? isLoggedIn() : !!getAuthToken?.();

    if (!loggedIn) {
      if (this.guestMessage) this.guestMessage.classList.remove("hidden");
      if (this.commentForm) this.commentForm.classList.add("hidden");
    } else {
      if (this.guestMessage) this.guestMessage.classList.add("hidden");
      if (this.commentForm) this.commentForm.classList.remove("hidden");
    }
  }

  // ========= URL / ERROR HELPERS =========

  getPostIdFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("id");
    } catch {
      return null;
    }
  }

  showError(msg) {
    if (this.postErrorEl) {
      this.postErrorEl.textContent = msg || "Something went wrong.";
      this.postErrorEl.classList.remove("hidden");
    }
  }

  hidePostLoading() {
    if (this.postLoading) this.postLoading.classList.add("hidden");
  }

  hideCommentsLoading() {
    if (this.commentsLoading) this.commentsLoading.classList.add("hidden");
  }

  // ========= LOAD POST =========

  async loadPost() {
    if (!this.postContainer) return;

    this.postContainer.innerHTML = "";
    if (this.postLoading) this.postLoading.classList.remove("hidden");

    try {
      const headers = {};
      const token = typeof getAuthToken === "function" ? getAuthToken() : null;
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${encodeURIComponent(this.postId)}`,
        { headers }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("loadPost error:", res.status, text);
        this.showError("Failed to load post.");
        this.hidePostLoading();
        return;
      }

      const data = await res.json();
      this.post = data;

      const article = this.renderPostCard(data);
      this.postContainer.appendChild(article);
    } catch (err) {
      console.error("loadPost exception:", err);
      this.showError("Failed to load post.");
    } finally {
      this.hidePostLoading();
    }
  }

  renderPostCard(post) {
    const article = document.createElement("article");
    article.className = "post post-page-card";
    article.dataset.postId = post.id;

    const author = post.user || {};
    const avatar =
      author.avatar_url || "default-profile.PNG"; // fallback
    const username = author.username || "unknown";
    const displayName = author.display_name || username;
    const createdAt = post.created_at;
    const time = createdAt ? this.formatTime(createdAt) : "";

    const liked = !!post.liked_by_me;
    const saved = !!post.saved_by_me;

    let likeCount = typeof post.likes === "number" ? post.likes : 0;
    let commentCount =
      typeof post.comments_count === "number" ? post.comments_count : 0;

    const mediaUrl =
      post.media_url || post.media || post.image_url || post.video_url || null;
    const mediaType = post.media_type || "";
    const mediaHtml = mediaUrl ? this.renderMediaHtml(mediaUrl, mediaType) : "";

    article.innerHTML = `
      <header class="post-header">
        <div class="post-user" data-username="${this.escape(username)}">
          <img class="post-avatar" src="${avatar}" 
               onerror="this.src='default-profile.PNG'">
          <div class="post-user-meta">
            <span class="post-display-name">${this.escape(displayName)}</span>
            <span class="post-username">@${this.escape(username)}</span>
          </div>
        </div>
        <span class="post-time">${this.escape(time)}</span>
      </header>

      <div class="post-body">
        <div class="post-text">${this.formatContent(post.content || "")}</div>
        ${mediaHtml}
      </div>

      <footer class="post-footer">
        <div class="post-actions">
          <button class="post-action like-btn ${liked ? "liked" : ""}" type="button">
            <i class="fa-${liked ? "solid" : "regular"} fa-heart"></i>
            <span class="like-count">${likeCount}</span>
          </button>
          <button class="post-action comment-btn" type="button">
            <i class="fa-regular fa-comment"></i>
            <span class="comment-count">${commentCount}</span>
          </button>
          <button class="post-action share-btn" type="button">
            <i class="fa-solid fa-arrow-up-from-bracket"></i>
          </button>
          <button class="post-action save-btn ${saved ? "saved" : ""}" type="button">
            <i class="fa-${saved ? "solid" : "regular"} fa-bookmark"></i>
          </button>
        </div>
      </footer>
    `;

    const likeBtn = article.querySelector(".like-btn");
    const commentBtn = article.querySelector(".comment-btn");
    const shareBtn = article.querySelector(".share-btn");
    const saveBtn = article.querySelector(".save-btn");
    const userEl = article.querySelector(".post-user");

    if (likeBtn) {
      likeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleLike(post, likeBtn);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleSave(post, saveBtn);
      });
    }

    if (commentBtn) {
      commentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // scroll down to comments
        if (this.commentsSection) {
          this.commentsSection.scrollIntoView({ behavior: "smooth" });
          if (this.commentInput) this.commentInput.focus();
        }
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleSharePostClick(post);
      });
    }

    if (userEl) {
      userEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const uname = userEl.dataset.username;
        const me =
          typeof getCurrentUser === "function" ? getCurrentUser() : null;

        if (me && me.username === uname) {
          window.location.href = "profile.html";
        } else {
          window.location.href = `user.html?user=${encodeURIComponent(uname)}`;
        }
      });
    }

    return article;
  }

  renderMediaHtml(url, type) {
    const lower = (url || "").toLowerCase();
    const isVideo =
      (type && (String(type).startsWith("video/") || type === "video")) ||
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
        <a href="${url}" target="_blank" rel="noopener noreferrer">
          <img src="${url}" loading="lazy">
        </a>
      </div>
    `;
  }

  // ========= LOAD COMMENTS =========

  async loadComments() {
    if (!this.commentsList) return;

    this.commentsList.innerHTML = "";
    if (this.commentsLoading) this.commentsLoading.classList.remove("hidden");

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${encodeURIComponent(this.postId)}/comments`
      );

      if (!res.ok) {
        const txt = await res.text();
        console.error("loadComments error:", res.status, txt);
        this.hideCommentsLoading();
        return;
      }

      const data = await res.json();
      this.comments = data || [];
      this.renderComments();
    } catch (err) {
      console.error("loadComments exception:", err);
    } finally {
      this.hideCommentsLoading();
    }
  }

  renderComments() {
    if (!this.commentsList) return;

    if (!this.comments || !this.comments.length) {
      this.commentsList.innerHTML = "";
      if (this.commentsEmpty) this.commentsEmpty.classList.remove("hidden");
      return;
    }

    if (this.commentsEmpty) this.commentsEmpty.classList.add("hidden");

    this.commentsList.innerHTML = this.comments
      .map((c) => {
        const user = c.user || {};
        const avatar =
          user.avatar_url || "default-profile.PNG";
        const username = user.username || "unknown";
        const displayName = user.display_name || username;
        const time = c.created_at ? this.formatTime(c.created_at) : "";

        return `
          <article class="comment">
            <img class="comment-avatar"
                 src="${avatar}"
                 onerror="this.src='default-profile.PNG'">
            <div class="comment-body">
              <div class="comment-header">
                <span class="comment-display-name">${this.escape(
                  displayName
                )}</span>
                <span class="comment-username">@${this.escape(
                  username
                )}</span>
                <span class="comment-time">${this.escape(time)}</span>
              </div>
              <div class="comment-text">${this.formatContent(
                c.content || ""
              )}</div>
            </div>
          </article>
        `;
      })
      .join("");

    // click on comment avatar/name -> profile
    this.commentsList
      .querySelectorAll(".comment-avatar, .comment-display-name, .comment-username")
      .forEach((el) => {
        el.addEventListener("click", (e) => {
          const article = e.target.closest(".comment");
          if (!article) return;
          const idx = Array.from(this.commentsList.children).indexOf(article);
          const comment = this.comments[idx];
          if (!comment || !comment.user) return;
          const uname = comment.user.username;
          if (!uname) return;

          const me =
            typeof getCurrentUser === "function" ? getCurrentUser() : null;
          if (me && me.username === uname) {
            window.location.href = "profile.html";
          } else {
            window.location.href = `user.html?user=${encodeURIComponent(
              uname
            )}`;
          }
        });
      });
  }

  // ========= COMMENT SUBMIT =========

  async handleCommentSubmit(e) {
    e.preventDefault();
    if (!this.commentInput || !this.commentSubmitBtn) return;

    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    if (!token) {
      alert("Please log in to comment.");
      return;
    }

    const content = this.commentInput.value.trim();
    if (!content) return;
    if (content.length > this.maxCommentChars) {
      alert(`Comment must be ${this.maxCommentChars} characters or less.`);
      return;
    }

    this.commentSubmitBtn.disabled = true;
    this.commentSubmitBtn.textContent = "Posting...";

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${encodeURIComponent(this.postId)}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to post comment");
      }

      // add new comment and re-render
      this.comments.push(data);
      this.renderComments();

      // clear input
      this.commentInput.value = "";
      if (this.commentCharCounter)
        this.commentCharCounter.textContent = `0/${this.maxCommentChars}`;

      // bump comment count on header card
      const card = this.postContainer?.querySelector(".post");
      const countEl = card?.querySelector(".comment-count");
      if (countEl) {
        let current = parseInt(countEl.textContent || "0", 10);
        if (Number.isNaN(current)) current = 0;
        countEl.textContent = String(current + 1);
      }
    } catch (err) {
      console.error("handleCommentSubmit error:", err);
      alert(err.message || "Could not post comment.");
    } finally {
      this.commentSubmitBtn.disabled = false;
      this.commentSubmitBtn.textContent = "Comment";
    }
  }

  // ========= LIKE / SAVE / SHARE =========

  async handleLike(post, btn) {
    if (!post || !post.id || !btn) return;

    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    if (!token) {
      alert("Please log in to like posts.");
      return;
    }

    const countEl = btn.querySelector(".like-count");
    const icon = btn.querySelector("i");

    let currentCount = parseInt(countEl?.textContent || "0", 10);
    if (Number.isNaN(currentCount)) currentCount = 0;

    const wasLiked =
      btn.classList.contains("liked") || post.liked_by_me === true;

    // optimistic
    let newCount = currentCount + (wasLiked ? -1 : 1);
    if (newCount < 0) newCount = 0;

    btn.classList.toggle("liked", !wasLiked);
    if (icon) {
      icon.classList.remove(wasLiked ? "fa-solid" : "fa-regular");
      icon.classList.add(wasLiked ? "fa-regular" : "fa-solid");
    }
    if (countEl) countEl.textContent = String(newCount);

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/like`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update like");

      const serverLikes =
        typeof data.likes === "number" ? data.likes : null;
      const nowLiked = data.liked === true ? true : !wasLiked;

      if (serverLikes !== null && countEl) {
        countEl.textContent = String(serverLikes);
      }

      this.post = {
        ...this.post,
        liked_by_me: nowLiked,
        likes: serverLikes !== null ? serverLikes : newCount,
      };
    } catch (err) {
      console.error("handleLike error:", err);
      // revert
      btn.classList.toggle("liked", wasLiked);
      if (icon) {
        icon.classList.remove(wasLiked ? "fa-regular" : "fa-solid");
        icon.classList.add(wasLiked ? "fa-solid" : "fa-regular");
      }
      if (countEl) countEl.textContent = String(currentCount);
      alert(err.message || "Could not update like.");
    }
  }

  async handleSave(post, btn) {
    if (!post || !post.id || !btn) return;

    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    if (!token) {
      alert("Please log in to save posts.");
      return;
    }

    const icon = btn.querySelector("i");
    const wasSaved =
      btn.classList.contains("saved") || post.saved_by_me === true;

    // optimistic
    btn.classList.toggle("saved", !wasSaved);
    if (icon) {
      icon.classList.remove(wasSaved ? "fa-solid" : "fa-regular");
      icon.classList.add(wasSaved ? "fa-regular" : "fa-solid");
    }

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/save`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update save");

      const nowSaved = data.saved === true ? true : !wasSaved;
      this.post = {
        ...this.post,
        saved_by_me: nowSaved,
      };
    } catch (err) {
      console.error("handleSave error:", err);
      // revert
      btn.classList.toggle("saved", wasSaved);
      if (icon) {
        icon.classList.remove(wasSaved ? "fa-regular" : "fa-solid");
        icon.classList.add(wasSaved ? "fa-solid" : "fa-regular");
      }
      alert(err.message || "Could not update save.");
    }
  }

  handleSharePostClick(post) {
    if (!post || !post.id) return;

    const url = `${window.location.origin}/post.html?id=${encodeURIComponent(
      post.id
    )}`;

    if (navigator.share) {
      navigator
        .share({
          title: "Check out this post",
          url,
        })
        .catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => alert("Post link copied to clipboard"))
        .catch(() => alert("Post link: " + url));
    } else {
      alert("Post link: " + url);
    }
  }

  // ========= HELPERS =========

  formatContent(text) {
    const safe = this.escape(text || "");
    return safe
      .replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
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

  escape(str = "") {
    return String(str).replace(/[&<>"']/g, (m) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[m];
    });
  }
}

// ========= INIT =========

document.addEventListener("DOMContentLoaded", () => {
  const page = new PostPage();
  page.init();
  window.postPage = page;
});
