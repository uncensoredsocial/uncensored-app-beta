// messages.js

// ===== BASIC APP STATE =====
let currentUser = null;
let authToken = null;

let threads = [];
let activeThreadId = null;
let activeRecipient = null;

let messagePollIntervalId = null;

// cache of CryptoKey per threadId
const threadKeyCache = new Map();

// ===== DOM ELEMENTS =====
const threadsListEl = document.getElementById('threadsList');
const threadSearchInput = document.getElementById('threadSearchInput');

const chatPanelEl = document.querySelector('.chat-panel');
const chatContainerEl = document.getElementById('chatContainer');
const chatEmptyStateEl = document.getElementById('chatEmptyState');
const chatMessagesEl = document.getElementById('chatMessages');
const chatUsernameEl = document.getElementById('chatUsername');
const chatUserHandleEl = document.getElementById('chatUserHandle');

const chatFormEl = document.getElementById('chatForm');
const chatInputEl = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');

const backBtnEl = document.getElementById('messagesBackBtn');

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    try {
        const stored = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (!stored || !token) {
            window.location.href = '/login.html';
            return;
        }
        currentUser = JSON.parse(stored);
        authToken = token;
    } catch (err) {
        console.error('Failed to parse user/token', err);
        window.location.href = '/login.html';
        return;
    }

    setupEventListeners();
    loadThreads();
    autoOpenThreadFromQuery();
});

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // send button enable/disable
    chatInputEl.addEventListener('input', () => {
        const value = chatInputEl.value.trim();
        chatSendBtn.disabled = value.length === 0;
        autoGrowTextarea(chatInputEl);
    });

    chatFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSendMessage();
    });

    if (threadSearchInput) {
        threadSearchInput.addEventListener('input', () => {
            renderThreads();
        });
    }

    if (backBtnEl) {
        backBtnEl.addEventListener('click', () => {
            window.history.back();
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
    const res = await fetch(path, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GET ${path} failed: ${res.status} ${text}`);
    }
    return res.json();
}

async function apiPost(path, body) {
    const res = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST ${path} failed: ${res.status} ${text}`);
    }
    return res.json();
}

// ===== THREADS =====
async function loadThreads() {
    try {
        const data = await apiGet('/api/messages/threads');
        // Expect: { threads:[{ id, recipient, last_message, unread_count, updated_at }] }
        threads = data.threads || [];
        renderThreads();
    } catch (err) {
        console.error(err);
        threadsListEl.innerHTML = `<div class="threads-list-empty">Could not load conversations.</div>`;
    }
}

function renderThreads() {
    if (!threads || threads.length === 0) {
        threadsListEl.innerHTML = `<div class="threads-list-empty">No conversations yet.</div>`;
        return;
    }

    const searchTerm = (threadSearchInput?.value || '').toLowerCase().trim();

    threadsListEl.innerHTML = '';

    threads
        .filter(thread => {
            if (!searchTerm) return true;
            const name = (thread.recipient?.display_name || '').toLowerCase();
            const handle = (thread.recipient?.username || '').toLowerCase();
            const lastMsg = (thread.last_message?.plaintext_preview || '').toLowerCase();
            return (
                name.includes(searchTerm) ||
                handle.includes(searchTerm) ||
                lastMsg.includes(searchTerm)
            );
        })
        .sort((a, b) => {
            const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
            const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
            return bTime - aTime;
        })
        .forEach(thread => {
            const li = document.createElement('li');
            li.className = 'thread-item';
            li.dataset.threadId = thread.id;
            li.dataset.recipientId = thread.recipient?.id || '';

            if (thread.id === activeThreadId) {
                li.classList.add('active');
            }

            const initials = (thread.recipient?.display_name || thread.recipient?.username || '?')
                .split(' ')
                .map(p => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

            const avatarUrl = thread.recipient?.avatar_url || null;

            li.innerHTML = `
                <div class="thread-avatar">
                    ${avatarUrl ? `<img src="${avatarUrl}" alt="">` : initials}
                </div>
                <div class="thread-main">
                    <div class="thread-top-row">
                        <div class="thread-name">${escapeHtml(thread.recipient?.display_name || thread.recipient?.username || 'Unknown')}</div>
                        <div class="thread-time">${formatRelativeTime(thread.updated_at || thread.created_at)}</div>
                    </div>
                    <div class="thread-handle">@${escapeHtml(thread.recipient?.username || 'unknown')}</div>
                    <div class="thread-top-row">
                        <div class="thread-last-message">
                            ${escapeHtml(thread.last_message?.plaintext_preview || '')}
                        </div>
                        ${thread.unread_count > 0 ? '<div class="thread-unread-dot"></div>' : ''}
                    </div>
                </div>
            `;

            li.addEventListener('click', () => {
                onThreadClick(thread);
            });

            threadsListEl.appendChild(li);
        });
}

function onThreadClick(thread) {
    activeThreadId = thread.id;
    activeRecipient = thread.recipient || null;
    renderThreads(); // update active styling
    openChatPanelMobile();
    openChatHeader();
    loadMessagesForActiveThread();
}

// If you navigate from profile like messages.html?userId=abc
async function autoOpenThreadFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    if (!userId) return;

    try {
        const data = await apiPost('/api/messages/start', { recipientId: userId });
        // Expect: { thread, created: boolean }
        const t = data.thread;
        if (!threads.find(th => th.id === t.id)) {
            threads.push(t);
        }
        renderThreads();
        onThreadClick(t);
    } catch (err) {
        console.error('Failed to start thread from query', err);
    }
}

// ===== CHAT LOAD / RENDER =====
function openChatHeader() {
    if (!activeRecipient) return;
    chatUsernameEl.textContent = activeRecipient.display_name || activeRecipient.username || 'User';
    chatUserHandleEl.textContent = `@${activeRecipient.username || 'user'}`;
}

async function loadMessagesForActiveThread() {
    if (!activeThreadId) return;

    showChatContainer();

    // clear previous poll
    if (messagePollIntervalId) {
        clearInterval(messagePollIntervalId);
        messagePollIntervalId = null;
    }

    await fetchAndRenderMessages();

    // poll every 5s for new messages
    messagePollIntervalId = setInterval(fetchAndRenderMessages, 5000);
}

async function fetchAndRenderMessages() {
    if (!activeThreadId) return;

    try {
        const data = await apiGet(`/api/messages/threads/${activeThreadId}`);
        // Expect: { messages:[{ id, sender_id, ciphertext, iv, created_at }], thread:{...} }
        const messages = data.messages || [];

        chatMessagesEl.innerHTML = '';

        // optional system notice
        chatMessagesEl.appendChild(systemMessageEl('Messages in this chat are end-to-end encrypted with a shared passphrase.'));

        for (const msg of messages) {
            const row = await createMessageRow(msg);
            chatMessagesEl.appendChild(row);
        }

        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    } catch (err) {
        console.error('Failed to load messages', err);
        chatMessagesEl.innerHTML = '';
        chatMessagesEl.appendChild(systemMessageEl('Could not load messages.'));
    }
}

function showChatContainer() {
    chatEmptyStateEl.style.display = 'none';
    chatContainerEl.classList.remove('hidden');
}

// ===== SEND MESSAGE =====
async function handleSendMessage() {
    const text = chatInputEl.value.trim();
    if (!text || !activeThreadId || !activeRecipient) return;

    chatSendBtn.disabled = true;

    try {
        const { ciphertextBase64, ivBase64 } = await encryptForThread(activeThreadId, text);

        const payload = {
            threadId: activeThreadId,
            recipientId: activeRecipient.id,
            ciphertext: ciphertextBase64,
            iv: ivBase64
        };

        const saved = await apiPost('/api/messages', payload);
        // Expect saved message object back

        const row = await createMessageRow(saved);
        chatMessagesEl.appendChild(row);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

        chatInputEl.value = '';
        autoGrowTextarea(chatInputEl);
    } catch (err) {
        console.error('Failed to send message', err);
        alert('Could not send message.');
    } finally {
        chatSendBtn.disabled = false;
    }
}

// Create DOM for a single message row
async function createMessageRow(msg) {
    const row = document.createElement('div');
    const isOwn = msg.sender_id === currentUser.id;

    row.className = `message-row ${isOwn ? 'own' : 'other'}`;

    let plaintext = '';
    try {
        plaintext = await decryptForThread(activeThreadId, msg.ciphertext, msg.iv);
    } catch (err) {
        console.warn('decrypt failed for message', msg.id, err);
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

// System notice element
function systemMessageEl(text) {
    const el = document.createElement('div');
    el.className = 'message-system';
    el.textContent = text;
    return el;
}

// ===== SIMPLE E2EE WITH PER-THREAD PASSPHRASE =====
// For each thread, user enters a passphrase. That passphrase is:
// - Stored in localStorage on that browser
// - NOT sent to the server
// Everyone in the thread must use the same passphrase for decryption to work.

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

// base64 helpers (URL-safe not required here)
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

// mobile: slide chat panel in
function openChatPanelMobile() {
    if (!chatPanelEl) return;
    chatPanelEl.classList.add('open');
}
