// js/profile.js

// ✅ Robust API base builder (prevents /api/api and missing /api)
function normalizeApiBase(raw) {
  let b = String(raw || "").trim();
  b = b.replace(/\/+$/, ""); // remove trailing slashes

  if (!b) return "https://uncensored-app-beta-production.up.railway.app/api";

  // If someone set API_BASE_URL to the domain (no /api), add it.
  // If they set it to ".../api", keep it.
  return b.endsWith("/api") ? b : b + "/api";
}

const PROFILE_API_BASE_URL = normalizeApiBase(
  typeof API_BASE_URL !== "undefined" ? API_BASE_URL : ""
);

class ProfilePage {
  constructor() {
    this.user = null;

    // posts + likes state
    this.posts = [];
    this.likedPosts = [];
    this.likesLoaded = false;

    // follow list state
    this.followersLoaded = false;
    this.followingLoaded = false;
    this.followers = [];
    this.following = [];
    this.activeFollowTab = "followers";
  }

  async init() {
    // ✅ FIX: don’t depend on window.isLoggedIn existing.
    // Allow if:
    // - isLoggedIn() exists and returns true, OR
    // - token exists (fallback)
    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    const hasLoginFn = typeof isLoggedIn === "function";
    const loggedIn = hasLoginFn ? !!isLoggedIn() : !!token;

    if (!loggedIn) {
      window.location.href = "signup.html";
      return;
    }

    this.cacheDom();
    this.bindEvents();

    // hydrate UI from local storage immediately (fast)
    const localUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    if (localUser) this.setUser(localUser);

    // pull fresh user from server, then load posts
    await this.fetchCurrentUser();
    await this.fetchUserPosts();
  }

