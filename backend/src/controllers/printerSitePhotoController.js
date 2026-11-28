// รูปหน้างานที่ติดตั้งจริงของเครื่องพรินเตอร์ — เก็บไฟล์ใน backend/uploads/printers (prefix "site-")
// และชื่อไฟล์ในคอลัมน์ dbo.Printers.SitePhotoFile
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { sql, getPool } from '../config/db.js';
import { PRINTER_PHOTO_DIR, printerPhotoUrl } from './printerPhotoController.js';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

const toId = (v) => (/^\d+$/.test(String(v)) ? parseInt(v, 10) : null);
const removeFile = (file) => {
    if (!file) return;
    fs.promises.unlink(path.join(PRINTER_PHOTO_DIR, path.basename(file))).catch(() => { /* ไม่มีไฟล์แล้วก็ไม่เป็นไร */ });
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, PRINTER_PHOTO_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, `site-${req.params.id}-${Date.now()}${ext}`);
    },
});

export const printerSitePhotoUpload = multer({
    storage,
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (!ALLOWED_EXT.includes(ext) || !String(file.mimetype).startsWith('image/')) {
            return cb(new Error('รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP'));
        }
        cb(null, true);
    },
}).single('photo');

// POST /printer-health/:id/site-photo (multipart field "photo")
export const setPrinterSitePhoto = async (req, res) => {
    const id = toId(req.params.id);
    if (id == null) { if (req.file) removeFile(req.file.filename); return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' }); }
    if (!req.file) return res.status(400).json({ success: false, error: 'ไม่พบไฟล์รูป' });
    try {
        const pool = getPool();
        const old = await pool.request().input('id', sql.Int, id)
            .query(`SELECT SitePhotoFile AS F FROM dbo.Printers WHERE PrinterId = @id AND IsActive = 1`);
        if (!old.recordset[0]) { removeFile(req.file.filename); return res.status(404).json({ success: false, error: 'ไม่พบเครื่องพรินเตอร์' }); }
        await pool.request().input('id', sql.Int, id).input('f', sql.NVarChar(260), req.file.filename)
            .query(`UPDATE dbo.Printers SET SitePhotoFile = @f WHERE PrinterId = @id`);
        removeFile(old.recordset[0].F);
        res.locals.auditSummary = `อัปโหลดรูปหน้างาน (เครื่อง ${id})`;
        res.json({ success: true, data: { photoUrl: printerPhotoUrl(req.file.filename) } });
    } catch (err) {
        removeFile(req.file.filename);
        console.error('Set printer site photo error:', err);
        res.status(500).json({ success: false, error: 'ไม่สามารถบันทึกรูปได้' });
    }
};

// DELETE /printer-health/:id/site-photo
export const clearPrinterSitePhoto = async (req, res) => {
    const id = toId(req.params.id);
    if (id == null) return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' });
    try {
        const r = await getPool().request().input('id', sql.Int, id)
            .query(`UPDATE dbo.Printers SET SitePhotoFile = NULL OUTPUT DELETED.SitePhotoFile AS OldFile WHERE PrinterId = @id AND IsActive = 1`);
        if (!r.recordset[0]) return res.status(404).json({ success: false, error: 'ไม่พบเครื่องพรินเตอร์' });
        removeFile(r.recordset[0].OldFile);
        res.locals.auditSummary = `ลบรูปหน้างาน (เครื่อง ${id})`;
        res.json({ success: true, data: { photoUrl: null } });
    } catch (err) {
        console.error('Clear printer site photo error:', err);
        res.status(500).json({ success: false, error: 'ไม่สามารถลบรูปได้' });
    }
};
