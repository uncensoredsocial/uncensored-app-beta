// ========== MONERO INVOICE FUNCTIONS ==========

let currentInvoicePage = 1;
const INVOICES_PER_PAGE = 20;

// Load Monero data
async function loadMoneroData() {
    await Promise.all([
        loadMoneroStats(),
        loadMoneroInvoices()
    ]);
}

// Load Monero stats
async function loadMoneroStats() {
    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/monero/stats`, {
            headers: getAuthHeader()
        });
        
        if (!res.ok) throw new Error('Failed to load Monero stats');
        
        const stats = await res.json();
        
        document.getElementById('statTotalXMR').textContent = 
            parseFloat(stats.total_xmr_received || 0).toFixed(6) + ' XMR';
        document.getElementById('statPendingInvoices').textContent = 
            stats.pending_invoices || '0';
        document.getElementById('statPaidInvoices').textContent = 
            stats.paid_invoices || '0';
        document.getElementById('statSeedsDeleted').textContent = 
            stats.seeds_deleted || '0';
    } catch (error) {
        console.error('loadMoneroStats error:', error);
        showToast('Failed to load Monero stats', 'error');
    }
}

// Load invoices
async function loadMoneroInvoices(page = 1) {
    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;
    
    const status = document.getElementById('invoiceFilter')?.value || 'all';
    const statusParam = status === 'all' ? '' : status;
    
    tbody.innerHTML = `
        <tr><td colspan="6" class="admin-table-empty">Loading invoices...</td></tr>
    `;
    
    try {
        const offset = (page - 1) * INVOICES_PER_PAGE;
        const url = `${ADMIN_API_BASE}/admin/monero/invoices?status=${statusParam}&limit=${INVOICES_PER_PAGE}&offset=${offset}`;
        
        const res = await fetch(url, {
            headers: getAuthHeader()
        });
        
        if (!res.ok) throw new Error('Failed to load invoices');
        
        const invoices = await res.json();
        
        if (!invoices || invoices.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="6" class="admin-table-empty">No invoices found.</td></tr>
            `;
            updatePagination(0, page);
            return;
        }
        
        tbody.innerHTML = '';
        invoices.forEach(invoice => {
            const tr = document.createElement('tr');
            
            // Status badge
            let statusClass = '';
            switch(invoice.status) {
                case 'confirmed': statusClass = 'badge-success'; break;
                case 'paid': statusClass = 'badge-warning'; break;
                case 'pending': statusClass = 'badge-info'; break;
                case 'expired': statusClass = 'badge-secondary'; break;
                default: statusClass = 'badge-default';
            }
            
            tr.innerHTML = `
                <td>
                    <strong>${invoice.order_id}</strong>
                    ${invoice.customer_email ? `<br><small>${invoice.customer_email}</small>` : ''}
                </td>
                <td>
                    <div>${parseFloat(invoice.amount_xmr).toFixed(6)} XMR</div>
                    <small>$${parseFloat(invoice.amount_usd).toFixed(2)}</small>
                </td>
                <td>
                    <code class="address-small">${invoice.address.slice(0, 16)}...${invoice.address.slice(-8)}</code>
                </td>
                <td>
                    <span class="badge ${statusClass}">${invoice.status}</span>
                    ${invoice.confirmations > 0 ? `<br><small>${invoice.confirmations} conf</small>` : ''}
                </td>
                <td>${formatDateTime(invoice.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-ghost" onclick="viewInvoice(${invoice.id})">
                        View
                    </button>
                    <button class="btn btn-sm btn-ghost" onclick="viewSeed(${invoice.id})" 
                            ${invoice.seed_deleted_at ? 'disabled' : ''}>
                        Seed
                    </button>
                </td>
            `;
            
            tbody.appendChild(tr);
        });
        
        updatePagination(invoices.length, page);
    } catch (error) {
        console.error('loadMoneroInvoices error:', error);
        tbody.innerHTML = `
            <tr><td colspan="6" class="admin-table-empty">Failed to load invoices.</td></tr>
        `;
        showToast('Failed to load invoices', 'error');
    }
}

