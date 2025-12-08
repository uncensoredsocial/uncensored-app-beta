// ============================================
// feed.js — Ultra-robust front-end for feed
// With image & video upload + limits
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
    this.currentMode = "recent"; // "recent" | "following"
    this.hasMore = true;
    this.page = 1;
    this.pageSize = 20;

    // Character limit
    this.maxChars = 280;

    // Media
    this.selectedMediaFile = null;
    this.selectedMediaPreviewUrl = null;

    // Media limits
    this.maxImageSizeMB = 5; // ~5 MB
    this.maxVideoSizeMB = 50; // ~50 MB
    this.maxVideoDurationSeconds = 10 * 60; // 10 minutes
  }

  async init() {
    this.cacheDom();
    this.setupTabsLabel(); // turn "Popular" into "Following"
    this.bindEvents();
    this.updateAuthUI();
    this.updateCharCounter();
    await this.loadPosts(true);
  }

  // ============================================
  // DOM CACHE (very forgiving)
  // ============================================

  cacheDom() {
    this.feedContainer = document.getElementById("feedContainer");

    // Try a bunch of options for the textarea
    this.postInput =
      document.getElementById("postInput") ||
      document.getElementById("postText") ||
      document.querySelector("[data-role='post-input']") ||
      document.querySelector("#postCreation textarea") ||
      document.querySelector("textarea");

    // Try a bunch of options for the Post button
    this.postButton =
      document.getElementById("postButton") ||
      document.getElementById("submitPostBtn") ||
      document.querySelector("[data-role='post-button']") ||
      (Array.from(document.getElementsByTagName("button")) || []).find(
        (b) => b.textContent.trim().toLowerCase() === "post"
      );

    // Try a bunch of options for the char counter
    this.charCounter =
      document.getElementById("charCounter") ||
      document.getElementById("postCharCounter") ||
      document.querySelector("[data-role='char-counter']") ||
      document.querySelector(".char-counter") ||
      (Array.from(document.querySelectorAll("span,div")) || []).find((el) =>
        /\/280$/.test(el.textContent.trim())
      );

    this.postCreation = document.getElementById("postCreation");
    this.guestMessage = document.getElementById("guestMessage");
    this.postUserAvatar = document.getElementById("postUserAvatar");

    // Media picker
    this.postMediaInput = document.getElementById("postMediaInput");
    this.addMediaBtn = document.getElementById("addMediaBtn");
    this.mediaFileName = document.getElementById("mediaFileName");

    // Tabs wrapper
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

  // change the Popular tab to Following
  setupTabsLabel() {
    if (!this.feedTabs) return;

    const popularBtn = this.feedTabs.querySelector("[data-tab='popular']");
    if (popularBtn) {
      popularBtn.dataset.tab = "following";
      popularBtn.textContent = "Following";
    }
    // refresh the NodeList now that we might have changed data-tab
    this.tabButtons = this.feedTabs.querySelectorAll(".feed-tab-btn");
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
      this.postMediaInput.addEventListener("change", async () => {
        const file = this.postMediaInput.files[0] || null;

        if (file) {
          const ok = await this.validateMediaFile(file);
          if (!ok) {
            // reset input if invalid
            this.postMediaInput.value = "";
            this.selectedMediaFile = null;
            if (this.mediaFileName) this.mediaFileName.textContent = "";
            this.updateCharCounter();
            return;
          }

          this.selectedMediaFile = file;
          if (this.mediaFileName) {
            this.mediaFileName.textContent = file.name;
          }
        } else {
          this.selectedMediaFile = null;
          if (this.mediaFileName) this.mediaFileName.textContent = "";
        }

        this.updateCharCounter();
      });
    }

    // Tabs
    if (this.tabButtons.length > 0) {
      this.tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.tab; // "recent" or "following"
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

    // Enable as soon as there's text or media; backend still enforces auth
    const canPost = length > 0 || this.selectedMediaFile;
    if (this.postButton) this.postButton.disabled = !canPost;
  }

  // ============================================
  // TABS
  // ============================================

  switchMode(mode) {
    this.currentMode = mode; // "recent" or "following"
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
      // backend currently ignores these but it's fine to send
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

    // New backend flags: liked_by_me / saved_by_me
    const liked =
      post.liked_by_me === true ||
      post.is_liked === true ||
      post.isLiked === true;
    const saved =
      post.saved_by_me === true ||
      post.is_saved === true ||
      post.isSaved === true;

    // Like count – prefer numeric `likes` from backend
    let likeCount = 0;
    if (typeof post.likes === "number") {
      likeCount = post.likes;
    } else if (typeof post.like_count === "number") {
      likeCount = post.like_count;
    } else if (Array.isArray(post.likes)) {
      likeCount = post.likes.length;
    }

    // Comment count – new field `comments_count`
    let commentCount = 0;
    if (typeof post.comments_count === "number") {
      commentCount = post.comments_count;
    } else if (typeof post.comment_count === "number") {
      commentCount = post.comment_count;
    } else if (Array.isArray(post.comments)) {
      commentCount = post.comments.length;
    } else if (typeof post.comments === "number") {
      commentCount = post.comments;
    }

    const mediaUrl =
      post.media_url || post.media || post.image_url || post.video_url || null;
    const mediaType = post.media_type || "";

    const mediaHtml = mediaUrl ? this.renderMediaHtml(mediaUrl, mediaType) : "";

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
          ${mediaHtml}
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
                    style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center%;">
              <i class="fa-${saved ? "solid" : "regular"} fa-bookmark"></i>
            </button>
          </div>
        </footer>
      </article>
    `;
  }

  renderMediaHtml(url, type) {
    const lower = (url || "").toLowerCase();
    const lowerType = (type || "").toLowerCase();

    const isVideo =
      (lowerType && (lowerType.startsWith("video/") || lowerType === "video")) ||
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".ogg");

    if (isVideo) {
      // video: playable inside the post
      return `
        <div class="post-media">
          <video controls playsinline preload="metadata">
            <source src="${url}">
            Your browser does not support video.
          </video>
        </div>
      `;
    }

    // image: clickable to open full size in new tab
    return `
      <div class="post-media">
        <a href="${url}" target="_blank" rel="noopener noreferrer">
          <img src="${url}" loading="lazy">
        </a>
      </div>
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
  // CREATE POST (media upload via /posts/upload-media)
  // ============================================

  async handleCreatePost() {
    const user = this.getCurrentUser();
    if (!user) {
      this.showToast("Please log in to post.", "error");
      // still let backend enforce; we just show message
    }

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
      // still attempt; backend may block
    }

    this.isPosting = true;
    if (this.postButton) this.postButton.disabled = true;

    try {
      let mediaUrl = null;
      let mediaType = null;

      if (hasMedia) {
        console.log("[Feed] Uploading media file:", this.selectedMediaFile);
        const uploadResult = await this.uploadMediaFile(this.selectedMediaFile);
        if (!uploadResult || !uploadResult.url) {
          throw new Error("Media upload failed");
        }
        mediaUrl = uploadResult.url;
        mediaType =
          uploadResult.media_type ||
          this.selectedMediaFile.type ||
          "image"; // fallback
      }

      const endpoint = `${FEED_API_BASE_URL}/posts`;
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const payload = {
        content,
        media_url: mediaUrl,
        media_type: mediaType,
      };

      console.log("[Feed] Creating post with payload:", payload);

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[Feed] Create post error status:", res.status, data);
        throw new Error(data.error || "Could not create post.");
      }

      // Prepend new post to the feed
      // Backend returns shaped post with `user`, `media_url`, `media_type`, etc.
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
  // MEDIA HELPERS (upload + validation)
  // ============================================

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const base64 = String(result).split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async uploadMediaFile(file) {
    try {
      const base64 = await this.fileToBase64(file);
      const token = this.getAuthToken();

      const headers = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // IMPORTANT: backend expects mediaData + mediaType (we send both)
      const body = {
        mediaData: base64,
        mediaType: file.type || "application/octet-stream",
      };

      console.log("[Feed] /posts/upload-media payload:", {
        size: base64.length,
        mediaType: body.mediaType,
      });

      const res = await fetch(`${FEED_API_BASE_URL}/posts/upload-media`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Media upload failed:", res.status, text);
        this.showToast("Failed to upload media.", "error");
        return null;
      }

      const json = await res.json().catch(() => ({}));
      console.log("[Feed] Media upload success:", json);
      // { url, media_type }
      return json;
    } catch (err) {
      console.error("uploadMediaFile error:", err);
      this.showToast("Failed to upload media.", "error");
      return null;
    }
  }

  async validateMediaFile(file) {
    const sizeMB = file.size / (1024 * 1024);
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      this.showToast("Only images and videos are allowed.", "error");
      return false;
    }

    if (isImage && sizeMB > this.maxImageSizeMB) {
      this.showToast(
        `Image is too large (max ${this.maxImageSizeMB} MB).`,
        "error"
      );
      return false;
    }

    if (isVideo && sizeMB > this.maxVideoSizeMB) {
      this.showToast(
        `Video is too large (max ${this.maxVideoSizeMB} MB).`,
        "error"
      );
      return false;
    }

    if (isVideo) {
      // Check duration using a temporary video element
      const url = URL.createObjectURL(file);
      const durationOk = await new Promise((resolve) => {
        const vid = document.createElement("video");
        vid.preload = "metadata";
        vid.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          const duration = vid.duration || 0;
          if (duration > this.maxVideoDurationSeconds) {
            this.showToast(
              "Video is longer than 10 minutes. Please upload a shorter clip.",
              "error"
            );
            resolve(false);
          } else {
            resolve(true);
          }
        };
        vid.onerror = () => {
          URL.revokeObjectURL(url);
          this.showToast("Could not read video metadata.", "error");
          resolve(false);
        };
        vid.src = url;
      });

      if (!durationOk) return false;
    }

    return true;
  }

  // ============================================
  // LIKE / SAVE (keeps local state in sync)
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
    countEl.textContent = String(Math.max(newCount, 0));

    try {
      const res = await fetch(`${FEED_API_BASE_URL}/posts/${postId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to update like");

      // If backend returns a number, trust it
      const serverLikes =
        typeof data.likes === "number"
          ? data.likes
          : typeof data.like_count === "number"
          ? data.like_count
          : null;

      if (serverLikes !== null) {
        countEl.textContent = String(serverLikes);
      }

      // Update local posts array for consistency
      const post = this.posts.find((p) => p.id === postId);
      if (post) {
        const nowLiked = data.liked === true ? true : !wasLiked;
        post.liked_by_me = nowLiked;
        post.is_liked = nowLiked;
        if (serverLikes !== null) {
          post.likes = serverLikes;
          post.like_count = serverLikes;
        }
      }
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
      const res = await fetch(`${FEED_API_BASE_URL}/posts/${postId}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update save");

      const post = this.posts.find((p) => p.id === postId);
      if (post) {
        const nowSaved = data.saved === true ? true : !wasSaved;
        post.saved_by_me = nowSaved;
        post.is_saved = nowSaved;
      }
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
