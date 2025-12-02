// js/messages.js
/* ============================================================
   MESSAGES PAGE
   ------------------------------------------------------------
   - DOES NOT REDIRECT TO LOGIN
   - If NOT logged in  -> shows guest message section
   - If logged in      -> shows conversations + chat UI
   - Uses helpers from auth.js:
       isLoggedIn(), getCurrentUser(), getAuthToken()
   - Backend (same as before – adjust URLs only if yours differ):
       GET  /api/messages/conversations
       GET  /api/messages/:conversationId/messages
       POST /api/messages/:conversationId/messages
       POST /api/messages/start   { recipientId }
 ============================================================ */

const MESSAGES_API_BASE_URL =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : "https://uncensored-app-beta-production.up.railway.app/api";

/* ------------------------- AUTH HELPERS ------------------------- */

function isLoggedInSafe() {
  try {
    return typeof isLoggedIn === "function" ? isLoggedIn() : false;
  } catch {
    return false;
  }
}

function getCurrentUserSafe() {
  try {
    return typeof getCurrentUser === "function" ? getCurrentUser() : null;
  } catch {
    return null;
  }
}

function getAuthTokenSafe() {
  try {
    return typeof getAuthToken === "function" ? getAuthToken() : null;
  } catch {
    return null;
  }
}

/* ------------------------- PAGE STATE ------------------------- */

const messagesState = {
  conversations: [],
  activeConversationId: null,
  activePartner: null,
  loadingConversations: false,
  loadingMessages: false,
};

/* -------------------------- DOM CACHE -------------------------- */

const dom = {};

function cacheDom() {
  dom.guestSection = document.getElementById("messagesGuestMessage");
  dom.layout = document.getElementById("messagesLayout");

  dom.conversationList = document.getElementById("conversationList");
  dom.conversationsLoading = document.getElementById("conversationsLoading");
  dom.conversationsEmpty = document.getElementById("conversationsEmpty");
  dom.conversationSearch = document.getElementById("conversationSearch");

  dom.chatHeaderUser = document.getElementById("chatHeaderUser");
  dom.chatHeaderAvatar = document.getElementById("chatHeaderAvatar");
  dom.chatHeaderName = document.getElementById("chatHeaderName");
  dom.chatHeaderUsername = document.getElementById("chatHeaderUsername");
  dom.chatHeaderStatus = document.getElementById("chatHeaderStatus");
  dom.chatEncryptedPill = document.getElementById("chatEncryptedPill");

  dom.chatBody = document.getElementById("chatBody");
  dom.chatPlaceholder = document.getElementById("chatPlaceholder");
  dom.messageList = document.getElementById("messageList");
  dom.messagesLoading = document.getElementById("messagesLoading");

  dom.chatComposer = document.getElementById("chatComposer");
  dom.messageInput = document.getElementById("messageInput");
  dom.messageCharCounter = document.getElementById("messageCharCounter");
  dom.sendMessageButton = document.getElementById("sendMessageButton");
}

/* -------------------------- INIT PAGE -------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  initMessagesPage();
});

async function initMessagesPage() {
  const loggedIn = isLoggedInSafe();

  if (!loggedIn) {
    // NOT LOGGED IN -> stay on page, just show guest message UI
    if (dom.guestSection) dom.guestSection.style.display = "flex";
    if (dom.layout) dom.layout.style.display = "none";
    return;
  }

  // LOGGED IN -> show full messages UI
  if (dom.guestSection) dom.guestSection.style.display = "none";
  if (dom.layout) dom.layout.style.display = "grid"; // two-panel layout

  setupComposer();
  setupSearch();
  showNoConversationSelected();

  await loadConversations();

  // If profile/user page sent ?userId=... or ?to=... open / create DM with that user
  const userIdFromUrl = getUserIdFromUrl();
  if (userIdFromUrl) {
    await openOrStartConversationWithUser(userIdFromUrl);
  }
}

/* -------------------------- URL PARAM -------------------------- */

function getUserIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    // SUPPORT BOTH: ?userId=<id> and ?to=<id>
    const id = params.get("userId") || params.get("to");
    return id ? id.trim() : null;
  } catch {
    return null;
  }
}

