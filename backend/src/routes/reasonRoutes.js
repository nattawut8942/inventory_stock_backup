import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import { getReasons, addReason, updateReason, deleteReason } from '../controllers/reasonController.js';

const router = express.Router();

router.get('/reasons', getReasons);
router.post('/reasons', requirePerm('mgmt-reasons', 'create', { strict: true }), addReason);
router.put('/reasons/:id', requirePerm('mgmt-reasons', 'edit', { strict: true }), updateReason);
router.delete('/reasons/:id', requirePerm('mgmt-reasons', 'delete', { strict: true }), deleteReason);

export default router;
