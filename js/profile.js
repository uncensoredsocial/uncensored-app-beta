// js/profile.js

const API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/api';

class ProfilePage {
  constructor() {
    this.currentProfile = null;
    this.currentTab = 'posts';
  }

  async init() {
    // If not logged in → signup
    if (!this.isLoggedIn()) {
      window.location.href = 'signup.html';
      return;
    }

    this.cacheDom();
    this.bindEvents();
    await this.loadCurrentUserProfile();
  }

  // ----- auth helpers -----
  isLoggedIn() {
    const token = this.getAuthToken();
    return !!token;
  }

  getAuthToken() {
    return localStorage.getItem('authToken');
  }

  getCurrentUserFromStorage() {
    const raw = localStorage.getItem('currentUser');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setCurrentUserInStorage(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
  }

  // ----- DOM cache -----
  cacheDom() {
    this.displayNameEl = document.getElementById('profileDisplayName');
    this.usernameEl = document.getElementById('profileUsername');
    this.bioEl = document.getElementById('profileBio');
    this.joinDateEl = document.getElementById('joinDate');
    this.postsCountEl = document.getElementById('postsCount');
    this.followersCountEl = document.getElementById('followersCount');
    this.followingCountEl = document.getElementById('followingCount');
    this.avatarEl = document.getElementById('profileAvatar');
    this.bannerEl = document.getElementById('profileBanner');
    this.postsContainer = document.getElementById('profilePosts');

    // modal
    this.editModal = document.getElementById('editProfileModal');
    this.editDisplayNameInput = document.getElementById('editDisplayName');
    this.editBioInput = document.getElementById('editBio');
    this.editAvatarUrlInput = document.getElementById('editAvatarUrl');
    this.editBannerUrlInput = document.getElementById('editBannerUrl');
    this.bioCharCounter = document.getElementById('bioCharCounter');
  }

  // ----- events -----
  bindEvents() {
    // Tabs
    var tabButtons = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabButtons.length; i++) {
      tabButtons[i].addEventListener('click', (e) => {
        var tab = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tab);
      });
    }

    // Settings button → settings.html
    var settingsButton = document.getElementById('settingsButton');
    if (settingsButton) {
      settingsButton.addEventListener('click', () => {
        window.location.href = 'settings.html';
      });
    }

    // Edit profile open
    var editBtn = document.getElementById('editProfileButton');
    if (editBtn) {
      editBtn.addEventListener('click', () => this.openEditModal());
    }

