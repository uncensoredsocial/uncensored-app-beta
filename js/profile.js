// js/profile.js

// === CONFIG ===
const API_BASE_URL =
  window.API_BASE_URL || 'https://uncensored-app-beta-production.up.railway.app/api';

// --- small helpers so this works even if auth.js is simple ---

function getAuthToken() {
  if (window.auth && typeof window.auth.getToken === 'function') {
    return window.auth.getToken();
  }
  return localStorage.getItem('authToken');
}

function getCurrentUser() {
  if (window.auth && typeof window.auth.getCurrentUser === 'function') {
    return window.auth.getCurrentUser();
  }
  const raw = localStorage.getItem('currentUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSession(user, token) {
  // keep auth.js happy if it exists
  if (window.auth && typeof window.auth.setSession === 'function') {
    window.auth.setSession(user, token);
  } else {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    }
    if (token) {
      localStorage.setItem('authToken', token);
    }
  }
}

function requireAuth() {
  const token = getAuthToken();
  if (!token) {
    window.location.href = 'signup.html';
    return null;
  }
  return token;
}

// === PROFILE PAGE LOGIC ===

class ProfilePage {
  constructor() {
    this.user = null;
    this.currentTab = 'posts';
    this.init();
  }

  async init() {
    const token = requireAuth();
    if (!token) return;

    this.cacheElements();
    this.attachEvents();

    await this.loadProfileFromApi(token);
    await this.loadPosts();
  }

  cacheElements() {
    this.nameEl = document.getElementById('profileName');
    this.usernameEl = document.getElementById('profileUsername');
    this.bioEl = document.getElementById('profileBio');
    this.joinedEl = document.getElementById('profileJoined');
    this.postsCountEl = document.getElementById('profilePostsCount');
    this.followersCountEl = document.getElementById('profileFollowersCount');
    this.followingCountEl = document.getElementById('profileFollowingCount');
    this.avatarEl = document.getElementById('profileAvatar');

    this.postsListEl = document.getElementById('profilePostsList');
    this.likesListEl = document.getElementById('profileLikesList');
    this.postsEmptyEl = document.getElementById('profilePostsEmpty');
    this.likesEmptyEl = document.getElementById('profileLikesEmpty');

    // modal
    this.editModal = document.getElementById('editProfileModal');
    this.editDisplayNameInput = document.getElementById('editDisplayName');
    this.editBioInput = document.getElementById('editBio');
    this.editAvatarInput = document.getElementById('editAvatarUrl');
    this.bioCharCounter = document.getElementById('bioCharCounter');
  }

