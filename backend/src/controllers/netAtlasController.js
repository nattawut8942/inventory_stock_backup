// NetAtlas — ผังเครือข่ายและอุปกรณ์ (แยกจากผังอื่นทั้งหมดในระบบ)
// - Layouts (ผัง/ชั้น/ห้อง) จัดการในหน้า Management (สิทธิ์ mgmt-netatlas-layouts)
// - Devices (อุปกรณ์ L2/L1/AP) จัดการในหน้า NetAtlas (สิทธิ์ netatlas)
// - uplink ต้องอยู่ในผังเดียวกัน, ห้ามชี้ตัวเอง, ห้ามวนลูป (A→B→A)
// - ลบ parent: ล้าง uplink ของลูกในธุรกรรมเดียวกัน และคืนจำนวนลูกที่ได้รับผลกระทบ
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { sql, getPool } from '../config/db.js';
import { getJwtSecret } from '../config/jwtSecret.js';
import { loadTypeMap } from './netAtlasDeviceTypeController.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const NETATLAS_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/netatlas');
// path ที่ browser เรียกผ่าน server.js (ต้องตรงกับ app.use ใน server.js)
export const NETATLAS_PUBLIC_PREFIX = '/ITinventory/uploads/netatlas';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// SVG ไม่รับ: เสิร์ฟจาก origin เดียวกันแล้วอาจมี script ฝังอยู่
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

if (!fs.existsSync(NETATLAS_UPLOAD_DIR)) fs.mkdirSync(NETATLAS_UPLOAD_DIR, { recursive: true });

// ── helpers ──────────────────────────────────────────────────────────────
const isId = (v) => /^\d+$/.test(String(v));
const toId = (v) => (isId(v) ? parseInt(v, 10) : null);
const text = (v, max) => {
    const s = v == null ? '' : String(v).trim();
    return s ? s.slice(0, max) : null;
};
const clampPct = (v, fallback = 50) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
};
const actorOf = (req) => {
    let user = req.user || null;
    if (!user) {
        try {
            const raw = req.headers['authorization'];
            if (raw) user = jwt.verify(raw.startsWith('Bearer ') ? raw.slice(7) : raw, getJwtSecret());
        } catch { user = null; }
    }
    return text(user?.username || user?.empcode, 100);
};
const floorplanUrl = (file) => (file ? `${NETATLAS_PUBLIC_PREFIX}/${encodeURIComponent(file)}` : null);

// คืน { error } ถ้าข้อมูลไม่ถูกต้อง, ไม่งั้นคืนค่าที่ทำความสะอาดแล้ว
// ตรวจข้อมูลอุปกรณ์ตาม master ประเภท (types: Map จาก loadTypeMap)
const validateDevice = (body, types) => {
    const name = text(body.name, 120);
    const deviceType = String(body.deviceType || body.type || '').toUpperCase();
    const type = types.get(deviceType);
    const location = text(body.location, 200);
    const srcType = types.get(String(body.deviceType || body.type || '').toUpperCase());
    if (!name && !srcType?.requiresSource) return { error: 'กรุณาระบุชื่ออุปกรณ์' };
    if (!type || !type.isActive) return { error: 'ประเภทอุปกรณ์ไม่ถูกต้องหรือถูกปิดใช้งาน' };
    if (!location) return { error: 'กรุณาระบุจุดติดตั้ง / ห้อง' };
    let ip = text(body.ipAddress ?? body.ip, 45) || 'N/A';
    if (ip !== 'N/A' && !IPV4.test(ip)) return { error: 'IP Address ต้องเป็นรูปแบบ IPv4 หรือ N/A' };
    // ประเภทที่มีพอร์ต ต้องระบุจำนวนพอร์ต (ใช้จำกัดจำนวนอุปกรณ์ที่เสียบได้)
    let portCount = null;
    if (type.hasPorts) {
        // จำนวนพอร์ตไม่บังคับ: ถ้ากรอกต้องอยู่ระหว่าง 1–96 ถ้าไม่กรอกจะไม่จำกัดหมายเลขพอร์ต
        if (body.portCount != null && String(body.portCount).trim() !== '') {
            const pc = toId(body.portCount);
            if (pc == null || pc < 1 || pc > 96) return { error: `จำนวนพอร์ตของ ${type.label} ต้องอยู่ระหว่าง 1–96` };
            portCount = pc;
        }
    }
    return {
        value: {
            name,
            deviceType,
            portCount,
            location,
            model: text(body.model, 200),
            ipAddress: ip,
            note: text(body.note, 500),
            macAddress: text(body.macAddress, 40),
            fixAsset: text(body.fixAsset, 60),
            portPrefix: text(body.portPrefix, 40),
            uplinkFromPort: text(body.uplinkFromPort, 50),
            uplinkToPort: text(body.uplinkToPort, 50),
        },
    };
};

