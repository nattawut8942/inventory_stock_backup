import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
    getPrinterHealth,
    getPrinterHistory,
    getPrinterErrors,
    scanPrinterNow,
    createPrinter,
    updatePrinter,
    getFactoryOptions,
    getPrinterLocations,
    updatePrinterLocation
} from '../controllers/printerController.js';

const router = express.Router();

router.get('/printer-health', getPrinterHealth);
router.get('/printer-locations', getPrinterLocations);
router.put('/printer-locations/:id', requirePerm('devices-layout', 'edit', { strict: true }), updatePrinterLocation);
router.post('/printer-health', requirePerm('printer-health', 'create'), createPrinter);
router.get('/printer-health/meta/factories', getFactoryOptions);
router.put('/printer-health/:id', requirePerm('printer-health', 'edit'), updatePrinter);
router.get('/printer-health/:id/history', getPrinterHistory);
router.get('/printer-health/:id/errors', getPrinterErrors);
router.post('/printer-health/:id/scan', requirePerm('printer-health', 'view'), scanPrinterNow);

export default router;

// วิธีต่อเข้ากับ app หลัก (ไปดูไฟล์ที่ import productRoutes.js อยู่ตอนนี้ เช่น server.js/app.js):
//   import printerRoutes from './routes/printerRoutes.js';
//   app.use('/api', printerRoutes);