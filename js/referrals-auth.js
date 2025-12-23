/* ============================================================
   SUPABASE CONFIG (your real values)
============================================================ */
const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

/* ============================================================
   REFERRAL BASE URL (YOUR REPO NAME)
   FINAL format:
   https://uncensoredsocial.github.io/uncensored-app-beta/?ref=ABC123
============================================================ */
const REFERRAL_BASE_URL = "https://uncensoredsocial.github.io/uncensored-app-beta/";

/* ============================================================
   INIT (UMD build exposes window.supabase)
============================================================ */
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

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

/* Optional persistent reserved UI (recommended)
   Add this HTML in referrals.html:
   <div id="reservedBox" class="reservedBox hidden">
     <div class="reservedTop">
       <div class="reservedTitle">Reserved username</div>
       <div class="reservedBadge">Reserved</div>
     </div>
     <div id="reservedHandle" class="reservedHandle">@username</div>
     <div class="muted small">This will be yours at launch.</div>
   </div>
*/
const reservedBox = document.getElementById("reservedBox");
const reservedHandle = document.getElementById("reservedHandle");

/* ============================================================
   STATE
============================================================ */
let myLead = null;
let invitedChannel = null;
let leaderboardChannel = null;

/* ============================================================
   REF CAPTURE (store ref so it survives signup/login)
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
    setStatus(reserveStatus, "You can’t reserve a username yet — get 25 invites to unlock.");
  } else if (!reserveStatus.textContent.trim()){
    setStatus(reserveStatus, "Unlocked — reserve your username now.");
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

async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // iOS fallback
    try{
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function makeRefUrl(refCode){
  return `${REFERRAL_BASE_URL}?ref=${encodeURIComponent(refCode)}`;
}

function cleanRefFromUrl(){
  if (window.location.search.includes("ref=")) {
    const cleanUrl = window.location.pathname;
    history.replaceState({}, "", cleanUrl);
  }
}

function randomRefCode(len = 6){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++){
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function showReserved(username){
  if (reservedBox && reservedHandle){
    reservedHandle.textContent = `@${username}`;
    reservedBox.classList.remove("hidden");
  }
  setStatus(reserveStatus, `Reserved username: @${username} ✅`);
  usernameInput.disabled = true;
  reserveBtn.disabled = true;
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
          refreshMyCount(); // count might change via trigger/RPC
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
  refLinkEl.value = "";
  progressFill.style.width = "0%";
  refCountPill.textContent = "0 invites";
  tierText.textContent = "";
  reserveStatus.textContent = "";
  usernameInput.value = "";

  if (reservedBox) reservedBox.classList.add("hidden");
  if (reservedHandle) reservedHandle.textContent = "@username";
  usernameInput.disabled = true;
  reserveBtn.disabled = true;

  authCard.classList.remove("hidden");
  dash.classList.add("hidden");
  logoutBtn.classList.add("hidden");
}

logoutBtn?.addEventListener("click", doLogout);
settingsLogoutBtn?.addEventListener("click", (e) => { e.preventDefault(); doLogout(); });

/* ============================================================
   AUTH (Confirm email OFF in Supabase)
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
    await boot();

    signupEmail.value = "";
    signupPass.value = "";
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
   COPY / SHARE (real, stable link)
============================================================ */
copyBtn?.addEventListener("click", async () => {
  const val = refLinkEl.value || "";
  if (!val) return;

  const ok = await copyToClipboard(val);
  if (ok){
    const old = copyBtn.textContent;
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = old), 1200);
  } else {
    alert("Could not copy. Long-press the link to copy.");
  }
});

shareBtn?.addEventListener("click", async () => {
  const url = refLinkEl.value || "";
  if (!url) return;

  const text = "Join Uncensored Social early access — invite friends and earn rewards.";

  try {
    if (navigator.share) {
      await navigator.share({ title: "Uncensored Social", text, url });
    } else {
      const ok = await copyToClipboard(url);
      alert(ok ? "Link copied!" : "Could not copy. Long-press the link to copy.");
    }
  } catch {}
});

