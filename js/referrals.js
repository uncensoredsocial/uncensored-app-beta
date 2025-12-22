import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ✅ put your values
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON = "YOUR_PUBLIC_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// DOM
const authCard = document.getElementById("authCard");
const dash = document.getElementById("dash");
const logoutBtn = document.getElementById("logoutBtn");
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

let myLead = null;
let myInvitedSub = null;
let leaderboardSub = null;

const TIERS = [
  { n: 3, label: "Early Access Priority" },
  { n: 10, label: "Founder Badge" },
  { n: 25, label: "Username Reservation" },
  { n: 100, label: "Lifetime Verified" },
];

function nextTier(count){
  for (const t of TIERS) if (count < t.n) return t;
  return null;
}

function setTierUI(count){
  const pct = Math.min((count / 25) * 100, 100);
  progressFill.style.width = pct + "%";
  refCountPill.textContent = `${count} invites`;

  const next = nextTier(count);
  if (!next) tierText.textContent = `You’ve unlocked all tiers.`;
  else {
    const remaining = next.n - count;
    tierText.textContent = `You’re ${remaining} invite${remaining === 1 ? "" : "s"} away from: ${next.label}`;
  }
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function renderRows(container, rows, type){
  if (!rows || rows.length === 0){
    container.innerHTML = `<div class="rowItem"><div class="left"><div>No data yet</div><div class="muted small">Share your link to start</div></div><div class="right"></div></div>`;
    return;
  }

  container.innerHTML = rows.map((r, i) => {
    if (type === "leaderboard"){
      return `
        <div class="rowItem">
          <div class="left">
            <div>#${i+1} — ${escapeHtml(r.email_masked)}</div>
            <div class="muted small">ref: ${escapeHtml(r.ref_code)}</div>
          </div>
          <div class="right">${r.ref_count}</div>
        </div>
      `;
    }

    // invited list (private): show full email ONLY to the referrer (RLS enforces)
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

// Tabs
tabSignup.onclick = () => {
  tabSignup.classList.add("active");
  tabLogin.classList.remove("active");
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  authStatus.textContent = "";
};

tabLogin.onclick = () => {
  tabLogin.classList.add("active");
  tabSignup.classList.remove("active");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  authStatus.textContent = "";
};

// Auth
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authStatus.textContent = "Creating account…";

  const email = signupEmail.value.trim();
  const password = signupPass.value;

  const { error } = await supabase.auth.signUp({ email, password });

  authStatus.textContent = error
    ? `Error: ${error.message}`
    : "Account created. You can log in now.";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authStatus.textContent = "Logging in…";

  const email = loginEmail.value.trim();
  const password = loginPass.value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  authStatus.textContent = error ? `Error: ${error.message}` : "";
  if (!error) boot();
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

// Share/copy
copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(refLinkEl.value);
  alert("Copied!");
});

shareBtn.addEventListener("click", async () => {
  const url = refLinkEl.value;
  const text = "Join Uncensored Social early access — invite friends and earn rewards.";
  try {
    if (navigator.share) await navigator.share({ title: document.title, text, url });
    else { await navigator.clipboard.writeText(url); alert("Link copied!"); }
  } catch {}
});

// Load data
async function loadMyLead(){
  // link lead row to auth user email if not linked yet
  await supabase.rpc("link_my_lead");

  const { data, error } = await supabase
    .from("waitlist_leads")
    .select("email, ref_code, ref_count")
    .single();

  if (error) throw error;
  myLead = data;

  const link = `${location.origin}/?ref=${myLead.ref_code}`;
  refLinkEl.value = link;

  setTierUI(myLead.ref_count ?? 0);
}

async function loadLeaderboard(){
  const { data } = await supabase
    .from("leaderboard")
    .select("ref_code, ref_count, email_masked")
    .limit(25);

  renderRows(leaderboardEl, data, "leaderboard");
}

async function loadInvitedList(){
  const { data } = await supabase
    .from("waitlist_leads")
    .select("email, created_at")
    .eq("referred_by", myLead.ref_code)
    .order("created_at", { ascending: false })
    .limit(200);

  renderRows(invitedListEl, data, "invited");
}

function subscribeLive(){
  if (myInvitedSub) supabase.removeChannel(myInvitedSub);
  if (leaderboardSub) supabase.removeChannel(leaderboardSub);

  myInvitedSub = supabase.channel("invited-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "waitlist_leads" }, (payload) => {
      const row = payload.new;
      if (row?.referred_by === myLead.ref_code) loadInvitedList();
    })
    .subscribe();

  leaderboardSub = supabase.channel("leaderboard-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "waitlist_leads" }, async () => {
      await loadLeaderboard();
      // refresh my count
      const { data } = await supabase.from("waitlist_leads").select("ref_count").single();
      if (data) setTierUI(data.ref_count ?? 0);
    })
    .subscribe();
}

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

  await loadMyLead();
  await loadLeaderboard();
  await loadInvitedList();
  subscribeLive();
}

boot();
