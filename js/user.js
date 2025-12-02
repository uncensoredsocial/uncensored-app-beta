/* ============================================================
   USER PROFILE PAGE (Viewing someone else's profile)
   ------------------------------------------------------------
   - Reads ?user= from URL (e.g. user.html?user=elon)
   - If ?user=me (and logged in) -> redirect to profile.html
   - Loads profile from:   GET /api/users/:username
   - Loads posts from:     GET /api/users/:username/posts
   - Follow/unfollow via:  POST /api/users/:username/follow
   - Uses auth helpers from auth.js:
       - isLoggedIn()
       - getCurrentUser()
       - getAuthToken()
 ============================================================ */

const USER_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

/* =======================================================================
   CLASS: UserProfilePage
======================================================================= */

class UserProfilePage {
  constructor() {
    this.viewUsername = null;   // username we are viewing (from ?user=)
    this.user = null;           // profile data
    this.posts = [];            // posts array
    this.isFollowing = false;   // follow state

    this.dom = {
      // header
      headerTitle: null,

      // hero
      bannerEl: null,
      avatarEl: null,
      displayNameEl: null,
      usernameEl: null,
      bioEl: null,

      postsCountEl: null,
      followersCountEl: null,
      followingCountEl: null,

      // posts
      postsList: null,
      postsLoading: null,
      postsEmpty: null,
      postsError: null,

      // actions
      followBtn: null,
      messageBtn: null,

      // options menu
      optionsButton: null,
      optionsMenu: null
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
      this.setHeaderTitle("Profile");
      this.showToast("No username specified in URL.", "error");
      this.showProfileError();
      return;
    }

    // If ?user=me OR matches current logged-in username -> own profile
    const currentUser = this.getCurrentUserSafe();
    if (
      this.viewUsername === "me" ||
      (currentUser && currentUser.username?.toLowerCase() === this.viewUsername)
    ) {
      window.location.href = "profile.html";
      return;
    }

    this.setHeaderTitle("Profile");

    // Load profile + posts
    try {
      await this.loadProfile();
      await this.loadPosts();
    } catch (err) {
      console.error("Error initializing user profile page:", err);
      this.showProfileError();
    }
  }

  /* ----------------------- DOM / EVENTS ------------------------ */

  cacheDom() {
    this.dom.headerTitle    = document.getElementById("viewProfileTitle");

    this.dom.bannerEl       = document.getElementById("viewProfileBanner");
    this.dom.avatarEl       = document.getElementById("viewProfileAvatar");
    this.dom.displayNameEl  = document.getElementById("viewProfileName");
    this.dom.usernameEl     = document.getElementById("viewProfileUsername");
    this.dom.bioEl          = document.getElementById("viewProfileBio");

    this.dom.postsCountEl      = document.getElementById("profilePostsCount");
    this.dom.followersCountEl  = document.getElementById("profileFollowersCount");
    this.dom.followingCountEl  = document.getElementById("profileFollowingCount");

    this.dom.postsList     = document.getElementById("userPostsList");
    this.dom.postsLoading  = document.getElementById("userPostsLoading");
    this.dom.postsEmpty    = document.getElementById("userPostsEmpty");
    this.dom.postsError    = document.getElementById("userPostsError");

    this.dom.followBtn     = document.getElementById("followButton");
    this.dom.messageBtn    = document.getElementById("messageButton");

    this.dom.optionsButton = document.getElementById("userOptionsButton");
    this.dom.optionsMenu   = document.getElementById("userOptionsMenu");
  }

  bindEvents() {
    // Follow
    if (this.dom.followBtn) {
      this.dom.followBtn.addEventListener("click", () => this.handleFollowClick());
    }

    // Message
    if (this.dom.messageBtn) {
      this.dom.messageBtn.addEventListener("click", () => this.handleMessageClick());
    }

    // 3-dots options button
    if (this.dom.optionsButton && this.dom.optionsMenu) {
      this.dom.optionsButton.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleOptionsMenu();
      });

