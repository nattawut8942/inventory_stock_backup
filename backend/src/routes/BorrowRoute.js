import express from 'express';
import {
  getBorrowings,
  createBorrowing,
  returnBorrowing,
  updateBorrowing, // ✅ เพิ่ม import ตัวนี้ (ฟังก์ชันนี้ต้องอยู่ใน borrowController.js ของคุณด้วย)
  getAssetDetail,
} from '../controllers/borrowController.js';

const router = express.Router();

// ดึงรายการที่กำลังยืมอยู่
router.get('/', getBorrowings);

// บันทึกการยืมใหม่
router.post('/', createBorrowing);

// ✅ แก้ไขข้อมูลรายการยืม (เผื่อบันทึกผิด เปลี่ยนสถานะเองได้ด้วย)
router.put('/:id', updateBorrowing);

// รับคืนอุปกรณ์ (Update สถานะ)
router.put('/:id/return', returnBorrowing);

// ค้นหาข้อมูลครุภัณฑ์จากระบบ Fixed Asset (DCI) ด้วยรหัสครุภัณฑ์
// path เต็มจะกลายเป็น {mount-prefix}/borrowings/assets/:code เพราะ router นี้ mount ใต้ /borrowings อยู่แล้ว
router.get('/assets/:code', getAssetDetail);

export default router;