// ตรวจ uplink: parent ต้องอยู่ผังเดียวกัน, ไม่ใช่ตัวเอง, และไม่ทำให้เกิดวงจร
const checkUplink = async (pool, layoutId, selfId, parentId, parentPortNo, types, fromName) => {
    if (parentId == null) return null;
    if (selfId != null && parentId === selfId) return 'อุปกรณ์ไม่สามารถต่อพ่วงตัวเองได้';
    const parent = await pool.request()
        .input('id', sql.Int, parentId)
        .query('SELECT DeviceID, Name, LayoutID, DeviceType, PortCount, OwnPortNo, UplinkDeviceID FROM dbo.NetAtlas_Devices WHERE DeviceID = @id');
    const row = parent.recordset[0];
    if (!row) return 'ไม่พบอุปกรณ์ต้นทาง (parent) ที่เลือก';
    if (row.LayoutID !== layoutId) return 'อุปกรณ์ต้นทางต้องอยู่ในผังเดียวกัน';
    const parentType = types.get(row.DeviceType);
    if (!parentType || !parentType.canBeParent) return `${parentType?.label || row.DeviceType} เป็นอุปกรณ์ต้นทางให้อุปกรณ์อื่นต่อพ่วงไม่ได้`;
    // ต้องเลือกพอร์ตของ parent และต้องอยู่ในช่วงจำนวนพอร์ตที่มี
    // ต้องระบุพอร์ตของต้นทางอย่างน้อยหนึ่งอย่าง: ชื่อพอร์ต (เช่น Gi1/0/5) หรือหมายเลขพอร์ต
    if (parentPortNo == null && !fromName) return `กรุณาระบุพอร์ตของ ${row.Name} (ชื่อพอร์ตหรือหมายเลข)`;
    if (parentPortNo != null && row.PortCount && (parentPortNo < 1 || parentPortNo > row.PortCount)) {
        return `พอร์ต ${parentPortNo} ไม่มีใน ${row.Name} (มีพอร์ต 1–${row.PortCount})`;
    }
    const taken = parentPortNo == null ? { recordset: [] } : await pool.request()
        .input('p', sql.Int, parentId)
        .input('port', sql.Int, parentPortNo)
        .input('self', sql.Int, selfId ?? 0)
        .query(`SELECT TOP 1 Name FROM dbo.NetAtlas_Devices
                WHERE UplinkDeviceID = @p AND ParentPortNo = @port AND DeviceID <> @self`);
    if (parentPortNo != null && row.OwnPortNo === parentPortNo) return `พอร์ต ${parentPortNo} ของ ${row.Name} ถูกใช้เชื่อมขึ้นไปหาอุปกรณ์อื่นอยู่แล้ว`;
    if (taken.recordset[0]) return `พอร์ต ${parentPortNo} ของ ${row.Name} ถูกใช้โดย "${taken.recordset[0].Name}" แล้ว`;
    // เดินขึ้นไปหาต้นทางของ parent ถ้าเจอ selfId แปลว่าจะเกิดวงจร
    let cursor = row.UplinkDeviceID;
    for (let depth = 0; cursor != null && depth < 100; depth++) {
        if (cursor === selfId) return 'การเชื่อมต่อนี้จะทำให้เกิดวงจร (A → B → A) ไม่สามารถบันทึกได้';
        const r = await pool.request().input('id', sql.Int, cursor)
            .query('SELECT UplinkDeviceID FROM dbo.NetAtlas_Devices WHERE DeviceID = @id');
        cursor = r.recordset[0]?.UplinkDeviceID ?? null;
    }
    return null;
};

// พอร์ตของอุปกรณ์นี้เองที่ใช้เชื่อมขึ้นไปหา parent (เฉพาะประเภทที่มีพอร์ต)
// ต้องอยู่ในช่วง 1..จำนวนพอร์ต และต้องไม่ซ้ำกับพอร์ตที่อุปกรณ์ลูกเสียบอยู่
const checkOwnPort = async (pool, selfId, type, portCount, ownPortNo, parentId) => {
    if (parentId == null || !type?.hasPorts) return { value: null };
    if (ownPortNo == null) return { value: null }; // ไม่บังคับ: ไม่ระบุพอร์ตของตัวเองก็เชื่อมได้
    if (ownPortNo < 1 || (portCount && ownPortNo > portCount)) return { error: `พอร์ต ${ownPortNo} ไม่มีในอุปกรณ์นี้ (มีพอร์ต 1–${portCount ?? '?'})` };
    if (selfId != null) {
        const used = await pool.request()
            .input('self', sql.Int, selfId)
            .input('own', sql.Int, ownPortNo)
            .query('SELECT TOP 1 Name FROM dbo.NetAtlas_Devices WHERE UplinkDeviceID = @self AND ParentPortNo = @own');
        if (used.recordset[0]) return { error: `พอร์ต ${ownPortNo} ของอุปกรณ์นี้ถูกใช้โดย "${used.recordset[0].Name}" แล้ว` };
    }
    return { value: ownPortNo };
};

// ตารางต้นทางของเครื่องจริง: PC = info_pc_inventory, MO (Monitor) = info_mo_inventory
const SOURCE_TABLE = { PC: 'dbo.info_pc_inventory', MO: 'dbo.info_mo_inventory' };
// ใช้งานจริง = สถานะ Active และยังไม่ถูกทิ้ง
const IN_USE_SQL = (alias) => `${alias}.pc_status = 'Active' AND ${alias}.disposal_status IS NULL`;

// อ่านข้อมูลเครื่องจากตารางต้นทาง (requireInUse = เฉพาะเครื่องที่ใช้งานอยู่)
const lookupSource = async (pool, table, hostname, requireInUse) => {
    if (!SOURCE_TABLE[table] || !hostname) return null;
    const r = await pool.request().input('h', sql.NVarChar(100), hostname).query(`
        SELECT TOP 1 hostname, ip_address, adapter_type, model FROM ${SOURCE_TABLE[table]} t
        WHERE t.hostname = @h ${requireInUse ? 'AND ' + IN_USE_SQL('t') : ''}`);
    const x = r.recordset[0];
    if (!x) return null;
    return { table, hostname: x.hostname, ip: x.ip_address || null, adapter: x.adapter_type || null, model: x.model || null };
};

