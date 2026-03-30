import express from 'express';
import {
    updateBitlocker,
    getActiveUsers,
    getActiveUsersByHostname,
    getInventory,
    getInventoryByHostname,
    updateAsset,
    getSoftwareByHostname,
    deleteInventory,
    searchInventory,
    getSummary
} from '../controllers/pcInventoryController.js';

const router = express.Router();

router.put('/pc-inventory/:hostname/bitlocker', updateBitlocker);
router.get('/pc-active-users', getActiveUsers);
router.get('/pc-active-users/:hostname', getActiveUsersByHostname);
router.get('/pc-inventory', getInventory);
router.get('/pc-inventory/search', searchInventory); // Put search before /:hostname
router.get('/pc-inventory/summary', getSummary);     // Put summary before /:hostname
router.get('/pc-inventory/:hostname', getInventoryByHostname);
router.put('/pc-inventory/:hostname/asset', updateAsset);
router.get('/pc-inventory/:hostname/software', getSoftwareByHostname);
router.delete('/pc-inventory/:hostname', deleteInventory);

export default router;
