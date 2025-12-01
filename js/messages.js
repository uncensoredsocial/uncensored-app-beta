// js/messages.js

// ===== CONSTANTS =====
const LOGIN_URL = 'login.html'; // GitHub Pages -> /uncensored-app-beta/login.html

// ===== STATE =====
let currentUser = null;          // only used for own-message check
let authToken = null;            // token if you want; optional
let threads = [];
let activeThreadId = null;
let activeRecipient = null;
let messagePollIntervalId = null;

// cache of CryptoKey objects per thread
const threadKeyCache = new Map();

// ===== DOM ELEMENTS =====
const conversationSearchEl = document.getElementById('conversationSearch');
const conversationListEl = document.getElementById('conversationList');
const conversationsLoadingEl = document.getElementById('conversationsLoading');
const conversationsEmptyEl = document.getElementById('conversationsEmpty');

const chatHeaderAvatarEl = document.getElementById('chatHeaderAvatar');
const chatHeaderNameEl = document.getElementById('chatHeaderName');
const chatHeaderUsernameEl = document.getElementById('chatHeaderUsername');
const chatEncryptedPillEl = document.getElementById('chatEncryptedPill');

const chatPlaceholderEl = document.getElementById('chatPlaceholder');
const messageListEl = document.getElementById('messageList');
const messagesLoadingEl = document.getElementById('messagesLoading');

const messageInputEl = document.getElementById('messageInput');
const messageCharCounterEl = document.getElementById('messageCharCounter');
const sendMessageButtonEl = document.getElementById('sendMessageButton');

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // pull auth info if present (same keys as rest of app)
  try {
    const stored = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (stored) currentUser = JSON.parse(stored);
    if (token) authToken = token;
  } catch (err) {
    console.warn('Could not parse user/token from localStorage', err);
  }

  setupEventListeners();
  loadThreads();
  autoOpenThreadFromQuery();
});

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  if (messageInputEl) {
    messageInputEl.addEventListener('input', () => {
      const text = messageInputEl.value || '';
      const length = text.length;

      if (messageCharCounterEl) {
        messageCharCounterEl.textContent = `${length}/1000`;
      }
      if (sendMessageButtonEl) {
        sendMessageButtonEl.disabled = text.trim().length === 0;
      }
      autoGrowTextarea(messageInputEl);
    });
  }

  if (sendMessageButtonEl) {
    sendMessageButtonEl.addEventListener('click', async () => {
      await handleSendMessage();
    });
  }

  if (conversationSearchEl) {
    conversationSearchEl.addEventListener('input', () => {
      renderThreads();
    });
  }
}

// auto-resize textarea
function autoGrowTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
}

