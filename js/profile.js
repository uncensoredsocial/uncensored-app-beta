// js/profile.js

const PROFILE_API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/api';

class ProfilePage {
    constructor() {
        this.user = null;
        this.posts = [];
    }

    async init() {
        // Require login
        if (!window.isLoggedIn || !isLoggedIn()) {
            window.location.href = 'signup.html';
            return;
        }

        this.cacheDom();
        this.bindEvents();

        // Try local user first so UI doesn't just say "Loading..." forever
        const localUser = window.getCurrentUser ? getCurrentUser() : null;
        if (localUser) {
            this.setUser(localUser);
        }

        // Then refresh from backend
        await this.fetchCurrentUser();
        await this.fetchUserPosts();
    }

    cacheDom() {
        this.displayNameEl = document.getElementById('profileDisplayName');
        this.usernameEl = document.getElementById('profileUsername');
        this.bioEl = document.getElementById('profileBio');
        this.joinEl = document.getElementById('profileJoinDate');
        this.avatarEl = document.getElementById('profileAvatar');
        this.bannerEl = document.getElementById('profileBanner');

        this.postsCountEl = document.getElementById('postsCount');
        this.followersCountEl = document.getElementById('followersCount');
        this.followingCountEl = document.getElementById('followingCount');

        this.postsContainer = document.getElementById('profilePosts');

        this.settingsButton = document.getElementById('settingsButton');
        this.editProfileBtn = document.getElementById('editProfileBtn');

        // Modal
        this.editModal = document.getElementById('editProfileModal');
        this.editForm = document.getElementById('editProfileForm');
        this.editDisplayNameInput = document.getElementById('editDisplayName');
        this.editBioInput = document.getElementById('editBio');
        this.bioCharCounter = document.getElementById('bioCharCounter');
        this.editAvatarUrlInput = document.getElementById('editAvatarUrl');
        this.editBannerUrlInput = document.getElementById('editBannerUrl');
        this.editErrorEl = document.getElementById('editProfileError');
        this.editSuccessEl = document.getElementById('editProfileSuccess');
        this.closeEditBtn = document.getElementById('closeEditProfileBtn');
        this.cancelEditBtn = document.getElementById('cancelEditProfileBtn');

        // Tabs
        this.tabButtons = document.querySelectorAll('.tab-btn');
        this.postsTabPane = document.getElementById('postsTab');
        this.likesTabPane = document.getElementById('likesTab');
    }