// ตรวจข้อมูลต้นทางของอุปกรณ์ (ประเภทที่ต้องผูกกับเครื่องจริง)
// คืน { value } = ข้อมูลต้นทาง หรือ { value: null } ถ้าไม่ใช่ประเภทนี้ หรือ { error }
const resolveSource = async (pool, type, body, current) => {
    if (current?.SourceHostname) {
        const src = await lookupSource(pool, current.SourceTable, current.SourceHostname, false);
        return { value: { table: current.SourceTable, hostname: current.SourceHostname, adapter: src?.adapter ?? null, ip: src?.ip ?? null } };
    }
    if (!type?.requiresSource) return { value: null };
    const table = String(body.sourceTable || '').toUpperCase();
    const hostname = text(body.sourceHostname, 100);
    if (!SOURCE_TABLE[table]) return { error: 'กรุณาเลือกเครื่องจาก PC Inventory หรือ Monitor Inventory' };
    if (!hostname) return { error: 'กรุณาเลือกเครื่องที่จะวาง' };
    const src = await lookupSource(pool, table, hostname, true);
    if (!src) return { error: `เครื่อง "${hostname}" ไม่พบในรายการที่ใช้งานอยู่` };
    if (src.adapter !== 'Ethernet') return { error: `เครื่อง "${hostname}" ไม่ได้ใช้สาย Ethernet (รายการนี้รับเฉพาะ Ethernet)` };
    const placed = await pool.request().input('h', sql.NVarChar(100), hostname)
        .query('SELECT TOP 1 Name, LayoutID FROM dbo.NetAtlas_Devices WHERE SourceHostname = @h');
    if (placed.recordset[0]) return { error: `เครื่อง "${hostname}" ถูกวางอยู่ในผังแล้ว` };
    return { value: { table, hostname: src.hostname, adapter: src.adapter, ip: src.ip } };
};

// รายการเครื่องจริงให้เลือก (ยังไม่ถูกวางในผังใด)
export async function listSources(req, res) {
    const q = String(req.query.q || '').trim();
    const pat = `%${q.replace(/[%_\\[]/g, '')}%`;
    try {
        const pool = getPool();
        const pc = await pool.request().input('q', sql.NVarChar(120), pat).query(`
            SELECT TOP 60 'PC' AS SourceTable, t.hostname, t.ip_address, t.adapter_type, t.[user], t.model
            FROM dbo.info_pc_inventory t
            WHERE ${IN_USE_SQL('t')} AND t.adapter_type = 'Ethernet' AND t.hostname LIKE @q
              AND NOT EXISTS (SELECT 1 FROM dbo.NetAtlas_Devices d WHERE d.SourceHostname = t.hostname)
            ORDER BY t.hostname`);
        const mo = await pool.request().input('q', sql.NVarChar(120), pat).query(`
            SELECT TOP 60 'MO' AS SourceTable, t.hostname, t.ip_address, t.adapter_type, CAST(NULL AS NVARCHAR(100)) AS [user], t.model
            FROM dbo.info_mo_inventory t
            WHERE ${IN_USE_SQL('t')} AND t.adapter_type = 'Ethernet' AND t.hostname LIKE @q
              AND NOT EXISTS (SELECT 1 FROM dbo.NetAtlas_Devices d WHERE d.SourceHostname = t.hostname)
            ORDER BY t.hostname`);
        const map = (x) => ({ table: x.SourceTable, hostname: x.hostname, ip: x.ip_address || null, adapter: x.adapter_type || null, user: x.user || null, model: x.model || null });
        res.json({ success: true, data: [...pc.recordset, ...mo.recordset].map(map) });
    } catch (err) { serverError(res, 'listSources', err); }
}

// หมายเหตุรายพอร์ต: [{ portNo, remark }] (อ่านจาก FOR JSON ใน DEVICE_SELECT)
const parsePortRemarks = (json) => {
    if (!json) return [];
    try {
        return JSON.parse(json).map((x) => ({ portNo: x.n, remark: x.r }));
    } catch { return []; }
};

const mapDevice = (r) => ({
    id: r.DeviceID,
    portRemarks: parsePortRemarks(r.PortRemarksJson),
    layoutId: r.LayoutID,
    name: r.Name,
    type: r.DeviceType,
    model: r.Model || '',
    ip: r.SrcIp || r.IpAddress || 'N/A',
    location: r.Location,
    note: r.Note || '',
    portCount: r.PortCount ?? null,
    uplinkDeviceId: r.UplinkDeviceID ?? null,
    parentPortNo: r.ParentPortNo ?? null,
    ownPortNo: r.OwnPortNo ?? null,
    photoUrl: r.PhotoFile ? `/ITinventory/uploads/netatlas-devices/${encodeURIComponent(r.PhotoFile)}` : null,
    macAddress: r.SrcMac || r.MacAddress || null,
    fixAsset: r.SrcFixAsset || r.FixAsset || null,
    portPrefix: r.PortPrefix || null,
    sitePhotoUrl: r.SitePhotoFile ? `/ITinventory/uploads/netatlas-devices/${encodeURIComponent(r.SitePhotoFile)}` : null,
    source: r.SourceTable ? { table: r.SourceTable, hostname: r.SourceHostname, adapter: r.SrcAdapter || null, user: r.SrcUser || null } : null,
    uplinkFromPort: r.UplinkFromPort || '',
    uplinkToPort: r.UplinkToPort || '',
    x: Number(r.PosX),
    y: Number(r.PosY),
    updatedAt: r.UpdatedAt || r.CreatedAt,
});

// ขนาดผังเป็น px (1..10000) หรือ null ถ้าไม่ได้ส่งมา
const dimOrNull = (v) => { const n = toId(v); return n != null && n >= 1 && n <= 10000 ? n : null; };

