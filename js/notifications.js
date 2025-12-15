// notifications.js

// Same Supabase project as the rest of the app
const NOTIF_SUPABASE = supabase.createClient(
  "https://hbbbsreonwhvqfvbszne.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmJzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyOTc5ODYsImV4cCI6MjA3OTg3Mzk4Nn0.LvqmdOqetnMrH8bnkJY6_S-dsGD8gnvpFczSCJPy-Q4"
);

// API base (same pattern as your other pages)
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

    // prevent overlapping polls
    this.isLoading = false;

    this.init();
  }

  async init() {
    try {
      this.currentUser =
        typeof getCurrentUser === "function" ? getCurrentUser() : null;
    } catch {
      this.currentUser = null;
    }

    // If user object exists but token is missing, treat as logged out
    const token = this.getAuthToken();
    if (!this.currentUser || !token) {
      this.showLoggedOutState();
      return;
    }

    this.setupFilterBar();
    this.setupEventDelegation();

    await this.loadAllNotifications();

    // start polling
    this.pollTimer = setInterval(() => {
      // Don’t spam requests in background tabs
      if (document.hidden) return;
      this.loadAllNotifications();
    }, this.pollIntervalMs);

    // clean up if page is being unloaded
    window.addEventListener("beforeunload", () => this.stopPolling());
    document.addEventListener("visibilitychange", () => {
      // When user comes back, refresh immediately
      if (!document.hidden) this.loadAllNotifications();
    });
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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
        const username = item.dataset.username;
        this.handleFollow(username, e.target.closest("button"));
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
    if (this.isLoading) return;

    this.isLoading = true;

    try {
      // Use your backend endpoint
      const rawFeed = await this.fetchNotificationsFeed();

      const likes = [];
      const comments = [];
      const followers = [];

      (rawFeed || []).forEach((n) => {
        const t = String(n.type || "").toLowerCase();

        if (t === "like") {
          likes.push({
            id: n.id,
            created_at: n.created_at,
            postId: n.post_id,
            postContent: n.post_content || "",
            user: {
              id: n.actor?.id,
              username: n.actor?.username,
              displayName:
                n.actor?.display_name ||
                n.actor?.displayName ||
                n.actor?.username,
              avatar:
                n.actor?.avatar_url ||
                n.actor?.avatar ||
                "default-profile.PNG",
            },
          });
        } else if (t === "comment") {
          comments.push({
            id: n.id,
            created_at: n.created_at,
            postId: n.post_id,
            postContent: n.post_content || "",
            commentText: n.comment_text || "",
            user: {
              id: n.actor?.id,
              username: n.actor?.username,
              displayName:
                n.actor?.display_name ||
                n.actor?.displayName ||
                n.actor?.username,
              avatar:
                n.actor?.avatar_url ||
                n.actor?.avatar ||
                "default-profile.PNG",
            },
          });
        } else if (t === "follow") {
          followers.push({
            id: n.id,
            created_at: n.created_at,
            user: {
              id: n.actor?.id,
              username: n.actor?.username,
              displayName:
                n.actor?.display_name ||
                n.actor?.displayName ||
                n.actor?.username,
              avatar:
                n.actor?.avatar_url ||
                n.actor?.avatar ||
                "default-profile.PNG",
            },
            // placeholder until we enrich
            isFollowing: false,
          });
        }
      });

      this.likes = likes.filter((x) => x.user && x.user.id);
      this.comments = comments.filter((x) => x.user && x.user.id && x.postId);
      this.followers = followers.filter(
        (x) => x.user && x.user.id && x.user.username
      );

      // enrich follower follow-status so button shows Following correctly
      if (this.followers.length) {
        try {
          await this.enrichFollowerFollowStatus(this.followers);
        } catch (e) {
          console.warn("Failed to enrich follower follow status (non-fatal):", e);
        }
      }

      // Build unified stream, newest first
      this.unified = [
        ...this.likes.map((n) => ({ ...n, type: "likes" })),
        ...this.comments.map((n) => ({ ...n, type: "comments" })),
        ...this.followers.map((n) => ({ ...n, type: "followers" })),
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

      // If auth fails, show logged out (and stop polling)
      const msg = String(err?.message || "");
      if (msg.includes("401") || msg.toLowerCase().includes("auth token")) {
        this.stopPolling();
        this.showLoggedOutState();
      }
    } finally {
      this.isLoading = false;
    }
  }

  // backend fetch that matches YOUR server.js
  async fetchNotificationsFeed() {
    const token = this.getAuthToken();
    if (!token) throw new Error("Missing auth token");

    const res = await fetch(`${NOTIF_API_BASE_URL}/notifications?limit=100`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    return data.notifications || [];
  }

  // ask backend for each follower's is_following
  async enrichFollowerFollowStatus(followersArr) {
    const token = this.getAuthToken();
    if (!token) return;

    const uniqueUsernames = [
      ...new Set(
        followersArr
          .map((f) =>
            f && f.user && f.user.username ? String(f.user.username) : ""
          )
          .filter(Boolean)
      ),
    ];

    if (!uniqueUsernames.length) return;

    // Pull is_following for each username
    const results = await Promise.all(
      uniqueUsernames.map(async (uname) => {
        try {
          const res = await fetch(
            `${NOTIF_API_BASE_URL}/users/${encodeURIComponent(uname)}`,
            { method: "GET", headers: { Authorization: `Bearer ${token}` } }
          );
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

  // ========== FETCH HELPERS (kept for compatibility; not used now) ==========

  async fetchFollowers(userId) {
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
                "${this.escape(commentPreview)}" · ${this.formatTime(n.created_at)}
              </div>
            </div>
          </div>
        `;
        }

        // followers
        const isFollowing = !!n.isFollowing;
        const btnClass = isFollowing ? "btn-secondary" : "btn-primary";
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
            <img src="${n.user.avatar}" class="notification-avatar"
                 onerror="this.src='default-profile.PNG'">
          </div>
          <div class="notification-body">
            <div class="notification-text">
              <strong>${this.escape(n.user.displayName)}</strong> started following you
            </div>
            <div class="notification-meta">
              @${this.escape(n.user.username)} · ${this.formatTime(n.created_at)}
            </div>
          </div>
          <button class="btn btn-sm ${btnClass} notification-follow-btn" type="button">
            ${btnText}
          </button>
        </div>
      `;
      })
      .join("");
  }

  // ========== FOLLOW HANDLER ==========
  // backend follow route is /api/users/:username/follow (toggle)
  async handleFollow(targetUsername, buttonEl) {
    if (!this.currentUser || !targetUsername || !buttonEl) return;

    // prevent double clicks spamming
    if (buttonEl.dataset.loading === "1") return;
    buttonEl.dataset.loading = "1";

    try {
      const token = this.getAuthToken();
      if (!token) return;

      // Optimistic toggle
      const wasFollowing =
        buttonEl.textContent.trim().toLowerCase() === "following";

      if (wasFollowing) {
        buttonEl.textContent = "Follow";
        buttonEl.classList.remove("btn-secondary");
        buttonEl.classList.add("btn-primary");
      } else {
        buttonEl.textContent = "Following";
        buttonEl.classList.remove("btn-primary");
        buttonEl.classList.add("btn-secondary");
      }

      const res = await fetch(
        `${NOTIF_API_BASE_URL}/users/${encodeURIComponent(
          targetUsername
        )}/follow`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to follow");

      // Sync with server result
      if (data.following) {
        buttonEl.textContent = "Following";
        buttonEl.classList.remove("btn-primary");
        buttonEl.classList.add("btn-secondary");
      } else {
        buttonEl.textContent = "Follow";
        buttonEl.classList.remove("btn-secondary");
        buttonEl.classList.add("btn-primary");
      }

      // Update cached unified state so next re-render keeps it
      this.unified = (this.unified || []).map((n) => {
        if (n.type !== "followers") return n;
        if (n.user && n.user.username === targetUsername) {
          return { ...n, isFollowing: !!data.following };
        }
        return n;
      });

      this.followers = (this.followers || []).map((n) => {
        if (n.user && n.user.username === targetUsername) {
          return { ...n, isFollowing: !!data.following };
        }
        return n;
      });
    } catch (err) {
      console.error("handleFollow error", err);
    } finally {
      buttonEl.dataset.loading = "0";
    }
  }

  // ========== UTILITIES ==========

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
