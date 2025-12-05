// notifications.js

// Reuse same Supabase project as search.js
const NOTIF_SUPABASE = supabase.createClient(
  "https://hbbbsreonwhvqfvbszne.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyOTc5ODYsImV4cCI6MjA3OTg3Mzk4Nn0.LvqmdOqetnMrH8bnkJY6_S-dsGD8gnvpFczSCJPy-Q4"
);

class NotificationsManager {
  constructor() {
    this.pollIntervalMs = 30000; // 30s
    this.pollTimer = null;
    this.currentUser = null;

    this.likesList = document.getElementById("likesList");
    this.commentsList = document.getElementById("commentsList");
    this.followersList = document.getElementById("followersList");
    this.emptyState = document.getElementById("notificationsEmpty");

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

    this.setupEventDelegation();
    await this.loadAllNotifications();

    // Poll periodically for new activity
    this.pollTimer = setInterval(
      () => this.loadAllNotifications(),
      this.pollIntervalMs
    );
  }

  showLoggedOutState() {
    if (this.likesList) this.likesList.innerHTML = "";
    if (this.commentsList) this.commentsList.innerHTML = "";
    if (this.followersList) this.followersList.innerHTML = "";

    if (this.emptyState) {
      this.emptyState.style.display = "block";
      this.emptyState.innerHTML = `
        <h3>Log in to see alerts</h3>
        <p>Create an account or log in to receive notifications.</p>
      `;
    }
  }

  // Single event listeners per section (works even when we re-render innerHTML)
  setupEventDelegation() {
    if (this.likesList) {
      this.likesList.addEventListener("click", (e) => {
        const item = e.target.closest(".notification-item");
        if (!item) return;
        const postId = item.dataset.postId;
        if (postId) {
          window.location.href = `post.html?id=${encodeURIComponent(postId)}`;
        }
      });
    }

    if (this.commentsList) {
      this.commentsList.addEventListener("click", (e) => {
        const item = e.target.closest(".notification-item");
        if (!item) return;
        const postId = item.dataset.postId;
        if (postId) {
          window.location.href = `post.html?id=${encodeURIComponent(
            postId
          )}#comments`;
        }
      });
    }

    if (this.followersList) {
      this.followersList.addEventListener("click", (e) => {
        const card = e.target.closest(".notification-item");
        if (!card) return;

        const username = card.dataset.username;
        const userId = card.dataset.userId;

        // Follow button clicked
        if (e.target.closest(".notification-follow-btn")) {
          this.handleFollow(userId, e.target.closest("button"));
          return;
        }

        // Otherwise go to profile
        if (!username) return;
        const me = this.currentUser;
        if (me && me.username === username) {
          window.location.href = "profile.html";
        } else {
          window.location.href = `user.html?user=${encodeURIComponent(
            username
          )}`;
        }
      });
    }
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

      this.renderLikes(likes);
      this.renderComments(comments);
      this.renderFollowers(followers);

      const hasAny =
        (likes && likes.length) ||
        (comments && comments.length) ||
        (followers && followers.length);

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
    }
  }

  // ========== FETCH HELPERS ==========

  async fetchFollowers(userId) {
    const { data, error } = await NOTIF_SUPABASE
      .from("follows")
      .select("id, follower_id, created_at")
      .eq("followed_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

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
            avatar: u.avatar_url || "assets/icons/default-profile.png",
          },
        };
      })
      .filter(Boolean);
  }

  async fetchLikes(userId) {
    // First: all posts by me
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
      .limit(40);

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
            avatar: actor.avatar_url || "assets/icons/default-profile.png",
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
      .limit(40);

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
            avatar: actor.avatar_url || "assets/icons/default-profile.png",
          },
        };
      })
      .filter(Boolean);
  }

  // ========== RENDER ==========

  renderLikes(likes) {
    if (!this.likesList) return;

    if (!likes.length) {
      this.likesList.innerHTML =
        '<div class="notification-item"><div class="notification-body"><div class="notification-text">No likes yet.</div></div></div>';
      return;
    }

    this.likesList.innerHTML = likes
      .map((n) => {
        const postPreview =
          n.postContent && n.postContent.length > 60
            ? n.postContent.slice(0, 57) + "..."
            : n.postContent;
        return `
        <div class="notification-item" data-post-id="${n.postId}">
          <div class="notification-avatar-wrapper">
            <img src="${n.user.avatar}" class="notification-avatar"
              onerror="this.src='assets/icons/default-profile.png'">
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
      })
      .join("");
  }

  renderComments(comments) {
    if (!this.commentsList) return;

    if (!comments.length) {
      this.commentsList.innerHTML =
        '<div class="notification-item"><div class="notification-body"><div class="notification-text">No comments yet.</div></div></div>';
      return;
    }

    this.commentsList.innerHTML = comments
      .map((n) => {
        const commentPreview =
          n.commentText && n.commentText.length > 60
            ? n.commentText.slice(0, 57) + "..."
            : n.commentText;
        return `
        <div class="notification-item" data-post-id="${n.postId}">
          <div class="notification-avatar-wrapper">
            <img src="${n.user.avatar}" class="notification-avatar"
              onerror="this.src='assets/icons/default-profile.png'">
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
      })
      .join("");
  }

  renderFollowers(followers) {
    if (!this.followersList) return;

    if (!followers.length) {
      this.followersList.innerHTML =
        '<div class="notification-item"><div class="notification-body"><div class="notification-text">No new followers yet.</div></div></div>';
      return;
    }

    this.followersList.innerHTML = followers
      .map((n) => {
        return `
        <div class="notification-item follower-item"
             data-user-id="${n.user.id}"
             data-username="${this.escape(n.user.username)}">
          <div class="notification-avatar-wrapper">
            <img src="${n.user.avatar}" class="notification-avatar"
              onerror="this.src='assets/icons/default-profile.png'">
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
    if (!this.currentUser) return;
    const meId = this.currentUser.id;

    try {
      const isFollowing = buttonEl.textContent.trim().toLowerCase() === "following";

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