  cacheDom() {
    // Profile header
    this.displayNameEl = document.getElementById("profileDisplayName");
    this.usernameEl = document.getElementById("profileUsername");
    this.bioEl = document.getElementById("profileBio");
    this.joinEl = document.getElementById("profileJoinDate");
    this.avatarEl = document.getElementById("profileAvatar");
    this.bannerEl = document.getElementById("profileBanner");

    // Stats
    this.postsCountEl = document.getElementById("postsCount");
    this.followersCountEl = document.getElementById("followersCount");
    this.followingCountEl = document.getElementById("followingCount");

    // Posts container (may be outside tabs depending on your HTML)
    this.postsContainer = document.getElementById("profilePosts");

    // Top buttons
    this.settingsButton = document.getElementById("settingsButton");
    this.editProfileBtn = document.getElementById("editProfileBtn");

    // Modal: edit
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

    // Tabs: posts/likes
    this.tabButtons = document.querySelectorAll(".tab-btn");
    this.postsTabPane = document.getElementById("postsTab");
    this.likesTabPane = document.getElementById("likesTab");

    // ✅ FIX: Ensure posts container exists inside posts tab too (same style you did for likes)
    this.ensurePostsContainer();

    // Stats buttons
    this.followersStatBtn = document.getElementById("followersStatBtn");
    this.followingStatBtn = document.getElementById("followingStatBtn");

    // Follow list modal
    this.followListModal = document.getElementById("followListModal");
    this.followListBackBtn = document.getElementById("followListBackBtn");
    this.followListError = document.getElementById("followListError");

    this.followersTabBtn = document.getElementById("followersTabBtn");
    this.followingTabBtn = document.getElementById("followingTabBtn");

    this.followersTabCount = document.getElementById("followersTabCount");
    this.followingTabCount = document.getElementById("followingTabCount");

    this.followersPane = document.getElementById("followersPane");
    this.followingPane = document.getElementById("followingPane");

    this.followersLoading = document.getElementById("followersLoading");
    this.followingLoading = document.getElementById("followingLoading");

    this.followersList = document.getElementById("followersList");
    this.followingList = document.getElementById("followingList");
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

    if (this.closeEditBtn) this.closeEditBtn.addEventListener("click", () => this.closeEditModal());
    if (this.cancelEditBtn) this.cancelEditBtn.addEventListener("click", () => this.closeEditModal());

    if (this.editForm) {
      this.editForm.addEventListener("submit", (e) => this.handleEditSubmit(e));
    }

    if (this.editBioInput && this.bioCharCounter) {
      this.editBioInput.addEventListener("input", () => {
        const len = this.editBioInput.value.length;
        this.bioCharCounter.textContent = `${len}/160`;
        this.bioCharCounter.classList.toggle("warning", len > 140 && len <= 160);
        this.bioCharCounter.classList.toggle("error", len > 160);
      });
    }

    this.tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
    });

    if (this.editModal) {
      this.editModal.addEventListener("click", (e) => {
        if (e.target === this.editModal) this.closeEditModal();
      });
    }

    // Follow list open
    if (this.followersStatBtn) {
      this.followersStatBtn.addEventListener("click", () => this.openFollowList("followers"));
    }
    if (this.followingStatBtn) {
      this.followingStatBtn.addEventListener("click", () => this.openFollowList("following"));
    }

    // Follow list modal controls
    if (this.followListBackBtn) {
      this.followListBackBtn.addEventListener("click", () => this.closeFollowList());
    }
    if (this.followListModal) {
      this.followListModal.addEventListener("click", (e) => {
        if (e.target === this.followListModal) this.closeFollowList();
      });
    }

    if (this.followersTabBtn) {
      this.followersTabBtn.addEventListener("click", () => this.switchFollowTab("followers"));
    }
    if (this.followingTabBtn) {
      this.followingTabBtn.addEventListener("click", () => this.switchFollowTab("following"));
    }
  }

  /* ---------------- Small helpers ---------------- */

  buildOptionalAuthHeaders() {
    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // ✅ Accept either:
  //  - an array: [...]
  //  - { posts: [...] } or { data: [...] } or { results: [...] }
  normalizeListPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.posts)) return payload.posts;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.items)) return payload.items;
    return [];
  }

  // ✅ Reads response safely (json if possible else text)
  async readResponseSafe(res) {
    const text = await res.text().catch(() => "");
    if (!text) return { json: null, text: "" };
    try {
      return { json: JSON.parse(text), text };
    } catch {
      return { json: null, text };
    }
  }

  // ✅ Ensures posts container exists inside posts tab (HTML changes won't break loading)
  ensurePostsContainer() {
    // If you already have profilePosts on page, keep using it.
    if (this.postsContainer) return this.postsContainer;

    // Else, build it inside posts tab like you did for likes
    if (!this.postsTabPane) return null;

    let container = this.postsTabPane.querySelector(".profile-posts");
    if (!container) {
      container = document.createElement("div");
      container.id = "profilePosts";
      container.className = "profile-posts";
      this.postsTabPane.innerHTML = "";
      this.postsTabPane.appendChild(container);
    } else {
      // make sure id exists for consistency
      if (!container.id) container.id = "profilePosts";
    }

    this.postsContainer = container;
    return container;
  }

  /* ---------------- Fetch current user ---------------- */

  async fetchCurrentUser() {
    try {
      const token = typeof getAuthToken === "function" ? getAuthToken() : null;
      if (!token) return;

      const res = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const { text } = await this.readResponseSafe(res);
        console.warn("fetchCurrentUser not ok:", res.status, text);
        return;
      }

      const user = await res.json().catch(() => null);
      if (!user) return;

      this.setUser(user);
      if (typeof setCurrentUser === "function") setCurrentUser(user);
    } catch (err) {
      console.warn("fetchCurrentUser error:", err);
    }
  }

  /* ---------------- Fetch user posts ---------------- */

  async fetchUserPosts() {
    if (!this.user || !this.user.username) return;

    const container = this.ensurePostsContainer();
    if (!container) return;

    container.innerHTML = `<div class="loading-indicator">Loading posts...</div>`;

    const url = `${PROFILE_API_BASE_URL}/users/${encodeURIComponent(this.user.username)}/posts`;

    try {
      const res = await fetch(url, { headers: this.buildOptionalAuthHeaders() });

      if (!res.ok) {
        const { text } = await this.readResponseSafe(res);
        throw new Error(`Failed to load posts (${res.status}) ${text}`.trim());
      }

      const payload = await res.json().catch(() => null);
      const postsArr = this.normalizeListPayload(payload);

      this.posts = (postsArr || []).slice().sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at) : 0;
        const bDate = b.created_at ? new Date(b.created_at) : 0;
        return bDate - aDate;
      });

      // Keep count in sync (either server count or array length)
      if (this.postsCountEl) this.postsCountEl.textContent = String(this.posts.length);

      if (!this.posts.length) {
        container.innerHTML = `<div class="empty-state"><h3>No posts yet</h3></div>`;
        return;
      }

      this.renderPosts();
    } catch (err) {
      console.error("fetchUserPosts error:", err);
      container.innerHTML = `<div class="empty-state"><h3>Error loading posts</h3></div>`;
    }
  }

  /* ---------------- Likes tab ---------------- */

  ensureLikesContainer() {
    if (!this.likesTabPane) return null;
    let container = this.likesTabPane.querySelector(".profile-posts");
    if (!container) {
      container = document.createElement("div");
      container.id = "profileLikes";
      container.className = "profile-posts";
      this.likesTabPane.innerHTML = "";
      this.likesTabPane.appendChild(container);
    } else {
      if (!container.id) container.id = "profileLikes";
    }
    return container;
  }

  async fetchUserLikedPosts() {
    if (!this.user || !this.user.username || !this.likesTabPane) return;

    const likesContainer = this.ensureLikesContainer();
    if (!likesContainer) return;

    likesContainer.innerHTML = `<div class="loading-indicator">Loading likes...</div>`;

    const url = `${PROFILE_API_BASE_URL}/users/${encodeURIComponent(this.user.username)}/likes`;

    try {
      const res = await fetch(url, { headers: this.buildOptionalAuthHeaders() });

      if (!res.ok) {
        const { text } = await this.readResponseSafe(res);
        throw new Error(`Failed to load liked posts (${res.status}) ${text}`.trim());
      }

      const payload = await res.json().catch(() => null);
      const likedArr = this.normalizeListPayload(payload);

      this.likedPosts = (likedArr || []).slice().sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at) : 0;
        const bDate = b.created_at ? new Date(b.created_at) : 0;
        return bDate - aDate;
      });

      this.likesLoaded = true;

      if (!this.likedPosts.length) {
        likesContainer.innerHTML = `<div class="empty-state"><h3>No liked posts yet</h3></div>`;
        return;
      }

      likesContainer.innerHTML = "";
      this.likedPosts.forEach((post) => {
        likesContainer.appendChild(this.createPostElement(post, { fromLikesTab: true }));
      });
    } catch (err) {
      console.error("fetchUserLikedPosts error:", err);
      likesContainer.innerHTML = `<div class="empty-state"><h3>Error loading liked posts</h3></div>`;
    }
  }

  /* ---------------- RENDER POSTS ---------------- */

  renderPosts() {
    const container = this.ensurePostsContainer();
    if (!container) return;

    container.innerHTML = "";
    this.posts.forEach((post) => {
      container.appendChild(this.createPostElement(post, { fromLikesTab: false }));
    });
  }

  createPostElement(post, options = {}) {
    const { fromLikesTab = false } = options;

    const article = document.createElement("article");
    article.className = "post";
    article.dataset.postId = post.id;
    article.tabIndex = 0;

    const author = post.user || post.author || this.user || {};
    const avatar = author.avatar_url || "default-profile.PNG";
    const username = author.username || "unknown";
    const displayName = author.display_name || username;

    const time = post.created_at ? this.formatTime(post.created_at) : "";

    const isOwnPost =
      this.user && (post.user_id === this.user.id || author.id === this.user.id);

    const liked =
      post.liked_by_me === true ||
      post.is_liked === true ||
      post.isLiked === true;

    const saved =
      post.saved_by_me === true ||
      post.is_saved === true ||
      post.isSaved === true;

    let likeCount = 0;
    if (typeof post.likes === "number") likeCount = post.likes;
    else if (typeof post.like_count === "number") likeCount = post.like_count;
    else if (Array.isArray(post.likes)) likeCount = post.likes.length;

    let commentCount = 0;
    if (typeof post.comments_count === "number") commentCount = post.comments_count;
    else if (typeof post.comment_count === "number") commentCount = post.comment_count;
    else if (Array.isArray(post.comments)) commentCount = post.comments.length;
    else if (typeof post.comments === "number") commentCount = post.comments;

    const mediaUrl =
      post.media_url || post.media || post.image_url || post.video_url || null;
    const mediaType = post.media_type || "";
    const mediaHtml = mediaUrl ? this.renderMediaHtml(mediaUrl, mediaType) : "";

    article.innerHTML = `
      <header class="post-header">
        <div class="post-user" data-username="${this.escapeHtml(username)}">
          <img class="post-avatar" src="${avatar}" onerror="this.src='default-profile.PNG'">
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

    const likeBtn = article.querySelector(".like-btn");
    const commentBtn = article.querySelector(".comment-btn");
    const shareBtn = article.querySelector(".share-btn");
    const saveBtn = article.querySelector(".save-btn");
    const deleteBtn = article.querySelector(".post-delete-btn");
    const userEl = article.querySelector(".post-user");

    if (likeBtn) likeBtn.addEventListener("click", (e) => { e.stopPropagation(); this.handleLike(post, likeBtn); });
    if (saveBtn) saveBtn.addEventListener("click", (e) => { e.stopPropagation(); this.handleSave(post, saveBtn); });
    if (commentBtn) commentBtn.addEventListener("click", (e) => { e.stopPropagation(); this.goToPost(post); });
    if (shareBtn) shareBtn.addEventListener("click", (e) => { e.stopPropagation(); this.handleSharePostClick(post); });

    if (deleteBtn && isOwnPost && !fromLikesTab) {
      deleteBtn.addEventListener("click", (e) => { e.stopPropagation(); this.confirmDeletePost(post, article); });
    }

    if (userEl) {
      userEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const uname = userEl.dataset.username;
        if (this.user && this.user.username === uname) window.location.href = "profile.html";
        else window.location.href = `user.html?user=${encodeURIComponent(uname)}`;
      });
    }

    article.addEventListener("click", (e) => {
      const target = e.target;
      if (
        target.closest(".post-actions") ||
        target.closest(".post-delete-btn") ||
        target.closest(".post-user") ||
        target.tagName === "A"
      ) return;
      this.goToPost(post);
    });

    return article;
  }

  renderMediaHtml(url, type) {
    const lower = String(url || "").toLowerCase();
    const isVideo =
      (type && (type.startsWith("video/") || type === "video")) ||
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".ogg") ||
      lower.includes("video");

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
          <img src="${url}" loading="lazy" onerror="this.style.display='none'">
        </a>
      </div>
    `;
  }

  goToPost(post) {
    if (!post || !post.id) return;
    window.location.href = `post.html?id=${encodeURIComponent(post.id)}`;
  }

  /* ---------------- FOLLOW LIST (TikTok style) ---------------- */

  openFollowList(tab) {
    if (!this.followListModal || !this.user?.username) return;

    if (this.followListError) {
      this.followListError.classList.add("hidden");
      this.followListError.textContent = "";
    }

    const fCount = Number(this.user.followers_count || this.followersCountEl?.textContent || 0);
    const fgCount = Number(this.user.following_count || this.followingCountEl?.textContent || 0);
    if (this.followersTabCount) this.followersTabCount.textContent = String(fCount);
    if (this.followingTabCount) this.followingTabCount.textContent = String(fgCount);

    this.followListModal.classList.add("open");
    this.switchFollowTab(tab || "followers");
  }

  closeFollowList() {
    if (!this.followListModal) return;
    this.followListModal.classList.remove("open");
  }

  switchFollowTab(tabName) {
    this.activeFollowTab = tabName;

    if (this.followersTabBtn) this.followersTabBtn.classList.toggle("active", tabName === "followers");
    if (this.followingTabBtn) this.followingTabBtn.classList.toggle("active", tabName === "following");

    if (this.followersPane) this.followersPane.classList.toggle("active", tabName === "followers");
    if (this.followingPane) this.followingPane.classList.toggle("active", tabName === "following");

    if (tabName === "followers" && !this.followersLoaded) this.fetchFollowers();
    if (tabName === "following" && !this.followingLoaded) this.fetchFollowing();
  }

  async fetchFollowers() {
    if (!this.user?.username) return;

    try {
      if (this.followersLoading) this.followersLoading.style.display = "block";
      if (this.followersList) this.followersList.innerHTML = "";

      const res = await fetch(
        `${PROFILE_API_BASE_URL}/users/${encodeURIComponent(this.user.username)}/followers`,
        { headers: this.buildOptionalAuthHeaders() }
      );

      const { json, text } = await this.readResponseSafe(res);
      if (!res.ok) throw new Error((json && json.error) || text || "Could not load followers");

      const data = json || {};
      this.followers = Array.isArray(data.users) ? data.users : [];
      this.followersLoaded = true;

      this.applyFollowCountsFromServer(data);
      this.renderFollowRows("followers");
    } catch (err) {
      console.error("fetchFollowers error:", err);
      this.showFollowError(err.message || "Couldn’t load followers");
    } finally {
      if (this.followersLoading) this.followersLoading.style.display = "none";
    }
  }

  async fetchFollowing() {
    if (!this.user?.username) return;

    try {
      if (this.followingLoading) this.followingLoading.style.display = "block";
      if (this.followingList) this.followingList.innerHTML = "";

      const res = await fetch(
        `${PROFILE_API_BASE_URL}/users/${encodeURIComponent(this.user.username)}/following`,
        { headers: this.buildOptionalAuthHeaders() }
      );

      const { json, text } = await this.readResponseSafe(res);
      if (!res.ok) throw new Error((json && json.error) || text || "Could not load following");

      const data = json || {};
      this.following = Array.isArray(data.users) ? data.users : [];
      this.followingLoaded = true;

      this.applyFollowCountsFromServer(data);
      this.renderFollowRows("following");
    } catch (err) {
      console.error("fetchFollowing error:", err);
      this.showFollowError(err.message || "Couldn’t load following");
    } finally {
      if (this.followingLoading) this.followingLoading.style.display = "none";
    }
  }

  applyFollowCountsFromServer(data) {
    const followersCount = typeof data.followers_count === "number" ? data.followers_count : null;
    const followingCount = typeof data.following_count === "number" ? data.following_count : null;

    if (followersCount !== null) {
      this.user.followers_count = followersCount;
      if (this.followersCountEl) this.followersCountEl.textContent = String(followersCount);
      if (this.followersTabCount) this.followersTabCount.textContent = String(followersCount);
    }
    if (followingCount !== null) {
      this.user.following_count = followingCount;
      if (this.followingCountEl) this.followingCountEl.textContent = String(followingCount);
      if (this.followingTabCount) this.followingTabCount.textContent = String(followingCount);
    }
  }

  showFollowError(msg) {
    if (!this.followListError) return;
    this.followListError.textContent = msg || "Couldn’t load.";
    this.followListError.classList.remove("hidden");
  }

  renderFollowRows(mode) {
    const listEl = mode === "followers" ? this.followersList : this.followingList;
    if (!listEl) return;

    const arr = mode === "followers" ? this.followers : this.following;
    listEl.innerHTML = "";

    if (!arr.length) {
      listEl.innerHTML = `<div class="loading-indicator">No users found.</div>`;
      return;
    }

    arr.forEach((u) => {
      const row = document.createElement("div");
      row.className = "followlist-row";
      row.dataset.username = u.username;

      const avatar = u.avatar_url || "default-profile.PNG";
      const display = u.display_name || u.username;

      const isFollowing = u.is_following === true;

      let label = "Follow";
      let btnClass = "followlist-action primary";

      if (mode === "followers") {
        // Followers tab: if you don't follow them, show Follow back
        label = isFollowing ? "Following" : "Follow back";
        btnClass = isFollowing ? "followlist-action ghost" : "followlist-action primary";
      } else {
        // Following tab: unfollow -> "Follow"
        label = isFollowing ? "Following" : "Follow";
        btnClass = isFollowing ? "followlist-action ghost" : "followlist-action primary";
      }

      const isMe = this.user && u.username === this.user.username;

      row.innerHTML = `
        <img class="followlist-avatar" src="${avatar}" onerror="this.src='default-profile.PNG'" />
        <div class="followlist-meta">
          <div class="followlist-name">${this.escapeHtml(display)}</div>
          <div class="followlist-username">@${this.escapeHtml(u.username)}</div>
        </div>
        ${
          isMe
            ? ""
            : `<button class="${btnClass}" type="button" data-following="${isFollowing ? "1" : "0"}">
                 ${label}
               </button>`
        }
      `;

      // Click row -> go to user profile page
      row.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (btn) return;
        const uname = row.dataset.username;
        if (!uname) return;
        if (this.user && uname === this.user.username) window.location.href = "profile.html";
        else window.location.href = `user.html?user=${encodeURIComponent(uname)}`;
      });

      const btn = row.querySelector("button");
      if (btn) {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await this.toggleFollowUser(u, btn, mode);
        });
      }

      listEl.appendChild(row);
    });
  }

  // ✅ Follow / Unfollow from followers/following list
  async toggleFollowUser(userObj, btn, mode) {
    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    if (!token) {
      alert("Please log in to follow users.");
      return;
    }

    const username = userObj?.username;
    if (!username) return;

    btn.disabled = true;

    try {
      const res = await fetch(
        `${PROFILE_API_BASE_URL}/users/${encodeURIComponent(username)}/follow`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const { json, text } = await this.readResponseSafe(res);
      if (!res.ok) throw new Error((json && json.error) || text || "Failed to update follow");

      // ✅ Support different server response shapes
      // Prefer: { following: true/false }
      // Also accept: { is_following: true/false } or { followed: true/false }
      const nowFollowing =
        (json && typeof json.following === "boolean" ? json.following : null) ??
        (json && typeof json.is_following === "boolean" ? json.is_following : null) ??
        (json && typeof json.followed === "boolean" ? json.followed : null);

      // If server didn’t return a boolean, flip current state as fallback
      const current = userObj.is_following === true;
      const finalFollowing = typeof nowFollowing === "boolean" ? nowFollowing : !current;

      // Refresh my counts from /auth/me (keeps stats correct)
      await this.fetchCurrentUser();

      // Update row state
      userObj.is_following = finalFollowing;
      btn.dataset.following = finalFollowing ? "1" : "0";

      // Update label + style
      if (mode === "followers") {
        btn.textContent = finalFollowing ? "Following" : "Follow back";
        btn.classList.toggle("primary", !finalFollowing);
        btn.classList.toggle("ghost", finalFollowing);
      } else {
        btn.textContent = finalFollowing ? "Following" : "Follow";
        btn.classList.toggle("primary", !finalFollowing);
        btn.classList.toggle("ghost", finalFollowing);
      }

      // Optional: if you're in Following tab and unfollow, remove from list
      if (mode === "following" && !finalFollowing) {
        this.following = this.following.filter((x) => x.username !== username);
        this.renderFollowRows("following");
      }
    } catch (err) {
      console.error("toggleFollowUser error:", err);
      alert(err.message || "Could not update follow.");
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------- Edit profile ---------------- */

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
      this.avatarEl.src = this.user.avatar_url || "default-profile.PNG";
      this.avatarEl.onerror = () => {
        this.avatarEl.src = "default-profile.PNG";
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

    if (this.postsCountEl) this.postsCountEl.textContent = String(this.user.posts_count || this.posts.length || 0);
    if (this.followersCountEl) this.followersCountEl.textContent = String(this.user.followers_count || 0);
    if (this.followingCountEl) this.followingCountEl.textContent = String(this.user.following_count || 0);

    if (this.followListModal && this.followListModal.classList.contains("open")) {
      if (this.followersTabCount) this.followersTabCount.textContent = String(this.user.followers_count || 0);
      if (this.followingTabCount) this.followingTabCount.textContent = String(this.user.following_count || 0);
    }
  }

  openEditModal() {
    if (!this.editModal || !this.user) return;

    this.editDisplayNameInput.value = this.user.display_name || "";
    this.editBioInput.value = this.user.bio || "";

    if (this.avatarFileInput) this.avatarFileInput.value = "";
    if (this.bannerFileInput) this.bannerFileInput.value = "";

    if (this.editErrorEl) this.editErrorEl.classList.add("hidden");
    if (this.editSuccessEl) this.editSuccessEl.classList.add("hidden");

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

    if (this.editErrorEl) this.editErrorEl.classList.add("hidden");
    if (this.editSuccessEl) this.editSuccessEl.classList.add("hidden");

    if (this.saveProfileBtn) {
      this.saveProfileBtn.disabled = true;
      this.saveProfileBtn.textContent = "Saving...";
    }

    try {
      let avatar_url = this.user.avatar_url || null;
      let banner_url = this.user.banner_url || null;

      if (this.avatarFileInput && this.avatarFileInput.files[0]) {
        avatar_url = await this.uploadImageFile(this.avatarFileInput.files[0], "avatar");
      }

      if (this.bannerFileInput && this.bannerFileInput.files[0]) {
        banner_url = await this.uploadImageFile(this.bannerFileInput.files[0], "banner");
      }

      const token = typeof getAuthToken === "function" ? getAuthToken() : null;
      if (!token) throw new Error("Missing auth token");

      const res = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ display_name, bio, avatar_url, banner_url })
      });

      const { json, text } = await this.readResponseSafe(res);
      if (!res.ok) throw new Error((json && json.error) || text || "Failed to update profile");

      const data = json || null;
      if (!data) throw new Error("Bad response updating profile");

      this.setUser(data);
      if (typeof setCurrentUser === "function") setCurrentUser(data);

      if (this.editSuccessEl) {
        this.editSuccessEl.textContent = "Profile updated!";
        this.editSuccessEl.classList.remove("hidden");
      }

      setTimeout(() => this.closeEditModal(), 700);
    } catch (err) {
      console.error("handleEditSubmit error:", err);
      if (this.editErrorEl) {
        this.editErrorEl.textContent = err.message || "Failed to update profile";
        this.editErrorEl.classList.remove("hidden");
      }
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
      body: JSON.stringify({ imageData: base64, kind })
    });

    const { json, text } = await this.readResponseSafe(res);
    if (!res.ok || !json || !json.url) throw new Error((json && json.error) || text || `Failed to upload ${kind} image`);
    return json.url;
  }

  readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const commaIndex = String(result).indexOf(",");
        if (commaIndex === -1) return resolve(String(result));
        resolve(String(result).slice(commaIndex + 1));
      };
      reader.onerror = () => reject(reader.error || new Error("File read error"));
      reader.readAsDataURL(file);
    });
  }

  switchTab(tabName) {
    this.tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    if (this.postsTabPane) this.postsTabPane.classList.toggle("active", tabName === "posts");
    if (this.likesTabPane) this.likesTabPane.classList.toggle("active", tabName === "likes");

    // ✅ Load the right content when switching
    if (tabName === "posts") {
      this.fetchUserPosts();
    }
    if (tabName === "likes" && !this.likesLoaded) {
      this.fetchUserLikedPosts();
    }
  }

  /* ---------------- Like / Save / Share / Delete ---------------- */

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
      const res = await fetch(`${PROFILE_API_BASE_URL}/posts/${encodeURIComponent(post.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      const { json, text } = await this.readResponseSafe(res);
      if (!res.ok) throw new Error((json && json.error) || text || "Failed to delete post");

      this.posts = this.posts.filter((p) => p.id !== post.id);

      if (articleEl && articleEl.parentElement) {
        articleEl.parentElement.removeChild(articleEl);
      }

      if (this.postsCountEl) this.postsCountEl.textContent = String(this.posts.length);

      const container = this.ensurePostsContainer();
      if (container && !this.posts.length) {
        container.innerHTML = `<div class="empty-state"><h3>No posts yet</h3></div>`;
      }
    } catch (err) {
      console.error("confirmDeletePost error:", err);
      alert(err.message || "Could not delete post.");
    }
  }

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

    const wasLiked = btn.classList.contains("liked") || post.liked_by_me === true || post.is_liked === true;

    let newCount = currentCount + (wasLiked ? -1 : 1);
    if (newCount < 0) newCount = 0;

    // optimistic UI
    btn.classList.toggle("liked", !wasLiked);
    if (icon) {
      icon.classList.remove(wasLiked ? "fa-solid" : "fa-regular");
      icon.classList.add(wasLiked ? "fa-regular" : "fa-solid");
    }
    if (countEl) countEl.textContent = String(newCount);

    try {
      const res = await fetch(`${PROFILE_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      const { json, text } = await this.readResponseSafe(res);
      if (!res.ok) throw new Error((json && json.error) || text || "Failed to update like");

      const data = json || {};
      const serverLikes =
        typeof data.likes === "number" ? data.likes :
        typeof data.like_count === "number" ? data.like_count : null;

      const nowLiked = typeof data.liked === "boolean" ? data.liked : !wasLiked;

      if (serverLikes !== null && countEl) countEl.textContent = String(serverLikes);

      this.updateLocalPostState(post.id, {
        liked_by_me: nowLiked,
        is_liked: nowLiked,
        likes: serverLikes !== null ? serverLikes : newCount,
        like_count: serverLikes !== null ? serverLikes : newCount
      });
    } catch (err) {
      console.error("handleLike error:", err);

      // rollback
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
    const wasSaved = btn.classList.contains("saved") || post.saved_by_me === true || post.is_saved === true;

    // optimistic UI
    btn.classList.toggle("saved", !wasSaved);
    if (icon) {
      icon.classList.remove(wasSaved ? "fa-solid" : "fa-regular");
      icon.classList.add(wasSaved ? "fa-regular" : "fa-solid");
    }

    try {
      const res = await fetch(`${PROFILE_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      const { json, text } = await this.readResponseSafe(res);
      if (!res.ok) throw new Error((json && json.error) || text || "Failed to update save");

      const data = json || {};
      const nowSaved = typeof data.saved === "boolean" ? data.saved : !wasSaved;

      this.updateLocalPostState(post.id, {
        saved_by_me: nowSaved,
        is_saved: nowSaved
      });
    } catch (err) {
      console.error("handleSave error:", err);

      // rollback
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

    const url = `${window.location.origin}/post.html?id=${encodeURIComponent(post.id)}`;

    if (navigator.share) {
      navigator.share({ title: "Check out this post", url }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => alert("Post link copied to clipboard"))
        .catch(() => alert("Post link: " + url));
    } else {
      alert("Post link: " + url);
    }
  }

  updateLocalPostState(postId, changes) {
    const apply = (arr) => {
      const idx = arr.findIndex((p) => p.id === postId);
      if (idx !== -1) arr[idx] = { ...arr[idx], ...changes };
    };
    apply(this.posts);
    apply(this.likedPosts);
  }

  /* ---------------- Helpers ---------------- */

  formatContent(text) {
    const safe = this.escapeHtml(text || "");
    return safe
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  }

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

  escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, (m) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m];
    });
  }
}

/* ---------------- Init ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  // ✅ Don’t require a special body class. If the DOM has profile elements, run.
  const hasProfile =
    document.getElementById("profileDisplayName") ||
    document.getElementById("profileUsername") ||
    document.getElementById("postsTab") ||
    document.getElementById("profilePosts");

  if (hasProfile) {
    const page = new ProfilePage();
    page.init();
    window.profilePage = page;
  }
});
