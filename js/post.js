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
    this.overlayPlayPromise = null;
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

    // Overlay container
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
          <video class="overlay-video" playsinline webkit-playsinline preload="metadata" autoplay muted loop></video>
          <button class="overlay-center-play-btn" type="button" aria-label="Play">
            <i class="fa-solid fa-play"></i>
          </button>
          
          <!-- Double tap areas -->
          <div class="overlay-double-tap-left"></div>
          <div class="overlay-double-tap-right"></div>
        </div>
        
        <!-- Main video controls at top -->
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
        
        <!-- Engagement buttons at bottom -->
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
    `;
    document.body.appendChild(overlay);
    return overlay;
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

      // Initialize video players after DOM is fully rendered
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
    let saveCount = typeof post.saves_count === "number" ? post.saves_count : 0;

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
          <div class="us-video-player" 
               tabindex="0" 
               aria-label="Video player. Press Space or Enter to play or pause."
               data-state="paused" 
               data-fullscreen="false">
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

            <!-- Double tap areas for 10-second skip -->
            <div class="us-video-double-tap-left"></div>
            <div class="us-video-double-tap-right"></div>

            <!-- Center play button -->
            <button class="us-video-center-btn" type="button" aria-label="Play/Pause">
              <i class="fa-solid fa-play"></i>
            </button>

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
    const players = rootEl.querySelectorAll(".us-video-player");
    console.log(`Found ${players.length} video players to initialize`);
    players.forEach((player, index) => {
      console.log(`Initializing video player ${index + 1}`);
      this.bindCustomVideoPlayer(player);
    });
  }

  // Bind custom video player with updated logic
  bindCustomVideoPlayer(player) {
    console.log("Binding custom video player");
    const video = player.querySelector(".us-video");
    const centerBtn = player.querySelector(".us-video-center-btn");
    const doubleTapLeft = player.querySelector(".us-video-double-tap-left");
    const doubleTapRight = player.querySelector(".us-video-double-tap-right");
    const btnPlay = player.querySelector(".us-play");
    const btnMute = player.querySelector(".us-mute");
    const btnFs = player.querySelector(".us-fullscreen");
    const range = player.querySelector(".us-video-progress");
    const currentEl = player.querySelector(".us-current");
    const durationEl = player.querySelector(".us-duration");

    if (!video) {
      console.error("No video element found in player");
      return;
    }
    
    if (!range) {
      console.error("No progress range found in player");
      return;
    }

    console.log("Video element found:", video.src);

    // Prevent native controls
    video.controls = false;
    video.removeAttribute("controls");

    let hideTimer = null;
    let isScrubbing = false;
    let hasPlayed = false;

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
      const pIcon = btnPlay?.querySelector("i");
      
      if (cIcon) cIcon.className = `fa-solid ${iconClass}`;
      if (pIcon) pIcon.className = `fa-solid ${iconClass}`;

      const mIcon = btnMute?.querySelector("i");
      if (mIcon) {
        mIcon.className = video.muted
          ? "fa-solid fa-volume-xmark"
          : "fa-solid fa-volume-high";
      }
    };

    const showControls = () => {
      player.classList.add("us-controls-show");
      clearTimeout(hideTimer);
      if (!video.paused) {
        hideTimer = setTimeout(() => {
          if (!isScrubbing) {
            player.classList.remove("us-controls-show");
          }
        }, 2000);
      }
    };

    const togglePlay = async () => {
      console.log("togglePlay called - Video state:", video.paused ? "paused" : "playing");
      console.log("Video readyState:", video.readyState);
      
      try {
        this.pauseAllOtherVideos(video);

        if (video.paused) {
          console.log("Attempting to play video");
          // Cancel any pending play promise
          if (this.overlayPlayPromise) {
            this.overlayPlayPromise.catch(() => {});
            this.overlayPlayPromise = null;
          }
          
          const playPromise = video.play();
          this.overlayPlayPromise = playPromise;
          
          await playPromise;
          console.log("Video play successful");
          hasPlayed = true;
          showControls();
        } else {
          console.log("Pausing video");
          video.pause();
          showControls();
        }
        setIcons();
      } catch (err) {
        console.error("Play error:", err);
        console.error("Error details:", err.name, err.message);
        // If autoplay fails, show controls so user can manually play
        player.classList.add("us-controls-show");
      }
    };

    const skipForward10 = () => {
      if (video.duration) {
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
        showControls();
        
        // Show feedback animation
        const feedback = document.createElement("div");
        feedback.className = "skip-feedback forward";
        feedback.innerHTML = '<i class="fa-solid fa-forward"></i>';
        player.appendChild(feedback);
        setTimeout(() => feedback.remove(), 500);
      }
    };

    const skipBackward10 = () => {
      video.currentTime = Math.max(0, video.currentTime - 10);
      showControls();
      
      // Show feedback animation
      const feedback = document.createElement("div");
      feedback.className = "skip-feedback backward";
      feedback.innerHTML = '<i class="fa-solid fa-backward"></i>';
      player.appendChild(feedback);
      setTimeout(() => feedback.remove(), 500);
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

    const pauseAllOtherVideos = (currentVideo) => {
      document.querySelectorAll("video.us-video").forEach((v) => {
        if (v !== currentVideo) v.pause();
      });
    };

    const openFullscreenOverlay = () => {
      console.log("Opening fullscreen overlay");
      if (!this.post) return;
      
      const overlay = this.videoOverlayContainer;
      const overlayVideo = overlay.querySelector(".overlay-video");
      const overlayAvatar = overlay.querySelector(".overlay-user-avatar");
      const overlayName = overlay.querySelector(".overlay-user-name");
      const overlayHandle = overlay.querySelector(".overlay-user-handle");
      const overlayFollowBtn = overlay.querySelector(".overlay-follow-btn");
      
      // Store reference to original video
      this.currentOverlayVideo = video;
      
      // Set overlay content
      const author = this.post.user || {};
      overlayAvatar.src = author.avatar_url || "default-profile.PNG";
      overlayAvatar.onerror = function() { this.src = 'default-profile.PNG'; };
      overlayName.textContent = author.display_name || author.username;
      overlayHandle.textContent = `@${author.username}`;
      
      // Set follow button state
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
      
      // Set video source - IMPORTANT: Use the same source as original video
      overlayVideo.src = video.src;
      overlayVideo.currentTime = video.currentTime;
      overlayVideo.muted = video.muted;
      overlayVideo.loop = video.loop;
      overlayVideo.autoplay = true;
      
      // Show overlay
      overlay.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      
      // Force video to load
      overlayVideo.load();
      
      // Show controls initially
      overlay.classList.add("controls-visible");
      
      // Bind overlay events
      this.bindOverlayEvents(overlay, video);
      
      // Auto-play if original video was playing
      setTimeout(() => {
        if (!video.paused && overlayVideo.readyState >= 2) {
          console.log("Auto-playing video in overlay");
          overlayVideo.play().catch(err => {
            console.error("Auto-play failed:", err);
            // Show controls if autoplay fails
            overlay.classList.add("controls-visible");
          });
        } else {
          // Show controls if video is paused
          overlay.classList.add("controls-visible");
        }
      }, 300);
    };

    // Setup double tap detection
    const setupDoubleTap = (element, side) => {
      let tapCount = 0;
      let tapTimer = null;
      
      element.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        tapCount++;
        
        if (tapCount === 1) {
          tapTimer = setTimeout(() => {
            // Single tap - toggle play/pause
            togglePlay();
            tapCount = 0;
          }, 300);
        } else if (tapCount === 2) {
          // Double tap
          clearTimeout(tapTimer);
          if (side === 'left') {
            skipBackward10();
          } else {
            skipForward10();
          }
          tapCount = 0;
        }
      });
    };

    // Setup double tap areas
    if (doubleTapLeft) {
      setupDoubleTap(doubleTapLeft, 'left');
    }
    
    if (doubleTapRight) {
      setupDoubleTap(doubleTapRight, 'right');
    }

    // Video click to toggle play/pause
    video.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("Video clicked");
      togglePlay();
    });

    // Center button click - FIXED
    if (centerBtn) {
      centerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log("Center button clicked");
        togglePlay();
      });
    }

    // Play button - FIXED
    if (btnPlay) {
      btnPlay.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log("Play button clicked");
        togglePlay();
      });
    }

    // Mute button
    if (btnMute) {
      btnMute.addEventListener("click", (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        setIcons();
        showControls();
      });
    }

    // Fullscreen button - FIXED
    if (btnFs) {
      btnFs.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log("Fullscreen button clicked");
        openFullscreenOverlay();
      });
    }

    // Progress bar
    range.addEventListener("input", () => {
      isScrubbing = true;
      const dur = video.duration || 0;
      const pct = (parseInt(range.value || "0", 10) / 1000) || 0;
      const target = dur * pct;
      if (currentEl) currentEl.textContent = fmt(target);
      showControls();
    });

    range.addEventListener("change", () => {
      const dur = video.duration || 0;
      const pct = (parseInt(range.value || "0", 10) / 1000) || 0;
      video.currentTime = dur * pct;
      isScrubbing = false;
      showControls();
    });

    // Keyboard accessibility
    player.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        video.muted = !video.muted;
        setIcons();
      } else if (e.key === "Escape") {
        this.closeFullscreenOverlay();
      }
    });

    // Video events
    video.addEventListener("loadedmetadata", () => {
      console.log("Video metadata loaded, duration:", video.duration);
      syncProgress();
      setTimeout(() => {
        if (!hasPlayed && video.readyState >= 2) {
          video.play().then(() => {
            console.log("Autoplay successful");
            hasPlayed = true;
            setTimeout(() => {
              if (!video.paused) player.classList.remove("us-controls-show");
            }, 900);
          }).catch((err) => {
            console.error("Autoplay failed:", err);
            player.classList.add("us-controls-show");
          });
        }
      }, 120);
    });

    video.addEventListener("timeupdate", syncProgress);
    video.addEventListener("play", () => {
      console.log("Video play event fired");
      hasPlayed = true;
      player.dataset.state = "playing";
      setIcons();
      showControls();
    });

    video.addEventListener("pause", () => {
      console.log("Video pause event fired");
      player.dataset.state = "paused";
      setIcons();
      showControls();
    });

    // Show controls on mouse move
    player.addEventListener("mousemove", showControls);
    player.addEventListener("touchmove", showControls);

    // Initialize
    setIcons();
    syncProgress();
    
    // Auto-hide controls after load
    setTimeout(() => {
      if (!video.paused && hasPlayed) {
        player.classList.remove("us-controls-show");
      }
    }, 700);
  }

  // Bind overlay events - COMPLETELY REVISED
  bindOverlayEvents(overlay, originalVideo) {
    console.log("Binding overlay events");
    
    const overlayVideo = overlay.querySelector(".overlay-video");
    const closeBtn = overlay.querySelector(".overlay-close-btn");
    const exitBtn = overlay.querySelector(".overlay-exit-btn");
    const playBtn = overlay.querySelector(".overlay-play-btn");
    const centerPlayBtn = overlay.querySelector(".overlay-center-play-btn");
    const muteBtn = overlay.querySelector(".overlay-mute-btn");
    const doubleTapLeft = overlay.querySelector(".overlay-double-tap-left");
    const doubleTapRight = overlay.querySelector(".overlay-double-tap-right");
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

    const fmt = (secs) => {
      secs = Math.max(0, secs || 0);
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    };

    const syncOverlayProgress = () => {
      const dur = overlayVideo.duration || 0;
      const cur = overlayVideo.currentTime || 0;

      if (!isScrubbing && progress) {
        progress.value = dur > 0 ? Math.round((cur / dur) * 1000) : 0;
      }

      if (currentTimeEl) currentTimeEl.textContent = fmt(cur);
      if (durationEl) durationEl.textContent = fmt(dur);
      
      // Update play button icon
      if (playBtn) {
        const icon = playBtn.querySelector("i");
        if (icon) {
          icon.className = overlayVideo.paused ? "fa-solid fa-play" : "fa-solid fa-pause";
        }
      }
      
      // Update center play button
      if (centerPlayBtn) {
        const centerIcon = centerPlayBtn.querySelector("i");
        if (centerIcon) {
          centerIcon.className = overlayVideo.paused ? "fa-solid fa-play" : "fa-solid fa-pause";
        }
        centerPlayBtn.style.display = overlayVideo.paused ? "flex" : "none";
      }
      
      // Update mute button
      if (muteBtn) {
        const muteIcon = muteBtn.querySelector("i");
        if (muteIcon) {
          muteIcon.className = overlayVideo.muted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
        }
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
      console.log("toggleOverlayPlay called - Overlay video state:", overlayVideo.paused ? "paused" : "playing");
      console.log("Overlay video readyState:", overlayVideo.readyState);
      
      if (overlayVideo.paused) {
        overlayVideo.play().then(() => {
          console.log("Overlay video play successful");
          showOverlayControls();
          if (centerPlayBtn) centerPlayBtn.style.display = "none";
        }).catch(err => {
          console.error("Overlay video play failed:", err);
          overlay.classList.add("controls-visible");
        });
      } else {
        overlayVideo.pause();
        showOverlayControls();
        if (centerPlayBtn) centerPlayBtn.style.display = "flex";
      }
    };

    const skipOverlayForward10 = () => {
      if (overlayVideo.duration) {
        overlayVideo.currentTime = Math.min(overlayVideo.duration, overlayVideo.currentTime + 10);
        showOverlayControls();
      }
    };

    const skipOverlayBackward10 = () => {
      overlayVideo.currentTime = Math.max(0, overlayVideo.currentTime - 10);
      showOverlayControls();
    };

    // Setup overlay double tap
    const setupOverlayDoubleTap = (element, side) => {
      let tapCount = 0;
      let tapTimer = null;
      
      element.addEventListener('click', (e) => {
        e.stopPropagation();
        tapCount++;
        
        if (tapCount === 1) {
          tapTimer = setTimeout(() => {
            // Single tap
            toggleOverlayPlay();
            tapCount = 0;
          }, 300);
        } else if (tapCount === 2) {
          // Double tap
          clearTimeout(tapTimer);
          if (side === 'left') {
            skipOverlayBackward10();
          } else {
            skipOverlayForward10();
          }
          tapCount = 0;
        }
      });
    };

    // Initialize overlay video
    overlayVideo.addEventListener('loadedmetadata', () => {
      console.log("Overlay video metadata loaded, duration:", overlayVideo.duration);
      syncOverlayProgress();
      showOverlayControls();
    });
    
    // Video events
    overlayVideo.addEventListener("timeupdate", syncOverlayProgress);
    overlayVideo.addEventListener("play", () => {
      console.log("Overlay video play event");
      showOverlayControls();
      if (centerPlayBtn) centerPlayBtn.style.display = "none";
    });
    
    overlayVideo.addEventListener("pause", () => {
      console.log("Overlay video pause event");
      showOverlayControls();
      if (centerPlayBtn) centerPlayBtn.style.display = "flex";
    });

    // Single tap on video toggles play
    overlayVideo.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleOverlayPlay();
    });

    // Setup overlay double tap areas
    if (doubleTapLeft) {
      setupOverlayDoubleTap(doubleTapLeft, 'left');
    }
    
    if (doubleTapRight) {
      setupOverlayDoubleTap(doubleTapRight, 'right');
    }

    // Center play button
    if (centerPlayBtn) {
      centerPlayBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log("Overlay center play button clicked");
        toggleOverlayPlay();
      });
    }

    // Control buttons
    if (playBtn) {
      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log("Overlay play button clicked");
        toggleOverlayPlay();
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        overlayVideo.muted = !overlayVideo.muted;
        showOverlayControls();
      });
    }

    // Progress bar
    if (progress) {
      progress.addEventListener("input", () => {
        isScrubbing = true;
        const dur = overlayVideo.duration || 0;
        const pct = (parseInt(progress.value || "0", 10) / 1000) || 0;
        const target = dur * pct;
        if (currentTimeEl) currentTimeEl.textContent = fmt(target);
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
    const closeOverlay = () => {
      console.log("Closing overlay");
      // Sync state back to original video
      if (originalVideo && overlayVideo) {
        originalVideo.currentTime = overlayVideo.currentTime;
        originalVideo.muted = overlayVideo.muted;
        if (!overlayVideo.paused) {
          originalVideo.play().catch(() => {});
        } else {
          originalVideo.pause();
        }
      }
      
      overlay.classList.add("hidden");
      document.body.style.overflow = "";
      this.currentOverlayVideo = null;
      
      // Cancel any pending play promise
      if (this.overlayPlayPromise) {
        this.overlayPlayPromise.catch(() => {});
        this.overlayPlayPromise = null;
      }
    };

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

    // Follow button
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
        
        // Optimistic update
        followBtn.textContent = newFollowingState ? "Following" : "Follow";
        followBtn.classList.toggle("following", newFollowingState);
        followBtn.setAttribute("aria-pressed", newFollowingState);
        
        try {
          const method = newFollowingState ? "POST" : "DELETE";
          const res = await fetch(
            `${POST_API_BASE_URL}/users/${encodeURIComponent(author.username)}/follow`,
            {
              method,
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
          
          if (!res.ok) {
            // Revert on error
            followBtn.textContent = isCurrentlyFollowing ? "Following" : "Follow";
            followBtn.classList.toggle("following", isCurrentlyFollowing);
            followBtn.setAttribute("aria-pressed", isCurrentlyFollowing);
            throw new Error("Failed to update follow status");
          }
          
          // Update post data
          if (this.post.user) {
            this.post.user.followed_by_me = newFollowingState;
          }
          
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
        setTimeout(() => {
          this.scrollToCommentsSection();
        }, 100);
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

    // Show controls on mouse move/touch
    overlay.addEventListener("mousemove", showOverlayControls);
    overlay.addEventListener("touchmove", showOverlayControls);

    // Click on overlay (outside controls) toggles controls
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target === overlay.querySelector(".overlay-video-container")) {
        toggleOverlayPlay();
      }
    });

    // Keyboard support
    overlay.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleOverlayPlay();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        if (overlayVideo) overlayVideo.muted = !overlayVideo.muted;
        showOverlayControls();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
      }
    });

    // Set initial counts from post data
    if (this.post) {
      if (likeBtn && likeBtn.querySelector(".overlay-count")) {
        likeBtn.querySelector(".overlay-count").textContent = this.post.likes || "0";
      }
      if (commentBtn && commentBtn.querySelector(".overlay-count")) {
        commentBtn.querySelector(".overlay-count").textContent = this.post.comments_count || "0";
      }
      
      // Set initial like/save states
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

    // Auto-play when overlay opens
    setTimeout(() => {
      if (overlayVideo && overlayVideo.readyState >= 2 && !originalVideo.paused) {
        console.log("Auto-playing video in overlay");
        overlayVideo.play().catch(err => {
          console.error("Auto-play on overlay open failed:", err);
          overlay.classList.add("controls-visible");
        });
      }
    }, 500);
  }

  closeFullscreenOverlay() {
    const overlay = this.videoOverlayContainer;
    overlay.classList.add("hidden");
    document.body.style.overflow = "";
    this.currentOverlayVideo = null;
    
    // Cancel any pending play promise
    if (this.overlayPlayPromise) {
      this.overlayPlayPromise.catch(() => {});
      this.overlayPlayPromise = null;
    }
  }

  // Scroll to comments section
  scrollToCommentsSection() {
    if (this.commentsSection) {
      // Highlight effect
      this.commentsSection.classList.add("highlighted");
      
      // Scroll to comments
      this.commentsSection.scrollIntoView({ behavior: "smooth" });
      
      // Focus on comment input
      if (this.commentInput) {
        setTimeout(() => {
          this.commentInput.focus();
        }, 300);
      }
      
      // Remove highlight after animation
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
      
      // Update overlay count if visible
      const overlayCommentBtn = this.videoOverlayContainer.querySelector(".overlay-comment-btn .overlay-count");
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
      
      // Update overlay count if visible
      const overlayCommentBtn = this.videoOverlayContainer.querySelector(".overlay-comment-btn .overlay-count");
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
      
      // Update overlay like button if visible
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
      
      // Update overlay save button if visible
      const overlaySaveBtn = this.videoOverlayContainer.querySelector(".overlay-save-btn");
      const overlaySaveIcon = overlaySaveBtn?.querySelector("i");
      
      if (overlaySaveBtn && overlaySaveIcon) {
        overlaySaveBtn.classList.toggle("saved", nowSaved);
        overlaySaveIcon.className = nowSaved ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
      }
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
  console.log("DOM loaded, initializing PostPage");
  const page = new PostPage();
  page.init();
  window.postPage = page;
  console.log("PostPage initialized");
});
