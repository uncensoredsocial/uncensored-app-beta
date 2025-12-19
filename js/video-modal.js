// js/video-modal.js
// Video modal for post.html only (opens from the custom player's fullscreen button)
// - No native Safari video controls
// - Double tap left/right to seek -10/+10
// - Only ONE top-left close button
// - Bottom comment button closes modal and scrolls to comments

(function () {
  const API_BASE = "https://uncensored-app-beta-production.up.railway.app/api";

  // Auth helpers from auth.js (your project)
  const getToken = window.getAuthToken || (() => null);
  const getUser = window.getCurrentUser || (() => null);

  class PostVideoModal {
    constructor() {
      // DOM
      this.modal = document.getElementById("videoModal");
      this.video = document.getElementById("videoModalVideo");

      this.closeBtn = document.getElementById("videoModalClose");

      this.tapLayer = document.getElementById("videoTapLayer");
      this.leftZone = document.getElementById("videoDoubleLeft");
      this.rightZone = document.getElementById("videoDoubleRight");
      this.centerBtn = document.getElementById("videoCenterBtn");
      this.feedback = document.getElementById("skipFeedback");

      // Bottom actions
      this.likeBtn = document.getElementById("vmLikeBtn");
      this.commentBtn = document.getElementById("vmCommentBtn");
      this.saveBtn = document.getElementById("vmSaveBtn");
      this.shareBtn = document.getElementById("vmShareBtn");

      this.likeCountEl = document.getElementById("vmLikeCount");
      this.commentCountEl = document.getElementById("vmCommentCount");
      this.saveCountEl = document.getElementById("vmSaveCount");

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

      // double tap
      this.DOUBLE_TAP_MS = 280;
      this.SEEK_STEP = 10;
      this.lastTapL = 0;
      this.lastTapR = 0;

      if (!this.modal || !this.video) {
        console.warn("PostVideoModal: modal markup not found in post.html");
        return;
      }

      this.bindGlobal();
      this.bindModalControls();
      this.bindFullscreenButtons(); // hook into .us-fullscreen
    }

    // ---------- Binding ----------
    bindGlobal() {
      // rebinding is safe; we mark buttons
      const rebinder = () => this.bindFullscreenButtons();
      document.addEventListener("click", rebinder, true);

      window.addEventListener("hashchange", () => {
        if (this.isOpen && window.location.hash !== "#video-modal") {
          this.close();
        }
      });
    }

    bindModalControls() {
      // Close modal
      this.closeBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        this.close();
      });

      // Click outside (background) closes
      this.modal.addEventListener("click", (e) => {
        // Only if clicking the overlay background, not inside content
        if (e.target === this.modal) this.close();
      });

      // Escape closes
      document.addEventListener("keydown", (e) => {
        if (!this.isOpen) return;
        if (e.key === "Escape") this.close();
      });

      // Single tap toggles play/pause (we never tap the <video>)
      this.tapLayer?.addEventListener("click", (e) => {
        e.preventDefault();
        this.togglePlay();
      });

      this.centerBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        this.togglePlay();
      });

      // Double tap zones
      this.attachDoubleTap(this.leftZone, "L");
      this.attachDoubleTap(this.rightZone, "R");

      // Bottom buttons
      this.commentBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        this.goToComments();
      });

      this.likeBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        this.toggleLike();
      });

      this.saveBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        this.toggleSave();
      });

      this.shareBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        this.share();
      });

      // Keep state synced
      this.video.addEventListener("play", () => this.setState("playing"));
      this.video.addEventListener("pause", () => this.setState("paused"));
      this.video.addEventListener("ended", () => this.setState("paused"));
    }

    bindFullscreenButtons() {
      // Bind to your custom player fullscreen button (.us-fullscreen)
      const buttons = document.querySelectorAll(".us-video-player .us-fullscreen");
      buttons.forEach((btn) => {
        if (btn.dataset.boundModal === "1") return;
        btn.dataset.boundModal = "1";

        btn.addEventListener(
          "click",
          (e) => {
            // stop any other fullscreen handlers
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            const player = btn.closest(".us-video-player");
            const vid = player?.querySelector("video");
            const postEl = btn.closest("[data-post-id]");
            const postId = postEl?.dataset?.postId || null;

            this.open(vid, postId);
          },
          true
        );
      });
    }

    // ---------- Core ----------
    setState(state) {
      // state: "playing" | "paused"
      this.modal.dataset.state = state;

      const icon = this.centerBtn?.querySelector("i");
      if (icon) {
        icon.className = state === "playing" ? "fa-solid fa-pause" : "fa-solid fa-play";
      }
    }

    configureVideoForNoNativeUI() {
      // Critical: do not show native controls
      this.video.removeAttribute("controls");
      this.video.setAttribute("playsinline", "");
      this.video.setAttribute("webkit-playsinline", "");
      this.video.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback");
      this.video.disablePictureInPicture = true;

      // Even if something adds controls later, this helps on some browsers
      this.video.controls = false;
    }

    async open(videoEl, postId) {
      if (!videoEl) return;

      this.originalVideo = videoEl;
      this.postId = postId;

      // capture original state
      this.playbackState = {
        time: this.originalVideo.currentTime || 0,
        volume: this.originalVideo.volume ?? 1,
        muted: this.originalVideo.muted ?? true,
        wasPlaying: !this.originalVideo.paused,
      };

      // pause original
      try {
        this.originalVideo.pause();
      } catch {}

      // src
      const src = this.getPlayableSrc(this.originalVideo);
      if (!src) {
        console.warn("PostVideoModal: no playable src found for video");
        return;
      }

      // configure modal video
      this.configureVideoForNoNativeUI();

      this.video.src = src;
      this.video.currentTime = this.playbackState.time;
      this.video.volume = this.playbackState.volume;
      this.video.muted = this.playbackState.muted;

      // show modal
      this.modal.classList.remove("hidden");
      this.modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      this.isOpen = true;

      // optional hash
      window.location.hash = "video-modal";

      // update UI counts/icons
      await this.populatePostInfo();

      // play if it was playing before (autoplay may be blocked)
      if (this.playbackState.wasPlaying) {
        try {
          await this.video.play();
          this.setState("playing");
        } catch {
          this.setState("paused");
        }
      } else {
        this.setState("paused");
      }
    }

    close() {
      if (!this.isOpen) return;

      // capture modal state back
      try {
        this.playbackState.time = this.video.currentTime || 0;
        this.playbackState.wasPlaying = !this.video.paused;
      } catch {}

      // stop modal video
      try {
        this.video.pause();
      } catch {}
      this.video.removeAttribute("src");
      this.video.load();

      // hide
      this.modal.classList.add("hidden");
      this.modal.setAttribute("aria-hidden", "true");
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

    togglePlay() {
      if (!this.video) return;

      if (this.video.paused) {
        this.video
          .play()
          .then(() => this.setState("playing"))
          .catch(() => this.setState("paused"));
      } else {
        this.video.pause();
        this.setState("paused");
      }
    }

    // ---------- Double tap seek ----------
    clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    showSkip(dir) {
      if (!this.feedback) return;

      this.feedback.className = "us-skip-feedback show " + (dir === "f" ? "forward" : "backward");
      this.feedback.innerHTML =
        dir === "f"
          ? `<i class="fa-solid fa-forward"></i>`
          : `<i class="fa-solid fa-backward"></i>`;

      window.clearTimeout(this._skipT);
      this._skipT = window.setTimeout(() => {
        this.feedback.className = "us-skip-feedback";
        this.feedback.innerHTML = "";
      }, 450);
    }

    seekBy(seconds) {
      const dur = isFinite(this.video.duration) ? this.video.duration : 0;
      const next = this.clamp((this.video.currentTime || 0) + seconds, 0, dur || 10e9);
      this.video.currentTime = next;
      this.showSkip(seconds > 0 ? "f" : "b");
    }

    attachDoubleTap(zoneEl, side) {
      if (!zoneEl) return;

      // Mobile: touchend double-tap timing
      zoneEl.addEventListener(
        "touchend",
        (e) => {
          e.preventDefault();

          const now = Date.now();
          if (side === "L") {
            if (now - this.lastTapL < this.DOUBLE_TAP_MS) this.seekBy(-this.SEEK_STEP);
            this.lastTapL = now;
          } else {
            if (now - this.lastTapR < this.DOUBLE_TAP_MS) this.seekBy(this.SEEK_STEP);
            this.lastTapR = now;
          }
        },
        { passive: false }
      );

      // Desktop fallback
      zoneEl.addEventListener("dblclick", (e) => {
        e.preventDefault();
        this.seekBy(side === "L" ? -this.SEEK_STEP : this.SEEK_STEP);
      });
    }

    // ---------- Helpers ----------
    getPlayableSrc(videoEl) {
      if (videoEl.currentSrc) return videoEl.currentSrc;
      if (videoEl.src) return videoEl.src;

      const source = videoEl.querySelector("source");
      if (source?.src) return source.src;

      return null;
    }

    // ---------- Post data + UI ----------
    async populatePostInfo() {
      // Prefer the already loaded post from PostPage if available
      const pagePost = window.postPage?.post;
      if (pagePost?.id) {
        this.postData = pagePost;
        this.updateModalUI(pagePost);
        return;
      }

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
      const likes = typeof post.likes === "number" ? post.likes : 0;
      const comments = typeof post.comments_count === "number" ? post.comments_count : 0;

      // Your API might not have save count — keep it safe
      const saves =
        typeof post.saves === "number"
          ? post.saves
          : typeof post.save_count === "number"
          ? post.save_count
          : 0;

      if (this.likeCountEl) this.likeCountEl.textContent = String(likes);
      if (this.commentCountEl) this.commentCountEl.textContent = String(comments);
      if (this.saveCountEl) this.saveCountEl.textContent = String(saves);

      const liked = !!post.liked_by_me;
      const saved = !!post.saved_by_me;

      // Like icon
      if (this.likeBtn) {
        const i = this.likeBtn.querySelector("i");
        if (i) i.className = liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
        this.likeBtn.classList.toggle("liked", liked);
      }

      // Save icon
      if (this.saveBtn) {
        const i = this.saveBtn.querySelector("i");
        if (i) i.className = saved ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
        this.saveBtn.classList.toggle("saved", saved);
      }
    }

    // ---------- Actions ----------
    goToComments() {
      // Close modal and scroll to comments section
      this.close();

      setTimeout(() => {
        const el = document.getElementById("commentsSection");
        if (!el) return;

        const offset = 72;
        const y = el.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: y, behavior: "smooth" });

        const input = document.getElementById("commentInput");
        if (input) setTimeout(() => input.focus(), 350);
      }, 150);
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

        // sync
        if (typeof data.likes === "number") this.postData.likes = data.likes;
        if (typeof data.liked === "boolean") this.postData.liked_by_me = data.liked;

        this.updateModalUI(this.postData);

        // sync post page like button (best-effort)
        const postLikeBtn = document.querySelector(".post .like-btn");
        const postLikeCount = postLikeBtn?.querySelector(".like-count");
        if (postLikeBtn && postLikeCount) {
          postLikeCount.textContent = String(this.postData.likes ?? 0);
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

        // sync post page save button (best-effort)
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
        navigator.clipboard
          .writeText(url)
          .then(() => alert("Link copied!"))
          .catch(() => alert(url));
      } else {
        alert(url);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Only on post page where modal exists
    if (document.getElementById("videoModal") && document.getElementById("videoModalVideo")) {
      window.postVideoModal = new PostVideoModal();
    }
  });
})();
