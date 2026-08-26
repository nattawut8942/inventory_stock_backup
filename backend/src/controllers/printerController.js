import { sql, getPool } from '../config/db.js';
import { scanOnePrinter } from '../services/printerScanService.js';

// GET /api/printer-health
// สรุปสถานะล่าสุดของทุกเครื่อง + จำนวน error ที่ยังไม่แก้
export const getPrinterHealth = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT
                p.PrinterId, p.IpAddress, p.Name, p.Model, p.Location, p.Factory, p.IsColor,
                r.CheckedAt, r.Method, r.Online,
                r.BlackPct, r.CyanPct, r.MagentaPct, r.YellowPct,
                e.OpenErrorCount
            FROM dbo.Printers p
            OUTER APPLY (
                SELECT TOP 1 *
                FROM dbo.TonerReadings tr
                WHERE tr.PrinterId = p.PrinterId
                ORDER BY tr.CheckedAt DESC
            ) r
            OUTER APPLY (
                SELECT COUNT(*) AS OpenErrorCount
                FROM dbo.ErrorLogs el
                WHERE el.PrinterId = p.PrinterId AND el.Status = 'Open'
            ) e
            WHERE p.IsActive = 1
            ORDER BY p.Name
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Printer Health Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET /api/printer-health/:id/history?days=14
// เทรนด์ % หมึกของเครื่องเดียว ย้อนหลัง N วัน (สำหรับกราฟ)
export const getPrinterHistory = async (req, res) => {
    const { id } = req.params;
    const days = parseInt(req.query.days) || 14;

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('PrinterId', sql.Int, id)
            .input('Days', sql.Int, days)
            .query(`
                SELECT CheckedAt, Method, Online, BlackPct, CyanPct, MagentaPct, YellowPct
                FROM dbo.TonerReadings
                WHERE PrinterId = @PrinterId
                  AND CheckedAt >= DATEADD(DAY, -@Days, SYSUTCDATETIME())
                ORDER BY CheckedAt ASC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Printer History Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// POST /api/printer-health/:id/scan
// ดึงข้อมูลเครื่องนี้เดี๋ยวนี้ (ไม่รอ cron) — ใช้กับปุ่ม "ดึงข้อมูล" รายเครื่อง
export const scanPrinterNow = async (req, res) => {
    const { id } = req.params;
    try {
        const reading = await scanOnePrinter(id);
        res.json({ success: true, reading });
    } catch (err) {
        console.error('Scan Printer Now Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST /api/printer-health
// เพิ่มเครื่องพรินเตอร์ใหม่เข้า dbo.Printers
export const createPrinter = async (req, res) => {
    const { IpAddress, Name, Model, Location, Factory } = req.body;

    if (!IpAddress || !Name) {
        return res.status(400).json({ success: false, error: 'ต้องระบุ IP และชื่อเครื่อง' });
    }

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('IpAddress', sql.VarChar, IpAddress.trim())
            .input('Name', sql.VarChar, Name.trim())
            .input('Model', sql.VarChar, Model?.trim() || null)
            .input('Location', sql.VarChar, Location?.trim() || null)
            .input('Factory', sql.VarChar, Factory?.trim() || null)
            .query(`
                INSERT INTO dbo.Printers (IpAddress, Name, Model, Location, Factory)
                OUTPUT INSERTED.PrinterId
                VALUES (@IpAddress, @Name, @Model, @Location, @Factory)
            `);
        res.json({ success: true, printerId: result.recordset[0].PrinterId });
    } catch (err) {
        console.error('Create Printer Error:', err);
        // ชนกับ UQ_Printers_Ip (IP ซ้ำ)
        if (err.message?.includes('UQ_Printers_Ip')) {
            return res.status(409).json({ success: false, error: 'IP นี้มีอยู่ในระบบแล้ว' });
        }
        res.status(500).json({ success: false, error: 'Database error' });
    }
};

// PUT /api/printer-health/:id
// แก้ไขข้อมูลเครื่องพรินเตอร์
export const updatePrinter = async (req, res) => {
    const { id } = req.params;
    const { IpAddress, Name, Model, Location, Factory } = req.body;

    if (!IpAddress || !Name) {
        return res.status(400).json({ success: false, error: 'ต้องระบุ IP และชื่อเครื่อง' });
    }

    try {
        const pool = getPool();
        await pool.request()
            .input('PrinterId', sql.Int, id)
            .input('IpAddress', sql.VarChar, IpAddress.trim())
            .input('Name', sql.VarChar, Name.trim())
            .input('Model', sql.VarChar, Model?.trim() || null)
            .input('Location', sql.VarChar, Location?.trim() || null)
            .input('Factory', sql.VarChar, Factory?.trim() || null)
            .query(`
                UPDATE dbo.Printers
                SET IpAddress = @IpAddress, Name = @Name, Model = @Model,
                    Location = @Location, Factory = @Factory
                WHERE PrinterId = @PrinterId
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('Update Printer Error:', err);
        if (err.message?.includes('UQ_Printers_Ip')) {
            return res.status(409).json({ success: false, error: 'IP นี้มีอยู่ในระบบแล้ว' });
        }
        res.status(500).json({ success: false, error: 'Database error' });
    }
};

// GET /api/printer-health/meta/factories
// ดึงรายชื่อโรงงานจาก dbInfrastructure.dbo.Stock_Locations (ใช้กับ dropdown ในฟอร์ม + filter)
export const getFactoryOptions = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT TOP (1000) [LocationID], [Name]
            FROM [dbInfrastructure].[dbo].[Stock_Locations]
            ORDER BY [Name]
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Factory Options Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET /api/printer-health/:id/errors
// ประวัติ error ของเครื่องเดียว (ล่าสุดก่อน)
export const getPrinterErrors = async (req, res) => {
    const { id } = req.params;

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('PrinterId', sql.Int, id)
            .query(`
                SELECT ErrorLogId, PrinterEventTime, ScrapedAt,
                       ErrorCode, ErrorMessage, Status, ResolvedAt
                FROM dbo.ErrorLogs
                WHERE PrinterId = @PrinterId
                ORDER BY ScrapedAt DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Printer Errors Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};