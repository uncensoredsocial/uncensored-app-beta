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

    // keep last results so we can update them if needed
    this.lastResults = { users: [], posts: [], hashtags: [] };

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

    if (searchButton) {
      searchButton.addEventListener("click", () => {
        const value = searchInput ? searchInput.value.trim() : "";
        this.performSearch(value);
      });
    }

    if (clearSearch) {
      clearSearch.addEventListener("click", () => this.clearSearch());
    }

    filterTabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const filter = e.target.dataset.filter;
        this.handleFilterChange(filter);
        
        // Update active state
        filterTabs.forEach(t => t.classList.remove("active"));
        e.target.classList.add("active");
      });
    });

    // recent searches: click anywhere on the row to search, X to remove
    if (recentList) {
      recentList.addEventListener("click", (e) => {
        const clearBtn = e.target.closest(".clear-recent");
        if (clearBtn) {
          const item = clearBtn.closest(".recent-item");
          if (item) this.removeRecentSearch(item.dataset.query);
          return;
        }

        const item = e.target.closest(".recent-item");
        if (item) {
          const query = item.dataset.query || "";
          const input = document.getElementById("searchInput");
          if (input) input.value = query;
          this.performSearch(query);
        }
      });
    }

    // See more button
    if (seeMoreBtn) {
      seeMoreBtn.addEventListener("click", () => {
        this.recentVisibleCount += 5;
        this.renderRecentSearches();
      });
    }
  }

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
    this.showLoadingAnimation();

    try {
      this.saveToRecentSearches(query);

      const results = await this.fetchSearchResults(query, this.currentFilter);

      this.lastResults = results;
      this.hideLoadingAnimation();
      this.displaySearchResults(results, query);
    } catch (err) {
      console.error("Search error:", err);
      this.hideLoadingAnimation();
      this.showErrorState();
    } finally {
      this.isSearching = false;
    }
  }

  handleFilterChange(filter) {
    if (!filter || filter === this.currentFilter) return;
    this.currentFilter = filter;

    if (this.currentQuery && this.currentQuery.length >= 2) {
      this.performSearch(this.currentQuery);
    }
  }

  async fetchSearchResults(query, filter) {
    const results = { users: [], posts: [], hashtags: [] };
    const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;

    try {
      // Use your backend API for search
      const token = this.getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const response = await fetch(`${FEED_API_BASE_URL}/search?q=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Always get ALL results from backend
      const allUsers = (data.users || []).map(user => ({
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        avatar: user.avatar_url || 'default-profile.PNG',
        bio: user.bio || '',
        followersCount: 0,
        isFollowing: false
      }));

      const allPosts = (data.posts || []).map(post => ({
        id: post.id,
        userId: post.user_id,
        content: post.content,
        createdAt: post.created_at,
        likes: post.likes || 0,
        comments: post.comments_count || 0,
        saves: post.saves_count || 0,
        media_url: post.media_url,
        media_type: post.media_type,
        liked_by_me: post.liked_by_me || false,
        saved_by_me: post.saved_by_me || false,
        user: post.user || {
          username: 'unknown',
          displayName: 'Unknown User',
          avatar: 'default-profile.PNG'
        }
      }));

      const allHashtags = (data.hashtags || []).map(tag => ({
        name: tag.tag,
        count: 0
      }));

      // Filter based on selected filter
      if (filter === 'all' || filter === 'users') {
        results.users = allUsers;
      }
      if (filter === 'all' || filter === 'posts') {
        results.posts = allPosts;
      }
      if (filter === 'all' || filter === 'hashtags') {
        results.hashtags = allHashtags;
      }

      // Check follow status for users
      if (currentUser && results.users.length > 0) {
        const usersWithFollowStatus = await Promise.all(
          results.users.map(async (user) => {
            let isFollowing = false;

            const { data: follow } = await this.supabase
              .from("follows")
              .select("id")
              .eq("follower_id", currentUser.id)
              .eq("followed_id", user.id)
              .maybeSingle();

            isFollowing = !!follow;

            return {
              ...user,
              isFollowing
            };
          })
        );
        results.users = usersWithFollowStatus;
      }

      // Enrich posts with engagement numbers
      if (results.posts.length > 0) {
        await this.enrichPostsFromApi(results.posts);
      }

      // Save search to history if user is logged in
      if (token && query) {
        try {
          await fetch(`${FEED_API_BASE_URL}/search/history`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ query })
          });
        } catch (err) {
          console.error('Failed to save search history:', err);
        }
      }

    } catch (err) {
      console.error('Search API error:', err);
      // Fallback to direct Supabase query if backend fails
      await this.fallbackSearch(query, filter, results, currentUser);
    }

    return results;
  }

  async fallbackSearch(query, filter, results, currentUser) {
    const pattern = `%${query}%`;
    
    // Simple fallback search
    if (filter === 'all' || filter === 'users') {
      const { data: users, error } = await this.supabase
        .from('users')
        .select('id,username,display_name,avatar_url,bio')
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .limit(10);
      
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
              avatar: user.avatar_url || 'default-profile.PNG',
              bio: user.bio || '',
              followersCount: 0,
              isFollowing
            };
          })
        );
        results.users = usersWithFollowStatus;
      }
    }

    if (filter === 'all' || filter === 'posts') {
      const { data: posts, error } = await this.supabase
        .from('posts')
        .select(`
          id, user_id, content, created_at, media_url, media_type,
          user:users (id, username, display_name, avatar_url)
        `)
        .ilike('content', pattern)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (!error && posts) {
        results.posts = posts.map(post => ({
          id: post.id,
          userId: post.user_id,
          content: post.content,
          createdAt: post.created_at,
          likes: 0,
          comments: 0,
          saves: 0,
          media_url: post.media_url,
          media_type: post.media_type,
          liked_by_me: false,
          saved_by_me: false,
          user: post.user || {
            username: 'unknown',
            displayName: 'Unknown User',
            avatar: 'default-profile.PNG'
          }
        }));

        // Enrich these posts with engagement numbers
        if (results.posts.length) {
          await this.enrichPostsFromApi(results.posts);
        }
      }
    }

    if (filter === 'all' || filter === 'hashtags') {
      const { data: hashtags, error } = await this.supabase
        .from('hashtags')
        .select('id,tag')
        .ilike('tag', pattern)
        .limit(10);
      
      if (!error && hashtags) {
        results.hashtags = hashtags.map(tag => ({
          name: tag.tag,
          count: 0
        }));
      }
    }
  }

  /**
   * Enrich posts with real engagement numbers from backend API
   * Uses the same endpoint the feed / post page uses, so counts match everywhere.
   */
  async enrichPostsFromApi(posts) {
    const token = this.getAuthToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    await Promise.all(
      posts.map(async (post) => {
        try {
          const res = await fetch(`${FEED_API_BASE_URL}/posts/${post.id}`, {
            method: "GET",
            headers,
          });

          if (!res.ok) return;

          const data = await res.json();
          const row = data.post || data;
          if (!row) return;

          const likes =
            typeof row.likes === "number"
              ? row.likes
              : row.like_count ?? row.likes_count ?? 0;

          const comments =
            typeof row.comments === "number"
              ? row.comments
              : row.comment_count ?? row.comments_count ?? 0;

          const saves =
            typeof row.saves === "number"
              ? row.saves
              : row.save_count ??
                row.saves_count ??
                row.bookmarks_count ??
                0;

          post.likes = likes;
          post.comments = comments;
          post.saves = saves;

          post.liked_by_me =
            row.liked_by_me ?? row.is_liked ?? post.liked_by_me;
          post.saved_by_me =
            row.saved_by_me ?? row.is_saved ?? post.saved_by_me;
        } catch (err) {
          console.error("Failed to enrich post engagement", err);
        }
      })
    );
  }

  displaySearchResults(results, query) {
    this.hideAllStates();
    this.hideLoadingAnimation();

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

    const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;

    section.style.display = "block";
    list.innerHTML = users
      .map((user) => {
        const isMe = currentUser && currentUser.id === user.id;

        const followButtonHtml = isMe
          ? `<span class="you-pill">You</span>`
          : `<button
          class="btn btn-sm ${
            user.isFollowing ? "btn-secondary" : "btn-primary"
          } follow-btn"
          onclick="searchManager.handleFollow('${user.id}', this)"
          ${!getCurrentUser ? "disabled" : ""}
        >
          ${user.isFollowing ? "Following" : "Follow"}
        </button>`;

        return `
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
        ${followButtonHtml}
      </div>
    `;
      })
      .join("");

    // Clicking card -> go to user.html/profile
    list.querySelectorAll(".user-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".follow-btn")) return;
        const username = card.dataset.username;
        const me = typeof getCurrentUser === "function" ? getCurrentUser() : null;
        if (me && me.username === username) {
          window.location.href = "profile.html?from=search";
        } else {
          window.location.href = `user.html?user=${encodeURIComponent(username)}`;
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
        const avatar = post.user.avatar || "default-profile.PNG";
        const username = post.user.username || "unknown";
        const displayName = post.user.displayName || username;
        const time = this.formatTime(post.createdAt);
        const liked = post.liked_by_me;
        const saved = post.saved_by_me;

        const likeCount = post.likes || 0;
        const commentCount = post.comments || 0;
        const saveCount = post.saves || 0;

        const mediaHtml = this.renderMediaHtml(post.media_url, post.media_type);

        return `
      <article class="post" data-post-id="${post.id}">
        <header class="post-header">
          <div class="post-user" data-username="${this.escapeHtml(username)}">
            <img class="post-avatar" src="${avatar}"
              onerror="this.src='default-profile.PNG'">
            <div class="post-user-meta">
              <span class="post-display-name">${this.escapeHtml(displayName)}</span>
              <span class="post-username">@${this.escapeHtml(username)}</span>
            </div>
          </div>
          <span class="post-time">${time}</span>
        </header>

        <div class="post-body">
          <div class="post-text">
            ${this.formatPostContent(post.content)}
          </div>
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
                    style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center;">
              <i class="fa-${saved ? "solid" : "regular"} fa-bookmark"></i>
              <span class="save-count">${saveCount}</span>
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

      // click whole card -> post page (unless clicking actions / user)
      postEl.addEventListener("click", (e) => {
        if (e.target.closest(".post-actions") || e.target.closest(".post-user")) return;
        window.location.href = `post.html?id=${postId}`;
      });

      // avatar / username -> profile
      const userEl = postEl.querySelector(".post-user");
      if (userEl) {
        userEl.addEventListener("click", (e) => {
          e.stopPropagation();
          const username = userEl.dataset.username;
          const me = typeof getCurrentUser === "function" ? getCurrentUser() : null;
          if (me && me.username === username) {
            window.location.href = "profile.html";
          } else {
            window.location.href = `user.html?user=${encodeURIComponent(username)}`;
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
      <a href="hashtag.html?tag=${encodeURIComponent(h.name)}" class="hashtag-item">
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

  /* ---------- LOADING ANIMATION ---------- */
  
  showLoadingAnimation() {
    this.hideAllStates();
    
    // Remove any existing loading animation
    const existingLoader = document.getElementById("searchLoadingAnimation");
    if (existingLoader) existingLoader.remove();
    
    // Create loading animation
    const loader = document.createElement("div");
    loader.id = "searchLoadingAnimation";
    loader.innerHTML = `
      <div class="loading-animation">
        <div class="loading-spinner"></div>
        <div class="loading-text">Searching...</div>
        <div class="loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    `;
    
    // Add CSS for the animation
    const style = document.createElement("style");
    style.textContent = `
      .loading-animation {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
      }
      
      .loading-spinner {
        width: 50px;
        height: 50px;
        border: 4px solid rgba(0, 0, 0, 0.1);
        border-radius: 50%;
        border-top-color: var(--primary-color, #3498db);
        animation: spin 1s ease-in-out infinite;
        margin-bottom: 20px;
      }
      
      .loading-text {
        font-size: 18px;
        font-weight: 500;
        color: var(--text-color, #333);
        margin-bottom: 15px;
      }
      
      .loading-dots {
        display: flex;
        gap: 8px;
      }
      
      .loading-dots .dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: var(--primary-color, #3498db);
        animation: bounce 1.4s infinite ease-in-out both;
      }
      
      .loading-dots .dot:nth-child(1) {
        animation-delay: -0.32s;
      }
      
      .loading-dots .dot:nth-child(2) {
        animation-delay: -0.16s;
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      @keyframes bounce {
        0%, 80%, 100% { 
          transform: scale(0);
          opacity: 0.5;
        }
        40% { 
          transform: scale(1);
          opacity: 1;
        }
      }
    `;
    
    document.head.appendChild(style);
    
    // Find where to insert the loader
    const resultsContainer = document.getElementById("searchResultsState") || 
                            document.getElementById("searchDefault") ||
                            document.querySelector(".search-results") ||
                            document.querySelector(".search-container");
    
    if (resultsContainer) {
      resultsContainer.style.display = "block";
      resultsContainer.innerHTML = "";
      resultsContainer.appendChild(loader);
    } else {
      // Fallback: insert at beginning of body
      document.body.insertBefore(loader, document.body.firstChild);
    }
  }
  
  hideLoadingAnimation() {
    const loader = document.getElementById("searchLoadingAnimation");
    if (loader) loader.remove();
  }

  /* ---------- FOLLOW / LIKE / SAVE ---------- */

  async handleFollow(userId, button) {
    const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;
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
    const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    if (!user) return this.showMessage("Log in to like posts", "error");

    const token = this.getAuthToken();
    if (!token) return this.showMessage("Missing token", "error");

    const countEl = btn.querySelector(".like-count");
    const icon = btn.querySelector("i");

    const wasLiked = btn.classList.contains("liked");
    let newCount = parseInt(countEl.textContent || "0", 10);
    if (Number.isNaN(newCount)) newCount = 0;

    // Optimistic UI
    if (wasLiked) {
      btn.classList.remove("liked");
      if (icon) icon.classList.replace("fa-solid", "fa-regular");
      newCount--;
    } else {
      btn.classList.add("liked");
      if (icon) icon.classList.replace("fa-regular", "fa-solid");
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

      const serverLikes = typeof data.likes === "number" ? data.likes : typeof data.like_count === "number" ? data.like_count : null;

      if (serverLikes !== null) {
        countEl.textContent = String(serverLikes);
      }
    } catch (err) {
      console.error(err);
      this.showMessage("Failed to update like", "error");
    }
  }

  async handleSave(postId, btn) {
    const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    if (!user) return this.showMessage("Log in to save posts", "error");

    const token = this.getAuthToken();
    if (!token) return this.showMessage("Missing token", "error");

    const icon = btn.querySelector("i");
    const wasSaved = btn.classList.contains("saved");

    // Optimistic UI
    if (wasSaved) {
      btn.classList.remove("saved");
      if (icon) icon.classList.replace("fa-solid", "fa-regular");
    } else {
      btn.classList.add("saved");
      if (icon) icon.classList.replace("fa-regular", "fa-solid");
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
    this.showLoadingAnimation();
  }

  showNoResults() {
    const noResults = document.getElementById("noResults");
    const state = document.getElementById("searchResultsState");
    if (state) {
      state.style.display = "block";
      // Don't clear the results sections, just show no results message
      const existingMessage = state.querySelector(".no-results-message");
      if (!existingMessage) {
        const message = document.createElement("div");
        message.className = "no-results-message";
        message.textContent = "No results found";
        state.appendChild(message);
      }
    }
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
    this.hideLoadingAnimation();
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
    recent = recent.slice(0, 50);
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

      const list = document.querySelector(".trending-list");
      if (!list) return;

      if (!error && trending && trending.length) {
        list.innerHTML = trending
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
      } else {
        // Try a direct query if the RPC doesn't exist
        await this.loadTrendingHashtagsFallback();
      }
    } catch (err) {
      console.error("Error loading trending hashtags:", err);
      await this.loadTrendingHashtagsFallback();
    }
  }

  async loadTrendingHashtagsFallback() {
    try {
      // Simple fallback: get hashtags with most posts
      const { data: hashtags, error } = await this.supabase
        .from('hashtags')
        .select('tag')
        .limit(10);

      const list = document.querySelector(".trending-list");
      if (!list) return;

      if (!error && hashtags && hashtags.length) {
        list.innerHTML = hashtags
          .map(
            (item, index) => `
            <div class="trending-item" onclick="searchManager.searchHashtag('${item.tag}')">
              <span class="trending-rank">${index + 1}</span>
              <div class="trending-content">
                <span class="trending-tag">#${item.tag}</span>
                <span class="trending-count">trending</span>
              </div>
            </div>
          `
          )
          .join("");
      } else {
        list.innerHTML =
          '<div class="trending-empty">No trending hashtags yet</div>';
      }
    } catch (err) {
      console.error("Fallback trending hashtags error:", err);
      const list = document.querySelector(".trending-list");
      if (list) {
        list.innerHTML =
          '<div class="trending-empty">No trending hashtags yet</div>';
      }
    }
  }

  searchHashtag(tag) {
    const input = document.getElementById("searchInput");
    const q = `#${tag}`;
    if (input) input.value = q;
    this.performSearch(q);
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
    // header on search page is centered logo only, so nothing special to do now
  }
}

let searchManager;
document.addEventListener("DOMContentLoaded", () => {
  searchManager = new SearchManager();
  window.searchManager = searchManager;
});
