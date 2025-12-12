// js/payment.js

const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

document.addEventListener("DOMContentLoaded", () => {
  // ============== DOM ==============

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
  const copyAddressBtn = document.getElementById("copyAddressBtn");

  const invoiceQrImage = document.getElementById("invoiceQrImage");

  const confirmationsLabel = document.getElementById("confirmationsLabel");
  const confirmationsBar = document.getElementById("confirmationsBar");

  const statusContainer = document.getElementById("paymentStatusContainer");

  const backBtn = document.getElementById("paymentBackButton");
  if (backBtn) backBtn.addEventListener("click", () => window.history.back());

  // ============== STATE ==============

  let selectedPlan = "monthly"; // MUST match invoices.plan constraint
  let selectedPlanUsd = 8;

  let selectedCurrency = "XMR";
  let prices = null;

  let currentInvoiceId = null;
  let countdownTimerId = null;
  let statusPollId = null;
  const invoiceLifetimeSeconds = 30 * 60;

  // ============== AUTH (matches your auth.js) ==============

  const TOKEN_KEY = "us_auth_token";
  const REDIRECT_KEY = "us_redirect_after_login";

  function getToken() {
    // Prefer the shared helper if it exists
    if (typeof window.getAuthToken === "function") return window.getAuthToken();
    return localStorage.getItem(TOKEN_KEY);
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function requireLogin(reason) {
    showToast(reason || "Please log in to subscribe.", "error");
    try {
      localStorage.setItem(REDIRECT_KEY, window.location.href);
    } catch {}
    // if you want auto-redirect:
    window.location.href = "login.html";
  }

  // ============== TOAST ==============

  function showToast(message, type = "default", ms = 3500) {
    if (!statusContainer) return;
    const div = document.createElement("div");
    div.className = "payment-toast" + (type !== "default" ? " " + type : "");
    div.textContent = message;
    statusContainer.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  // ============== PLAN ==============

  function updatePlanStateFromDom() {
    const activeBtn = planButtons.find((b) => b.classList.contains("active"));
    if (!activeBtn) return;

    const plan = (activeBtn.dataset.plan || "").toLowerCase();
    selectedPlan = plan === "yearly" ? "yearly" : "monthly";
    selectedPlanUsd = selectedPlan === "yearly" ? 60 : 8;

    if (priceUsdLabel) priceUsdLabel.textContent = `$${selectedPlanUsd.toFixed(2)} USD`;

    recalcXmrAmount();
  }

  planButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      planButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      updatePlanStateFromDom();
    });
  });

  // ============== COIN (only XMR) ==============

  coinButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const coin = (btn.dataset.coin || "").toUpperCase();

      // Your HTML uses data-coin="XMR", etc.
      if (coin !== "XMR") {
        showToast(`${coin} is not supported yet. Use Monero (XMR) for now.`, "error");
        return;
      }

      selectedCurrency = "XMR";
      coinButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (priceCoinCode) priceCoinCode.textContent = "XMR";
      recalcXmrAmount();
    });
  });

  // ============== PRICES ==============

  async function loadPrices() {
    try {
      if (priceSourceLabel) priceSourceLabel.textContent = "Loading…";

      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,tether,usd-coin,monero&vs_currencies=usd",
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("HTTP " + res.status);

      const json = await res.json();

      prices = {
        BTC: json.bitcoin?.usd ?? null,
        ETH: json.ethereum?.usd ?? null,
        SOL: json.solana?.usd ?? null,
        USDT: json.tether?.usd ?? null,
        USDC: json["usd-coin"]?.usd ?? null,
        XMR: json.monero?.usd ?? null
      };

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

      const now = new Date();
      if (priceSourceLabel) {
        const hh = now.getHours().toString().padStart(2, "0");
        const mm = now.getMinutes().toString().padStart(2, "0");
        priceSourceLabel.textContent = `Updated ${hh}:${mm}`;
      }

      recalcXmrAmount();
    } catch (err) {
      console.error("Failed to load prices:", err);
      if (priceSourceLabel) priceSourceLabel.textContent = "Price unavailable";
      showToast("Could not load live prices. Try again later.", "error");
      prices = null;
      recalcXmrAmount();
    }
  }

  function recalcXmrAmount() {
    if (!priceCoinLabel) return;

    if (!prices || !prices.XMR) {
      priceCoinLabel.textContent = "–";
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice)) {
      priceCoinLabel.textContent = "–";
      return;
    }

    const amt = selectedPlanUsd / xmrPrice;
    const amtRounded = Math.max(amt, 0).toFixed(6);
    priceCoinLabel.textContent = `${amtRounded} XMR`;
  }

  // ============== SUBSCRIPTION STATUS ==============

  async function loadSubscriptionStatus() {
    if (!subscriptionStatus) return;

    if (!isLoggedIn()) {
      subscriptionStatus.innerHTML =
        `<div class="subscription-status-card">` +
        `<div class="subscription-status-title">Not subscribed</div>` +
        `<div class="subscription-status-sub">Log in to subscribe.</div>` +
        `</div>`;
      return;
    }

    try {
      const token = getToken();
      const res = await fetch(`${PAYMENT_API_BASE_URL}/subscription/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        subscriptionStatus.innerHTML =
          `<div class="subscription-status-card">` +
          `<div class="subscription-status-title">Not subscribed</div>` +
          `<div class="subscription-status-sub">Session expired. Please log in again.</div>` +
          `</div>`;
        return;
      }

      if (!res.ok) throw new Error("HTTP " + res.status);

      const data = await res.json();
      const active = !!data.active;
      const plan = data.subscription?.plan || null;
      const exp = data.subscription?.expires_at || null;

      if (!active) {
        subscriptionStatus.innerHTML =
          `<div class="subscription-status-card">` +
          `<div class="subscription-status-title">Not subscribed</div>` +
          `<div class="subscription-status-sub">Subscribe to get Verified.</div>` +
          `</div>`;
        return;
      }

      subscriptionStatus.innerHTML =
        `<div class="subscription-status-card success">` +
        `<div class="subscription-status-title">Subscribed</div>` +
        `<div class="subscription-status-sub">Plan: ${plan || "—"}${exp ? ` • Expires: ${new Date(exp).toLocaleString()}` : ""}</div>` +
        `</div>`;
    } catch (err) {
      console.error("Subscription status error:", err);
      subscriptionStatus.innerHTML =
        `<div class="subscription-status-card">` +
        `<div class="subscription-status-title">Could not load subscription status.</div>` +
        `<div class="subscription-status-sub">Your backend endpoint may be missing. Add /api/subscription/me.</div>` +
        `</div>`;
    }
  }

  // ============== INVOICE FLOW ==============

  function resetInvoiceUi() {
    currentInvoiceId = null;

    if (invoiceSection) invoiceSection.style.display = "none";

    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
    if (statusPollId) {
      clearInterval(statusPollId);
      statusPollId = null;
    }
  }

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
      }
    };

    update();
    countdownTimerId = setInterval(update, 1000);
  }

  async function pollInvoiceStatus(invoiceId) {
    if (!invoiceId) return;

    async function tick() {
      try {
        const token = getToken();
        const res = await fetch(
          `${PAYMENT_API_BASE_URL}/payments/status/${encodeURIComponent(invoiceId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (res.status === 401) return; // don’t spam toasts

        if (!res.ok) return;

        const data = await res.json();

        if (invoiceStatusLabel) invoiceStatusLabel.textContent = data.status || "pending";

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

  async function handleGenerateInvoice() {
    // Must be logged in
    if (!isLoggedIn()) {
      requireLogin("Please log in to subscribe.");
      return;
    }

    // Only XMR accepted
    if (selectedCurrency !== "XMR") {
      showToast("Right now only Monero (XMR) is accepted.", "error");
      return;
    }

    // Need price loaded to estimate XMR
    if (!prices || !prices.XMR) {
      showToast("Waiting for XMR price. Try again in a few seconds.", "error");
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice)) {
      showToast("XMR price unavailable.", "error");
      return;
    }

    const amountXmr = selectedPlanUsd / xmrPrice;

    if (generateInvoiceBtn) generateInvoiceBtn.disabled = true;

    try {
      const token = getToken();

      // IMPORTANT: your Supabase invoices.plan ONLY allows monthly/yearly
      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: selectedPlan,       // <-- MUST be "monthly" or "yearly"
          currency: "XMR",
          amount_crypto: amountXmr  // server stores numeric
        })
      });

      const payload = await res.json().catch(() => ({}));

      if (res.status === 401) {
        requireLogin(payload?.error || "Session expired. Please log in again.");
        return;
      }

      if (!res.ok) {
        showToast(payload?.error || `Failed to create invoice (HTTP ${res.status})`, "error");
        return;
      }

      const invoice = payload;
      currentInvoiceId = invoice.id;

      // Show invoice section
      if (invoiceSection) invoiceSection.style.display = "block";

      if (invoicePlanLabel) invoicePlanLabel.textContent = invoice.plan || selectedPlan;
      if (invoiceAmountLabel) {
        const amt = Number(invoice.amount_crypto ?? amountXmr);
        invoiceAmountLabel.textContent = `${amt.toFixed(6)} XMR (≈ $${Number(invoice.amount_usd ?? selectedPlanUsd).toFixed(2)})`;
      }
      if (invoiceCurrencyLabel) invoiceCurrencyLabel.textContent = invoice.currency || "XMR";
      if (invoiceStatusLabel) invoiceStatusLabel.textContent = invoice.status || "pending";

      if (invoiceAddressText) invoiceAddressText.textContent = invoice.address || "—";

      // QR
      if (invoice.qr_string && invoiceQrImage) {
        const qrUrl =
          "https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=" +
          encodeURIComponent(invoice.qr_string);
        invoiceQrImage.src = qrUrl;
      }

      // Reset bars
      if (confirmationsLabel) confirmationsLabel.textContent = `0 / ${invoice.required_confirmations || 10}`;
      if (confirmationsBar) confirmationsBar.style.width = "0%";

      // timers
      if (countdownTimerId) clearInterval(countdownTimerId);
      if (statusPollId) clearInterval(statusPollId);

      startCountdown(invoiceLifetimeSeconds);
      pollInvoiceStatus(invoice.id);

      showToast("Invoice created. Send the payment from your Monero wallet.", "success");
    } catch (err) {
      console.error("Create invoice error:", err);
      showToast("Failed to create invoice. Try again.", "error");
    } finally {
      if (generateInvoiceBtn) generateInvoiceBtn.disabled = false;
    }
  }

  if (generateInvoiceBtn) {
    generateInvoiceBtn.addEventListener("click", handleGenerateInvoice);
  }

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

  // ============== INIT ==============

  updatePlanStateFromDom();
  resetInvoiceUi();
  loadPrices();
  loadSubscriptionStatus();

  // Refresh prices every 60s (optional, keeps “Updated” fresh)
  setInterval(loadPrices, 60000);
});
