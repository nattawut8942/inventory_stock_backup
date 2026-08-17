import { sql, getPool } from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_UPLOAD_DIR = path.join(__dirname, '../../public/kb-pdfs');

// Create folder if not exists
if (!fs.existsSync(PDF_UPLOAD_DIR)) {
  fs.mkdirSync(PDF_UPLOAD_DIR, { recursive: true });
  console.log('[KB] Created directory:', PDF_UPLOAD_DIR);
}

const createSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
};

// ✅ ชื่อไฟล์เดิม + timestamp รองรับภาษาไทย
const createPdfFileName = (originalName) => {
  // Fix encoding: express-fileupload อาจส่งชื่อมาเป็น latin1 แทน utf-8
  let decodedName = originalName;
  try {
    // ลอง decode จาก latin1 → utf-8
    decodedName = Buffer.from(originalName, 'latin1').toString('utf8');
    // ถ้า decode แล้วยังอ่านไม่ได้ ใช้ของเดิม
    if (decodedName.includes('�')) decodedName = originalName;
  } catch {
    decodedName = originalName;
  }

  const ext = path.extname(decodedName) || '.pdf';
  const baseName = path.basename(decodedName, ext);
  const timestamp = Date.now();
  const safeName = baseName
    .replace(/\s+/g, '_')
    .replace(/[<>:"/\\|?*]/g, '');
  return `${safeName}_${timestamp}${ext}`;
};

// ================== PUBLIC ROUTES ==================

// GET: ดึงรายการบทความทั้งหมด
export const getArticles = async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT 
        a.ArticleID, a.Title, a.Slug, a.Content, 
        a.ProblemTypeID, pt.[name] as ProblemTypeName, pt.[icon],
        a.ViewCount, a.SubmittedBy, a.CreatedAt, a.UpdatedAt,
        a.PDFFileName, a.UpdatedBy
      FROM KB_Articles a
      LEFT JOIN [dbInfrastructure].[dbo].[ithd_problem_types] pt ON a.ProblemTypeID = pt.id
      ORDER BY a.CreatedAt DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Get Articles Error:', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
};

// GET: ค้นหาบทความ
export const searchArticles = async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length === 0) {
    return res.json([]);
  }

  try {
    const pool = getPool();
    const searchTerm = `%${q}%`;
    const result = await pool.request()
      .input('searchTerm', sql.NVarChar, searchTerm)
      .query(`
        SELECT 
          a.ArticleID, a.Title, a.Slug, a.ProblemTypeID, 
          pt.[name] as ProblemTypeName, a.ViewCount, a.SubmittedBy, a.CreatedAt
        FROM KB_Articles a
        LEFT JOIN [dbInfrastructure].[dbo].[ithd_problem_types] pt ON a.ProblemTypeID = pt.id
        WHERE a.Title LIKE @searchTerm
           OR a.Content LIKE @searchTerm
        ORDER BY a.CreatedAt DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Search Articles Error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
};

// GET: ดึงบทความตามประเภท
export const getArticlesByProblemType = async (req, res) => {
  const { problemTypeId } = req.params;
  
  try {
    const pool = getPool();
    const result = await pool.request()
      .input('problemTypeId', sql.Int, problemTypeId)
      .query(`
        SELECT 
          a.ArticleID, a.Title, a.Slug, a.Content, 
          a.ViewCount, a.SubmittedBy, a.CreatedAt
        FROM KB_Articles a
        WHERE a.ProblemTypeID = @problemTypeId
        ORDER BY a.CreatedAt DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Get Articles By Problem Type Error:', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
};

// GET: ดึงรายละเอียดบทความ + increment view count
export const getArticleDetail = async (req, res) => {
  const { slug } = req.params;
  
  try {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    
    await transaction.begin();
    
    // ดึงข้อมูลบทความ
    const result = await new sql.Request(transaction)
      .input('slug', sql.NVarChar, slug)
      .query(`
        SELECT 
          a.ArticleID, a.Title, a.Slug, a.Content, 
          a.ProblemTypeID, pt.[name] as ProblemTypeName, pt.[icon],
          a.ViewCount, a.SubmittedBy, a.CreatedAt, a.UpdatedAt,
          a.PDFFileName
        FROM KB_Articles a
        LEFT JOIN [dbInfrastructure].[dbo].[ithd_problem_types] pt ON a.ProblemTypeID = pt.id
        WHERE a.Slug = @slug
      `);
    
    if (result.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Article not found' });
    }
    
    const article = result.recordset[0];
    
    // +1 view count
    await new sql.Request(transaction)
      .input('articleId', sql.Int, article.ArticleID)
      .query(`
        UPDATE KB_Articles
        SET ViewCount = ViewCount + 1
        WHERE ArticleID = @articleId
      `);
    
    await transaction.commit();
    article.ViewCount += 1;
    
    // Generate PDF URL if exists
    if (article.PDFFileName) {
      article.PDFUrl = `/kb-pdfs/${article.PDFFileName}`;
    }
    
    res.json({
      success: true,
      article
    });
  } catch (err) {
    console.error('Get Article Detail Error:', err);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
};

// GET: ดึง problem types จาก existing table
export const getProblemTypes = async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT id, [name], [icon], is_active
      FROM [dbInfrastructure].[dbo].[ithd_problem_types]
      WHERE is_active = 1
      ORDER BY [name] ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Get Problem Types Error:', err);
    res.status(500).json({ error: 'Failed to fetch problem types' });
  }
};

