import express from 'express';
import { exportReport, testEmail } from '../controllers/reportController.js';
import { getForecast } from '../controllers/productController.js'; // แก้ชื่อไฟล์


const router = express.Router();

router.get('/report/export', (req, res) => {
    console.log('🔄 Report export route called with query:', req.query);
    return exportReport(req, res);
});
router.post('/test-email', testEmail);
router.get('/forecast', getForecast);

export default router;
