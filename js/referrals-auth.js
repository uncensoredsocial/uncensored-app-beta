/* ============================================================
   SUPABASE CONFIG (your real values)
============================================================ */
const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

/* ============================================================
   INIT (UMD build exposes window.supabase)
============================================================ */
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ============================================================
   LAUNCH CONFIG (repo base)
============================================================ */
function getBaseUrl() {
  // preferred: your single source of truth object
  const cfg = window.__UNCENSORED_LAUNCH__ || {};
  let base = cfg.baseUrl || "";

  // fallback for GitHub Pages repo
  if (!base) {
    base = "https://uncensoredsocial.github.io/uncensored-app-beta/";
  }

  // ensure trailing slash
  if (!base.endsWith("/")) base += "/";
  return base;
}

/* ============================================================
   DOM
============================================================ */
const authCard = document.getElementById("authCard");
const dash = document.getElementById("dash");
const logoutBtn = document.getElementById("logoutBtn");
const settingsLogoutBtn = document.getElementById("settingsLogoutBtn");
const authStatus = document.getElementById("authStatus");

const tabSignup = document.getElementById("tabSignup");
const tabLogin = document.getElementById("tabLogin");
const signupForm = document.getElementById("signupForm");
const loginForm = document.getElementById("loginForm");

const signupEmail = document.getElementById("signupEmail");
const signupPass = document.getElementById("signupPass");
const loginEmail = document.getElementById("loginEmail");
const loginPass = document.getElementById("loginPass");

const refLinkEl = document.getElementById("refLink");
const copyBtn = document.getElementById("copyBtn");
const shareBtn = document.getElementById("shareBtn");

const progressFill = document.getElementById("progressFill");
const refCountPill = document.getElementById("refCountPill");
const tierText = document.getElementById("tierText");

const leaderboardEl = document.getElementById("leaderboard");
const invitedListEl = document.getElementById("invitedList");

const usernameInput = document.getElementById("usernameInput");
const reserveBtn = document.getElementById("reserveBtn");
const reserveStatus = document.getElementById("reserveStatus");

// Optional reserved box (you added this in referrals.html)
const reservedBox = document.getElementById("reservedBox");
const reservedHandle = document.getElementById("reservedHandle");

/* ============================================================
   STATE
============================================================ */
let myLead = null;
let myUser = null;
let invitedChannel = null;
let leaderboardChannel = null;

/* ============================================================
   REF CAPTURE (if someone visits referrals.html?ref=XXXX)
   NOTE: Your *real* referral link will go to signup.html, but
         keeping this here doesn’t hurt.
============================================================ */
const params = new URLSearchParams(window.location.search);
const refFromUrl = params.get("ref");
if (refFromUrl && typeof refFromUrl === "string") {
  localStorage.setItem("pending_ref", refFromUrl.trim());
}

/* ============================================================
   TIERS
============================================================ */
const TIERS = [
  { n: 3, label: "Early Access Priority" },
  { n: 10, label: "Founder Badge" },
  { n: 25, label: "Username Reservation" },
  { n: 100, label: "Premium Subscription + Verified" }
];

function nextTier(count){
  for (const t of TIERS){
    if (count < t.n) return t;
  }
  return null;
}

function setReserveLockedUI(count){
  const unlocked = count >= 25;
  reserveBtn.disabled = !unlocked;
  usernameInput.disabled = !unlocked;

  // If already reserved, we keep the reserved box and status text.
  const alreadyReserved = reservedBox && !reservedBox.classList.contains("hidden");

  if (!unlocked){
    // Locked message (no more "loading your account...")
    if (!alreadyReserved) {
      reserveStatus.textContent = "Locked — you need 25 invites to reserve a username.";
    }
    return;
  }

  // Unlocked but not reserved yet
  if (!alreadyReserved) {
    reserveStatus.textContent = "Unlocked — reserve your username now.";
  }
}

function setTierUI(count){
  const pct = Math.min((count / 25) * 100, 100);
  progressFill.style.width = pct + "%";
  refCountPill.textContent = `${count} invites`;

  const next = nextTier(count);
  if (!next){
    tierText.textContent = "You’ve unlocked all tiers.";
  } else {
    const remaining = next.n - count;
    tierText.textContent = `You’re ${remaining} invite${remaining === 1 ? "" : "s"} away from: ${next.label}`;
  }

  setReserveLockedUI(count);
}

/* ============================================================
   HELPERS
============================================================ */
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setStatus(el, msg){
  if (!el) return;
  el.textContent = msg || "";
}

function renderRows(container, rows, mode){
  if (!container) return;

  if (!rows || rows.length === 0){
    container.innerHTML = `
      <div class="rowItem">
        <div class="left">
          <div>No data yet</div>
          <div class="muted small">Share your link to start.</div>
        </div>
        <div class="right"></div>
      </div>
    `;
    return;
  }

  container.innerHTML = rows.map((r, i) => {
    if (mode === "leaderboard"){
      return `
        <div class="rowItem">
          <div class="left">
            <div>#${i + 1} — ${escapeHtml(r.email_masked)}</div>
            <div class="muted small">ref: ${escapeHtml(r.ref_code)}</div>
          </div>
          <div class="right">${Number(r.ref_count || 0)}</div>
        </div>
      `;
    }

    return `
      <div class="rowItem">
        <div class="left">
          <div>${escapeHtml(r.email)}</div>
          <div class="muted small">${new Date(r.created_at).toLocaleString()}</div>
        </div>
        <div class="right"></div>
      </div>
    `;
  }).join("");
}

