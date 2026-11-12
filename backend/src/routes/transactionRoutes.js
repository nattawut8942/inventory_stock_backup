import express from 'express';
import { adminOnly } from '../middleware/authMiddleware.js';
import { getTransactions, getInvoices, receiveGoods, getStockHistory, cancelInvoice } from '../controllers/transactionController.js';

const router = express.Router();

router.get('/transactions', getTransactions);
router.get('/invoices', getInvoices);
router.post('/receive', ...adminOnly, receiveGoods);
router.post('/invoice/cancel', ...adminOnly, cancelInvoice);
router.get('/stock/history/:id', getStockHistory);

export default router;
