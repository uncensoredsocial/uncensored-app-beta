import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  "https://YOUR_PROJECT.supabase.co",
  "PUBLIC_ANON_KEY"
);

// get ref code from localStorage
const refCode = localStorage.getItem("ref_code");
if (!refCode) location.href = "/";

const refLink = `${location.origin}/?ref=${refCode}`;
document.getElementById("refLink").value = refLink;

// copy/share
copyBtn.onclick = () => {
  navigator.clipboard.writeText(refLink);
  alert("Copied!");
};

shareBtn.onclick = async () => {
  if (navigator.share) {
    await navigator.share({
      title: "Uncensored Social",
      text: "Join early access — earn rewards",
      url: refLink
    });
  }
};

// load stats
(async () => {
  const { data } = await supabase
    .from("waitlist_leads")
    .select("ref_count,email")
    .eq("ref_code", refCode)
    .single();

  const count = data.ref_count;
  const percent = Math.min((count / 25) * 100, 100);

  progressFill.style.width = percent + "%";
  progressText.textContent = `${count} invites`;

  if (count >= 25) {
    usernameBox.classList.remove("hidden");
  }
})();

// reserve username
reserveBtn.onclick = async () => {
  const username = usernameInput.value.toLowerCase().trim();
  if (!username) return;

  const { error } = await supabase
    .from("reserved_usernames")
    .insert({
      username,
      owner_email: localStorage.getItem("email")
    });

  reserveStatus.textContent = error
    ? "Username already taken"
    : "Username reserved ✔";
};
