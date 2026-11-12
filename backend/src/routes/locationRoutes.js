import express from 'express';
import { adminOnly } from '../middleware/authMiddleware.js';
import { getLocations, addLocation, updateLocation, deleteLocation } from '../controllers/locationController.js';

const router = express.Router();

router.get('/locations', getLocations);
router.post('/locations', ...adminOnly, addLocation);
router.put('/locations/:id', ...adminOnly, updateLocation);
router.delete('/locations/:id', ...adminOnly, deleteLocation);

export default router;
