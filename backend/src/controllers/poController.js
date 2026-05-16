import { sql, getPool } from '../config/db.js';

// GET POs
export const getPOs = async (req, res) => {
    try {
        const pool = getPool();
        const { status } = req.query;

        let query = `SELECT PO_ID, PR_No, VendorName, RequestDate, DueDate, RequestedBy, Section, Status, Remark, BudgetNo, DeliveryTo FROM dbo.Stock_PurchaseOrders`;

        const request = pool.request();
        if (status) {
            request.input('Status', sql.NVarChar, status);
            query += ` WHERE Status = @Status`;
        }
        query += ' ORDER BY RequestDate DESC';

        const posResult = await request.query(query);

        const pos = await Promise.all(posResult.recordset.map(async (po) => {
            const detailsResult = await pool.request()
                .input('PO_ID', sql.NVarChar, po.PO_ID)
                .query(`
                    SELECT d.DetailID, d.ProductID, d.ItemName, p.ProductName,
                           d.QtyOrdered, d.QtyReceived, d.UnitCost, d.BG_No
                    FROM dbo.Stock_PODetails d
                    LEFT JOIN dbo.Stock_Products p ON d.ProductID = p.ProductID
                    WHERE d.PO_ID = @PO_ID
                `);
            return { ...po, Items: detailsResult.recordset };
        }));

        res.json(pos);
    } catch (err) {
        console.error('Get POs Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// CREATE PO
export const createPO = async (req, res) => {
    const { PO_ID, VendorName, DueDate, RequestedBy, Section, Remark, Items, BudgetNo, PR_No, DeliveryTo } = req.body;

    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Insert PO Header
            await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, PO_ID)
                .input('PR_No', sql.NVarChar, PR_No || null)
                .input('VendorName', sql.NVarChar, VendorName)
                .input('DueDate', sql.Date, DueDate || null)
                .input('RequestedBy', sql.NVarChar, RequestedBy)
                .input('Section', sql.NVarChar, Section)
                .input('Remark', sql.NVarChar, Remark)
                .input('BudgetNo', sql.NVarChar, BudgetNo || null)
                .input('DeliveryTo', sql.NVarChar, DeliveryTo || null)
                .query(`
                    INSERT INTO dbo.Stock_PurchaseOrders
                        (PO_ID, PR_No, VendorName, DueDate, RequestedBy, Section, Remark, Status, BudgetNo, DeliveryTo)
                    VALUES
                        (@PO_ID, @PR_No, @VendorName, @DueDate, @RequestedBy, @Section, @Remark, 'Open', @BudgetNo, @DeliveryTo)
                `);

            // ✅ Insert PO Details พร้อม BG_No
            for (const item of Items) {
                await new sql.Request(transaction)
                    .input('PO_ID', sql.NVarChar, PO_ID)
                    .input('ItemName', sql.NVarChar, item.ItemName || '')
                    .input('ProductID', sql.Int, item.ProductID || null)
                    .input('QtyOrdered', sql.Int, item.QtyOrdered)
                    .input('UnitCost', sql.Decimal(18, 2), item.UnitCost || 0)
                    .input('BG_No', sql.NVarChar, item.BG_No || null)
                    .query(`
                        INSERT INTO dbo.Stock_PODetails
                            (PO_ID, ItemName, ProductID, QtyOrdered, QtyReceived, UnitCost, BG_No)
                        VALUES
                            (@PO_ID, @ItemName, @ProductID, @QtyOrdered, 0, @UnitCost, @BG_No)
                    `);
            }

            await transaction.commit();
            res.json({ success: true, PO_ID });
        } catch (err) {
            await transaction.rollback();
            console.error('Create PO Transaction Error:', err);
            if (err.number === 2627 || err.message.includes('PRIMARY KEY')) {
                return res.status(409).json({ error: 'Duplicate PO ID', code: 'DUPLICATE_PO_ID' });
            }
            res.status(500).json({ error: 'Failed to create PO', details: err.message });
        }
    } catch (err) {
        console.error('Create PO Connection Error:', err);
        res.status(500).json({ error: 'Database connection error' });
    }
};

