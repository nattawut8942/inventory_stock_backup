import sql from 'mssql';
import { getPool } from '../config/db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import net from 'net';

// ─── Upload (icon กล้อง / rack / switch) ───────────────────────────────────
const uploadDir = path.join(process.cwd(), 'uploads', 'cctv-icons');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ts  = Date.now();
        const rnd = Math.round(Math.random() * 1e6);
        cb(null, `cctv-${ts}-${rnd}${path.extname(file.originalname)}`);
    }
});
const fileFilter = (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml'];
    ok.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type'), false);
};
export const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

// ─── Helper: ping via TCP port 80 (ไม่ต้อง root) ──────────────────────────
const pingCamera = (ip, timeout = 2000) =>
    new Promise(resolve => {
        const s = new net.Socket();
        s.setTimeout(timeout);
        s.on('connect', () => { s.destroy(); resolve(true); });
        s.on('timeout', () => { s.destroy(); resolve(false); });
        s.on('error',   () => resolve(false));
        s.connect(80, ip);
    });

// ══════════════════════════════════════════════════════════════════════════
//  RACK
// ══════════════════════════════════════════════════════════════════════════

export const getRacks = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT r.*,
                   fl.name AS layout_name,
                   (SELECT COUNT(*) FROM dbo.cctv_cameras c WHERE c.rack_id = r.id) AS camera_count
            FROM dbo.cctv_racks r
            LEFT JOIN dbo.factory_layouts fl ON r.factory_layout_id = fl.id
            ORDER BY r.id
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('GET /cctv/racks', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getRacksByLayout = async (req, res) => {
    try {
        const { layout_id } = req.params;
        const pool = await getPool();
        const result = await pool.request()
            .input('layout_id', sql.Int, layout_id)
            .query(`
                SELECT r.*,
                       (SELECT COUNT(*) FROM dbo.cctv_cameras c WHERE c.rack_id = r.id) AS camera_count
                FROM dbo.cctv_racks r
                WHERE r.factory_layout_id = @layout_id
                ORDER BY r.name
            `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const createRack = async (req, res) => {
    try {
        const { name, factory_layout_id, location_x, location_y, remark, rack_type } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'name is required' });
        const icon_url = req.file ? `/uploads/cctv-icons/${req.file.filename}` : null;
        const pool = await getPool();
        const result = await pool.request()
            .input('name',              sql.NVarChar(100),    name)
            .input('factory_layout_id', sql.Int,              factory_layout_id || null)
            .input('location_x',        sql.Float,            location_x  ?? null)
            .input('location_y',        sql.Float,            location_y  ?? null)
            .input('icon_url',          sql.NVarChar(sql.MAX),icon_url)
            .input('remark',            sql.NVarChar(500),    remark || null)
            .input('rack_type',         sql.NVarChar(20),     rack_type || 'access')
            .query(`
                INSERT INTO dbo.cctv_racks (name, factory_layout_id, location_x, location_y, icon_url, remark, rack_type)
                VALUES (@name, @factory_layout_id, @location_x, @location_y, @icon_url, @remark, @rack_type);
                SELECT SCOPE_IDENTITY() AS id;
            `);
        res.json({ success: true, data: { id: result.recordset[0].id, name, icon_url } });
    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateRack = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, factory_layout_id, location_x, location_y, remark, rack_type } = req.body;
        const pool = await getPool();

        const existing = await pool.request().input('id', sql.Int, id)
            .query('SELECT icon_url, factory_layout_id FROM dbo.cctv_racks WHERE id = @id');
        if (!existing.recordset.length) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(404).json({ success: false, error: 'Rack not found' });
        }

        let icon_url = existing.recordset[0].icon_url;
        if (req.file) {
            if (icon_url) { const old = path.join(process.cwd(), icon_url); if (fs.existsSync(old)) fs.unlink(old, () => {}); }
            icon_url = `/uploads/cctv-icons/${req.file.filename}`;
        }

        const isClear = (location_x === null || location_x === undefined) &&
                        (location_y === null || location_y === undefined);

        if (isClear) {
            // ล้างแค่ตำแหน่ง — ไม่แตะ factory_layout_id
            await pool.request()
                .input('id',       sql.Int,           id)
                .input('name',     sql.NVarChar(100),  name || existing.recordset[0].name)
                .input('remark',   sql.NVarChar(500),  remark || null)
                .input('rack_type',sql.NVarChar(20),   rack_type || 'access')
                .input('icon_url', sql.NVarChar(sql.MAX), icon_url)
                .query(`
                    UPDATE dbo.cctv_racks
                    SET name=@name, location_x=NULL, location_y=NULL,
                        remark=@remark, rack_type=@rack_type, icon_url=@icon_url,
                        updated_at=GETDATE()
                    WHERE id = @id
                `);
        } else {
            // update ทุก field รวมถึง factory_layout_id
            await pool.request()
                .input('id',               sql.Int,              id)
                .input('name',             sql.NVarChar(100),    name)
                .input('factory_layout_id',sql.Int,              factory_layout_id || null)
                .input('location_x',       sql.Float,            location_x  ?? null)
                .input('location_y',       sql.Float,            location_y  ?? null)
                .input('icon_url',         sql.NVarChar(sql.MAX),icon_url)
                .input('remark',           sql.NVarChar(500),    remark || null)
                .input('rack_type',        sql.NVarChar(20),     rack_type || 'access')
                .query(`
                    UPDATE dbo.cctv_racks
                    SET name=@name, factory_layout_id=@factory_layout_id,
                        location_x=@location_x, location_y=@location_y,
                        icon_url=@icon_url, remark=@remark, rack_type=@rack_type,
                        updated_at=GETDATE()
                    WHERE id = @id
                `);
        }

        res.json({ success: true, data: { id: +id, name, icon_url } });
    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteRack = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id)
            .query('SELECT icon_url FROM dbo.cctv_racks WHERE id = @id');
        if (!r.recordset.length) return res.status(404).json({ success: false, error: 'Not found' });

        const { icon_url } = r.recordset[0];
        if (icon_url) { const f = path.join(process.cwd(), icon_url); if (fs.existsSync(f)) fs.unlink(f, () => {}); }

        await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.cctv_racks WHERE id = @id');
        res.json({ success: true, message: 'Rack deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════
//  SWITCH
// ══════════════════════════════════════════════════════════════════════════

export const getSwitches = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT s.*, r.name AS rack_name
            FROM dbo.cctv_switches s
            LEFT JOIN dbo.cctv_racks r ON s.rack_id = r.id
            ORDER BY s.rack_id, s.name
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getSwitchesByRack = async (req, res) => {
    try {
        const { rack_id } = req.params;
        const pool = await getPool();
        const result = await pool.request()
            .input('rack_id', sql.Int, rack_id)
            .query('SELECT * FROM dbo.cctv_switches WHERE rack_id = @rack_id ORDER BY name');
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const createSwitch = async (req, res) => {
    try {
        const { name, ip_address, rack_id, remark } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'name is required' });

        const icon_url = req.file ? `/uploads/cctv-icons/${req.file.filename}` : null;
        const pool = await getPool();
        const result = await pool.request()
            .input('name',       sql.NVarChar(100), name)
            .input('ip_address', sql.NVarChar(50),  ip_address || null)
            .input('rack_id',    sql.Int,            rack_id    || null)
            .input('icon_url',   sql.NVarChar(sql.MAX), icon_url)
            .input('remark',     sql.NVarChar(500),  remark     || null)
            .query(`
                INSERT INTO dbo.cctv_switches (name, ip_address, rack_id, icon_url, remark)
                VALUES (@name, @ip_address, @rack_id, @icon_url, @remark);
                SELECT SCOPE_IDENTITY() AS id;
            `);
        res.json({ success: true, data: { id: result.recordset[0].id, name, icon_url } });
    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateSwitch = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, ip_address, rack_id, remark } = req.body;
        const pool = await getPool();

        const existing = await pool.request().input('id', sql.Int, id)
            .query('SELECT icon_url FROM dbo.cctv_switches WHERE id = @id');
        if (!existing.recordset.length) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(404).json({ success: false, error: 'Switch not found' });
        }

        let icon_url = existing.recordset[0].icon_url;
        if (req.file) {
            if (icon_url) { const old = path.join(process.cwd(), icon_url); if (fs.existsSync(old)) fs.unlink(old, () => {}); }
            icon_url = `/uploads/cctv-icons/${req.file.filename}`;
        }

        await pool.request()
            .input('id',         sql.Int,            id)
            .input('name',       sql.NVarChar(100),  name)
            .input('ip_address', sql.NVarChar(50),   ip_address || null)
            .input('rack_id',    sql.Int,             rack_id    || null)
            .input('icon_url',   sql.NVarChar(sql.MAX), icon_url)
            .input('remark',     sql.NVarChar(500),   remark     || null)
            .query(`
                UPDATE dbo.cctv_switches
                SET name=@name, ip_address=@ip_address, rack_id=@rack_id,
                    icon_url=@icon_url, remark=@remark, updated_at=GETDATE()
                WHERE id = @id
            `);
        res.json({ success: true, data: { id: +id, name, icon_url } });
    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteSwitch = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id)
            .query('SELECT icon_url FROM dbo.cctv_switches WHERE id = @id');
        if (!r.recordset.length) return res.status(404).json({ success: false, error: 'Not found' });

        const { icon_url } = r.recordset[0];
        if (icon_url) { const f = path.join(process.cwd(), icon_url); if (fs.existsSync(f)) fs.unlink(f, () => {}); }

        await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.cctv_switches WHERE id = @id');
        res.json({ success: true, message: 'Switch deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════
//  CAMERA
// ══════════════════════════════════════════════════════════════════════════

export const getCameras = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                c.id,
                c.name,
                c.ip_address,
                c.model,
                c.fix_asset,
                c.remark,
                c.factory_layout_id,
                c.location_x,
                c.location_y,
                c.rack_id,
                c.switch_id,
                c.icon_url,
                c.icon_type,
                c.snapshot_url,
                c.status,
                c.last_ping,
                c.updated_by,
                c.created_at,
                c.updated_at,
                c.fov_direction,
                c.fov_spread,
                fl.name      AS layout_name,
                fl.image_url AS layout_image_url,
                r.name       AS rack_name,
                r.location_x AS rack_location_x,
                r.location_y AS rack_location_y,
                r.icon_url   AS rack_icon_url,
                sw.name      AS switch_name,
                sw.ip_address AS switch_ip
            FROM dbo.cctv_cameras c
            LEFT JOIN dbo.factory_layouts fl ON c.factory_layout_id = fl.id
            LEFT JOIN dbo.cctv_racks       r  ON c.rack_id           = r.id
            LEFT JOIN dbo.cctv_switches    sw ON c.switch_id          = sw.id
            ORDER BY c.factory_layout_id, c.name
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getCamerasByLayout = async (req, res) => {
    try {
        const { layout_id } = req.params;
        const pool = await getPool();
        const result = await pool.request()
            .input('layout_id', sql.Int, layout_id)
            .query(`
                SELECT
                    c.id,
                    c.name,
                    c.ip_address,
                    c.model,
                    c.fix_asset,
                    c.remark,
                    c.factory_layout_id,
                    c.location_x,
                    c.location_y,
                    c.rack_id,
                    c.switch_id,
                    c.icon_url,
                    c.icon_type,
                    c.snapshot_url,
                    c.last_ping,
                    c.updated_by,
                    c.fov_direction,
                    c.fov_spread,
                    r.name       AS rack_name,
                    r.location_x AS rack_location_x,
                    r.location_y AS rack_location_y,
                    r.icon_url   AS rack_icon_url,
                    sw.name      AS switch_name,
                    sw.ip_address AS switch_ip
                FROM dbo.cctv_cameras c
                LEFT JOIN dbo.cctv_racks    r  ON c.rack_id    = r.id
                LEFT JOIN dbo.cctv_switches sw ON c.switch_id  = sw.id
                WHERE c.factory_layout_id = @layout_id
                ORDER BY
                    CASE WHEN c.location_x IS NULL THEN 1 ELSE 0 END,
                    c.name
            `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const createCamera = async (req, res) => {
    try {
        const {
            name, ip_address, model, fix_asset, remark,
            factory_layout_id, location_x, location_y,
            rack_id, switch_id, path_points, updated_by, icon_type
        } = req.body;

        if (!name) return res.status(400).json({ success: false, error: 'name is required' });

        const icon_url     = req.files?.icon?.[0]     ? `/uploads/cctv-icons/${req.files.icon[0].filename}`     : null;
        const snapshot_url = req.files?.snapshot?.[0] ? `/uploads/cctv-icons/${req.files.snapshot[0].filename}` : null;
        const pool = await getPool();
        const result = await pool.request()
            .input('name',              sql.NVarChar(100),     name)
            .input('ip_address',        sql.NVarChar(50),      ip_address        || null)
            .input('model',             sql.NVarChar(100),     model             || null)
            .input('fix_asset',         sql.NVarChar(100),     fix_asset         || null)
            .input('remark',            sql.NVarChar(500),     remark            || null)
            .input('factory_layout_id', sql.Int,               factory_layout_id || null)
            .input('location_x',        sql.Float,             location_x        ?? null)
            .input('location_y',        sql.Float,             location_y        ?? null)
            .input('rack_id',           sql.Int,               rack_id           || null)
            .input('switch_id',         sql.Int,               switch_id         || null)
            .input('path_points',       sql.NVarChar(sql.MAX), path_points       || null)
            .input('icon_url',          sql.NVarChar(sql.MAX), icon_url)
            .input('icon_type',         sql.NVarChar(20),      icon_type         || 'bullet')
            .input('updated_by',        sql.NVarChar(100),     updated_by        || null)
            .input('snapshot_url',      sql.NVarChar(sql.MAX), snapshot_url)
            .query(`
                INSERT INTO dbo.cctv_cameras
                    (name, ip_address, model, fix_asset, remark,
                     factory_layout_id, location_x, location_y,
                     rack_id, switch_id, path_points, icon_url, icon_type, updated_by, snapshot_url)
                VALUES
                    (@name, @ip_address, @model, @fix_asset, @remark,
                     @factory_layout_id, @location_x, @location_y,
                     @rack_id, @switch_id, @path_points, @icon_url, @icon_type, @updated_by, @snapshot_url);
                SELECT SCOPE_IDENTITY() AS id;
            `);
        res.json({ success: true, data: { id: result.recordset[0].id, name, icon_url } });
    } catch (err) {
        if (req.files?.icon?.[0])     fs.unlink(req.files.icon[0].path, () => {});
        if (req.files?.snapshot?.[0]) fs.unlink(req.files.snapshot[0].path, () => {});
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateCamera = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, ip_address, model, fix_asset, remark,
            factory_layout_id, location_x, location_y,
            rack_id, switch_id, path_points, updated_by, icon_type
        } = req.body;

        const pool = await getPool();

        // ดึงค่าเดิมทั้งหมด — icon_url, snapshot_url, location, factory_layout_id
        const existing = await pool.request().input('id', sql.Int, id)
            .query(`
                SELECT icon_url, snapshot_url, location_x, location_y,
                       factory_layout_id, path_points
                FROM dbo.cctv_cameras WHERE id = @id
            `);
        if (!existing.recordset.length) {
            if (req.files?.icon?.[0])     fs.unlink(req.files.icon[0].path, () => {});
            if (req.files?.snapshot?.[0]) fs.unlink(req.files.snapshot[0].path, () => {});
            return res.status(404).json({ success: false, error: 'Camera not found' });
        }

        const prev = existing.recordset[0];

        // icon
        let icon_url = prev.icon_url;
        if (req.files?.icon?.[0]) {
            if (icon_url) { const old = path.join(process.cwd(), icon_url); if (fs.existsSync(old)) fs.unlink(old, () => {}); }
            icon_url = `/uploads/cctv-icons/${req.files.icon[0].filename}`;
        }

        // snapshot
        let snapshot_url = prev.snapshot_url;
        if (req.files?.snapshot?.[0]) {
            if (snapshot_url) { const old = path.join(process.cwd(), snapshot_url); if (fs.existsSync(old)) fs.unlink(old, () => {}); }
            snapshot_url = `/uploads/cctv-icons/${req.files.snapshot[0].filename}`;
        }

        // location: ถ้า form ไม่ได้ส่งมา (undefined) ให้ใช้ค่าเดิม — ป้องกัน reset
        const finalLocationX        = (location_x        !== undefined && location_x        !== '') ? parseFloat(location_x)        : prev.location_x;
        const finalLocationY        = (location_y        !== undefined && location_y        !== '') ? parseFloat(location_y)        : prev.location_y;
        const finalFactoryLayoutId  = (factory_layout_id !== undefined && factory_layout_id !== '') ? parseInt(factory_layout_id)   : prev.factory_layout_id;
        const finalPathPoints       = (path_points       !== undefined                             ) ? path_points                  : prev.path_points;

        await pool.request()
            .input('id',               sql.Int,               id)
            .input('name',             sql.NVarChar(100),     name)
            .input('ip_address',       sql.NVarChar(50),      ip_address        || null)
            .input('model',            sql.NVarChar(100),     model             || null)
            .input('fix_asset',        sql.NVarChar(100),     fix_asset         || null)
            .input('remark',           sql.NVarChar(500),     remark            || null)
            .input('factory_layout_id',sql.Int,               finalFactoryLayoutId  ?? null)
            .input('location_x',       sql.Float,             finalLocationX        ?? null)
            .input('location_y',       sql.Float,             finalLocationY        ?? null)
            .input('rack_id',          sql.Int,               rack_id           || null)
            .input('switch_id',        sql.Int,               switch_id         || null)
            .input('path_points',      sql.NVarChar(sql.MAX), finalPathPoints   || null)
            .input('icon_url',         sql.NVarChar(sql.MAX), icon_url)
            .input('icon_type',        sql.NVarChar(20),      icon_type         || 'bullet')
            .input('updated_by',       sql.NVarChar(100),     updated_by        || null)
            .input('snapshot_url',     sql.NVarChar(sql.MAX), snapshot_url)
            .query(`
                UPDATE dbo.cctv_cameras
                SET name=@name, ip_address=@ip_address, model=@model,
                    fix_asset=@fix_asset, remark=@remark,
                    factory_layout_id=@factory_layout_id,
                    location_x=@location_x, location_y=@location_y,
                    rack_id=@rack_id, switch_id=@switch_id,
                    path_points=@path_points, icon_url=@icon_url,
                    icon_type=@icon_type, snapshot_url=@snapshot_url,
                    updated_by=@updated_by, updated_at=GETDATE()
                WHERE id = @id
            `);
        res.json({ success: true, data: { id: +id, name, icon_url } });
    } catch (err) {
        if (req.files?.icon?.[0])     fs.unlink(req.files.icon[0].path, () => {});
        if (req.files?.snapshot?.[0]) fs.unlink(req.files.snapshot[0].path, () => {});
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateCameraLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { factory_layout_id, location_x, location_y, fov_direction, fov_spread } = req.body;
        const pool = await getPool();

        const isClear = (location_x === null || location_x === undefined) &&
                        (location_y === null || location_y === undefined);

        if (isClear) {
            // ล้างแค่ตำแหน่ง — ไม่แตะ factory_layout_id ป้องกันกล้องหายจาก list
            await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    UPDATE dbo.cctv_cameras
                    SET location_x = NULL, location_y = NULL,
                        updated_at = GETDATE()
                    WHERE id = @id
                `);
        } else {
            await pool.request()
                .input('id',               sql.Int,         id)
                .input('factory_layout_id',sql.Int,         factory_layout_id || null)
                .input('location_x',       sql.Float,       parseFloat(location_x))
                .input('location_y',       sql.Float,       parseFloat(location_y))
                .input('fov_direction',    sql.NVarChar(20), fov_direction || null)
                .input('fov_spread',       sql.Int,          parseInt(fov_spread) || 60)
                .query(`
                    UPDATE dbo.cctv_cameras
                    SET factory_layout_id = @factory_layout_id,
                        location_x        = @location_x,
                        location_y        = @location_y,
                        fov_direction     = @fov_direction,
                        fov_spread        = @fov_spread,
                        updated_at        = GETDATE()
                    WHERE id = @id
                `);
        }

        res.json({ success: true, message: 'Location updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteCamera = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id)
            .query('SELECT icon_url FROM dbo.cctv_cameras WHERE id = @id');
        if (!r.recordset.length) return res.status(404).json({ success: false, error: 'Not found' });

        const { icon_url } = r.recordset[0];
        if (icon_url) { const f = path.join(process.cwd(), icon_url); if (fs.existsSync(f)) fs.unlink(f, () => {}); }

        await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.cctv_cameras WHERE id = @id');
        res.json({ success: true, message: 'Camera deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── Ping single camera ────────────────────────────────────────────────────
export const pingCameraById = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id)
            .query('SELECT ip_address FROM dbo.cctv_cameras WHERE id = @id');
        if (!r.recordset.length) return res.status(404).json({ success: false, error: 'Not found' });

        const { ip_address } = r.recordset[0];
        if (!ip_address) return res.json({ success: true, status: 'unknown' });

        const alive  = await pingCamera(ip_address);
        const status = alive ? 'online' : 'offline';

        await pool.request()
            .input('id',     sql.Int,        id)
            .input('status', sql.NVarChar(20), status)
            .query('UPDATE dbo.cctv_cameras SET status=@status, last_ping=GETDATE() WHERE id=@id');

        res.json({ success: true, status, ip_address });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── Ping ทุกกล้องพร้อมกัน (เรียกจาก cron หรือ manual) ───────────────────
export const pingAllCameras = async (req, res) => {
    try {
        const pool = await getPool();
        const cameras = await pool.request()
            .query('SELECT id, ip_address FROM dbo.cctv_cameras WHERE ip_address IS NOT NULL');

        const results = await Promise.all(
            cameras.recordset.map(async cam => {
                const alive  = await pingCamera(cam.ip_address);
                const status = alive ? 'online' : 'offline';
                await pool.request()
                    .input('id',     sql.Int,         cam.id)
                    .input('status', sql.NVarChar(20), status)
                    .query('UPDATE dbo.cctv_cameras SET status=@status, last_ping=GETDATE() WHERE id=@id');
                return { id: cam.id, ip_address: cam.ip_address, status };
            })
        );

        res.json({ success: true, total: results.length, results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};