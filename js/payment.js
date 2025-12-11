// js/payment.js

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

  const continueBtn = document.getElementById('generateInvoiceBtn');

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

  let selectedPlan = 'monthly'; // 'monthly' or 'yearly'
  let selectedPlanUsd = 8;
  let selectedCurrency = 'XMR'; // only XMR actually supported
  let prices = null; // coin prices in USD
  let currentInvoiceId = null;
  let countdownTimerId = null;
  let statusPollId = null;
  const invoiceLifetimeSeconds = 30 * 60; // 30 minutes

  // --- UTIL: TOASTS ---

  function showToast(message, type = 'default', ms = 3500) {
    if (!statusContainer) return;
    const div = document.createElement('div');
    div.className = 'payment-toast' + (type !== 'default' ? ' ' + type : '');
    div.textContent = message;
    statusContainer.appendChild(div);

    setTimeout(() => {
      div.remove();
    }, ms);
  }

  // --- BACK BUTTON ---

  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'settings.html';
      }
    });
  }

  // --- PLAN HANDLING ---

  function updatePlanStateFromDom() {
    const activeBtn = planButtons.find((btn) =>
      btn.classList.contains('active')
    );
    if (!activeBtn) return;

    selectedPlan = activeBtn.dataset.plan === 'yearly' ? 'yearly' : 'monthly';
    selectedPlanUsd =
      selectedPlan === 'yearly' ? 60 : 8;

    if (priceUsdLabel) {
      priceUsdLabel.textContent = `$${selectedPlanUsd.toFixed(2)} USD`;
    }

    if (invoicePlanLabel) {
      invoicePlanLabel.textContent =
        selectedPlan === 'yearly' ? 'Yearly' : 'Monthly';
    }

    recalcXmrAmount();
  }

  planButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      planButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updatePlanStateFromDom();
    });
  });

  // --- COIN HANDLING ---

  coinButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const currency = btn.dataset.currency;
      const enabled = btn.dataset.enabled === 'true';

      if (!currency) return;

      if (!enabled || currency !== 'XMR') {
        showToast(
          `${currency} is not supported yet. Use Monero (XMR) for now.`,
          'error'
        );
        return;
      }

      selectedCurrency = 'XMR';
      coinButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (priceCoinCode) priceCoinCode.textContent = 'XMR';
      recalcXmrAmount();
    });
  });

  // --- PRICE FETCHING ---

  async function loadPrices() {
    try {
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
        if (!value) {
          el.textContent = '—';
        } else {
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
        priceSourceLabel.textContent = 'Updated just now';
      }

      recalcXmrAmount();
    } catch (err) {
      console.error('Failed to load prices:', err);
      if (priceSourceLabel) {
        priceSourceLabel.textContent = 'Could not load prices';
      }
      showToast('Could not load live prices. Try again later.', 'error');
    }
  }

  function recalcXmrAmount() {
    if (!prices || !prices.XMR) {
      if (priceCoinLabel) {
        priceCoinLabel.textContent = '—';
      }
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice)) {
      if (priceCoinLabel) {
        priceCoinLabel.textContent = '—';
      }
      return;
    }

    const amt = selectedPlanUsd / xmrPrice;
    const amtRounded = Math.max(amt, 0).toFixed(6);

    if (priceCoinLabel) {
      priceCoinLabel.textContent = `${amtRounded} XMR`;
    }
  }

  // --- INVOICE UI HELPERS ---

  function resetInvoiceUi() {
    currentInvoiceId = null;

    if (invoiceSection) {
      invoiceSection.style.display = 'none';
    }

    if (invoiceAmountLabel) invoiceAmountLabel.textContent = '–';
    if (invoiceStatusLabel) invoiceStatusLabel.textContent = 'Waiting for payment';
    if (invoiceAddressText) invoiceAddressText.textContent = '–';
    if (invoiceQrImage) invoiceQrImage.src = '';
    if (confirmationsLabel) confirmationsLabel.textContent = '0 / 10';
    if (confirmationsBar) confirmationsBar.style.width = '0%';
    if (invoiceCountdownLabel) invoiceCountdownLabel.textContent = '30:00';

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
      const m = Math.floor(remaining / 60)
        .toString()
        .padStart(2, '0');
      const s = (remaining % 60).toString().padStart(2, '0');
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
        const res = await fetch(
          `${PAYMENT_API_BASE_URL}/payments/status/${encodeURIComponent(
            invoiceId
          )}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!res.ok) {
          console.warn('Invoice status HTTP', res.status);
          return;
        }

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
          showToast(
            'Payment confirmed. Your subscription will update shortly.',
            'success'
          );
          clearInterval(statusPollId);
          statusPollId = null;
        }
      } catch (err) {
        console.error('Status poll failed:', err);
      }
    }

    await tick();
    statusPollId = setInterval(tick, 20000); // every 20s
  }

  // --- INVOICE FLOW ---

  async function handleContinueToPayment() {
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

    if (!continueBtn) return;
    continueBtn.disabled = true;

    try {
      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          plan: selectedPlan,
          currency: 'XMR',
          amount_crypto: amountXmr
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.error || `Failed to create invoice (HTTP ${res.status})`;
        showToast(msg, 'error');
        return;
      }

      const invoice = await res.json();
      currentInvoiceId = invoice.id;

      if (invoiceSection) {
        invoiceSection.style.display = 'block';
      }

      if (invoicePlanLabel) {
        invoicePlanLabel.textContent =
          selectedPlan === 'yearly' ? 'Yearly' : 'Monthly';
      }

      const amtXmr =
        typeof invoice.amount_crypto === 'number'
          ? invoice.amount_crypto
          : amountXmr;
      const amtUsd =
        typeof invoice.amount_usd === 'number'
          ? invoice.amount_usd
          : selectedPlanUsd;

      if (invoiceAmountLabel) {
        invoiceAmountLabel.textContent = `${amtXmr.toFixed(
          6
        )} XMR (≈ $${amtUsd.toFixed(2)})`;
      }

      if (invoiceCurrencyLabel) {
        invoiceCurrencyLabel.textContent = 'XMR';
      }

      if (invoiceAddressText) {
        invoiceAddressText.textContent = invoice.address || '—';
      }

      if (invoiceStatusLabel) {
        invoiceStatusLabel.textContent = invoice.status || 'pending';
      }

      if (invoice.qr_string && invoiceQrImage) {
        const qrUrl =
          'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
          encodeURIComponent(invoice.qr_string);
        invoiceQrImage.src = qrUrl;
      }

      // Reset / start timers
      if (countdownTimerId) clearInterval(countdownTimerId);
      if (statusPollId) clearInterval(statusPollId);

      startCountdown(invoiceLifetimeSeconds);
      pollInvoiceStatus(invoice.id);

      showToast(
        'Invoice created. Send the payment from your Monero wallet.',
        'success'
      );
    } catch (err) {
      console.error('Create invoice error:', err);
      showToast('Failed to create invoice. Try again.', 'error');
    } finally {
      continueBtn.disabled = false;
    }
  }

  if (continueBtn) {
    continueBtn.addEventListener('click', handleContinueToPayment);
  }

  // Copy address
  if (copyAddressBtn && invoiceAddressText) {
    copyAddressBtn.addEventListener('click', async () => {
      const text = invoiceAddressText.textContent?.trim();
      if (!text || text === '—') return;

      try {
        await navigator.clipboard.writeText(text);
        showToast('Address copied to clipboard.', 'success');
      } catch (err) {
        console.error('Copy failed:', err);
        showToast('Could not copy address.', 'error');
      }
    });
  }

  // --- SUBSCRIPTION STATUS (optional) ---

  async function loadSubscriptionStatus() {
    if (!subscriptionStatus) return;

    try {
      const res = await fetch(
        `${PAYMENT_API_BASE_URL}/subscription/me`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`
          }
        }
      );

      if (!res.ok) {
        subscriptionStatus.textContent = '';
        return;
      }

      const data = await res.json();
      if (!data || !data.active || !data.subscription) {
        subscriptionStatus.textContent = 'No active subscription.';
        return;
      }

      const sub = data.subscription;
      const expires = sub.expires_at
        ? new Date(sub.expires_at).toLocaleString()
        : 'Unknown';

      subscriptionStatus.textContent =
        `Active plan: ${sub.plan || 'Verified'} • Expires: ${expires}`;
    } catch (err) {
      console.error('Subscription status error:', err);
      subscriptionStatus.textContent = '';
    }
  }

  // --- INIT ---

  updatePlanStateFromDom();
  resetInvoiceUi();
  loadPrices();
  loadSubscriptionStatus();
});
