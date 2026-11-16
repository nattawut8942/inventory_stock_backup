import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import { getLocations, addLocation, updateLocation, deleteLocation } from '../controllers/locationController.js';

const router = express.Router();

router.get('/locations', getLocations);
router.post('/locations', requirePerm('mgmt-locations', 'create', { strict: true }), addLocation);
router.put('/locations/:id', requirePerm('mgmt-locations', 'edit', { strict: true }), updateLocation);
router.delete('/locations/:id', requirePerm('mgmt-locations', 'delete', { strict: true }), deleteLocation);

export default router;
