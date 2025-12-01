// js/user.js
/* ============================================================
   USER PROFILE PAGE (Viewing someone else's profile)
   ------------------------------------------------------------
   - Reads ?user= from URL (e.g. user.html?user=elon)
   - If ?user=me (and logged in) -> redirect to profile.html
   - Loads profile from:   GET /api/users/:username
   - Loads posts from:     GET /api/users/:username/posts
   - Follow/unfollow via:  POST /api/users/:username/follow
   - Renders posts styled similarly to feed.js
   - Uses auth helpers from auth.js:
       - isLoggedIn()
       - getCurrentUser()
       - getAuthToken()
 ============================================================ */

// Prefer global API_BASE_URL from auth.js; fallback to your prod URL
const USER_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

/*
  Expected layout (user.html):

  <div id="userBanner" class="profile-banner"></div>
  <img id="userAvatar" class="profile-avatar" />

  <h2 id="userDisplayName"></h2>
  <p id="userUsername"></p>
  <p id="userBio"></p>
  <p id="userJoinDate"></p>

  <span id="userPostsCount"></span>
  <span id="userFollowersCount"></span>
  <span id="userFollowingCount"></span>

  <button id="userFollowBtn">Follow</button>

  <div id="userStatusMessage" class="profile-status hidden"></div>

  <div id="userPosts"></div>
*/

/* =======================================================================
   CLASS: UserProfilePage
   -----------------------------------------------------------------------
   Encapsulates all logic for another user's profile page (user.html)
======================================================================= */

class UserProfilePage {
  constructor() {
    // The username we are viewing (from ?user=)
    this.viewUsername = null;

    // Profile data returned from backend
    this.user = null;

    // Array of posts for this user
    this.posts = [];

    // Follow state (we don't get it from backend yet, so we track locally)
    this.isFollowing = false;

    // DOM references
    this.dom = {
      bannerEl: null,
      avatarEl: null,
      displayNameEl: null,
      usernameEl: null,
      bioEl: null,
      joinDateEl: null,
      postsCountEl: null,
      followersCountEl: null,
      followingCountEl: null,
      postsContainer: null,
      followBtn: null,
      statusEl: null
    };
  }

  /* ---------------------------- INIT ---------------------------- */

  async init() {
    // Only run on user.html
    if (!window.location.pathname.toLowerCase().includes("user.html")) {
      return;
    }

    this.cacheDom();
    this.bindEvents();

    this.viewUsername = this.getUsernameFromUrl();

    if (!this.viewUsername) {
      this.showStatus("No username specified in URL.", "error");
      return;
    }

    // If ?user=me OR matches current logged-in username -> own profile
    const currentUser = this.getCurrentUserSafe();
    if (
      this.viewUsername === "me" ||
      (currentUser && currentUser.username === this.viewUsername)
    ) {
      window.location.href = "profile.html";
      return;
    }

    // Load profile + posts
    await this.loadProfileAndPosts();
  }

  /* ----------------------- DOM / EVENTS ------------------------ */

  cacheDom() {
    this.dom.bannerEl = document.getElementById("userBanner");
    this.dom.avatarEl = document.getElementById("userAvatar");

    this.dom.displayNameEl = document.getElementById("userDisplayName");
    this.dom.usernameEl = document.getElementById("userUsername");
    this.dom.bioEl = document.getElementById("userBio");
    this.dom.joinDateEl = document.getElementById("userJoinDate");

    this.dom.postsCountEl = document.getElementById("userPostsCount");
    this.dom.followersCountEl = document.getElementById("userFollowersCount");
    this.dom.followingCountEl = document.getElementById("userFollowingCount");

    this.dom.postsContainer = document.getElementById("userPosts");

    this.dom.followBtn = document.getElementById("userFollowBtn");
    this.dom.statusEl = document.getElementById("userStatusMessage");
  }

  bindEvents() {
    if (this.dom.followBtn) {
      this.dom.followBtn.addEventListener("click", () =>
        this.handleFollowClick()
      );
    }
  }

