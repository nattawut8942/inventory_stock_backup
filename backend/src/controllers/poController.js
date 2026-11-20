import { sql, getPool } from '../config/db.js';
import { storePOFile, removeStoredPOFiles, insertPOAttachment, fetchPOAttachments } from './poAttachmentController.js';
import { hasManagementColumns, applyTypeDefaultSql } from '../lib/stockManagement.js';

// หา/สร้างอุปกรณ์ให้รายการที่ยังไม่มี ProductID
// สร้างเป็น IsActive = 0 เพื่อให้ซ่อนจากหน้าคลัง/Master จนกว่าจะรับของ (ตอนรับจะเปิด IsActive = 1)
// ค้นด้วยชื่อแบบเดียวกับตอนรับของ เพื่อไม่ให้เกิดรายการซ้ำ
const resolveProductIdForItem = async (transaction, item) => {
    if (item.ProductID) return item.ProductID;
    const name = String(item.ItemName || '').trim();
    if (!name) return null;

    const found = await new sql.Request(transaction)
        .input('ProductName', sql.NVarChar, name)
        .query('SELECT TOP 1 ProductID FROM dbo.Stock_Products WHERE ProductName = @ProductName');
    if (found.recordset.length > 0) return found.recordset[0].ProductID;

    await new sql.Request(transaction).query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.Stock_DeviceTypes WHERE TypeId = 'Consumable')
        BEGIN
            INSERT INTO dbo.Stock_DeviceTypes (TypeId, Label) VALUES ('Consumable', 'Consumable Stock')
        END
    `);

    const created = await new sql.Request(transaction)
        .input('ProductName', sql.NVarChar, name)
        .input('UnitCost', sql.Decimal(18, 2), item.UnitCost || 0)
        .query(`
            INSERT INTO dbo.Stock_Products (ProductName, DeviceType, CurrentStock, LastPrice, MinStock, IsActive)
            VALUES (@ProductName, 'Consumable', 0, @UnitCost, 0, 0);
            DECLARE @NewID INT = SCOPE_IDENTITY();${applyTypeDefaultSql('@NewID', await hasManagementColumns(getPool()))}
            SELECT @NewID AS NewID;
        `);
    return created.recordset[0].NewID;
};

// อ่าน payload: ถ้าส่งมาแบบ multipart ข้อมูลอยู่ในฟิลด์ payload (JSON) ถ้าเป็น JSON ปกติใช้ body ตรงๆ
const readPayload = (req) => {
    if (req.body && req.body.payload) return JSON.parse(req.body.payload);
    return req.body || {};
};

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
            const attachments = await fetchPOAttachments(po.PO_ID);
            return { ...po, Items: detailsResult.recordset, Attachments: attachments };
        }));

        res.json(pos);
    } catch (err) {
        console.error('Get POs Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// CREATE PO (ต้องแนบไฟล์ PO เสมอ)
export const createPO = async (req, res) => {
    let body;
    try {
        body = readPayload(req);
    } catch (err) {
        return res.status(400).json({ error: 'ข้อมูล PO ไม่ถูกต้อง' });
    }
    const { PO_ID, VendorName, DueDate, RequestedBy, Section, Remark, Items, BudgetNo, PR_No, DeliveryTo } = body;

    const file = req.files?.file;
    if (!file) return res.status(400).json({ error: 'กรุณาแนบไฟล์ PO' });

    let stored = null;
    try {
        stored = await storePOFile(file);
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

            // Insert PO Details (ผูกอุปกรณ์ให้ทุกรายการ)
            for (const item of Items) {
                const productId = await resolveProductIdForItem(transaction, item);
                await new sql.Request(transaction)
                    .input('PO_ID', sql.NVarChar, PO_ID)
                    .input('ItemName', sql.NVarChar, item.ItemName || '')
                    .input('ProductID', sql.Int, productId || null)
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

            // ไฟล์ PO
            await insertPOAttachment(transaction, { poId: PO_ID, file, stored, actor: RequestedBy });

            await transaction.commit();
            res.json({ success: true, PO_ID });
        } catch (err) {
            await transaction.rollback();
            removeStoredPOFiles([stored]);
            console.error('Create PO Transaction Error:', err);
            if (err.number === 2627 || err.message.includes('PRIMARY KEY')) {
                return res.status(409).json({ error: 'Duplicate PO ID', code: 'DUPLICATE_PO_ID' });
            }
            res.status(500).json({ error: 'Failed to create PO', details: err.message });
        }
    } catch (err) {
        if (stored) removeStoredPOFiles([stored]);
        console.error('Create PO Connection Error:', err);
        res.status(500).json({ error: 'Database connection error' });
    }
};

// UPDATE PO (แนบไฟล์เพิ่มได้ ไม่บังคับ)
export const updatePO = async (req, res) => {
    const { id } = req.params;
    let body;
    try {
        body = readPayload(req);
    } catch (err) {
        return res.status(400).json({ error: 'ข้อมูล PO ไม่ถูกต้อง' });
    }
    const { VendorName, DueDate, RequestedBy, Section, Remark, Items, BudgetNo, PR_No, DeliveryTo } = body;
    const file = req.files?.file;

    let stored = null;
    const fail = (status, payload) => {
        if (stored) removeStoredPOFiles([stored]);
        return res.status(status).json(payload);
    };

    try {
        if (file) stored = await storePOFile(file);

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
                return fail(404, { error: 'PO not found' });
            }

            const status = checkRes.recordset[0].Status;
            // ใบที่รับของแล้ว (Partial/Completed/Cancelled) แก้ได้เฉพาะหัวใบ เพื่อไม่ให้ยอดรับหาย
            const processed = status !== 'Open' && status !== 'Pending';

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

            // 3. รายการอุปกรณ์: แก้ได้เฉพาะใบที่ยังไม่รับของ (ใบที่รับแล้วคงรายการเดิม)
            if (processed) {
                // ใบที่รับของแล้ว: แก้ได้เฉพาะ BG_No ของแต่ละบรรทัด (ยอดสั่ง/ยอดรับไม่เปลี่ยน)
                for (const item of Items) {
                    if (!item.DetailID) continue;
                    await new sql.Request(transaction)
                        .input('PO_ID', sql.NVarChar, id)
                        .input('DetailID', sql.Int, parseInt(item.DetailID, 10))
                        .input('BG_No', sql.NVarChar, item.BG_No || null)
                        .query('UPDATE dbo.Stock_PODetails SET BG_No = @BG_No WHERE DetailID = @DetailID AND PO_ID = @PO_ID');
                }
            }

            if (!processed) {
            await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('DELETE FROM dbo.Stock_PODetails WHERE PO_ID = @PO_ID');

            for (const item of Items) {
                const productId = await resolveProductIdForItem(transaction, item);
                await new sql.Request(transaction)
                    .input('PO_ID', sql.NVarChar, id)
                    .input('ItemName', sql.NVarChar, item.ItemName || '')
                    .input('ProductID', sql.Int, productId || null)
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

            }

            // 4. ไฟล์แนบใหม่ (ถ้ามี)
            if (file) {
                await insertPOAttachment(transaction, { poId: id, file, stored, actor: RequestedBy });
            }

            await transaction.commit();
            res.json({ success: true, message: 'PO updated successfully' });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Update PO Error:', err);
        if (stored) removeStoredPOFiles([stored]);
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

        let attachedFiles = [];
        try {
            // 1. Check for Invoices
            const checkUsage = await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('SELECT TOP 1 1 FROM dbo.Stock_Invoices WHERE PO_ID = @PO_ID');

            if (checkUsage.recordset.length > 0) {
                await transaction.rollback();
                return res.status(400).json({ error: 'Cannot delete PO because goods have already been received (Invoices exist). Please Cancel instead.' });
            }

            // 2. Collect & delete attachment rows
            const files = await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('SELECT StoredName FROM dbo.Stock_PO_Attachments WHERE PO_ID = @PO_ID');
            attachedFiles = files.recordset.map(r => r.StoredName);
            await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('DELETE FROM dbo.Stock_PO_Attachments WHERE PO_ID = @PO_ID');

            // 3. Delete Details
            await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('DELETE FROM dbo.Stock_PODetails WHERE PO_ID = @PO_ID');

            // 4. Delete Header
            await new sql.Request(transaction)
                .input('PO_ID', sql.NVarChar, id)
                .query('DELETE FROM dbo.Stock_PurchaseOrders WHERE PO_ID = @PO_ID');

            await transaction.commit();
            removeStoredPOFiles(attachedFiles);
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