      // menu item clicks
      this.dom.optionsMenu.querySelectorAll(".user-options-item")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const action = e.currentTarget.dataset.action;
            this.handleMenuAction(action);
            this.hideOptionsMenu();
          });
        });

      // click outside to close
      document.addEventListener("click", (e) => {
        if (!this.dom.optionsMenu) return;
        if (
          e.target === this.dom.optionsMenu ||
          this.dom.optionsMenu.contains(e.target) ||
          e.target === this.dom.optionsButton ||
          this.dom.optionsButton.contains(e.target)
        ) {
          return;
        }
        this.hideOptionsMenu();
      });
    }
  }

  toggleOptionsMenu() {
    if (!this.dom.optionsMenu) return;
    const isVisible = this.dom.optionsMenu.style.display === "block";
    this.dom.optionsMenu.style.display = isVisible ? "none" : "block";
  }

  hideOptionsMenu() {
    if (!this.dom.optionsMenu) return;
    this.dom.optionsMenu.style.display = "none";
  }

  handleMenuAction(action) {
    switch (action) {
      case "share":
        this.shareProfile();
        break;
      case "block":
        this.showToast("Block functionality not implemented yet.", "info");
        break;
      case "report":
        this.showToast("Report functionality not implemented yet.", "info");
        break;
      default:
        break;
    }
  }

  shareProfile() {
    if (!this.viewUsername) return;
    const url = `${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(
      this.viewUsername
    )}`;

    if (navigator.share) {
      navigator
        .share({
          title: "Uncensored Social Profile",
          text: `Check out @${this.viewUsername}`,
          url
        })
        .catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => this.showToast("Profile link copied!", "success"))
        .catch(() => this.showToast("Could not copy link.", "error"));
    } else {
      alert("Share this link:\n" + url);
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

  setHeaderTitle(text) {
    if (this.dom.headerTitle) {
      this.dom.headerTitle.textContent = text || "Profile";
    }
  }

  /* ------------------ LOAD PROFILE ------------------- */

  async loadProfile() {
    if (!this.viewUsername) return;

    const url = `${USER_API_BASE_URL}/users/${encodeURIComponent(
      this.viewUsername
    )}`;

    // 🔥 NEW: send Authorization header so backend can return `is_following`
    const headers = {};
    const token = this.getAuthTokenSafe();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    let res, data;
    try {
      res = await fetch(url, { headers });
      data = await res.json().catch(() => ({}));
    } catch (err) {
      console.error("fetch user profile error:", err);
      this.showToast("Failed to load profile.", "error");
      throw err;
    }

    if (!res.ok) {
      console.error("Profile request not ok:", data);
      this.showToast(data.error || "Profile not found.", "error");
      this.showProfileError();
      throw new Error(data.error || "Failed to load profile");
    }

    this.user = data;
    this.renderProfileHeader();
    this.setupFollowButton();
  }

  showProfileError() {
    if (this.dom.displayNameEl) {
      this.dom.displayNameEl.textContent = "User not found";
    }
    if (this.dom.usernameEl) {
      this.dom.usernameEl.textContent = "";
    }
    if (this.dom.bioEl) {
      this.dom.bioEl.textContent = "";
    }
    if (this.dom.postsLoading) this.dom.postsLoading.style.display = "none";
    if (this.dom.postsEmpty) this.dom.postsEmpty.style.display = "none";
    if (this.dom.postsError) this.dom.postsError.style.display = "block";
  }

  renderProfileHeader() {
    if (!this.user) return;

    const displayName = this.user.display_name || this.user.username || "User";
    const username    = this.user.username || this.viewUsername || "user";
    const bio         = this.user.bio || "";
    const createdAt   = this.user.created_at;

    if (this.dom.displayNameEl) {
      this.dom.displayNameEl.textContent = displayName;
    }
    if (this.dom.usernameEl) {
      this.dom.usernameEl.textContent = `@${username}`;
    }
    if (this.dom.bioEl) {
      this.dom.bioEl.textContent = bio;
    }

    // Title in header
    this.setHeaderTitle(displayName);

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

    // Optional join date (if you want a "Joined" line somewhere later)
    if (createdAt) {
      const joinedTxt = this.formatJoinDate(createdAt);
      console.debug("Joined:", joinedTxt);
    }
  }

  /* ---------------------- FOLLOW BUTTON ---------------------- */

  setupFollowButton() {
    if (!this.dom.followBtn || !this.user) return;

    const currentUser = this.getCurrentUserSafe();
    const loggedIn = this.isLoggedInSafe();

    // if not logged in -> disabled
    if (!loggedIn || !currentUser) {
      this.dom.followBtn.textContent = "Follow";
      this.dom.followBtn.disabled = true;
      this.dom.followBtn.classList.add("disabled");
      return;
    }

    // viewing yourself -> hide follow + message (you can change if you want)
    if (currentUser.username?.toLowerCase() === this.user.username?.toLowerCase()) {
      this.dom.followBtn.style.display = "none";
      if (this.dom.messageBtn) {
        this.dom.messageBtn.style.display = "none";
      }
      return;
    }

    // If backend sends is_following, use it
    if (typeof this.user.is_following === "boolean") {
      this.isFollowing = this.user.is_following;
    } else {
      this.isFollowing = false;
    }

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
      this.showToast("Please log in to follow users.", "error");
      return;
    }

    const token = this.getAuthTokenSafe();
    if (!token) {
      this.showToast("Missing auth token.", "error");
      return;
    }

    const prevFollowing = this.isFollowing;
    const newState = !prevFollowing;

    // optimistic UI
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

      this.showToast(
        this.isFollowing ? "You are now following this user." : "Unfollowed.",
        "success"
      );
    } catch (err) {
      console.error("handleFollowClick error:", err);
      // revert UI
      this.isFollowing = prevFollowing;
      this.updateFollowButtonUI();
      this.showToast(
        err.message || "Failed to update follow status.",
        "error"
      );
    }
  }

  /* ---------------------- MESSAGE BUTTON ---------------------- */

  handleMessageClick() {
    if (!this.viewUsername) return;

    if (!this.isLoggedInSafe()) {
      this.showToast("Please log in to send messages.", "error");
      return;
    }

    // Go to messages.html with the user pre-selected in query
    const url = `messages.html?user=${encodeURIComponent(this.viewUsername)}`;
    window.location.href = url;
  }

  /* ------------------------- POSTS ------------------------- */

  async loadPosts() {
    if (!this.viewUsername || !this.dom.postsList) return;

    if (this.dom.postsLoading) this.dom.postsLoading.style.display = "block";
    if (this.dom.postsEmpty) this.dom.postsEmpty.style.display = "none";
    if (this.dom.postsError) this.dom.postsError.style.display = "none";
    this.dom.postsList.innerHTML = "";

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

      if (this.dom.postsLoading) this.dom.postsLoading.style.display = "none";

      if (!this.posts.length) {
        if (this.dom.postsEmpty) this.dom.postsEmpty.style.display = "block";
        return;
      }

      this.renderPosts();

      // update posts count if backend didn't send it
      if (this.dom.postsCountEl) {
        this.dom.postsCountEl.textContent = String(this.posts.length);
      }
    } catch (err) {
      console.error("loadPosts error:", err);
      if (this.dom.postsLoading) this.dom.postsLoading.style.display = "none";
      if (this.dom.postsError) this.dom.postsError.style.display = "block";
    }
  }

  renderPosts() {
    if (!this.dom.postsList) return;

    this.dom.postsList.innerHTML = "";

    this.posts.forEach((post) => {
      this.dom.postsList.appendChild(this.createPostElement(post));
    });
  }

  createPostElement(post) {
    // Posts from /api/users/:username/posts are:
    // { id, content, created_at, likes_count?, comments_count? }
    const article = document.createElement("article");
    article.className = "post";
    article.setAttribute("tabindex", "0");
    article.dataset.postId = post.id;

    const user        = this.user || {};
    const avatar      = user.avatar_url || "assets/icons/default-profile.png";
    const displayName = user.display_name || user.username || "Unknown";
    const username    = user.username || "user";

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

    const likeBtn    = article.querySelector(".post-like-btn");
    const commentBtn = article.querySelector(".post-comment-btn");
    const shareBtn   = article.querySelector(".post-share-btn");

    if (likeBtn) {
      likeBtn.addEventListener("click", () => this.handleLike(post, likeBtn));
    }
    if (commentBtn) {
      commentBtn.addEventListener("click", () => this.handleCommentClick(post));
    }
    if (shareBtn) {
      shareBtn.addEventListener("click", () => this.handleSharePostClick(post));
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
      this.showToast("Please log in to like posts.", "error");
      return;
    }

    const token = this.getAuthTokenSafe();
    if (!token) {
      this.showToast("Missing auth token.", "error");
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
      this.showToast(err.message || "Failed to like post", "error");
    } finally {
      btn.disabled = false;
    }
  }

  handleCommentClick(_post) {
    this.showToast("Comments coming soon on user page!", "info");
  }

  handleSharePostClick(post) {
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
        .then(() => this.showToast("Post link copied!", "success"))
        .catch(() =>
          this.showToast("Could not copy link to clipboard.", "error")
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

  showToast(message, type = "info") {
    if (!message) return;

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
  window.userProfilePage = page; // for console debugging
});
