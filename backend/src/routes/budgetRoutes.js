import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import { getBudgetCategories, createBudgetCategory, updateBudgetCategory, deleteBudgetCategory } from '../controllers/budgetController.js';

const router = express.Router();

router.get('/budgets', getBudgetCategories);
router.post('/budgets', requirePerm('mgmt-budgets', 'create', { strict: true }), createBudgetCategory);
router.put('/budgets/:id', requirePerm('mgmt-budgets', 'edit', { strict: true }), updateBudgetCategory);
router.delete('/budgets/:id', requirePerm('mgmt-budgets', 'delete', { strict: true }), deleteBudgetCategory);

export default router;
