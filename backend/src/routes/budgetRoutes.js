import express from 'express';
import { adminOnly } from '../middleware/authMiddleware.js';
import { getBudgetCategories, createBudgetCategory, updateBudgetCategory, deleteBudgetCategory } from '../controllers/budgetController.js';

const router = express.Router();

router.get('/budgets', getBudgetCategories);
router.post('/budgets', ...adminOnly, createBudgetCategory);
router.put('/budgets/:id', ...adminOnly, updateBudgetCategory);
router.delete('/budgets/:id', ...adminOnly, deleteBudgetCategory);

export default router;
