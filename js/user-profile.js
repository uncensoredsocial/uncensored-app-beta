// js/user-profile.js

// Same API base style as feed.js
const PROFILE_API_BASE_URL =
  typeof API_BASE_URL !== 'undefined'
    ? API_BASE_URL
    : 'https://uncensored-app-beta-production.up.railway.app/api';

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const username = params.get('user');

  if (!username) {
    alert('Invalid profile link');
    history.back();
    return;
  }

  // Basic title to start with
  const titleEl = document.getElementById('viewProfileTitle');
  if (titleEl) titleEl.textContent = 'Profile';

  attachMoreMenu();
  loadUserProfileAndPosts(username);
});

function attachMoreMenu() {
  const btn = document.getElementById('userProfileMoreBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // simple placeholder menu for now
    alert('Options coming soon: block, report, share profile, etc.');
  });
}

// We DON'T rely on /users/:username (since it's failing).
// Instead, we call /posts?username=... and use the first post's user object
// to build the profile header, and list all their posts underneath.
async function loadUserProfileAndPosts(username) {
  const loadingEl = document.getElementById('userPostsLoading');
  const emptyEl = document.getElementById('userPostsEmpty');
  const postsContainer = document.getElementById('userPostsContainer');

  if (loadingEl) loadingEl.style.display = 'flex';
  if (emptyEl) emptyEl.style.display = 'none';
  if (postsContainer) postsContainer.innerHTML = '';

  try {
    const url = new URL(`${PROFILE_API_BASE_URL}/posts`);
    url.searchParams.set('username', username);
    url.searchParams.set('page', '1');
    url.searchParams.set('pageSize', '50');

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error('Failed to load posts for user');
    }

    const data = await res.json();
    const posts = Array.isArray(data)
      ? data
      : Array.isArray(data.posts)
      ? data.posts
      : [];

    if (!posts.length) {
      // No posts: still show a basic header using just the username
      fillProfileHeaderFromUsernameOnly(username);
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    // Use first post's user info to populate header
    const user = posts[0].user || {};
    fillProfileHeaderFromUserObject(user, username, posts.length);

    // Render posts list
    const html = posts.map(renderPostHtml).join('');
    if (postsContainer) postsContainer.innerHTML = html;

    attachPostEvents(postsContainer);

    if (loadingEl) loadingEl.style.display = 'none';
    if (!posts.length && emptyEl) emptyEl.style.display = 'block';
  } catch (err) {
    console.error('Profile load error:', err);
    fillProfileHeaderFromUsernameOnly(username);
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
  }
}

function fillProfileHeaderFromUserObject(user, usernameFallback, postsCount) {
  const displayName = user.display_name || user.displayName || usernameFallback;
  const username = user.username || usernameFallback;
  const avatarUrl =
    user.avatar_url || user.avatar || 'assets/icons/default-profile.png';
  const bio = user.bio || '';

  const titleEl = document.getElementById('viewProfileTitle');
  const avatarEl = document.getElementById('viewProfileAvatar');
  const nameEl = document.getElementById('viewProfileName');
  const usernameEl = document.getElementById('viewProfileUsername');
  const bioEl = document.getElementById('viewProfileBio');
  const postsCountEl = document.getElementById('profilePostsCount');
  const followersCountEl = document.getElementById('profileFollowersCount');
  const followingCountEl = document.getElementById('profileFollowingCount');

  if (titleEl) titleEl.textContent = displayName;
  if (avatarEl) avatarEl.src = avatarUrl;
  if (nameEl) nameEl.textContent = displayName;
  if (usernameEl) usernameEl.textContent = '@' + username;
  if (bioEl) bioEl.textContent = bio;

  if (postsCountEl) postsCountEl.textContent = postsCount || 0;
  if (followersCountEl)
    followersCountEl.textContent = user.followers_count || 0;
  if (followingCountEl)
    followingCountEl.textContent = user.following_count || 0;

  setupFollowButton(user);
}

