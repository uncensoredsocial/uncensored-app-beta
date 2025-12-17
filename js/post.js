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

  // ✅ UPDATED: Enhanced video player markup with double-tap gestures, settings, and follow logic
  renderMediaHtml(url, type) {
    const lower = (url || "").toLowerCase();
    const isVideo =
      (type && (String(type).startsWith("video/") || type === "video")) ||
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".ogg") ||
      lower.endsWith(".mov");

    if (isVideo) {
      const post = this.post;
      const author = post?.user || {};
      const avatar = author.avatar_url || "default-profile.PNG";
      const username = author.username || "unknown";
      const displayName = author.display_name || username;
      const isCurrentUser = this.currentUser && this.currentUser.username === username;
      
      // Check if user is following the post author
      const isFollowing = post?.user?.followed_by_me || false;
      const showFollowBtn = !isCurrentUser;
      const followBtnText = isFollowing ? "Following" : "Follow";
      const followBtnClass = isFollowing ? "following" : "";
      const followBtnHidden = isFollowing ? "" : "";
      
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

            <!-- Double-tap gesture areas -->
            <div class="us-video-double-tap-left" data-action="back-10"></div>
            <div class="us-video-double-tap-right" data-action="forward-10"></div>

            <!-- Center play button -->
            <button class="us-video-center-btn" type="button" aria-label="Play/Pause">
              <i class="fa-solid fa-play"></i>
            </button>

            <!-- Top overlay (for fullscreen) - Twitter/X style -->
            <div class="us-video-top-overlay">
              <div class="us-video-user-info">
                <img class="us-video-user-avatar" src="${avatar}" 
                     alt="${displayName}"
                     onerror="this.src='default-profile.PNG'">
                <div class="us-video-user-details">
                  <span class="us-video-user-name">${this.escape(displayName)}</span>
                  <span class="us-video-user-handle">@${this.escape(username)}</span>
                </div>
                ${showFollowBtn ? `
                  <button class="us-video-follow-btn ${followBtnClass}" 
                          type="button" 
                          aria-label="${followBtnText}"
                          data-username="${this.escape(username)}">
                    ${followBtnText}
                  </button>
                ` : ''}
              </div>
              <button class="us-video-close-fullscreen" type="button" aria-label="Exit fullscreen">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <!-- Post text overlay (for fullscreen) -->
            <div class="us-video-text-overlay">
              <div class="us-video-post-text">${this.formatContent(post?.content || "")}</div>
            </div>

            <!-- Video Actions Overlay (Twitter/X style) -->
            <div class="us-video-actions-overlay">
              <button class="us-video-action-btn us-video-like ${post?.liked_by_me ? 'liked' : ''}" 
                      type="button" 
                      data-action="like">
                <i class="${post?.liked_by_me ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                <span class="us-video-action-count">${post?.likes || 0}</span>
              </button>
              <button class="us-video-action-btn us-video-comment" type="button" data-action="comment">
                <i class="fa-regular fa-comment"></i>
                <span class="us-video-action-count">${post?.comments_count || 0}</span>
              </button>
              <button class="us-video-action-btn us-video-share" type="button" data-action="share">
                <i class="fa-solid fa-share"></i>
              </button>
              <button class="us-video-action-btn us-video-save ${post?.saved_by_me ? 'saved' : ''}" 
                      type="button" 
                      data-action="save">
                <i class="${post?.saved_by_me ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
                <span class="us-video-action-count">${post?.saves_count || 0}</span>
              </button>
            </div>

            <!-- Video Settings Dropdown -->
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
                    <option value="1" selected>1x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2x</option>
                  </select>
                </div>
                <div class="us-video-setting">
                  <span>Quality</span>
                  <select class="us-video-quality-select">
                    <option value="auto" selected>Auto</option>
                    <option value="720">720p</option>
                    <option value="480">480p</option>
                    <option value="360">360p</option>
                  </select>
                </div>
                <button class="us-video-setting-btn" data-action="report">
                  <i class="fa-solid fa-flag"></i>
                  <span>Report Video</span>
                </button>
              </div>
            </div>

            <!-- Bottom controls -->
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

                <button class="us-video-btn us-settings" type="button" aria-label="Settings">
                  <i class="fa-solid fa-gear"></i>
                </button>

                <button class="us-video-btn us-fullscreen" type="button" aria-label="Fullscreen">
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

  // ✅ initialize custom video players inside a DOM subtree
  initCustomVideoPlayers(rootEl = document) {
    const players = rootEl.querySelectorAll(".us-video-player");
    players.forEach((player) => this.bindCustomVideoPlayer(player));
  }

  // ✅ ENHANCED: Custom player with double-tap gestures, settings, and improved functionality
  bindCustomVideoPlayer(player) {
    const video = player.querySelector(".us-video");
    const centerBtn = player.querySelector(".us-video-center-btn");
    
    const btnPlay = player.querySelector(".us-play");
    const btnMute = player.querySelector(".us-mute");
    const btnFs = player.querySelector(".us-fullscreen");
    const closeFullscreenBtn = player.querySelector(".us-video-close-fullscreen");
    const followBtn = player.querySelector(".us-video-follow-btn");
    
    const range = player.querySelector(".us-video-progress");
    const currentEl = player.querySelector(".us-current");
    const durationEl = player.querySelector(".us-duration");
    
    // Action buttons
    const likeBtnAction = player.querySelector('.us-video-like');
    const commentBtnAction = player.querySelector('.us-video-comment');
    const shareBtnAction = player.querySelector('.us-video-share');
    const saveBtnAction = player.querySelector('.us-video-save');
    
    // Post text overlay
    const textOverlay = player.querySelector('.us-video-text-overlay');
    
    if (!video || !range) return;

    // Store original position for returning from fullscreen
    let originalParent = player.parentElement;
    let originalPosition = {
      top: player.offsetTop,
      left: player.offsetLeft,
      width: player.offsetWidth,
      height: player.offsetHeight
    };

    // Store scroll position
    let scrollPositionBeforeFullscreen = window.scrollY;

    // ===== HARD FORCE: prevent native browser controls =====
    try {
      video.controls = false;
      video.removeAttribute("controls");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.muted = true;
      video.setAttribute("muted", "");
      video.setAttribute("autoplay", "");
      video.setAttribute("loop", "");
    } catch {}

    let hideTimer = null;
    let isScrubbing = false;
    let hasPlayed = false;
    let userActivated = false;
    let isFullscreen = false;
    let playbackRate = 1;
    let settingsVisible = false;

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
      player.classList.add("us-controls-show");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!video.paused && !isScrubbing && !isFullscreen) {
          player.classList.remove("us-controls-show");
        }
      }, 1800);
    };

    const hideControlsNow = () => {
      player.classList.remove("us-controls-show");
      clearTimeout(hideTimer);
      hideTimer = null;
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
          player.classList.add("us-controls-show");
        }
      } catch {}
    };

    const enterFullscreen = () => {
      if (isFullscreen) return;
      
      // Store scroll position
      scrollPositionBeforeFullscreen = window.scrollY;
      
      // Store original position for animation
      const rect = player.getBoundingClientRect();
      originalPosition = {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height
      };
      
      // Move player to body for fullscreen
      document.body.appendChild(player);
      player.dataset.fullscreen = "true";
      isFullscreen = true;
      
      // Hide other elements
      document.body.style.overflow = "hidden";
      
      // Show fullscreen overlays
      player.classList.add("us-controls-show");
      
      // Force play if paused
      if (video.paused) {
        video.play().catch(() => {});
      }
      
      // Hide settings if open
      toggleSettings(false);
    };

    const exitFullscreen = () => {
      if (!isFullscreen) return;
      
      // Return player to original position
      originalParent.appendChild(player);
      player.dataset.fullscreen = "false";
      isFullscreen = false;
      
      // Restore body scroll
      document.body.style.overflow = "";
      
      // Hide fullscreen overlays
      player.classList.remove("us-controls-show");
      
      // Restore scroll position
      window.scrollTo(0, scrollPositionBeforeFullscreen);
      
      // Hide settings if open
      toggleSettings(false);
    };

    const toggleFullscreen = () => {
      if (isFullscreen) {
        exitFullscreen();
      } else {
        enterFullscreen();
      }
    };

    const pauseAllOtherVideos = () => {
      document.querySelectorAll("video.us-video").forEach((v) => {
        if (v !== video) v.pause();
      });
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

    const tryAutoplay = async () => {
      if (hasPlayed) return;
      try {
        pauseAllOtherVideos();
        await video.play();
        hasPlayed = true;
        player.dataset.state = "playing";
        setIcons();
        showControls();
        setTimeout(() => {
          if (!video.paused && !isFullscreen) player.classList.remove("us-controls-show");
        }, 900);
      } catch {
        player.dataset.state = "paused";
        setIcons();
        player.classList.add("us-controls-show");
      }
    };

    // ===== DOUBLE-TAP GESTURE HANDLING =====
    let lastTapTime = 0;
    let tapCount = 0;
    let tapTimer = null;

    const handleDoubleTap = (e, side) => {
      const currentTime = Date.now();
      const timeSinceLastTap = currentTime - lastTapTime;
      
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        // Double tap detected
        tapCount = 0;
        clearTimeout(tapTimer);
        
        // Create feedback animation
        const feedback = document.createElement('div');
        feedback.className = 'us-video-double-tap-feedback';
        feedback.style.left = `${e.clientX - 40}px`;
        feedback.style.top = `${e.clientY - 40}px`;
        
        if (side === 'left') {
          feedback.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
          video.currentTime = Math.max(0, video.currentTime - 10);
        } else {
          feedback.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
          video.currentTime = Math.min(video.duration, video.currentTime + 10);
        }
        
        player.appendChild(feedback);
        
        // Remove feedback after animation
        setTimeout(() => {
          if (feedback.parentNode) {
            feedback.remove();
          }
        }, 500);
        
        // Show controls briefly
        showControls();
        
      } else {
        tapCount = 1;
      }
      
      lastTapTime = currentTime;
      
      // Reset tap count after delay
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 300);
    };

    // ===== SETTINGS FUNCTIONALITY =====
    const toggleSettings = (forceState = null) => {
      settingsVisible = forceState !== null ? forceState : !settingsVisible;
      const settingsDropdown = player.querySelector('.us-video-settings-dropdown');
      if (settingsDropdown) {
        settingsDropdown.classList.toggle('visible', settingsVisible);
      }
    };

    const updatePlaybackRate = (rate) => {
      playbackRate = parseFloat(rate);
      video.playbackRate = playbackRate;
    };

    // ===== FOLLOW FUNCTIONALITY =====
    const updateFollowButton = (following) => {
      if (followBtn) {
        if (following) {
          followBtn.textContent = 'Following';
          followBtn.classList.add('following');
        } else {
          followBtn.textContent = 'Follow';
          followBtn.classList.remove('following');
        }
      }
    };

    // ===== SCROLL TO COMMENTS FUNCTION =====
    const scrollToCommentsSection = () => {
      const commentsSection = document.getElementById("commentsSection");
      if (commentsSection) {
        // Add highlight effect
        commentsSection.classList.add("highlighted");
        
        // Scroll to comments
        commentsSection.scrollIntoView({ behavior: 'smooth' });
        
        // Focus on comment input
        const commentInput = document.getElementById("commentInput");
        if (commentInput) {
          commentInput.focus();
        }
        
        // Remove highlight after animation
        setTimeout(() => {
          commentsSection.classList.remove("highlighted");
        }, 2000);
      }
    };

    // ===== EVENT LISTENERS =====

    // Double-tap areas
    const doubleTapLeft = player.querySelector('.us-video-double-tap-left');
    const doubleTapRight = player.querySelector('.us-video-double-tap-right');

    if (doubleTapLeft) {
      doubleTapLeft.addEventListener('click', (e) => {
        e.stopPropagation();
        userActivated = true;
        handleDoubleTap(e, 'left');
      });
    }

    if (doubleTapRight) {
      doubleTapRight.addEventListener('click', (e) => {
        e.stopPropagation();
        userActivated = true;
        handleDoubleTap(e, 'right');
      });
    }

    // Video events
    video.addEventListener("loadedmetadata", () => {
      syncProgress();
      setTimeout(() => {
        tryAutoplay();
      }, 120);
    });

    video.addEventListener("timeupdate", syncProgress);
    video.addEventListener("play", () => {
      hasPlayed = true;
      player.dataset.state = "playing";
      setIcons();
      if (userActivated) showControls();
    });

    video.addEventListener("pause", () => {
      player.dataset.state = "paused";
      setIcons();
      player.classList.add("us-controls-show");
    });

    // Center play button
    centerBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      showControls();
      togglePlay();
    });

    // Play button in controls
    btnPlay?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      showControls();
      togglePlay();
    });

    // Mute button
    btnMute?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      showControls();
      video.muted = !video.muted;
      setIcons();
    });

    // Fullscreen button
    btnFs?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      toggleFullscreen();
    });

    // Close fullscreen button
    closeFullscreenBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      exitFullscreen();
    });

    // Settings button
    const settingsBtn = player.querySelector('.us-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userActivated = true;
        showControls();
        toggleSettings();
      });
    }

    // Settings close button
    const settingsCloseBtn = player.querySelector('.us-video-settings-close');
    if (settingsCloseBtn) {
      settingsCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSettings(false);
      });
    }

    // Playback speed select
    const speedSelect = player.querySelector('.us-video-speed-select');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        updatePlaybackRate(e.target.value);
      });
    }

    // Report button
    const reportBtn = player.querySelector('[data-action="report"]');
    if (reportBtn) {
      reportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        alert('Report functionality would be implemented here.');
        toggleSettings(false);
      });
    }

    // Follow button
    followBtn?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const post = this.post;
      const user = post?.user;
      if (!user) return;
      
      const token = typeof getAuthToken === "function" ? getAuthToken() : null;
      if (!token) {
        alert("Please log in to follow users.");
        return;
      }
      
      const isCurrentlyFollowing = followBtn.classList.contains('following');
      const newFollowingState = !isCurrentlyFollowing;
      
      // Optimistic update
      updateFollowButton(newFollowingState);
      
      try {
        const method = newFollowingState ? "POST" : "DELETE";
        const res = await fetch(
          `${POST_API_BASE_URL}/users/${encodeURIComponent(user.username)}/follow`,
          {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        
        if (!res.ok) {
          // Revert on error
          updateFollowButton(isCurrentlyFollowing);
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

    // Video action buttons
    likeBtnAction?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      const post = this.post;
      const likeBtn = document.querySelector('.post .like-btn');
      if (likeBtn) {
        likeBtn.click();
        
        // Update video action button
        const isLiked = likeBtn.classList.contains('liked');
        likeBtnAction.classList.toggle('liked', isLiked);
        const icon = likeBtnAction.querySelector('i');
        const count = likeBtnAction.querySelector('.us-video-action-count');
        
        if (icon) {
          icon.className = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        }
        if (count) {
          count.textContent = isLiked ? (post?.likes || 0) + 1 : (post?.likes || 0);
        }
      }
    });

    commentBtnAction?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      
      if (isFullscreen) {
        // Exit fullscreen first, then scroll to comments
        exitFullscreen();
        
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          scrollToCommentsSection();
        }, 300);
      } else {
        // Direct scroll to comments
        scrollToCommentsSection();
      }
    });

    shareBtnAction?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      this.handleSharePostClick(this.post);
    });

    saveBtnAction?.addEventListener("click", (e) => {
      e.stopPropagation();
      userActivated = true;
      const post = this.post;
      const saveBtn = document.querySelector('.post .save-btn');
      if (saveBtn) {
        saveBtn.click();
        
        // Update video action button
        const isSaved = saveBtn.classList.contains('saved');
        saveBtnAction.classList.toggle('saved', isSaved);
        const icon = saveBtnAction.querySelector('i');
        
        if (icon) {
          icon.className = isSaved ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
        }
      }
    });

    // Progress bar
    range.addEventListener("input", () => {
      isScrubbing = true;
      userActivated = true;
      const dur = video.duration || 0;
      const pct = (parseInt(range.value || "0", 10) / 1000) || 0;
      const target = dur * pct;
      if (currentEl) currentEl.textContent = fmt(target);
      player.classList.add("us-controls-show");
    });

    range.addEventListener("change", () => {
      userActivated = true;
      const dur = video.duration || 0;
      const pct = (parseInt(range.value || "0", 10) / 1000) || 0;
      video.currentTime = dur * pct;
      isScrubbing = false;
      showControls();
    });

    // Handle ESC key to exit fullscreen
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isFullscreen) {
        exitFullscreen();
      }
    });

    // Handle click outside player in fullscreen
    document.addEventListener("click", (e) => {
      if (isFullscreen && !player.contains(e.target)) {
        // Only exit if clicking outside AND not on action buttons or settings
        if (!e.target.closest('.us-video-action-btn') && 
            !e.target.closest('.us-video-close-fullscreen') &&
            !e.target.closest('.us-video-follow-btn') &&
            !e.target.closest('.us-video-settings-dropdown')) {
          exitFullscreen();
        }
      }
      
      // Close settings if clicking outside
      if (settingsVisible && !e.target.closest('.us-video-settings-dropdown') && 
          !e.target.closest('.us-settings')) {
        toggleSettings(false);
      }
    });

    // Initialize
    setIcons();
    syncProgress();
    
    // Show UI briefly on load
    setTimeout(() => {
      if (!video.paused) {
        player.classList.remove("us-controls-show");
      } else {
        player.classList.add("us-controls-show");
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
