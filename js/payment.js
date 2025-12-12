// js/payment.js

const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

document.addEventListener("DOMContentLoaded", () => {
  // ----------------------------
  // DOM
  // ----------------------------
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

  // ----------------------------
  // State
  // ----------------------------
  let selectedPlan = "monthly";
  let selectedPlanUsd = 8;

  let selectedCoin = "XMR"; // only supported
  let prices = null;

  let currentInvoiceId = null;
  let countdownTimerId = null;
  let pollTimerId = null;

  const invoiceLifetimeSeconds = 30 * 60; // 30 min

  // ----------------------------
  // Token helper (fixes “Missing auth token” / “Invalid token” UX)
  // ----------------------------
  function getToken() {
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      localStorage.getItem("jwt") ||
      ""
    );
  }

  function requireLoginOrToast() {
    const token = getToken();
    if (!token) {
      showToast("You must be logged in to subscribe.", "error");
      // optional redirect:
      setTimeout(() => (window.location.href = "login.html"), 700);
      return null;
    }
    return token;
  }

  // ----------------------------
  // Toasts
  // ----------------------------
  function showToast(message, type = "default", ms = 3200) {
    if (!statusContainer) return;
    const div = document.createElement("div");
    div.className = "payment-toast" + (type !== "default" ? " " + type : "");
    div.textContent = message;
    statusContainer.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  // ----------------------------
  // Back button
  // ----------------------------
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      // go back if possible, else go home
      if (window.history.length > 1) window.history.back();
      else window.location.href = "settings.html";
    });
  }

  // ----------------------------
  // Plan selection (fixes “can’t switch monthly/yearly”)
  // ----------------------------
  function setActivePlan(btn) {
    planButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    selectedPlan = btn.dataset.plan === "yearly" ? "yearly" : "monthly";
    selectedPlanUsd = Number(btn.dataset.priceUsd || (selectedPlan === "yearly" ? 60 : 8));

    if (priceUsdLabel) priceUsdLabel.textContent = `$${selectedPlanUsd.toFixed(2)} USD`;

    recalcXmrAmount();
  }

  planButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActivePlan(btn));
  });

  // ----------------------------
  // Coin selection (HTML uses data-coin + data-enabled)
  // ----------------------------
  function setActiveCoin(btn) {
    const coin = (btn.dataset.coin || "").toUpperCase();
    const enabled = btn.dataset.enabled === "true";

    if (!coin) return;

    if (!enabled) {
      showToast(`${coin} is not supported yet. Use Monero (XMR) for now.`, "error");
      return;
    }

    // Only XMR supported for now
    if (coin !== "XMR") {
      showToast(`${coin} is not supported yet. Use Monero (XMR) for now.`, "error");
      return;
    }

    selectedCoin = "XMR";
    coinButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    if (priceCoinCode) priceCoinCode.textContent = "XMR";
    recalcXmrAmount();
  }

  coinButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveCoin(btn));
  });

  // ----------------------------
  // Price loading (CoinGecko + fallback)
  // ----------------------------
  async function fetchJsonWithTimeout(url, ms = 9000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  async function loadPrices() {
    if (priceSourceLabel) priceSourceLabel.textContent = "Loading…";

    // 1) CoinGecko
    try {
      const json = await fetchJsonWithTimeout(
        "https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd",
        9000
      );

      const xmr = json?.monero?.usd ?? null;
      if (!xmr) throw new Error("No XMR price");

      prices = { XMR: Number(xmr) };

      if (priceSourceLabel) priceSourceLabel.textContent = "Updated (CoinGecko)";
      recalcXmrAmount();
      return;
    } catch (e) {
      console.warn("CoinGecko failed:", e);
    }

    // 2) Fallback (CoinCap)
    try {
      const json = await fetchJsonWithTimeout(
        "https://api.coincap.io/v2/assets/monero",
        9000
      );

      const xmr = json?.data?.priceUsd ? Number(json.data.priceUsd) : null;
      if (!xmr || !Number.isFinite(xmr)) throw new Error("No XMR price");

      prices = { XMR: xmr };

      if (priceSourceLabel) priceSourceLabel.textContent = "Updated (CoinCap)";
      recalcXmrAmount();
      return;
    } catch (e) {
      console.warn("CoinCap failed:", e);
    }

    // total failure
    prices = null;
    if (priceSourceLabel) priceSourceLabel.textContent = "Price unavailable";
    if (priceCoinLabel) priceCoinLabel.textContent = "—";
    showToast("Could not load XMR price right now. Try again later.", "error");
  }

  function recalcXmrAmount() {
    if (!priceCoinLabel) return;

    const xmrPrice = prices?.XMR;
    if (!xmrPrice || !Number.isFinite(xmrPrice) || xmrPrice <= 0) {
      priceCoinLabel.textContent = "—";
      return;
    }

    const amt = selectedPlanUsd / xmrPrice;
    const amtRounded = Math.max(amt, 0).toFixed(6);
    priceCoinLabel.textContent = `${amtRounded} XMR`;
  }

  // ----------------------------
  // Subscription status UI
  // ----------------------------
  async function loadSubscriptionStatus() {
    const token = getToken();
    if (!token || !subscriptionStatus) {
      if (subscriptionStatus) subscriptionStatus.innerHTML = "";
      return;
    }

    try {
      const res = await fetch(`${PAYMENT_API_BASE_URL}/subscription/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) return;

      const data = await res.json();
      if (data?.active) {
        const exp = data.subscription?.expires_at
          ? new Date(data.subscription.expires_at).toLocaleString()
          : "—";
        subscriptionStatus.innerHTML = `
          <div class="price-box">
            <div class="price-row">
              <span class="price-label">Subscription</span>
              <span class="price-value">Active</span>
            </div>
            <div class="price-row price-row-muted">
              <span class="price-label">Expires</span>
              <span class="price-value">${exp}</span>
            </div>
          </div>
        `;
      } else {
        subscriptionStatus.innerHTML = "";
      }
    } catch (e) {
      console.warn("subscription status failed:", e);
    }
  }

  // ----------------------------
  // Invoice UI helpers
  // ----------------------------
  function clearTimers() {
    if (countdownTimerId) clearInterval(countdownTimerId);
    if (pollTimerId) clearInterval(pollTimerId);
    countdownTimerId = null;
    pollTimerId = null;
  }

  function showInvoiceSection() {
    if (!invoiceSection) return;
    invoiceSection.style.display = "block";
    // smooth scroll to it
    setTimeout(() => {
      invoiceSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function startCountdown(seconds) {
    if (!invoiceCountdownLabel) return;

    let remaining = seconds;

    const tick = () => {
      const m = Math.floor(remaining / 60).toString().padStart(2, "0");
      const s = Math.floor(remaining % 60).toString().padStart(2, "0");
      invoiceCountdownLabel.textContent = `${m}:${s}`;

      remaining -= 1;
      if (remaining < 0) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
      }
    };

    tick();
    countdownTimerId = setInterval(tick, 1000);
  }

  function setConfirmations(conf, req) {
    if (!confirmationsLabel || !confirmationsBar) return;
    const safeReq = req && Number.isFinite(req) ? req : 10;
    const safeConf = conf && Number.isFinite(conf) ? conf : 0;

    confirmationsLabel.textContent = `${safeConf} / ${safeReq}`;
    const pct = Math.max(0, Math.min(100, (safeConf / safeReq) * 100));
    confirmationsBar.style.width = `${pct}%`;
  }

  async function pollInvoiceStatus(invoiceId) {
    const token = getToken();
    if (!token) return;

    async function tick() {
      try {
        const res = await fetch(
          `${PAYMENT_API_BASE_URL}/payments/status/${encodeURIComponent(invoiceId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (res.status === 401) {
          showToast("Session expired. Please log in again.", "error");
          clearTimers();
          setTimeout(() => (window.location.href = "login.html"), 700);
          return;
        }

        if (!res.ok) return;

        const inv = await res.json();

        if (invoiceStatusLabel) invoiceStatusLabel.textContent = inv.status || "pending";

        if (typeof inv.confirmations === "number" || typeof inv.required_confirmations === "number") {
          setConfirmations(inv.confirmations || 0, inv.required_confirmations || 10);
        }

        if (inv.status === "confirmed") {
          showToast("Payment confirmed. Your subscription will update shortly.", "success");
          clearTimers();
          loadSubscriptionStatus();
        }
      } catch (e) {
        console.warn("poll failed:", e);
      }
    }

    await tick();
    pollTimerId = setInterval(tick, 15000);
  }

  // ----------------------------
  // Create invoice
  // ----------------------------
  async function handleGenerateInvoice() {
    // Must be logged in
    const token = requireLoginOrToast();
    if (!token) return;

    // Must have price
    const xmrPrice = prices?.XMR;
    if (!xmrPrice || !Number.isFinite(xmrPrice)) {
      showToast("Still loading XMR price… try again in a moment.", "error");
      return;
    }

    // compute amount
    const amountXmr = selectedPlanUsd / xmrPrice;

    // UI
    if (generateInvoiceBtn) generateInvoiceBtn.disabled = true;

    try {
      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan: selectedPlan,
          currency: "XMR",
          amount_crypto: amountXmr,
        }),
      });

      if (res.status === 401) {
        showToast("Invalid or expired token. Log in again.", "error");
        setTimeout(() => (window.location.href = "login.html"), 700);
        return;
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(data?.error || `Failed to create invoice (HTTP ${res.status})`, "error");
        return;
      }

      const invoice = data;
      currentInvoiceId = invoice.id;

      // Fill invoice section
      if (invoicePlanLabel) {
        invoicePlanLabel.textContent = selectedPlan === "yearly" ? "Yearly" : "Monthly";
      }

      const amtCrypto = Number(invoice.amount_crypto ?? amountXmr);
      const amtUsd = Number(invoice.amount_usd ?? selectedPlanUsd);

      if (invoiceAmountLabel) {
        invoiceAmountLabel.textContent = `${amtCrypto.toFixed(6)} XMR (≈ $${amtUsd.toFixed(2)})`;
      }
      if (invoiceCurrencyLabel) invoiceCurrencyLabel.textContent = "XMR";

      if (invoiceStatusLabel) invoiceStatusLabel.textContent = invoice.status || "pending";
      if (invoiceAddressText) invoiceAddressText.textContent = invoice.address || "—";

      // QR
      if (invoice.qr_string && invoiceQrImage) {
        const qrUrl =
          "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" +
          encodeURIComponent(invoice.qr_string);
        invoiceQrImage.src = qrUrl;
      }

      // confirmations
      setConfirmations(invoice.confirmations || 0, invoice.required_confirmations || 10);

      // show + start timers/poll
      showInvoiceSection();
      clearTimers();
      startCountdown(invoiceLifetimeSeconds);
      pollInvoiceStatus(invoice.id);

      showToast("Invoice created. Send the exact amount from your Monero wallet.", "success");
    } catch (e) {
      console.error("create invoice failed:", e);
      showToast("Failed to create invoice. Try again.", "error");
    } finally {
      if (generateInvoiceBtn) generateInvoiceBtn.disabled = false;
    }
  }

  if (generateInvoiceBtn) {
    generateInvoiceBtn.addEventListener("click", handleGenerateInvoice);
  }

  // Copy address
  if (copyAddressBtn) {
    copyAddressBtn.addEventListener("click", async () => {
      const text = (invoiceAddressText?.textContent || "").trim();
      if (!text || text === "—") return;

      try {
        await navigator.clipboard.writeText(text);
        showToast("Address copied.", "success");
      } catch (e) {
        showToast("Could not copy address.", "error");
      }
    });
  }

  // ----------------------------
  // Init defaults
  // ----------------------------
  // Ensure UI reflects whichever plan button is active in HTML
  const initiallyActivePlan = planButtons.find((b) => b.classList.contains("active")) || planButtons[0];
  if (initiallyActivePlan) setActivePlan(initiallyActivePlan);

  // Ensure active coin (XMR) selection matches HTML
  const initiallyActiveCoin =
    coinButtons.find((b) => b.classList.contains("active")) ||
    coinButtons.find((b) => (b.dataset.coin || "").toUpperCase() === "XMR");
  if (initiallyActiveCoin) setActiveCoin(initiallyActiveCoin);

  // Hide invoice initially
  if (invoiceSection) invoiceSection.style.display = "none";

  loadPrices();
  loadSubscriptionStatus();
});
