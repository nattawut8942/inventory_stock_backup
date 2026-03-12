import { sql, getPool } from '../config/db.js';

// Generate session code: STK-YYYYMMDD-XXX
const generateSessionCode = async (pool) => {
    const today = new Date();
    const dateStr = today.getFullYear().toString() +
        String(today.getMonth() + 1).padStart(2, '0') +
        String(today.getDate()).padStart(2, '0');
    const prefix = `ITS-${dateStr}`;

    const result = await pool.request()
        .input('prefix', sql.NVarChar, `${prefix}%`)
        .query(`SELECT TOP 1 SessionCode FROM dbo.Stock_StockCountSessions 
                WHERE SessionCode LIKE @prefix ORDER BY SessionCode DESC`);

    let seq = 1;
    if (result.recordset.length > 0) {
        const lastCode = result.recordset[0].SessionCode;
        const lastSeq = parseInt(lastCode.split('-')[2], 10);
        seq = lastSeq + 1;
    }
    return `${prefix}-${String(seq).padStart(3, '0')}`;
};

// ============ SESSIONS ============

// GET all sessions
export const getSessions = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT SessionID, SessionCode, CountDate, ConfirmedBy, TotalItems, Variances, Status, Note, CreatedAt,
                   CASE WHEN DATEDIFF(day, CountDate, GETDATE()) > 3 THEN 1 ELSE 0 END AS IsLocked
            FROM dbo.Stock_StockCountSessions
            ORDER BY CreatedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Stock Count Sessions Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET single session with items
