import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import { getPOs, createPO, updatePO, deletePO } from '../controllers/poController.js';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public for now (or basic auth), can add verifyToken later
router.get('/pos', getPOs);
router.post('/pos', requirePerm('purchase-orders', 'create', { strict: true }), createPO);
router.put('/pos/:id', requirePerm('purchase-orders', 'edit', { strict: true }), updatePO);
router.delete('/pos/:id', requirePerm('purchase-orders', 'delete', { strict: true }), deletePO); // Future: requireRole('Admin')

export default router;
