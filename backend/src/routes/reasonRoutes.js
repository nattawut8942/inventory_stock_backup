import express from 'express';
import { adminOnly } from '../middleware/authMiddleware.js';
import { getReasons, addReason, updateReason, deleteReason } from '../controllers/reasonController.js';

const router = express.Router();

router.get('/reasons', getReasons);
router.post('/reasons', ...adminOnly, addReason);
router.put('/reasons/:id', ...adminOnly, updateReason);
router.delete('/reasons/:id', ...adminOnly, deleteReason);

export default router;
