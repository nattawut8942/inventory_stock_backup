import { sql, getPool } from '../config/db.js';

const getThaiDate = () => new Date();

// Get Stock History for a Product
export const getStockHistory = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('ProductID', sql.Int, req.params.id)
            .query(`
                SELECT 
                    t.TransDate,
                    t.Qty,
                    t.TransType,
                    t.RefInfo,
                    t.UserID,
                    t.BG_No
                FROM dbo.Stock_Transactions t
                WHERE t.ProductID = @ProductID
                ORDER BY t.TransDate DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get History Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET Transactions
export const getTransactions = async (req, res) => {
    const { filter, startDate, endDate } = req.query;

    try {
        const pool = getPool();
        const request = pool.request();
        let query = `
            SELECT t.TransID, t.ProductID, p.ProductName, t.TransType, t.Qty, t.RefInfo, t.UserID, t.TransDate, t.BG_No
            FROM dbo.Stock_Transactions t
            LEFT JOIN dbo.Stock_Products p ON t.ProductID = p.ProductID
            WHERE 1=1
        `;

        if (filter === 'IN' || filter === 'OUT') {
            request.input('TransType', sql.VarChar, filter);
            query += ` AND t.TransType = @TransType`;
        }
        if (startDate) {
            request.input('startDate', sql.DateTime, new Date(startDate));
            query += ' AND t.TransDate >= @startDate';
        }
        if (endDate) {
            request.input('endDate', sql.DateTime, new Date(endDate));
            query += ' AND t.TransDate <= @endDate';
        }

        query += ' ORDER BY t.TransDate DESC';

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Transactions Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET Invoices
export const getInvoices = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT i.InvoiceID, i.InvoiceNo, i.PO_ID, i.ReceiveDate, i.ReceivedBy,
                   ISNULL(i.Status, 'Active') AS Status,
                   po.BudgetNo, po.VendorName, po.RequestedBy
            FROM dbo.Stock_Invoices i
            LEFT JOIN dbo.Stock_PurchaseOrders po ON i.PO_ID = po.PO_ID
            ORDER BY i.ReceiveDate DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Invoices Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// Receive Goods (Inbound from PO)
export const receiveGoods = async (req, res) => {
    const { PO_ID, InvoiceNo, ItemsReceived, UserID } = req.body;

    let transaction;
    try {
        const pool = getPool();
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        // 0. Check for Duplicate Invoice
        const checkInvoice = await new sql.Request(transaction)
            .input('InvoiceNo', sql.NVarChar, InvoiceNo)
            .query('SELECT TOP 1 1 FROM dbo.Stock_Invoices WHERE InvoiceNo = @InvoiceNo');

        if (checkInvoice.recordset.length > 0) {
            throw new Error(`Invoice No. '${InvoiceNo}' already exists in the system.`);
        }

        // 1. Create Invoice Record
        const now = getThaiDate();
        const newInvoices = await new sql.Request(transaction)
            .input('InvoiceNo', sql.NVarChar, InvoiceNo)
            .input('PO_ID', sql.NVarChar, PO_ID)
            .input('ReceiveDate', sql.DateTime, now)
            .input('ReceivedBy', sql.NVarChar, UserID)
            .query(`
                INSERT INTO dbo.Stock_Invoices (InvoiceNo, PO_ID, ReceiveDate, ReceivedBy)
                VALUES (@InvoiceNo, @PO_ID, @ReceiveDate, @ReceivedBy);
                SELECT SCOPE_IDENTITY() AS InvoiceID;
            `);

        const invoiceID = newInvoices.recordset[0].InvoiceID;

        // 2. Process Each Item
        for (const item of ItemsReceived) {
            const qty = Number(item.Qty) || 0;
            if (qty <= 0) continue;

            // ✅ รับ BG_No จาก item
            const bgNo = item.BG_No || null;

            let finalProductID = item.ProductID;

            // 2a. Handle Manual Items (No ProductID initially)
            if (item.DetailID) {
                const detRes = await new sql.Request(transaction)
                    .input('DetailID', sql.Int, item.DetailID)
                    .query('SELECT ItemName, UnitCost, ProductID FROM dbo.Stock_PODetails WHERE DetailID = @DetailID');

                const detail = detRes.recordset[0];

                if (detail) {
                    if (detail.ProductID) {
                        finalProductID = detail.ProductID;
                    } else if (!finalProductID && detail.ItemName) {
                        const prodRes = await new sql.Request(transaction)
                            .input('ProductName', sql.NVarChar, detail.ItemName.trim())
                            .query('SELECT ProductID FROM dbo.Stock_Products WHERE ProductName = @ProductName');

                        if (prodRes.recordset.length > 0) {
                            finalProductID = prodRes.recordset[0].ProductID;
                        } else {
                            await new sql.Request(transaction).query(`
                                IF NOT EXISTS (SELECT 1 FROM dbo.Stock_DeviceTypes WHERE TypeId = 'Consumable')
                                BEGIN
                                    INSERT INTO dbo.Stock_DeviceTypes (TypeId, Label) VALUES ('Consumable', 'Consumable Stock')
                                END
                            `);

                            const createRes = await new sql.Request(transaction)
                                .input('ProductName', sql.NVarChar, detail.ItemName.trim())
                                .input('Qty', sql.Int, qty)
                                .input('UnitCost', sql.Decimal(18, 2), detail?.UnitCost || 0)
                                .query(`
                                    INSERT INTO dbo.Stock_Products (ProductName, DeviceType, CurrentStock, LastPrice, MinStock, IsActive)
                                    VALUES (@ProductName, 'Consumable', 0, @UnitCost, 0, 1);
                                    SELECT SCOPE_IDENTITY() AS NewID;
                                `);
                            finalProductID = createRes.recordset[0].NewID;
                        }

                        await new sql.Request(transaction)
                            .input('DetailID', sql.Int, item.DetailID)
                            .input('ProductID', sql.Int, finalProductID)
                            .query('UPDATE dbo.Stock_PODetails SET ProductID = @ProductID WHERE DetailID = @DetailID');
                    }
                }
            }

            // 3. Update Stock Level
            if (finalProductID) {
                await new sql.Request(transaction)
                    .input('ProductID', sql.Int, finalProductID)
                    .input('Qty', sql.Int, qty)
                    .query('UPDATE dbo.Stock_Products SET CurrentStock = CurrentStock + @Qty WHERE ProductID = @ProductID');
            } else {
                console.warn(`Warning: Could not resolve ProductID for DetailID ${item.DetailID}. Stock not updated.`);
            }

            // 4. Update PO Detail QtyReceived
            if (item.DetailID) {
                await new sql.Request(transaction)
                    .input('DetailID', sql.Int, item.DetailID)
                    .input('Qty', sql.Int, qty)
                    .query('UPDATE dbo.Stock_PODetails SET QtyReceived = QtyReceived + @Qty WHERE DetailID = @DetailID');
            } else if (item.ProductID) {
                await new sql.Request(transaction)
                    .input('PO_ID', sql.NVarChar, PO_ID)
                    .input('ProductID', sql.Int, item.ProductID)
                    .input('Qty', sql.Int, qty)
                    .query('UPDATE dbo.Stock_PODetails SET QtyReceived = QtyReceived + @Qty WHERE PO_ID = @PO_ID AND ProductID = @ProductID');
            }

            // ✅ 5. Log Transaction พร้อม BG_No
            if (finalProductID) {
                await new sql.Request(transaction)
                    .input('ProductID', sql.Int, finalProductID)
                    .input('TransType', sql.VarChar, 'IN')
                    .input('Qty', sql.Int, qty)
                    .input('RefInfo', sql.NVarChar, `Invoice: ${InvoiceNo} (PO: ${PO_ID})`)
                    .input('UserID', sql.NVarChar, UserID)
                    .input('TransDate', sql.DateTime, now)
                    .input('BG_No', sql.NVarChar, bgNo)
                    .query(`
                        INSERT INTO dbo.Stock_Transactions (ProductID, TransType, Qty, RefInfo, UserID, TransDate, BG_No)
                        VALUES (@ProductID, @TransType, @Qty, @RefInfo, @UserID, @TransDate, @BG_No)
                    `);
            }
        }

        // 6. Update PO Status
        const checkComplete = await new sql.Request(transaction)
            .input('PO_ID', sql.NVarChar, PO_ID)
            .query(`
                SELECT 
                    CASE WHEN COUNT(*) = SUM(CASE WHEN QtyReceived >= QtyOrdered THEN 1 ELSE 0 END) 
                         THEN 'Completed' ELSE 'Partial' END as NewStatus
                FROM dbo.Stock_PODetails
                WHERE PO_ID = @PO_ID
            `);

        const newStatus = checkComplete.recordset[0]?.NewStatus || 'Partial';

        await new sql.Request(transaction)
            .input('PO_ID', sql.NVarChar, PO_ID)
            .input('Status', sql.NVarChar, newStatus)
            .query('UPDATE dbo.Stock_PurchaseOrders SET Status = @Status WHERE PO_ID = @PO_ID');

        await transaction.commit();
        res.json({ success: true, message: 'Received successfully' });
    } catch (err) {
        console.error('Transaction Error:', err);
        if (transaction) await transaction.rollback();
        res.status(500).json({ error: 'Transaction failed', details: err.message });
    }
};

// Cancel Invoice (Reverse receive)
export const cancelInvoice = async (req, res) => {
    const { InvoiceNo, UserID } = req.body;

    if (!InvoiceNo) {
        return res.status(400).json({ error: 'InvoiceNo is required' });
    }

    let transaction;
    try {
        const pool = getPool();
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        // 1. Get Invoice info
        const invoiceRes = await new sql.Request(transaction)
            .input('InvoiceNo', sql.NVarChar, InvoiceNo)
            .query('SELECT InvoiceID, PO_ID, ISNULL(Status, \'Active\') AS Status FROM dbo.Stock_Invoices WHERE InvoiceNo = @InvoiceNo');

        if (invoiceRes.recordset.length === 0) {
            throw new Error(`Invoice '${InvoiceNo}' not found.`);
        }

        const invoice = invoiceRes.recordset[0];
        if (invoice.Status === 'Cancelled') {
            throw new Error(`Invoice '${InvoiceNo}' is already cancelled.`);
        }

        const PO_ID = invoice.PO_ID;

        // 2. Get all IN transactions related to this Invoice
        const txRes = await new sql.Request(transaction)
            .input('RefPattern', sql.NVarChar, `%Invoice: ${InvoiceNo}%`)
            .query(`
                SELECT TransID, ProductID, Qty, BG_No FROM dbo.Stock_Transactions
                WHERE RefInfo LIKE @RefPattern AND TransType = 'IN'
            `);

        const relatedTx = txRes.recordset;

        // 3. Reverse each transaction
        const now = getThaiDate();
        for (const tx of relatedTx) {
            const qty = Math.abs(tx.Qty);
            if (qty <= 0) continue;

            // 3a. Deduct stock
            await new sql.Request(transaction)
                .input('ProductID', sql.Int, tx.ProductID)
                .input('Qty', sql.Int, qty)
                .query('UPDATE dbo.Stock_Products SET CurrentStock = CurrentStock - @Qty WHERE ProductID = @ProductID');

            // 3b. Reduce QtyReceived in PODetails
            if (PO_ID) {
                await new sql.Request(transaction)
                    .input('PO_ID', sql.NVarChar, PO_ID)
                    .input('ProductID', sql.Int, tx.ProductID)
                    .input('Qty', sql.Int, qty)
                    .query(`
                        UPDATE dbo.Stock_PODetails
                        SET QtyReceived = CASE WHEN QtyReceived - @Qty < 0 THEN 0 ELSE QtyReceived - @Qty END
                        WHERE PO_ID = @PO_ID AND ProductID = @ProductID
                    `);
            }

            // ✅ 3c. Log reversal transaction พร้อม BG_No
            await new sql.Request(transaction)
                .input('ProductID', sql.Int, tx.ProductID)
                .input('TransType', sql.VarChar, 'OUT')
                .input('Qty', sql.Int, -qty)
                .input('RefInfo', sql.NVarChar, `ยกเลิก Invoice: ${InvoiceNo} (PO: ${PO_ID})`)
                .input('UserID', sql.NVarChar, UserID || 'system')
                .input('TransDate', sql.DateTime, now)
                .input('BG_No', sql.NVarChar, tx.BG_No || null)
                .query(`
                    INSERT INTO dbo.Stock_Transactions (ProductID, TransType, Qty, RefInfo, UserID, TransDate, BG_No)
                    VALUES (@ProductID, @TransType, @Qty, @RefInfo, @UserID, @TransDate, @BG_No)
                `);
        }

        // 4. Mark Invoice as Cancelled
        await new sql.Request(transaction)
            .input('InvoiceNo', sql.NVarChar, InvoiceNo)
            .query(`UPDATE dbo.Stock_Invoices SET Status = 'Cancelled' WHERE InvoiceNo = @InvoiceNo`);

        // 5. Recalculate PO Status
        if (PO_ID) {
            const checkStatus = await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, PO_ID)
                .query(`
                    SELECT
                        CASE
                            WHEN SUM(QtyReceived) = 0 THEN 'Open'
                            WHEN COUNT(*) = SUM(CASE WHEN QtyReceived >= QtyOrdered THEN 1 ELSE 0 END) THEN 'Completed'
                            ELSE 'Partial'
                        END AS NewStatus
                    FROM dbo.Stock_PODetails
                    WHERE PO_ID = @PO_ID
                `);

            const newStatus = checkStatus.recordset[0]?.NewStatus || 'Open';

            await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, PO_ID)
                .input('Status', sql.NVarChar, newStatus)
                .query('UPDATE dbo.Stock_PurchaseOrders SET Status = @Status WHERE PO_ID = @PO_ID');
        }

        await transaction.commit();
        res.json({ success: true, message: `Invoice '${InvoiceNo}' has been cancelled successfully.` });
    } catch (err) {
        console.error('Cancel Invoice Error:', err);
        if (transaction) await transaction.rollback();
        res.status(500).json({ error: 'Cancel failed', details: err.message });
    }
};