const mapLayout = (r, deviceCount) => ({
    id: r.LayoutID,
    name: r.Name,
    floorplanUrl: floorplanUrl(r.FloorplanFile),
    deviceCount: deviceCount ?? undefined,
    sortOrder: r.SortOrder,
    width: r.Width ?? null,
    height: r.Height ?? null,
});

const serverError = (res, label, err) => {
    console.error(`[NetAtlas] ${label}:`, err);
    res.status(500).json({ success: false, error: err.message });
};

// ── Layouts ──────────────────────────────────────────────────────────────
export async function listLayouts(req, res) {
    try {
        const r = await getPool().request().query(`
            SELECT l.LayoutID, l.Name, l.FloorplanFile, l.SortOrder, l.Width, l.Height,
                   (SELECT COUNT(*) FROM dbo.NetAtlas_Devices d WHERE d.LayoutID = l.LayoutID) AS DeviceCount
            FROM dbo.NetAtlas_Layouts l
            ORDER BY l.SortOrder, l.LayoutID`);
        res.json({ success: true, data: r.recordset.map((x) => mapLayout(x, x.DeviceCount)) });
    } catch (err) { serverError(res, 'listLayouts', err); }
}

export async function createLayout(req, res) {
    const name = text(req.body?.name, 120);
    if (!name) return res.status(400).json({ success: false, error: 'กรุณาระบุชื่อผัง' });
    try {
        const r = await getPool().request()
            .input('name', sql.NVarChar(120), name)
            .input('by', sql.NVarChar(100), actorOf(req))
            .query(`INSERT INTO dbo.NetAtlas_Layouts (Name, SortOrder, CreatedBy)
                    OUTPUT INSERTED.LayoutID, INSERTED.Name, INSERTED.FloorplanFile, INSERTED.SortOrder, INSERTED.Width, INSERTED.Height
                    VALUES (@name, (SELECT ISNULL(MAX(SortOrder), 0) + 1 FROM dbo.NetAtlas_Layouts), @by)`);
        res.status(201).json({ success: true, data: mapLayout(r.recordset[0], 0) });
    } catch (err) { serverError(res, 'createLayout', err); }
}

export async function updateLayout(req, res) {
    const id = toId(req.params.id);
    const name = text(req.body?.name, 120);
    if (id == null) return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' });
    if (!name) return res.status(400).json({ success: false, error: 'กรุณาระบุชื่อผัง' });
    try {
        const r = await getPool().request()
            .input('id', sql.Int, id)
            .input('name', sql.NVarChar(120), name)
            .input('w', sql.Int, dimOrNull(req.body?.width))
            .input('h', sql.Int, dimOrNull(req.body?.height))
            .input('by', sql.NVarChar(100), actorOf(req))
            .query(`UPDATE dbo.NetAtlas_Layouts SET Name = @name, Width = COALESCE(@w, Width), Height = COALESCE(@h, Height), UpdatedBy = @by, UpdatedAt = SYSDATETIME()
                    OUTPUT INSERTED.LayoutID, INSERTED.Name, INSERTED.FloorplanFile, INSERTED.SortOrder, INSERTED.Width, INSERTED.Height
                    WHERE LayoutID = @id`);
        if (!r.recordset[0]) return res.status(404).json({ success: false, error: 'ไม่พบผัง' });
        res.json({ success: true, data: mapLayout(r.recordset[0]) });
    } catch (err) { serverError(res, 'updateLayout', err); }
}

export async function deleteLayout(req, res) {
    const id = toId(req.params.id);
    if (id == null) return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' });
    try {
        const pool = getPool();
        const c = await pool.request().input('id', sql.Int, id)
            .query('SELECT COUNT(*) AS n FROM dbo.NetAtlas_Devices WHERE LayoutID = @id');
        const n = c.recordset[0].n;
        // ไม่ลบผังที่ยังมีอุปกรณ์ — กันข้อมูลหายโดยไม่ตั้งใจ
        if (n > 0) return res.status(409).json({ success: false, error: `ลบไม่ได้: ผังนี้ยังมีอุปกรณ์ ${n} รายการ ให้ย้าย/ลบอุปกรณ์ก่อน`, code: 'LAYOUT_NOT_EMPTY', deviceCount: n });
        const f = await pool.request().input('id', sql.Int, id)
            .query('DELETE FROM dbo.NetAtlas_Layouts OUTPUT DELETED.FloorplanFile WHERE LayoutID = @id');
        if (!f.recordset[0]) return res.status(404).json({ success: false, error: 'ไม่พบผัง' });
        removeFile(f.recordset[0].FloorplanFile);
        res.json({ success: true });
    } catch (err) { serverError(res, 'deleteLayout', err); }
}

// ── Floor plan image ─────────────────────────────────────────────────────
const removeFile = (file) => {
    if (!file) return;
    const p = path.join(NETATLAS_UPLOAD_DIR, path.basename(file));
    fs.promises.unlink(p).catch(() => { /* ไฟล์หายไปแล้วก็ไม่เป็นไร */ });
};

const floorplanStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, NETATLAS_UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, `layout-${req.params.id}-${Date.now()}${ext}`);
    },
});
export const uploadFloorplan = multer({
    storage: floorplanStorage,
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (!ALLOWED_EXT.includes(ext) || !String(file.mimetype).startsWith('image/')) {
            return cb(new Error('รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP'));
        }
        cb(null, true);
    },
}).single('floorplan');

