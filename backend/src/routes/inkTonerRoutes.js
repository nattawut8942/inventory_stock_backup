import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
    getInkTonerStock,
    getInkTonerCompat,
    setInkTonerCompat
} from '../controllers/inkTonerController.js';

const router = express.Router();

// Ink & Toner Stock (from DCI Database)
router.get('/ink-toner', getInkTonerStock);

// Ink & Toner <-> Printer compatibility (local dbInfrastructure)
router.get('/ink-toner/compat', getInkTonerCompat);
router.put('/ink-toner/:code/printers', requirePerm('ink-toner', 'edit'), setInkTonerCompat);

export default router;
