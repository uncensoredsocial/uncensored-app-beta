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
    this.pollIntervalMs = 1000;
    this.pollTimer = null;

    this.currentUser = null;

    this.listEl = document.getElementById("notificationsList");
    this.emptyState = document.getElementById("notificationsEmpty");
    this.filterButtons = document.querySelectorAll(".notif-filter-btn");

    this.likes = [];
    this.comments = [];
    this.followers = [];
    this.unified = [];
    this.currentFilter = "all";

    // prevent overlapping loads
    this.isLoading = false;

    // prevent spam clicking / double requests
    this.followInFlight = new Set();

    // 🔒 Lock follow states briefly after click so polling/enrich can't override
    // Map<username, { isFollowing: boolean, until: number }>
    this.followStateLocks = new Map();
    this.followLockMs = 5000;

    // avoid pointless DOM churn
    this.lastRenderKey = "";

    this.init();
  }

  async init() {
    try {
      this.currentUser =
        typeof getCurrentUser === "function" ? getCurrentUser() : null;
    } catch {
      this.currentUser = null;
    }

    const token = this.getAuthToken();
    if (!this.currentUser || !token) {
      this.showLoggedOutState();
      return;
    }

    this.setupFilterBar();
    this.setupEventDelegation();

    await this.loadAllNotifications({ force: true });

    this.pollTimer = setInterval(() => {
      if (document.hidden) return;
      this.loadAllNotifications();
    }, this.pollIntervalMs);

    window.addEventListener("beforeunload", () => this.stopPolling());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.loadAllNotifications({ force: true });
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

  setupFilterBar() {
    if (!this.filterButtons || !this.filterButtons.length) return;

    this.filterButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.filter || "all";
        this.currentFilter = filter;

        this.filterButtons.forEach((b) =>
          b.classList.toggle("active", b === btn)
        );

        this.renderUnified({ preserveScroll: true, force: true });
      });
    });
  }

  setupEventDelegation() {
    if (!this.listEl) return;

    this.listEl.addEventListener("click", (e) => {
      const item = e.target.closest(".notification-item");
      if (!item) return;

      const type = item.dataset.type;

      // follow/unfollow button
      if (type === "followers" && e.target.closest(".notification-follow-btn")) {
        const btn = e.target.closest("button");
        const username = item.dataset.username;
        this.handleFollow(username, btn);
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

  // ---------- LOCK HELPERS ----------

  isLocked(username) {
    if (!username) return false;
    const entry = this.followStateLocks.get(username);
    if (!entry) return false;
    if (Date.now() > entry.until) {
      this.followStateLocks.delete(username);
      return false;
    }
    return true;
  }

  getLockedState(username) {
    const entry = this.followStateLocks.get(username);
    if (!entry) return null;
    if (Date.now() > entry.until) {
      this.followStateLocks.delete(username);
      return null;
    }
    return !!entry.isFollowing;
  }

  setLock(username, isFollowing) {
    if (!username) return;
    this.followStateLocks.set(username, {
      isFollowing: !!isFollowing,
      until: Date.now() + this.followLockMs,
    });
  }

  // ---------- LOAD ----------

  async loadAllNotifications({ force = false } = {}) {
    if (!this.currentUser) return;
    if (this.isLoading) return;

    // if a follow request is currently in-flight, skip polling refresh
    // (prevents it from touching the row you’re clicking)
    if (!force && this.followInFlight.size > 0) return;

    this.isLoading = true;

    try {
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
            isFollowing: false,
          });
        }
      });

      this.likes = likes.filter((x) => x.user && x.user.id);
      this.comments = comments.filter((x) => x.user && x.user.id && x.postId);
      this.followers = followers.filter(
        (x) => x.user && x.user.id && x.user.username
      );

      // Enrich follow-status, BUT skip usernames currently locked
      if (this.followers.length) {
        try {
          await this.enrichFollowerFollowStatus(this.followers);
        } catch (e) {
          console.warn("Failed to enrich follower follow status (non-fatal):", e);
        }
      }

      // Apply lock override after enrich (lock always wins)
      this.followers.forEach((f) => {
        const uname = f?.user?.username;
        const locked = this.getLockedState(uname);
        if (locked !== null) f.isFollowing = locked;
      });

      this.unified = [
        ...this.likes.map((n) => ({ ...n, type: "likes" })),
        ...this.comments.map((n) => ({ ...n, type: "comments" })),
        ...this.followers.map((n) => ({ ...n, type: "followers" })),
      ].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      this.renderUnified({ preserveScroll: true });

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
      const msg = String(err?.message || "");
      if (msg.includes("401") || msg.toLowerCase().includes("auth token")) {
        this.stopPolling();
        this.showLoggedOutState();
      }
    } finally {
      this.isLoading = false;
    }
  }

  async fetchNotificationsFeed() {
    const token = this.getAuthToken();
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
    const token = this.getAuthToken();
    if (!token) return;

    const uniqueUsernames = [
      ...new Set(
        followersArr
          .map((f) => (f?.user?.username ? String(f.user.username) : ""))
          .filter(Boolean)
      ),
    ].filter((uname) => !this.isLocked(uname)); // ✅ skip locked

    if (!uniqueUsernames.length) return;

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
      if (this.isLocked(uname)) return; // ✅ lock wins
      if (map.has(uname)) f.isFollowing = !!map.get(uname);
    });
  }

  // ---------- RENDER ----------

  renderUnified({ preserveScroll = false, force = false } = {}) {
    if (!this.listEl) return;

    const keyParts = (this.unified || []).map((n) => {
      const extra =
        n.type === "followers" && n?.user?.username
          ? `${n.user.username}:${n.isFollowing ? 1 : 0}`
          : "";
      return `${n.type}:${n.id}:${extra}`;
    });
    const nextKey = `${this.currentFilter}|${keyParts.join("|")}`;
    if (!force && nextKey === this.lastRenderKey) return;
    this.lastRenderKey = nextKey;

    const prevScrollY = preserveScroll ? window.scrollY : 0;

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

      if (preserveScroll) {
        requestAnimationFrame(() => window.scrollTo(0, prevScrollY));
      }
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
        const btnText = isFollowing ? "Following" : "Follow";
        // ✅ keep the SAME classes always (no color switching)
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
          <button class="btn btn-sm notification-follow-btn"
                  type="button"
                  data-following="${isFollowing ? "1" : "0"}">
            ${btnText}
          </button>
        </div>
      `;
      })
      .join("");

    if (preserveScroll) {
      requestAnimationFrame(() => window.scrollTo(0, prevScrollY));
    }
  }

  // ---------- FOLLOW ----------

  setButtonState(buttonEl, isFollowing, busy) {
    if (!buttonEl) return;
    buttonEl.textContent = isFollowing ? "Following" : "Follow";
    buttonEl.dataset.following = isFollowing ? "1" : "0";
    buttonEl.disabled = !!busy;
    buttonEl.setAttribute("aria-busy", busy ? "true" : "false");
    // ✅ no class changes => no color changes
  }

  getModelFollowing(username, fallbackButtonEl) {
    const item = (this.unified || []).find(
      (n) => n.type === "followers" && n?.user?.username === username
    );
    if (item) return !!item.isFollowing;

    // fallback if model isn't ready
    if (fallbackButtonEl) return fallbackButtonEl.dataset.following === "1";
    return false;
  }

  patchModelFollowing(username, newVal) {
    this.unified = (this.unified || []).map((n) => {
      if (n.type === "followers" && n?.user?.username === username) {
        return { ...n, isFollowing: !!newVal };
      }
      return n;
    });
    this.followers = (this.followers || []).map((n) => {
      if (n?.user?.username === username) {
        return { ...n, isFollowing: !!newVal };
      }
      return n;
    });
  }

  async handleFollow(targetUsername, buttonEl) {
    if (!this.currentUser || !targetUsername || !buttonEl) return;

    if (this.followInFlight.has(targetUsername)) return;
    this.followInFlight.add(targetUsername);

    try {
      const token = this.getAuthToken();
      if (!token) return;

      const wasFollowing = this.getModelFollowing(targetUsername, buttonEl);
      const optimistic = !wasFollowing;

      // ✅ lock + update model (so polling/enrich can't override)
      this.setLock(targetUsername, optimistic);
      this.patchModelFollowing(targetUsername, optimistic);

      // ✅ update ONLY the clicked button (no rerender => no jumping)
      this.setButtonState(buttonEl, optimistic, true);

      const res = await fetch(
        `${NOTIF_API_BASE_URL}/users/${encodeURIComponent(targetUsername)}/follow`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to follow");

      const serverFollowing = !!data.following;

      // ✅ lock again to the server truth
      this.setLock(targetUsername, serverFollowing);
      this.patchModelFollowing(targetUsername, serverFollowing);

      // ✅ update button to final truth, and unlock the UI immediately
      this.setButtonState(buttonEl, serverFollowing, false);

      // Optional: refresh after a short delay (won’t flicker because lock wins)
      setTimeout(() => this.loadAllNotifications({ force: true }), 600);
    } catch (err) {
      console.error("handleFollow error", err);

      // revert button to whatever model currently says, and re-enable
      const current = this.getModelFollowing(targetUsername, buttonEl);
      this.setButtonState(buttonEl, current, false);

      // refresh to be safe
      setTimeout(() => this.loadAllNotifications({ force: true }), 600);
    } finally {
      this.followInFlight.delete(targetUsername);

      // Ensure button is clickable even if something weird happened
      try {
        if (buttonEl && buttonEl.isConnected) {
          buttonEl.disabled = false;
          buttonEl.setAttribute("aria-busy", "false");
        }
      } catch {}
    }
  }

  // ---------- UTIL ----------

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