/* ============================================================
   TABS UI
============================================================ */
function setTab(which){
  if (which === "signup"){
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
    tabSignup.setAttribute("aria-selected", "true");
    tabLogin.setAttribute("aria-selected", "false");
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    setStatus(authStatus, "");
  } else {
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
    tabLogin.setAttribute("aria-selected", "true");
    tabSignup.setAttribute("aria-selected", "false");
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
    setStatus(authStatus, "");
  }
}

tabSignup?.addEventListener("click", () => setTab("signup"));
tabLogin?.addEventListener("click", () => setTab("login"));

/* ============================================================
   REALTIME
============================================================ */
function unsubscribeRealtime(){
  try{
    if (invitedChannel) supabaseClient.removeChannel(invitedChannel);
    if (leaderboardChannel) supabaseClient.removeChannel(leaderboardChannel);
  } catch {}
  invitedChannel = null;
  leaderboardChannel = null;
}

function subscribeRealtime(){
  unsubscribeRealtime();

  invitedChannel = supabaseClient
    .channel("invited-live")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "waitlist_leads" },
      (payload) => {
        const row = payload?.new;
        if (row && myLead && row.referred_by === myLead.ref_code){
          loadInvited();
        }
      }
    )
    .subscribe();

  leaderboardChannel = supabaseClient
    .channel("leaderboard-live")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "waitlist_leads" },
      async () => {
        await loadLeaderboard();
        await refreshMyCount();
      }
    )
    .subscribe();
}

/* ============================================================
   LOGOUT
============================================================ */
async function doLogout(){
  try { await supabaseClient.auth.signOut(); } catch {}
  unsubscribeRealtime();

  myLead = null;
  myUser = null;

  if (refLinkEl) refLinkEl.value = "";
  progressFill.style.width = "0%";
  refCountPill.textContent = "0 invites";
  tierText.textContent = "";

  reserveStatus.textContent = "";
  usernameInput.value = "";
  usernameInput.disabled = true;
  reserveBtn.disabled = true;

  if (reservedBox) reservedBox.classList.add("hidden");
  if (reservedHandle) reservedHandle.textContent = "@username";

  authCard.classList.remove("hidden");
  dash.classList.add("hidden");
  logoutBtn.classList.add("hidden");
}

logoutBtn?.addEventListener("click", doLogout);
settingsLogoutBtn?.addEventListener("click", (e) => { e.preventDefault(); doLogout(); });

/* ============================================================
   AUTH (Confirm Email should be OFF)
============================================================ */
signupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = (signupEmail.value || "").trim();
  const password = signupPass.value || "";

  if (!email || !password){
    setStatus(authStatus, "Enter email + password.");
    return;
  }

  setStatus(authStatus, "Creating account…");

  try {
    const { error: signUpErr } = await supabaseClient.auth.signUp({ email, password });
    if (signUpErr){
      setStatus(authStatus, `Error: ${signUpErr.message}`);
      return;
    }

    setStatus(authStatus, "Signing you in…");
    const { error: signInErr } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (signInErr){
      setStatus(authStatus, `Error: ${signInErr.message}`);
      return;
    }

    setStatus(authStatus, "");
    signupEmail.value = "";
    signupPass.value = "";
    await boot();
  } catch (err) {
    setStatus(authStatus, `Error: ${err?.message || err || "Load failed"}`);
  }
});

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = (loginEmail.value || "").trim();
  const password = loginPass.value || "";

  if (!email || !password){
    setStatus(authStatus, "Enter email + password.");
    return;
  }

  setStatus(authStatus, "Logging in…");

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error){
      setStatus(authStatus, `Error: ${error.message}`);
      return;
    }
    setStatus(authStatus, "");
    await boot();
  } catch (err) {
    setStatus(authStatus, `Error: ${err?.message || err || "Load failed"}`);
  }
});

/* ============================================================
   COPY / SHARE (robust for iOS / permissions)
============================================================ */
async function safeCopy(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback prompt
    window.prompt("Copy this link:", text);
    return false;
  }
}

copyBtn?.addEventListener("click", async () => {
  const val = refLinkEl?.value || "";
  if (!val) return;
  await safeCopy(val);
});

shareBtn?.addEventListener("click", async () => {
  const url = refLinkEl?.value || "";
  if (!url) return;

  const text = "Join Uncensored Social early access — invite friends and earn rewards.";

  try {
    if (navigator.share) {
      await navigator.share({ title: document.title, text, url });
    } else {
      await safeCopy(url);
    }
  } catch {
    await safeCopy(url);
  }
});

