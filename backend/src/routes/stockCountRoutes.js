import express from 'express';
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
router.post('/stock-count/sessions', createSession);

// Items within a session
router.post('/stock-count/sessions/:id/items', addItem);
router.put('/stock-count/sessions/:id/items/:itemId', updateItem);
router.delete('/stock-count/sessions/:id/items/:itemId', deleteItem);

// Confirm & Edit & Delete & Adjust
router.post('/stock-count/sessions/:id/confirm', confirmSession);
router.post('/stock-count/sessions/:id/adjust', applyStockAdjustment);
router.put('/stock-count/sessions/:id', editConfirmedSession);
router.delete('/stock-count/sessions/:id', deleteSession);

// Product search (for scan/type-to-search)
router.get('/stock-count/search', searchProduct);

export default router;
