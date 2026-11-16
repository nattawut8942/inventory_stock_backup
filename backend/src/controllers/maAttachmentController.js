import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { sql, getPool } from '../config/db.js';

// Attachments are only uploaded during "ต่ออายุเสร็จ" (required there). They belong to that renewal cycle.
// Files are stored outside the public static folder and served only by the download endpoint.
const UPLOAD_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/ma');
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;
const ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.xls', '.docx', '.doc'];
const ALLOWED_KINDS = ['QT', 'PR', 'PO', 'RECEIPT', 'OTHER'];
const isId = (v) => /^\d+$/.test(String(v));

// Multer returns non-ASCII filenames as latin1; re-decode them as UTF-8 when that is the case.
export const fixFileName = (name) => {
    const s = String(name || '');
    const looksLatin1 = /[\u0080-ÿ]/.test(s) && !/[^\u0000-ÿ]/.test(s);
    return looksLatin1 ? Buffer.from(s, 'latin1').toString('utf8') : s;
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(UPLOAD_ROOT, String(req.params.id));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(fixFileName(file.originalname)).toLowerCase();
        cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_BYTES, files: MAX_FILES },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(fixFileName(file.originalname)).toLowerCase();
        if (!ALLOWED_EXT.includes(ext)) {
            return cb(new Error(`ไม่รองรับไฟล์ประเภทนี้ (อนุญาต: ${ALLOWED_EXT.join(', ')})`));
        }
        cb(null, true);
    },
});

export const removeFiles = (files = []) => {
    for (const f of files) fs.unlink(f.path, () => {});
};

// Route middleware for POST /ma/:id/renew (multipart: fields + files[]).
export const uploadRenewalFiles = (req, res, next) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid item id' });
    upload.array('files', MAX_FILES)(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกิน 10 MB'
                : err.code === 'LIMIT_FILE_COUNT' ? `แนบได้สูงสุด ${MAX_FILES} ไฟล์`
                : err.message;
            return res.status(400).json({ error: msg });
        }
        next();
    });
};

// Called inside the renewal transaction, after MA_RenewalHistory is written.
export const insertRenewalAttachments = async (tx, { itemId, renewalId, files, kinds, actor, client }) => {
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const kind = ALLOWED_KINDS.includes(kinds[i]) ? kinds[i] : 'OTHER';
        const originalName = fixFileName(f.originalname).slice(0, 255);
        await new sql.Request(tx)
            .input('ItemID', sql.Int, itemId)
            .input('RenewalID', sql.Int, renewalId)
            .input('Kind', sql.NVarChar(20), kind)
            .input('FileName', sql.NVarChar(255), originalName)
            .input('StoredName', sql.NVarChar(255), `${itemId}/${f.filename}`)
            .input('MimeType', sql.NVarChar(100), f.mimetype || null)
            .input('FileSize', sql.Int, f.size)
            .input('UploadedBy', sql.NVarChar(50), actor)
            .input('ClientIP', sql.NVarChar(45), client.ip)
            .input('ClientMAC', sql.NVarChar(17), client.mac)
            .query(`INSERT INTO dbo.MA_Attachments
                    (ItemID, RenewalID, Kind, FileName, StoredName, MimeType, FileSize, UploadedBy, ClientIP, ClientMAC)
                    VALUES (@ItemID, @RenewalID, @Kind, @FileName, @StoredName, @MimeType, @FileSize, @UploadedBy, @ClientIP, @ClientMAC)`);
    }
};

// GET download one attachment (file name shown to the user is the original name)
export const downloadAttachment = async (req, res) => {
    const { attId } = req.params;
    if (!isId(attId)) return res.status(400).json({ error: 'Invalid attachment id' });
    try {
        const result = await getPool().request()
            .input('AttachmentID', sql.Int, attId)
            .query('SELECT FileName, StoredName FROM dbo.MA_Attachments WHERE AttachmentID = @AttachmentID AND IsDeleted = 0');
        const row = result.recordset[0];
        if (!row) return res.status(404).json({ error: 'Attachment not found' });
        // StoredName comes from the database (written by this server), never from the request.
        const filePath = path.join(UPLOAD_ROOT, row.StoredName);
        if (!filePath.startsWith(UPLOAD_ROOT) || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File missing on server' });
        }
        res.download(filePath, row.FileName);
    } catch (err) {
        console.error('Download MA Attachment Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};