function fillProfileHeaderFromUsernameOnly(username) {
  const titleEl = document.getElementById('viewProfileTitle');
  const nameEl = document.getElementById('viewProfileName');
  const usernameEl = document.getElementById('viewProfileUsername');
  const postsCountEl = document.getElementById('profilePostsCount');

  if (titleEl) titleEl.textContent = username;
  if (nameEl) nameEl.textContent = username;
  if (usernameEl) usernameEl.textContent = '@' + username;
  if (postsCountEl) postsCountEl.textContent = '0';

  setupFollowButton({ username });
}

function setupFollowButton(user) {
  const btn = document.getElementById('followButton');
  if (!btn) return;

  // For now this is just a front-end toggle until you wire it to your backend.
  btn.addEventListener('click', () => {
    const isFollowing = btn.classList.contains('following');
    if (isFollowing) {
      btn.classList.remove('following');
      btn.textContent = 'Follow';
    } else {
      btn.classList.add('following');
      btn.textContent = 'Following';
    }
  });
}

/* ---------- Post rendering (same style as feed) ---------- */

function renderPostHtml(post) {
  const user = post.user || {};
  const username = user.username || 'unknown';
  const displayName = user.display_name || user.displayName || username;
  const avatarUrl =
    user.avatar_url || user.avatar || 'assets/icons/default-profile.png';

  const likeCount = post.like_count || post.likes || 0;
  const commentCount = post.comment_count || post.comments || 0;
  const createdAt = post.created_at || post.createdAt;
  const mediaUrl = post.media_url || post.mediaUrl || null;

  const postUrl = getProfilePostUrl(post.id);

  return `
    <article class="post" data-post-id="${post.id}">
      <div class="post-header">
        <div class="post-user" data-username="${escapeHtml(username)}">
          <img
            src="${avatarUrl}"
            alt="${escapeHtml(displayName)}"
            class="post-avatar"
            onerror="this.src='assets/icons/default-profile.png'"
          >
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
            ? `
        <div class="post-media">
          <img src="${mediaUrl}" alt="Post media">
        </div>
        `
            : ''
        }
      </div>

      <div class="post-actions">
        <button class="post-action like-btn">
          <i class="fa-regular fa-heart"></i>
          <span class="like-count">${likeCount}</span>
        </button>

        <button class="post-action comment-btn">
          <i class="fa-regular fa-comment"></i>
          <span class="comment-count">${commentCount}</span>
        </button>

        <button class="post-action share-btn" data-post-url="${postUrl}">
          <i class="fa-solid fa-arrow-up-from-bracket"></i>
        </button>
      </div>
    </article>
  `;
}

function attachPostEvents(container) {
  if (!container) return;

  const cards = container.querySelectorAll('.post');
  cards.forEach((card) => {
    const postId = card.getAttribute('data-post-id');

    // Card click => open post
    card.addEventListener('click', (e) => {
      if (e.target.closest('.post-actions') || e.target.closest('.post-user')) {
        return;
      }
      if (postId) {
        window.location.href = getProfilePostUrl(postId);
      }
    });

    // Username click => stay on same profile (already here)
    const userEl = card.querySelector('.post-user');
    if (userEl) {
      userEl.addEventListener('click', (e) => {
        e.stopPropagation();
        // could navigate to the same profile; do nothing for now
      });
    }

    // Share button
    const shareBtn = card.querySelector('.share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const url =
          shareBtn.getAttribute('data-post-url') || window.location.href;
        try {
          if (navigator.share) {
            await navigator.share({
              title: 'Check out this post on Uncensored Social',
              url
            });
          } else {
            await navigator.clipboard.writeText(url);
            alert('Post link copied to clipboard');
          }
        } catch (err) {
          console.error('Share error:', err);
        }
      });
    }
  });
}

function getProfilePostUrl(postId) {
  // relative so GitHub Pages respects /uncensored-app-beta/
  return `post.html?id=${encodeURIComponent(postId)}`;
}

/* ---------- Utility helpers (copied from feed style) ---------- */

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
    '<a href="$1" target="_blank" rel="noopener" style="color: var(--primary-color); text-decoration: none;">$1</a>'
  );

  formatted = formatted.replace(
    /#(\w+)/g,
    '<span style="color: var(--primary-color); font-weight: 500;">#$1</span>'
  );

  formatted = formatted.replace(
    /@(\w+)/g,
    '<span style="color: var(--primary-color); font-weight: 500;">@$1</span>'
  );

  return formatted;
}

function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