// ================== USER SUBMISSION ==================

// POST: สร้างบทความใหม่
export const createArticle = async (req, res) => {
  try {
    // Debug: ตรวจสอบว่าข้อมูลมาถึงไหม
    console.log('[KB] req.body:', req.body);
    console.log('[KB] req.files:', req.files);
    console.log('[KB] req.headers:', req.headers);

    const { title, problemTypeId, content, submittedBy } = req.body || {};
    const pdfFile = req.files?.pdf;
    
    if (!title || !content) {
      console.log('[KB] Missing title or content');
      return res.status(400).json({ error: 'Title and content are required' });
    }
    
    try {
      const pool = getPool();
      const slug = createSlug(title);
      
      // Check slug duplicate
      const checkSlug = await pool.request()
        .input('slug', sql.NVarChar, slug)
        .query('SELECT ArticleID FROM KB_Articles WHERE Slug = @slug');
      
      if (checkSlug.recordset.length > 0) {
        return res.status(400).json({ error: 'Article title already exists' });
      }
      
      let pdfFileName = null;
      
      // Save PDF
      if (pdfFile) {
        const fileExtension = path.extname(pdfFile.name);
        pdfFileName = createPdfFileName(pdfFile.name);
        const pdfFullPath = path.join(PDF_UPLOAD_DIR, pdfFileName);
        
        try {
          await pdfFile.mv(pdfFullPath);
          console.log('[KB] PDF saved:', pdfFileName);
        } catch (fileErr) {
          console.error('[KB] PDF save error:', fileErr);
          return res.status(400).json({ error: 'Failed to upload PDF: ' + fileErr.message });
        }
      }
      
      // Insert into database
      const result = await pool.request()
        .input('title', sql.NVarChar, title)
        .input('slug', sql.NVarChar, slug)
        .input('problemTypeId', sql.Int, problemTypeId || null)
        .input('content', sql.NVarChar, content)
        .input('pdfFileName', sql.NVarChar, pdfFileName)
        .input('submittedBy', sql.NVarChar, submittedBy || 'anonymous')
        .query(`
          INSERT INTO KB_Articles (Title, Slug, ProblemTypeID, Content, PDFFileName, SubmittedBy)
          VALUES (@title, @slug, @problemTypeId, @content, @pdfFileName, @submittedBy);
          SELECT SCOPE_IDENTITY() AS ArticleID;
        `);
      
      const articleId = result.recordset[0].ArticleID;
      console.log('[KB] Article created:', articleId);
      
      res.json({
        success: true,
        message: 'Article created successfully',
        articleId: articleId,
        slug: slug
      });
    } catch (dbErr) {
      console.error('[KB] Database error:', dbErr);
      res.status(500).json({ error: 'Database error: ' + dbErr.message });
    }
  } catch (err) {
    console.error('[KB] Create Article Error:', err);
    res.status(500).json({ error: 'Failed to create article: ' + err.message });
  }
};

