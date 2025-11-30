// js/post.js

const POST_API_BASE_URL =
  typeof API_BASE_URL !== 'undefined'
    ? API_BASE_URL
    : 'https://uncensored-app-beta-production.up.railway.app/api';

document.addEventListener('DOMContentLoaded', () => {
  const url = new URL(window.location.href);
  const postId = url.searchParams.get('id');

  if (!postId) {
    showPostError();
    return;
  }

  loadPost(postId);
});

function getAuthTokenForPost() {
  if (typeof getAuthToken === 'function') return getAuthToken();
  return localStorage.getItem('authToken') || null;
}

async function loadPost(postId) {
  const container = document.getElementById('postDetailContainer');
  const loading = document.getElementById('postDetailLoading');

  try {
    const token = getAuthTokenForPost();
    const res = await fetch(
      `${POST_API_BASE_URL}/posts/${encodeURIComponent(postId)}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }
    );

    if (!res.ok) throw new Error('Post not found');

    const post = await res.json();

    if (loading) loading.style.display = 'none';
    if (!container) return;

    container.innerHTML = renderPostDetail(post);
    attachPostDetailEvents(container, post);
  } catch (err) {
    console.error(err);
    showPostError();
  }
}

function showPostError() {
  const loading = document.getElementById('postDetailLoading');
  const error = document.getElementById('postDetailError');
  if (loading) loading.style.display = 'none';
  if (error) error.style.display = 'block';
}

function renderPostDetail(post) {
  const user = post.user || {};
  const username = user.username || 'unknown';
  const displayName = user.display_name || user.displayName || username;
  const avatarUrl =
    user.avatar_url || user.avatar || 'assets/icons/default-profile.png';

  const likeCount = post.like_count || post.likes || 0;
  const commentCount = post.comment_count || post.comments || 0;
  const createdAt = post.created_at || post.createdAt;
  const mediaUrl = post.media_url || post.mediaUrl || null;

  const isLiked = !!post.is_liked;
  const isSaved = !!post.is_saved;

  const origin = window.location.origin;
  const postUrl = `${origin}/post.html?id=${encodeURIComponent(post.id)}`;

  return `
    <article class="post post-detail-card" data-post-id="${post.id}">
      <div class="post-header">
        <div class="post-user" data-username="${escapeHtml(username)}">
          <img
            src="${avatarUrl}"
            alt="${escapeHtml(displayName)}"
            class="post-avatar"
            onerror="this.src='assets/icons/default-profile.png'"
          />
          <div class="post-user-meta">
            <span class="post-display-name">${escapeHtml(displayName)}</span>
            <span class="post-username">@${escapeHtml(username)}</span>
          </div>
        </div>
        <span class="post-time">${formatTime(createdAt)}</span>
      </div>

      <div class="post-body">
        <div class="post-text">
          ${formatPostContent(post.content || '')}
        </div>
        ${
          mediaUrl
            ? `<div class="post-media"><img src="${mediaUrl}" alt="Post media" /></div>`
            : ''
        }
      </div>

      <div class="post-actions">
        <button class="post-action like-btn ${isLiked ? 'liked' : ''}">
          <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart"></i>
          <span class="like-count">${likeCount}</span>
        </button>
        <button class="post-action comment-btn">
          <i class="fa-regular fa-comment"></i>
          <span class="comment-count">${commentCount}</span>
        </button>
        <button class="post-action share-btn" data-post-url="${postUrl}">
          <i class="fa-solid fa-arrow-up-from-bracket"></i>
        </button>
        <button class="post-action save-btn ${isSaved ? 'saved' : ''}">
          <i class="fa-${isSaved ? 'solid' : 'regular'} fa-bookmark"></i>
        </button>
      </div>
    </article>
  `;
}

function attachPostDetailEvents(container, post) {
  const card = container.querySelector('.post-detail-card');
  if (!card) return;

  const username = (post.user && post.user.username) || 'unknown';

  // click avatar/name → that user's profile
  const userEl = card.querySelector('.post-user');
  if (userEl) {
    userEl.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href =
        'profile.html?user=' + encodeURIComponent(username);
    });
  }

  const likeBtn = card.querySelector('.like-btn');
  const saveBtn = card.querySelector('.save-btn');
  const shareBtn = card.querySelector('.share-btn');

  // very simple UI toggles for now
  if (likeBtn) {
    likeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      likeBtn.classList.toggle('liked');
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveBtn.classList.toggle('saved');
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = shareBtn.getAttribute('data-post-url') || window.location.href;
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Check out this post', url });
        } else {
          await navigator.clipboard.writeText(url);
          alert('Post link copied to clipboard');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }
}

/* utilities (matches feed.js style) */

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function formatPostContent(content) {
  if (!content) return '';
  let formatted = escapeHtml(content);
  formatted = formatted.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener" style="color: var(--primary-color); text-decoration:none;">$1</a>'
  );
  formatted = formatted.replace(
    /#(\w+)/g,
    '<span style="color: var(--primary-color); font-weight:500;">#$1</span>'
  );
  formatted = formatted.replace(
    /@(\w+)/g,
    '<span style="color: var(--primary-color); font-weight:500;">@$1</span>'
  );
  return formatted;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
