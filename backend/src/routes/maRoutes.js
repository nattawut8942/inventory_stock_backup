import express from 'express';
import { getMAItems, getMAItemById, createMAItem, updateMAItem, deleteMAItem, updateMAStatus, updateMARenewal, completeMARenewal, getMATypes, createMAType, updateMAType, deleteMAType } from '../controllers/maController.js';

const router = express.Router();

// MA Items
router.get('/ma', getMAItems);
router.get('/ma/:id', getMAItemById);
router.post('/ma', createMAItem);
router.put('/ma/:id', updateMAItem);
router.delete('/ma/:id', deleteMAItem);
router.patch('/ma/:id/status', updateMAStatus);
router.patch('/ma/:id/renewal', updateMARenewal);
router.post('/ma/:id/renew', completeMARenewal);

// MA Types (SubType Master)
router.get('/ma-types', getMATypes);
router.post('/ma-types', createMAType);
router.put('/ma-types/:id', updateMAType);
router.delete('/ma-types/:id', deleteMAType);

export default router;
