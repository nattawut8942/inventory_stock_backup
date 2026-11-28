// รูปเครื่องพรินเตอร์ — เก็บไฟล์ใน backend/uploads/printers และชื่อไฟล์ในคอลัมน์ dbo.Printers.PhotoFile
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { sql, getPool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PRINTER_PHOTO_DIR = path.resolve(__dirname, '../../uploads/printers');
export const PRINTER_PHOTO_PREFIX = '/ITinventory/uploads/printers';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

if (!fs.existsSync(PRINTER_PHOTO_DIR)) fs.mkdirSync(PRINTER_PHOTO_DIR, { recursive: true });

const toId = (v) => (/^\d+$/.test(String(v)) ? parseInt(v, 10) : null);
const removeFile = (file) => {
    if (!file) return;
    fs.promises.unlink(path.join(PRINTER_PHOTO_DIR, path.basename(file))).catch(() => { /* ไม่มีไฟล์แล้วก็ไม่เป็นไร */ });
};

// แปลงชื่อไฟล์ในฐานข้อมูลเป็น URL ที่เบราว์เซอร์เปิดได้ (null ถ้าไม่มีรูป)
export const printerPhotoUrl = (file) => (file ? `${PRINTER_PHOTO_PREFIX}/${encodeURIComponent(file)}` : null);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, PRINTER_PHOTO_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, `printer-${req.params.id}-${Date.now()}${ext}`);
    },
});

export const printerPhotoUpload = multer({
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

// POST /printer-health/:id/photo (multipart field "photo")
export const setPrinterPhoto = async (req, res) => {
    const id = toId(req.params.id);
    if (id == null) { if (req.file) removeFile(req.file.filename); return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' }); }
    if (!req.file) return res.status(400).json({ success: false, error: 'ไม่พบไฟล์รูป' });
    try {
        const pool = getPool();
        const old = await pool.request().input('id', sql.Int, id)
            .query(`SELECT PhotoFile AS F FROM dbo.Printers WHERE PrinterId = @id AND IsActive = 1`);
        if (!old.recordset[0]) { removeFile(req.file.filename); return res.status(404).json({ success: false, error: 'ไม่พบเครื่องพรินเตอร์' }); }
        await pool.request().input('id', sql.Int, id).input('f', sql.NVarChar(260), req.file.filename)
            .query(`UPDATE dbo.Printers SET PhotoFile = @f WHERE PrinterId = @id`);
        removeFile(old.recordset[0].F);
        res.locals.auditSummary = `อัปโหลดรูปเครื่อง (เครื่อง ${id})`;
        res.json({ success: true, data: { photoUrl: printerPhotoUrl(req.file.filename) } });
    } catch (err) {
        removeFile(req.file.filename);
        console.error('Set printer photo error:', err);
        res.status(500).json({ success: false, error: 'ไม่สามารถบันทึกรูปได้' });
    }
};

// DELETE /printer-health/:id/photo
export const clearPrinterPhoto = async (req, res) => {
    const id = toId(req.params.id);
    if (id == null) return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' });
    try {
        const r = await getPool().request().input('id', sql.Int, id)
            .query(`UPDATE dbo.Printers SET PhotoFile = NULL OUTPUT DELETED.PhotoFile AS OldFile WHERE PrinterId = @id AND IsActive = 1`);
        if (!r.recordset[0]) return res.status(404).json({ success: false, error: 'ไม่พบเครื่องพรินเตอร์' });
        removeFile(r.recordset[0].OldFile);
        res.locals.auditSummary = `ลบรูปเครื่อง (เครื่อง ${id})`;
        res.json({ success: true, data: { photoUrl: null } });
    } catch (err) {
        console.error('Clear printer photo error:', err);
        res.status(500).json({ success: false, error: 'ไม่สามารถลบรูปได้' });
    }
};
