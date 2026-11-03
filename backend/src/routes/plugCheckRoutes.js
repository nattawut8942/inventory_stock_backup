import express from 'express';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';
import {
    getFactories, createFactory, updateFactory, deleteFactory,
    getAreas, createArea, updateArea, deleteArea, uploadAreaImage,
    getStandards, createStandard, updateStandard, deleteStandard, uploadStandardImage,
    getPoints, createPoint, updatePoint, deletePoint, uploadPointImage, clearPointImage,
    getSheets, getSheet, createSheet, syncSheet, refreshSheet, saveResults, uploadResultPhoto, updateSheetNotes,
    signMonth, unlockMonth
} from '../controllers/plugCheckController.js';

const router = express.Router();
const staff = [verifyToken, requireRole('Staff')];

// ---- Master data (read: open, write: Staff only) ----
router.get('/plug/factories', getFactories);
router.post('/plug/factories', ...staff, createFactory);
router.put('/plug/factories/:id', ...staff, updateFactory);
router.delete('/plug/factories/:id', ...staff, deleteFactory);

router.get('/plug/areas', getAreas);
router.post('/plug/areas', ...staff, createArea);
router.put('/plug/areas/:id', ...staff, updateArea);
router.delete('/plug/areas/:id', ...staff, deleteArea);
router.post('/plug/areas/:id/image', ...staff, uploadAreaImage);

router.get('/plug/standards', getStandards);
router.post('/plug/standards', ...staff, createStandard);
router.put('/plug/standards/:id', ...staff, updateStandard);
router.delete('/plug/standards/:id', ...staff, deleteStandard);
router.post('/plug/standards/:id/image', ...staff, uploadStandardImage);

router.get('/plug/areas/:id/points', getPoints);
router.post('/plug/areas/:id/points', ...staff, createPoint);
router.put('/plug/points/:id', ...staff, updatePoint);
router.delete('/plug/points/:id', ...staff, deletePoint);
router.post('/plug/points/:id/image', ...staff, uploadPointImage);
router.delete('/plug/points/:id/image', ...staff, clearPointImage);

// ---- Check sheets (any logged-in user; sign level is checked from the login Position) ----
router.get('/plug/sheets', getSheets);
router.get('/plug/sheets/:id', getSheet);
router.post('/plug/sheets', verifyToken, createSheet);
router.post('/plug/sheets/:id/sync', verifyToken, syncSheet);
router.post('/plug/sheets/:id/refresh', ...staff, refreshSheet);
router.put('/plug/sheets/:id/results', verifyToken, saveResults);
router.post('/plug/sheets/:id/photo', verifyToken, uploadResultPhoto);
router.put('/plug/sheets/:id/notes', verifyToken, updateSheetNotes);
router.post('/plug/sheets/:id/sign', verifyToken, signMonth);
router.post('/plug/sheets/:id/unlock', verifyToken, unlockMonth);

export default router;