  /* ----------------------- URL / AUTH HELPERS ----------------------- */

  getUsernameFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const user = params.get("user") || params.get("username");
      return user ? user.trim().toLowerCase() : null;
    } catch (e) {
      console.error("getUsernameFromUrl error:", e);
      return null;
    }
  }

  isLoggedInSafe() {
    try {
      return typeof isLoggedIn === "function" ? isLoggedIn() : false;
    } catch {
      return false;
    }
  }

  getCurrentUserSafe() {
    try {
      return typeof getCurrentUser === "function" ? getCurrentUser() : null;
    } catch {
      return null;
    }
  }

  getAuthTokenSafe() {
    try {
      return typeof getAuthToken === "function" ? getAuthToken() : null;
    } catch {
      return null;
    }
  }

  /* ------------------ LOAD PROFILE + POSTS ------------------- */

  async loadProfileAndPosts() {
    try {
      this.showStatus("Loading profile...", "info");
      await this.fetchUserProfile();
      this.showStatus(""); // clear
      await this.fetchUserPosts();
    } catch (err) {
      console.error("loadProfileAndPosts error:", err);
      this.showStatus("Failed to load profile.", "error");
    }
  }

  async fetchUserProfile() {
    if (!this.viewUsername) return;

    const url = `${USER_API_BASE_URL}/users/${encodeURIComponent(
      this.viewUsername
    )}`;

    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Failed to load profile");
    }

    // data: id, username, display_name, avatar_url, banner_url, bio, created_at
    // plus stats: posts_count, followers_count, following_count
    this.user = data;
    this.renderProfileHeader();
    this.setupFollowButton();
  }

  async fetchUserPosts() {
    if (!this.viewUsername || !this.dom.postsContainer) return;

    this.dom.postsContainer.innerHTML = `
      <div class="loading-indicator">
        <div class="loading-spinner"></div>
        <span>Loading posts...</span>
      </div>
    `;

    const url = `${USER_API_BASE_URL}/users/${encodeURIComponent(
      this.viewUsername
    )}/posts`;

    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => []);

      if (!res.ok) {
        throw new Error(data.error || "Failed to load posts");
      }

      this.posts = Array.isArray(data) ? data : [];

      if (!this.posts.length) {
        this.dom.postsContainer.innerHTML = `
          <div class="empty-state">
            <h3>No posts yet</h3>
          </div>
        `;
        return;
      }

      this.renderPosts();
    } catch (err) {
      console.error("fetchUserPosts error:", err);
      this.dom.postsContainer.innerHTML = `
        <div class="empty-state">
          <h3>Error loading posts</h3>
        </div>
      `;
    }
  }

  /* ------------------ RENDER PROFILE HEADER ------------------- */

  renderProfileHeader() {
    if (!this.user) return;

    const displayName =
      this.user.display_name || this.user.username || "User";
    const username = this.user.username || "username";
    const bio = this.user.bio || "No bio yet.";
    const createdAt = this.user.created_at;

    if (this.dom.displayNameEl) {
      this.dom.displayNameEl.textContent = displayName;
    }
    if (this.dom.usernameEl) {
      this.dom.usernameEl.textContent = `@${username}`;
    }
    if (this.dom.bioEl) {
      this.dom.bioEl.textContent = bio;
    }
    if (this.dom.joinDateEl) {
      this.dom.joinDateEl.textContent = this.formatJoinDate(createdAt);
    }

    // Avatar
    if (this.dom.avatarEl) {
      this.dom.avatarEl.src =
        this.user.avatar_url || "assets/icons/default-profile.png";
      this.dom.avatarEl.onerror = () => {
        this.dom.avatarEl.src = "assets/icons/default-profile.png";
      };
    }

    // Banner
    if (this.dom.bannerEl) {
      if (this.user.banner_url) {
        this.dom.bannerEl.style.backgroundImage = `url("${this.user.banner_url}")`;
        this.dom.bannerEl.classList.add("profile-banner-image");
      } else {
        // fallback: keep default CSS gradient or solid
        this.dom.bannerEl.style.backgroundImage = "";
        this.dom.bannerEl.classList.remove("profile-banner-image");
      }
    }

    // Stats
    if (this.dom.postsCountEl) {
      const val =
        typeof this.user.posts_count === "number"
          ? this.user.posts_count
          : this.posts?.length || 0;
      this.dom.postsCountEl.textContent = String(val);
    }
    if (this.dom.followersCountEl) {
      this.dom.followersCountEl.textContent = String(
        this.user.followers_count || 0
      );
    }
    if (this.dom.followingCountEl) {
      this.dom.followingCountEl.textContent = String(
        this.user.following_count || 0
      );
    }
  }

  /* ---------------------- FOLLOW BUTTON ---------------------- */

  setupFollowButton() {
    if (!this.dom.followBtn || !this.user) return;

    const currentUser = this.getCurrentUserSafe();
    const loggedIn = this.isLoggedInSafe();

    // Not logged in → show disabled Follow (or you can send them to login)
    if (!loggedIn || !currentUser) {
      this.dom.followBtn.textContent = "Follow";
      this.dom.followBtn.disabled = true;
      this.dom.followBtn.classList.add("disabled");
      return;
    }

    // Viewing yourself → hide follow button
    if (currentUser.username === this.user.username) {
      this.dom.followBtn.style.display = "none";
      return;
    }

    // We don't have is_following from backend yet, so default to false
    this.isFollowing = false;
    this.updateFollowButtonUI();
  }

  updateFollowButtonUI() {
    if (!this.dom.followBtn) return;

    if (this.isFollowing) {
      this.dom.followBtn.textContent = "Following";
      this.dom.followBtn.classList.add("following");
      this.dom.followBtn.classList.remove("btn-primary");
      this.dom.followBtn.classList.add("btn-secondary");
    } else {
      this.dom.followBtn.textContent = "Follow";
      this.dom.followBtn.classList.remove("following");
      this.dom.followBtn.classList.remove("btn-secondary");
      this.dom.followBtn.classList.add("btn-primary");
    }
  }

  async handleFollowClick() {
    if (!this.user || !this.dom.followBtn) return;

    if (!this.isLoggedInSafe()) {
      this.showStatus("Please log in to follow users.", "error");
      return;
    }

    const token = this.getAuthTokenSafe();
    if (!token) {
      this.showStatus("Missing auth token.", "error");
      return;
    }

    const prevFollowing = this.isFollowing;
    const newState = !prevFollowing;

    // Optimistic UI
    this.isFollowing = newState;
    this.updateFollowButtonUI();

    try {
      const url = `${USER_API_BASE_URL}/users/${encodeURIComponent(
        this.user.username
      )}/follow`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update follow status");
      }

      // data: { following, posts_count, followers_count, following_count }
      this.isFollowing = !!data.following;
      this.updateFollowButtonUI();

      if (
        typeof data.followers_count === "number" &&
        this.dom.followersCountEl
      ) {
        this.dom.followersCountEl.textContent = String(data.followers_count);
      }
      if (
        typeof data.following_count === "number" &&
        this.dom.followingCountEl
      ) {
        this.dom.followingCountEl.textContent = String(data.following_count);
      }

      this.showStatus(
        this.isFollowing ? "You are now following this user." : "Unfollowed.",
        "success"
      );
    } catch (err) {
      console.error("handleFollowClick error:", err);
      // revert UI
      this.isFollowing = prevFollowing;
      this.updateFollowButtonUI();
      this.showStatus(
        err.message || "Failed to update follow status.",
        "error"
      );
    }
  }

  /* ------------------------- POSTS ------------------------- */

  renderPosts() {
    if (!this.dom.postsContainer) return;

    this.dom.postsContainer.innerHTML = "";

    this.posts.forEach((post) => {
      this.dom.postsContainer.appendChild(this.createPostElement(post));
    });
  }

  createPostElement(post) {
    // Posts from /api/users/:username/posts are currently:
    // { id, content, created_at }
    // They might not contain likes_count / comments_count yet.
    const article = document.createElement("article");
    article.className = "post";
    article.setAttribute("tabindex", "0");
    article.dataset.postId = post.id;

    const user = this.user || {};
    const avatar = user.avatar_url || "assets/icons/default-profile.png";
    const displayName = user.display_name || user.username || "Unknown";
    const username = user.username || "user";
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

    article.innerHTML = `
      <header class="post-header">
        <img
          src="${avatar}"
          alt="${this.escape(displayName)}"
          class="post-user-avatar"
          onerror="this.src='assets/icons/default-profile.png'"
        />
        <div class="post-user-info">
          <div class="post-display-name">${this.escape(displayName)}</div>
          <div class="post-username">@${this.escape(username)}</div>
        </div>
        ${
          timeLabel
            ? `<div class="post-time">${this.escape(timeLabel)}</div>`
            : ""
        }
      </header>

      <div class="post-content">
        <p>${this.formatContent(post.content || "")}</p>
      </div>

      <footer class="post-footer">
        <div class="post-timestamp">
          ${timeLabel ? this.escape(timeLabel) : ""}
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

    // Wire up actions
    const likeBtn = article.querySelector(".post-like-btn");
    const commentBtn = article.querySelector(".post-comment-btn");
    const shareBtn = article.querySelector(".post-share-btn");

    if (likeBtn) {
      likeBtn.addEventListener("click", () =>
        this.handleLike(post, likeBtn)
      );
    }
    if (commentBtn) {
      commentBtn.addEventListener("click", () =>
        this.handleCommentClick(post)
      );
    }
    if (shareBtn) {
      shareBtn.addEventListener("click", () =>
        this.handleShareClick(post)
      );
    }

    return article;
  }

  formatContent(text) {
    const safe = this.escape(text);

    return safe
      .replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  }

  /* --------------------- POST ACTIONS --------------------- */

  async handleLike(post, btn) {
    if (!this.isLoggedInSafe()) {
      this.showStatus("Please log in to like posts.", "error");
      return;
    }

    const token = this.getAuthTokenSafe();
    if (!token) {
      this.showStatus("Missing auth token.", "error");
      return;
    }

    try {
      btn.disabled = true;

      const res = await fetch(
        `${USER_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/like`,
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
      this.showStatus(err.message || "Failed to like post", "error");
    } finally {
      btn.disabled = false;
    }
  }

  handleCommentClick(post) {
    // Later you can navigate to post.html?id=...
    this.showStatus("Comments coming soon on user page!", "info");
  }

  handleShareClick(post) {
    const url = `${window.location.origin}/index.html#post-${post.id}`;

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
        .then(() => this.showStatus("Post link copied!", "success"))
        .catch(() =>
          this.showStatus("Could not copy link to clipboard.", "error")
        );
    } else {
      alert("Share this link:\n" + url);
    }
  }

  /* --------------------- UTIL / STATUS --------------------- */

  formatJoinDate(dateString) {
    if (!dateString) return "Joined —";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Joined —";

    const opts = { month: "long", year: "numeric" };
    return `Joined ${date.toLocaleDateString(undefined, opts)}`;
  }

  escape(str = "") {
    return String(str).replace(/[&<>"']/g, (m) => {
      switch (m) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#039;";
        default:
          return m;
      }
    });
  }

  showStatus(message, type = "info") {
    if (this.dom.statusEl) {
      this.dom.statusEl.textContent = message || "";
      this.dom.statusEl.className = `profile-status profile-status-${type}`;
      if (!message) {
        this.dom.statusEl.classList.add("hidden");
      } else {
        this.dom.statusEl.classList.remove("hidden");
      }
    }

    if (!message) return;

    // Small toast as well
    const div = document.createElement("div");
    div.className = `status-message status-${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2500);
  }
}

/* =========================== INIT =========================== */

document.addEventListener("DOMContentLoaded", () => {
  const page = new UserProfilePage();
  page.init();
  // Expose for debugging in console if you want
  window.userProfilePage = page;
});
