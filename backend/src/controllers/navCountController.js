// controllers/navCountController.js
// นับงานค้างสำหรับแสดง badge ใน Sidebar — แต่ละค่านับแยกกัน ถ้าค่าไหน error จะคืน null เฉพาะค่านั้น
import { getPool } from '../config/db.js';
import { getItRequestPool } from '../config/itRequestDb.js';
import { getSoundPool } from '../config/soundDb.js';
import { getDciPool } from '../config/dciDb.js';
import { hasManagementColumns, lowStockWhere } from '../lib/stockManagement.js';

const countOrNull = async (fn) => {
    try {
        return await fn();
    } catch (err) {
        console.error('[nav-counts]', err.message);
        return null;
    }
};

const scalar = async (pool, query) => {
    const r = await pool.request().query(query);
    return r.recordset[0].cnt;
};

// GET /nav-counts → { po_open, borrowed, it_request_open, ma_attention, stock_low, cctv_offline, po_partial, cal_today }
export const getNavCounts = async (req, res) => {
    const db = () => getPool();

    const [
        printer_toner_low, po_open, borrowed, ma_attention, stock_low, cctv_offline, po_partial, cal_today, it_request_open,
        sound_offline, disposal_open, ink_low,
    ] = await Promise.all([
        // เครื่องพิมพ์ที่หมึกสีใดสีหนึ่งต่ำกว่าหรือเท่ากับ 20% (ค่าล่าสุดของแต่ละเครื่อง นับเครื่องละ 1)
        countOrNull(() => scalar(db(), `
            SELECT COUNT(*) AS cnt FROM dbo.Printers p
            CROSS APPLY (
                SELECT TOP 1 BlackPct, CyanPct, MagentaPct, YellowPct
                FROM dbo.TonerReadings tr WHERE tr.PrinterId = p.PrinterId
                ORDER BY tr.CheckedAt DESC
            ) r
            WHERE p.IsActive = 1
              AND (r.BlackPct <= 20 OR r.CyanPct <= 20 OR r.MagentaPct <= 20 OR r.YellowPct <= 20)`)),

        // PO ที่ยังไม่ปิด (Open / Pending)
        countOrNull(() => scalar(db(), `
            SELECT COUNT(*) AS cnt FROM dbo.Stock_PurchaseOrders
            WHERE Status IN ('Open', 'Pending')`)),

        // อุปกรณ์ที่ยังยืมอยู่
        countOrNull(() => scalar(db(), `
            SELECT COUNT(*) AS cnt FROM dbo.IT_Borrowings
            WHERE brStatus = 'borrowed'`)),

        // MA ที่ "ใกล้หมดอายุ (≤ 60 วัน)" — ตรงกับการ์ดในหน้า MA (getEffectiveStatus === 'Expiring')
        // นับวันคงเหลือ 1..60 (ไม่รวมที่หมดแล้ว และไม่สนว่าเริ่มต่ออายุแล้วหรือยัง)
        countOrNull(() => scalar(db(), `
            SELECT COUNT(*) AS cnt FROM dbo.MA_Items
            WHERE Status NOT IN ('Cancelled', 'Pending')
              AND EndDate IS NOT NULL
              AND DATEDIFF(day, CAST(GETDATE() AS DATE), CAST(EndDate AS DATE)) BETWEEN 1 AND 60`)),

        // อุปกรณ์ที่ของใกล้หมด (CurrentStock ≤ MinStock, ไม่รวมของเก็บในคลัง) — กฎกลางใน lib/stockManagement.js
        countOrNull(async () => scalar(db(), `
            SELECT COUNT(*) AS cnt FROM dbo.Stock_Products
            WHERE IsActive = 1 AND ${lowStockWhere('', await hasManagementColumns(db()))}`)),

        // กล้อง CCTV ที่ offline
        countOrNull(() => scalar(db(), `
            SELECT COUNT(*) AS cnt FROM dbo.cctv_cameras
            WHERE status = 'offline'`)),

        // PO ที่ยังรับของไม่ครบ (QtyReceived < QtyOrdered) และยังไม่ปิด PO
        countOrNull(() => scalar(db(), `
            SELECT COUNT(DISTINCT d.PO_ID) AS cnt
            FROM dbo.Stock_PODetails d
            JOIN dbo.Stock_PurchaseOrders p ON p.PO_ID = d.PO_ID
            WHERE ISNULL(d.QtyReceived, 0) < d.QtyOrdered
              AND p.Status NOT IN ('Completed', 'Cancelled', 'Cancel')`)),

        // กิจกรรม/งานในปฏิทินวันนี้
        countOrNull(() => scalar(db(), `
            SELECT COUNT(*) AS cnt FROM dbo.cal_tasks
            WHERE CAST(start_date AS DATE) = CAST(GETDATE() AS DATE)`)),

        // IT request ที่ยังไม่เสร็จ (ไม่นับ Completed / Rejected / Cancel)
        countOrNull(() => scalar(getItRequestPool(), `
            SELECT COUNT(*) AS cnt FROM Sys_RequestInfo
            WHERE Form_id IN ('FM-IT-002', 'FM-IT-004')
              AND Current_Status NOT IN ('Completed', 'Rejected', 'Cancel')`)),

        // อุปกรณ์เสียง (Sound Engineering) ที่ ping ไม่เจอ — ตรงกับนิยาม Offline ในหน้า Sound
        // ไม่นับเครื่องที่ถอดชั่วคราว / ส่งซ่อม / ยกเลิกใช้งาน
        countOrNull(() => scalar(getSoundPool(), `
            SELECT COUNT(*) AS cnt FROM sound_devices
            WHERE ping_status = 'Offline'
              AND ISNULL(usage_status, 'active') = 'active'`)),

        // รอบ IT Asset Disposal ที่ยังเปิดอยู่
        countOrNull(() => scalar(db(), `
            SELECT COUNT(*) AS cnt FROM dbo.Disposal_Runs WHERE Status = 'Open'`)),

        // Ink & Toner ที่ใกล้หมด (DCI, ACTIVE เท่านั้น) — กฎเดียวกับหน้า Ink & Toner: Minimum > 0 และ CurrentStock ≤ Minimum (รวมที่หมดแล้ว)
        countOrNull(() => scalar(getDciPool(), `
            SELECT COUNT(*) AS cnt FROM [dbDCI].[dbo].[SP_PartSock]
            WHERE Prt_Code LIKE '6CC-ITP%'
              AND Prt_Status = 'ACTIVE'
              AND Minimum > 0
              AND CurrentStock <= Minimum`)),
    ]);

    res.json({
        success: true,
        data: {
            po_open, borrowed, ma_attention, stock_low, cctv_offline, po_partial, cal_today, it_request_open, printer_toner_low,
            sound_offline, disposal_open, ink_low,
        },
    });
};
