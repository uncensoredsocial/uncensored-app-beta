// js/payment.js
// Payment page logic for Subscription (Monero/XMR for now)

// Prefer global API_BASE_URL from auth.js if it exists
const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== "undefined" && API_BASE_URL
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

document.addEventListener("DOMContentLoaded", () => {
  // =============================
  // DOM CACHE
  // =============================

  // Header back button
  const backBtn = document.getElementById("paymentBackButton");

  // Plan + coin buttons
  const planButtons = Array.from(document.querySelectorAll(".plan-card"));
  const coinButtons = Array.from(document.querySelectorAll(".coin-card"));

  // Price summary labels
  const priceUsdLabel = document.getElementById("priceUsdLabel");
  const priceCoinCode = document.getElementById("priceCoinCode");
  const priceCoinLabel = document.getElementById("priceCoinLabel");
  const priceSourceLabel = document.getElementById("priceSourceLabel");

  // Continue button (your HTML uses generateInvoiceBtn)
  const generateInvoiceBtn = document.getElementById("generateInvoiceBtn");

  // Subscription status
  const subscriptionStatus = document.getElementById("subscriptionStatus");

  // Invoice section + labels (your HTML IDs)
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

  // Coin price DOM ids in your HTML
  const coinPriceIds = {
    BTC: "btcPriceUsd",
    ETH: "ethPriceUsd",
    SOL: "solPriceUsd",
    USDC: "usdcPriceUsd",
    USDT: "usdtPriceUsd",
    XMR: "xmrPriceUsd"
  };

  // =============================
  // STATE
  // =============================
  let selectedPlan = "monthly"; // monthly | yearly
  let selectedPlanUsd = 8;

  let selectedCurrency = "XMR"; // only XMR supported now
  let prices = null; // { BTC, ETH, SOL, USDC, USDT, XMR } in USD

  let currentInvoiceId = null;
  let countdownTimerId = null;
  let statusPollId = null;

  const INVOICE_LIFETIME_SECONDS = 30 * 60; // 30 minutes
  const PRICE_REFRESH_MS = 60 * 1000; // refresh prices every 60s
  let priceRefreshId = null;

  // =============================
  // UTIL: AUTH TOKEN (robust)
  // =============================
  function getToken() {
    // Try multiple keys (different files sometimes store different keys)
    const t =
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      localStorage.getItem("jwt") ||
      "";

    return (t || "").trim();
  }

  function authHeaders() {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function isProbablyLoggedIn() {
    return !!getToken();
  }

  // =============================
  // UTIL: TOASTS
  // =============================
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

  // =============================
  // UTIL: FETCH WITH TIMEOUT
  // =============================
  async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  // =============================
  // HEADER BACK BUTTON
  // =============================
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      // Try browser back first; fallback to home
      if (window.history && window.history.length > 1) window.history.back();
      else window.location.href = "index.html";
    });
  }

  // =============================
  // PLAN HANDLING
  // =============================
  function setPlan(plan) {
    selectedPlan = plan === "yearly" ? "yearly" : "monthly";
    selectedPlanUsd = selectedPlan === "yearly" ? 60 : 8;

    // Update active UI
    planButtons.forEach((b) => b.classList.remove("active"));
    const btn = planButtons.find((b) => (b.dataset.plan || "").toLowerCase() === selectedPlan);
    if (btn) btn.classList.add("active");

    // Update price summary
    if (priceUsdLabel) {
      priceUsdLabel.textContent = `$${Number(selectedPlanUsd).toFixed(2)} USD`;
    }

    // Recalc crypto
    recalcXmrAmount();
  }

  // Attach plan button listeners (your HTML uses data-plan and data-price-usd)
  planButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const plan = (btn.dataset.plan || "monthly").toLowerCase();
      setPlan(plan);
    });
  });

  // =============================
  // COIN HANDLING
  // =============================
  function setCoin(coin) {
    const c = (coin || "").toUpperCase();
    if (c !== "XMR") {
      showToast(`${c} is not supported yet. Use Monero (XMR) for now.`, "error");
      return;
    }

    selectedCurrency = "XMR";

    coinButtons.forEach((b) => b.classList.remove("active"));
    const xmrBtn = coinButtons.find((b) => (b.dataset.coin || "").toUpperCase() === "XMR");
    if (xmrBtn) xmrBtn.classList.add("active");

    if (priceCoinCode) priceCoinCode.textContent = "XMR";
    recalcXmrAmount();
  }

  coinButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const enabled = String(btn.dataset.enabled || "").toLowerCase();
      const coin = (btn.dataset.coin || "").toUpperCase();

      if (enabled !== "true") {
        // disabled coin — show message
        if (coin) showToast(`${coin} is not supported yet.`, "error");
        else showToast("This coin is not supported yet.", "error");
        return;
      }

      setCoin(coin);
    });
  });

  // =============================
  // PRICE FETCHING (CoinGecko)
  // =============================
  function setCoinPriceLabel(domId, value) {
    const el = document.getElementById(domId);
    if (!el) return;

    if (value == null || !Number.isFinite(Number(value))) {
      el.textContent = "—";
      return;
    }

    el.textContent = `$${Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  async function loadPrices() {
    if (priceSourceLabel) priceSourceLabel.textContent = "Loading…";

    try {
      // CoinGecko free endpoint can rate-limit; add timeout + graceful failure
      const url =
        "https://api.coingecko.com/api/v3/simple/price" +
        "?ids=bitcoin,ethereum,solana,tether,usd-coin,monero" +
        "&vs_currencies=usd";

      const res = await fetchWithTimeout(url, {}, 12000);
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

      // Update coin card USD labels
      Object.entries(prices).forEach(([coin, v]) => {
        const id = coinPriceIds[coin];
        if (id) setCoinPriceLabel(id, v);
      });

      if (priceSourceLabel) {
        const now = new Date();
        priceSourceLabel.textContent = `Updated ${now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })}`;
      }

      recalcXmrAmount();
    } catch (err) {
      console.error("Failed to load prices:", err);

      // Keep UI usable
      if (priceSourceLabel) priceSourceLabel.textContent = "Price unavailable";
      showToast("Could not load live prices. Try again later.", "error");
      prices = null;
      recalcXmrAmount();
    }
  }

  function recalcXmrAmount() {
    // Update estimated XMR label
    if (!priceCoinLabel) return;

    if (!prices || !prices.XMR) {
      priceCoinLabel.textContent = "—";
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice) || xmrPrice <= 0) {
      priceCoinLabel.textContent = "—";
      return;
    }

    const amt = selectedPlanUsd / xmrPrice;
    const amtRounded = Number(amt).toFixed(6);
    priceCoinLabel.textContent = `${amtRounded} XMR`;
  }

  // =============================
  // INVOICE UI HELPERS
  // =============================
  function hideInvoiceSection() {
    if (!invoiceSection) return;
    invoiceSection.style.display = "none";
  }

  function showInvoiceSection() {
    if (!invoiceSection) return;
    invoiceSection.style.display = "";
  }

  function clearInvoiceTimers() {
    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
    if (statusPollId) {
      clearInterval(statusPollId);
      statusPollId = null;
    }
  }

  function resetInvoiceUi() {
    currentInvoiceId = null;
    clearInvoiceTimers();
    hideInvoiceSection();

    if (invoicePlanLabel) invoicePlanLabel.textContent = "—";
    if (invoiceAmountLabel) invoiceAmountLabel.textContent = "—";
    if (invoiceCurrencyLabel) invoiceCurrencyLabel.textContent = "XMR";
    if (invoiceStatusLabel) invoiceStatusLabel.textContent = "Waiting for payment";
    if (invoiceCountdownLabel) invoiceCountdownLabel.textContent = "30:00";
    if (invoiceAddressText) invoiceAddressText.textContent = "—";
    if (invoiceQrImage) invoiceQrImage.removeAttribute("src");

    if (confirmationsLabel) confirmationsLabel.textContent = "0 / 10";
    if (confirmationsBar) confirmationsBar.style.width = "0%";
  }

  function startCountdown(seconds) {
    if (!invoiceCountdownLabel) return;

    let remaining = seconds;

    const update = () => {
      const m = Math.floor(remaining / 60).toString().padStart(2, "0");
      const s = Math.floor(remaining % 60).toString().padStart(2, "0");
      invoiceCountdownLabel.textContent = `${m}:${s}`;
      remaining -= 1;

      if (remaining < 0) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
        // Invoice probably expired; keep section visible but show toast
        showToast("Invoice expired. Tap Continue to create a new one.", "error", 4500);
      }
    };

    update();
    countdownTimerId = setInterval(update, 1000);
  }

  function setConfirmations(conf, req) {
    const c = Number(conf || 0);
    const r = Number(req || 10);

    if (confirmationsLabel) confirmationsLabel.textContent = `${c} / ${r}`;

    if (confirmationsBar) {
      const pct = Math.max(0, Math.min(100, (c / r) * 100));
      confirmationsBar.style.width = `${pct}%`;
    }
  }

  // =============================
  // SUBSCRIPTION STATUS
  // =============================
  async function loadSubscriptionStatus() {
    if (!subscriptionStatus) return;

    // Not logged in: show CTA (but don't force redirect)
    if (!isProbablyLoggedIn()) {
      subscriptionStatus.innerHTML = `
        <div style="padding: 12px 0; color: var(--text-muted);">
          You’re not logged in. <a href="login.html" style="color: var(--primary-color);">Log in</a> to subscribe.
        </div>
      `;
      return;
    }

    try {
      const res = await fetch(`${PAYMENT_API_BASE_URL}/subscription/me`, {
        headers: authHeaders()
      });

      if (res.status === 401) {
        // Token missing/invalid/expired
        subscriptionStatus.innerHTML = `
          <div style="padding: 12px 0; color: var(--text-muted);">
            Your session needs a fresh login. <a href="login.html" style="color: var(--primary-color);">Log in again</a>.
          </div>
        `;
        return;
      }

      if (!res.ok) {
        subscriptionStatus.innerHTML = `
          <div style="padding: 12px 0; color: var(--text-muted);">
            Could not load subscription status.
          </div>
        `;
        return;
      }

      const data = await res.json();
      const active = !!data.active;
      const sub = data.subscription || null;

      if (!active) {
        subscriptionStatus.innerHTML = `
          <div style="padding: 12px 0; color: var(--text-muted);">
            Status: <strong style="color: var(--text-color);">Not subscribed</strong>
          </div>
        `;
        return;
      }

      const exp = sub?.expires_at ? new Date(sub.expires_at) : null;
      const expText = exp ? exp.toLocaleString() : "—";

      subscriptionStatus.innerHTML = `
        <div style="padding: 12px 0;">
          <div style="color: var(--text-muted); font-size: 0.9rem;">Status</div>
          <div style="font-weight: 700; margin-top: 2px;">
            <span style="color: var(--success-color);">Active</span>
          </div>
          <div style="color: var(--text-muted); margin-top: 6px; font-size: 0.9rem;">
            Expires: <span style="color: var(--text-color); font-weight: 600;">${expText}</span>
          </div>
        </div>
      `;
    } catch (err) {
      console.error("Subscription status error:", err);
      subscriptionStatus.innerHTML = `
        <div style="padding: 12px 0; color: var(--text-muted);">
          Could not load subscription status.
        </div>
      `;
    }
  }

  // =============================
  // POLL INVOICE STATUS
  // =============================
  async function pollInvoiceStatus(invoiceId) {
    if (!invoiceId) return;
    if (!isProbablyLoggedIn()) return;

    async function tick() {
      try {
        const res = await fetch(
          `${PAYMENT_API_BASE_URL}/payments/status/${encodeURIComponent(invoiceId)}`,
          { headers: authHeaders() }
        );

        if (res.status === 401) {
          // Don't auto-redirect; show message
          showToast("Session expired. Log in again to keep tracking status.", "error", 5000);
          clearInterval(statusPollId);
          statusPollId = null;
          return;
        }

        if (!res.ok) {
          console.warn("Invoice status HTTP", res.status);
          return;
        }

        const data = await res.json();

        if (invoiceStatusLabel) {
          const st = (data.status || "pending").toString();
          invoiceStatusLabel.textContent =
            st === "confirmed" ? "Confirmed ✅" :
            st === "paid" ? "Paid (waiting confirmations)" :
            st === "expired" ? "Expired" :
            "Waiting for payment";
        }

        setConfirmations(data.confirmations, data.required_confirmations);

        // If confirmed: refresh subscription status
        if ((data.status || "").toLowerCase() === "confirmed") {
          showToast("Payment confirmed. Your subscription will update shortly.", "success", 5000);
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

  // =============================
  // CREATE INVOICE
  // =============================
  function computedXmrAmount() {
    if (!prices || !prices.XMR) return null;
    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice) || xmrPrice <= 0) return null;
    const amt = selectedPlanUsd / xmrPrice;
    return Number(amt);
  }

  async function handleCreateInvoice() {
    // Require login (but don’t hard-redirect instantly; show message)
    if (!isProbablyLoggedIn()) {
      showToast("You need to be logged in to subscribe.", "error", 4500);
      // Optional: send them to login after a short delay if you want
      // setTimeout(() => (window.location.href = "login.html"), 800);
      return;
    }

    // Currency fixed for now
    if (selectedCurrency !== "XMR") {
      showToast("Right now only Monero (XMR) is accepted.", "error");
      return;
    }

    // Need a price to estimate amount
    const amtXmr = computedXmrAmount();
    if (!amtXmr) {
      showToast("Waiting for XMR price. Try again in a few seconds.", "error");
      return;
    }

    if (!generateInvoiceBtn) return;
    generateInvoiceBtn.disabled = true;

    try {
      // Create invoice on backend
      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          plan: selectedPlan,
          currency: "XMR",
          amount_crypto: amtXmr
        })
      });

      if (res.status === 401) {
        showToast("Session expired. Please log in again.", "error", 5000);
        // Don't force redirect; user can tap login link from status block
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg = errJson?.error || `Failed to create invoice (HTTP ${res.status})`;
        showToast(msg, "error", 5000);
        return;
      }

      const invoice = await res.json();
      currentInvoiceId = invoice.id;

      // Show invoice section
      showInvoiceSection();

      // Fill invoice fields
      if (invoicePlanLabel) {
        invoicePlanLabel.textContent = selectedPlan === "yearly" ? "Yearly" : "Monthly";
      }

      const finalXmr = Number(invoice.amount_crypto ?? amtXmr);
      const finalUsd = Number(invoice.amount_usd ?? selectedPlanUsd);

      if (invoiceAmountLabel) {
        invoiceAmountLabel.textContent = `${finalXmr.toFixed(6)} XMR (≈ $${finalUsd.toFixed(2)})`;
      }

      if (invoiceCurrencyLabel) {
        invoiceCurrencyLabel.textContent = (invoice.currency || "XMR").toUpperCase();
      }

      if (invoiceStatusLabel) {
        const st = (invoice.status || "pending").toString().toLowerCase();
        invoiceStatusLabel.textContent =
          st === "confirmed" ? "Confirmed ✅" :
          st === "paid" ? "Paid (waiting confirmations)" :
          st === "expired" ? "Expired" :
          "Waiting for payment";
      }

      if (invoiceAddressText) {
        invoiceAddressText.textContent = invoice.address || "—";
      }

      // Build QR image (qr_string from backend)
      if (invoice.qr_string && invoiceQrImage) {
        const qrUrl =
          "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" +
          encodeURIComponent(invoice.qr_string);
        invoiceQrImage.src = qrUrl;
      }

      // Confirmations
      setConfirmations(invoice.confirmations, invoice.required_confirmations);

      // Timers / polling
      clearInvoiceTimers();
      startCountdown(INVOICE_LIFETIME_SECONDS);
      pollInvoiceStatus(invoice.id);

      showToast("Invoice created. Send the exact amount from your Monero wallet.", "success", 4500);

      // Refresh subscription status panel too
      loadSubscriptionStatus();
    } catch (err) {
      console.error("Create invoice error:", err);
      showToast("Failed to create invoice. Try again.", "error", 5000);
    } finally {
      generateInvoiceBtn.disabled = false;
    }
  }

  if (generateInvoiceBtn) {
    generateInvoiceBtn.addEventListener("click", handleCreateInvoice);
  }

  // =============================
  // COPY ADDRESS
  // =============================
  if (copyAddressBtn && invoiceAddressText) {
    copyAddressBtn.addEventListener("click", async () => {
      const text = (invoiceAddressText.textContent || "").trim();
      if (!text || text === "—") return;

      try {
        await navigator.clipboard.writeText(text);
        showToast("Address copied to clipboard.", "success");
      } catch (err) {
        console.error("Copy failed:", err);
        // iOS sometimes blocks clipboard depending on context
        showToast("Could not copy. Tap and hold the address to copy.", "error", 4500);
      }
    });
  }

  // =============================
  // INIT
  // =============================

  // Default UI: monthly + XMR
  setPlan("monthly");
  setCoin("XMR");

  // Hide invoice section until created
  resetInvoiceUi();

  // Load subscription status (shows login CTA if not logged in)
  loadSubscriptionStatus();

  // Load prices and refresh them
  loadPrices();
  if (priceRefreshId) clearInterval(priceRefreshId);
  priceRefreshId = setInterval(loadPrices, PRICE_REFRESH_MS);

  // Helpful: if CoinGecko is blocked/rate-limited, allow user to tap to retry
  if (priceSourceLabel) {
    priceSourceLabel.style.cursor = "pointer";
    priceSourceLabel.title = "Tap to refresh price";
    priceSourceLabel.addEventListener("click", () => {
      loadPrices();
      showToast("Refreshing price…", "default", 1200);
    });
  }
});
