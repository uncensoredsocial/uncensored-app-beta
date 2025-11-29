// js/admin.js

const ADMIN_API_BASE = 'https://uncensored-app-beta-production.up.railway.app/api';

document.addEventListener('DOMContentLoaded', () => {
    // Require login
    if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    loadAdminData();

    document.getElementById('refreshUsersBtn')?.addEventListener('click', loadUsers);
    document.getElementById('refreshPostsBtn')?.addEventListener('click', loadPosts);
});

async function loadAdminData() {
    await Promise.all([loadStats(), loadUsers(), loadPosts()]);
}

/* ========== Helpers ========== */

function getAuthHeader() {
    if (typeof getAuthToken !== 'function') return {};
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function truncate(str, max = 100) {
    if (!str) return '';
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
}

function showToast(message, type = 'success') {
    const container = document.getElementById('adminToastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `admin-toast admin-toast-${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button aria-label="Dismiss">&times;</button>
    `;

    const closeBtn = toast.querySelector('button');
    closeBtn.addEventListener('click', () => {
        toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

/* ========== Load Stats ========== */

async function loadStats() {
    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/stats`, {
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            }
        });

        if (res.status === 401 || res.status === 403) {
            showToast('Admin access required.', 'error');
            // Optional: redirect to home
            // window.location.href = 'index.html';
            return;
        }

        if (!res.ok) {
            throw new Error('Failed to load stats');
        }

        const stats = await res.json();

        document.getElementById('statTotalUsers').textContent = stats.total_users ?? '0';
        document.getElementById('statActive24h').textContent = stats.active_users_last_24h ?? '0';
        document.getElementById('statSignups24h').textContent = stats.signups_last_24h ?? '0';
        document.getElementById('statTotalPosts').textContent = stats.total_posts ?? '0';
        document.getElementById('statTotalLikes').textContent = stats.total_likes ?? '0';
        document.getElementById('statTotalFollows').textContent = stats.total_follows ?? '0';

        const lastUpdated = document.getElementById('lastUpdated');
        if (lastUpdated) {
            lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        }
    } catch (err) {
        console.error('loadStats error:', err);
        showToast('Failed to load stats', 'error');
    }
}

/* ========== Load Users ========== */

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr><td colspan="5" class="admin-table-empty">Loading users...</td></tr>
    `;

    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/users?limit=50`, {
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            }
        });

        if (!res.ok) {
            throw new Error('Failed to load users');
        }

        const users = await res.json();

        if (!users || users.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="5" class="admin-table-empty">No users found.</td></tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');

            const roleParts = [];
            if (user.is_admin) roleParts.push('Admin');
            if (user.is_moderator) roleParts.push('Mod');
            const roleText = roleParts.length ? roleParts.join(', ') : 'User';

            tr.innerHTML = `
                <td>
                    <div class="admin-user-name">${user.display_name || user.username}</div>
                    <div class="admin-user-handle">@${user.username}</div>
                </td>
                <td>${user.email || '—'}</td>
                <td>${formatDateTime(user.created_at)}</td>
                <td>${formatDateTime(user.last_login_at)}</td>
                <td>${roleText}</td>
            `;

            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('loadUsers error:', err);
        tbody.innerHTML = `
            <tr><td colspan="5" class="admin-table-empty">Failed to load users.</td></tr>
        `;
        showToast('Failed to load users', 'error');
    }
}

/* ========== Load Posts ========== */

async function loadPosts() {
    const tbody = document.getElementById('postsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr><td colspan="4" class="admin-table-empty">Loading posts...</td></tr>
    `;

    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/posts?limit=100`, {
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            }
        });

        if (!res.ok) {
            throw new Error('Failed to load posts');
        }

        const posts = await res.json();

        if (!posts || posts.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="4" class="admin-table-empty">No posts found.</td></tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        posts.forEach(post => {
            const tr = document.createElement('tr');
            const user = post.user || {};

            tr.innerHTML = `
                <td>
                    <div class="admin-user-name">${user.display_name || user.username || 'Unknown'}</div>
                    <div class="admin-user-handle">@${user.username || 'unknown'}</div>
                </td>
                <td class="admin-post-content" title="${post.content || ''}">
                    ${truncate(post.content || '', 120)}
                </td>
                <td>${formatDateTime(post.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" data-post-id="${post.id}">
                        Delete
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });

        // Attach delete handlers
        tbody.querySelectorAll('button[data-post-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const postId = btn.getAttribute('data-post-id');
                if (!postId) return;
                handleDeletePost(postId, btn);
            });
        });
    } catch (err) {
        console.error('loadPosts error:', err);
        tbody.innerHTML = `
            <tr><td colspan="4" class="admin-table-empty">Failed to load posts.</td></tr>
        `;
        showToast('Failed to load posts', 'error');
    }
}

/* ========== Delete Post ========== */

async function handleDeletePost(postId, buttonEl) {
    const confirmDelete = confirm(
        'Are you sure you want to permanently delete this post? This cannot be undone.'
    );
    if (!confirmDelete) return;

    const originalText = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = 'Deleting...';

    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/posts/${postId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            }
        });

        if (!res.ok) {
            throw new Error('Failed to delete post');
        }

        // Remove row from table
        const row = buttonEl.closest('tr');
        if (row) row.remove();

        showToast('Post deleted', 'success');
    } catch (err) {
        console.error('handleDeletePost error:', err);
        showToast('Failed to delete post', 'error');
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
    }
}
