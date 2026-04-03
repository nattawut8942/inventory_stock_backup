import express from 'express';
import {
  getInventory,
  getInventoryByHostname,
  getActiveUsers,
  getActiveUsersByHostname,
  searchInventory,
  getSummary,
  getSoftware,
  updateAsset,
  deleteInventory
} from '../controllers/monitorInventoryController.js';

const router = express.Router();

// ── Static routes first (must come before /:hostname wildcard) ──
router.get('/mo-inventory',          getInventory);
router.get('/mo-inventory/summary',  getSummary);
router.get('/mo-inventory/search',   searchInventory);
router.get('/mo-active-users',       getActiveUsers);

// ── Parameterized routes ──
router.get   ('/mo-inventory/:hostname',          getInventoryByHostname);
router.put   ('/mo-inventory/:hostname/asset',    updateAsset);
router.get   ('/mo-inventory/:hostname/software', getSoftware);
router.delete('/mo-inventory/:hostname',          deleteInventory);
router.get   ('/mo-active-users/:hostname',       getActiveUsersByHostname);

export default router;