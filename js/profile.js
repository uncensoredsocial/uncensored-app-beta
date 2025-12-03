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
    // Likes are lazy-loaded when the Likes tab is opened
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
      const res = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`
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
      // EXPECTED ENDPOINT: adjust on backend if needed
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
   *  - own Posts tab (with trash icon for own posts)
   *  - Likes tab (same styling, trash only if it's actually your post)
   */
  createPostElement(post, options = {}) {
    const { fromLikesTab = false } = options;

    const article = document.createElement("article");
    article.className = "post";
    article.dataset.postId = post.id;
    article.tabIndex = 0;

    // Prefer real author data from API if present
    const author = post.author || post.user || this.user || {};
    const avatar = author.avatar_url || "assets/icons/default-profile.png";
    const displayName = author.display_name || author.username || "User";
    const username = author.username || "user";

    const createdAt = post.created_at ? new Date(post.created_at) : null;
    const timeLabel = createdAt ? createdAt.toLocaleString() : "";

    const likeCount =
      typeof post.likes_count === "number"
        ? post.likes_count
        : Array.isArray(post.likes)
        ? post.likes.length
        : 0;

    const commentsCount =
      typeof post.comments_count === "number" ? post.comments_count : 0;

    const isOwnPost =
      this.user && (post.user_id === this.user.id || author.id === this.user.id);

    const isLikedByMe = !!post.liked_by_me;

    article.innerHTML = `
      <header class="post-header">
        <img
          src="${avatar}"
          alt="${this.escapeHtml(displayName)}"
          class="post-user-avatar"
          onerror="this.src='assets/icons/default-profile.png'"
        />
        <div class="post-user-info">
          <div class="post-display-name">${this.escapeHtml(displayName)}</div>
          <div class="post-username">@${this.escapeHtml(username)}</div>
        </div>
        ${
          timeLabel
            ? `<div class="post-time">${this.escapeHtml(timeLabel)}</div>`
            : ""
        }
        ${
          isOwnPost && !fromLikesTab
            ? `
        <button
          class="post-delete-btn"
          type="button"
          aria-label="Delete post"
        >
          <i class="fa-solid fa-trash"></i>
        </button>`
            : ""
        }
      </header>

      <div class="post-content">
        <p>${this.formatContent(post.content || "")}</p>
      </div>

      <footer class="post-footer">
        <div class="post-timestamp">
          ${timeLabel ? this.escapeHtml(timeLabel) : ""}
        </div>
        <div class="post-actions">
          <button class="post-action-btn post-like-btn${
            isLikedByMe ? " liked" : ""
          }" type="button">
            <span class="post-action-icon">♥</span>
            <span class="post-action-count like-count">${likeCount}</span>
          </button>
          <button class="post-action-btn post-comment-btn" type="button">
            <span class="post-action-icon">💬</span>
            <span class="post-action-count comment-count">${commentsCount}</span>
          </button>
          <button class="post-action-btn post-share-btn" type="button">
            <span class="post-action-icon">⤴</span>
          </button>
        </div>
      </footer>
    `;

    const likeBtn = article.querySelector(".post-like-btn");
    const commentBtn = article.querySelector(".post-comment-btn");
    const shareBtn = article.querySelector(".post-share-btn");
    const deleteBtn = article.querySelector(".post-delete-btn");

    if (likeBtn) {
      likeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleLike(post, likeBtn);
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

    // Make whole post (except buttons/links) clickable -> post.html
    article.addEventListener("click", (e) => {
      const target = e.target;
      if (
        target.closest(".post-action-btn") ||
        target.closest(".post-delete-btn") ||
        target.tagName === "A"
      ) {
        return;
      }
      this.goToPost(post);
    });

    return article;
  }

  goToPost(post) {
    if (!post || !post.id) return;
    window.location.href = `post.html?id=${encodeURIComponent(post.id)}`;
  }

  async confirmDeletePost(post, articleEl) {
    if (!post || !post.id) return;
    const ok = window.confirm("Delete this post? This can’t be undone.");
    if (!ok) return;

    try {
      const res = await fetch(
        `${PROFILE_API_BASE_URL}/posts/${encodeURIComponent(post.id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${getAuthToken()}`
          }
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete post");
      }

      // remove from local array and UI
      this.posts = this.posts.filter((p) => p.id !== post.id);
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

  /* ---------------- Like / Share handlers ---------------- */

  async handleLike(post, likeBtn) {
    if (!post || !post.id) return;
    if (!likeBtn) return;

    const countEl = likeBtn.querySelector(".like-count");
    const iconEl = likeBtn.querySelector(".post-action-icon");

    let currentCount = parseInt(countEl?.textContent || "0", 10);
    if (Number.isNaN(currentCount)) currentCount = 0;

    const wasLiked = !!post.liked_by_me;

    // Optimistic UI
    post.liked_by_me = !wasLiked;
    let newCount = currentCount + (wasLiked ? -1 : 1);
    if (newCount < 0) newCount = 0;

    if (countEl) countEl.textContent = String(newCount);
    likeBtn.classList.toggle("liked", post.liked_by_me);

    try {
      const method = wasLiked ? "DELETE" : "POST";
      const res = await fetch(
        `${PROFILE_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/like`,
        {
          method,
          headers: {
            Authorization: `Bearer ${getAuthToken()}`
          }
        }
      );

      if (!res.ok) {
        throw new Error("Failed to update like");
      }
    } catch (err) {
      console.error("handleLike error:", err);
      // revert UI on failure
      post.liked_by_me = wasLiked;
      if (countEl) countEl.textContent = String(currentCount);
      likeBtn.classList.toggle("liked", wasLiked);
      if (!wasLiked) {
        alert("Could not like this post.");
      }
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
      this.avatarEl.src =
        this.user.avatar_url || "assets/icons/default-profile.png";
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

      const res = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`
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

    const res = await fetch(`${PROFILE_API_BASE_URL}/profile/upload-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`
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
