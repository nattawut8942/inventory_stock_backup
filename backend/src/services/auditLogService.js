// ประวัติการทำงาน (Audit log) ระดับ 1
// - middleware บันทึกทุกคำขอ POST/PUT/PATCH/DELETE ที่มีผู้ใช้ login หลังส่งผลลัพธ์แล้ว (ไม่ทำให้ช้า, log ล้มเหลวไม่กระทบงานหลัก)
// - ไม่เก็บ: login/logout, คำขอที่ไม่มีผู้ใช้ (เช่น agent ส่งข้อมูลเครื่อง), การอ่านข้อมูล (GET)
// - ปิดบังรหัสผ่าน/token, ตัดข้อความยาว, ไฟล์เก็บแค่ชื่อ
// - ตารางมาจาก migrations/2026-11-21_stock_audit_log.sql — ถ้ายังไม่ได้รัน จะไม่บันทึกอะไร (เช็คใหม่ทุก 60 วินาที)
// ระดับ 2: การแก้/ลบ ข้อมูลหลักที่อยู่ใน TRACKED จะอ่านแถวนั้น "ก่อน" และ "หลัง" แล้วเก็บเฉพาะช่องที่เปลี่ยน (ค่าเดิม → ค่าใหม่)
//   ลบ = เก็บข้อมูลทั้งแถวก่อนลบ · เก็บในคอลัมน์ Changes (migrations/2026-11-21_stock_audit_log_changes.sql)
//   ถ้ายังไม่มีคอลัมน์ Changes จะเก็บใน Body ช่อง __changes แทน · อ่านไม่สำเร็จ = บันทึกแบบระดับ 1 ตามเดิม
import jwt from 'jsonwebtoken';
import sql from 'mssql';
import { getPool } from '../config/db.js';
import { getJwtSecret } from '../config/jwtSecret.js';

export const RETENTION_DAYS = 365;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// path ที่ไม่บันทึก (เทียบกับ path หลัง /ITinventory/api)
const SKIP = [/^\/login\b/i, /^\/logout\b/i, /^\/auth\//i, /^\/refresh\b/i, /^\/audit-log\b/i];
const SECRET_KEY = /pass(word)?|pwd|token|secret|authorization|api[-_]?key/i;
const NAME_KEYS = ['ProductName', 'VendorName', 'TypeName', 'CategoryLabel', 'Label', 'Name', 'name', 'title', 'Title',
    'SessionCode', 'PONumber', 'PO_No', 'InvoiceNo', 'hostname', 'Hostname', 'ip_address', 'IpAddress', 'EmployeeName'];
// คำท้าย path ที่เป็น "การกระทำ" มากกว่าการสร้าง เช่น /sessions/5/confirm
const ACTION_VERBS = /\/(confirm|adjust|restore|cancel|renew|approve|reject|return|close|reopen|sync|scan|reorder|import|send|reset|apply|extend|complete|duplicate)(\/|$)/i;

let tableReady = null;
let checkedAt = 0;
const hasTable = async () => {
    if (tableReady === true) return true;
    if (tableReady === false && Date.now() - checkedAt < 60_000) return false;
    try {
        const r = await getPool().request().query(`SELECT CASE WHEN OBJECT_ID('dbo.Stock_AuditLog','U') IS NULL THEN 0 ELSE 1 END AS ok`);
        tableReady = r.recordset[0]?.ok === 1;
    } catch { tableReady = false; }
    checkedAt = Date.now();
    return tableReady;
};
export const auditTableReady = hasTable;

const identify = (req) => {
    if (req.user?.empcode || req.user?.username) return req.user;
    const raw = req.headers['authorization'];
    if (!raw) return null;
    try { return jwt.verify(raw.startsWith('Bearer ') ? raw.slice(7) : raw, getJwtSecret()); } catch { return null; }
};

// ทำความสะอาดข้อมูลที่ส่งมา ก่อนเก็บ
const clean = (v, depth = 0) => {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') {
        if (/^data:[^;]+;base64,/.test(v)) return `[ไฟล์ base64 ${Math.round(v.length / 1024)} KB]`;
        return v.length > 500 ? `${v.slice(0, 500)}… [ยาว ${v.length} ตัวอักษร]` : v;
    }
    if (typeof v !== 'object') return v;
    if (depth > 4) return '[…]';
    if (Array.isArray(v)) {
        const arr = v.slice(0, 50).map((x) => clean(x, depth + 1));
        if (v.length > 50) arr.push(`[… อีก ${v.length - 50} รายการ]`);
        return arr;
    }
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = SECRET_KEY.test(k) ? '***' : clean(val, depth + 1);
    return out;
};

