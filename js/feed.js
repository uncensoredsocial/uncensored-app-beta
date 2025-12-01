// js/feed.js

// Use global API_BASE_URL from auth.js if available
const FEED_API_BASE_URL =
  typeof API_BASE_URL !== 'undefined'
    ? API_BASE_URL
    : 'https://uncensored-app-beta-production.up.railway.app/api';

class FeedManager {
  constructor() {
    // feed state
    this.posts = [];
    this.isLoading = false;
    this.isPosting = false;

    this.currentMode = 'recent'; // 'recent' | 'following'
    this.page = 1;
    this.pageSize = 20;
    this.hasMore = true;

    // post composer state
    this.maxChars = 280;
    this.selectedMediaFile = null;         // File
    this.selectedMediaType = null;         // 'image' | 'video' | null
    this.uploadedMediaUrl = null;          // Supabase URL after upload
  }

  async init() {
    this.cacheDom();
    this.bindEvents();
    this.updateAuthUI();
    this.updateCharCounter(); // initialize 0/280 & button
    await this.loadPosts(true);
  }

  /* ============================================================
   * DOM CACHE
   * ========================================================== */

  cacheDom() {
    // Main feed & composer
    this.feedContainer = document.getElementById('feedContainer');
    this.postInput = document.getElementById('postInput');
    this.postButton = document.getElementById('postButton');
    this.charCounter = document.getElementById('charCounter');
    this.postCreation = document.getElementById('postCreation');
    this.guestMessage = document.getElementById('guestMessage');
    this.postUserAvatar = document.getElementById('postUserAvatar');

    // Media controls
    this.postMediaInput = document.getElementById('postMediaInput'); // <input type="file">
    this.addMediaBtn = document.getElementById('addMediaBtn');       // "Add image / video" button
    this.mediaFileName = document.getElementById('mediaFileName');   // span for file name

    // Tabs: buttons with class .feed-tab-btn and data-tab="recent"/"following"
    this.feedTabs = document.getElementById('feedTabs');
    this.tabButtons = this.feedTabs
      ? this.feedTabs.querySelectorAll('.feed-tab-btn')
      : [];

    // Loading / empty states (optional)
    this.feedLoading = document.getElementById('feedLoading');
    this.feedEmpty = document.getElementById('feedEmpty');

    // Header auth UI
    this.profileSection = document.getElementById('profileSection');
    this.authButtons = document.getElementById('authButtons');
    this.headerProfileImg = document.getElementById('headerProfileImg');
  }

  /* ============================================================
   * EVENT BINDING
   * ========================================================== */

