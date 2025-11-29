// js/feed.js

// Prefer global API_BASE_URL from auth.js if it exists, otherwise fallback:
const FEED_API_BASE_URL =
  typeof API_BASE_URL !== 'undefined'
    ? API_BASE_URL
    : 'https://uncensored-app-beta-production.up.railway.app/api';

class FeedManager {
  constructor() {
    this.posts = [];
    this.isLoading = false;
    this.currentTab = 'recent'; // 'recent' | 'popular'
  }

  async init() {
    this.cacheDom();
    this.bindEvents();
    this.updateAuthUI();
    await this.loadPosts();
  }

  /* ----------------------- DOM CACHE ----------------------- */

  cacheDom() {
    this.feedContainer = document.getElementById('feedContainer');
    this.postInput = document.getElementById('postInput');
    this.postButton = document.getElementById('postButton');
    this.charCounter = document.getElementById('charCounter');
    this.postCreation = document.getElementById('postCreation');
    this.guestMessage = document.getElementById('guestMessage');

    // NEW: composer avatars
    this.postUserAvatar = document.getElementById('postUserAvatar');
    this.postUserAvatarSmall = document.getElementById('postUserAvatarSmall');

    // NEW: feed tabs
    this.feedTabButtons = document.querySelectorAll('.feed-tab-btn');
  }

  /* ----------------------- EVENTS ----------------------- */

