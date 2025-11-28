// js/profile.js

const API_BASE_URL = 'https://uncensored-app-beta-production.up.railway.app/api';

class ProfilePage {
    constructor() {
        this.profile = null;
        this.isOwnProfile = false;
    }

    async init() {
        // 🔐 Hard gate: if not logged in, send to signup
        if (!window.isLoggedIn || !isLoggedIn()) {
            window.location.href = 'signup.html';
            return;
        }

        this.cacheDom();
        this.bindEvents();
        this.updateAuthUI();

        await this.loadProfile();
        await Promise.all([
            this.loadPosts(),
            this.loadLikes()
        ]);
    }

    cacheDom() {
        this.headerProfileImg = document.getElementById('headerProfileImg');
        this.profileSection = document.getElementById('profileSection');
        this.authButtons = document.getElementById('authButtons');

        this.profileAvatar = document.getElementById('profileAvatar');
        this.profileDisplayName = document.getElementById('profileDisplayName');
        this.profileUsername = document.getElementById('profileUsername');
        this.profileBio = document.getElementById('profileBio');
        this.profileJoinDate = document.getElementById('profileJoinDate');
        this.profileFollowers = document.getElementById('profileFollowers');
        this.profileFollowing = document.getElementById('profileFollowing');
        this.profileActions = document.getElementById('profileActions');

        this.postsContainer = document.getElementById('profilePosts');
        this.likesContainer = document.getElementById('profileLikes');
        this.postsLoading = document.getElementById('postsLoading');
        this.likesLoading = document.getElementById('likesLoading');

        this.avatarEditBtn = document.getElementById('avatarEditBtn');
        this.avatarFileInput = document.getElementById('avatarFileInput');

        this.editProfileModalOverlay = document.getElementById('editProfileModalOverlay');
        this.editProfileForm = document.getElementById('editProfileForm');
        this.editDisplayName = document.getElementById('editDisplayName');
        this.editUsername = document.getElementById('editUsername');
        this.editBio = document.getElementById('editBio');
        this.editProfileMessage = document.getElementById('editProfileMessage');
        this.closeEditProfileModalBtn = document.getElementById('closeEditProfileModal');
        this.cancelEditProfileBtn = document.getElementById('cancelEditProfile');
    }

    bindEvents() {
        // Tabs
        const tabs = document.querySelectorAll('.profile-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => this.handleTabClick(tab));
        });

        // Avatar edit
        if (this.avatarEditBtn) {
            this.avatarEditBtn.addEventListener('click', () => {
                if (!this.isOwnProfile) return;
                this.avatarFileInput.click();
            });
        }

        if (this.avatarFileInput) {
            this.avatarFileInput.addEventListener('change', (e) => this.handleAvatarFileChange(e));
        }

        // Edit profile modal
        if (this.editProfileForm) {
            this.editProfileForm.addEventListener('submit', (e) => this.handleEditProfileSubmit(e));
        }

        if (this.closeEditProfileModalBtn) {
            this.closeEditProfileModalBtn.addEventListener('click', () => this.closeEditProfileModal());
        }

        if (this.cancelEditProfileBtn) {
            this.cancelEditProfileBtn.addEventListener('click', () => this.closeEditProfileModal());
        }

