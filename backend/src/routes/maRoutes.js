import express from 'express';
import { adminOnly } from '../middleware/authMiddleware.js';
import { getMAItems, getMAItemById, createMAItem, updateMAItem, deleteMAItem, updateMAStatus, updateMARenewal, completeMARenewal, getMATypes, createMAType, updateMAType, deleteMAType } from '../controllers/maController.js';

const router = express.Router();

// MA Items
router.get('/ma', getMAItems);
router.get('/ma/:id', getMAItemById);
router.post('/ma', ...adminOnly, createMAItem);
router.put('/ma/:id', ...adminOnly, updateMAItem);
router.delete('/ma/:id', ...adminOnly, deleteMAItem);
router.patch('/ma/:id/status', ...adminOnly, updateMAStatus);
router.patch('/ma/:id/renewal', ...adminOnly, updateMARenewal);
router.post('/ma/:id/renew', ...adminOnly, completeMARenewal);

// MA Types (SubType Master)
router.get('/ma-types', getMATypes);
router.post('/ma-types', ...adminOnly, createMAType);
router.put('/ma-types/:id', ...adminOnly, updateMAType);
router.delete('/ma-types/:id', ...adminOnly, deleteMAType);

export default router;
