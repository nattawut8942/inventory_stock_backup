import { sql, getPool } from '../config/db.js';
import { captureClient } from '../services/clientInfo.js';
import { diffRows, getActor, withTx, loadItem, writeHistory } from '../services/maHistoryService.js';
import { insertRenewalAttachments, removeFiles } from './maAttachmentController.js';

// สถานะการต่ออายุ / จัดซื้อ (แยกจาก Status ของสัญญา) — null = ยังไม่ดำเนินการ
const RENEWAL_STATUSES = ['QUOTATION', 'PR_CREATED', 'WAITING_PO', 'PO_ISSUED'];
const normalizeRenewal = (v) => (v === undefined || v === null || v === '') ? null : v;
const isValidRenewal = (v) => v === null || RENEWAL_STATUSES.includes(v);

// MAC ที่ผู้ใช้พิมพ์เอง: ว่าง → null, ถูกต้อง → AA:BB:CC:DD:EE:FF, ผิดรูปแบบ → undefined
const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const normalizeMacInput = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const n = s.toUpperCase().replace(/-/g, ':');
    return MAC_RE.test(n) ? n : undefined;
};

// IP ที่ผู้ใช้พิมพ์เอง (IPv4): ว่าง → null, ถูกต้อง → คืนค่า, ผิดรูปแบบ → undefined
const IPV4_INPUT_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const normalizeIpInput = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    return IPV4_INPUT_RE.test(s) ? s : undefined;
};

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

