import express from 'express';
import { adminOnly } from '../middleware/authMiddleware.js';
import { getMAItems, getMAItemById, getMAHistory, createMAItem, updateMAItem, deleteMAItem, updateMAStatus, updateMARenewal, completeMARenewal, getMATypes, createMAType, updateMAType, deleteMAType } from '../controllers/maController.js';
import { uploadRenewalFiles, downloadAttachment } from '../controllers/maAttachmentController.js';

const router = express.Router();

// MA Items
router.get('/ma', getMAItems);
router.get('/ma/:id', getMAItemById);
router.get('/ma/:id/history', getMAHistory);
router.post('/ma', ...adminOnly, createMAItem);
router.put('/ma/:id', ...adminOnly, updateMAItem);
router.delete('/ma/:id', ...adminOnly, deleteMAItem);
router.patch('/ma/:id/status', ...adminOnly, updateMAStatus);
router.patch('/ma/:id/renewal', ...adminOnly, updateMARenewal);
// ต่ออายุเสร็จ: ต้องแนบไฟล์อย่างน้อย 1 ไฟล์ (multipart)
router.post('/ma/:id/renew', ...adminOnly, uploadRenewalFiles, completeMARenewal);

// ไฟล์แนบของรอบต่ออายุ (ดาวน์โหลดได้)
router.get('/ma/attachments/:attId/download', downloadAttachment);

// MA Types (SubType Master)
router.get('/ma-types', getMATypes);
router.post('/ma-types', ...adminOnly, createMAType);
router.put('/ma-types/:id', ...adminOnly, updateMAType);
router.delete('/ma-types/:id', ...adminOnly, deleteMAType);

export default router;