/* ============================================================
   DATA
============================================================ */
async function ensureMyLead(){
  // Try RPC first (recommended)
  const pendingRef = (localStorage.getItem("pending_ref") || "").trim() || null;

  let rpcOk = false;
  try{
    const { data, error } = await supabaseClient.rpc("create_my_lead", {
      p_referred_by: pendingRef
    });

    if (!error && data && data[0] && data[0].ref_code){
      myLead = data[0];
      rpcOk = true;
    }
  } catch {
    rpcOk = false;
  }

  // If RPC not present / failed: fallback to manual insert/select
  if (!rpcOk){
    const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr) throw new Error(userErr.message);
    const user = userData?.user;
    if (!user) throw new Error("Not logged in.");

    // Check existing row for this user
    let { data: existing, error: selErr } = await supabaseClient
      .from("waitlist_leads")
      .select("id,user_id,email,ref_code,referred_by,ref_count,created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!selErr && existing){
      myLead = existing;
    } else {
      // Create one
      const referredBy = pendingRef || null;
      const newRef = randomRefCode(6);

      const { data: ins, error: insErr } = await supabaseClient
        .from("waitlist_leads")
        .insert({
          user_id: user.id,
          email: user.email,
          ref_code: newRef,
          referred_by: referredBy,
          ref_count: 0
        })
        .select("id,user_id,email,ref_code,referred_by,ref_count,created_at")
        .single();

      if (insErr) throw new Error(insErr.message);
      myLead = ins;
    }
  }

  if (pendingRef) localStorage.removeItem("pending_ref");

  if (!myLead || !myLead.ref_code){
    throw new Error("Lead row missing.");
  }

  // REAL stable referral link
  refLinkEl.value = makeRefUrl(myLead.ref_code);

  setTierUI(Number(myLead.ref_count || 0));
}

async function loadLeaderboard(){
  const { data, error } = await supabaseClient
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
  // pull my row again (by user_id if we have it)
  if (!myLead?.user_id){
    return;
  }

  const { data, error } = await supabaseClient
    .from("waitlist_leads")
    .select("ref_count, ref_code, email, user_id")
    .eq("user_id", myLead.user_id)
    .maybeSingle();

  if (!error && data){
    myLead.ref_count = Number(data.ref_count || 0);
    myLead.ref_code = data.ref_code;
    setTierUI(myLead.ref_count);
    refLinkEl.value = makeRefUrl(myLead.ref_code);
  }
}

async function loadMyReservedUsername(){
  if (!myLead?.user_id) return;

  const { data, error } = await supabaseClient
    .from("reserved_usernames")
    .select("username")
    .eq("owner_user_id", myLead.user_id)
    .maybeSingle();

  if (!error && data?.username){
    showReserved(data.username);
  } else {
    if (reservedBox) reservedBox.classList.add("hidden");
    usernameInput.disabled = !(Number(myLead.ref_count || 0) >= 25);
    reserveBtn.disabled = !(Number(myLead.ref_count || 0) >= 25);
  }
}

/* ============================================================
   RESERVE USERNAME (NO more "lead row missing")
============================================================ */
reserveBtn?.addEventListener("click", async () => {
  // Must have myLead loaded
  if (!myLead){
    setStatus(reserveStatus, "Loading your account… try again in a second.");
    return;
  }

  // Gate at 25
  const count = Number(myLead.ref_count || 0);
  if (count < 25){
    setStatus(reserveStatus, "You can’t reserve a username yet — get 25 invites to unlock.");
    return;
  }

  const username = (usernameInput.value || "").toLowerCase().trim();

  if (!username){
    setStatus(reserveStatus, "Enter a username.");
    return;
  }

  // rule check
  if (!/^[a-z0-9_]{3,20}$/.test(username)){
    setStatus(reserveStatus, "Invalid username. Use 3–20 chars: a–z, 0–9, underscore.");
    return;
  }

  setStatus(reserveStatus, "Reserving…");

  // Prefer RPC if you have it
  try{
    const { data, error } = await supabaseClient.rpc("reserve_username", { p_username: username });
    if (error){
      setStatus(reserveStatus, `Error: ${error.message}`);
      return;
    }
    const reserved = data?.[0]?.username || username;
    showReserved(reserved);
    return;
  } catch {
    // fallback to direct insert
  }

  // Fallback insert
  const { error: insErr } = await supabaseClient
    .from("reserved_usernames")
    .insert({
      username,
      owner_user_id: myLead.user_id,
      owner_email: myLead.email
    });

  if (insErr){
    setStatus(reserveStatus, `Error: ${insErr.message}`);
    return;
  }

  showReserved(username);
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

  authCard.classList.add("hidden");
  dash.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");

  await ensureMyLead();

  // if they came from a ref link, clean it so it doesn't keep re-setting localStorage
  cleanRefFromUrl();

  await loadLeaderboard();
  await loadInvited();
  await refreshMyCount();
  await loadMyReservedUsername();

  subscribeRealtime();
}

boot();
