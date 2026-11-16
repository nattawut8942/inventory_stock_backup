import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import { getMAItems, getMAItemById, getMAHistory, createMAItem, updateMAItem, deleteMAItem, updateMAStatus, updateMARenewal, completeMARenewal, getMATypes, createMAType, updateMAType, deleteMAType } from '../controllers/maController.js';
import { uploadRenewalFiles, downloadAttachment } from '../controllers/maAttachmentController.js';

const router = express.Router();

// MA Items
router.get('/ma', getMAItems);
router.get('/ma/:id', getMAItemById);
router.get('/ma/:id/history', getMAHistory);
router.post('/ma', requirePerm('ma-license', 'create', { strict: true }), createMAItem);
router.put('/ma/:id', requirePerm('ma-license', 'edit', { strict: true }), updateMAItem);
router.delete('/ma/:id', requirePerm('ma-license', 'delete', { strict: true }), deleteMAItem);
router.patch('/ma/:id/status', requirePerm('ma-license', 'edit', { strict: true }), updateMAStatus);
router.patch('/ma/:id/renewal', requirePerm('ma-license', 'edit', { strict: true }), updateMARenewal);
// ต่ออายุเสร็จ: ต้องแนบไฟล์อย่างน้อย 1 ไฟล์ (multipart)
router.post('/ma/:id/renew', requirePerm('ma-license', 'edit', { strict: true }), uploadRenewalFiles, completeMARenewal);

// ไฟล์แนบของรอบต่ออายุ (ดาวน์โหลดได้)
router.get('/ma/attachments/:attId/download', downloadAttachment);

// MA Types (SubType Master)
router.get('/ma-types', getMATypes);
router.post('/ma-types', requirePerm('mgmt-ma-types', 'create', { strict: true }), createMAType);
router.put('/ma-types/:id', requirePerm('mgmt-ma-types', 'edit', { strict: true }), updateMAType);
router.delete('/ma-types/:id', requirePerm('mgmt-ma-types', 'delete', { strict: true }), deleteMAType);

export default router;
