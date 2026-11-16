import express from 'express';
import {
    getCatalog, getMyPermissions, getUserPermissions, putUserPermissions, getUserPermissionAudit,
    getDefaults, putDefaults, getLogSummary,
} from '../controllers/pagePermissionController.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireDbAdmin } from '../middleware/permissionMiddleware.js';

const router = express.Router();

// Any logged-in user
router.get('/me/permissions', verifyToken, getMyPermissions);
router.get('/permissions/catalog', verifyToken, getCatalog);

// Admin only: managing who can do what is never grantable to anyone else
router.get('/permissions/defaults', verifyToken, requireDbAdmin, getDefaults);
router.put('/permissions/defaults', verifyToken, requireDbAdmin, putDefaults);
router.get('/permissions/log-summary', verifyToken, requireDbAdmin, getLogSummary);
router.get('/permissions/users/:empCode', verifyToken, requireDbAdmin, getUserPermissions);
router.put('/permissions/users/:empCode', verifyToken, requireDbAdmin, putUserPermissions);
router.get('/permissions/users/:empCode/audit', verifyToken, requireDbAdmin, getUserPermissionAudit);

export default router;
