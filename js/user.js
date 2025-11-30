// js/user.js

// If you change your Supabase URL/key, update here to match search.js
const USER_SUPABASE_URL = 'https://hbbbsreonwhvqfvbszne.supabase.co';
const USER_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyOTc5ODYsImV4cCI6MjA3OTg3Mzk4Nn0.LvqmdOqetnMrH8bnkJY6_S-dsGD8gnvpFczSCJPy-Q4';

let userSupabase = null;

function initUserSupabase() {
  // global "supabase" comes from the Supabase CDN script in your project
  if (!userSupabase && typeof supabase !== 'undefined') {
    userSupabase = supabase.createClient(USER_SUPABASE_URL, USER_SUPABASE_ANON_KEY);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initUserSupabase();

  const params = new URLSearchParams(window.location.search);
  const usernameParam = params.get('user');

  if (!usernameParam) {
    showUserError('Missing user parameter.');
    return;
  }

  // If user=me or matches current logged in username -> go to own profile
  const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (
    usernameParam === 'me' ||
    (currentUser && currentUser.username && currentUser.username === usernameParam)
  ) {
    window.location.href = 'profile.html';
    return;
  }

  // Start loading
  loadUserProfile(usernameParam);
  loadUserPosts(usernameParam);
  setupOptionsMenu();
});

// =============== UI HELPERS ===============

function qs(id) {
  return document.getElementById(id);
}

function showUserError(message) {
  const nameEl = qs('viewProfileName');
  const userEl = qs('viewProfileUsername');
  const followBtn = qs('followButton');

  if (nameEl) nameEl.textContent = 'Error';
  if (userEl) userEl.textContent = message || '@unknown';
  if (followBtn) followBtn.style.display = 'none';

  const loadingPosts = qs('userPostsLoading');
  const errorPosts = qs('userPostsError');
  if (loadingPosts) loadingPosts.style.display = 'none';
  if (errorPosts) errorPosts.style.display = 'block';
}

function setBannerAndAvatar(profile) {
  const bannerEl = qs('viewProfileBanner');
  const avatarEl = qs('viewProfileAvatar');

  const bannerUrl = profile.banner_url || profile.header_url || profile.banner || null;
  const avatarUrl = profile.avatar_url || profile.avatar || null;

  if (bannerEl) {
    if (bannerUrl) {
      bannerEl.style.backgroundImage = `url("${bannerUrl}")`;
      bannerEl.classList.add('profile-banner-image');
    } else {
      bannerEl.style.backgroundImage = '';
      bannerEl.classList.remove('profile-banner-image');
    }
  }

  if (avatarEl && avatarUrl) {
    avatarEl.src = avatarUrl;
  }
}

// =============== LOAD PROFILE ===============

async function loadUserProfile(username) {
  const titleEl = qs('viewProfileTitle');
  const nameEl = qs('viewProfileName');
  const userEl = qs('viewProfileUsername');
  const bioEl = qs('viewProfileBio');
  const postsCountEl = qs('profilePostsCount');
  const followersCountEl = qs('profileFollowersCount');
  const followingCountEl = qs('profileFollowingCount');
  const followBtn = qs('followButton');

  if (nameEl) nameEl.textContent = 'Loading...';
  if (userEl) userEl.textContent = '@' + username;

  try {
    if (!userSupabase) {
      throw new Error('Supabase client not available');
    }

    // You may need to rename this RPC to match your backend
    const { data, error } = await userSupabase
      .rpc('get_user_profile', { query_username: username })
      .single();

    if (error || !data) {
      console.error('get_user_profile error:', error);
      showUserError('User not found.');
      return;
    }

    const profile = data;

    const displayName = profile.display_name || profile.username || username;
    if (titleEl) titleEl.textContent = displayName;
    if (nameEl) nameEl.textContent = displayName;
    if (userEl) userEl.textContent = '@' + (profile.username || username);
    if (bioEl) bioEl.textContent = profile.bio || '';

    if (postsCountEl) postsCountEl.textContent = profile.posts_count ?? 0;
    if (followersCountEl) followersCountEl.textContent = profile.followers_count ?? 0;
    if (followingCountEl) followingCountEl.textContent = profile.following_count ?? 0;

    setBannerAndAvatar(profile);

    setupFollowButton(followBtn, profile);
  } catch (err) {
    console.error('loadUserProfile error:', err);
    showUserError('Could not load profile.');
  }
}

// =============== FOLLOW BUTTON ===============

async function setupFollowButton(button, profile) {
  if (!button) return;

  const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!currentUser) {
    // Not logged in – show disabled Follow
    button.disabled = true;
    button.textContent = 'Follow';
    return;
  }

  // If this is somehow our own profile (should already be redirected, but just in case)
  if (currentUser.id && profile.id && currentUser.id === profile.id) {
    button.style.display = 'none';
    return;
  }

  let isFollowing = false;

  try {
    if (!userSupabase) throw new Error('Supabase client not available');

    const { data: followRow } = await userSupabase
      .from('follows')
      .select('id')
      .eq('follower_id', currentUser.id)
      .eq('following_id', profile.id)
      .maybeSingle();

    isFollowing = !!followRow;
  } catch (err) {
    console.warn('Error checking follow state:', err);
  }

  applyFollowButtonStyle(button, isFollowing);

  button.onclick = async () => {
    const currentlyFollowing = isFollowing;
    const newState = !currentlyFollowing;

    // Optimistic UI
    applyFollowButtonStyle(button, newState);

    try {
      if (!userSupabase) throw new Error('Supabase client not available');

      if (newState) {
        const { error } = await userSupabase
          .from('follows')
          .insert({ follower_id: currentUser.id, following_id: profile.id });

        if (error) throw error;
      } else {
        const { error } = await userSupabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', profile.id);

        if (error) throw error;
      }

      isFollowing = newState;
    } catch (err) {
      console.error('Follow toggle error:', err);
      // Revert on error
      applyFollowButtonStyle(button, currentlyFollowing);
    }
  };
}

