/* ============================================================
   CONFIG
============================================================ */
const cfg = window.LAUNCH_CONFIG || {};

// You can set these in launch-config.js
// cfg.LAUNCH_DATE_ISO = "2026-02-28T20:00:00Z" (recommended)
// cfg.LAUNCH_DATE_TEXT = "Feb 28, 2026 — 12:00 PM PST" (display label)
const LAUNCH_DATE_TEXT = cfg.LAUNCH_DATE_TEXT || "Launching soon";
const LAUNCH_DATE_ISO = cfg.LAUNCH_DATE_ISO || "2026-02-28T20:00:00Z"; // default: Feb 28 2026 12pm PST-ish

/* ============================================================
   DOM
============================================================ */
const dd = document.getElementById("dd");
const hh = document.getElementById("hh");
const mm = document.getElementById("mm");
const ss = document.getElementById("ss");

const launchDateTextEl = document.getElementById("launchDateText");
const countdownNote = document.getElementById("countdownNote");

const signedInAs = document.getElementById("signedInAs");
const accessStatus = document.getElementById("accessStatus");
const authHint = document.getElementById("authHint");

const logoutBtn = document.getElementById("logoutBtn");
const settingsLogoutBtn = document.getElementById("settingsLogoutBtn");

/* ============================================================
   SUPABASE
============================================================ */
const SUPABASE_URL = cfg.SUPABASE_URL || "https://hbbbsreonwhvqfvbszne.supabase.co";
const SUPABASE_ANON = cfg.SUPABASE_ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ============================================================
   COUNTDOWN
============================================================ */
function pad2(n){ return String(n).padStart(2, "0"); }

function updateCountdown(){
  const target = new Date(LAUNCH_DATE_ISO).getTime();
  const now = Date.now();
  let diff = target - now;

  if (launchDateTextEl) launchDateTextEl.textContent = LAUNCH_DATE_TEXT;

  if (Number.isNaN(target)){
    dd.textContent = "--";
    hh.textContent = "--";
    mm.textContent = "--";
    ss.textContent = "--";
    if (countdownNote) countdownNote.textContent = "Launch date is not configured correctly.";
    return;
  }

  if (diff <= 0){
    dd.textContent = "00";
    hh.textContent = "00";
    mm.textContent = "00";
    ss.textContent = "00";
    if (countdownNote) countdownNote.textContent = "We’re live! Refresh the app.";
    if (accessStatus) accessStatus.textContent = "Launch Available";
    return;
  }

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  dd.textContent = pad2(days);
  hh.textContent = pad2(hours);
  mm.textContent = pad2(mins);
  ss.textContent = pad2(secs);

  if (countdownNote){
    countdownNote.textContent = "Until launch, you can earn rewards by inviting friends.";
  }
}

setInterval(updateCountdown, 1000);
updateCountdown();

/* ============================================================
   AUTH STATUS + LOGOUT
============================================================ */
async function refreshAuth(){
  try{
    const { data } = await supabaseClient.auth.getSession();
    const session = data?.session;

    if (!session){
      signedInAs.textContent = "Not signed in";
      if (logoutBtn) logoutBtn.classList.add("hidden");
      if (authHint){
        authHint.textContent = "Tip: Log in to access your Referral Dashboard and reserve your username.";
      }
      return;
    }

    const email = session.user?.email || "Signed in";
    signedInAs.textContent = email;

    if (logoutBtn) logoutBtn.classList.remove("hidden");
    if (authHint){
      authHint.textContent = "You’re signed in. Use Referrals to earn rewards while we finish the platform.";
    }

    // Always show prelaunch access on this page
    if (accessStatus) accessStatus.textContent = "Pre-Launch Only";
  } catch {
    signedInAs.textContent = "Not signed in";
  }
}

async function doLogout(){
  try{ await supabaseClient.auth.signOut(); } catch {}
  location.reload();
}

logoutBtn?.addEventListener("click", doLogout);
settingsLogoutBtn?.addEventListener("click", (e) => { e.preventDefault(); doLogout(); });

refreshAuth();
