/**
 * backend/monero-watcher.js
 *
 * REQUIREMENTS:
 * 1) monero-wallet-rpc running and accessible (private!)
 * 2) invoices table stores:
 *    - id
 *    - user_id
 *    - address
 *    - amount_crypto
 *    - status ('pending'|'paid'|'confirmed')
 *    - tx_hash
 *    - confirmations
 *    - required_confirmations
 *    - created_at
 *    - paid_at
 *    - confirmed_at
 *    - account_index (number)        <-- IMPORTANT
 *    - address_index (number)        <-- IMPORTANT
 *
 * 3) subscriptions table stores:
 *    - id, user_id, plan, starts_at, expires_at, created_at
 *
 * ENV:
 *  SUPABASE_URL
 *  SUPABASE_SERVICE_KEY
 *  MONERO_RPC_URL               e.g. http://127.0.0.1:18083/json_rpc
 *  MONERO_RPC_USER (optional)
 *  MONERO_RPC_PASS (optional)
 *  MONERO_ACCOUNT_INDEX         e.g. 0
 *  REQUIRED_CONFIRMATIONS       e.g. 10
 */

require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MONERO_RPC_URL = process.env.MONERO_RPC_URL;
const MONERO_RPC_USER = process.env.MONERO_RPC_USER || null;
const MONERO_RPC_PASS = process.env.MONERO_RPC_PASS || null;

const MONERO_ACCOUNT_INDEX = Number(process.env.MONERO_ACCOUNT_INDEX || 0);
const REQUIRED_CONFIRMATIONS = Number(process.env.REQUIRED_CONFIRMATIONS || 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}
if (!MONERO_RPC_URL) {
  console.error("Missing MONERO_RPC_URL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function rpcAuthConfig() {
  if (!MONERO_RPC_USER && !MONERO_RPC_PASS) return {};
  return {
    auth: {
      username: MONERO_RPC_USER || "",
      password: MONERO_RPC_PASS || ""
    }
  };
}

async function moneroRpc(method, params = {}) {
  const body = {
    jsonrpc: "2.0",
    id: "0",
    method,
    params
  };

  const res = await axios.post(MONERO_RPC_URL, body, {
    timeout: 10000,
    ...rpcAuthConfig()
  });

  if (res.data?.error) {
    throw new Error(`${method} RPC error: ${JSON.stringify(res.data.error)}`);
  }
  return res.data?.result;
}

function xmrToAtomic(xmr) {
  // XMR atomic units = 1e12
  return Math.round(Number(xmr) * 1e12);
}

function atomicToXmr(atomic) {
  return Number(atomic) / 1e12;
}

async function getWalletHeight() {
  const r = await moneroRpc("get_height", {});
  return Number(r?.height || 0);
}

async function getIncomingTransfersForSubaddress(accountIndex, addressIndex) {
  // get_transfers supports subaddr_indices
  const r = await moneroRpc("get_transfers", {
    in: true,
    account_index: accountIndex,
    subaddr_indices: [addressIndex],
    // keep it light
    filter_by_height: false
  });

  // result.in is an array of incoming transfers
  return Array.isArray(r?.in) ? r.in : [];
}

async function ensureSubscription(userId, plan) {
  const now = new Date();
  const startsAt = now.toISOString();

  // monthly = +30 days, yearly = +365 days (simple)
  const expires = new Date(now.getTime());
  if (plan === "yearly") expires.setDate(expires.getDate() + 365);
  else expires.setDate(expires.getDate() + 30);

  const expiresAt = expires.toISOString();

  // Upsert: if active subscription exists, extend from max(expires_at, now)
  const { data: existing, error: existingError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("expires_at", { ascending: false })
    .limit(1);

  if (existingError) {
    console.error("Subscription lookup error:", existingError);
  }

  let base = now;
  const current = existing && existing.length ? existing[0] : null;
  if (current && current.expires_at) {
    const curExp = new Date(current.expires_at);
    if (curExp > now) base = curExp;
  }

  const newExp = new Date(base.getTime());
  if (plan === "yearly") newExp.setDate(newExp.getDate() + 365);
  else newExp.setDate(newExp.getDate() + 30);

  const finalExpiresAt = newExp.toISOString();

  const row = {
    id: uuidv4(),
    user_id: userId,
    plan,
    starts_at: startsAt,
    expires_at: finalExpiresAt,
    created_at: startsAt
  };

  const { error: insertError } = await supabase.from("subscriptions").insert(row);
  if (insertError) {
    console.error("Subscription insert error:", insertError);
  }
}

async function processPendingInvoices() {
  // Get pending invoices
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Invoices fetch error:", error);
    return;
  }
  if (!invoices || !invoices.length) return;

  const height = await getWalletHeight();

  for (const inv of invoices) {
    try {
      const accountIndex = Number(inv.account_index);
      const addressIndex = Number(inv.address_index);

      // If these are missing, watcher cannot map reliably:
      if (!Number.isFinite(accountIndex) || !Number.isFinite(addressIndex)) {
        // leave it pending, but log it once
        console.warn(
          `Invoice ${inv.id} missing account_index/address_index. Add subaddress support in /payments/create.`
        );
        continue;
      }

      const expectedAtomic = xmrToAtomic(inv.amount_crypto);
      const transfers = await getIncomingTransfersForSubaddress(accountIndex, addressIndex);

      // Find best candidate tx: >= expected amount, newest first
      const matching = transfers
        .filter((t) => Number(t.amount || 0) >= expectedAtomic)
        .sort((a, b) => Number(b.height || 0) - Number(a.height || 0));

      if (!matching.length) {
        // no payment yet; optionally update confirmations to 0
        continue;
      }

      const tx = matching[0];
      const txHash = tx.txid || tx.tx_hash || null;
      const txHeight = Number(tx.height || 0);

      const conf = txHeight > 0 ? Math.max(0, height - txHeight) : 0;
      const req = Number(inv.required_confirmations || REQUIRED_CONFIRMATIONS);

      // Update invoice: mark paid when first seen
      const paidAt = inv.paid_at || new Date().toISOString();
      let newStatus = conf >= req ? "confirmed" : "paid";

      const update = {
        status: newStatus,
        tx_hash: txHash,
        confirmations: conf,
        required_confirmations: req,
        paid_at: paidAt
      };

      if (newStatus === "confirmed") {
        update.confirmed_at = inv.confirmed_at || new Date().toISOString();
      }

      const { error: upErr } = await supabase
        .from("invoices")
        .update(update)
        .eq("id", inv.id);

      if (upErr) {
        console.error("Invoice update error:", upErr);
        continue;
      }

      if (newStatus === "confirmed") {
        await ensureSubscription(inv.user_id, inv.plan);
        console.log(`✅ Invoice confirmed: ${inv.id} user=${inv.user_id} plan=${inv.plan}`);
      } else {
        console.log(`💰 Invoice paid (waiting confirmations): ${inv.id} conf=${conf}/${req}`);
      }
    } catch (e) {
      console.error("Watcher error for invoice", inv.id, e.message);
    }
  }
}

async function main() {
  console.log("🔁 Monero watcher starting…");
  console.log("RPC:", MONERO_RPC_URL);
  console.log("Account index:", MONERO_ACCOUNT_INDEX);
  console.log("Required confirmations:", REQUIRED_CONFIRMATIONS);

  // Poll loop
  while (true) {
    try {
      await processPendingInvoices();
    } catch (e) {
      console.error("Watcher loop error:", e.message);
    }
    await new Promise((r) => setTimeout(r, 20000)); // every 20s
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
