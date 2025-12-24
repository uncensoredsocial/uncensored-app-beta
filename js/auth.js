/// notifications.js

// API base (same pattern as your other pages)
const NOTIF_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

// ✅ Wait for auth.js to sync Supabase session -> localStorage + currentUser
async function waitForAuthReady(timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const u = typeof getCurrentUser === "function" ? getCurrentUser() : null;
      const t =
        typeof window.getAuthToken === "function"
          ? window.getAuthToken()
          : (localStorage.getItem("us_auth_token") || localStorage.getItem("token") || "");

      // If we have a user OR at least a token, auth is “ready enough” for API calls
      if (u || (t && String(t).trim())) return { user: u || null, token: String(t).trim() || null };
    } catch {}
    await new Promise((r) => setTimeout(r, 60));
  }
  return { user: null, token: null };
}

class NotificationsManager {
  constructor() {
    this.listEl = document.getElementById("notificationsList");
    this.emptyState = document.getElementById("notificationsEmpty");
    this.filterButtons = document.querySelectorAll(".notif-filter-btn");

    this.likes = [];
    this.comments = [];
    this.followers = [];
    this.unified = [];
    this.currentFilter = "all";

    this.currentUser = null;
    this.followInFlight = new Set();

    this.init();
  }

  async init() {
    // Wait for auth.js to populate token/current user
    const ready = await waitForAuthReady(3500);
    this.currentUser = ready.user;

    const token = await this.getAuthToken();
    if (!token) {
      this.showLoggedOutState();
      return;
    }

    this.setupFilterBar();
    this.setupEventDelegation();

    await this.loadAllNotifications();
  }

  showLoggedOutState() {
    if (this.listEl) this.listEl.innerHTML = "";
    if (this.emptyState) {
      this.emptyState.style.display = "block";
      this.emptyState.innerHTML = `
        <h3>Log in to see alerts</h3>
        <p>Create an account or log in to receive notifications.</p>
      `;
    }
  }

