import { getMOReport } from '../controllers/pcReportController.js';
import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
  getInventory, getInventoryByHostname,
  getActiveUsers, getActiveUsersByHostname,
  searchInventory, getSummary, getSoftware,
  updateAsset, updateStatus, updateDisposal, deleteInventory,   // ✅ เพิ่ม updateStatus
  getMOLocation, getMOsByLayout, updateMOLocation,
  getHistory,
  getInventoryByFixAsset,
} from '../controllers/monitorInventoryController.js';

const router = express.Router();

router.get('/mo-inventory',                        getInventory);
router.get('/mo-inventory/report', getMOReport);
router.get('/mo-inventory/summary',                getSummary);
router.get('/mo-inventory/search',                 searchInventory);
router.get('/mo-active-users',                     getActiveUsers);
router.get('/mo-location/layout/:layout_id',       getMOsByLayout);
router.get('/mo-location/:hostname',               getMOLocation);
router.put('/mo-location/:hostname', requirePerm('devices-layout', 'edit', { strict: true }),               updateMOLocation);
router.get('/mo-inventory/by-fix-asset/:code',     getInventoryByFixAsset);
router.get('/mo-inventory/:hostname/history',      getHistory);
router.get('/mo-inventory/:hostname',              getInventoryByHostname);
router.put('/mo-inventory/:hostname/asset', requirePerm('pc-inventory', 'edit'),        updateAsset);
router.put('/mo-inventory/:hostname/disposal', requirePerm('pc-inventory', 'edit'), updateDisposal);
router.put('/mo-inventory/:hostname/status', requirePerm('pc-inventory', 'edit'),       updateStatus);   // ✅ เพิ่มบรรทัดนี้
router.get('/mo-inventory/:hostname/software',     getSoftware);
router.delete('/mo-inventory/:hostname', requirePerm('pc-inventory', 'delete'),           deleteInventory);
router.get('/mo-active-users/:hostname',           getActiveUsersByHostname);

export default router;