const findName = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    for (const k of NAME_KEYS) if (typeof body[k] === 'string' && body[k].trim()) return body[k].trim().slice(0, 400);
    return null;
};

const describe = (method, apiPath) => {
    const parts = apiPath.split('?')[0].split('/').filter(Boolean);
    const module = (parts[0] || '').slice(0, 60) || null;
    // ID = ส่วนแรกที่เป็นตัวเลข/รหัส (ไม่ใช่ชื่อ resource) หลัง module
    const idPart = parts.slice(1).find((p) => /^\d+$/.test(p) || /^[A-Z0-9][A-Z0-9._-]{1,}$/i.test(p) && /\d/.test(p));
    let action = method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'update';
    if (ACTION_VERBS.test(apiPath)) action = 'action';
    return { module, recordId: idPart ? decodeURIComponent(idPart).slice(0, 100) : null, action };
};


// ── ระดับ 2: ข้อมูลที่ติดตามค่าเดิม → ค่าใหม่ ──
// re: path หลัง /ITinventory/api (กลุ่มแรก = รหัสรายการ) · table/key: ตารางและคอลัมน์ที่ใช้หาแถว
const TRACKED = [
    { re: /^\/products\/(\d+)$/, table: 'Stock_Products', key: 'ProductID', type: 'int' },
    { re: /^\/types\/([^/]+)$/, table: 'Stock_DeviceTypes', key: 'TypeId' },
    { re: /^\/vendors\/(\d+)$/, table: 'Stock_Vendors', key: 'VendorID', type: 'int' },
    { re: /^\/locations\/(\d+)$/, table: 'Stock_Locations', key: 'LocationID', type: 'int' },
    { re: /^\/reasons\/(\d+)(?:\/[a-z-]+)?$/, table: 'Stock_WithdrawalReasons', key: 'ReasonID', type: 'int' },
    { re: /^\/budgets\/(\d+)$/, table: 'Stock_BudgetCategories', key: 'CategoryID', type: 'int' },
    { re: /^\/ma\/(\d+)(?:\/(?:status|renewal))?$/, table: 'MA_Items', key: 'ItemID', type: 'int' },
    { re: /^\/ma-types\/(\d+)$/, table: 'MA_Types', key: 'TypeID', type: 'int' },
    { re: /^\/ip-scan\/ips\/([^/]+)$/, table: 'ip_management', key: 'ip_address' },
    { re: /^\/pc-inventory\/([^/]+)(?:\/(?:bitlocker|asset|disposal|status|warranty))?$/, table: 'info_pc_inventory', key: 'hostname' },
    { re: /^\/mo-inventory\/([^/]+)(?:\/(?:asset|disposal|status))?$/, table: 'info_mo_inventory', key: 'hostname' },
    { re: /^\/cctv\/cameras\/(\d+)(?:\/(?:status|location))?$/, table: 'cctv_cameras', key: 'id', type: 'int' },
    { re: /^\/cctv\/racks\/(\d+)$/, table: 'cctv_racks', key: 'id', type: 'int' },
    { re: /^\/cctv\/switches\/(\d+)$/, table: 'cctv_switches', key: 'id', type: 'int' },
    { re: /^\/cctv\/maintenance-logs\/(\d+)$/, table: 'cctv_maintenance_logs', key: 'id', type: 'int' },
    { re: /^\/cctv\/record-servers\/(\d+)$/, table: 'cctv_record_servers', key: 'id', type: 'int' },
    { re: /^\/factory-layouts\/(\d+)$/, table: 'factory_layouts', key: 'id', type: 'int' },
    { re: /^\/activity-categories\/([^/]+)$/, table: 'Activity_Categories', key: 'CategoryCode' },
    { re: /^\/stock-users\/(\d+)\/role$/, table: 'Stock_Users', key: 'ID', type: 'int' },
];
// ช่องที่เปลี่ยนเองทุกครั้ง (เวลาแก้ล่าสุด ฯลฯ) ไม่นับเป็นการเปลี่ยนแปลง
const IGNORE_FIELD = /^(updated_?at|modified_?at|last_?updated|last_?modified|updated_?date|modify_?date|UpdatedBy|updated_?by|ModifiedBy|rowversion|timestamp)$/i;