    // Close modal (X)
    var closeModalBtn = document.getElementById('closeEditModal');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', () => this.closeEditModal());
    }

    // Cancel button
    var cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeEditModal();
      });
    }

    // Save profile
    var saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.saveProfile();
      });
    }

    // Bio counter
    if (this.editBioInput) {
      this.editBioInput.addEventListener('input', () =>
        this.updateBioCharCounter()
      );
    }

    // Close modal when clicking background
    if (this.editModal) {
      this.editModal.addEventListener('click', (e) => {
        if (e.target === this.editModal) {
          this.closeEditModal();
        }
      });
    }
  }

  // ----- load profile from backend -----
  async loadCurrentUserProfile() {
    try {
      const token = this.getAuthToken();
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          // token invalid → send to signup
          localStorage.removeItem('authToken');
          localStorage.removeItem('currentUser');
          window.location.href = 'signup.html';
          return;
        }
        throw new Error('Failed to load profile');
      }

      const user = await res.json();
      this.currentProfile = user;

      // store simplified user for rest of the app
      this.setCurrentUserInStorage({
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        bio: user.bio,
        created_at: user.created_at,
        posts_count: user.posts_count,
        followers_count: user.followers_count,
        following_count: user.following_count,
      });

      this.renderProfile();
      await this.loadProfilePosts(user.username);
    } catch (err) {
      console.error(err);
      this.showMessage('Failed to load profile', 'error');
    }
  }

  renderProfile() {
    if (!this.currentProfile) return;
    const u = this.currentProfile;

    if (this.displayNameEl) this.displayNameEl.textContent = u.display_name;
    if (this.usernameEl) this.usernameEl.textContent = '@' + u.username;
    if (this.bioEl) this.bioEl.textContent = u.bio || 'No bio yet.';

    if (this.joinDateEl) {
      this.joinDateEl.textContent = this.formatJoinDate(u.created_at);
    }

    if (this.postsCountEl)
      this.postsCountEl.textContent = u.posts_count || 0;
    if (this.followersCountEl)
      this.followersCountEl.textContent = u.followers_count || 0;
    if (this.followingCountEl)
      this.followingCountEl.textContent = u.following_count || 0;

    if (this.avatarEl) {
      this.avatarEl.src =
        u.avatar_url || 'assets/icons/default-profile.png';
    }

    if (this.bannerEl) {
      if (u.banner_url) {
        this.bannerEl.src = u.banner_url;
        this.bannerEl.classList.remove('hidden');
      } else {
        this.bannerEl.src = '';
        this.bannerEl.classList.add('hidden');
      }
    }

    document.title = `${u.display_name} (@${u.username}) - UncensoredSocial`;
  }

  async loadProfilePosts(username) {
    if (!this.postsContainer) return;

    this.postsContainer.innerHTML =
      '<div class="loading-indicator">Loading posts…</div>';

    try {
      const res = await fetch(
        `${API_BASE_URL}/users/${encodeURIComponent(username)}/posts`
      );

      if (!res.ok) throw new Error('Failed to load posts');

      const posts = await res.json();

      if (!posts || posts.length === 0) {
        this.postsContainer.innerHTML = `
          <div class="empty-state">
            <h3>No posts yet</h3>
            <p>Share something on the home feed to see it here.</p>
          </div>`;
        return;
      }

      let html = '';
      for (let i = 0; i < posts.length; i++) {
        html += this.renderPostHtml(posts[i]);
      }
      this.postsContainer.innerHTML = html;
    } catch (err) {
      console.error(err);
      this.postsContainer.innerHTML = `
        <div class="empty-state">
          <h3>Couldn’t load posts</h3>
          <p>Please try again in a moment.</p>
        </div>`;
    }
  }

  renderPostHtml(post) {
    const content = this.formatPostContent(post.content || '');
    const time = this.formatTimestamp(post.created_at);

    return (
      '<article class="profile-post" data-post-id="' +
      post.id +
      '">' +
      '<div class="post-content"><p>' +
      content +
      '</p></div>' +
      '<div class="post-stats">' +
      '<span class="post-time">' +
      time +
      '</span>' +
      '</div>' +
      '</article>'
    );
  }

  // ----- tabs -----
  switchTab(tabName) {
    this.currentTab = tabName;

    var tabButtons = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabButtons.length; i++) {
      var btn = tabButtons[i];
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    }

    var panes = document.querySelectorAll('.tab-pane');
    for (var j = 0; j < panes.length; j++) {
      var pane = panes[j];
      pane.classList.toggle('active', pane.id === tabName + 'Tab');
    }

    if (tabName === 'posts' && this.currentProfile) {
      this.loadProfilePosts(this.currentProfile.username);
    }
  }

  // ----- edit profile -----
  openEditModal() {
    if (!this.currentProfile || !this.editModal) return;

    this.editDisplayNameInput.value =
      this.currentProfile.display_name || '';
    this.editBioInput.value = this.currentProfile.bio || '';
    this.editAvatarUrlInput.value = this.currentProfile.avatar_url || '';
    this.editBannerUrlInput.value = this.currentProfile.banner_url || '';
    this.updateBioCharCounter();

    this.editModal.classList.add('open');
  }

  closeEditModal() {
    if (this.editModal) this.editModal.classList.remove('open');
  }

  updateBioCharCounter() {
    if (!this.editBioInput || !this.bioCharCounter) return;

    var length = this.editBioInput.value.length;
    this.bioCharCounter.textContent = length + '/160';

    this.bioCharCounter.classList.remove('warning', 'error');
    if (length > 160) this.bioCharCounter.classList.add('error');
    else if (length > 140) this.bioCharCounter.classList.add('warning');
  }

  async saveProfile() {
    if (!this.currentProfile) return;

    const updates = {
      display_name: this.editDisplayNameInput.value.trim(),
      bio: this.editBioInput.value.trim(),
      avatar_url: this.editAvatarUrlInput.value.trim(),
      banner_url: this.editBannerUrlInput.value.trim(),
    };

    try {
      const token = this.getAuthToken();
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Failed to update profile');

      const updated = await res.json();
      this.currentProfile = updated;

      this.setCurrentUserInStorage({
        id: updated.id,
        username: updated.username,
        email: updated.email,
        display_name: updated.display_name,
        avatar_url: updated.avatar_url,
        banner_url: updated.banner_url,
        bio: updated.bio,
        created_at: updated.created_at,
        posts_count: updated.posts_count,
        followers_count: updated.followers_count,
        following_count: updated.following_count,
      });

      this.renderProfile();
      this.closeEditModal();
      this.showMessage('Profile updated', 'success');
    } catch (err) {
      console.error(err);
      this.showMessage('Failed to update profile', 'error');
    }
  }

  // ----- formatting helpers -----
  formatJoinDate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Joined —';
    return (
      'Joined ' +
      date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    );
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
    if (diffMins < 60) return diffMins + 'm';
    if (diffHours < 24) return diffHours + 'h';
    if (diffDays < 7) return diffDays + 'd';

    return postDate.toLocaleDateString();
  }

  formatPostContent(content) {
    let text = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    text = text.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
    text = text.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
    text = text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');

    return text;
  }

  // ----- messages -----
  showMessage(message, type) {
    type = type || 'info';

    const existing = document.querySelector('.status-message');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'status-message status-' + type;
    div.textContent = message;
    div.style.position = 'fixed';
    div.style.top = '20px';
    div.style.left = '50%';
    div.style.transform = 'translateX(-50%)';
    div.style.zIndex = '10000';
    div.style.maxWidth = '90%';

    document.body.appendChild(div);
    setTimeout(function () {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const page = new ProfilePage();
  page.init();
});