  setupFilterBar() {
    if (!this.filterButtons || !this.filterButtons.length) return;

    this.filterButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.filter || "all";
        this.currentFilter = filter;

        this.filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
        this.renderUnified();
      });
    });
  }

  setupEventDelegation() {
    if (!this.listEl) return;

    this.listEl.addEventListener("click", (e) => {
      const item = e.target.closest(".notification-item");
      if (!item) return;

      const type = item.dataset.type;

      // Follow/unfollow button should NOT trigger row click
      if (type === "followers" && e.target.closest(".notification-follow-btn")) {
        e.preventDefault();
        e.stopPropagation();

        const button = e.target.closest(".notification-follow-btn");
        const username = item.dataset.username;
        if (!username) return;

        this.handleFollowToggle(username, button);
        return;
      }

      // likes/comments -> post
      if (type === "likes" || type === "comments") {
        const postId = item.dataset.postId;
        if (!postId) return;

        window.location.href =
          type === "comments"
            ? `post.html?id=${encodeURIComponent(postId)}#comments`
            : `post.html?id=${encodeURIComponent(postId)}`;
        return;
      }

      // followers -> profile
      if (type === "followers") {
        const username = item.dataset.username;
        if (!username) return;

        const me = this.currentUser;
        if (me && me.username === username) {
          window.location.href = "profile.html";
        } else {
          window.location.href = `user.html?user=${encodeURIComponent(username)}`;
        }
      }
    });
  }

  async loadAllNotifications() {
    try {
      const rawFeed = await this.fetchNotificationsFeed();

      const likes = [];
      const comments = [];
      const followers = [];

      (rawFeed || []).forEach((n) => {
        const t = String(n.type || "").toLowerCase();

        const actor = n.actor || {};
        const actorUser = {
          id: actor.id,
          username: actor.username,
          displayName: actor.display_name || actor.displayName || actor.username,
          avatar: actor.avatar_url || actor.avatar || "default-profile.PNG",
        };

        if (t === "like") {
          likes.push({
            id: n.id,
            created_at: n.created_at,
            postId: n.post_id,
            postContent: n.post_content || "",
            user: actorUser,
          });
        } else if (t === "comment") {
          comments.push({
            id: n.id,
            created_at: n.created_at,
            postId: n.post_id,
            postContent: n.post_content || "",
            commentText: n.comment_text || "",
            user: actorUser,
          });
        } else if (t === "follow") {
          followers.push({
            id: n.id,
            created_at: n.created_at,
            user: actorUser,
            isFollowing: false,
          });
        }
      });

      this.likes = likes.filter((x) => x.user && x.user.id);
      this.comments = comments.filter((x) => x.user && x.user.id && x.postId);
      this.followers = followers.filter((x) => x.user && x.user.id && x.user.username);

      if (this.followers.length) {
        try {
          await this.enrichFollowerFollowStatus(this.followers);
        } catch (e) {
          console.warn("Failed to enrich follower follow status:", e);
        }
      }

      this.unified = [
        ...this.likes.map((n) => ({ ...n, type: "likes" })),
        ...this.comments.map((n) => ({ ...n, type: "comments" })),
        ...this.followers.map((n) => ({ ...n, type: "followers" })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      this.renderUnified();

      const hasAny = this.unified.length > 0;
      if (this.emptyState) {
        this.emptyState.style.display = hasAny ? "none" : "block";
        if (!hasAny) {
          this.emptyState.innerHTML = `
            <h3>No notifications yet</h3>
            <p>When you get likes, comments, or new followers, they’ll appear here.</p>
          `;
        }
      }
    } catch (err) {
      console.error("Failed to load notifications", err);
      if (this.emptyState) {
        this.emptyState.style.display = "block";
        this.emptyState.innerHTML = `
          <h3>Couldn’t load alerts</h3>
          <p class="muted">If you just logged in, refresh this page.</p>
        `;
      }
    }
  }

  async fetchNotificationsFeed() {
    const token = await this.getAuthToken();
    if (!token) throw new Error("Missing auth token");

    const res = await fetch(`${NOTIF_API_BASE_URL}/notifications?limit=100`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.notifications || [];
  }

  async enrichFollowerFollowStatus(followersArr) {
    const token = await this.getAuthToken();
    if (!token) return;

    const uniqueUsernames = [
      ...new Set(
        followersArr
          .map((f) => (f && f.user && f.user.username ? String(f.user.username) : ""))
          .filter(Boolean)
      ),
    ];

    if (!uniqueUsernames.length) return;

    const results = await Promise.all(
      uniqueUsernames.map(async (uname) => {
        try {
          const res = await fetch(`${NOTIF_API_BASE_URL}/users/${encodeURIComponent(uname)}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return { username: uname, is_following: false };
          return { username: uname, is_following: !!data.is_following };
        } catch {
          return { username: uname, is_following: false };
        }
      })
    );

    const map = new Map(results.map((r) => [r.username, r.is_following]));
    followersArr.forEach((f) => {
      const uname = f?.user?.username;
      if (!uname) return;
      f.isFollowing = !!map.get(uname);
    });
  }

  renderUnified() {
    if (!this.listEl) return;

    let items = this.unified;
    if (this.currentFilter !== "all") items = items.filter((n) => n.type === this.currentFilter);

    if (!items.length) {
      const labelMap = { all: "notifications", likes: "likes", comments: "comments", followers: "followers" };
      const label = labelMap[this.currentFilter] || "notifications";
      this.listEl.innerHTML = `
        <div class="notification-item">
          <div class="notification-body">
            <div class="notification-text">No ${this.escape(label)} yet.</div>
          </div>
        </div>
      `;
      return;
    }

    this.listEl.innerHTML = items
      .map((n) => {
        if (n.type === "likes") {
          const postPreview =
            n.postContent && n.postContent.length > 60 ? n.postContent.slice(0, 57) + "..." : n.postContent;

          return `
          <div class="notification-item" data-type="likes" data-post-id="${n.postId}">
            <div class="notification-type-icon like">
              <i class="fa-regular fa-heart"></i>
            </div>
            <div class="notification-avatar-wrapper">
              <img src="${n.user.avatar}" class="notification-avatar" onerror="this.src='default-profile.PNG'">
            </div>
            <div class="notification-body">
              <div class="notification-text">
                <strong>${this.escape(n.user.displayName)}</strong> liked your post
              </div>
              <div class="notification-meta">
                ${postPreview ? `"${this.escape(postPreview)}" · ` : ""}${this.formatTime(n.created_at)}
              </div>
            </div>
          </div>
        `;
        }

        if (n.type === "comments") {
          const commentPreview =
            n.commentText && n.commentText.length > 60 ? n.commentText.slice(0, 57) + "..." : n.commentText;

          return `
          <div class="notification-item" data-type="comments" data-post-id="${n.postId}">
            <div class="notification-type-icon comment">
              <i class="fa-regular fa-comment"></i>
            </div>
            <div class="notification-avatar-wrapper">
              <img src="${n.user.avatar}" class="notification-avatar" onerror="this.src='default-profile.PNG'">
            </div>
            <div class="notification-body">
              <div class="notification-text">
                <strong>${this.escape(n.user.displayName)}</strong> commented on your post
              </div>
              <div class="notification-meta">
                "${this.escape(commentPreview)}" · ${this.formatTime(n.created_at)}
              </div>
            </div>
          </div>
        `;
        }

        // followers
        const isFollowing = !!n.isFollowing;
        const btnText = isFollowing ? "Following" : "Follow";

        return `
        <div class="notification-item follower-item"
             data-type="followers"
             data-user-id="${n.user.id}"
             data-username="${n.user.username}">
          <div class="notification-type-icon follow">
            <i class="fa-solid fa-user-plus"></i>
          </div>
          <div class="notification-avatar-wrapper">
            <img src="${n.user.avatar}" class="notification-avatar" onerror="this.src='default-profile.PNG'">
          </div>
          <div class="notification-body">
            <div class="notification-text">
              <strong>${this.escape(n.user.displayName)}</strong> started following you
            </div>
            <div class="notification-meta">
              @${this.escape(n.user.username)} · ${this.formatTime(n.created_at)}
            </div>
          </div>

          <button class="notification-follow-btn"
                  data-following="${isFollowing ? "1" : "0"}"
                  type="button">
            ${btnText}
          </button>
        </div>
      `;
      })
      .join("");
  }

  async handleFollowToggle(username, buttonEl) {
    if (!username || !buttonEl) return;

    if (this.followInFlight.has(username)) return;
    this.followInFlight.add(username);

    const token = await this.getAuthToken();
    if (!token) {
      this.followInFlight.delete(username);
      return;
    }

    const wasFollowing = buttonEl.dataset.following === "1";

    // optimistic (no re-render)
    buttonEl.dataset.following = wasFollowing ? "0" : "1";
    buttonEl.textContent = wasFollowing ? "Follow" : "Following";

    try {
      const res = await fetch(`${NOTIF_API_BASE_URL}/users/${encodeURIComponent(username)}/follow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to follow toggle");

      const serverFollowing = !!data.following;
      buttonEl.dataset.following = serverFollowing ? "1" : "0";
      buttonEl.textContent = serverFollowing ? "Following" : "Follow";

      // keep state consistent when switching filters
      this.unified = (this.unified || []).map((n) => {
        if (n.type === "followers" && n.user?.username === username) return { ...n, isFollowing: serverFollowing };
        return n;
      });
      this.followers = (this.followers || []).map((n) => {
        if (n.user?.username === username) return { ...n, isFollowing: serverFollowing };
        return n;
      });
    } catch (err) {
      buttonEl.dataset.following = wasFollowing ? "1" : "0";
      buttonEl.textContent = wasFollowing ? "Following" : "Follow";
      console.error("handleFollowToggle error", err);
    } finally {
      this.followInFlight.delete(username);
    }
  }

  // ✅ token getter that matches YOUR auth.js
  async getAuthToken() {
    try {
      // 1) your auth.js global function
      if (typeof window.getAuthToken === "function") {
        const t = window.getAuthToken();
        if (t && String(t).trim()) return String(t).trim();
      }

      // 2) auth.js creates window.__sbClient
      if (window.__sbClient?.auth?.getSession) {
        const { data } = await window.__sbClient.auth.getSession();
        const access = data?.session?.access_token;
        if (access) return access;
      }

      // 3) legacy keys
      return (
        localStorage.getItem("us_auth_token") ||
        localStorage.getItem("authToken") ||
        localStorage.getItem("token") ||
        null
      );
    } catch {
      return (
        localStorage.getItem("us_auth_token") ||
        localStorage.getItem("authToken") ||
        localStorage.getItem("token") ||
        null
      );
    }
  }

  escape(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  formatTime(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return "";
    const now = new Date();
    const diffSec = (now - d) / 1000;
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return Math.floor(diffSec / 60) + "m";
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + "h";
    if (diffSec < 604800) return Math.floor(diffSec / 86400) + "d";
    return d.toLocaleDateString();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.notificationsManager = new NotificationsManager();
});
