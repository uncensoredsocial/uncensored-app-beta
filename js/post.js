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
    this.currentOverlayVideo = null;
    this.isOverlayOpen = false;

    // prevent duplicate overlay bindings
    this._overlayBound = false;
  }

  async init() {
    console.log("PostPage: Initializing...");
    this.cacheDom();
    this.bindEvents();

    // current user (from auth.js)
    try {
      this.currentUser =
        typeof getCurrentUser === "function" ? getCurrentUser() : null;
      console.log(
        "PostPage: Current user:",
        this.currentUser ? "Logged in" : "Not logged in"
      );
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
    console.log("PostPage: Initialization complete");
  }

  // ========= DOM & AUTH =========

  cacheDom() {
    console.log("PostPage: Caching DOM elements");
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
      document.getElementById("commentButton");
    this.commentCharCounter = document.getElementById("commentCharCounter");

    this.guestMessage = document.getElementById("guestCommentMessage");
    this.backButton = document.getElementById("backButton");

    // Overlay container
    console.log("PostPage: Creating video overlay");
    this.videoOverlayContainer = this.createVideoOverlay();
  }

  createVideoOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "video-fullscreen-overlay hidden";
    overlay.innerHTML = `
      <div class="overlay-content">
        <div class="overlay-top-bar">
          <div class="overlay-user-info">
            <img class="overlay-user-avatar" src="" alt="">
            <div class="overlay-user-details">
              <span class="overlay-user-name"></span>
              <span class="overlay-user-handle"></span>
            </div>
            <button class="overlay-follow-btn hidden" type="button" aria-label="Follow"></button>
          </div>
          <button class="overlay-close-btn" type="button" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="overlay-video-container">
          <video class="overlay-video" playsinline webkit-playsinline preload="metadata" muted loop></video>

          <!-- ✅ tap layer (so taps do NOT hit the video element) -->
          <button class="overlay-tap-layer" type="button" aria-label="Toggle play/pause"></button>

          <!-- Double tap areas -->
          <div class="overlay-double-tap-left"></div>
          <div class="overlay-double-tap-right"></div>
        </div>

        <!-- Video controls -->
        <div class="overlay-main-controls">
          <div class="overlay-controls-row">
            <button class="overlay-control-btn overlay-play-btn" type="button" aria-label="Play/Pause">
              <i class="fa-solid fa-play"></i>
            </button>
            <button class="overlay-control-btn overlay-mute-btn" type="button" aria-label="Mute/Unmute">
              <i class="fa-solid fa-volume-high"></i>
            </button>
            <div class="overlay-time-display">
              <span class="overlay-current-time">0:00</span>
              <span class="overlay-separator">/</span>
              <span class="overlay-duration">0:00</span>
            </div>
            <input class="overlay-progress" type="range" min="0" max="1000" value="0" aria-label="Seek">
            <button class="overlay-control-btn overlay-exit-btn" type="button" aria-label="Exit overlay">
              <i class="fa-solid fa-compress"></i>
            </button>
          </div>
        </div>

        <!-- Separator line -->
        <div class="overlay-separator-line"></div>

        <!-- Engagement buttons -->
        <div class="overlay-engagement-container">
          <div class="overlay-engagement-row">
            <button class="overlay-engagement-btn overlay-like-btn" type="button">
              <i class="fa-regular fa-heart"></i>
              <span class="overlay-count">0</span>
            </button>
            <button class="overlay-engagement-btn overlay-comment-btn" type="button">
              <i class="fa-regular fa-comment"></i>
              <span class="overlay-count">0</span>
            </button>
            <button class="overlay-engagement-btn overlay-share-btn" type="button">
              <i class="fa-solid fa-share"></i>
            </button>
            <button class="overlay-engagement-btn overlay-save-btn" type="button">
              <i class="fa-regular fa-bookmark"></i>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    console.log("PostPage: Video overlay created");
    return overlay;
  }

  bindEvents() {
    console.log("PostPage: Binding events");

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
        this.commentCharCounter.classList.toggle("error", len > this.maxCommentChars);
      });
    }

    // submit on form submit
    if (this.commentForm) {
      this.commentForm.addEventListener("submit", (e) => this.handleCommentSubmit(e));
    }

    // ALSO submit when the button is clicked
    if (this.commentSubmitBtn) {
      this.commentSubmitBtn.addEventListener("click", (e) => this.handleCommentSubmit(e));
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
    console.log("PostPage: Loading post with ID:", this.postId);

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
      console.log("PostPage: Post loaded successfully", data);

      const article = this.renderPostCard(data);
      this.postContainer.appendChild(article);

      // Initialize video players after DOM is fully rendered
      setTimeout(() => {
        console.log("PostPage: Initializing video players");
        this.initCustomVideoPlayers(article);
      }, 50);
    } catch (err) {
      console.error("loadPost exception:", err);
      this.showError("Failed to load post.");
    } finally {
      this.hidePostLoading();
    }
  }

  renderPostCard(post) {
    console.log("PostPage: Rendering post card");
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
    let commentCount = typeof post.comments_count === "number" ? post.comments_count : 0;
    let saveCount = typeof post.saves_count === "number" ? post.saves_count : 0;

    const mediaUrl = post.media_url || post.media || post.image_url || post.video_url || null;
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
          <button class="post-action like-btn ${liked ? "liked" : ""}" type="button" aria-label="Like">
            <i class="fa-${liked ? "solid" : "regular"} fa-heart"></i>
            <span class="like-count">${likeCount}</span>
          </button>
          <button class="post-action comment-btn" type="button" aria-label="Comment">
            <i class="fa-regular fa-comment"></i>
            <span class="comment-count">${commentCount}</span>
          </button>
          <button class="post-action share-btn" type="button" aria-label="Share">
            <i class="fa-solid fa-arrow-up-from-bracket"></i>
          </button>
          <button class="post-action save-btn ${saved ? "saved" : ""}" type="button" aria-label="Save">
            <i class="fa-${saved ? "solid" : "regular"} fa-bookmark"></i>
            <span class="save-count">${saveCount}</span>
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
        this.scrollToCommentsSection();
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
        const me = typeof getCurrentUser === "function" ? getCurrentUser() : null;

        if (me && me.username === uname) {
          window.location.href = "profile.html";
        } else {
          window.location.href = `user.html?user=${encodeURIComponent(uname)}`;
        }
      });
    }

    return article;
  }

  renderMediaHtml(url, type) {
    console.log("PostPage: Rendering media HTML for:", url, type);
    const lower = (url || "").toLowerCase();
    const isVideo =
      (type && (String(type).startsWith("video/") || type === "video")) ||
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".ogg") ||
      lower.endsWith(".mov");

    if (isVideo) {
      // ✅ IMPORTANT:
      // - NO video click handlers
      // - NO center play button
      // - Use .us-video-tap layer to receive taps (prevents iOS middle overlay)
      return `
        <div class="post-media">
          <div class="us-video-player"
               tabindex="0"
               aria-label="Video player. Press Space or Enter to play or pause."
               data-state="paused"
               data-fullscreen="false">

            <video class="us-video"
                   playsinline
                   webkit-playsinline
                   preload="metadata"
                   muted
                   loop>
              <source src="${url}" type="${type || "video/mp4"}">
              Your browser does not support video.
            </video>

            <!-- ✅ tap layer (captures taps, not the video) -->
            <button class="us-video-tap" type="button" aria-label="Play/Pause"></button>

            <!-- Double tap areas for 10-second skip -->
            <div class="us-video-double-tap-left"></div>
            <div class="us-video-double-tap-right"></div>

            <!-- Bottom control bar -->
            <div class="us-video-controls">
              <div class="us-video-controls-row">
                <button class="us-video-btn us-play" type="button" aria-label="Play/Pause">
                  <i class="fa-solid fa-play"></i>
                </button>

                <span class="us-video-time" aria-label="Time">
                  <span class="us-current">0:00</span>
                  <span class="us-sep">/</span>
                  <span class="us-duration">0:00</span>
                </span>

                <button class="us-video-btn us-mute" type="button" aria-label="Mute/Unmute">
                  <i class="fa-solid fa-volume-high"></i>
                </button>

                <button class="us-video-btn us-fullscreen" type="button" aria-label="Open fullscreen overlay">
                  <i class="fa-solid fa-expand"></i>
                </button>
              </div>

              <input class="us-video-progress" type="range" min="0" max="1000" value="0" aria-label="Seek" />
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="post-media">
        <a href="${url}" target="_blank" rel="noopener noreferrer">
          <img src="${url}" loading="lazy" style="width: 100%; height: auto; border-radius: 14px;">
        </a>
      </div>
    `;
  }

  // Initialize custom video players
  initCustomVideoPlayers(rootEl = document) {
    console.log("PostPage: initCustomVideoPlayers called");
    const players = rootEl.querySelectorAll(".us-video-player");
    console.log(`Found ${players.length} video players to initialize`);

    players.forEach((player, index) => {
      console.log(`Initializing video player ${index + 1}`);
      this.bindCustomVideoPlayer(player);
    });
  }

  // Bind custom video player - UPDATED: NO center overlay, NO video clicks
  bindCustomVideoPlayer(player) {
    console.log("PostPage: bindCustomVideoPlayer called");

    const video = player.querySelector(".us-video");
    const tapLayer = player.querySelector(".us-video-tap");
    const btnPlay = player.querySelector(".us-play");
    const btnMute = player.querySelector(".us-mute");
    const btnFs = player.querySelector(".us-fullscreen");
    const range = player.querySelector(".us-video-progress");
    const currentEl = player.querySelector(".us-current");
    const durationEl = player.querySelector(".us-duration");

    if (!video) {
      console.error("ERROR: No video element found in player!");
      return;
    }

    // Prevent native controls
    video.controls = false;
    video.removeAttribute("controls");
    video.disablePictureInPicture = true;
    video.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback");

    let hideTimer = null;
    let isScrubbing = false;
    let hasPlayed = false;

    const formatTime = (seconds) => {
      if (isNaN(seconds)) return "0:00";
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const updateUI = () => {
      const isPaused = video.paused;
      player.dataset.state = isPaused ? "paused" : "playing";

      if (btnPlay) {
        const playIcon = btnPlay.querySelector("i");
        if (playIcon) playIcon.className = isPaused ? "fa-solid fa-play" : "fa-solid fa-pause";
      }

      if (btnMute) {
        const muteIcon = btnMute.querySelector("i");
        if (muteIcon) {
          muteIcon.className = video.muted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
        }
      }

      if (currentEl) currentEl.textContent = formatTime(video.currentTime);
      if (durationEl) durationEl.textContent = formatTime(video.duration);

      if (range && !isScrubbing && video.duration && !isNaN(video.duration) && video.duration > 0) {
        range.value = String((video.currentTime / video.duration) * 1000);
      }
    };

    const showControls = () => {
      player.classList.add("us-controls-show");
      clearTimeout(hideTimer);

      if (!video.paused) {
        hideTimer = setTimeout(() => {
          if (!isScrubbing) player.classList.remove("us-controls-show");
        }, 2000);
      }
    };

    const togglePlay = async () => {
      try {
        // Pause all other inline videos
        document.querySelectorAll("video.us-video").forEach((v) => {
          if (v !== video && !v.paused) v.pause();
        });

        if (video.paused) {
          const playPromise = video.play();
          if (playPromise !== undefined) await playPromise;
          hasPlayed = true;
        } else {
          video.pause();
        }

        updateUI();
        showControls();
      } catch (error) {
        console.error("Error toggling play:", error);
        showControls();
      }
    };

    const toggleMute = () => {
      video.muted = !video.muted;
      updateUI();
      showControls();
    };

    const skipForward10 = () => {
      if (video.duration && !isNaN(video.duration)) {
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
        showControls();
      }
    };

    const skipBackward10 = () => {
      video.currentTime = Math.max(0, video.currentTime - 10);
      showControls();
    };

    const openFullscreenOverlay = () => {
      console.log("=== OPENING FULLSCREEN OVERLAY ===");
      if (!this.post) return;

      this.isOverlayOpen = true;

      const overlay = this.videoOverlayContainer;
      const overlayVideo = overlay.querySelector(".overlay-video");
      const overlayTap = overlay.querySelector(".overlay-tap-layer");
      const overlayAvatar = overlay.querySelector(".overlay-user-avatar");
      const overlayName = overlay.querySelector(".overlay-user-name");
      const overlayHandle = overlay.querySelector(".overlay-user-handle");
      const overlayFollowBtn = overlay.querySelector(".overlay-follow-btn");

      this.currentOverlayVideo = video;

      const author = this.post.user || {};
      overlayAvatar.src = author.avatar_url || "default-profile.PNG";
      overlayAvatar.onerror = function () {
        this.src = "default-profile.PNG";
      };
      overlayName.textContent = author.display_name || author.username || "User";
      overlayHandle.textContent = `@${author.username || "user"}`;

      const isCurrentUser = this.currentUser && this.currentUser.username === author.username;
      const isFollowing = author.followed_by_me || false;

      if (!isCurrentUser && this.currentUser) {
        overlayFollowBtn.classList.remove("hidden");
        overlayFollowBtn.textContent = isFollowing ? "Following" : "Follow";
        overlayFollowBtn.classList.toggle("following", isFollowing);
        overlayFollowBtn.setAttribute("aria-pressed", isFollowing);
      } else {
        overlayFollowBtn.classList.add("hidden");
      }

      overlayVideo.controls = false;
      overlayVideo.removeAttribute("controls");
      overlayVideo.disablePictureInPicture = true;
      overlayVideo.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback");

      overlayVideo.src = video.currentSrc || video.src;
      overlayVideo.currentTime = video.currentTime || 0;
      overlayVideo.muted = video.muted || false;
      overlayVideo.load();

      overlay.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      overlay.classList.add("controls-visible");

      this.bindOverlayEvents(overlay, video);

      // Autoplay if original was playing
      setTimeout(() => {
        if (!video.paused) {
          overlayVideo.play().catch(() => {
            overlay.classList.add("controls-visible");
          });
        } else {
          overlay.classList.add("controls-visible");
        }
      }, 200);

      // ✅ Make sure tap layer exists
      if (overlayTap) {
        overlayTap.blur?.();
      }
    };

    // Setup double tap detection on the left/right overlays (NOT on video)
    const setupDoubleTap = (element, side) => {
      let tapCount = 0;
      let tapTimer = null;

      element.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        tapCount++;

        if (tapCount === 1) {
          tapTimer = setTimeout(() => {
            // Single tap => toggle play
            togglePlay();
            tapCount = 0;
          }, 280);
        } else if (tapCount === 2) {
          clearTimeout(tapTimer);
          if (side === "left") skipBackward10();
          else skipForward10();
          tapCount = 0;
        }
      });
    };

    const doubleTapLeft = player.querySelector(".us-video-double-tap-left");
    const doubleTapRight = player.querySelector(".us-video-double-tap-right");

    if (doubleTapLeft) setupDoubleTap(doubleTapLeft, "left");
    if (doubleTapRight) setupDoubleTap(doubleTapRight, "right");

    // ✅ tap layer (single tap)
    if (tapLayer) {
      tapLayer.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        togglePlay();
      });
    }

    // Play button
    if (btnPlay) {
      btnPlay.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        togglePlay();
      });
    }

    // Mute button
    if (btnMute) {
      btnMute.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMute();
      });
    }

    // Fullscreen button
    if (btnFs) {
      btnFs.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        openFullscreenOverlay();
      });
    }

    // Progress bar
    if (range) {
      range.addEventListener("input", (e) => {
        isScrubbing = true;
        const value = parseInt(e.target.value, 10) / 1000;
        if (video.duration && !isNaN(value)) {
          const newTime = video.duration * value;
          if (currentEl) currentEl.textContent = formatTime(newTime);
        }
        showControls();
      });

      range.addEventListener("change", (e) => {
        const value = parseInt(e.target.value, 10) / 1000;
        if (video.duration && !isNaN(value)) {
          video.currentTime = video.duration * value;
        }
        isScrubbing = false;
        showControls();
      });
    }

    // Video events
    video.addEventListener("loadedmetadata", () => {
      updateUI();

      // optional autoplay attempt
      setTimeout(() => {
        if (!hasPlayed) {
          video.play().then(() => {
            hasPlayed = true;
            setTimeout(() => {
              if (!video.paused) player.classList.remove("us-controls-show");
            }, 800);
          }).catch(() => {
            player.classList.add("us-controls-show");
          });
        }
      }, 150);
    });

    video.addEventListener("timeupdate", updateUI);
    video.addEventListener("play", () => {
      updateUI();
      showControls();
    });
    video.addEventListener("pause", () => {
      updateUI();
      showControls();
    });
    video.addEventListener("ended", () => {
      video.currentTime = 0;
      updateUI();
      showControls();
    });

    // Show controls on interaction (player area, not video)
    player.addEventListener("mousemove", showControls);
    player.addEventListener("touchstart", showControls);

    // Keyboard accessibility
    player.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === "Escape" && this.isOverlayOpen) {
        this.closeFullscreenOverlay();
      }
    });

    updateUI();
    setTimeout(() => {
      if (!video.paused && hasPlayed) player.classList.remove("us-controls-show");
    }, 700);
  }

  // Bind overlay events
  bindOverlayEvents(overlay, originalVideo) {
    if (!overlay || !originalVideo) return;

    // prevent double-binding
    if (this._overlayBound) return;
    this._overlayBound = true;

    console.log("PostPage: Binding overlay events");

    const overlayVideo = overlay.querySelector(".overlay-video");
    const tapLayer = overlay.querySelector(".overlay-tap-layer");
    const closeBtn = overlay.querySelector(".overlay-close-btn");
    const exitBtn = overlay.querySelector(".overlay-exit-btn");
    const playBtn = overlay.querySelector(".overlay-play-btn");
    const muteBtn = overlay.querySelector(".overlay-mute-btn");
    const progress = overlay.querySelector(".overlay-progress");
    const currentTimeEl = overlay.querySelector(".overlay-current-time");
    const durationEl = overlay.querySelector(".overlay-duration");
    const followBtn = overlay.querySelector(".overlay-follow-btn");
    const likeBtn = overlay.querySelector(".overlay-like-btn");
    const commentBtn = overlay.querySelector(".overlay-comment-btn");
    const shareBtn = overlay.querySelector(".overlay-share-btn");
    const saveBtn = overlay.querySelector(".overlay-save-btn");

    let hideControlsTimer = null;
    let isScrubbing = false;

    const formatTime = (seconds) => {
      if (isNaN(seconds)) return "0:00";
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const updateOverlayUI = () => {
      const isPaused = overlayVideo.paused;

      if (playBtn) {
        const playIcon = playBtn.querySelector("i");
        if (playIcon) playIcon.className = isPaused ? "fa-solid fa-play" : "fa-solid fa-pause";
      }

      if (muteBtn) {
        const muteIcon = muteBtn.querySelector("i");
        if (muteIcon) {
          muteIcon.className = overlayVideo.muted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
        }
      }

      if (currentTimeEl) currentTimeEl.textContent = formatTime(overlayVideo.currentTime);
      if (durationEl) durationEl.textContent = formatTime(overlayVideo.duration);

      if (progress && !isScrubbing && overlayVideo.duration && overlayVideo.duration > 0) {
        progress.value = String((overlayVideo.currentTime / overlayVideo.duration) * 1000);
      }
    };

    const showOverlayControls = () => {
      overlay.classList.add("controls-visible");
      clearTimeout(hideControlsTimer);

      if (!overlayVideo.paused) {
        hideControlsTimer = setTimeout(() => {
          overlay.classList.remove("controls-visible");
        }, 2000);
      }
    };

    const toggleOverlayPlay = () => {
      if (overlayVideo.paused) {
        overlayVideo.play().catch(() => {
          overlay.classList.add("controls-visible");
        });
      } else {
        overlayVideo.pause();
      }
      showOverlayControls();
    };

    const closeOverlay = () => {
      console.log("Closing overlay");
      this.isOverlayOpen = false;
      this._overlayBound = false;

      // Sync state back to original video
      if (originalVideo && overlayVideo) {
        originalVideo.currentTime = overlayVideo.currentTime || 0;
        originalVideo.muted = overlayVideo.muted;
        if (!overlayVideo.paused) originalVideo.play().catch(() => {});
        else originalVideo.pause();
      }

      overlay.classList.add("hidden");
      document.body.style.overflow = "";
      this.currentOverlayVideo = null;
    };

    // Video events
    overlayVideo.addEventListener("loadedmetadata", () => {
      updateOverlayUI();
      showOverlayControls();
    });
    overlayVideo.addEventListener("timeupdate", updateOverlayUI);
    overlayVideo.addEventListener("play", () => {
      updateOverlayUI();
      showOverlayControls();
    });
    overlayVideo.addEventListener("pause", () => {
      updateOverlayUI();
      showOverlayControls();
    });

    // ✅ Tap layer only (NOT the video)
    if (tapLayer) {
      tapLayer.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleOverlayPlay();
      });
    }

    // Control buttons
    if (playBtn) {
      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleOverlayPlay();
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        overlayVideo.muted = !overlayVideo.muted;
        showOverlayControls();
        updateOverlayUI();
      });
    }

    // Progress
    if (progress) {
      progress.addEventListener("input", () => {
        isScrubbing = true;
        const dur = overlayVideo.duration || 0;
        const pct = (parseInt(progress.value || "0", 10) / 1000) || 0;
        const target = dur * pct;
        if (currentTimeEl) currentTimeEl.textContent = formatTime(target);
        showOverlayControls();
      });

      progress.addEventListener("change", () => {
        const dur = overlayVideo.duration || 0;
        const pct = (parseInt(progress.value || "0", 10) / 1000) || 0;
        overlayVideo.currentTime = dur * pct;
        isScrubbing = false;
        showOverlayControls();
      });
    }

    // Close buttons
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeOverlay();
      });
    }
    if (exitBtn) {
      exitBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeOverlay();
      });
    }

    // Follow
    if (followBtn) {
      followBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const author = this.post?.user;
        if (!author) return;

        const token = typeof getAuthToken === "function" ? getAuthToken() : null;
        if (!token) {
          alert("Please log in to follow users.");
          return;
        }

        const isCurrentlyFollowing = followBtn.classList.contains("following");
        const newFollowingState = !isCurrentlyFollowing;

        followBtn.textContent = newFollowingState ? "Following" : "Follow";
        followBtn.classList.toggle("following", newFollowingState);
        followBtn.setAttribute("aria-pressed", newFollowingState);

        try {
          const method = newFollowingState ? "POST" : "DELETE";
          const res = await fetch(
            `${POST_API_BASE_URL}/users/${encodeURIComponent(author.username)}/follow`,
            {
              method,
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          if (!res.ok) {
            followBtn.textContent = isCurrentlyFollowing ? "Following" : "Follow";
            followBtn.classList.toggle("following", isCurrentlyFollowing);
            followBtn.setAttribute("aria-pressed", isCurrentlyFollowing);
            throw new Error("Failed to update follow status");
          }

          if (this.post.user) this.post.user.followed_by_me = newFollowingState;
        } catch (err) {
          console.error("Follow error:", err);
        }
      });
    }

    // Engagement buttons
    if (likeBtn) {
      likeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const likeBtnInPost = document.querySelector(".post .like-btn");
        if (likeBtnInPost) {
          likeBtnInPost.click();
          const isLiked = likeBtnInPost.classList.contains("liked");
          const icon = likeBtn.querySelector("i");
          const count = likeBtn.querySelector(".overlay-count");

          likeBtn.classList.toggle("liked", isLiked);
          if (icon) icon.className = isLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
          if (count) count.textContent = likeBtnInPost.querySelector(".like-count")?.textContent || "0";
        }
      });
    }

    if (commentBtn) {
      commentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeOverlay();
        setTimeout(() => this.scrollToCommentsSection(), 100);
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleSharePostClick(this.post);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const saveBtnInPost = document.querySelector(".post .save-btn");
        if (saveBtnInPost) {
          saveBtnInPost.click();
          const isSaved = saveBtnInPost.classList.contains("saved");
          const icon = saveBtn.querySelector("i");

          saveBtn.classList.toggle("saved", isSaved);
          if (icon) icon.className = isSaved ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
        }
      });
    }

    // Show controls on movement
    overlay.addEventListener("mousemove", showOverlayControls);
    overlay.addEventListener("touchmove", showOverlayControls);

    // Keyboard
    overlay.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleOverlayPlay();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        overlayVideo.muted = !overlayVideo.muted;
        showOverlayControls();
        updateOverlayUI();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
      }
    });

    // Set initial counts/states
    if (this.post) {
      if (likeBtn && likeBtn.querySelector(".overlay-count")) {
        likeBtn.querySelector(".overlay-count").textContent = this.post.likes || "0";
      }
      if (commentBtn && commentBtn.querySelector(".overlay-count")) {
        commentBtn.querySelector(".overlay-count").textContent = this.post.comments_count || "0";
      }

      if (likeBtn) {
        likeBtn.classList.toggle("liked", this.post.liked_by_me);
        const likeIcon = likeBtn.querySelector("i");
        if (likeIcon) likeIcon.className = this.post.liked_by_me ? "fa-solid fa-heart" : "fa-regular fa-heart";
      }

      if (saveBtn) {
        saveBtn.classList.toggle("saved", this.post.saved_by_me);
        const saveIcon = saveBtn.querySelector("i");
        if (saveIcon) saveIcon.className = this.post.saved_by_me ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
      }
    }
  }

  closeFullscreenOverlay() {
    console.log("PostPage: Closing fullscreen overlay");
    const overlay = this.videoOverlayContainer;
    overlay.classList.add("hidden");
    document.body.style.overflow = "";
    this.currentOverlayVideo = null;
    this.isOverlayOpen = false;
    this._overlayBound = false;
  }

  // Scroll to comments section
  scrollToCommentsSection() {
    if (this.commentsSection) {
      this.commentsSection.classList.add("highlighted");
      this.commentsSection.scrollIntoView({ behavior: "smooth" });

      if (this.commentInput) {
        setTimeout(() => this.commentInput.focus(), 300);
      }

      setTimeout(() => {
        this.commentsSection.classList.remove("highlighted");
      }, 2000);
    }
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

        const canDelete = this.currentUser && user.id && user.id === this.currentUser.id;

        return `
          <article class="comment" data-comment-id="${c.id}">
            <img class="comment-avatar"
                 src="${avatar}"
                 onerror="this.src='default-profile.PNG'">
            <div class="comment-body">
              <div class="comment-header">
                <span class="comment-display-name">${this.escape(displayName)}</span>
                <span class="comment-username">@${this.escape(username)}</span>
                <span class="comment-time">${this.escape(time)}</span>
              </div>
              <div class="comment-text">${this.formatContent(c.content || "")}</div>
              ${
                canDelete
                  ? `<div class="comment-actions-row">
                       <button class="comment-delete-btn" type="button" data-comment-id="${c.id}">
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

          const me = typeof getCurrentUser === "function" ? getCurrentUser() : null;
          if (me && me.username === uname) window.location.href = "profile.html";
          else window.location.href = `user.html?user=${encodeURIComponent(uname)}`;
        });
      });
  }

  // ========= COMMENT SUBMIT =========

  async handleCommentSubmit(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
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
      if (!res.ok) throw new Error(data.error || "Failed to post comment");

      this.comments.push(data);
      this.renderComments();

      this.commentInput.value = "";
      if (this.commentCharCounter)
        this.commentCharCounter.textContent = `0/${this.maxCommentChars}`;

      const card = this.postContainer?.querySelector(".post");
      const countEl = card?.querySelector(".comment-count");
      if (countEl) {
        let current = parseInt(countEl.textContent || "0", 10);
        if (Number.isNaN(current)) current = 0;
        countEl.textContent = String(current + 1);
      }

      const overlayCommentBtn = this.videoOverlayContainer.querySelector(
        ".overlay-comment-btn .overlay-count"
      );
      if (overlayCommentBtn) {
        let overlayCount = parseInt(overlayCommentBtn.textContent || "0", 10);
        overlayCommentBtn.textContent = String(overlayCount + 1);
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
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete comment");
      }

      this.comments = this.comments.filter((c) => c.id !== commentId);
      this.renderComments();

      const card = this.postContainer?.querySelector(".post");
      const countEl = card?.querySelector(".comment-count");
      if (countEl) {
        let current = parseInt(countEl.textContent || "0", 10);
        if (Number.isNaN(current)) current = 0;
        if (current > 0) current -= 1;
        countEl.textContent = String(current);
      }

      const overlayCommentBtn = this.videoOverlayContainer.querySelector(
        ".overlay-comment-btn .overlay-count"
      );
      if (overlayCommentBtn) {
        let overlayCount = parseInt(overlayCommentBtn.textContent || "0", 10);
        if (overlayCount > 0) overlayCount -= 1;
        overlayCommentBtn.textContent = String(overlayCount);
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

    const wasLiked = btn.classList.contains("liked") || post.liked_by_me === true;

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
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update like");

      const serverLikes = typeof data.likes === "number" ? data.likes : null;
      const nowLiked = data.liked === true ? true : !wasLiked;

      if (serverLikes !== null && countEl) countEl.textContent = String(serverLikes);

      this.post = {
        ...this.post,
        liked_by_me: nowLiked,
        likes: serverLikes !== null ? serverLikes : newCount,
      };

      const overlayLikeBtn = this.videoOverlayContainer.querySelector(".overlay-like-btn");
      const overlayLikeCount = overlayLikeBtn?.querySelector(".overlay-count");
      const overlayLikeIcon = overlayLikeBtn?.querySelector("i");

      if (overlayLikeBtn && overlayLikeCount && overlayLikeIcon) {
        overlayLikeBtn.classList.toggle("liked", nowLiked);
        overlayLikeIcon.className = nowLiked ? "fa-solid fa-heart" : "fa-regular fa-heart";
        overlayLikeCount.textContent = countEl?.textContent || String(newCount);
      }
    } catch (err) {
      console.error("handleLike error:", err);
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
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update save");

      const nowSaved = data.saved === true ? true : !wasSaved;
      this.post = { ...this.post, saved_by_me: nowSaved };

      const overlaySaveBtn = this.videoOverlayContainer.querySelector(".overlay-save-btn");
      const overlaySaveIcon = overlaySaveBtn?.querySelector("i");

      if (overlaySaveBtn && overlaySaveIcon) {
        overlaySaveBtn.classList.toggle("saved", nowSaved);
        overlaySaveIcon.className = nowSaved ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
      }
    } catch (err) {
      console.error("handleSave error:", err);
      btn.classList.toggle("saved", wasSaved);
      if (icon) {
        icon.classList.remove(wasSaved ? "fa-regular" : "fa-solid");
        icon.classList.add(wasSaved ? "fa-solid" : "fa-regular");
      }
    }
  }

  handleSharePostClick(post) {
    if (!post || !post.id) return;

    const url = `${window.location.origin}/post.html?id=${encodeURIComponent(post.id)}`;

    if (navigator.share) {
      navigator.share({ title: "Check out this post", url }).catch(() => {});
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
  console.log("========== POST PAGE INITIALIZING ==========");
  const page = new PostPage();
  page.init();
  window.postPage = page;
  console.log("========== POST PAGE INITIALIZED ==========");
});
