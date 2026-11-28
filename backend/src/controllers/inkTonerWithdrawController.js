import { getDciPool } from '../config/dciDb.js';
import { sql } from '../config/db.js';

// ประวัติการเบิกหมึก/โทนเนอร์ จาก DCI (อ่านอย่างเดียว ไม่แก้ฐานข้อมูล DCI)
// ตัวกรองเดียวกับ query ที่ใช้ตรวจสอบ: รหัสมี 6CC-ITP00 และสถานะ STOCK_NEW
const BASE_WHERE = `Part_Code LIKE '%6CC-ITP00%' AND Part_Status = 'STOCK_NEW'`;
const TABLE = '[dbDCI].[dbo].[SP_PartOutDetail]';
const COST_EXPR = `COALESCE(NULLIF(LTRIM(RTRIM(CostCerter)), ''), 'ไม่ระบุ')`;

// สร้างเงื่อนไขจาก query string (ค่าทั้งหมดส่งเป็น parameter ไม่ต่อเข้า SQL ตรงๆ)
const buildWhere = (q = {}) => {
    const clauses = [BASE_WHERE];
    const inputs = [];
    const code = String(q.code || '').trim();
    if (code) {
        if (code.length > 50) throw Object.assign(new Error('รหัสไม่ถูกต้อง'), { status: 400 });
        clauses.push('Part_Code = @Code');
        inputs.push(['Code', sql.NVarChar(50), code]);
    }
    // ค้นหาทั่วไป: รหัส / Cost Center / ผู้เบิก / เหตุผล (+ รหัสที่ตรงกับชื่อรายการ ส่งมาเป็น codes)
    const term = String(q.search || '').trim();
    if (term) {
        if (term.length > 100) throw Object.assign(new Error('คำค้นยาวเกินไป'), { status: 400 });
        const ors = ['Part_Code LIKE @Search', 'CostCerter LIKE @Search', 'cr_by LIKE @Search', 'ReasonText LIKE @Search'];
        inputs.push(['Search', sql.NVarChar(120), `%${term}%`]);
        const codes = String(q.codes || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 300);
        codes.forEach((c, i) => inputs.push([`C${i}`, sql.NVarChar(50), c]));
        if (codes.length) ors.push(`Part_Code IN (${codes.map((_, i) => `@C${i}`).join(',')})`);
        clauses.push(`(${ors.join(' OR ')})`);
    }
    const cost = String(q.cost || '').trim();
    if (cost) {
        clauses.push(`${COST_EXPR} = @Cost`);
        inputs.push(['Cost', sql.NVarChar(100), cost]);
    }
    const from = q.from ? new Date(`${q.from}T00:00:00`) : null;
    const to = q.to ? new Date(`${q.to}T00:00:00`) : null;
    if (from && !Number.isNaN(from.getTime())) {
        clauses.push('upd_dt >= @From');
        inputs.push(['From', sql.DateTime, from]);
    }
    if (to && !Number.isNaN(to.getTime())) {
        // รวมทั้งวันของ "ถึงวันที่"
        const end = new Date(to.getTime() + 24 * 3600 * 1000);
        clauses.push('upd_dt < @To');
        inputs.push(['To', sql.DateTime, end]);
    }
    return { where: clauses.join(' AND '), inputs };
};

const runQuery = (text, inputs) => {
    const r = getDciPool().request();
    for (const [name, type, value] of inputs) r.input(name, type, value);
    return r.query(text);
};

// GET /ink-toner/withdrawals?code=&cost=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=
export const getInkWithdrawals = async (req, res) => {
    try {
        const { where, inputs } = buildWhere(req.query);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 2000);
        const result = await runQuery(`
            SELECT TOP (${limit})
                   Part_Code, Qty, ReasonText, CostCerter, cr_by, cr_dt, upd_by, upd_dt, expense_cd
            FROM ${TABLE}
            WHERE ${where}
            ORDER BY upd_dt DESC
        `, inputs);
        res.json({ success: true, data: result.recordset, limit });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
        console.error('Get Ink withdrawals Error:', err);
        res.status(500).json({ success: false, error: 'ไม่สามารถดึงประวัติการเบิกได้' });
    }
};

// GET /ink-toner/withdrawals/report?from=&to=&cost=
// ส่งเป็นแถวละเอียด "Cost Center × รายการ" และ "เดือน × รายการ" ให้หน้าเว็บคำนวณสรุป/สี เอง
export const getInkWithdrawalReport = async (req, res) => {
    try {
        const { where, inputs } = buildWhere(req.query);
        // bucket = day (รายวัน สำหรับช่วงสั้น) หรือ month (รายเดือน) — ค่าอื่นให้เป็นรายเดือน
        const bucketExpr = req.query.bucket === 'day' ? `FORMAT(upd_dt, 'yyyy-MM-dd')` : `FORMAT(upd_dt, 'yyyy-MM')`;
        const [costItem, monthItem, byRequester] = await Promise.all([
            runQuery(`
                SELECT ${COST_EXPR} AS CostCenter, Part_Code,
                       COUNT(*) AS Times, SUM(Qty) AS TotalQty, MAX(upd_dt) AS LastAt
                FROM ${TABLE} WHERE ${where}
                GROUP BY ${COST_EXPR}, Part_Code
            `, inputs),
            runQuery(`
                SELECT ${bucketExpr} AS Month, Part_Code,
                       COUNT(*) AS Times, SUM(Qty) AS TotalQty
                FROM ${TABLE} WHERE ${where}
                GROUP BY ${bucketExpr}, Part_Code
            `, inputs),
            // ผู้เบิก (cr_by) ทั้งหมด เรียงตามจำนวนครั้ง
            runQuery(`
                SELECT COALESCE(NULLIF(LTRIM(RTRIM(cr_by)), ''), N'ไม่ระบุ') AS Requester,
                       COUNT(*) AS Times, SUM(Qty) AS TotalQty, MAX(upd_dt) AS LastAt
                FROM ${TABLE} WHERE ${where}
                GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(cr_by)), ''), N'ไม่ระบุ')
                ORDER BY Times DESC
            `, inputs),
        ]);
        res.json({
            success: true,
            costItem: costItem.recordset,
            monthItem: monthItem.recordset,
            byRequester: byRequester.recordset,
        });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
        console.error('Get Ink withdrawal report Error:', err);
        res.status(500).json({ success: false, error: 'ไม่สามารถสรุปรายงานการเบิกได้' });
    }
};
