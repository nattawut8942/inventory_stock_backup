import { sql, getPool } from '../config/db.js';
// ✅ Node.js < 18 ไม่มี fetch() built-in — ใช้ node-fetch แทนเพื่อให้ทำงานได้ทุกเวอร์ชัน
// ต้องรัน `npm install node-fetch` ก่อน ถ้ายังไม่มีใน package.json
import fetch from 'node-fetch';
// ✅ ใช้ตรวจสอบรหัสพนักงานกับ HR จริงฝั่ง backend (validation #5) — path ให้ตรงกับที่ employeeController.js ใช้
import { getHrmPool } from '../config/hrmDb.js';

// ✅ รูปแบบรหัสครุภัณฑ์บังคับฝั่ง backend ด้วย (validation #4) — เดิมเช็คแค่ frontend เท่านั้น
const FIXED_ASSET_CODE_REGEX = /^(CO|OF)\d{2}-\d{3}-\d{2}$/;

// ✅ ยืนยันรหัสพนักงานกับระบบ HR จริง แล้วคืนชื่อ/cost center ที่ถูกต้องจาก HR เสมอ
// (ไม่เชื่อค่าที่ client ส่งมาตรงๆ กันกรอกชื่อ/แผนกไม่ตรงกับรหัสจริง)
const verifyEmployeeWithHR = async (code) => {
    const trimmed = (code || '').trim();
    if (!trimmed) return { ok: false, status: 400, error: 'กรุณาระบุรหัสพนักงาน' };

    let pool;
    try {
        pool = getHrmPool();
    } catch (err) {
        return { ok: false, status: 503, error: 'ระบบตรวจสอบพนักงาน (HRM) ไม่พร้อมใช้งานในขณะนี้ ลองใหม่อีกครั้ง' };
    }

    try {
        const result = await pool.request()
            .input('Code', sql.VarChar, trimmed)
            .query(`
                SELECT TOP 1 [CODE], [NAME], [SURN], [COSTCENTER]
                FROM [dbHRM].[dbo].[Employee]
                WHERE [CODE] = @Code
            `);
        if (result.recordset.length === 0) {
            return { ok: false, status: 400, error: `ไม่พบรหัสพนักงาน "${trimmed}" ในระบบ HR` };
        }
        const emp = result.recordset[0];
        const lastInitial = (emp.SURN || '').trim().charAt(0).toUpperCase();
        const formattedName = lastInitial ? `${(emp.NAME || '').trim()}.${lastInitial}` : (emp.NAME || '').trim();
        return {
            ok: true,
            EmployeeCode: emp.CODE,
            FormattedName: formattedName,
            CostCenter: emp.COSTCENTER || null,
        };
    } catch (err) {
        console.error('verifyEmployeeWithHR error:', err.message);
        return { ok: false, status: 500, error: 'ตรวจสอบรหัสพนักงานไม่สำเร็จ' };
    }
};

// ✅ ตั้งเป็น env var ได้ — ถ้า backend deploy อยู่เครื่องเดียวกับ dciweb ให้ตั้ง
// DCI_ASSET_API_BASE=http://localhost/FXALOCATE_API/getAssetDetail (หรือ 127.0.0.1)
// ใน .env ของ production เพื่อเลี่ยงปัญหา hairpin NAT ที่ยิงออกแล้ววนกลับเข้าตัวเองผ่าน public domain ไม่ได้
const DCI_ASSET_API_BASE = process.env.DCI_ASSET_API_BASE || 'http://dciweb.dci.daikin.co.jp/FXALOCATE_API/getAssetDetail';

