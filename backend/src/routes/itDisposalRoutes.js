import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';
import {
  lookupAsset,
  listRuns,
  createRun,
  getRunItems,
  closeRun,
  addItem,
  deleteItem,
  uploadDisposalPics,
  updateItemPhotos,
  getRunReport,
  deleteRun,
  getRunEvents,
  searchAssetAcrossRuns,
  reopenRun,
  getYearlySummary,
  completeRun,
  uncompleteRun,
  listAttachments,
  uploadDisposalDoc,
  addAttachment,
  getAttachmentFile,
  deleteAttachment,
} from '../controllers/itDisposalController.js';

const router = express.Router();
const PAGE = 'it-disposal';

// ทุก endpoint ของ Disposal ต้องล็อกอิน (ไม่ขึ้นกับโหมดสิทธิ์ log/off ของระบบ)
router.use(verifyToken);

// ค้นหาครุภัณฑ์จาก Fixed Asset (DCI)
router.get('/lookup/:code', requirePerm(PAGE, 'view', { strict: true }), lookupAsset);

// รอบ Disposal
router.get('/runs', requirePerm(PAGE, 'view', { strict: true }), listRuns);
router.post('/runs', requirePerm(PAGE, 'open', { strict: true }), createRun);
router.get('/runs/:id/items', requirePerm(PAGE, 'view', { strict: true }), getRunItems);
router.put('/runs/:id/close', requirePerm(PAGE, 'edit-run', { strict: true }), closeRun);
// สถานะ "เสร็จสิ้น" (หลังปิดรอบ เมื่อ บช. ดำเนินการทิ้งครบ)
router.put('/runs/:id/complete', requirePerm(PAGE, 'edit-run', { strict: true }), completeRun);
router.put('/runs/:id/uncomplete', requirePerm(PAGE, 'edit-run', { strict: true }), uncompleteRun);
router.get('/runs/:id/report', requirePerm(PAGE, 'view', { strict: true }), getRunReport);
router.get('/runs/:id/events', requirePerm(PAGE, 'view', { strict: true }), getRunEvents);
router.get('/search', requirePerm(PAGE, 'view', { strict: true }), searchAssetAcrossRuns);
router.get('/summary/yearly', requirePerm(PAGE, 'view', { strict: true }), getYearlySummary);
// เปิดรอบที่ปิดแล้วอีกครั้ง — เฉพาะ Admin
router.put('/runs/:id/reopen', requireRole('Admin'), reopenRun);
router.delete('/runs/:id', requirePerm(PAGE, 'delete-run', { strict: true }), deleteRun);

// รายการในรอบ (multipart: fields + pic1 + pic2, รูปไม่บังคับ)
router.post('/runs/:id/items', requirePerm(PAGE, 'create', { strict: true }), uploadDisposalPics, addItem);
// แนบ/เปลี่ยนรูปของรายการที่มีอยู่แล้ว
router.put('/runs/:id/items/:itemId/photos', requirePerm(PAGE, 'edit', { strict: true }), uploadDisposalPics, updateItemPhotos);
router.delete('/items/:itemId', requirePerm(PAGE, 'delete', { strict: true }), deleteItem);

// ไฟล์แนบของรอบ (PDF หลักฐาน) — ดูได้ตามสิทธิ์ view, เพิ่ม/ลบใช้สิทธิ์ edit-run
router.get('/runs/:id/attachments', requirePerm(PAGE, 'view', { strict: true }), listAttachments);
router.post('/runs/:id/attachments', requirePerm(PAGE, 'edit-run', { strict: true }), uploadDisposalDoc, addAttachment);
router.get('/attachments/:id/file', requirePerm(PAGE, 'view', { strict: true }), getAttachmentFile);
router.delete('/attachments/:id', requirePerm(PAGE, 'edit-run', { strict: true }), deleteAttachment);

export default router;
