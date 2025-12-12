// js/payment.js

// Use the same API base URL pattern as the rest of your site
const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

/**
 * Robust token getter (your project has used different keys across pages).
 * This fixes: "Missing auth token" and "You need to be logged in" when you are.
 */
function getAuthToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwt") ||
    ""
  );
}

/**
 * Tiny helper: fetch with timeout (prevents infinite “Loading…”)
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM CACHE ---

  // Plan buttons (Monthly / Yearly)
  const planButtons = Array.from(document.querySelectorAll(".plan-card"));

  // Coin buttons (BTC/ETH/SOL/USDC/USDT/XMR)
  const coinButtons = Array.from(document.querySelectorAll(".coin-card"));

  // Price box labels
  const priceUsdLabel = document.getElementById("priceUsdLabel");
  const priceCoinCode = document.getElementById("priceCoinCode");
  const priceCoinLabel = document.getElementById("priceCoinLabel");
  const priceSourceLabel = document.getElementById("priceSourceLabel");

  // Continue button
  const generateInvoiceBtn = document.getElementById("generateInvoiceBtn");

  // Subscription status
  const subscriptionStatus = document.getElementById("subscriptionStatus");

  // Invoice section + fields (these IDs match your HTML)
  const invoiceSection = document.getElementById("invoiceSection");
  const invoicePlanLabel = document.getElementById("invoicePlanLabel");
  const invoiceAmountLabel = document.getElementById("invoiceAmountLabel");
  const invoiceCurrencyLabel = document.getElementById("invoiceCurrencyLabel");
  const invoiceStatusLabel = document.getElementById("invoiceStatusLabel");
  const invoiceCountdownLabel = document.getElementById("invoiceCountdownLabel");
  const invoiceAddressText = document.getElementById("invoiceAddressText");
  const invoiceQrImage = document.getElementById("invoiceQrImage");
  const confirmationsLabel = document.getElementById("confirmationsLabel");
  const confirmationsBar = document.getElementById("confirmationsBar");
  const copyAddressBtn = document.getElementById("copyAddressBtn");

  // Toast container
  const statusContainer = document.getElementById("paymentStatusContainer");

  // Back button
  const backBtn = document.getElementById("paymentBackButton");

  // --- STATE ---

  let selectedPlan = "monthly";
  let selectedPlanUsd = 8;

  let selectedCurrency = "XMR"; // only XMR is supported right now
  let prices = null; // { XMR: number, BTC: number, ... }
  let priceProviderName = "—";

  let currentInvoiceId = null;
  let countdownTimerId = null;
  let statusPollId = null;

  const invoiceLifetimeSeconds = 30 * 60; // 30 minutes

  // --- UTIL: TOASTS ---

  function showToast(message, type = "default", ms = 3500) {
    if (!statusContainer) return;
    const div = document.createElement("div");
    div.className = "payment-toast" + (type !== "default" ? " " + type : "");
    div.textContent = message;
    statusContainer.appendChild(div);

    setTimeout(() => {
      div.remove();
    }, ms);
  }

  // --- UTIL: BUTTON SAFE DISABLE ---

  function setButtonLoading(btn, isLoading, labelWhenIdle) {
    if (!btn) return;
    btn.disabled = !!isLoading;
    if (isLoading) {
      btn.dataset._oldText = btn.textContent;
      btn.textContent = "Loading…";
    } else {
      btn.textContent = labelWhenIdle || btn.dataset._oldText || btn.textContent;
    }
  }

  // --- AUTH: basic gate (do not block price loading, only block invoice creation) ---

  function ensureLoggedInOrRedirect() {
    const token = getAuthToken();
    if (!token) {
      showToast("Session expired. Please log in again.", "error");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 700);
      return false;
    }
    return true;
  }

  // --- NAV: back button ---

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      // go back if possible; otherwise go to profile
      if (history.length > 1) history.back();
      else window.location.href = "profile.html?user=me";
    });
  }

  // --- PLAN HANDLING ---

  function applyPlanFromButton(btn) {
    const plan = (btn?.dataset?.plan || "").toLowerCase();
    selectedPlan = plan === "yearly" ? "yearly" : "monthly";
    selectedPlanUsd = selectedPlan === "yearly" ? 60 : 8;

    // Update USD label
    if (priceUsdLabel) priceUsdLabel.textContent = `$${selectedPlanUsd.toFixed(2)} USD`;

    // Recalc crypto amount
    recalcCryptoAmount();
  }

  function initPlanButtons() {
    if (!planButtons.length) return;

    // Ensure one active exists
    let active = planButtons.find((b) => b.classList.contains("active"));
    if (!active) {
      planButtons[0].classList.add("active");
      active = planButtons[0];
    }

    applyPlanFromButton(active);

    planButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        planButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        applyPlanFromButton(btn);
      });
    });
  }

  // --- COIN HANDLING ---

  function initCoinButtons() {
    if (!coinButtons.length) return;

    coinButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const coin = (btn.dataset.coin || "").toUpperCase();
        const enabled = String(btn.dataset.enabled || "false") === "true";

        if (!coin) return;

        if (!enabled || coin !== "XMR") {
          showToast(`${coin} is not supported yet. Use Monero (XMR) for now.`, "error");
          return;
        }

        selectedCurrency = "XMR";
        coinButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        if (priceCoinCode) priceCoinCode.textContent = "XMR";
        recalcCryptoAmount();
      });
    });

    // Force initial to XMR active if present
    const xmrBtn = coinButtons.find((b) => (b.dataset.coin || "").toUpperCase() === "XMR");
    if (xmrBtn) {
      coinButtons.forEach((b) => b.classList.remove("active"));
      xmrBtn.classList.add("active");
      selectedCurrency = "XMR";
      if (priceCoinCode) priceCoinCode.textContent = "XMR";
    }
  }

  // --- PRICE FETCHING (CoinGecko + fallbacks) ---

  async function loadPrices() {
    // Don’t require login to load prices; users should still see conversion.
    if (priceSourceLabel) priceSourceLabel.textContent = "Loading…";

    // helper to update price labels in your coin grid
    const setCoinPriceLabel = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!value || !Number.isFinite(Number(value))) {
        el.textContent = "—";
      } else {
        el.textContent = `$${Number(value).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
      }
    };

    // Provider 1: CoinGecko (your original)
    try {
      const url =
        "https://api.coingecko.com/api/v3/simple/price" +
        "?ids=bitcoin,ethereum,solana,tether,usd-coin,monero&vs_currencies=usd";

      const res = await fetchWithTimeout(url, {}, 9000);
      if (!res.ok) throw new Error("CoinGecko HTTP " + res.status);

      const json = await res.json();

      prices = {
        BTC: json.bitcoin?.usd ?? null,
        ETH: json.ethereum?.usd ?? null,
        SOL: json.solana?.usd ?? null,
        USDT: json.tether?.usd ?? null,
        USDC: json["usd-coin"]?.usd ?? null,
        XMR: json.monero?.usd ?? null
      };

      priceProviderName = "CoinGecko";
      if (priceSourceLabel) priceSourceLabel.textContent = "Updated just now";

      setCoinPriceLabel("btcPriceUsd", prices.BTC);
      setCoinPriceLabel("ethPriceUsd", prices.ETH);
      setCoinPriceLabel("solPriceUsd", prices.SOL);
      setCoinPriceLabel("usdcPriceUsd", prices.USDC);
      setCoinPriceLabel("usdtPriceUsd", prices.USDT);
      setCoinPriceLabel("xmrPriceUsd", prices.XMR);

      recalcCryptoAmount();
      return;
    } catch (err) {
      console.warn("CoinGecko failed:", err);
    }

    // Provider 2: CoinCap (fallback)
    try {
      const xmrRes = await fetchWithTimeout("https://api.coincap.io/v2/assets/monero", {}, 9000);
      if (!xmrRes.ok) throw new Error("CoinCap HTTP " + xmrRes.status);
      const xmrJson = await xmrRes.json();
      const xmrUsd = Number(xmrJson?.data?.priceUsd);

      prices = {
        BTC: null,
        ETH: null,
        SOL: null,
        USDT: null,
        USDC: null,
        XMR: Number.isFinite(xmrUsd) ? xmrUsd : null
      };

      priceProviderName = "CoinCap";
      if (priceSourceLabel) priceSourceLabel.textContent = "Updated just now";

      // only XMR is truly needed right now
      const xmrLabel = document.getElementById("xmrPriceUsd");
      if (xmrLabel && prices.XMR) {
        xmrLabel.textContent = `$${prices.XMR.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
      }

      recalcCryptoAmount();
      return;
    } catch (err) {
      console.warn("CoinCap failed:", err);
    }

    // Provider 3: Kraken public ticker (fallback)
    try {
      // Kraken uses XMRUSD pair
      const krRes = await fetchWithTimeout("https://api.kraken.com/0/public/Ticker?pair=XMRUSD", {}, 9000);
      if (!krRes.ok) throw new Error("Kraken HTTP " + krRes.status);
      const krJson = await krRes.json();
      const pairKey = krJson?.result ? Object.keys(krJson.result)[0] : null;
      const last = pairKey ? krJson.result[pairKey]?.c?.[0] : null;
      const xmrUsd = Number(last);

      prices = {
        BTC: null,
        ETH: null,
        SOL: null,
        USDT: null,
        USDC: null,
        XMR: Number.isFinite(xmrUsd) ? xmrUsd : null
      };

      priceProviderName = "Kraken";
      if (priceSourceLabel) priceSourceLabel.textContent = "Updated just now";

      const xmrLabel = document.getElementById("xmrPriceUsd");
      if (xmrLabel && prices.XMR) {
        xmrLabel.textContent = `$${prices.XMR.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
      }

      recalcCryptoAmount();
      return;
    } catch (err) {
      console.warn("Kraken failed:", err);
    }

    // If all providers failed
    prices = null;
    priceProviderName = "—";
    if (priceSourceLabel) priceSourceLabel.textContent = "Price source unavailable";
    recalcCryptoAmount(); // will set "—"
    showToast("Could not load live prices. Try again later.", "error");
  }

  function recalcCryptoAmount() {
    if (selectedCurrency !== "XMR") {
      if (priceCoinLabel) priceCoinLabel.textContent = "—";
      return;
    }

    if (!prices || !prices.XMR || !Number.isFinite(Number(prices.XMR))) {
      if (priceCoinLabel) priceCoinLabel.textContent = "—";
      return;
    }

    const xmrPrice = Number(prices.XMR);
    const amt = selectedPlanUsd / xmrPrice;
    const amtRounded = Math.max(amt, 0).toFixed(6);

    if (priceCoinLabel) priceCoinLabel.textContent = `${amtRounded} XMR`;
  }

  // --- INVOICE UI / TIMERS ---

  function hideInvoiceSection() {
    if (!invoiceSection) return;
    invoiceSection.style.display = "none";
    currentInvoiceId = null;

    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
    if (statusPollId) {
      clearInterval(statusPollId);
      statusPollId = null;
    }
  }

  function showInvoiceSection() {
    if (!invoiceSection) return;
    invoiceSection.style.display = "block";
  }

  function startCountdown(seconds) {
    if (!invoiceCountdownLabel) return;

    let remaining = seconds;

    const tick = () => {
      const m = Math.floor(remaining / 60).toString().padStart(2, "0");
      const s = (remaining % 60).toString().padStart(2, "0");
      invoiceCountdownLabel.textContent = `${m}:${s}`;
      remaining -= 1;

      if (remaining < 0) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
        // Optional: tell user invoice expired
        showToast("Invoice expired. Create a new one.", "error");
      }
    };

    tick();
    countdownTimerId = setInterval(tick, 1000);
  }

  async function pollInvoiceStatus(invoiceId) {
    if (!invoiceId) return;

    async function tick() {
      try {
        const token = getAuthToken();
        if (!token) return;

        const res = await fetch(
          `${PAYMENT_API_BASE_URL}/payments/status/${encodeURIComponent(invoiceId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            }
          }
        );

        if (res.status === 401) {
          showToast("Session expired. Please log in again.", "error");
          setTimeout(() => (window.location.href = "login.html"), 700);
          return;
        }

        if (!res.ok) return;

        const data = await res.json();

        if (invoiceStatusLabel) {
          const st = (data.status || "pending").toString();
          invoiceStatusLabel.textContent =
            st === "confirmed"
              ? "Confirmed"
              : st === "paid"
              ? "Payment received"
              : "Waiting for payment";
        }

        // confirmations UI
        if (
          typeof data.confirmations === "number" &&
          typeof data.required_confirmations === "number" &&
          confirmationsLabel &&
          confirmationsBar
        ) {
          const conf = data.confirmations;
          const req = data.required_confirmations || 10;
          confirmationsLabel.textContent = `${conf} / ${req}`;
          const pct = Math.max(0, Math.min(100, (conf / req) * 100));
          confirmationsBar.style.width = `${pct}%`;
        }

        if (data.status === "confirmed") {
          showToast("Payment confirmed. Your account will update shortly.", "success");
          if (statusPollId) {
            clearInterval(statusPollId);
            statusPollId = null;
          }
          // refresh subscription badge
          loadSubscriptionStatus();
        }
      } catch (err) {
        console.warn("Status poll failed:", err);
      }
    }

    await tick();
    statusPollId = setInterval(tick, 20000);
  }

  // --- SUBSCRIPTION STATUS (optional UI) ---

  async function loadSubscriptionStatus() {
    if (!subscriptionStatus) return;

    const token = getAuthToken();
    if (!token) {
      subscriptionStatus.innerHTML = "";
      return;
    }

    try {
      const res = await fetch(`${PAYMENT_API_BASE_URL}/subscription/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) return;

      const json = await res.json();

      if (!json || !json.active) {
        subscriptionStatus.innerHTML = `
          <div class="price-box">
            <div class="price-row">
              <span class="price-label">Status</span>
              <span class="price-value">Not subscribed</span>
            </div>
          </div>
        `;
        return;
      }

      const sub = json.subscription || {};
      const expires = sub.expires_at ? new Date(sub.expires_at).toLocaleString() : "—";
      const plan = sub.plan ? String(sub.plan) : "—";

      subscriptionStatus.innerHTML = `
        <div class="price-box">
          <div class="price-row">
            <span class="price-label">Status</span>
            <span class="price-value" style="color: var(--success-color);">Active</span>
          </div>
          <div class="price-row">
            <span class="price-label">Plan</span>
            <span class="price-value">${plan}</span>
          </div>
          <div class="price-row">
            <span class="price-label">Expires</span>
            <span class="price-value">${expires}</span>
          </div>
        </div>
      `;
    } catch (err) {
      console.warn("Failed to load subscription status:", err);
    }
  }

  // --- CREATE INVOICE FLOW ---

  async function handleGenerateInvoice() {
    // must be logged in to create invoice
    if (!ensureLoggedInOrRedirect()) return;

    if (selectedCurrency !== "XMR") {
      showToast("Right now only Monero (XMR) is accepted.", "error");
      return;
    }

    if (!prices || !prices.XMR || !Number.isFinite(Number(prices.XMR))) {
      showToast("Waiting for XMR price. Try again in a few seconds.", "error");
      return;
    }

    const xmrPrice = Number(prices.XMR);
    const amountXmr = selectedPlanUsd / xmrPrice;

    setButtonLoading(generateInvoiceBtn, true, "Continue to payment");

    try {
      const token = getAuthToken();

      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: selectedPlan,
          currency: "XMR",
          amount_crypto: amountXmr
        })
      });

      if (res.status === 401) {
        showToast("Session expired. Please log in again.", "error");
        setTimeout(() => (window.location.href = "login.html"), 700);
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg = errJson?.error || `Failed to create invoice (HTTP ${res.status})`;
        showToast(msg, "error");
        return;
      }

      const invoice = await res.json();
      currentInvoiceId = invoice.id;

      // Show invoice section
      showInvoiceSection();

      // Fill invoice UI
      if (invoicePlanLabel) {
        invoicePlanLabel.textContent = selectedPlan === "yearly" ? "Yearly" : "Monthly";
      }

      if (invoiceAmountLabel) {
        const amt = Number(invoice.amount_crypto ?? amountXmr);
        invoiceAmountLabel.textContent = `${amt.toFixed(6)} XMR`;
      }

      if (invoiceCurrencyLabel) invoiceCurrencyLabel.textContent = "XMR";

      if (invoiceStatusLabel) {
        const st = (invoice.status || "pending").toString();
        invoiceStatusLabel.textContent =
          st === "confirmed"
            ? "Confirmed"
            : st === "paid"
            ? "Payment received"
            : "Waiting for payment";
      }

      if (invoiceAddressText) invoiceAddressText.textContent = invoice.address || "—";

      // Generate QR image from qr_string
      if (invoice.qr_string && invoiceQrImage) {
        const qrUrl =
          "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" +
          encodeURIComponent(invoice.qr_string);
        invoiceQrImage.src = qrUrl;
      }

      // reset confirmations
      if (confirmationsLabel) confirmationsLabel.textContent = `0 / ${invoice.required_confirmations || 10}`;
      if (confirmationsBar) confirmationsBar.style.width = "0%";

      // Reset timers/polling
      if (countdownTimerId) clearInterval(countdownTimerId);
      if (statusPollId) clearInterval(statusPollId);

      startCountdown(invoiceLifetimeSeconds);
      pollInvoiceStatus(invoice.id);

      showToast("Invoice created. Send the payment from your Monero wallet.", "success");

      // Scroll to invoice section for mobile users
      try {
        invoiceSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {}
    } catch (err) {
      console.error("Create invoice error:", err);
      showToast("Failed to create invoice. Try again.", "error");
    } finally {
      setButtonLoading(generateInvoiceBtn, false, "Continue to payment");
    }
  }

  if (generateInvoiceBtn) {
    generateInvoiceBtn.addEventListener("click", handleGenerateInvoice);
  }

  // Copy address
  if (copyAddressBtn && invoiceAddressText) {
    copyAddressBtn.addEventListener("click", async () => {
      const text = invoiceAddressText.textContent?.trim();
      if (!text || text === "—") return;

      try {
        await navigator.clipboard.writeText(text);
        showToast("Address copied to clipboard.", "success");
      } catch (err) {
        console.error("Copy failed:", err);
        showToast("Could not copy address.", "error");
      }
    });
  }

  // --- INIT ---

  // hide invoice until created
  hideInvoiceSection();

  // init UI behavior
  initPlanButtons();
  initCoinButtons();

  // set initial price labels
  if (priceUsdLabel) priceUsdLabel.textContent = `$${selectedPlanUsd.toFixed(2)} USD`;
  if (priceCoinCode) priceCoinCode.textContent = "XMR";
  if (priceCoinLabel) priceCoinLabel.textContent = "—";

  // load prices + subscription
  loadPrices();
  loadSubscriptionStatus();

  // refresh prices every ~60s (optional)
  setInterval(() => {
    loadPrices();
  }, 60000);
});
