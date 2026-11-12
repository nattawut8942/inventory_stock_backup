import express from 'express';
import { adminOnly } from '../middleware/authMiddleware.js';
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
router.post('/factory-layouts', ...adminOnly, createFactoryLayout);      // ✅ เอา upload.single('image') ออก
router.put('/factory-layouts/:id', ...adminOnly, updateFactoryLayout);   // ✅ เอา upload.single('image') ออก
router.delete('/factory-layouts/:id', ...adminOnly, deleteFactoryLayout);

// PC Location Routes
router.get('/pc-location/:hostname', getPCLocation);
router.put('/pc-location/:hostname', ...adminOnly, updatePCLocation);
router.delete('/pc-location/:hostname', ...adminOnly, clearPCLocation);

// Get PCs by Layout
router.get('/pc-location/layout/:layout_id', getPCsByLayout);

export default router;