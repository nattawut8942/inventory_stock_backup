import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
    getFactoryLayouts,
    createFactoryLayout,
    updateFactoryLayout,
    deleteFactoryLayout,
    getPCLocation,
    updatePCLocation,
    clearPCLocation,
    getPCsByLayout
} from '../controllers/pcLocationController.js';

const router = express.Router();

// Factory Layouts Routes - file upload handled by express-fileupload (global middleware in server.js)
router.get('/factory-layouts', getFactoryLayouts);
router.post('/factory-layouts', requirePerm('mgmt-factory-layouts', 'create', { strict: true }), createFactoryLayout);      // ✅ เอา upload.single('image') ออก
router.put('/factory-layouts/:id', requirePerm('mgmt-factory-layouts', 'edit', { strict: true }), updateFactoryLayout);   // ✅ เอา upload.single('image') ออก
router.delete('/factory-layouts/:id', requirePerm('mgmt-factory-layouts', 'delete', { strict: true }), deleteFactoryLayout);

// PC Location Routes
router.get('/pc-location/:hostname', getPCLocation);
router.put('/pc-location/:hostname', requirePerm('devices-layout', 'edit', { strict: true }), updatePCLocation);
router.delete('/pc-location/:hostname', requirePerm('devices-layout', 'edit', { strict: true }), clearPCLocation);

// Get PCs by Layout
router.get('/pc-location/layout/:layout_id', getPCsByLayout);

export default router;