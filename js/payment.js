// js/payment.js
const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

const TOKEN_KEY = "us_auth_token";

document.addEventListener("DOMContentLoaded", () => {
  // -----------------------------
  // DOM
  // -----------------------------
  const backBtn = document.getElementById("paymentBackButton");

  const planButtons = Array.from(document.querySelectorAll(".plan-card"));
  const coinButtons = Array.from(document.querySelectorAll(".coin-card"));

  const priceUsdLabel = document.getElementById("priceUsdLabel");
  const priceCoinCode = document.getElementById("priceCoinCode");
  const priceCoinLabel = document.getElementById("priceCoinLabel");
  const priceSourceLabel = document.getElementById("priceSourceLabel");

  const generateInvoiceBtn = document.getElementById("generateInvoiceBtn");

  const subscriptionStatus = document.getElementById("subscriptionStatus");

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
  const statusContainer = document.getElementById("paymentStatusContainer");

  // Safety: if critical elements are missing, tell you immediately.
  if (!generateInvoiceBtn) {
    console.error("payment.js: Missing #generateInvoiceBtn in HTML");
  }
  if (!priceSourceLabel) {
    console.warn("payment.js: Missing #priceSourceLabel in HTML");
  }

  // -----------------------------
  // STATE
  // -----------------------------
  let selectedPlan = "monthly";
  let selectedPlanUsd = 8;
  let selectedCurrency = "XMR";

  let prices = null; // { BTC, ETH, SOL, USDT, USDC, XMR }
  let currentInvoiceId = null;

  let countdownTimerId = null;
  let statusPollId = null;

  const invoiceLifetimeSeconds = 30 * 60;

  // -----------------------------
  // UTILS
  // -----------------------------
  function getAuthTokenSafe() {
    try {
      if (typeof window.getAuthToken === "function") {
        return window.getAuthToken() || "";
      }
    } catch {}
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function showToast(message, type = "default", ms = 3500) {
    if (!statusContainer) return;
    const div = document.createElement("div");
    div.className = "payment-toast" + (type !== "default" ? " " + type : "");
    div.textContent = message;
    statusContainer.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  function setInvoiceSectionVisible(visible) {
    if (!invoiceSection) return;
    invoiceSection.style.display = visible ? "block" : "none";
  }

  function clearTimers() {
    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
    if (statusPollId) {
      clearInterval(statusPollId);
      statusPollId = null;
    }
  }

  function formatUsd(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "—";
    return `$${num.toFixed(2)} USD`;
  }

  function planLabel(plan) {
    return plan === "yearly" ? "Yearly" : "Monthly";
  }

  function ensureLoggedInOrToast() {
    const token = getAuthTokenSafe();
    if (!token) {
      showToast("You must be logged in to subscribe.", "error");
      return false;
    }
    return true;
  }

  function resetInvoiceUi() {
    currentInvoiceId = null;
    clearTimers();

    setInvoiceSectionVisible(false);

    if (invoicePlanLabel) invoicePlanLabel.textContent = "–";
    if (invoiceAmountLabel) invoiceAmountLabel.textContent = "–";
    if (invoiceCurrencyLabel) invoiceCurrencyLabel.textContent = "XMR";
    if (invoiceStatusLabel) invoiceStatusLabel.textContent = "Waiting for payment";
    if (invoiceCountdownLabel) invoiceCountdownLabel.textContent = "30:00";

    if (invoiceAddressText) invoiceAddressText.textContent = "–";

    if (invoiceQrImage) {
      invoiceQrImage.removeAttribute("src");
      invoiceQrImage.alt = "Payment QR";
    }

    if (confirmationsLabel) confirmationsLabel.textContent = "0 / 10";
    if (confirmationsBar) confirmationsBar.style.width = "0%";
  }

  // -----------------------------
  // FETCH WITH TIMEOUT
  // -----------------------------
  async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  // -----------------------------
  // PRICE SOURCES (fallbacks)
  // -----------------------------
  async function loadPricesFromCoinGecko() {
    const url =
      "https://api.coingecko.com/api/v3/simple/price" +
      "?ids=bitcoin,ethereum,solana,tether,usd-coin,monero&vs_currencies=usd";

    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) throw new Error("CoinGecko HTTP " + res.status);
    const json = await res.json();

    return {
      BTC: json.bitcoin?.usd ?? null,
      ETH: json.ethereum?.usd ?? null,
      SOL: json.solana?.usd ?? null,
      USDT: json.tether?.usd ?? null,
      USDC: json["usd-coin"]?.usd ?? null,
      XMR: json.monero?.usd ?? null,
      _source: "CoinGecko"
    };
  }

  async function loadPricesFromCoinCap() {
    // CoinCap provides per-asset endpoints; use XMR + a few basics
    async function get(assetId) {
      const res = await fetchWithTimeout(`https://api.coincap.io/v2/assets/${assetId}`, {}, 9000);
      if (!res.ok) throw new Error("CoinCap HTTP " + res.status);
      const json = await res.json();
      const priceUsd = Number(json?.data?.priceUsd);
      return Number.isFinite(priceUsd) ? priceUsd : null;
    }

    const [BTC, ETH, SOL, USDT, USDC, XMR] = await Promise.all([
      get("bitcoin"),
      get("ethereum"),
      get("solana"),
      get("tether"),
      get("usd-coin"),
      get("monero")
    ]);

    return { BTC, ETH, SOL, USDT, USDC, XMR, _source: "CoinCap" };
  }

  async function loadPricesFromCryptoCompare() {
    // CryptoCompare simple multi-price endpoint (no key often works for low usage)
    const url =
      "https://min-api.cryptocompare.com/data/pricemulti" +
      "?fsyms=BTC,ETH,SOL,USDT,USDC,XMR&tsyms=USD";

    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) throw new Error("CryptoCompare HTTP " + res.status);
    const json = await res.json();

    return {
      BTC: json.BTC?.USD ?? null,
      ETH: json.ETH?.USD ?? null,
      SOL: json.SOL?.USD ?? null,
      USDT: json.USDT?.USD ?? null,
      USDC: json.USDC?.USD ?? null,
      XMR: json.XMR?.USD ?? null,
      _source: "CryptoCompare"
    };
  }

  async function loadPrices() {
    try {
      if (priceSourceLabel) priceSourceLabel.textContent = "Loading…";

      let p = null;
      let lastErr = null;

      // Try sources in order
      for (const fn of [loadPricesFromCoinGecko, loadPricesFromCoinCap, loadPricesFromCryptoCompare]) {
        try {
          p = await fn();
          break;
        } catch (e) {
          lastErr = e;
          console.warn("Price source failed:", e?.message || e);
        }
      }

      if (!p || !p.XMR) {
        throw lastErr || new Error("No price sources available");
      }

      prices = p;

      // Update coin card price labels
      const setPrice = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!value) el.textContent = "—";
        else {
          el.textContent = `$${Number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}`;
        }
      };

      setPrice("btcPriceUsd", prices.BTC);
      setPrice("ethPriceUsd", prices.ETH);
      setPrice("solPriceUsd", prices.SOL);
      setPrice("usdcPriceUsd", prices.USDC);
      setPrice("usdtPriceUsd", prices.USDT);
      setPrice("xmrPriceUsd", prices.XMR);

      if (priceSourceLabel) {
        priceSourceLabel.textContent = `Updated just now (${prices._source})`;
      }

      recalcXmrAmount();
    } catch (err) {
      console.error("Failed to load prices:", err);
      prices = null;

      if (priceSourceLabel) priceSourceLabel.textContent = "Unavailable";
      if (priceCoinLabel) priceCoinLabel.textContent = "—";

      showToast("Could not load live prices. Try again later.", "error");
    }
  }

  function recalcXmrAmount() {
    if (!prices || !prices.XMR || !Number.isFinite(Number(prices.XMR))) {
      if (priceCoinLabel) priceCoinLabel.textContent = "—";
      return;
    }
    const xmrPrice = Number(prices.XMR);
    const amt = selectedPlanUsd / xmrPrice;
    const rounded = Math.max(amt, 0).toFixed(6);
    if (priceCoinLabel) priceCoinLabel.textContent = `${rounded} XMR`;
    if (priceCoinCode) priceCoinCode.textContent = "XMR";
  }

  // -----------------------------
  // PLAN + COIN HANDLERS
  // -----------------------------
  function updatePlanStateFromDom() {
    const activeBtn = planButtons.find((btn) => btn.classList.contains("active"));
    if (!activeBtn) return;

    selectedPlan = activeBtn.dataset.plan === "yearly" ? "yearly" : "monthly";
    selectedPlanUsd = selectedPlan === "yearly" ? 60 : 8;

    if (priceUsdLabel) priceUsdLabel.textContent = formatUsd(selectedPlanUsd);

    recalcXmrAmount();
    resetInvoiceUi();
  }

  planButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      planButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      updatePlanStateFromDom();
    });
  });

  coinButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const coin = (btn.dataset.coin || "").toUpperCase();
      const enabled = (btn.dataset.enabled || "false") === "true";

      if (!coin) return;

      if (!enabled || coin !== "XMR") {
        showToast(`${coin} is not supported yet. Use Monero (XMR) for now.`, "error");
        return;
      }

      selectedCurrency = "XMR";
      coinButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (priceCoinCode) priceCoinCode.textContent = "XMR";
      recalcXmrAmount();
      resetInvoiceUi();
    });
  });

  // -----------------------------
  // SUBSCRIPTION STATUS (optional UI)
  // -----------------------------
  async function loadSubscriptionStatus() {
    if (!subscriptionStatus) return;
    const token = getAuthTokenSafe();
    if (!token) {
      subscriptionStatus.innerHTML = "";
      return;
    }

    try {
      const res = await fetch(`${PAYMENT_API_BASE_URL}/subscription/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        subscriptionStatus.innerHTML = "";
        return;
      }

      const data = await res.json();
      if (data?.active && data.subscription) {
        const exp = data.subscription.expires_at
          ? new Date(data.subscription.expires_at).toLocaleString()
          : "—";
        subscriptionStatus.innerHTML =
          `<div class="subscription-status-card active">` +
          `<div class="subscription-status-title">✅ You are Verified</div>` +
          `<div class="subscription-status-text">Plan: <strong>${data.subscription.plan || "—"}</strong></div>` +
          `<div class="subscription-status-text">Expires: <strong>${exp}</strong></div>` +
          `</div>`;
      } else {
        subscriptionStatus.innerHTML =
          `<div class="subscription-status-card">` +
          `<div class="subscription-status-title">No active subscription</div>` +
          `<div class="subscription-status-text">Choose a plan to become Verified.</div>` +
          `</div>`;
      }
    } catch {
      subscriptionStatus.innerHTML = "";
    }
  }

  // -----------------------------
  // COUNTDOWN + POLL
  // -----------------------------
  function startCountdown(seconds) {
    if (!invoiceCountdownLabel) return;

    let remaining = seconds;

    const update = () => {
      const m = Math.floor(remaining / 60).toString().padStart(2, "0");
      const s = (remaining % 60).toString().padStart(2, "0");
      invoiceCountdownLabel.textContent = `${m}:${s}`;
      remaining -= 1;

      if (remaining < 0) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
        showToast("Invoice expired. Create a new one.", "error");
      }
    };

    update();
    countdownTimerId = setInterval(update, 1000);
  }

  async function pollInvoiceStatus(invoiceId) {
    if (!invoiceId) return;
    const token = getAuthTokenSafe();
    if (!token) return;

    async function tick() {
      try {
        const res = await fetch(
          `${PAYMENT_API_BASE_URL}/payments/status/${encodeURIComponent(invoiceId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) {
          if (res.status === 401) {
            showToast("Session expired. Please log in again.", "error");
            clearInterval(statusPollId);
            statusPollId = null;
          }
          return;
        }

        const data = await res.json();

        if (invoiceStatusLabel) {
          invoiceStatusLabel.textContent =
            data.status === "confirmed"
              ? "Confirmed"
              : data.status === "paid"
              ? "Payment received (confirming…)"
              : data.status === "pending"
              ? "Waiting for payment"
              : (data.status || "Waiting for payment");
        }

        const conf = typeof data.confirmations === "number" ? data.confirmations : 0;
        const req = typeof data.required_confirmations === "number" ? data.required_confirmations : 10;

        if (confirmationsLabel) confirmationsLabel.textContent = `${conf} / ${req}`;
        if (confirmationsBar) {
          const pct = Math.max(0, Math.min(100, (conf / Math.max(1, req)) * 100));
          confirmationsBar.style.width = `${pct}%`;
        }

        if (data.status === "confirmed") {
          showToast("Payment confirmed. Your subscription will update shortly.", "success");
          clearInterval(statusPollId);
          statusPollId = null;
          loadSubscriptionStatus();
        }
      } catch (err) {
        console.error("Status poll failed:", err);
      }
    }

    await tick();
    statusPollId = setInterval(tick, 20000);
  }

  // -----------------------------
  // CREATE INVOICE
  // -----------------------------
  async function handleGenerateInvoice() {
    // Make button feel responsive immediately
    showToast("Starting payment…", "default", 1200);

    if (!ensureLoggedInOrToast()) return;

    if (selectedCurrency !== "XMR") {
      showToast("Right now only Monero (XMR) is accepted.", "error");
      return;
    }

    if (!prices || !prices.XMR) {
      showToast("Still loading XMR price… try again in a moment.", "error");
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice) || xmrPrice <= 0) {
      showToast("XMR price unavailable.", "error");
      return;
    }

    const amountXmr = selectedPlanUsd / xmrPrice;

    if (generateInvoiceBtn) {
      generateInvoiceBtn.disabled = true;
      generateInvoiceBtn.textContent = "Creating invoice…";
    }

    try {
      const token = getAuthTokenSafe();

      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: selectedPlan,
          currency: "XMR",
          amount_crypto: Number(amountXmr.toFixed(12))
        })
      });

      const errJson = !res.ok ? await res.json().catch(() => ({})) : null;

      if (!res.ok) {
        const msg =
          errJson?.error ||
          (res.status === 401
            ? "Session expired. Please log in again."
            : `Failed to create invoice (HTTP ${res.status})`);
        showToast(msg, "error");
        return;
      }

      const invoice = await res.json();
      currentInvoiceId = invoice.id;

      setInvoiceSectionVisible(true);

      if (invoicePlanLabel) invoicePlanLabel.textContent = planLabel(invoice.plan || selectedPlan);

      if (invoiceAmountLabel) {
        const xmrAmt = Number(invoice.amount_crypto ?? amountXmr);
        const usdAmt = Number(invoice.amount_usd ?? selectedPlanUsd);
        invoiceAmountLabel.textContent = `${xmrAmt.toFixed(6)} XMR (≈ $${usdAmt.toFixed(2)})`;
      }

      if (invoiceCurrencyLabel) invoiceCurrencyLabel.textContent = (invoice.currency || "XMR").toUpperCase();

      if (invoiceStatusLabel) {
        invoiceStatusLabel.textContent =
          invoice.status === "pending" ? "Waiting for payment" : (invoice.status || "Waiting for payment");
      }

      if (invoiceAddressText) invoiceAddressText.textContent = invoice.address || "—";

      const qrPayload =
        invoice.qr_string ||
        (invoice.address
          ? `monero:${invoice.address}?tx_amount=${Number(invoice.amount_crypto ?? amountXmr).toFixed(6)}`
          : "");

      if (qrPayload && invoiceQrImage) {
        const qrUrl =
          "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" +
          encodeURIComponent(qrPayload);
        invoiceQrImage.src = qrUrl;
        invoiceQrImage.alt = "Payment QR";
      }

      if (confirmationsLabel) confirmationsLabel.textContent = `0 / ${invoice.required_confirmations || 10}`;
      if (confirmationsBar) confirmationsBar.style.width = "0%";

      clearTimers();
      startCountdown(invoiceLifetimeSeconds);
      pollInvoiceStatus(invoice.id);

      showToast("Invoice created. Send the exact amount from your Monero wallet.", "success");

      try {
        invoiceSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {}
    } catch (err) {
      console.error("Create invoice error:", err);
      showToast("Failed to create invoice. Try again.", "error");
    } finally {
      if (generateInvoiceBtn) {
        generateInvoiceBtn.disabled = false;
        generateInvoiceBtn.textContent = "Continue to payment";
      }
    }
  }

  // Bind click handler (and warn if it failed)
  if (generateInvoiceBtn) {
    generateInvoiceBtn.addEventListener("click", handleGenerateInvoice);
  } else {
    showToast("Payment button missing from page (check HTML ID).", "error", 6000);
  }

  // Copy address
  if (copyAddressBtn && invoiceAddressText) {
    copyAddressBtn.addEventListener("click", async () => {
      const text = invoiceAddressText.textContent?.trim();
      if (!text || text === "–" || text === "—") return;

      try {
        await navigator.clipboard.writeText(text);
        showToast("Address copied to clipboard.", "success");
      } catch (err) {
        console.error("Copy failed:", err);
        showToast("Could not copy address.", "error");
      }
    });
  }

  // Back button
  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.history.length > 1) window.history.back();
      else window.location.href = "settings.html";
    });
  }

  // -----------------------------
  // INIT
  // -----------------------------
  function initActiveDefaults() {
    // Ensure plan defaults match whatever is active in HTML
    updatePlanStateFromDom();

    // Ensure XMR is shown
    if (priceCoinCode) priceCoinCode.textContent = "XMR";

    // Hide invoice initially
    resetInvoiceUi();
  }

  initActiveDefaults();
  loadSubscriptionStatus();
  loadPrices();

  // Refresh prices every minute
  setInterval(loadPrices, 60000);
});
