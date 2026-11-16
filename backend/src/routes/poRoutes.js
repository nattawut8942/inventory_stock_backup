import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import { getPOs, createPO, updatePO, deletePO } from '../controllers/poController.js';
import { checkPOFile, viewPOAttachment, deletePOAttachment } from '../controllers/poAttachmentController.js';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public for now (or basic auth), can add verifyToken later
router.get('/pos', getPOs);
router.post('/pos', requirePerm('purchase-orders', 'create', { strict: true }), checkPOFile, createPO);
router.put('/pos/:id', requirePerm('purchase-orders', 'edit', { strict: true }), checkPOFile, updatePO);
router.delete('/pos/:id', requirePerm('purchase-orders', 'delete', { strict: true }), deletePO); // Future: requireRole('Admin')

// ไฟล์แนบ PO
router.get('/po-attachments/:attId/file', viewPOAttachment);
router.delete('/po-attachments/:attId', requirePerm('purchase-orders', 'edit', { strict: true }), deletePOAttachment);

export default router;
