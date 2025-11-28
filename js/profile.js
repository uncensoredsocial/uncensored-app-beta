// js/profile.js
const API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/api';

class ProfilePage {
    constructor() {
        this.user = null;
        this.init();
    }

    async init() {
        // Require auth
        if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
            window.location.href = 'signup.html';
            return;
        }

        this.cacheElements();
        this.setupEvents();

        await this.loadProfile();
        this.loadPostsPlaceholder();
    }

    cacheElements() {
        this.displayNameEl = document.getElementById('profileDisplayName');
        this.usernameEl = document.getElementById('profileUsername');
        this.bioEl = document.getElementById('profileBio');
        this.joinedEl = document.getElementById('profileJoined');
        this.avatarEl = document.getElementById('profileAvatar');
        this.postsCountEl = document.getElementById('profilePostsCount');
        this.followersCountEl = document.getElementById('profileFollowersCount');
        this.followingCountEl = document.getElementById('profileFollowingCount');

        this.postsContainer = document.getElementById('profilePosts');

        // Edit modal
        this.editModal = document.getElementById('editProfileModal');
        this.editDisplayName = document.getElementById('editDisplayName');
        this.editBio = document.getElementById('editBio');
        this.editAvatarUrl = document.getElementById('editAvatarUrl');
        this.bioCharCounter = document.getElementById('bioCharCounter');
        this.editError = document.getElementById('editProfileError');
        this.editSuccess = document.getElementById('editProfileSuccess');
    }

    setupEvents() {
        // Settings button -> settings.html (placeholder)
        const settingsButton = document.getElementById('settingsButton');
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                // you can create settings.html later
                window.location.href = 'settings.html';
            });
        }

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Edit profile open/close
        document.getElementById('editProfileButton')?.addEventListener('click', () => this.openEditModal());
        document.getElementById('closeEditProfile')?.addEventListener('click', () => this.closeEditModal());
        document.getElementById('cancelEditProfile')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.closeEditModal();
        });

        document.getElementById('saveEditProfile')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.saveProfile();
        });

        // Bio counter
        this.editBio?.addEventListener('input', () => this.updateBioCounter());

        // Close modal on backdrop click
        this.editModal?.addEventListener('click', (e) => {
            if (e.target === this.editModal) this.closeEditModal();
        });
    }

    async loadProfile() {
        try {
            const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
            if (!token) {
                window.location.href = 'signup.html';
                return;
            }

            const res = await fetch(`${API_BASE_URL}/users/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                console.error('Profile load failed', await res.text());
                window.location.href = 'signup.html';
                return;
            }

            const data = await res.json();
            this.user = data;

            // Fallbacks
            this.user.display_name = this.user.display_name || this.user.username;
            this.user.bio = this.user.bio || '';

            // Update UI
            this.renderProfile();

            // Refresh localStorage copy so other pages see updated data
            if (typeof setCurrentUser === 'function') {
                setCurrentUser(this.user);
            }

        } catch (err) {
            console.error('Error loading profile:', err);
        }
    }

    renderProfile() {
        if (!this.user) return;

        const displayName = this.user.display_name || this.user.username;
        this.displayNameEl.textContent = displayName;
        this.usernameEl.textContent = `@${this.user.username}`;
        this.bioEl.textContent = this.user.bio || 'No bio yet.';
        this.joinedEl.textContent = this.formatJoined(this.user.created_at);

        if (this.user.avatar_url) {
            this.avatarEl.src = this.user.avatar_url;
        } else {
            this.avatarEl.src = 'assets/icons/default-profile.png';
        }

        // For now, counts are 0 until you wire follow/post systems
        this.postsCountEl.textContent = this.user.posts_count || 0;
        this.followersCountEl.textContent = this.user.followers_count || 0;
        this.followingCountEl.textContent = this.user.following_count || 0;
    }

    loadPostsPlaceholder() {
        if (!this.postsContainer) return;

        this.postsContainer.innerHTML = `
            <div class="empty-state">
                <h3>No posts yet</h3>
                <p>Share your first post from the home feed.</p>
                <button class="btn btn-primary mt-3" onclick="window.location.href='index.html'">
                    Go to Home
                </button>
            </div>
        `;
    }

    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `${tab}Tab`);
        });
    }

    openEditModal() {
        if (!this.user || !this.editModal) return;

        this.editDisplayName.value = this.user.display_name || '';
        this.editBio.value = this.user.bio || '';
        this.editAvatarUrl.value = this.user.avatar_url || '';
        this.updateBioCounter();

        this.clearEditMessages();
        this.editModal.classList.add('open');
        this.editModal.setAttribute('aria-hidden', 'false');
    }

    closeEditModal() {
        if (!this.editModal) return;
        this.editModal.classList.remove('open');
        this.editModal.setAttribute('aria-hidden', 'true');
    }

    updateBioCounter() {
        if (!this.editBio || !this.bioCharCounter) return;
        const len = this.editBio.value.length;
        this.bioCharCounter.textContent = `${len}/160`;

        this.bioCharCounter.classList.remove('warning', 'error');
        if (len > 160) {
            this.bioCharCounter.classList.add('error');
        } else if (len > 140) {
            this.bioCharCounter.classList.add('warning');
        }
    }

    clearEditMessages() {
        if (this.editError) {
            this.editError.classList.add('hidden');
            this.editError.textContent = '';
        }
        if (this.editSuccess) {
            this.editSuccess.classList.add('hidden');
            this.editSuccess.textContent = '';
        }
    }

    showEditError(msg) {
        if (!this.editError) return;
        this.editError.textContent = msg;
        this.editError.classList.remove('hidden');
    }

    showEditSuccess(msg) {
        if (!this.editSuccess) return;
        this.editSuccess.textContent = msg;
        this.editSuccess.classList.remove('hidden');
    }

    async saveProfile() {
        if (!this.user) return;

        const display_name = this.editDisplayName.value.trim();
        const bio = this.editBio.value.trim();
        const avatar_url = this.editAvatarUrl.value.trim() || null;

        if (!display_name) {
            this.showEditError('Display name cannot be empty.');
            return;
        }

        this.clearEditMessages();

        try {
            const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
            if (!token) {
                this.showEditError('You are not logged in.');
                return;
            }

            const res = await fetch(`${API_BASE_URL}/users/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ display_name, bio, avatar_url })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                this.showEditError(errData.error || 'Failed to update profile.');
                return;
            }

            const updated = await res.json();
            this.user = updated;
            this.renderProfile();

            if (typeof setCurrentUser === 'function') {
                setCurrentUser(updated);
            }

            this.showEditSuccess('Profile updated!');
            setTimeout(() => this.closeEditModal(), 800);

        } catch (err) {
            console.error('Error saving profile:', err);
            this.showEditError('Unexpected error updating profile.');
        }
    }

    formatJoined(dateString) {
        if (!dateString) return 'Joined —';
        const d = new Date(dateString);
        const text = d.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });
        return `Joined ${text}`;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new ProfilePage();
});
