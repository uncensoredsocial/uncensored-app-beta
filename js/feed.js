// js/feed.js

// Use global API_BASE_URL from auth.js if available
const FEED_API_BASE_URL =
  typeof API_BASE_URL !== 'undefined'
    ? API_BASE_URL
    : 'https://uncensored-app-beta-production.up.railway.app/api';

class FeedManager {
  constructor() {
    this.posts = [];
    this.isLoading = false;
    this.isPosting = false;
    this.currentMode = 'recent'; // 'recent' | 'popular'
    this.hasMore = true;
    this.page = 1;
    this.pageSize = 20;

    // media state
    this.selectedMediaFile = null;
    this.selectedMediaPreviewUrl = null;
  }

  async init() {
    try {
      this.cacheDom();
      this.bindEvents();
      this.updateAuthUI();
      await this.loadPosts(true);
    } catch (error) {
      console.error('Error initializing feed manager:', error);
      this.showMessage('Failed to initialize feed', 'error');
    }
  }

  /* ----------------------- DOM CACHE ----------------------- */

  cacheDom() {
    // feed + composer
    this.feedContainer = document.getElementById('feedContainer');
    this.postInput = document.getElementById('postInput');
    this.postButton = document.getElementById('postButton');
    this.mediaInput = document.getElementById('mediaInput');
    this.mediaPreviewWrapper = document.getElementById('mediaPreviewWrapper');
    this.mediaPreview = document.getElementById('mediaPreview');
    this.mediaRemoveBtn = document.getElementById('mediaRemoveBtn');
    this.feedModeTabs = document.querySelectorAll('[data-feed-mode]');

    // loading / empty states
    this.feedLoading = document.getElementById('feedLoading');
    this.feedEmpty = document.getElementById('feedEmpty');

    // auth UI
    this.profileSection = document.getElementById('profileSection');
    this.authButtons = document.getElementById('authButtons');
    this.headerProfileImg = document.getElementById('headerProfileImg');

    console.log('DOM cached:', {
      feedContainer: !!this.feedContainer,
      feedLoading: !!this.feedLoading,
      feedEmpty: !!this.feedEmpty
    });
  }

  /* ----------------------- LOAD POSTS - FIXED VERSION ----------------------- */

