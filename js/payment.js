// payment.js — subscription + Monero invoice flow

const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

class PaymentPage {
  constructor() {
    // state
    this.currentPlan = "monthly"; // "monthly" | "yearly"
    this.planUsd = 8;
    this.selectedCurrency = "XMR"; // only real one for now

    this.pricesUsd = {}; // { BTC: 12345, XMR: 123, ... }
    this.currentXmrAmount = null;

    this.invoiceId = null;
    this.countdownTimer = null;
    this.statusPollTimer = null;
    this.countdownEndMs = null;

    this.cacheDom();
    this.bindEvents();
    this.loadPrices();
    this.updatePlanSummary();
  }

  // ========= helpers =========

  cacheDom() {
    // header
    this.backBtn = document.getElementById("paymentBackButton");

    // plan cards
    this.planCards = Array.from(
      document.querySelectorAll(".plan-card[data-plan]")
    );

    // coin cards
    this.coinCards = Array.from(
      document.querySelectorAll(".coin-card[data-currency]")
    );

    // summary + price labels
    this.priceUsdLabel = document.getElementById("priceUsdLabel");
    this.priceCoinCode = document.getElementById("priceCoinCode");
    this.priceCoinLabel = document.getElementById("priceCoinLabel");
    this.summaryPlanLabel = document.getElementById("summaryPlanLabel");
    this.summaryXmrAmount = document.getElementById("summaryXmrAmount");

    // per-coin price labels (optional; ok if missing)
    this.btcPriceUsd = document.getElementById("btcPriceUsd");
    this.ethPriceUsd = document.getElementById("ethPriceUsd");
    this.solPriceUsd = document.getElementById("solPriceUsd");
    this.usdcPriceUsd = document.getElementById("usdcPriceUsd");
    this.usdtPriceUsd = document.getElementById("usdtPriceUsd");
    this.xmrPriceUsd = document.getElementById("xmrPriceUsd");

    // continue button
    this.continueBtn = document.getElementById("continueToPaymentBtn");

    // invoice elements
    this.invoiceSection = document.getElementById("invoiceSection");
    this.invoiceAmountXmr = document.getElementById("invoiceAmountXmr");
    this.invoiceAmountUsd = document.getElementById("invoiceAmountUsd");
    this.invoiceAddress = document.getElementById("invoiceAddress");
    this.copyAddressBtn = document.getElementById("copyAddressBtn");
    this.invoiceQr = document.getElementById("invoiceQr");
    this.invoiceStatus = document.getElementById("invoiceStatus");
    this.invoiceCountdown = document.getElementById("invoiceCountdown");

    this.toastContainer = document.getElementById("paymentStatusContainer");
  }