/* ============================================================
   REFERRAL LINK (THIS IS THE FIX)
   Link must go to signup.html?ref=CODE so invites count.
============================================================ */
function setReferralLink(refCode){
  const base = getBaseUrl();
  const url = `${base}signup.html?ref=${encodeURIComponent(refCode)}`;
  if (refLinkEl) refLinkEl.value = url;
}

/* ============================================================
   DATA
============================================================ */
async function ensureMyLead(){
  const pendingRef = (localStorage.getItem("pending_ref") || "").trim() || null;

  // create or fetch my lead row, credit referrer if pending_ref exists
  const { data, error } = await supabaseClient.rpc("create_my_lead", {
    p_referred_by: pendingRef
  });

  if (error) throw new Error(error.message);
  if (pendingRef) localStorage.removeItem("pending_ref");

  myLead = data?.[0];
  if (!myLead || !myLead.ref_code) throw new Error("Lead row missing after RPC.");

  setReferralLink(myLead.ref_code);
  setTierUI(Number(myLead.ref_count || 0));
}

async function loadLeaderboard(){
  const { data, error } = await supabaseClient
    .from("leaderboard")
    .select("ref_code, ref_count, email_masked, created_at")
    .order("ref_count", { ascending: false })
    .limit(25);

  if (error){
    renderRows(leaderboardEl, [], "leaderboard");
    return;
  }

  renderRows(leaderboardEl, data || [], "leaderboard");
}

async function loadInvited(){
  if (!myLead?.ref_code){
    renderRows(invitedListEl, [], "invited");
    return;
  }

  const { data, error } = await supabaseClient
    .from("waitlist_leads")
    .select("email, created_at, referred_by")
    .eq("referred_by", myLead.ref_code)
    .order("created_at", { ascending: false })
    .limit(250);

  if (error){
    renderRows(invitedListEl, [], "invited");
    return;
  }

  renderRows(invitedListEl, data || [], "invited");
}

async function refreshMyCount(){
  // RLS: single row = current user lead (your policies/RPC handle this)
  const { data, error } = await supabaseClient
    .from("waitlist_leads")
    .select("ref_count, ref_code")
    .single();

  if (!error && data){
    if (myLead) {
      myLead.ref_count = Number(data.ref_count || 0);
      myLead.ref_code = data.ref_code || myLead.ref_code;
    }
    setTierUI(Number(data.ref_count || 0));
    if (data.ref_code) setReferralLink(data.ref_code);
  }
}

/* ============================================================
   RESERVED USERNAME (persistent UI)
============================================================ */
function showReserved(username){
  if (reservedHandle) reservedHandle.textContent = `@${username}`;
  if (reservedBox) reservedBox.classList.remove("hidden");
  reserveStatus.textContent = `Your username is reserved: @${username} ✅`;
}

async function loadMyReservedUsername(){
  // show latest reserved name if any
  const { data, error } = await supabaseClient
    .from("reserved_usernames")
    .select("username, reserved_at")
    .order("reserved_at", { ascending: false })
    .limit(1);

  if (error) return;

  const row = (data || [])[0];
  if (row?.username){
    showReserved(row.username);
  }
}

/* ============================================================
   RESERVE USERNAME (fixed logic + messages)
============================================================ */
reserveBtn?.addEventListener("click", async () => {
  // If lead not loaded yet, don't show "loading..." forever; show a real message.
  if (!myLead){
    setStatus(reserveStatus, "Your account is still loading — try again in a moment.");
    return;
  }

  const count = Number(myLead.ref_count || 0);
  if (count < 25){
    setStatus(reserveStatus, "Locked — you need 25 invites to reserve a username.");
    return;
  }

  setStatus(reserveStatus, "Reserving…");

  const username = (usernameInput.value || "").toLowerCase().trim();
  if (!username){
    setStatus(reserveStatus, "Enter a username.");
    return;
  }

  const { data, error } = await supabaseClient.rpc("reserve_username", { p_username: username });

  if (error){
    setStatus(reserveStatus, `Error: ${error.message}`);
    return;
  }

  const reserved = data?.[0]?.username || username;
  showReserved(reserved);
});

/* ============================================================
   BOOT
============================================================ */
async function boot(){
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const session = sessionData?.session;

  if (!session){
    authCard.classList.remove("hidden");
    dash.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    return;
  }

  myUser = session.user;

  authCard.classList.add("hidden");
  dash.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");

  // disable reserve until we know count
  reserveBtn.disabled = true;
  usernameInput.disabled = true;
  if (reservedBox) reservedBox.classList.add("hidden");
  reserveStatus.textContent = "Loading your account…";

  try{
    await ensureMyLead();
    reserveStatus.textContent = ""; // will be set by tier UI
  } catch (e){
    reserveStatus.textContent = `Error: ${e?.message || "Failed to load your account."}`;
  }

  await loadMyReservedUsername();
  await loadLeaderboard();
  await loadInvited();
  subscribeRealtime();

  // Clean URL if someone opened referrals with ?ref=
  if (window.location.search.includes("ref=")) {
    const cleanUrl = window.location.pathname;
    history.replaceState({}, "", cleanUrl);
  }
}

boot();
