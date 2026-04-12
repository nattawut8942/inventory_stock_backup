import express from 'express';
import { exportReport, testEmail } from '../controllers/reportController.js';
import { getForecast } from '../controllers/productController.js'; 
// --- 1. Import ฟังก์ชันใหม่จาก Controller (ต้องไปสร้างรับใน Controller ด้วย) ---
// หรือถ้าจะเรียกตรงจาก Service เพื่อเทสเร็วๆ ให้ import จาก emailService โดยตรง
import { sendDailyReport, sendMonthlyInventoryReport } from '../services/emailService.js';

const router = express.Router();

router.get('/report/export', (req, res) => {
    console.log('🔄 Report export route called with query:', req.query);
    return exportReport(req, res);
});


router.get('/forecast', getForecast);

router.get('/test-daily', async (req, res) => {
    try {
        // เรียกใช้ฟังก์ชันส่งรายงานรายวัน
        const result = await sendDailyReport();
        
        // ถ้าส่งสำเร็จจะคืนค่า JSON บอกผลลัพธ์
        res.json({ 
            success: true, 
            message: "Daily Report Sent Successfully!", 
            result 
        });
    } catch (err) {
        // หากเกิดข้อผิดพลาด เช่น DB หลุด หรือ SMTP มีปัญหา
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});


// --- 2. เพิ่ม Route สำหรับเทส Monthly Report ---

// แบบ GET: สำหรับเทสผ่าน Browser (http://localhost:3002/ITinventory/api/test-monthly)
router.get('/test-monthly', async (req, res) => {
    try {
        const result = await sendMonthlyInventoryReport();
        res.json({ success: true, message: "Monthly Report Sent!", result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// แบบ POST: สำหรับเทสผ่าน PowerShell ที่คุณใช้
router.post('/test-monthly', async (req, res) => {
    try {
        const result = await sendMonthlyInventoryReport();
        res.json({ success: true, message: "Monthly Report Sent via POST!", result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;