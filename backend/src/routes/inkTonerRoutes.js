import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
    getInkTonerStock,
    getInkTonerCompat,
    setInkTonerCompat
} from '../controllers/inkTonerController.js';
import { getInkWithdrawals, getInkWithdrawalReport } from '../controllers/inkTonerWithdrawController.js';

const router = express.Router();

// Ink & Toner Stock (from DCI Database)
router.get('/ink-toner', getInkTonerStock);

// Ink & Toner <-> Printer compatibility (local dbInfrastructure)
router.get('/ink-toner/compat', getInkTonerCompat);
router.put('/ink-toner/:code/printers', requirePerm('ink-toner', 'edit'), setInkTonerCompat);

// ประวัติการเบิก (DCI อ่านอย่างเดียว) — ต้อง mount ก่อน /ink-toner/:code ถ้ามี
// มีชื่อผู้เบิกและเหตุผล จึงต้องมีสิทธิ์ดู Ink & Toner (ไม่ใช่ข้อมูลสาธารณะ)
router.get('/ink-toner/withdrawals', requirePerm('ink-toner', 'view'), getInkWithdrawals);
router.get('/ink-toner/withdrawals/report', requirePerm('ink-toner', 'view'), getInkWithdrawalReport);

export default router;
