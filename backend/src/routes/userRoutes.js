import express from 'express';
import {
    getAdminUsers, addAdminUser, updateAdminUser, deleteAdminUser,
    getStockUsers, updateStockUserRole, getLoginLogs
} from '../controllers/userController.js';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// Users recorded on login (Stock_Users)
router.get('/stock-users', verifyToken, getStockUsers);
router.put('/stock-users/:id/role', verifyToken, requireRole('Admin'), updateStockUserRole);

// Login history (Stock_LoginLog) — Admin only
router.get('/login-logs', verifyToken, requireRole('Admin'), getLoginLogs);

// Legacy Stock_UserRole endpoints — no longer used by the UI, restricted to Admin
router.get('/admin-users', verifyToken, requireRole('Admin'), getAdminUsers);
router.post('/admin-users', verifyToken, requireRole('Admin'), addAdminUser);
router.put('/admin-users/:id', verifyToken, requireRole('Admin'), updateAdminUser);
router.delete('/admin-users/:username', verifyToken, requireRole('Admin'), deleteAdminUser);

export default router;