// View invoice details
async function viewInvoice(invoiceId) {
    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/monero/invoices/${invoiceId}/status`, {
            headers: getAuthHeader()
        });
        
        if (!res.ok) throw new Error('Failed to load invoice');
        
        const invoice = await res.json();
        
        // Create modal with invoice details
        const modalContent = `
            <div class="modal-content modal-lg">
                <div class="modal-header">
                    <h3>Invoice Details: ${invoice.order_id}</h3>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="invoice-details">
                        <div class="detail-row">
                            <span class="detail-label">Status:</span>
                            <span class="detail-value badge badge-${invoice.status}">
                                ${invoice.status.toUpperCase()}
                            </span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Amount:</span>
                            <span class="detail-value">
                                ${parseFloat(invoice.amount_xmr).toFixed(6)} XMR 
                                ($${parseFloat(invoice.amount_usd).toFixed(2)})
                            </span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Address:</span>
                            <span class="detail-value">
                                <code>${invoice.address}</code>
                                <button class="btn btn-xs" onclick="copyToClipboard('${invoice.address}')">
                                    Copy
                                </button>
                            </span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Confirmations:</span>
                            <span class="detail-value">
                                ${invoice.confirmations || 0} / ${invoice.required_confirmations || 10}
                            </span>
                        </div>
                        ${invoice.tx_hash ? `
                            <div class="detail-row">
                                <span class="detail-label">Transaction:</span>
                                <span class="detail-value">
                                    <a href="https://xmrchain.net/tx/${invoice.tx_hash}" target="_blank">
                                        ${invoice.tx_hash.slice(0, 16)}...
                                    </a>
                                </span>
                            </div>
                        ` : ''}
                        
                        ${invoice.transactions && invoice.transactions.length > 0 ? `
                            <h4>Transactions</h4>
                            <div class="transactions-list">
                                ${invoice.transactions.map(tx => `
                                    <div class="transaction-item">
                                        <div class="tx-hash">
                                            <a href="https://xmrchain.net/tx/${tx.tx_hash}" target="_blank">
                                                ${tx.tx_hash.slice(0, 16)}...
                                            </a>
                                        </div>
                                        <div class="tx-amount">
                                            ${parseFloat(tx.amount).toFixed(6)} XMR
                                        </div>
                                        <div class="tx-confirmations">
                                            ${tx.confirmations} conf
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        showModal(modalContent);
    } catch (error) {
        console.error('viewInvoice error:', error);
        showToast('Failed to load invoice details', 'error');
    }
}

// View seed phrases
let currentSeedInvoiceId = null;

async function viewSeed(invoiceId) {
    currentSeedInvoiceId = invoiceId;
    
    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/monero/invoices/${invoiceId}/seed`, {
            headers: getAuthHeader()
        });
        
        if (!res.ok) {
            if (res.status === 400) {
                const data = await res.json();
                if (data.error.includes('deleted')) {
                    // Show deleted state
                    document.getElementById('seedDeletedAlert').style.display = 'block';
                    document.getElementById('seedPhrase').innerHTML = 
                        '<em>Seed phrases have been permanently deleted</em>';
                    
                    // Try to get invoice to show deletion time
                    const invoiceRes = await fetch(`${ADMIN_API_BASE}/admin/monero/invoices/${invoiceId}`, {
                        headers: getAuthHeader()
                    });
                    if (invoiceRes.ok) {
                        const invoice = await invoiceRes.json();
                        if (invoice.seed_deleted_at) {
                            document.getElementById('deletedTime').textContent = 
                                formatDateTime(invoice.seed_deleted_at);
                        }
                    }
                }
            }
            throw new Error('Failed to load seed');
        }
        
        const seedData = await res.json();
        
        // Display seed phrases
        document.getElementById('seedPhrase').textContent = seedData.seed;
        document.getElementById('viewKey').textContent = seedData.viewKey;
        document.getElementById('spendKey').textContent = seedData.spendKey;
        document.getElementById('walletAddress').textContent = 
            await getInvoiceAddress(invoiceId);
        
        // Hide deleted alert
        document.getElementById('seedDeletedAlert').style.display = 'none';
        
        // Show modal
        document.getElementById('seedModal').style.display = 'block';
    } catch (error) {
        console.error('viewSeed error:', error);
        showToast('Failed to load seed phrases', 'error');
    }
}

// Get invoice address
async function getInvoiceAddress(invoiceId) {
    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/monero/invoices/${invoiceId}`, {
            headers: getAuthHeader()
        });
        if (res.ok) {
            const invoice = await res.json();
            return invoice.address;
        }
    } catch (error) {
        console.error('getInvoiceAddress error:', error);
    }
    return 'Unknown';
}

// Delete seed phrases
async function deleteSeedPhrases() {
    if (!currentSeedInvoiceId) return;
    
    const confirmDelete = confirm(
        '⚠️ PERMANENT DELETION\n\n' +
        'This will permanently delete all seed phrases and private keys for this wallet.\n' +
        'You will NOT be able to recover or access the funds in this wallet again.\n\n' +
        'Type "DELETE" to confirm:'
    );
    
    if (!confirmDelete) return;
    
    const userInput = prompt('Type DELETE to confirm permanent deletion:');
    if (userInput !== 'DELETE') {
        showToast('Deletion cancelled', 'error');
        return;
    }
    
    try {
        const res = await fetch(
            `${ADMIN_API_BASE}/admin/monero/invoices/${currentSeedInvoiceId}/seed`,
            {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeader()
                },
                body: JSON.stringify({ confirm: 'DELETE' })
            }
        );
        
        if (!res.ok) throw new Error('Failed to delete seed');
        
        showToast('Seed phrases permanently deleted', 'success');
        closeSeedModal();
        loadMoneroInvoices(currentInvoicePage);
        loadMoneroStats();
    } catch (error) {
        console.error('deleteSeedPhrases error:', error);
        showToast('Failed to delete seed phrases', 'error');
    }
}

