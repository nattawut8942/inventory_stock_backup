import express from 'express';
import { adminOnly } from '../middleware/authMiddleware.js';
import { getVendors, createVendor, updateVendor, deleteVendor } from '../controllers/vendorController.js';

const router = express.Router();

router.get('/vendors', getVendors);
router.post('/vendors', ...adminOnly, createVendor);
router.put('/vendors/:id', ...adminOnly, updateVendor);
router.delete('/vendors/:id', ...adminOnly, deleteVendor);

export default router;
