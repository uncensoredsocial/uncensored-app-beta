// payment.js — subscription payments (Monero-only for now)

const PAY_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class PaymentPage {
  constructor() {
    this.currentPlan = "monthly";
    this.currentPriceUsd = 8;
    this.currentCoin = "XMR";
    this.prices = {
      XMR: null
    };
    this.invoiceId = null;
    this.invoicePollInterval = null;
  }

  init() {
    if (!window.location.pathname.toLowerCase().includes("payment.html")) {
      return;
    }

    this.cacheDom();
    this.bindEvents();
    this.updatePlanUI();
    this.updateCoinUI();
    this.fetchLivePrices();
  }

  cacheDom() {
    this.planCards = document.querySelectorAll(".plan-card");
    this.coinCards = document.querySelectorAll(".coin-card");

    this.priceUsdLabel = document.getElementById("priceUsdLabel");
    this.priceCoinCode = document.getElementById("priceCoinCode");
    this.priceCoinLabel = document.getElementById("priceCoinLabel");
    this.priceSourceLabel = document.getElementById("priceSourceLabel");

    this.generateInvoiceBtn = document.getElementById("generateInvoiceBtn");

    this.invoiceSection = document.getElementById("invoiceSection");
    this.invoicePlanLabel = document.getElementById("invoicePlanLabel");
    this.invoiceAmountLabel = document.getElementById("invoiceAmountLabel");
    this.invoiceCurrencyLabel = document.getElementById("invoiceCurrencyLabel");
    this.invoiceStatusLabel = document.getElementById("invoiceStatusLabel");
    this.invoiceAddressText = document.getElementById("invoiceAddressText");
    this.copyAddressBtn = document.getElementById("copyAddressBtn");
    this.invoiceQrImage = document.getElementById("invoiceQrImage");
    this.confirmationsLabel = document.getElementById("confirmationsLabel");
    this.confirmationsBar = document.getElementById("confirmationsBar");

    this.toastContainer = document.getElementById("paymentStatusContainer");

    this.backButton = document.getElementById("paymentBackButton");
  }

  bindEvents() {
    if (this.backButton) {
      this.backButton.addEventListener("click", () => {
        history.back();
      });
    }

    // Plan cards
    if (this.planCards && this.planCards.length) {
      this.planCards.forEach((card) => {
        card.addEventListener("click", () => {
          const plan = card.dataset.plan || "monthly";
          const price = parseFloat(card.dataset.priceUsd || "8");
          this.currentPlan = plan;
          this.currentPriceUsd = price;
          this.updatePlanUI();
          this.updateConversionUI();
        });
      });
    }

    // Coin cards
    if (this.coinCards && this.coinCards.length) {
      this.coinCards.forEach((card) => {
        card.addEventListener("click", () => {
          const code = card.dataset.coin;
          const enabled = card.dataset.enabled === "true";

          if (!enabled) {
            this.showToast(
              "This payment method isn’t accepted yet. Use Monero (XMR) for now.",
              "info"
            );
            return;
          }

          this.currentCoin = code;
          this.updateCoinUI();
          this.updateConversionUI();
        });
      });
    }

    // Create invoice
    if (this.generateInvoiceBtn) {
      this.generateInvoiceBtn.addEventListener("click", () =>
        this.handleCreateInvoice()
      );
    }

    // Copy address
    if (this.copyAddressBtn) {
      this.copyAddressBtn.addEventListener("click", () =>
        this.copyAddress()
      );
    }
  }

  /* -------------------- UI helpers -------------------- */

  updatePlanUI() {
    if (!this.planCards) return;
    this.planCards.forEach((card) => {
      const plan = card.dataset.plan;
      if (plan === this.currentPlan) {
        card.classList.add("active");
      } else {
        card.classList.remove("active");
      }
    });

    if (this.priceUsdLabel) {
      this.priceUsdLabel.textContent = `$${this.currentPriceUsd.toFixed(2)} USD`;
    }

    if (this.invoicePlanLabel) {
      this.invoicePlanLabel.textContent =
        this.currentPlan === "yearly" ? "Yearly" : "Monthly";
    }
  }

  updateCoinUI() {
    if (!this.coinCards) return;
    this.coinCards.forEach((card) => {
      const code = card.dataset.coin;
      if (code === this.currentCoin) {
        card.classList.add("active");
      } else {
        card.classList.remove("active");
      }
    });

    if (this.priceCoinCode) {
      this.priceCoinCode.textContent = this.currentCoin;
    }
    if (this.invoiceCurrencyLabel) {
      this.invoiceCurrencyLabel.textContent = this.currentCoin;
    }
  }

  updateConversionUI() {
    if (!this.priceCoinLabel) return;

    if (this.currentCoin !== "XMR") {
      this.priceCoinLabel.textContent = "Not supported yet";
      return;
    }

    const price = this.prices.XMR;
    if (!price || !price.usd) {
      this.priceCoinLabel.textContent = "Loading…";
      return;
    }

    const amountCoin = this.currentPriceUsd / price.usd;
    this.priceCoinLabel.textContent = `${amountCoin.toFixed(6)} XMR`;
  }

  /* -------------------- Live prices -------------------- */

  async fetchLivePrices() {
    // Only fetching XMR for now
    try {
      this.priceSourceLabel.textContent = "CoinGecko · Loading…";

      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd"
      );
      const data = await res.json();

      const usd = data?.monero?.usd;
      if (!usd || typeof usd !== "number") {
        throw new Error("Bad price");
      }

      this.prices.XMR = { usd };
      this.priceSourceLabel.textContent = `CoinGecko · 1 XMR ≈ $${usd.toFixed(
        2
      )} USD`;

      this.updateConversionUI();
    } catch (err) {
      console.error("Price fetch error:", err);
      this.priceSourceLabel.textContent = "Price source unavailable";
      this.showToast(
        "Couldn’t load live XMR price. You can still generate an invoice.",
        "error"
      );
    }
  }

  /* -------------------- Invoice creation -------------------- */

  async handleCreateInvoice() {
    if (this.currentCoin !== "XMR") {
      this.showToast(
        "Only Monero (XMR) payments are accepted right now.",
        "error"
      );
      return;
    }

    // Get approximate amount in XMR
    let amountXmr = 0;
    const price = this.prices.XMR;
    if (price && typeof price.usd === "number") {
      amountXmr = this.currentPriceUsd / price.usd;
    } else {
      // Fall back to a placeholder (you can adjust manually if needed)
      amountXmr = 0.1;
    }

    try {
      this.generateInvoiceBtn.disabled = true;
      this.generateInvoiceBtn.textContent = "Creating invoice…";

      const token =
        typeof getAuthToken === "function" ? getAuthToken() : null;

      if (!token) {
        this.showToast("You must be logged in to subscribe.", "error");
        this.generateInvoiceBtn.disabled = false;
        this.generateInvoiceBtn.textContent = "Continue to payment";
        return;
      }

      const res = await fetch(`${PAY_API_BASE_URL}/payments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: this.currentPlan,
          currency: this.currentCoin,
          amount_crypto: amountXmr
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to create invoice");
      }

      this.invoiceId = data.id;
      this.renderInvoice(data);

      // Start polling for status every 15s
      this.startInvoicePolling();

      this.showToast("Invoice created. Send the payment to upgrade.", "success");
    } catch (err) {
      console.error("Create invoice error:", err);
      this.showToast(
        err.message || "Failed to create invoice. Try again.",
        "error"
      );
    } finally {
      this.generateInvoiceBtn.disabled = false;
      this.generateInvoiceBtn.textContent = "Continue to payment";
    }
  }

  renderInvoice(inv) {
    if (!this.invoiceSection) return;
    this.invoiceSection.style.display = "block";

    if (this.invoicePlanLabel) {
      this.invoicePlanLabel.textContent =
        inv.plan === "yearly" ? "Yearly" : "Monthly";
    }

    const amountUsd = inv.amount_usd ?? this.currentPriceUsd;
    const amountCrypto = inv.amount_crypto ?? 0;

    if (this.invoiceAmountLabel) {
      this.invoiceAmountLabel.textContent = `$${amountUsd.toFixed(
        2
      )} ≈ ${amountCrypto.toFixed(6)} ${inv.currency || "XMR"}`;
    }

    if (this.invoiceCurrencyLabel) {
      this.invoiceCurrencyLabel.textContent = inv.currency || "XMR";
    }

    if (this.invoiceAddressText) {
      this.invoiceAddressText.textContent = inv.address || "–";
    }

    // Status
    this.updateInvoiceStatus(inv.status || "pending");

    // Confirmations
    const confirmations = inv.confirmations || 0;
    const required = inv.required_confirmations || 10;
    this.updateConfirmations(confirmations, required);

    // QR
    if (this.invoiceQrImage && inv.qr_string) {
      const encoded = encodeURIComponent(inv.qr_string);
      // Using a public QR API (no secrets)
      this.invoiceQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`;
    }
  }

  updateInvoiceStatus(status) {
    if (!this.invoiceStatusLabel) return;

    this.invoiceStatusLabel.classList.remove(
      "status-pending",
      "status-paid",
      "status-confirmed"
    );

    if (status === "confirmed") {
      this.invoiceStatusLabel.textContent = "Payment confirmed";
      this.invoiceStatusLabel.classList.add("status-confirmed");
    } else if (status === "paid") {
      this.invoiceStatusLabel.textContent = "Payment received, waiting confirmations";
      this.invoiceStatusLabel.classList.add("status-paid");
    } else if (status === "expired") {
      this.invoiceStatusLabel.textContent = "Invoice expired";
    } else {
      this.invoiceStatusLabel.textContent = "Waiting for payment";
      this.invoiceStatusLabel.classList.add("status-pending");
    }
  }

  updateConfirmations(current, required) {
    if (this.confirmationsLabel) {
      this.confirmationsLabel.textContent = `${current} / ${required}`;
    }

    if (this.confirmationsBar) {
      const pct = Math.max(
        0,
        Math.min(100, (current / (required || 1)) * 100)
      );
      this.confirmationsBar.style.width = `${pct}%`;
    }
  }

  startInvoicePolling() {
    if (!this.invoiceId) return;

    if (this.invoicePollInterval) {
      clearInterval(this.invoicePollInterval);
    }

    const poll = async () => {
      try {
        const token =
          typeof getAuthToken === "function" ? getAuthToken() : null;
        if (!token) return;

        const res = await fetch(
          `${PAY_API_BASE_URL}/payments/status/${this.invoiceId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("Status poll error:", data);
          return;
        }

        this.renderInvoice(data);

        if (data.status === "confirmed") {
          this.showToast("Subscription activated. You’re now verified.", "success");
          clearInterval(this.invoicePollInterval);
          this.invoicePollInterval = null;
        }
      } catch (err) {
        console.error("Invoice poll error:", err);
      }
    };

    // immediate + interval
    poll();
    this.invoicePollInterval = setInterval(poll, 15000);
  }

  async copyAddress() {
    if (!this.invoiceAddressText) return;
    const text = this.invoiceAddressText.textContent.trim();
    if (!text || text === "–") return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        this.showToast("Address copied to clipboard.", "success");
      } else {
        this.showToast("Clipboard not available.", "error");
      }
    } catch {
      this.showToast("Could not copy address.", "error");
    }
  }

  /* -------------------- Toasts -------------------- */

  showToast(message, type = "info") {
    if (!this.toastContainer || !message) return;

    const div = document.createElement("div");
    div.className = `payment-toast ${type}`;

    let iconClass = "fa-circle-info";
    if (type === "error") iconClass = "fa-triangle-exclamation";
    if (type === "success") iconClass = "fa-check-circle";

    div.innerHTML = `
      <i class="fa-solid ${iconClass}"></i>
      <span>${message}</span>
    `;

    this.toastContainer.appendChild(div);

    setTimeout(() => {
      div.remove();
    }, 3000);
  }
}

/* =========================== INIT =========================== */

document.addEventListener("DOMContentLoaded", () => {
  const page = new PaymentPage();
  page.init();
  window.paymentPage = page;
});
