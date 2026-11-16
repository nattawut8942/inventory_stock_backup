import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import { getVendors, createVendor, updateVendor, deleteVendor } from '../controllers/vendorController.js';

const router = express.Router();

router.get('/vendors', getVendors);
router.post('/vendors', requirePerm('mgmt-vendors', 'create', { strict: true }), createVendor);
router.put('/vendors/:id', requirePerm('mgmt-vendors', 'edit', { strict: true }), updateVendor);
router.delete('/vendors/:id', requirePerm('mgmt-vendors', 'delete', { strict: true }), deleteVendor);

export default router;
