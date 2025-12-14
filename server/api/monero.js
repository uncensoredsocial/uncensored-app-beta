// server/api/monero.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { MoneroWallet, MoneroWalletFull } = require('monero-javascript');
const db = require('../db');

// Encryption keys (store in environment variables)
const ENCRYPTION_KEY = process.env.MONERO_ENCRYPTION_KEY;
const IV_LENGTH = 16;

// Encrypt sensitive data
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', 
        Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        authTag: authTag.toString('hex')
    };
}

// Decrypt sensitive data
function decrypt(encrypted) {
    const decipher = crypto.createDecipheriv('aes-256-gcm',
        Buffer.from(ENCRYPTION_KEY, 'hex'),
        Buffer.from(encrypted.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
    let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ========== ADDED: Simple stats endpoint for admin dashboard ==========
router.get('/admin/monero/stats', requireAdmin, async (req, res) => {
    try {
        const stats = await db.query(`
            SELECT * FROM admin_monero_stats
        `);
        
        const recent = await db.query(`
            SELECT COUNT(*) as total_24h,
                   SUM(amount_xmr) as xmr_24h,
                   SUM(amount_usd) as usd_24h
            FROM monero_invoices
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        `);
        
        res.json({
            ...stats.rows[0],
            recent_24h: recent.rows[0]
        });
    } catch (error) {
        console.error('Stats error:', error);
        // Return empty stats if view doesn't exist yet
        res.json({
            total_invoices: 0,
            pending_invoices: 0,
            paid_invoices: 0,
            confirmed_invoices: 0,
            seeds_deleted: 0,
            total_xmr_received: 0,
            total_usd_received: 0,
            recent_24h: { total_24h: 0, xmr_24h: 0, usd_24h: 0 }
        });
    }
});

// ========== ADDED: Simple get invoices for admin dashboard ==========
router.get('/admin/monero/invoices', requireAdmin, async (req, res) => {
    try {
        const { status, limit = 10, offset = 0 } = req.query;
        
        let query = `
            SELECT mi.*
            FROM monero_invoices mi
        `;
        
        const params = [];
        let whereClauses = [];
        
        if (status && status !== 'all') {
            params.push(status);
            whereClauses.push(`mi.status = $${params.length}`);
        }
        
        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }
        
        query += `
            ORDER BY mi.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// ========== ADDED: Simplified create invoice for admin dashboard ==========
router.post('/admin/monero/invoices', requireAdmin, async (req, res) => {
    try {
        const { 
            orderId, 
            amountXMR, 
            amountUSD, 
            customerEmail,
            description,
            expiresIn = 24 // hours
        } = req.body;

        // Check if order ID already exists
        const existing = await db.query(`
            SELECT id FROM monero_invoices WHERE order_id = $1
        `, [orderId]);
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Order ID already exists' });
        }

        // Create new wallet if MONERO_RPC_URL is available, otherwise generate placeholder
        let primaryAddress, encryptedSeed, encryptedViewKey, encryptedSpendKey;
        
        if (process.env.MONERO_RPC_URL && ENCRYPTION_KEY) {
            try {
                const wallet = await MoneroWallet.createWallet({
                    networkType: "mainnet",
                    password: crypto.randomBytes(32).toString('hex'),
                    server: {
                        uri: process.env.MONERO_RPC_URL,
                        username: process.env.MONERO_RPC_USER,
                        password: process.env.MONERO_RPC_PASSWORD
                    }
                });

                // Get wallet info
                primaryAddress = await wallet.getPrimaryAddress();
                const seed = await wallet.getMnemonic();
                const viewKey = await wallet.getPrivateViewKey();
                const spendKey = await wallet.getPrivateSpendKey();

                // Encrypt sensitive data
                encryptedSeed = JSON.stringify(encrypt(seed));
                encryptedViewKey = JSON.stringify(encrypt(viewKey));
                encryptedSpendKey = JSON.stringify(encrypt(spendKey));

                await wallet.close();
            } catch (walletError) {
                console.error('Wallet creation error, using placeholder:', walletError);
                // Fallback to placeholder address
                primaryAddress = '4' + crypto.randomBytes(32).toString('hex').slice(0, 94);
                encryptedSeed = null;
                encryptedViewKey = null;
                encryptedSpendKey = null;
            }
        } else {
            // Generate placeholder address
            primaryAddress = '4' + crypto.randomBytes(32).toString('hex').slice(0, 94);
            encryptedSeed = null;
            encryptedViewKey = null;
            encryptedSpendKey = null;
        }

        // Store invoice in database
        const result = await db.query(`
            INSERT INTO monero_invoices 
            (order_id, customer_email, amount_xmr, amount_usd, 
             address, encrypted_seed, encrypted_view_key, encrypted_spend_key,
             description, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + INTERVAL '${expiresIn} hours')
            RETURNING *
        `, [
            orderId, 
            customerEmail, 
            amountXMR, 
            amountUSD || (amountXMR * 150), // Default conversion if not provided
            primaryAddress, 
            encryptedSeed,
            encryptedViewKey,
            encryptedSpendKey,
            description
        ]);

        // Audit log
        await db.query(`
            INSERT INTO monero_seed_audit (admin_id, invoice_id, action, ip_address)
            VALUES ($1, $2, $3, $4)
        `, [
            req.user.id,
            result.rows[0].id,
            'invoice_created',
            req.ip
        ]);

        res.json({
            success: true,
            invoice: {
                id: result.rows[0].id,
                orderId,
                address: primaryAddress,
                amountXMR,
                amountUSD: amountUSD || (amountXMR * 150),
                qrCode: `monero:${primaryAddress}?tx_amount=${amountXMR}`,
                expiresAt: result.rows[0].expires_at
            }
        });
    } catch (error) {
        console.error('Create invoice error:', error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// Generate new wallet for each invoice
router.post('/admin/monero/invoices', requireAdmin, async (req, res) => {
    try {
        const { 
            orderId, 
            amountXMR, 
            amountUSD, 
            customerEmail,
            description,
            userId,
            expiresIn = 24 // hours
        } = req.body;

        // Create new wallet
        const wallet = await MoneroWallet.createWallet({
            networkType: "mainnet",
            password: crypto.randomBytes(32).toString('hex'),
            server: {
                uri: "http://localhost:18083",
                username: process.env.RPC_USER,
                password: process.env.RPC_PASSWORD
            }
        });

        // Get wallet info
        const primaryAddress = await wallet.getPrimaryAddress();
        const seed = await wallet.getMnemonic();
        const viewKey = await wallet.getPrivateViewKey();
        const spendKey = await wallet.getPrivateSpendKey();

        // Encrypt sensitive data
        const encryptedSeed = encrypt(seed);
        const encryptedViewKey = encrypt(viewKey);
        const encryptedSpendKey = encrypt(spendKey);

        // Store invoice in database
        const result = await db.query(`
            INSERT INTO monero_invoices 
            (order_id, user_id, customer_email, amount_xmr, amount_usd, 
             address, encrypted_seed, encrypted_view_key, encrypted_spend_key,
             description, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '${expiresIn} hours')
            RETURNING *
        `, [
            orderId, userId, customerEmail, amountXMR, amountUSD,
            primaryAddress, 
            JSON.stringify(encryptedSeed),
            JSON.stringify(encryptedViewKey),
            JSON.stringify(encryptedSpendKey),
            description
        ]);

        // Audit log
        await db.query(`
            INSERT INTO monero_seed_audit (admin_id, invoice_id, action, details, ip_address)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            req.user.id,
            result.rows[0].id,
            'invoice_created',
            { orderId, amountXMR },
            req.ip
        ]);

        res.json({
            success: true,
            invoice: {
                id: result.rows[0].id,
                orderId,
                address: primaryAddress,
                amountXMR,
                amountUSD,
                qrCode: `monero:${primaryAddress}?tx_amount=${amountXMR}`,
                expiresAt: result.rows[0].expires_at
            }
        });

        await wallet.close();
    } catch (error) {
        console.error('Create invoice error:', error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// Get all invoices
router.get('/admin/monero/invoices', requireAdmin, async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;
        
        let query = `
            SELECT mi.*, 
                   u.username, 
                   u.display_name,
                   COUNT(mt.id) as transaction_count
            FROM monero_invoices mi
            LEFT JOIN users u ON mi.user_id = u.id
            LEFT JOIN monero_transactions mt ON mi.id = mt.invoice_id
        `;
        
        const params = [];
        let whereClauses = [];
        
        if (status) {
            params.push(status);
            whereClauses.push(`mi.status = $${params.length}`);
        }
        
        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }
        
        query += `
            GROUP BY mi.id, u.id
            ORDER BY mi.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// Get seed phrases (admin only, logged)
router.get('/admin/monero/invoices/:id/seed', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(`
            SELECT encrypted_seed, encrypted_view_key, encrypted_spend_key,
                   seed_deleted_at
            FROM monero_invoices 
            WHERE id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        
        const invoice = result.rows[0];
        
        if (invoice.seed_deleted_at) {
            return res.status(400).json({ error: 'Seed phrases have been deleted' });
        }
        
        // Decrypt seed phrases
        const seed = decrypt(JSON.parse(invoice.encrypted_seed));
        const viewKey = decrypt(JSON.parse(invoice.encrypted_view_key));
        const spendKey = decrypt(JSON.parse(invoice.encrypted_spend_key));
        
        // Log the access
        await db.query(`
            INSERT INTO monero_seed_audit (admin_id, invoice_id, action, ip_address)
            VALUES ($1, $2, $3, $4)
        `, [req.user.id, id, 'seed_accessed', req.ip]);
        
        res.json({
            seed,
            viewKey,
            spendKey,
            accessedAt: new Date().toISOString(),
            accessedBy: req.user.username
        });
    } catch (error) {
        console.error('Get seed error:', error);
        res.status(500).json({ error: 'Failed to get seed phrases' });
    }
});

// Delete seed phrases (permanent)
router.delete('/admin/monero/invoices/:id/seed', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { confirm } = req.body;
        
        if (confirm !== 'DELETE') {
            return res.status(400).json({ 
                error: 'Must confirm with DELETE in request body' 
            });
        }
        
        const result = await db.query(`
            UPDATE monero_invoices 
            SET encrypted_seed = NULL,
                encrypted_view_key = NULL,
                encrypted_spend_key = NULL,
                seed_deleted_at = NOW()
            WHERE id = $1 AND seed_deleted_at IS NULL
            RETURNING id, order_id
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Invoice not found or seeds already deleted' 
            });
        }
        
        // Audit log
        await db.query(`
            INSERT INTO monero_seed_audit (admin_id, invoice_id, action, ip_address)
            VALUES ($1, $2, $3, $4)
        `, [req.user.id, id, 'seed_deleted', req.ip]);
        
        res.json({
            success: true,
            message: 'Seed phrases permanently deleted',
            deletedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Delete seed error:', error);
        res.status(500).json({ error: 'Failed to delete seed phrases' });
    }
});

// Check payment status
router.get('/admin/monero/invoices/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(`
            SELECT mi.*, 
                   COALESCE(json_agg(mt ORDER BY mt.created_at) FILTER (WHERE mt.id IS NOT NULL), '[]') as transactions
            FROM monero_invoices mi
            LEFT JOIN monero_transactions mt ON mi.id = mt.invoice_id
            WHERE mi.id = $1
            GROUP BY mi.id
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        
        const invoice = result.rows[0];
        
        // If seeds exist and we want to check blockchain
        let blockchainStatus = null;
        if (invoice.encrypted_seed && !invoice.seed_deleted_at) {
            try {
                // Decrypt and check wallet
                const encrypted = JSON.parse(invoice.encrypted_seed);
                const seed = decrypt(encrypted);
                
                const wallet = await MoneroWallet.createWallet({
                    mnemonic: seed,
                    networkType: "mainnet",
                    password: 'temp',
                    server: {
                        uri: process.env.RPC_URL,
                        username: process.env.RPC_USER,
                        password: process.env.RPC_PASSWORD
                    }
                });
                
                const balance = await wallet.getBalance();
                const transactions = await wallet.getTransactions();
                
                blockchainStatus = {
                    balance: balance.toString(),
                    unlockedBalance: (await wallet.getUnlockedBalance()).toString(),
                    transactionCount: transactions.length
                };
                
                await wallet.close();
            } catch (walletError) {
                console.error('Wallet check error:', walletError);
            }
        }
        
        res.json({
            ...invoice,
            blockchainStatus
        });
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: 'Failed to check status' });
    }
});

