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

        // Use local user first for instant UI
        const localUser = window.getCurrentUser ? getCurrentUser() : null;
        if (localUser) {
            this.setUser(localUser);
        }

        // Try to refresh from backend
        await this.fetchCurrentUser();
        await this.fetchUserPosts();
    }

    cacheDom() {
        this.displayNameEl   = document.getElementById('profileDisplayName');
        this.usernameEl      = document.getElementById('profileUsername');
        this.bioEl           = document.getElementById('profileBio');
        this.joinEl          = document.getElementById('profileJoinDate');
        this.avatarEl        = document.getElementById('profileAvatar');
        this.bannerEl        = document.getElementById('profileBanner');

        this.postsCountEl    = document.getElementById('postsCount');
        this.followersCountEl= document.getElementById('followersCount');
        this.followingCountEl= document.getElementById('followingCount');

        this.postsContainer  = document.getElementById('profilePosts');

        this.settingsButton  = document.getElementById('settingsButton');
        this.editProfileBtn  = document.getElementById('editProfileBtn');

        // Modal
        this.editModal         = document.getElementById('editProfileModal');
        this.editForm          = document.getElementById('editProfileForm');
        this.editDisplayNameInput = document.getElementById('editDisplayName');
        this.editBioInput      = document.getElementById('editBio');
        this.bioCharCounter    = document.getElementById('bioCharCounter');
        this.avatarFileInput   = document.getElementById('editAvatarFile');
        this.bannerFileInput   = document.getElementById('editBannerFile');
        this.editErrorEl       = document.getElementById('editProfileError');
        this.editSuccessEl     = document.getElementById('editProfileSuccess');
        this.closeEditBtn      = document.getElementById('closeEditProfileBtn');
        this.cancelEditBtn     = document.getElementById('cancelEditProfileBtn');
        this.saveProfileBtn    = document.getElementById('saveProfileBtn');

        // Tabs
        this.tabButtons    = document.querySelectorAll('.tab-btn');
        this.postsTabPane  = document.getElementById('postsTab');
        this.likesTabPane  = document.getElementById('likesTab');
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

        // Close modal on backdrop click
        if (this.editModal) {
            this.editModal.addEventListener('click', (e) => {
                if (e.target === this.editModal) {
                    this.closeEditModal();
                }
            });
        }

        // Close any open post options menu when clicking outside
        document.addEventListener('click', (e) => {
            const menu = document.querySelector('.post-options-menu.open');
            if (!menu) return;
            const btn = menu.dataset.forButtonId
                ? document.getElementById(menu.dataset.forButtonId)
                : null;

            if (menu.contains(e.target) || (btn && btn.contains(e.target))) {
                return;
            }
            menu.classList.remove('open');
        });
    }

    /* ---------------- Fetch current user ---------------- */

    async fetchCurrentUser() {
        try {
            const res = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`
                }
            });

            if (!res.ok) {
                const msg = await res.text();
                console.warn('auth/me failed:', res.status, msg);
                return;
            }

            const user = await res.json();
            this.setUser(user);

            if (window.setCurrentUser) {
                setCurrentUser(user);
            }
        } catch (err) {
            console.warn('fetchCurrentUser error:', err);
        }
    }

    /* ---------------- Fetch user posts ---------------- */

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

    /* ---------------- RENDER POSTS (feed-style + delete) ---------------- */

    renderPosts() {
        if (!this.postsContainer) return;
        this.postsContainer.innerHTML = '';

        const user      = this.user || {};
        const avatar    = user.avatar_url || 'assets/icons/default-profile.png';
        const displayName = user.display_name || user.username || 'User';
        const username  = user.username || 'username';

        this.posts.forEach((post, index) => {
            const article = document.createElement('article');
            article.className = 'post';
            article.dataset.postId = post.id;

            // optional timestamp formatting
            let timeStr = '';
            if (post.created_at) {
                const d = new Date(post.created_at);
                if (!Number.isNaN(d.getTime())) {
                    timeStr = d.toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                    });
                }
            }

            const contentHtml = this.formatPostContent(post.content || '');

            const optionsBtnId = `post-options-btn-${post.id}-${index}`;

            article.innerHTML = `
                <header class="post-header">
                    <img
                        src="${avatar}"
                        class="post-user-avatar"
                        alt="${this.escapeHtml(displayName)}"
                        onerror="this.src='assets/icons/default-profile.png'"
                    />
                    <div class="post-user-info">
                        <div class="post-display-name">${this.escapeHtml(displayName)}</div>
                        <div class="post-username">@${this.escapeHtml(username)}</div>
                        ${
                            timeStr
                                ? `<div class="post-time">${this.escapeHtml(timeStr)}</div>`
                                : ''
                        }
                    </div>

                    <button
                        type="button"
                        class="post-options-btn"
                        id="${optionsBtnId}"
                        aria-label="Post options"
                    >
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>

                    <div class="post-options-menu" data-for-button-id="${optionsBtnId}">
                        <button
                            type="button"
                            class="post-options-item"
                            data-action="delete"
                        >
                            Delete post
                        </button>
                    </div>
                </header>

                <div class="post-content">
                    <p>${contentHtml}</p>
                </div>
            `;

            // Make whole post clickable to open the single post page (comments etc.)
            article.addEventListener('click', (e) => {
                // Ignore clicks on options button or menu
                if (
                    e.target.closest('.post-options-btn') ||
                    e.target.closest('.post-options-menu')
                ) {
                    return;
                }
                window.location.href = `post.html?id=${encodeURIComponent(post.id)}`;
            });

            const optionsBtn = article.querySelector('.post-options-btn');
            const optionsMenu = article.querySelector('.post-options-menu');
            const deleteBtn = article.querySelector('[data-action="delete"]');

            if (optionsBtn && optionsMenu) {
                optionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Close any other open menu
                    document
                        .querySelectorAll('.post-options-menu.open')
                        .forEach((m) => {
                            if (m !== optionsMenu) m.classList.remove('open');
                        });
                    optionsMenu.classList.toggle('open');
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    optionsMenu.classList.remove('open');
                    await this.handleDeletePost(post, article);
                });
            }

            this.postsContainer.appendChild(article);
        });
    }

    /* ---------------- Delete post ---------------- */

    async handleDeletePost(post, articleEl) {
        const confirmed = window.confirm('Delete this post?');
        if (!confirmed) return;

        try {
            const token = getAuthToken && getAuthToken();
            if (!token) {
                alert('You must be logged in to delete posts.');
                return;
            }

            const res = await fetch(
                `${PROFILE_API_BASE_URL}/posts/${encodeURIComponent(post.id)}`,
                {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || 'Failed to delete post');
            }

            // Remove from DOM
            if (articleEl && articleEl.parentNode) {
                articleEl.parentNode.removeChild(articleEl);
            }

            // Update local posts array + count
            this.posts = this.posts.filter((p) => p.id !== post.id);
            if (this.postsCountEl) {
                this.postsCountEl.textContent = this.posts.length.toString();
            }
        } catch (err) {
            console.error('handleDeletePost error:', err);
            alert(err.message || 'Failed to delete post');
        }
    }

    /* ---------------- Set user into UI ---------------- */

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

    /* ---------------- Edit Profile Modal ---------------- */

    openEditModal() {
        if (!this.editModal || !this.user) return;

        this.editDisplayNameInput.value = this.user.display_name || '';
        this.editBioInput.value = this.user.bio || '';

        if (this.avatarFileInput) this.avatarFileInput.value = '';
        if (this.bannerFileInput) this.bannerFileInput.value = '';

        this.editErrorEl.classList.add('hidden');
        this.editSuccessEl.classList.add('hidden');

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

        this.editErrorEl.classList.add('hidden');
        this.editSuccessEl.classList.add('hidden');

        if (this.saveProfileBtn) {
            this.saveProfileBtn.disabled = true;
            this.saveProfileBtn.textContent = 'Saving...';
        }

        try {
            let avatar_url = this.user.avatar_url || null;
            let banner_url = this.user.banner_url || null;

            if (this.avatarFileInput && this.avatarFileInput.files[0]) {
                avatar_url = await this.uploadImageFile(this.avatarFileInput.files[0], 'avatar');
            }

            if (this.bannerFileInput && this.bannerFileInput.files[0]) {
                banner_url = await this.uploadImageFile(this.bannerFileInput.files[0], 'banner');
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
        } finally {
            if (this.saveProfileBtn) {
                this.saveProfileBtn.disabled = false;
                this.saveProfileBtn.textContent = 'Save';
            }
        }
    }

    async uploadImageFile(file, kind) {
        const base64 = await this.readFileAsBase64(file);

        const res = await fetch(`${PROFILE_API_BASE_URL}/profile/upload-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({
                imageData: base64,
                kind
            })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.url) {
            throw new Error(data.error || `Failed to upload ${kind} image`);
        }

        return data.url;
    }

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result || '';
                const commaIndex = result.indexOf(',');
                if (commaIndex === -1) return resolve(result);
                resolve(result.slice(commaIndex + 1));
            };
            reader.onerror = () => reject(reader.error || new Error('File read error'));
            reader.readAsDataURL(file);
        });
    }

    switchTab(tabName) {
        this.tabButtons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        this.postsTabPane.classList.toggle('active', tabName === 'posts');
        this.likesTabPane.classList.toggle('active', tabName === 'likes');
    }

    formatJoinDate(dateString) {
        if (!dateString) return 'Joined —';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return 'Joined —';

        const opts = { month: 'long', year: 'numeric' };
        return `Joined ${date.toLocaleDateString(undefined, opts)}`;
    }

    formatPostContent(text = '') {
        const safe = this.escapeHtml(text);

        return safe
            .replace(
                /(https?:\/\/[^\s]+)/g,
                '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
            )
            .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
            .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    }

    escapeHtml(str = '') {
        return str.replace(/[&<>"']/g, (m) => {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[m];
        });
    }
}

/* ---------------- Init ---------------- */

document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('profile-page-body')) {
        const page = new ProfilePage();
        page.init();
        window.profilePage = page;
    }
});
