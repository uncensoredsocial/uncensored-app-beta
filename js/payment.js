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

  const summaryPlanLabel = document.getElementById('summaryPlanLabel');
  const summaryXmrAmount = document.getElementById('summaryXmrAmount');

  const continueBtn = document.getElementById('continueToPaymentBtn');

  const invoiceSection = document.getElementById('invoiceSection');
  const invoiceAmountXmr = document.getElementById('invoiceAmountXmr');
  const invoiceAmountUsd = document.getElementById('invoiceAmountUsd');
  const invoiceAddress = document.getElementById('invoiceAddress');
  const invoiceQr = document.getElementById('invoiceQr');
  const invoiceStatus = document.getElementById('invoiceStatus');
  const invoiceCountdown = document.getElementById('invoiceCountdown');
  const confirmationsLabel = document.getElementById('confirmationsLabel');
  const confirmationsBar = document.getElementById('confirmationsBar');
  const copyAddressBtn = document.getElementById('copyAddressBtn');

  const statusContainer = document.getElementById('paymentStatusContainer');

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

  // --- PLAN HANDLING ---

  function updatePlanStateFromDom() {
    const activeBtn = planButtons.find((btn) =>
      btn.classList.contains('active')
    );
    if (!activeBtn) return;

    selectedPlan = activeBtn.dataset.plan === 'yearly' ? 'yearly' : 'monthly';
    selectedPlanUsd = selectedPlan === 'yearly' ? 60 : 8;

    if (priceUsdLabel) {
      priceUsdLabel.textContent = `$${selectedPlanUsd.toFixed(2)} USD`;
    }

    if (summaryPlanLabel) {
      summaryPlanLabel.textContent =
        (selectedPlan === 'yearly' ? 'Yearly' : 'Monthly') +
        ` • $${selectedPlanUsd.toFixed(2)}`;
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
      if (!currency) return;

      if (currency !== 'XMR') {
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
      // Keep provider name out of UI; this is just a simple price source.
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

      // Update price labels if they exist
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

      recalcXmrAmount();
    } catch (err) {
      console.error('Failed to load prices:', err);
      showToast('Could not load live prices. Try again later.', 'error');
    }
  }

  function recalcXmrAmount() {
    if (!summaryXmrAmount) return;

    if (!prices || !prices.XMR) {
      summaryXmrAmount.textContent = '— XMR (waiting for price…)';
      if (priceCoinLabel) priceCoinLabel.textContent = '—';
      return;
    }

    const xmrPrice = Number(prices.XMR);
    if (!xmrPrice || !Number.isFinite(xmrPrice)) {
      summaryXmrAmount.textContent = '— XMR (price unavailable)';
      if (priceCoinLabel) priceCoinLabel.textContent = '—';
      return;
    }

    const amt = selectedPlanUsd / xmrPrice;
    const amtRounded = Math.max(amt, 0).toFixed(6);

    summaryXmrAmount.textContent = `${amtRounded} XMR`;
    if (priceCoinLabel) {
      priceCoinLabel.textContent = `${amtRounded} XMR`;
    }
  }

  // --- INVOICE FLOW ---

  function resetInvoiceUi() {
    if (!invoiceSection) return;
    invoiceSection.hidden = true;
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

  function startCountdown(seconds) {
    if (!invoiceCountdown) return;
    let remaining = seconds;

    const update = () => {
      const m = Math.floor(remaining / 60)
        .toString()
        .padStart(2, '0');
      const s = (remaining % 60).toString().padStart(2, '0');
      invoiceCountdown.textContent = `${m}:${s}`;
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

        if (invoiceStatus) {
          invoiceStatus.textContent = data.status || 'pending';
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

    continueBtn.disabled = true;

    try {
      // ✅ ADDED: plan_slug so backend that expects plan_slug won’t reject the request
      const planSlug =
        selectedPlan === 'yearly' ? 'verified_yearly' : 'verified_monthly';

      const res = await fetch(`${PAYMENT_API_BASE_URL}/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          plan: selectedPlan,
          plan_slug: planSlug, // ✅ ADDED
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

      // Fill invoice UI
      if (invoiceSection) {
        invoiceSection.hidden = false;
      }

      if (invoiceAmountXmr) {
        invoiceAmountXmr.textContent =
          (invoice.amount_crypto ?? amountXmr).toFixed(6) + ' XMR';
      }
      if (invoiceAmountUsd) {
        invoiceAmountUsd.textContent = `≈ $${(
          invoice.amount_usd ?? selectedPlanUsd
        ).toFixed(2)}`;
      }
      if (invoiceAddress) {
        invoiceAddress.textContent = invoice.address || '—';
      }
      if (invoiceStatus) {
        invoiceStatus.textContent = invoice.status || 'pending';
      }

      if (invoice.qr_string && invoiceQr) {
        const qrUrl =
          'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
          encodeURIComponent(invoice.qr_string);
        invoiceQr.src = qrUrl;
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

  if (copyAddressBtn && invoiceAddress) {
    copyAddressBtn.addEventListener('click', async () => {
      const text = invoiceAddress.textContent?.trim();
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

  // --- INIT ---

  updatePlanStateFromDom();
  resetInvoiceUi();
  loadPrices();
});
