// notifications.js

// Same Supabase project as the rest of the app
// ✅ FIX: Don't crash if supabase-js isn't loaded (or loads after this script)
let NOTIF_SUPABASE = null;

try {
  const sb = window.supabase || (typeof supabase !== "undefined" ? supabase : null);
  if (!sb || typeof sb.createClient !== "function") {
    console.warn("Supabase client not found on window. Notifications fallback disabled.");
    NOTIF_SUPABASE = null;
  } else {
    NOTIF_SUPABASE = sb.createClient(
      "https://hbbbsreonwhvqfvbszne.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyOTc5ODYsImV4cCI6MjA3OTg3Mzk4Nn0.LvqmdOqetnMrH8bnkJY6_S-dsGD8gnvpFczSCJPy-Q4"
    );
  }
} catch (e) {
  console.error("Failed to initialize Supabase for notifications:", e);
  NOTIF_SUPABASE = null;
}

// ✅ Backend base (same pattern as other pages)
const NOTIF_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class NotificationsManager {
  constructor() {
    // poll every second for live-ish updates
    this.pollIntervalMs = 1000;
    this.pollTimer = null;
    this.currentUser = null;

    // unified list + filter bar
    this.listEl = document.getElementById("notificationsList");
    this.emptyState = document.getElementById("notificationsEmpty");
    this.filterButtons = document.querySelectorAll(".notif-filter-btn");

    // store raw arrays + unified
    this.likes = [];
    this.comments = [];
    this.followers = [];
    this.unified = [];
    this.currentFilter = "all";

    this.init();
  }

  async init() {
    try {
      this.currentUser =
        typeof getCurrentUser === "function" ? getCurrentUser() : null;
    } catch {
      this.currentUser = null;
    }

    if (!this.currentUser) {
      this.showLoggedOutState();
      return;
    }

    this.setupFilterBar();
    this.setupEventDelegation();
    await this.loadAllNotifications();

    // start polling
    this.pollTimer = setInterval(
      () => this.loadAllNotifications(),
      this.pollIntervalMs
    );
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

  // ✅ NEW: Backend/Supabase both unavailable
  showUnavailableState() {
    if (this.listEl) this.listEl.innerHTML = "";

    if (this.emptyState) {
      this.emptyState.style.display = "block";
      this.emptyState.innerHTML = `
        <h3>Notifications unavailable</h3>
        <p>Your backend notifications endpoint is missing or blocked, and Supabase is not accessible from the client.</p>
      `;
    }
  }

  // --------- Filter bar (All / Likes / Comments / Followers) ---------

  setupFilterBar() {
    if (!this.filterButtons || !this.filterButtons.length) return;

    this.filterButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.filter || "all";
        this.currentFilter = filter;

        this.filterButtons.forEach((b) =>
          b.classList.toggle("active", b === btn)
        );

        this.renderUnified(); // re-render with new filter
      });
    });
  }

  // Delegated click handling so re-rendering is safe
  setupEventDelegation() {
    if (!this.listEl) return;

    this.listEl.addEventListener("click", (e) => {
      const item = e.target.closest(".notification-item");
      if (!item) return;

      const type = item.dataset.type;

      // follow/unfollow button for follower notifications
      if (type === "followers" && e.target.closest(".notification-follow-btn")) {
        const userId = item.dataset.userId;
        this.handleFollow(userId, e.target.closest("button"));
        return;
      }

      if (type === "likes" || type === "comments") {
        const postId = item.dataset.postId;
        if (!postId) return;

        if (type === "comments") {
          window.location.href = `post.html?id=${encodeURIComponent(
            postId
          )}#comments`;
        } else {
          window.location.href = `post.html?id=${encodeURIComponent(postId)}`;
        }
        return;
      }

      if (type === "followers") {
        const username = item.dataset.username;
        if (!username) return;

        const me = this.currentUser;
        if (me && me.username === username) {
          window.location.href = "profile.html";
        } else {
          window.location.href = `user.html?user=${encodeURIComponent(
            username
          )}`;
        }
      }
    });
  }

  async loadAllNotifications() {
    if (!this.currentUser) return;

    const userId = this.currentUser.id;

    try {
      const [likes, comments, followers] = await Promise.all([
        this.fetchLikes(userId),
        this.fetchComments(userId),
        this.fetchFollowers(userId),
      ]);

      this.likes = likes;
      this.comments = comments;
      this.followers = followers;

      // Build unified stream, newest first
      this.unified = [
        ...likes.map((n) => ({ ...n, type: "likes" })),
        ...comments.map((n) => ({ ...n, type: "comments" })),
        ...followers.map((n) => ({ ...n, type: "followers" })),
      ].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

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
      // If everything failed hard, show an availability message
      this.showUnavailableState();
    }
  }

  // ========== AUTH / API HELPERS ==========

  getAuthToken() {
    try {
      if (typeof getAuthToken === "function") return getAuthToken();
      return (
        localStorage.getItem("us_auth_token") ||
        localStorage.getItem("authToken") ||
        localStorage.getItem("token") ||
        null
      );
    } catch {
      return null;
    }
  }

  async apiTryPaths(paths) {
    const token = this.getAuthToken();
    if (!token) throw new Error("Missing auth token");

    let lastErr = null;

    for (const url of paths) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        // if route doesn't exist, try next
        if (res.status === 404) {
          lastErr = new Error(`404 ${url}`);
          continue;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          lastErr = new Error(data.error || `HTTP ${res.status}`);
          continue;
        }

        return data;
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("All API paths failed");
  }

  // ========== FETCH HELPERS (backend first, supabase fallback) ==========

  async fetchFollowers(userId) {
    // ✅ Backend first
    try {
      const data = await this.apiTryPaths([
        `${NOTIF_API_BASE_URL}/notifications?type=followers`,
        `${NOTIF_API_BASE_URL}/notifications/followers`,
      ]);

      const rows = Array.isArray(data.followers) ? data.followers : Array.isArray(data.data) ? data.data : [];

      return rows
        .map((row) => {
          const u = row.user || row.follower || row.actor || row.profile || null;
          if (!u) return null;

          return {
            id: row.id || row.follow_id || row.notification_id || "",
            created_at: row.created_at || row.createdAt || row.timestamp || row.time || "",
            user: {
              id: u.id,
              username: u.username,
              displayName: u.display_name || u.displayName || u.username,
              avatar: u.avatar_url || u.avatar || "default-profile.PNG",
            },
          };
        })
        .filter(Boolean);
    } catch (e) {
      // fallback to Supabase
      if (!NOTIF_SUPABASE) {
        console.error("fetchFollowers failed (no backend, no supabase):", e);
        return [];
      }
    }

    const { data, error } = await NOTIF_SUPABASE
      .from("follows")
      .select("id, follower_id, created_at")
      .eq("followed_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !data) {
      console.error("fetchFollowers error", error);
      return [];
    }

    const followerIds = [...new Set(data.map((f) => f.follower_id))];
    if (!followerIds.length) return [];

    const { data: users, error: usersErr } = await NOTIF_SUPABASE
      .from("users")
      .select("id, username, display_name, avatar_url")
      .in("id", followerIds);

    if (usersErr || !users) {
      console.error("fetchFollowers users error", usersErr);
      return [];
    }

    const map = new Map(users.map((u) => [u.id, u]));
    return data
      .map((row) => {
        const u = map.get(row.follower_id);
        if (!u) return null;
        return {
          id: row.id,
          created_at: row.created_at,
          user: {
            id: u.id,
            username: u.username,
            displayName: u.display_name || u.username,
            avatar: u.avatar_url || "default-profile.PNG",
          },
        };
      })
      .filter(Boolean);
  }

  async fetchLikes(userId) {
    // ✅ Backend first
    try {
      const data = await this.apiTryPaths([
        `${NOTIF_API_BASE_URL}/notifications?type=likes`,
        `${NOTIF_API_BASE_URL}/notifications/likes`,
      ]);

      const rows = Array.isArray(data.likes) ? data.likes : Array.isArray(data.data) ? data.data : [];

      return rows
        .map((row) => {
          const u = row.user || row.liker || row.actor || row.profile || null;
          const post = row.post || row.post_data || null;
          if (!u || !post) return null;

          return {
            id: row.id || row.like_id || row.notification_id || "",
            created_at: row.created_at || row.createdAt || row.timestamp || row.time || "",
            postId: post.id || row.post_id,
            postContent: post.content || row.postContent || "",
            user: {
              id: u.id,
              username: u.username,
              displayName: u.display_name || u.displayName || u.username,
              avatar: u.avatar_url || u.avatar || "default-profile.PNG",
            },
          };
        })
        .filter(Boolean);
    } catch (e) {
      // fallback to Supabase
      if (!NOTIF_SUPABASE) {
        console.error("fetchLikes failed (no backend, no supabase):", e);
        return [];
      }
    }

    const { data: myPosts, error: postsErr } = await NOTIF_SUPABASE
      .from("posts")
      .select("id, content")
      .eq("user_id", userId);

    if (postsErr || !myPosts || !myPosts.length) return [];

    const postIds = myPosts.map((p) => p.id);
    const postMap = new Map(myPosts.map((p) => [p.id, p]));

    const { data: likes, error } = await NOTIF_SUPABASE
      .from("post_likes")
      .select("id, post_id, user_id, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !likes) {
      console.error("fetchLikes error", error);
      return [];
    }

    const likerIds = [...new Set(likes.map((l) => l.user_id))];
    if (!likerIds.length) return [];

    const { data: users, error: usersErr } = await NOTIF_SUPABASE
      .from("users")
      .select("id, username, display_name, avatar_url")
      .in("id", likerIds);

    if (usersErr || !users) {
      console.error("fetchLikes users error", usersErr);
      return [];
    }

    const userMap = new Map(users.map((u) => [u.id, u]));

    return likes
      .map((row) => {
        const actor = userMap.get(row.user_id);
        const post = postMap.get(row.post_id);
        if (!actor || !post) return null;

        return {
          id: row.id,
          created_at: row.created_at,
          postId: post.id,
          postContent: post.content || "",
          user: {
            id: actor.id,
            username: actor.username,
            displayName: actor.display_name || actor.username,
            avatar: actor.avatar_url || "default-profile.PNG",
          },
        };
      })
      .filter(Boolean);
  }

  async fetchComments(userId) {
    // ✅ Backend first
    try {
      const data = await this.apiTryPaths([
        `${NOTIF_API_BASE_URL}/notifications?type=comments`,
        `${NOTIF_API_BASE_URL}/notifications/comments`,
      ]);

      const rows = Array.isArray(data.comments) ? data.comments : Array.isArray(data.data) ? data.data : [];

      return rows
        .map((row) => {
          const u = row.user || row.commenter || row.actor || row.profile || null;
          const post = row.post || row.post_data || null;
          if (!u || !post) return null;

          return {
            id: row.id || row.comment_id || row.notification_id || "",
            created_at: row.created_at || row.createdAt || row.timestamp || row.time || "",
            postId: post.id || row.post_id,
            postContent: post.content || row.postContent || "",
            commentText: row.content || row.commentText || "",
            user: {
              id: u.id,
              username: u.username,
              displayName: u.display_name || u.displayName || u.username,
              avatar: u.avatar_url || u.avatar || "default-profile.PNG",
            },
          };
        })
        .filter(Boolean);
    } catch (e) {
      // fallback to Supabase
      if (!NOTIF_SUPABASE) {
        console.error("fetchComments failed (no backend, no supabase):", e);
        return [];
      }
    }

    const { data: myPosts, error: postsErr } = await NOTIF_SUPABASE
      .from("posts")
      .select("id, content")
      .eq("user_id", userId);

    if (postsErr || !myPosts || !myPosts.length) return [];

    const postIds = myPosts.map((p) => p.id);
    const postMap = new Map(myPosts.map((p) => [p.id, p]));

    const { data: comments, error } = await NOTIF_SUPABASE
      .from("post_comments")
      .select("id, post_id, user_id, content, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !comments) {
      console.error("fetchComments error", error);
      return [];
    }

    const commenterIds = [...new Set(comments.map((c) => c.user_id))];
    if (!commenterIds.length) return [];

    const { data: users, error: usersErr } = await NOTIF_SUPABASE
      .from("users")
      .select("id, username, display_name, avatar_url")
      .in("id", commenterIds);

    if (usersErr || !users) {
      console.error("fetchComments users error", usersErr);
      return [];
    }

    const userMap = new Map(users.map((u) => [u.id, u]));

    return comments
      .map((row) => {
        const actor = userMap.get(row.user_id);
        const post = postMap.get(row.post_id);
        if (!actor || !post) return null;

        return {
          id: row.id,
          created_at: row.created_at,
          postId: post.id,
          postContent: post.content || "",
          commentText: row.content || "",
          user: {
            id: actor.id,
            username: actor.username,
            displayName: actor.display_name || actor.username,
            avatar: actor.avatar_url || "default-profile.PNG",
          },
        };
      })
      .filter(Boolean);
  }

  // ========== RENDER UNIFIED LIST ==========

  renderUnified() {
    if (!this.listEl) return;

    let items = this.unified;
    if (this.currentFilter !== "all") {
      items = items.filter((n) => n.type === this.currentFilter);
    }

    if (!items.length) {
      const labelMap = {
        all: "notifications",
        likes: "likes",
        comments: "comments",
        followers: "followers",
      };
      const label = labelMap[this.currentFilter] || "notifications";
      this.listEl.innerHTML = `
        <div class="notification-item">
          <div class="notification-body">
            <div class="notification-text">No ${this.escape(
              label
            )} yet.</div>
          </div>
        </div>
      `;
      return;
    }

    this.listEl.innerHTML = items
      .map((n) => {
        if (n.type === "likes") {
          const postPreview =
            n.postContent && n.postContent.length > 60
              ? n.postContent.slice(0, 57) + "..."
              : n.postContent;

          return `
          <div class="notification-item"
               data-type="likes"
               data-post-id="${n.postId}">
            <div class="notification-type-icon like">
              <i class="fa-regular fa-heart"></i>
            </div>
            <div class="notification-avatar-wrapper">
              <img src="${n.user.avatar}" class="notification-avatar"
                   onerror="this.src='default-profile.PNG'">
            </div>
            <div class="notification-body">
              <div class="notification-text">
                <strong>${this.escape(n.user.displayName)}</strong>
                liked your post
              </div>
              <div class="notification-meta">
                ${postPreview ? `"${this.escape(postPreview)}" · ` : ""}
                ${this.formatTime(n.created_at)}
              </div>
            </div>
          </div>
        `;
        }

        if (n.type === "comments") {
          const commentPreview =
            n.commentText && n.commentText.length > 60
              ? n.commentText.slice(0, 57) + "..."
              : n.commentText;

          return `
          <div class="notification-item"
               data-type="comments"
               data-post-id="${n.postId}">
            <div class="notification-type-icon comment">
              <i class="fa-regular fa-comment"></i>
            </div>
            <div class="notification-avatar-wrapper">
              <img src="${n.user.avatar}" class="notification-avatar"
                   onerror="this.src='default-profile.PNG'">
            </div>
            <div class="notification-body">
              <div class="notification-text">
                <strong>${this.escape(n.user.displayName)}</strong>
                commented on your post
              </div>
              <div class="notification-meta">
                "${this.escape(commentPreview)}" · ${this.formatTime(
            n.created_at
          )}
              </div>
            </div>
          </div>
        `;
        }

        // followers
        return `
        <div class="notification-item follower-item"
             data-type="followers"
             data-user-id="${n.user.id}"
             data-username="${this.escape(n.user.username)}">
          <div class="notification-type-icon follow">
            <i class="fa-solid fa-user-plus"></i>
          </div>
          <div class="notification-avatar-wrapper">
            <img src="${n.user.avatar}" class="notification-avatar"
                 onerror="this.src='default-profile.PNG'">
          </div>
          <div class="notification-body">
            <div class="notification-text">
              <strong>${this.escape(
                n.user.displayName
              )}</strong> started following you
            </div>
            <div class="notification-meta">
              @${this.escape(n.user.username)} · ${this.formatTime(
          n.created_at
        )}
            </div>
          </div>
          <button class="btn btn-sm btn-primary notification-follow-btn">
            Follow
          </button>
        </div>
      `;
      })
      .join("");
  }

  // ========== FOLLOW HANDLER ==========

  async handleFollow(targetUserId, buttonEl) {
    if (!this.currentUser || !targetUserId || !buttonEl) return;
    const meId = this.currentUser.id;

    try {
      const isFollowing =
        buttonEl.textContent.trim().toLowerCase() === "following";

      // ✅ Prefer backend for follow toggles too (matches your app auth)
      const token = this.getAuthToken();
      if (token) {
        if (isFollowing) {
          const res = await fetch(`${NOTIF_API_BASE_URL}/follow/${encodeURIComponent(targetUserId)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            buttonEl.textContent = "Follow";
            buttonEl.classList.remove("btn-secondary");
            buttonEl.classList.add("btn-primary");
            return;
          }
        } else {
          const res = await fetch(`${NOTIF_API_BASE_URL}/follow/${encodeURIComponent(targetUserId)}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            buttonEl.textContent = "Following";
            buttonEl.classList.remove("btn-primary");
            buttonEl.classList.add("btn-secondary");
            return;
          }
        }
      }

      // Fallback to supabase if backend follow routes aren't available
      if (!NOTIF_SUPABASE) return;

      if (isFollowing) {
        const { error } = await NOTIF_SUPABASE
          .from("follows")
          .delete()
          .eq("follower_id", meId)
          .eq("followed_id", targetUserId);

        if (error) throw error;

        buttonEl.textContent = "Follow";
        buttonEl.classList.remove("btn-secondary");
        buttonEl.classList.add("btn-primary");
      } else {
        const { error } = await NOTIF_SUPABASE.from("follows").insert({
          follower_id: meId,
          followed_id: targetUserId,
        });

        if (error) throw error;

        buttonEl.textContent = "Following";
        buttonEl.classList.remove("btn-primary");
        buttonEl.classList.add("btn-secondary");
      }
    } catch (err) {
      console.error("handleFollow error", err);
    }
  }

  // ========== UTILITIES ==========

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

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  window.notificationsManager = new NotificationsManager();
});
