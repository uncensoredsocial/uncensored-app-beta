// js/admin.js

const ADMIN_API_BASE = 'https://uncensored-app-beta-production.up.railway.app/api';

let _adminPollTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    // Require login
    if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    loadAdminData();

    document.getElementById('refreshUsersBtn')?.addEventListener('click', loadUsers);
    document.getElementById('refreshPostsBtn')?.addEventListener('click', loadPosts);

    // ✅ ADDED: Monero refresh + filter
    document.getElementById('refreshMoneroBtn')?.addEventListener('click', loadMoneroData);
    document.getElementById('moneroStatusFilter')?.addEventListener('change', () => {
        loadMoneroInvoices();
    });

    // ✅ ADDED: live polling (stats + monero stats) so Overview is actually live
    startLivePolling();
});

async function loadAdminData() {
    await Promise.all([loadStats(), loadUsers(), loadPosts()]);

    // ✅ ADDED
    await loadMoneroData();
}

/* ✅ ADDED: live polling (keeps the dashboard updated without refresh clicks) */
function startLivePolling() {
    stopLivePolling();

    // Refresh key stats frequently; tables less frequently to avoid hammering.
    _adminPollTimer = setInterval(async () => {
        try {
            await loadStats();
            await loadMoneroStats();
        } catch {
            // ignore
        }
    }, 15000); // 15s
}

function stopLivePolling() {
    if (_adminPollTimer) {
        clearInterval(_adminPollTimer);
        _adminPollTimer = null;
    }
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

/* ✅ ADDED: safer html escape helper */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

/* ✅ ADDED: copy helper */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard', 'success');
    } catch {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showToast('Copied to clipboard', 'success');
        } catch {
            showToast('Copy failed', 'error');
        } finally {
            ta.remove();
        }
    }
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
            return;
        }

        if (!res.ok) {
            throw new Error('Failed to load stats');
        }

        const stats = await res.json();

        // ✅ These must match your backend JSON keys
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

        if (res.status === 401 || res.status === 403) {
            tbody.innerHTML = `
                <tr><td colspan="5" class="admin-table-empty">Admin access required.</td></tr>
            `;
            return;
        }

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
                    <div class="admin-user-name">${escapeHtml(user.display_name || user.username || '')}</div>
                    <div class="admin-user-handle">@${escapeHtml(user.username || '')}</div>
                </td>
                <td>${escapeHtml(user.email || '—')}</td>
                <td>${formatDateTime(user.created_at)}</td>
                <td>${formatDateTime(user.last_login_at)}</td>
                <td>${escapeHtml(roleText)}</td>
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

        if (res.status === 401 || res.status === 403) {
            tbody.innerHTML = `
                <tr><td colspan="4" class="admin-table-empty">Admin access required.</td></tr>
            `;
            return;
        }

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

            const content = post.content || '';
            const contentSafe = escapeHtml(content);

            tr.innerHTML = `
                <td>
                    <div class="admin-user-name">${escapeHtml(user.display_name || user.username || 'Unknown')}</div>
                    <div class="admin-user-handle">@${escapeHtml(user.username || 'unknown')}</div>
                </td>
                <td class="admin-post-content" title="${contentSafe}">
                    ${escapeHtml(truncate(content, 120))}
                </td>
                <td>${formatDateTime(post.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" data-post-id="${escapeHtml(post.id)}">
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

        // ✅ ADDED: refresh totals after delete so dashboard stays accurate
        loadStats();
    } catch (err) {
        console.error('handleDeletePost error:', err);
        showToast('Failed to delete post', 'error');
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
    }
}

/* ============================================================
   ✅ ADDED: Monero invoice list + seed deletion (no seed reveal)
   ============================================================ */

async function loadMoneroData() {
    await Promise.all([loadMoneroStats(), loadMoneroInvoices()]);
}

async function loadMoneroStats() {
    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/monero/stats`, {
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            }
        });

        if (res.status === 401 || res.status === 403) {
            return;
        }

        if (!res.ok) throw new Error('Failed to load monero stats');

        const stats = await res.json();

        document.getElementById('statMoneroTotalInvoices').textContent = stats.total_invoices ?? '0';
        document.getElementById('statMoneroPendingInvoices').textContent = stats.pending_invoices ?? '0';
        document.getElementById('statMoneroPaidInvoices').textContent = stats.paid_invoices ?? '0';
        document.getElementById('statMoneroConfirmedInvoices').textContent = stats.confirmed_invoices ?? '0';
        document.getElementById('statMoneroSeedsDeleted').textContent = stats.seeds_deleted ?? '0';

        const usd24h = stats?.recent_24h?.usd_24h;
        document.getElementById('statMoneroUsd24h').textContent =
            usd24h === null || usd24h === undefined ? '0' : String(usd24h);

    } catch (err) {
        console.error('loadMoneroStats error:', err);
    }
}

function getMoneroStatusFilter() {
    const sel = document.getElementById('moneroStatusFilter');
    return sel ? sel.value : 'all';
}

