// donations.js — Uncensored Social Donation Page
// Includes: live rates, QR, copy, summary, localStorage, section reveal, back-to-top, why-crypto accordion
// No confetti.

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
});

function initializeApp() {
  setupAmountSelection();
  setupCryptoSelection();
  setupRealTimeRates();
  setupScrollReveal();
  setupBackToTop();
  setupLocalStorage();
  setupWhyCryptoAccordion();
}

// ======== AMOUNT SELECTION =========
let selectedAmount = null;
let selectedCrypto = null;

function setupAmountSelection() {
  const amountButtons = document.querySelectorAll(".amt-btn");
  const customInput = document.querySelector(".custom-input");

  amountButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      amountButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (btn.classList.contains("custom")) {
        customInput.style.display = "block";
        setTimeout(() => customInput.focus({ preventScroll: false }), 0);
        selectedAmount = null;
        updateSummary();
      } else {
        customInput.style.display = "none";
        selectedAmount = parseFloat(btn.dataset.amount);
        updateSummary();
        triggerHapticFeedback();
      }
    });
  });

  customInput.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    selectedAmount = (!isNaN(val) && val > 0) ? val : null;
    updateSummary();
  });

  customInput.addEventListener("blur", (e) => {
    if (e.target.value && !isNaN(parseFloat(e.target.value))) {
      e.target.value = parseFloat(e.target.value).toFixed(2);
    }
  });
}

// ======== CRYPTO SELECTION =========
function setupCryptoSelection() {
  const cryptoItems = document.querySelectorAll(".crypto-item");
  const walletSection = document.querySelector(".wallet-section");
  const walletAddress = document.querySelector(".wallet-address");
  const copyBtn = document.querySelector(".copy-btn");
  const cryptoPrice = document.querySelector(".crypto-price");

  // Your real wallet addresses (from your provided snippet)
  const wallets = {
    BTC: { address: "bc1qc78ztftkxzehx3veuar3fstse2vcvd4nslzqvy", networks: ["Bitcoin Mainnet"] },
    ETH: { address: "0x20190e969bc2654219702413B8AacD3c0099000e", networks: ["ERC-20 Only"] },
    SOL: { address: "CunPMZC9QitsSrS1wbPUPEqXJ41jxejyok18FEFB1LFH", networks: ["Solana Mainnet"] },
    USDT:{ address: "0x20190e969bc2654219702413B8AacD3c0099000e", networks: ["ERC-20 Only"] },
    USDC:{ address: "CunPMZC9QitsSrS1wbPUPEqXJ41jxejyok18FEFB1LFH", networks: ["Solana Only"] },
    XMR: { address: "43nwFS7KR1xLavzjeFuUJj9zhMETFN1gVHbEMeCkYCJMTWpfGkEWjdJK76tkcFEWYAZdmYwXw2dbEEZEZAsa1bE6TQHV9bv", networks: ["Monero Mainnet"] }
  };

  cryptoItems.forEach((item) => {
    item.addEventListener("click", () => {
      cryptoItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      selectedCrypto = item.dataset.symbol;

      showWallet(selectedCrypto);
      updateSummary();
      triggerHapticFeedback();
    });
  });

  function showWallet(symbol) {
    if (!wallets[symbol]) return;

    walletSection.style.display = "block";
    walletAddress.textContent = wallets[symbol].address;

    generateQRCode(wallets[symbol].address, symbol);
    showNetworkOptions(wallets[symbol].networks);
    updateCryptoPriceInfo(symbol);
  }

  function showNetworkOptions(networks) {
    const existing = document.querySelector(".network-selector");
    if (existing) existing.remove();

    if (!networks || networks.length === 0) return;

    const selector = document.createElement("div");
    selector.className = "network-selector";
    selector.innerHTML = `
      <div style="margin-top:12px;">
        <div class="muted" style="font-weight:950; margin-bottom:8px;">
          <i class="fa-solid fa-network-wired" style="color: var(--accent); margin-right:8px;"></i>
          Network
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${networks.map(n => `
            <button type="button"
              style="
                padding:10px 12px;
                border-radius:14px;
                border:1px solid rgba(255,255,255,0.12);
                background: rgba(0,0,0,0.45);
                color:#fff;
                font-weight:950;
              "
            >${n}</button>
          `).join("")}
        </div>
      </div>
    `;
    walletAddress.insertAdjacentElement("afterend", selector);
  }

  function updateCryptoPriceInfo(symbol) {
    const rate = rates[symbol] || 0;
    if (selectedAmount && rate > 0) {
      const eq = (selectedAmount / rate).toFixed(symbol === "BTC" ? 8 : 6);
      cryptoPrice.textContent = `$${selectedAmount.toFixed(2)} ≈ ${eq} ${symbol}`;
    } else if (rate > 0) {
      cryptoPrice.textContent = `Current ${symbol} price: $${rate.toLocaleString()}`;
    } else {
      cryptoPrice.textContent = `Fetching ${symbol} price...`;
    }
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(walletAddress.textContent);
        copyBtn.innerHTML = `<i class="fa-solid fa-check"></i><span>Copied</span>`;
        copyBtn.style.background = "rgba(16,185,129,0.18)";
        copyBtn.style.borderColor = "rgba(16,185,129,0.45)";
        showToast("Wallet address copied");
        triggerHapticFeedback();
        setTimeout(() => {
          copyBtn.innerHTML = `<i class="fa-solid fa-copy"></i><span>Copy address</span>`;
          copyBtn.style.background = "";
          copyBtn.style.borderColor = "";
        }, 1600);
      } catch {
        showToast("Failed to copy address");
      }
    });
  }

  window.__updateCryptoPriceInfo = updateCryptoPriceInfo;
}

