// js/video-modal.js
// DASH-style fullscreen video modal for post.html
// Handles play/pause UI sync, auto-hide overlays, likes/comments/share/save,
// follow button, quality switching, speed up to 2x, and watermarked download.

(function () {
  const API_BASE = "https://uncensored-app-beta-production.up.railway.app/api";

  const getToken = window.getAuthToken || (() => null);
  const getUser = window.getCurrentUser || (() => null);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const fmt = (s) => {
    s = Math.floor(s || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  };

  class VideoDashModal {
    constructor() {
      // Core
      this.modal = document.getElementById("videoModal");
      this.container = document.getElementById("videoModalContainer");
      this.video = document.getElementById("modalVideo");

      // Top
      this.closeBtn = document.getElementById("closeModalBtn");
      this.avatar = document.getElementById("vmAvatar");
      this.name = document.getElementById("vmName");
      this.handle = document.getElementById("vmHandle");
      this.followBtn = document.getElementById("vmFollowBtn");

      // Try to find a "top bar" wrapper so we can keep it visible always
      this.topBar =
        document.getElementById("vmTopBar") ||
        (this.closeBtn ? this.closeBtn.closest(".vm-topbar") : null) ||
        (this.avatar ? this.avatar.closest(".vm-topbar") : null) ||
        (this.modal ? this.modal.querySelector(".vm-topbar") : null);

      // Overlays
      this.tap = document.getElementById("vmTap");
      this.centerBtn = document.getElementById("vmCenterBtn");
      this.leftZone = document.getElementById("vmDblLeft");
      this.rightZone = document.getElementById("vmDblRight");

      // Bottom
      this.bottomBar = document.getElementById("vmBottomBar");
      this.likeBtn = document.getElementById("vmLikeBtn");
      this.commentBtn = document.getElementById("vmCommentBtn");
      this.shareBtn = document.getElementById("vmShareBtn");
      this.saveBtn = document.getElementById("vmSaveBtn");

      this.likeCount = document.getElementById("vmLikeCount");
      this.commentCount = document.getElementById("vmCommentCount");
      this.saveCount = document.getElementById("vmSaveCount");

      this.playBtn = document.getElementById("vmPlayBtn");
      this.muteBtn = document.getElementById("vmMuteBtn");
      this.settingsBtn = document.getElementById("vmSettingsBtn");
      this.timeEl = document.getElementById("vmTime");
      this.progress = document.getElementById("vmProgress");

      // Settings
      this.settings = document.getElementById("vmSettings");
      this.speedSel = document.getElementById("vmSpeedSelect");
      this.qualitySel = document.getElementById("vmQualitySelect");
      this.downloadBtn = document.getElementById("vmDownloadBtn");

      // State
      this.post = null;
      this.postId = null;
      this.origVideo = null;
      this.hideTimer = null;
      this.isOpen = false;

      // iOS / browser fixes
      this.video.controls = false;
      this.video.disablePictureInPicture = true;
      this.video.playsInline = true;

      // ✅ make sure it behaves like a contained player (no weird stretching)
      this.video.style.objectFit = "contain";
      this.video.style.background = "#000";

      // ✅ kill center button completely (we still keep it in DOM safely)
      if (this.centerBtn) this.centerBtn.style.display = "none";

      this.bind();
      this.bindFullscreenButtons();
    }

    /* ---------------- bind ---------------- */

    bind() {
      this.closeBtn.onclick = () => this.close();

      // ✅ IMPORTANT:
      // - Tapping should ALWAYS bring UI back
      // - AND still toggle play/pause like before
      if (this.tap) {
        this.tap.onclick = () => {
          this.showUI(true);
          this.togglePlay();
        };
        // On touchstart/mousedown, show UI instantly even if click doesn’t fire right away
        this.tap.addEventListener(
          "touchstart",
          () => this.showUI(true),
          { passive: true }
        );
        this.tap.addEventListener("mousedown", () => this.showUI(true));
      }

      // Center button disabled visually; keep handler harmless
      if (this.centerBtn) {
        this.centerBtn.onclick = () => {
          this.showUI(true);
          this.togglePlay();
        };
      }

      this.playBtn.onclick = () => {
        this.showUI(true);
        this.togglePlay();
      };

      this.muteBtn.onclick = () => {
        this.video.muted = !this.video.muted;
        this.updateMute();
        this.showUI(true);
      };

      this.settingsBtn.onclick = () => {
        this.settings.classList.toggle("visible");
        this.showUI(true);
      };

      this.likeBtn.onclick = () => this.toggleLike();
      this.commentBtn.onclick = () => this.goToComments();
      this.shareBtn.onclick = () => this.share();
      this.saveBtn.onclick = () => this.toggleSave();

      this.followBtn.onclick = () => this.toggleFollow();

      this.speedSel.onchange = () => {
        this.video.playbackRate = clamp(+this.speedSel.value, 0.5, 2);
      };

      this.qualitySel.onchange = () => this.changeQuality();

      this.downloadBtn.onclick = () => this.download();

      this.progress.oninput = () => {
        if (!this.video.duration) return;
        this.video.currentTime =
          (this.progress.value / 100) * this.video.duration;
        this.showUI(true);
      };

      this.video.onplay = () => this.onPlay();
      this.video.onpause = () => this.onPause();
      this.video.ontimeupdate = () => this.updateTime();
      this.video.onended = () => this.onPause();

      // ✅ ASPECT RATIO SYNC (removes weird blank space / wrong sizing)
      this.video.onloadedmetadata = () => {
        this.syncAspectRatio();
      };

      // Double tap skip
      let lt = 0,
        rt = 0;
      this.leftZone.ontouchend = () => {
        const n = Date.now();
        if (n - lt < 300) this.skip(-10);
        lt = n;
      };
      this.rightZone.ontouchend = () => {
        const n = Date.now();
        if (n - rt < 300) this.skip(10);
        rt = n;
      };

      // ✅ If user touches anywhere in modal, bring UI back
      if (this.container) {
        this.container.addEventListener(
          "touchstart",
          () => this.showUI(true),
          { passive: true }
        );
        this.container.addEventListener("mousemove", () => this.showUI(false));
        this.container.addEventListener("mousedown", () => this.showUI(true));
      }

      document.addEventListener("keydown", (e) => {
        if (this.isOpen && e.key === "Escape") this.close();
      });
    }

    bindFullscreenButtons() {
      document.addEventListener(
        "click",
        (e) => {
          const btn = e.target.closest(".us-fullscreen");
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();

          const player = btn.closest(".us-video-player");
          const video = player?.querySelector("video");
          const postEl = btn.closest("[data-post-id]");
          if (!video || !postEl) return;

          this.open(video, postEl.dataset.postId);
        },
        true
      );
    }

    /* ---------------- open / close ---------------- */

    async open(videoEl, postId) {
      this.origVideo = videoEl;
      this.postId = postId;

      const src =
        videoEl.currentSrc ||
        videoEl.src ||
        videoEl.querySelector("source")?.src;
      if (!src) return;

      videoEl.pause();

      // reset UI
      if (this.settings) this.settings.classList.remove("visible");
      if (this.bottomBar) this.bottomBar.style.opacity = "1";
      if (this.topBar) {
        this.topBar.style.opacity = "1";
        this.topBar.style.pointerEvents = "auto";
      }

      this.video.src = src;
      this.video.currentTime = videoEl.currentTime || 0;
      this.video.muted = true;

      this.modal.classList.add("active");
      document.body.style.overflow = "hidden";
      this.isOpen = true;

      await this.loadPost();
      this.setupQualities();

      this.video.play().catch(() => {});
      this.showUI(true);
    }

    close() {
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();

      this.modal.classList.remove("active");
      document.body.style.overflow = "";
      this.isOpen = false;

      if (this.origVideo) {
        this.origVideo.currentTime = this.video.currentTime || 0;
        this.origVideo.play().catch(() => {});
      }
    }

    /* ---------------- UI sync ---------------- */

    onPlay() {
      this.container.dataset.state = "playing";
      this.updatePlayIcon(false);
      this.showUI(false);
    }

    onPause() {
      this.container.dataset.state = "paused";
      this.updatePlayIcon(true);
      this.showUI(true);
    }

    togglePlay() {
      this.video.paused ? this.video.play() : this.video.pause();
    }

    // ✅ Like feed.js: solid icon when active
    updatePlayIcon(paused) {
      const cls = paused ? "play" : "pause";
      const icon = this.playBtn?.querySelector("i");
      if (icon) icon.className = `fa-solid fa-${cls}`;

      // center button intentionally hidden, but keep safe if it exists
      const c = this.centerBtn?.querySelector("i");
      if (c) c.className = `fa-solid fa-${cls}`;
    }

    updateMute() {
      const icon = this.muteBtn?.querySelector("i");
      if (!icon) return;
      icon.className = this.video.muted
        ? "fa-solid fa-volume-xmark"
        : "fa-solid fa-volume-high";
    }

    updateTime() {
      if (!this.video.duration) return;
      this.timeEl.textContent = `${fmt(this.video.currentTime)} / ${fmt(
        this.video.duration
      )}`;
      this.progress.value =
        (this.video.currentTime / this.video.duration) * 100;
    }

    // ✅ Keep TOP bar always visible, only fade bottom bar
    showUI(force = false) {
      clearTimeout(this.hideTimer);

      // TOP ALWAYS VISIBLE
      if (this.topBar) {
        this.topBar.style.opacity = "1";
        this.topBar.style.pointerEvents = "auto";
      }

      // BOTTOM BAR
      if (this.bottomBar) this.bottomBar.style.opacity = "1";

      if (!force && !this.video.paused) {
        this.hideTimer = setTimeout(() => {
          if (this.bottomBar) this.bottomBar.style.opacity = "0";
          if (this.settings) this.settings.classList.remove("visible");
        }, 2200);
      }
    }

    skip(sec) {
      this.video.currentTime = clamp(
        this.video.currentTime + sec,
        0,
        this.video.duration || 9999
      );
      this.showUI(true);
    }

    // ✅ NEW: aspect ratio sync (loadedmetadata)
    syncAspectRatio() {
      const w = this.video.videoWidth || 16;
      const h = this.video.videoHeight || 9;

      // This helps the modal layout understand the video's true shape
      // (and reduces "random black space" behavior on some devices)
      if (this.container) {
        this.container.style.setProperty("--vm-video-ar", `${w} / ${h}`);
      }
    }

    /* ---------------- data ---------------- */

    async loadPost() {
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/posts/${this.postId}`, { headers });
      if (!res.ok) return;
      this.post = await res.json();
      this.renderPost();
    }

    renderPost() {
      const u = this.post.user || {};
      const me = getUser();

      this.avatar.src = u.avatar_url || "default-profile.PNG";
      this.name.textContent = u.display_name || u.username || "";
      this.handle.textContent = `@${u.username || ""}`;

      const isMe = me?.username === u.username;
      if (isMe) {
        this.followBtn.style.display = "none";
      } else {
        this.followBtn.style.display = "";
        this.followBtn.textContent = this.post.following_user
          ? "Following"
          : "Follow";
        this.followBtn.classList.toggle("following", !!this.post.following_user);
      }

      const likes = this.post.likes ?? this.post.likes_count ?? 0;
      const comments = this.post.comments_count ?? this.post.comment_count ?? 0;
      const saves = this.post.saves ?? this.post.saves_count ?? 0;

      this.likeCount.textContent = likes;
      this.commentCount.textContent = comments;
      this.saveCount.textContent = saves;

      // ✅ Sync active states
      this.likeBtn.classList.toggle("liked", !!this.post.liked_by_me);
      this.saveBtn.classList.toggle("saved", !!this.post.saved_by_me);

      // ✅ Make icons solid/regular like feed.js
      this.syncActionIcons();
    }

    syncActionIcons() {
      const likeIcon = this.likeBtn?.querySelector("i");
      const saveIcon = this.saveBtn?.querySelector("i");

      const liked = !!this.post?.liked_by_me;
      const saved = !!this.post?.saved_by_me;

      if (likeIcon) {
        likeIcon.classList.remove("fa-solid", "fa-regular", "fa-heart");
        likeIcon.classList.add(liked ? "fa-solid" : "fa-regular", "fa-heart");
      }
      if (saveIcon) {
        saveIcon.classList.remove("fa-solid", "fa-regular", "fa-bookmark");
        saveIcon.classList.add(saved ? "fa-solid" : "fa-regular", "fa-bookmark");
      }
    }

    /* ---------------- actions ---------------- */

    async toggleLike() {
      if (!getToken()) return alert("Log in to like");

      const liked = !this.post.liked_by_me;
      this.post.liked_by_me = liked;

      // optimistic count
      const cur = typeof this.post.likes === "number" ? this.post.likes : 0;
      this.post.likes = cur + (liked ? 1 : -1);

      this.renderPost();
      this.showUI(true);

      await fetch(`${API_BASE}/posts/${this.postId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    }

    async toggleSave() {
      if (!getToken()) return alert("Log in to save");

      const saved = !this.post.saved_by_me;
      this.post.saved_by_me = saved;

      // optimistic count
      const cur = typeof this.post.saves === "number" ? this.post.saves : 0;
      this.post.saves = cur + (saved ? 1 : -1);

      this.renderPost();
      this.showUI(true);

      await fetch(`${API_BASE}/posts/${this.postId}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    }

    async toggleFollow() {
      if (!getToken()) return alert("Log in to follow");
      this.post.following_user = !this.post.following_user;
      this.renderPost();
      this.showUI(true);

      await fetch(`${API_BASE}/users/${this.post.user.username}/follow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    }

    share() {
      navigator.share
        ? navigator.share({ url: location.href })
        : navigator.clipboard.writeText(location.href);
      this.showUI(true);
    }

    goToComments() {
      this.close();
      setTimeout(() => {
        document
          .getElementById("commentsSection")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 200);
    }

    /* ---------------- settings ---------------- */

    setupQualities() {
      this.qualitySel.innerHTML = `<option value="auto">Auto</option>`;
      const vars = this.post.video_variants || [];
      vars.forEach((v) => {
        const o = document.createElement("option");
        o.value = v.url;
        o.textContent = v.label;
        this.qualitySel.appendChild(o);
      });
    }

    changeQuality() {
      if (this.qualitySel.value === "auto") return;
      const t = this.video.currentTime;
      this.video.src = this.qualitySel.value;
      this.video.onloadedmetadata = () => {
        this.syncAspectRatio();
        this.video.currentTime = t;
        this.video.play().catch(() => {});
      };
    }

    download() {
      window.open(
        `${API_BASE}/posts/${this.postId}/download?watermark=1`,
        "_blank"
      );
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("videoModal")) {
      window.videoDashModal = new VideoDashModal();
    }
  });
})();
