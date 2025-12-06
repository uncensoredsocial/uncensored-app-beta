// ============================================================
// Delete Account Settings Page
// ============================================================

class DeleteAccountSettingsPage {
  constructor() {
    this.confirmCheckbox = null;
    this.confirmTextInput = null;
    this.deleteButton = null;
    this.statusEl = null;
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.ensureAuthenticated();
  }

  cacheDom() {
    this.confirmCheckbox = document.getElementById("confirmCheckbox");
    this.confirmTextInput = document.getElementById("confirmText");
    this.deleteButton = document.getElementById("deleteAccountButton");
    this.statusEl = document.getElementById("deleteStatus");
  }

  bindEvents() {
    if (this.confirmCheckbox) {
      this.confirmCheckbox.addEventListener("change", () =>
        this.updateButtonState()
      );
    }

    if (this.confirmTextInput) {
      this.confirmTextInput.addEventListener("input", () =>
        this.updateButtonState()
      );
    }

    if (this.deleteButton) {
      this.deleteButton.addEventListener("click", () =>
        this.handleDeleteClick()
      );
    }
  }

  ensureAuthenticated() {
    try {
      const loggedIn =
        typeof isLoggedIn === "function" ? isLoggedIn() : !!this.getTokenFallback();
      if (!loggedIn) {
        this.setStatus("You must be logged in to delete your account.", "error");
        setTimeout(() => {
          window.location.href = "login.html";
        }, 1500);
      }
    } catch {
      // ignore if helper missing
    }
  }

  getTokenFallback() {
    try {
      if (typeof getAuthToken === "function") return getAuthToken();
    } catch {}
    try {
      return localStorage.getItem("authToken");
    } catch {
      return null;
    }
  }

  updateButtonState() {
    if (!this.deleteButton) return;

    const checkboxOk = this.confirmCheckbox?.checked;
    const textOk =
      (this.confirmTextInput?.value || "").trim().toUpperCase() === "DELETE";

    this.deleteButton.disabled = !(checkboxOk && textOk);
  }

  setStatus(message, type = "info") {
    if (!this.statusEl) return;
    this.statusEl.textContent = message || "";
    this.statusEl.className = "delete-status-message";
    if (type === "error") {
      this.statusEl.style.color = "var(--error-color, #ff4444)";
    } else if (type === "success") {
      this.statusEl.style.color = "var(--success-color, #00C851)";
    } else {
      this.statusEl.style.color = "var(--text-muted, #6e767d)";
    }
  }

  async handleDeleteClick() {
    if (!this.deleteButton) return;

    const ok = window.confirm(
      "Are you sure you want to permanently delete your account? This cannot be undone."
    );
    if (!ok) return;

    const token = this.getTokenFallback();
    if (!token) {
      this.setStatus("Missing auth token. Please log in again.", "error");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1500);
      return;
    }

    this.deleteButton.disabled = true;
    this.deleteButton.textContent = "Deleting...";
    this.setStatus("Deleting your account…", "info");

    try {
      const base =
        typeof API_BASE_URL !== "undefined"
          ? API_BASE_URL
          : "https://uncensored-app-beta-production.up.railway.app/api";

      // 🔥 Backend must implement this endpoint:
      // DELETE /api/account    (auth required)
      const res = await fetch(`${base}/account`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        const msg = data.error || "Failed to delete account.";
        throw new Error(msg);
      }

      this.setStatus("Your account has been deleted.", "success");
      this.clearAuthAndRedirect();
    } catch (err) {
      console.error("delete account error:", err);
      this.setStatus(err.message || "Something went wrong.", "error");
      this.deleteButton.disabled = false;
      this.deleteButton.textContent = "Delete my account forever";
    }
  }

  clearAuthAndRedirect() {
    try {
      if (typeof logout === "function") {
        logout();
      }
    } catch {
      // ignore
    }

    try {
      localStorage.removeItem("authToken");
      localStorage.removeItem("currentUser");
    } catch {
      // ignore
    }

    setTimeout(() => {
      window.location.href = "signup.html";
    }, 1500);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = new DeleteAccountSettingsPage();
  page.init();
  window.deleteAccountSettingsPage = page;
});
