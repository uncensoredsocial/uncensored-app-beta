// js/payment.js

const PAYMENT_API_BASE_URL =
  typeof API_BASE_URL !== 'undefined'
    ? API_BASE_URL
    : 'https://uncensored-app-beta-production.up.railway.app/api';

const COIN_CONFIG = {
  BTC: { id: 'bitcoin', priceEl: 'btcPriceUsd' },
  ETH: { id: 'ethereum', priceEl: 'ethPriceUsd' },
  SOL: { id: 'solana', priceEl: 'solPriceUsd' },
  USDC: { id: 'usd-coin', priceEl: 'usdcPriceUsd' },
  USDT: { id: 'tether', priceEl: 'usdtPriceUsd' },
  XMR: { id: 'monero', priceEl: 'xmrPriceUsd' }
};

// State
let currentPlan = 'monthly'; // 'monthly' | 'yearly'
let xmrPriceUsd = null;
let currentCurrency = 'XMR';

let currentInvoice = null;
let invoiceStatusInterval = null;
let invoiceCountdownInterval = null;

// ===== Small helpers =====

function showToast(message, type = 'info') {
  if (!message) return;
  const existing = document.querySelector('.status-toast');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'status-toast';
  if (type === 'error') {
    div.style.borderColor = '#7a1f24';
    div.style.background = '#3b0f14';
  } else if (type === 'success') {
    div.style.borderColor = '#1f7a3a';
    div.style.background = '#0f3b23';
  }
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2600);
}

function formatUsd(amount) {
  return '$' + amount.toFixed(2);
}

function formatXmr(amount) {
  return amount.toFixed(6);
}

// ===== Price fetching =====

async function fetchCryptoPrices() {
  try {
    const ids = Object.values(COIN_CONFIG)
      .map((c) => c.id)
      .join(',');

    // Pricing API
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=' +
      encodeURIComponent(ids) +
      '&vs_currencies=usd';

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load prices');
    const data = await res.json();

    Object.entries(COIN_CONFIG).forEach(([symbol, cfg]) => {
      const elId = cfg.priceEl;
      const el = elId ? document.getElementById(elId) : null;
      const coinData = data[cfg.id];
      if (!el || !coinData || typeof coinData.usd !== 'number') return;

      const price = coinData.usd;
      el.textContent = formatUsd(price);
      if (symbol === 'XMR') {
        xmrPriceUsd = price;
      }
    });

    updatePlanSummary();
  } catch (err) {
    console.error('Price fetch error:', err);
  }
}

// ===== Plan / summary logic =====

function getPlanUsd() {
  return currentPlan === 'yearly' ? 60 : 8;
}

function calculateXmrAmount() {
  const usd = getPlanUsd();
  if (!xmrPriceUsd || xmrPriceUsd <= 0) return null;
  return usd / xmrPriceUsd;
}

function updatePlanSummary() {
  const summaryPlanLabel = document.getElementById('summaryPlanLabel');
  const summaryXmrAmount = document.getElementById('summaryXmrAmount');

  const usd = getPlanUsd();
  if (summaryPlanLabel) {
    summaryPlanLabel.textContent =
      currentPlan === 'yearly'
        ? `Yearly • ${formatUsd(usd)}`
        : `Monthly • ${formatUsd(usd)}`;
  }

  const xmrAmt = calculateXmrAmount();
  if (summaryXmrAmount) {
    if (!xmrAmt) {
      summaryXmrAmount.textContent = '— XMR (waiting for price…)';
    } else {
      summaryXmrAmount.textContent = `${formatXmr(
        xmrAmt
      )} XMR (estimated)`;
    }
  }
}

function attachPlanHandlers() {
  const toggleEl = document.getElementById('plansToggle');
  if (!toggleEl) return;

  toggleEl.querySelectorAll('.plan-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleEl.querySelectorAll('.plan-card').forEach((b) =>
        b.classList.remove('active')
      );
      btn.classList.add('active');
      currentPlan = btn.dataset.plan === 'yearly' ? 'yearly' : 'monthly';
      updatePlanSummary();
      updateInvoiceAmountsDisplay();
    });
  });
}