        // Close modal when clicking outside
        if (this.editProfileModalOverlay) {
            this.editProfileModalOverlay.addEventListener('click', (e) => {
                if (e.target === this.editProfileModalOverlay) {
                    this.closeEditProfileModal();
                }
            });
        }
    }

    updateAuthUI() {
        const loggedIn = isLoggedIn?.();

        if (this.authButtons) {
            this.authButtons.style.display = loggedIn ? 'none' : 'flex';
        }
        if (this.profileSection) {
            this.profileSection.style.display = loggedIn ? 'flex' : 'none';
        }

        const currentUser = getCurrentUser?.();
        if (loggedIn && currentUser?.avatar_url && this.headerProfileImg) {
            this.headerProfileImg.src = currentUser.avatar_url;
        }
    }

    getUsernameFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const userParam = params.get('user');

        if (!userParam || userParam === 'me') {
            return null; // "current user"
        }

        return userParam.replace(/^@/, '').trim();
    }

    /* ---------------- PROFILE LOAD ---------------- */

    async loadProfile() {
        const urlUsername = this.getUsernameFromUrl();
        const currentUser = getCurrentUser?.();

        try {
            let res;
            if (!urlUsername) {
                // Own profile via /auth/me
                res = await fetch(`${API_BASE_URL}/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${getAuthToken?.() || ''}`
                    }
                });
                this.isOwnProfile = true;
            } else {
                // Someone else's profile via /users/:username
                res = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(urlUsername)}`);
                this.isOwnProfile = !!(currentUser && currentUser.username === urlUsername);
            }

            if (!res.ok) {
                throw new Error('Failed to load profile');
            }

            const data = await res.json();
            // Expecting: id, username, display_name, email, avatar_url, bio?, created_at?, followers_count?, following_count?
            this.profile = data;

            this.renderProfileHeader();

        } catch (err) {
            console.error('Profile load error:', err);
            if (this.profileDisplayName) this.profileDisplayName.textContent = 'Profile not found';
            if (this.profileUsername) this.profileUsername.textContent = '';
            if (this.profileBio) this.profileBio.textContent = 'Unable to load this profile.';
        }
    }

    renderProfileHeader() {
        if (!this.profile) return;

        const {
            display_name,
            username,
            avatar_url,
            bio,
            created_at,
            followers_count,
            following_count
        } = this.profile;

        if (this.profileDisplayName) {
            this.profileDisplayName.textContent = display_name || username || 'User';
        }
        if (this.profileUsername) {
            this.profileUsername.textContent = username ? `@${username}` : '';
        }
        if (this.profileBio) {
            this.profileBio.textContent = bio || '';
        }
        if (this.profileAvatar && avatar_url) {
            this.profileAvatar.src = avatar_url;
        }
        if (this.headerProfileImg && this.isOwnProfile && avatar_url) {
            this.headerProfileImg.src = avatar_url;
        }

        if (this.profileJoinDate) {
            if (created_at) {
                const date = new Date(created_at);
                const formatted = date.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short'
                });
                this.profileJoinDate.textContent = `Joined ${formatted}`;
            } else {
                this.profileJoinDate.textContent = '';
            }
        }

        if (this.profileFollowers) {
            this.profileFollowers.textContent = followers_count ?? 0;
        }
        if (this.profileFollowing) {
            this.profileFollowing.textContent = following_count ?? 0;
        }

        // Actions
        if (this.profileActions) {
            this.profileActions.innerHTML = '';
            if (this.isOwnProfile) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-secondary';
                btn.textContent = 'Edit Profile';
                btn.addEventListener('click', () => this.openEditProfileModal());
                this.profileActions.appendChild(btn);
            } else {
                const followBtn = document.createElement('button');
                followBtn.className = 'btn btn-primary btn-sm';
                followBtn.textContent = 'Follow';
                followBtn.disabled = true; // hook up later
                this.profileActions.appendChild(followBtn);

                const msgBtn = document.createElement('button');
                msgBtn.className = 'btn btn-secondary btn-sm';
                msgBtn.textContent = 'Message';
                msgBtn.disabled = true; // hook up later
                this.profileActions.appendChild(msgBtn);
            }
        }
    }

    /* ---------------- POSTS / LIKES ---------------- */

    async loadPosts() {
        if (!this.postsContainer || !this.profile?.username) return;

        try {
            // You will need a backend route like:
            // GET /api/users/:username/posts
            const res = await fetch(
                `${API_BASE_URL}/users/${encodeURIComponent(this.profile.username)}/posts`
            );

            if (!res.ok) throw new Error('Failed to load posts');

            const posts = await res.json();
            this.postsLoading?.remove();

            if (!posts || posts.length === 0) {
                this.postsContainer.innerHTML = `
                    <div class="empty-state">
                        <h3>No posts yet</h3>
                        <p>${this.isOwnProfile ? 'Start posting to see them here.' : 'This user hasn\'t posted yet.'}</p>
                    </div>
                `;
                return;
            }

            this.renderPostList(this.postsContainer, posts);

        } catch (err) {
            console.error('Error loading posts:', err);
            this.postsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>Error loading posts</h3>
                    <p>Please try again later.</p>
                </div>
            `;
        }
    }

    async loadLikes() {
        if (!this.likesContainer || !this.profile?.username) return;

        try {
            // You will need a backend route like:
            // GET /api/users/:username/likes
            const res = await fetch(
                `${API_BASE_URL}/users/${encodeURIComponent(this.profile.username)}/likes`
            );

            if (!res.ok) throw new Error('Failed to load likes');

            const posts = await res.json();
            this.likesLoading?.remove();

            if (!posts || posts.length === 0) {
                this.likesContainer.innerHTML = `
                    <div class="empty-state">
                        <h3>No likes yet</h3>
                        <p>${this.isOwnProfile ? 'Posts you like will appear here.' : 'This user hasn\'t liked any posts yet.'}</p>
                    </div>
                `;
                return;
            }

            this.renderPostList(this.likesContainer, posts);

        } catch (err) {
            console.error('Error loading likes:', err);
            this.likesContainer.innerHTML = `
                <div class="empty-state">
                    <h3>Error loading likes</h3>
                    <p>Please try again later.</p>
                </div>
            `;
        }
    }

    renderPostList(container, posts) {
        container.innerHTML = '';
        posts.forEach(post => {
            const el = this.createPostElement(post);
            container.appendChild(el);
        });
    }

    createPostElement(post) {
        const user = post.user || this.profile || {};
        const displayName = user.display_name || user.username || 'User';
        const username = user.username || '';
        const avatar = user.avatar_url || 'assets/icons/default-profile.png';

        const div = document.createElement('article');
        div.className = 'post';

        const created_at = post.created_at || post.createdAt;
        const time = created_at ? new Date(created_at) : null;
        let timeLabel = '·';
        if (time && !Number.isNaN(time.getTime())) {
            const now = new Date();
            const diffMs = now - time;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            if (diffMins < 60) timeLabel = `${diffMins}m`;
            else if (diffHours < 24) timeLabel = `${diffHours}h`;
            else if (diffDays < 7) timeLabel = `${diffDays}d`;
            else timeLabel = time.toLocaleDateString();
        }

        div.innerHTML = `
            <div class="post-header">
                <img src="${avatar}" alt="${displayName}" class="post-user-avatar"
                     onerror="this.src='assets/icons/default-profile.png'">
                <div class="post-user-info">
                    <div class="post-display-name">${this.escape(displayName)}</div>
                    <div class="post-username">@${this.escape(username)}</div>
                </div>
                <div class="post-time">${timeLabel}</div>
            </div>
            <div class="post-content">
                <p>${this.formatPostContent(post.content || '')}</p>
            </div>
        `;

        return div;
    }

    formatPostContent(content) {
        let txt = this.escape(content);

        txt = txt.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" rel="noopener">$1</a>'
        );
        txt = txt.replace(
            /#(\w+)/g,
            '<span class="hashtag">#$1</span>'
        );
        txt = txt.replace(
            /@(\w+)/g,
            '<span class="mention">@$1</span>'
        );

        return txt;
    }

    /* ---------------- EDIT PROFILE ---------------- */

    openEditProfileModal() {
        if (!this.isOwnProfile || !this.profile) return;

        this.editDisplayName.value = this.profile.display_name || '';
        this.editUsername.value = this.profile.username || '';
        this.editBio.value = this.profile.bio || '';
        this.editProfileMessage.textContent = '';

        this.editProfileModalOverlay.classList.remove('hidden');
    }

    closeEditProfileModal() {
        this.editProfileModalOverlay.classList.add('hidden');
    }

    async handleEditProfileSubmit(e) {
        e.preventDefault();
        if (!this.isOwnProfile) return;

        const displayName = this.editDisplayName.value.trim();
        const username = this.editUsername.value.trim().replace(/^@/, '');
        const bio = this.editBio.value.trim();

        if (!displayName || !username) {
            this.editProfileMessage.textContent = 'Display name and username are required.';
            this.editProfileMessage.className = 'edit-profile-message error';
            return;
        }

        try {
            this.setEditProfileLoading(true);

            // Needs backend route: PUT /api/users/me
            const res = await fetch(`${API_BASE_URL}/users/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken?.() || ''}`
                },
                body: JSON.stringify({
                    display_name: displayName,
                    username,
                    bio
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to update profile');
            }

            const updated = await res.json();
            this.profile = updated;
            this.renderProfileHeader();
            this.editProfileMessage.textContent = 'Profile updated.';
            this.editProfileMessage.className = 'edit-profile-message success';

            // Optionally update local stored user
            const currentUser = getCurrentUser?.();
            if (currentUser) {
                currentUser.display_name = updated.display_name;
                currentUser.username = updated.username;
                currentUser.bio = updated.bio;
                if (window.setCurrentUser) {
                    setCurrentUser(currentUser);
                }
            }

            setTimeout(() => this.closeEditProfileModal(), 800);

        } catch (err) {
            console.error('Edit profile error:', err);
            this.editProfileMessage.textContent = err.message || 'Failed to update profile.';
            this.editProfileMessage.className = 'edit-profile-message error';
        } finally {
            this.setEditProfileLoading(false);
        }
    }

    setEditProfileLoading(loading) {
        const saveBtn = document.getElementById('saveEditProfile');
        if (!saveBtn) return;
        saveBtn.disabled = loading;
        saveBtn.textContent = loading ? 'Saving...' : 'Save';
    }

    async handleAvatarFileChange(e) {
        const file = e.target.files[0];
        if (!file || !this.isOwnProfile) return;

        const formData = new FormData();
        formData.append('avatar', file);

        try:
            // Needs backend route: POST /api/users/me/avatar (multipart)
            const res = await fetch(`${API_BASE_URL}/users/me/avatar`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken?.() || ''}`
                },
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to upload avatar');
            }

            const data = await res.json();
            if (data.avatar_url) {
                this.profile.avatar_url = data.avatar_url;
                this.renderProfileHeader();
            }

        } catch (err) {
            console.error('Avatar upload error:', err);
            alert(err.message || 'Failed to upload avatar.');
        } finally {
            this.avatarFileInput.value = '';
        }
    }

    /* ---------------- TABS ---------------- */

    handleTabClick(tab) {
        const tabName = tab.dataset.tab;
        const tabs = document.querySelectorAll('.profile-tab');
        const panels = document.querySelectorAll('.profile-tab-panel');

        tabs.forEach(t => t.classList.toggle('active', t === tab));
        panels.forEach(panel => {
            panel.classList.toggle(
                'active',
                panel.id === `profile${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`
            );
        });
    }

    /* ---------------- UTILS ---------------- */

    escape(str = '') {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

/* -------- INIT -------- */

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('profileHeader')) {
        window.profilePage = new ProfilePage();
        profilePage.init();
    }
});