  async loadPosts(reset = false) {
    if (this.isLoading || (!this.hasMore && !reset)) {
      console.log('Skipping loadPosts:', { isLoading: this.isLoading, hasMore: this.hasMore, reset });
      return;
    }
    
    this.isLoading = true;

    if (reset) {
      this.showLoadingState();
    }

    try {
      console.log('Loading posts:', {
        mode: this.currentMode,
        page: this.page,
        reset: reset
      });

      // Try different endpoint variations - some APIs use different paths
      const endpoints = [
        `${FEED_API_BASE_URL}/posts`,
        `${FEED_API_BASE_URL}/feed`,
        `${FEED_API_BASE_URL}/posts/all`
      ];

      let posts = [];
      let lastError = null;

      // Try each endpoint until one works
      for (const endpoint of endpoints) {
        try {
          const url = new URL(endpoint);
          url.searchParams.set('mode', this.currentMode);
          url.searchParams.set('page', this.page.toString());
          url.searchParams.set('limit', this.pageSize.toString());

          const token = this.getAuthToken();
          const headers = {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          };

          console.log('Fetching from:', url.toString());
          
          const res = await fetch(url.toString(), { headers });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }

          const data = await res.json();
          console.log('API response:', data);

          // Support multiple response formats
          if (Array.isArray(data)) {
            posts = data;
          } else if (data && Array.isArray(data.posts)) {
            posts = data.posts;
          } else if (data && Array.isArray(data.data)) {
            posts = data.data;
          } else if (data && data.posts) {
            posts = [data.posts]; // Handle single post
          } else {
            posts = [];
          }

          console.log(`Found ${posts.length} posts from ${endpoint}`);
          break; // Success, break the loop

        } catch (err) {
          console.warn(`Endpoint ${endpoint} failed:`, err.message);
          lastError = err;
          continue; // Try next endpoint
        }
      }

      if (posts.length === 0 && lastError) {
        throw lastError;
      }

      // Process posts
      if (reset) {
        this.posts = posts;
      } else {
        this.posts = [...this.posts, ...posts];
      }

      // Check if we have more posts to load
      this.hasMore = posts.length >= this.pageSize;
      if (this.hasMore) {
        this.page += 1;
      }

      console.log('Posts loaded:', {
        total: this.posts.length,
        hasMore: this.hasMore,
        nextPage: this.page
      });

      this.renderPosts();

    } catch (err) {
      console.error('Error loading feed:', err);
      this.showMessage(`Failed to load feed: ${err.message}`, 'error');
      
      // Show empty state on error
      if (this.feedEmpty) {
        this.feedEmpty.style.display = 'block';
        this.feedEmpty.innerHTML = `
          <div style="text-align: center; padding: 2rem;">
            <h3>Unable to load posts</h3>
            <p>${err.message}</p>
            <button onclick="feedManager.loadPosts(true)" style="margin-top: 1rem;">
              Try Again
            </button>
          </div>
        `;
      }
    } finally {
      this.isLoading = false;
      this.hideLoadingState();
    }
  }

  showLoadingState() {
    console.log('Showing loading state');
    if (this.feedLoading) {
      this.feedLoading.style.display = 'flex';
      this.feedLoading.innerHTML = '<div>Loading posts...</div>';
    }
    if (this.feedEmpty) this.feedEmpty.style.display = 'none';
    if (this.feedContainer) this.feedContainer.innerHTML = '';
  }

  hideLoadingState() {
    console.log('Hiding loading state');
    if (this.feedLoading) this.feedLoading.style.display = 'none';
  }

  /* ----------------------- RENDER POSTS - ENHANCED ----------------------- */

  renderPosts() {
    if (!this.feedContainer) {
      console.error('feedContainer not found!');
      return;
    }

    console.log('Rendering posts:', this.posts.length);

    if (!this.posts.length) {
      console.log('No posts to render, showing empty state');
      if (this.feedEmpty) {
        this.feedEmpty.style.display = 'block';
        this.feedEmpty.innerHTML = `
          <div style="text-align: center; padding: 2rem;">
            <h3>No posts yet</h3>
            <p>Be the first to post something!</p>
          </div>
        `;
      }
      this.feedContainer.innerHTML = '';
      return;
    }

    if (this.feedEmpty) {
      this.feedEmpty.style.display = 'none';
    }

    // Clear and render posts
    this.feedContainer.innerHTML = '';
    this.posts.forEach((post, index) => {
      try {
        const postHtml = this.renderPostHtml(post);
        this.feedContainer.innerHTML += postHtml;
      } catch (err) {
        console.error(`Error rendering post ${index}:`, err, post);
      }
    });

    console.log('Attaching post events');
    this.attachPostEvents();
  }

  renderPostHtml(post) {
    if (!post) {
      console.warn('Attempted to render null post');
      return '<div class="post-card error">Invalid post</div>';
    }

    try {
      const user = post.user || {};
      const username = user.username || 'unknown';
      const displayName = user.display_name || username;
      const avatarUrl = user.avatar_url || 'assets/icons/default-profile.png';

      const isLiked = !!post.is_liked;
      const isSaved = !!post.is_saved;

      const likeCount = post.like_count || post.likes || 0;
      const commentCount = post.comment_count || post.comments || 0;

      const createdAt = post.created_at || post.createdAt || post.timestamp;
      const content = post.content || post.text || '';
      const mediaUrl = post.media_url || post.mediaUrl || null;

      const postUrl = this.getPostUrl(post.id || post._id);

      if (!post.id && !post._id) {
        console.warn('Post missing ID:', post);
      }

      return `
        <article class="post-card" data-post-id="${post.id || post._id}">
          <header class="post-header">
            <div class="post-user" data-username="${this.escapeHtml(username)}">
              <img
                src="${avatarUrl}"
                alt="${this.escapeHtml(displayName)}"
                class="post-user-avatar"
                onerror="this.src='assets/icons/default-profile.png'"
              >
              <div class="post-user-info">
                <div class="post-display-name">${this.escapeHtml(displayName)}</div>
                <div class="post-username">@${this.escapeHtml(username)}</div>
              </div>
            </div>
            <div class="post-meta">
              <time class="post-time">${this.formatTime(createdAt)}</time>
            </div>
          </header>

          <div class="post-body">
            <div class="post-content">
              ${this.formatPostContent(content)}
            </div>
            ${
              mediaUrl
                ? `
              <div class="post-media">
                <img src="${mediaUrl}" alt="Post media" loading="lazy">
              </div>
            `
                : ''
            }
          </div>

          <footer class="post-footer">
            <div class="post-actions">
              <button
                class="post-action-btn like-btn ${isLiked ? 'liked' : ''}"
                data-post-id="${post.id || post._id}"
              >
                <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart"></i>
                <span class="post-action-count like-count">${likeCount}</span>
              </button>

              <button
                class="post-action-btn comment-btn"
                data-post-id="${post.id || post._id}"
              >
                <i class="fa-regular fa-comment"></i>
                <span class="post-action-count comment-count">${commentCount}</span>
              </button>

              <button
                class="post-action-btn share-btn"
                data-post-id="${post.id || post._id}"
                data-post-url="${postUrl}"
              >
                <i class="fa-solid fa-arrow-up-from-bracket"></i>
              </button>

              <button
                class="post-action-btn save-btn ${isSaved ? 'saved' : ''}"
                data-post-id="${post.id || post._id}"
              >
                <i class="fa-${isSaved ? 'solid' : 'regular'} fa-bookmark"></i>
              </button>
            </div>
          </footer>
        </article>
      `;
    } catch (err) {
      console.error('Error generating post HTML:', err, post);
      return '<div class="post-card error">Error displaying post</div>';
    }
  }

  /* ----------------------- DEBUGGING UTILITIES ----------------------- */

  // Add this method to help debug
  debugAPI() {
    const endpoints = [
      `${FEED_API_BASE_URL}/posts`,
      `${FEED_API_BASE_URL}/feed`,
      `${FEED_API_BASE_URL}/posts/all`
    ];

    endpoints.forEach(async (endpoint) => {
      try {
        const token = this.getAuthToken();
        const headers = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        };

        console.log(`Testing endpoint: ${endpoint}`);
        const res = await fetch(endpoint, { headers });
        const data = await res.json();
        console.log(`Endpoint ${endpoint}:`, data);
      } catch (err) {
        console.log(`Endpoint ${endpoint} failed:`, err.message);
      }
    });
  }

  // Rest of your methods remain the same...
  // [Keep all your existing methods like bindEvents, updateAuthUI, handlePostSubmit, etc.]
  
  /* ----------------------- EVENT BINDING ----------------------- */

  bindEvents() {
    // Create post
    if (this.postButton && this.postInput) {
      this.postButton.addEventListener('click', () => this.handlePostSubmit());
      this.postInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handlePostSubmit();
        }
      });
    }

    // Media input
    if (this.mediaInput) {
      this.mediaInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.handleMediaSelected(file);
        }
      });
    }

    // Remove media
    if (this.mediaRemoveBtn) {
      this.mediaRemoveBtn.addEventListener('click', () => this.clearMedia());
    }

    // Feed mode tabs (Recent / Popular)
    if (this.feedModeTabs && this.feedModeTabs.length) {
      this.feedModeTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const mode = tab.getAttribute('data-feed-mode');
          if (mode && mode !== this.currentMode) {
            this.currentMode = mode;
            this.page = 1;
            this.hasMore = true;
            this.feedModeTabs.forEach((t) =>
              t.classList.toggle('active', t === tab)
            );
            this.loadPosts(true);
          }
        });
      });
    }

    // Infinite scroll
    window.addEventListener('scroll', () => this.handleScroll());

    // Add debug button in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      const debugBtn = document.createElement('button');
      debugBtn.textContent = 'Debug API';
      debugBtn.style.position = 'fixed';
      debugBtn.style.bottom = '10px';
      debugBtn.style.right = '10px';
      debugBtn.style.zIndex = '10000';
      debugBtn.style.padding = '5px 10px';
      debugBtn.style.fontSize = '12px';
      debugBtn.addEventListener('click', () => this.debugAPI());
      document.body.appendChild(debugBtn);
    }
  }

  updateAuthUI() {
    const currentUser =
      typeof getCurrentUser === 'function' ? getCurrentUser() : null;

    if (this.profileSection && this.authButtons) {
      if (currentUser) {
        this.profileSection.style.display = 'flex';
        this.authButtons.style.display = 'none';

        if (this.headerProfileImg && currentUser.avatar_url) {
          this.headerProfileImg.src = currentUser.avatar_url;
        }
      } else {
        this.profileSection.style.display = 'none';
        this.authButtons.style.display = 'flex';
      }
    }
  }

  getAuthToken() {
    if (typeof getAuthToken === 'function') {
      return getAuthToken();
    }
    return localStorage.getItem('authToken') || null;
  }

  handleScroll() {
    if (!this.hasMore || this.isLoading) return;
    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 600;
    if (scrollPosition >= threshold) {
      this.loadPosts(false);
    }
  }

  // ... [Keep all your other existing methods unchanged]
}

// Initialize feed manager when page loads
let feedManager;
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing FeedManager...');
  feedManager = new FeedManager();
  feedManager.init();
  window.feedManager = feedManager;
});