  bindEvents() {
    if (this.backBtn) {
      this.backBtn.addEventListener("click", () => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = "index.html";
        }
      });
    }

    // plan card click
    this.planCards.forEach((card) => {
      card.addEventListener("click", () => {
        const plan = card.dataset.plan === "yearly" ? "yearly" : "monthly";
        this.setPlan(plan);
      });
    });

    // coin card click
    this.coinCards.forEach((card) => {
      card.addEventListener("click", () => {
        const ccy = card.dataset.currency || "XMR";
        this.setCurrency(ccy);
      });
    });

    // continue to payment
    if (this.continueBtn) {
      this.continueBtn.addEventListener("click", () => {
        this.handleContinueToPayment();
      });
    }

    // copy address
    if (this.copyAddressBtn) {
      this.copyAddressBtn.addEventListener("click", () =>
        this.copyAddress()
      );
    }
  }

  getAuthToken() {
    try {
      return (
        localStorage.getItem("authToken") ||
        localStorage.getItem("token") ||
        null
      );
    } catch {
      return null;
    }
  }

  // ========= state setters =========

  setPlan(plan) {
    this.currentPlan = plan === "yearly" ? "yearly" : "monthly";
    this.planUsd = this.currentPlan === "yearly" ? 60 : 8;

    this.planCards.forEach((card) => {
      const p = card.dataset.plan;
      card.classList.toggle("active", p === this.currentPlan);
    });

    this.updatePlanSummary();
    this.updateXmrAmount();
  }

  setCurrency(ccy) {
    this.selectedCurrency = ccy;

    this.coinCards.forEach((card) => {
      const cardCcy = card.dataset.currency;
      card.classList.toggle("active", cardCcy === this.selectedCurrency);
    });

    if (this.priceCoinCode) {
      this.priceCoinCode.textContent = this.selectedCurrency;
    }

    // only Monero is actually supported right now
    if (this.selectedCurrency !== "XMR") {
      this.showToast(
        `${this.selectedCurrency} isn’t supported yet. Use Monero (XMR) for now.`,
        "info"
      );
    }

    this.updateXmrAmount();
  }

  updatePlanSummary() {
    if (this.priceUsdLabel) {
      this.priceUsdLabel.textContent = `$${this.planUsd.toFixed(2)} USD`;
    }

    if (this.summaryPlanLabel) {
      const label =
        this.currentPlan === "yearly"
          ? "Yearly • $60.00"
          : "Monthly • $8.00";
      this.summaryPlanLabel.textContent = label;
    }
  }

  updateXmrAmount() {
    const xmr = this.pricesUsd["XMR"];
    if (!xmr || !Number.isFinite(xmr) || xmr <= 0) {
      // still loading price
      if (this.summaryXmrAmount) {
        this.summaryXmrAmount.textContent = "— XMR (loading price…)";
      }
      if (this.priceCoinLabel) {
        this.priceCoinLabel.textContent = "—";
      }
      return;
    }

    const amount = this.planUsd / xmr;
    this.currentXmrAmount = amount;

    if (this.priceCoinLabel) {
      this.priceCoinLabel.textContent = `${amount.toFixed(6)} XMR`;
    }
    if (this.summaryXmrAmount) {
      this.summaryXmrAmount.textContent = `${amount.toFixed(6)} XMR`;
    }
  }

  // ========= price loading =========

  async loadPrices() {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,monero,usd-coin,tether&vs_currencies=usd"
      );
      if (!res.ok) throw new Error("price request failed");
      const data = await res.json();

      this.pricesUsd = {
        BTC: data.bitcoin?.usd,
        ETH: data.ethereum?.usd,
        SOL: data.solana?.usd,
        USDC: data["usd-coin"]?.usd,
        USDT: data.tether?.usd,
        XMR: data.monero?.usd,
      };

      // update labels if present
      if (this.btcPriceUsd && this.pricesUsd.BTC) {
        this.btcPriceUsd.textContent = `$${this.pricesUsd.BTC
          .toFixed(2)
          .toLocaleString()}`;
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

      this.updateXmrAmount();
    } catch (err) {
      console.error("Failed to load prices", err);
      this.showToast(
        "Could not load live prices. Try again in a moment.",
        "error"
      );
    }
  }

  // ========= invoice flow =========

  async handleContinueToPayment() {
    const token = this.getAuthToken();
    if (!token) {
      this.showToast("Please log in first.", "error");
      window.location.href = "login.html";
      return;
    }

    if (this.selectedCurrency !== "XMR") {
      this.showToast(
        `${this.selectedCurrency} isn’t supported yet. Use Monero (XMR) for now.`,
        "error"
      );
      return;
    }

    if (!this.currentXmrAmount) {
      this.showToast("Still loading Monero price. Try again in a few seconds.", "error");
      return;
    }

    try {
      this.continueBtn.disabled = true;

      const body = {
        plan: this.currentPlan,
        currency: "XMR",
        amount_crypto: this.currentXmrAmount,
      };

      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to create invoice");
      }

      const invoice = await res.json();
      this.invoiceId = invoice.id;

      this.showInvoice(invoice);
      this.showToast("Invoice created. Send your Monero payment.", "success");
    } catch (err) {
      console.error("create invoice error", err);
      this.showToast(err.message || "Failed to start payment.", "error");
    } finally {
      if (this.continueBtn) this.continueBtn.disabled = false;
    }
  }

  showInvoice(invoice) {
    if (!this.invoiceSection) return;

    // show section
    this.invoiceSection.hidden = false;

    const amtXmr = Number(invoice.amount_crypto || this.currentXmrAmount || 0);
    if (this.invoiceAmountXmr) {
      this.invoiceAmountXmr.textContent = amtXmr
        ? `${amtXmr.toFixed(6)} XMR`
        : "— XMR";
    }

    if (this.invoiceAmountUsd) {
      this.invoiceAmountUsd.textContent = `≈ $${(invoice.amount_usd || this.planUsd).toFixed(
        2
      )}`;
    }

    if (this.invoiceAddress) {
      this.invoiceAddress.textContent = invoice.address || "—";
    }

    if (this.invoiceStatus) {
      this.invoiceStatus.textContent =
        invoice.status === "confirmed"
          ? "Payment confirmed"
          : invoice.status === "paid"
          ? "Payment detected, waiting for confirmations…"
          : "Waiting for payment…";
    }

    // QR (we build from qr_string)
    if (this.invoiceQr && invoice.qr_string) {
      const encoded = encodeURIComponent(invoice.qr_string);
      this.invoiceQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encoded}`;
    }

    // countdown ~30 minutes from now
    this.startCountdown(30 * 60);

    // start polling status
    this.startStatusPolling();
  }

  startCountdown(seconds) {
    if (!this.invoiceCountdown) return;

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }

    this.countdownEndMs = Date.now() + seconds * 1000;

    const tick = () => {
      const remainingMs = this.countdownEndMs - Date.now();
      if (remainingMs <= 0) {
        this.invoiceCountdown.textContent = "00:00";
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        if (this.invoiceStatus) {
          this.invoiceStatus.textContent =
            "Invoice window expired. If you already paid, it may still confirm.";
        }
        return;
      }
      const s = Math.floor(remainingMs / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      this.invoiceCountdown.textContent = `${mm}:${ss}`;
    };

    tick();
    this.countdownTimer = setInterval(tick, 1000);
  }

  startStatusPolling() {
    if (!this.invoiceId) return;

    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
    }

    const token = this.getAuthToken();
    if (!token) return;

    const poll = async () => {
      try {
        const res = await fetch(
          `${PAYMENT_API_BASE_URL}/payments/status/${this.invoiceId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) return;
        const invoice = await res.json();

        if (this.invoiceStatus) {
          let text = "";
          if (invoice.status === "confirmed") {
            text = "Payment confirmed. Subscription active.";
          } else if (invoice.status === "paid") {
            text = `Payment detected, confirmations: ${
              invoice.confirmations || 0
            } / ${invoice.required_confirmations || 10}`;
          } else {
            text =
              "Waiting for payment…" +
              (invoice.confirmations
                ? ` (${invoice.confirmations} confirmations)`
                : "");
          }
          this.invoiceStatus.textContent = text;
        }

        if (invoice.status === "confirmed") {
          clearInterval(this.statusPollTimer);
          this.statusPollTimer = null;
          this.showToast("Subscription activated. Enjoy your perks.", "success");
        }
      } catch (err) {
        console.error("invoice status poll error", err);
      }
    };

    poll();
    this.statusPollTimer = setInterval(poll, 15000);
  }

  // ========= copy & toasts =========

  async copyAddress() {
    if (!this.invoiceAddress) return;
    const text = this.invoiceAddress.textContent.trim();
    if (!text || text === "—") return;

    try {
      await navigator.clipboard.writeText(text);
      this.showToast("Address copied.", "success");
    } catch {
      this.showToast("Could not copy address.", "error");
    }
  }

  showToast(message, type = "info") {
    if (!this.toastContainer) return;

    const div = document.createElement("div");
    div.className = "payment-toast";
    if (type === "error") div.classList.add("payment-toast--error");
    if (type === "success") div.classList.add("payment-toast--success");
    div.textContent = message;

    this.toastContainer.appendChild(div);

    setTimeout(() => {
      div.classList.add("fade-out");
      div.style.opacity = "0";
      setTimeout(() => div.remove(), 300);
    }, 2500);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    new PaymentPage();
  } catch (err) {
    console.error("PaymentPage init error", err);
  }
});
