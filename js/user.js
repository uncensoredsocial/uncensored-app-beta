/* ============================================================
   USER PROFILE PAGE (Viewing someone else's profile)
   ------------------------------------------------------------
   - Reads ?user= from URL (e.g. user.html?user=elon)
   - If ?user=me (and logged in) -> redirect to profile.html
   - Loads profile from:   GET /api/users/:username
   - Loads posts from:     GET /api/users/:username/posts
   - Follow/unfollow via:  POST /api/users/:username/follow
   - Like / save via:      POST /api/posts/:id/like, /save
   - Uses auth helpers from auth.js:
       - isLoggedIn()
       - getCurrentUser()
       - getAuthToken()
 ============================================================ */

const USER_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

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

    // Avatar - fallback to default-profile.PNG in root
    if (this.dom.avatarEl) {
      this.dom.avatarEl.src =
        this.user.avatar_url || "default-profile.PNG";
      this.dom.avatarEl.onerror = () => {
        this.dom.avatarEl.src = "default-profile.PNG";
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

    // viewing yourself -> hide follow + message
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

    // IMPORTANT: include auth header so backend can send liked_by_me / saved_by_me
    const headers = {};
    const token = this.getAuthTokenSafe();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(url, { headers });
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

    if (!this.posts.length) {
      this.dom.postsList.innerHTML = "";
      return;
    }

    this.dom.postsList.innerHTML = this.posts
      .map((post) => this.renderPostHtml(post))
      .join("");

    this.attachPostEvents();
  }

  renderPostHtml(post) {
    // For user page, the backend may or may not include post.user
    const user = post.user || this.user || {};
    const username = user.username || this.viewUsername || "unknown";
    const displayName = user.display_name || username;
    const avatar = user.avatar_url || "default-profile.PNG";

    const createdAt = post.created_at;
    const time = this.formatTime(createdAt);

    // liked / saved flags
    const liked =
      post.liked_by_me === true ||
      post.is_liked === true ||
      post.isLiked === true;
    const saved =
      post.saved_by_me === true ||
      post.is_saved === true ||
      post.isSaved === true;

    // Like count
    let likeCount = 0;
    if (typeof post.likes === "number") {
      likeCount = post.likes;
    } else if (typeof post.like_count === "number") {
      likeCount = post.like_count;
    } else if (Array.isArray(post.likes)) {
      likeCount = post.likes.length;
    }

    // Comment count
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
            <img class="post-avatar" src="${avatar}"
                 onerror="this.src='default-profile.PNG'">
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
                    style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center%;">
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

  /* --------------------- POST EVENTS --------------------- */

  attachPostEvents() {
    const posts = this.dom.postsList
      ? this.dom.postsList.querySelectorAll(".post")
      : [];

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
          const me = this.getCurrentUserSafe();
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
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
              .writeText(postUrl)
              .then(() => this.showToast("Link copied!", "success"))
              .catch(() =>
                this.showToast("Could not copy link to clipboard.", "error")
              );
          } else {
            alert("Share this link:\n" + postUrl);
          }
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

  async handleLike(postId, btn) {
    if (!this.isLoggedInSafe()) {
      return this.showToast("Log in to like posts", "error");
    }

    const token = this.getAuthTokenSafe();
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
      const res = await fetch(`${USER_API_BASE_URL}/posts/${postId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update like");

      const serverLikes =
        typeof data.likes === "number"
          ? data.likes
          : typeof data.like_count === "number"
          ? data.like_count
          : null;

      if (serverLikes !== null) {
        countEl.textContent = String(serverLikes);
      }

      const post = this.posts.find((p) => String(p.id) === String(postId));
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
    if (!this.isLoggedInSafe()) {
      return this.showToast("Log in to save posts", "error");
    }

    const token = this.getAuthTokenSafe();
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
      const res = await fetch(`${USER_API_BASE_URL}/posts/${postId}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update save");

      const post = this.posts.find((p) => String(p.id) === String(postId));
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

  /* --------------------- UTIL / STATUS --------------------- */

  formatJoinDate(dateString) {
    if (!dateString) return "Joined —";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Joined —";

    const opts = { month: "long", year: "numeric" };
    return `Joined ${date.toLocaleDateString(undefined, opts)}`;
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

  formatPostContent(text) {
    let t = this.escape(text);
    t = t.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    t = t.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
    t = t.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    return t;
  }

  showToast(message, type = "info") {
    if (!message) return;

    const old = document.querySelector(".status-message");
    if (old) old.remove();

    const div = document.createElement("div");
    div.className = `status-message status-${type}`;
    div.textContent = message;

    div.style.position = "fixed";
    div.style.top = "70px";
    div.style.left = "50%";
    div.style.transform = "translateX(-50%)";
    div.style.padding = "8px 14px";
    div.style.borderRadius = "999px";
    div.style.background =
      type === "error"
        ? "#3b0f0f"
        : type === "success"
        ? "#0f3b1f"
        : "#111";
    div.style.border = "1px solid #333";
    div.style.color = "#fff";
    div.style.zIndex = "9999";

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
