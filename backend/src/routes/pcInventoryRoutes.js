import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
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
    getReincarnatedMachines, // ✅ เพิ่ม import
    getHistory,
    getInventoryByFixAsset,
    updateWarranty,
    bulkUpdateWarranty
} from '../controllers/pcInventoryController.js';

const router = express.Router();

router.put('/pc-inventory/:hostname/bitlocker', requirePerm('pc-inventory', 'edit'), updateBitlocker);
router.get('/pc-active-users', getActiveUsers);
router.get('/pc-active-users/:hostname', getActiveUsersByHostname);
router.get('/pc-inventory', getInventory);
router.get('/pc-inventory/search', searchInventory);
router.get('/pc-inventory/summary', getSummary);
router.get('/pc-inventory/multi-login', getMultiLoginUsers);
router.get('/pc-inventory/reincarnated', getReincarnatedMachines); // ✅ เพิ่ม route
router.get('/pc-inventory/by-fix-asset/:code', getInventoryByFixAsset);
router.get('/pc-inventory/:hostname/history', getHistory);
router.get('/pc-inventory/:hostname', getInventoryByHostname);
router.put('/pc-inventory/:hostname/asset', requirePerm('pc-inventory', 'edit'), updateAsset);
router.put('/pc-inventory/:hostname/status', requirePerm('pc-inventory', 'edit'), updateStatus);   // ✅ เพิ่มบรรทัดนี้
router.put('/pc-inventory/:hostname/warranty', requirePerm('pc-inventory', 'edit'), updateWarranty);
router.put('/pc-inventory-bulk/warranty', requirePerm('pc-inventory', 'edit'), bulkUpdateWarranty);
router.get('/pc-inventory/:hostname/software', getSoftwareByHostname);
router.delete('/pc-inventory/:hostname', requirePerm('pc-inventory', 'delete'), deleteInventory);

export default router;