// ======== REAL-TIME RATES =========
let rates = { BTC: 0, ETH: 0, SOL: 0, USDT: 0, USDC: 0, XMR: 0 };

function setupRealTimeRates() {
  fetchRates();
  setInterval(fetchRates, 30000);
  updateLivePricesDisplay();
}

async function fetchRates() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,tether,usd-coin,monero&vs_currencies=usd"
    );
    if (!res.ok) throw new Error("Rates API error");
    const data = await res.json();

    rates = {
      BTC: data.bitcoin?.usd || rates.BTC,
      ETH: data.ethereum?.usd || rates.ETH,
      SOL: data.solana?.usd || rates.SOL,
      USDT: data.tether?.usd || rates.USDT,
      USDC: data["usd-coin"]?.usd || rates.USDC,
      XMR: data.monero?.usd || rates.XMR
    };

    updateLivePricesDisplay();
    updateSummary();

    if (selectedCrypto && window.__updateCryptoPriceInfo) {
      window.__updateCryptoPriceInfo(selectedCrypto);
    }
  } catch {
    // keep last known rates
  }
}

function updateLivePricesDisplay() {
  document.querySelectorAll(".crypto-item").forEach((item) => {
    const symbol = item.dataset.symbol;
    const rate = rates[symbol];

    const existing = item.querySelector(".live-price");
    if (existing) existing.remove();

    if (rate && rate > 0) {
      const el = document.createElement("div");
      el.className = "live-price";

      let formatted;
      if (rate >= 1000) formatted = `$${rate.toLocaleString()}`;
      else if (rate >= 1) formatted = `$${rate.toFixed(2)}`;
      else formatted = `$${rate.toFixed(4)}`;

      el.textContent = formatted;

      const meta = item.querySelector(".crypto-meta");
      (meta || item).appendChild(el);
    }
  });
}

