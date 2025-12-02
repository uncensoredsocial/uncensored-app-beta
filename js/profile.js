// js/profile.js

const PROFILE_API_BASE_URL =
  "https://uncensored-app-beta-production.up.railway.app/api";

class ProfilePage {
  constructor() {
    this.user = null;
    this.posts = [];
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

    // Try to refresh from backend
    await this.fetchCurrentUser();
    await this.fetchUserPosts();
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
      this.editProfileBtn.addEventListener("click", () =>
        this.openEditModal()
      );
    }

    if (this.closeEditBtn) {
      this.closeEditBtn.addEventListener("click", () =>
        this.closeEditModal()
      );
    }
    if (this.cancelEditBtn) {
      this.cancelEditBtn.addEventListener("click", () =>
        this.closeEditModal()
      );
    }

    if (this.editForm) {
      this.editForm.addEventListener("submit", (e) =>
        this.handleEditSubmit(e)
      );
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

  /* ---------------- Fetch user posts ---------------- */

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
      this.posts = posts || [];

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

  /* ---------------- RENDER POSTS (feed-style + delete icon) ---------------- */

  renderPosts() {
    if (!this.postsContainer) return;
    this.postsContainer.innerHTML = "";

    const user = this.user || {};
    const avatar = user.avatar_url || "assets/icons/default-profile.png";
    const displayName = user.display_name || user.username || "User";
    const username = user.username || "username";

    this.posts.forEach((post) => {
      const article = document.createElement("article");
      article.className = "post";
      article.dataset.postId = post.id;

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

      const contentHtml = this.formatPostContent(post.content || "");

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
          <button
            type="button"
            class="post-delete-btn"
            aria-label="Delete post"
          >
            <i class="fa-solid fa-trash"></i>
          </button>
        </header>

        <div class="post-content">
          <p>${contentHtml}</p>
        </div>

        <footer class="post-footer">
          <div class="post-timestamp">
            ${timeLabel ? this.escapeHtml(timeLabel) : ""}
          </div>
          <div class="post-actions">
            <button class="post-action-btn post-like-btn" type="button">
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

      // Whole post click -> open post page (comments)
      article.addEventListener("click", (e) => {
        // Ignore clicks on buttons (like/comment/share/delete)
        if (
          e.target.closest(".post-action-btn") ||
          e.target.closest(".post-delete-btn")
        ) {
          return;
        }
        window.location.href = `post.html?id=${encodeURIComponent(post.id)}`;
      });

      // Bind buttons
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
          this.handleCommentClick(post);
        });
      }

      if (shareBtn) {
        shareBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.handleSharePostClick(post);
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await this.handleDeletePost(post, article);
        });
      }

      this.postsContainer.appendChild(article);
    });
  }

  /* ---------------- Delete post (trash icon) ---------------- */

  async handleDeletePost(post, articleEl) {
    const confirmed = window.confirm("Delete this post?");
    if (!confirmed) return;

    try {
      const token = getAuthToken && getAuthToken();
      if (!token) {
        alert("You must be logged in to delete posts.");
        return;
      }

      const res = await fetch(
        `${PROFILE_API_BASE_URL}/posts/${encodeURIComponent(post.id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete post");
      }

      // Remove from DOM
      if (articleEl && articleEl.parentNode) {
        articleEl.parentNode.removeChild(articleEl);
      }

      // Update local posts array + count
      this.posts = this.posts.filter((p) => p.id !== post.id);
      if (this.postsCountEl) {
        this.postsCountEl.textContent = this.posts.length.toString();
      }
    } catch (err) {
      console.error("handleDeletePost error:", err);
      alert(err.message || "Failed to delete post");
    }
  }

  /* ---------------- Post actions (like / comment / share) ---------------- */

  async handleLike(post, btn) {
    if (!window.isLoggedIn || !isLoggedIn()) {
      alert("Please log in to like posts.");
      return;
    }

    const token = getAuthToken && getAuthToken();
    if (!token) {
      alert("Missing auth token.");
      return;
    }

    try {
      btn.disabled = true;

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
      if (!res.ok) {
        throw new Error(data.error || "Failed to like post");
      }

      const likeCountEl = btn.querySelector(".like-count");
      if (likeCountEl) {
        likeCountEl.textContent = data.likes ?? 0;
      }

      if (data.liked) {
        btn.classList.add("liked");
      } else {
        btn.classList.remove("liked");
      }
    } catch (err) {
      console.error("handleLike error:", err);
      alert(err.message || "Failed to like post");
    } finally {
      btn.disabled = false;
    }
  }

  handleCommentClick(post) {
    // Go to full post view so comments load
    window.location.href = `post.html?id=${encodeURIComponent(post.id)}`;
  }

  handleSharePostClick(post) {
    const url = `${window.location.origin}/post.html?id=${encodeURIComponent(
      post.id
    )}`;

    if (navigator.share) {
      navigator
        .share({
          title: "Uncensored Social Post",
          text: post.content || "",
          url
        })
        .catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => alert("Post link copied!"))
        .catch(() => alert("Could not copy link to clipboard."));
    } else {
      alert("Share this link:\n" + url);
    }
  }

  /* ---------------- Set user into UI ---------------- */

  setUser(user) {
    this.user = user || this.user || {};

    const displayName = user.display_name || user.username || "User";
    const username = user.username || "username";
    const bio = user.bio || "No bio yet.";
    const createdAt = user.created_at;

    if (this.displayNameEl) this.displayNameEl.textContent = displayName;
    if (this.usernameEl) this.usernameEl.textContent = `@${username}`;
    if (this.bioEl) this.bioEl.textContent = bio;
    if (this.joinEl) this.joinEl.textContent = this.formatJoinDate(createdAt);

    if (this.avatarEl) {
      this.avatarEl.src =
        user.avatar_url || "assets/icons/default-profile.png";
    }

    if (this.bannerEl) {
      if (user.banner_url) {
        this.bannerEl.style.backgroundImage = `url("${user.banner_url}")`;
        this.bannerEl.classList.add("profile-banner-image");
      } else {
        this.bannerEl.style.backgroundImage = "";
        this.bannerEl.classList.remove("profile-banner-image");
      }
    }

    if (this.postsCountEl) {
      this.postsCountEl.textContent = (user.posts_count || 0).toString();
    }
    if (this.followersCountEl) {
      this.followersCountEl.textContent = (user.followers_count || 0).toString();
    }
    if (this.followingCountEl) {
      this.followingCountEl.textContent = (user.following_count || 0).toString();
    }
  }

  /* ---------------- Edit Profile Modal ---------------- */

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
      reader.onerror = () => reject(reader.error || new Error("File read error"));
      reader.readAsDataURL(file);
    });
  }

  switchTab(tabName) {
    this.tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    this.postsTabPane.classList.toggle("active", tabName === "posts");
    this.likesTabPane.classList.toggle("active", tabName === "likes");
  }

  formatJoinDate(dateString) {
    if (!dateString) return "Joined —";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Joined —";

    const opts = { month: "long", year: "numeric" };
    return `Joined ${date.toLocaleDateString(undefined, opts)}`;
  }

  formatPostContent(text = "") {
    const safe = this.escapeHtml(text);

    return safe
      .replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  }

  escapeHtml(str = "") {
    return str.replace(/[&<>"']/g, (m) => {
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
