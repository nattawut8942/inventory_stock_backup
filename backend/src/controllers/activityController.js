import { sql, getPool } from '../config/db.js';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Jimp = require('jimp');
const archiverModule = require('archiver');

// รองรับได้ทั้ง archiver เวอร์ชันเก่า (factory function: archiver('zip', opts))
// และเวอร์ชันใหม่ (class: new ZipArchive(opts)) — เผื่อ API เปลี่ยนไปตาม version ที่ติดตั้งจริง
const createZipArchive = (opts) => {
    if (typeof archiverModule === 'function') return archiverModule('zip', opts);
    if (archiverModule?.default && typeof archiverModule.default === 'function') return archiverModule.default('zip', opts);
    if (archiverModule?.ZipArchive) return new archiverModule.ZipArchive(opts);
    throw new Error('ไม่รู้จักรูปแบบของ archiver module ที่ติดตั้งไว้ — เช็ค version ของ package "archiver"');
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ที่เก็บไฟล์รูป Activity — network share (UNC path)
const ACTIVITY_UPLOAD_DIR = process.env.ACTIVITY_UPLOAD_DIR
    || '\\\\W2kadth\\is\\Internal Use Only\\ActivityWorking';

// ขนาดรูปที่ resize ให้ — main สำหรับดูเต็ม, thumbnail สำหรับ grid/cover
const MAIN_MAX_DIMENSION = 1920;
const THUMB_MAX_DIMENSION = 480;

// เฉพาะ role นี้เท่านั้นที่ลบ/แก้ไขได้ (ตาม convention เดิมของระบบ — isAdmin = role 'Staff')
const ADMIN_ROLE = 'Staff';
const isAdminRole = (role) => role === ADMIN_ROLE;

// ─── Helper: resize รูปเป็น main + thumbnail แล้วเซฟลง network share (ใช้ jimp — pure JS ไม่มี native binary) ───
const saveResizedImage = async (fileBuffer) => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mainFileName = `${suffix}.jpg`;
    const thumbFileName = `thumb_${suffix}.jpg`;

    const image = await Jimp.read(fileBuffer);

    const mainImage = image.clone();
    mainImage.scaleToFit(MAIN_MAX_DIMENSION, MAIN_MAX_DIMENSION);
    mainImage.quality(82);
    const mainBuffer = await mainImage.getBufferAsync(Jimp.MIME_JPEG);

    const thumbImage = image.clone();
    thumbImage.scaleToFit(THUMB_MAX_DIMENSION, THUMB_MAX_DIMENSION);
    thumbImage.quality(75);
    const thumbBuffer = await thumbImage.getBufferAsync(Jimp.MIME_JPEG);

    const mainPath = path.win32.join(ACTIVITY_UPLOAD_DIR, mainFileName);
    const thumbPath = path.win32.join(ACTIVITY_UPLOAD_DIR, thumbFileName);

    fs.writeFileSync(mainPath, mainBuffer);
    fs.writeFileSync(thumbPath, thumbBuffer);

    return {
        imageUrl: `/uploads/activity/${mainFileName}`,
        thumbnailUrl: `/uploads/activity/${thumbFileName}`,
    };
};

// ─── Helper: เช็คว่า Category code มีอยู่จริงในตาราง master ไหม ───────────
const categoryExists = async (pool, code) => {
    const result = await pool.request()
        .input('CategoryCode', sql.VarChar, code)
        .query(`SELECT 1 FROM dbo.Activity_Categories WHERE CategoryCode = @CategoryCode AND IsActive = 1`);
    return result.recordset.length > 0;
};

// GET /api/activity-categories
export const getCategories = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT CategoryCode, Label, ColorHex, SortOrder
            FROM dbo.Activity_Categories
            WHERE IsActive = 1
            ORDER BY SortOrder ASC, Label ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Categories Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// POST /api/activity-categories  { CategoryCode, Label, ColorHex, SortOrder }
