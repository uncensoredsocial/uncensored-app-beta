// js/payment.js

// Use the same API base URL pattern as the rest of your site
const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // DOM CACHE (MATCHES YOUR HTML)
  // =========================

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
  const copyAddressBtn = document.getElementById("copyAddressBtn");

  const invoiceQrImage = document.getElementById("invoiceQrImage");

  const confirmationsLabel = document.getElementById("confirmationsLabel");
  const confirmationsBar = document.getElementById("confirmationsBar");

  const statusContainer = document.getElementById("paymentStatusContainer");

  // =========================
  // STATE
  // =========================

  let selectedPlan = "monthly"; // monthly | yearly
  let selectedPlanUsd = 8;

  let selectedCurrency = "XMR"; // only accepted
  let prices = null;

  let currentInvoiceId = null;

  let countdownTimerId = null;
  let statusPollId = null;

  const invoiceLifetimeSeconds = 30 * 60; // 30 minutes

  // =========================
  // AUTH HELPERS (MATCH YOUR auth.js KEYS)
  // =========================

  const TOKEN_KEY = "us_auth_token"; // IMPORTANT: your auth.js uses this
  const USER_KEY = "us_current_user";
  const REDIRECT_KEY = "us_redirect_after_login";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function saveRedirectHere() {
    try {
      // store the current page so login can bring them back
      localStorage.setItem(REDIRECT_KEY, window.location.href);
    } catch {}
  }

  function goToLogin() {
    saveRedirectHere();
    window.location.href = "login.html";
  }

  function handleAuthFailure(message) {
    // message examples:
    // "Missing auth token" or "Invalid or expired token"
    showToast(message || "Please log in to subscribe.", "error", 3500);
    saveRedirectHere();
    // small delay so toast is visible
    setTimeout(() => {
      window.location.href = "login.html";
    }, 700);
  }

  // =========================
  // TOASTS
  // =========================

  function showToast(message, type = "default", ms = 3500) {
    if (!statusContainer) return;
    const div = document.createElement("div");
    div.className = "payment-toast" + (type !== "default" ? " " + type : "");
    div.textContent = message;
    statusContainer.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  // =========================
  // UI: BACK BUTTON
  // =========================

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (history.length > 1) history.back();
      else window.location.href = "index.html";
    });
  }

  // =========================
  // PLAN HANDLING
  // =========================

  function setPlan(plan) {
    selectedPlan = plan === "yearly" ? "yearly" : "monthly";
    selectedPlanUsd = selectedPlan === "yearly" ? 60 : 8;

    // update plan card states
    planButtons.forEach((b) => {
      b.classList.toggle("active", b.dataset.plan === selectedPlan);
    });

    // update labels
    if (priceUsdLabel) priceUsdLabel.textContent = `$${selectedPlanUsd.toFixed(2)} USD`;

    recalcXmrAmount();
  }

  // Initialize plan from active button in DOM (fallback to monthly)
  (function initPlanFromDom() {
    const activeBtn = planButtons.find((b) => b.classList.contains("active"));
    if (activeBtn?.dataset?.plan) setPlan(activeBtn.dataset.plan);
    else setPlan("monthly");
  })();

  planButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const plan = btn.dataset.plan;
      if (!plan) return;
      setPlan(plan);
    });
  });

  // =========================
  // COIN HANDLING (YOUR HTML uses data-coin + data-enabled)
  // =========================

  function setCoin(coin) {
    // only allow XMR
    if (coin !== "XMR") {
      showToast(`${coin} is not supported yet. Use Monero (XMR).`, "error");
      return;
    }

    selectedCurrency = "XMR";

    coinButtons.forEach((b) => {
      b.classList.toggle("active", b.dataset.coin === "XMR");
    });

    if (priceCoinCode) priceCoinCode.textContent = "XMR";
    recalcXmrAmount();
  }

  coinButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const coin = btn.dataset.coin; // IMPORTANT: your HTML uses data-coin
      const enabled = btn.dataset.enabled === "true";

      if (!coin) return;

      if (!enabled && coin !== "XMR") {
        showToast(`${coin} is not supported yet.`, "error");
        return;
      }

      setCoin(coin);
    });
  });

  // Ensure XMR active by default
  setCoin("XMR");

  // =========================
  // PRICE FETCHING (COINGECKO)
  // =========================

  function setPriceText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!value) el.textContent = "—";
    else {
      el.textContent = `$${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
    }
  }

  async function loadPrices() {
    try {
      if (priceSourceLabel) priceSourceLabel.textContent = "Loading…";

      const url =
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,tether,usd-coin,monero&vs_currencies=usd";

      const res = await fetch(url, { cache: "no-store" });
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

      // Update the right-side prices in your coin cards (these IDs are in your HTML)
      setPriceText("btcPriceUsd", prices.BTC);
      setPriceText("ethPriceUsd", prices.ETH);
      setPriceText("solPriceUsd", prices.SOL);
      setPriceText("usdcPriceUsd", prices.USDC);
      setPriceText("usdtPriceUsd", prices.USDT);
      setPriceText("xmrPriceUsd", prices.XMR);

      recalcXmrAmount();

      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      if (priceSourceLabel) priceSourceLabel.textContent = `Updated ${hh}:${mm}`;
    } catch (err) {
      console.error("Failed to load prices:", err);
      if (priceSourceLabel) priceSourceLabel.textContent = "Price unavailable";
      showToast("Could not load live prices. Try again.", "error");
    }
  }

  function recalcXmrAmount() {
    if (!priceCoinLabel) return;

    if (!prices || !prices.XMR) {
      priceCoinLabel.textContent = "—";
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice)) {
      priceCoinLabel.textContent = "—";
      return;
    }

    const amt = selectedPlanUsd / xmrPrice;
    const amtRounded = Math.max(amt, 0).toFixed(6);
    priceCoinLabel.textContent = `${amtRounded} XMR`;
  }

  // refresh prices every 60 seconds so it doesn’t get stuck on “Loading…”
  loadPrices();
  setInterval(loadPrices, 60000);

  // =========================
  // SUBSCRIPTION STATUS (optional UI)
  // =========================

  async function loadSubscriptionStatus() {
    if (!subscriptionStatus) return;

    if (!isLoggedIn()) {
      subscriptionStatus.innerHTML =
        `<div class="section-caption">Log in to view your current subscription status.</div>`;
      return;
    }

    try {
      const res = await fetch(`${PAYMENT_API_BASE_URL}/subscription/me`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json"
        }
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        handleAuthFailure(data?.error || "Session expired. Please log in again.");
        return;
      }

      if (!res.ok) {
        subscriptionStatus.innerHTML =
          `<div class="section-caption">Could not load subscription status.</div>`;
        return;
      }

      if (data.active && data.subscription) {
        const exp = data.subscription.expires_at
          ? new Date(data.subscription.expires_at).toLocaleString()
          : "—";
        subscriptionStatus.innerHTML = `
          <div class="section-caption">
            <strong>Verified is active.</strong><br/>
            Expires: ${exp}
          </div>
        `;
      } else {
        subscriptionStatus.innerHTML = `
          <div class="section-caption">
            You are not currently subscribed.
          </div>
        `;
      }
    } catch (err) {
      console.error("loadSubscriptionStatus error:", err);
      subscriptionStatus.innerHTML =
        `<div class="section-caption">Could not load subscription status.</div>`;
    }
  }

  loadSubscriptionStatus();

  // =========================
  // INVOICE UI HELPERS
  // =========================

  function resetInvoiceUi() {
    if (invoiceSection) invoiceSection.style.display = "none";
    currentInvoiceId = null;

    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
    if (statusPollId) {
      clearInterval(statusPollId);
      statusPollId = null;
    }

    if (confirmationsLabel) confirmationsLabel.textContent = "0 / 10";
    if (confirmationsBar) confirmationsBar.style.width = "0%";
  }

  function showInvoiceUi() {
    if (invoiceSection) invoiceSection.style.display = "block";
    // scroll into view nicely on mobile
    try {
      invoiceSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {}
  }

  function startCountdown(seconds) {
    if (!invoiceCountdownLabel) return;

    let remaining = seconds;

    const update = () => {
      const m = Math.floor(remaining / 60)
        .toString()
        .padStart(2, "0");
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

  // =========================
  // POLL INVOICE STATUS
  // =========================

  async function pollInvoiceStatus(invoiceId) {
    if (!invoiceId) return;

    async function tick() {
      try {
        const res = await fetch(
          `${PAYMENT_API_BASE_URL}/payments/status/${encodeURIComponent(invoiceId)}`,
          {
            headers: {
              Authorization: `Bearer ${getToken()}`,
              "Content-Type": "application/json"
            }
          }
        );

        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
          handleAuthFailure(data?.error || "Session expired. Please log in again.");
          return;
        }

        if (!res.ok) return;

        // Update status
        if (invoiceStatusLabel) {
          invoiceStatusLabel.textContent = data.status || "pending";
        }

        // Update confirmations
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

        // Confirmed
        if (data.status === "confirmed") {
          showToast("Payment confirmed. Your account will upgrade shortly.", "success", 5000);
          clearInterval(statusPollId);
          statusPollId = null;

          // refresh subscription badge/status
          loadSubscriptionStatus();
        }
      } catch (err) {
        console.error("Status poll failed:", err);
      }
    }

    await tick();
    statusPollId = setInterval(tick, 20000);
  }

  // =========================
  // CREATE INVOICE
  // =========================

  async function handleGenerateInvoice() {
    // must be logged in
    if (!isLoggedIn()) {
      handleAuthFailure("Please log in to subscribe.");
      return;
    }

    if (selectedCurrency !== "XMR") {
      showToast("Right now only Monero (XMR) is accepted.", "error");
      return;
    }

    if (!prices || !prices.XMR) {
      showToast("Waiting for XMR price… try again in a moment.", "error");
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
      // ✅ This fixes your “Missing plan_slug” toast from the backend
      const planSlug = selectedPlan === "yearly" ? "verified_yearly" : "verified_monthly";

      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          plan: selectedPlan,
          plan_slug: planSlug, // ✅ ADDED
          currency: "XMR",
          amount_crypto: Number(amountXmr.toFixed(12))
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        handleAuthFailure(data?.error || "Session expired. Please log in again.");
        return;
      }

      if (!res.ok) {
        showToast(data?.error || `Failed to create invoice (HTTP ${res.status})`, "error", 4500);
        return;
      }

      // success
      const invoice = data;
      currentInvoiceId = invoice.id;

      // Fill invoice UI
      if (invoicePlanLabel) {
        invoicePlanLabel.textContent = selectedPlan === "yearly" ? "Yearly" : "Monthly";
      }

      if (invoiceAmountLabel) {
        const cryptoAmt = (invoice.amount_crypto ?? amountXmr);
        const usdAmt = (invoice.amount_usd ?? selectedPlanUsd);
        invoiceAmountLabel.textContent = `${Number(cryptoAmt).toFixed(6)} XMR (≈ $${Number(usdAmt).toFixed(2)})`;
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
      } else if (invoiceQrImage) {
        invoiceQrImage.removeAttribute("src");
      }

      // Confirmations
      if (confirmationsLabel) {
        const conf = Number(invoice.confirmations || 0);
        const req = Number(invoice.required_confirmations || 10);
        confirmationsLabel.textContent = `${conf} / ${req}`;
      }
      if (confirmationsBar) confirmationsBar.style.width = "0%";

      // Show section + timers
      showInvoiceUi();

      if (countdownTimerId) clearInterval(countdownTimerId);
      if (statusPollId) clearInterval(statusPollId);

      startCountdown(invoiceLifetimeSeconds);
      pollInvoiceStatus(invoice.id);

      showToast("Invoice created. Send the exact amount from your Monero wallet.", "success", 4500);
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

  // =========================
  // COPY ADDRESS
  // =========================

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

  // =========================
  // INIT
  // =========================

  resetInvoiceUi();
});
