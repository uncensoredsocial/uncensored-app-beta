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
    this.maxChars = 280;

    // media state
    this.selectedMediaFile = null;
    this.selectedMediaPreviewUrl = null;
  }

  async init() {
    this.cacheDom();
    this.bindEvents();
    this.updateAuthUI();
    this.updateCharCount(); // start at 0/280
    await this.loadPosts(true);
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

    // char counter (support either id)
    this.charCountEl =
      document.getElementById('postCharCount') ||
      document.getElementById('charCount');

    // loading / empty states
    this.feedLoading = document.getElementById('feedLoading');
    this.feedEmpty = document.getElementById('feedEmpty');

    // auth UI
    this.profileSection = document.getElementById('profileSection');
    this.authButtons = document.getElementById('authButtons');
    this.headerProfileImg = document.getElementById('headerProfileImg');
  }

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

      // character count
      this.postInput.addEventListener('input', () => this.updateCharCount());
    }

    // Media input
    if (this.mediaInput) {
      this.mediaInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.handleMediaSelected(file);
          this.updateCharCount(); // media counts as content so enable button
        }
      });
    }

    // Remove media
    if (this.mediaRemoveBtn) {
      this.mediaRemoveBtn.addEventListener('click', () => {
        this.clearMedia();
        this.updateCharCount();
      });
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
  }

  /* ----------------------- AUTH UI ----------------------- */

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

  /* ----------------------- CHAR COUNT ----------------------- */

  updateCharCount() {
    if (!this.postInput || !this.charCountEl) return;

    let text = this.postInput.value || '';
    if (text.length > this.maxChars) {
      text = text.slice(0, this.maxChars);
      this.postInput.value = text;
    }
    const count = text.length;
    this.charCountEl.textContent = `${count}/${this.maxChars}`;

    const hasContent = count > 0 || !!this.selectedMediaFile;

    if (this.postButton) {
      this.postButton.disabled = !hasContent;
    }

    if (count >= this.maxChars) {
      this.charCountEl.classList.add('over-limit');
    } else {
      this.charCountEl.classList.remove('over-limit');
    }
  }

  /* ----------------------- LOAD POSTS ----------------------- */

  async loadPosts(reset = false) {
    if (this.isLoading || (!this.hasMore && !reset)) return;
    this.isLoading = true;

    if (reset) {
      this.showLoadingState();
    } else {
      this.showFeedSpinner();
    }

    try {
      // Try /posts first, if that fails, try /feed
      let posts;
      try {
        posts = await this.fetchPostsFrom('/posts');
      } catch (err1) {
        console.warn('GET /posts failed, trying /feed', err1);
        posts = await this.fetchPostsFrom('/feed');
      }

      if (reset) {
        this.posts = posts;
      } else {
        this.posts = this.posts.concat(posts);
      }

      if (posts.length < this.pageSize) {
        this.hasMore = false;
      } else {
        this.page += 1;
      }

      this.renderPosts();
    } catch (err) {
      console.error('Error loading feed:', err);
      this.showMessage('Failed to load feed', 'error');
    } finally {
      this.isLoading = false;
      this.hideLoadingState();
    }
  }

  async fetchPostsFrom(path) {
    const url = new URL(`${FEED_API_BASE_URL}${path}`);
    // These query params are safe; backend can ignore if it doesn't use them
    url.searchParams.set('mode', this.currentMode);
    url.searchParams.set('page', this.page.toString());
    url.searchParams.set('pageSize', this.pageSize.toString());

    const token = this.getAuthToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url.toString(), { headers });

    if (!res.ok) {
      throw new Error(`Feed request failed: ${res.status}`);
    }

    const data = await res.json();
    // Support several shapes
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.posts)) return data.posts;
    if (Array.isArray(data.data)) return data.data;
    return [];
  }

  showLoadingState() {
    if (this.feedLoading) this.feedLoading.style.display = 'flex';
    if (this.feedEmpty) this.feedEmpty.style.display = 'none';
    if (this.feedContainer) this.feedContainer.innerHTML = '';
  }

  hideLoadingState() {
    if (this.feedLoading) this.feedLoading.style.display = 'none';
  }

  showFeedSpinner() {
    // optional small spinner at bottom
  }

  handleScroll() {
    if (!this.hasMore || this.isLoading) return;
    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 600;
    if (scrollPosition >= threshold) {
      this.loadPosts(false);
    }
  }

  /* ----------------------- RENDER POSTS ----------------------- */

  renderPosts() {
    if (!this.feedContainer) return;

    if (!this.posts.length) {
      if (this.feedEmpty) this.feedEmpty.style.display = 'block';
      this.feedContainer.innerHTML = '';
      return;
    } else if (this.feedEmpty) {
      this.feedEmpty.style.display = 'none';
    }

    this.feedContainer.innerHTML = this.posts
      .map((post) => this.renderPostHtml(post))
      .join('');

    this.attachPostEvents();
  }

  renderPostHtml(post) {
    const user = post.user || {};
    const username = user.username || 'unknown';
    const displayName = user.display_name || user.displayName || username;
    const avatarUrl = user.avatar_url || user.avatar || 'assets/icons/default-profile.png';

    const isLiked = !!post.is_liked;
    const isSaved = !!post.is_saved;

    const likeCount = post.like_count || post.likes || 0;
    const commentCount = post.comment_count || post.comments || 0;

    const createdAt = post.created_at || post.createdAt;
    const mediaUrl = post.media_url || post.mediaUrl || null;

    const postUrl = this.getPostUrl(post.id);

    // IMPORTANT: keep original class names: post-actions + post-action
    return `
      <article class="post" data-post-id="${post.id}">
        <div class="post-header">
          <div class="post-user" data-username="${this.escapeHtml(username)}">
            <img
              src="${avatarUrl}"
              alt="${this.escapeHtml(displayName)}"
              class="post-avatar"
              onerror="this.src='assets/icons/default-profile.png'"
            >
            <div class="post-user-meta">
              <span class="post-display-name">${this.escapeHtml(displayName)}</span>
              <span class="post-username">@${this.escapeHtml(username)}</span>
            </div>
          </div>
          <span class="post-time">${this.formatTime(createdAt)}</span>
        </div>

        <div class="post-body">
          <div class="post-text">
            ${this.formatPostContent(post.content || '')}
          </div>
          ${
            mediaUrl
              ? `
          <div class="post-media">
            <img src="${mediaUrl}" alt="Post media">
          </div>
          `
              : ''
          }
        </div>

        <div class="post-actions">
          <button
            class="post-action like-btn ${isLiked ? 'liked' : ''}"
            data-post-id="${post.id}"
          >
            <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart"></i>
            <span class="like-count">${likeCount}</span>
          </button>

          <button
            class="post-action comment-btn"
            data-post-id="${post.id}"
          >
            <i class="fa-regular fa-comment"></i>
            <span class="comment-count">${commentCount}</span>
          </button>

          <button
            class="post-action share-btn"
            data-post-id="${post.id}"
            data-post-url="${postUrl}"
          >
            <i class="fa-solid fa-arrow-up-from-bracket"></i>
          </button>

          <button
            class="post-action save-btn ${isSaved ? 'saved' : ''}"
            data-post-id="${post.id}"
          >
            <i class="fa-${isSaved ? 'solid' : 'regular'} fa-bookmark"></i>
          </button>
        </div>
      </article>
    `;
  }

  attachPostEvents() {
    const cards = this.feedContainer.querySelectorAll('.post');
    cards.forEach((card) => {
      const postId = card.getAttribute('data-post-id');

      // Whole card click -> open post detail (unless clicking actions/user)
      card.addEventListener('click', (e) => {
        if (
          e.target.closest('.post-actions') ||
          e.target.closest('.post-user')
        ) {
          return;
        }
        if (postId) {
          window.location.href = this.getPostUrl(postId);
        }
      });

      // User profile click (avatar/name)
      const userEl = card.querySelector('.post-user');
      if (userEl) {
        userEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const username = userEl.getAttribute('data-username');
          if (username) {
            window.location.href =
              'profile.html?user=' + encodeURIComponent(username);
          }
        });
      }

      // Like button
      const likeBtn = card.querySelector('.like-btn');
      if (likeBtn) {
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleLike(postId, likeBtn);
        });
      }

      // Comment button
      const commentBtn = card.querySelector('.comment-btn');
      if (commentBtn) {
        commentBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (postId) {
            window.location.href = this.getPostUrl(postId) + '#comments';
          }
        });
      }

      // Share button
      const shareBtn = card.querySelector('.share-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const url =
            shareBtn.getAttribute('data-post-url') || this.getPostUrl(postId);
          this.handleShare(url);
        });
      }

      // Save button
      const saveBtn = card.querySelector('.save-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleSave(postId, saveBtn);
        });
      }
    });
  }

  /* ----------------------- POST CREATION ----------------------- */

  async handlePostSubmit() {
    const currentUser =
      typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!currentUser) {
      this.showMessage('Please log in to post', 'error');
      return;
    }

    if (this.isPosting) return;

    const content = (this.postInput?.value || '').trim();
    if (!content && !this.selectedMediaFile) {
      this.showMessage('Write something or add media first', 'info');
      return;
    }

    try {
      this.isPosting = true;
      if (this.postButton) this.postButton.disabled = true;

      const token = this.getAuthToken();
      if (!token) {
        this.showMessage('Missing auth token, please log in again', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('content', content);
      if (this.selectedMediaFile) {
        formData.append('media', this.selectedMediaFile);
      }

      const res = await fetch(`${FEED_API_BASE_URL}/posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) {
        throw new Error('Failed to create post');
      }

      const newPost = await res.json();

      this.posts.unshift(newPost);
      this.renderPosts();

      if (this.postInput) this.postInput.value = '';
      this.clearMedia();
      this.updateCharCount();

      this.showMessage('Post created', 'success');
    } catch (err) {
      console.error('Error creating post:', err);
      this.showMessage('Failed to create post', 'error');
    } finally {
      this.isPosting = false;
      if (this.postButton) this.postButton.disabled = false;
    }
  }

  handleMediaSelected(file) {
    this.selectedMediaFile = file;

    if (this.selectedMediaPreviewUrl) {
      URL.revokeObjectURL(this.selectedMediaPreviewUrl);
    }

    this.selectedMediaPreviewUrl = URL.createObjectURL(file);

    if (this.mediaPreview && this.mediaPreviewWrapper) {
      this.mediaPreview.src = this.selectedMediaPreviewUrl;
      this.mediaPreviewWrapper.style.display = 'block';
    }
  }

  clearMedia() {
    this.selectedMediaFile = null;
    if (this.selectedMediaPreviewUrl) {
      URL.revokeObjectURL(this.selectedMediaPreviewUrl);
      this.selectedMediaPreviewUrl = null;
    }
    if (this.mediaPreview) {
      this.mediaPreview.src = '';
    }
    if (this.mediaPreviewWrapper) {
      this.mediaPreviewWrapper.style.display = 'none';
    }
    if (this.mediaInput) {
      this.mediaInput.value = '';
    }
  }

  /* ----------------------- LIKE / SAVE / SHARE ----------------------- */

  async handleLike(postId, button) {
    const currentUser =
      typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!currentUser) {
      this.showMessage('Please log in to like posts', 'error');
      return;
    }

    const token = this.getAuthToken();
    if (!token) {
      this.showMessage('Missing auth token, please log in again', 'error');
      return;
    }

    const isCurrentlyLiked = button.classList.contains('liked');
    const likeCountSpan = button.querySelector('.like-count');
    let likeCount = parseInt(likeCountSpan?.textContent || '0', 10);

    // Optimistic UI
    if (isCurrentlyLiked) {
      button.classList.remove('liked');
      const icon = button.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
      }
      likeCount = Math.max(0, likeCount - 1);
    } else {
      button.classList.add('liked');
      const icon = button.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
      }
      likeCount = likeCount + 1;
    }
    if (likeCountSpan) likeCountSpan.textContent = likeCount.toString();

    try {
      const url = `${FEED_API_BASE_URL}/posts/${encodeURIComponent(
        postId
      )}/like`;
      const res = await fetch(url, {
        method: isCurrentlyLiked ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error('Failed to update like');
      }
    } catch (err) {
      console.error('Like error:', err);
      // revert UI on error
      if (isCurrentlyLiked) {
        button.classList.add('liked');
        const icon = button.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-regular');
          icon.classList.add('fa-solid');
        }
        likeCount = likeCount + 1;
      } else {
        button.classList.remove('liked');
        const icon = button.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-solid');
          icon.classList.add('fa-regular');
        }
        likeCount = Math.max(0, likeCount - 1);
      }
      if (likeCountSpan) likeCountSpan.textContent = likeCount.toString();
      this.showMessage('Failed to update like', 'error');
    }
  }

  async handleSave(postId, button) {
    const currentUser =
      typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!currentUser) {
      this.showMessage('Please log in to save posts', 'error');
      return;
    }

    const token = this.getAuthToken();
    if (!token) {
      this.showMessage('Missing auth token', 'error');
      return;
    }

    const isCurrentlySaved = button.classList.contains('saved');

    // Optimistic UI
    if (isCurrentlySaved) {
      button.classList.remove('saved');
      const icon = button.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
      }
    } else {
      button.classList.add('saved');
      const icon = button.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
      }
    }

    try {
      const url = `${FEED_API_BASE_URL}/posts/${encodeURIComponent(
        postId
      )}/save`;
      const res = await fetch(url, {
        method: isCurrentlySaved ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error('Failed to update save');
      }
    } catch (err) {
      console.error('Save error:', err);
      // revert UI
      if (isCurrentlySaved) {
        button.classList.add('saved');
        const icon = button.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-regular');
          icon.classList.add('fa-solid');
        }
      } else {
        button.classList.remove('saved');
        const icon = button.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-solid');
          icon.classList.add('fa-regular');
        }
      }
      this.showMessage('Failed to update saved post', 'error');
    }
  }

  async handleShare(url) {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Check out this post on Uncensored Social',
          url
        });
      } else {
        await navigator.clipboard.writeText(url);
        this.showMessage('Post link copied to clipboard', 'success');
      }
    } catch (err) {
      console.error('Share error:', err);
      this.showMessage('Could not share post', 'error');
    }
  }

  getPostUrl(postId) {
    const origin = window.location.origin;
    return `${origin}/post.html?id=${encodeURIComponent(postId)}`;
  }

  /* ----------------------- UTILITIES ----------------------- */

  formatTime(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString();
  }

  formatPostContent(content) {
    if (!content) return '';

    let formatted = this.escapeHtml(content);

    // URLs -> links
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener" style="color: var(--primary-color); text-decoration: none;">$1</a>'
    );

    // Hashtags
    formatted = formatted.replace(
      /#(\w+)/g,
      '<span style="color: var(--primary-color); font-weight: 500;">#$1</span>'
    );

    // Mentions
    formatted = formatted.replace(
      /@(\w+)/g,
      '<span style="color: var(--primary-color); font-weight: 500;">@$1</span>'
    );

    return formatted;
  }

  escapeHtml(unsafe) {
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  showMessage(message, type = 'info') {
    const existingMsg = document.querySelector('.status-message');
    if (existingMsg) existingMsg.remove();

    const el = document.createElement('div');
    el.className = `status-message status-${type}`;
    el.textContent = message;
    el.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      max-width: 90%;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      background: ${
        type === 'error' ? '#3b0f0f' : type === 'success' ? '#0f3b1f' : '#111'
      };
      color: #fff;
      border: 1px solid ${
        type === 'error' ? '#ff4d4d' : type === 'success' ? '#42ff95' : '#333'
      };
    `;

    document.body.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 2500);
  }
}

// Initialize feed manager when page loads
let feedManager;
document.addEventListener('DOMContentLoaded', () => {
  feedManager = new FeedManager();
  feedManager.init();
  window.feedManager = feedManager;
});
