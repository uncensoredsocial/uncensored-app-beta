// js/post-ui.js
// Shared helpers to render a post card with like/comment/save buttons

const POST_API_BASE = 'https://uncensored-app-beta-production.up.railway.app/api';

// These come from auth.js
const getToken = window.getAuthToken || (() => null);
const getUser = window.getCurrentUser || (() => null);

/**
 * Create a post card DOM element (same shape as /api/posts + /api/users/:username/posts)
 */
window.createPostElement = function createPostElement(post) {
  const el = document.createElement('article');
  el.className = 'post-card';
  el.dataset.postId = post.id;

  // === HEADER ===
  const header = document.createElement('div');
  header.className = 'post-header';

  const avatar = document.createElement('img');
  avatar.className = 'post-avatar';
  avatar.src = post.user?.avatar_url || 'assets/icons/default-profile.png';
  avatar.alt = post.user?.username || 'User';

  const headerMain = document.createElement('div');
  headerMain.className = 'post-header-main';

  const nameRow = document.createElement('div');
  nameRow.className = 'post-name-row';

  const displayName = document.createElement('span');
  displayName.className = 'post-display-name';
  displayName.textContent = post.user?.display_name || post.user?.username || 'User';

  const handle = document.createElement('span');
  handle.className = 'post-handle';
  handle.textContent = `@${post.user?.username || 'user'}`;

  nameRow.appendChild(displayName);
  nameRow.appendChild(handle);

  const time = document.createElement('span');
  time.className = 'post-time';
  time.textContent = formatRelativeTime(post.created_at);

  headerMain.appendChild(nameRow);
  headerMain.appendChild(time);

  header.appendChild(avatar);
  header.appendChild(headerMain);

  // === BODY ===
  const body = document.createElement('div');
  body.className = 'post-body';

  if (post.content && post.content.trim()) {
    const text = document.createElement('p');
    text.className = 'post-text';
    text.textContent = post.content;
    body.appendChild(text);
  }

  if (post.media_url) {
    const mediaWrapper = document.createElement('div');
    mediaWrapper.className = 'post-media';

    if (post.media_type && post.media_type.startsWith('video')) {
      const video = document.createElement('video');
      video.src = post.media_url;
      video.controls = true;
      mediaWrapper.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = post.media_url;
      img.alt = 'Post media';
      mediaWrapper.appendChild(img);
    }

    body.appendChild(mediaWrapper);
  }

  // === FOOTER ACTIONS (LIKE / COMMENT / SHARE / SAVE) ===
  const footer = document.createElement('div');
  footer.className = 'post-footer';

  footer.innerHTML = `
    <button class="post-action-btn post-like-btn ${post.liked_by_me ? 'active' : ''}">
      <i class="fa-regular fa-heart action-icon"></i>
      <span class="action-count like-count">${post.likes || 0}</span>
    </button>

    <button class="post-action-btn post-comment-btn">
      <i class="fa-regular fa-comment action-icon"></i>
      <span class="action-count comment-count">${post.comments_count || 0}</span>
    </button>

    <button class="post-action-btn post-share-btn">
      <i class="fa-solid fa-arrow-up-from-bracket action-icon"></i>
      <span class="action-label">Share</span>
    </button>

    <button class="post-action-btn post-save-btn ${post.saved_by_me ? 'active' : ''}">
      <i class="fa-regular fa-bookmark action-icon"></i>
      <span class="action-count save-count">${post.saves_count || 0}</span>
    </button>
  `;

  el.appendChild(header);
  el.appendChild(body);
  el.appendChild(footer);

  // Hook up like/save behavior
  attachPostActionHandlers(el);

  return el;
};

// ====== BUTTON HANDLERS ======
function attachPostActionHandlers(cardEl) {
  const postId = cardEl.dataset.postId;
  if (!postId) return;

  const likeBtn = cardEl.querySelector('.post-like-btn');
  const saveBtn = cardEl.querySelector('.post-save-btn');

  if (likeBtn) {
    likeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleLikeToggle(postId, cardEl, likeBtn);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleSaveToggle(postId, cardEl, saveBtn);
    });
  }
}

async function handleLikeToggle(postId, cardEl, btn) {
  if (!getToken()) {
    window.location.href = 'login.html';
    return;
  }

  try {
    btn.disabled = true;
    const res = await fetch(`${POST_API_BASE}/posts/${postId}/like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update like');

    const countEl = cardEl.querySelector('.like-count');
    if (countEl) countEl.textContent = data.likes ?? 0;

    btn.classList.toggle('active', data.liked === true);
  } catch (err) {
    console.error('Like toggle error:', err);
  } finally {
    btn.disabled = false;
  }
}

async function handleSaveToggle(postId, cardEl, btn) {
  if (!getToken()) {
    window.location.href = 'login.html';
    return;
  }

  try {
    btn.disabled = true;
    const res = await fetch(`${POST_API_BASE}/posts/${postId}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update save');

    btn.classList.toggle('active', data.saved === true);
  } catch (err) {
    console.error('Save toggle error:', err);
  } finally {
    btn.disabled = false;
  }
}

// ====== UTIL ======
function formatRelativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const now = new Date();
  const diff = (now - then) / 1000;

  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
