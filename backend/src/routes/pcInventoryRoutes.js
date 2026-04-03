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
    getSummary,
    getMultiLoginUsers
} from '../controllers/pcInventoryController.js';

const router = express.Router();

router.put('/pc-inventory/:hostname/bitlocker', updateBitlocker);
router.get('/pc-active-users', getActiveUsers);
router.get('/pc-active-users/:hostname', getActiveUsersByHostname);
router.get('/pc-inventory', getInventory);
router.get('/pc-inventory/search', searchInventory);
router.get('/pc-inventory/summary', getSummary);
router.get('/pc-inventory/multi-login', getMultiLoginUsers);   // ← ย้ายมาตรงนี้
router.get('/pc-inventory/:hostname', getInventoryByHostname); // wildcard
router.put('/pc-inventory/:hostname/asset', updateAsset);
router.get('/pc-inventory/:hostname/software', getSoftwareByHostname);
router.delete('/pc-inventory/:hostname', deleteInventory);


export default router;
