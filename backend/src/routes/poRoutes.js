import express from 'express';
import { adminOnly } from '../middleware/authMiddleware.js';
import { getPOs, createPO, updatePO, deletePO } from '../controllers/poController.js';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public for now (or basic auth), can add verifyToken later
router.get('/pos', getPOs);
router.post('/pos', ...adminOnly, createPO);
router.put('/pos/:id', ...adminOnly, updatePO);
router.delete('/pos/:id', ...adminOnly, deletePO); // Future: requireRole('Admin')

export default router;
