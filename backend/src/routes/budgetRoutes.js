import express from 'express';
import { getBudgetCategories, createBudgetCategory, updateBudgetCategory, deleteBudgetCategory } from '../controllers/budgetController.js';

const router = express.Router();

router.get('/budgets', getBudgetCategories);
router.post('/budgets', createBudgetCategory);
router.put('/budgets/:id', updateBudgetCategory);
router.delete('/budgets/:id', deleteBudgetCategory);

export default router;