/* -------------------------- CONVERSATIONS -------------------------- */

async function loadConversations() {
  const token = getAuthTokenSafe();
  if (!token || !dom.conversationList) return;

  messagesState.loadingConversations = true;
  dom.conversationsLoading.style.display = "flex";
  dom.conversationsEmpty.style.display = "none";
  dom.conversationList.innerHTML = "";

  try {
    const res = await fetch(`${MESSAGES_API_BASE_URL}/messages/conversations`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json().catch(() => []);
    if (!res.ok) {
      throw new Error(data.error || "Failed to load conversations");
    }

    messagesState.conversations = Array.isArray(data) ? data : [];

    dom.conversationsLoading.style.display = "none";

    if (!messagesState.conversations.length) {
      dom.conversationsEmpty.style.display = "block";
      return;
    }

    renderConversationList(messagesState.conversations);
  } catch (err) {
    console.error("loadConversations error:", err);
    dom.conversationsLoading.style.display = "none";
    dom.conversationsEmpty.style.display = "block";
    dom.conversationsEmpty.textContent = "Could not load conversations.";
  } finally {
    messagesState.loadingConversations = false;
  }
}

function renderConversationList(list) {
  dom.conversationList.innerHTML = "";

  list.forEach((conv) => {
    const item = document.createElement("button");
    item.className = "conversation-item";
    item.type = "button";
    item.dataset.conversationId = conv.id;

    const partner = conv.partner || conv.other_user || {};
    const avatar = partner.avatar_url || "assets/icons/default-profile.png";
    const displayName =
      partner.display_name || partner.username || "Unknown user";
    const username = partner.username ? `@${partner.username}` : "";

    const lastMessage = conv.last_message || {};
    const lastSnippet = lastMessage.content || "";
    const time = lastMessage.created_at
      ? new Date(lastMessage.created_at).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      : "";

    item.innerHTML = `
      <div class="conversation-avatar-wrapper">
        <img
          src="${avatar}"
          class="conversation-avatar"
          alt="${escapeHtml(displayName)}"
          onerror="this.src='assets/icons/default-profile.png'"
        />
      </div>
      <div class="conversation-main">
        <div class="conversation-top-row">
          <span class="conversation-name">${escapeHtml(displayName)}</span>
          <span class="conversation-time">${escapeHtml(time)}</span>
        </div>
        <div class="conversation-bottom-row">
          <span class="conversation-username">${escapeHtml(username)}</span>
          <span class="conversation-snippet">${escapeHtml(lastSnippet)}</span>
        </div>
      </div>
    `;

    item.addEventListener("click", () => {
      messagesState.activeConversationId = conv.id;
      messagesState.activePartner = partner;
      highlightActiveConversation(conv.id);
      updateChatHeaderForPartner(partner);
      showComposerEnabled();
      loadMessages(conv.id);
    });

    dom.conversationList.appendChild(item);
  });
}

function highlightActiveConversation(id) {
  const buttons = dom.conversationList.querySelectorAll(".conversation-item");
  buttons.forEach((btn) => {
    if (btn.dataset.conversationId === String(id)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

/* ------------------------- OPEN BY USER ID ------------------------- */

async function openOrStartConversationWithUser(userId) {
  const token = getAuthTokenSafe();
  if (!token) return;

  // 1) Check if a conversation already exists with this user
  const existing = messagesState.conversations.find(
    (c) =>
      c.partner?.id === userId ||
      c.other_user?.id === userId ||
      String(c.partner_id) === String(userId)
  );

  if (existing) {
    messagesState.activeConversationId = existing.id;
    messagesState.activePartner = existing.partner || existing.other_user || {};
    highlightActiveConversation(existing.id);
    updateChatHeaderForPartner(messagesState.activePartner);
    showComposerEnabled();
    await loadMessages(existing.id);
    return;
  }

  // 2) Otherwise, ask backend to start conversation
  try {
    const res = await fetch(`${MESSAGES_API_BASE_URL}/messages/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ recipientId: userId }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not start conversation");
    }

    // Expect conversation object back
    const conv = data.conversation || data;
    if (!conv || !conv.id) return;

    messagesState.conversations.unshift(conv);
    renderConversationList(messagesState.conversations);

    messagesState.activeConversationId = conv.id;
    messagesState.activePartner = conv.partner || conv.other_user || {};
    highlightActiveConversation(conv.id);
    updateChatHeaderForPartner(messagesState.activePartner);
    showComposerEnabled();
    await loadMessages(conv.id);
  } catch (err) {
    console.error("openOrStartConversationWithUser error:", err);
  }
}

/* ----------------------------- MESSAGES ----------------------------- */

async function loadMessages(conversationId) {
  const token = getAuthTokenSafe();
  if (!token || !dom.messageList) return;

  messagesState.loadingMessages = true;
  dom.messageList.innerHTML = "";
  dom.messagesLoading.style.display = "flex";
  dom.chatPlaceholder.style.display = "none";

  try {
    const res = await fetch(
      `${MESSAGES_API_BASE_URL}/messages/${encodeURIComponent(
        conversationId
      )}/messages`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await res.json().catch(() => []);
    if (!res.ok) {
      throw new Error(data.error || "Failed to load messages");
    }

    const messages = Array.isArray(data) ? data : [];
    renderMessages(messages);
  } catch (err) {
    console.error("loadMessages error:", err);
    dom.messageList.innerHTML = `<div class="chat-error">Could not load messages.</div>`;
  } finally {
    dom.messagesLoading.style.display = "none";
    messagesState.loadingMessages = false;
    scrollMessagesToBottom();
  }
}

function renderMessages(messages) {
  dom.messageList.innerHTML = "";

  const currentUser = getCurrentUserSafe();
  const currentId = currentUser ? currentUser.id : null;

  messages.forEach((msg) => {
    const mine = currentId && String(msg.sender_id) === String(currentId);

    const bubble = document.createElement("div");
    bubble.className = mine ? "chat-message chat-message-out" : "chat-message";

    const time = msg.created_at
      ? new Date(msg.created_at).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      : "";

    bubble.innerHTML = `
      <div class="chat-bubble">
        <p>${escapeHtml(msg.content || "")}</p>
        <span class="chat-meta">${escapeHtml(time)}</span>
      </div>
    `;

    dom.messageList.appendChild(bubble);
  });
}

function scrollMessagesToBottom() {
  if (!dom.messageList) return;
  dom.messageList.scrollTop = dom.messageList.scrollHeight;
}

/* --------------------------- COMPOSER --------------------------- */

function setupComposer() {
  if (!dom.chatComposer || !dom.messageInput || !dom.sendMessageButton) return;

  // Initially disabled until a conversation is selected
  showComposerDisabled();

  dom.messageInput.addEventListener("input", () => {
    const val = dom.messageInput.value || "";
    dom.messageCharCounter.textContent = `${val.length}/1000`;
    if (val.trim().length > 0 && messagesState.activeConversationId) {
      dom.sendMessageButton.disabled = false;
    } else {
      dom.sendMessageButton.disabled = true;
    }
  });

  dom.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  dom.sendMessageButton.addEventListener("click", handleSendMessage);
}

function showComposerDisabled() {
  dom.chatComposer.classList.add("chat-composer-disabled");
  dom.messageInput.disabled = true;
  dom.messageInput.placeholder = "Select a conversation to start messaging.";
  dom.sendMessageButton.disabled = true;
}

function showComposerEnabled() {
  dom.chatComposer.classList.remove("chat-composer-disabled");
  dom.messageInput.disabled = false;
  dom.messageInput.placeholder = "Message";
  const val = dom.messageInput.value || "";
  dom.sendMessageButton.disabled = val.trim().length === 0;
}

async function handleSendMessage() {
  if (!messagesState.activeConversationId) return;

  const token = getAuthTokenSafe();
  if (!token) return;

  const text = (dom.messageInput.value || "").trim();
  if (!text) return;

  // optimistic append
  const now = new Date();
  const currentUser = getCurrentUserSafe();

  const tempMessage = {
    id: "tmp-" + now.getTime(),
    sender_id: currentUser ? currentUser.id : null,
    content: text,
    created_at: now.toISOString(),
  };

  const oldScroll = dom.messageList.scrollHeight;
  const wasAtBottom =
    dom.messageList.scrollTop + dom.messageList.clientHeight >= oldScroll - 5;

  const existingHtml = dom.messageList.innerHTML;
  renderMessages([tempMessage]); // or append; here we re-render only this
  dom.messageList.innerHTML = existingHtml + dom.messageList.innerHTML;

  if (wasAtBottom) scrollMessagesToBottom();

  dom.messageInput.value = "";
  dom.messageCharCounter.textContent = "0/1000";
  dom.sendMessageButton.disabled = true;

  try {
    const res = await fetch(
      `${MESSAGES_API_BASE_URL}/messages/${encodeURIComponent(
        messagesState.activeConversationId
      )}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: text }),
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not send message");
    }

    // reload messages to sync
    await loadMessages(messagesState.activeConversationId);
  } catch (err) {
    console.error("handleSendMessage error:", err);
    // show simple error in chat
    const errDiv = document.createElement("div");
    errDiv.className = "chat-error";
    errDiv.textContent = "Failed to send message.";
    dom.messageList.appendChild(errDiv);
    scrollMessagesToBottom();
  }
}

/* --------------------------- SEARCH --------------------------- */

function setupSearch() {
  if (!dom.conversationSearch) return;

  dom.conversationSearch.addEventListener("input", () => {
    const q = dom.conversationSearch.value.toLowerCase().trim();
    if (!q) {
      renderConversationList(messagesState.conversations);
      return;
    }

    const filtered = messagesState.conversations.filter((c) => {
      const p = c.partner || c.other_user || {};
      const name = (p.display_name || p.username || "").toLowerCase();
      const username = (p.username || "").toLowerCase();
      return name.includes(q) || username.includes(q);
    });

    renderConversationList(filtered);
  });
}

/* ------------------------ CHAT HEADER STATES ------------------------ */

function showNoConversationSelected() {
  if (dom.chatPlaceholder) dom.chatPlaceholder.style.display = "block";
  if (dom.messageList) dom.messageList.innerHTML = "";
  if (dom.messagesLoading) dom.messagesLoading.style.display = "none";

  if (dom.chatHeaderAvatar) {
    dom.chatHeaderAvatar.src = "assets/icons/default-profile.png";
  }
  if (dom.chatHeaderName) {
    dom.chatHeaderName.textContent = "Select a conversation";
  }
  if (dom.chatHeaderUsername) {
    dom.chatHeaderUsername.textContent = "";
  }

  if (dom.chatHeaderStatus) {
    dom.chatHeaderStatus.innerHTML =
      '<span class="chat-encrypted-note">🔒 All messages are end-to-end encrypted. Only you and the other person can read them.</span>';
  }
  showComposerDisabled();
}

function updateChatHeaderForPartner(partner) {
  if (!partner) return;

  if (dom.chatPlaceholder) dom.chatPlaceholder.style.display = "none";

  if (dom.chatHeaderAvatar) {
    dom.chatHeaderAvatar.src =
      partner.avatar_url || "assets/icons/default-profile.png";
    dom.chatHeaderAvatar.onerror = () => {
      dom.chatHeaderAvatar.src = "assets/icons/default-profile.png";
    };
  }

  if (dom.chatHeaderName) {
    dom.chatHeaderName.textContent =
      partner.display_name || partner.username || "User";
  }

  if (dom.chatHeaderUsername) {
    dom.chatHeaderUsername.textContent = partner.username
      ? `@${partner.username}`
      : "";
  }

  if (dom.chatHeaderStatus) {
    dom.chatHeaderStatus.innerHTML =
      '<span class="chat-encrypted-note">🔒 Encrypted chat · Only you and this user can read these messages.</span>';
  }
}

/* ------------------------ UTILS ------------------------ */

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => {
    switch (m) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return m;
    }
  });
}
