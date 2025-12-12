// js/payment.js

// Use the same API base URL pattern as the rest of your site
const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== 'undefined'
    ? API_BASE_URL
    : 'https://uncensored-app-beta-production.up.railway.app/api';

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM CACHE ---
  const planButtons = Array.from(document.querySelectorAll('.plan-card'));
  const coinButtons = Array.from(document.querySelectorAll('.coin-card'));

  const priceUsdLabel = document.getElementById('priceUsdLabel');
  const priceCoinCode = document.getElementById('priceCoinCode');
  const priceCoinLabel = document.getElementById('priceCoinLabel');
  const priceSourceLabel = document.getElementById('priceSourceLabel');

  const generateInvoiceBtn = document.getElementById('generateInvoiceBtn');

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

  const subscriptionStatus = document.getElementById('subscriptionStatus');
  const statusContainer = document.getElementById('paymentStatusContainer');

  const backBtn = document.getElementById('paymentBackButton');

  // --- STATE ---
  let selectedPlan = 'monthly';
  let selectedPlanUsd = 8;

  let selectedCurrency = 'XMR'; // only supported coin right now
  let prices = null; // { XMR: 123.45, ... }
  let currentInvoiceId = null;

  let countdownTimerId = null;
  let statusPollId = null;

  const invoiceLifetimeSeconds = 30 * 60; // 30 minutes

  // --- UTIL: SAFE AUTH TOKEN ---
  function getToken() {
    // Prefer auth.js helpers
    if (typeof window.getAuthToken === 'function') {
      return window.getAuthToken() || '';
    }
    // Fallback (compat)
    return localStorage.getItem('us_auth_token') || localStorage.getItem('token') || '';
  }

  // --- UTIL: REDIRECT TO LOGIN (and come back) ---
  function goLogin(reasonText) {
    try {
      if (typeof window.saveReturnUrl === 'function') {
        window.saveReturnUrl(window.location.href);
      } else {
        sessionStorage.setItem('returnTo', window.location.href);
      }
      if (reasonText) sessionStorage.setItem('authReason', reasonText);
    } catch (e) {}
    window.location.href = 'login.html';
  }

  // --- UTIL: TOASTS ---
  function showToast(message, type = 'default', ms = 3500) {
    if (!statusContainer) return;
    const div = document.createElement('div');
    div.className = 'payment-toast' + (type !== 'default' ? ' ' + type : '');
    div.textContent = message;
    statusContainer.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  // --- BACK BUTTON ---
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      // If they came from somewhere, go back, else go home
      if (window.history.length > 1) window.history.back();
      else window.location.href = 'index.html';
    });
  }

  // --- PLAN HANDLING ---
  function updatePlanUI() {
    if (priceUsdLabel) {
      priceUsdLabel.textContent = `$${Number(selectedPlanUsd).toFixed(2)} USD`;
    }
    recalcXmrAmount();
  }

  planButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      planButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const plan = (btn.dataset.plan || '').toLowerCase();
      selectedPlan = plan === 'yearly' ? 'yearly' : 'monthly';

      const usd = Number(btn.dataset.priceUsd || (selectedPlan === 'yearly' ? 60 : 8));
      selectedPlanUsd = Number.isFinite(usd) && usd > 0 ? usd : (selectedPlan === 'yearly' ? 60 : 8);

      updatePlanUI();
    });
  });

  // --- COIN HANDLING (matches your HTML: data-coin + data-enabled) ---
  coinButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const coin = (btn.dataset.coin || '').toUpperCase();
      const enabled = (btn.dataset.enabled || '').toLowerCase() === 'true';

      if (!enabled) {
        showToast(`${coin || 'This coin'} is not supported yet. Use Monero (XMR) for now.`, 'error');
        return;
      }

      // Only XMR supported currently
      if (coin !== 'XMR') {
        showToast(`${coin} is not supported yet. Use Monero (XMR) for now.`, 'error');
        return;
      }

      selectedCurrency = 'XMR';
      coinButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (priceCoinCode) priceCoinCode.textContent = 'XMR';
      recalcXmrAmount();
    });
  });

  // --- PRICE FETCHING (CoinGecko) ---
  async function loadPrices() {
    if (priceSourceLabel) priceSourceLabel.textContent = 'Loading…';

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 9000);

      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,tether,usd-coin,monero&vs_currencies=usd',
        { signal: controller.signal }
      );

      clearTimeout(t);

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

      setPrice('btcPriceUsd', prices.BTC);
      setPrice('ethPriceUsd', prices.ETH);
      setPrice('solPriceUsd', prices.SOL);
      setPrice('usdcPriceUsd', prices.USDC);
      setPrice('usdtPriceUsd', prices.USDT);
      setPrice('xmrPriceUsd', prices.XMR);

      if (priceSourceLabel) {
        const now = new Date();
        const hh = now.getHours().toString().padStart(2, '0');
        const mm = now.getMinutes().toString().padStart(2, '0');
        priceSourceLabel.textContent = `Updated ${hh}:${mm}`;
      }

      recalcXmrAmount();
    } catch (err) {
      console.error('Failed to load prices:', err);
      if (priceSourceLabel) priceSourceLabel.textContent = 'Failed to load';
      showToast('Could not load live prices. Try again later.', 'error');
      // Keep UI usable even if price fails
      recalcXmrAmount();
    }
  }

  function recalcXmrAmount() {
    if (priceCoinCode) priceCoinCode.textContent = selectedCurrency;

    if (!prices || !prices.XMR) {
      if (priceCoinLabel) priceCoinLabel.textContent = '—';
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice)) {
      if (priceCoinLabel) priceCoinLabel.textContent = '—';
      return;
    }

    const amt = selectedPlanUsd / xmrPrice;
    const amtRounded = Math.max(amt, 0).toFixed(6);

    if (priceCoinLabel) priceCoinLabel.textContent = `${amtRounded} XMR`;
  }

  // --- SUBSCRIPTION STATUS ---
  async function loadSubscriptionStatus() {
    if (!subscriptionStatus) return;

    const token = getToken().trim();
    if (!token) {
      subscriptionStatus.innerHTML = '';
      return;
    }

    try {
      const res = await fetch(`${PAYMENT_API_BASE_URL}/subscription/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        // Token invalid/expired
        subscriptionStatus.innerHTML = '';
        return;
      }

      const data = await res.json().catch(() => null);
      if (!data) return;

      if (data.active) {
        const exp = data.subscription?.expires_at ? new Date(data.subscription.expires_at) : null;
        subscriptionStatus.innerHTML = `
          <div class="payment-section-bordered">
            <div style="font-weight:600; margin-bottom:6px;">✅ You are Verified</div>
            <div style="color:var(--text-muted); font-size:0.9rem;">
              ${exp ? `Expires: ${exp.toLocaleDateString()}` : ''}
            </div>
          </div>
        `;
      } else {
        subscriptionStatus.innerHTML = `
          <div class="payment-section-bordered">
            <div style="font-weight:600; margin-bottom:6px;">Not subscribed</div>
            <div style="color:var(--text-muted); font-size:0.9rem;">
              Subscribe to get Verified and unlock creator tools.
            </div>
          </div>
        `;
      }
    } catch (e) {
      console.error('loadSubscriptionStatus error:', e);
    }
  }

  // --- INVOICE UI HELPERS ---
  function resetInvoiceUi() {
    currentInvoiceId = null;

    if (invoiceSection) invoiceSection.style.display = 'none';

    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
    if (statusPollId) {
      clearInterval(statusPollId);
      statusPollId = null;
    }

    if (invoicePlanLabel) invoicePlanLabel.textContent = '–';
    if (invoiceAmountLabel) invoiceAmountLabel.textContent = '–';
    if (invoiceCurrencyLabel) invoiceCurrencyLabel.textContent = 'XMR';
    if (invoiceStatusLabel) invoiceStatusLabel.textContent = 'Waiting for payment';
    if (invoiceCountdownLabel) invoiceCountdownLabel.textContent = '30:00';
    if (invoiceAddressText) invoiceAddressText.textContent = '–';

    if (invoiceQrImage) {
      invoiceQrImage.removeAttribute('src');
    }

    if (confirmationsLabel) confirmationsLabel.textContent = '0 / 10';
    if (confirmationsBar) confirmationsBar.style.width = '0%';
  }

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

    const token = getToken().trim();
    if (!token) return;

    async function tick() {
      try {
        const res = await fetch(
          `${PAYMENT_API_BASE_URL}/payments/status/${encodeURIComponent(invoiceId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (res.status === 401) {
          // token expired mid-poll
          if (typeof window.clearAuthToken === 'function') window.clearAuthToken();
          showToast('Session expired. Please log in again.', 'error');
          goLogin('Session expired. Please log in again to subscribe.');
          return;
        }

        if (!res.ok) return;

        const data = await res.json();

        if (invoiceStatusLabel) {
          invoiceStatusLabel.textContent = data.status || 'pending';
        }

        if (
          typeof data.confirmations === 'number' &&
          typeof data.required_confirmations === 'number' &&
          confirmationsLabel &&
          confirmationsBar
        ) {
          const conf = data.confirmations;
          const req = data.required_confirmations || 10;

          confirmationsLabel.textContent = `${conf} / ${req}`;
          const pct = Math.max(0, Math.min(100, (conf / req) * 100));
          confirmationsBar.style.width = `${pct}%`;
        }

        if (data.status === 'confirmed') {
          showToast('Payment confirmed. Your subscription will update shortly.', 'success');
          if (statusPollId) {
            clearInterval(statusPollId);
            statusPollId = null;
          }
          loadSubscriptionStatus();
        }
      } catch (err) {
        console.error('Status poll failed:', err);
      }
    }

    await tick();
    statusPollId = setInterval(tick, 20000);
  }

  // --- CREATE INVOICE FLOW ---
  async function handleGenerateInvoice() {
    // MUST be logged in
    const token = getToken().trim();
    if (!token) {
      showToast('Please log in to subscribe.', 'error');
      goLogin('Please log in to subscribe.');
      return;
    }

    if (selectedCurrency !== 'XMR') {
      showToast('Right now only Monero (XMR) is accepted.', 'error');
      return;
    }

    if (!prices || !prices.XMR) {
      showToast('Waiting for XMR price. Try again in a few seconds.', 'error');
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice)) {
      showToast('XMR price unavailable.', 'error');
      return;
    }

    const amountXmr = selectedPlanUsd / xmrPrice;

    if (generateInvoiceBtn) {
      generateInvoiceBtn.disabled = true;
      generateInvoiceBtn.textContent = 'Creating invoice…';
    }

    try {
      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: selectedPlan,
          currency: 'XMR',
          amount_crypto: amountXmr
        })
      });

      if (res.status === 401) {
        // Invalid/expired token
        if (typeof window.clearAuthToken === 'function') window.clearAuthToken();
        showToast('Session expired. Please log in again.', 'error');
        goLogin('Session expired. Please log in again to subscribe.');
        return;
      }

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error || `Failed to create invoice (HTTP ${res.status})`;
        showToast(msg, 'error');
        return;
      }

      const invoice = data;
      currentInvoiceId = invoice.id;

      // Show invoice section
      if (invoiceSection) invoiceSection.style.display = 'block';

      if (invoicePlanLabel) {
        invoicePlanLabel.textContent = selectedPlan === 'yearly' ? 'Yearly' : 'Monthly';
      }

      if (invoiceAmountLabel) {
        const amt = Number(invoice.amount_crypto ?? amountXmr);
        invoiceAmountLabel.textContent = `${amt.toFixed(6)} XMR`;
      }

      if (invoiceCurrencyLabel) invoiceCurrencyLabel.textContent = 'XMR';
      if (invoiceStatusLabel) invoiceStatusLabel.textContent = invoice.status || 'pending';

      if (invoiceAddressText) {
        invoiceAddressText.textContent = invoice.address || '—';
      }

      if (invoice.qr_string && invoiceQrImage) {
        const qrUrl =
          'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
          encodeURIComponent(invoice.qr_string);
        invoiceQrImage.src = qrUrl;
      }

      // Reset timers/polling
      if (countdownTimerId) clearInterval(countdownTimerId);
      if (statusPollId) clearInterval(statusPollId);

      startCountdown(invoiceLifetimeSeconds);
      pollInvoiceStatus(invoice.id);

      showToast('Invoice created. Send the exact amount from your Monero wallet.', 'success');
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

  // --- COPY ADDRESS ---
  if (copyAddressBtn && invoiceAddressText) {
    copyAddressBtn.addEventListener('click', async () => {
      const text = (invoiceAddressText.textContent || '').trim();
      if (!text || text === '—' || text === '-') return;

      try {
        await navigator.clipboard.writeText(text);
        showToast('Address copied to clipboard.', 'success');
      } catch (err) {
        console.error('Copy failed:', err);
        showToast('Could not copy address.', 'error');
      }
    });
  }

  // --- INIT ---
  resetInvoiceUi();

  // Set initial plan from HTML active state (so your defaults always match)
  const activePlanBtn = planButtons.find((b) => b.classList.contains('active'));
  if (activePlanBtn) {
    selectedPlan = (activePlanBtn.dataset.plan || 'monthly').toLowerCase() === 'yearly' ? 'yearly' : 'monthly';
    const usd = Number(activePlanBtn.dataset.priceUsd || (selectedPlan === 'yearly' ? 60 : 8));
    selectedPlanUsd = Number.isFinite(usd) && usd > 0 ? usd : (selectedPlan === 'yearly' ? 60 : 8);
  } else {
    selectedPlan = 'monthly';
    selectedPlanUsd = 8;
  }
  updatePlanUI();

  // Coin should start on XMR (your HTML marks it active)
  const activeCoinBtn = coinButtons.find((b) => b.classList.contains('active'));
  if (activeCoinBtn) {
    const coin = (activeCoinBtn.dataset.coin || 'XMR').toUpperCase();
    selectedCurrency = coin === 'XMR' ? 'XMR' : 'XMR';
  } else {
    selectedCurrency = 'XMR';
  }
  if (priceCoinCode) priceCoinCode.textContent = 'XMR';

  loadPrices();
  loadSubscriptionStatus();
});
