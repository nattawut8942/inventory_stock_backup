import { sql, getPool } from '../config/db.js';
import { isDbAdmin } from '../middleware/permissionMiddleware.js';
import { hasManagementColumns, managementTypeSelect, normalizeManagementType } from '../lib/stockManagement.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Helper for Thai Date
const getThaiDate = () => new Date();

export const uploadImage = (req, res) => {
    if (!req.files || !req.files.imageFile) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const file = req.files.imageFile;
    const fileName = `${Date.now()}_${file.name}`;
    const uploadPath = path.join(__dirname, '../../uploads', fileName);
    
    file.mv(uploadPath, (err) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, imageUrl: `/uploads/${fileName}` });
    });
};

// --- PRODUCTS ---

// GET All Products
export const getProducts = async (req, res) => {
    try {
        const pool = getPool();
        const hasMgmt = await hasManagementColumns(pool);
        const result = await pool.request().query(`
    SELECT ProductID, ProductName, DeviceType, MinStock, MaxStock,
        CurrentStock, LastPrice, UnitOfMeasure, IsActive, ImageURL,
        Location, BarcodeID, business_priority,
        lead_time_days, VendorID, ${managementTypeSelect('', hasMgmt)}
    FROM dbo.Stock_Products
    WHERE IsActive = 1
`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Products Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// UPDATE Product
export const updateProduct = async (req, res) => {
    const { id } = req.params;
    console.log('=== updateProduct ===');
    console.log('ID:', id);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const { ProductName, DeviceType, LastPrice, CurrentStock,
        MinStock, MaxStock, ImageURL, Location, BarcodeID,
        business_priority, VendorID, lead_time_days } = req.body;

    console.log('VendorID:', VendorID, typeof VendorID);
    console.log('lead_time_days:', lead_time_days, typeof lead_time_days);

    try {
        const pool = getPool();
        const request = pool.request();

        request
            .input('ProductID', sql.Int, id)
            .input('ProductName', sql.NVarChar, ProductName)
            .input('DeviceType', sql.VarChar, DeviceType)
            .input('MinStock', sql.Int, MinStock)
            .input('MaxStock', sql.Int, MaxStock || 0)
            .input('CurrentStock', sql.Int, CurrentStock)
            .input('LastPrice', sql.Decimal(18, 2), LastPrice)
            .input('business_priority', sql.TinyInt, business_priority ?? 3)
            .input('lead_time_days', sql.Int, lead_time_days || 7)
            .input('VendorID', sql.Int, VendorID || null);

        let query = `
            UPDATE dbo.Stock_Products 
            SET ProductName = @ProductName, DeviceType = @DeviceType, 
                MinStock = @MinStock, MaxStock = @MaxStock, 
                CurrentStock = @CurrentStock, LastPrice = @LastPrice,
                business_priority = @business_priority,
                lead_time_days = @lead_time_days,
                VendorID = @VendorID
        `;

        if (ImageURL !== undefined) {
            request.input('ImageURL', sql.NVarChar, ImageURL);
            query += `, ImageURL = @ImageURL`;
        }

        if (Location !== undefined) {
            request.input('Location', sql.NVarChar, Location);
            query += `, Location = @Location`;
        }

        if (BarcodeID !== undefined) {
            request.input('BarcodeID', sql.NVarChar, BarcodeID);
            query += `, BarcodeID = @BarcodeID`;
        }

        // ประเภทการจัดการ: ส่งมาเฉพาะเมื่อต้องการเปลี่ยน (ไม่ส่ง = คงค่าเดิม)
        if (req.body.ManagementType !== undefined) {
            const mgmt = normalizeManagementType(req.body.ManagementType);
            if (!mgmt) return res.status(400).json({ error: 'ประเภทการจัดการไม่ถูกต้อง' });
            if (await hasManagementColumns(pool)) {
                request.input('ManagementType', sql.VarChar(20), mgmt);
                query += `, ManagementType = @ManagementType`;
            }
        }

        query += `,
        priority_label = CASE @business_priority
        WHEN 1 THEN 'CRITICAL'
        WHEN 2 THEN 'HIGH'
        WHEN 3 THEN 'MEDIUM'
        WHEN 4 THEN 'LOW'
        ELSE 'MEDIUM'
        END
        WHERE ProductID = @ProductID`;

        await request.query(query);
        res.json({ success: true });
    } catch (err) {
        console.error('Update Product Error:', err);
        res.status(500).json({ error: 'Failed to update product' });
    }
};

// DELETE Product (Soft Delete)
export const deleteProduct = async (req, res) => {
    const { id } = req.params;

    try {
        const pool = getPool();
        await pool.request()
            .input('ProductID', sql.Int, id)
            .query('UPDATE dbo.Stock_Products SET IsActive = 0 WHERE ProductID = @ProductID');

        res.json({ success: true });
    } catch (err) {
        console.error('Delete Product Error:', err);
        res.status(500).json({ error: 'Failed to delete product' });
    }
};

// MANUAL IMPORT
const MANUAL_IMPORT_MAX_INT = 2147483647;
const MANUAL_IMPORT_MAX_REMARK = 200;

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export const manualImport = async (req, res) => {
    const body = req.body || {};
    const { ProductName, DeviceType, LastPrice, CurrentStock, MinStock, MaxStock, Remark, UserID, Location } = body;

    // ---- Validation (all server-side; never trust the client) ----
    const name = typeof ProductName === 'string' ? ProductName.trim() : '';
    if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่ออุปกรณ์' });
    if (name.length > 255) return res.status(400).json({ error: 'ชื่ออุปกรณ์ยาวเกิน 255 ตัวอักษร' });

    const deviceType = typeof DeviceType === 'string' ? DeviceType.trim() : '';
    if (!deviceType) return res.status(400).json({ error: 'กรุณาเลือกหมวดหมู่' });
    if (deviceType.length > 50) return res.status(400).json({ error: 'หมวดหมู่ไม่ถูกต้อง' });

    const qty = isBlank(CurrentStock) ? NaN : Number(CurrentStock);
    if (!Number.isInteger(qty) || qty <= 0 || qty > MANUAL_IMPORT_MAX_INT) {
        return res.status(400).json({ error: 'จำนวนต้องเป็นจำนวนเต็มที่มากกว่า 0' });
    }

    const unitCost = isBlank(LastPrice) ? NaN : Number(LastPrice);
    if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost >= 1e15) {
        return res.status(400).json({ error: 'ราคาต่อชิ้นต้องเป็นตัวเลขที่ไม่ติดลบ' });
    }

    const minStock = isBlank(MinStock) ? NaN : Number(MinStock);
    if (!Number.isInteger(minStock) || minStock < 0 || minStock > MANUAL_IMPORT_MAX_INT) {
        return res.status(400).json({ error: 'สต็อกขั้นต่ำต้องเป็นจำนวนเต็มที่ไม่ติดลบ' });
    }

    // Blank max = "keep existing" for an existing product, 0 for a new one (original behaviour).
    const maxStockInput = isBlank(MaxStock) ? null : Number(MaxStock);
    if (maxStockInput !== null && (!Number.isInteger(maxStockInput) || maxStockInput < 0 || maxStockInput > MANUAL_IMPORT_MAX_INT)) {
        return res.status(400).json({ error: 'สต็อกสูงสุดต้องเป็นจำนวนเต็มที่ไม่ติดลบ' });
    }
    if (maxStockInput !== null && maxStockInput > 0 && minStock > maxStockInput) {
        return res.status(400).json({ error: 'สต็อกขั้นต่ำต้องไม่มากกว่าสต็อกสูงสุด' });
    }

    const remark = typeof Remark === 'string' ? Remark.trim() : '';
    if (remark.length > MANUAL_IMPORT_MAX_REMARK) {
        return res.status(400).json({ error: `หมายเหตุยาวเกิน ${MANUAL_IMPORT_MAX_REMARK} ตัวอักษร` });
    }

    const location = typeof Location === 'string' && Location.trim() ? Location.trim().slice(0, 100) : null;
    const userId = typeof UserID === 'string' && UserID.trim() ? UserID.trim().toUpperCase() : null;
    const now = getThaiDate();

    // ประเภทการจัดการ (ไม่บังคับ): ไม่ส่ง = สินค้าใหม่ใช้ค่าเริ่มต้นของหมวด, สินค้าเดิมคงค่าเดิม
    const mgmtInput = isBlank(body.ManagementType) ? null : normalizeManagementType(body.ManagementType);
    if (!isBlank(body.ManagementType) && !mgmtInput) return res.status(400).json({ error: 'ประเภทการจัดการไม่ถูกต้อง' });
    const hasMgmt = await hasManagementColumns(getPool());

    // ---- Transaction ----
    let began = false;
    const transaction = new sql.Transaction(getPool());
    try {
        await transaction.begin();
        began = true;

        // 1. Find product. UPDLOCK/HOLDLOCK stops two imports of the same new name from both inserting.
        const checkRes = await new sql.Request(transaction)
            .input('ProductName', sql.NVarChar(255), name)
            .query(`
                SELECT ProductID, IsActive
                FROM dbo.Stock_Products WITH (UPDLOCK, HOLDLOCK)
                WHERE ProductName = @ProductName
            `);

        let productID;
        let action;
        let reactivated = false;
        let previousStock = 0;
        let newStock;

        if (checkRes.recordset.length > 0) {
            action = 'updated';
            productID = checkRes.recordset[0].ProductID;
            reactivated = !checkRes.recordset[0].IsActive;

            const upd = await new sql.Request(transaction)
                .input('ProductID', sql.Int, productID)
                .input('Qty', sql.Int, qty)
                .input('UnitCost', sql.Decimal(18, 2), unitCost)
                .input('MinStock', sql.Int, minStock)
                .input('MaxStock', sql.Int, maxStockInput)
                .input('DeviceType', sql.VarChar(50), deviceType)
                .input('Location', sql.NVarChar(100), location)
                .input('ManagementType', sql.VarChar(20), mgmtInput)
                .query(`
                    UPDATE dbo.Stock_Products
                    SET CurrentStock = CurrentStock + @Qty,
                        LastPrice = @UnitCost,
                        MinStock = @MinStock,
                        MaxStock = COALESCE(@MaxStock, MaxStock),
                        DeviceType = @DeviceType,
                        Location = COALESCE(@Location, Location),${hasMgmt ? `
                        ManagementType = COALESCE(@ManagementType, ManagementType),` : ''}
                        IsActive = 1
                    OUTPUT DELETED.CurrentStock AS PrevStock, INSERTED.CurrentStock AS NewStock
                    WHERE ProductID = @ProductID
                `);
            previousStock = upd.recordset[0].PrevStock;
            newStock = upd.recordset[0].NewStock;
        } else {
            action = 'created';
            const insertRes = await new sql.Request(transaction)
                .input('ProductName', sql.NVarChar(255), name)
                .input('DeviceType', sql.VarChar(50), deviceType)
                .input('CurrentStock', sql.Int, qty)
                .input('UnitCost', sql.Decimal(18, 2), unitCost)
                .input('MinStock', sql.Int, minStock)
                .input('MaxStock', sql.Int, maxStockInput ?? 0)
                .input('Location', sql.NVarChar(100), location)
                .input('business_priority', sql.TinyInt, 3)
                .input('priority_label', sql.NVarChar(20), 'MEDIUM')
                .input('ManagementType', sql.VarChar(20), mgmtInput)
                .query(hasMgmt ? `
                    INSERT INTO dbo.Stock_Products
                        (ProductName, DeviceType, CurrentStock, LastPrice, MinStock, MaxStock, Location, IsActive, business_priority, priority_label, ManagementType)
                    OUTPUT INSERTED.ProductID, INSERTED.CurrentStock AS NewStock
                    VALUES (@ProductName, @DeviceType, @CurrentStock, @UnitCost, @MinStock, @MaxStock, @Location, 1, @business_priority, @priority_label,
                        COALESCE(@ManagementType,
                                 (SELECT DefaultManagementType FROM dbo.Stock_DeviceTypes WHERE TypeId = @DeviceType),
                                 'Rotating'))
                ` : `
                    INSERT INTO dbo.Stock_Products
                        (ProductName, DeviceType, CurrentStock, LastPrice, MinStock, MaxStock, Location, IsActive, business_priority, priority_label)
                    OUTPUT INSERTED.ProductID, INSERTED.CurrentStock AS NewStock
                    VALUES (@ProductName, @DeviceType, @CurrentStock, @UnitCost, @MinStock, @MaxStock, @Location, 1, @business_priority, @priority_label)
                `);
            productID = insertRes.recordset[0].ProductID;
            newStock = insertRes.recordset[0].NewStock;
        }

        // 2. Log the transaction
        await new sql.Request(transaction)
            .input('ProductID', sql.Int, productID)
            .input('TransType', sql.VarChar(10), 'IN')
            .input('Qty', sql.Int, qty)
            .input('RefInfo', sql.NVarChar(MANUAL_IMPORT_MAX_REMARK), remark || 'Manual Import')
            .input('UserID', sql.NVarChar(50), userId)
            .input('TransDate', sql.DateTime, now)
            .query(`
                INSERT INTO dbo.Stock_Transactions (ProductID, TransType, Qty, RefInfo, UserID, TransDate)
                VALUES (@ProductID, @TransType, @Qty, @RefInfo, @UserID, @TransDate)
            `);

        await transaction.commit();
        return res.json({
            success: true,
            message: 'Import successful',
            action,
            productId: productID,
            previousStock,
            addedQty: qty,
            newStock,
            reactivated
        });
    } catch (err) {
        if (began) await transaction.rollback().catch(() => {});
        console.error('Manual Import Error:', err);
        return res.status(500).json({ error: 'ไม่สามารถนำเข้าอุปกรณ์ได้ กรุณาลองใหม่อีกครั้ง' });
    }
};

// ✅ รูปแบบรหัสครุภัณฑ์บังคับ: CO + ตัวเลขล้วน เช่น CO24-001-05
const FIXED_ASSET_CODE_REGEX = /^(CO|OF)\d{2}-\d{3}-\d{2}$/;

export const checkFixedAssetCode = async (req, res) => {
    const { code } = req.params;
    if (!code || !code.trim()) {
        return res.status(400).json({ error: 'Fixed asset code is required' });
    }
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('FixedAssetCode', sql.NVarChar, code.trim())
            .query(`
                SELECT TOP 1 ProductID, TransDate, UserID
                FROM dbo.Stock_Transactions
                WHERE FixedAssetCode = @FixedAssetCode
                  AND TransType = 'OUT'
                ORDER BY TransDate DESC
            `);

        if (result.recordset.length > 0) {
            return res.json({ exists: true, detail: result.recordset[0] });
        }
        res.json({ exists: false });
    } catch (err) {
        console.error('Check Fixed Asset Code Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// WITHDRAW (Outbound)
// ── คืนของ: ย้อนรายการเบิก (OUT) ─ สร้างแถว IN ใหม่อ้างอิงแถวเดิม ไม่ลบประวัติ ──
// จำกัดเวลาคืนได้ภายในจำนวนวันนี้นับจากวันที่เบิก
export const RETURN_WINDOW_DAYS = 7;

export const returnWithdrawal = async (req, res) => {
    const txId = parseInt(req.body?.TransID, 10);
    const reason = String(req.body?.Reason || '').trim();
    const by = req.body?.UserID ? String(req.body.UserID).trim().toUpperCase() : null;

    if (!txId) return res.status(400).json({ error: 'TransID is required' });
    if (!reason) return res.status(400).json({ error: 'กรุณาระบุเหตุผลการคืน' });

    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // UPDLOCK: กันสองคนกดคืนรายการเดียวกันพร้อมกัน
            const rowRes = await new sql.Request(transaction)
                .input('TransID', sql.Int, txId)
                .query(`
                    SELECT TransID, ProductID, TransType, Qty, TransDate, ReturnedAt, SerialNumber, FixedAssetCode
                    FROM dbo.Stock_Transactions WITH (UPDLOCK, ROWLOCK)
                    WHERE TransID = @TransID
                `);
            const row = rowRes.recordset[0];

            if (!row) {
                await transaction.rollback();
                return res.status(404).json({ error: 'ไม่พบรายการเบิกนี้' });
            }
            if (row.TransType !== 'OUT') {
                await transaction.rollback();
                return res.status(400).json({ error: 'รายการนี้ไม่ใช่รายการเบิก' });
            }
            if (row.ReturnedAt) {
                await transaction.rollback();
                return res.status(409).json({ error: 'รายการนี้ถูกคืนไปแล้ว' });
            }
            // Admin คืนได้ไม่จำกัดเวลา ผู้ใช้อื่นจำกัดภายใน RETURN_WINDOW_DAYS
            const admin = await isDbAdmin(req);
            const ageMs = Date.now() - new Date(row.TransDate).getTime();
            if (!admin && ageMs > RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
                await transaction.rollback();
                return res.status(400).json({ error: `เกินกำหนดคืนของ (ภายใน ${RETURN_WINDOW_DAYS} วันหลังเบิก)` });
            }

            const now = getThaiDate();

            await new sql.Request(transaction)
                .input('ProductID', sql.Int, row.ProductID)
                .input('Qty', sql.Int, row.Qty)
                .query('UPDATE dbo.Stock_Products SET CurrentStock = CurrentStock + @Qty WHERE ProductID = @ProductID');

            await new sql.Request(transaction)
                .input('TransID', sql.Int, txId)
                .input('ReturnedAt', sql.DateTime, now)
                .input('ReturnedBy', sql.NVarChar, by)
                .query('UPDATE dbo.Stock_Transactions SET ReturnedAt = @ReturnedAt, ReturnedBy = @ReturnedBy WHERE TransID = @TransID');

            await new sql.Request(transaction)
                .input('ProductID', sql.Int, row.ProductID)
                .input('TransType', sql.VarChar, 'IN')
                .input('Qty', sql.Int, row.Qty)
                .input('RefInfo', sql.NVarChar, `คืนของ (จากการเบิก #${txId}): ${reason}`)
                .input('UserID', sql.NVarChar, by)
                .input('TransDate', sql.DateTime, now)
                .input('SerialNumber', sql.NVarChar, row.SerialNumber || null)
                .input('FixedAssetCode', sql.NVarChar, row.FixedAssetCode || null)
                .input('ReturnOf', sql.Int, txId)
                .query(`
                    INSERT INTO dbo.Stock_Transactions
                        (ProductID, TransType, Qty, RefInfo, UserID, TransDate, SerialNumber, FixedAssetCode, ReturnOf)
                    VALUES
                        (@ProductID, @TransType, @Qty, @RefInfo, @UserID, @TransDate, @SerialNumber, @FixedAssetCode, @ReturnOf)
                `);

            await transaction.commit();
            res.json({ success: true });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Return Error:', err);
        res.status(500).json({ error: 'คืนของไม่สำเร็จ' });
    }
};

// รหัส Cost Center แผนกไอที: ผู้รับในแผนกนี้ถือเป็นเบิกใช้เอง (ใช้ในแผนก)
const INTERNAL_COST_CENTER = '7510';

export const withdrawProduct = async (req, res) => {
    const {
        ProductID, Qty, UserID, RefInfo,
        EmployeeCode, EmployeeName, CostCenter,   // ✅ เพิ่ม 3 ตัวนี้
        SerialNumber, FixedAssetCode,             // ✅ ใหม่: สำหรับ Asset type
        SelfUse,                                  // เบิกใช้เอง (ผู้ login = ผู้รับ)
    } = req.body;

    try {
        const pool = getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const checkStock = await new sql.Request(transaction)
                .input('ProductID', sql.Int, ProductID)
                .query('SELECT CurrentStock, DeviceType FROM dbo.Stock_Products WHERE ProductID = @ProductID');

            if (checkStock.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Product not found' });
            }

const { CurrentStock: currentStock, DeviceType } = checkStock.recordset[0];

            // ✅ Server-side guard: Asset ต้องมี S/N + รหัสครุภัณฑ์เสมอ อย่าเชื่อ validation ฝั่ง frontend อย่างเดียว
            if (DeviceType === 'Asset' && (!SerialNumber || !FixedAssetCode)) {
                await transaction.rollback();
                return res.status(400).json({ error: 'Asset ต้องระบุ Serial Number และรหัสครุภัณฑ์' });
            }
            if (DeviceType === 'Asset' && !FIXED_ASSET_CODE_REGEX.test(FixedAssetCode)) {
                await transaction.rollback();
                return res.status(400).json({ error: 'รูปแบบรหัสครุภัณฑ์ไม่ถูกต้อง (ต้องเป็น COXX-XXX-XX หรือ OFXX-XXX-XX)' });
            }

            // ✅ กันซ้ำจริงตอนบันทึกลง DB — กัน race condition กรณีเช็คผ่าน frontend ไปแล้วแต่มีคนอื่นชิงใช้รหัสเดียวกันไปก่อน
            if (DeviceType === 'Asset') {
                const dupCheck = await new sql.Request(transaction)
                    .input('FixedAssetCode', sql.NVarChar, FixedAssetCode.trim())
                    .query(`
                        SELECT TOP 1 1 FROM dbo.Stock_Transactions
                        WHERE FixedAssetCode = @FixedAssetCode AND TransType = 'OUT' AND ReturnedAt IS NULL
                    `);
                if (dupCheck.recordset.length > 0) {
                    await transaction.rollback();
                    return res.status(409).json({ error: `รหัสครุภัณฑ์ ${FixedAssetCode} ถูกใช้ไปแล้วในระบบ` });
                }
            }

            if (currentStock < Qty) {
                await transaction.rollback();
                return res.status(400).json({ error: 'Insufficient stock' });
            }
            
            await new sql.Request(transaction)
                .input('ProductID', sql.Int, ProductID)
                .input('Qty', sql.Int, Qty)
                .query('UPDATE dbo.Stock_Products SET CurrentStock = CurrentStock - @Qty WHERE ProductID = @ProductID');

            const now = getThaiDate();
            await new sql.Request(transaction)
                .input('ProductID', sql.Int, ProductID)
                .input('TransType', sql.VarChar, 'OUT')
                .input('Qty', sql.Int, Qty)
                .input('RefInfo', sql.NVarChar, RefInfo || 'Internal Withdrawal')
                .input('UserID', sql.NVarChar, UserID ? String(UserID).trim().toUpperCase() : UserID)
                .input('TransDate', sql.DateTime, now)
                .input('EmployeeCode', sql.VarChar, EmployeeCode || null)    // ✅
                .input('EmployeeName', sql.NVarChar, EmployeeName || null)  // ✅
                // เบิกใช้เอง (หรือ 7510) → เก็บศูนย์ต้นทุนเป็น 7510 ถ้าไม่ได้ระบุมา
                .input('CostCenter', sql.VarChar, (SelfUse === true || String(CostCenter || '').trim() === INTERNAL_COST_CENTER)
                    ? (String(CostCenter || '').trim() || INTERNAL_COST_CENTER)
                    : (CostCenter || null))
                .input('SerialNumber', sql.NVarChar, SerialNumber || null)       // ✅ ใหม่
                .input('FixedAssetCode', sql.NVarChar, FixedAssetCode || null)   // ✅ ใหม่
                .input('SelfUse', sql.Bit, (SelfUse === true || String(CostCenter || '').trim() === INTERNAL_COST_CENTER) ? 1 : 0)   // เบิกใช้ในแผนกไอที = ใช้เอง
                .query(`
                    INSERT INTO dbo.Stock_Transactions
                        (ProductID, TransType, Qty, RefInfo, UserID, TransDate, EmployeeCode, EmployeeName, CostCenter, SerialNumber, FixedAssetCode, SelfUse)
                    VALUES
                        (@ProductID, @TransType, @Qty, @RefInfo, @UserID, @TransDate, @EmployeeCode, @EmployeeName, @CostCenter, @SerialNumber, @FixedAssetCode, @SelfUse)
                `);

            await transaction.commit();
            res.json({ success: true });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Withdraw Error:', err);
        res.status(500).json({ error: 'Withdrawal failed' });
    }
};
// --- DEVICE TYPES ---

// GET Device Types
export const getDeviceTypes = async (req, res) => {
    try {
        const pool = getPool();
        const hasMgmt = await hasManagementColumns(pool);
        const result = await pool.request().query(hasMgmt
            ? `SELECT TypeId, Label, ISNULL(DefaultManagementType, 'Rotating') AS DefaultManagementType FROM dbo.Stock_DeviceTypes`
            : `SELECT TypeId, Label, 'Rotating' AS DefaultManagementType FROM dbo.Stock_DeviceTypes`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Types Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// CREATE Device Type
export const createDeviceType = async (req, res) => {
    const { TypeId, Label, DefaultManagementType } = req.body;
    if (!TypeId || !Label) {
        return res.status(400).json({ error: 'TypeId and Label are required' });
    }
    const mgmt = DefaultManagementType === undefined || DefaultManagementType === null || DefaultManagementType === ''
        ? null : normalizeManagementType(DefaultManagementType);
    if (DefaultManagementType && !mgmt) return res.status(400).json({ error: 'ประเภทการจัดการไม่ถูกต้อง' });
    try {
        const pool = getPool();
        const hasMgmt = await hasManagementColumns(pool);
        await pool.request()
            .input('TypeId', sql.VarChar, TypeId)
            .input('Label', sql.NVarChar, Label)
            .input('DefaultManagementType', sql.VarChar(20), mgmt)
            .query(hasMgmt
                ? 'INSERT INTO dbo.Stock_DeviceTypes (TypeId, Label, DefaultManagementType) VALUES (@TypeId, @Label, @DefaultManagementType)'
                : 'INSERT INTO dbo.Stock_DeviceTypes (TypeId, Label) VALUES (@TypeId, @Label)');
        res.json({ success: true, message: 'Type added' });
    } catch (err) {
        console.error('Add Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// UPDATE Device Type
// DefaultManagementType: ค่าเริ่มต้นของสินค้าใหม่ในหมวด
// ApplyToProducts = true: เปลี่ยนสินค้าที่มีอยู่ในหมวดนี้ทั้งหมดเป็นค่าเดียวกันด้วย (ใช้ตอนจัดประเภทครั้งแรก)
export const updateDeviceType = async (req, res) => {
    const { id } = req.params;
    const { Label, DefaultManagementType, ApplyToProducts } = req.body;
    const mgmt = DefaultManagementType === undefined ? undefined : normalizeManagementType(DefaultManagementType);
    if (DefaultManagementType !== undefined && !mgmt) return res.status(400).json({ error: 'ประเภทการจัดการไม่ถูกต้อง' });
    let began = false;
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    try {
        const hasMgmt = await hasManagementColumns(pool);
        if (mgmt && !hasMgmt) {
            return res.status(409).json({ error: 'ยังไม่ได้รัน migration ประเภทการจัดการ (2026-11-20_stock_management_type.sql)' });
        }
        await transaction.begin();
        began = true;
        const setMgmt = mgmt ? ', DefaultManagementType = @DefaultManagementType' : '';
        await new sql.Request(transaction)
            .input('TypeId', sql.VarChar, id)
            .input('Label', sql.NVarChar, Label)
            .input('DefaultManagementType', sql.VarChar(20), mgmt || null)
            .query(`UPDATE dbo.Stock_DeviceTypes SET Label = @Label${setMgmt} WHERE TypeId = @TypeId`);
        let productsUpdated = 0;
        if (mgmt && ApplyToProducts === true) {
            const r = await new sql.Request(transaction)
                .input('TypeId', sql.VarChar, id)
                .input('ManagementType', sql.VarChar(20), mgmt)
                .query(`UPDATE dbo.Stock_Products SET ManagementType = @ManagementType
                        WHERE DeviceType = @TypeId AND ManagementType <> @ManagementType`);
            productsUpdated = r.rowsAffected[0] || 0;
        }
        await transaction.commit();
        res.json({ success: true, productsUpdated });
    } catch (err) {
        if (began) await transaction.rollback().catch(() => {});
        console.error('Update Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE Device Type
export const deleteDeviceType = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();
        // Check usage first
        const check = await pool.request()
            .input('TypeId', sql.VarChar, id)
            .query('SELECT TOP 1 1 FROM dbo.Stock_Products WHERE DeviceType = @TypeId');

        if (check.recordset.length > 0) {
            return res.status(400).json({ error: 'Type is in use by products' });
        }

        await pool.request()
            .input('TypeId', sql.VarChar, id)
            .query('DELETE FROM dbo.Stock_DeviceTypes WHERE TypeId = @TypeId');
        res.json({ success: true });
    } catch (err) {
        console.error('Delete Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// --- FORECAST ---
export const getForecast = async (req, res) => {
    try {
        const pool = getPool();
        const hasMgmt = await hasManagementColumns(pool);
        const result = await pool.request().query(`
            SELECT
                ${managementTypeSelect('p', hasMgmt)},
                p.ProductID,
                p.ProductName,
                p.DeviceType,
                p.CurrentStock,
                p.MinStock,
                p.MaxStock,
                p.LastPrice,
                p.business_priority,
                p.priority_label,
                p.ImageURL,
                ISNULL(p.lead_time_days, 7) AS lead_time_days,
                ISNULL(v.VendorName, '-') AS VendorName
            FROM Stock_Products p
            LEFT JOIN Stock_Vendors v ON p.VendorID = v.VendorID
            WHERE p.CurrentStock <= p.MinStock
              AND p.IsActive = 1${hasMgmt ? `
              AND p.ManagementType <> 'Stored'` : ''}
        `);

        const items = result.recordset.map(item => {
            const leadTime = item.lead_time_days || 7;
            const orderQty = Math.max(0, (item.MaxStock || 0) - item.CurrentStock);
            const estimatedCost = orderQty * (item.LastPrice || 0);
            return { ...item, lead_time_days: leadTime, OrderQty: orderQty, EstimatedCost: estimatedCost };
        });

        items.sort((a, b) => {
            if (a.business_priority !== b.business_priority)
                return (a.business_priority || 3) - (b.business_priority || 3);
            return (b.lead_time_days || 7) - (a.lead_time_days || 7);
        });

        res.json(items);
    } catch (err) {
        console.error('getForecast error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const getVendors = async (req, res) => {
    try {
        const pool = getPool();  // ✅ แก้จาก poolPromise
        const result = await pool.request().query(`
            SELECT VendorID, VendorName
            FROM Stock_Vendors
            WHERE IsActive = 1
            ORDER BY VendorName ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── POST /products/:id/adjust ────────────────────────────────────────────────
// ปรับยอดคงเหลือจริง (นับผิด / ชำรุด / สูญหาย / พบเพิ่ม ฯลฯ) ใน transaction เดียว
// บันทึกเป็นรายการประเภท ADJ พร้อมเหตุผล — ไม่นับเป็นเบิกออกหรือรับเข้า
export const adjustProductStock = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const newQty = Number(req.body?.NewQty);
    const reason = String(req.body?.Reason || '').trim();
    const note = String(req.body?.Note || '').trim();
    const userId = String(req.body?.UserID || '').trim().toUpperCase() || 'UNKNOWN';
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'รหัสสินค้าไม่ถูกต้อง' });
    if (!Number.isInteger(newQty) || newQty < 0) return res.status(400).json({ error: 'จำนวนคงเหลือต้องเป็นจำนวนเต็ม 0 ขึ้นไป' });
    if (!reason) return res.status(400).json({ error: 'กรุณาเลือกเหตุผลการปรับยอด' });
    if (!note) return res.status(400).json({ error: 'กรุณาใส่รายละเอียดการปรับยอด' });
    if (note.length > 300) return res.status(400).json({ error: 'รายละเอียดยาวเกิน 300 ตัวอักษร' });

    const pool = getPool();
    const tx = pool.transaction();
    try {
        await tx.begin();
        const cur = await tx.request().input('id', sql.Int, id)
            .query(`SELECT CurrentStock FROM dbo.Stock_Products WITH (UPDLOCK, ROWLOCK) WHERE ProductID = @id`);
        if (!cur.recordset.length) { await tx.rollback(); return res.status(404).json({ error: 'ไม่พบสินค้า' }); }
        const before = Number(cur.recordset[0].CurrentStock) || 0;
        const diff = newQty - before;
        if (diff === 0) { await tx.rollback(); return res.status(400).json({ error: 'จำนวนเท่าเดิม ไม่มีการเปลี่ยนแปลง' }); }

        await tx.request().input('id', sql.Int, id).input('q', sql.Int, newQty)
            .query(`UPDATE dbo.Stock_Products SET CurrentStock = @q WHERE ProductID = @id`);
        await tx.request()
            .input('ProductID', sql.Int, id)
            .input('Qty', sql.Int, diff)
            .input('RefInfo', sql.NVarChar, `ADJ: ${reason} | ${note} (${before} → ${newQty})`)
            .input('UserID', sql.VarChar, userId)
            .input('TransDate', sql.DateTime, new Date())
            .query(`INSERT INTO dbo.Stock_Transactions (ProductID, TransType, Qty, RefInfo, UserID, TransDate)
                    VALUES (@ProductID, 'ADJ', @Qty, @RefInfo, @UserID, @TransDate)`);
        await tx.commit();
        res.json({ success: true, before, after: newQty, diff });
    } catch (err) {
        try { await tx.rollback(); } catch { /* ignore */ }
        console.error('[Adjust] error:', err.message);
        res.status(500).json({ error: 'ปรับยอดไม่สำเร็จ' });
    }
};
