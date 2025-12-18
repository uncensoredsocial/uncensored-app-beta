// Video Modal System for Post Page
class VideoModal {
    constructor() {
        // Modal elements
        this.modal = null;
        this.modalVideo = null;
        this.postVideo = null;
        
        // Post data
        this.postId = null;
        this.currentUserId = null;
        
        // State
        this.isModalOpen = false;
        this.videoPlaybackState = {
            currentTime: 0,
            isPlaying: false,
            volume: 1
        };
        
        // API base URL
        this.API_BASE = 'https://uncensored-app-beta-production.up.railway.app/api';
        
        this.initialize();
    }
    
    initialize() {
        this.createModal();
        this.setupEventListeners();
        this.loadUserData();
        
        console.log('Video Modal System Initialized');
    }
    
    createModal() {
        // Create modal HTML structure
        const modalHTML = `
            <div class="video-modal-overlay" id="videoModal">
                <div class="video-modal-container">
                    <div class="modal-header">
                        <button class="modal-back-btn" id="backToPostBtn">
                            <i class="fas fa-arrow-left"></i> Back to Post
                        </button>
                        
                        <div class="modal-header-actions">
                            <button class="modal-comments-btn" id="modalCommentsBtn">
                                <i class="fas fa-comments"></i> Comments
                            </button>
                            <button class="modal-close-btn" id="closeModalBtn">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="modal-video-player">
                        <video id="modalVideo" controls autoplay>
                            Your browser does not support the video tag.
                        </video>
                    </div>
                    
                    <div class="modal-footer">
                        <div class="modal-post-preview" id="modalPostInfo">
                            <!-- Will be populated dynamically -->
                            <img src="" alt="User" class="modal-profile-pic">
                            <div class="modal-post-info">
                                <h4>Loading...</h4>
                                <p></p>
                                <div class="modal-stats">
                                    <span><i class="far fa-heart"></i> 0</span>
                                    <span><i class="far fa-comment"></i> 0</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="modal-actions">
                            <button class="modal-action-btn modal-like-btn" data-action="like">
                                <i class="far fa-heart"></i>
                                <span class="like-count">0</span>
                            </button>
                            <button class="modal-action-btn modal-comment-btn" data-action="comment">
                                <i class="far fa-comment"></i>
                                <span class="comment-count">0</span>
                            </button>
                            <button class="modal-action-btn modal-save-btn" data-action="save">
                                <i class="far fa-bookmark"></i>
                            </button>
                            <button class="modal-action-btn modal-share-btn" data-action="share">
                                <i class="fas fa-share"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Insert modal into body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Get modal elements
        this.modal = document.getElementById('videoModal');
        this.modalVideo = document.getElementById('modalVideo');
        
        // Add fullscreen toggle to all videos on page
        this.addFullscreenButtons();
    }
    
    addFullscreenButtons() {
        // Find all video containers on the page
        const videoContainers = document.querySelectorAll('.video-container, [data-video]');
        
        videoContainers.forEach(container => {
            const video = container.querySelector('video');
            if (!video) return;
            
            // Add fullscreen button
            const fullscreenBtn = document.createElement('button');
            fullscreenBtn.className = 'fullscreen-toggle';
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            fullscreenBtn.title = 'Full Screen';
            
            container.style.position = 'relative';
            container.appendChild(fullscreenBtn);
            
            // Store post ID if available
            const postId = container.closest('[data-post-id]')?.dataset.postId || 
                          container.dataset.postId;
            
            fullscreenBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openModal(video, postId);
            });
        });
    }
    
    async openModal(videoElement, postId = null) {
        if (!videoElement) return;
        
        this.postVideo = videoElement;
        this.postId = postId || this.extractPostId();
        
        // Save video state
        this.videoPlaybackState = {
            currentTime: this.postVideo.currentTime,
            isPlaying: !this.postVideo.paused,
            volume: this.postVideo.volume
        };
        
        // Pause original video
        this.postVideo.pause();
        
        // Set modal video source
        this.modalVideo.src = this.postVideo.src;
        this.modalVideo.currentTime = this.videoPlaybackState.currentTime;
        this.modalVideo.volume = this.videoPlaybackState.volume;
        
        // Show modal
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.isModalOpen = true;
        
        // Play modal video if original was playing
        if (this.videoPlaybackState.isPlaying) {
            try {
                await this.modalVideo.play();
            } catch (err) {
                console.log('Autoplay prevented:', err);
            }
        }
        
        // Load post data if we have post ID
        if (this.postId) {
            await this.loadPostData(this.postId);
        }
        
        // Update URL hash
        window.location.hash = 'video-modal';
    }
    
    closeModal() {
        if (!this.isModalOpen) return;
        
        // Save modal video state
        if (this.modalVideo) {
            this.videoPlaybackState.currentTime = this.modalVideo.currentTime;
            this.videoPlaybackState.isPlaying = !this.modalVideo.paused;
        }
        
        // Pause modal video
        this.modalVideo.pause();
        
        // Hide modal
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
        this.isModalOpen = false;
        
        // Restore original video state
        if (this.postVideo) {
            this.postVideo.currentTime = this.videoPlaybackState.currentTime;
            this.postVideo.volume = this.videoPlaybackState.volume;
            
            if (this.videoPlaybackState.isPlaying) {
                this.postVideo.play().catch(e => console.log('Playback error:', e));
            }
        }
        
        // Clear URL hash
        if (window.location.hash === '#video-modal') {
            history.replaceState(null, null, ' ');
        }
    }
    
    extractPostId() {
        // Try to get post ID from various sources
        const postElement = document.querySelector('[data-post-id]');
        if (postElement) return postElement.dataset.postId;
        
        const url = window.location.pathname;
        const match = url.match(/\/post\/([^\/]+)/);
        if (match) return match[1];
        
        return null;
    }
    
    async loadUserData() {
        // Get current user from localStorage or token
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const response = await fetch(`${this.API_BASE}/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const userData = await response.json();
                    this.currentUserId = userData.id;
                }
            } catch (err) {
                console.error('Failed to load user data:', err);
            }
        }
    }
    
    async loadPostData(postId) {
        try {
            const response = await fetch(`${this.API_BASE}/posts/${postId}`);
            
            if (!response.ok) {
                throw new Error('Failed to load post data');
            }
            
            const postData = await response.json();
            this.updateModalUI(postData);
            
        } catch (err) {
            console.error('Error loading post data:', err);
        }
    }
    
    updateModalUI(postData) {
        // Update user info
        const postInfo = document.getElementById('modalPostInfo');
        if (postInfo && postData.user) {
            const img = postInfo.querySelector('.modal-profile-pic');
            const name = postInfo.querySelector('h4');
            const content = postInfo.querySelector('p');
            const stats = postInfo.querySelector('.modal-stats');
            
            img.src = postData.user.avatar_url || 'https://i.pravatar.cc/45';
            img.alt = postData.user.username;
            name.textContent = `@${postData.user.username}`;
            content.textContent = postData.content || '';
            
            stats.innerHTML = `
                <span><i class="far fa-heart"></i> ${postData.likes || 0}</span>
                <span><i class="far fa-comment"></i> ${postData.comments_count || 0}</span>
            `;
        }
        
        // Update action buttons
        const likeBtn = document.querySelector('.modal-like-btn');
        const likeCount = document.querySelector('.like-count');
        const commentCount = document.querySelector('.comment-count');
        const saveBtn = document.querySelector('.modal-save-btn');
        
        if (likeBtn) {
            likeBtn.classList.toggle('liked', postData.liked_by_me);
            likeBtn.innerHTML = `
                <i class="${postData.liked_by_me ? 'fas' : 'far'} fa-heart"></i>
                <span class="like-count">${postData.likes || 0}</span>
            `;
        }
        
        if (likeCount) {
            likeCount.textContent = postData.likes || 0;
        }
        
        if (commentCount) {
            commentCount.textContent = postData.comments_count || 0;
        }
        
        if (saveBtn) {
            saveBtn.classList.toggle('saved', postData.saved_by_me);
            saveBtn.innerHTML = `
                <i class="${postData.saved_by_me ? 'fas' : 'far'} fa-bookmark"></i>
            `;
        }
    }
    
    async handleAction(action) {
        if (!this.postId || !this.currentUserId) return;
        
        const token = localStorage.getItem('token');
        if (!token) {
            alert('Please login to perform this action');
            return;
        }
        
        try {
            let url, method, body;
            
            switch (action) {
                case 'like':
                    url = `${this.API_BASE}/posts/${this.postId}/like`;
                    method = 'POST';
                    break;
                    
                case 'save':
                    url = `${this.API_BASE}/posts/${this.postId}/save`;
                    method = 'POST';
                    break;
                    
                case 'comment':
                    // This will be handled by the comment button click
                    this.goToComments();
                    return;
                    
                case 'share':
                    this.sharePost();
                    return;
            }
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: body ? JSON.stringify(body) : undefined
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Update UI
                if (action === 'like') {
                    const likeBtn = document.querySelector('.modal-like-btn');
                    const likeCount = document.querySelector('.like-count');
                    
                    if (likeBtn && likeCount) {
                        likeBtn.classList.toggle('liked', result.liked);
                        likeBtn.innerHTML = `
                            <i class="${result.liked ? 'fas' : 'far'} fa-heart"></i>
                            <span class="like-count">${result.likes}</span>
                        `;
                        likeCount.textContent = result.likes;
                    }
                }
                
                if (action === 'save') {
                    const saveBtn = document.querySelector('.modal-save-btn');
                    if (saveBtn) {
                        saveBtn.classList.toggle('saved', result.saved);
                        saveBtn.innerHTML = `
                            <i class="${result.saved ? 'fas' : 'far'} fa-bookmark"></i>
                        `;
                    }
                }
                
            } else {
                console.error(`Failed to ${action} post`);
            }
            
        } catch (err) {
            console.error(`Error ${action}ing post:`, err);
        }
    }
    
    goToComments() {
        this.closeModal();
        
        // Scroll to comments section after a short delay
        setTimeout(() => {
            const commentsSection = document.getElementById('commentsSection') || 
                                   document.querySelector('.comments-section');
            
            if (commentsSection) {
                const offset = 80;
                const elementPosition = commentsSection.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - offset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
                
                // Highlight comments section
                commentsSection.style.boxShadow = '0 0 0 3px #1a73e8';
                setTimeout(() => {
                    commentsSection.style.boxShadow = 'none';
                }, 1500);
                
                // Focus on comment input if exists
                const commentInput = document.querySelector('.comment-input');
                if (commentInput) {
                    setTimeout(() => commentInput.focus(), 500);
                }
            }
        }, 300);
    }
    
    sharePost() {
        if (navigator.share) {
            navigator.share({
                title: 'Check out this post',
                text: 'I found this interesting post!',
                url: window.location.href
            });
        } else {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(window.location.href).then(() => {
                alert('Link copied to clipboard!');
            });
        }
    }
    
    setupEventListeners() {
        // Close modal buttons
        document.getElementById('closeModalBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('backToPostBtn').addEventListener('click', () => this.closeModal());
        
        // Comments button
        document.getElementById('modalCommentsBtn').addEventListener('click', () => this.goToComments());
        
        // Action buttons
        document.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('.modal-action-btn');
            if (actionBtn) {
                const action = actionBtn.dataset.action;
                this.handleAction(action);
            }
        });
        
        // Close modal on overlay click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (!this.isModalOpen) return;
            
            switch (e.key) {
                case 'Escape':
                    this.closeModal();
                    break;
                case ' ':
                case 'Spacebar':
                    e.preventDefault();
                    if (this.modalVideo.paused) {
                        this.modalVideo.play();
                    } else {
                        this.modalVideo.pause();
                    }
                    break;
                case 'ArrowLeft':
                    this.modalVideo.currentTime -= 10;
                    break;
                case 'ArrowRight':
                    this.modalVideo.currentTime += 10;
                    break;
                case 'c':
                case 'C':
                    this.goToComments();
                    break;
            }
        });
        
        // Handle browser back button
        window.addEventListener('hashchange', () => {
            if (window.location.hash !== '#video-modal' && this.isModalOpen) {
                this.closeModal();
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if there's a video on the page
    if (document.querySelector('video')) {
        window.videoModal = new VideoModal();
    }
});
