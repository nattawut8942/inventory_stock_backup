import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
  getArticles,
  searchArticles,
  getArticlesByProblemType,
  getArticleDetail,
  getProblemTypes,
  createArticle,
  updateArticle,
  deleteArticle,
  deletePdf
} from '../controllers/kbController.js';

const router = express.Router();

// ================== PUBLIC ROUTES ==================

// GET: ดึงรายการบทความทั้งหมด
router.get('/', getArticles);

// GET: ค้นหาบทความ
router.get('/search', searchArticles);

// ✅ GET: ดึง problem types จาก existing table
router.get('/types', getProblemTypes);

// GET: ดึงบทความตามประเภท
router.get('/type/:problemTypeId', getArticlesByProblemType);

// GET: ดึงรายละเอียดบทความ
router.get('/article/:slug', getArticleDetail);

// ================== SUBMISSION ROUTES ==================

// POST: สร้างบทความใหม่
router.post('/', requirePerm('knowledge-base', 'create'), createArticle);

// PUT: แก้ไขบทความ
router.put('/:id', requirePerm('knowledge-base', 'edit'), updateArticle);

// DELETE: ลบเฉพาะ PDF
router.delete('/:id/pdf', requirePerm('knowledge-base', 'edit'), deletePdf);

// DELETE: ลบบทความ
router.delete('/:id', requirePerm('knowledge-base', 'delete'), deleteArticle);

export default router;