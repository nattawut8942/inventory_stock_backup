import express from 'express';
import { getCtspPic } from '../controllers/ctspPicController.js';

const router = express.Router();

// รูปจากเครื่องแชร์ CTSP_Pic (ใช้ใน <img src>) — เปิดเป็น public เหมือน /uploads เพราะ <img> ส่ง token ไม่ได้
router.get('/ctsp-pic/:code', getCtspPic);

export default router;
