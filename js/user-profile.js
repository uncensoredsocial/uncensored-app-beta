// js/user-profile.js

const USER_API =
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

  loadUserProfile(username);
  loadUserPosts(username);
});

async function loadUserProfile(username) {
  try {
    const res = await fetch(`${USER_API}/users/${username}`);
    if (!res.ok) throw new Error('User not found');

    const user = await res.json();

    document.getElementById('viewProfileHeader').textContent =
      user.display_name || user.username;

    document.getElementById('viewProfileAvatar').src =
      user.avatar_url || 'assets/icons/default-profile.png';

    document.getElementById('viewProfileName').textContent =
      user.display_name || user.username;

    document.getElementById('viewProfileUsername').textContent =
      '@' + user.username;

    document.getElementById('viewProfileBio').textContent = user.bio || '';

    // Follow button
    const followBtn = document.getElementById('followButton');
    followBtn.onclick = () => toggleFollow(user.id, followBtn);
  } catch (err) {
    console.error(err);
    alert('Failed to load profile');
  }
}

async function toggleFollow(userId, button) {
  const following = button.classList.contains('following');

  // Just UI for now (until backend follow route is ready)
  if (following) {
    button.classList.remove('following');
    button.textContent = 'Follow';
  } else {
    button.classList.add('following');
    button.textContent = 'Following';
  }
}

async function loadUserPosts(username) {
  const container = document.getElementById('userPostsContainer');
  container.innerHTML = `<p style="opacity:0.7;">Loading posts...</p>`;

  try {
    const res = await fetch(`${USER_API}/posts/user/${username}`);
    if (!res.ok) throw new Error();

    const posts = await res.json();

    container.innerHTML = posts
      .map(
        (p) => `
      <div class="post-card" onclick="window.location.href='post.html?id=${p.id}'">
        <div class="post-header-small">
          <span>${p.content}</span>
        </div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    container.innerHTML = `<p>No posts yet.</p>`;
  }
}