// Create new invoice
async function createInvoice(invoiceData) {
    try {
        const res = await fetch(`${ADMIN_API_BASE}/admin/monero/invoices`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            },
            body: JSON.stringify(invoiceData)
        });
        
        if (!res.ok) throw new Error('Failed to create invoice');
        
        const result = await res.json();
        
        showToast('Invoice created successfully', 'success');
        closeInvoiceModal();
        loadMoneroInvoices(1);
        loadMoneroStats();
        
        // Show success with address
        const modalContent = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Invoice Created</h3>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-success">
                        Invoice created successfully!
                    </div>
                    <div class="invoice-success">
                        <p><strong>Order ID:</strong> ${result.invoice.orderId}</p>
                        <p><strong>Amount:</strong> ${result.invoice.amountXMR} XMR</p>
                        <p><strong>Address:</strong></p>
                        <code class="address-block">${result.invoice.address}</code>
                        <div class="qr-container">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=monero:${result.invoice.address}?tx_amount=${result.invoice.amountXMR}" 
                                 alt="Monero QR Code">
                        </div>
                        <button class="btn btn-primary" onclick="copyToClipboard('${result.invoice.address}')">
                            Copy Address
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        showModal(modalContent);
    } catch (error) {
        console.error('createInvoice error:', error);
        showToast('Failed to create invoice', 'error');
    }
}

// Modal functions
function showInvoiceModal() {
    document.getElementById('createInvoiceModal').style.display = 'block';
    document.getElementById('invoiceForm').reset();
}

function closeInvoiceModal() {
    document.getElementById('createInvoiceModal').style.display = 'none';
}

function closeSeedModal() {
    document.getElementById('seedModal').style.display = 'none';
    currentSeedInvoiceId = null;
}

// Copy functions
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Copy failed', 'error');
    });
}

function copySeed() {
    const seed = document.getElementById('seedPhrase').textContent;
    copyToClipboard(seed);
}

function copyViewKey() {
    const key = document.getElementById('viewKey').textContent;
    copyToClipboard(key);
}

function copySpendKey() {
    const key = document.getElementById('spendKey').textContent;
    copyToClipboard(key);
}

function copyAddress() {
    const address = document.getElementById('walletAddress').textContent;
    copyToClipboard(address);
}

// Pagination
function updatePagination(totalItems, currentPage) {
    const totalPages = Math.ceil(totalItems / INVOICES_PER_PAGE);
    document.getElementById('pageInfo').textContent = 
        `Page ${currentPage} of ${totalPages}`;
    
    document.getElementById('prevPageBtn').disabled = currentPage <= 1;
    document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
    
    if (totalPages <= 1) {
        document.getElementById('prevPageBtn').style.display = 'none';
        document.getElementById('nextPageBtn').style.display = 'none';
    } else {
        document.getElementById('prevPageBtn').style.display = 'inline-block';
        document.getElementById('nextPageBtn').style.display = 'inline-block';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // ... existing auth check ...
    
    // Load Monero data
    loadMoneroData();
    
    // Event listeners
    document.getElementById('createInvoiceBtn')?.addEventListener('click', showInvoiceModal);
    document.getElementById('refreshMoneroBtn')?.addEventListener('click', () => {
        loadMoneroData();
    });
    
    document.getElementById('invoiceFilter')?.addEventListener('change', () => {
        loadMoneroInvoices(1);
    });
    
    document.getElementById('prevPageBtn')?.addEventListener('click', () => {
        if (currentInvoicePage > 1) {
            currentInvoicePage--;
            loadMoneroInvoices(currentInvoicePage);
        }
    });
    
    document.getElementById('nextPageBtn')?.addEventListener('click', () => {
        currentInvoicePage++;
        loadMoneroInvoices(currentInvoicePage);
    });
    
    // Invoice form submission
    document.getElementById('invoiceForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const invoiceData = {
            orderId: document.getElementById('invoiceOrderId').value,
            amountXMR: parseFloat(document.getElementById('invoiceAmountXMR').value),
            amountUSD: document.getElementById('invoiceAmountUSD').value ? 
                parseFloat(document.getElementById('invoiceAmountUSD').value) : null,
            customerEmail: document.getElementById('invoiceCustomerEmail').value || null,
            description: document.getElementById('invoiceDescription').value || null,
            expiresIn: parseInt(document.getElementById('invoiceExpires').value)
        };
        
        createInvoice(invoiceData);
    });
    
    // Close modals on outside click
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('createInvoiceModal');
        const seedModal = document.getElementById('seedModal');
        
        if (e.target === modal) closeInvoiceModal();
        if (e.target === seedModal) closeSeedModal();
    });
});

// Helper function to show modal
function showModal(content) {
    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal';
    modalContainer.style.display = 'block';
    modalContainer.innerHTML = content;
    
    document.body.appendChild(modalContainer);
    
    // Add close on click outside
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            document.body.removeChild(modalContainer);
        }
    });
}

function closeModal() {
    const modal = document.querySelector('.modal');
    if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
    }
}