  bindEvents() {
    // Typing in composer
    if (this.postInput) {
      this.postInput.addEventListener('input', () => {
        this.updateCharCounter();
        this.updatePostButtonState();
      });

      // Ctrl+Enter / Cmd+Enter to post
      this.postInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          this.handleCreatePost();
        }
      });
    }

    // Click Post button
    if (this.postButton) {
      this.postButton.addEventListener('click', () => {
        this.handleCreatePost();
      });
    }

    // NEW: Recent / Popular tabs
    if (this.feedTabButtons && this.feedTabButtons.length) {
      this.feedTabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.tab || 'recent';
          this.switchTab(tab);
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

  updateAuthUI() {
    const loggedIn = this.isLoggedInSafe();

    // Show or hide composer
    if (this.postCreation) {
      this.postCreation.style.display = loggedIn ? 'block' : 'none';
    }

    // Optional: show / hide "Join the Conversation"
    if (this.guestMessage) {
      this.guestMessage.style.display = loggedIn ? 'none' : 'block';
    }

    // NEW: update composer avatars from current user
    if (loggedIn && typeof getCurrentUser === 'function') {
      const user = getCurrentUser();
      const avatarUrl =
        user && user.avatar_url
          ? user.avatar_url
          : 'assets/icons/default-profile.png';

      if (this.postUserAvatar) {
        this.postUserAvatar.src = avatarUrl;
      }
      if (this.postUserAvatarSmall) {
        this.postUserAvatarSmall.src = avatarUrl;
      }
    }

    this.updatePostButtonState();
    this.updateCharCounter();
  }

  updateCharCounter() {
    if (!this.charCounter || !this.postInput) return;

    const length = this.postInput.value.length;
    this.charCounter.textContent = `${length}/280`;

    this.charCounter.classList.remove('warning', 'error');
    if (length > 280) this.charCounter.classList.add('error');
    else if (length > 240) this.charCounter.classList.add('warning');
  }

  updatePostButtonState() {
    if (!this.postButton || !this.postInput) return;

    const text = this.postInput.value.trim();
    const loggedIn = this.isLoggedInSafe();

    this.postButton.disabled =
      !loggedIn || text.length === 0 || text.length > 280;
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

      const data = await res.json();
      this.posts = Array.isArray(data) ? data : [];

      if (this.posts.length === 0) {
        this.feedContainer.innerHTML = `
          <div class="empty-state">
            <h3>No posts yet</h3>
            <p>Be the first to post something!</p>
          </div>
        `;
        this.isLoading = false;
        return;
      }

      this.renderPosts();
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

  /* ----------------------- TABS / FILTERING ----------------------- */

  switchTab(tab) {
    if (tab !== 'recent' && tab !== 'popular') {
      tab = 'recent';
    }
    this.currentTab = tab;

    if (this.feedTabButtons && this.feedTabButtons.length) {
      this.feedTabButtons.forEach((btn) => {
        const btnTab = btn.dataset.tab || 'recent';
        btn.classList.toggle('active', btnTab === this.currentTab);
      });
    }

    this.renderPosts();
  }

  getPostsForCurrentTab() {
    // Recent: just return in API order (newest first)
    if (this.currentTab === 'recent') {
      return this.posts.slice();
    }

    // Popular: sort by like count, then newest first
    const arr = this.posts.slice();

    arr.sort((a, b) => {
      const aLikes =
        typeof a.likes === 'number'
          ? a.likes
          : Array.isArray(a.likes)
          ? a.likes.length
          : a.like_count ?? 0;
      const bLikes =
        typeof b.likes === 'number'
          ? b.likes
          : Array.isArray(b.likes)
          ? b.likes.length
          : b.like_count ?? 0;

      if (bLikes !== aLikes) return bLikes - aLikes;

      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    return arr;
  }

  renderPosts() {
    if (!this.feedContainer) return;

    const postsToRender = this.getPostsForCurrentTab();

    this.feedContainer.innerHTML = '';

    postsToRender.forEach((post) => {
      this.feedContainer.appendChild(this.createPostElement(post));
    });
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

    this.setPostButtonLoading(true);

    try {
      const token =
        typeof getAuthToken === 'function' ? getAuthToken() : null;

      const res = await fetch(`${FEED_API_BASE_URL}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ content: text })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Error creating post');
      }

      const newPost = data;

      // Prepend new post locally
      this.posts.unshift(newPost);

      // Clear composer
      this.postInput.value = '';
      this.updateCharCounter();
      this.updatePostButtonState();
      this.showToast('Posted!', 'success');

      // Re-render according to current tab (so Popular updates too)
      this.renderPosts();
    } catch (err) {
      console.error('handleCreatePost error:', err);
      this.showToast(err.message || 'Error creating post', 'error');
    }

    this.setPostButtonLoading(false);
  }

  /* ----------------------- POST ELEMENT ----------------------- */

  createPostElement(post) {
    const div = document.createElement('article');
    div.className = 'post';
    div.setAttribute('tabindex', '0');
    div.dataset.postId = post.id;

    const user = post.user || {};
    const avatar = user.avatar_url || 'assets/icons/default-profile.png';
    const displayName = user.display_name || user.username || 'Unknown';
    const username = user.username || 'user';
    const createdAt = post.created_at ? new Date(post.created_at) : null;
    const timeLabel = createdAt ? createdAt.toLocaleString() : '';

    const likeCount =
      typeof post.likes === 'number'
        ? post.likes
        : Array.isArray(post.likes)
        ? post.likes.length
        : post.like_count ?? 0;

    const commentsCount = post.comments_count || 0;

    div.innerHTML = `
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
    */

    // Wire up buttons
    const likeBtn = div.querySelector('.post-like-btn');
    const commentBtn = div.querySelector('.post-comment-btn');
    const saveBtn = div.querySelector('.post-save-btn');
    const shareBtn = div.querySelector('.post-share-btn');

    if (likeBtn) {
      likeBtn.addEventListener('click', () => this.handleLike(post, likeBtn));
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

    return div;
  }

  formatContent(text) {
    // basic escaping + links/hashtags/mentions
    const safe = this.escape(text);

    return safe
      // URLs
      .replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      // hashtags
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
      // mentions
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  }

  /* ----------------------- ACTION HANDLERS ----------------------- */

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
          headers: {
            Authorization: `Bearer ${token}`
          }
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

      if (data.liked) {
        btn.classList.add('liked');
      } else {
        btn.classList.remove('liked');
      }
    } catch (err) {
      console.error('handleLike error:', err);
      this.showToast(err.message || 'Failed to like post', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  handleCommentClick(post) {
    // For now, just a simple message. Later you can route to post detail.
    this.showToast('Comments coming soon!', 'info');
  }

  handleSaveClick(post, btn) {
    // simple client-side toggle for now
    const saved = btn.classList.toggle('saved');
    this.showToast(
      saved ? 'Saved post (placeholder).' : 'Unsaved post (placeholder).',
      'info'
    );
  }

  handleShareClick(post) {
    const url = window.location.origin + '/index.html#post-' + post.id;

    if (navigator.share) {
      navigator
        .share({
          title: 'Uncensored Social Post',
          text: post.content || '',
          url
        })
        .catch(() => {
          // user cancelled, ignore
        });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => this.showToast('Post link copied!', 'success'))
        .catch(() =>
          this.showToast('Could not copy link.', 'error')
        );
    } else {
      alert('Share this link:\n' + url);
    }
  }

  /* ----------------------- UTIL / TOAST ----------------------- */

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

// optional: used by the refresh button in header
window.refreshFeed = function () {
  if (window.feedManager) {
    window.feedManager.loadPosts();
  }
};
