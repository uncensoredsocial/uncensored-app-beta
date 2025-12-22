import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ✅ put your values
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON = "YOUR_PUBLIC_ANON_KEY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// DOM
const loginCard = document.getElementById("loginCard");
const dash = document.getElementById("dash");
const logoutBtn = document.getElementById("logoutBtn");

const loginEmail = document.getElementById("loginEmail");
const sendLinkBtn = document.getElementById("sendLinkBtn");
const loginStatus = document.getElementById("loginStatus");

const refLinkEl = document.getElementById("refLink");
const copyBtn = document.getElementById("copyBtn");
const shareBtn = document.getElementById("shareBtn");

const progressFill = document.getElementById("progressFill");
const refCountPill = document.getElementById("refCountPill");
const tierText = document.getElementById("tierText");

const leaderboardEl = document.getElementById("leaderboard");
const invitedListEl = document.getElementById("invitedList");

// State
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
  for (const t of TIERS){
    if (count < t.n) return t;
  }
  return null;
}

function setTierUI(count){
  const next = nextTier(count);
  const pct = Math.min((count / 25) * 100, 100);
  progressFill.style.width = pct + "%";
  refCountPill.textContent = `${count} invites`;

  if (!next){
    tierText.textContent = `You’ve unlocked all tiers.`;
  } else {
    const remaining = next.n - count;
    tierText.textContent = `You’re ${remaining} invite${remaining === 1 ? "" : "s"} away from: ${next.label}`;
  }
}

function renderRows(container, rows, type){
  if (!rows || rows.length === 0){
    container.innerHTML = `<div class="rowItem"><div class="left"><div>No data yet</div><div class="muted small">Share your link to start climbing</div></div><div class="right"></div></div>`;
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

    // invited list (private) — show full email to owner
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

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// LOGIN (magic link)
sendLinkBtn.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  if (!email) return;

  loginStatus.textContent = "Sending magic link…";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: location.origin + "/referrals.html"
    }
  });

  loginStatus.textContent = error
    ? `Error: ${error.message}`
    : "Check your email and open the magic link to log in.";
});

// logout
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

// share/copy
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

async function loadMyLeadAndLink(){
  // Link existing waitlist lead row to this auth user (email match)
  await supabase.rpc("link_my_lead");

  // Now fetch my lead
  const { data, error } = await supabase
    .from("waitlist_leads")
    .select("email, ref_code, ref_count")
    .single();

  if (error) throw error;
  myLead = data;

  // referral link
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
  // rows where referred_by == my ref_code
  const { data } = await supabase
    .from("waitlist_leads")
    .select("email, created_at")
    .eq("referred_by", myLead.ref_code)
    .order("created_at", { ascending: false })
    .limit(200);

  renderRows(invitedListEl, data, "invited");
}

function subscribeLive(){
  // unsubscribe existing
  if (myInvitedSub) supabase.removeChannel(myInvitedSub);
  if (leaderboardSub) supabase.removeChannel(leaderboardSub);

  // LIVE updates for invited list (new inserts that match your code)
  myInvitedSub = supabase.channel("invited-live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "waitlist_leads" },
      (payload) => {
        const row = payload.new;
        if (row?.referred_by === myLead.ref_code){
          // update UI instantly + re-fetch
          loadInvitedList();
        }
      }
    )
    .subscribe();

  // LIVE updates for leaderboard / ref_count changes
  leaderboardSub = supabase.channel("leaderboard-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "waitlist_leads" },
      () => {
        loadLeaderboard();
        // also refresh my ref_count if it changed
        refreshMyRefCount();
      }
    )
    .subscribe();
}

async function refreshMyRefCount(){
  const { data } = await supabase
    .from("waitlist_leads")
    .select("ref_count")
    .single();

  if (!data) return;
  myLead.ref_count = data.ref_count ?? 0;
  setTierUI(myLead.ref_count);
}

async function boot(){
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session){
    // show login
    loginCard.classList.remove("hidden");
    dash.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    return;
  }

  // show dashboard
  loginCard.classList.add("hidden");
  dash.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");

  await loadMyLeadAndLink();
  await loadLeaderboard();
  await loadInvitedList();
  subscribeLive();
}

boot();
