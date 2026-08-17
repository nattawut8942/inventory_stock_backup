// routes/itRequestRoute.js
import express from 'express';
import { getITRequests, getITRequestById, getITRequestStats } from '../controllers/itRequestController.js';

const router = express.Router();

// GET all IT requests (FM-IT-004, deduplicated, exclude Rejected/Cancel)
router.get('/it-requests', getITRequests);

// GET stats (count per status, current year, no dedup) — ต้องอยู่ก่อน /:requestId
router.get('/it-requests/stats', getITRequestStats);

// GET single IT request by Request_id
router.get('/it-requests/:requestId', getITRequestById);

export default router;