// GET change log + renewal history of one item (read-only, newest first)
export const getMAHistory = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();
        const events = await pool.request()
            .input('ItemID', sql.Int, id)
            .query(`SELECT HistoryID, EventType, Changes, Note, ActorUser, ClientIP, ClientMAC, CreatedAt
                    FROM dbo.MA_History WHERE ItemID = @ItemID
                    ORDER BY CreatedAt DESC, HistoryID DESC`);
        const renewals = await pool.request()
            .input('ItemID', sql.Int, id)
            .query(`SELECT * FROM dbo.MA_RenewalHistory WHERE ItemID = @ItemID
                    ORDER BY CompletedAt DESC, RenewalID DESC`);
        // ไฟล์แนบของแต่ละรอบต่ออายุ
        const files = await pool.request()
            .input('ItemID', sql.Int, id)
            .query(`SELECT AttachmentID, RenewalID, Kind, FileName, FileSize, UploadedBy, UploadedAt
                    FROM dbo.MA_Attachments
                    WHERE ItemID = @ItemID AND RenewalID IS NOT NULL AND IsDeleted = 0
                    ORDER BY AttachmentID`);
        const byRenewal = {};
        for (const f of files.recordset) (byRenewal[f.RenewalID] = byRenewal[f.RenewalID] || []).push(f); // not ||= : the server runs an older Node
        res.json({
            events: events.recordset.map((e) => ({
                ...e,
                changes: e.Changes ? JSON.parse(e.Changes) : [],
            })),
            renewals: renewals.recordset.map((r) => ({ ...r, files: byRenewal[r.RenewalID] || [] })),
        });
    } catch (err) {
        console.error('Get MA History Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET /ma/history?limit=200&eventType=&q=  — ประวัติการเปลี่ยนแปลงของทุกรายการ (ใครทำอะไร)
export const getMAAllHistory = async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
    const eventType = ['CREATE', 'UPDATE', 'STATUS', 'RENEW_STEP', 'RENEW_COMPLETE', 'DELETE', 'ATTACH', 'DETACH'].includes(req.query.eventType)
        ? req.query.eventType : null;
    const q = String(req.query.q || '').trim();
    try {
        const result = await getPool().request()
            .input('eventType', sql.NVarChar(30), eventType)
            .input('q', sql.NVarChar(200), q ? `%${q}%` : null)
            .query(`SELECT TOP ${limit}
                        h.HistoryID, h.ItemID, h.EventType, h.Changes, h.Note, h.ActorUser,
                        h.ClientIP, h.ClientMAC, h.CreatedAt,
                        i.ItemName, i.Category, i.SubType, i.IsDeleted
                    FROM dbo.MA_History h
                    LEFT JOIN dbo.MA_Items i ON i.ItemID = h.ItemID
                    WHERE (@eventType IS NULL OR h.EventType = @eventType)
                      AND (@q IS NULL OR i.ItemName LIKE @q OR h.ActorUser LIKE @q)
                    ORDER BY h.CreatedAt DESC, h.HistoryID DESC`);
        res.json(result.recordset.map((e) => ({
            ...e,
            changes: e.Changes ? JSON.parse(e.Changes) : [],
        })));
    } catch (err) {
        console.error('Get MA All History Error:', err);
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
        Status, Remark, CreatedBy, MacAddress, IpAddress
    } = req.body;

    if (!Category || !ItemName) {
        return res.status(400).json({ error: 'Category and ItemName are required' });
    }
    const renewal = normalizeRenewal(RenewalStatus);
    if (!isValidRenewal(renewal)) {
        return res.status(400).json({ error: `Invalid RenewalStatus: ${RenewalStatus}` });
    }
    const mac = normalizeMacInput(MacAddress);
    if (mac === undefined) {
        return res.status(400).json({ error: 'MAC Address ไม่ถูกต้อง (รูปแบบ AA:BB:CC:DD:EE:FF)' });
    }
    const ipAddr = normalizeIpInput(IpAddress);
    if (ipAddr === undefined) {
        return res.status(400).json({ error: 'IP Address ไม่ถูกต้อง (รูปแบบ 192.168.1.10)' });
    }

    try {
        const actor = getActor(req);
        const createdBy = actor || CreatedBy || null;
        const client = await captureClient(req);
        const itemId = await withTx(async (tx) => {
            const result = await new sql.Request(tx)
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
                .input('IpAddress', sql.NVarChar(45), ipAddr)
                .input('MacAddress', sql.NVarChar(17), mac)
                .input('CreatedBy', sql.NVarChar, createdBy)
                .query(`
                    INSERT INTO dbo.MA_Items
                    (Category, SubType, ItemName, Brand, SerialNumber, ServiceType, ServiceNumber,
                     LicenseQty, PONumber, LocationName, Price, VendorID, StartDate, EndDate,
                     ContractEndDate, POCycle,
                     RenewalStatus, PRNumber, NewPONumber, RenewalUpdatedAt, RenewalUpdatedBy,
                     Status, Remark, CreatedBy, CreatedAt, UpdatedAt, MacAddress, IpAddress)
                    VALUES
                    (@Category, @SubType, @ItemName, @Brand, @SerialNumber, @ServiceType, @ServiceNumber,
                     @LicenseQty, @PONumber, @LocationName, @Price, @VendorID, @StartDate, @EndDate,
                     @ContractEndDate, @POCycle,
                     @RenewalStatus, @PRNumber, @NewPONumber,
                     CASE WHEN @RenewalStatus IS NULL THEN NULL ELSE GETDATE() END,
                     CASE WHEN @RenewalStatus IS NULL THEN NULL ELSE @CreatedBy END,
                     @Status, @Remark, @CreatedBy, GETDATE(), GETDATE(), @MacAddress, @IpAddress);
                    SELECT SCOPE_IDENTITY() AS ItemID;
                `);
            const newId = result.recordset[0].ItemID;
            const after = await loadItem(tx, newId);
            await writeHistory(tx, { itemId: newId, eventType: 'CREATE', changes: diffRows({}, after), actor, client });
            return newId;
        });
        res.json({ success: true, ItemID: itemId });
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
        Status, Remark, MacAddress, IpAddress
    } = req.body;
    const renewal = normalizeRenewal(RenewalStatus);
    if (!isValidRenewal(renewal)) {
        return res.status(400).json({ error: `Invalid RenewalStatus: ${RenewalStatus}` });
    }
    const mac = normalizeMacInput(MacAddress);
    if (mac === undefined) {
        return res.status(400).json({ error: 'MAC Address ไม่ถูกต้อง (รูปแบบ AA:BB:CC:DD:EE:FF)' });
    }
    const ipAddr = normalizeIpInput(IpAddress);
    if (ipAddr === undefined) {
        return res.status(400).json({ error: 'IP Address ไม่ถูกต้อง (รูปแบบ 192.168.1.10)' });
    }

    try {
        const actor = getActor(req);
        const client = await captureClient(req);
        const found = await withTx(async (tx) => {
            const before = await loadItem(tx, id);
            if (!before) return false;
            await new sql.Request(tx)
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
                .input('MacAddress', sql.NVarChar(17), mac)
                .input('IpAddress', sql.NVarChar(45), ipAddr)
                .input('UpdatedBy', sql.NVarChar, actor)
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
                        Status = @Status, Remark = @Remark, MacAddress = @MacAddress, IpAddress = @IpAddress,
                        UpdatedAt = GETDATE()
                    WHERE ItemID = @ItemID
                `);
            const after = await loadItem(tx, id);
            const changes = diffRows(before, after);
            if (changes.length) {
                await writeHistory(tx, { itemId: before.ItemID, eventType: 'UPDATE', changes, actor, client });
            }
            return true;
        });
        if (!found) return res.status(404).json({ error: 'Item not found' });
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
        const actor = getActor(req);
        const client = await captureClient(req);
        const found = await withTx(async (tx) => {
            const before = await loadItem(tx, id);
            if (!before) return false;
            await new sql.Request(tx)
                .input('ItemID', sql.Int, id)
                .input('DeletedBy', sql.NVarChar, actor)
                .query('UPDATE dbo.MA_Items SET IsDeleted = 1, DeletedAt = GETDATE(), DeletedBy = @DeletedBy WHERE ItemID = @ItemID AND IsDeleted = 0');
            await writeHistory(tx, { itemId: before.ItemID, eventType: 'DELETE', note: 'ลบรายการ (soft delete)', actor, client });
            return true;
        });
        if (!found) return res.status(404).json({ error: 'Item not found' });
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
        const actor = getActor(req);
        const client = await captureClient(req);
        const found = await withTx(async (tx) => {
            const before = await loadItem(tx, id);
            if (!before) return false;
            await new sql.Request(tx)
                .input('ItemID', sql.Int, id)
                .input('Status', sql.NVarChar, Status)
                .query('UPDATE dbo.MA_Items SET Status = @Status, UpdatedAt = GETDATE() WHERE ItemID = @ItemID');
            const after = await loadItem(tx, id);
            const changes = diffRows(before, after, ['Status']);
            if (changes.length) {
                await writeHistory(tx, { itemId: before.ItemID, eventType: 'STATUS', changes, actor, client });
            }
            return true;
        });
        if (!found) return res.status(404).json({ error: 'Item not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('Update MA Status Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// UPDATE Renewal (procurement) status only — ใช้จากปุ่ม "สถานะต่ออายุ" ในหน้า detail
export const updateMARenewal = async (req, res) => {
    const { id } = req.params;
    const { RenewalStatus, PRNumber, NewPONumber } = req.body;
    const renewal = normalizeRenewal(RenewalStatus);
    if (!isValidRenewal(renewal)) {
        return res.status(400).json({ error: `Invalid RenewalStatus: ${RenewalStatus}` });
    }
    try {
        const actor = getActor(req);
        const client = await captureClient(req);
        const found = await withTx(async (tx) => {
            const before = await loadItem(tx, id);
            if (!before) return false;
            const request = new sql.Request(tx)
                .input('ItemID', sql.Int, id)
                .input('RenewalStatus', sql.NVarChar, renewal)
                .input('UpdatedBy', sql.NVarChar, actor);
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
            const after = await loadItem(tx, id);
            const changes = diffRows(before, after, ['RenewalStatus', 'PRNumber', 'NewPONumber']);
            if (changes.length) {
                await writeHistory(tx, { itemId: before.ItemID, eventType: 'RENEW_STEP', changes, actor, client });
            }
            return true;
        });
        if (!found) return res.status(404).json({ error: 'Item not found' });
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
    const { StartDate, EndDate, PONumber, Price } = req.body;
    const files = req.files || [];
    // ไฟล์ถูกเขียนลงดิสก์แล้วตั้งแต่ middleware → ถ้าไม่ผ่าน ต้องลบทิ้ง
    const fail = (msg) => { removeFiles(files); return res.status(400).json({ error: msg }); };
    if (files.length === 0) return fail('ต้องแนบเอกสารอย่างน้อย 1 ไฟล์ (ใบ QT / PR / PO)');
    if (!EndDate) return fail('EndDate is required');
    if (StartDate && new Date(StartDate) > new Date(EndDate)) return fail('StartDate must be before EndDate');
    let kinds = [];
    try { kinds = JSON.parse(req.body.Kinds || '[]'); } catch { kinds = []; }
    if (!kinds.includes('PO')) return fail('ต้องแนบเอกสาร PO อย่างน้อย 1 ไฟล์ (เลือกประเภท PO)');
    try {
        const actor = getActor(req);
        const client = await captureClient(req);
        const hasPrice = Price !== undefined && Price !== null && Price !== '';
        const found = await withTx(async (tx) => {
            const before = await loadItem(tx, id);
            if (!before) return false;
            await new sql.Request(tx)
                .input('ItemID', sql.Int, id)
                .input('StartDate', sql.Date, StartDate || null)
                .input('EndDate', sql.Date, EndDate)
                .input('PONumber', sql.NVarChar, PONumber || null)
                .input('Price', sql.Decimal(18, 2), hasPrice ? Number(Price) : null)
                .input('UpdatedBy', sql.NVarChar, actor)
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
            const after = await loadItem(tx, id);
            // ประวัติรอบการต่ออายุ: เก็บค่าก่อน/หลังของรอบนี้ไว้ทั้งหมด
            const rh = await new sql.Request(tx)
                .input('ItemID', sql.Int, before.ItemID)
                .input('OldStartDate', sql.Date, before.StartDate)
                .input('OldEndDate', sql.Date, before.EndDate)
                .input('NewStartDate', sql.Date, after.StartDate)
                .input('NewEndDate', sql.Date, after.EndDate)
                .input('OldPrice', sql.Decimal(18, 2), before.Price)
                .input('NewPrice', sql.Decimal(18, 2), after.Price)
                .input('OldPONumber', sql.NVarChar(100), before.PONumber)
                .input('NewPONumber', sql.NVarChar(100), after.PONumber)
                .input('PRNumber', sql.NVarChar(100), before.PRNumber)
                .input('CompletedBy', sql.NVarChar(50), actor)
                .input('ClientIP', sql.NVarChar(45), client.ip)
                .input('ClientMAC', sql.NVarChar(17), client.mac)
                .query(`INSERT INTO dbo.MA_RenewalHistory
                        (ItemID, OldStartDate, OldEndDate, NewStartDate, NewEndDate, OldPrice, NewPrice,
                         OldPONumber, NewPONumber, PRNumber, CompletedBy, ClientIP, ClientMAC)
                        VALUES (@ItemID, @OldStartDate, @OldEndDate, @NewStartDate, @NewEndDate, @OldPrice, @NewPrice,
                                @OldPONumber, @NewPONumber, @PRNumber, @CompletedBy, @ClientIP, @ClientMAC);
                        SELECT SCOPE_IDENTITY() AS RenewalID;`);
            const renewalId = rh.recordset[0].RenewalID;
            await insertRenewalAttachments(tx, { itemId: before.ItemID, renewalId, files, kinds, actor, client });
            const changes = diffRows(before, after);
            await writeHistory(tx, { itemId: before.ItemID, eventType: 'RENEW_COMPLETE', changes, actor, client });
            return true;
        });
        if (!found) { removeFiles(files); return res.status(404).json({ error: 'Item not found' }); }
        res.json({ success: true });
    } catch (err) {
        removeFiles(files);
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
