import sql from 'mssql';
import { getPool } from '../config/db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for file uploads - USE SAME FOLDER AS productController
const uploadDir = path.join(process.cwd(), 'uploads', 'factory-layouts');

// Create directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1E6);
        const ext = path.extname(file.originalname);
        cb(null, `layout-${timestamp}-${random}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP are allowed.'), false);
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Get all factory layouts
export const getFactoryLayouts = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool
            .request()
            .query('SELECT id, name, image_url, width, height, created_at, updated_at FROM dbo.factory_layouts ORDER BY id DESC');

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('❌ GET /factory-layouts error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Create factory layout with file upload
export const createFactoryLayout = async (req, res) => {
    try {
        const { name, width, height } = req.body;

        if (!name || !req.file) {
            return res.status(400).json({ success: false, error: 'Name and image file are required' });
        }

        const image_url = `/uploads/factory-layouts/${req.file.filename}`;
        const parsedWidth = parseInt(width) || 1920;
        const parsedHeight = parseInt(height) || 1080;

        const pool = await getPool();
        const result = await pool
            .request()
            .input('name', sql.NVarChar(255), name)
            .input('image_url', sql.NVarChar(sql.MAX), image_url)
            .input('width', sql.Int, parsedWidth)
            .input('height', sql.Int, parsedHeight)
            .query(`
                INSERT INTO dbo.factory_layouts (name, image_url, width, height, created_at, updated_at)
                VALUES (@name, @image_url, @width, @height, GETDATE(), GETDATE());
                SELECT SCOPE_IDENTITY() as id;
            `);

        const id = result.recordset[0].id;
        res.json({
            success: true,
            data: { id, name, image_url, width: parsedWidth, height: parsedHeight }
        });
    } catch (err) {
        if (req.file) {
            fs.unlink(req.file.path, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting file:', unlinkErr);
            });
        }
        console.error('❌ POST /factory-layouts error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Update factory layout (with optional file upload)
export const updateFactoryLayout = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, width, height } = req.body;

        const pool = await getPool();

        const existing = await pool
            .request()
            .input('id', sql.Int, id)
            .query('SELECT image_url FROM dbo.factory_layouts WHERE id = @id');

        if (existing.recordset.length === 0) {
            if (req.file) {
                fs.unlink(req.file.path, () => { });
            }
            return res.status(404).json({ success: false, error: 'Layout not found' });
        }

        let image_url = existing.recordset[0].image_url;

        if (req.file) {
            const oldFile = path.join(process.cwd(), image_url);
            if (fs.existsSync(oldFile)) {
                fs.unlink(oldFile, (err) => {
                    if (err) console.error('Error deleting old file:', err);
                });
            }
            image_url = `/uploads/factory-layouts/${req.file.filename}`;
        }

        const parsedWidth = parseInt(width) || 1920;
        const parsedHeight = parseInt(height) || 1080;

        await pool
            .request()
            .input('id', sql.Int, id)
            .input('name', sql.NVarChar(255), name)
            .input('image_url', sql.NVarChar(sql.MAX), image_url)
            .input('width', sql.Int, parsedWidth)
            .input('height', sql.Int, parsedHeight)
            .query(`
                UPDATE dbo.factory_layouts 
                SET name = @name, image_url = @image_url, width = @width, height = @height, updated_at = GETDATE()
                WHERE id = @id
            `);

        res.json({
            success: true,
            data: { id: parseInt(id), name, image_url, width: parsedWidth, height: parsedHeight }
        });
    } catch (err) {
        if (req.file) {
            fs.unlink(req.file.path, () => { });
        }
        console.error('❌ PUT /factory-layouts error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Delete factory layout
export const deleteFactoryLayout = async (req, res) => {
    try {
        const { id } = req.params;

        const pool = await getPool();

        const result = await pool
            .request()
            .input('id', sql.Int, id)
            .query('SELECT image_url FROM dbo.factory_layouts WHERE id = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Layout not found' });
        }

        const image_url = result.recordset[0].image_url;

        const filePath = path.join(process.cwd(), image_url);
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }

        await pool
            .request()
            .input('id', sql.Int, id)
            .query('DELETE FROM dbo.factory_layouts WHERE id = @id');

        res.json({ success: true, message: 'Layout deleted successfully' });
    } catch (err) {
        console.error('❌ DELETE /factory-layouts error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// PC Location Functions
export const getPCLocation = async (req, res) => {
    try {
        const { hostname } = req.params;
        const pool = await getPool();

        const result = await pool
            .request()
            .input('hostname', sql.NVarChar(255), hostname)
            .query(`
                SELECT 
                    p.hostname, 
                    p.factory_layout_id, 
                    p.location_x, 
                    p.location_y, 
                    p.location_updated_at,
                    l.image_url,
                    l.name as layout_name
                FROM dbo.info_pc_inventory p
                LEFT JOIN dbo.factory_layouts l ON p.factory_layout_id = l.id
                WHERE p.hostname = @hostname
            `);

        if (result.recordset.length === 0) {
            return res.json({ success: true, data: null });
        }
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        console.error('❌ GET /pc-location error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updatePCLocation = async (req, res) => {
    try {
        const { hostname } = req.params;
        const { factory_layout_id, location_x, location_y } = req.body;

        const pool = await getPool();

        await pool
            .request()
            .input('hostname', sql.NVarChar(255), hostname)
            .input('factory_layout_id', sql.Int, factory_layout_id || null)
            .input('location_x', sql.Float, location_x || null)
            .input('location_y', sql.Float, location_y || null)
            .query(`
                UPDATE dbo.info_pc_inventory 
                SET factory_layout_id = @factory_layout_id, 
                    location_x = @location_x, 
                    location_y = @location_y,
                    location_updated_at = GETDATE()
                WHERE hostname = @hostname
            `);

        res.json({ success: true, message: 'Location updated successfully' });
    } catch (err) {
        console.error('❌ PUT /pc-location error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const clearPCLocation = async (req, res) => {
    try {
        const { hostname } = req.params;
        const pool = await getPool();

        await pool
            .request()
            .input('hostname', sql.NVarChar(255), hostname)
            .query(`
                UPDATE dbo.info_pc_inventory 
                SET factory_layout_id = NULL, location_x = NULL, location_y = NULL, location_updated_at = NULL
                WHERE hostname = @hostname
            `);

        res.json({ success: true, message: 'Location cleared successfully' });
    } catch (err) {
        console.error('❌ DELETE /pc-location error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getPCsByLayout = async (req, res) => {
    try {
        const { layout_id } = req.params;
        const pool = await getPool();
        
        const result = await pool
            .request()
            .input('layout_id', sql.Int, layout_id)
            .query(`
                SELECT 
                    i.hostname, 
                    i.location_x, 
                    i.location_y, 
                    i.fix_asset,
                    i.computer_type,
                    ISNULL(STRING_AGG(au.[username], ', ') WITHIN GROUP (ORDER BY au.[logon_time] DESC), '') AS username
                FROM dbo.info_pc_inventory i
                LEFT JOIN dbo.info_pc_active_users au ON i.hostname = au.hostname
                WHERE i.factory_layout_id = @layout_id 
                  AND i.location_x IS NOT NULL 
                  AND i.location_y IS NOT NULL
                GROUP BY 
                    i.hostname, i.location_x, i.location_y, i.fix_asset, i.computer_type
                ORDER BY i.hostname
            `);

        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('❌ GET /pc-layout error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};