export const createCategory = async (req, res) => {
    const { CategoryCode, Label, ColorHex, SortOrder } = req.body;
    if (!CategoryCode || !Label) {
        return res.status(400).json({ error: 'CategoryCode และ Label จำเป็นต้องระบุ' });
    }
    try {
        const pool = getPool();
        await pool.request()
            .input('CategoryCode', sql.VarChar, CategoryCode)
            .input('Label', sql.NVarChar, Label)
            .input('ColorHex', sql.VarChar, ColorHex || '#64748B')
            .input('SortOrder', sql.Int, SortOrder || 0)
            .query(`
                INSERT INTO dbo.Activity_Categories (CategoryCode, Label, ColorHex, SortOrder)
                VALUES (@CategoryCode, @Label, @ColorHex, @SortOrder)
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('Create Category Error:', err);
        res.status(500).json({ error: err.message.includes('PRIMARY') ? 'มีหมวดนี้อยู่แล้ว' : 'Database error' });
    }
};

// PUT /api/activity-categories/:code  { Label, ColorHex, SortOrder }
export const updateCategory = async (req, res) => {
    const { code } = req.params;
    const { Label, ColorHex, SortOrder } = req.body;
    try {
        const pool = getPool();
        await pool.request()
            .input('CategoryCode', sql.VarChar, code)
            .input('Label', sql.NVarChar, Label)
            .input('ColorHex', sql.VarChar, ColorHex || '#64748B')
            .input('SortOrder', sql.Int, SortOrder || 0)
            .query(`
                UPDATE dbo.Activity_Categories
                SET Label = @Label, ColorHex = @ColorHex, SortOrder = @SortOrder
                WHERE CategoryCode = @CategoryCode
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('Update Category Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// DELETE /api/activity-categories/:code — ปิดใช้งาน (ไม่ลบจริง กันพังกับอัลบัมที่ใช้หมวดนี้อยู่)
export const deleteCategory = async (req, res) => {
    const { code } = req.params;
    try {
        const pool = getPool();
        const check = await pool.request()
            .input('CategoryCode', sql.VarChar, code)
            .query(`SELECT TOP 1 1 FROM dbo.Activity_Albums WHERE Category = @CategoryCode`);

        if (check.recordset.length > 0) {
            return res.status(400).json({ error: 'หมวดนี้มีอัลบัมใช้งานอยู่ ลบไม่ได้ (ปิดใช้งานแทนได้)' });
        }

        await pool.request()
            .input('CategoryCode', sql.VarChar, code)
            .query(`UPDATE dbo.Activity_Categories SET IsActive = 0 WHERE CategoryCode = @CategoryCode`);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete Category Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET /api/albums/hero — ลิสต์เล็กๆ สำหรับ Hero (ปักหมุดก่อน แล้วเรียงล่าสุด) ไม่ผูกกับ pagination/filter ของกริด
export const getHeroAlbums = async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT TOP 15 a.AlbumID, a.Title, a.Category, a.Description, a.CoverImageURL, a.EventDate, a.IsFeatured,
                   COUNT(p.PhotoID) AS PhotoCount
            FROM dbo.Activity_Albums a
            LEFT JOIN dbo.Activity_Photos p ON p.AlbumID = a.AlbumID AND p.Status = 'approved'
            WHERE a.IsPublished = 1
            GROUP BY a.AlbumID, a.Title, a.Category, a.Description, a.CoverImageURL, a.EventDate, a.IsFeatured
            ORDER BY a.IsFeatured DESC, a.EventDate DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Hero Albums Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET /api/albums?category=Network&search=xxx&page=1&pageSize=20
// คืน { albums, totalCount, totalPages, page, pageSize } — filter/pagination ทำที่ backend ทั้งหมด
export const getAlbums = async (req, res) => {
    const { category, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    try {
        const pool = getPool();
        const request = pool.request();
        request.input('Offset', sql.Int, offset);
        request.input('PageSize', sql.Int, pageSize);

        let where = `WHERE a.IsPublished = 1`;
        if (category && category !== 'all') {
            request.input('Category', sql.VarChar, category);
            where += ` AND a.Category = @Category`;
        }
        if (search && search.trim()) {
            request.input('Search', sql.NVarChar, `%${search.trim()}%`);
            where += ` AND a.Title LIKE @Search`;
        }

        const query = `
            SELECT a.AlbumID, a.Title, a.Category, a.Description, a.CoverImageURL, a.CoverThumbnailURL,
                   a.EventDate, a.IsFeatured, a.CreatedBy, a.CreatedAt,
                   c.Label AS CategoryLabel, c.ColorHex AS CategoryColor,
                   COUNT(p.PhotoID) AS PhotoCount,
                   COUNT(*) OVER() AS TotalCount
            FROM dbo.Activity_Albums a
            LEFT JOIN dbo.Activity_Categories c ON c.CategoryCode = a.Category
            LEFT JOIN dbo.Activity_Photos p ON p.AlbumID = a.AlbumID AND p.Status = 'approved'
            ${where}
            GROUP BY a.AlbumID, a.Title, a.Category, a.Description, a.CoverImageURL, a.CoverThumbnailURL,
                     a.EventDate, a.IsFeatured, a.CreatedBy, a.CreatedAt, c.Label, c.ColorHex
            ORDER BY a.EventDate DESC
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
        `;
        const result = await request.query(query);
        const totalCount = result.recordset.length > 0 ? result.recordset[0].TotalCount : 0;
        const albums = result.recordset.map(({ TotalCount, ...rest }) => rest);

        res.json({
            albums,
            totalCount,
            totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
            page,
            pageSize,
        });
    } catch (err) {
        console.error('Get Albums Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET /api/albums/:id/photos
export const getAlbumPhotos = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();
        const albumResult = await pool.request()
            .input('AlbumID', sql.Int, id)
            .query(`SELECT AlbumID, Title, Category, Description, EventDate, CreatedBy, CreatedAt, CoverImageURL FROM dbo.Activity_Albums WHERE AlbumID = @AlbumID`);

        if (albumResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Album not found' });
        }

        const photosResult = await pool.request()
            .input('AlbumID', sql.Int, id)
            .query(`
                SELECT PhotoID, ImageURL, ThumbnailURL, Caption, ProductID, UploadedBy, UploadedAt, Status
                FROM dbo.Activity_Photos
                WHERE AlbumID = @AlbumID AND Status = 'approved'
                ORDER BY UploadedAt ASC
            `);

        res.json({ album: albumResult.recordset[0], photos: photosResult.recordset });
    } catch (err) {
        console.error('Get Album Photos Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// PUT /api/albums/:id  { Title, Category, Description, EventDate, Role }
export const updateAlbum = async (req, res) => {
    const { id } = req.params;
    const { Title, Category, Description, EventDate, Role } = req.body;

    if (!isAdminRole(Role)) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูลอัลบัม' });
    }
    if (!Title || !Category || !EventDate) {
        return res.status(400).json({ error: 'Title, Category และ EventDate จำเป็นต้องระบุ' });
    }
    try {
        const pool = getPool();
        if (!(await categoryExists(pool, Category))) {
            return res.status(400).json({ error: 'หมวดหมู่ที่เลือกไม่มีอยู่ในระบบ' });
        }
        await pool.request()
            .input('AlbumID', sql.Int, id)
            .input('Title', sql.NVarChar, Title)
            .input('Category', sql.VarChar, Category)
            .input('Description', sql.NVarChar, Description || null)
            .input('EventDate', sql.Date, EventDate)
            .query(`
                UPDATE dbo.Activity_Albums
                SET Title = @Title, Category = @Category, Description = @Description, EventDate = @EventDate
                WHERE AlbumID = @AlbumID
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('Update Album Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// PATCH /api/albums/:id/feature   { featured: true | false }
// ปักหมุดได้ทีละอัลบัมเดียว — ห่อ transaction กันข้อมูลเพี้ยนถ้ามีคนกดพร้อมกัน
export const setFeaturedAlbum = async (req, res) => {
    const { id } = req.params;
    const { featured } = req.body;
    const pool = getPool();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        if (featured) {
            await new sql.Request(transaction).query(`UPDATE dbo.Activity_Albums SET IsFeatured = 0`);
            await new sql.Request(transaction)
                .input('AlbumID', sql.Int, id)
                .query(`UPDATE dbo.Activity_Albums SET IsFeatured = 1 WHERE AlbumID = @AlbumID`);
        } else {
            await new sql.Request(transaction)
                .input('AlbumID', sql.Int, id)
                .query(`UPDATE dbo.Activity_Albums SET IsFeatured = 0 WHERE AlbumID = @AlbumID`);
        }

        await transaction.commit();
        res.json({ success: true });
    } catch (err) {
        await transaction.rollback();
        console.error('Set Featured Album Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// POST /api/albums  { Title, Category, Description, EventDate, UserID }
export const createAlbum = async (req, res) => {
    const { Title, Category, Description, EventDate, UserID } = req.body;
    if (!Title || !Category || !EventDate) {
        return res.status(400).json({ error: 'Title, Category และ EventDate จำเป็นต้องระบุ' });
    }
    try {
        const pool = getPool();
        if (!(await categoryExists(pool, Category))) {
            return res.status(400).json({ error: 'หมวดหมู่ที่เลือกไม่มีอยู่ในระบบ' });
        }
        const result = await pool.request()
            .input('Title', sql.NVarChar, Title)
            .input('Category', sql.VarChar, Category)
            .input('Description', sql.NVarChar, Description || null)
            .input('EventDate', sql.Date, EventDate)
            .input('CreatedBy', sql.NVarChar, UserID)
            .query(`
                INSERT INTO dbo.Activity_Albums (Title, Category, Description, EventDate, CreatedBy)
                OUTPUT INSERTED.AlbumID
                VALUES (@Title, @Category, @Description, @EventDate, @CreatedBy)
            `);
        res.json({ success: true, AlbumID: result.recordset[0].AlbumID });
    } catch (err) {
        console.error('Create Album Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// POST /api/photos/upload  (multipart/form-data)
// resize เป็น main (max 1920px) + thumbnail (max 480px) ก่อนเซฟ ลดขนาดไฟล์และเวลาโหลดหน้ากริด
export const uploadActivityPhoto = async (req, res) => {
    if (!req.files || !req.files.imageFile) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const file = req.files.imageFile;

    // เช็คว่าเป็นไฟล์รูปจริง กันมีคนยิง request ตรงๆ อัปโหลดไฟล์ชนิดอื่นขึ้น network share
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'ไฟล์ที่อัปโหลดต้องเป็นรูปภาพเท่านั้น' });
    }

    const { AlbumID, Caption, ProductID, UserID } = req.body;
    if (!AlbumID || !UserID) {
        return res.status(400).json({ error: 'AlbumID และ UserID จำเป็นต้องระบุ' });
    }

    try {
        const { imageUrl, thumbnailUrl } = await saveResizedImage(file.data);

        const pool = getPool();
        const result = await pool.request()
            .input('AlbumID', sql.Int, AlbumID)
            .input('ImageURL', sql.NVarChar, imageUrl)
            .input('ThumbnailURL', sql.NVarChar, thumbnailUrl)
            .input('Caption', sql.NVarChar, Caption || null)
            .input('ProductID', sql.Int, ProductID || null)
            .input('UploadedBy', sql.NVarChar, UserID)
            .query(`
                INSERT INTO dbo.Activity_Photos (AlbumID, ImageURL, ThumbnailURL, Caption, ProductID, UploadedBy, Status)
                OUTPUT INSERTED.PhotoID
                VALUES (@AlbumID, @ImageURL, @ThumbnailURL, @Caption, @ProductID, @UploadedBy, 'approved')
            `);

        // ตั้งเป็น cover อัตโนมัติถ้าอัลบัมนี้ยังไม่มี cover (ใช้ทั้ง main และ thumbnail)
        await pool.request()
            .input('AlbumID', sql.Int, AlbumID)
            .input('ImageURL', sql.NVarChar, imageUrl)
            .input('ThumbnailURL', sql.NVarChar, thumbnailUrl)
            .query(`
                UPDATE dbo.Activity_Albums
                SET CoverImageURL = @ImageURL, CoverThumbnailURL = @ThumbnailURL
                WHERE AlbumID = @AlbumID AND CoverImageURL IS NULL
            `);

        res.json({ success: true, PhotoID: result.recordset[0].PhotoID });
    } catch (err) {
        console.error('Upload Activity Photo Error:', err);
        res.status(500).json({ error: 'อัปโหลด/ประมวลผลรูปไม่สำเร็จ: ' + err.message });
    }
};

// PATCH /api/albums/:id/cover  { PhotoID, Role } — เลือกรูปในอัลบัมมาตั้งเป็น cover เอง
export const setAlbumCover = async (req, res) => {
    const { id } = req.params;
    const { PhotoID, Role } = req.body;

    if (!isAdminRole(Role)) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์ตั้งค่าปกอัลบัม' });
    }
    try {
        const pool = getPool();
        const photoResult = await pool.request()
            .input('PhotoID', sql.Int, PhotoID)
            .input('AlbumID', sql.Int, id)
            .query(`SELECT ImageURL, ThumbnailURL FROM dbo.Activity_Photos WHERE PhotoID = @PhotoID AND AlbumID = @AlbumID`);

        if (photoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'ไม่พบรูปนี้ในอัลบัม' });
        }
        const { ImageURL, ThumbnailURL } = photoResult.recordset[0];

        await pool.request()
            .input('AlbumID', sql.Int, id)
            .input('CoverImageURL', sql.NVarChar, ImageURL)
            .input('CoverThumbnailURL', sql.NVarChar, ThumbnailURL)
            .query(`
                UPDATE dbo.Activity_Albums
                SET CoverImageURL = @CoverImageURL, CoverThumbnailURL = @CoverThumbnailURL
                WHERE AlbumID = @AlbumID
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('Set Album Cover Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// GET /api/albums/:id/export/zip — ดาวน์โหลดรูปทั้งหมดในอัลบัมเป็นไฟล์ zip (ไฟล์ต้นฉบับความละเอียดเต็ม)
export const exportAlbumZip = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();
        const albumRes = await pool.request()
            .input('AlbumID', sql.Int, id)
            .query(`SELECT Title FROM dbo.Activity_Albums WHERE AlbumID = @AlbumID`);
        if (albumRes.recordset.length === 0) {
            return res.status(404).json({ error: 'Album not found' });
        }
        const albumTitle = albumRes.recordset[0].Title;

        const photosRes = await pool.request()
            .input('AlbumID', sql.Int, id)
            .query(`SELECT ImageURL FROM dbo.Activity_Photos WHERE AlbumID = @AlbumID AND Status = 'approved' ORDER BY UploadedAt ASC`);

        if (photosRes.recordset.length === 0) {
            return res.status(400).json({ error: 'อัลบัมนี้ยังไม่มีรูปให้ดาวน์โหลด' });
        }

        const safeName = (albumTitle || 'album').replace(/[\\/:*?"<>|]/g, '').slice(0, 80);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.zip`);

        const archive = createZipArchive({ zlib: { level: 9 } });
        archive.on('warning', (warnErr) => {
            console.error('Archiver warning:', warnErr.message);
        });
        archive.on('error', (archiveErr) => {
            console.error('Archiver error:', archiveErr.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Export ZIP ไม่สำเร็จ: ' + archiveErr.message });
            } else {
                res.destroy();
            }
        });
        archive.pipe(res);

        photosRes.recordset.forEach((photo, idx) => {
            const fileName = photo.ImageURL.split('/').pop();
            const filePath = path.win32.join(ACTIVITY_UPLOAD_DIR, fileName);
            if (fs.existsSync(filePath)) {
                const ext = path.extname(fileName) || '.jpg';
                archive.file(filePath, { name: `${String(idx + 1).padStart(2, '0')}${ext}` });
            }
        });

        await archive.finalize();
    } catch (err) {
        console.error('Export ZIP Error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Export ZIP ไม่สำเร็จ' });
    }
};

// GET /api/albums/:id/export/pdf — สร้าง PDF สรุปอัลบัม (ชื่อ+วันที่+คำโปรย) พร้อมรูปทุกใบ+คำบรรยาย
export const exportAlbumPdf = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = getPool();
        const albumRes = await pool.request()
            .input('AlbumID', sql.Int, id)
            .query(`SELECT Title, Description, EventDate, Category FROM dbo.Activity_Albums WHERE AlbumID = @AlbumID`);
        if (albumRes.recordset.length === 0) {
            return res.status(404).json({ error: 'Album not found' });
        }
        const album = albumRes.recordset[0];

        const photosRes = await pool.request()
            .input('AlbumID', sql.Int, id)
            .query(`
                SELECT ImageURL, Caption, UploadedBy, UploadedAt FROM dbo.Activity_Photos
                WHERE AlbumID = @AlbumID AND Status = 'approved' ORDER BY UploadedAt ASC
            `);

        const safeName = (album.Title || 'album').replace(/[\\/:*?"<>|]/g, '').slice(0, 80);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.pdf`);

        const doc = new PDFDocument({ margin: 40 });
        doc.pipe(res);

        // ฝังฟอนต์ไทย (Sarabun) — ฟอนต์ default ของ pdfkit ไม่มีตัวอักษรไทย ทำให้ข้อความไทยเพี้ยน
        const fontDir = path.join(__dirname, '../../fonts');
        const regularFontPath = path.join(fontDir, 'Sarabun-Regular.ttf');
        const boldFontPath = path.join(fontDir, 'Sarabun-Bold.ttf');
        doc.registerFont('Thai', regularFontPath);
        doc.registerFont('Thai-Bold', boldFontPath);
        doc.font('Thai');

        doc.fontSize(20).font('Thai-Bold').fillColor('#111').text(album.Title);
        doc.moveDown(0.3);
        doc.fontSize(10).font('Thai').fillColor('#666')
            .text(`วันที่: ${new Date(album.EventDate).toLocaleDateString('th-TH')}   |   หมวด: ${album.Category}`);
        if (album.Description) {
            doc.moveDown(0.5);
            doc.fontSize(11).font('Thai').fillColor('#333').text(album.Description);
        }

        for (const photo of photosRes.recordset) {
            const fileName = photo.ImageURL.split('/').pop();
            const filePath = path.win32.join(ACTIVITY_UPLOAD_DIR, fileName);
            if (!fs.existsSync(filePath)) continue;

            doc.addPage();
            try {
                doc.image(filePath, { fit: [520, 620], align: 'center' });
            } catch (imgErr) {
                doc.fontSize(10).font('Thai').fillColor('red').text('(โหลดรูปนี้ไม่สำเร็จ)');
            }
            doc.moveDown(0.5);
            if (photo.Caption) doc.fontSize(11).font('Thai').fillColor('#111').text(photo.Caption);
            doc.fontSize(9).font('Thai').fillColor('#888')
                .text(`${photo.UploadedBy || ''}  ${photo.UploadedAt ? new Date(photo.UploadedAt).toLocaleString('th-TH') : ''}`);
        }

        doc.end();
    } catch (err) {
        console.error('Export PDF Error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Export PDF ไม่สำเร็จ' });
    }
};

// DELETE /api/albums/:id?role=Staff — soft delete: ซ่อนจากหน้าเว็บเฉยๆ ไม่ลบรูปในอัลบัม
export const deleteAlbum = async (req, res) => {
    const { id } = req.params;
    const role = req.query.role || req.body?.Role;

    if (!isAdminRole(role)) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบอัลบัม' });
    }
    try {
        const pool = getPool();
        await pool.request()
            .input('AlbumID', sql.Int, id)
            .query(`UPDATE dbo.Activity_Albums SET IsPublished = 0, IsFeatured = 0 WHERE AlbumID = @AlbumID`);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete Album Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// DELETE /api/photos/:id?role=Staff — ลบจริง ทั้งไฟล์ (main+thumbnail) บน network share และ record ในฐานข้อมูล
export const deleteActivityPhoto = async (req, res) => {
    const { id } = req.params;
    const role = req.query.role || req.body?.Role;

    if (!isAdminRole(role)) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบรูป' });
    }
    try {
        const pool = getPool();
        const photoResult = await pool.request()
            .input('PhotoID', sql.Int, id)
            .query(`SELECT AlbumID, ImageURL, ThumbnailURL FROM dbo.Activity_Photos WHERE PhotoID = @PhotoID`);

        if (photoResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Photo not found' });
        }
        const { AlbumID, ImageURL, ThumbnailURL } = photoResult.recordset[0];

        // ลบทั้งไฟล์ main และ thumbnail
        for (const url of [ImageURL, ThumbnailURL]) {
            if (!url) continue;
            const fileName = url.split('/').pop();
            const filePath = path.win32.join(ACTIVITY_UPLOAD_DIR, fileName);
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (fileErr) {
                console.error('Delete file from share failed (continuing):', fileErr.message);
            }
        }

        await pool.request()
            .input('PhotoID', sql.Int, id)
            .query(`DELETE FROM dbo.Activity_Photos WHERE PhotoID = @PhotoID`);

        // ถ้ารูปที่ลบคือ cover ของอัลบัม ต้องหารูปใหม่มาตั้งเป็น cover แทน
        const isCover = await pool.request()
            .input('AlbumID', sql.Int, AlbumID)
            .input('ImageURL', sql.NVarChar, ImageURL)
            .query(`SELECT 1 FROM dbo.Activity_Albums WHERE AlbumID = @AlbumID AND CoverImageURL = @ImageURL`);

        if (isCover.recordset.length > 0) {
            const nextPhoto = await pool.request()
                .input('AlbumID', sql.Int, AlbumID)
                .query(`
                    SELECT TOP 1 ImageURL, ThumbnailURL FROM dbo.Activity_Photos
                    WHERE AlbumID = @AlbumID AND Status = 'approved'
                    ORDER BY UploadedAt ASC
                `);
            const next = nextPhoto.recordset[0];
            await pool.request()
                .input('AlbumID', sql.Int, AlbumID)
                .input('CoverImageURL', sql.NVarChar, next?.ImageURL || null)
                .input('CoverThumbnailURL', sql.NVarChar, next?.ThumbnailURL || null)
                .query(`
                    UPDATE dbo.Activity_Albums
                    SET CoverImageURL = @CoverImageURL, CoverThumbnailURL = @CoverThumbnailURL
                    WHERE AlbumID = @AlbumID
                `);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Delete Activity Photo Error:', err);
        res.status(500).json({ error: 'Database error' });
    }
};