// ===== Coin selection =====

function attachCoinHandlers() {
  const grid = document.getElementById('coinGrid');
  if (!grid) return;

  grid.querySelectorAll('.coin-card').forEach((card) => {
    card.addEventListener('click', () => {
      const currency = card.dataset.currency;

      // Highlight new card
      grid.querySelectorAll('.coin-card').forEach((c) =>
        c.classList.remove('active')
      );
      card.classList.add('active');

      currentCurrency = currency;

      if (currency !== 'XMR') {
        showToast('This currency is not supported yet. Use Monero for now.', 'info');
      } else {
        updatePlanSummary();
      }
    });
  });
}

// ===== Subscription status =====

async function loadSubscriptionStatus() {
  const statusEl = document.getElementById('subscriptionStatus');
  if (!statusEl) return;

  const token =
    typeof getAuthToken === 'function' ? getAuthToken() : null;
  if (!token) {
    statusEl.textContent =
      'You must be logged in to manage subscriptions.';
    return;
  }

  try {
    const res = await fetch(
      `${PAYMENT_API_BASE_URL}/subscription/me`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!res.ok) {
      statusEl.textContent = '';
      return;
    }

    const data = await res.json();
    if (!data || !data.active || !data.subscription) {
      statusEl.textContent = 'No active subscription yet.';
      return;
    }

    const exp = data.subscription.expires_at
      ? new Date(data.subscription.expires_at)
      : null;

    if (exp && !isNaN(exp.getTime())) {
      statusEl.innerHTML = `✅ Active subscription. Expires on <strong>${exp.toLocaleDateString()}</strong>.`;
    } else {
      statusEl.textContent = '✅ Active subscription.';
    }
  } catch (err) {
    console.error('loadSubscriptionStatus error:', err);
  }
}

// ===== Invoice / payment =====

function updateInvoiceAmountsDisplay() {
  if (!currentInvoice) return;
  const amtXmrEl = document.getElementById('invoiceAmountXmr');
  const amtUsdEl = document.getElementById('invoiceAmountUsd');

  if (!amtXmrEl || !amtUsdEl) return;

  const usd = getPlanUsd();
  amtXmrEl.textContent = `${formatXmr(currentInvoice.amount_crypto)} XMR`;
  amtUsdEl.textContent = `≈ ${formatUsd(usd)}`;
}

