/**
 * ipScanRoutes.js
 * วางไว้ที่ src/routes/ipScanRoutes.js
 * แล้วใส่ใน server.js:
 *   import ipScanRoutes from './src/routes/ipScanRoutes.js';
 *   app.use('/ITinventory/api', ipScanRoutes);
 */

import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import crypto from 'crypto';
import { verifyToken } from '../middleware/authMiddleware.js';
import {
  getIPSubnets,
  getIPsBySubnet,
  updateIP,
  addSubnet,
  deleteSubnet,
  postScanResult,
  triggerScan,
  getScanStatus,
  getIPHistory,
  getRecentHistory,
  getInactiveIPs,
  getSnapshots,
  getReservedIPs,
  getAlerts,
} from '../controllers/ipScanController.js';

const router = express.Router();

// ── Scanner key ── scanner (auto_scan.js) ส่ง header `x-scan-key` = env IP_SCAN_API_KEY
// ถ้าไม่ได้ตั้งค่า env จะปฏิเสธทุก request (fail closed)
const requireScanKey = (req, res, next) => {
  const expected = process.env.IP_SCAN_API_KEY;
  if (!expected) return res.status(503).json({ error: 'IP_SCAN_API_KEY is not configured' });
  const given = req.headers['x-scan-key'];
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return res.status(401).json({ error: 'Invalid scan key' });
  next();
};

// อ่านข้อมูล: ต้องมี user token หรือ scan key (auto_scan.js ใช้ scan key)
const requireUserOrScanKey = (req, res, next) => {
  const expected = process.env.IP_SCAN_API_KEY;
  const given = req.headers['x-scan-key'];
  if (expected && given) {
    const a = Buffer.from(String(given));
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  }
  return verifyToken(req, res, next);
};

// Subnet — อ่านต้องมี token/scan key, แก้/เพิ่ม/ลบ ต้อง login (verifyToken)
router.get('/ip-scan/subnets',          requireUserOrScanKey, getIPSubnets);
router.post('/ip-scan/subnets/add',     verifyToken, requirePerm('ip-management', 'manage'), addSubnet);
router.delete('/ip-scan/subnets/:subnet', verifyToken, requirePerm('ip-management', 'manage'), deleteSubnet);

// IPs
router.get('/ip-scan/ips',              requireUserOrScanKey, getIPsBySubnet);
router.put('/ip-scan/ips/:ip',          verifyToken, requirePerm('ip-management', 'edit'), updateIP);
router.get('/ip-scan/ips/:ip/history',  verifyToken, getIPHistory);

// Scan results (จาก auto_scan.js) — ใช้ scan key แทน user token
router.post('/ip-scan/scan-result',     requireScanKey, postScanResult);

// Manual trigger จาก frontend — ต้อง login
router.post('/ip-scan/trigger',         verifyToken, requirePerm('ip-management', 'manage'), triggerScan);
router.get('/ip-scan/scan-status',      verifyToken, getScanStatus);

// มุมมองภาพรวม: ไทม์ไลน์ และรายการ inactive
router.get('/ip-scan/history',          verifyToken, getRecentHistory);
router.get('/ip-scan/inactive',         verifyToken, getInactiveIPs);
router.get('/ip-scan/snapshots',        verifyToken, getSnapshots);
router.get('/ip-scan/reserved',         verifyToken, getReservedIPs);
router.get('/ip-scan/alerts',           verifyToken, getAlerts);

export default router;