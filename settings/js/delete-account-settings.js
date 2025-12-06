// delete-account-settings.js
// Handles "Delete my account" flow on delete-account-settings.html

const SETTINGS_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class DeleteAccountPage {
  constructor() {
    this.confirmCheckbox = null;
    this.confirmTextInput = null;
    this.deleteButton = null;
  }

  init() {
    // DOM cache
    this.confirmCheckbox = document.getElementById("confirmCheckbox");
    this.confirmTextInput = document.getElementById("confirmTextInput");
    this.deleteButton = document.getElementById("deleteAccountButton");

    // Require auth
    const currentUser = this.getCurrentUserSafe();
    if (!currentUser) {
      // not logged in -> send to login
      window.location.href = "login.html";
      return;
    }

    // Events
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

  /* ========= Auth helpers ========= */

  getCurrentUserSafe() {
    try {
      return typeof getCurrentUser === "function" ? getCurrentUser() : null;
    } catch {
      return null;
    }
  }

  getAuthTokenSafe() {
    try {
      return typeof getAuthToken === "function" ? getAuthToken() : null;
    } catch {
      return null;
    }
  }

  logoutLocal() {
    // If auth.js exposes a logout function, use it; otherwise clear localStorage
    try {
      if (typeof logout === "function") {
        logout();
        return;
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
  }

  /* ========= UI helpers ========= */

  updateButtonState() {
    if (!this.deleteButton || !this.confirmCheckbox || !this.confirmTextInput) return;

    const checked = this.confirmCheckbox.checked;
    const textOk = this.confirmTextInput.value.trim().toUpperCase() === "DELETE";

    this.deleteButton.disabled = !(checked && textOk);
  }

  showToast(message, type = "info") {
    if (!message) return;

    const old = document.querySelector(".status-message");
    if (old) old.remove();

    const d = document.createElement("div");
    d.className = `status-message status-${type}`;
    d.textContent = message;
    d.style.position = "fixed";
    d.style.top = "70px";
    d.style.left = "50%";
    d.style.transform = "translateX(-50%)";
    d.style.padding = "8px 14px";
    d.style.borderRadius = "999px";
    d.style.background =
      type === "error"
        ? "#3b0f0f"
        : type === "success"
        ? "#0f3b1f"
        : "#111";
    d.style.border = "1px solid #333";
    d.style.color = "#fff";
    d.style.zIndex = "9999";

    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }

  /* ========= Delete logic ========= */

  async handleDeleteClick() {
    if (!this.deleteButton) return;

    const token = this.getAuthTokenSafe();
    if (!token) {
      this.showToast("Missing auth token.", "error");
      return;
    }

    // final confirmation
    const sure = window.confirm(
      "Are you absolutely sure you want to permanently delete your account and all associated data? This cannot be undone."
    );
    if (!sure) return;

    this.deleteButton.disabled = true;
    this.deleteButton.textContent = "Deleting...";

    try {
      // Adjust this endpoint to whatever you implement on the backend.
      // Recommended backend route: DELETE /api/account
      const res = await fetch(`${SETTINGS_API_BASE_URL}/account`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      // clear auth + redirect
      this.logoutLocal();
      this.showToast("Account deleted successfully.", "success");

      // small delay so toast is visible, then send to signup/landing
      setTimeout(() => {
        window.location.href = "signup.html";
      }, 800);
    } catch (err) {
      console.error("Delete account error:", err);
      this.showToast(err.message || "Failed to delete account.", "error");
      this.deleteButton.disabled = false;
      this.deleteButton.textContent = "Delete my account permanently";
    }
  }
}

/* ========= Init ========= */

document.addEventListener("DOMContentLoaded", () => {
  const page = new DeleteAccountPage();
  page.init();
  window.deleteAccountPage = page;
});
