// js/settings.js

document.addEventListener('DOMContentLoaded', () => {
    /* -------------------------------------------
       Back arrow in header -> profile.html?user=me
    ------------------------------------------- */
    const backToProfileBtn = document.getElementById('settingsBackToProfile');
    if (backToProfileBtn) {
        backToProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'profile.html?user=me';
        });
    }

    /* -------------------------------------------
       Make entire settings card clickable
    ------------------------------------------- */
    const settingCards = document.querySelectorAll('.settings-link-card');
    settingCards.forEach((card) => {
        card.addEventListener('click', (e) => {
            const id = card.id;

            // Logout card: use global logout() from auth.js
            if (id === 'settingsLogoutBtn') {
                e.preventDefault();
                if (typeof logout === 'function') {
                    logout();
                } else {
                    // Fallback, just in case
                    localStorage.removeItem('us_auth_token');
                    localStorage.removeItem('us_current_user');
                    window.location.href = 'index.html';
                }
                return;
            }

            const href = card.getAttribute('href');
            if (href) {
                e.preventDefault();
                window.location.href = href;
            }
        });
    });

    /* -------------------------------------------
       "Back to Settings" buttons on detail pages
       (use data-back-to-settings attribute)
    ------------------------------------------- */
    const backToSettingsButtons = document.querySelectorAll('[data-back-to-settings]');
    backToSettingsButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'settings.html';
        });
    });

    /* -------------------------------------------
       Master notifications toggle (optional)
    ------------------------------------------- */
    const masterNotificationsToggle = document.getElementById('toggleNotifications');

    if (masterNotificationsToggle) {
        const perTypeToggles = [
            'toggleNotifyLikes',
            'toggleNotifyComments',
            'toggleNotifyReposts',
            'toggleNotifyFollows',
            'toggleNotifyMentions',
            'toggleNotifyDMs',
            'toggleNotifyGroups',
            'toggleNotifySystem'
        ]
            .map(id => document.getElementById(id))
            .filter(Boolean);

        let lastPerTypeState = null;

        masterNotificationsToggle.addEventListener('change', () => {
            if (!perTypeToggles.length) return;

            if (!masterNotificationsToggle.checked) {
                // Save previous state then turn all off
                lastPerTypeState = perTypeToggles.map(input => input.checked);
                perTypeToggles.forEach(input => {
                    input.checked = false;
                });
            } else {
                // Restore previous state or enable all if none saved
                if (lastPerTypeState && lastPerTypeState.length === perTypeToggles.length) {
                    perTypeToggles.forEach((input, idx) => {
                        input.checked = lastPerTypeState[idx];
                    });
                } else {
                    perTypeToggles.forEach(input => {
                        input.checked = true;
                    });
                }
            }

            // TODO: send to backend if needed
        });
    }

    /* -------------------------------------------
       Theme select (basic localStorage handling)
    ------------------------------------------- */
    const themeSelect = document.getElementById('selectTheme');
    if (themeSelect) {
        const storedTheme = localStorage.getItem('appTheme');
        if (storedTheme) {
            themeSelect.value = storedTheme;
            applyTheme(storedTheme);
        }

        themeSelect.addEventListener('change', () => {
            const value = themeSelect.value;
            localStorage.setItem('appTheme', value);
            applyTheme(value);
        });
    }

    /* -------------------------------------------
       Font-size select (basic localStorage handling)
    ------------------------------------------- */
    const fontSizeSelect = document.getElementById('selectFontSize');
    if (fontSizeSelect) {
        const storedSize = localStorage.getItem('appFontSize');
        if (storedSize) {
            fontSizeSelect.value = storedSize;
            applyFontSize(storedSize);
        }

        fontSizeSelect.addEventListener('change', () => {
            const value = fontSizeSelect.value;
            localStorage.setItem('appFontSize', value);
            applyFontSize(value);
        });
    }
});

/* Helper: apply theme by setting data attribute on <html> */
function applyTheme(value) {
    const root = document.documentElement;
    root.setAttribute('data-theme', value);
}

/* Helper: apply font size using a CSS variable */
function applyFontSize(value) {
    const root = document.documentElement;
    if (value === 'small') {
        root.style.setProperty('--app-font-size-base', '13px');
    } else if (value === 'large') {
        root.style.setProperty('--app-font-size-base', '17px');
    } else {
        root.style.setProperty('--app-font-size-base', '15px');
    }
}
