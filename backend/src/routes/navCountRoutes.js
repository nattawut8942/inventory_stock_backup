// routes/navCountRoutes.js
import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { getNavCounts } from '../controllers/navCountController.js';

const router = express.Router();

// GET /ITinventory/api/nav-counts — จำนวนงานค้างสำหรับ badge ใน Sidebar (ต้อง login)
router.get('/nav-counts', verifyToken, getNavCounts);

export default router;