// ===== API HELPERS =====
async function apiGet(path) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(path, { headers });

  if (res.status === 401) {
    window.location.href = LOGIN_URL;
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (res.status === 401) {
    window.location.href = LOGIN_URL;
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ===== THREADS / CONVERSATIONS =====
async function loadThreads() {
  if (!conversationListEl) return;

  conversationsLoadingEl.style.display = 'flex';
  conversationsEmptyEl.style.display = 'none';
  conversationListEl.innerHTML = '';

  try {
    const data = await apiGet('/api/messages/threads');
    threads = data.threads || [];
    renderThreads();
  } catch (err) {
    console.error('Failed to load threads', err);
    conversationListEl.innerHTML = `
      <div class="conversations-empty">
        Could not load conversations.
      </div>
    `;
  } finally {
    conversationsLoadingEl.style.display = 'none';
  }
}

function renderThreads() {
  if (!conversationListEl) return;

  conversationListEl.innerHTML = '';

  if (!threads || threads.length === 0) {
    conversationsEmptyEl.style.display = 'block';
    return;
  } else {
    conversationsEmptyEl.style.display = 'none';
  }

  const term = (conversationSearchEl?.value || '').toLowerCase().trim();

  const sorted = [...threads]
    .filter(t => {
      if (!term) return true;
      const name = (t.recipient?.display_name || '').toLowerCase();
      const username = (t.recipient?.username || '').toLowerCase();
      const preview = (t.last_message?.plaintext_preview || '').toLowerCase();
      return (
        name.includes(term) ||
        username.includes(term) ||
        preview.includes(term)
      );
    })
    .sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });

  sorted.forEach(thread => {
    const item = document.createElement('div');
    item.className = 'conversation-item';
    if (thread.id === activeThreadId) item.classList.add('active');
    item.dataset.threadId = thread.id;
    item.dataset.recipientId = thread.recipient?.id || '';

    const initials = (thread.recipient?.display_name || thread.recipient?.username || '?')
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const avatarUrl = thread.recipient?.avatar_url || '';

    item.innerHTML = `
      <div class="conversation-avatar">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="">` : initials}
      </div>
      <div class="conversation-main">
        <div class="conversation-top-row">
          <div class="conversation-name">${escapeHtml(thread.recipient?.display_name || thread.recipient?.username || 'User')}</div>
          <div class="conversation-time">${formatRelativeTime(thread.updated_at || thread.created_at)}</div>
        </div>
        <div class="conversation-username">@${escapeHtml(thread.recipient?.username || 'user')}</div>
        <div class="conversation-top-row">
          <div class="conversation-last-message">
            ${escapeHtml(thread.last_message?.plaintext_preview || '')}
          </div>
          ${thread.unread_count > 0 ? '<div class="conversation-unread-dot"></div>' : ''}
        </div>
      </div>
    `;

    item.addEventListener('click', () => {
      onConversationClick(thread);
    });

    conversationListEl.appendChild(item);
  });
}

function onConversationClick(thread) {
  activeThreadId = thread.id;
  activeRecipient = thread.recipient || null;

  renderThreads();
  openChatHeader();
  loadMessagesForActiveThread();
}

// If we come from profile like messages.html?userId=ABC
async function autoOpenThreadFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('userId');
  if (!userId) return;

  try {
    const data = await apiPost('/api/messages/start', { recipientId: userId });
    const t = data.thread;
    if (!threads.find(th => th.id === t.id)) {
      threads.push(t);
    }
    renderThreads();
    onConversationClick(t);
  } catch (err) {
    console.error('Failed to start/open thread from query', err);
  }
}

// ===== CHAT HEADER / MESSAGES =====
function openChatHeader() {
  if (!activeRecipient) return;

  if (chatHeaderAvatarEl) {
    chatHeaderAvatarEl.src = activeRecipient.avatar_url || 'assets/icons/default-profile.png';
  }
  if (chatHeaderNameEl) {
    chatHeaderNameEl.textContent = activeRecipient.display_name || activeRecipient.username || 'User';
  }
  if (chatHeaderUsernameEl) {
    chatHeaderUsernameEl.textContent = `@${activeRecipient.username || 'user'}`;
  }
  if (chatEncryptedPillEl) {
    chatEncryptedPillEl.style.display = 'inline-flex';
  }
}

async function loadMessagesForActiveThread() {
  if (!activeThreadId) return;

  if (messagePollIntervalId) {
    clearInterval(messagePollIntervalId);
    messagePollIntervalId = null;
  }

  await fetchAndRenderMessages();
  messagePollIntervalId = setInterval(fetchAndRenderMessages, 5000);
}

async function fetchAndRenderMessages() {
  if (!activeThreadId) return;
  if (!messageListEl) return;

  messagesLoadingEl.style.display = 'flex';

  try {
    const data = await apiGet(`/api/messages/threads/${activeThreadId}`);
    const messages = data.messages || [];

    messageListEl.innerHTML = '';

    if (chatPlaceholderEl) chatPlaceholderEl.style.display = 'none';

    messageListEl.appendChild(
      systemMessageEl('Messages in this chat are end-to-end encrypted with a shared passphrase (saved only in your browser).')
    );

    for (const msg of messages) {
      const row = await createMessageRow(msg);
      messageListEl.appendChild(row);
    }

    messageListEl.scrollTop = messageListEl.scrollHeight;
  } catch (err) {
    console.error('Failed to load messages', err);
    messageListEl.innerHTML = '';
    messageListEl.appendChild(systemMessageEl('Could not load messages.'));
  } finally {
    messagesLoadingEl.style.display = 'none';
  }
}

// ===== SENDING MESSAGES =====
async function handleSendMessage() {
  if (!activeThreadId || !activeRecipient) return;
  if (!messageInputEl) return;

  const text = messageInputEl.value.trim();
  if (!text) return;

  sendMessageButtonEl.disabled = true;

  try {
    const { ciphertextBase64, ivBase64 } = await encryptForThread(activeThreadId, text);

    const payload = {
      threadId: activeThreadId,
      recipientId: activeRecipient.id,
      ciphertext: ciphertextBase64,
      iv: ivBase64
    };

    const saved = await apiPost('/api/messages', payload);

    const row = await createMessageRow(saved);
    messageListEl.appendChild(row);
    messageListEl.scrollTop = messageListEl.scrollHeight;

    messageInputEl.value = '';
    if (messageCharCounterEl) messageCharCounterEl.textContent = '0/1000';
    autoGrowTextarea(messageInputEl);
  } catch (err) {
    console.error('Failed to send message', err);
    alert('Could not send message.');
  } finally {
    sendMessageButtonEl.disabled = false;
  }
}

// Build DOM for a single message
async function createMessageRow(msg) {
  const row = document.createElement('div');
  const isOwn = msg.sender_id === currentUser?.id;

  row.className = `message-row ${isOwn ? 'own' : 'other'}`;

  let plaintext = '';
  try {
    plaintext = await decryptForThread(activeThreadId, msg.ciphertext, msg.iv);
  } catch (err) {
    console.warn('Decrypt failed for message', msg.id, err);
    plaintext = '[Unable to decrypt message]';
  }

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = plaintext;

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = formatTime(msg.created_at);

  const wrapper = document.createElement('div');
  wrapper.appendChild(bubble);
  wrapper.appendChild(meta);

  row.appendChild(wrapper);
  return row;
}

// System text row
function systemMessageEl(text) {
  const el = document.createElement('div');
  el.className = 'message-system';
  el.textContent = text;
  return el;
}

// ===== E2EE WITH PER-THREAD PASSPHRASE =====

async function getThreadKey(threadId) {
  if (threadKeyCache.has(threadId)) {
    return threadKeyCache.get(threadId);
  }

  const storageKey = `messages_passphrase_${threadId}`;
  let passphrase = localStorage.getItem(storageKey);

  if (!passphrase) {
    passphrase = prompt('Set or enter the shared passphrase for this chat (must match on both sides):');
    if (!passphrase) {
      throw new Error('No passphrase provided');
    }
    localStorage.setItem(storageKey, passphrase);
  }

  const key = await deriveAesKeyFromPassphrase(passphrase, threadId);
  threadKeyCache.set(threadId, key);
  return key;
}

async function deriveAesKeyFromPassphrase(passphrase, saltString) {
  const enc = new TextEncoder();

  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(saltString),
      iterations: 250000,
      hash: 'SHA-256'
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptForThread(threadId, plaintext) {
  const key = await getThreadKey(threadId);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  return {
    ciphertextBase64: arrayBufferToBase64(ciphertextBuffer),
    ivBase64: arrayBufferToBase64(iv.buffer)
  };
}

async function decryptForThread(threadId, ciphertextBase64, ivBase64) {
  const key = await getThreadKey(threadId);
  const dec = new TextDecoder();

  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return dec.decode(plainBuffer);
}

// ===== UTILITIES =====
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
