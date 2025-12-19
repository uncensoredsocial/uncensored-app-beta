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

      // Try to find a top bar wrapper if it exists
      this.topBar =
        document.getElementById("vmTopBar") ||
        this.modal?.querySelector(".vm-top") ||
        this.modal?.querySelector(".vm-topbar") ||
        this.modal?.querySelector(".us-vm-topbar") ||
        null;

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

      // ✅ NEW (from your updated post.html)
      this.settingsBackdrop = document.getElementById("vmSettingsBackdrop");
      this.settingsBackBtn = document.getElementById("vmSettingsBackBtn");

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

      // IMPORTANT: prevent iOS/Safari “center play/pause overlay” by NOT letting the <video> receive taps
      this.video.style.pointerEvents = "none";

      // Hide center button completely (user wants ONLY bottom-left play/pause)
      if (this.centerBtn) this.centerBtn.style.display = "none";

      // Keep top bar always visible + add divider line below it
      if (this.topBar) {
        this.topBar.style.opacity = "1";
        this.topBar.style.visibility = "visible";
        this.topBar.style.pointerEvents = "auto";
        this.topBar.style.background = "#000";
        this.topBar.style.borderBottom = "1px solid rgba(255,255,255,0.12)";
      } else {
        // Fallback: add divider under header elements if no wrapper exists
        const headerRow =
          this.closeBtn?.closest(".vm-top") ||
          this.closeBtn?.parentElement ||
          null;
        if (headerRow) {
          headerRow.style.background = "#000";
          headerRow.style.borderBottom = "1px solid rgba(255,255,255,0.12)";
        }
      }

      this.bind();
      this.bindFullscreenButtons();
    }

    /* ---------------- bind ---------------- */

    bind() {
      this.closeBtn.onclick = () => this.close();

      // Tap behavior:
      // 1) If UI is hidden -> just show UI
      // 2) If UI is visible -> toggle play
      const handleTap = () => {
        this.showUI(true); // always bring it back
        const isHidden = String(this.bottomBar?.style?.opacity || "1") === "0";
        if (isHidden) return;
        this.togglePlay();
      };

      // Use tap overlay only
      if (this.tap) {
        this.tap.style.pointerEvents = "auto";
        this.tap.onclick = handleTap;
        this.tap.ontouchend = handleTap;
      }

      // Keep bottom-left play button working
      this.playBtn.onclick = () => {
        this.togglePlay();
        this.showUI(true);
      };

      this.muteBtn.onclick = () => {
        this.video.muted = !this.video.muted;
        this.updateMute();
        this.showUI(true);
      };

      // ✅ CHANGED: settings open ONLY from gear; close ONLY from back arrow (and optional backdrop tap)
      this.settingsBtn.onclick = () => {
        this.openSettings();
        this.showUI(true);
      };

      // ✅ Back arrow closes settings (this is what you wanted)
      if (this.settingsBackBtn) {
        this.settingsBackBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeSettings();
          this.showUI(true);
        };
      }

      // ✅ Optional: tapping outside closes settings (nice UX). Remove if you don't want this.
      if (this.settingsBackdrop) {
        this.settingsBackdrop.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeSettings();
          this.showUI(true);
        };
      }

      this.likeBtn.onclick = () => this.toggleLike();
      this.commentBtn.onclick = () => this.goToComments();
      this.shareBtn.onclick = () => this.share();
      this.saveBtn.onclick = () => this.toggleSave();

      this.followBtn.onclick = () => this.toggleFollow();

      this.speedSel.onchange = () => {
        this.video.playbackRate = clamp(+this.speedSel.value, 0.5, 2);
      };

      this.qualitySel.onchange = () => this.changeQuality();

      // ✅ CHANGED: download to device via fetch->blob->a[download]
      this.downloadBtn.onclick = () => this.download();

      this.progress.oninput = () => {
        if (!this.video.duration) return;
        this.video.currentTime = (this.progress.value / 100) * this.video.duration;
        this.showUI(true);
      };

      this.video.onplay = () => this.onPlay();
      this.video.onpause = () => this.onPause();
      this.video.ontimeupdate = () => this.updateTime();
      this.video.onended = () => this.onPause();

      // Double tap skip
      let lt = 0, rt = 0;
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

      document.addEventListener("keydown", (e) => {
        if (!this.isOpen) return;
        if (e.key === "Escape") this.close();
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

      this.video.src = src;
      this.video.currentTime = videoEl.currentTime || 0;
      this.video.muted = true;

      this.modal.classList.add("active");
      document.body.style.overflow = "hidden";
      this.isOpen = true;

      // ensure settings is closed on open
      this.closeSettings(true);

      await this.loadPost();
      this.setupQualities();

      // Always show UI at open
      this.showUI(true);

      this.video.play().catch(() => {});
    }

    close() {
      // Sync state back to the post UI before closing
      this.syncBackToPostUI();

      this.closeSettings(true);

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
      this.showUI();
    }

    onPause() {
      this.container.dataset.state = "paused";
      this.updatePlayIcon(true);
      this.showUI(true);
    }

    togglePlay() {
      this.video.paused ? this.video.play() : this.video.pause();
    }

    // ONLY bottom-left icon updates (center removed)
    updatePlayIcon(paused) {
      const cls = paused ? "play" : "pause";
      this.playBtn.querySelector("i").className = `fa-solid fa-${cls}`;
    }

    updateMute() {
      this.muteBtn.querySelector("i").className =
        this.video.muted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
    }

    updateTime() {
      if (!this.video.duration) return;
      this.timeEl.textContent = `${fmt(this.video.currentTime)} / ${fmt(this.video.duration)}`;
      this.progress.value = (this.video.currentTime / this.video.duration) * 100;
    }

    // Keep TOP always visible; only auto-hide BOTTOM
    showUI(force = false) {
      clearTimeout(this.hideTimer);

      // top always on
      if (this.topBar) {
        this.topBar.style.opacity = "1";
        this.topBar.style.visibility = "visible";
        this.topBar.style.pointerEvents = "auto";
      }

      // bottom on
      if (this.bottomBar) {
        this.bottomBar.style.opacity = "1";
        this.bottomBar.style.pointerEvents = "auto";
      }

      // DO NOT auto-hide bottom while settings is open
      const settingsOpen = this.settings?.classList?.contains("visible");

      if (!force && !settingsOpen && !this.video.paused) {
        this.hideTimer = setTimeout(() => {
          // hide bottom only
          if (this.bottomBar) {
            this.bottomBar.style.opacity = "0";
            this.bottomBar.style.pointerEvents = "none";
          }
          // DO NOT close settings here anymore (back button handles it)
        }, 2200);
      }
    }

    skip(sec) {
      this.video.currentTime = clamp(
        this.video.currentTime + sec,
        0,
        this.video.duration || 9999
      );
      this.showUI();
    }

    /* ---------------- settings helpers ---------------- */

    openSettings() {
      if (!this.settings) return;
      this.settings.classList.add("visible");
      if (this.settingsBackdrop) {
        this.settingsBackdrop.style.display = "block";
        this.settingsBackdrop.style.pointerEvents = "auto";
      }
    }

    closeSettings(silent = false) {
      if (this.settings) this.settings.classList.remove("visible");
      if (this.settingsBackdrop) {
        this.settingsBackdrop.style.display = "none";
        this.settingsBackdrop.style.pointerEvents = "none";
      }
      if (!silent) this.showUI(true);
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
        this.followBtn.textContent = this.post.following_user ? "Following" : "Follow";
        this.followBtn.classList.toggle("following", !!this.post.following_user);
      }

      const likes = this.post.likes ?? this.post.likes_count ?? 0;
      const comments = this.post.comments_count ?? this.post.comment_count ?? 0;
      const saves = this.post.saves ?? this.post.saves_count ?? 0;

      this.likeCount.textContent = likes;
      this.commentCount.textContent = comments;
      this.saveCount.textContent = saves;

      // Match feed.js behavior (fill icons by switching regular/solid)
      const liked = !!this.post.liked_by_me;
      const saved = !!this.post.saved_by_me;

      this.likeBtn.classList.toggle("liked", liked);
      this.saveBtn.classList.toggle("saved", saved);

      const likeIcon = this.likeBtn.querySelector("i");
      const saveIcon = this.saveBtn.querySelector("i");
      if (likeIcon) likeIcon.className = `fa-${liked ? "solid" : "regular"} fa-heart`;
      if (saveIcon) saveIcon.className = `fa-${saved ? "solid" : "regular"} fa-bookmark`;
    }

    /* ---------------- actions ---------------- */

    async toggleLike() {
      if (!getToken()) return alert("Log in to like");

      const liked = !this.post.liked_by_me;

      const current = Number(this.post.likes ?? this.post.likes_count ?? 0) || 0;
      const next = Math.max(current + (liked ? 1 : -1), 0);

      this.post.liked_by_me = liked;
      this.post.likes = next;

      this.renderPost();

      await fetch(`${API_BASE}/posts/${this.postId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      }).catch(() => {});
    }

    async toggleSave() {
      if (!getToken()) return alert("Log in to save");

      const saved = !this.post.saved_by_me;

      const current = Number(this.post.saves ?? this.post.saves_count ?? 0) || 0;
      const next = Math.max(current + (saved ? 1 : -1), 0);

      this.post.saved_by_me = saved;
      this.post.saves = next;

      this.renderPost();

      await fetch(`${API_BASE}/posts/${this.postId}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      }).catch(() => {});
    }

    async toggleFollow() {
      if (!getToken()) return alert("Log in to follow");
      this.post.following_user = !this.post.following_user;
      this.renderPost();
      await fetch(`${API_BASE}/users/${this.post.user.username}/follow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      }).catch(() => {});
    }

    share() {
      navigator.share ? navigator.share({ url: location.href }) : navigator.clipboard.writeText(location.href);
    }

    goToComments() {
      this.close();
      setTimeout(() => {
        document.getElementById("commentsSection")?.scrollIntoView({ behavior: "smooth" });
      }, 200);
    }

    /* ---------------- settings ---------------- */

    setupQualities() {
      this.qualitySel.innerHTML = `<option value="auto">Auto</option>`;
      const vars = this.post?.video_variants || [];
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
        this.video.currentTime = t;
        this.video.play().catch(() => {});
      };
    }

    /* ---------------- download (device) ---------------- */

    async download() {
      try {
        // (optional) require login for downloads:
        // if (!getToken()) return alert("Log in to download");

        // Ask backend for a download response that includes proper headers:
        // Content-Type: video/mp4
        // Content-Disposition: attachment; filename="....mp4"
        const url = `${API_BASE}/posts/${this.postId}/download?watermark=1`;

        const headers = {};
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error("Download failed");

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        // filename fallback
        const cd = res.headers.get("content-disposition") || "";
        const match = cd.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
        const safeName = (match?.[1] || `uncensored-video-${this.postId}.mp4`)
          .replace(/['"]/g, "")
          .trim();

        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = safeName;
        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch (e) {
        // Fallback (some iOS Safari cases)
        window.open(`${API_BASE}/posts/${this.postId}/download?watermark=1`, "_blank");
      }
    }

    /* ---------------- sync back to post UI ---------------- */

    syncBackToPostUI() {
      if (!this.postId || !this.post) return;

      const postEl =
        document.querySelector(`[data-post-id="${this.postId}"]`) ||
        this.origVideo?.closest(`[data-post-id]`) ||
        null;

      const liked = !!this.post.liked_by_me;
      const saved = !!this.post.saved_by_me;
      const likes = Number(this.post.likes ?? this.post.likes_count ?? 0) || 0;

      if (postEl) {
        const likeBtn = postEl.querySelector(".like-btn");
        if (likeBtn) {
          likeBtn.classList.toggle("liked", liked);
          const icon = likeBtn.querySelector("i");
          if (icon) {
            if (liked) {
              icon.classList.remove("fa-regular");
              icon.classList.add("fa-solid");
            } else {
              icon.classList.remove("fa-solid");
              icon.classList.add("fa-regular");
            }
          }
          const countEl = likeBtn.querySelector(".like-count");
          if (countEl) countEl.textContent = String(likes);
        }

        const saveBtn = postEl.querySelector(".save-btn");
        if (saveBtn) {
          saveBtn.classList.toggle("saved", saved);
          const icon = saveBtn.querySelector("i");
          if (icon) {
            if (saved) {
              icon.classList.remove("fa-regular");
              icon.classList.add("fa-solid");
            } else {
              icon.classList.remove("fa-solid");
              icon.classList.add("fa-regular");
            }
          }
        }
      }

      window.dispatchEvent(
        new CustomEvent("post:updated", {
          detail: {
            postId: this.postId,
            liked_by_me: liked,
            saved_by_me: saved,
            likes: likes,
            saves: Number(this.post.saves ?? this.post.saves_count ?? 0) || 0,
          },
        })
      );
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("videoModal")) {
      window.videoDashModal = new VideoDashModal();
    }
  });
})();
