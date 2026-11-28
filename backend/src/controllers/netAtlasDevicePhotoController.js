// NetAtlas — รูปของอุปกรณ์ 2 แบบ: รูปอุปกรณ์ (PhotoFile) และรูปหน้างาน (SitePhotoFile)
// เก็บไฟล์ใน backend/uploads/netatlas-devices และเสิร์ฟผ่าน NETATLAS_DEVICE_PHOTO_PREFIX
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { sql, getPool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const NETATLAS_DEVICE_PHOTO_DIR = path.resolve(__dirname, '../../uploads/netatlas-devices');
export const NETATLAS_DEVICE_PHOTO_PREFIX = '/ITinventory/uploads/netatlas-devices';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

if (!fs.existsSync(NETATLAS_DEVICE_PHOTO_DIR)) fs.mkdirSync(NETATLAS_DEVICE_PHOTO_DIR, { recursive: true });

const toId = (v) => (/^\d+$/.test(String(v)) ? parseInt(v, 10) : null);
const removeFile = (file) => {
    if (!file) return;
    fs.promises.unlink(path.join(NETATLAS_DEVICE_PHOTO_DIR, path.basename(file))).catch(() => { /* ไม่มีไฟล์แล้วก็ไม่เป็นไร */ });
};
const photoUrl = (file) => (file ? `${NETATLAS_DEVICE_PHOTO_PREFIX}/${encodeURIComponent(file)}` : null);

// สร้างชุด handler สำหรับรูปแต่ละชนิด (คอลัมน์ในฐานข้อมูลและชื่อไฟล์ต่างกัน)
const makePhotoKind = (prefix, column) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, NETATLAS_DEVICE_PHOTO_DIR),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            cb(null, `${prefix}-${req.params.id}-${Date.now()}${ext}`);
        },
    });
    const upload = multer({
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

    const set = async (req, res) => {
        const id = toId(req.params.id);
        if (id == null) { if (req.file) removeFile(req.file.filename); return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' }); }
        if (!req.file) return res.status(400).json({ success: false, error: 'ไม่พบไฟล์รูป' });
        try {
            const pool = getPool();
            const old = await pool.request().input('id', sql.Int, id).query(`SELECT ${column} AS F FROM dbo.NetAtlas_Devices WHERE DeviceID = @id`);
            if (!old.recordset[0]) { removeFile(req.file.filename); return res.status(404).json({ success: false, error: 'ไม่พบอุปกรณ์' }); }
            await pool.request().input('id', sql.Int, id).input('f', sql.NVarChar(260), req.file.filename)
                .query(`UPDATE dbo.NetAtlas_Devices SET ${column} = @f WHERE DeviceID = @id`);
            removeFile(old.recordset[0].F);
            res.json({ success: true, data: { photoUrl: photoUrl(req.file.filename) } });
        } catch (err) {
            removeFile(req.file.filename);
            console.error('[NetAtlas] set photo:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    };

    const clear = async (req, res) => {
        const id = toId(req.params.id);
        if (id == null) return res.status(400).json({ success: false, error: 'id ไม่ถูกต้อง' });
        try {
            const r = await getPool().request().input('id', sql.Int, id)
                .query(`UPDATE dbo.NetAtlas_Devices SET ${column} = NULL OUTPUT DELETED.${column} AS OldFile WHERE DeviceID = @id`);
            if (!r.recordset[0]) return res.status(404).json({ success: false, error: 'ไม่พบอุปกรณ์' });
            removeFile(r.recordset[0].OldFile);
            res.json({ success: true, data: { photoUrl: null } });
        } catch (err) {
            console.error('[NetAtlas] clear photo:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    };

    return { upload, set, clear };
};

export const devicePhoto = makePhotoKind('device', 'PhotoFile');
export const sitePhoto = makePhotoKind('site', 'SitePhotoFile');