// UPDATE PO
export const updatePO = async (req, res) => {
    const { id } = req.params;
    const { VendorName, DueDate, RequestedBy, Section, Remark, Items, BudgetNo, PR_No, DeliveryTo } = req.body;

    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. Check Status
            const checkRes = await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('SELECT Status FROM dbo.Stock_PurchaseOrders WHERE PO_ID = @PO_ID');

            if (checkRes.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ error: 'PO not found' });
            }

            const status = checkRes.recordset[0].Status;
            if (status !== 'Open' && status !== 'Pending') {
                await transaction.rollback();
                return res.status(400).json({ error: 'Cannot edit PO that is already processed (Partial/Completed/Cancelled)' });
            }

            // 2. Update Header
            await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .input('VendorName', sql.NVarChar, VendorName)
                .input('DueDate', sql.Date, DueDate || null)
                .input('RequestedBy', sql.NVarChar, RequestedBy)
                .input('Section', sql.NVarChar, Section)
                .input('Remark', sql.NVarChar, Remark)
                .input('BudgetNo', sql.NVarChar, BudgetNo || null)
                .input('PR_No', sql.NVarChar, PR_No || null)
                .input('DeliveryTo', sql.NVarChar, DeliveryTo || null)
                .query(`
                    UPDATE dbo.Stock_PurchaseOrders
                    SET VendorName   = @VendorName,
                        DueDate      = @DueDate,
                        RequestedBy  = @RequestedBy,
                        Section      = @Section,
                        Remark       = @Remark,
                        BudgetNo     = @BudgetNo,
                        PR_No        = @PR_No,
                        DeliveryTo   = @DeliveryTo
                    WHERE PO_ID = @PO_ID
                `);

            // 3. Delete All & Re-insert Details
            await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('DELETE FROM dbo.Stock_PODetails WHERE PO_ID = @PO_ID');

            // ✅ Re-insert พร้อม BG_No
            for (const item of Items) {
                await new sql.Request(transaction)
                    .input('PO_ID', sql.NVarChar, id)
                    .input('ItemName', sql.NVarChar, item.ItemName || '')
                    .input('ProductID', sql.Int, item.ProductID || null)
                    .input('QtyOrdered', sql.Int, item.QtyOrdered)
                    .input('UnitCost', sql.Decimal(18, 2), item.UnitCost || 0)
                    .input('BG_No', sql.NVarChar, item.BG_No || null)
                    .query(`
                        INSERT INTO dbo.Stock_PODetails
                            (PO_ID, ItemName, ProductID, QtyOrdered, QtyReceived, UnitCost, BG_No)
                        VALUES
                            (@PO_ID, @ItemName, @ProductID, @QtyOrdered, 0, @UnitCost, @BG_No)
                    `);
            }

            await transaction.commit();
            res.json({ success: true, message: 'PO updated successfully' });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Update PO Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE PO
export const deletePO = async (req, res) => {
    const { id } = req.params;

    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. Check for Invoices
            const checkUsage = await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('SELECT TOP 1 1 FROM dbo.Stock_Invoices WHERE PO_ID = @PO_ID');

            if (checkUsage.recordset.length > 0) {
                await transaction.rollback();
                return res.status(400).json({ error: 'Cannot delete PO because goods have already been received (Invoices exist). Please Cancel instead.' });
            }

            // 2. Delete Details
            await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('DELETE FROM dbo.Stock_PODetails WHERE PO_ID = @PO_ID');

            // 3. Delete Header
            await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('DELETE FROM dbo.Stock_PurchaseOrders WHERE PO_ID = @PO_ID');

            await transaction.commit();
            res.json({ success: true, message: 'PO deleted successfully' });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Delete PO Error:', err);
        res.status(500).json({ error: err.message });
    }
};