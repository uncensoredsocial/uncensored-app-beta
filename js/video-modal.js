// DOM Elements
const videoModal = document.getElementById('videoModal');
const openFullscreenModalBtn = document.getElementById('openFullscreenModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const backToPostBtn = document.getElementById('backToPostBtn');
const modalCommentsBtn = document.getElementById('modalCommentsBtn');
const scrollToCommentsBtn = document.getElementById('scrollToComments');
const postVideo = document.getElementById('postVideo');
const modalVideo = document.getElementById('modalVideo');

// Store video playback state
let videoPlaybackState = {
    currentTime: 0,
    isPlaying: false
};

// ===== OPEN MODAL =====
function openVideoModal() {
    // Save current video state
    videoPlaybackState.currentTime = postVideo.currentTime;
    videoPlaybackState.isPlaying = !postVideo.paused;
    
    // Pause the original video
    postVideo.pause();
    
    // Set modal video to same time
    modalVideo.currentTime = videoPlaybackState.currentTime;
    
    // Show modal with animation
    videoModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Play the modal video if original was playing
    if (videoPlaybackState.isPlaying) {
        modalVideo.play().catch(e => console.log('Autoplay prevented:', e));
    }
    
    // Update URL hash for deep linking
    window.location.hash = 'video-modal';
}

// ===== CLOSE MODAL =====
function closeVideoModal() {
    // Save modal video state
    videoPlaybackState.currentTime = modalVideo.currentTime;
    videoPlaybackState.isPlaying = !modalVideo.paused;
    
    // Pause modal video
    modalVideo.pause();
    
    // Hide modal
    videoModal.classList.remove('active');
    document.body.style.overflow = 'auto';
    
    // Restore original video state
    postVideo.currentTime = videoPlaybackState.currentTime;
    if (videoPlaybackState.isPlaying) {
        postVideo.play().catch(e => console.log('Playback error:', e));
    }
    
    // Clear URL hash
    if (window.location.hash === '#video-modal') {
        history.replaceState(null, null, ' ');
    }
}

// ===== BACK TO POST (from modal) =====
function backToPost() {
    closeVideoModal();
    
    // Smooth scroll to top of post
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// ===== GO TO COMMENTS (from modal) =====
function goToCommentsFromModal() {
    // Close modal first
    closeVideoModal();
    
    // Then scroll to comments
    setTimeout(() => {
        scrollToComments();
    }, 300); // Small delay for modal close animation
}

// ===== SCROLL TO COMMENTS =====
function scrollToComments() {
    const commentsSection = document.getElementById('commentsSection');
    if (commentsSection) {
        const offset = 80; // Account for any fixed headers
        const elementPosition = commentsSection.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;
        
        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
        
        // Add highlight animation
        commentsSection.style.boxShadow = '0 0 0 3px #1a73e8';
        setTimeout(() => {
            commentsSection.style.boxShadow = 'none';
        }, 1500);
        
        // Focus on comment input
        const commentInput = document.querySelector('.comment-input');
        if (commentInput) {
            setTimeout(() => {
                commentInput.focus();
            }, 500);
        }
    }
}

// ===== SYNC VIDEO PLAYBACK =====
function syncVideoPlayback() {
    // If user seeks in modal, update post video
    modalVideo.addEventListener('seeked', () => {
        postVideo.currentTime = modalVideo.currentTime;
    });
    
    // If user seeks in post video, update modal
    postVideo.addEventListener('seeked', () => {
        if (videoModal.classList.contains('active')) {
            modalVideo.currentTime = postVideo.currentTime;
        }
    });
    
    // Sync play/pause state
    modalVideo.addEventListener('play', () => {
        postVideo.play();
    });
    
    modalVideo.addEventListener('pause', () => {
        postVideo.pause();
    });
}

// ===== KEYBOARD CONTROLS =====
function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        // Only listen if modal is open
        if (!videoModal.classList.contains('active')) return;
        
        switch (e.key) {
            case 'Escape':
                closeVideoModal();
                break;
            case 'ArrowLeft':
                modalVideo.currentTime -= 10;
                break;
            case 'ArrowRight':
                modalVideo.currentTime += 10;
                break;
            case ' ':
            case 'Spacebar':
                e.preventDefault();
                if (modalVideo.paused) {
                    modalVideo.play();
                } else {
                    modalVideo.pause();
                }
                break;
            case 'c':
            case 'C':
                goToCommentsFromModal();
                break;
            case 'b':
            case 'B':
                backToPost();
                break;
        }
    });
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Open modal
    openFullscreenModalBtn.addEventListener('click', openVideoModal);
    
    // Close modal
    closeModalBtn.addEventListener('click', closeVideoModal);
    
    // Back to post
    backToPostBtn.addEventListener('click', backToPost);
    
    // Go to comments from modal
    modalCommentsBtn.addEventListener('click', goToCommentsFromModal);
    
    // Scroll to comments from post
    scrollToCommentsBtn.addEventListener('click', scrollToComments);
    
    // Close modal when clicking outside video
    videoModal.addEventListener('click', (e) => {
        if (e.target === videoModal) {
            closeVideoModal();
        }
    });
    
    // Handle browser back button
    window.addEventListener('hashchange', () => {
        if (window.location.hash !== '#video-modal' && videoModal.classList.contains('active')) {
            closeVideoModal();
        }
    });
}

// ===== INITIALIZE =====
function initializeVideoModal() {
    setupEventListeners();
    syncVideoPlayback();
    setupKeyboardControls();
    
    console.log('Video Modal System Initialized');
    console.log('Controls:');
    console.log('- ESC: Close modal');
    console.log('- Space: Play/Pause');
    console.log('- Arrow Left/Right: Seek 10s');
    console.log('- C: Go to Comments');
    console.log('- B: Back to Post');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeVideoModal);