// GET: ค้นหาข้อมูลครุภัณฑ์จากระบบ Fixed Asset (DCI) ด้วยรหัสครุภัณฑ์ เช่น CO24-017-02
// ทำเป็น proxy ฝั่ง backend เพราะ dciweb.dci.daikin.co.jp เป็น endpoint บน intranet
// ที่ browser ของผู้ใช้อาจเรียกตรงไม่ได้ (และเลี่ยงปัญหา CORS ไปในตัว)
export const getAssetDetail = async (req, res) => {
    const { code } = req.params;
    if (!code || !code.trim()) {
        return res.status(400).json({ error: 'กรุณาระบุรหัสครุภัณฑ์' });
    }

    try {
        const upstream = await fetch(`${DCI_ASSET_API_BASE}/${encodeURIComponent(code.trim())}`);
        if (!upstream.ok) {
            // 🔍 DEBUG: ดู status code + body จริงจาก DCI เวลาเรียกจาก backend (ลบทิ้งได้เมื่อหาสาเหตุเจอแล้ว)
            const bodyText = await upstream.text().catch(() => '(อ่าน body ไม่ได้)');
            console.log(`[getAssetDetail] upstream returned ${upstream.status} ${upstream.statusText}:`, bodyText);
            return res.status(404).json({ error: 'ไม่พบรหัสครุภัณฑ์นี้ในระบบ Fixed Asset' });
        }
        const data = await upstream.json();

        // ยืนยันแล้วว่า DCI ห่อ response เป็น array เสมอ เช่น
        // [{ asno, costcenter, asname, cost, accumdp, bkamt, place, pic1, pic2, pic3, ... }]
        const record = Array.isArray(data) ? data[0] : data;
        if (!record) {
            return res.status(404).json({ error: 'ไม่พบรหัสครุภัณฑ์นี้ในระบบ Fixed Asset' });
        }

        res.json({
            success: true,
            AssetName: record.asname ?? null,
            Cost: record.cost ?? null,
            RemainingValue: record.bkamt ?? null,
            Place: record.place ?? null,
        });
    } catch (err) {
        // 🔍 log ให้ละเอียดขึ้น เพื่อแยกสาเหตุ: DNS หา host ไม่เจอ (ENOTFOUND), ต่อไม่ได้ (ECONNREFUSED),
        // timeout (ETIMEDOUT/AbortError), หรือ network อื่น ๆ
        console.error('Get Asset Detail Error:', {
            message: err.message,
            code: err.cause?.code || err.code || null,
            name: err.name,
        });
        res.status(502).json({ error: 'ไม่สามารถเชื่อมต่อระบบ Fixed Asset (DCI) ได้' });
    }
};

