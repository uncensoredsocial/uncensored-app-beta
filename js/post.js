// post.js — single post + comments page

const POST_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class PostPage {
  constructor() {
    this.postId = this.getPostIdFromUrl();
    this.maxCommentChars = 280;

    this.post = null;
    this.comments = [];
    this.currentUser = null;
  }

  async init() {
    this.cacheDom();
    this.bindEvents();

    // current user (from auth.js)
    try {
      this.currentUser =
        typeof getCurrentUser === "function" ? getCurrentUser() : null;
    } catch {
      this.currentUser = null;
    }

    this.updateAuthUI();

    if (!this.postId) {
      this.showError("Invalid post ID.");
      return;
    }

    await this.loadPost();
    await this.loadComments();
  }

  // ========= DOM & AUTH =========

  cacheDom() {
    this.postWrapper = document.getElementById("postWrapper");
    this.postContainer = document.getElementById("postContainer");
    this.postLoading = document.getElementById("postLoading");
    this.postErrorEl = document.getElementById("postError");

    // comments
    this.commentsSection = document.getElementById("commentsSection");
    this.commentsList = document.getElementById("commentsList");
    this.commentsLoading = document.getElementById("commentsLoading");
    this.commentsEmpty = document.getElementById("commentsEmpty");

    // comment composer
    this.commentForm = document.getElementById("commentForm");
    this.commentInput = document.getElementById("commentInput");
    this.commentSubmitBtn =
      document.getElementById("commentSubmitBtn") ||
      document.getElementById("commentButton"); // just in case
    this.commentCharCounter = document.getElementById("commentCharCounter");

    this.guestMessage = document.getElementById("guestCommentMessage");

    this.backButton = document.getElementById("backButton");
  }

  bindEvents() {
    if (this.backButton) {
      this.backButton.addEventListener("click", () => {
        if (window.history.length > 1) window.history.back();
        else window.location.href = "index.html";
      });
    }

    // comment char counter
    if (this.commentInput && this.commentCharCounter) {
      this.commentInput.addEventListener("input", () => {
        const len = this.commentInput.value.length;
        this.commentCharCounter.textContent = `${len}/${this.maxCommentChars}`;
        this.commentCharCounter.classList.toggle(
          "warning",
          len > this.maxCommentChars - 40 && len <= this.maxCommentChars
        );
        this.commentCharCounter.classList.toggle(
          "error",
          len > this.maxCommentChars
        );
      });
    }

    // submit on form submit
    if (this.commentForm) {
      this.commentForm.addEventListener("submit", (e) =>
        this.handleCommentSubmit(e)
      );
    }

    // ALSO submit when the button is clicked (in case type="button")
    if (this.commentSubmitBtn) {
      this.commentSubmitBtn.addEventListener("click", (e) =>
        this.handleCommentSubmit(e)
      );
    }

    // comment delete via event delegation
    if (this.commentsList) {
      this.commentsList.addEventListener("click", (e) => {
        const delBtn = e.target.closest(".comment-delete-btn");
        if (delBtn) {
          const commentId = delBtn.dataset.commentId;
          this.handleDeleteComment(commentId);
        }
      });
    }
  }

  updateAuthUI() {
    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    const loggedIn = !!token;

    if (!loggedIn) {
      if (this.guestMessage) this.guestMessage.classList.remove("hidden");
      if (this.commentForm) this.commentForm.classList.add("hidden");
    } else {
      if (this.guestMessage) this.guestMessage.classList.add("hidden");
      if (this.commentForm) this.commentForm.classList.remove("hidden");
    }
  }

  // ========= URL / ERROR HELPERS =========

  getPostIdFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("id");
    } catch {
      return null;
    }
  }

  showError(msg) {
    if (this.postErrorEl) {
      this.postErrorEl.textContent = msg || "Something went wrong.";
      this.postErrorEl.classList.remove("hidden");
    }
  }

  hidePostLoading() {
    if (this.postLoading) this.postLoading.classList.add("hidden");
  }

  hideCommentsLoading() {
    if (this.commentsLoading) this.commentsLoading.classList.add("hidden");
  }

  // ========= LOAD POST =========

  async loadPost() {
    if (!this.postContainer) return;

    this.postContainer.innerHTML = "";
    if (this.postLoading) this.postLoading.classList.remove("hidden");

    try {
      const headers = {};
      const token = typeof getAuthToken === "function" ? getAuthToken() : null;
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${encodeURIComponent(this.postId)}`,
        { headers }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("loadPost error:", res.status, text);
        this.showError("Failed to load post.");
        this.hidePostLoading();
        return;
      }

      const data = await res.json();
      this.post = data;

      const article = this.renderPostCard(data);
      this.postContainer.appendChild(article);

      // ✅ FIXED: Initialize video players after DOM is fully rendered
      setTimeout(() => {
        this.initCustomVideoPlayers(article);
      }, 100);
    } catch (err) {
      console.error("loadPost exception:", err);
      this.showError("Failed to load post.");
    } finally {
      this.hidePostLoading();
    }
  }

  renderPostCard(post) {
    const article = document.createElement("article");
    article.className = "post post-page-card";
    article.dataset.postId = post.id;

    const author = post.user || {};
    const avatar = author.avatar_url || "default-profile.PNG";
    const username = author.username || "unknown";
    const displayName = author.display_name || username;
    const createdAt = post.created_at;
    const time = createdAt ? this.formatTime(createdAt) : "";

    const liked = !!post.liked_by_me;
    const saved = !!post.saved_by_me;

    let likeCount = typeof post.likes === "number" ? post.likes : 0;
    let commentCount =
      typeof post.comments_count === "number" ? post.comments_count : 0;

    const mediaUrl =
      post.media_url ||
      post.media ||
      post.image_url ||
      post.video_url ||
      null;
    const mediaType = post.media_type || "";
    const mediaHtml = mediaUrl ? this.renderMediaHtml(mediaUrl, mediaType) : "";

    article.innerHTML = `
      <header class="post-header">
        <div class="post-user" data-username="${this.escape(username)}">
          <img class="post-avatar" src="${avatar}"
               onerror="this.src='default-profile.PNG'">
          <div class="post-user-meta">
            <span class="post-display-name">${this.escape(displayName)}</span>
            <span class="post-username">@${this.escape(username)}</span>
          </div>
        </div>
        <span class="post-time">${this.escape(time)}</span>
      </header>

      <div class="post-body">
        <div class="post-text">${this.formatContent(post.content || "")}</div>
        ${mediaHtml}
      </div>

      <footer class="post-footer">
        <div class="post-actions">
          <button class="post-action like-btn ${liked ? "liked" : ""}" type="button">
            <i class="fa-${liked ? "solid" : "regular"} fa-heart"></i>
            <span class="like-count">${likeCount}</span>
          </button>
          <button class="post-action comment-btn" type="button">
            <i class="fa-regular fa-comment"></i>
            <span class="comment-count">${commentCount}</span>
          </button>
          <button class="post-action share-btn" type="button">
            <i class="fa-solid fa-arrow-up-from-bracket"></i>
          </button>
          <button class="post-action save-btn ${saved ? "saved" : ""}" type="button">
            <i class="fa-${saved ? "solid" : "regular"} fa-bookmark"></i>
          </button>
        </div>
      </footer>
    `;

    const likeBtn = article.querySelector(".like-btn");
    const commentBtn = article.querySelector(".comment-btn");
    const shareBtn = article.querySelector(".share-btn");
    const saveBtn = article.querySelector(".save-btn");
    const userEl = article.querySelector(".post-user");

    if (likeBtn) {
      likeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleLike(post, likeBtn);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleSave(post, saveBtn);
      });
    }

    if (commentBtn) {
      commentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.commentsSection) {
          this.commentsSection.scrollIntoView({ behavior: "smooth" });
          if (this.commentInput) this.commentInput.focus();
        }
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleSharePostClick(post);
      });
    }

    if (userEl) {
      userEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const uname = userEl.dataset.username;
        const me =
          typeof getCurrentUser === "function" ? getCurrentUser() : null;

        if (me && me.username === uname) {
          window.location.href = "profile.html";
        } else {
          window.location.href = `user.html?user=${encodeURIComponent(uname)}`;
        }
      });
    }

    return article;
  }

  // ✅ UPDATED: Enhanced video player markup with fullscreen support and actions
  renderMediaHtml(url, type) {
    const lower = (url || "").toLowerCase();
    const isVideo =
      (type && (String(type).startsWith("video/") || type === "video")) ||
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".ogg") ||
      lower.endsWith(".mov");

    if (isVideo) {
      return `
        <div class="post-media">
          <div class="us-video-player" data-state="paused" data-fullscreen="false">
            <video class="us-video"
                   playsinline
                   webkit-playsinline
                   preload="metadata"
                   autoplay
                   muted
                   loop>
              <source src="${url}" type="${type || "video/mp4"}">
              Your browser does not support video.
            </video>

            <!-- Tap area for play/pause -->
            <div class="us-video-tap-area"></div>

            <!-- Center play button -->
            <button class="us-video-center-btn" type="button" aria-label="Play/Pause">
              <i class="fa-solid fa-play"></i>
            </button>

            <!-- Top overlay (for fullscreen) -->
            <div class="us-video-top-overlay">
              <div class="us-video-user-info">
                <img class="us-video-user-avatar" src="${this.post?.user?.avatar_url || 'default-profile.PNG'}" 
                     alt="${this.post?.user?.username || 'User'}">
                <div class="us-video-user-details">
                  <span class="us-video-user-name">${this.post?.user?.display_name || this.post?.user?.username || 'User'}</span>
                  <span class="us-video-user-handle">@${this.post?.user?.username || 'user'}</span>
                </div>
              </div>
              <button class="us-video-close-fullscreen" type="button" aria-label="Exit fullscreen">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <!-- Bottom controls -->
            <div class="us-video-controls">
              <div class="us-video-controls-row">
                <button class="us-video-btn us-back" type="button" aria-label="Back 10 seconds">
                  <i class="fa-solid fa-rotate-left"></i>
                  <span class="us-video-btn-text">10</span>
                </button>

                <button class="us-video-btn us-play" type="button" aria-label="Play/Pause">
                  <i class="fa-solid fa-play"></i>
                </button>

                <button class="us-video-btn us-forward" type="button" aria-label="Forward 10 seconds">
                  <i class="fa-solid fa-rotate-right"></i>
                  <span class="us-video-btn-text">10</span>
                </button>

                <span class="us-video-time" aria-label="Time">
                  <span class="us-current">0:00</span>
                  <span class="us-sep">/</span>
                  <span class="us-duration">0:00</span>
                </span>

                <!-- NEW: Video Settings Button -->
                <button class="us-video-btn us-settings" type="button" aria-label="Video settings">
                  <i class="fa-solid fa-sliders"></i>
                </button>

                <button class="us-video-btn us-mute" type="button" aria-label="Mute/Unmute">
                  <i class="fa-solid fa-volume-high"></i>
                </button>

                <button class="us-video-btn us-fullscreen" type="button" aria-label="Fullscreen">
                  <i class="fa-solid fa-expand"></i>
                </button>
              </div>

              <input class="us-video-progress" type="range" min="0" max="1000" value="0" aria-label="Seek" />
            </div>

            <!-- Video Actions (Like/Comment/Share/Save) - Shows on tap when not fullscreen -->
            <div class="us-video-actions-overlay">
              <button class="us-video-action-btn us-video-like" type="button">
                <i class="fa-regular fa-heart"></i>
                <span class="us-video-action-count">${this.post?.likes || 0}</span>
              </button>
              <button class="us-video-action-btn us-video-comment" type="button">
                <i class="fa-regular fa-comment"></i>
                <span class="us-video-action-count">${this.post?.comments_count || 0}</span>
              </button>
              <button class="us-video-action-btn us-video-share" type="button">
                <i class="fa-solid fa-share"></i>
              </button>
              <button class="us-video-action-btn us-video-save" type="button">
                <i class="fa-regular fa-bookmark"></i>
                <span class="us-video-action-count">${this.post?.saves_count || 0}</span>
              </button>
            </div>

            <!-- Settings Dropdown (Hidden by default) -->
            <div class="us-video-settings-dropdown">
              <div class="us-video-settings-header">
                <h4>Video Settings</h4>
                <button class="us-video-settings-close" type="button">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div class="us-video-settings-options">
                <div class="us-video-setting">
                  <span>Playback Speed</span>
                  <select class="us-video-speed-select">
                    <option value="0.5">0.5x</option>
                    <option value="0.75">0.75x</option>
                    <option value="1" selected>Normal</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2x</option>
                  </select>
                </div>
                <div class="us-video-setting">
                  <span>Quality</span>
                  <select class="us-video-quality-select">
                    <option value="auto">Auto</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                  </select>
                </div>
                <div class="us-video-setting">
                  <button class="us-video-setting-btn us-video-download" type="button">
                    <i class="fa-solid fa-download"></i>
                    <span>Download Video</span>
                  </button>
                </div>
                <div class="us-video-setting">
                  <button class="us-video-setting-btn us-video-report" type="button">
                    <i class="fa-solid fa-flag"></i>
                    <span>Report Video</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="post-media">
        <a href="${url}" target="_blank" rel="noopener noreferrer">
          <img src="${url}" loading="lazy">
        </a>
      </div>
    `;
  }

  // ✅ initialize custom video players inside a DOM subtree
  initCustomVideoPlayers(rootEl = document) {
    const players = rootEl.querySelectorAll(".us-video-player");
    players.forEach((player) => this.bindCustomVideoPlayer(player));
  }

  // ✅ Enhanced custom player behavior with fullscreen support and actions
  bindCustomVideoPlayer(player) {
    const video = player.querySelector(".us-video");
    const tapArea = player.querySelector(".us-video-tap-area");
    const centerBtn = player.querySelector(".us-video-center-btn");

    const btnPlay = player.querySelector(".us-play");
    const btnBack = player.querySelector(".us-back");
    const btnForward = player.querySelector(".us-forward");
    const btnMute = player.querySelector(".us-mute");
    const btnFs = player.querySelector(".us-fullscreen");
    const btnSettings = player.querySelector(".us-settings");

    const range = player.querySelector(".us-video-progress");
    const currentEl = player.querySelector(".us-current");
    const durationEl = player.querySelector(".us-duration");

    // New elements for enhanced functionality
    const settingsBtn = player.querySelector('.us-settings');
    const settingsDropdown = player.querySelector('.us-video-settings-dropdown');
    const settingsClose = player.querySelector('.us-video-settings-close');
    const speedSelect = player.querySelector('.us-video-speed-select');
    const qualitySelect = player.querySelector('.us-video-quality-select');
    const closeFullscreenBtn = player.querySelector('.us-video-close-fullscreen');
    const topOverlay = player.querySelector('.us-video-top-overlay');
    const videoActions = player.querySelector('.us-video-actions-overlay');
    const likeBtnAction = player.querySelector('.us-video-like');
    const commentBtnAction = player.querySelector('.us-video-comment');
    const shareBtnAction = player.querySelector('.us-video-share');
    const saveBtnAction = player.querySelector('.us-video-save');

    if (!video || !range) return;

    // ===== HARD FORCE: prevent native browser controls (iOS/Safari) =====
    // (Even if something accidentally adds controls elsewhere)
    try {
      video.controls = false;
      video.removeAttribute("controls");

      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");

      // iOS autoplay requires muted
      video.muted = true;
      video.setAttribute("muted", "");
      video.setAttribute("autoplay", "");
      video.setAttribute("loop", "");
    } catch {}

    let hideTimer = null;
    let isScrubbing = false;
    let hasPlayed = false;      // autoplay success flag
    let userActivated = false;  // user tapped at least once

    const fmt = (secs) => {
      secs = Math.max(0, secs || 0);
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    };

    const setIcons = () => {
      const paused = video.paused || video.ended;
      player.dataset.state = paused ? "paused" : "playing";

      const iconClass = paused ? "fa-play" : "fa-pause";

      const cIcon = centerBtn?.querySelector("i");
      if (cIcon) cIcon.className = `fa-solid ${iconClass}`;

      const pIcon = btnPlay?.querySelector("i");
      if (pIcon) pIcon.className = `fa-solid ${iconClass}`;

      const mIcon = btnMute?.querySelector("i");
      if (mIcon) {
        mIcon.className = video.muted
          ? "fa-solid fa-volume-xmark"
          : "fa-solid fa-volume-high";
      }
    };

    const showControls = () => {
      // show both: bottom controls + (via CSS) center icon if us-ui-visible
      player.classList.add("us-controls-show", "us-ui-visible");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!video.paused && !isScrubbing) {
          player.classList.remove("us-controls-show", "us-ui-visible");
        }
      }, 1800);
    };

    const hideControlsNow = () => {
      player.classList.remove("us-controls-show", "us-ui-visible");
      clearTimeout(hideTimer);
      hideTimer = null;
    };

    const toggleControls = () => {
      const isShown = player.classList.contains("us-controls-show");
      if (isShown) hideControlsNow();
      else showControls();
    };

    const pauseAllOtherVideos = () => {
      document.querySelectorAll("video.us-video").forEach((v) => {
        if (v !== video) v.pause();
      });
    };

    const tryAutoplay = async () => {
      if (hasPlayed) return;
      try {
        pauseAllOtherVideos();
        await video.play();
        hasPlayed = true;
        // Don't keep UI on screen during autoplay; show briefly then hide
        player.dataset.state = "playing";
        setIcons();
        showControls();
        setTimeout(() => {
          if (!video.paused) player.classList.remove("us-controls-show", "us-ui-visible");
        }, 900);
      } catch {
        // Autoplay blocked -> leave paused state so center button shows
        player.dataset.state = "paused";
        setIcons();
        player.classList.add("us-ui-visible"); // show center button
      }
    };

    const togglePlay = async () => {
      try {
        userActivated = true;
        pauseAllOtherVideos();

        if (video.paused) {
          await video.play();
          hasPlayed = true;
          showControls();
        } else {
          video.pause();
          // When paused, keep UI visible
          player.classList.add("us-controls-show", "us-ui-visible");
        }
      } catch {}
    };

    const syncProgress = () => {
      const dur = video.duration || 0;
      const cur = video.currentTime || 0;

      if (!isScrubbing) {
        range.value = dur > 0 ? Math.round((cur / dur) * 1000) : 0;
      }

      if (currentEl) currentEl.textContent = fmt(cur);
      if (durationEl) durationEl.textContent = fmt(dur);

      setIcons();
    };

    // ===== Events =====

    video.addEventListener("loadedmetadata", () => {
      syncProgress();
      // Try autoplay shortly after metadata (iOS needs user gesture sometimes; this will fail gracefully)
      setTimeout(() => {
        tryAutoplay();
      }, 120);
    });

    video.addEventListener("timeupdate", () => {
      syncProgress();
    });

    video.addEventListener("play", () => {
      hasPlayed = true;
      player.dataset.state = "playing";
      setIcons();

      // If user tapped, show controls briefly then hide. If autoplay, we already hide soon.
      if (userActivated) showControls();
    });

    video.addEventListener("pause", () => {
      player.dataset.state = "paused";
      setIcons();
      // Keep UI visible when paused
      player.classList.add("us-controls-show", "us-ui-visible");
    });

    video.addEventListener("ended", () => {
      // loop usually prevents ended, but keep safe state
      player.dataset.state = "paused";
      setIcons();
      player.classList.add("us-controls-show", "us-ui-visible");
    });

    // Tap area: show/hide video actions and controls
    tapArea?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      
      // Don't toggle play/pause, just show/hide video actions when not in fullscreen
      if (player.dataset.fullscreen === "false") {
        const isVisible = videoActions.classList.contains("visible");
        if (isVisible) {
          videoActions.classList.remove("visible");
        } else {
          videoActions.classList.add("visible");
          // Auto-hide after 3 seconds if video is playing
          setTimeout(() => {
            if (!video.paused) {
              videoActions.classList.remove("visible");
            }
          }, 3000);
        }
      }
      
      // Also show controls
      showControls();
    });

    // Center play button
    centerBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      showControls();
      togglePlay();
    });

    // Play button in row
    btnPlay?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      showControls();
      togglePlay();
    });

    btnBack?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      showControls();
      video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
    });

    btnForward?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      showControls();
      video.currentTime = Math.min(video.duration || 0, (video.currentTime || 0) + 10);
    });

    btnMute?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      showControls();
      video.muted = !video.muted;
      setIcons();
    });

    // Enhanced Fullscreen button with cross-browser support
    btnFs?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      showControls();
      
      const doc = document;
      const isFs = doc.fullscreenElement || doc.webkitFullscreenElement || 
                   doc.mozFullScreenElement || doc.msFullscreenElement;
      
      if (!isFs) {
        const requestFs = player.requestFullscreen || player.webkitRequestFullscreen || 
                          player.mozRequestFullScreen || player.msRequestFullscreen;
        if (requestFs) {
          requestFs.call(player).then(() => {
            player.dataset.fullscreen = "true";
            // Show top overlay with user info in fullscreen
            if (topOverlay) topOverlay.style.display = "flex";
            // Hide video actions in fullscreen
            if (videoActions) videoActions.style.display = "none";
          }).catch(err => {
            console.error('Fullscreen error:', err);
          });
        }
      } else {
        const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || 
                       doc.mozCancelFullScreen || doc.msExitFullscreen;
        if (exitFs) {
          exitFs.call(doc).then(() => {
            player.dataset.fullscreen = "false";
            // Hide top overlay when exiting fullscreen
            if (topOverlay) topOverlay.style.display = "none";
            // Show video actions again
            if (videoActions) videoActions.style.display = "flex";
          });
        }
      }
    });

    // Close fullscreen button (in top overlay)
    closeFullscreenBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const doc = document;
      const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || 
                     doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exitFs) {
        exitFs.call(doc);
        player.dataset.fullscreen = "false";
        if (topOverlay) topOverlay.style.display = "none";
        if (videoActions) videoActions.style.display = "flex";
      }
    });

    // Video actions (Like/Comment/Share/Save)
    likeBtnAction?.addEventListener("click", (e) => {
      e.stopPropagation();
      // Trigger the post's like functionality
      const likeBtn = document.querySelector('.post .like-btn');
      if (likeBtn) likeBtn.click();
    });

    commentBtnAction?.addEventListener("click", (e) => {
      e.stopPropagation();
      // Scroll to comments section
      if (this.commentsSection) {
        this.commentsSection.scrollIntoView({ behavior: 'smooth' });
        if (this.commentInput) this.commentInput.focus();
      }
    });

    shareBtnAction?.addEventListener("click", (e) => {
      e.stopPropagation();
      // Trigger share functionality
      this.handleSharePostClick(this.post);
    });

    saveBtnAction?.addEventListener("click", (e) => {
      e.stopPropagation();
      // Trigger save functionality
      const saveBtn = document.querySelector('.post .save-btn');
      if (saveBtn) saveBtn.click();
    });

    // Settings button
    settingsBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      showControls();
      
      // Toggle settings dropdown
      const isVisible = settingsDropdown.classList.contains("visible");
      if (isVisible) {
        settingsDropdown.classList.remove("visible");
      } else {
        // Hide other dropdowns if any
        document.querySelectorAll(".us-video-settings-dropdown.visible").forEach(dropdown => {
          dropdown.classList.remove("visible");
        });
        settingsDropdown.classList.add("visible");
      }
    });

    // Close settings
    settingsClose?.addEventListener("click", (e) => {
      e.stopPropagation();
      settingsDropdown.classList.remove("visible");
    });

    // Playback speed change
    speedSelect?.addEventListener("change", (e) => {
      video.playbackRate = parseFloat(e.target.value);
    });

    // Close settings when clicking outside
    document.addEventListener("click", (e) => {
      if (settingsDropdown && !player.contains(e.target)) {
        settingsDropdown.classList.remove("visible");
      }
    });

    // Fullscreen change listener
    document.addEventListener("fullscreenchange", () => {
      const isFullscreen = !!(document.fullscreenElement || 
                             document.webkitFullscreenElement || 
                             document.mozFullScreenElement || 
                             document.msFullscreenElement);
      
      player.dataset.fullscreen = isFullscreen ? "true" : "false";
      
      if (isFullscreen) {
        if (topOverlay) topOverlay.style.display = "flex";
        if (videoActions) videoActions.style.display = "none";
      } else {
        if (topOverlay) topOverlay.style.display = "none";
        if (videoActions) videoActions.style.display = "flex";
      }
    });

    range.addEventListener("input", () => {
      isScrubbing = true;
      userActivated = true;
      const dur = video.duration || 0;
      const pct = (parseInt(range.value || "0", 10) / 1000) || 0;
      const target = dur * pct;
      if (currentEl) currentEl.textContent = fmt(target);
      // keep UI visible while scrubbing
      player.classList.add("us-controls-show", "us-ui-visible");
    });

    range.addEventListener("change", () => {
      userActivated = true;
      const dur = video.duration || 0;
      const pct = (parseInt(range.value || "0", 10) / 1000) || 0;
      video.currentTime = dur * pct;
      isScrubbing = false;
      showControls();
    });

    // Keep icons/progress correct at start
    player.classList.add("us-controls-show");
    setIcons();
    syncProgress();

    // IMPORTANT: do not show UI forever on load; only show if paused
    // (autoplay will hide soon; paused will stay visible)
    setTimeout(() => {
      if (!video.paused) {
        player.classList.remove("us-controls-show", "us-ui-visible");
      } else {
        player.classList.add("us-ui-visible");
      }
    }, 700);
  }

  // ========= LOAD COMMENTS =========

  async loadComments() {
    if (!this.commentsList) return;

    this.commentsList.innerHTML = "";
    if (this.commentsLoading) this.commentsLoading.classList.remove("hidden");

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${encodeURIComponent(this.postId)}/comments`
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("loadComments error:", res.status, txt);
        this.hideCommentsLoading();
        return;
      }

      const data = await res.json();
      this.comments = data || [];
      this.renderComments();
    } catch (err) {
      console.error("loadComments exception:", err);
    } finally {
      this.hideCommentsLoading();
    }
  }

  renderComments() {
    if (!this.commentsList) return;

    if (!this.comments || !this.comments.length) {
      this.commentsList.innerHTML = "";
      if (this.commentsEmpty) this.commentsEmpty.classList.remove("hidden");
      return;
    }

    if (this.commentsEmpty) this.commentsEmpty.classList.add("hidden");

    this.commentsList.innerHTML = this.comments
      .map((c) => {
        const user = c.user || {};
        const avatar = user.avatar_url || "default-profile.PNG";
        const username = user.username || "unknown";
        const displayName = user.display_name || username;
        const time = c.created_at ? this.formatTime(c.created_at) : "";

        const canDelete =
          this.currentUser && user.id && user.id === this.currentUser.id;

        return `
          <article class="comment" data-comment-id="${c.id}">
            <img class="comment-avatar"
                 src="${avatar}"
                 onerror="this.src='default-profile.PNG'">
            <div class="comment-body">
              <div class="comment-header">
                <span class="comment-display-name">${this.escape(
                  displayName
                )}</span>
                <span class="comment-username">@${this.escape(
                  username
                )}</span>
                <span class="comment-time">${this.escape(time)}</span>
              </div>
              <div class="comment-text">${this.formatContent(
                c.content || ""
              )}</div>
              ${
                canDelete
                  ? `<div class="comment-actions-row">
                       <button class="comment-delete-btn" 
                               type="button"
                               data-comment-id="${c.id}">
                         Delete
                       </button>
                     </div>`
                  : ""
              }
            </div>
          </article>
        `;
      })
      .join("");

    // avatar / name -> profile
    this.commentsList
      .querySelectorAll(".comment-avatar, .comment-display-name, .comment-username")
      .forEach((el) => {
        el.addEventListener("click", (e) => {
          const article = e.target.closest(".comment");
          if (!article) return;
          const commentId = article.dataset.commentId;
          const comment = this.comments.find((c) => c.id === commentId);
          if (!comment || !comment.user) return;
          const uname = comment.user.username;
          if (!uname) return;

          const me =
            typeof getCurrentUser === "function" ? getCurrentUser() : null;
          if (me && me.username === uname) {
            window.location.href = "profile.html";
          } else {
            window.location.href = `user.html?user=${encodeURIComponent(
              uname
            )}`;
          }
        });
      });
  }

  // ========= COMMENT SUBMIT =========

  async handleCommentSubmit(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    if (!this.commentInput || !this.commentSubmitBtn) return;

    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    if (!token) {
      alert("Please log in to comment.");
      return;
    }

    const content = this.commentInput.value.trim();
    if (!content) return;
    if (content.length > this.maxCommentChars) {
      alert(`Comment must be ${this.maxCommentChars} characters or less.`);
      return;
    }

    this.commentSubmitBtn.disabled = true;
    this.commentSubmitBtn.textContent = "Posting...";

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${encodeURIComponent(this.postId)}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to post comment");
      }

      // add new comment and re-render
      this.comments.push(data);
      this.renderComments();

      // clear input
      this.commentInput.value = "";
      if (this.commentCharCounter)
        this.commentCharCounter.textContent = `0/${this.maxCommentChars}`;

      // bump comment count on header card
      const card = this.postContainer?.querySelector(".post");
      const countEl = card?.querySelector(".comment-count");
      if (countEl) {
        let current = parseInt(countEl.textContent || "0", 10);
        if (Number.isNaN(current)) current = 0;
        countEl.textContent = String(current + 1);
      }
    } catch (err) {
      console.error("handleCommentSubmit error:", err);
      alert(err.message || "Could not post comment.");
    } finally {
      this.commentSubmitBtn.disabled = false;
      this.commentSubmitBtn.textContent = "Comment";
    }
  }

  // ========= COMMENT DELETE =========

  async handleDeleteComment(commentId) {
    if (!commentId) return;

    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    if (!token) {
      alert("Please log in.");
      return;
    }

    const ok = confirm("Delete this comment?");
    if (!ok) return;

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/comments/${encodeURIComponent(commentId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete comment");
      }

      // remove from array
      this.comments = this.comments.filter((c) => c.id !== commentId);
      this.renderComments();

      // update count on header card
      const card = this.postContainer?.querySelector(".post");
      const countEl = card?.querySelector(".comment-count");
      if (countEl) {
        let current = parseInt(countEl.textContent || "0", 10);
        if (Number.isNaN(current)) current = 0;
        if (current > 0) current -= 1;
        countEl.textContent = String(current);
      }
    } catch (err) {
      console.error("handleDeleteComment error:", err);
      alert(err.message || "Could not delete comment.");
    }
  }

  // ========= LIKE / SAVE / SHARE =========

  async handleLike(post, btn) {
    if (!post || !post.id || !btn) return;

    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    if (!token) {
      alert("Please log in to like posts.");
      return;
    }

    const countEl = btn.querySelector(".like-count");
    const icon = btn.querySelector("i");

    let currentCount = parseInt(countEl?.textContent || "0", 10);
    if (Number.isNaN(currentCount)) currentCount = 0;

    const wasLiked =
      btn.classList.contains("liked") || post.liked_by_me === true;

    // optimistic update
    let newCount = currentCount + (wasLiked ? -1 : 1);
    if (newCount < 0) newCount = 0;

    btn.classList.toggle("liked", !wasLiked);
    if (icon) {
      icon.classList.remove(wasLiked ? "fa-solid" : "fa-regular");
      icon.classList.add(wasLiked ? "fa-regular" : "fa-solid");
    }
    if (countEl) countEl.textContent = String(newCount);

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/like`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update like");

      const serverLikes = typeof data.likes === "number" ? data.likes : null;
      const nowLiked = data.liked === true ? true : !wasLiked;

      if (serverLikes !== null && countEl) {
        countEl.textContent = String(serverLikes);
      }

      this.post = {
        ...this.post,
        liked_by_me: nowLiked,
        likes: serverLikes !== null ? serverLikes : newCount,
      };
    } catch (err) {
      console.error("handleLike error:", err);
      // revert UI silently (no popup)
      btn.classList.toggle("liked", wasLiked);
      if (icon) {
        icon.classList.remove(wasLiked ? "fa-regular" : "fa-solid");
        icon.classList.add(wasLiked ? "fa-solid" : "fa-regular");
      }
      if (countEl) countEl.textContent = String(currentCount);
    }
  }

  async handleSave(post, btn) {
    if (!post || !post.id || !btn) return;

    const token = typeof getAuthToken === "function" ? getAuthToken() : null;
    if (!token) {
      alert("Please log in to save posts.");
      return;
    }

    const icon = btn.querySelector("i");
    const wasSaved = btn.classList.contains("saved") || post.saved_by_me === true;

    // optimistic
    btn.classList.toggle("saved", !wasSaved);
    if (icon) {
      icon.classList.remove(wasSaved ? "fa-solid" : "fa-regular");
      icon.classList.add(wasSaved ? "fa-regular" : "fa-solid");
    }

    try {
      const res = await fetch(
        `${POST_API_BASE_URL}/posts/${encodeURIComponent(post.id)}/save`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update save");

      const nowSaved = data.saved === true ? true : !wasSaved;
      this.post = {
        ...this.post,
        saved_by_me: nowSaved,
      };
    } catch (err) {
      console.error("handleSave error:", err);
      // revert UI silently
      btn.classList.toggle("saved", wasSaved);
      if (icon) {
        icon.classList.remove(wasSaved ? "fa-regular" : "fa-solid");
        icon.classList.add(wasSaved ? "fa-solid" : "fa-regular");
      }
    }
  }

  handleSharePostClick(post) {
    if (!post || !post.id) return;

    const url = `${window.location.origin}/post.html?id=${encodeURIComponent(
      post.id
    )}`;

    if (navigator.share) {
      navigator
        .share({
          title: "Check out this post",
          url,
        })
        .catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => alert("Post link copied to clipboard"))
        .catch(() => alert("Post link: " + url));
    } else {
      alert("Post link: " + url);
    }
  }

  // ========= HELPERS =========

  formatContent(text) {
    const safe = this.escape(text || "");
    return safe
      .replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
      .replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  }

  formatTime(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return "";
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    if (diff < 604800) return Math.floor(diff / 86400) + "d";
    return d.toLocaleDateString();
  }

  escape(str = "") {
    return String(str).replace(/[&<>"']/g, (m) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[m];
    });
  }
}

// ========= INIT =========

document.addEventListener("DOMContentLoaded", () => {
  const page = new PostPage();
  page.init();
  window.postPage = page;
});
