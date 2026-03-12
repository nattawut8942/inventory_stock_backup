import express from 'express';
import { getInkTonerStock } from '../controllers/inkTonerController.js';

const router = express.Router();

// Ink & Toner Stock (from DCI Database)
router.get('/ink-toner', getInkTonerStock);

export default router;