function startInvoiceCountdown(expireAtMs) {
  const countdownEl = document.getElementById('invoiceCountdown');
  if (!countdownEl) return;

  if (invoiceCountdownInterval) {
    clearInterval(invoiceCountdownInterval);
  }

  function tick() {
    const now = Date.now();
    const remaining = expireAtMs - now;

    if (remaining <= 0) {
      countdownEl.textContent = '00:00';
      clearInterval(invoiceCountdownInterval);
      invoiceCountdownInterval = null;
      const statusEl = document.getElementById('invoiceStatus');
      if (statusEl && currentInvoice && currentInvoice.status !== 'confirmed') {
        statusEl.textContent =
          'Invoice expired. Create a new one to try again.';
      }
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(
      2,
      '0'
    );
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    countdownEl.textContent = `${minutes}:${seconds}`;
  }

  tick();
  invoiceCountdownInterval = setInterval(tick, 1000);
}

function startInvoiceStatusPolling(invoiceId) {
  const statusEl = document.getElementById('invoiceStatus');
  if (!statusEl) return;

  if (invoiceStatusInterval) {
    clearInterval(invoiceStatusInterval);
  }

  const token =
    typeof getAuthToken === 'function' ? getAuthToken() : null;
  if (!token) {
    statusEl.textContent = 'You must be logged in.';
    return;
  }

  async function checkStatus() {
    try {
      const res = await fetch(
        `${PAYMENT_API_BASE_URL}/payments/status/${invoiceId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!res.ok) return;
      const invoice = await res.json();

      currentInvoice = invoice;

      if (statusEl) {
        if (invoice.status === 'confirmed') {
          statusEl.textContent = 'Payment confirmed ✅';
        } else if (invoice.confirmations) {
          statusEl.textContent = `Waiting for confirmations… (${invoice.confirmations}/${invoice.required_confirmations ||
            10})`;
        } else {
          statusEl.textContent = 'Waiting for payment…';
        }
      }

      if (invoice.status === 'confirmed') {
        clearInterval(invoiceStatusInterval);
        invoiceStatusInterval = null;
        showToast('Subscription activated!', 'success');
        loadSubscriptionStatus();
      }
    } catch (err) {
      console.error('invoice status polling error:', err);
    }
  }

  // Check immediately and then on interval
  checkStatus();
  invoiceStatusInterval = setInterval(checkStatus, 15000);
}

function renderInvoice(invoice, xmrAmountUsed) {
  const section = document.getElementById('invoiceSection');
  if (!section) return;

  section.hidden = false;
  currentInvoice = invoice;

  const addrEl = document.getElementById('invoiceAddress');
  const statusEl = document.getElementById('invoiceStatus');
  const qrEl = document.getElementById('invoiceQr');

  if (addrEl) addrEl.textContent = invoice.address || '—';
  if (statusEl) statusEl.textContent = 'Waiting for payment…';

  // Use the amount we sent to backend (xmrAmountUsed) as the target
  currentInvoice.amount_crypto = xmrAmountUsed;

  updateInvoiceAmountsDisplay();

  // Simple QR: using public QR service
  if (qrEl) {
    const qrData = invoice.qr_string || '';
    const qrUrl =
      'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
      encodeURIComponent(qrData);
    qrEl.src = qrUrl;
  }

  // 30-minute expiry from now (client side)
  const expireAtMs = Date.now() + 30 * 60 * 1000;
  startInvoiceCountdown(expireAtMs);
  startInvoiceStatusPolling(invoice.id);
}

async function handleContinueToPayment() {
  if (currentCurrency !== 'XMR') {
    showToast('Only Monero payments are supported right now.', 'error');
    return;
  }

  const token =
    typeof getAuthToken === 'function' ? getAuthToken() : null;
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  const btn = document.getElementById('continueToPaymentBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating invoice…';
  }

  try {
    const xmrAmount = calculateXmrAmount();
    if (!xmrAmount || !isFinite(xmrAmount)) {
      throw new Error('Unable to calculate XMR amount');
    }

    const res = await fetch(
      `${PAYMENT_API_BASE_URL}/payments/create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: currentPlan,
          currency: 'XMR',
          amount_crypto: xmrAmount
        })
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create invoice');
    }

    showToast('Invoice created. Waiting for payment…', 'success');
    renderInvoice(data, xmrAmount);
  } catch (err) {
    console.error('handleContinueToPayment error:', err);
    showToast(err.message || 'Failed to start payment', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Continue to payment';
    }
  }
}

function attachContinueHandler() {
  const btn = document.getElementById('continueToPaymentBtn');
  if (!btn) return;
  btn.addEventListener('click', handleContinueToPayment);
}

function attachCopyAddressHandler() {
  const btn = document.getElementById('copyAddressBtn');
  const addrEl = document.getElementById('invoiceAddress');
  if (!btn || !addrEl) return;

  btn.addEventListener('click', async () => {
    const text = addrEl.textContent || '';
    if (!text.trim()) return;

    try {
      await navigator.clipboard.writeText(text.trim());
      showToast('Address copied to clipboard', 'success');
    } catch {
      showToast('Unable to copy address', 'error');
    }
  });
}

// ===== Init =====

document.addEventListener('DOMContentLoaded', () => {
  // Require auth for this page
  const token =
    typeof getAuthToken === 'function' ? getAuthToken() : null;
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  attachPlanHandlers();
  attachCoinHandlers();
  attachContinueHandler();
  attachCopyAddressHandler();

  updatePlanSummary();
  fetchCryptoPrices();
  loadSubscriptionStatus();
});
