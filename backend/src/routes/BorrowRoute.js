import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
  getBorrowings,
  createBorrowing,
  returnBorrowing,
  updateBorrowing, // ✅ เพิ่ม import ตัวนี้ (ฟังก์ชันนี้ต้องอยู่ใน borrowController.js ของคุณด้วย)
  getAssetDetail,
} from '../controllers/borrowController.js';
const router = express.Router();

// ไม่บังคับ token ให้เหมือนหน้าอื่นในระบบ (ตามที่ตกลง)

// ดึงรายการยืม-คืน
router.get('/', getBorrowings);

// บันทึกการยืมใหม่ (ผู้ใช้ที่ login แล้วทุกคน)
router.post('/', requirePerm('borrowings', 'create'), createBorrowing);

// แก้ไขข้อมูลรายการยืม
router.put('/:id', requirePerm('borrowings', 'edit'), updateBorrowing);

// รับคืนอุปกรณ์ (Update สถานะ)
router.put('/:id/return', requirePerm('borrowings', 'return'), returnBorrowing);

// ค้นหาข้อมูลครุภัณฑ์จากระบบ Fixed Asset (DCI) ด้วยรหัสครุภัณฑ์
// path เต็มจะกลายเป็น {mount-prefix}/borrowings/assets/:code เพราะ router นี้ mount ใต้ /borrowings อยู่แล้ว
router.get('/assets/:code', getAssetDetail);

export default router;