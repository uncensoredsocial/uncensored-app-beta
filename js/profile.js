// js/profile.js

const API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/api';

class ProfilePage {
    constructor() {
        this.user = null;
        this.currentTab = 'posts';
    }

    async init() {
        // If not logged in, force signup
        if (!isLoggedIn()) {
            window.location.href = 'signup.html';
            return;
        }

        this.cacheDom();
        this.bindEvents();
        await this.loadCurrentUser();
        await this.loadPostsForUser();
    }

    cacheDom() {
        this.displayNameEl = document.getElementById('profileDisplayName');
        this.usernameEl = document.getElementById('profileUsername');
        this.bioEl = document.getElementById('profileBio');
        this.joinDateEl = document.getElementById('joinDate');
        this.avatarEl = document.getElementById('profileAvatar');
        this.bannerEl = document.getElementById('profileBanner');

        this.postsCountEl = document.getElementById('postsCount');
        this.followersCountEl = document.getElementById('followersCount');
        this.followingCountEl = document.getElementById('followingCount');

        this.postsContainer = document.getElementById('profilePosts');
        this.likedPostsContainer = document.getElementById('likedPosts');

        this.tabButtons = document.querySelectorAll('.tab-btn');

        // Modal
        this.editModal = document.getElementById('editProfileModal');
        this.editDisplayName = document.getElementById('editDisplayName');
        this.editBio = document.getElementById('editBio');
        this.editAvatarUrl = document.getElementById('editAvatarUrl');
        this.editBannerUrl = document.getElementById('editBannerUrl');
        this.bioCharCounter = document.getElementById('bioCharCounter');
        this.editError = document.getElementById('editProfileError');
        this.editSuccess = document.getElementById('editProfileSuccess');
    }

    bindEvents() {
        // Tabs
        this.tabButtons.forEach((btn) => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Edit profile buttons
        document
            .getElementById('editProfileBtn')
            ?.addEventListener('click', () => this.openEditModal());

        document
            .getElementById('closeEditModal')
            ?.addEventListener('click', () => this.closeEditModal());

        document
            .getElementById('cancelEditBtn')
            ?.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeEditModal();
            });

        document
            .getElementById('saveProfileBtn')
            ?.addEventListener('click', (e) => {
                e.preventDefault();
                this.saveProfile();
            });

        // Bio counter
        this.editBio?.addEventListener('input', () => this.updateBioCounter());

        // Close modal when clicking backdrop
        this.editModal?.addEventListener('click', (e) => {
            if (e.target === this.editModal || e.target.classList.contains('modal-backdrop')) {
                this.closeEditModal();
            }
        });

