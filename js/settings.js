// js/settings.js

document.addEventListener('DOMContentLoaded', () => {
    // Top-left back arrow (Font Awesome) -> go to profile
    const backToProfileBtn = document.getElementById('settingsBackToProfile');
    if (backToProfileBtn) {
        backToProfileBtn.addEventListener('click', () => {
            window.location.href = 'profile.html?user=me';
        });
    }

    // "Back to Settings" buttons on detail pages (optional)
    const backToSettingsButtons = document.querySelectorAll('[data-back-to-settings]');
    backToSettingsButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
    });

    // Make entire settings-card clickable even if clicking on text
    const settingCards = document.querySelectorAll('.settings-link-card');
    settingCards.forEach((card) => {
        card.addEventListener('click', (e) => {
            // If it's already an <a>, browser handles navigation, but this ensures
            // clicks on inner elements also trigger it cleanly.
            const href = card.getAttribute('href');
            if (href) {
                window.location.href = href;
            }
        });
    });

    // Optional: handle "master" notifications toggle if present
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

        // Remember last per-type state so we can restore when turning master back on
        let lastPerTypeState = null;

        masterNotificationsToggle.addEventListener('change', () => {
            if (!perTypeToggles.length) return;

            if (!masterNotificationsToggle.checked) {
                // Save state
                lastPerTypeState = perTypeToggles.map(input => input.checked);
                // Turn all off
                perTypeToggles.forEach(input => {
                    input.checked = false;
                });
            } else {
                // Restore previous state if we have it, else enable all
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

            // Here is where you’d call your API to persist these changes
            // e.g. saveNotificationSettings(masterNotificationsToggle.checked, perTypeToggles)
        });
    }

    // Hook for theme toggle (if present)
    const themeSelect = document.getElementById('selectTheme');
    if (themeSelect) {
        // Load stored theme from localStorage (just as a start)
        const storedTheme = localStorage.getItem('appTheme');
        if (storedTheme) {
            themeSelect.value = storedTheme;
            applyTheme(storedTheme);
        }

        themeSelect.addEventListener('change', () => {
            const value = themeSelect.value;
            localStorage.setItem('appTheme', value);
            applyTheme(value);
            // You can also send this to your backend / Supabase here
        });
    }

    // Example: simple font-size handling
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

/* Helper: apply theme (you can customize this with your existing CSS setup) */
function applyTheme(value) {
    const root = document.documentElement;

    // This assumes your main theme is already dark; we just set a data attribute
    // you can use in CSS if you want:
    // html[data-theme="light"] {...} etc.
    root.setAttribute('data-theme', value);
}

/* Helper: apply font size */
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
