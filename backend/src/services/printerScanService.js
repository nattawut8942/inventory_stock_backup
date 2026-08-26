import cron from 'node-cron';
import { sql, getPool } from '../config/db.js';
import { checkPrinter, getTonerAlerts } from '../lib/printerScan.js';

// ดึงรายชื่อเครื่อง + IP จากตาราง Printers
async function getActivePrinters() {
    const pool = getPool();
    const result = await pool.request().query(`
        SELECT PrinterId, IpAddress FROM dbo.Printers WHERE IsActive = 1
    `);
    return result.recordset;
}

// บันทึกผลตรวจ 1 เครื่อง ลง TonerReadings
async function saveReading(printerId, reading) {
    const pool = getPool();
    await pool.request()
        .input('PrinterId', sql.Int, printerId)
        .input('Method', sql.VarChar, reading.method)
        .input('Online', sql.Bit, reading.online)
        .input('BlackPct', sql.TinyInt, reading.Black)
        .input('CyanPct', sql.TinyInt, reading.Cyan)
        .input('MagentaPct', sql.TinyInt, reading.Magenta)
        .input('YellowPct', sql.TinyInt, reading.Yellow)
        .query(`
            INSERT INTO dbo.TonerReadings
                (PrinterId, Method, Online, BlackPct, CyanPct, MagentaPct, YellowPct)
            VALUES
                (@PrinterId, @Method, @Online, @BlackPct, @CyanPct, @MagentaPct, @YellowPct)
        `);
}

// ตรวจว่าเครื่องนี้พิมพ์สีได้ไหม จากผลสแกนที่สำเร็จ แล้วจำไว้ (กันไม่ต้องเดาใหม่ทุกรอบ)
// เงื่อนไข: มีแค่ Black แต่ไม่มี Cyan/Magenta/Yellow เลย -> ขาวดำ
async function updateColorCapability(printerId, reading) {
    if (!reading.online) return; // สแกนไม่สำเร็จ ไม่รู้แน่ชัด อย่าเพิ่งฟันธง

    const hasAnyColor = reading.Cyan !== null || reading.Magenta !== null || reading.Yellow !== null;

    const pool = getPool();
    await pool.request()
        .input('PrinterId', sql.Int, printerId)
        .input('IsColor', sql.Bit, hasAnyColor)
        .query(`UPDATE dbo.Printers SET IsColor = @IsColor WHERE PrinterId = @PrinterId`);
}

// เทียบ error ที่เจอตอนนี้ กับที่เคยบันทึกไว้ (สถานะ Open)
// - เจอใหม่ (ไม่เคยมี Open ของ code เดียวกัน) -> insert
// - เคย Open อยู่ แต่ตอนนี้ไม่เจอแล้ว (สถานะกลับเป็น OK) -> auto-resolve
async function syncErrors(printerId, currentAlerts) {
    const pool = getPool();

    const openResult = await pool.request()
        .input('PrinterId', sql.Int, printerId)
        .query(`
            SELECT ErrorLogId, ErrorCode FROM dbo.ErrorLogs
            WHERE PrinterId = @PrinterId AND Status = 'Open'
        `);
    const openErrors = openResult.recordset;
    const currentCodes = new Set(currentAlerts.map(a => a.code));
    const openCodes = new Set(openErrors.map(e => e.ErrorCode));

    for (const alert of currentAlerts) {
        if (openCodes.has(alert.code)) continue;
        await pool.request()
            .input('PrinterId', sql.Int, printerId)
            .input('ErrorCode', sql.VarChar, alert.code)
            .input('ErrorMessage', sql.VarChar, alert.message)
            .query(`
                INSERT INTO dbo.ErrorLogs (PrinterId, ErrorCode, ErrorMessage, Status)
                VALUES (@PrinterId, @ErrorCode, @ErrorMessage, 'Open')
            `);
    }

    for (const openError of openErrors) {
        if (currentCodes.has(openError.ErrorCode)) continue;
        await pool.request()
            .input('ErrorLogId', sql.BigInt, openError.ErrorLogId)
            .query(`
                UPDATE dbo.ErrorLogs
                SET Status = 'Resolved', ResolvedAt = SYSUTCDATETIME()
                WHERE ErrorLogId = @ErrorLogId
            `);
    }
}

// ตรวจเครื่องเดียว ตาม PrinterId (ใช้กับปุ่ม "ดึงข้อมูล" รายเครื่อง)
async function scanOnePrinter(printerId) {
    const pool = getPool();
    const result = await pool.request()
        .input('PrinterId', sql.Int, printerId)
        .query(`SELECT PrinterId, IpAddress FROM dbo.Printers WHERE PrinterId = @PrinterId AND IsActive = 1`);

    const printer = result.recordset[0];
    if (!printer) {
        throw new Error('Printer not found or inactive');
    }

    const reading = await checkPrinter(printer.IpAddress);
    await saveReading(printer.PrinterId, reading);
    await updateColorCapability(printer.PrinterId, reading);

    try {
        const alerts = await getTonerAlerts(printer.IpAddress);
        await syncErrors(printer.PrinterId, alerts);
    } catch (err) {
        console.error(`[Printer Scan] Error sync failed for ${printer.IpAddress}:`, err.message);
    }

    return reading;
}

// ตรวจทุกเครื่อง (จำกัด concurrency กันยิงพร้อมกันเยอะเกินไป)
async function runPrinterScan() {
    console.log('[Printer Scan] Starting...');
    let printers;
    try {
        printers = await getActivePrinters();
    } catch (err) {
        console.error('[Printer Scan] Failed to load printer list:', err.message);
        return;
    }

    if (printers.length === 0) {
        console.log('[Printer Scan] No active printers in dbo.Printers — skip');
        return;
    }

    const CONCURRENCY = 5;
    const queue = [...printers];

    async function worker() {
        while (queue.length > 0) {
            const printer = queue.shift();
            try {
                const reading = await checkPrinter(printer.IpAddress);
                await saveReading(printer.PrinterId, reading);
                await updateColorCapability(printer.PrinterId, reading);

                try {
                    const alerts = await getTonerAlerts(printer.IpAddress);
                    await syncErrors(printer.PrinterId, alerts);
                } catch (errSync) {
                    console.error(`[Printer Scan] Error sync failed for ${printer.IpAddress}:`, errSync.message);
                }

                console.log(
                    `[Printer Scan] ${printer.IpAddress} -> ${reading.online ? reading.method : 'OFFLINE'}`
                );
            } catch (err) {
                console.error(`[Printer Scan] ${printer.IpAddress} failed:`, err.message);
            }
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    console.log('[Printer Scan] Done');
}

// ตั้ง cron รัน 3 รอบ/วัน: 08:00, 13:00, 18:00 (ปรับเวลาได้ตามต้องการ)
function startPrinterScanCron() {
    cron.schedule('0 8,13,18 * * *', async () => {
        await runPrinterScan();
    }, { scheduled: true, timezone: 'Asia/Bangkok' });

    console.log('[Printer Scan] Cron scheduled: 08:00, 13:00, 18:00 (Asia/Bangkok)');
}

export { startPrinterScanCron, runPrinterScan, scanOnePrinter };