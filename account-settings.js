// Account Settings page logic
// Requires auth.js helpers: isLoggedIn(), getCurrentUser(), getAuthToken(), setCurrentUser (or localStorage fallback)

const ACCOUNT_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class AccountSettingsPage {
  constructor() {
    this.form = null;
    this.saveButton = null;
    this.statusEl = null;

    this.displayNameValueEl = null;

    this.inputs = {
      username: null,
      email: null,
      phone: null,
    };
  }

  init() {
    // Only run on account-settings.html
    if (!window.location.pathname.toLowerCase().includes("account-settings")) {
      return;
    }

    this.cacheDom();
    this.bindEvents();
    this.guardAuth();

    // Fill from cached currentUser immediately so it shows up
    this.prefillFromLocal();

    // Then pull fresh data from backend so it’s 100% accurate
    this.fetchFreshProfile();
  }

  cacheDom() {
    this.form = document.getElementById("accountSettingsForm");
    this.saveButton = document.getElementById("accountSaveButton");
    this.statusEl = document.getElementById("accountSettingsStatus");

    this.displayNameValueEl = document.getElementById("displayNameValue");

    this.inputs.username = document.getElementById("usernameInput");
    this.inputs.email = document.getElementById("emailInput");
    this.inputs.phone = document.getElementById("phoneInput");
  }

  bindEvents() {
    if (this.form) {
      this.form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
    }
  }

  guardAuth() {
    try {
      if (typeof isLoggedIn === "function" && !isLoggedIn()) {
        window.location.href = "login.html";
      }
    } catch {
      // ignore
    }
  }

  /* ---------- PREFILL FROM LOCAL USER (instant display name) ---------- */

  prefillFromLocal() {
    let user = null;
    try {
      if (typeof getCurrentUser === "function") {
        user = getCurrentUser();
      } else {
        const raw = localStorage.getItem("currentUser");
        if (raw) user = JSON.parse(raw);
      }
    } catch {
      user = null;
    }

    if (!user) return;

    // display name (read-only)
    if (this.displayNameValueEl) {
      this.displayNameValueEl.textContent =
        user.display_name || user.name || user.username || "";
    }

    if (this.inputs.username && user.username) {
      this.inputs.username.value = user.username;
    }
    if (this.inputs.email && user.email) {
      this.inputs.email.value = user.email;
    }
    if (this.inputs.phone && (user.phone || user.phone_number)) {
      this.inputs.phone.value = user.phone || user.phone_number;
    }
  }

  /* ---------- FETCH FRESH PROFILE FROM BACKEND ---------- */

  async fetchFreshProfile() {
    const token = this.getAuthTokenSafe();
    if (!token) return;

    try {
      const res = await fetch(`${ACCOUNT_API_BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.warn("GET /users/me failed:", res.status);
        return;
      }

      const data = await res.json();
      this.applyProfileToForm(data);
      this.updateLocalUser(data);
    } catch (err) {
      console.error("fetchFreshProfile error:", err);
    }
  }

  applyProfileToForm(user) {
    if (!user) return;

    if (this.displayNameValueEl) {
      this.displayNameValueEl.textContent =
        user.display_name || user.name || user.username || "";
    }

    if (this.inputs.username) {
      this.inputs.username.value = user.username || "";
    }
    if (this.inputs.email) {
      this.inputs.email.value = user.email || "";
    }
    if (this.inputs.phone) {
      this.inputs.phone.value = user.phone || user.phone_number || "";
    }
  }

  /* ---------- SAVE HANDLER ---------- */

  async handleSubmit() {
    if (!this.form || !this.saveButton) return;

    const token = this.getAuthTokenSafe();
    if (!token) {
      this.showStatus("You must be logged in to update your account.", "error");
      return;
    }

    const username = this.inputs.username?.value.trim() || null;
    const email = this.inputs.email?.value.trim() || null;
    const phone = this.inputs.phone?.value.trim() || null;

    // very simple username validation
    if (username && !/^[a-zA-Z0-9_]+$/.test(username)) {
      this.showStatus(
        "Username can only contain letters, numbers, and underscores.",
        "error"
      );
      return;
    }

    const payload = { username, email, phone };

    this.setSaving(true);
    this.showStatus("Saving…", null);

    try {
      const res = await fetch(`${ACCOUNT_API_BASE_URL}/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg =
          data.error ||
          data.message ||
          "Could not update account settings.";
        throw new Error(errMsg);
      }

      // success – update UI + local cache
      this.applyProfileToForm(data);
      this.updateLocalUser(data);
      this.showStatus("Account updated.", "success");
    } catch (err) {
      console.error("Account settings save error:", err);
      this.showStatus(err.message || "Failed to save changes.", "error");
    } finally {
      this.setSaving(false);
    }
  }

  setSaving(isSaving) {
    if (!this.saveButton) return;
    this.saveButton.disabled = isSaving;
    this.saveButton.textContent = isSaving ? "Saving…" : "Save changes";
  }

  showStatus(message, type) {
    if (!this.statusEl) return;
    this.statusEl.textContent = message || "";

    this.statusEl.classList.remove("success", "error");
    if (type === "success") this.statusEl.classList.add("success");
    if (type === "error") this.statusEl.classList.add("error");
  }

  getAuthTokenSafe() {
    try {
      if (typeof getAuthToken === "function") {
        return getAuthToken();
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  // Keep local currentUser in sync with backend
  updateLocalUser(data) {
    if (!data) return;

    try {
      if (typeof setCurrentUser === "function") {
        setCurrentUser(data);
      } else {
        localStorage.setItem("currentUser", JSON.stringify(data));
      }
    } catch (err) {
      console.warn("Could not update local currentUser cache:", err);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = new AccountSettingsPage();
  page.init();
  window.accountSettingsPage = page;
});