function seedBadgeHtml(invoice) {
    const deletedAt = invoice.seed_deleted_at;
    const hasSeeds =
        !!invoice.encrypted_seed ||
        !!invoice.encrypted_view_key ||
        !!invoice.encrypted_spend_key;

    if (deletedAt) return `<span class="admin-badge ok">Deleted</span>`;
    if (hasSeeds) return `<span class="admin-badge warn">Stored</span>`;
    return `<span class="admin-badge">None</span>`;
}

function statusBadgeHtml(status) {
    const s = (status || 'pending').toLowerCase();
    if (s === 'confirmed') return `<span class="admin-badge ok">Confirmed</span>`;
    if (s === 'paid') return `<span class="admin-badge warn">Paid</span>`;
    if (s === 'pending') return `<span class="admin-badge">Pending</span>`;
    if (s === 'expired') return `<span class="admin-badge bad">Expired</span>`;
    if (s === 'refunded') return `<span class="admin-badge bad">Refunded</span>`;
    return `<span class="admin-badge">${escapeHtml(status || '—')}</span>`;
}

async function loadMoneroInvoices() {
    const tbody = document.getElementById('moneroInvoicesTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="admin-table-empty">Loading invoices...</td></tr>`;

    try {
        const status = getMoneroStatusFilter();
        const url = new URL(`${ADMIN_API_BASE}/admin/monero/invoices`);
        if (status && status !== 'all') url.searchParams.set('status', status);
        url.searchParams.set('limit', '50');

        const res = await fetch(url.toString(), {
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            }
        });

        if (res.status === 401 || res.status === 403) {
            tbody.innerHTML = `<tr><td colspan="7" class="admin-table-empty">Admin access required.</td></tr>`;
            return;
        }

        if (!res.ok) throw new Error('Failed to load monero invoices');

        const invoices = await res.json();

        if (!invoices || invoices.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="admin-table-empty">No invoices found.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        invoices.forEach(inv => {
            const tr = document.createElement('tr');

            const address = inv.address || '—';
            const orderId = inv.order_id || inv.orderId || '—';
            const amountXmr = inv.amount_xmr ?? inv.amountXMR ?? '—';
            const amountUsd = inv.amount_usd ?? inv.amountUSD ?? '—';
            const created = formatDateTime(inv.created_at);

            const canDeleteSeeds = !inv.seed_deleted_at && (
                !!inv.encrypted_seed || !!inv.encrypted_view_key || !!inv.encrypted_spend_key
            );

            tr.innerHTML = `
                <td>
                    <div class="admin-user-name">${escapeHtml(orderId)}</div>
                    <div class="admin-user-handle">${escapeHtml(inv.customer_email || '')}</div>
                </td>
                <td>
                    <div class="admin-mono">${escapeHtml(address)}</div>
                    ${address && address !== '—' ? `<button class="admin-linklike" data-copy-address="${escapeHtml(address)}">Copy</button>` : ``}
                </td>
                <td>
                    <div><strong>${escapeHtml(amountXmr)}</strong> XMR</div>
                    <div class="admin-user-handle">$${escapeHtml(amountUsd)}</div>
                </td>
                <td>${statusBadgeHtml(inv.status)}</td>
                <td>${seedBadgeHtml(inv)}</td>
                <td>${created}</td>
                <td>
                    <div class="admin-actions">
                        <button class="btn btn-sm btn-secondary" data-monero-delete-seeds="${escapeHtml(inv.id)}" ${canDeleteSeeds ? '' : 'disabled'}>
                            Delete Seeds
                        </button>
                    </div>
                </td>
            `;

            tbody.appendChild(tr);
        });

        // copy handlers
        tbody.querySelectorAll('button[data-copy-address]').forEach(btn => {
            btn.addEventListener('click', () => {
                const addr = btn.getAttribute('data-copy-address');
                if (!addr) return;
                copyToClipboard(addr);
            });
        });

        // delete-seeds handlers
        tbody.querySelectorAll('button[data-monero-delete-seeds]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const invoiceId = btn.getAttribute('data-monero-delete-seeds');
                if (!invoiceId) return;
                await handleDeleteSeeds(invoiceId, btn);
            });
        });

    } catch (err) {
        console.error('loadMoneroInvoices error:', err);
        tbody.innerHTML = `<tr><td colspan="7" class="admin-table-empty">Failed to load invoices.</td></tr>`;
        showToast('Failed to load Monero invoices', 'error');
    }
}

async function handleDeleteSeeds(invoiceId, buttonEl) {
    const confirmText = prompt(
        'This permanently deletes encrypted seeds/keys for this invoice.\n\nType DELETE to confirm:'
    );
    if (confirmText !== 'DELETE') {
        showToast('Cancelled', 'error');
        return;
    }

    const originalText = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = 'Deleting...';

    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/monero/invoices/${invoiceId}/seed`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            },
            body: JSON.stringify({ confirm: 'DELETE' })
        });

        if (!res.ok) {
            const msg = await res.json().catch(() => null);
            throw new Error(msg?.error || 'Failed to delete seeds');
        }

        showToast('Seeds deleted permanently', 'success');

        // Reload table + stats
        await Promise.all([loadMoneroStats(), loadMoneroInvoices()]);
    } catch (err) {
        console.error('handleDeleteSeeds error:', err);
        showToast(err?.message || 'Failed to delete seeds', 'error');
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
    }
}
