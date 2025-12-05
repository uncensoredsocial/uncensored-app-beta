// Search Functionality with Supabase Integration + feed-style posts

// Reuse API base from auth.js or fall back
const FEED_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class SearchManager {
  constructor() {
    this.currentQuery = "";
    this.currentFilter = "all";
    this.searchTimeout = null;
    this.isSearching = false;
    this.supabase = null;

    // recent searches paging
    this.recentSearches = [];
    this.recentVisibleCount = 5;

    this.init();
  }

  init() {
    this.initializeSupabase();
    this.setupEventListeners();
    this.loadRecentSearches();
    this.loadTrendingHashtags();
    this.updateUI();
  }

  initializeSupabase() {
    this.supabase = supabase.createClient(
      "https://hbbbsreonwhvqfvbszne.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyOTc5ODYsImV4cCI6MjA3OTg3Mzk4Nn0.LvqmdOqetnMrH8bnkJY6_S-dsGD8gnvpFczSCJPy-Q4"
    );
  }

  setupEventListeners() {
    const searchInput = document.getElementById("searchInput");
    const clearSearch = document.getElementById("clearSearch");
    const filterTabs = document.querySelectorAll(".filter-tab");
    const recentList = document.getElementById("recentList");
    const searchButton = document.getElementById("searchButton");
    const seeMoreBtn = document.getElementById("recentSeeMore");

    // Input / Enter
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.handleSearchInput(e.target.value);
      });

      searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.performSearch(e.target.value.trim());
        }
      });
    }

    // Main search button
    if (searchButton) {
      searchButton.addEventListener("click", () => {
        const value = searchInput ? searchInput.value.trim() : "";
        this.performSearch(value);
      });
    }

    // Clear X
    if (clearSearch) {
      clearSearch.addEventListener("click", () => this.clearSearch());
    }

    // Tabs: All / Users / Posts / Hashtags
    filterTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const filter = tab.dataset.filter;
        this.handleFilterChange(filter);
      });
    });

    // Recent searches: whole row clickable, X removes
    if (recentList) {
      recentList.addEventListener("click", (e) => {
        const clearBtn = e.target.closest(".clear-recent");

        if (clearBtn) {
          const item = clearBtn.closest(".recent-item");
          if (item) this.removeRecentSearch(item.dataset.query);
          return;
        }

        const item = e.target.closest(".recent-item");
        if (item && item.dataset.query) {
          const query = item.dataset.query;
          const input = document.getElementById("searchInput");
          if (input) input.value = query;
          this.performSearch(query);
        }
      });
    }

    // “See more” for recents
    if (seeMoreBtn) {
      seeMoreBtn.addEventListener("click", () => {
        this.recentVisibleCount += 5;
        this.renderRecentSearches();
      });
    }
  }

  /* ---------- CORE SEARCH ---------- */

  handleSearchInput(query) {
    this.currentQuery = query.trim();
    const clearSearchBtn = document.getElementById("clearSearch");

    if (clearSearchBtn) {
      clearSearchBtn.style.display = this.currentQuery ? "flex" : "none";
    }

    if (this.searchTimeout) clearTimeout(this.searchTimeout);

    if (this.currentQuery.length >= 2) {
      this.searchTimeout = setTimeout(
        () => this.performSearch(this.currentQuery),
        300
      );
    } else if (this.currentQuery.length === 0) {
      this.clearSearch();
    }
  }

  async performSearch(query) {
    if (!query || query.length < 2) {
      this.showDefaultState();
      return;
    }

    this.currentQuery = query;
    this.isSearching = true;
    this.showLoadingState();

    try {
      this.saveToRecentSearches(query);

      const results = await this.fetchSearchResults(
        query,
        this.currentFilter
      );

      this.displaySearchResults(results, query);
    } catch (err) {
      console.error("Search error:", err);
      this.showErrorState();
    } finally {
      this.isSearching = false;
    }
  }

  handleFilterChange(filter) {
    if (!filter) return;
    this.currentFilter = filter;

    // Tab active state
    document.querySelectorAll(".filter-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.filter === filter);
    });

    // Re-run search with new filter
    if (this.currentQuery && this.currentQuery.length >= 2) {
      this.performSearch(this.currentQuery);
    }
  }

  async fetchSearchResults(query, filter) {
    const results = { users: [], posts: [], hashtags: [] };
    const currentUser =
      typeof getCurrentUser === "function" ? getCurrentUser() : null;

    /* ----- USERS ----- */
    if (filter === "all" || filter === "users") {
      const { data: users, error } = await this.supabase.rpc("search_users", {
        search_query: query,
        result_limit: 20,
      });

      if (!error && users) {
        const usersWithFollowStatus = await Promise.all(
          users.map(async (user) => {
            let isFollowing = false;

            if (currentUser) {
              const { data: follow } = await this.supabase
                .from("follows")
                .select("id")
                .eq("follower_id", currentUser.id)
                .eq("followed_id", user.id)
                .maybeSingle();

              isFollowing = !!follow;
            }

            return {
              id: user.id,
              username: user.username,
              displayName: user.display_name || user.username,
              avatar: user.avatar_url || "assets/icons/default-profile.png",
              bio: user.bio,
              followersCount: user.followers_count || 0,
              isFollowing,
            };
          })
        );
        results.users = usersWithFollowStatus;
      } else {
        console.error("Error searching users:", error);
      }
    }

    /* ----- POSTS ----- */
    if (filter === "all" || filter === "posts") {
      const { data: posts, error } = await this.supabase.rpc("search_posts", {
        search_query: query,
        result_limit: 20,
      });

      if (!error && posts) {
        results.posts = posts.map((post) => ({
          id: post.id,
          userId: post.user_id,
          content: post.content,
          createdAt: post.created_at,
          likes: post.like_count || post.likes_count || 0,
          comments: post.comment_count || post.comments_count || 0,
          media_url: post.media_url,
          media_type: post.media_type,
          user: {
            username: post.username,
            displayName: post.display_name || post.username,
            avatar: post.avatar_url || "assets/icons/default-profile.png",
          },
        }));
      } else {
        console.error("Error searching posts:", error);
      }
    }

    /* ----- HASHTAGS ----- */
    if (filter === "all" || filter === "hashtags") {
      const { data: hashtags, error } = await this.supabase.rpc(
        "search_hashtags",
        {
          search_query: query,
          result_limit: 20,
        }
      );

      if (!error && hashtags) {
        results.hashtags = hashtags.map((h) => ({
          name: h.tag,
          count: h.posts_count || 0,
          recentCount: h.recent_posts_count || 0,
        }));
      } else {
        console.error("Error searching hashtags:", error);
      }
    }

    // Optional logging
    if (currentUser) {
      const totalResults = Object.values(results).reduce(
        (total, section) => total + section.length,
        0
      );
      await this.supabase.rpc("log_search", {
        search_user_id: currentUser.id,
        search_query: query,
        search_results_count: totalResults,
        search_type: filter,
      });
    }

    return results;
  }

  displaySearchResults(results, query) {
    this.hideAllStates();

    const state = document.getElementById("searchResultsState");
    const title = document.getElementById("resultsTitle");
    const count = document.getElementById("resultsCount");

    if (!state || !title || !count) return;

    state.style.display = "block";
    title.textContent = `Results for "${query}"`;

    const totalResults = Object.values(results).reduce(
      (total, section) => total + section.length,
      0
    );
    count.textContent = `${totalResults} results`;

    this.displayUsersResults(results.users);
    this.displayPostsResults(results.posts);
    this.displayHashtagsResults(results.hashtags);

    if (totalResults === 0) this.showNoResults();
  }

  /* ---------- USERS SECTION ---------- */

  displayUsersResults(users) {
    const list = document.getElementById("usersList");
    const section = document.getElementById("usersResults");
    if (!list || !section) return;

    if (!users.length) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    list.innerHTML = users
      .map(
        (user) => `
      <div class="user-card" data-username="${user.username}">
        <img src="${user.avatar}" alt="${this.escapeHtml(
          user.displayName
        )}" class="user-avatar"
          onerror="this.src='assets/icons/default-profile.png'">
        <div class="user-info">
          <div class="user-name">${this.escapeHtml(user.displayName)}</div>
          <div class="user-handle">@${user.username}</div>
          ${
            user.bio
              ? `<div class="user-bio">${this.escapeHtml(user.bio)}</div>`
              : ""
          }
          <div class="user-stats">
            <span class="follower-count">${user.followersCount.toLocaleString()} followers</span>
          </div>
        </div>
        <button
          class="btn btn-sm ${
            user.isFollowing ? "btn-secondary" : "btn-primary"
          } follow-btn"
          onclick="searchManager.handleFollow('${user.id}', this)"
          ${typeof getCurrentUser !== "function" ? "disabled" : ""}
        >
          ${user.isFollowing ? "Following" : "Follow"}
        </button>
      </div>
    `
      )
      .join("");

    // Clicking card -> profile
    list.querySelectorAll(".user-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".follow-btn")) return;
        const username = card.dataset.username;
        const me =
          typeof getCurrentUser === "function" ? getCurrentUser() : null;
        if (me && me.username === username) {
          window.location.href = "profile.html";
        } else {
          window.location.href = `user.html?user=${encodeURIComponent(
            username
          )}`;
        }
      });
    });
  }

  /* ---------- POSTS SECTION (feed-style) ---------- */

  displayPostsResults(posts) {
    const list = document.getElementById("postsList");
    const section = document.getElementById("postsResults");
    if (!list || !section) return;

    if (!posts.length) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    list.innerHTML = posts
      .map((post) => {
        const avatar = post.user.avatar || "assets/icons/default-profile.png";
        const username = post.user.username || "unknown";
        const displayName = post.user.displayName || username;
        const time = this.formatTime(post.createdAt);
        const mediaHtml = this.renderMediaHtml(
          post.media_url,
          post.media_type
        );

        return `
      <article class="post" data-post-id="${post.id}">
        <header class="post-header">
          <div class="post-user" data-username="${this.escapeHtml(username)}">
            <img class="post-user-avatar" src="${avatar}"
              onerror="this.src='assets/icons/default-profile.png'">
            <div class="post-user-info">
              <span class="post-display-name">${this.escapeHtml(
                displayName
              )}</span>
              <span class="post-username">@${this.escapeHtml(username)}</span>
            </div>
          </div>
          <span class="post-time">${time}</span>
        </header>

        <div class="post-content">
          ${this.formatPostContent(post.content)}
        </div>
        ${mediaHtml}

        <footer class="post-footer">
          <div class="post-actions">
            <button class="post-action like-btn">
              <span class="icon icon-like"></span>
              <span class="post-action-count like-count">${post.likes}</span>
            </button>
            <button class="post-action comment-btn">
              <span class="icon icon-comment"></span>
              <span class="post-action-count comment-count">${post.comments}</span>
            </button>
            <button class="post-action share-btn">
              <span class="icon icon-share"></span>
            </button>
            <button class="post-action save-btn">
              <span class="icon icon-save"></span>
            </button>
          </div>
        </footer>
      </article>
    `;
      })
      .join("");

    this.attachPostEvents();
  }

  renderMediaHtml(url, type) {
    if (!url) return "";
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

  attachPostEvents() {
    const posts = document.querySelectorAll("#postsList .post");
    posts.forEach((postEl) => {
      const postId = postEl.dataset.postId;

      // whole card -> post page (except actions / user)
      postEl.addEventListener("click", (e) => {
        if (
          e.target.closest(".post-actions") ||
          e.target.closest(".post-user")
        )
          return;
        window.location.href = `post.html?id=${postId}`;
      });

      // avatar / username -> profile
      const userEl = postEl.querySelector(".post-user");
      if (userEl) {
        userEl.addEventListener("click", (e) => {
          e.stopPropagation();
          const username = userEl.dataset.username;
          const me =
            typeof getCurrentUser === "function" ? getCurrentUser() : null;
          if (me && me.username === username) {
            window.location.href = "profile.html";
          } else {
            window.location.href = `user.html?user=${encodeURIComponent(
              username
            )}`;
          }
        });
      }

      const likeBtn = postEl.querySelector(".like-btn");
      if (likeBtn) {
        likeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.handleLike(postId, likeBtn);
        });
      }

      const commentBtn = postEl.querySelector(".comment-btn");
      if (commentBtn) {
        commentBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          window.location.href = `post.html?id=${postId}#comments`;
        });
      }

      const shareBtn = postEl.querySelector(".share-btn");
      if (shareBtn) {
        shareBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const url = `${window.location.origin}/post.html?id=${postId}`;
          navigator.clipboard.writeText(url).catch(() => {});
          this.showMessage("Link copied!", "success");
        });
      }

      const saveBtn = postEl.querySelector(".save-btn");
      if (saveBtn) {
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.handleSave(postId, saveBtn);
        });
      }
    });
  }

  /* ---------- HASHTAGS SECTION ---------- */

  displayHashtagsResults(hashtags) {
    const list = document.getElementById("hashtagsList");
    const section = document.getElementById("hashtagsResults");
    if (!list || !section) return;

    if (!hashtags.length) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    list.innerHTML = hashtags
      .map(
        (h) => `
      <a href="hashtag.html?tag=${encodeURIComponent(
        h.name
      )}" class="hashtag-item">
        <span class="icon icon-feeds hashtag-icon"></span>
        <div class="hashtag-info">
          <div class="hashtag-name">#${h.name}</div>
          <div class="hashtag-count">${h.count.toLocaleString()} posts</div>
          ${
            h.recentCount > 0
              ? `<div class="hashtag-recent">${h.recentCount} recent</div>`
              : ""
          }
        </div>
      </a>
    `
      )
      .join("");
  }

  /* ---------- FOLLOW / LIKE / SAVE ---------- */

  async handleFollow(userId, button) {
    const currentUser =
      typeof getCurrentUser === "function" ? getCurrentUser() : null;
    if (!currentUser) {
      this.showMessage("Please log in to follow users", "error");
      return;
    }

    try {
      const isFollowing = button.textContent.trim() === "Following";

      if (isFollowing) {
        const { error } = await this.supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("followed_id", userId);

        if (error) throw error;

        button.textContent = "Follow";
        button.classList.remove("btn-secondary");
        button.classList.add("btn-primary");
        this.showMessage("Unfollowed user", "success");
      } else {
        const { error } = await this.supabase.from("follows").insert({
          follower_id: currentUser.id,
          followed_id: userId,
        });

        if (error) throw error;

        button.textContent = "Following";
        button.classList.remove("btn-primary");
        button.classList.add("btn-secondary");
        this.showMessage("Followed user", "success");
      }
    } catch (err) {
      console.error("Follow error:", err);
      this.showMessage("Failed to follow user", "error");
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

  async handleLike(postId, btn) {
    const user =
      typeof getCurrentUser === "function" ? getCurrentUser() : null;
    if (!user) return this.showMessage("Log in to like posts", "error");

    const token = this.getAuthToken();
    if (!token) return this.showMessage("Missing token", "error");

    const countEl = btn.querySelector(".like-count");
    let count = parseInt(countEl.textContent || "0", 10) || 0;
    const wasLiked = btn.classList.contains("liked");

    // optimistic UI
    if (wasLiked) {
      btn.classList.remove("liked");
      count = Math.max(0, count - 1);
    } else {
      btn.classList.add("liked");
      count += 1;
    }
    countEl.textContent = String(count);

    try {
      const res = await fetch(`${FEED_API_BASE_URL}/posts/${postId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
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
    } catch (err) {
      console.error(err);
      this.showMessage("Failed to update like", "error");
    }
  }

  async handleSave(postId, btn) {
    const user =
      typeof getCurrentUser === "function" ? getCurrentUser() : null;
    if (!user) return this.showMessage("Log in to save posts", "error");

    const token = this.getAuthToken();
    if (!token) return this.showMessage("Missing token", "error");

    const wasSaved = btn.classList.contains("saved");

    if (wasSaved) {
      btn.classList.remove("saved");
    } else {
      btn.classList.add("saved");
    }

    try {
      const res = await fetch(`${FEED_API_BASE_URL}/posts/${postId}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update save");
    } catch (err) {
      console.error(err);
      this.showMessage("Failed to update save", "error");
    }
  }

  /* ---------- STATE HELPERS ---------- */

  clearSearch() {
    const input = document.getElementById("searchInput");
    const clearBtn = document.getElementById("clearSearch");
    if (input) {
      input.value = "";
      input.focus();
    }
    if (clearBtn) clearBtn.style.display = "none";

    this.currentQuery = "";
    this.showDefaultState();
  }

  showDefaultState() {
    this.hideAllStates();
    const el = document.getElementById("searchDefault");
    if (el) el.style.display = "block";
  }

  showLoadingState() {
    this.hideAllStates();
    const el = document.getElementById("searchLoading");
    if (el) el.style.display = "block";
  }

  showNoResults() {
    const noResults = document.getElementById("noResults");
    const state = document.getElementById("searchResultsState");
    if (state) state.style.display = "block";
    if (noResults) noResults.style.display = "block";
  }

  showErrorState() {
    this.hideAllStates();
    this.showNoResults();
  }

  hideAllStates() {
    ["searchDefault", "searchLoading", "searchResultsState", "noResults"].forEach(
      (id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      }
    );
    ["usersResults", "postsResults", "hashtagsResults"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  }

  /* ---------- RECENT SEARCHES ---------- */

  loadRecentSearches() {
    const fromStorage = JSON.parse(
      localStorage.getItem("recentSearches") || "[]"
    );
    this.recentSearches = fromStorage;
    this.recentVisibleCount = 5;
    this.renderRecentSearches();
  }

  renderRecentSearches() {
    const list = document.getElementById("recentList");
    const seeMoreBtn = document.getElementById("recentSeeMore");
    if (!list) return;

    if (!this.recentSearches.length) {
      list.innerHTML =
        '<div class="recent-item"><span class="recent-query">No recent searches</span></div>';
      if (seeMoreBtn) seeMoreBtn.style.display = "none";
      return;
    }

    const visible = this.recentSearches.slice(0, this.recentVisibleCount);
    list.innerHTML = visible
      .map(
        (q) => `
      <div class="recent-item" data-query="${this.escapeHtml(q)}">
        <span class="recent-query">${this.escapeHtml(q)}</span>
        <button class="btn btn-ghost btn-icon clear-recent" title="Remove from history">
          <span class="icon icon-close"></span>
        </button>
      </div>
    `
      )
      .join("");

    if (seeMoreBtn) {
      if (this.recentVisibleCount >= this.recentSearches.length) {
        seeMoreBtn.style.display = "none";
      } else {
        seeMoreBtn.style.display = "inline-flex";
      }
    }
  }

  saveToRecentSearches(query) {
    let recent = JSON.parse(localStorage.getItem("recentSearches") || "[]");
    recent = recent.filter((q) => q !== query);
    recent.unshift(query);
    recent = recent.slice(0, 50); // keep history but not infinite
    localStorage.setItem("recentSearches", JSON.stringify(recent));

    this.recentSearches = recent;
    this.recentVisibleCount = 5;
    this.renderRecentSearches();
  }

  removeRecentSearch(query) {
    let recent = JSON.parse(localStorage.getItem("recentSearches") || "[]");
    recent = recent.filter((q) => q !== query);
    localStorage.setItem("recentSearches", JSON.stringify(recent));
    this.recentSearches = recent;
    this.recentVisibleCount = 5;
    this.renderRecentSearches();
  }

  /* ---------- TRENDING ---------- */

  async loadTrendingHashtags() {
    try {
      const { data: trending, error } = await this.supabase.rpc(
        "get_trending_hashtags",
        {
          limit_count: 10,
          days_back: 7,
        }
      );

      if (!error && trending) {
        const list = document.querySelector(".trending-list");
        if (list) {
          list.innerHTML = trending
            .map(
              (item, index) => `
            <div class="trending-item" onclick="searchManager.searchHashtag('${
              item.tag
            }')">
              <span class="trending-rank">${index + 1}</span>
              <div class="trending-content">
                <span class="trending-tag">#${item.tag}</span>
                <span class="trending-count">${item.posts_count.toLocaleString()} posts</span>
              </div>
            </div>
          `
            )
            .join("");
        }
      } else {
        this.loadMockTrendingHashtags();
      }
    } catch (err) {
      console.error("Error loading trending hashtags:", err);
      this.loadMockTrendingHashtags();
    }
  }

  loadMockTrendingHashtags() {
    const mock = [
      { tag: "SocialMedia", posts_count: 2540 },
      { tag: "Tech", posts_count: 1820 },
      { tag: "Uncensored", posts_count: 1200 },
      { tag: "Freedom", posts_count: 950 },
      { tag: "Community", posts_count: 870 },
    ];
    const list = document.querySelector(".trending-list");
    if (!list) return;
    list.innerHTML = mock
      .map(
        (item, index) => `
      <div class="trending-item" onclick="searchManager.searchHashtag('${item.tag}')">
        <span class="trending-rank">${index + 1}</span>
        <div class="trending-content">
          <span class="trending-tag">#${item.tag}</span>
          <span class="trending-count">${item.posts_count.toLocaleString()} posts</span>
        </div>
      </div>
    `
      )
      .join("");
  }

  searchHashtag(tag) {
    const input = document.getElementById("searchInput");
    if (input) input.value = `#${tag}`;
    this.performSearch(`#${tag}`);
  }

  /* ---------- UTIL ---------- */

  showMessage(message, type = "info") {
    const existing = document.querySelector(".status-message");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.className = `status-message status-${type}`;
    el.textContent = message;
    el.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      max-width: 90%;
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: 500;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  formatTime(ts) {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now - date;
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);

    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    if (hrs < 24) return `${hrs}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  }

  formatPostContent(content) {
    if (!content) return "";
    let formatted = this.escapeHtml(content);
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener" style="color: var(--primary-color); text-decoration: none;">$1</a>'
    );
    formatted = formatted.replace(
      /#(\w+)/g,
      '<span style="color: var(--primary-color); font-weight: 500;">#$1</span>'
    );
    formatted = formatted.replace(
      /@(\w+)/g,
      '<span style="color: var(--primary-color); font-weight: 500;">@$1</span>'
    );
    return formatted;
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  updateUI() {
    // Search page header is just centered logo now, nothing extra.
  }
}

let searchManager;
document.addEventListener("DOMContentLoaded", () => {
  searchManager = new SearchManager();
  window.searchManager = searchManager;
});