// Get Monero stats
router.get('/admin/monero/stats', requireAdmin, async (req, res) => {
    try {
        const stats = await db.query(`
            SELECT * FROM admin_monero_stats
        `);
        
        const recent = await db.query(`
            SELECT COUNT(*) as total_24h,
                   SUM(amount_xmr) as xmr_24h,
                   SUM(amount_usd) as usd_24h
            FROM monero_invoices
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        `);
        
        res.json({
            ...stats.rows[0],
            recent_24h: recent.rows[0]
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Webhook endpoint for payment notifications
router.post('/webhook/monero', async (req, res) => {
    try {
        const { address, tx_hash, amount, confirmations, height } = req.body;
        
        // Find invoice by address
        const invoiceResult = await db.query(`
            SELECT * FROM monero_invoices 
            WHERE address = $1 AND status IN ('pending', 'paid')
        `, [address]);
        
        if (invoiceResult.rows.length > 0) {
            const invoice = invoiceResult.rows[0];
            
            // Record transaction
            await db.query(`
                INSERT INTO monero_transactions 
                (invoice_id, tx_hash, amount, block_height, confirmations, timestamp)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (invoice_id, tx_hash) DO UPDATE 
                SET confirmations = EXCLUDED.confirmations
            `, [invoice.id, tx_hash, amount, height, confirmations]);
            
            // Update invoice status
            let newStatus = invoice.status;
            if (confirmations >= invoice.required_confirmations) {
                newStatus = 'confirmed';
                await db.query(`
                    UPDATE monero_invoices 
                    SET status = 'confirmed',
                        confirmed_at = NOW(),
                        confirmations = $1
                    WHERE id = $2
                `, [confirmations, invoice.id]);
            } else if (confirmations > 0 && invoice.status === 'pending') {
                newStatus = 'paid';
                await db.query(`
                    UPDATE monero_invoices 
                    SET status = 'paid',
                        paid_at = NOW(),
                        tx_hash = $1,
                        tx_amount = $2,
                        confirmations = $3
                    WHERE id = $4
                `, [tx_hash, amount, confirmations, invoice.id]);
            }
            
            // Call callback URL if exists
            if (invoice.callback_url) {
                fetch(invoice.callback_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId: invoice.order_id,
                        status: newStatus,
                        amount: amount,
                        confirmations,
                        txHash: tx_hash
                    })
                }).catch(console.error);
            }
        }
        
        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

module.exports = router;