// GET: ดึงรายการยืม (ที่ยังไม่ได้คืน)
export const getBorrowings = async (req, res) => {
    try {
        const pool = getPool();
        // ✅ ดึงทุกสถานะ (ไม่กรองเฉพาะ 'borrowed' แล้ว) เพื่อให้รายการที่คืนแล้วยังโชว์ในตาราง
        // และหน้า frontend คำนวณ stats (ทั้งหมด/กำลังยืม/คืนแล้ว) ได้ถูกต้อง
        const result = await pool.request().query(`
            SELECT TOP 500 * FROM dbo.IT_Borrowings
            ORDER BY brID DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Borrowings Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// POST: บันทึกการยืม
export const createBorrowing = async (req, res) => {
    const { brname, Category, brfixasset, brserial, brqty, brEmpCode, brReason, StartDate, EndDate, recorded_by } = req.body;

    // basic validation so the API never inserts a half-empty record
    if (!brname || !brEmpCode || !StartDate || !EndDate) {
        return res.status(400).json({ error: 'กรุณาระบุอุปกรณ์ รหัสพนักงานผู้ยืม และวันที่ยืม-คืนให้ครบถ้วน' });
    }
    // ✅ บังคับ S/N เฉพาะอุปกรณ์ประเภทครุภัณฑ์ (Asset) เท่านั้น อุปกรณ์ทั่วไปไม่ต้องบังคับ
    if (Category === 'Asset' && !brserial) {
        return res.status(400).json({ error: 'อุปกรณ์ประเภทครุภัณฑ์ (Asset) ต้องระบุหมายเลข Serial (S/N)' });
    }
    // ✅ บังคับรหัสครุภัณฑ์ (Fix Asset) ด้วยเช่นกันสำหรับ Asset — เพื่อ audit/ติดตามทรัพย์สินให้ครบ
    if (Category === 'Asset' && !brfixasset) {
        return res.status(400).json({ error: 'อุปกรณ์ประเภทครุภัณฑ์ (Asset) ต้องระบุรหัสครุภัณฑ์ (Fix Asset No.)' });
    }
    // ✅ [validation #4] เช็ครูปแบบรหัสครุภัณฑ์ฝั่ง backend ด้วย เผื่อมีคนยิง API ข้ามฟอร์ม
    if (brfixasset && !FIXED_ASSET_CODE_REGEX.test(brfixasset.trim())) {
        return res.status(400).json({ error: 'รูปแบบรหัสครุภัณฑ์ไม่ถูกต้อง (ต้องเป็น COXX-XXX-XX หรือ OFXX-XXX-XX)' });
    }
    if (!brReason || !brReason.trim()) {
        return res.status(400).json({ error: 'กรุณาระบุเหตุผลการยืม' });
    }
    if (new Date(EndDate) < new Date(StartDate)) {
        return res.status(400).json({ error: 'กำหนดคืนต้องไม่มาก่อนวันที่ยืม' });
    }
    // ✅ [validation #9] เตือน (ไม่บล็อก) ถ้ากำหนดคืนเป็นวันในอดีต — ยังบันทึกได้ เผื่อกรอกข้อมูลย้อนหลังจริง ๆ
    const endDateIsPast = new Date(EndDate) < new Date(new Date().toDateString());

    // ✅ [validation #5] ยืนยันรหัสพนักงานกับ HR จริง แล้วใช้ชื่อ/cost center จาก HR เสมอ ไม่เชื่อค่าจาก client ตรงๆ
    const emp = await verifyEmployeeWithHR(brEmpCode);
    if (!emp.ok) {
        return res.status(emp.status).json({ error: emp.error });
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        // ✅ [validation #1+#2] กันยืมซ้ำ + กัน race condition ตอน 2 คนกด submit พร้อมกัน
        // ใช้ WITH (UPDLOCK, HOLDLOCK) เพื่อ lock แถวที่เกี่ยวข้องไว้จนกว่า transaction จะจบ
        // เช็คเฉพาะตอนมี brfixasset หรือ brserial ระบุมา (ของทั่วไปไม่มีตัวระบุตัวเดียวเป๊ะๆ เลยไม่เช็ค)
        if (brfixasset || brserial) {
            const dupCheck = await new sql.Request(transaction)
                .input('brfixasset', sql.NVarChar, brfixasset || null)
                .input('brserial', sql.NVarChar, brserial || null)
                .query(`
                    SELECT TOP 1 brID, brname, brEmpname
                    FROM dbo.IT_Borrowings WITH (UPDLOCK, HOLDLOCK)
                    WHERE brStatus = 'borrowed'
                      AND (
                        (@brfixasset IS NOT NULL AND brfixasset = @brfixasset)
                        OR (@brserial IS NOT NULL AND brserial = @brserial)
                      )
                `);
            if (dupCheck.recordset.length > 0) {
                const existing = dupCheck.recordset[0];
                await transaction.rollback();
                return res.status(409).json({
                    error: `อุปกรณ์นี้ถูกยืมอยู่แล้วโดย ${existing.brEmpname} (ยังไม่ได้คืน) — รับคืนก่อนถึงจะยืมซ้ำได้`,
                });
            }
        }

        await new sql.Request(transaction)
            .input('brname', sql.NVarChar, brname)
            .input('Category', sql.VarChar, Category || null)
            .input('brfixasset', sql.NVarChar, brfixasset || null)
            .input('brserial', sql.NVarChar, brserial || null)
            .input('brqty', sql.Int, Category === 'Asset' ? 1 : (brqty || 1))
            .input('brEmpCode', sql.VarChar, emp.EmployeeCode)
            .input('brEmpname', sql.NVarChar, emp.FormattedName)
            .input('brEmpDept', sql.VarChar, emp.CostCenter)
            .input('brReason', sql.NVarChar, brReason.trim())
            .input('StartDate', sql.Date, StartDate)
            .input('EndDate', sql.Date, EndDate)
            .input('brStatus', sql.VarChar, 'borrowed')
            .input('recorded_by', sql.NVarChar, recorded_by || null)
            .query(`
                INSERT INTO dbo.IT_Borrowings (brname, Category, brfixasset, brserial, brqty, brEmpCode, brEmpname, brEmpDept, brReason, StartDate, EndDate, brStatus, recorded_by)
                VALUES (@brname, @Category, @brfixasset, @brserial, @brqty, @brEmpCode, @brEmpname, @brEmpDept, @brReason, @StartDate, @EndDate, @brStatus, @recorded_by)
            `);

        await transaction.commit();
        res.json({
            success: true,
            message: 'บันทึกการยืมสำเร็จ',
            warning: endDateIsPast ? 'กำหนดคืนที่ระบุเป็นวันที่ผ่านมาแล้ว โปรดตรวจสอบว่าถูกต้อง' : null,
        });
    } catch (err) {
        await transaction.rollback().catch(() => {});
        console.error('Create Borrowing Error:', err);
        res.status(500).json({ error: 'Failed to create record' });
    }
};

// PUT: แก้ไขข้อมูลรายการยืม (เผื่อบันทึกผิด) — แก้ได้ทุกฟิลด์ รวมถึงเปลี่ยนสถานะเองได้
export const updateBorrowing = async (req, res) => {
    const { id } = req.params;
    const {
        brname, Category, brfixasset, brserial, brqty,
        brEmpCode, brReason,
        StartDate, EndDate, brStatus, received_by,
    } = req.body;

    if (!id || Number.isNaN(Number(id))) {
        return res.status(400).json({ error: 'Invalid borrowing id' });
    }
    if (!brname || !brEmpCode || !StartDate || !EndDate) {
        return res.status(400).json({ error: 'กรุณาระบุอุปกรณ์ รหัสพนักงานผู้ยืม และวันที่ยืม-คืนให้ครบถ้วน' });
    }
    if (Category === 'Asset' && !brserial) {
        return res.status(400).json({ error: 'อุปกรณ์ประเภทครุภัณฑ์ (Asset) ต้องระบุหมายเลข Serial (S/N)' });
    }
    if (Category === 'Asset' && !brfixasset) {
        return res.status(400).json({ error: 'อุปกรณ์ประเภทครุภัณฑ์ (Asset) ต้องระบุรหัสครุภัณฑ์ (Fix Asset No.)' });
    }
    // ✅ [validation #4]
    if (brfixasset && !FIXED_ASSET_CODE_REGEX.test(brfixasset.trim())) {
        return res.status(400).json({ error: 'รูปแบบรหัสครุภัณฑ์ไม่ถูกต้อง (ต้องเป็น COXX-XXX-XX หรือ OFXX-XXX-XX)' });
    }
    if (!brReason || !brReason.trim()) {
        return res.status(400).json({ error: 'กรุณาระบุเหตุผลการยืม' });
    }
    if (new Date(EndDate) < new Date(StartDate)) {
        return res.status(400).json({ error: 'กำหนดคืนต้องไม่มาก่อนวันที่ยืม' });
    }
    const status = brStatus === 'returned' ? 'returned' : 'borrowed';

    // ✅ [validation #5] ยืนยันรหัสพนักงานกับ HR จริงอีกครั้งตอนแก้ไขด้วย (ไม่ใช่แค่ตอนสร้างใหม่)
    const emp = await verifyEmployeeWithHR(brEmpCode);
    if (!emp.ok) {
        return res.status(emp.status).json({ error: emp.error });
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        // ✅ [validation #6] ถ้าจะปิดเป็น "คืนแล้ว" ต้องเช็คว่า StartDate ใหม่ไม่มาหลังวันที่คืนจริงเดิม (หรือหลังวันนี้ถ้ายังไม่เคยมีวันที่คืน)
        const existingRes = await new sql.Request(transaction)
            .input('brID', sql.Int, id)
            .query(`SELECT ActualReturnDate FROM dbo.IT_Borrowings WITH (UPDLOCK, HOLDLOCK) WHERE brID = @brID`);
        if (existingRes.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'ไม่พบรายการนี้' });
        }
        if (status === 'returned') {
            const existingReturnDate = existingRes.recordset[0].ActualReturnDate;
            const effectiveReturnDate = existingReturnDate ? new Date(existingReturnDate) : new Date();
            if (new Date(StartDate) > effectiveReturnDate) {
                await transaction.rollback();
                return res.status(400).json({ error: 'วันที่เริ่มยืมมาหลังวันที่รับคืนจริงไม่ได้' });
            }
        }

        // ✅ [validation #1+#2] กันยืมซ้ำตอนแก้ไข (เผื่อแก้ Fix Asset/S/N ให้ไปชนกับรายการอื่นที่ยังยืมอยู่) — ไม่นับตัวเอง
        if (status === 'borrowed' && (brfixasset || brserial)) {
            const dupCheck = await new sql.Request(transaction)
                .input('brID', sql.Int, id)
                .input('brfixasset', sql.NVarChar, brfixasset || null)
                .input('brserial', sql.NVarChar, brserial || null)
                .query(`
                    SELECT TOP 1 brID, brEmpname
                    FROM dbo.IT_Borrowings WITH (UPDLOCK, HOLDLOCK)
                    WHERE brStatus = 'borrowed'
                      AND brID <> @brID
                      AND (
                        (@brfixasset IS NOT NULL AND brfixasset = @brfixasset)
                        OR (@brserial IS NOT NULL AND brserial = @brserial)
                      )
                `);
            if (dupCheck.recordset.length > 0) {
                await transaction.rollback();
                return res.status(409).json({
                    error: `อุปกรณ์นี้ถูกยืมอยู่แล้วโดย ${dupCheck.recordset[0].brEmpname} (ยังไม่ได้คืน)`,
                });
            }
        }

        const result = await new sql.Request(transaction)
            .input('brID', sql.Int, id)
            .input('brname', sql.NVarChar, brname)
            .input('Category', sql.VarChar, Category || null)
            .input('brfixasset', sql.NVarChar, brfixasset || null)
            .input('brserial', sql.NVarChar, brserial || null)
            .input('brqty', sql.Int, Category === 'Asset' ? 1 : (brqty || 1))
            .input('brEmpCode', sql.VarChar, emp.EmployeeCode)
            .input('brEmpname', sql.NVarChar, emp.FormattedName)
            .input('brEmpDept', sql.VarChar, emp.CostCenter)
            .input('brReason', sql.NVarChar, brReason.trim())
            .input('StartDate', sql.Date, StartDate)
            .input('EndDate', sql.Date, EndDate)
            .input('brStatus', sql.VarChar, status)
            .input('received_by', sql.NVarChar, status === 'returned' ? (received_by || null) : null)
            // ✅ ถ้าแก้กลับเป็น "กำลังยืม" ให้เคลียร์ ActualReturnDate; ถ้าเป็น "คืนแล้ว" และยังไม่เคยมีวันที่คืน ให้ใส่เวลาปัจจุบันให้
            .query(`
                UPDATE dbo.IT_Borrowings
                SET brname = @brname,
                    Category = @Category,
                    brfixasset = @brfixasset,
                    brserial = @brserial,
                    brqty = @brqty,
                    brEmpCode = @brEmpCode,
                    brEmpname = @brEmpname,
                    brEmpDept = @brEmpDept,
                    brReason = @brReason,
                    StartDate = @StartDate,
                    EndDate = @EndDate,
                    brStatus = @brStatus,
                    received_by = @received_by,
                    ActualReturnDate = CASE
                        WHEN @brStatus = 'returned' AND ActualReturnDate IS NULL THEN GETDATE()
                        WHEN @brStatus = 'borrowed' THEN NULL
                        ELSE ActualReturnDate
                    END
                WHERE brID = @brID
            `);

        if (result.rowsAffected[0] === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'ไม่พบรายการนี้' });
        }
        await transaction.commit();
        res.json({ success: true, message: 'แก้ไขข้อมูลสำเร็จ' });
    } catch (err) {
        await transaction.rollback().catch(() => {});
        console.error('Update Borrowing Error:', err);
        res.status(500).json({ error: 'Failed to update record' });
    }
};

// PUT: รับคืน (คืนอุปกรณ์)
export const returnBorrowing = async (req, res) => {
    const { id } = req.params;
    const { received_by } = req.body;

    if (!id || Number.isNaN(Number(id))) {
        return res.status(400).json({ error: 'Invalid borrowing id' });
    }

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('brID', sql.Int, id)
            .input('received_by', sql.NVarChar, received_by || null)
            .input('ActualReturnDate', sql.DateTime, new Date())
            .query(`
                UPDATE dbo.IT_Borrowings 
                SET brStatus = 'returned', received_by = @received_by, ActualReturnDate = @ActualReturnDate
                WHERE brID = @brID AND brStatus = 'borrowed'
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'ไม่พบรายการนี้ หรือถูกรับคืนไปแล้ว' });
        }
        res.json({ success: true, message: 'รับคืนสำเร็จ' });
    } catch (err) {
        console.error('Return Borrowing Error:', err);
        res.status(500).json({ error: 'Failed to update status' });
    }
};