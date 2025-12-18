// js/video-modal.js
// Video modal for post.html only (opens from the custom player's fullscreen button)

(function () {
  const API_BASE = "https://uncensored-app-beta-production.up.railway.app/api";

  // Auth helpers from auth.js (your project)
  const getToken = window.getAuthToken || (() => null);
  const getUser = window.getCurrentUser || (() => null);

  class PostVideoModal {
    constructor() {
      // DOM
      this.modal = document.getElementById("videoModal");
      this.modalVideo = document.getElementById("modalVideo");

      this.backBtn = document.getElementById("backToPostBtn");
      this.closeBtn = document.getElementById("closeModalBtn");
      this.commentsBtn = document.getElementById("modalCommentsBtn");

      this.postInfo = document.getElementById("modalPostInfo");

      // Actions
      this.likeBtn = this.modal?.querySelector(".modal-like-btn");
      this.commentBtn = this.modal?.querySelector(".modal-comment-btn");
      this.saveBtn = this.modal?.querySelector(".modal-save-btn");
      this.shareBtn = this.modal?.querySelector(".modal-share-btn");

      // State
      this.isOpen = false;
      this.originalVideo = null;
      this.postId = null;
      this.postData = null;

      this.playbackState = {
        time: 0,
        volume: 1,
        muted: true,
        wasPlaying: false,
      };

      if (!this.modal || !this.modalVideo) {
        console.warn("PostVideoModal: modal markup not found in post.html");
        return;
      }

      this.bindGlobal();
      this.bindModalControls();
      this.bindFullscreenButtons(); // hook into .us-fullscreen
    }

    // ---------- Binding ----------
    bindGlobal() {
      // If PostPage renders after load, we also re-bind later.
      // (Safe to call multiple times)
      const rebinder = () => this.bindFullscreenButtons();
      document.addEventListener("click", rebinder, true);

      window.addEventListener("hashchange", () => {
        if (this.isOpen && window.location.hash !== "#video-modal") {
          this.close();
        }
      });
    }

    bindModalControls() {
      this.closeBtn?.addEventListener("click", () => this.close());
      this.backBtn?.addEventListener("click", () => this.close());
      this.commentsBtn?.addEventListener("click", () => this.goToComments());

      // overlay click closes (only if click background, not inside container)
      this.modal.addEventListener("click", (e) => {
        if (e.target === this.modal) this.close();
      });

      // keyboard
      document.addEventListener("keydown", (e) => {
        if (!this.isOpen) return;
        if (e.key === "Escape") this.close();
      });

      // action buttons
      this.modal?.addEventListener("click", (e) => {
        const btn = e.target.closest(".modal-action-btn");
        if (!btn) return;

        const action = btn.dataset.action;
        if (!action) return;

        if (action === "comment") return this.goToComments();
        if (action === "share") return this.share();

        if (action === "like") return this.toggleLike();
        if (action === "save") return this.toggleSave();
      });
    }

    bindFullscreenButtons() {
      // Bind to your custom player fullscreen button
      // Avoid double-binding by marking elements
      const buttons = document.querySelectorAll(".us-video-player .us-fullscreen");
      buttons.forEach((btn) => {
        if (btn.dataset.boundModal === "1") return;
        btn.dataset.boundModal = "1";

        btn.addEventListener("click", (e) => {
          // Your Post.js already attaches a handler to .us-fullscreen.
          // We must stop it so only THIS modal opens.
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();

          const player = btn.closest(".us-video-player");
          const vid = player?.querySelector("video");
          const postEl = btn.closest("[data-post-id]");
          const postId = postEl?.dataset?.postId || null;

          this.open(vid, postId);
        }, true);
      });
    }

    // ---------- Open / Close ----------
    async open(videoEl, postId) {
      if (!videoEl) return;

      this.originalVideo = videoEl;
      this.postId = postId;

      // capture state
      this.playbackState = {
        time: this.originalVideo.currentTime || 0,
        volume: this.originalVideo.volume ?? 1,
        muted: this.originalVideo.muted ?? true,
        wasPlaying: !this.originalVideo.paused,
      };

      // pause original
      try { this.originalVideo.pause(); } catch {}

      // set modal source correctly
      const src = this.getPlayableSrc(this.originalVideo);
      if (!src) {
        console.warn("PostVideoModal: no playable src found for video");
        return;
      }

      // Use src attribute (not <source>) for modal video simplicity
      this.modalVideo.src = src;
      this.modalVideo.currentTime = this.playbackState.time;
      this.modalVideo.volume = this.playbackState.volume;
      this.modalVideo.muted = this.playbackState.muted;

      // show modal
      this.modal.classList.add("active");
      document.body.style.overflow = "hidden";
      this.isOpen = true;

      window.location.hash = "video-modal";

      // try play if it was playing before
      if (this.playbackState.wasPlaying) {
        try {
          await this.modalVideo.play();
        } catch {
          // autoplay may be blocked
        }
      }

      // populate UI (prefer existing loaded post from PostPage)
      await this.populatePostInfo();
    }

    close() {
      if (!this.isOpen) return;

      // capture modal state back
      try {
        this.playbackState.time = this.modalVideo.currentTime || 0;
        this.playbackState.wasPlaying = !this.modalVideo.paused;
      } catch {}

      // stop modal video
      try { this.modalVideo.pause(); } catch {}
      this.modalVideo.removeAttribute("src");
      this.modalVideo.load();

      // hide
      this.modal.classList.remove("active");
      document.body.style.overflow = "";
      this.isOpen = false;

      // restore original
      if (this.originalVideo) {
        try {
          this.originalVideo.currentTime = this.playbackState.time;
          this.originalVideo.volume = this.playbackState.volume;
          this.originalVideo.muted = this.playbackState.muted;

          if (this.playbackState.wasPlaying) {
            this.originalVideo.play().catch(() => {});
          }
        } catch {}
      }

      // clear hash safely
      if (window.location.hash === "#video-modal") {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }

    // ---------- Helpers ----------
    getPlayableSrc(videoEl) {
      // Best: currentSrc (after load)
      if (videoEl.currentSrc) return videoEl.currentSrc;

      // If <video src="">
      if (videoEl.src) return videoEl.src;

      // If <source src="">
      const source = videoEl.querySelector("source");
      if (source?.src) return source.src;

      return null;
    }

    async populatePostInfo() {
      // If PostPage is on window and has loaded a post, use it
      const pagePost = window.postPage?.post;
      if (pagePost?.id) {
        this.postData = pagePost;
        this.updateModalUI(pagePost);
        return;
      }

      // Otherwise fetch by ID
      if (!this.postId) return;

      try {
        const token = getToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(this.postId)}`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        this.postData = data;
        this.updateModalUI(data);
      } catch (e) {
        console.warn("PostVideoModal: failed to load post data", e);
      }
    }

    updateModalUI(post) {
      if (!this.postInfo) return;

      const user = post.user || {};
      const avatar = user.avatar_url || "default-profile.PNG";
      const username = user.username || "unknown";
      const content = post.content || "";

      const likes = typeof post.likes === "number" ? post.likes : 0;
      const comments = typeof post.comments_count === "number" ? post.comments_count : 0;

      const img = this.postInfo.querySelector(".modal-profile-pic");
      const h4 = this.postInfo.querySelector("h4");
      const p = this.postInfo.querySelector("p");
      const stats = this.postInfo.querySelector(".modal-stats");

      if (img) {
        img.src = avatar;
        img.onerror = function () { this.src = "default-profile.PNG"; };
        img.alt = username;
      }
      if (h4) h4.textContent = `@${username}`;
      if (p) p.textContent = content;

      if (stats) {
        stats.innerHTML = `
          <span><i class="far fa-heart"></i> ${likes}</span>
          <span><i class="far fa-comment"></i> ${comments}</span>
        `;
      }

      // buttons state
      if (this.likeBtn) {
        const liked = !!post.liked_by_me;
        this.likeBtn.classList.toggle("liked", liked);
        this.likeBtn.innerHTML = `
          <i class="${liked ? "fas" : "far"} fa-heart"></i>
          <span class="like-count">${likes}</span>
        `;
      }

      if (this.commentBtn) {
        this.commentBtn.innerHTML = `
          <i class="far fa-comment"></i>
          <span class="comment-count">${comments}</span>
        `;
      }

      if (this.saveBtn) {
        const saved = !!post.saved_by_me;
        this.saveBtn.classList.toggle("saved", saved);
        this.saveBtn.innerHTML = `
          <i class="${saved ? "fas" : "far"} fa-bookmark"></i>
        `;
      }
    }

    goToComments() {
      this.close();

      setTimeout(() => {
        const el = document.getElementById("commentsSection");
        if (!el) return;
        const offset = 72;
        const y = el.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: y, behavior: "smooth" });
        // optional focus
        const input = document.getElementById("commentInput");
        if (input) setTimeout(() => input.focus(), 350);
      }, 200);
    }

    async toggleLike() {
      const token = getToken();
      if (!token) return alert("Please log in to like posts.");
      if (!this.postData?.id) return;

      // optimistic UI
      const wasLiked = !!this.postData.liked_by_me;
      const oldLikes = typeof this.postData.likes === "number" ? this.postData.likes : 0;
      const newLikes = Math.max(0, oldLikes + (wasLiked ? -1 : 1));
      this.postData.liked_by_me = !wasLiked;
      this.postData.likes = newLikes;
      this.updateModalUI(this.postData);

      try {
        const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(this.postData.id)}/like`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Like failed");

        // sync from server if available
        if (typeof data.likes === "number") this.postData.likes = data.likes;
        if (typeof data.liked === "boolean") this.postData.liked_by_me = data.liked;

        this.updateModalUI(this.postData);

        // also sync the post page button if present
        const postLikeBtn = document.querySelector(".post .like-btn");
        const postLikeCount = postLikeBtn?.querySelector(".like-count");
        if (postLikeCount && typeof this.postData.likes === "number") {
          postLikeCount.textContent = String(this.postData.likes);
          postLikeBtn.classList.toggle("liked", !!this.postData.liked_by_me);
          const icon = postLikeBtn.querySelector("i");
          if (icon) icon.className = `fa-${this.postData.liked_by_me ? "solid" : "regular"} fa-heart`;
        }
      } catch (e) {
        // revert
        this.postData.liked_by_me = wasLiked;
        this.postData.likes = oldLikes;
        this.updateModalUI(this.postData);
      }
    }

    async toggleSave() {
      const token = getToken();
      if (!token) return alert("Please log in to save posts.");
      if (!this.postData?.id) return;

      const wasSaved = !!this.postData.saved_by_me;
      this.postData.saved_by_me = !wasSaved;
      this.updateModalUI(this.postData);

      try {
        const res = await fetch(`${API_BASE}/posts/${encodeURIComponent(this.postData.id)}/save`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Save failed");

        if (typeof data.saved === "boolean") this.postData.saved_by_me = data.saved;
        this.updateModalUI(this.postData);

        // sync post page save button
        const postSaveBtn = document.querySelector(".post .save-btn");
        if (postSaveBtn) {
          postSaveBtn.classList.toggle("saved", !!this.postData.saved_by_me);
          const icon = postSaveBtn.querySelector("i");
          if (icon) icon.className = `fa-${this.postData.saved_by_me ? "solid" : "regular"} fa-bookmark`;
        }
      } catch (e) {
        this.postData.saved_by_me = wasSaved;
        this.updateModalUI(this.postData);
      }
    }

    share() {
      const url = window.location.href;
      if (navigator.share) {
        navigator.share({ title: "Uncensored Social", url }).catch(() => {});
      } else if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(() => alert("Link copied!")).catch(() => alert(url));
      } else {
        alert(url);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Only on post page where modal exists
    if (document.getElementById("videoModal") && document.getElementById("modalVideo")) {
      window.postVideoModal = new PostVideoModal();
    }
  });
})();