const trackedFor = (method, apiPath) => {
    if (method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return null;
    for (const t of TRACKED) {
        const m = apiPath.match(t.re);
        if (m) {
            const id = decodeURIComponent(m[1]);
            if (t.type === 'int' && !/^\d+$/.test(id)) return null;
            return { ...t, id };
        }
    }
    return null;
};

const readRow = async (t) => {
    const r = getPool().request();
    r.input('id', t.type === 'int' ? sql.Int : sql.NVarChar(200), t.type === 'int' ? Number(t.id) : t.id);
    const q = await r.query(`SELECT TOP 1 * FROM dbo.[${t.table}] WHERE [${t.key}] = @id`);
    return q.recordset[0] || null;
};

// ค่าที่เก็บได้ (วันที่ → ISO, ไบนารี → ไม่เก็บ, ข้อความยาว → ตัด)
const plain = (v) => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
    if (Buffer.isBuffer(v)) return `[ไบนารี ${v.length} ไบต์]`;
    if (typeof v === 'string') return v.length > 300 ? `${v.slice(0, 300)}…` : v;
    if (typeof v === 'object') { try { const j = JSON.stringify(v); return j.length > 300 ? `${j.slice(0, 300)}…` : j; } catch { return String(v); } }
    return v;
};
const same = (a, b) => {
    const x = plain(a), y = plain(b);
    if (x === y) return true;
    if (x === null || y === null) return false;
    if (typeof x === 'number' || typeof y === 'number') return Number(x) === Number(y);
    if (typeof x === 'boolean' || typeof y === 'boolean') return Boolean(x) === Boolean(y);
    return String(x) === String(y);
};
const diffRows = (before, after) => {
    const out = [];
    for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
        if (IGNORE_FIELD.test(k)) continue;
        const a = before?.[k], b = after?.[k];
        if (!same(a, b)) out.push({ field: k, from: plain(a), to: plain(b) });
    }
    return out;
};
const rowSnapshot = (row) => {
    const o = {};
    for (const [k, v] of Object.entries(row || {})) { const p = plain(v); if (p !== null && p !== '') o[k] = p; }
    return o;
};

let changesCol = null;
let changesCheckedAt = 0;
const hasChangesColumn = async () => {
    if (changesCol === true) return true;
    if (changesCol === false && Date.now() - changesCheckedAt < 60_000) return false;
    try {
        const r = await getPool().request().query(`SELECT CASE WHEN COL_LENGTH('dbo.Stock_AuditLog','Changes') IS NULL THEN 0 ELSE 1 END AS ok`);
        changesCol = r.recordset[0]?.ok === 1;
    } catch { changesCol = false; }
    changesCheckedAt = Date.now();
    return changesCol;
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(undefined), ms))]);

// ลบข้อมูลเก่ากว่า RETENTION_DAYS วันละครั้ง
let lastPurge = 0;
const purgeOld = async () => {
    if (Date.now() - lastPurge < 24 * 3600_000) return;
    lastPurge = Date.now();
    try {
        await getPool().request().input('days', sql.Int, RETENTION_DAYS)
            .query('DELETE FROM dbo.Stock_AuditLog WHERE CreatedAt < DATEADD(DAY, -@days, SYSDATETIME())');
    } catch (err) { console.error('[Audit] purge failed:', err.message); }
};

const write = async (row) => {
    if (!(await hasTable())) return;
    const r = getPool().request();
    r.input('EmpCode', sql.NVarChar(20), row.EmpCode);
    r.input('Username', sql.NVarChar(100), row.Username);
    r.input('DisplayName', sql.NVarChar(200), row.DisplayName);
    r.input('Method', sql.VarChar(10), row.Method);
    r.input('Action', sql.VarChar(20), row.Action);
    r.input('Module', sql.NVarChar(60), row.Module);
    r.input('Path', sql.NVarChar(400), row.Path);
    r.input('RecordId', sql.NVarChar(100), row.RecordId);
    r.input('Summary', sql.NVarChar(400), row.Summary);
    r.input('StatusCode', sql.SmallInt, row.StatusCode);
    r.input('Success', sql.Bit, row.Success);
    r.input('DurationMs', sql.Int, row.DurationMs);
    r.input('IpAddress', sql.NVarChar(64), row.IpAddress);
    const withChanges = !!row.Changes && (await hasChangesColumn());
    let body = row.Body;
    if (row.Changes && !withChanges) {
        // ยังไม่มีคอลัมน์ Changes: ฝากไว้ใน Body
        try { const b = body ? JSON.parse(body) : {}; b.__changes = JSON.parse(row.Changes); body = JSON.stringify(b); } catch { /* ignore */ }
    }
    r.input('Body', sql.NVarChar(sql.MAX), body);
    if (withChanges) r.input('Changes', sql.NVarChar(sql.MAX), row.Changes);
    await r.query(`INSERT INTO dbo.Stock_AuditLog
        (EmpCode, Username, DisplayName, Method, Action, Module, Path, RecordId, Summary, StatusCode, Success, DurationMs, IpAddress, Body${withChanges ? ', Changes' : ''})
        VALUES (@EmpCode, @Username, @DisplayName, @Method, @Action, @Module, @Path, @RecordId, @Summary, @StatusCode, @Success, @DurationMs, @IpAddress, @Body${withChanges ? ', @Changes' : ''})`);
    purgeOld();
};