export const getSessionDetail = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();

        // Get session header
        const sessionResult = await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`
                SELECT SessionID, SessionCode, CountDate, ConfirmedBy, TotalItems, Variances, Status, Note, CreatedAt,
                       CASE WHEN DATEDIFF(day, CountDate, GETDATE()) > 3 THEN 1 ELSE 0 END AS IsLocked
                FROM dbo.Stock_StockCountSessions
                WHERE SessionID = @SessionID
            `);

        if (sessionResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Get items with product info
        const itemsResult = await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`
                SELECT i.ItemID, i.SessionID, i.ProductID, i.SystemQty, i.ActualQty, i.DiffQty, i.ScannedAt,
                       p.ProductName, p.DeviceType, p.UnitOfMeasure, p.BarcodeID, p.ImageURL, p.Location,
                       p.CurrentStock AS CurrentSystemQty
                FROM dbo.Stock_StockCountItems i
                JOIN dbo.Stock_Products p ON i.ProductID = p.ProductID
                WHERE i.SessionID = @SessionID
                ORDER BY i.ScannedAt DESC
            `);

        res.json({
            session: sessionResult.recordset[0],
            items: itemsResult.recordset
        });
    } catch (err) {
        console.error('Get Session Detail Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// POST create new session (Draft)
export const createSession = async (req, res) => {
    const { Note } = req.body;
    try {
        const pool = getPool();
        const sessionCode = await generateSessionCode(pool);

        const result = await pool.request()
            .input('SessionCode', sql.NVarChar, sessionCode)
            .input('Note', sql.NVarChar, Note || null)
            .query(`
                INSERT INTO dbo.Stock_StockCountSessions (SessionCode, Note)
                OUTPUT INSERTED.SessionID, INSERTED.SessionCode, INSERTED.CountDate, INSERTED.Status
                VALUES (@SessionCode, @Note)
            `);

        res.json({ success: true, session: result.recordset[0] });
    } catch (err) {
        console.error('Create Session Error:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
};

// ============ ITEMS ============

// POST add item to session (scan/search)
export const addItem = async (req, res) => {
    const { id } = req.params; // SessionID
    const { ProductID } = req.body;

    try {
        const pool = getPool();

        // Check session exists and is Draft
        const sessionCheck = await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`SELECT Status FROM dbo.Stock_StockCountSessions WHERE SessionID = @SessionID`);

        if (sessionCheck.recordset.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        if (sessionCheck.recordset[0].Status !== 'Draft') {
            return res.status(400).json({ error: 'Session is already confirmed' });
        }

        // Check duplicate
        const dupCheck = await pool.request()
            .input('SessionID', sql.Int, id)
            .input('ProductID', sql.Int, ProductID)
            .query(`SELECT ItemID FROM dbo.Stock_StockCountItems WHERE SessionID = @SessionID AND ProductID = @ProductID`);

        if (dupCheck.recordset.length > 0) {
            return res.status(400).json({ error: 'Product already in this session', duplicate: true });
        }

        // Get current stock
        const productResult = await pool.request()
            .input('ProductID', sql.Int, ProductID)
            .query(`SELECT ProductID, ProductName, CurrentStock, DeviceType, UnitOfMeasure, BarcodeID, ImageURL, Location
                    FROM dbo.Stock_Products WHERE ProductID = @ProductID AND IsActive = 1`);

        if (productResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = productResult.recordset[0];

        // Insert item
        const insertResult = await pool.request()
            .input('SessionID', sql.Int, id)
            .input('ProductID', sql.Int, ProductID)
            .input('SystemQty', sql.Int, product.CurrentStock)
            .query(`
                INSERT INTO dbo.Stock_StockCountItems (SessionID, ProductID, SystemQty)
                OUTPUT INSERTED.ItemID, INSERTED.SessionID, INSERTED.ProductID, INSERTED.SystemQty, INSERTED.ActualQty, INSERTED.DiffQty, INSERTED.ScannedAt
                VALUES (@SessionID, @ProductID, @SystemQty)
            `);

        // Update session TotalItems
        await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`UPDATE dbo.Stock_StockCountSessions SET TotalItems = (SELECT COUNT(*) FROM dbo.Stock_StockCountItems WHERE SessionID = @SessionID) WHERE SessionID = @SessionID`);

        res.json({
            success: true,
            item: {
                ...insertResult.recordset[0],
                ProductName: product.ProductName,
                DeviceType: product.DeviceType,
                UnitOfMeasure: product.UnitOfMeasure,
                BarcodeID: product.BarcodeID,
                ImageURL: product.ImageURL,
                Location: product.Location,
                CurrentSystemQty: product.CurrentStock
            }
        });
    } catch (err) {
        console.error('Add Item Error:', err);
        res.status(500).json({ error: 'Failed to add item' });
    }
};

// PUT update item ActualQty
export const updateItem = async (req, res) => {
    const { id, itemId } = req.params;
    const { ActualQty } = req.body;

    try {
        const pool = getPool();

        // Check 3-day lock
        const sessionCheck = await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`SELECT Status, DATEDIFF(day, CountDate, GETDATE()) AS DaysOld FROM dbo.Stock_StockCountSessions WHERE SessionID = @SessionID`);

        if (sessionCheck.recordset.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessionCheck.recordset[0];
        if (session.Status === 'Confirmed' && session.DaysOld > 3) {
            return res.status(403).json({ error: 'Cannot edit: session is older than 3 days' });
        }

        await pool.request()
            .input('ItemID', sql.Int, itemId)
            .input('SessionID', sql.Int, id)
            .input('ActualQty', sql.Int, ActualQty)
            .query(`UPDATE dbo.Stock_StockCountItems SET ActualQty = @ActualQty WHERE ItemID = @ItemID AND SessionID = @SessionID`);

        res.json({ success: true });
    } catch (err) {
        console.error('Update Item Error:', err);
        res.status(500).json({ error: 'Failed to update item' });
    }
};

// DELETE remove item from session
export const deleteItem = async (req, res) => {
    const { id, itemId } = req.params;

    try {
        const pool = getPool();

        // Check session is Draft
        const sessionCheck = await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`SELECT Status FROM dbo.Stock_StockCountSessions WHERE SessionID = @SessionID`);

        if (sessionCheck.recordset.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        if (sessionCheck.recordset[0].Status !== 'Draft') {
            return res.status(400).json({ error: 'Cannot remove items from confirmed session' });
        }

        await pool.request()
            .input('ItemID', sql.Int, itemId)
            .input('SessionID', sql.Int, id)
            .query(`DELETE FROM dbo.Stock_StockCountItems WHERE ItemID = @ItemID AND SessionID = @SessionID`);

        // Update TotalItems
        await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`UPDATE dbo.Stock_StockCountSessions SET TotalItems = (SELECT COUNT(*) FROM dbo.Stock_StockCountItems WHERE SessionID = @SessionID) WHERE SessionID = @SessionID`);

        res.json({ success: true });
    } catch (err) {
        console.error('Delete Item Error:', err);
        res.status(500).json({ error: 'Failed to delete item' });
    }
};

// ============ CONFIRM ============

// POST confirm session → ONLY finalize the count, DO NOT adjust stock
export const confirmSession = async (req, res) => {
    const { id } = req.params;
    const { ConfirmedBy } = req.body;

    if (!ConfirmedBy) {
        return res.status(400).json({ error: 'ConfirmedBy is required' });
    }

    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Check session
            const sessionCheck = await new sql.Request(transaction)
                .input('SessionID', sql.Int, id)
                .query(`SELECT SessionID, SessionCode, Status FROM dbo.Stock_StockCountSessions WHERE SessionID = @SessionID`);

            if (sessionCheck.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Session not found' });
            }
            if (sessionCheck.recordset[0].Status === 'Confirmed' || sessionCheck.recordset[0].Status === 'Adjusted') {
                await transaction.rollback();
                return res.status(400).json({ error: 'Session is already confirmed or adjusted' });
            }

            // Get all items
            const items = await new sql.Request(transaction)
                .input('SessionID', sql.Int, id)
                .query(`SELECT ItemID, ProductID, SystemQty, ActualQty, DiffQty FROM dbo.Stock_StockCountItems WHERE SessionID = @SessionID`);

            // Check all items have ActualQty
            const incomplete = items.recordset.filter(i => i.ActualQty === null);
            if (incomplete.length > 0) {
                await transaction.rollback();
                return res.status(400).json({ error: 'All items must have ActualQty filled in' });
            }

            // Update session status to Confirmed ONLY, no stock adjustment here
            const variances = items.recordset.filter(i => i.DiffQty !== 0).length;
            await new sql.Request(transaction)
                .input('SessionID', sql.Int, id)
                .input('ConfirmedBy', sql.NVarChar, ConfirmedBy)
                .input('Variances', sql.Int, variances)
                .input('TotalItems', sql.Int, items.recordset.length)
                .query(`
                    UPDATE dbo.Stock_StockCountSessions 
                    SET Status = 'Confirmed', ConfirmedBy = @ConfirmedBy, Variances = @Variances, TotalItems = @TotalItems
                    WHERE SessionID = @SessionID
                `);

            await transaction.commit();
            res.json({ success: true, message: 'บันทึกรายการนับสต็อกเรียบร้อยแล้ว (ยังไม่ได้ปรับยอด)' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Confirm Session Error:', err);
        res.status(500).json({ error: 'Failed to confirm session' });
    }
};

// POST apply stock adjustment based on confirmed session
export const applyStockAdjustment = async (req, res) => {
    const { id } = req.params;
    const { AdjustedBy } = req.body;

    if (!AdjustedBy) {
        return res.status(400).json({ error: 'AdjustedBy is required' });
    }

    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Check session
            const sessionCheck = await new sql.Request(transaction)
                .input('SessionID', sql.Int, id)
                .query(`SELECT SessionID, SessionCode, Status FROM dbo.Stock_StockCountSessions WHERE SessionID = @SessionID`);

            if (sessionCheck.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Session not found' });
            }
            if (sessionCheck.recordset[0].Status === 'Adjusted') {
                await transaction.rollback();
                return res.status(400).json({ error: 'Stock for this session is already adjusted' });
            }
            if (sessionCheck.recordset[0].Status === 'Draft') {
                await transaction.rollback();
                return res.status(400).json({ error: 'Session must be confirmed before adjusting stock' });
            }

            const sessionCode = sessionCheck.recordset[0].SessionCode;

            // Get all items
            const items = await new sql.Request(transaction)
                .input('SessionID', sql.Int, id)
                .query(`SELECT ItemID, ProductID, SystemQty, ActualQty, DiffQty FROM dbo.Stock_StockCountItems WHERE SessionID = @SessionID`);

            // Adjust stock for each item with diff
            const now = new Date();
            for (const item of items.recordset) {
                if (item.DiffQty !== 0) {
                    // Update product stock
                    await new sql.Request(transaction)
                        .input('ProductID', sql.Int, item.ProductID)
                        .input('ActualQty', sql.Int, item.ActualQty)
                        .query(`UPDATE dbo.Stock_Products SET CurrentStock = @ActualQty WHERE ProductID = @ProductID`);

                    // Log transaction
                    const transType = item.DiffQty > 0 ? 'IN' : 'OUT';
                    const qty = Math.abs(item.DiffQty);
                    await new sql.Request(transaction)
                        .input('ProductID', sql.Int, item.ProductID)
                        .input('TransType', sql.VarChar, transType)
                        .input('Qty', sql.Int, qty)
                        .input('RefInfo', sql.NVarChar, `Stock Count Adjust: ${sessionCode}`)
                        .input('UserID', sql.NVarChar, AdjustedBy)
                        .input('TransDate', sql.DateTime, now)
                        .query(`
                            INSERT INTO dbo.Stock_Transactions (ProductID, TransType, Qty, RefInfo, UserID, TransDate)
                            VALUES (@ProductID, @TransType, @Qty, @RefInfo, @UserID, @TransDate)
                        `);
                }
            }

            // Update session status to Adjusted
            await new sql.Request(transaction)
                .input('SessionID', sql.Int, id)
                .query(`
                    UPDATE dbo.Stock_StockCountSessions 
                    SET Status = 'Adjusted'
                    WHERE SessionID = @SessionID
                `);

            await transaction.commit();
            res.json({ success: true, message: 'ปรับยอดสต็อกตามความเป็นจริงเรียบร้อยแล้ว' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Apply Adjustment Error:', err);
        res.status(500).json({ error: 'Failed to apply stock adjustment' });
    }
};

// PUT edit confirmed session (within 3 days) — update count ONLY if not Adjusted yet
export const editConfirmedSession = async (req, res) => {
    const { id } = req.params;
    const { items, ConfirmedBy } = req.body; // items: [{ ItemID, ActualQty }]

    try {
        const pool = getPool();

        // Check 3-day lock and status
        const sessionCheck = await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`SELECT SessionID, SessionCode, Status, DATEDIFF(day, CountDate, GETDATE()) AS DaysOld 
                    FROM dbo.Stock_StockCountSessions WHERE SessionID = @SessionID`);

        if (sessionCheck.recordset.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessionCheck.recordset[0];

        if (session.Status === 'Adjusted') {
            return res.status(403).json({ error: 'Cannot edit: stock has already been adjusted. Please make a new count instead.' });
        }

        if (session.DaysOld > 3) {
            return res.status(403).json({ error: 'Cannot edit: session is older than 3 days' });
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            for (const item of items) {
                // Get old ActualQty
                const oldItem = await new sql.Request(transaction)
                    .input('ItemID', sql.Int, item.ItemID)
                    .input('SessionID', sql.Int, id)
                    .query(`SELECT ProductID, ActualQty, SystemQty FROM dbo.Stock_StockCountItems WHERE ItemID = @ItemID AND SessionID = @SessionID`);

                if (oldItem.recordset.length === 0) continue;

                const old = oldItem.recordset[0];
                const newActualQty = parseInt(item.ActualQty, 10);
                const newDiffQty = newActualQty - old.SystemQty;

                if (old.ActualQty !== newActualQty) {
                    // Update item's actual and diff qty
                    await new sql.Request(transaction)
                        .input('ItemID', sql.Int, item.ItemID)
                        .input('ActualQty', sql.Int, newActualQty)
                        .input('DiffQty', sql.Int, newDiffQty)
                        .query(`UPDATE dbo.Stock_StockCountItems SET ActualQty = @ActualQty, DiffQty = @DiffQty WHERE ItemID = @ItemID`);
                }
            }

            // Recalculate variances
            const updatedItems = await new sql.Request(transaction)
                .input('SessionID', sql.Int, id)
                .query(`SELECT DiffQty FROM dbo.Stock_StockCountItems WHERE SessionID = @SessionID`);

            const variances = updatedItems.recordset.filter(i => i.DiffQty !== 0).length;
            await new sql.Request(transaction)
                .input('SessionID', sql.Int, id)
                .input('Variances', sql.Int, variances)
                .query(`UPDATE dbo.Stock_StockCountSessions SET Variances = @Variances WHERE SessionID = @SessionID`);

            await transaction.commit();
            res.json({ success: true, message: 'Session updated successfully' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Edit Session Error:', err);
        res.status(500).json({ error: 'Failed to edit session' });
    }
};

// DELETE session (and its items)
export const deleteSession = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();

        // Check session exists
        const sessionCheck = await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`SELECT SessionID, Status, DATEDIFF(day, CountDate, GETDATE()) AS DaysOld 
                    FROM dbo.Stock_StockCountSessions WHERE SessionID = @SessionID`);

        if (sessionCheck.recordset.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessionCheck.recordset[0];
        // Confirmed sessions can only be deleted within 3 days
        if (session.Status === 'Confirmed' && session.DaysOld > 3) {
            return res.status(403).json({ error: 'Cannot delete: confirmed session is older than 3 days' });
        }

        // Delete items first, then session
        await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`DELETE FROM dbo.Stock_StockCountItems WHERE SessionID = @SessionID`);

        await pool.request()
            .input('SessionID', sql.Int, id)
            .query(`DELETE FROM dbo.Stock_StockCountSessions WHERE SessionID = @SessionID`);

        res.json({ success: true });
    } catch (err) {
        console.error('Delete Session Error:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
};

// GET search products by barcode or name (for scan input)
export const searchProduct = async (req, res) => {
    const { q } = req.query;
    if (!q || !q.trim()) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('query', sql.NVarChar, q.trim())
            .input('likeQuery', sql.NVarChar, `%${q.trim()}%`)
            .query(`
                SELECT TOP 20 ProductID, ProductName, DeviceType, CurrentStock, UnitOfMeasure, BarcodeID, ImageURL, Location
                FROM dbo.Stock_Products
                WHERE IsActive = 1 AND (
                    BarcodeID = @query
                    OR CAST(ProductID AS NVARCHAR) = @query  
                    OR ProductName LIKE @likeQuery
                )
                ORDER BY 
                    CASE WHEN BarcodeID = @query THEN 0
                         WHEN CAST(ProductID AS NVARCHAR) = @query THEN 1
                         ELSE 2 END,
                    ProductName
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Search Product Error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
};
