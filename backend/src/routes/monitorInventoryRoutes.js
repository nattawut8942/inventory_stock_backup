import express from 'express';
import {
  getInventory, getInventoryByHostname,
  getActiveUsers, getActiveUsersByHostname,
  searchInventory, getSummary, getSoftware,
  updateAsset, updateStatus, deleteInventory,   // ✅ เพิ่ม updateStatus
  getMOLocation, getMOsByLayout, updateMOLocation,
  getHistory,
  getInventoryByFixAsset,
} from '../controllers/monitorInventoryController.js';

const router = express.Router();

router.get('/mo-inventory',                        getInventory);
router.get('/mo-inventory/summary',                getSummary);
router.get('/mo-inventory/search',                 searchInventory);
router.get('/mo-active-users',                     getActiveUsers);
router.get('/mo-location/layout/:layout_id',       getMOsByLayout);
router.get('/mo-location/:hostname',               getMOLocation);
router.put('/mo-location/:hostname',               updateMOLocation);
router.get('/mo-inventory/by-fix-asset/:code',     getInventoryByFixAsset);
router.get('/mo-inventory/:hostname/history',      getHistory);
router.get('/mo-inventory/:hostname',              getInventoryByHostname);
router.put('/mo-inventory/:hostname/asset',        updateAsset);
router.put('/mo-inventory/:hostname/status',       updateStatus);   // ✅ เพิ่มบรรทัดนี้
router.get('/mo-inventory/:hostname/software',     getSoftware);
router.delete('/mo-inventory/:hostname',           deleteInventory);
router.get('/mo-active-users/:hostname',           getActiveUsersByHostname);

export default router;