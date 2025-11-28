// js/profile.js

const API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/api';

class ProfilePage {
    constructor() {
        this.profile = null;
        this.pendingAvatarDataUrl = null; // used if they upload an image
    }

    async init() {
        // if not logged in, go to signup
        if (!isLoggedIn || !getAuthToken || !getCurrentUser || !isLoggedIn()) {
            window.location.href = 'signup.html';
            return;
        }

        this.cacheDom();
        this.bindEvents();

        await this.loadProfile();
    }

    cacheDom() {
        this.displayNameEl = document.getElementById('profileDisplayName');
        this.usernameEl    = document.getElementById('profileUsername');
        this.avatarEl      = document.getElementById('profileAvatar');
        this.joinDateEl    = document.getElementById('joinDate');
        this.postsCountEl  = document.getElementById('postsCount');
        this.followersEl   = document.getElementById('followersCount');
        this.followingEl   = document.getElementById('followingCount');
        this.postsContainer = document.getElementById('profilePosts');

        // edit modal elements
        this.editModal      = document.getElementById('editProfileModal');
        this.editNameInput  = document.getElementById('editDisplayName');
        this.editBioInput   = document.getElementById('editBio');
        this.editAvatarUrlInput = document.getElementById('editAvatarUrl');
        this.editAvatarFileInput = document.getElementById('editAvatarFile');
        this.bioCounter     = document.getElementById('bioCharCounter');
    }

    bindEvents() {
        // Edit profile button
        document.getElementById('editProfileBtn')?.addEventListener('click', () => {
            this.openEditModal();
        });

        // Modal close buttons
        document.getElementById('closeEditModal')?.addEventListener('click', () => this.closeEditModal());
        document.getElementById('cancelEditBtn')?.addEventListener('click', () => this.closeEditModal());

        // Save button
        document.getElementById('saveProfileBtn')?.addEventListener('click', () => this.saveProfile());

        // Bio counter
        this.editBioInput?.addEventListener('input', () => this.updateBioCounter());

        // Avatar file upload -> convert to data URL (simple approach)
        this.editAvatarFileInput?.addEventListener('change', (e) => this.handleAvatarFile(e));

        // Settings icon → settings.html
        document.getElementById('settingsButton')?.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
    }

    async loadProfile() {
        try {
            const res = await fetch(`${API_BASE_URL}/users/me`, {
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                }
            });

            if (!res.ok) {
                if (res.status === 401) {
                    // token invalid → force re-login
                    clearAuth && clearAuth();
                    window.location.href = 'signup.html';
                    return;
                }
                throw new Error('Failed to load profile');
            }

            const data = await res.json();
            this.profile = data;
            this.renderProfile();
            this.renderEmptyPosts();
        } catch (err) {
            console.error('loadProfile error:', err);
            alert('Error loading profile. Please try again.');
        }
    }

    renderProfile() {
        if (!this.profile) return;

        const {
            display_name,
            username,
            avatar_url,
            bio,
            created_at
        } = this.profile;

        if (this.displayNameEl) this.displayNameEl.textContent = display_name || 'Unnamed';
        if (this.usernameEl) this.usernameEl.textContent = '@' + (username || 'username');
        if (this.avatarEl) {
            this.avatarEl.src = avatar_url || 'assets/icons/default-profile.png';
            this.avatarEl.onerror = () => {
                this.avatarEl.src = 'assets/icons/default-profile.png';
            };
        }
        if (this.joinDateEl) {
            const d = created_at ? new Date(created_at) : new Date();
            this.joinDateEl.textContent =
                'Joined ' + d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        // We don't have followers / following counts yet – just show 0 safely.
        if (this.postsCountEl) this.postsCountEl.textContent = '0';
        if (this.followersEl) this.followersEl.textContent = '0';
        if (this.followingEl) this.followingEl.textContent = '0';
    }

    renderEmptyPosts() {
        if (!this.postsContainer) return;
        this.postsContainer.innerHTML = `
          <div class="empty-state">
            <h3>No posts yet</h3>
            <p>Share something on the home feed!</p>
            <button class="btn btn-primary mt-3" onclick="window.location.href='index.html'">
              Go to Home
            </button>
          </div>
        `;
    }

    // ---- Edit Profile ----

    openEditModal() {
        if (!this.profile || !this.editModal) return;

        this.editNameInput.value  = this.profile.display_name || '';
        this.editBioInput.value   = this.profile.bio || '';
        this.editAvatarUrlInput.value = this.profile.avatar_url || '';
        this.pendingAvatarDataUrl = null;

        this.updateBioCounter();
        this.editModal.classList.add('open');
    }

    closeEditModal() {
        if (this.editModal) {
            this.editModal.classList.remove('open');
        }
    }

    updateBioCounter() {
        if (!this.bioCounter || !this.editBioInput) return;
        const len = this.editBioInput.value.length;
        this.bioCounter.textContent = `${len}/160`;

        this.bioCounter.classList.remove('warning', 'error');
        if (len > 160) {
            this.bioCounter.classList.add('error');
        } else if (len > 140) {
            this.bioCounter.classList.add('warning');
        }
    }

    handleAvatarFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            this.pendingAvatarDataUrl = reader.result; // data:image/... base64
            // Preview immediately
            if (this.avatarEl) this.avatarEl.src = this.pendingAvatarDataUrl;
        };
        reader.readAsDataURL(file);
    }

    async saveProfile() {
        if (!this.profile) return;

        const display_name = this.editNameInput.value.trim();
        const bio          = this.editBioInput.value.trim();
        let avatar_url     = this.editAvatarUrlInput.value.trim() || this.profile.avatar_url || null;

        // If they uploaded a file this session, prefer that
        if (this.pendingAvatarDataUrl) {
            avatar_url = this.pendingAvatarDataUrl;
        }

        if (!display_name) {
            alert('Display name is required.');
            return;
        }
        if (bio.length > 160) {
            alert('Bio must be 160 characters or less.');
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/users/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({ display_name, bio, avatar_url })
            });

            if (!res.ok) {
                throw new Error('Failed to update profile');
            }

            const updated = await res.json();
            this.profile = updated;

            // also update cached user in localStorage via auth.js helper if present
            try {
                if (typeof setCurrentUser === 'function') {
                    setCurrentUser(updated);
                }
            } catch (e) {
                console.warn('Could not update cached currentUser:', e);
            }

            this.renderProfile();
            this.closeEditModal();
            alert('Profile updated!');
        } catch (err) {
            console.error('saveProfile error:', err);
            alert('Error updating profile. Please try again.');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const page = new ProfilePage();
    page.init();
});
