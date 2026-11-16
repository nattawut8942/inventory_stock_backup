import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import { getTransactions, getInvoices, receiveGoods, getStockHistory, cancelInvoice } from '../controllers/transactionController.js';

const router = express.Router();

router.get('/transactions', getTransactions);
router.get('/invoices', getInvoices);
router.post('/receive', requirePerm('receive', 'receive', { strict: true }), receiveGoods);
router.post('/invoice/cancel', requirePerm('receive', 'cancel', { strict: true }), cancelInvoice);
router.get('/stock/history/:id', getStockHistory);

export default router;
