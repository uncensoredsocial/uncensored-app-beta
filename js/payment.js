// payment.js — subscriptions & Monero payments

const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class PaymentPage {
  constructor() {
    // State
    this.selectedPlan = "monthly";
    this.selectedPlanPriceUsd = 8;
    this.selectedCoin = "XMR"; // only Monero is actually enabled right now

    this.pricesUsd = {}; // { BTC: 12345, XMR: 150, ... }
    this.currentInvoice = null;
    this.invoicePollInterval = null;
    this.invoiceCountdownInterval = null;
    this.INVOICE_LIFETIME_MS = 30 * 60 * 1000; // 30 minutes

    this.init();
  }

  // =========================
  // Init
  // =========================

  init() {
    this.cacheDom();
    this.bindEvents();
    this.fetchPrices();
    this.loadSubscriptionStatus();
    this.updatePriceSummary();
  }

  cacheDom() {
    // Plan
    this.planCards = document.querySelectorAll(".plan-card");
    this.priceUsdLabel = document.getElementById("priceUsdLabel");
    this.priceCoinCode = document.getElementById("priceCoinCode");
    this.priceCoinLabel = document.getElementById("priceCoinLabel");
    this.priceSourceLabel = document.getElementById("priceSourceLabel");

    // Coins
    this.coinCards = document.querySelectorAll(".coin-card");
    this.btcPriceUsd = document.getElementById("btcPriceUsd");
    this.ethPriceUsd = document.getElementById("ethPriceUsd");
    this.solPriceUsd = document.getElementById("solPriceUsd");
    this.usdcPriceUsd = document.getElementById("usdcPriceUsd");
    this.usdtPriceUsd = document.getElementById("usdtPriceUsd");
    this.xmrPriceUsd = document.getElementById("xmrPriceUsd");

    // Buttons
    this.generateInvoiceBtn = document.getElementById("generateInvoiceBtn");
    this.backButton = document.getElementById("paymentBackButton");

    // Invoice DOM
    this.invoiceSection = document.getElementById("invoiceSection");
    this.invoicePlanLabel = document.getElementById("invoicePlanLabel");
    this.invoiceAmountLabel = document.getElementById("invoiceAmountLabel");
    this.invoiceCurrencyLabel = document.getElementById("invoiceCurrencyLabel");
    this.invoiceStatusLabel = document.getElementById("invoiceStatusLabel");
    this.invoiceCountdownLabel = document.getElementById(
      "invoiceCountdownLabel"
    );
    this.invoiceAddressText = document.getElementById("invoiceAddressText");
    this.copyAddressBtn = document.getElementById("copyAddressBtn");
    this.invoiceQrImage = document.getElementById("invoiceQrImage");
    this.confirmationsLabel = document.getElementById("confirmationsLabel");
    this.confirmationsBar = document.getElementById("confirmationsBar");

    // Status / toast
    this.subscriptionStatusEl =
      document.getElementById("subscriptionStatus");
    this.toastContainer =
      document.getElementById("paymentStatusContainer");
  }

  bindEvents() {
    if (this.backButton) {
      this.backButton.addEventListener("click", () => {
        if (document.referrer) {
          history.back();
        } else {
          window.location.href = "index.html";
        }
      });
    }

    // Plan selection
    this.planCards.forEach((card) => {
      card.addEventListener("click", () => this.handlePlanClick(card));
    });

    // Coin selection
    this.coinCards.forEach((card) => {
      card.addEventListener("click", () => this.handleCoinClick(card));
    });

    if (this.generateInvoiceBtn) {
      this.generateInvoiceBtn.addEventListener("click", () =>
        this.handleGenerateInvoice()
      );
    }

    if (this.copyAddressBtn) {
      this.copyAddressBtn.addEventListener("click", () =>
        this.handleCopyAddress()
      );
    }
  }

  // =========================
  // Helpers
  // =========================

  getAuthToken() {
    try {
      if (typeof getAuthToken === "function") {
        return getAuthToken();
      }
    } catch (e) {
      // ignore
    }
    return (
      localStorage.getItem("authToken") ||
      localStorage.getItem("token") ||
      null
    );
  }

  async authedFetch(path, options = {}) {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error("Not logged in");
    }

    const headers = Object.assign(
      { "Content-Type": "application/json" },
      options.headers || {},
      { Authorization: `Bearer ${token}` }
    );

    const res = await fetch(`${PAYMENT_API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      let errMsg = "Request failed";
      try {
        const json = JSON.parse(text);
        errMsg = json.error || errMsg;
      } catch {
        // ignore
      }
      throw new Error(errMsg);
    }

    return res.json();
  }

  showToast(message, type = "info") {
    if (!this.toastContainer) return;

    const div = document.createElement("div");
    div.className = "payment-toast";
    if (type === "error") div.classList.add("payment-toast-error");
    if (type === "success") div.classList.add("payment-toast-success");
    div.textContent = message;

    this.toastContainer.appendChild(div);

    setTimeout(() => {
      div.style.opacity = "0";
      setTimeout(() => {
        div.remove();
      }, 200);
    }, 2500);
  }

  // =========================
  // Plan & coin selection
  // =========================

  handlePlanClick(card) {
    const plan = card.dataset.plan;
    const priceUsd = Number(card.dataset.priceUsd || "0");

    this.planCards.forEach((c) => c.classList.remove("active"));
    card.classList.add("active");

    this.selectedPlan = plan;
    this.selectedPlanPriceUsd = priceUsd || 8;

    this.updatePriceSummary();
  }

  handleCoinClick(card) {
    const enabled = card.dataset.enabled === "true";
    const coin = card.dataset.coin;

    if (!enabled) {
      this.showToast("This currency isn't accepted yet.", "error");
      return;
    }

    // Only XMR is actually enabled, but keep logic generic
    this.coinCards.forEach((c) => c.classList.remove("active"));
    card.classList.add("active");

    this.selectedCoin = coin || "XMR";
    if (this.priceCoinCode) {
      this.priceCoinCode.textContent = this.selectedCoin;
    }

    this.updatePriceSummary();
  }

  // =========================
  // Prices & conversion
  // =========================

  async fetchPrices() {
    try {
      // Simple public price API
      const url =
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,monero,usd-coin,tether&vs_currencies=usd";

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load prices");
      const data = await res.json();

      // Map to symbols
      this.pricesUsd = {
        BTC: data.bitcoin?.usd ?? null,
        ETH: data.ethereum?.usd ?? null,
        SOL: data.solana?.usd ?? null,
        XMR: data.monero?.usd ?? null,
        USDC: data["usd-coin"]?.usd ?? null,
        USDT: data.tether?.usd ?? null,
      };

      // Fill UI if elements exist
      if (this.btcPriceUsd && this.pricesUsd.BTC) {
        this.btcPriceUsd.textContent = `$${this.pricesUsd.BTC.toFixed(2)}`;
      }
      if (this.ethPriceUsd && this.pricesUsd.ETH) {
        this.ethPriceUsd.textContent = `$${this.pricesUsd.ETH.toFixed(2)}`;
      }
      if (this.solPriceUsd && this.pricesUsd.SOL) {
        this.solPriceUsd.textContent = `$${this.pricesUsd.SOL.toFixed(2)}`;
      }
      if (this.usdcPriceUsd && this.pricesUsd.USDC) {
        this.usdcPriceUsd.textContent = `$${this.pricesUsd.USDC.toFixed(2)}`;
      }
      if (this.usdtPriceUsd && this.pricesUsd.USDT) {
        this.usdtPriceUsd.textContent = `$${this.pricesUsd.USDT.toFixed(2)}`;
      }
      if (this.xmrPriceUsd && this.pricesUsd.XMR) {
        this.xmrPriceUsd.textContent = `$${this.pricesUsd.XMR.toFixed(2)}`;
      }

      if (this.priceSourceLabel) {
        this.priceSourceLabel.textContent = "Updated just now";
      }

      this.updatePriceSummary();
    } catch (err) {
      console.error("Price fetch error:", err);
      if (this.priceSourceLabel) {
        this.priceSourceLabel.textContent = "Price source unavailable";
      }
    }
  }

  getSelectedCoinPriceUsd() {
    return this.pricesUsd[this.selectedCoin] || null;
  }

  updatePriceSummary() {
    if (this.priceUsdLabel) {
      this.priceUsdLabel.textContent = `$${this.selectedPlanPriceUsd.toFixed(
        2
      )} USD`;
    }
    if (this.priceCoinCode) {
      this.priceCoinCode.textContent = this.selectedCoin;
    }

    const coinPrice = this.getSelectedCoinPriceUsd();
    if (!coinPrice || this.selectedCoin !== "XMR") {
      if (this.priceCoinLabel) {
        this.priceCoinLabel.textContent =
          this.selectedCoin === "XMR"
            ? "–"
            : "Not supported yet";
      }
      return;
    }

    const amountCrypto = this.selectedPlanPriceUsd / coinPrice;
    if (this.priceCoinLabel) {
      this.priceCoinLabel.textContent = `${amountCrypto.toFixed(
        6
      )} ${this.selectedCoin}`;
    }
  }

  // =========================
  // Subscription status
  // =========================

  async loadSubscriptionStatus() {
    if (!this.subscriptionStatusEl) return;

    try {
      const data = await this.authedFetch("/subscription/me", {
        method: "GET",
      });

      if (!data || !data.active) {
        this.subscriptionStatusEl.textContent =
          "No active subscription yet.";
        return;
      }

      const expires = data.expires_at
        ? new Date(data.expires_at)
        : null;

      this.subscriptionStatusEl.textContent = expires
        ? `Active ${data.plan} subscription. Expires on ${expires.toLocaleDateString()}.`
        : `Active ${data.plan} subscription.`;
    } catch (err) {
      // If endpoint doesn't exist yet, just show generic text
      this.subscriptionStatusEl.textContent =
        "Subscription will activate automatically after your payment confirms.";
    }
  }

  // =========================
  // Invoice creation
  // =========================

  async handleGenerateInvoice() {
    try {
      const token = this.getAuthToken();
      if (!token) {
        this.showToast("You need to be logged in to subscribe.", "error");
        window.location.href = "login.html";
        return;
      }

      if (this.selectedCoin !== "XMR") {
        this.showToast("Only Monero is accepted right now.", "error");
        return;
      }

      const coinPrice = this.getSelectedCoinPriceUsd();
      if (!coinPrice) {
        this.showToast("Price data not ready yet. Try again in a moment.", "error");
        return;
      }

      const amountCrypto = this.selectedPlanPriceUsd / coinPrice;

      const body = {
        plan: this.selectedPlan,
        currency: "XMR",
        amount_crypto: amountCrypto,
      };

      const invoice = await this.authedFetch("/payments/create", {
        method: "POST",
        body: JSON.stringify(body),
      });

      this.currentInvoice = invoice;
      this.showToast("Invoice created. Send the payment to upgrade.", "success");
      this.renderInvoice(invoice);
      this.startInvoiceCountdown();
      this.startInvoicePolling();
    } catch (err) {
      console.error("Create invoice error:", err);
      this.showToast(err.message || "Failed to create invoice.", "error");
    }
  }

  renderInvoice(invoice) {
    if (!this.invoiceSection) return;
    this.invoiceSection.style.display = "block";

    if (this.invoicePlanLabel) {
      this.invoicePlanLabel.textContent =
        invoice.plan === "yearly" ? "Yearly – $60" : "Monthly – $8";
    }

    if (this.invoiceAmountLabel) {
      const usd = Number(invoice.amount_usd || this.selectedPlanPriceUsd);
      const cryptoAmt = Number(invoice.amount_crypto || 0);
      this.invoiceAmountLabel.textContent = `${cryptoAmt.toFixed(
        6
      )} XMR (≈ $${usd.toFixed(2)})`;
    }

    if (this.invoiceCurrencyLabel) {
      this.invoiceCurrencyLabel.textContent = invoice.currency || "XMR";
    }

    if (this.invoiceStatusLabel) {
      this.invoiceStatusLabel.textContent =
        invoice.status || "pending";
    }

    if (this.invoiceAddressText) {
      this.invoiceAddressText.textContent = invoice.address || "–";
    }

    // Confirmations
    const confirmations = Number(invoice.confirmations || 0);
    const required = Number(invoice.required_confirmations || 10);
    this.updateConfirmations(confirmations, required);

    // QR
    const qrData =
      invoice.qr_string ||
      `monero:${invoice.address}?tx_amount=${invoice.amount_crypto}`;
    if (this.invoiceQrImage && qrData) {
      const qrUrl =
        "https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=" +
        encodeURIComponent(qrData);
      this.invoiceQrImage.src = qrUrl;
    }

    // Reset countdown label
    if (this.invoiceCountdownLabel) {
      this.invoiceCountdownLabel.textContent = "30:00";
    }
  }

  updateConfirmations(confirmations, required) {
    if (this.confirmationsLabel) {
      this.confirmationsLabel.textContent = `${confirmations} / ${required}`;
    }
    if (this.confirmationsBar) {
      const pct = Math.max(
        0,
        Math.min(100, (confirmations / required) * 100)
      );
      this.confirmationsBar.style.width = `${pct}%`;
    }
  }

  // =========================
  // Invoice countdown & polling
  // =========================

  startInvoiceCountdown() {
    if (this.invoiceCountdownInterval) {
      clearInterval(this.invoiceCountdownInterval);
    }

    const expiresAt = Date.now() + this.INVOICE_LIFETIME_MS;

    this.invoiceCountdownInterval = setInterval(() => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        clearInterval(this.invoiceCountdownInterval);
        this.invoiceCountdownInterval = null;

        if (this.invoiceCountdownLabel) {
          this.invoiceCountdownLabel.textContent = "Expired";
        }
        if (this.invoiceStatusLabel) {
          this.invoiceStatusLabel.textContent = "expired";
        }
        if (this.invoicePollInterval) {
          clearInterval(this.invoicePollInterval);
          this.invoicePollInterval = null;
        }
        return;
      }

      const totalSeconds = Math.floor(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const label =
        minutes.toString().padStart(2, "0") +
        ":" +
        seconds.toString().padStart(2, "0");

      if (this.invoiceCountdownLabel) {
        this.invoiceCountdownLabel.textContent = label;
      }
    }, 1000);
  }

  startInvoicePolling() {
    if (!this.currentInvoice) return;

    if (this.invoicePollInterval) {
      clearInterval(this.invoicePollInterval);
    }

    const invoiceId = this.currentInvoice.id;

    const poll = async () => {
      try {
        const invoice = await this.authedFetch(
          `/payments/status/${invoiceId}`,
          { method: "GET" }
        );
        this.currentInvoice = invoice;

        if (this.invoiceStatusLabel) {
          this.invoiceStatusLabel.textContent =
            invoice.status || "pending";
        }

        const confirmations = Number(invoice.confirmations || 0);
        const required = Number(invoice.required_confirmations || 10);
        this.updateConfirmations(confirmations, required);

        if (invoice.status === "confirmed") {
          this.showToast("Payment confirmed. Subscription activated.", "success");
          clearInterval(this.invoicePollInterval);
          this.invoicePollInterval = null;
          if (this.invoiceCountdownInterval) {
            clearInterval(this.invoiceCountdownInterval);
            this.invoiceCountdownInterval = null;
          }
          this.loadSubscriptionStatus();
        }
      } catch (err) {
        console.error("Invoice poll error:", err);
        // keep trying silently unless it’s long-term broken
      }
    };

    // Poll every 15 seconds
    poll();
    this.invoicePollInterval = setInterval(poll, 15000);
  }

  // =========================
  // Copy address
  // =========================

  async handleCopyAddress() {
    if (!this.invoiceAddressText) return;
    const text = this.invoiceAddressText.textContent.trim();
    if (!text || text === "–") return;

    try {
      await navigator.clipboard.writeText(text);
      this.showToast("Address copied.", "success");
    } catch {
      this.showToast("Could not copy address.", "error");
    }
  }
}

// Init once DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Only run on payment page
  if (document.body.classList.contains("payment-page-body")) {
    window.paymentPage = new PaymentPage();
  }
});
