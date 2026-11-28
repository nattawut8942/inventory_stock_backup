// NetAtlas — master ประเภทอุปกรณ์ (จัดการในหน้า Management)
// กติกาของประเภท (มีพอร์ตไหม, เป็นต้นทางได้ไหม) อ่านจากตารางนี้ทุกครั้ง ไม่เขียนชื่อประเภทตายตัวในโค้ด
// ColorKey / IconKey เลือกได้เฉพาะค่าในรายการด้านล่าง (frontend มีคลาสสีและไอคอนรองรับไว้แล้ว)
import jwt from 'jsonwebtoken';
import { sql, getPool } from '../config/db.js';
import { getJwtSecret } from '../config/jwtSecret.js';

export const ALLOWED_COLORS = ['blue', 'amber', 'purple', 'emerald', 'rose', 'cyan', 'indigo', 'slate'];
export const ALLOWED_ICONS = ['server', 'share2', 'wifi', 'monitor', 'printer', 'router', 'hardDrive', 'box', 'phone', 'camera'];
const CODE_RE = /^[A-Z0-9]{1,10}$/;

const text = (v, max) => {
    const s = v == null ? '' : String(v).trim();
    return s ? s.slice(0, max) : null;
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
const serverError = (res, label, err) => {
    console.error(`[NetAtlas types] ${label}:`, err);
    res.status(500).json({ success: false, error: err.message });
};

export const mapType = (r, usage) => ({
    code: r.Code,
    label: r.Label,
    shortLabel: r.ShortLabel,
    colorKey: r.ColorKey,
    iconKey: r.IconKey,
    hasPorts: !!r.HasPorts,
    canBeParent: !!r.CanBeParent,
    requiresSource: !!r.RequiresSource,
    sortOrder: r.SortOrder,
    isActive: !!r.IsActive,
    usage: usage ?? undefined,
});

// อ่านประเภททั้งหมดเป็น map (code → ประเภท) สำหรับใช้ตรวจกติกาในฝั่งอุปกรณ์
export const loadTypeMap = async (pool = getPool()) => {
    const r = await pool.request().query('SELECT * FROM dbo.NetAtlas_DeviceTypes');
    return new Map(r.recordset.map((x) => [x.Code, mapType(x)]));
};

export async function listDeviceTypes(req, res) {
    try {
        const r = await getPool().request().query(`
            SELECT t.*, (SELECT COUNT(*) FROM dbo.NetAtlas_Devices d WHERE d.DeviceType = t.Code) AS UsageCount
            FROM dbo.NetAtlas_DeviceTypes t
            ORDER BY t.SortOrder, t.Code`);
        res.json({ success: true, data: r.recordset.map((x) => mapType(x, x.UsageCount)) });
    } catch (err) { serverError(res, 'list', err); }
}

// ตรวจค่าที่ส่งมา — ใช้ทั้งตอนสร้างและแก้ไข
const validateType = (body, { creating }) => {
    const label = text(body.label, 80);
    if (!label) return { error: 'กรุณาระบุชื่อประเภท' };
    const colorKey = String(body.colorKey || '').toLowerCase();
    if (!ALLOWED_COLORS.includes(colorKey)) return { error: 'สีที่เลือกไม่ถูกต้อง' };
    const iconKey = String(body.iconKey || '');
    if (!ALLOWED_ICONS.includes(iconKey)) return { error: 'ไอคอนที่เลือกไม่ถูกต้อง' };
    // ต้นทางต้องมีพอร์ตให้เสียบอุปกรณ์ลูก
    if (!!body.canBeParent && !body.hasPorts) return { error: 'ประเภทที่เป็นต้นทางได้ ต้องมีพอร์ตด้วย' };
    const shortLabel = text(body.shortLabel, 10);
    if (!shortLabel) return { error: 'กรุณาระบุตัวย่อ (เช่น L2, AP)' };
    const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0;
    let code = null;
    if (creating) {
        code = String(body.code || '').trim().toUpperCase();
        if (!CODE_RE.test(code)) return { error: 'รหัสประเภทต้องเป็นตัวอักษรภาษาอังกฤษหรือตัวเลข ไม่เกิน 10 ตัว' };
    }
    return {
        value: {
            code,
            label,
            shortLabel,
            colorKey,
            iconKey,
            hasPorts: !!body.hasPorts,
            canBeParent: !!body.canBeParent,
            sortOrder,
            isActive: body.isActive === undefined ? true : !!body.isActive,
        },
    };
};

export async function createDeviceType(req, res) {
    const v = validateType(req.body || {}, { creating: true });
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    const t = v.value;
    try {
        const pool = getPool();
        const exists = await pool.request().input('c', sql.VarChar(10), t.code)
            .query('SELECT 1 AS x FROM dbo.NetAtlas_DeviceTypes WHERE Code = @c');
        if (exists.recordset[0]) return res.status(409).json({ success: false, error: `รหัส ${t.code} มีอยู่แล้ว` });
        const r = await pool.request()
            .input('code', sql.VarChar(10), t.code)
            .input('label', sql.NVarChar(80), t.label)
            .input('short', sql.NVarChar(10), t.shortLabel)
            .input('color', sql.VarChar(20), t.colorKey)
            .input('icon', sql.VarChar(20), t.iconKey)
            .input('hasPorts', sql.Bit, t.hasPorts ? 1 : 0)
            .input('canParent', sql.Bit, t.canBeParent ? 1 : 0)
            .input('sort', sql.Int, t.sortOrder)
            .input('active', sql.Bit, t.isActive ? 1 : 0)
            .input('by', sql.NVarChar(100), actorOf(req))
            .query(`INSERT INTO dbo.NetAtlas_DeviceTypes (Code, Label, ShortLabel, ColorKey, IconKey, HasPorts, CanBeParent, SortOrder, IsActive, CreatedBy)
                    OUTPUT INSERTED.*
                    VALUES (@code, @label, @short, @color, @icon, @hasPorts, @canParent, @sort, @active, @by)`);
        res.status(201).json({ success: true, data: mapType(r.recordset[0], 0) });
    } catch (err) { serverError(res, 'create', err); }
}

export async function updateDeviceType(req, res) {
    const code = String(req.params.code || '').toUpperCase();
    const v = validateType(req.body || {}, { creating: false });
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    const t = v.value;
    try {
        const pool = getPool();
        const cur = await pool.request().input('c', sql.VarChar(10), code)
            .query('SELECT * FROM dbo.NetAtlas_DeviceTypes WHERE Code = @c');
        if (!cur.recordset[0]) return res.status(404).json({ success: false, error: 'ไม่พบประเภทอุปกรณ์' });

        // ห้ามปิดความสามารถที่อุปกรณ์ที่ใช้อยู่พึ่งพา
        const usage = await pool.request().input('c', sql.VarChar(10), code).query(`
            SELECT COUNT(*) AS used,
                   (SELECT COUNT(*) FROM dbo.NetAtlas_Devices ch
                      WHERE ch.UplinkDeviceID IN (SELECT DeviceID FROM dbo.NetAtlas_Devices WHERE DeviceType = @c)) AS children
            FROM dbo.NetAtlas_Devices WHERE DeviceType = @c`);
        const { children } = usage.recordset[0];
        if (children > 0 && !t.canBeParent) {
            return res.status(400).json({ success: false, error: `ปิด "เป็นต้นทางได้" ไม่ได้ เพราะมีอุปกรณ์ต่อพ่วงอยู่ ${children} รายการ` });
        }
        if (children > 0 && !t.hasPorts) {
            return res.status(400).json({ success: false, error: `ปิด "มีพอร์ต" ไม่ได้ เพราะมีอุปกรณ์เสียบพอร์ตอยู่ ${children} รายการ` });
        }
        const r = await pool.request()
            .input('c', sql.VarChar(10), code)
            .input('label', sql.NVarChar(80), t.label)
            .input('short', sql.NVarChar(10), t.shortLabel)
            .input('color', sql.VarChar(20), t.colorKey)
            .input('icon', sql.VarChar(20), t.iconKey)
            .input('hasPorts', sql.Bit, t.hasPorts ? 1 : 0)
            .input('canParent', sql.Bit, t.canBeParent ? 1 : 0)
            .input('sort', sql.Int, t.sortOrder)
            .input('active', sql.Bit, t.isActive ? 1 : 0)
            .input('by', sql.NVarChar(100), actorOf(req))
            .query(`UPDATE dbo.NetAtlas_DeviceTypes SET Label = @label, ShortLabel = @short, ColorKey = @color, IconKey = @icon,
                        HasPorts = @hasPorts, CanBeParent = @canParent, SortOrder = @sort, IsActive = @active,
                        UpdatedBy = @by, UpdatedAt = SYSDATETIME()
                    OUTPUT INSERTED.*
                    WHERE Code = @c`);
        res.json({ success: true, data: mapType(r.recordset[0]) });
    } catch (err) { serverError(res, 'update', err); }
}

export async function deleteDeviceType(req, res) {
    const code = String(req.params.code || '').toUpperCase();
    try {
        const pool = getPool();
        const used = await pool.request().input('c', sql.VarChar(10), code)
            .query('SELECT COUNT(*) AS n FROM dbo.NetAtlas_Devices WHERE DeviceType = @c');
        if (used.recordset[0].n > 0) {
            return res.status(409).json({ success: false, error: `ลบไม่ได้: มีอุปกรณ์ใช้ประเภทนี้อยู่ ${used.recordset[0].n} รายการ (ให้ปิดการใช้งานแทน)`, code: 'TYPE_IN_USE' });
        }
        const r = await pool.request().input('c', sql.VarChar(10), code)
            .query('DELETE FROM dbo.NetAtlas_DeviceTypes WHERE Code = @c');
        if (!r.rowsAffected[0]) return res.status(404).json({ success: false, error: 'ไม่พบประเภทอุปกรณ์' });
        res.json({ success: true });
    } catch (err) { serverError(res, 'delete', err); }
}
