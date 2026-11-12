import express from 'express';
import {
  getBorrowings,
  createBorrowing,
  returnBorrowing,
  updateBorrowing, // ✅ เพิ่ม import ตัวนี้ (ฟังก์ชันนี้ต้องอยู่ใน borrowController.js ของคุณด้วย)
  getAssetDetail,
} from '../controllers/borrowController.js';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// ✅ ทุก endpoint ของ Borrowing ต้อง login (JWT) ก่อน — เดิมไม่มีการตรวจสิทธิ์ฝั่ง backend เลย
router.use(verifyToken);

// ดึงรายการยืม-คืน
router.get('/', getBorrowings);

// บันทึกการยืมใหม่ (ผู้ใช้ที่ login แล้วทุกคน)
router.post('/', createBorrowing);

// ✅ แก้ไขข้อมูลรายการยืม (เผื่อบันทึกผิด เปลี่ยนสถานะเองได้ด้วย) — เฉพาะ Staff/Admin
router.put('/:id', requireRole('Admin'), updateBorrowing);

// รับคืนอุปกรณ์ (Update สถานะ)
router.put('/:id/return', returnBorrowing);

// ค้นหาข้อมูลครุภัณฑ์จากระบบ Fixed Asset (DCI) ด้วยรหัสครุภัณฑ์
// path เต็มจะกลายเป็น {mount-prefix}/borrowings/assets/:code เพราะ router นี้ mount ใต้ /borrowings อยู่แล้ว
router.get('/assets/:code', getAssetDetail);

export default router;