// Account Settings page logic
// - Requires auth.js helpers: isLoggedIn(), getCurrentUser(), getAuthToken()
// - Backend endpoints assumed:
//     GET   /api/users/me
//     PATCH /api/users/me   (JSON body with fields to update)

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
      phone: null
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
    this.prefillFromLocal();
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

  // Prefill from cached currentUser
  prefillFromLocal() {
    let user = null;
    try {
      if (typeof getCurrentUser === "function") {
        user = getCurrentUser();
      }
    } catch {
      user = null;
    }

    if (!user) return;

    if (this.displayNameValueEl) {
      this.displayNameValueEl.textContent =
        user.display_name || user.username || "";
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

  // Pull a fresh copy from backend
  async fetchFreshProfile() {
    const token = this.getAuthTokenSafe();
    if (!token) return;

    try {
      const res = await fetch(`${ACCOUNT_API_BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        console.warn("Could not fetch /users/me", res.status);
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
        user.display_name || user.username || "";
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

  async handleSubmit() {
    if (!this.form || !this.saveButton) return;

    const token = this.getAuthTokenSafe();
    if (!token) {
      this.showStatus("You must be logged in to update your account.", "error");
      return;
    }

    const payload = {
      username: this.inputs.username?.value.trim() || null,
      email: this.inputs.email?.value.trim() || null,
      phone: this.inputs.phone?.value.trim() || null
    };

    // Simple username validation
    if (payload.username && !/^[a-zA-Z0-9_]+$/.test(payload.username)) {
      this.showStatus(
        "Username can only contain letters, numbers, and underscores.",
        "error"
      );
      return;
    }

    this.setSaving(true);
    this.showStatus("Saving…", null);

    try {
      const res = await fetch(`${ACCOUNT_API_BASE_URL}/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg =
          data.error ||
          data.message ||
          "Could not update account settings.";
        throw new Error(errMsg);
      }

      this.showStatus("Account updated.", "success");
      this.applyProfileToForm(data);
      this.updateLocalUser(data);
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
      // ignore
    }
    return null;
  }

  // Keep local currentUser in sync
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

// init on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  const page = new AccountSettingsPage();
  page.init();
  window.accountSettingsPage = page;
});
