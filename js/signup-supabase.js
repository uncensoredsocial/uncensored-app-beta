// js/signup-supabase.js

const SUPABASE_URL = "https://hbbbsreonwhvqfvbszne.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MzQ1NjMsImV4cCI6MjA4MDc5NDU2M30.SCZHntv9gPaDGJBib3ubUKuVvZKT2-BXc8QtadjX1DA";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const cfg = window.__UNCENSORED_LAUNCH__ || {};
const prelaunchPage = cfg.prelaunchPage || "prelaunch.html";

const signupForm = document.getElementById("signupForm");
const signupBtn = document.getElementById("signupBtn");

const displayNameEl = document.getElementById("displayName");
const usernameEl = document.getElementById("username");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const pass2El = document.getElementById("confirmPassword");
const agreeEl = document.getElementById("agree");

const errorEl = document.getElementById("errorMessage");
const successEl = document.getElementById("successMessage");

function showErr(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
  successEl.classList.add("hidden");
}
function showOk(msg) {
  successEl.textContent = msg;
  successEl.classList.remove("hidden");
  errorEl.classList.add("hidden");
}
function clearMsgs() {
  errorEl.textContent = "";
  successEl.textContent = "";
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");
}

function cleanUsername(v) {
  return String(v || "")
    .toLowerCase()
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "");
}

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMsgs();

  const displayName = (displayNameEl?.value || "").trim();
  const username = cleanUsername(usernameEl?.value || "");
  const email = (emailEl?.value || "").trim().toLowerCase();
  const password = passEl?.value || "";
  const confirmPassword = pass2El?.value || "";
  const agree = !!agreeEl?.checked;

  if (!displayName || !username || !email || !password || !confirmPassword) {
    showErr("Please fill out all fields.");
    return;
  }
  if (password.length < 6) {
    showErr("Password must be at least 6 characters.");
    return;
  }
  if (password !== confirmPassword) {
    showErr("Passwords do not match.");
    return;
  }
  if (!agree) {
    showErr("You must agree to the Privacy Policy and Terms.");
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = "Creating…";

  try {
    // 1) Create Supabase Auth user (REAL account)
    const { error: signUpErr } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          requested_username: username
        }
      }
    });

    if (signUpErr) {
      showErr(signUpErr.message || "Signup failed.");
      return;
    }

    // 2) Immediately sign in (works only if Confirm Email is OFF)
    const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
    if (signInErr) {
      showErr(signInErr.message || "Account created, but login failed.");
      return;
    }

    // 3) Update profile fields in public.users (created by your trigger)
    // If your trigger sets username/display_name from email prefix, we overwrite to match the form.
    await sb
      .from("users")
      .update({ username, display_name: displayName })
      .eq("id", (await sb.auth.getUser()).data.user.id);

    showOk("Account created. The platform isn’t live yet — redirecting…");
    setTimeout(() => window.location.replace(prelaunchPage), 600);
  } catch (err) {
    showErr(err?.message || "Load failed");
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = "Create Account";
  }
});
