import express from 'express';
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
router.post('/factory-layouts', createFactoryLayout);      // ✅ เอา upload.single('image') ออก
router.put('/factory-layouts/:id', updateFactoryLayout);   // ✅ เอา upload.single('image') ออก
router.delete('/factory-layouts/:id', deleteFactoryLayout);

// PC Location Routes
router.get('/pc-location/:hostname', getPCLocation);
router.put('/pc-location/:hostname', updatePCLocation);
router.delete('/pc-location/:hostname', clearPCLocation);

// Get PCs by Layout
router.get('/pc-location/layout/:layout_id', getPCsByLayout);

export default router;