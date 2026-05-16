import express from 'express';
import {
  getInventory, getInventoryByHostname,
  getActiveUsers, getActiveUsersByHostname,
  searchInventory, getSummary, getSoftware,
  updateAsset, deleteInventory,
  getMOLocation, getMOsByLayout, updateMOLocation,
} from '../controllers/monitorInventoryController.js';

const router = express.Router();

router.get('/mo-inventory',                        getInventory);
router.get('/mo-inventory/summary',                getSummary);
router.get('/mo-inventory/search',                 searchInventory);
router.get('/mo-active-users',                     getActiveUsers);
router.get('/mo-location/layout/:layout_id',       getMOsByLayout);   // ← ก่อน /:hostname
router.get('/mo-location/:hostname',               getMOLocation);
router.put('/mo-location/:hostname',               updateMOLocation);
router.get('/mo-inventory/:hostname',              getInventoryByHostname);
router.put('/mo-inventory/:hostname/asset',        updateAsset);
router.get('/mo-inventory/:hostname/software',     getSoftware);
router.delete('/mo-inventory/:hostname',           deleteInventory);
router.get('/mo-active-users/:hostname',           getActiveUsersByHostname);

export default router;