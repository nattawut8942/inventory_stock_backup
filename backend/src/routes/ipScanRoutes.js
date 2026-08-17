/**
 * ipScanRoutes.js
 * วางไว้ที่ src/routes/ipScanRoutes.js
 * แล้วใส่ใน server.js:
 *   import ipScanRoutes from './src/routes/ipScanRoutes.js';
 *   app.use('/ITinventory/api', ipScanRoutes);
 */

import express from 'express';
import {
  getIPSubnets,
  getIPsBySubnet,
  updateIP,
  addSubnet,
  deleteSubnet,
  postScanResult,
  triggerScan,
} from '../controllers/ipScanController.js';

const router = express.Router();

// Subnet
router.get('/ip-scan/subnets',          getIPSubnets);
router.post('/ip-scan/subnets/add',     addSubnet);
router.delete('/ip-scan/subnets/:subnet', deleteSubnet);

// IPs
router.get('/ip-scan/ips',              getIPsBySubnet);
router.put('/ip-scan/ips/:ip',          updateIP);

// Scan results (จาก auto_scan.js หรือ lan_scanner.py)
router.post('/ip-scan/scan-result',     postScanResult);

// Manual trigger จาก frontend
router.post('/ip-scan/trigger',         triggerScan);

export default router;