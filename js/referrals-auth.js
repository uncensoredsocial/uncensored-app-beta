import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* ============================================================
   CONFIG — PUT YOUR VALUES HERE
============================================================ */
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON = "YOUR_PUBLIC_ANON_KEY";

/* ============================================================
   INIT
============================================================ */
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

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

/* ============================================================
   STATE
============================================================ */
let myLead = null;
let invitedChannel = null;
let leaderboardChannel = null;

/* ============================================================
   REF CAPTURE (credit referral once)
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
  { n: 100, label: "Lifetime Verified" }
];

function nextTier(count){
  for (const t of TIERS){
    if (count < t.n) return t;
  }
  return null;
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

  const unlocked = count >= 25;
  reserveBtn.disabled = !unlocked;
  usernameInput.disabled = !unlocked;

  if (!unlocked){
    reserveStatus.textContent = "Locked — get 25 invites to reserve a username.";
  } else if (!reserveStatus.textContent.trim()){
    reserveStatus.textContent = "Unlocked — reserve your username now.";
  }
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
  el.textContent = msg || "";
}

function renderRows(container, rows, mode){
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

tabSignup.addEventListener("click", () => setTab("signup"));
tabLogin.addEventListener("click", () => setTab("login"));

/* ============================================================
   REALTIME (LIVE)
============================================================ */
function unsubscribeRealtime(){
  try{
    if (invitedChannel) supabase.removeChannel(invitedChannel);
    if (leaderboardChannel) supabase.removeChannel(leaderboardChannel);
  } catch {}
  invitedChannel = null;
  leaderboardChannel = null;
}

function subscribeRealtime(){
  unsubscribeRealtime();

  invitedChannel = supabase
    .channel("invited-live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "waitlist_leads" },
      (payload) => {
        const row = payload?.new;
        if (row && myLead && row.referred_by === myLead.ref_code){
          loadInvited();
        }
      }
    )
    .subscribe();

  leaderboardChannel = supabase
    .channel("leaderboard-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "waitlist_leads" },
      async () => {
        await loadLeaderboard();
        await refreshMyCount();
      }
    )
    .subscribe();
}

/* ============================================================
   LOGOUT (ON PAGE)
============================================================ */
async function doLogout(){
  try{
    await supabase.auth.signOut();
  } catch {}

  unsubscribeRealtime();

  myLead = null;
  refLinkEl.value = "";
  progressFill.style.width = "0%";
  refCountPill.textContent = "0 invites";
  tierText.textContent = "";
  reserveStatus.textContent = "";
  usernameInput.value = "";

  authCard.classList.remove("hidden");
  dash.classList.add("hidden");
  logoutBtn.classList.add("hidden");

  // Optional: clear pending ref so it doesn’t get reused
  // localStorage.removeItem("pending_ref");
}

if (logoutBtn){
  logoutBtn.addEventListener("click", async () => {
    await doLogout();
  });
}

if (settingsLogoutBtn){
  settingsLogoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await doLogout();
  });
}

/* ============================================================
   AUTH — SIGNUP / LOGIN
============================================================ */
/**
 * This assumes you turned OFF "Confirm email" in Supabase.
 * Signup is instant; we auto-login right after signup.
 */
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = (signupEmail.value || "").trim();
  const password = signupPass.value || "";

  if (!email || !password){
    setStatus(authStatus, "Enter email + password.");
    return;
  }

  setStatus(authStatus, "Creating account…");

  const { error: signUpErr } = await supabase.auth.signUp({ email, password });
  if (signUpErr){
    setStatus(authStatus, `Error: ${signUpErr.message}`);
    return;
  }

  setStatus(authStatus, "Signing you in…");
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });

  if (signInErr){
    setStatus(authStatus, `Error: ${signInErr.message}`);
    return;
  }

  setStatus(authStatus, "");
  await boot();

  signupEmail.value = "";
  signupPass.value = "";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = (loginEmail.value || "").trim();
  const password = loginPass.value || "";

  if (!email || !password){
    setStatus(authStatus, "Enter email + password.");
    return;
  }

  setStatus(authStatus, "Logging in…");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error){
    setStatus(authStatus, `Error: ${error.message}`);
    return;
  }

  setStatus(authStatus, "");
  await boot();
});

/* ============================================================
   COPY / SHARE
============================================================ */
copyBtn.addEventListener("click", async () => {
  const val = refLinkEl.value || "";
  if (!val) return;
  await navigator.clipboard.writeText(val);
  alert("Copied!");
});

shareBtn.addEventListener("click", async () => {
  const url = refLinkEl.value || "";
  if (!url) return;

  const text = "Join Uncensored Social early access — invite friends and earn rewards.";

  try {
    if (navigator.share) {
      await navigator.share({ title: document.title, text, url });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Link copied!");
    }
  } catch {}
});

/* ============================================================
   DATA LOADERS
============================================================ */
async function ensureMyLead(){
  const pendingRef = (localStorage.getItem("pending_ref") || "").trim() || null;

  const { data, error } = await supabase.rpc("create_my_lead", {
    p_referred_by: pendingRef
  });

  if (error){
    throw new Error(error.message);
  }

  if (pendingRef) localStorage.removeItem("pending_ref");

  myLead = data?.[0];
  if (!myLead || !myLead.ref_code){
    throw new Error("Lead row missing after RPC.");
  }

  const origin = window.location.origin;
  const path = window.location.pathname;
  const baseDir = path.endsWith("/") ? path : path.replace(/[^/]*$/, "");
  const refUrl = `${origin}${baseDir}referrals.html?ref=${encodeURIComponent(myLead.ref_code)}`;

  refLinkEl.value = refUrl;
  setTierUI(Number(myLead.ref_count || 0));
}

async function loadLeaderboard(){
  const { data, error } = await supabase
    .from("leaderboard")
    .select("ref_code, ref_count, email_masked, created_at")
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

  const { data, error } = await supabase
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
  const { data, error } = await supabase
    .from("waitlist_leads")
    .select("ref_count, ref_code, email")
    .single();

  if (!error && data){
    myLead.ref_count = Number(data.ref_count || 0);
    setTierUI(myLead.ref_count);
  }
}

/* ============================================================
   USERNAME RESERVATION (SERVER ENFORCED)
============================================================ */
reserveBtn.addEventListener("click", async () => {
  setStatus(reserveStatus, "Reserving…");

  const username = (usernameInput.value || "").toLowerCase().trim();
  if (!username){
    setStatus(reserveStatus, "Enter a username.");
    return;
  }

  const { data, error } = await supabase.rpc("reserve_username", { p_username: username });

  if (error){
    setStatus(reserveStatus, `Error: ${error.message}`);
    return;
  }

  const reserved = data?.[0]?.username || username;
  setStatus(reserveStatus, `Reserved: @${reserved} ✅`);
});

/* ============================================================
   BOOT
============================================================ */
async function boot(){
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session){
    authCard.classList.remove("hidden");
    dash.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    return;
  }

  authCard.classList.add("hidden");
  dash.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");

  await ensureMyLead();
  await loadLeaderboard();
  await loadInvited();
  subscribeRealtime();

  if (window.location.search.includes("ref=")) {
    const cleanUrl = window.location.pathname;
    history.replaceState({}, "", cleanUrl);
  }
}

/* ============================================================
   START
============================================================ */
boot();
