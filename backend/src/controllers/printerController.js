import { sql, getPool } from '../config/db.js';
import { scanOnePrinter } from '../services/printerScanService.js';
import { printerPhotoUrl } from './printerPhotoController.js';

// GET /api/printer-health
// สรุปสถานะล่าสุดของทุกเครื่อง + จำนวน error ที่ยังไม่แก้
export const getPrinterHealth = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT
                p.PrinterId, p.IpAddress, p.Name, p.Model, p.Location, p.Factory, p.IsColor, p.PhotoFile, p.SitePhotoFile,
                p.ConnectionType, p.UsbHost,
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
        res.json(result.recordset.map(({ PhotoFile, SitePhotoFile, ...row }) => ({
            ...row,
            PhotoUrl: printerPhotoUrl(PhotoFile),
            SitePhotoUrl: printerPhotoUrl(SitePhotoFile),
        })));
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

// POST /api/printer-health/scan-all
// ดึงข้อมูลทุกเครื่องที่ใช้งานอยู่ (ทีละ 4 เครื่องพร้อมกัน) — เครื่องไหนล้มเหลวไม่กระทบเครื่องอื่น
export const scanAllPrinters = async (req, res) => {
    try {
        const pool = getPool();
        const rows = await pool.request().query(`SELECT PrinterId, Name, IpAddress FROM dbo.Printers WHERE IsActive = 1 ORDER BY Name`);
        // เครื่องที่ไม่มี IPv4 (เช่น ต่อ USB หรือ "SHARE FROM ...") สแกนผ่านเครือข่ายไม่ได้ จึงข้าม และรายงานแยก
        const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
        const printers = rows.recordset.filter((p) => IPV4.test((p.IpAddress || '').trim()));
        const skipped = rows.recordset.length - printers.length;
        const results = [];
        const CONCURRENCY = 4;
        for (let i = 0; i < printers.length; i += CONCURRENCY) {
            const batch = printers.slice(i, i + CONCURRENCY);
            const settled = await Promise.allSettled(batch.map((p) => scanOnePrinter(p.PrinterId)));
            settled.forEach((s, idx) => {
                const p = batch[idx];
                results.push(s.status === 'fulfilled'
                    ? { PrinterId: p.PrinterId, Name: p.Name, ok: true }
                    : { PrinterId: p.PrinterId, Name: p.Name, ok: false, error: s.reason?.message || 'scan failed' });
            });
        }
        const failed = results.filter((r) => !r.ok).length;
        res.locals.auditSummary = `ดึงข้อมูลทุกเครื่อง ${results.length} เครื่อง (สำเร็จ ${results.length - failed}, ล้มเหลว ${failed}, ข้าม ${skipped})`;
        res.json({ success: true, total: results.length, failed, skipped, results });
    } catch (err) {
        console.error('Scan All Printers Error:', err);
        res.status(500).json({ success: false, error: 'ไม่สามารถดึงข้อมูลทุกเครื่องได้' });
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

// ประเภทการเชื่อมต่อ: 'ethernet' (ค่าเริ่มต้น) หรือ 'usb' (ต้องระบุชื่อคอมพิวเตอร์ที่ต่ออยู่)
const parseConnection = (body) => {
    const connectionType = body.ConnectionType === 'usb' ? 'usb' : 'ethernet';
    const usbHost = connectionType === 'usb' ? (body.UsbHost?.trim().slice(0, 100) || null) : null;
    return { connectionType, usbHost };
};

// POST /api/printer-health
// เพิ่มเครื่องพรินเตอร์ใหม่เข้า dbo.Printers
export const createPrinter = async (req, res) => {
    const { IpAddress, Name, Model, Location, Factory } = req.body;
    const { connectionType, usbHost } = parseConnection(req.body);

    if (!IpAddress || !Name) {
        return res.status(400).json({ success: false, error: 'ต้องระบุ IP และชื่อเครื่อง' });
    }
    if (connectionType === 'usb' && !usbHost) {
        return res.status(400).json({ success: false, error: 'ต้องระบุชื่อคอมพิวเตอร์ที่เครื่องพรินเตอร์ต่อ USB อยู่' });
    }

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('IpAddress', sql.VarChar, IpAddress.trim())
            .input('Name', sql.VarChar, Name.trim())
            .input('Model', sql.VarChar, Model?.trim() || null)
            .input('Location', sql.VarChar, Location?.trim() || null)
            .input('Factory', sql.VarChar, Factory?.trim() || null)
            .input('ConnectionType', sql.NVarChar(10), connectionType)
            .input('UsbHost', sql.NVarChar(100), usbHost)
            .query(`
                INSERT INTO dbo.Printers (IpAddress, Name, Model, Location, Factory, ConnectionType, UsbHost)
                OUTPUT INSERTED.PrinterId
                VALUES (@IpAddress, @Name, @Model, @Location, @Factory, @ConnectionType, @UsbHost)
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
    const { connectionType, usbHost } = parseConnection(req.body);

    if (!IpAddress || !Name) {
        return res.status(400).json({ success: false, error: 'ต้องระบุ IP และชื่อเครื่อง' });
    }
    if (connectionType === 'usb' && !usbHost) {
        return res.status(400).json({ success: false, error: 'ต้องระบุชื่อคอมพิวเตอร์ที่เครื่องพรินเตอร์ต่อ USB อยู่' });
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
            .input('ConnectionType', sql.NVarChar(10), connectionType)
            .input('UsbHost', sql.NVarChar(100), usbHost)
            .query(`
                UPDATE dbo.Printers
                SET IpAddress = @IpAddress, Name = @Name, Model = @Model,
                    Location = @Location, Factory = @Factory,
                    ConnectionType = @ConnectionType, UsbHost = @UsbHost
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

// GET /api/printer-locations
// printer ที่ใช้งานอยู่ทั้งหมด + ตำแหน่งบนแผนผัง (ยังไม่ได้วางจะเป็น null)
export const getPrinterLocations = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT PrinterId, Name, IpAddress, Model, Location, Factory,
                   FactoryLayoutID AS factory_layout_id,
                   LocationX AS location_x,
                   LocationY AS location_y
            FROM dbo.Printers
            WHERE IsActive = 1
            ORDER BY Name
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Get Printer Locations Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// PUT /api/printer-locations/:id
// วาง / ย้ายแผนผัง / ลากปรับพิกัด ของ printer
export const updatePrinterLocation = async (req, res) => {
    const { id } = req.params;
    const { factory_layout_id, location_x, location_y } = req.body;

    try {
        const pool = getPool();
        const result = await pool.request()
            .input('PrinterId', sql.Int, id)
            .input('FactoryLayoutID', sql.Int, factory_layout_id || null)
            .input('LocationX', sql.Float, location_x ?? null)
            .input('LocationY', sql.Float, location_y ?? null)
            .query(`
                UPDATE dbo.Printers
                SET FactoryLayoutID = @FactoryLayoutID,
                    LocationX = @LocationX,
                    LocationY = @LocationY,
                    LocationUpdatedAt = GETDATE()
                WHERE PrinterId = @PrinterId AND IsActive = 1
            `);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, error: 'Printer not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Update Printer Location Error:', err);
        res.status(500).json({ success: false, error: err.message });
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