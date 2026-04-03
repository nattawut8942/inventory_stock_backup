import express from 'express';
import { exportReport, testEmail } from '../controllers/reportController.js';

const router = express.Router();

router.get('/report/export', (req, res) => {
    console.log('🔄 Report export route called with query:', req.query);
    return exportReport(req, res);
});
router.post('/test-email', testEmail);

export default router;