  attachEvents() {
    // Edit profile button
    const editBtn = document.getElementById('editProfileBtn');
    if (editBtn) {
      editBtn.addEventListener('click', () => this.openEditModal());
    }

    // Settings gear
    const settingsBtn = document.getElementById('settingsButton');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        window.location.href = 'settings.html';
      });
    }

    // Tabs
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Modal buttons
    document.getElementById('closeEditModal')?.addEventListener('click', () =>
      this.closeEditModal()
    );
    document.getElementById('cancelEditBtn')?.addEventListener('click', () =>
      this.closeEditModal()
    );
    document.getElementById('saveProfileBtn')?.addEventListener('click', () =>
      this.saveProfile()
    );

    // Bio char counter
    if (this.editBioInput && this.bioCharCounter) {
      this.editBioInput.addEventListener('input', () => this.updateBioCounter());
    }

    // Close modal when clicking backdrop
    if (this.editModal) {
      this.editModal.addEventListener('click', (e) => {
        if (e.target === this.editModal) this.closeEditModal();
      });
    }
  }

  async loadProfileFromApi(token) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        // token invalid → force re-login
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        window.location.href = 'signup.html';
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to load profile');
      }

      const user = await res.json();
      this.user = user;
      // refresh local session
      setSession(user, token);

      this.renderProfile();
    } catch (err) {
      console.error('Profile load error:', err);
      this.showToast('Failed to load profile', 'error');
    }
  }

  renderProfile() {
    if (!this.user) return;

    const u = this.user;

    if (this.nameEl) this.nameEl.textContent = u.display_name || u.username || 'User';
    if (this.usernameEl) this.usernameEl.textContent = '@' + (u.username || 'username');
    if (this.bioEl) this.bioEl.textContent = u.bio || 'No bio yet.';
    if (this.joinedEl) this.joinedEl.textContent = this.formatJoined(u.created_at);

    if (this.postsCountEl) this.postsCountEl.textContent = u.posts_count ?? 0;
    if (this.followersCountEl) this.followersCountEl.textContent = u.followers_count ?? 0;
    if (this.followingCountEl) this.followingCountEl.textContent = u.following_count ?? 0;

    if (this.avatarEl) {
      this.avatarEl.src = u.avatar_url || 'assets/icons/default-profile.png';
    }
  }

  async loadPosts() {
    if (!this.user || !this.postsListEl) return;

    // basic implementation: your backend has /api/users/:username/posts
    try {
      this.postsListEl.innerHTML = '<div class="loading-indicator">Loading posts...</div>';
      this.postsEmptyEl.style.display = 'none';

      const res = await fetch(
        `${API_BASE_URL}/users/${encodeURIComponent(this.user.username)}/posts`
      );
      if (!res.ok) {
        throw new Error('Failed to load posts');
      }
      const posts = await res.json();

      if (!posts || posts.length === 0) {
        this.postsListEl.innerHTML = '';
        this.postsEmptyEl.style.display = 'block';
        return;
      }

      this.postsListEl.innerHTML = posts
        .map(
          (p) => `
        <article class="profile-post">
          <div class="profile-post-content">
            ${this.formatPostContent(p.content)}
          </div>
          <div class="profile-post-meta">
            <span>${this.formatTimestamp(p.created_at)}</span>
          </div>
        </article>
      `
        )
        .join('');
    } catch (err) {
      console.error('Profile posts error:', err);
      this.postsListEl.innerHTML = '';
      this.postsEmptyEl.style.display = 'block';
      this.showToast('Failed to load posts', 'error');
    }
  }

  // ---- Tabs ----
  switchTab(tab) {
    this.currentTab = tab;

    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.profile-tab-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.tabPane === tab);
    });

    // you can later add loading for likes here
  }

  // ---- Edit Profile Modal ----

  openEditModal() {
    if (!this.user || !this.editModal) return;

    this.editDisplayNameInput.value = this.user.display_name || '';
    this.editBioInput.value = this.user.bio || '';
    this.editAvatarInput.value = this.user.avatar_url || '';
    this.updateBioCounter();

    this.editModal.classList.add('open');
  }

  closeEditModal() {
    if (this.editModal) this.editModal.classList.remove('open');
  }

  updateBioCounter() {
    if (!this.editBioInput || !this.bioCharCounter) return;
    const len = this.editBioInput.value.length;
    this.bioCharCounter.textContent = `${len}/160`;
    this.bioCharCounter.classList.toggle('warning', len > 140 && len <= 160);
    this.bioCharCounter.classList.toggle('error', len > 160);
  }

  async saveProfile() {
    if (!this.user) return;
    const token = getAuthToken();
    if (!token) {
      window.location.href = 'signup.html';
      return;
    }

    const display_name = this.editDisplayNameInput.value.trim();
    const bio = this.editBioInput.value.trim();
    const avatar_url = this.editAvatarInput.value.trim();

    if (bio.length > 160) {
      this.showToast('Bio must be 160 characters or less', 'error');
      return;
    }

    try {
      const saveBtn = document.getElementById('saveProfileBtn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ display_name, bio, avatar_url })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update profile');
      }

      const updated = await res.json();
      this.user = updated;
      setSession(updated, token);
      this.renderProfile();
      this.closeEditModal();
      this.showToast('Profile updated', 'success');
    } catch (err) {
      console.error('Save profile error:', err);
      this.showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      const saveBtn = document.getElementById('saveProfileBtn');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    }
  }

  // ---- Utility formatting ----

  formatJoined(dateStr) {
    if (!dateStr) return 'Joined —';
    const d = new Date(dateStr);
    return `Joined ${d.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    })}`;
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return 'just now';
    const postDate = new Date(timestamp);
    const now = new Date();
    const diffMs = now - postDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return postDate.toLocaleDateString();
  }

  formatPostContent(content) {
    if (!content) return '';
    let safe = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    safe = safe.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
    safe = safe.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
    safe = safe.replace(/@(\w+)/g, '<span class="mention">@$1</span>');

    return safe;
  }

  showToast(message, type = 'info') {
    const existing = document.querySelector('.status-message');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = `status-message status-${type}`;
    div.textContent = message;
    div.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      max-width: 90%;
    `;
    document.body.appendChild(div);

    setTimeout(() => {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 3000);
  }
}

// init
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('profilePage')) {
    new ProfilePage();
  }
});