  bindEvents() {
    // Composer typing
    if (this.postInput) {
      this.postInput.addEventListener('input', () => {
        this.updateCharCounter();
      });

      // Ctrl+Enter / Cmd+Enter to post
      this.postInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          this.handleCreatePost();
        }
      });
    }

    // Post button
    if (this.postButton) {
      this.postButton.addEventListener('click', () => this.handleCreatePost());
    }

    // Media: open file picker
    if (this.addMediaBtn && this.postMediaInput) {
      this.addMediaBtn.addEventListener('click', () => {
        this.postMediaInput.click();
      });
    }

    // Media: when file chosen
    if (this.postMediaInput) {
      this.postMediaInput.addEventListener('change', () => {
        const file = this.postMediaInput.files[0];
        this.handleMediaSelected(file);
        this.updateCharCounter();
      });
    }

    // Tabs: Recent / Following
    if (this.tabButtons && this.tabButtons.length) {
      this.tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.tab; // 'recent' or 'following'
          if (!mode || mode === this.currentMode) return;
          this.switchMode(mode);
        });
      });
    }

    // Infinite scroll
    window.addEventListener('scroll', () => this.handleScroll());
  }

  /* ============================================================
   * AUTH / USER HELPERS
   * ========================================================== */

  isLoggedIn() {
    try {
      return typeof isLoggedIn === 'function' ? isLoggedIn() : false;
    } catch {
      return false;
    }
  }

  getCurrentUser() {
    try {
      return typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    } catch {
      return null;
    }
  }

  getAuthToken() {
    try {
      return typeof getAuthToken === 'function'
        ? getAuthToken()
        : localStorage.getItem('authToken') || null;
    } catch {
      return null;
    }
  }

  updateAuthUI() {
    const user = this.getCurrentUser();
    const loggedIn = !!user;

    // Show/hide composer
    if (this.postCreation) {
      this.postCreation.style.display = loggedIn ? 'block' : 'none';
    }

    // Guest message
    if (this.guestMessage) {
      this.guestMessage.style.display = loggedIn ? 'none' : 'block';
    }

    // Header left: profile vs auth buttons
    if (this.profileSection && this.authButtons) {
      if (loggedIn) {
        this.profileSection.style.display = 'flex';
        this.authButtons.style.display = 'none';

        if (this.headerProfileImg) {
          this.headerProfileImg.src =
            user && user.avatar_url
              ? user.avatar_url
              : 'assets/icons/default-profile.png';
        }
      } else {
        this.profileSection.style.display = 'none';
        this.authButtons.style.display = 'flex';
      }
    }

    // Composer avatar (left of "What's happening?")
    if (this.postUserAvatar) {
      this.postUserAvatar.src =
        user && user.avatar_url
          ? user.avatar_url
          : 'assets/icons/default-profile.png';
    }

    this.updateCharCounter();
  }

  /* ============================================================
   * CHARACTER COUNTER / BUTTON ENABLE
   * ========================================================== */

  updateCharCounter() {
    if (!this.postInput || !this.charCounter) return;

    let text = this.postInput.value || '';
    if (text.length > this.maxChars) {
      text = text.slice(0, this.maxChars);
      this.postInput.value = text;
    }

    const count = text.length;
    this.charCounter.textContent = `${count}/${this.maxChars}`;

    // visual warning if close to limit (optional)
    this.charCounter.classList.remove('warning', 'error');
    if (count > this.maxChars) {
      this.charCounter.classList.add('error');
    } else if (count > this.maxChars - 40) {
      this.charCounter.classList.add('warning');
    }

    // enable Post if user logged in & has text OR media
    const hasText = count > 0;
    const hasMedia = !!this.selectedMediaFile;
    const canPost = this.isLoggedIn() && (hasText || hasMedia);

    if (this.postButton) {
      this.postButton.disabled = !canPost;
    }
  }

  /* ============================================================
   * FEED MODE / SCROLL
   * ========================================================== */

  switchMode(mode) {
    if (mode !== 'recent' && mode !== 'following') return;
    this.currentMode = mode;
    this.page = 1;
    this.hasMore = true;

    // Update tab active class
    if (this.tabButtons && this.tabButtons.length) {
      this.tabButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === mode);
      });
    }

    this.loadPosts(true);
  }

  handleScroll() {
    if (!this.hasMore || this.isLoading) return;
    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 600;
    if (scrollPosition >= threshold) {
      this.loadPosts(false);
    }
  }

  /* ============================================================
   * LOAD POSTS
   * ========================================================== */

  async loadPosts(reset = false) {
    if (this.isLoading || (!this.hasMore && !reset)) return;
    if (!this.feedContainer) return;

    this.isLoading = true;

    if (reset) {
      this.showLoadingState();
    }

    try {
      const url = new URL(`${FEED_API_BASE_URL}/posts`);
      url.searchParams.set('mode', this.currentMode); // 'recent' | 'following'
      url.searchParams.set('page', String(this.page));
      url.searchParams.set('pageSize', String(this.pageSize));

      const token = this.getAuthToken();
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        throw new Error(`Failed to load posts (${res.status})`);
      }

      const data = await res.json();
      const posts = Array.isArray(data)
        ? data
        : Array.isArray(data.posts)
        ? data.posts
        : [];

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
      console.error('loadPosts error:', err);
      this.showToast('Failed to load feed', 'error');
    } finally {
      this.isLoading = false;
      this.hideLoadingState();
    }
  }

  showLoadingState() {
    if (this.feedLoading) this.feedLoading.style.display = 'flex';
    if (this.feedEmpty) this.feedEmpty.style.display = 'none';
    this.feedContainer.innerHTML = '';
  }

  hideLoadingState() {
    if (this.feedLoading) this.feedLoading.style.display = 'none';
  }

  /* ============================================================
   * RENDER POSTS
   * ========================================================== */

  renderPosts() {
    if (!this.feedContainer) return;

    if (!this.posts.length) {
      this.feedContainer.innerHTML = '';
      if (this.feedEmpty) this.feedEmpty.style.display = 'block';
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
    const avatarUrl =
      user.avatar_url || user.avatar || 'assets/icons/default-profile.png';

    const likeCount =
      typeof post.likes_count === 'number'
        ? post.likes_count
        : typeof post.like_count === 'number'
        ? post.like_count
        : Array.isArray(post.likes)
        ? post.likes.length
        : 0;

    const commentsCount =
      typeof post.comments_count === 'number'
        ? post.comments_count
        : typeof post.comment_count === 'number'
        ? post.comment_count
        : 0;

    const isLiked = !!post.is_liked;
    const isSaved = !!post.is_saved;

    const createdAt = post.created_at || post.createdAt;
    const mediaUrl = post.media_url || post.mediaUrl || null;
    const mediaType = post.media_type || post.mediaType || null;

    const timeLabel = this.formatTime(createdAt);
    const postUrl = this.getPostUrl(post.id);

    let mediaHtml = '';
    if (mediaUrl) {
      if (mediaType === 'video') {
        mediaHtml = `
          <div class="post-media">
            <video src="${this.escapeHtml(mediaUrl)}" controls playsinline></video>
          </div>
        `;
      } else {
        mediaHtml = `
          <div class="post-media">
            <img src="${this.escapeHtml(
              mediaUrl
            )}" alt="Post media" loading="lazy" />
          </div>
        `;
      }
    }

    return `
      <article class="post" data-post-id="${this.escapeHtml(post.id)}">
        <header class="post-header">
          <div class="post-user" data-username="${this.escapeHtml(username)}">
            <img
              src="${this.escapeHtml(avatarUrl)}"
              alt="${this.escapeHtml(displayName)}"
              class="post-avatar"
              onerror="this.src='assets/icons/default-profile.png'"
            />
            <div class="post-user-meta">
              <span class="post-display-name">${this.escapeHtml(
                displayName
              )}</span>
              <span class="post-username">@${this.escapeHtml(username)}</span>
            </div>
          </div>
          <span class="post-time">${this.escapeHtml(timeLabel)}</span>
        </header>

        <div class="post-body">
          <div class="post-text">
            ${this.formatPostContent(post.content || '')}
          </div>
          ${mediaHtml}
        </div>

        <footer class="post-footer">
          <div class="post-actions">
            <button
              class="post-action like-btn ${isLiked ? 'liked' : ''}"
              type="button"
            >
              <span class="post-action-icon">
                <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart"></i>
              </span>
              <span class="post-action-count like-count">${likeCount}</span>
            </button>

            <button
              class="post-action comment-btn"
              type="button"
            >
              <span class="post-action-icon">
                <i class="fa-regular fa-comment"></i>
              </span>
              <span class="post-action-count comment-count">${commentsCount}</span>
            </button>

            <button
              class="post-action share-btn"
              type="button"
              data-share-url="${this.escapeHtml(postUrl)}"
            >
              <span class="post-action-icon">
                <i class="fa-solid fa-arrow-up-from-bracket"></i>
              </span>
            </button>

            <button
              class="post-action save-btn ${isSaved ? 'saved' : ''}"
              type="button"
            >
              <span class="post-action-icon">
                <i class="fa-${isSaved ? 'solid' : 'regular'} fa-bookmark"></i>
              </span>
            </button>
          </div>
        </footer>
      </article>
    `;
  }

  attachPostEvents() {
    if (!this.feedContainer) return;

    const cards = this.feedContainer.querySelectorAll('.post');

    cards.forEach((card) => {
      const postId = card.getAttribute('data-post-id');

      // whole card -> open post (unless clicking actions or user)
      card.addEventListener('click', (e) => {
        if (e.target.closest('.post-actions') || e.target.closest('.post-user')) {
          return;
        }
        if (postId) {
          window.location.href = this.getPostUrl(postId);
        }
      });

      // user click -> profile or user page
      const userEl = card.querySelector('.post-user');
      if (userEl) {
        userEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const username = userEl.getAttribute('data-username');
          if (!username) return;

          const currentUser = this.getCurrentUser();
          if (currentUser && currentUser.username === username) {
            window.location.href = 'profile.html';
          } else {
            window.location.href = `user.html?user=${encodeURIComponent(
              username
            )}`;
          }
        });
      }

      // like
      const likeBtn = card.querySelector('.like-btn');
      if (likeBtn) {
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleLike(postId, likeBtn);
        });
      }

      // comment -> go to post with #comments anchor
      const commentBtn = card.querySelector('.comment-btn');
      if (commentBtn) {
        commentBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (postId) {
            window.location.href = this.getPostUrl(postId) + '#comments';
          }
        });
      }

      // share
      const shareBtn = card.querySelector('.share-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const url =
            shareBtn.getAttribute('data-share-url') ||
            this.getPostUrl(postId);
          this.handleShare(url);
        });
      }

      // save
      const saveBtn = card.querySelector('.save-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleSave(postId, saveBtn);
        });
      }
    });
  }

  /* ============================================================
   * MEDIA UPLOAD HELPERS
   * ========================================================== */

  handleMediaSelected(file) {
    this.selectedMediaFile = null;
    this.selectedMediaType = null;
    this.uploadedMediaUrl = null;

    if (!file) {
      if (this.mediaFileName) this.mediaFileName.textContent = '';
      return;
    }

    // basic type guard
    if (!file.type.startsWith('image') && !file.type.startsWith('video')) {
      this.showToast('Only images or videos are allowed.', 'error');
      if (this.postMediaInput) this.postMediaInput.value = '';
      if (this.mediaFileName) this.mediaFileName.textContent = '';
      return;
    }

    this.selectedMediaFile = file;
    this.selectedMediaType = file.type.startsWith('video') ? 'video' : 'image';
    if (this.mediaFileName) {
      this.mediaFileName.textContent = file.name;
    }
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || '';
        const parts = String(result).split(',');
        if (parts.length === 2) {
          resolve(parts[1]); // base64 only
        } else {
          resolve('');
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  async uploadMediaIfNeeded() {
    if (!this.selectedMediaFile) {
      return { media_url: null, media_type: null };
    }

    const token = this.getAuthToken();
    if (!token) {
      this.showToast('Missing auth token for media upload.', 'error');
      return { media_url: null, media_type: null };
    }

    try {
      const base64 = await this.fileToBase64(this.selectedMediaFile);
      if (!base64) {
        this.showToast('Could not read media file.', 'error');
        return { media_url: null, media_type: null };
      }

      const res = await fetch(`${FEED_API_BASE_URL}/posts/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          mediaData: base64,
          mediaType: this.selectedMediaType
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Media upload failed');
      }

      const media_url = data.url || data.media_url || null;
      const media_type = data.media_type || this.selectedMediaType || null;

      this.uploadedMediaUrl = media_url;
      return { media_url, media_type };
    } catch (err) {
      console.error('uploadMediaIfNeeded error:', err);
      this.showToast(err.message || 'Media upload failed', 'error');
      return { media_url: null, media_type: null };
    }
  }

  clearMediaState() {
    this.selectedMediaFile = null;
    this.selectedMediaType = null;
    this.uploadedMediaUrl = null;
    if (this.postMediaInput) this.postMediaInput.value = '';
    if (this.mediaFileName) this.mediaFileName.textContent = '';
  }

  /* ============================================================
   * CREATE POST
   * ========================================================== */

  async handleCreatePost() {
    if (!this.postInput) return;
    const user = this.getCurrentUser();
    if (!user) {
      this.showToast('Please log in to post.', 'error');
      return;
    }

    if (this.isPosting) return;

    let content = (this.postInput.value || '').trim();
    if (!content && !this.selectedMediaFile) {
      this.showToast('Write something or add media first.', 'info');
      return;
    }

    const token = this.getAuthToken();
    if (!token) {
      this.showToast('Missing auth token, please log in again.', 'error');
      return;
    }

    this.isPosting = true;
    if (this.postButton) this.postButton.disabled = true;

    try {
      // 1) Upload media if selected
      const { media_url, media_type } = await this.uploadMediaIfNeeded();

      // 2) Create post via JSON
      const res = await fetch(`${FEED_API_BASE_URL}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          content,
          media_url: media_url || null,
          media_type: media_type || null
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create post');
      }

      const newPost = data;

      // Prepend to local feed
      this.posts.unshift(newPost);
      this.renderPosts();

      // Reset composer
      this.postInput.value = '';
      this.clearMediaState();
      this.updateCharCounter();

      this.showToast('Post created', 'success');
    } catch (err) {
      console.error('handleCreatePost error:', err);
      this.showToast(err.message || 'Failed to create post', 'error');
    } finally {
      this.isPosting = false;
      if (this.postButton) this.postButton.disabled = false;
    }
  }

  /* ============================================================
   * LIKE / SAVE / SHARE
   * ========================================================== */

  async handleLike(postId, button) {
    if (!postId) return;
    const user = this.getCurrentUser();
    if (!user) {
      this.showToast('Please log in to like posts.', 'error');
      return;
    }

    const token = this.getAuthToken();
    if (!token) {
      this.showToast('Missing auth token, please log in again.', 'error');
      return;
    }

    const likeCountSpan = button.querySelector('.like-count');
    const icon = button.querySelector('i');
    const wasLiked = button.classList.contains('liked');
    let likeCount = parseInt(likeCountSpan?.textContent || '0', 10);

    // Optimistic UI
    if (wasLiked) {
      button.classList.remove('liked');
      if (icon) {
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
      }
      likeCount = Math.max(0, likeCount - 1);
    } else {
      button.classList.add('liked');
      if (icon) {
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
      }
      likeCount += 1;
    }
    if (likeCountSpan) likeCountSpan.textContent = String(likeCount);

    try {
      const res = await fetch(
        `${FEED_API_BASE_URL}/posts/${encodeURIComponent(postId)}/like`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update like');
      }

      // Use server count if provided
      if (typeof data.likes === 'number' && likeCountSpan) {
        likeCountSpan.textContent = String(data.likes);
      }
    } catch (err) {
      console.error('handleLike error:', err);
      this.showToast('Failed to update like', 'error');
    }
  }

  async handleSave(postId, button) {
    if (!postId) return;
    const user = this.getCurrentUser();
    if (!user) {
      this.showToast('Please log in to save posts.', 'error');
      return;
    }

    const token = this.getAuthToken();
    if (!token) {
      this.showToast('Missing auth token, please log in again.', 'error');
      return;
    }

    const icon = button.querySelector('i');
    const wasSaved = button.classList.contains('saved');

    // Optimistic UI
    if (wasSaved) {
      button.classList.remove('saved');
      if (icon) {
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
      }
    } else {
      button.classList.add('saved');
      if (icon) {
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
      }
    }

    try {
      const res = await fetch(
        `${FEED_API_BASE_URL}/posts/${encodeURIComponent(postId)}/save`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update save');
      }
    } catch (err) {
      console.error('handleSave error:', err);
      this.showToast('Failed to update saved post', 'error');
    }
  }

  async handleShare(url) {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Uncensored Social Post',
          url
        });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        this.showToast('Post link copied to clipboard', 'success');
      } else {
        alert('Share this link:\n' + url);
      }

      // Optional: ping backend to increment share_count
      // fetch(`${FEED_API_BASE_URL}/posts/${postId}/share`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      console.error('handleShare error:', err);
      this.showToast('Could not share post', 'error');
    }
  }

  /* ============================================================
   * UTILITIES
   * ========================================================== */

  getPostUrl(postId) {
    // relative for GitHub Pages subfolder
    return `post.html?id=${encodeURIComponent(postId)}`;
  }

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

    // URLs
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener" style="color: var(--primary-color); text-decoration: none;">$1</a>'
    );

    // hashtags
    formatted = formatted.replace(
      /#(\w+)/g,
      '<span class="hashtag">#$1</span>'
    );

    // mentions
    formatted = formatted.replace(
      /@(\w+)/g,
      '<span class="mention">@$1</span>'
    );

    return formatted;
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  showToast(message, type = 'info') {
    const existing = document.querySelector('.status-message');
    if (existing) existing.remove();

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
      padding: 8px 14px;
      border-radius: 999px;
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
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2500);
  }
}

/* ============================================================
 * INIT
 * ========================================================== */

let feedManager;

document.addEventListener('DOMContentLoaded', () => {
  const feedEl = document.getElementById('feedContainer');
  if (!feedEl) return;

  feedManager = new FeedManager();
  feedManager.init();
  window.feedManager = feedManager;
});

// Optional global refresh() hook for your header refresh button
window.refreshFeed = function () {
  if (window.feedManager) {
    window.feedManager.page = 1;
    window.feedManager.hasMore = true;
    window.feedManager.loadPosts(true);
  }
};
