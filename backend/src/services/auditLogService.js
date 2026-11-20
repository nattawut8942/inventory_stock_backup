// ประวัติการทำงาน (Audit log) ระดับ 1
// - middleware บันทึกทุกคำขอ POST/PUT/PATCH/DELETE ที่มีผู้ใช้ login หลังส่งผลลัพธ์แล้ว (ไม่ทำให้ช้า, log ล้มเหลวไม่กระทบงานหลัก)
// - ไม่เก็บ: login/logout, คำขอที่ไม่มีผู้ใช้ (เช่น agent ส่งข้อมูลเครื่อง), การอ่านข้อมูล (GET)
// - ปิดบังรหัสผ่าน/token, ตัดข้อความยาว, ไฟล์เก็บแค่ชื่อ
// - ตารางมาจาก migrations/2026-11-21_stock_audit_log.sql — ถ้ายังไม่ได้รัน จะไม่บันทึกอะไร (เช็คใหม่ทุก 60 วินาที)
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
    r.input('Body', sql.NVarChar(sql.MAX), row.Body);
    await r.query(`INSERT INTO dbo.Stock_AuditLog
        (EmpCode, Username, DisplayName, Method, Action, Module, Path, RecordId, Summary, StatusCode, Success, DurationMs, IpAddress, Body)
        VALUES (@EmpCode, @Username, @DisplayName, @Method, @Action, @Module, @Path, @RecordId, @Summary, @StatusCode, @Success, @DurationMs, @IpAddress, @Body)`);
    purgeOld();
};

// mount: app.use('/ITinventory/api', auditLogMiddleware) — ก่อน route อื่น
export const auditLogMiddleware = (req, res, next) => {
    if (!WRITE_METHODS.has(req.method)) return next();
    const apiPath = req.path || req.url || '';
    if (SKIP.some((re) => re.test(apiPath))) return next();
    const user = identify(req);
    if (!user || !(user.empcode || user.username)) return next();

    const started = Date.now();
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
                await write({
                    EmpCode: user.empcode ? String(user.empcode) : null,
                    Username: user.username ? String(user.username) : null,
                    DisplayName: user.name ? String(user.name) : null,
                    Method: req.method,
                    Action: action,
                    Module: module,
                    Path: apiPath.slice(0, 400),
                    RecordId: recordId,
                    Summary: findName(req.body),
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
