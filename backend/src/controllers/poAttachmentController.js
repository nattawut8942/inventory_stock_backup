import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { sql, getPool } from '../config/db.js';

// ไฟล์ PO เก็บนอก public static folder ให้ดาวน์โหลด/เปิดผ่าน endpoint เท่านั้น
const UPLOAD_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/po');
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.xls', '.docx', '.doc'];

// express-fileupload อ่านชื่อไฟล์ภาษาไทยเป็น latin1 ถ้าเป็นกรณีนั้นให้ decode เป็น UTF-8
export const fixFileName = (name) => {
    const s = String(name || '');
    const looksLatin1 = /[\u0080-ÿ]/.test(s) && !/[^\u0000-ÿ]/.test(s);
    return looksLatin1 ? Buffer.from(s, 'latin1').toString('utf8') : s;
};

const resolveStored = (storedName) => {
    const p = path.join(UPLOAD_ROOT, path.basename(String(storedName || '')));
    return p.startsWith(UPLOAD_ROOT) ? p : null;
};

// Middleware: ตรวจไฟล์ที่แนบมา (req.files.file) ก่อนเข้า controller
export const checkPOFile = (req, res, next) => {
    const f = req.files?.file;
    if (!f) return next();
    const ext = path.extname(fixFileName(f.name)).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
        return res.status(400).json({ error: `ไม่รองรับไฟล์ประเภทนี้ (อนุญาต: ${ALLOWED_EXT.join(', ')})` });
    }
    if (f.size > MAX_BYTES) return res.status(400).json({ error: 'ไฟล์ใหญ่เกิน 10 MB' });
    next();
};

// เก็บไฟล์ลงดิสก์ คืนชื่อที่เก็บ (สุ่มทั้งหมด)
export const storePOFile = (f) => new Promise((resolve, reject) => {
    try {
        fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
        const ext = path.extname(fixFileName(f.name)).toLowerCase();
        const stored = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
        f.mv(path.join(UPLOAD_ROOT, stored), (err) => (err ? reject(err) : resolve(stored)));
    } catch (err) {
        reject(err);
    }
});

export const removeStoredPOFiles = (names = []) => {
    for (const n of names) {
        const p = resolveStored(n);
        if (p) fs.unlink(p, () => {});
    }
};

// เรียกใน transaction ของ createPO / updatePO
export const insertPOAttachment = async (tx, { poId, file, stored, actor }) => {
    await new sql.Request(tx)
        .input('PO_ID', sql.NVarChar(50), poId)
        .input('FileName', sql.NVarChar(255), fixFileName(file.name).slice(0, 255))
        .input('StoredName', sql.NVarChar(255), stored)
        .input('MimeType', sql.NVarChar(100), file.mimetype || null)
        .input('FileSize', sql.Int, file.size)
        .input('UploadedBy', sql.NVarChar(50), actor || null)
        .query(`INSERT INTO dbo.Stock_PO_Attachments (PO_ID, FileName, StoredName, MimeType, FileSize, UploadedBy)
                VALUES (@PO_ID, @FileName, @StoredName, @MimeType, @FileSize, @UploadedBy)`);
};

export const fetchPOAttachments = async (poId) => {
    const result = await getPool().request()
        .input('PO_ID', sql.NVarChar(50), poId)
        .query(`SELECT AttachmentID, FileName, FileSize, UploadedBy, UploadedAt
                FROM dbo.Stock_PO_Attachments WHERE PO_ID = @PO_ID ORDER BY AttachmentID`);
    return result.recordset;
};

// GET /po-attachments/:attId/file  (แสดงในเบราว์เซอร์; ?download=1 เพื่อดาวน์โหลด)
export const viewPOAttachment = async (req, res) => {
    const attId = Number(req.params.attId);
    if (!Number.isInteger(attId)) return res.status(400).json({ error: 'Invalid attachment id' });
    try {
        const result = await getPool().request()
            .input('AttachmentID', sql.Int, attId)
            .query('SELECT FileName, StoredName FROM dbo.Stock_PO_Attachments WHERE AttachmentID = @AttachmentID');
        const row = result.recordset[0];
        if (!row) return res.status(404).json({ error: 'Attachment not found' });
        const filePath = resolveStored(row.StoredName);
        if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on server' });

        const disposition = req.query.download === '1' ? 'attachment' : 'inline';
        res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(row.FileName)}`);
        res.sendFile(filePath);
    } catch (err) {
        console.error('View PO Attachment Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// DELETE /po-attachments/:attId  (ลบได้เฉพาะ PO ที่ยังไม่ดำเนินการ และต้องเหลืออย่างน้อย 1 ไฟล์)
export const deletePOAttachment = async (req, res) => {
    const attId = Number(req.params.attId);
    if (!Number.isInteger(attId)) return res.status(400).json({ error: 'Invalid attachment id' });
    try {
        const pool = getPool();
        const info = await pool.request()
            .input('AttachmentID', sql.Int, attId)
            .query(`SELECT a.PO_ID, a.StoredName, p.Status,
                           (SELECT COUNT(*) FROM dbo.Stock_PO_Attachments x WHERE x.PO_ID = a.PO_ID) AS FileCount
                    FROM dbo.Stock_PO_Attachments a
                    JOIN dbo.Stock_PurchaseOrders p ON p.PO_ID = a.PO_ID
                    WHERE a.AttachmentID = @AttachmentID`);
        const row = info.recordset[0];
        if (!row) return res.status(404).json({ error: 'Attachment not found' });
        if (row.Status !== 'Open' && row.Status !== 'Pending') {
            return res.status(400).json({ error: 'PO นี้ดำเนินการแล้ว ลบไฟล์แนบไม่ได้' });
        }
        if (row.FileCount <= 1) {
            return res.status(400).json({ error: 'PO ต้องมีไฟล์แนบอย่างน้อย 1 ไฟล์' });
        }
        await pool.request()
            .input('AttachmentID', sql.Int, attId)
            .query('DELETE FROM dbo.Stock_PO_Attachments WHERE AttachmentID = @AttachmentID');
        removeStoredPOFiles([row.StoredName]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete PO Attachment Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};
