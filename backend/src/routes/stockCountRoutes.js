import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
    getSessions, getSessionDetail, createSession,
    addItem, updateItem, deleteItem,
    confirmSession, editConfirmedSession,
    deleteSession, searchProduct,
    applyStockAdjustment
} from '../controllers/stockCountController.js';

const router = express.Router();

// Sessions
router.get('/stock-count/sessions', getSessions);
router.get('/stock-count/sessions/:id', getSessionDetail);
router.post('/stock-count/sessions', requirePerm('stock-count', 'count'), createSession);

// Items within a session
router.post('/stock-count/sessions/:id/items', requirePerm('stock-count', 'count'), addItem);
router.put('/stock-count/sessions/:id/items/:itemId', requirePerm('stock-count', 'count'), updateItem);
router.delete('/stock-count/sessions/:id/items/:itemId', requirePerm('stock-count', 'count'), deleteItem);

// Confirm & Edit & Delete & Adjust
router.post('/stock-count/sessions/:id/confirm', requirePerm('stock-count', 'count'), confirmSession);
router.post('/stock-count/sessions/:id/adjust', requirePerm('stock-count', 'adjust'), applyStockAdjustment);
router.put('/stock-count/sessions/:id', requirePerm('stock-count', 'edit', { strict: true }), editConfirmedSession);
router.delete('/stock-count/sessions/:id', verifyToken, deleteSession); // Draft: any user; Confirmed: Admin only (checked in controller)

// Product search (for scan/type-to-search)
router.get('/stock-count/search', searchProduct);

export default router;
