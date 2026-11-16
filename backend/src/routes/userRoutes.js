import express from 'express';
import {
    getAdminUsers, addAdminUser, updateAdminUser, deleteAdminUser,
    getStockUsers, updateStockUserRole, getLoginLogs
} from '../controllers/userController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireDbAdmin } from '../middleware/permissionMiddleware.js';

const router = express.Router();

// Everything here is Admin only, and "Admin" is checked against the database (not the token), so
// demoting someone takes effect on their very next request. None of this can be granted per page.

// Users recorded on login (Stock_Users)
router.get('/stock-users', verifyToken, requireDbAdmin, getStockUsers);
router.put('/stock-users/:id/role', verifyToken, requireDbAdmin, updateStockUserRole);

// Login history (Stock_LoginLog)
router.get('/login-logs', verifyToken, requireDbAdmin, getLoginLogs);

// Legacy Stock_UserRole endpoints — no longer used by the UI
router.get('/admin-users', verifyToken, requireDbAdmin, getAdminUsers);
router.post('/admin-users', verifyToken, requireDbAdmin, addAdminUser);
router.put('/admin-users/:id', verifyToken, requireDbAdmin, updateAdminUser);
router.delete('/admin-users/:username', verifyToken, requireDbAdmin, deleteAdminUser);

export default router;
