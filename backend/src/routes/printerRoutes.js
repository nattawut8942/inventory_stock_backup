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
    updatePrinterLocation,
    scanAllPrinters
} from '../controllers/printerController.js';
import { printerPhotoUpload, setPrinterPhoto, clearPrinterPhoto } from '../controllers/printerPhotoController.js';
import { printerSitePhotoUpload, setPrinterSitePhoto, clearPrinterSitePhoto } from '../controllers/printerSitePhotoController.js';

const router = express.Router();

// อัปโหลดรูป: แปลง error ของ multer (ขนาด/ชนิดไฟล์) เป็น JSON 400
const uploadPrinterPhoto = (req, res, next) => printerPhotoUpload(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'อัปโหลดรูปไม่สำเร็จ' });
    next();
});

router.get('/printer-health', getPrinterHealth);
router.get('/printer-locations', getPrinterLocations);
router.put('/printer-locations/:id', requirePerm('devices-layout', 'edit', { strict: true }), updatePrinterLocation);
router.post('/printer-health', requirePerm('printer-health', 'create'), createPrinter);
router.get('/printer-health/meta/factories', getFactoryOptions);
router.put('/printer-health/:id', requirePerm('printer-health', 'edit'), updatePrinter);
router.get('/printer-health/:id/history', getPrinterHistory);
router.get('/printer-health/:id/errors', getPrinterErrors);
router.post('/printer-health/scan-all', requirePerm('printer-health', 'scan'), scanAllPrinters);
router.post('/printer-health/:id/scan', requirePerm('printer-health', 'scan'), scanPrinterNow);
router.post('/printer-health/:id/photo', requirePerm('printer-health', 'edit'), uploadPrinterPhoto, setPrinterPhoto);
router.delete('/printer-health/:id/photo', requirePerm('printer-health', 'edit'), clearPrinterPhoto);

// รูปหน้างาน (ใช้ multer ตัวเดียวกันกับรูปเครื่อง)
const uploadSitePhoto = (req, res, next) => printerSitePhotoUpload(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'อัปโหลดรูปไม่สำเร็จ' });
    next();
});
router.post('/printer-health/:id/site-photo', requirePerm('printer-health', 'edit'), uploadSitePhoto, setPrinterSitePhoto);
router.delete('/printer-health/:id/site-photo', requirePerm('printer-health', 'edit'), clearPrinterSitePhoto);

export default router;

// วิธีต่อเข้ากับ app หลัก (ไปดูไฟล์ที่ import productRoutes.js อยู่ตอนนี้ เช่น server.js/app.js):
//   import printerRoutes from './routes/printerRoutes.js';
//   app.use('/api', printerRoutes);