// js/setup-profile.js

document.addEventListener('DOMContentLoaded', () => {
  // If not logged in, send to signup/login
  if (!isLoggedIn || !isLoggedIn()) {
    window.location.href = 'signup.html';
    return;
  }

  const displayNameInput = document.getElementById('displayName');
  const bioInput = document.getElementById('bio');
  const avatarInput = document.getElementById('avatarUrl');
  const bannerInput = document.getElementById('bannerUrl');
  const bioCounter = document.getElementById('bioCounter');
  const avatarPreview = document.getElementById('setupAvatarPreview');
  const form = document.getElementById('profileSetupForm');
  const msg = document.getElementById('setupMessage');
  const submitBtn = document.getElementById('setupSubmitBtn');
  const skipBtn = document.getElementById('skipSetupBtn');

  function showMsg(text, type = 'error') {
    if (!msg) return;
    msg.textContent = text;
    msg.classList.remove('hidden', 'auth-error', 'auth-success');
    msg.classList.add(type === 'success' ? 'auth-success' : 'auth-error');
  }

  // Prefill from current user if available
  const localUser = getCurrentUser && getCurrentUser();
  if (localUser) {
    if (displayNameInput) displayNameInput.value = localUser.display_name || '';
    if (bioInput) bioInput.value = localUser.bio || '';
    if (avatarInput) avatarInput.value = localUser.avatar_url || '';
    if (bannerInput) bannerInput.value = localUser.banner_url || '';
    if (avatarPreview && localUser.avatar_url) avatarPreview.src = localUser.avatar_url;
    if (bioInput && bioCounter) bioCounter.textContent = `${bioInput.value.length}/160`;
  }

  // Live avatar preview
  if (avatarInput && avatarPreview) {
    avatarInput.addEventListener('input', () => {
      const url = avatarInput.value.trim();
      avatarPreview.src = url || 'assets/icons/default-profile.png';
    });
  }

  // Bio counter
  if (bioInput && bioCounter) {
    bioInput.addEventListener('input', () => {
      const len = bioInput.value.length;
      bioCounter.textContent = `${len}/160`;
      bioCounter.classList.toggle('warning', len > 140 && len <= 160);
      bioCounter.classList.toggle('error', len > 160);
    });
  }

  // Save + continue
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
        display_name: displayNameInput?.value.trim() || localUser?.display_name || '',
        bio: bioInput?.value.trim() || '',
        avatar_url: avatarInput?.value.trim() || null,
        banner_url: bannerInput?.value.trim() || null
      };

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || 'Failed to update profile');
        }

        // Update local user cache
        if (setCurrentUser) {
          setCurrentUser(data);
        }

        showMsg('Profile updated! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 600);
      } catch (err) {
        console.error('setup profile error:', err);
        showMsg(err.message || 'Failed to save profile');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Continue to Home';
      }
    });
  }

  // Skip button: just go to home
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
});
