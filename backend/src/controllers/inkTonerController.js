import { getDciPool } from '../config/dciDb.js';
import { sql, getPool } from '../config/db.js';
import { printerPhotoUrl } from './printerPhotoController.js';

// GET Ink & Toner Stock from DCI Database
export const getInkTonerStock = async (req, res) => {
    try {
        const pool = getDciPool();
        const result = await pool.request().query(`
            SELECT [Prt_Code]
                  ,[Prt_Name]
                  ,[Spect]
                  ,[SaftyStock]
                  ,[Minimum]
                  ,[CurrentStock]
                  ,[Um]
                  ,[Vender]
            FROM [dbDCI].[dbo].[SP_PartSock]
            WHERE Prt_Code LIKE '6CC-ITP%'
              AND Prt_Status = 'ACTIVE'
            ORDER BY Prt_Name
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Ink & Toner Stock Error:', err);
        res.status(500).json({ error: 'ไม่สามารถดึงข้อมูล Ink & Toner Stock ได้' });
    }
};

// GET /ink-toner/compat
// ความสัมพันธ์หมึก-เครื่องทั้งหมด (เฉพาะเครื่องที่ยัง IsActive) ใช้ทำคอลัมน์ "จำนวนเครื่อง" และ modal
export const getInkTonerCompat = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT c.Prt_Code, c.PrinterId, c.Remark,
                   p.Name, p.Model, p.IpAddress, p.Location, p.Factory, p.PhotoFile, p.ConnectionType, p.UsbHost
            FROM dbo.Stock_InkTonerCompat c
            JOIN dbo.Printers p ON p.PrinterId = c.PrinterId
            WHERE p.IsActive = 1
            ORDER BY c.Prt_Code, p.Name
        `);
        const data = result.recordset.map(({ PhotoFile, ...row }) => ({ ...row, PhotoUrl: printerPhotoUrl(PhotoFile) }));
        res.json({ success: true, data });
    } catch (err) {
        console.error('Get Ink Toner Compat Error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
};

// PUT /ink-toner/:code/printers
// body: { items: [{ PrinterId: number, Remark?: string }] }
// แทนที่ชุดเครื่องของรหัสหมึกนี้ทั้งชุด (ลบของเดิม แล้วใส่ใหม่ในทรานแซกชันเดียว)
export const setInkTonerCompat = async (req, res) => {
    const code = String(req.params.code || '').trim();
    const items = req.body?.items;

    if (!code || code.length > 50) {
        return res.status(400).json({ success: false, error: 'รหัสหมึกไม่ถูกต้อง' });
    }
    if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, error: 'ต้องส่ง items เป็นรายการ' });
    }

    // ตรวจ/ทำความสะอาดข้อมูลก่อนเขียน
    const clean = [];
    const seen = new Set();
    for (const it of items) {
        const id = Number(it?.PrinterId);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, error: 'PrinterId ไม่ถูกต้อง' });
        }
        if (seen.has(id)) continue;
        seen.add(id);
        const remark = typeof it.Remark === 'string' ? it.Remark.trim().slice(0, 200) : '';
        clean.push({ PrinterId: id, Remark: remark || null });
    }

    try {
        // ต้องเป็นรหัสที่มีจริงใน DCI (กันพิมพ์รหัสผิด)
        const dci = getDciPool();
        const check = await dci.request()
            .input('Code', sql.NVarChar(50), code)
            .query(`SELECT TOP 1 Prt_Code FROM [dbDCI].[dbo].[SP_PartSock] WHERE Prt_Code = @Code`);
        if (check.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'ไม่พบรหัสหมึกนี้ในระบบ DCI' });
        }

        const pool = getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('Code', sql.NVarChar(50), code)
                .query(`DELETE FROM dbo.Stock_InkTonerCompat WHERE Prt_Code = @Code`);

            for (const it of clean) {
                await new sql.Request(tx)
                    .input('Code', sql.NVarChar(50), code)
                    .input('PrinterId', sql.Int, it.PrinterId)
                    .input('Remark', sql.NVarChar(200), it.Remark)
                    .query(`
                        INSERT INTO dbo.Stock_InkTonerCompat (Prt_Code, PrinterId, Remark)
                        VALUES (@Code, @PrinterId, @Remark)
                    `);
            }
            await tx.commit();
        } catch (innerErr) {
            await tx.rollback().catch(() => {});
            throw innerErr;
        }

        res.locals.auditSummary = `${code}: ผูกเครื่อง ${clean.length} เครื่อง`;
        res.json({ success: true, count: clean.length });
    } catch (err) {
        console.error('Set Ink Toner Compat Error:', err);
        // FK ชี้ไป PrinterId ที่ไม่มีอยู่
        if (err.number === 547) {
            return res.status(400).json({ success: false, error: 'มีเครื่องพรินเตอร์ที่ไม่มีในระบบ' });
        }
        res.status(500).json({ success: false, error: 'ไม่สามารถบันทึกได้' });
    }
};
