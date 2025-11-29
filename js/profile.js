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

        // Try local user first so UI doesn't stay "Loading..."
        const localUser = window.getCurrentUser ? getCurrentUser() : null;
        if (localUser) {
            this.setUser(localUser);
        }

        // Then refresh from backend
        await this.fetchCurrentUser();
        await this.fetchUserPosts();
    }

    cacheDom() {
        // Main profile fields
        this.displayNameEl = document.getElementById('profileDisplayName');
        this.usernameEl = document.getElementById('profileUsername');
        this.bioEl = document.getElementById('profileBio');
        this.joinEl = document.getElementById('profileJoinDate');
        this.avatarEl = document.getElementById('profileAvatar');
        this.bannerEl = document.getElementById('profileBanner');

        // Stats
        this.postsCountEl = document.getElementById('postsCount');
        this.followersCountEl = document.getElementById('followersCount');
        this.followingCountEl = document.getElementById('followingCount');

        // Posts list
        this.postsContainer = document.getElementById('profilePosts');

        // Buttons
        this.settingsButton = document.getElementById('settingsButton');
        this.editProfileBtn = document.getElementById('editProfileBtn');

        // Edit profile modal + fields
        this.editModal = document.getElementById('editProfileModal');
        this.editForm = document.getElementById('editProfileForm');
        this.editDisplayNameInput = document.getElementById('editDisplayName');
        this.editBioInput = document.getElementById('editBio');
        this.bioCharCounter = document.getElementById('bioCharCounter');

        // NEW: file inputs for profile picture + banner
        this.editProfileImageInput = document.getElementById('editProfileImage');
        this.editBannerImageInput = document.getElementById('editBannerImage');

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

        // Close modal when clicking backdrop
        if (this.editModal) {
            this.editModal.addEventListener('click', (e) => {
                if (e.target === this.editModal) {
                    this.closeEditModal();
                }
            });
        }
    }

    /* ================= API ================= */

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

            // Sync local storage
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

            if (!res.ok) {
                // This is the message you’re seeing:
                throw new Error('Failed to load posts');
            }

            const posts = await res.json();
            this.posts = posts || [];

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

    /* ================= PROFILE UI ================= */

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

    renderPosts() {
        if (!this.postsContainer) return;
        this.postsContainer.innerHTML = '';

        this.posts.forEach((post) => {
            const div = document.createElement('div');
            div.className = 'post profile-post';

            div.innerHTML = `
                <div class="post-header">
                    <img src="${this.user.avatar_url || 'assets/icons/default-profile.png'}"
                         class="post-user-avatar">
                    <div class="post-user-info">
                        <div class="post-display-name">${this.user.display_name || this.user.username}</div>
                        <div class="post-username">@${this.user.username}</div>
                    </div>
                </div>
                <div class="post-content">${this.escape(post.content)}</div>
                <div class="post-meta">
                    <span class="post-date">
                        ${new Date(post.created_at).toLocaleString()}
                    </span>
                </div>
            `;

            this.postsContainer.appendChild(div);
        });
    }

    /* ============ EDIT PROFILE MODAL ============ */

    openEditModal() {
        if (!this.editModal || !this.user) return;

        this.editDisplayNameInput.value = this.user.display_name || '';
        this.editBioInput.value = this.user.bio || '';

        // Clear file inputs
        if (this.editProfileImageInput) {
            this.editProfileImageInput.value = '';
        }
        if (this.editBannerImageInput) {
            this.editBannerImageInput.value = '';
        }

        if (this.editErrorEl) this.editErrorEl.classList.add('hidden');
        if (this.editSuccessEl) this.editSuccessEl.classList.add('hidden');

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

        let avatar_url = this.user.avatar_url || null;
        let banner_url = this.user.banner_url || null;

        if (this.editErrorEl) this.editErrorEl.classList.add('hidden');
        if (this.editSuccessEl) this.editSuccessEl.classList.add('hidden');

        try {
            // If user picked a new profile picture, upload it
            if (this.editProfileImageInput && this.editProfileImageInput.files[0]) {
                const file = this.editProfileImageInput.files[0];
                avatar_url = await this.uploadImage(file, 'avatar');
            }

            // If user picked a new banner image, upload it
            if (this.editBannerImageInput && this.editBannerImageInput.files[0]) {
                const file = this.editBannerImageInput.files[0];
                banner_url = await this.uploadImage(file, 'banner');
            }

            const res = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    display_name,
                    bio,
                    avatar_url,
                    banner_url
                })
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || 'Failed to update profile');
            }

            // Update UI + local storage
            this.setUser(data);
            if (window.setCurrentUser) setCurrentUser(data);

            if (this.editSuccessEl) {
                this.editSuccessEl.textContent = 'Profile updated!';
                this.editSuccessEl.classList.remove('hidden');
            }

            setTimeout(() => {
                this.closeEditModal();
            }, 700);
        } catch (err) {
            console.error('handleEditSubmit error:', err);
            if (this.editErrorEl) {
                this.editErrorEl.textContent = err.message || 'Failed to update profile';
                this.editErrorEl.classList.remove('hidden');
            }
        }
    }

    async uploadImage(file, kind) {
        // kind = 'avatar' or 'banner'
        const base64 = await this.fileToBase64(file);
        const pureBase64 = base64.split(',')[1]; // remove "data:image/...;base64,"

        const res = await fetch(`${PROFILE_API_BASE_URL}/profile/upload-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({
                imageData: pureBase64,
                kind
            })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) {
            throw new Error(data.error || 'Failed to upload image');
        }

        return data.url; // public URL in Supabase bucket
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
        });
    }

    /* ============ TABS ============ */

    switchTab(tabName) {
        this.tabButtons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        if (this.postsTabPane) {
            this.postsTabPane.classList.toggle('active', tabName === 'posts');
        }
        if (this.likesTabPane) {
            this.likesTabPane.classList.toggle('active', tabName === 'likes');
        }
    }

    /* ============ HELPERS ============ */

    formatJoinDate(dateString) {
        if (!dateString) return 'Joined —';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return 'Joined —';

        const opts = { month: 'long', year: 'numeric' };
        return `Joined ${date.toLocaleDateString(undefined, opts)}`;
    }

    showTempMessage(message, type = 'info') {
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

    escape(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[m]);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('profile-page-body')) {
        const page = new ProfilePage();
        page.init();
        window.profilePage = page;
    }
});
