// js/monero-watcher.js
//
// Monero watcher:
// - Runs inside the Node backend (Railway)
// - Polls monero-wallet-rpc
// - Updates the `invoices` table in Supabase when payments are seen

// NOTE: This file is NOT for the browser. Do NOT include it in HTML.

const MONERO_RPC_URL = process.env.MONERO_WALLET_RPC_URL;
const MONERO_RPC_USER = process.env.MONERO_WALLET_RPC_USER || '';
const MONERO_RPC_PASSWORD = process.env.MONERO_WALLET_RPC_PASSWORD || '';

// How often to poll (in seconds)
const MONERO_POLL_SECONDS = parseInt(
  process.env.MONERO_POLL_SECONDS || '60',
  10
);

// Basic safety: if no URL configured, watcher will not start
if (!MONERO_RPC_URL) {
  console.warn(
    '[MoneroWatcher] MONERO_WALLET_RPC_URL is not set – watcher will be disabled.'
  );
}

/**
 * Call monero-wallet-rpc over JSON-RPC.
 * Requires monero-wallet-rpc running with:
 *   --rpc-login USER:PASSWORD
 *   --rpc-bind-port XXXX
 *   --rpc-bind-ip 0.0.0.0 (or localhost if using tunnel)
 */
async function callMoneroRpc(method, params = {}) {
  if (!MONERO_RPC_URL) {
    throw new Error('MONERO_WALLET_RPC_URL not configured');
  }

  const body = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  // Basic auth if username is set
  if (MONERO_RPC_USER) {
    const authString = Buffer.from(
      `${MONERO_RPC_USER}:${MONERO_RPC_PASSWORD}`
    ).toString('base64');
    headers['Authorization'] = `Basic ${authString}`;
  }

  // In Node 18+ fetch is global. If you ever see "fetch is not defined",
  // install node-fetch@2 and replace with:
  // const fetch = require('node-fetch');
  const res = await fetch(MONERO_RPC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Monero RPC HTTP error ${res.status}: ${res.statusText} ${text}`
    );
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(
      `Monero RPC error ${json.error.code}: ${json.error.message}`
    );
  }

  return json.result;
}

/**
 * Convert XMR float to atomic units (int).
 * 1 XMR = 1e12 atomic units.
 */
function xmrToAtomic(xmrAmount) {
  return Math.round(Number(xmrAmount) * 1e12);
}

/**
 * Poll Supabase for pending invoices, then Monero RPC for incoming transfers,
 * then mark invoices as confirmed once payment + confirmations match.
 *
 * This expects:
 * - `invoices` table with fields:
 *   id, user_id, address, amount_crypto, currency,
 *   status, tx_hash, confirmations, required_confirmations, created_at, ...
 */
async function checkPendingInvoices(supabase) {
  try {
    // Only check XMR invoices that are not complete yet
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .in('status', ['pending', 'underpaid'])
      .eq('currency', 'XMR');

    if (error) {
      console.error('[MoneroWatcher] Error loading invoices:', error);
      return;
    }

    if (!invoices || invoices.length === 0) {
      // Nothing pending
      return;
    }

    // Get all incoming transfers once per poll (cheaper than per-invoice calls)
    const result = await callMoneroRpc('get_transfers', {
      in: true
      // You can add filters like account_index or min_height later if needed
    });

    const incoming = (result && result.in) || [];

    if (!incoming.length) {
      return;
    }

    // Go through every pending invoice
    for (const invoice of invoices) {
      await processInvoiceWithTransfers(supabase, invoice, incoming);
    }
  } catch (err) {
    console.error('[MoneroWatcher] checkPendingInvoices error:', err);
  }
}

/**
 * Process a single invoice against the list of incoming transfers.
 */
async function processInvoiceWithTransfers(supabase, invoice, transfers) {
  const expectedAtomic = xmrToAtomic(invoice.amount_crypto);
  const requiredConfs = invoice.required_confirmations || 10;

  // Transfers to THIS address only (you currently use one main address;
  // later you can move to per-invoice subaddresses)
  const matches = transfers.filter((t) => {
    // t.amount is atomic units
    // Match by address and amount (within 1% tolerance)
    const amt = Number(t.amount || 0);

    const sameAddress =
      !invoice.address || !t.address
        ? true // if wallet-rpc doesn't list address, we just match amount
        : t.address === invoice.address;

    // 1% tolerance window
    const lower = expectedAtomic * 0.99;
    const upper = expectedAtomic * 1.01;

    const amountMatches = amt >= lower && amt <= upper;

    return sameAddress && amountMatches;
  });

  if (!matches.length) {
    return; // nothing for this invoice yet
  }

  // Use the one with highest confirmations (safest)
  matches.sort(
    (a, b) => (b.confirmations || 0) - (a.confirmations || 0)
  );

  const best = matches[0];
  const confs = best.confirmations || 0;

  // Update invoice confirmations (even if not fully confirmed yet)
  await supabase
    .from('invoices')
    .update({
      tx_hash: best.txid,
      confirmations: confs
    })
    .eq('id', invoice.id);

  if (confs >= requiredConfs) {
    // Mark as confirmed; trigger in Supabase will create subscription row.
    const nowIso = new Date().toISOString();

    const { error: updError } = await supabase
      .from('invoices')
      .update({
        status: 'confirmed',
        paid_at: nowIso,
        confirmed_at: nowIso,
        tx_hash: best.txid,
        confirmations: confs
      })
      .eq('id', invoice.id);

    if (updError) {
      console.error(
        '[MoneroWatcher] Failed to mark invoice confirmed:',
        invoice.id,
        updError
      );
    } else {
      console.log(
        `[MoneroWatcher] Invoice ${invoice.id} confirmed for user ${invoice.user_id} (tx ${best.txid}, confs ${confs})`
      );
    }
  } else {
    console.log(
      `[MoneroWatcher] Invoice ${invoice.id} seen tx ${best.txid} with ${confs}/${requiredConfs} confirmations`
    );
  }
}

/**
 * Start the watcher: runs checkPendingInvoices every N seconds.
 */
function startMoneroWatcher(supabase) {
  if (!MONERO_RPC_URL) {
    console.warn(
      '[MoneroWatcher] No RPC URL configured – watcher will NOT run.'
    );
    return;
  }

  console.log(
    `[MoneroWatcher] Starting with interval ${MONERO_POLL_SECONDS}s`
  );

  // Run once on startup
  checkPendingInvoices(supabase).catch((err) => {
    console.error('[MoneroWatcher] initial run error:', err);
  });

  // Then on an interval
  setInterval(() => {
    checkPendingInvoices(supabase).catch((err) => {
      console.error('[MoneroWatcher] interval run error:', err);
    });
  }, MONERO_POLL_SECONDS * 1000);
}

module.exports = {
  startMoneroWatcher
};
