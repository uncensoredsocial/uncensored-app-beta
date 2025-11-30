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
    this.currentMode = 'recent'; // 'recent' | 'popular'

    // media state
    this.selectedMediaFile = null;
  }

  async init() {
    this.cacheDom();
    this.bindEvents();
    this.updateAuthUI();
    await this.loadPosts();
  }

  /* ----------------------- DOM CACHE ----------------------- */

  cacheDom() {
    // feed + composer
    this.feedContainer = document.getElementById('feedContainer');
    this.postInput = document.getElementById('postInput');
    this.postButton = document.getElementById('postButton');
    this.charCounter = document.getElementById('charCounter');
    this.postCreation = document.getElementById('postCreation');
    this.guestMessage = document.getElementById('guestMessage');
    this.postUserAvatar = document.getElementById('postUserAvatar');

    // media controls
    this.postMediaInput = document.getElementById('postMediaInput');
    this.addMediaBtn = document.getElementById('addMediaBtn');
    this.mediaFileName = document.getElementById('mediaFileName');

    // tabs (use your .feed-tab-btn buttons with data-tab)
    this.feedTabs = document.getElementById('feedTabs');
    this.tabButtons = this.feedTabs
      ? this.feedTabs.querySelectorAll('.feed-tab-btn')
      : [];
  }

  /* ----------------------- EVENTS ----------------------- */

  bindEvents() {
    // Composer typing
    if (this.postInput) {
      this.postInput.addEventListener('input', () => {
        this.updateCharCounter();
        this.updatePostButtonState();
      });

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

    // Media button -> open file picker
    if (this.addMediaBtn && this.postMediaInput) {
      this.addMediaBtn.addEventListener('click', () => {
        this.postMediaInput.click();
      });
    }

    // File selected
    if (this.postMediaInput) {
      this.postMediaInput.addEventListener('change', () => {
        const file = this.postMediaInput.files[0];
        this.selectedMediaFile = file || null;

        if (this.mediaFileName) {
          if (file) {
            this.mediaFileName.textContent = file.name;
          } else {
            this.mediaFileName.textContent = '';
          }
        }
      });
    }

    // Tabs: use data-tab attributes
    if (this.tabButtons && this.tabButtons.length > 0) {
      this.tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.tab; // 'recent' or 'popular'
          this.switchMode(mode);
        });
      });
    }
  }

  /* ----------------------- AUTH / UI ----------------------- */

  isLoggedInSafe() {
    try {
      return typeof isLoggedIn === 'function' ? isLoggedIn() : false;
    } catch {
      return false;
    }
  }

  getCurrentUserSafe() {
    try {
      return typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    } catch {
      return null;
    }
  }

  updateAuthUI() {
    const loggedIn = this.isLoggedInSafe();

    // composer visible only when logged in
    if (this.postCreation) {
      this.postCreation.style.display = loggedIn ? 'block' : 'none';
    }

    // guest message
    if (this.guestMessage) {
      this.guestMessage.style.display = loggedIn ? 'none' : 'block';
    }

    // set avatar next to textarea
    if (this.postUserAvatar) {
      const user = this.getCurrentUserSafe();
      this.postUserAvatar.src =
        user && user.avatar_url
          ? user.avatar_url
          : 'assets/icons/default-profile.png';
    }

    this.updateCharCounter();
    this.updatePostButtonState();
  }

  updateCharCounter() {
    if (!this.charCounter || !this.postInput) return;

    const len = this.postInput.value.length;
    this.charCounter.textContent = `${len}/280`;
    this.charCounter.classList.remove('warning', 'error');

    if (len > 280) this.charCounter.classList.add('error');
    else if (len > 240) this.charCounter.classList.add('warning');
  }

  updatePostButtonState() {
    if (!this.postButton || !this.postInput) return;
    const loggedIn = this.isLoggedInSafe();
    const text = this.postInput.value.trim();
    const disabled = !loggedIn || !text || text.length > 280;
    this.postButton.disabled = disabled;
  }

  setPostButtonLoading(loading) {
    if (!this.postButton) return;

    if (loading) {
      this.postButton.disabled = true;
      this.postButton.innerHTML = `
        <span class="loading-spinner small"></span> Posting...
      `;
    } else {
      this.postButton.textContent = 'Post';
      this.updatePostButtonState();
    }
  }

  /* ----------------------- TABS ----------------------- */

  switchMode(mode) {
    if (mode !== 'recent' && mode !== 'popular') return;
    if (this.currentMode === mode) return;

    this.currentMode = mode;

    // visual active state on .feed-tab-btn
    if (this.tabButtons && this.tabButtons.length > 0) {
      this.tabButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === mode);
      });
    }

    this.loadPosts();
  }

  /* ----------------------- LOAD POSTS ----------------------- */

  async loadPosts() {
    if (!this.feedContainer || this.isLoading) return;

    this.isLoading = true;
    this.feedContainer.innerHTML = `
      <div class="loading-indicator">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading posts...</div>
      </div>
    `;

    try {
      const res = await fetch(`${FEED_API_BASE_URL}/posts`);
      if (!res.ok) {
        throw new Error(`Failed to load posts (${res.status})`);
      }

      let posts = await res.json();
      if (!Array.isArray(posts)) posts = [];

      // “Popular” = sort by likes (if present) desc
      if (this.currentMode === 'popular') {
        posts.sort((a, b) => {
          const aLikes =
            typeof a.likes_count === 'number'
              ? a.likes_count
              : Array.isArray(a.likes)
              ? a.likes.length
              : 0;
          const bLikes =
            typeof b.likes_count === 'number'
              ? b.likes_count
              : Array.isArray(b.likes)
              ? b.likes.length
              : 0;
          return bLikes - aLikes;
        });
      }

      this.posts = posts;
      if (this.posts.length === 0) {
        this.feedContainer.innerHTML = `
          <div class="empty-state">
            <h3>No posts yet</h3>
            <p>Be the first to post something!</p>
          </div>
        `;
      } else {
        this.renderPosts();
      }
    } catch (err) {
      console.error('loadPosts error:', err);
      this.feedContainer.innerHTML = `
        <div class="empty-state">
          <h3>Error loading posts</h3>
          <p>Please try again later.</p>
        </div>
      `;
    }

    this.isLoading = false;
  }

  renderPosts() {
    if (!this.feedContainer) return;
    this.feedContainer.innerHTML = '';

    this.posts.forEach((post) => {
      this.feedContainer.appendChild(this.createPostElement(post));
    });
  }

  /* ----------------------- MEDIA HELPERS ----------------------- */

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || '';
        // result like "data:image/png;base64,AAA..."
        const parts = String(result).split(',');
        if (parts.length === 2) {
          resolve(parts[1]); // base64 only
        } else {
          resolve('');
        }
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  async uploadMediaIfNeeded() {
    if (!this.selectedMediaFile) return { media_url: null, media_type: null };

    const token =
      typeof getAuthToken === 'function' ? getAuthToken() : null;
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

      const mediaType = this.selectedMediaFile.type.startsWith('video')
        ? 'video'
        : 'image';

      const res = await fetch(`${FEED_API_BASE_URL}/posts/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          mediaData: base64,
          mediaType
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Media upload failed');
      }

      return {
        media_url: data.url || null,
        media_type: data.media_type || mediaType
      };
    } catch (err) {
      console.error('uploadMediaIfNeeded error:', err);
      this.showToast(err.message || 'Media upload failed', 'error');
      return { media_url: null, media_type: null };
    }
  }

  resetMediaState() {
    this.selectedMediaFile = null;
    if (this.postMediaInput) {
      this.postMediaInput.value = '';
    }
    if (this.mediaFileName) {
      this.mediaFileName.textContent = '';
    }
  }

  /* ----------------------- CREATE POST ----------------------- */

  async handleCreatePost() {
    if (!this.postInput) return;

    const text = this.postInput.value.trim();
    if (!text || text.length > 280) return;

    if (!this.isLoggedInSafe()) {
      this.showToast('Please log in to post.', 'error');
      return;
    }

    const token =
      typeof getAuthToken === 'function' ? getAuthToken() : null;
    if (!token) {
      this.showToast('Missing auth token.', 'error');
      return;
    }

    this.setPostButtonLoading(true);

    try {
      // 1) upload media (if any)
      const { media_url, media_type } = await this.uploadMediaIfNeeded();

      // 2) create the post
      const res = await fetch(`${FEED_API_BASE_URL}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          content: text,
          media_url: media_url || null,
          media_type: media_type || null
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Error creating post');
      }

      const newPost = data;

      // add at top
      this.posts.unshift(newPost);
      if (this.feedContainer) {
        const el = this.createPostElement(newPost);
        this.feedContainer.prepend(el);
      }

      // reset composer
      this.postInput.value = '';
      this.updateCharCounter();
      this.updatePostButtonState();
      this.resetMediaState();
      this.showToast('Posted!', 'success');
    } catch (err) {
      console.error('handleCreatePost error:', err);
      this.showToast(err.message || 'Error creating post', 'error');
    }

    this.setPostButtonLoading(false);
  }

  /* ----------------------- POST ELEMENT ----------------------- */

  createPostElement(post) {
    const article = document.createElement('article');
    article.className = 'post';
    article.setAttribute('tabindex', '0');
    article.dataset.postId = post.id;

    const user = post.user || {};
    const avatar = user.avatar_url || 'assets/icons/default-profile.png';
    const displayName = user.display_name || user.username || 'Unknown';
    const username = user.username || 'user';
    const createdAt = post.created_at ? new Date(post.created_at) : null;
    const timeLabel = createdAt ? createdAt.toLocaleString() : '';

    const likeCount =
      typeof post.likes_count === 'number'
        ? post.likes_count
        : Array.isArray(post.likes)
        ? post.likes.length
        : 0;

    const commentsCount =
      typeof post.comments_count === 'number' ? post.comments_count : 0;

    // media HTML if present
    let mediaHtml = '';
    if (post.media_url) {
      if (post.media_type === 'video') {
        mediaHtml = `
          <div class="post-media">
            <video src="${this.escape(post.media_url)}" controls playsinline></video>
          </div>
        `;
      } else {
        mediaHtml = `
          <div class="post-media">
            <img src="${this.escape(
              post.media_url
            )}" alt="Post media" onerror="this.style.display='none';" />
          </div>
        `;
      }
    }

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
            : ''
        }
      </header>

      <div class="post-content">
        <p>${this.formatContent(post.content || '')}</p>
        ${mediaHtml}
      </div>

      <footer class="post-footer">
        <div class="post-timestamp">${
          timeLabel ? this.escape(timeLabel) : ''
        }</div>
        <div class="post-actions">
          <button class="post-action-btn post-like-btn" type="button">
            <span class="post-action-icon">♥</span>
            <span class="post-action-count like-count">${likeCount}</span>
          </button>
          <button class="post-action-btn post-comment-btn" type="button">
            <span class="post-action-icon">💬</span>
            <span class="post-action-count comment-count">${commentsCount}</span>
          </button>
          <button class="post-action-btn post-save-btn" type="button">
            <span class="post-action-icon">🔖</span>
          </button>
          <button class="post-action-btn post-share-btn" type="button">
            <span class="post-action-icon">⤴</span>
          </button>
        </div>
      </footer>
    `;

    // Wire actions
    const likeBtn = article.querySelector('.post-like-btn');
    const commentBtn = article.querySelector('.post-comment-btn');
    const saveBtn = article.querySelector('.post-save-btn');
    const shareBtn = article.querySelector('.post-share-btn');

    if (likeBtn) {
      likeBtn.addEventListener('click', () =>
        this.handleLike(post, likeBtn)
      );
    }

    if (commentBtn) {
      commentBtn.addEventListener('click', () =>
        this.handleCommentClick(post)
      );
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () =>
        this.handleSaveClick(post, saveBtn)
      );
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', () =>
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

  /* ----------------------- ACTIONS ----------------------- */

  async handleLike(post, btn) {
    if (!this.isLoggedInSafe()) {
      this.showToast('Please log in to like posts.', 'error');
      return;
    }

    const token =
      typeof getAuthToken === 'function' ? getAuthToken() : null;
    if (!token) {
      this.showToast('Missing auth token.', 'error');
      return;
    }

    try {
      btn.disabled = true;

      const res = await fetch(
        `${FEED_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/like`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to like post');
      }

      const likeCountEl = btn.querySelector('.like-count');
      if (likeCountEl) {
        likeCountEl.textContent = data.likes ?? 0;
      }

      if (data.liked) btn.classList.add('liked');
      else btn.classList.remove('liked');
    } catch (err) {
      console.error('handleLike error:', err);
      this.showToast(err.message || 'Failed to like post', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  handleCommentClick(post) {
    // Placeholder – later you can route to a post detail page
    this.showToast('Comments coming soon!', 'info');
  }

  handleSaveClick(post, btn) {
    const saved = btn.classList.toggle('saved');
    this.showToast(
      saved ? 'Saved post (placeholder).' : 'Unsaved post (placeholder).',
      'info'
    );
  }

  handleShareClick(post) {
    const url = `${window.location.origin}/index.html#post-${post.id}`;

    if (navigator.share) {
      navigator
        .share({
          title: 'Uncensored Social Post',
          text: post.content || '',
          url
        })
        .catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => this.showToast('Post link copied!', 'success'))
        .catch(() => this.showToast('Could not copy link.', 'error'));
    } else {
      alert('Share this link:\n' + url);
    }
  }

  /* ----------------------- UTIL ----------------------- */

  escape(str = '') {
    return String(str).replace(/[&<>"']/g, (m) => {
      switch (m) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#039;';
        default:
          return m;
      }
    });
  }

  showToast(message, type = 'info') {
    const div = document.createElement('div');
    div.className = `status-message status-${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2500);
  }
}

/* ----------------------- INIT ----------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const feedEl = document.getElementById('feedContainer');
  if (!feedEl) return;

  window.feedManager = new FeedManager();
  window.feedManager.init();
});

// called by the refresh button in header
window.refreshFeed = function () {
  if (window.feedManager) {
    window.feedManager.loadPosts();
  }
};
