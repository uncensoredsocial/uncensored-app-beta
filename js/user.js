/* ============================================================
   USER PROFILE PAGE (Viewing someone else's profile)
   Loads: banner, avatar, name, username, bio, stats, posts
   URL formats accepted: ?user=xyz OR ?username=xyz
=============================================================== */

const API_BASE =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

/* ---------------------- GET USERNAME ---------------------- */

const params = new URLSearchParams(window.location.search);
const username = params.get("user") || params.get("username");

if (!username) {
  showError("No username specified.");
  throw new Error("Missing ?user= in URL");
}

/* ---------------------- DOM REFS ---------------------- */

const bannerEl = document.getElementById("userBanner");
const avatarEl = document.getElementById("userAvatar");
const nameEl = document.getElementById("userName");
const usernameEl = document.getElementById("userUsername");
const bioEl = document.getElementById("userBio");
const statsPostsEl = document.getElementById("statsPosts");
const statsFollowersEl = document.getElementById("statsFollowers");
const statsFollowingEl = document.getElementById("statsFollowing");
const followBtn = document.getElementById("followBtn");
const menuBtn = document.getElementById("userMenuBtn");
const postsContainer = document.getElementById("userPosts");
const postsError = document.getElementById("postsError");

/* ---------------------- LOAD PROFILE ---------------------- */

async function loadUserProfile() {
  try {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error("Profile not found");

    const user = await res.json();

    renderProfile(user);

    loadUserPosts(user.id);
  } catch (err) {
    console.error(err);
    showError("Could not load profile.");
  }
}

function renderProfile(user) {
  // Banner
  if (user.banner_url) {
    bannerEl.style.backgroundImage = `url('${user.banner_url}')`;
    bannerEl.classList.add("profile-banner-image");
  } else {
    bannerEl.style.background = "#111"; // fallback grey banner
  }

  // Avatar
  avatarEl.src = user.avatar_url || "assets/icons/default-profile.png";

  // Name + username
  nameEl.textContent = user.display_name || user.username;
  usernameEl.textContent = "@" + user.username;

  // Bio
  bioEl.textContent = user.bio || "";

  // Stats
  statsPostsEl.textContent = user.post_count ?? 0;
  statsFollowersEl.textContent = user.followers ?? 0;
  statsFollowingEl.textContent = user.following ?? 0;

  setupFollowButton(user);
}

/* ---------------------- FOLLOW BUTTON ---------------------- */

function setupFollowButton(user) {
  const currentUser =
    typeof getCurrentUser === "function" ? getCurrentUser() : null;

  if (!currentUser) {
    followBtn.textContent = "Follow";
    followBtn.onclick = () => (window.location.href = "login.html");
    return;
  }

  if (currentUser.username === user.username) {
    // Viewing your own profile → hide follow button
    followBtn.style.display = "none";
    return;
  }

  let isFollowing = user.is_following;

  updateFollowButtonUI();

  followBtn.onclick = async () => {
    try {
      const token = getAuthToken();
      if (!token) return;

      const url = `${API_BASE}/users/${encodeURIComponent(user.username)}/follow`;

      const res = await fetch(url, {
        method: isFollowing ? "DELETE" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("Follow action failed");

      isFollowing = !isFollowing;
      updateFollowButtonUI();
    } catch (err) {
      console.error(err);
      alert("Could not update follow status.");
    }
  };

  function updateFollowButtonUI() {
    followBtn.textContent = isFollowing ? "Following" : "Follow";
    followBtn.classList.toggle("following", isFollowing);
  }
}

/* ---------------------- LOAD USER POSTS ---------------------- */

async function loadUserPosts(userId) {
  try {
    const res = await fetch(
      `${API_BASE}/posts/user/${encodeURIComponent(userId)}`
    );

    if (!res.ok) throw new Error("Could not load posts");

    const posts = await res.json();

    if (!posts.length) {
      postsContainer.innerHTML = `<p class="empty">No posts yet.</p>`;
      return;
    }

    postsContainer.innerHTML = posts.map(renderPostHTML).join("");

    attachPostEvents();
  } catch (err) {
    console.error(err);
    postsError.style.display = "block";
  }
}

function renderPostHTML(post) {
  const avatar = post.user?.avatar_url || "assets/icons/default-profile.png";

  return `
    <article class="post-card" data-post-id="${post.id}">
      <header class="post-header">
        <div class="post-user" data-username="${post.user.username}">
          <img src="${avatar}" class="post-user-avatar">
          <div>
            <div class="post-display-name">${post.user.display_name}</div>
            <div class="post-username">@${post.user.username}</div>
          </div>
        </div>
        <time class="post-time">${formatTime(post.created_at)}</time>
      </header>

      <div class="post-content">${escapeHtml(post.content)}</div>

      <footer class="post-footer">
        <div class="post-actions">
          <span><i class="fa-regular fa-heart"></i> ${post.likes || 0}</span>
          <span><i class="fa-regular fa-comment"></i> ${post.comments || 0}</span>
          <span><i class="fa-solid fa-arrow-up-from-bracket"></i></span>
        </div>
      </footer>
    </article>
  `;
}

function attachPostEvents() {
  document.querySelectorAll(".post-card").forEach((card) => {
    const postId = card.dataset.postId;

    // Open full post
    card.addEventListener("click", () => {
      window.location.href = `post.html?id=${postId}`;
    });

    // Open user profile
    card.querySelector(".post-user").addEventListener("click", (e) => {
      e.stopPropagation();
      const uname = e.currentTarget.dataset.username;

      const currentUser =
        typeof getCurrentUser === "function" ? getCurrentUser() : null;

      if (currentUser && currentUser.username === uname) {
        window.location.href = "profile.html";
      } else {
        window.location.href = `user.html?user=${encodeURIComponent(uname)}`;
      }
    });
  });
}

/* ---------------------- UTILITIES ---------------------- */

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTime(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return "";

  const diff = (Date.now() - d.getTime()) / 1000;

  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";

  return d.toLocaleDateString();
}

function showError(msg) {
  document.getElementById("profileError").textContent = msg;
}

/* ---------------------- INIT ---------------------- */

loadUserProfile();