// PUT: แก้ไขบทความ
export const updateArticle = async (req, res) => {
  const { id } = req.params;
  const { title, problemTypeId, content, updatedBy } = req.body || {};
  const pdfFile = req.files?.pdf;
  
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }
  
  try {
    const pool = getPool();
    
    // Get existing article
    const checkResult = await pool.request()
      .input('articleId', sql.Int, id)
      .query('SELECT PDFFileName, Slug FROM KB_Articles WHERE ArticleID = @articleId');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    let pdfFileName = checkResult.recordset[0].PDFFileName;
    const oldSlug = checkResult.recordset[0].Slug;
    
    // Handle PDF update
    if (pdfFile) {
      if (pdfFileName) {
        const oldPdfPath = path.join(PDF_UPLOAD_DIR, pdfFileName);
        if (fs.existsSync(oldPdfPath)) {
          try {
            fs.unlinkSync(oldPdfPath);
            console.log('[KB] Old PDF deleted:', pdfFileName);
          } catch (err) {
            console.warn('[KB] Failed to delete old PDF:', err.message);
          }
        }
      }
      
      const fileExtension = path.extname(pdfFile.name);
      pdfFileName = createPdfFileName(pdfFile.name);
      const pdfFullPath = path.join(PDF_UPLOAD_DIR, pdfFileName);
      
      try {
        await pdfFile.mv(pdfFullPath);
        console.log('[KB] New PDF saved:', pdfFileName);
      } catch (fileErr) {
        console.error('[KB] PDF save error:', fileErr);
        return res.status(400).json({ error: 'Failed to upload PDF: ' + fileErr.message });
      }
    }
    
    // Update database
    await pool.request()
      .input('articleId', sql.Int, id)
      .input('title', sql.NVarChar, title)
      .input('problemTypeId', sql.Int, problemTypeId || null)
      .input('content', sql.NVarChar, content)
      .input('pdfFileName', sql.NVarChar, pdfFileName)
      .query(`
        UPDATE KB_Articles
        SET Title = @title,
            ProblemTypeID = @problemTypeId,
            Content = @content,
            PDFFileName = @pdfFileName,
            UpdatedAt = GETDATE()
        WHERE ArticleID = @articleId
      `);
    
    console.log('[KB] Article updated:', id);
    
    res.json({
      success: true,
      message: 'Article updated successfully'
    });
  } catch (err) {
    console.error('[KB] Update Article Error:', err);
    res.status(500).json({ error: 'Failed to update article: ' + err.message });
  }
};


// DELETE: ลบเฉพาะ PDF ไม่ลบบทความ
export const deletePdf = async (req, res) => {
  const { id } = req.params;

  try {
    const pool = getPool();

    // Get current PDF filename
    const result = await pool.request()
      .input('articleId', sql.Int, id)
      .query('SELECT PDFFileName FROM KB_Articles WHERE ArticleID = @articleId');

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const pdfFileName = result.recordset[0].PDFFileName;

    if (!pdfFileName) {
      return res.status(400).json({ error: 'No PDF attached to this article' });
    }

    // Delete physical file
    const pdfPath = path.join(PDF_UPLOAD_DIR, pdfFileName);
    if (fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
        console.log('[KB] PDF deleted:', pdfFileName);
      } catch (err) {
        console.warn('[KB] Failed to delete PDF file:', err.message);
      }
    }

    // Clear PDFFileName in DB
    await pool.request()
      .input('articleId', sql.Int, id)
      .query(`
        UPDATE KB_Articles
        SET PDFFileName = NULL,
            UpdatedAt = GETDATE()
        WHERE ArticleID = @articleId
      `);

    res.json({ success: true, message: 'PDF deleted successfully' });
  } catch (err) {
    console.error('[KB] Delete PDF Error:', err);
    res.status(500).json({ error: 'Failed to delete PDF' });
  }
};

// DELETE: ลบบทความ
export const deleteArticle = async (req, res) => {
  const { id } = req.params;
  
  try {
    const pool = getPool();
    
    // Get PDF filename
    const result = await pool.request()
      .input('articleId', sql.Int, id)
      .query('SELECT PDFFileName FROM KB_Articles WHERE ArticleID = @articleId');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    const pdfFileName = result.recordset[0].PDFFileName;
    
    // Delete PDF file
    if (pdfFileName) {
      const pdfPath = path.join(PDF_UPLOAD_DIR, pdfFileName);
      if (fs.existsSync(pdfPath)) {
        try {
          fs.unlinkSync(pdfPath);
          console.log('[KB] PDF deleted:', pdfFileName);
        } catch (err) {
          console.warn('[KB] Failed to delete PDF file:', err.message);
        }
      }
    }
    
    // Delete article
    await pool.request()
      .input('articleId', sql.Int, id)
      .query('DELETE FROM KB_Articles WHERE ArticleID = @articleId');
    
    console.log('[KB] Article deleted:', id);
    
    res.json({ success: true, message: 'Article deleted successfully' });
  } catch (err) {
    console.error('[KB] Delete Article Error:', err);
    res.status(500).json({ error: 'Failed to delete article: ' + err.message });
  }
};