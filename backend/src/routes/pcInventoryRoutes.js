import express from 'express';
import {
    updateBitlocker,
    getActiveUsers,
    getActiveUsersByHostname,
    getInventory,
    getInventoryByHostname,
    updateAsset,
    updateStatus,        // ✅ เพิ่ม import
    getSoftwareByHostname,
    deleteInventory,
    searchInventory,
    getSummary,
    getMultiLoginUsers,
    getHistory,
    getInventoryByFixAsset 
} from '../controllers/pcInventoryController.js';

const router = express.Router();

router.put('/pc-inventory/:hostname/bitlocker', updateBitlocker);
router.get('/pc-active-users', getActiveUsers);
router.get('/pc-active-users/:hostname', getActiveUsersByHostname);
router.get('/pc-inventory', getInventory);
router.get('/pc-inventory/search', searchInventory);
router.get('/pc-inventory/summary', getSummary);
router.get('/pc-inventory/multi-login', getMultiLoginUsers);
router.get('/pc-inventory/by-fix-asset/:code', getInventoryByFixAsset);
router.get('/pc-inventory/:hostname/history', getHistory);
router.get('/pc-inventory/:hostname', getInventoryByHostname);
router.put('/pc-inventory/:hostname/asset', updateAsset);
router.put('/pc-inventory/:hostname/status', updateStatus);   // ✅ เพิ่มบรรทัดนี้
router.get('/pc-inventory/:hostname/software', getSoftwareByHostname);
router.delete('/pc-inventory/:hostname', deleteInventory);

export default router;