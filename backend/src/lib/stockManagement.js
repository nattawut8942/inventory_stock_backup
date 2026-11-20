// ประเภทการจัดการสต็อก (แยกจากหมวด DeviceType) — กฎกลางที่ทุก controller/service ใช้ร่วมกัน
//   Rotating = สต็อกหมุนเวียน : เตือน + สั่งซื้อ + คาดการณ์ + Dead stock (เหมือนพฤติกรรมเดิม)
//   Spare    = อุปกรณ์สำรอง   : เตือนเมื่อต่ำกว่า Min + อยู่ในรายการสั่ง (หัวข้อเติมของสำรอง) แต่ไม่คาดการณ์/ไม่นับ Dead stock
//   Stored   = ของเก็บในคลัง  : แสดงยอดอย่างเดียว ไม่เตือน ไม่สั่ง ไม่คาดการณ์
// คอลัมน์มาจาก migrations/2026-11-20_stock_management_type.sql — ถ้ายังไม่ได้รัน ระบบจะถือว่าทุกชิ้นเป็น Rotating

export const MANAGEMENT_TYPES = ['Rotating', 'Spare', 'Stored'];
export const DEFAULT_MANAGEMENT_TYPE = 'Rotating';

export const normalizeManagementType = (v) => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return MANAGEMENT_TYPES.includes(t) ? t : null;
};

const mgmtOf = (p) => normalizeManagementType(p?.ManagementType) || DEFAULT_MANAGEMENT_TYPE;

// ── กฎฝั่ง JS ──
export const isLowStock = (p) => {
    const min = Number(p?.MinStock) || 0;
    return min > 0 && (Number(p?.CurrentStock) || 0) <= min && mgmtOf(p) !== 'Stored';
};
export const isReorderable = (p) => mgmtOf(p) !== 'Stored';          // รายการสั่งซื้อ (Rotating + Spare)
// เป้าหมายสต็อกสำหรับคำนวณจำนวนสั่ง: มี Max ใช้ Max · ไม่จำกัด (Max = 0) ใช้ Min × 2
export const reorderTarget = (max, min) => (Number(max) > 0 ? Number(max) : (Number(min) || 0) * 2);
export const isForecastable = (p) => mgmtOf(p) === 'Rotating';      // คาดการณ์ / ROP / ประเมินการเติม / Days of cover
export const countsAsDeadStock = (p) => mgmtOf(p) === 'Rotating';   // ของสำรอง/ของเก็บ ไม่เบิกเป็นเรื่องปกติ
export const checksOverstock = (p) => mgmtOf(p) !== 'Stored';

// ── ตรวจว่ารัน migration แล้วหรือยัง (cache; ถ้ายังไม่มีจะเช็คใหม่ทุก 60 วินาที ไม่ต้อง restart หลังรัน) ──
let cached = null;
let checkedAt = 0;
export const hasManagementColumns = async (pool) => {
    if (cached === true) return true;
    if (cached === false && Date.now() - checkedAt < 60_000) return false;
    try {
        const r = await pool.request().query(`
            SELECT CASE WHEN COL_LENGTH('dbo.Stock_Products', 'ManagementType') IS NOT NULL
                         AND COL_LENGTH('dbo.Stock_DeviceTypes', 'DefaultManagementType') IS NOT NULL
                        THEN 1 ELSE 0 END AS ok`);
        cached = r.recordset[0]?.ok === 1;
    } catch {
        cached = false;
    }
    checkedAt = Date.now();
    return cached;
};

// ── ชิ้นส่วน SQL ── (alias เช่น 'p' หรือ '' สำหรับไม่มี alias)
const col = (alias, name) => (alias ? `${alias}.${name}` : name);

// ใช้ใน SELECT: "<expr> AS ManagementType"
export const managementTypeSelect = (alias, has) =>
    has ? `${col(alias, 'ManagementType')} AS ManagementType` : `'${DEFAULT_MANAGEMENT_TYPE}' AS ManagementType`;

// ใช้หลัง INSERT อุปกรณ์ใหม่ที่ไม่ได้ระบุ ManagementType (เช่น สร้างอัตโนมัติจาก PO) ให้ได้ค่าเริ่มต้นของหมวด
// idExpr: SQL expression ของ ProductID ใหม่ เช่น 'SCOPE_IDENTITY()' (ต้องอยู่ batch เดียวกับ INSERT)
export const applyTypeDefaultSql = (idExpr, has) => (has ? `
    UPDATE p SET ManagementType = ISNULL(t.DefaultManagementType, '${DEFAULT_MANAGEMENT_TYPE}')
    FROM dbo.Stock_Products p JOIN dbo.Stock_DeviceTypes t ON t.TypeId = p.DeviceType
    WHERE p.ProductID = ${idExpr};` : '');

// เงื่อนไขของใกล้หมด (ใช้ใน WHERE) — เกณฑ์เดียวกับ isLowStock
export const lowStockWhere = (alias, has) =>
    `${col(alias, 'MinStock')} >= 1 AND ${col(alias, 'CurrentStock')} <= ${col(alias, 'MinStock')}` +
    (has ? ` AND ${col(alias, 'ManagementType')} <> 'Stored'` : '');
