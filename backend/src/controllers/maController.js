import { sql, getPool } from '../config/db.js';

// สถานะการต่ออายุ / จัดซื้อ (แยกจาก Status ของสัญญา) — null = ยังไม่ดำเนินการ
const RENEWAL_STATUSES = ['QUOTATION', 'PR_CREATED', 'WAITING_PO', 'PO_ISSUED'];
const normalizeRenewal = (v) => (v === undefined || v === null || v === '') ? null : v;
const isValidRenewal = (v) => v === null || RENEWAL_STATUSES.includes(v);

// GET all MA Items (with optional category filter)
export const getMAItems = async (req, res) => {
    try {
        const pool = getPool();
        const { category } = req.query;
        let query = `
            SELECT m.*, v.VendorName, v.ContactInfo AS VendorContact
            FROM dbo.MA_Items m
            LEFT JOIN dbo.Stock_Vendors v ON m.VendorID = v.VendorID
            WHERE m.IsDeleted = 0
        `;
        if (category) {
            query += ` AND m.Category = @Category`;
        }
        query += ` ORDER BY m.EndDate ASC`;

        const request = pool.request();
        if (category) {
            request.input('Category', sql.NVarChar, category);
        }
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get MA Items Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET single MA Item by ID
export const getMAItemById = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('ItemID', sql.Int, req.params.id)
            .query(`
                SELECT m.*, v.VendorName, v.ContactInfo AS VendorContact
                FROM dbo.MA_Items m
                LEFT JOIN dbo.Stock_Vendors v ON m.VendorID = v.VendorID
                WHERE m.ItemID = @ItemID AND m.IsDeleted = 0
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Get MA Item Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// CREATE MA Item
export const createMAItem = async (req, res) => {
    const {
        Category, SubType, ItemName, Brand, SerialNumber,
        ServiceType, ServiceNumber, LicenseQty, PONumber,
        LocationName, Price, VendorID, StartDate, EndDate,
        // ── NEW: Rental contract fields ──
        ContractEndDate, POCycle,
        RenewalStatus, PRNumber, NewPONumber,
        Status, Remark, CreatedBy
    } = req.body;

    if (!Category || !ItemName) {
        return res.status(400).json({ error: 'Category and ItemName are required' });
    }
    const renewal = normalizeRenewal(RenewalStatus);
    if (!isValidRenewal(renewal)) {
        return res.status(400).json({ error: `Invalid RenewalStatus: ${RenewalStatus}` });
    }

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('Category', sql.NVarChar, Category)
            .input('SubType', sql.NVarChar, SubType || null)
            .input('ItemName', sql.NVarChar, ItemName)
            .input('Brand', sql.NVarChar, Brand || null)
            .input('SerialNumber', sql.NVarChar, SerialNumber || null)
            .input('ServiceType', sql.NVarChar, ServiceType || null)
            .input('ServiceNumber', sql.NVarChar, ServiceNumber || null)
            .input('LicenseQty', sql.Int, LicenseQty || 0)
            .input('PONumber', sql.NVarChar, PONumber || null)
            .input('LocationName', sql.NVarChar, LocationName || null)
            .input('Price', sql.Decimal(18, 2), Price || 0)
            .input('VendorID', sql.Int, VendorID || null)
            .input('StartDate', sql.Date, StartDate || null)
            .input('EndDate', sql.Date, EndDate || null)
            // ── NEW ──
            .input('ContractEndDate', sql.Date, ContractEndDate || null)
            .input('POCycle', sql.NVarChar, POCycle || null)
            .input('RenewalStatus', sql.NVarChar, renewal)
            .input('PRNumber', sql.NVarChar, PRNumber || null)
            .input('NewPONumber', sql.NVarChar, NewPONumber || null)
            .input('Status', sql.NVarChar, Status || 'Active')
            .input('Remark', sql.NVarChar, Remark || null)
            .input('CreatedBy', sql.NVarChar, CreatedBy || null)
            .query(`
                INSERT INTO dbo.MA_Items
                (Category, SubType, ItemName, Brand, SerialNumber, ServiceType, ServiceNumber,
                 LicenseQty, PONumber, LocationName, Price, VendorID, StartDate, EndDate,
                 ContractEndDate, POCycle,
                 RenewalStatus, PRNumber, NewPONumber, RenewalUpdatedAt, RenewalUpdatedBy,
                 Status, Remark, CreatedBy, CreatedAt, UpdatedAt)
                VALUES
                (@Category, @SubType, @ItemName, @Brand, @SerialNumber, @ServiceType, @ServiceNumber,
                 @LicenseQty, @PONumber, @LocationName, @Price, @VendorID, @StartDate, @EndDate,
                 @ContractEndDate, @POCycle,
                 @RenewalStatus, @PRNumber, @NewPONumber,
                 CASE WHEN @RenewalStatus IS NULL THEN NULL ELSE GETDATE() END,
                 CASE WHEN @RenewalStatus IS NULL THEN NULL ELSE @CreatedBy END,
                 @Status, @Remark, @CreatedBy, GETDATE(), GETDATE());
                SELECT SCOPE_IDENTITY() AS ItemID;
            `);
        res.json({ success: true, ItemID: result.recordset[0].ItemID });
    } catch (err) {
        console.error('Create MA Item Error:', err);
        res.status(500).json({ error: err.message });
    }
};

export const updateMAItem = async (req, res) => {
    const { id } = req.params;
    const {
        Category, SubType, ItemName, Brand, SerialNumber,
        ServiceType, ServiceNumber, LicenseQty, PONumber,
        LocationName, Price, VendorID, StartDate, EndDate,
        // ── NEW: Rental contract fields ──
        ContractEndDate, POCycle,
        RenewalStatus, PRNumber, NewPONumber,
        Status, Remark, UpdatedBy
    } = req.body;
    const renewal = normalizeRenewal(RenewalStatus);
    if (!isValidRenewal(renewal)) {
        return res.status(400).json({ error: `Invalid RenewalStatus: ${RenewalStatus}` });
    }

    try {
        const pool = getPool();
        await pool.request()
            .input('ItemID', sql.Int, id)
            .input('Category', sql.NVarChar, Category)
            .input('SubType', sql.NVarChar, SubType || null)
            .input('ItemName', sql.NVarChar, ItemName)
            .input('Brand', sql.NVarChar, Brand || null)
            .input('SerialNumber', sql.NVarChar, SerialNumber || null)
            .input('ServiceType', sql.NVarChar, ServiceType || null)
            .input('ServiceNumber', sql.NVarChar, ServiceNumber || null)
            .input('LicenseQty', sql.Int, LicenseQty || 0)
            .input('PONumber', sql.NVarChar, PONumber || null)
            .input('LocationName', sql.NVarChar, LocationName || null)
            .input('Price', sql.Decimal(18, 2), Price || 0)
            .input('VendorID', sql.Int, VendorID || null)
            .input('StartDate', sql.Date, StartDate || null)
            .input('EndDate', sql.Date, EndDate || null)
            // ── NEW ──
            .input('ContractEndDate', sql.Date, ContractEndDate || null)
            .input('POCycle', sql.NVarChar, POCycle || null)
            .input('RenewalStatus', sql.NVarChar, renewal)
            .input('PRNumber', sql.NVarChar, PRNumber || null)
            .input('NewPONumber', sql.NVarChar, NewPONumber || null)
            .input('Status', sql.NVarChar, Status || 'Active')
            .input('Remark', sql.NVarChar, Remark || null)
            .input('UpdatedBy', sql.NVarChar, UpdatedBy || null)
            .query(`
                UPDATE dbo.MA_Items SET
                    Category = @Category, SubType = @SubType, ItemName = @ItemName,
                    Brand = @Brand, SerialNumber = @SerialNumber,
                    ServiceType = @ServiceType, ServiceNumber = @ServiceNumber,
                    LicenseQty = @LicenseQty, PONumber = @PONumber,
                    LocationName = @LocationName, Price = @Price, VendorID = @VendorID,
                    StartDate = @StartDate, EndDate = @EndDate,
                    ContractEndDate = @ContractEndDate, POCycle = @POCycle,
                    RenewalUpdatedAt = CASE WHEN ISNULL(RenewalStatus, '') <> ISNULL(@RenewalStatus, '') THEN GETDATE() ELSE RenewalUpdatedAt END,
                    RenewalUpdatedBy = CASE WHEN ISNULL(RenewalStatus, '') <> ISNULL(@RenewalStatus, '') THEN @UpdatedBy ELSE RenewalUpdatedBy END,
                    RenewalStatus = @RenewalStatus, PRNumber = @PRNumber, NewPONumber = @NewPONumber,
                    Status = @Status, Remark = @Remark,
                    UpdatedAt = GETDATE()
                WHERE ItemID = @ItemID
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('Update MA Item Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE MA Item — soft delete: ซ่อนจากระบบ แต่ไม่ลบแถวออกจากฐานข้อมูล
export const deleteMAItem = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();
        await pool.request()
            .input('ItemID', sql.Int, id)
            .query('UPDATE dbo.MA_Items SET IsDeleted = 1, DeletedAt = GETDATE() WHERE ItemID = @ItemID AND IsDeleted = 0');
        res.json({ success: true });
    } catch (err) {
        console.error('Delete MA Item Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// UPDATE Status only
export const updateMAStatus = async (req, res) => {
    const { id } = req.params;
    const { Status } = req.body;
    if (!Status) {
        return res.status(400).json({ error: 'Status is required' });
    }
    try {
        const pool = getPool();
        await pool.request()
            .input('ItemID', sql.Int, id)
            .input('Status', sql.NVarChar, Status)
            .query('UPDATE dbo.MA_Items SET Status = @Status, UpdatedAt = GETDATE() WHERE ItemID = @ItemID');
        res.json({ success: true });
    } catch (err) {
        console.error('Update MA Status Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// UPDATE Renewal (procurement) status only — ใช้จากปุ่ม "สถานะต่ออายุ" ในหน้า detail
export const updateMARenewal = async (req, res) => {
    const { id } = req.params;
    const { RenewalStatus, PRNumber, NewPONumber, UpdatedBy } = req.body;
    const renewal = normalizeRenewal(RenewalStatus);
    if (!isValidRenewal(renewal)) {
        return res.status(400).json({ error: `Invalid RenewalStatus: ${RenewalStatus}` });
    }
    try {
        const pool = getPool();
        const request = pool.request()
            .input('ItemID', sql.Int, id)
            .input('RenewalStatus', sql.NVarChar, renewal)
            .input('UpdatedBy', sql.NVarChar, UpdatedBy || null);
        // ส่ง PRNumber / NewPONumber มาเฉพาะเมื่อต้องการแก้ (undefined = คงค่าเดิม)
        let extra = '';
        if (PRNumber !== undefined) { request.input('PRNumber', sql.NVarChar, PRNumber || null); extra += ', PRNumber = @PRNumber'; }
        if (NewPONumber !== undefined) { request.input('NewPONumber', sql.NVarChar, NewPONumber || null); extra += ', NewPONumber = @NewPONumber'; }
        await request.query(`
            UPDATE dbo.MA_Items SET
                RenewalUpdatedAt = CASE WHEN ISNULL(RenewalStatus, '') <> ISNULL(@RenewalStatus, '') THEN GETDATE() ELSE RenewalUpdatedAt END,
                    RenewalUpdatedBy = CASE WHEN ISNULL(RenewalStatus, '') <> ISNULL(@RenewalStatus, '') THEN @UpdatedBy ELSE RenewalUpdatedBy END,
                RenewalStatus = @RenewalStatus${extra},
                UpdatedAt = GETDATE()
            WHERE ItemID = @ItemID AND IsDeleted = 0
        `);
        res.json({ success: true });
    } catch (err) {
        console.error('Update MA Renewal Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// COMPLETE RENEWAL — ปุ่ม "ต่ออายุเสร็จ"
// ใส่วันที่/PO/ราคาของรอบใหม่, Status → Active, ล้างสถานะต่ออายุ + PR + PO ใหม่
export const completeMARenewal = async (req, res) => {
    const { id } = req.params;
    const { StartDate, EndDate, PONumber, Price, UpdatedBy } = req.body;
    if (!EndDate) {
        return res.status(400).json({ error: 'EndDate is required' });
    }
    if (StartDate && new Date(StartDate) > new Date(EndDate)) {
        return res.status(400).json({ error: 'StartDate must be before EndDate' });
    }
    try {
        const pool = getPool();
        const hasPrice = Price !== undefined && Price !== null && Price !== '';
        const result = await pool.request()
            .input('ItemID', sql.Int, id)
            .input('StartDate', sql.Date, StartDate || null)
            .input('EndDate', sql.Date, EndDate)
            .input('PONumber', sql.NVarChar, PONumber || null)
            .input('Price', sql.Decimal(18, 2), hasPrice ? Price : null)
            .input('UpdatedBy', sql.NVarChar, UpdatedBy || null)
            .query(`
                UPDATE dbo.MA_Items SET
                    StartDate = ISNULL(@StartDate, StartDate),
                    EndDate = @EndDate,
                    -- PO ที่กรอกมา > เลขที่ PO ใหม่ที่บันทึกไว้ > PO เดิม
                    PONumber = COALESCE(@PONumber, NewPONumber, PONumber),
                    Price = ISNULL(@Price, Price),
                    Status = 'Active',
                    RenewalStatus = NULL, PRNumber = NULL, NewPONumber = NULL,
                    RenewalUpdatedAt = GETDATE(), RenewalUpdatedBy = @UpdatedBy,
                    LastRenewedAt = GETDATE(), LastRenewedBy = @UpdatedBy,
                    UpdatedAt = GETDATE()
                WHERE ItemID = @ItemID AND IsDeleted = 0
            `);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Complete MA Renewal Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ─── MA TYPES (SubType Master) ───────────

// GET all MA Types
export const getMATypes = async (req, res) => {
    try {
        const pool = getPool();
        const { category } = req.query;
        let query = 'SELECT * FROM dbo.MA_Types WHERE IsActive = 1';
        const request = pool.request();
        if (category) {
            query += ' AND Category = @Category';
            request.input('Category', sql.NVarChar, category);
        }
        query += ' ORDER BY Category, SortOrder, TypeName';
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get MA Types Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// CREATE MA Type
export const createMAType = async (req, res) => {
    const { Category, TypeName, SortOrder } = req.body;
    if (!Category || !TypeName) {
        return res.status(400).json({ error: 'Category and TypeName are required' });
    }
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('Category', sql.NVarChar, Category)
            .input('TypeName', sql.NVarChar, TypeName.trim())
            .input('SortOrder', sql.Int, SortOrder || 0)
            .query(`
                INSERT INTO dbo.MA_Types (Category, TypeName, SortOrder)
                VALUES (@Category, @TypeName, @SortOrder);
                SELECT SCOPE_IDENTITY() AS TypeID;
            `);
        res.json({ success: true, TypeID: result.recordset[0].TypeID });
    } catch (err) {
        console.error('Create MA Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// UPDATE MA Type
export const updateMAType = async (req, res) => {
    const { id } = req.params;
    const { TypeName, SortOrder } = req.body;
    try {
        const pool = getPool();
        await pool.request()
            .input('TypeID', sql.Int, id)
            .input('TypeName', sql.NVarChar, TypeName.trim())
            .input('SortOrder', sql.Int, SortOrder || 0)
            .query('UPDATE dbo.MA_Types SET TypeName = @TypeName, SortOrder = @SortOrder WHERE TypeID = @TypeID');
        res.json({ success: true });
    } catch (err) {
        console.error('Update MA Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE MA Type (soft)
export const deleteMAType = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();
        await pool.request()
            .input('TypeID', sql.Int, id)
            .query('UPDATE dbo.MA_Types SET IsActive = 0 WHERE TypeID = @TypeID');
        res.json({ success: true });
    } catch (err) {
        console.error('Delete MA Type Error:', err);
        res.status(500).json({ error: err.message });
    }
};
