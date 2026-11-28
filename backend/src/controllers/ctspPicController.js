import fs from 'fs';
import path from 'path';

// รูปสินค้า/หมึกจากเครื่องแชร์ CTSP_Pic (\\192.168.226.8\CTSP_Pic\<รหัส>.JPG)
// เบราว์เซอร์เปิด UNC path ตรง ๆ ไม่ได้ จึงให้ backend อ่านไฟล์แล้วส่งกลับเป็นรูป
const CTSP_PIC_DIR = process.env.CTSP_PIC_DIR || '\\\\192.168.226.8\\CTSP_Pic';

// รหัสต้องเป็นตัวอักษร/ตัวเลข/ - _ . เท่านั้น (กัน path traversal เช่น ..\ หรือ /)
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

const CONTENT_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
};

// GET /ctsp-pic/:code  -> ส่งไฟล์ <code>.JPG (ลอง .jpg ด้วยถ้าไม่เจอ)
export const getCtspPic = async (req, res) => {
    const code = String(req.params.code || '').trim();
    if (!CODE_PATTERN.test(code)) {
        return res.status(400).json({ error: 'รหัสรูปไม่ถูกต้อง' });
    }

    const candidates = [`${code}.JPG`, `${code}.jpg`];
    for (const name of candidates) {
        const filePath = path.win32.join(CTSP_PIC_DIR, name);
        try {
            const stat = await fs.promises.stat(filePath);
            if (!stat.isFile()) continue;

            const ext = path.extname(name).toLowerCase();
            res.setHeader('Content-Type', CONTENT_TYPES[ext] || 'application/octet-stream');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            fs.createReadStream(filePath)
                .on('error', () => {
                    if (!res.headersSent) res.status(500).end();
                    else res.destroy();
                })
                .pipe(res);
            return;
        } catch (err) {
            if (err.code === 'ENOENT') continue;
            console.error('CTSP pic read error:', err.code || err.message);
            return res.status(502).json({ error: 'ไม่สามารถเข้าถึงโฟลเดอร์รูปได้' });
        }
    }

    res.status(404).json({ error: 'ไม่พบรูปสำหรับรหัสนี้' });
};
