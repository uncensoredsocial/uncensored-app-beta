// js/profile.js

const PROFILE_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class ProfilePage {
  constructor() {
    this.user = null;
    this.posts = [];
    this.likedPosts = [];
    this.likesLoaded = false;
    this.likesContainer = null;
  }

  async init() {
    // Require login
    if (!window.isLoggedIn || !isLoggedIn()) {
      window.location.href = "signup.html";
      return;
    }

    this.cacheDom();
    this.bindEvents();

    // Use local user first for instant UI
    const localUser = window.getCurrentUser ? getCurrentUser() : null;
    if (localUser) {
      this.setUser(localUser);
    }

    // Refresh from backend
    await this.fetchCurrentUser();
    await this.fetchUserPosts();
    // Likes are lazy-loaded when Likes tab is opened
  }

  cacheDom() {
    this.displayNameEl = document.getElementById("profileDisplayName");
    this.usernameEl = document.getElementById("profileUsername");
    this.bioEl = document.getElementById("profileBio");
    this.joinEl = document.getElementById("profileJoinDate");
    this.avatarEl = document.getElementById("profileAvatar");
    this.bannerEl = document.getElementById("profileBanner");

    this.postsCountEl = document.getElementById("postsCount");
    this.followersCountEl = document.getElementById("followersCount");
    this.followingCountEl = document.getElementById("followingCount");

    this.postsContainer = document.getElementById("profilePosts");

    this.settingsButton = document.getElementById("settingsButton");
    this.editProfileBtn = document.getElementById("editProfileBtn");

    // Modal
    this.editModal = document.getElementById("editProfileModal");
    this.editForm = document.getElementById("editProfileForm");
    this.editDisplayNameInput = document.getElementById("editDisplayName");
    this.editBioInput = document.getElementById("editBio");
    this.bioCharCounter = document.getElementById("bioCharCounter");
    this.avatarFileInput = document.getElementById("editAvatarFile");
    this.bannerFileInput = document.getElementById("editBannerFile");
    this.editErrorEl = document.getElementById("editProfileError");
    this.editSuccessEl = document.getElementById("editProfileSuccess");
    this.closeEditBtn = document.getElementById("closeEditProfileBtn");
    this.cancelEditBtn = document.getElementById("cancelEditProfileBtn");
    this.saveProfileBtn = document.getElementById("saveProfileBtn");

    // Tabs
    this.tabButtons = document.querySelectorAll(".tab-btn");
    this.postsTabPane = document.getElementById("postsTab");
    this.likesTabPane = document.getElementById("likesTab");
  }

  bindEvents() {
    if (this.settingsButton) {
      this.settingsButton.addEventListener("click", () => {
        window.location.href = "settings.html";
      });
    }

    if (this.editProfileBtn) {
      this.editProfileBtn.addEventListener("click", () => this.openEditModal());
    }

    if (this.closeEditBtn) {
      this.closeEditBtn.addEventListener("click", () => this.closeEditModal());
    }
    if (this.cancelEditBtn) {
      this.cancelEditBtn.addEventListener("click", () => this.closeEditModal());
    }

    if (this.editForm) {
      this.editForm.addEventListener("submit", (e) => this.handleEditSubmit(e));
    }

    if (this.editBioInput && this.bioCharCounter) {
      this.editBioInput.addEventListener("input", () => {
        const len = this.editBioInput.value.length;
        this.bioCharCounter.textContent = `${len}/160`;
        this.bioCharCounter.classList.toggle(
          "warning",
          len > 140 && len <= 160
        );
        this.bioCharCounter.classList.toggle("error", len > 160);
      });
    }

    // Tabs
    this.tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
    });

    // Close modal on backdrop click
    if (this.editModal) {
      this.editModal.addEventListener("click", (e) => {
        if (e.target === this.editModal) {
          this.closeEditModal();
        }
      });
    }
  }

  /* ---------------- Fetch current user ---------------- */

  async fetchCurrentUser() {
    try {
      const token = typeof getAuthToken === "function" ? getAuthToken() : null;
      if (!token) return;

      const res = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const msg = await res.text();
        console.warn("auth/me failed:", res.status, msg);
        return;
      }

      const user = await res.json();
      this.setUser(user);

      if (window.setCurrentUser) {
        setCurrentUser(user);
      }
    } catch (err) {
      console.warn("fetchCurrentUser error:", err);
    }
  }

  /* ---------------- Fetch user posts (own posts tab) ---------------- */

  async fetchUserPosts() {
    if (!this.user || !this.user.username || !this.postsContainer) return;

    this.postsContainer.innerHTML = `
      <div class="loading-indicator">Loading posts...</div>
    `;

    try {
      const res = await fetch(
        `${PROFILE_API_BASE_URL}/users/${encodeURIComponent(
          this.user.username
        )}/posts`
      );
      if (!res.ok) throw new Error("Failed to load posts");

      const posts = await res.json();

      // Sort newest -> oldest
      this.posts = (posts || []).slice().sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at) : 0;
        const bDate = b.created_at ? new Date(b.created_at) : 0;
        return bDate - aDate;
      });

      if (this.postsCountEl) {
        this.postsCountEl.textContent = this.posts.length.toString();
      }

      if (!this.posts.length) {
        this.postsContainer.innerHTML = `
          <div class="empty-state">
            <h3>No posts yet</h3>
          </div>
        `;
        return;
      }

      this.renderPosts();
    } catch (err) {
      console.error("fetchUserPosts error:", err);
      this.postsContainer.innerHTML = `
        <div class="empty-state">
          <h3>Error loading posts</h3>
        </div>
      `;
    }
  }

  /* ---------------- Fetch user liked posts (Likes tab) ---------------- */

  ensureLikesContainer() {
    if (!this.likesTabPane) return;
    if (this.likesContainer) return;

    let container = this.likesTabPane.querySelector(".profile-posts");
    if (!container) {
      container = document.createElement("div");
      container.id = "profileLikes";
      container.className = "profile-posts";
      this.likesTabPane.innerHTML = "";
      this.likesTabPane.appendChild(container);
    }

    this.likesContainer = container;
  }

  async fetchUserLikedPosts() {
    if (!this.user || !this.user.username || !this.likesTabPane) return;

    this.ensureLikesContainer();
    if (!this.likesContainer) return;

    this.likesContainer.innerHTML = `
      <div class="loading-indicator">Loading likes...</div>
    `;

    try {
      const res = await fetch(
        `${PROFILE_API_BASE_URL}/users/${encodeURIComponent(
          this.user.username
        )}/likes`
      );
      if (!res.ok) throw new Error("Failed to load liked posts");

      const liked = await res.json();

      // Sort newest -> oldest
      this.likedPosts = (liked || []).slice().sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at) : 0;
        const bDate = b.created_at ? new Date(b.created_at) : 0;
        return bDate - aDate;
      });

      this.likesLoaded = true;

      if (!this.likedPosts.length) {
        this.likesContainer.innerHTML = `
          <div class="empty-state">
            <h3>No liked posts yet</h3>
          </div>
        `;
        return;
      }

      this.renderLikedPosts();
    } catch (err) {
      console.error("fetchUserLikedPosts error:", err);
      this.likesContainer.innerHTML = `
        <div class="empty-state">
          <h3>Error loading liked posts</h3>
        </div>
      `;
    }
  }

  /* ---------------- RENDER POSTS (feed-style) ---------------- */

  renderPosts() {
    if (!this.postsContainer) return;
    this.postsContainer.innerHTML = "";

    this.posts.forEach((post) => {
      const el = this.createPostElement(post, { fromLikesTab: false });
      this.postsContainer.appendChild(el);
    });
  }

  renderLikedPosts() {
    if (!this.likesContainer) return;
    this.likesContainer.innerHTML = "";

    this.likedPosts.forEach((post) => {
      const el = this.createPostElement(post, { fromLikesTab: true });
      this.likesContainer.appendChild(el);
    });
  }

  /**
   * Shared renderer for:
   *  - own Posts tab
   *  - Likes tab
   *
   * Layout + icons intentionally match feed.js
   * Only difference: red trash icon on your own posts in Posts tab.
   */
  createPostElement(post, options = {}) {
    const { fromLikesTab = false } = options;

    const article = document.createElement("article");
    article.className = "post";
    article.dataset.postId = post.id;
    article.tabIndex = 0;

    // Prefer real author data from API if present
    const author = post.user || post.author || this.user || {};
    const avatar = author.avatar_url || "default-profile.png";
    const username = author.username || "unknown";
    const displayName = author.display_name || username;

    const createdAt = post.created_at;
    const time = createdAt ? this.formatTime(createdAt) : "";

    // is this my own post?
    const isOwnPost =
      this.user && (post.user_id === this.user.id || author.id === this.user.id);

    // like / save flags same as feed.js
    const liked =
      post.liked_by_me === true ||
      post.is_liked === true ||
      post.isLiked === true;
    const saved =
      post.saved_by_me === true ||
      post.is_saved === true ||
      post.isSaved === true;

    // like count
    let likeCount = 0;
    if (typeof post.likes === "number") {
      likeCount = post.likes;
    } else if (typeof post.like_count === "number") {
      likeCount = post.like_count;
    } else if (Array.isArray(post.likes)) {
      likeCount = post.likes.length;
    }

    // comment count
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

    // media (image / video)
    const mediaUrl =
      post.media_url || post.media || post.image_url || post.video_url || null;
    const mediaType = post.media_type || "";
    const mediaHtml = mediaUrl ? this.renderMediaHtml(mediaUrl, mediaType) : "";

    article.innerHTML = `
      <header class="post-header">
        <div class="post-user" data-username="${this.escapeHtml(username)}">
          <img class="post-avatar" src="${avatar}" onerror="this.src='default-profile.png'">
          <div class="post-user-meta">
            <span class="post-display-name">${this.escapeHtml(displayName)}</span>
            <span class="post-username">@${this.escapeHtml(username)}</span>
          </div>
        </div>
        <span class="post-time">${this.escapeHtml(time)}</span>
        ${
          isOwnPost && !fromLikesTab
            ? `<button class="post-delete-btn" type="button" aria-label="Delete post">
                 <i class="fa-solid fa-trash"></i>
               </button>`
            : ""
        }
      </header>

      <div class="post-body">
        <div class="post-text">${this.formatContent(post.content || "")}</div>
        ${mediaHtml}
      </div>

      <footer class="post-footer">
        <div class="post-actions"
             style="display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;">
          <button class="post-action like-btn ${liked ? "liked" : ""}"
                  type="button"
                  style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center;">
            <i class="fa-${liked ? "solid" : "regular"} fa-heart"></i>
            <span class="like-count">${likeCount}</span>
          </button>

          <button class="post-action comment-btn"
                  type="button"
                  style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center;">
            <i class="fa-regular fa-comment"></i>
            <span class="comment-count">${commentCount}</span>
          </button>

          <button class="post-action share-btn"
                  type="button"
                  style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center;">
            <i class="fa-solid fa-arrow-up-from-bracket"></i>
          </button>

          <button class="post-action save-btn ${saved ? "saved" : ""}"
                  type="button"
                  style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center;">
            <i class="fa-${saved ? "solid" : "regular"} fa-bookmark"></i>
          </button>
        </div>
      </footer>
    `;

    // --- Event hooks (same behaviour as feed.js) ---

    const likeBtn = article.querySelector(".like-btn");
    const commentBtn = article.querySelector(".comment-btn");
    const shareBtn = article.querySelector(".share-btn");
    const saveBtn = article.querySelector(".save-btn");
    const deleteBtn = article.querySelector(".post-delete-btn");
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
        this.goToPost(post);
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleSharePostClick(post);
      });
    }

    if (deleteBtn && isOwnPost && !fromLikesTab) {
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.confirmDeletePost(post, article);
      });
    }

    if (userEl) {
      userEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const uname = userEl.dataset.username;
        if (this.user && this.user.username === uname) {
          window.location.href = "profile.html";
        } else {
          window.location.href = `user.html?user=${encodeURIComponent(uname)}`;
        }
      });
    }

    // Whole card -> post.html (but ignore buttons/links)
    article.addEventListener("click", (e) => {
      const target = e.target;
      if (
        target.closest(".post-actions") ||
        target.closest(".post-delete-btn") ||
        target.closest(".post-user") ||
        target.tagName === "A"
      ) {
        return;
      }
      this.goToPost(post);
    });

    return article;
  }

  renderMediaHtml(url, type) {
    const lower = url.toLowerCase();
    const isVideo =
      (type && (type.startsWith("video/") || type === "video")) ||
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

  goToPost(post) {
    if (!post || !post.id) return;
    window.location.href = `post.html?id=${encodeURIComponent(post.id)}`;
  }

  async confirmDeletePost(post, articleEl) {
    if (!post || !post.id) return;

    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    if (!token) {
      alert("You must be logged in to delete posts.");
      return;
    }

    const ok = window.confirm("Delete this post? This can’t be undone.");
    if (!ok) return;

    try {
      const res = await fetch(
        `${PROFILE_API_BASE_URL}/posts/${encodeURIComponent(post.id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!res.ok) {
        // Try JSON, then text
        let msg = "Failed to delete post";
        try {
          const data = await res.json();
          if (data && data.error) msg = data.error;
        } catch {
          const text = await res.text().catch(() => "");
          if (text) msg = text;
        }
        throw new Error(msg);
      }

      // remove from local arrays and UI
      this.posts = this.posts.filter((p) => p.id !== post.id);
      this.likedPosts = this.likedPosts.filter((p) => p.id !== post.id);

      if (articleEl && articleEl.parentElement) {
        articleEl.parentElement.removeChild(articleEl);
      }

      if (this.postsCountEl) {
        this.postsCountEl.textContent = String(this.posts.length);
      }

      if (!this.posts.length && this.postsContainer) {
        this.postsContainer.innerHTML = `
          <div class="empty-state">
            <h3>No posts yet</h3>
          </div>
        `;
      }
    } catch (err) {
      console.error("confirmDeletePost error:", err);
      alert(err.message || "Could not delete post.");
    }
  }

  /* ---------------- Like / Save / Share handlers ---------------- */

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
      btn.classList.contains("liked") ||
      post.liked_by_me === true ||
      post.is_liked === true;

    // optimistic UI
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
        `${PROFILE_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/like`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update like");

      // trust server count if provided
      const serverLikes =
        typeof data.likes === "number"
          ? data.likes
          : typeof data.like_count === "number"
          ? data.like_count
          : null;

      const nowLiked = data.liked === true ? true : !wasLiked;

      if (serverLikes !== null && countEl) {
        countEl.textContent = String(serverLikes);
      }

      this.updateLocalPostState(post.id, {
        liked_by_me: nowLiked,
        is_liked: nowLiked,
        likes:
          serverLikes !== null
            ? serverLikes
            : newCount,
        like_count:
          serverLikes !== null
            ? serverLikes
            : newCount
      });
    } catch (err) {
      console.error("handleLike error:", err);

      // revert UI
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
      btn.classList.contains("saved") ||
      post.saved_by_me === true ||
      post.is_saved === true;

    // optimistic UI
    btn.classList.toggle("saved", !wasSaved);
    if (icon) {
      icon.classList.remove(wasSaved ? "fa-solid" : "fa-regular");
      icon.classList.add(wasSaved ? "fa-regular" : "fa-solid");
    }

    try {
      const res = await fetch(
        `${PROFILE_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/save`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update save");

      const nowSaved = data.saved === true ? true : !wasSaved;

      this.updateLocalPostState(post.id, {
        saved_by_me: nowSaved,
        is_saved: nowSaved
      });
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
          url
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

  /* ---------------- Helpers ---------------- */

  updateLocalPostState(postId, changes) {
    const apply = (arr) => {
      const idx = arr.findIndex((p) => p.id === postId);
      if (idx !== -1) {
        arr[idx] = { ...arr[idx], ...changes };
      }
    };
    apply(this.posts);
    apply(this.likedPosts);
  }

  formatContent(text) {
    const safe = this.escapeHtml(text || "");

    return safe
      .replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  }

  setUser(user) {
    this.user = user || this.user || {};

    const displayName = this.user.display_name || this.user.username || "User";
    const username = this.user.username || "username";
    const bio = this.user.bio || "No bio yet.";
    const createdAt = this.user.created_at;

    if (this.displayNameEl) this.displayNameEl.textContent = displayName;
    if (this.usernameEl) this.usernameEl.textContent = `@${username}`;
    if (this.bioEl) this.bioEl.textContent = bio;
    if (this.joinEl) this.joinEl.textContent = this.formatJoinDate(createdAt);

    if (this.avatarEl) {
      this.avatarEl.src = this.user.avatar_url || "default-profile.png";
      this.avatarEl.onerror = () => {
        this.avatarEl.src = "default-profile.png";
      };
    }

    if (this.bannerEl) {
      if (this.user.banner_url) {
        this.bannerEl.style.backgroundImage = `url("${this.user.banner_url}")`;
        this.bannerEl.classList.add("profile-banner-image");
      } else {
        this.bannerEl.style.backgroundImage = "";
        this.bannerEl.classList.remove("profile-banner-image");
      }
    }

    if (this.postsCountEl) {
      this.postsCountEl.textContent = (this.user.posts_count || 0).toString();
    }
    if (this.followersCountEl) {
      this.followersCountEl.textContent = (
        this.user.followers_count || 0
      ).toString();
    }
    if (this.followingCountEl) {
      this.followingCountEl.textContent = (
        this.user.following_count || 0
      ).toString();
    }
  }

  openEditModal() {
    if (!this.editModal || !this.user) return;

    this.editDisplayNameInput.value = this.user.display_name || "";
    this.editBioInput.value = this.user.bio || "";

    if (this.avatarFileInput) this.avatarFileInput.value = "";
    if (this.bannerFileInput) this.bannerFileInput.value = "";

    this.editErrorEl.classList.add("hidden");
    this.editSuccessEl.classList.add("hidden");

    if (this.bioCharCounter) {
      const len = this.editBioInput.value.length;
      this.bioCharCounter.textContent = `${len}/160`;
    }

    this.editModal.classList.add("open");
  }

  closeEditModal() {
    if (!this.editModal) return;
    this.editModal.classList.remove("open");
  }

  async handleEditSubmit(e) {
    e.preventDefault();
    if (!this.editForm) return;

    const display_name = this.editDisplayNameInput.value.trim();
    const bio = this.editBioInput.value.trim();

    this.editErrorEl.classList.add("hidden");
    this.editSuccessEl.classList.add("hidden");

    if (this.saveProfileBtn) {
      this.saveProfileBtn.disabled = true;
      this.saveProfileBtn.textContent = "Saving...";
    }

    try {
      let avatar_url = this.user.avatar_url || null;
      let banner_url = this.user.banner_url || null;

      if (this.avatarFileInput && this.avatarFileInput.files[0]) {
        avatar_url = await this.uploadImageFile(
          this.avatarFileInput.files[0],
          "avatar"
        );
      }

      if (this.bannerFileInput && this.bannerFileInput.files[0]) {
        banner_url = await this.uploadImageFile(
          this.bannerFileInput.files[0],
          "banner"
        );
      }

      const token = typeof getAuthToken === "function" ? getAuthToken() : null;
      if (!token) throw new Error("Missing auth token");

      const res = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          display_name,
          bio,
          avatar_url,
          banner_url
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      this.setUser(data);
      if (window.setCurrentUser) setCurrentUser(data);

      this.editSuccessEl.textContent = "Profile updated!";
      this.editSuccessEl.classList.remove("hidden");

      setTimeout(() => {
        this.closeEditModal();
      }, 700);
    } catch (err) {
      console.error("handleEditSubmit error:", err);
      this.editErrorEl.textContent =
        err.message || "Failed to update profile";
      this.editErrorEl.classList.remove("hidden");
    } finally {
      if (this.saveProfileBtn) {
        this.saveProfileBtn.disabled = false;
        this.saveProfileBtn.textContent = "Save";
      }
    }
  }

  async uploadImageFile(file, kind) {
    const base64 = await this.readFileAsBase64(file);

    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    if (!token) throw new Error("Missing auth token");

    const res = await fetch(`${PROFILE_API_BASE_URL}/profile/upload-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        imageData: base64,
        kind
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.url) {
      throw new Error(data.error || `Failed to upload ${kind} image`);
    }

    return data.url;
  }

  readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const commaIndex = result.indexOf(",");
        if (commaIndex === -1) return resolve(result);
        resolve(result.slice(commaIndex + 1));
      };
      reader.onerror = () =>
        reject(reader.error || new Error("File read error"));
      reader.readAsDataURL(file);
    });
  }

  switchTab(tabName) {
    this.tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    this.postsTabPane.classList.toggle("active", tabName === "posts");
    this.likesTabPane.classList.toggle("active", tabName === "likes");

    if (tabName === "likes" && !this.likesLoaded) {
      this.fetchUserLikedPosts();
    }
  }

  formatJoinDate(dateString) {
    if (!dateString) return "Joined —";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Joined —";

    const opts = { month: "long", year: "numeric" };
    return `Joined ${date.toLocaleDateString(undefined, opts)}`;
  }

  // same relative time logic as feed.js
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

  escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, (m) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[m];
    });
  }
}

/* ---------------- Init ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.classList.contains("profile-page-body")) {
    const page = new ProfilePage();
    page.init();
    window.profilePage = page;
  }
});