function applyFollowButtonStyle(button, isFollowing) {
  if (!button) return;
  if (isFollowing) {
    button.textContent = 'Following';
    button.classList.remove('btn-primary');
    button.classList.add('btn-secondary');
  } else {
    button.textContent = 'Follow';
    button.classList.remove('btn-secondary');
    button.classList.add('btn-primary');
  }
}

// =============== LOAD POSTS ===============

async function loadUserPosts(username) {
  const listEl = qs('userPostsList');
  const loadingEl = qs('userPostsLoading');
  const emptyEl = qs('userPostsEmpty');
  const errorEl = qs('userPostsError');

  if (!listEl) return;

  if (loadingEl) loadingEl.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';
  listEl.innerHTML = '';

  try {
    if (!userSupabase) throw new Error('Supabase client not available');

    // You may need to rename this RPC to match your backend
    const { data: posts, error } = await userSupabase.rpc('get_user_posts', {
      query_username: username,
      limit_count: 50
    });

    if (error) {
      console.error('get_user_posts error:', error);
      throw error;
    }

    if (!posts || posts.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    const html = posts.map(renderUserPostCard).join('');
    listEl.innerHTML = html;

    // Attach simple click to go to full post
    listEl.querySelectorAll('.post-card').forEach(card => {
      const postId = card.getAttribute('data-post-id');
      if (!postId) return;

      card.addEventListener('click', e => {
        // ignore clicks on action buttons
        if (e.target.closest('.post-actions')) return;
        window.location.href = 'post.html?id=' + encodeURIComponent(postId);
      });
    });
  } catch (err) {
    console.error('loadUserPosts error:', err);
    if (errorEl) errorEl.style.display = 'block';
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function renderUserPostCard(post) {
  const user = {
    username: post.username || post.user_username || '',
    display_name: post.display_name || post.user_display_name || post.username || '',
    avatar_url: post.avatar_url || post.user_avatar_url || 'assets/icons/default-profile.png'
  };

  const createdAt = post.created_at || post.createdAt;
  const likeCount = post.like_count || post.likes || 0;
  const commentCount = post.comment_count || post.comments || 0;

  return `
    <article class="post-card profile-post-card" data-post-id="${post.id}">
      <header class="post-header">
        <div class="post-user">
          <img
            src="${user.avatar_url}"
            alt="${escapeHtml(user.display_name)}"
            class="post-user-avatar"
            onerror="this.src='assets/icons/default-profile.png'"
          />
          <div class="post-user-info">
            <div class="post-display-name">${escapeHtml(user.display_name)}</div>
            <div class="post-username">@${escapeHtml(user.username)}</div>
          </div>
        </div>
        <div class="post-meta">
          <time class="post-time">${formatTime(createdAt)}</time>
        </div>
      </header>

      <div class="post-body">
        <div class="post-content">
          ${formatPostContent(post.content || '')}
        </div>
      </div>

      <footer class="post-footer">
        <div class="post-actions">
          <button class="post-action-btn" type="button">
            <i class="fa-regular fa-heart"></i>
            <span class="post-action-count">${likeCount}</span>
          </button>
          <button class="post-action-btn" type="button">
            <i class="fa-regular fa-comment"></i>
            <span class="post-action-count">${commentCount}</span>
          </button>
          <button class="post-action-btn" type="button">
            <i class="fa-solid fa-arrow-up-from-bracket"></i>
          </button>
        </div>
      </footer>
    </article>
  `;
}

// =============== SMALL UTILITIES (same style as feed.js) ===============

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
  if (diffMins < 60) return `${diffMins}h` === '0h' ? `${diffMins}m` : `${diffMins}m`;
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============== THREE DOTS MENU ===============

function setupOptionsMenu() {
  const btn = qs('userOptionsButton');
  const menu = qs('userOptionsMenu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const isVisible = menu.style.display === 'block';
    menu.style.display = isVisible ? 'none' : 'block';
  });

  document.addEventListener('click', e => {
    const menu = qs('userOptionsMenu');
    const btn = qs('userOptionsButton');
    if (!menu || !btn) return;
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  menu.addEventListener('click', e => {
    const item = e.target.closest('.user-options-item');
    if (!item) return;
    const action = item.dataset.action;
    if (action === 'share') {
      navigator.share?.({
        title: document.title,
        url: window.location.href
      }).catch(() => {});
    } else if (action === 'block') {
      alert('Block user – not implemented yet.');
    } else if (action === 'report') {
      alert('Report – not implemented yet.');
    }
    menu.style.display = 'none';
  });
}