// ======== QR CODE =========
function generateQRCode(address, symbol) {
  const qrPanel = document.querySelector(".qr-panel");
  if (!qrPanel || !address) return;

  qrPanel.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.textAlign = "center";
  wrap.style.padding = "16px";
  wrap.style.background = "white";
  wrap.style.borderRadius = "14px";
  wrap.style.display = "inline-block";

  const img = document.createElement("img");
  const qrData = encodeURIComponent(address);
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${qrData}&bgcolor=ffffff&color=000000&margin=10&qzone=1`;
  img.alt = `${symbol} QR Code`;
  img.style.borderRadius = "10px";
  img.loading = "lazy";

  wrap.appendChild(img);
  qrPanel.appendChild(wrap);
}

// ======== SUMMARY =========
function updateSummary() {
  const box = document.querySelector(".donation-summary");
  if (!box) return;

  if (!(selectedAmount && selectedCrypto)) {
    box.classList.remove("visible");
    box.innerHTML = "";
    return;
  }

  const rate = rates[selectedCrypto] || 0;
  if (!rate) {
    box.classList.add("visible");
    box.innerHTML = `
      <div class="enhanced-summary">
        <h4>Donation Summary</h4>
        <div class="conversion-note">Fetching live rate for ${selectedCrypto}...</div>
      </div>
    `;
    saveDonationPreference();
    return;
  }

  let eq, fee, total;
  if (selectedCrypto === "BTC") { eq = (selectedAmount / rate).toFixed(8); fee="0.0002"; total=(+eq + +fee).toFixed(8); }
  else if (selectedCrypto === "ETH") { eq = (selectedAmount / rate).toFixed(6); fee="0.003"; total=(+eq + +fee).toFixed(6); }
  else if (selectedCrypto === "SOL") { eq = (selectedAmount / rate).toFixed(4); fee="0.000005"; total=(+eq + +fee).toFixed(4); }
  else if (selectedCrypto === "USDT") { eq = (selectedAmount / rate).toFixed(2); fee="0.003"; total=(+eq + +fee).toFixed(2); }
  else if (selectedCrypto === "USDC") { eq = (selectedAmount / rate).toFixed(2); fee="0.000005"; total=(+eq + +fee).toFixed(2); }
  else if (selectedCrypto === "XMR") { eq = (selectedAmount / rate).toFixed(6); fee="0.0001"; total=(+eq + +fee).toFixed(6); }
  else { eq = (selectedAmount / rate).toFixed(6); fee="0.001"; total=(+eq + +fee).toFixed(6); }

  const displayNames = { BTC:"Bitcoin", ETH:"Ethereum", SOL:"Solana", USDT:"USDT", USDC:"USDC", XMR:"Monero" };

  box.innerHTML = `
    <div class="enhanced-summary">
      <h4>Donation Summary</h4>

      <div class="summary-line">
        <span class="summary-label">Amount</span>
        <span class="summary-value">$${selectedAmount.toFixed(2)} USD</span>
      </div>

      <div class="summary-line">
        <span class="summary-label">Cryptocurrency</span>
        <span class="summary-value">${displayNames[selectedCrypto] || selectedCrypto}</span>
      </div>

      <div class="summary-line">
        <span class="summary-label">You send</span>
        <span class="summary-value">${eq} ${selectedCrypto}</span>
      </div>

      <div class="summary-line">
        <span class="summary-label">Est. network fee</span>
        <span class="summary-value">~${fee} ${selectedCrypto}</span>
      </div>

      <div class="summary-line total">
        <span class="summary-label">Total to send</span>
        <span class="summary-value">${total} ${selectedCrypto}</span>
      </div>

      <div class="conversion-note">
        Rate: 1 ${selectedCrypto} = $${rate.toLocaleString()}
      </div>
    </div>
  `;

  box.classList.add("visible");
  saveDonationPreference();
}

// ======== LOCAL STORAGE =========
function setupLocalStorage() {
  loadDonationPreference();
  window.addEventListener("beforeunload", saveDonationPreference);
}

function saveDonationPreference() {
  const pref = { amount: selectedAmount, crypto: selectedCrypto, timestamp: Date.now() };
  try { localStorage.setItem("uncensoredDonationPref", JSON.stringify(pref)); } catch {}
}

function loadDonationPreference() {
  try {
    const saved = localStorage.getItem("uncensoredDonationPref");
    if (!saved) return;
    const pref = JSON.parse(saved);
    if (Date.now() - pref.timestamp > 24 * 60 * 60 * 1000) return;

    if (pref.amount) {
      selectedAmount = pref.amount;
      const preset = Array.from(document.querySelectorAll(".amt-btn")).find(
        b => b.dataset.amount && parseFloat(b.dataset.amount) === parseFloat(pref.amount)
      );
      if (preset) preset.click();
      else {
        document.querySelector(".amt-btn.custom")?.click();
        const input = document.querySelector(".custom-input");
        if (input) input.value = parseFloat(pref.amount).toFixed(2);
      }
    }

    if (pref.crypto) {
      const item = Array.from(document.querySelectorAll(".crypto-item"))
        .find(i => i.dataset.symbol === pref.crypto);
      if (item) item.click();
    }
  } catch {}
}

// ======== WHY CRYPTO ACCORDION =========
function setupWhyCryptoAccordion() {
  const btn = document.querySelector(".accordion-btn");
  const panel = document.querySelector(".accordion-panel");
  if (!btn || !panel) return;

  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    panel.hidden = expanded;
  });
}

// ======== TOAST =========
function showToast(message, duration = 2300) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 60);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

// ======== HAPTIC =========
function triggerHapticFeedback() {
  if (navigator.vibrate) navigator.vibrate(35);
}

// ======== SCROLL REVEAL =========
function setupScrollReveal() {
  const sections = document.querySelectorAll(".section");
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add("in-view");
    });
  }, { threshold: 0.12 });

  sections.forEach((s) => obs.observe(s));
}

// ======== BACK TO TOP =========
function setupBackToTop() {
  const btn = document.createElement("button");
  btn.className = "back-to-top";
  btn.type = "button";
  btn.title = "Back to top";
  btn.setAttribute("aria-label", "Back to top");
  btn.innerHTML = `<i class="fa-solid fa-arrow-up"></i>`;

  btn.style.cssText = `
    position: fixed;
    bottom: 22px;
    right: 22px;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: rgba(255,255,255,0.08);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.12);
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transition: all .25s ease;
    z-index: 1200;
    display: grid;
    place-items: center;
    font-size: 1.05rem;
  `;

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    triggerHapticFeedback();
  });

  document.body.appendChild(btn);

  window.addEventListener("scroll", () => {
    if (window.scrollY > 360) {
      btn.style.opacity = "1";
      btn.style.visibility = "visible";
    } else {
      btn.style.opacity = "0";
      btn.style.visibility = "hidden";
    }
  });
}

console.log("✅ Uncensored Social donation page loaded");
