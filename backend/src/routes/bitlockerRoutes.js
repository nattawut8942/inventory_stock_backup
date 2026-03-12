import express from 'express';
import {
    getBitlockerRecords,
    getBitlockerById,
    createBitlockerRecord,
    updateBitlockerRecord,
    deleteBitlockerRecord
} from '../controllers/bitlockerController.js';

const router = express.Router();

router.get('/bitlocker', getBitlockerRecords);
router.get('/bitlocker/:id', getBitlockerById);
router.post('/bitlocker', createBitlockerRecord);
router.put('/bitlocker/:id', updateBitlockerRecord);
router.delete('/bitlocker/:id', deleteBitlockerRecord);

export default router;