    bindEvents() {
        if (this.settingsButton) {
            this.settingsButton.addEventListener('click', () => {
                window.location.href = 'settings.html';
            });
        }

        if (this.editProfileBtn) {
            this.editProfileBtn.addEventListener('click', () => this.openEditModal());
        }

        if (this.closeEditBtn) {
            this.closeEditBtn.addEventListener('click', () => this.closeEditModal());
        }
        if (this.cancelEditBtn) {
            this.cancelEditBtn.addEventListener('click', () => this.closeEditModal());
        }

        if (this.editForm) {
            this.editForm.addEventListener('submit', (e) => this.handleEditSubmit(e));
        }

        if (this.editBioInput && this.bioCharCounter) {
            this.editBioInput.addEventListener('input', () => {
                const len = this.editBioInput.value.length;
                this.bioCharCounter.textContent = `${len}/160`;
                this.bioCharCounter.classList.toggle('warning', len > 140 && len <= 160);
                this.bioCharCounter.classList.toggle('error', len > 160);
            });
        }

        // Tabs
        this.tabButtons.forEach((btn) => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Close modal if clicking backdrop
        if (this.editModal) {
            this.editModal.addEventListener('click', (e) => {
                if (e.target === this.editModal) {
                    this.closeEditModal();
                }
            });
        }
    }

    async fetchCurrentUser() {
        try {
            const res = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`
                }
            });

            if (!res.ok) {
                throw new Error('Failed to load profile');
            }

            const user = await res.json();
            this.setUser(user);

            // sync local storage
            if (window.setCurrentUser) {
                setCurrentUser(user);
            }
        } catch (err) {
            console.error('fetchCurrentUser error:', err);
            this.showTempMessage('Failed to load profile', 'error');
        }
    }

    async fetchUserPosts() {
        if (!this.user || !this.user.username || !this.postsContainer) return;

        this.postsContainer.innerHTML = `
            <div class="loading-indicator">Loading posts...</div>
        `;

        try {
            const res = await fetch(
                `${PROFILE_API_BASE_URL}/users/${encodeURIComponent(this.user.username)}/posts`
            );
            if (!res.ok) throw new Error('Failed to load posts');

            const posts = await res.json();
            this.posts = posts || [];

            // Update posts count based on actual posts
            if (this.postsCountEl) {
                this.postsCountEl.textContent = this.posts.length.toString();
            }

            if (!this.posts.length) {
                this.postsContainer.innerHTML = `
                    <div class="empty-state">
                        <h3>No posts yet</h3>
                    </div>
                `;
                return;
            }

            this.renderPosts();
        } catch (err) {
            console.error('fetchUserPosts error:', err);
            this.postsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>Error loading posts</h3>
                </div>
            `;
        }
    }

    setUser(user) {
        this.user = user || this.user || {};

        const displayName = user.display_name || user.username || 'User';
        const username = user.username || 'username';
        const bio = user.bio || 'No bio yet.';
        const createdAt = user.created_at;

        if (this.displayNameEl) this.displayNameEl.textContent = displayName;
        if (this.usernameEl) this.usernameEl.textContent = `@${username}`;
        if (this.bioEl) this.bioEl.textContent = bio;
        if (this.joinEl) this.joinEl.textContent = this.formatJoinDate(createdAt);

        if (this.avatarEl) {
            this.avatarEl.src = user.avatar_url || 'assets/icons/default-profile.png';
        }

        if (this.bannerEl) {
            if (user.banner_url) {
                this.bannerEl.style.backgroundImage = `url("${user.banner_url}")`;
                this.bannerEl.classList.add('profile-banner-image');
            } else {
                // keep gradient background
                this.bannerEl.style.backgroundImage = '';
                this.bannerEl.classList.remove('profile-banner-image');
            }
        }

        if (this.postsCountEl) {
            this.postsCountEl.textContent = (user.posts_count || 0).toString();
        }
        if (this.followersCountEl) {
            this.followersCountEl.textContent = (user.followers_count || 0).toString();
        }
        if (this.followingCountEl) {
            this.followingCountEl.textContent = (user.following_count || 0).toString();
        }
    }

    /* ------------ Edit Profile Modal ------------ */

    openEditModal() {
        if (!this.editModal || !this.user) return;

        this.editDisplayNameInput.value = this.user.display_name || '';
        this.editBioInput.value = this.user.bio || '';
        this.editAvatarUrlInput.value = this.user.avatar_url || '';
        this.editBannerUrlInput.value = this.user.banner_url || '';

        // reset messages
        this.editErrorEl.classList.add('hidden');
        this.editSuccessEl.classList.add('hidden');

        // update char counter
        if (this.bioCharCounter) {
            const len = this.editBioInput.value.length;
            this.bioCharCounter.textContent = `${len}/160`;
        }

        this.editModal.classList.add('open');
    }

    closeEditModal() {
        if (!this.editModal) return;
        this.editModal.classList.remove('open');
    }

    async handleEditSubmit(e) {
        e.preventDefault();
        if (!this.editForm) return;

        const display_name = this.editDisplayNameInput.value.trim();
        const bio = this.editBioInput.value.trim();
        const avatar_url = this.editAvatarUrlInput.value.trim();
        const banner_url = this.editBannerUrlInput.value.trim();

        this.editErrorEl.classList.add('hidden');
        this.editSuccessEl.classList.add('hidden');

        try {
            const res = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    display_name,
                    bio,
                    avatar_url: avatar_url || null,
                    banner_url: banner_url || null
                })
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || 'Failed to update profile');
            }

            // update UI + local storage
            this.setUser(data);
            if (window.setCurrentUser) setCurrentUser(data);

            this.editSuccessEl.textContent = 'Profile updated!';
            this.editSuccessEl.classList.remove('hidden');

            setTimeout(() => {
                this.closeEditModal();
            }, 700);
        } catch (err) {
            console.error('handleEditSubmit error:', err);
            this.editErrorEl.textContent = err.message || 'Failed to update profile';
            this.editErrorEl.classList.remove('hidden');
        }
    }

    /* ------------ Tabs ------------ */

    switchTab(tabName) {
        this.tabButtons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        this.postsTabPane.classList.toggle('active', tabName === 'posts');
        this.likesTabPane.classList.toggle('active', tabName === 'likes');
    }

    /* ------------ Helpers ------------ */

    formatJoinDate(dateString) {
        if (!dateString) return 'Joined —';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return 'Joined —';

        const opts = { month: 'long', year: 'numeric' };
        return `Joined ${date.toLocaleDateString(undefined, opts)}`;
    }

    showTempMessage(message, type = 'info') {
        // minimal toast
        const div = document.createElement('div');
        div.className = `status-message status-${type}`;
        div.textContent = message;
        div.style.cssText = `
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            max-width: 90%;
        `;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 2500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('profile-page-body')) {
        const page = new ProfilePage();
        page.init();
        window.profilePage = page;
    }
});
