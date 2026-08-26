import express from 'express';
import {
    getPrinterHealth,
    getPrinterHistory,
    getPrinterErrors,
    scanPrinterNow,
    createPrinter,
    updatePrinter,
    getFactoryOptions
} from '../controllers/printerController.js';

const router = express.Router();

router.get('/printer-health', getPrinterHealth);
router.post('/printer-health', createPrinter);
router.get('/printer-health/meta/factories', getFactoryOptions);
router.put('/printer-health/:id', updatePrinter);
router.get('/printer-health/:id/history', getPrinterHistory);
router.get('/printer-health/:id/errors', getPrinterErrors);
router.post('/printer-health/:id/scan', scanPrinterNow);

export default router;

// วิธีต่อเข้ากับ app หลัก (ไปดูไฟล์ที่ import productRoutes.js อยู่ตอนนี้ เช่น server.js/app.js):
//   import printerRoutes from './routes/printerRoutes.js';
//   app.use('/api', printerRoutes);