// mount: app.use('/ITinventory/api', auditLogMiddleware) — ก่อน route อื่น
export const auditLogMiddleware = async (req, res, next) => {
    if (!WRITE_METHODS.has(req.method)) return next();
    const apiPath = req.path || req.url || '';
    if (SKIP.some((re) => re.test(apiPath))) return next();
    const user = identify(req);
    if (!user || !(user.empcode || user.username)) return next();

    const started = Date.now();
    // ระดับ 2: อ่านค่าเดิมก่อนให้ route ทำงาน (จำกัดเวลา 1.5 วินาที ไม่ให้ค้าง · ผิดพลาด = ข้ามไป)
    const tracked = trackedFor(req.method, apiPath);
    let before;
    if (tracked) {
        try { if (await hasTable()) before = await withTimeout(readRow(tracked), 1500); }
        catch (err) { console.error('[Audit] snapshot failed:', err.message); before = undefined; }
    }
    res.on('finish', () => {
        // อ่าน body หลัง route ทำงานแล้ว (multer/fileupload จะเติม req.body/req.files ให้แล้ว)
        setImmediate(async () => {
            try {
                const { module, recordId, action } = describe(req.method, apiPath);
                const body = clean(req.body && typeof req.body === 'object' ? req.body : {});
                const files = [];
                if (req.files && typeof req.files === 'object') {
                    for (const f of Object.values(req.files).flat()) if (f?.name || f?.originalname) files.push(f.name || f.originalname);
                }
                if (req.file?.originalname) files.push(req.file.originalname);
                if (files.length) body.__files = files;
                let json = JSON.stringify(body);
                if (json.length > 8000) json = `${json.slice(0, 8000)}… [ตัดเหลือ 8000 ตัวอักษร]`;
                // ระดับ 2: เทียบค่าเดิม/ค่าใหม่
                let changes = null;
                let summary = findName(req.body);
                if (tracked && before && res.statusCode < 400) {
                    if (req.method === 'DELETE') {
                        const after = await withTimeout(readRow(tracked), 1500).catch(() => undefined);
                        // ลบจริง = แถวหายไป · ถ้ายังอยู่ (เช่น ปิดใช้งานแทนลบ) ให้เก็บเป็นการเปลี่ยนแปลง
                        changes = after === null ? { deleted: rowSnapshot(before) } : after ? { fields: diffRows(before, after) } : null;
                    } else {
                        const after = await withTimeout(readRow(tracked), 1500).catch(() => undefined);
                        if (after) changes = { fields: diffRows(before, after) };
                    }
                    if (!summary) summary = findName(before);
                }
                let changesJson = changes ? JSON.stringify(changes) : null;
                if (changesJson && changesJson.length > 20000) changesJson = JSON.stringify({ note: 'ข้อมูลการเปลี่ยนแปลงยาวเกิน', fields: (changes.fields || []).slice(0, 50) });
                await write({
                    Changes: changesJson,
                    EmpCode: user.empcode ? String(user.empcode) : null,
                    Username: user.username ? String(user.username) : null,
                    DisplayName: user.name ? String(user.name) : null,
                    Method: req.method,
                    Action: action,
                    Module: module,
                    Path: apiPath.slice(0, 400),
                    RecordId: recordId || (tracked ? String(tracked.id).slice(0, 100) : null),
                    Summary: summary,
                    StatusCode: res.statusCode,
                    Success: res.statusCode < 400,
                    DurationMs: Date.now() - started,
                    IpAddress: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64) || null,
                    Body: json === '{}' ? null : json,
                });
            } catch (err) {
                console.error('[Audit] write failed:', err.message);
            }
        });
    });
    next();
};