        // Settings
        document
            .getElementById('settingsButton')
            ?.addEventListener('click', () => (window.location.href = 'settings.html'));
    }

    /* ------------------ LOAD DATA ------------------ */

    async loadCurrentUser() {
        try {
            const res = await fetch(`${API_BASE_URL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`,
                },
            });

            if (!res.ok) {
                throw new Error('Failed to load profile');
            }

            const user = await res.json();
            this.user = user;
            setCurrentUser(user);
            this.renderProfile(user);
        } catch (err) {
            console.error('Profile load error:', err);
            this.displayNameEl.textContent = 'Error loading profile';
            this.bioEl.textContent = '';
        }
    }

    renderProfile(user) {
        this.displayNameEl.textContent = user.display_name || user.username;
        this.usernameEl.textContent = `@${user.username}`;

        this.bioEl.textContent = user.bio || 'No bio yet.';
        this.joinDateEl.textContent = this.formatJoinDate(user.created_at);

        if (user.avatar_url && this.avatarEl) {
            this.avatarEl.src = user.avatar_url;
        }
        if (user.banner_url && this.bannerEl) {
            this.bannerEl.style.backgroundImage = `url(${user.banner_url})`;
            this.bannerEl.style.backgroundSize = 'cover';
            this.bannerEl.style.backgroundPosition = 'center';
        }

        this.postsCountEl.textContent = user.posts_count ?? 0;
        this.followersCountEl.textContent = user.followers_count ?? 0;
        this.followingCountEl.textContent = user.following_count ?? 0;
    }

    async loadPostsForUser() {
        if (!this.user) return;

        try {
            const res = await fetch(
                `${API_BASE_URL}/users/${encodeURIComponent(this.user.username)}/posts`
            );
            if (!res.ok) throw new Error('Failed to load posts');

            const posts = await res.json();
            this.renderPosts(posts);
        } catch (err) {
            console.error('Profile posts load error:', err);
            this.postsContainer.innerHTML =
                '<div class="empty-state"><p>Failed to load posts.</p></div>';
        }
    }

    renderPosts(posts) {
        if (!posts || posts.length === 0) {
            this.postsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>No posts yet</h3>
                    <p>Share your first post from the Home page.</p>
                </div>
            `;
            return;
        }

        this.postsContainer.innerHTML = posts
            .map(
                (p) => `
            <article class="profile-post">
                <div class="profile-post-content">
                    ${this.escape(this.formatPostContent(p.content))}
                </div>
                <div class="profile-post-meta">
                    <span>${this.formatTimestamp(p.created_at)}</span>
                </div>
            </article>
        `
            )
            .join('');
    }

    /* ------------------ EDIT PROFILE ------------------ */

    openEditModal() {
        if (!this.user || !this.editModal) return;

        this.editDisplayName.value = this.user.display_name || '';
        this.editBio.value = this.user.bio || '';
        this.editAvatarUrl.value = this.user.avatar_url || '';
        this.editBannerUrl.value = this.user.banner_url || '';

        this.updateBioCounter();
        this.editError.classList.add('hidden');
        this.editSuccess.classList.add('hidden');

        this.editModal.classList.add('open');
    }

    closeEditModal() {
        this.editModal?.classList.remove('open');
    }

    updateBioCounter() {
        if (!this.editBio || !this.bioCharCounter) return;
        const len = this.editBio.value.length;
        this.bioCharCounter.textContent = `${len}/160`;
    }

    async saveProfile() {
        if (!this.user) return;

        const payload = {
            display_name: this.editDisplayName.value.trim(),
            bio: this.editBio.value.trim(),
            avatar_url: this.editAvatarUrl.value.trim(),
            banner_url: this.editBannerUrl.value.trim(),
        };

        this.editError.classList.add('hidden');
        this.editSuccess.classList.add('hidden');

        try {
            const res = await fetch(`${API_BASE_URL}/auth/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getAuthToken()}`,
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || 'Failed to update profile');
            }

            this.user = { ...this.user, ...data };
            setCurrentUser(this.user);
            this.renderProfile(this.user);

            this.editSuccess.textContent = 'Profile updated!';
            this.editSuccess.classList.remove('hidden');

            setTimeout(() => this.closeEditModal(), 700);
        } catch (err) {
            console.error('Save profile error:', err);
            this.editError.textContent = err.message || 'Failed to update profile';
            this.editError.classList.remove('hidden');
        }
    }

    /* ------------------ TABS ------------------ */

    switchTab(tabName) {
        if (tabName === this.currentTab) return;
        this.currentTab = tabName;

        this.tabButtons.forEach((btn) =>
            btn.classList.toggle('active', btn.dataset.tab === tabName)
        );

        document
            .querySelectorAll('.tab-pane')
            .forEach((pane) => pane.classList.toggle('active', pane.id === `${tabName}Tab`));
    }

    /* ------------------ UTILITIES ------------------ */

    formatJoinDate(dateString) {
        if (!dateString) return 'Joined —';
        const d = new Date(dateString);
        return `Joined ${d.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
        })}`;
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { timeStyle: 'short' });
    }

    escape(str = '') {
        return str.replace(/[&<>"']/g, (m) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        })[m]);
    }

    formatPostContent(text = '') {
        // very light formatting (links / hashtags / mentions)
        let t = this.escape(text);
        t = t.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" rel="noopener">$1</a>'
        );
        t = t.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
        t = t.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
        return t;
    }
}

/* ----- INIT ----- */
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.profile-page')) {
        const page = new ProfilePage();
        page.init();
        window.profilePage = page;
    }
});
