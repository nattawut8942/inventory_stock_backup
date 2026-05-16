import express from 'express';
import { 
    upload,
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

// Factory Layouts Routes - with file upload
router.get('/factory-layouts', getFactoryLayouts);
router.post('/factory-layouts', upload.single('image'), createFactoryLayout);
router.put('/factory-layouts/:id', upload.single('image'), updateFactoryLayout);
router.delete('/factory-layouts/:id', deleteFactoryLayout);

// PC Location Routes
router.get('/pc-location/:hostname', getPCLocation);
router.put('/pc-location/:hostname', updatePCLocation);
router.delete('/pc-location/:hostname', clearPCLocation);

// Get PCs by Layout
router.get('/pc-location/layout/:layout_id', getPCsByLayout);

export default router;