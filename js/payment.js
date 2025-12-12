// js/payment.js
// Subscription / Payments page logic (Monero-first)
//
// IMPORTANT:
// - Uses auth.js globals + token storage keys:
//   TOKEN_KEY = 'us_auth_token' (from auth.js)
// - Backend endpoints used:
//   POST   /api/payments/create
//   GET    /api/payments/status/:id
//   GET    /api/subscription/me
//
// This file is aligned to your current payment.html IDs/classes you posted.

const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== 'undefined'
    ? API_BASE_URL
    : 'https://uncensored-app-beta-production.up.railway.app/api';

const TOKEN_KEY = 'us_auth_token';

document.addEventListener('DOMContentLoaded', () => {
  // -----------------------------
  // DOM CACHE
  // -----------------------------

  // Back button
  const backBtn = document.getElementById('paymentBackButton');

  // Plan buttons
  const planButtons = Array.from(document.querySelectorAll('.plan-card'));

  // Coin buttons
  const coinButtons = Array.from(document.querySelectorAll('.coin-card'));

  // Price summary labels
  const priceUsdLabel = document.getElementById('priceUsdLabel');
  const priceCoinCode = document.getElementById('priceCoinCode');
  const priceCoinLabel = document.getElementById('priceCoinLabel');
  const priceSourceLabel = document.getElementById('priceSourceLabel');

  // Continue button (your HTML uses generateInvoiceBtn)
  const generateInvoiceBtn = document.getElementById('generateInvoiceBtn');

  // Subscription status container
  const subscriptionStatus = document.getElementById('subscriptionStatus');

  // Invoice section + fields (your HTML uses these IDs)
  const invoiceSection = document.getElementById('invoiceSection');

  const invoicePlanLabel = document.getElementById('invoicePlanLabel');
  const invoiceAmountLabel = document.getElementById('invoiceAmountLabel');
  const invoiceCurrencyLabel = document.getElementById('invoiceCurrencyLabel');
  const invoiceStatusLabel = document.getElementById('invoiceStatusLabel');
  const invoiceCountdownLabel = document.getElementById('invoiceCountdownLabel');

  const invoiceAddressText = document.getElementById('invoiceAddressText');
  const invoiceQrImage = document.getElementById('invoiceQrImage');

  const confirmationsLabel = document.getElementById('confirmationsLabel');
  const confirmationsBar = document.getElementById('confirmationsBar');

  const copyAddressBtn = document.getElementById('copyAddressBtn');

  // Toast container
  const statusContainer = document.getElementById('paymentStatusContainer');

  // -----------------------------
  // STATE
  // -----------------------------

  let selectedPlan = 'monthly'; // 'monthly' | 'yearly'
  let selectedPlanUsd = 8;
  let selectedCurrency = 'XMR';

  let prices = null; // { BTC, ETH, SOL, USDT, USDC, XMR } in USD
  let currentInvoiceId = null;

  let countdownTimerId = null;
  let statusPollId = null;

  // 30 minutes lifetime shown to user
  const invoiceLifetimeSeconds = 30 * 60;

  // -----------------------------
  // HELPERS
  // -----------------------------

  function getAuthTokenSafe() {
    // Prefer auth.js helper if present, else fallback to known localStorage key
    try {
      if (typeof window.getAuthToken === 'function') {
        return window.getAuthToken() || '';
      }
    } catch {}
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function showToast(message, type = 'default', ms = 3500) {
    if (!statusContainer) return;
    const div = document.createElement('div');
    div.className = 'payment-toast' + (type !== 'default' ? ' ' + type : '');
    div.textContent = message;
    statusContainer.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  function formatUsd(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '$—';
    return `$${num.toFixed(2)} USD`;
  }

  function planLabel(plan) {
    return plan === 'yearly' ? 'Yearly' : 'Monthly';
  }

  function ensureLoggedInOrToast() {
    const token = getAuthTokenSafe();
    if (!token) {
      showToast('You must be logged in to subscribe.', 'error');
      // optional redirect:
      // window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  function setInvoiceSectionVisible(visible) {
    if (!invoiceSection) return;
    // your HTML uses style="display:none;" initially
    invoiceSection.style.display = visible ? 'block' : 'none';
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

  function resetInvoiceUi() {
    currentInvoiceId = null;
    clearTimers();

    setInvoiceSectionVisible(false);

    if (invoicePlanLabel) invoicePlanLabel.textContent = '–';
    if (invoiceAmountLabel) invoiceAmountLabel.textContent = '–';
    if (invoiceCurrencyLabel) invoiceCurrencyLabel.textContent = 'XMR';
    if (invoiceStatusLabel) invoiceStatusLabel.textContent = 'Waiting for payment';
    if (invoiceCountdownLabel) invoiceCountdownLabel.textContent = '30:00';

    if (invoiceAddressText) invoiceAddressText.textContent = '–';

    if (invoiceQrImage) {
      invoiceQrImage.removeAttribute('src');
      invoiceQrImage.removeAttribute('aria-label');
    }

    if (confirmationsLabel) confirmationsLabel.textContent = '0 / 10';
    if (confirmationsBar) confirmationsBar.style.width = '0%';
  }

  // -----------------------------
  // PLAN SELECTION
  // -----------------------------

  function updatePlanStateFromDom() {
    const activeBtn = planButtons.find((btn) => btn.classList.contains('active'));
    if (!activeBtn) return;

    selectedPlan = activeBtn.dataset.plan === 'yearly' ? 'yearly' : 'monthly';
    selectedPlanUsd = selectedPlan === 'yearly' ? 60 : 8;

    if (priceUsdLabel) priceUsdLabel.textContent = formatUsd(selectedPlanUsd);

    recalcXmrAmount();
    resetInvoiceUi(); // changing plan invalidates current invoice UI
  }

  planButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      planButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updatePlanStateFromDom();
    });
  });

  // -----------------------------
  // COIN SELECTION
  // -----------------------------

  coinButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Your HTML uses data-coin="XMR" not data-currency
      const coin = (btn.dataset.coin || '').toUpperCase();
      const enabled = (btn.dataset.enabled || 'false') === 'true';

      if (!coin) return;

      if (!enabled || coin !== 'XMR') {
        showToast(`${coin || 'That coin'} is not supported yet. Use Monero (XMR) for now.`, 'error');
        return;
      }

      selectedCurrency = 'XMR';
      coinButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (priceCoinCode) priceCoinCode.textContent = 'XMR';

      recalcXmrAmount();
      resetInvoiceUi(); // switching coin invalidates current invoice UI
    });
  });

  // -----------------------------
  // LIVE PRICE FETCHING
  // -----------------------------

  async function loadPrices() {
    try {
      if (priceSourceLabel) priceSourceLabel.textContent = 'Loading…';

      // Coingecko simple price endpoint
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,tether,usd-coin,monero&vs_currencies=usd'
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const json = await res.json();
      prices = {
        BTC: json.bitcoin?.usd ?? null,
        ETH: json.ethereum?.usd ?? null,
        SOL: json.solana?.usd ?? null,
        USDT: json.tether?.usd ?? null,
        USDC: json['usd-coin']?.usd ?? null,
        XMR: json.monero?.usd ?? null
      };

      const setPrice = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!value) el.textContent = '—';
        else {
          el.textContent = `$${Number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}`;
        }
      };

      // Update the mini prices shown on each coin card
      setPrice('btcPriceUsd', prices.BTC);
      setPrice('ethPriceUsd', prices.ETH);
      setPrice('solPriceUsd', prices.SOL);
      setPrice('usdcPriceUsd', prices.USDC);
      setPrice('usdtPriceUsd', prices.USDT);
      setPrice('xmrPriceUsd', prices.XMR);

      if (priceSourceLabel) {
        priceSourceLabel.textContent = prices?.XMR ? 'Updated just now' : 'Price unavailable';
      }

      recalcXmrAmount();
    } catch (err) {
      console.error('Failed to load prices:', err);
      prices = null;
      if (priceSourceLabel) priceSourceLabel.textContent = 'Unavailable';
      showToast('Could not load live prices. Try again later.', 'error');
      recalcXmrAmount();
    }
  }

  function recalcXmrAmount() {
    // Show price conversion label even before invoice exists
    if (!prices || !prices.XMR) {
      if (priceCoinLabel) priceCoinLabel.textContent = '—';
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice) || xmrPrice <= 0) {
      if (priceCoinLabel) priceCoinLabel.textContent = '—';
      return;
    }

    const amt = selectedPlanUsd / xmrPrice;
    const amtRounded = Math.max(amt, 0).toFixed(6);

    if (priceCoinLabel) priceCoinLabel.textContent = `${amtRounded} XMR`;
  }

  // -----------------------------
  // SUBSCRIPTION STATUS
  // -----------------------------

  async function loadSubscriptionStatus() {
    if (!subscriptionStatus) return;

    const token = getAuthTokenSafe();
    if (!token) {
      subscriptionStatus.innerHTML =
        `<div class="subscription-status-card">` +
        `<div class="subscription-status-title">Not logged in</div>` +
        `<div class="subscription-status-text">Log in to view subscription status.</div>` +
        `</div>`;
      return;
    }

    try {
      const res = await fetch(`${PAYMENT_API_BASE_URL}/subscription/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        subscriptionStatus.innerHTML =
          `<div class="subscription-status-card">` +
          `<div class="subscription-status-title">Status unavailable</div>` +
          `<div class="subscription-status-text">${errJson?.error || 'Could not load subscription.'}</div>` +
          `</div>`;
        return;
      }

      const data = await res.json();
      if (data?.active && data.subscription) {
        const plan = data.subscription.plan || 'subscription';
        const exp = data.subscription.expires_at
          ? new Date(data.subscription.expires_at).toLocaleString()
          : '—';

        subscriptionStatus.innerHTML =
          `<div class="subscription-status-card active">` +
          `<div class="subscription-status-title">✅ You are Verified</div>` +
          `<div class="subscription-status-text">Plan: <strong>${plan}</strong></div>` +
          `<div class="subscription-status-text">Expires: <strong>${exp}</strong></div>` +
          `</div>`;
      } else {
        subscriptionStatus.innerHTML =
          `<div class="subscription-status-card">` +
          `<div class="subscription-status-title">No active subscription</div>` +
          `<div class="subscription-status-text">Choose a plan to become Verified.</div>` +
          `</div>`;
      }
    } catch (err) {
      console.error('Subscription status error:', err);
      subscriptionStatus.innerHTML =
        `<div class="subscription-status-card">` +
        `<div class="subscription-status-title">Status unavailable</div>` +
        `<div class="subscription-status-text">Network error.</div>` +
        `</div>`;
    }
  }

  // -----------------------------
  // INVOICE COUNTDOWN + STATUS POLL
  // -----------------------------

  function startCountdown(seconds) {
    if (!invoiceCountdownLabel) return;

    let remaining = seconds;

    const update = () => {
      const m = Math.floor(remaining / 60).toString().padStart(2, '0');
      const s = (remaining % 60).toString().padStart(2, '0');
      invoiceCountdownLabel.textContent = `${m}:${s}`;

      remaining -= 1;
      if (remaining < 0) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
        showToast('Invoice expired. Create a new one.', 'error');
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
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );

        if (!res.ok) {
          // if token expires, this will start failing
          if (res.status === 401) {
            showToast('Session expired. Please log in again.', 'error');
            clearInterval(statusPollId);
            statusPollId = null;
          }
          return;
        }

        const data = await res.json();

        if (invoiceStatusLabel) {
          const statusText =
            data.status === 'confirmed'
              ? 'Confirmed'
              : data.status === 'paid'
              ? 'Payment received (confirming…)'
              : data.status === 'pending'
              ? 'Waiting for payment'
              : (data.status || 'Waiting for payment');
          invoiceStatusLabel.textContent = statusText;
        }

        const conf = typeof data.confirmations === 'number' ? data.confirmations : 0;
        const req = typeof data.required_confirmations === 'number' ? data.required_confirmations : 10;

        if (confirmationsLabel) confirmationsLabel.textContent = `${conf} / ${req}`;
        if (confirmationsBar) {
          const pct = Math.max(0, Math.min(100, (conf / Math.max(1, req)) * 100));
          confirmationsBar.style.width = `${pct}%`;
        }

        if (data.status === 'confirmed') {
          showToast('Payment confirmed. Your subscription will update shortly.', 'success');
          clearInterval(statusPollId);
          statusPollId = null;

          // Refresh subscription status UI
          loadSubscriptionStatus();
        }
      } catch (err) {
        console.error('Status poll failed:', err);
      }
    }

    await tick();
    statusPollId = setInterval(tick, 20000);
  }

  // -----------------------------
  // CREATE INVOICE FLOW
  // -----------------------------

  async function handleGenerateInvoice() {
    if (!ensureLoggedInOrToast()) return;

    if (selectedCurrency !== 'XMR') {
      showToast('Right now only Monero (XMR) is accepted.', 'error');
      return;
    }

    if (!prices || !prices.XMR) {
      showToast('Waiting for XMR price. Try again in a few seconds.', 'error');
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice) || xmrPrice <= 0) {
      showToast('XMR price unavailable.', 'error');
      return;
    }

    const amountXmr = selectedPlanUsd / xmrPrice;

    if (generateInvoiceBtn) {
      generateInvoiceBtn.disabled = true;
      generateInvoiceBtn.textContent = 'Creating invoice…';
    }

    try {
      const token = getAuthTokenSafe();

      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: selectedPlan,
          currency: 'XMR',
          amount_crypto: Number(amountXmr.toFixed(12))
        })
      });

      const errJson = !res.ok ? await res.json().catch(() => ({})) : null;

      if (!res.ok) {
        const msg =
          errJson?.error ||
          (res.status === 401
            ? 'Session expired. Please log in again.'
            : `Failed to create invoice (HTTP ${res.status})`);
        showToast(msg, 'error');
        return;
      }

      const invoice = await res.json();
      currentInvoiceId = invoice.id;

      // Show section
      setInvoiceSectionVisible(true);

      // Fill invoice UI (your HTML uses these IDs)
      if (invoicePlanLabel) invoicePlanLabel.textContent = planLabel(invoice.plan || selectedPlan);
      if (invoiceAmountLabel) {
        const xmrAmt = Number(invoice.amount_crypto ?? amountXmr);
        const usdAmt = Number(invoice.amount_usd ?? selectedPlanUsd);
        invoiceAmountLabel.textContent = `${xmrAmt.toFixed(6)} XMR (≈ $${usdAmt.toFixed(2)})`;
      }
      if (invoiceCurrencyLabel) invoiceCurrencyLabel.textContent = (invoice.currency || 'XMR').toUpperCase();
      if (invoiceStatusLabel) {
        invoiceStatusLabel.textContent =
          invoice.status === 'pending' ? 'Waiting for payment' : (invoice.status || 'Waiting for payment');
      }

      if (invoiceAddressText) invoiceAddressText.textContent = invoice.address || '—';

      // Build QR
      // Use invoice.qr_string when server provides it. Otherwise build a safe monero URI.
      const qrPayload =
        invoice.qr_string ||
        (invoice.address
          ? `monero:${invoice.address}?tx_amount=${Number(invoice.amount_crypto ?? amountXmr).toFixed(6)}`
          : '');

      if (qrPayload && invoiceQrImage) {
        // Uses an external QR generator (simple)
        const qrUrl =
          'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
          encodeURIComponent(qrPayload);
        invoiceQrImage.src = qrUrl;
        invoiceQrImage.alt = 'Payment QR';
      }

      // Reset progress display
      if (confirmationsLabel) confirmationsLabel.textContent = `0 / ${invoice.required_confirmations || 10}`;
      if (confirmationsBar) confirmationsBar.style.width = '0%';

      // timers
      clearTimers();
      startCountdown(invoiceLifetimeSeconds);
      pollInvoiceStatus(invoice.id);

      showToast('Invoice created. Send the exact amount from your Monero wallet.', 'success');
      // Scroll to invoice section for mobile
      try {
        invoiceSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {}
    } catch (err) {
      console.error('Create invoice error:', err);
      showToast('Failed to create invoice. Try again.', 'error');
    } finally {
      if (generateInvoiceBtn) {
        generateInvoiceBtn.disabled = false;
        generateInvoiceBtn.textContent = 'Continue to payment';
      }
    }
  }

  if (generateInvoiceBtn) {
    generateInvoiceBtn.addEventListener('click', handleGenerateInvoice);
  }

  // -----------------------------
  // COPY ADDRESS
  // -----------------------------

  if (copyAddressBtn && invoiceAddressText) {
    copyAddressBtn.addEventListener('click', async () => {
      const text = invoiceAddressText.textContent?.trim();
      if (!text || text === '–' || text === '—') return;

      try {
        await navigator.clipboard.writeText(text);
        showToast('Address copied to clipboard.', 'success');
      } catch (err) {
        console.error('Copy failed:', err);
        showToast('Could not copy address.', 'error');
      }
    });
  }

  // -----------------------------
  // BACK BUTTON
  // -----------------------------

  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // go back if possible, else fallback
      if (window.history.length > 1) window.history.back();
      else window.location.href = 'settings.html';
    });
  }

  // -----------------------------
  // INIT
  // -----------------------------

  // Ensure initial plan state based on active button
  updatePlanStateFromDom();

  // Ensure initial coin label
  if (priceCoinCode) priceCoinCode.textContent = 'XMR';

  // Hide invoice until created
  resetInvoiceUi();

  // Load subscription status (if logged in)
  loadSubscriptionStatus();

  // Load prices
  loadPrices();

  // Optional: refresh prices every 60s
  setInterval(loadPrices, 60000);
});