export async function setFloorplan(req, res) {
    const id = toId(req.params.id);
    if (id == null) { if (req.file) removeFile(req.file.filename); return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' }); }
    if (!req.file) return res.status(400).json({ success: false, error: 'ไม่พบไฟล์รูปแปลน' });
    try {
        const pool = getPool();
        const old = await pool.request().input('id', sql.Int, id)
            .query('SELECT FloorplanFile FROM dbo.NetAtlas_Layouts WHERE LayoutID = @id');
        if (!old.recordset[0]) { removeFile(req.file.filename); return res.status(404).json({ success: false, error: 'ไม่พบผัง' }); }
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('file', sql.NVarChar(260), req.file.filename)
            .input('w', sql.Int, dimOrNull(req.body?.width))
            .input('h', sql.Int, dimOrNull(req.body?.height))
            .input('by', sql.NVarChar(100), actorOf(req))
            .query(`UPDATE dbo.NetAtlas_Layouts SET FloorplanFile = @file, Width = COALESCE(@w, Width), Height = COALESCE(@h, Height), UpdatedBy = @by, UpdatedAt = SYSDATETIME()
                    OUTPUT INSERTED.LayoutID, INSERTED.Name, INSERTED.FloorplanFile, INSERTED.SortOrder, INSERTED.Width, INSERTED.Height
                    WHERE LayoutID = @id`);
        removeFile(old.recordset[0].FloorplanFile);
        res.json({ success: true, data: mapLayout(r.recordset[0]) });
    } catch (err) { removeFile(req.file.filename); serverError(res, 'setFloorplan', err); }
}

// จัดลำดับผังใหม่: ids = รหัสผังทั้งหมดตามลำดับที่ต้องการ (ต้องครบทุกผังพอดี)
export async function reorderLayouts(req, res) {
    const raw = Array.isArray(req.body?.ids) ? req.body.ids : null;
    const ids = raw ? raw.map((x) => toId(x)) : null;
    if (!ids || ids.some((x) => x == null) || new Set(ids).size !== ids.length) {
        return res.status(400).json({ success: false, error: 'ลำดับผังไม่ถูกต้อง' });
    }
    const pool = getPool();
    const tx = new sql.Transaction(pool);
    try {
        await tx.begin();
        const all = await new sql.Request(tx).query('SELECT LayoutID FROM dbo.NetAtlas_Layouts WITH (UPDLOCK, HOLDLOCK)');
        const existing = new Set(all.recordset.map((r) => r.LayoutID));
        if (existing.size !== ids.length || ids.some((x) => !existing.has(x))) {
            await tx.rollback();
            return res.status(409).json({ success: false, error: 'รายการผังเปลี่ยนไปแล้ว กรุณารีเฟรชแล้วลองใหม่' });
        }
        for (let i = 0; i < ids.length; i++) {
            await new sql.Request(tx)
                .input('id', sql.Int, ids[i])
                .input('sort', sql.Int, i + 1)
                .input('by', sql.NVarChar(100), actorOf(req))
                .query('UPDATE dbo.NetAtlas_Layouts SET SortOrder = @sort, UpdatedBy = @by, UpdatedAt = SYSDATETIME() WHERE LayoutID = @id');
        }
        await tx.commit();
        res.json({ success: true });
    } catch (err) {
        try { await tx.rollback(); } catch { /* ignore */ }
        serverError(res, 'reorderLayouts', err);
    }
}

export async function clearFloorplan(req, res) {
    const id = toId(req.params.id);
    if (id == null) return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' });
    try {
        const r = await getPool().request()
            .input('id', sql.Int, id)
            .input('by', sql.NVarChar(100), actorOf(req))
            .query(`UPDATE dbo.NetAtlas_Layouts SET FloorplanFile = NULL, UpdatedBy = @by, UpdatedAt = SYSDATETIME()
                    OUTPUT DELETED.FloorplanFile AS OldFile, INSERTED.LayoutID, INSERTED.Name, INSERTED.SortOrder
                    WHERE LayoutID = @id`);
        if (!r.recordset[0]) return res.status(404).json({ success: false, error: 'ไม่พบผัง' });
        removeFile(r.recordset[0].OldFile);
        res.json({ success: true, data: mapLayout({ ...r.recordset[0], FloorplanFile: null }) });
    } catch (err) { serverError(res, 'clearFloorplan', err); }
}

// ── Devices ──────────────────────────────────────────────────────────────
export async function listDevices(req, res) {
    const layoutId = toId(req.query.layoutId);
    if (layoutId == null) return res.status(400).json({ success: false, error: 'ต้องระบุ layoutId' });
    try {
        const r = await getPool().request().input('layoutId', sql.Int, layoutId)
            .query(`${DEVICE_SELECT} WHERE d.LayoutID = @layoutId ORDER BY d.Name, d.DeviceID`);
        res.json({ success: true, data: r.recordset.map(mapDevice) });
    } catch (err) { serverError(res, 'listDevices', err); }
}

const DEVICE_SELECT = `SELECT d.*, COALESCE(sp.ip_address, sm.ip_address) AS SrcIp,
        COALESCE(sp.adapter_type, sm.adapter_type) AS SrcAdapter, sp.[user] AS SrcUser,
        COALESCE(sp.mac_address, sm.mac_address) AS SrcMac, COALESCE(sp.fix_asset, sm.fix_asset) AS SrcFixAsset,
        (SELECT pr.PortNo AS n, pr.Remark AS r FROM dbo.NetAtlas_PortRemarks pr WHERE pr.DeviceID = d.DeviceID FOR JSON PATH) AS PortRemarksJson
    FROM dbo.NetAtlas_Devices d
    LEFT JOIN dbo.info_pc_inventory sp ON d.SourceTable = 'PC' AND sp.hostname = d.SourceHostname
    LEFT JOIN dbo.info_mo_inventory sm ON d.SourceTable = 'MO' AND sm.hostname = d.SourceHostname`;

const readDevice = async (pool, id) => {
    const r = await pool.request().input('id', sql.Int, id)
        .query(`${DEVICE_SELECT} WHERE d.DeviceID = @id`);
    return r.recordset[0] || null;
};

export async function createDevice(req, res) {
    const layoutId = toId(req.body?.layoutId);
    if (layoutId == null) return res.status(400).json({ success: false, error: 'ต้องระบุผัง (layoutId)' });
    const parentId = toId(req.body?.uplinkDeviceId);
    const parentPortNo = parentId == null ? null : toId(req.body?.parentPortNo);
    try {
        const pool = getPool();
        const types = await loadTypeMap(pool);
        const v = validateDevice(req.body || {}, types);
        if (v.error) return res.status(400).json({ success: false, error: v.error });
        const layout = await pool.request().input('id', sql.Int, layoutId)
            .query('SELECT LayoutID FROM dbo.NetAtlas_Layouts WHERE LayoutID = @id');
        if (!layout.recordset[0]) return res.status(404).json({ success: false, error: 'ไม่พบผัง' });
        const srcRes = await resolveSource(pool, types.get(v.value.deviceType), req.body || {}, null);
        if (srcRes.error) return res.status(400).json({ success: false, error: srcRes.error });
        if (srcRes.value) {
            v.value.name = srcRes.value.hostname;
            v.value.sourceTable = srcRes.value.table;
            v.value.sourceHostname = srcRes.value.hostname;
            if (parentId != null && srcRes.value.adapter !== 'Ethernet') {
                return res.status(400).json({ success: false, error: 'เชื่อมพอร์ตได้เฉพาะเครื่องที่ใช้สาย Ethernet (เครื่องนี้เป็น Wi-Fi วางบนผังได้แต่ไม่ต่อพอร์ต)' });
            }
        }
        const ownRes = await checkOwnPort(pool, null, types.get(v.value.deviceType), v.value.portCount, toId(req.body?.ownPortNo), parentId);
        if (ownRes.error) return res.status(400).json({ success: false, error: ownRes.error });
        const ownFinal = ownRes.value;
        const uplinkErr = await checkUplink(pool, layoutId, null, parentId, parentPortNo, types, v.value.uplinkFromPort);
        if (uplinkErr) return res.status(400).json({ success: false, error: uplinkErr });
        const r = await pool.request()
            .input('layoutId', sql.Int, layoutId)
            .input('name', sql.NVarChar(120), v.value.name)
            .input('type', sql.VarChar(10), v.value.deviceType)
            .input('portCount', sql.Int, v.value.portCount)
            .input('model', sql.NVarChar(200), v.value.model)
            .input('ip', sql.NVarChar(45), v.value.ipAddress)
            .input('location', sql.NVarChar(200), v.value.location)
            .input('note', sql.NVarChar(500), v.value.note)
            .input('parent', sql.Int, parentId)
            .input('parentPort', sql.Int, parentPortNo)
            .input('own', sql.Int, ownFinal)
            .input('srcTable', sql.VarChar(10), srcRes.value?.table ?? null)
            .input('srcHost', sql.NVarChar(100), srcRes.value?.hostname ?? null)
            .input('mac', sql.NVarChar(40), v.value.macAddress)
            .input('fa', sql.NVarChar(60), v.value.fixAsset)
            .input('pp', sql.NVarChar(40), v.value.portPrefix)
            .input('fromPort', sql.NVarChar(50), v.value.uplinkFromPort)
            .input('toPort', sql.NVarChar(50), v.value.uplinkToPort)
            .input('x', sql.Decimal(5, 2), clampPct(req.body?.x))
            .input('y', sql.Decimal(5, 2), clampPct(req.body?.y))
            .input('by', sql.NVarChar(100), actorOf(req))
            .query(`INSERT INTO dbo.NetAtlas_Devices
                    (LayoutID, Name, DeviceType, PortCount, Model, IpAddress, Location, Note, UplinkDeviceID, ParentPortNo, OwnPortNo, UplinkFromPort, UplinkToPort, PosX, PosY, SourceTable, SourceHostname, MacAddress, FixAsset, PortPrefix, CreatedBy)
                    OUTPUT INSERTED.DeviceID
                    VALUES (@layoutId, @name, @type, @portCount, @model, @ip, @location, @note, @parent, @parentPort, @own, @fromPort, @toPort, @x, @y, @srcTable, @srcHost, @mac, @fa, @pp, @by)`);
        const created = await readDevice(pool, r.recordset[0].DeviceID);
        res.status(201).json({ success: true, data: mapDevice(created) });
    } catch (err) { serverError(res, 'createDevice', err); }
}

export async function updateDevice(req, res) {
    const id = toId(req.params.id);
    if (id == null) return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' });
    const parentId = toId(req.body?.uplinkDeviceId);
    const parentPortNo = parentId == null ? null : toId(req.body?.parentPortNo);
    try {
        const pool = getPool();
        const types = await loadTypeMap(pool);
        const v = validateDevice(req.body || {}, types);
        if (v.error) return res.status(400).json({ success: false, error: v.error });
        const current = await readDevice(pool, id);
        if (!current) return res.status(404).json({ success: false, error: 'ไม่พบอุปกรณ์' });
        const srcRes = await resolveSource(pool, types.get(v.value.deviceType), req.body || {}, current);
        if (srcRes.error) return res.status(400).json({ success: false, error: srcRes.error });
        if (current.SourceHostname) v.value.name = current.Name;
        if (parentId != null && srcRes.value && srcRes.value.adapter !== 'Ethernet') {
            return res.status(400).json({ success: false, error: 'เชื่อมพอร์ตได้เฉพาะเครื่องที่ใช้สาย Ethernet (เครื่องนี้เป็น Wi-Fi วางบนผังได้แต่ไม่ต่อพอร์ต)' });
        }
        const ownRes = await checkOwnPort(pool, id, types.get(v.value.deviceType), v.value.portCount, toId(req.body?.ownPortNo), parentId);
        if (ownRes.error) return res.status(400).json({ success: false, error: ownRes.error });
        const ownFinal = ownRes.value;
        // ย้ายไปผังอื่นได้ เมื่อไม่มีการเชื่อมต่อใด ๆ (ไม่มี parent และไม่มีอุปกรณ์ลูก)
        const targetLayout = toId(req.body?.layoutId);
        const moving = targetLayout != null && targetLayout !== current.LayoutID;
        if (moving) {
            if (current.UplinkDeviceID != null || parentId != null) return res.status(400).json({ success: false, error: 'ต้องปลดการเชื่อมต่อต้นทาง (Uplink) ก่อนจึงจะย้ายไปผังอื่นได้' });
            const kidCount = await pool.request().input('id', sql.Int, id)
                .query('SELECT COUNT(*) AS n FROM dbo.NetAtlas_Devices WHERE UplinkDeviceID = @id');
            if (kidCount.recordset[0].n > 0) return res.status(400).json({ success: false, error: `ต้องปลดอุปกรณ์ต่อพ่วง ${kidCount.recordset[0].n} รายการก่อน จึงจะย้ายไปผังอื่นได้` });
            const target = await pool.request().input('l', sql.Int, targetLayout).query('SELECT LayoutID FROM dbo.NetAtlas_Layouts WHERE LayoutID = @l');
            if (!target.recordset[0]) return res.status(404).json({ success: false, error: 'ไม่พบผังปลายทาง' });
            await pool.request().input('id', sql.Int, id).input('l', sql.Int, targetLayout)
                .query('UPDATE dbo.NetAtlas_Devices SET LayoutID = @l, PosX = 50, PosY = 50 WHERE DeviceID = @id');
            current.LayoutID = targetLayout;
        }
        const uplinkErr = await checkUplink(pool, current.LayoutID, id, parentId, parentPortNo, types, v.value.uplinkFromPort);
        if (uplinkErr) return res.status(400).json({ success: false, error: uplinkErr });

        // ลดจำนวนพอร์ต / เปลี่ยนเป็น AP ได้ ต้องไม่มีอุปกรณ์ลูกเสียบพอร์ตที่จะหายไป
        const kids = await pool.request().input('id', sql.Int, id)
            .query(`SELECT COUNT(*) AS n, MAX(ParentPortNo) AS maxPort FROM dbo.NetAtlas_Devices WHERE UplinkDeviceID = @id`);
        const { n, maxPort } = kids.recordset[0];
        if (n > 0 && !types.get(v.value.deviceType)?.hasPorts) {
            return res.status(400).json({ success: false, error: `ไม่สามารถเปลี่ยนเป็นประเภทนี้ได้ เพราะยังมีอุปกรณ์ต่อพ่วง ${n} รายการ` });
        }
        if (v.value.portCount != null && maxPort != null && maxPort > v.value.portCount) {
            return res.status(400).json({ success: false, error: `ลดจำนวนพอร์ตเหลือ ${v.value.portCount} ไม่ได้ เพราะยังมีอุปกรณ์เสียบพอร์ต ${maxPort}` });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .input('name', sql.NVarChar(120), v.value.name)
            .input('type', sql.VarChar(10), v.value.deviceType)
            .input('portCount', sql.Int, v.value.portCount)
            .input('model', sql.NVarChar(200), v.value.model)
            .input('ip', sql.NVarChar(45), v.value.ipAddress)
            .input('location', sql.NVarChar(200), v.value.location)
            .input('note', sql.NVarChar(500), v.value.note)
            .input('parent', sql.Int, parentId)
            .input('parentPort', sql.Int, parentPortNo)
            .input('own', sql.Int, ownFinal)
            .input('srcTable', sql.VarChar(10), srcRes.value?.table ?? null)
            .input('srcHost', sql.NVarChar(100), srcRes.value?.hostname ?? null)
            .input('mac', sql.NVarChar(40), v.value.macAddress)
            .input('fa', sql.NVarChar(60), v.value.fixAsset)
            .input('pp', sql.NVarChar(40), v.value.portPrefix)
            .input('fromPort', sql.NVarChar(50), v.value.uplinkFromPort)
            .input('toPort', sql.NVarChar(50), v.value.uplinkToPort)
            .input('by', sql.NVarChar(100), actorOf(req))
            .query(`UPDATE dbo.NetAtlas_Devices SET
                        Name = @name, DeviceType = @type, PortCount = @portCount, Model = @model, IpAddress = @ip, Location = @location, Note = @note, MacAddress = @mac, FixAsset = @fa, PortPrefix = @pp,
                        UplinkDeviceID = @parent, ParentPortNo = @parentPort, OwnPortNo = @own, UplinkFromPort = @fromPort, UplinkToPort = @toPort,
                        UpdatedBy = @by, UpdatedAt = SYSDATETIME()
                    WHERE DeviceID = @id`);
        res.json({ success: true, data: mapDevice(await readDevice(pool, id)) });
    } catch (err) { serverError(res, 'updateDevice', err); }
}

// ย้ายตำแหน่งบนผังอย่างเดียว (ใช้ตอนลากหมุด) — ส่งได้บ่อย จึงไม่แตะข้อมูลอื่น
export async function moveDevice(req, res) {
    const id = toId(req.params.id);
    if (id == null) return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' });
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return res.status(400).json({ success: false, error: 'พิกัดไม่ถูกต้อง' });
    try {
        const pool = getPool();
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('x', sql.Decimal(5, 2), clampPct(x))
            .input('y', sql.Decimal(5, 2), clampPct(y))
            .input('by', sql.NVarChar(100), actorOf(req))
            .query(`UPDATE dbo.NetAtlas_Devices SET PosX = @x, PosY = @y, UpdatedBy = @by, UpdatedAt = SYSDATETIME()
                    WHERE DeviceID = @id`);
        if (!r.rowsAffected[0]) return res.status(404).json({ success: false, error: 'ไม่พบอุปกรณ์' });
        res.json({ success: true, data: mapDevice(await readDevice(pool, id)) });
    } catch (err) { serverError(res, 'moveDevice', err); }
}

// ตั้ง/ล้างหมายเหตุของพอร์ต — ไม่ต้องมีอุปกรณ์เสียบอยู่ และไม่ต้องเชื่อมต่อใด ๆ
// remark ว่าง = ลบหมายเหตุของพอร์ตนั้น
export async function setPortRemark(req, res) {
    const id = toId(req.params.id);
    const portNo = toId(req.params.portNo);
    if (id == null || portNo == null || portNo < 1) return res.status(400).json({ success: false, error: 'ข้อมูลพอร์ตไม่ถูกต้อง' });
    const remark = text(req.body?.remark, 200);
    try {
        const pool = getPool();
        const dev = await readDevice(pool, id);
        if (!dev) return res.status(404).json({ success: false, error: 'ไม่พบอุปกรณ์' });
        if (dev.PortCount != null && portNo > dev.PortCount) {
            return res.status(400).json({ success: false, error: `พอร์ตนี้เกินจำนวนพอร์ต (${dev.PortCount})` });
        }
        // ค่าเดิมของหมายเหตุ ใช้เก็บใน audit log (ค่าเดิม → ค่าใหม่)
        const prevRes = await pool.request().input('id', sql.Int, id).input('p', sql.Int, portNo)
            .query('SELECT Remark FROM dbo.NetAtlas_PortRemarks WHERE DeviceID = @id AND PortNo = @p');
        const prevRemark = prevRes.recordset[0]?.Remark ?? null;
        // middleware audit อ่านค่านี้หลัง response: ชื่ออุปกรณ์ + พอร์ต และค่าเดิม → ค่าใหม่
        res.locals.auditSummary = `${dev.Name} · พอร์ต ${portNo}`;
        if (prevRemark !== remark) {
            res.locals.auditChanges = { fields: [{ field: `หมายเหตุพอร์ต ${portNo}`, from: prevRemark, to: remark }] };
        }
        if (remark == null) {
            await pool.request().input('id', sql.Int, id).input('p', sql.Int, portNo)
                .query('DELETE FROM dbo.NetAtlas_PortRemarks WHERE DeviceID = @id AND PortNo = @p');
        } else {
            await pool.request()
                .input('id', sql.Int, id)
                .input('p', sql.Int, portNo)
                .input('r', sql.NVarChar(200), remark)
                .input('by', sql.NVarChar(100), actorOf(req))
                .query(`MERGE dbo.NetAtlas_PortRemarks AS t
                        USING (SELECT @id AS DeviceID, @p AS PortNo) AS s
                        ON t.DeviceID = s.DeviceID AND t.PortNo = s.PortNo
                        WHEN MATCHED THEN UPDATE SET Remark = @r, UpdatedBy = @by, UpdatedAt = SYSDATETIME()
                        WHEN NOT MATCHED THEN INSERT (DeviceID, PortNo, Remark, UpdatedBy) VALUES (@id, @p, @r, @by);`);
        }
        res.json({ success: true, data: mapDevice(await readDevice(pool, id)) });
    } catch (err) { serverError(res, 'setPortRemark', err); }
}

// ลบอุปกรณ์ — ล้าง uplink ของลูกในธุรกรรมเดียวกัน
export async function deleteDevice(req, res) {
    const id = toId(req.params.id);
    if (id == null) return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' });
    const pool = getPool();
    const tx = new sql.Transaction(pool);
    try {
        await tx.begin();
        const exists = await new sql.Request(tx).input('id', sql.Int, id)
            .query('SELECT DeviceID FROM dbo.NetAtlas_Devices WITH (UPDLOCK) WHERE DeviceID = @id');
        if (!exists.recordset[0]) { await tx.rollback(); return res.status(404).json({ success: false, error: 'ไม่พบอุปกรณ์' }); }
        const cleared = await new sql.Request(tx).input('id', sql.Int, id)
            .query(`UPDATE dbo.NetAtlas_Devices SET UplinkDeviceID = NULL, ParentPortNo = NULL, OwnPortNo = NULL, UplinkFromPort = NULL, UplinkToPort = NULL,
                        UpdatedBy = NULL, UpdatedAt = SYSDATETIME()
                    WHERE UplinkDeviceID = @id`);
        await new sql.Request(tx).input('id', sql.Int, id)
            .query('DELETE FROM dbo.NetAtlas_Devices WHERE DeviceID = @id');
        await tx.commit();
        res.json({ success: true, clearedChildren: cleared.rowsAffected[0] });
    } catch (err) {
        try { await tx.rollback(); } catch { /* ignore */ }
        serverError(res, 'deleteDevice', err);
    }
}
