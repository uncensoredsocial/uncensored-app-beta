// js/script.js
// Home page UI wiring: toggle auth state, character counter, nav active, sidebar, etc.

document.addEventListener('DOMContentLoaded', () => {
  const authButtons = document.getElementById('authButtons');
  const profileSection = document.getElementById('profileSection');
  const postCreation = document.getElementById('postCreation');
  const guestMessage = document.getElementById('guestMessage');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const profileMenuBtn = document.getElementById('profileMenuBtn');
  const closeSidebar = document.getElementById('closeSidebar');
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserHandle = document.getElementById('sidebarUserHandle');
  const sidebarProfileImg = document.getElementById('sidebarProfileImg');
  const headerProfileImg = document.getElementById('headerProfileImg');
  const postUserAvatar = document.getElementById('postUserAvatar');
  const charCounter = document.getElementById('charCounter');
  const postInput = document.getElementById('postInput');
  const postButton = document.getElementById('postButton');

  // ========= AUTH-DEPENDENT UI =========
  // uses helpers from auth.js: isLoggedIn(), getCurrentUser()

  function applyAuthState() {
    const loggedIn = typeof isLoggedIn === 'function' && isLoggedIn();
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;

    if (loggedIn && user) {
      // Show profile + post box
      if (authButtons) authButtons.style.display = 'none';
      if (profileSection) profileSection.style.display = 'flex';
      if (postCreation) postCreation.style.display = 'block';
      if (guestMessage) guestMessage.style.display = 'none';

      const avatarUrl = user.avatar_url || 'assets/icons/default-profile.png';
      const displayName = user.display_name || user.username || 'User';

      if (headerProfileImg) headerProfileImg.src = avatarUrl;
      if (postUserAvatar) postUserAvatar.src = avatarUrl;
      if (sidebarProfileImg) sidebarProfileImg.src = avatarUrl;
      if (sidebarUserName) sidebarUserName.textContent = displayName;
      if (sidebarUserHandle) sidebarUserHandle.textContent = '@' + (user.username || 'username');
    } else {
      // Guest view
      if (authButtons) authButtons.style.display = 'flex';
      if (profileSection) profileSection.style.display = 'none';
      if (postCreation) postCreation.style.display = 'none';
      if (guestMessage) guestMessage.style.display = 'block';
    }
  }

  applyAuthState();

  // ========= CHARACTER COUNTER / POST BUTTON =========
  if (postInput && charCounter && postButton) {
    const maxChars = 280;

    const updateCounter = () => {
      const len = postInput.value.length;
      charCounter.textContent = `${len}/${maxChars}`;

      charCounter.classList.remove('warning', 'error');

      if (len > 0 && len <= maxChars) {
        postButton.disabled = false;
      } else {
        postButton.disabled = true;
      }

      if (len > maxChars - 40 && len <= maxChars) {
        charCounter.classList.add('warning');
      } else if (len > maxChars) {
        charCounter.classList.add('error');
      }
    };

    postInput.addEventListener('input', updateCounter);
    updateCounter();
  }

  // ========= NAV ACTIVE STATE =========
  const navLinks = document.querySelectorAll('.side-nav .nav-item, .bottom-nav .nav-item');
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    if (href === currentPath) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // ========= SIDEBAR TOGGLE =========
  function openSidebar() {
    if (!sidebar || !sidebarOverlay) return;
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('open');
  }

  function closeSidebarFn() {
    if (!sidebar || !sidebarOverlay) return;
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
  }

  if (profileMenuBtn) {
    profileMenuBtn.addEventListener('click', openSidebar);
  }

  if (closeSidebar) {
    closeSidebar.addEventListener('click', closeSidebarFn);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebarFn);
  }

  // Make "Feeds: For You" toggle text between "For You" and "Following" (optional)
  const feedsToggle = document.getElementById('feedsToggle');
  if (feedsToggle) {
    feedsToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const span = feedsToggle.querySelector('span:last-child');
      if (!span) return;
      if (span.textContent.includes('For You')) {
        span.textContent = 'Feeds: Following';
      } else {
        span.textContent = 'Feeds: For You';
      }
    });
  }
});
