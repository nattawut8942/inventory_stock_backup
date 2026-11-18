import sql from 'mssql';
import { getPool } from '../config/db.js';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { notifyNewlyOffline } from '../cctv/cctvAlertService.js';

// ─── Upload (icon กล้อง / rack / switch) ───────────────────────────────────
// ✅ ใช้ express-fileupload แทน multer (multer ชนกับ express-fileupload global middleware)
const uploadDir = path.join(process.cwd(), 'uploads', 'cctv-icons');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

// helper: บันทึกไฟล์เดี่ยว (icon) จาก express-fileupload แล้ว return icon_url หรือ null
const saveIconFile = async (file) => {
    if (!file) return null;
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
        const err = new Error('Invalid file type');
        err.statusCode = 400;
        throw err;
    }
    const ts = Date.now();
    const rnd = Math.round(Math.random() * 1e6);
    const fileName = `cctv-${ts}-${rnd}${path.extname(file.name)}`;
    const uploadPath = path.join(uploadDir, fileName);
    await file.mv(uploadPath);
    return `/uploads/cctv-icons/${fileName}`;
};

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

        const icon_url = await saveIconFile(req.files?.icon); // ✅ express-fileupload

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
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
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
            return res.status(404).json({ success: false, error: 'Rack not found' });
        }

        let icon_url = existing.recordset[0].icon_url;
        const newIconFile = req.files?.icon;
        if (newIconFile) {
            if (icon_url) { const old = path.join(process.cwd(), icon_url); if (fs.existsSync(old)) fs.unlink(old, () => {}); }
            icon_url = await saveIconFile(newIconFile);
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
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
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

        const icon_url = await saveIconFile(req.files?.icon); // ✅

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
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
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
            return res.status(404).json({ success: false, error: 'Switch not found' });
        }

        let icon_url = existing.recordset[0].icon_url;
        const newIconFile = req.files?.icon;
        if (newIconFile) {
            if (icon_url) { const old = path.join(process.cwd(), icon_url); if (fs.existsSync(old)) fs.unlink(old, () => {}); }
            icon_url = await saveIconFile(newIconFile);
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
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
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
                c.server_record_id,
                c.recording_days,
                rs.name      AS record_server_name,
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
            LEFT JOIN dbo.cctv_record_servers rs ON c.server_record_id = rs.id
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
                    c.server_record_id,
                    c.recording_days,
                    rs.name      AS record_server_name,
                    r.name       AS rack_name,
                    r.location_x AS rack_location_x,
                    r.location_y AS rack_location_y,
                    r.icon_url   AS rack_icon_url,
                    sw.name      AS switch_name,
                    sw.ip_address AS switch_ip
                FROM dbo.cctv_cameras c
                LEFT JOIN dbo.cctv_racks    r  ON c.rack_id    = r.id
                LEFT JOIN dbo.cctv_switches sw ON c.switch_id  = sw.id
                LEFT JOIN dbo.cctv_record_servers rs ON c.server_record_id = rs.id
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
            rack_id, switch_id, path_points, updated_by, icon_type,
            server_record_id, recording_days
        } = req.body;

        if (!name) return res.status(400).json({ success: false, error: 'name is required' });

        // ✅ express-fileupload: หลายไฟล์ต่างชื่อ field มาเป็น req.files.<fieldname> โดยตรง (ไม่ใช่ array)
        const icon_url     = await saveIconFile(req.files?.icon);
        const snapshot_url = await saveIconFile(req.files?.snapshot);

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
            .input('server_record_id',  sql.Int,               server_record_id  || null)
            .input('recording_days',    sql.Int,               recording_days    || null)
            .query(`
                INSERT INTO dbo.cctv_cameras
                    (name, ip_address, model, fix_asset, remark,
                     factory_layout_id, location_x, location_y,
                     rack_id, switch_id, path_points, icon_url, icon_type, updated_by, snapshot_url,
                     server_record_id, recording_days)
                VALUES
                    (@name, @ip_address, @model, @fix_asset, @remark,
                     @factory_layout_id, @location_x, @location_y,
                     @rack_id, @switch_id, @path_points, @icon_url, @icon_type, @updated_by, @snapshot_url,
                     @server_record_id, @recording_days);
                SELECT SCOPE_IDENTITY() AS id;
            `);
        res.json({ success: true, data: { id: result.recordset[0].id, name, icon_url } });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
};

export const updateCameraStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const pool = await getPool();
        const r = await pool.request()
            .input('id',     sql.Int,          id)
            .input('status', sql.NVarChar(20), status)
            .query('UPDATE dbo.cctv_cameras SET status=@status, updated_at=GETDATE() OUTPUT deleted.status AS prev_status WHERE id=@id');
        const prev = r.recordset?.[0]?.prev_status ?? null;
        if (prev !== status) await recordStatusEvent(pool, id, status, prev, 'manual');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

export const updateCamera = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, ip_address, model, fix_asset, remark,
            factory_layout_id, location_x, location_y,
            rack_id, switch_id, path_points, updated_by, icon_type,
            server_record_id, recording_days
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
            return res.status(404).json({ success: false, error: 'Camera not found' });
        }

        const prev = existing.recordset[0];

        // icon
        let icon_url = prev.icon_url;
        const newIconFile = req.files?.icon;
        if (newIconFile) {
            if (icon_url) { const old = path.join(process.cwd(), icon_url); if (fs.existsSync(old)) fs.unlink(old, () => {}); }
            icon_url = await saveIconFile(newIconFile);
        }

        // snapshot
        let snapshot_url = prev.snapshot_url;
        const newSnapshotFile = req.files?.snapshot;
        if (newSnapshotFile) {
            if (snapshot_url) { const old = path.join(process.cwd(), snapshot_url); if (fs.existsSync(old)) fs.unlink(old, () => {}); }
            snapshot_url = await saveIconFile(newSnapshotFile);
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
            .input('server_record_id',sql.Int,               server_record_id  || null)
            .input('recording_days',  sql.Int,               recording_days    || null)
            .query(`
                UPDATE dbo.cctv_cameras
                SET name=@name, ip_address=@ip_address, model=@model,
                    fix_asset=@fix_asset, remark=@remark,
                    factory_layout_id=@factory_layout_id,
                    location_x=@location_x, location_y=@location_y,
                    rack_id=@rack_id, switch_id=@switch_id,
                    path_points=@path_points, icon_url=@icon_url,
                    icon_type=@icon_type, snapshot_url=@snapshot_url,
                    server_record_id=@server_record_id, recording_days=@recording_days,
                    updated_by=@updated_by, updated_at=GETDATE()
                WHERE id = @id
            `);
        res.json({ success: true, data: { id: +id, name, icon_url } });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
};

// ── ผูก/ถอดกล้องหลายตัวกับ rack (แก้เฉพาะ rack_id; rack_id = null คือถอดออก; ข้ามโรงได้) ──
export const setCamerasRack = async (req, res) => {
    try {
        const { camera_ids, rack_id } = req.body || {};
        const ids = Array.isArray(camera_ids) ? [...new Set(camera_ids.map(v => parseInt(v, 10)))] : [];
        if (!ids.length || ids.some(v => !Number.isInteger(v))) {
            return res.status(400).json({ success: false, error: "camera_ids ต้องเป็นรายการ id ของกล้อง" });
        }
        const rackVal = rack_id === null || rack_id === undefined || rack_id === "" ? null : parseInt(rack_id, 10);
        if (rackVal !== null && !Number.isInteger(rackVal)) {
            return res.status(400).json({ success: false, error: "rack_id ไม่ถูกต้อง" });
        }
        const pool = await getPool();
        if (rackVal !== null) {
            const rk = await pool.request().input("rid", sql.Int, rackVal)
                .query("SELECT id FROM dbo.cctv_racks WHERE id = @rid");
            if (!rk.recordset.length) return res.status(404).json({ success: false, error: "ไม่พบ Rack นี้" });
        }
        const req2 = pool.request().input("rack", sql.Int, rackVal);
        const names = ids.map((id, i) => { req2.input("c" + i, sql.Int, id); return "@c" + i; });
        await req2.query(`UPDATE dbo.cctv_cameras SET rack_id = @rack, updated_at = GETDATE()
                          WHERE id IN (${names.join(",")})`);
        res.json({ success: true, updated: ids.length });
    } catch (err) {
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
                // ⚠️ แก้บั๊ก: การลากย้ายกล้องไม่ส่ง fov_* มา เดิมจึงล้างทิศทาง FOV เป็น NULL ทุกครั้ง
                // ตอนนี้จะแก้ FOV เฉพาะเมื่อ client ส่งค่า fov_direction มาจริง (undefined = คงค่าเดิม)
                .input('has_fov',          sql.Bit,          fov_direction !== undefined ? 1 : 0)
                .input('fov_direction',    sql.NVarChar(20), fov_direction || null)
                .input('has_spread',       sql.Bit,          fov_spread !== undefined ? 1 : 0)
                .input('fov_spread',       sql.Int,          parseInt(fov_spread) || 60)
                .query(`
                    UPDATE dbo.cctv_cameras
                    SET factory_layout_id = @factory_layout_id,
                        location_x        = @location_x,
                        location_y        = @location_y,
                        fov_direction     = CASE WHEN @has_fov = 1 THEN @fov_direction ELSE fov_direction END,
                        fov_spread        = CASE WHEN @has_spread = 1 THEN @fov_spread ELSE fov_spread END,
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

export const reorderLayouts = async (req, res) => {
    try {
        const { orders } = req.body; // [{id, sort_order}, ...]
        const pool = await getPool();
        await Promise.all(orders.map(({ id, sort_order }) =>
            pool.request()
                .input('id',         sql.Int, id)
                .input('sort_order', sql.Int, sort_order)
                .query('UPDATE dbo.factory_layouts SET sort_order=@sort_order WHERE id=@id')
        ));
        res.json({ success: true });
    } catch (err) {
        console.error('Reorder Layouts Error:', err);
        res.status(500).json({ error: 'Failed to reorder' });
    }
};

// ── Ping single camera ────────────────────────────────────────────────────
export const pingCameraById = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id)
            .query('SELECT ip_address, status FROM dbo.cctv_cameras WHERE id = @id');
        if (!r.recordset.length) return res.status(404).json({ success: false, error: 'Not found' });

        const { ip_address, status: currentStatus } = r.recordset[0];
        if (!ip_address) return res.json({ success: true, status: 'unknown' });

        // ไม่ ping กล้องที่ถูกถอดหรือเลิกใช้งาน
        if (currentStatus === 'removed' || currentStatus === 'retired') {
            return res.json({ success: true, status: currentStatus, ip_address });
        }

        const alive  = await pingCamera(ip_address);
        const status = alive ? 'online' : 'offline';

        await pool.request()
            .input('id',     sql.Int,         id)
            .input('status', sql.NVarChar(20), status)
            .query('UPDATE dbo.cctv_cameras SET status=@status, last_ping=GETDATE() WHERE id=@id');
        await recordDailyPing(pool, id, alive);
        if (currentStatus !== status) await recordStatusEvent(pool, id, status, currentStatus, "ping");

        res.json({ success: true, status, ip_address });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── จำกัดจำนวน ping ที่รันพร้อมกัน (กัน server/เครือข่ายโหลดเมื่อมีกล้องหลายร้อยตัว) ──
const PING_CONCURRENCY = 20;
async function mapWithLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}

// ส่งแจ้งเตือนเฉพาะกล้องที่เพิ่งเปลี่ยนจาก online → offline (ไม่บล็อกการตอบกลับ และไม่ทำให้ ping ล้มเหลว)
function notifyOfflineSafe(results) {
    const newlyOffline = results.filter(r => r.status === 'offline' && r.prev_status === 'online');
    if (!newlyOffline.length) return;
    notifyNewlyOffline(newlyOffline).catch(err => console.warn('[CCTV] ส่งแจ้งเตือน offline ไม่สำเร็จ:', err.message));
}

// บันทึกประวัติเมื่อสถานะเปลี่ยน (ล้มเหลวได้โดยไม่กระทบการทำงานหลัก)
async function recordStatusEvent(pool, camId, status, prev, source) {
    try {
        await pool.request()
            .input("id", sql.Int, camId)
            .input("status", sql.NVarChar(20), status)
            .input("prev", sql.NVarChar(20), prev ?? null)
            .input("source", sql.NVarChar(20), source)
            .query("INSERT INTO dbo.cctv_status_events (camera_id, status, prev_status, source) VALUES (@id, @status, @prev, @source)");
    } catch (err) {
        console.warn("[CCTV] recordStatusEvent ล้มเหลว (รัน migration 2026-11-18_cctv_status_events.sql หรือยัง?):", err.message);
    }
}

// บันทึกผล ping ลงสรุปรายวัน (uptime) — ล้มเหลวได้โดยไม่กระทบการ ping (เช่น ยังไม่ได้รัน migration)
async function recordDailyPing(pool, camId, alive) {
    try {
        await pool.request()
            .input('id', sql.Int, camId)
            .input('on', sql.Int, alive ? 1 : 0)
            .query(`MERGE dbo.cctv_status_daily AS t
                    USING (SELECT @id AS camera_id, CAST(GETDATE() AS DATE) AS [day]) AS s
                    ON t.camera_id = s.camera_id AND t.[day] = s.[day]
                    WHEN MATCHED THEN UPDATE SET online_count = t.online_count + @on, total_count = t.total_count + 1
                    WHEN NOT MATCHED THEN INSERT (camera_id, [day], online_count, total_count)
                        VALUES (@id, CAST(GETDATE() AS DATE), @on, 1);`);
    } catch (err) {
        console.warn('[CCTV] recordDailyPing ล้มเหลว (รัน migration 2026-11-18_cctv_status_daily.sql หรือยัง?):', err.message);
    }
}

// ping + บันทึกผลกล้องเดียว (ใช้ร่วมกันทุก endpoint ที่ ping หลายกล้อง)
// OUTPUT deleted.status คืนสถานะเดิม เพื่อตรวจว่าเพิ่งเปลี่ยนเป็น offline หรือไม่ (ใช้ส่งแจ้งเตือน)
async function pingAndRecord(pool, cam) {
    const alive  = await pingCamera(cam.ip_address);
    const status = alive ? 'online' : 'offline';
    const r = await pool.request()
        .input('id',     sql.Int,          cam.id)
        .input('status', sql.NVarChar(20), status)
        .query(`UPDATE dbo.cctv_cameras SET status=@status, last_ping=GETDATE()
                OUTPUT deleted.status AS prev_status
                WHERE id=@id`);
    await recordDailyPing(pool, cam.id, alive);
    const prev = r.recordset?.[0]?.prev_status ?? null;
    if (prev !== status) await recordStatusEvent(pool, cam.id, status, prev, "ping");
    return { id: cam.id, ip_address: cam.ip_address, name: cam.name, status, prev_status: prev };
}

// ── Ping ทุกกล้องทั้งระบบ (cron หรือ manual) ─────────────────────────────
export const pingAllCameras = async (req, res) => {
    try {
        const pool = await getPool();
        // ข้ามกล้องที่ removed หรือ retired
        const cameras = await pool.request()
            .query(`SELECT id, name, ip_address FROM dbo.cctv_cameras
                    WHERE ip_address IS NOT NULL
                    AND status NOT IN ('removed','retired')`);

        const results = await mapWithLimit(cameras.recordset, PING_CONCURRENCY, cam => pingAndRecord(pool, cam));
        notifyOfflineSafe(results);
        res.json({ success: true, total: results.length, results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── Ping เฉพาะกล้องใน layout (ฝั่ง server ทั้งหมด ไม่ต้องยิงจาก browser ทีละตัว) ──
export const pingLayoutCameras = async (req, res) => {
    try {
        const layoutId = parseInt(req.params.layout_id, 10);
        if (!Number.isInteger(layoutId)) return res.status(400).json({ success: false, error: 'layout_id ไม่ถูกต้อง' });
        const pool = await getPool();
        const cameras = await pool.request()
            .input('layout', sql.Int, layoutId)
            .query(`SELECT id, name, ip_address FROM dbo.cctv_cameras
                    WHERE factory_layout_id = @layout
                    AND ip_address IS NOT NULL
                    AND status NOT IN ('removed','retired')`);

        const results = await mapWithLimit(cameras.recordset, PING_CONCURRENCY, cam => pingAndRecord(pool, cam));
        notifyOfflineSafe(results);
        res.json({ success: true, layout_id: layoutId, total: results.length, results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
// ── Uptime รายกล้อง (รวมจากสรุปรายวัน) ─────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDay = (d) => (d instanceof Date ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : String(d));

export const getCameraUptime = async (req, res) => {
    try {
        const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
        const pool = await getPool();
        const r = await pool.request()
            .input('days', sql.Int, days)
            .query(`SELECT camera_id, [day], online_count, total_count FROM dbo.cctv_status_daily
                    WHERE [day] >= DATEADD(day, -@days, CAST(GETDATE() AS DATE))`);

        const byCam = {};
        for (const row of r.recordset) {
            if (!byCam[row.camera_id]) byCam[row.camera_id] = { online: 0, total: 0, days: [] };
            const o = byCam[row.camera_id];
            o.online += row.online_count;
            o.total += row.total_count;
            o.days.push({ day: fmtDay(row.day), online: row.online_count, total: row.total_count });
        }
        const data = Object.entries(byCam).map(([id, o]) => ({
            camera_id: Number(id),
            uptime_pct: o.total ? Math.round((o.online / o.total) * 1000) / 10 : null,
            samples: o.total,
            days: o.days.sort((a, b) => a.day.localeCompare(b.day)),
        }));
        res.json({ success: true, days, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── ประวัติการเปลี่ยนสถานะของกล้องตัวเดียว (สำหรับไทม์ไลน์ใน modal) ──
export const getCameraStatusHistory = async (req, res) => {
    try {
        const camId = parseInt(req.params.id, 10);
        if (!Number.isInteger(camId)) return res.status(400).json({ success: false, error: "id ไม่ถูกต้อง" });
        const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
        const pool = await getPool();
        const r = await pool.request()
            .input("id", sql.Int, camId)
            .input("days", sql.Int, days)
            .query(`SELECT id, status, prev_status, source, changed_at FROM dbo.cctv_status_events
                    WHERE camera_id = @id AND changed_at >= DATEADD(day, -@days, GETDATE())
                    ORDER BY changed_at DESC`);
        res.json({ success: true, data: r.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── Maintenance Logs (repair + removal รวม table เดียว) ──────────────────
export const getMaintenanceLogs = async (req, res) => {
    try {
        const pool = await getPool();
        const { log_type, camera_id } = req.query;
        const result = await pool.request()
            .input('log_type',   sql.NVarChar(20), log_type   || null)
            .input('camera_id',  sql.Int,           camera_id  ? +camera_id : null)
            .query(`
                SELECT m.*, c.ip_address
                FROM dbo.cctv_maintenance_logs m
                LEFT JOIN dbo.cctv_cameras c ON c.id = m.camera_id
                WHERE (@log_type  IS NULL OR m.log_type  = @log_type)
                AND   (@camera_id IS NULL OR m.camera_id = @camera_id)
                ORDER BY m.reported_at DESC
            `);
        res.json({ success: true, data: result.recordset });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ตั้งสถานะกล้องทุกตัวที่อยู่ในบันทึก (camera_id ตัวหลัก + camera_ids ที่เลือกหลายตัว)
const camIdsOf = (camera_id, camera_ids) => [...new Set(
    [camera_id, ...String(camera_ids || '').split(',')].map(Number).filter(n => Number.isInteger(n) && n > 0)
)];
const setCamerasStatus = async (pool, ids, status) => {
    for (const id of ids) {
        await pool.request()
            .input('id', sql.Int, id)
            .input('status', sql.NVarChar(20), status)
            .query(`UPDATE dbo.cctv_cameras SET status=@status, updated_at=GETDATE() WHERE id=@id`);
    }
};

export const createMaintenanceLog = async (req, res) => {
    try {
        const pool = await getPool();
        const items = Array.isArray(req.body) ? req.body : [req.body];

        const ids = await Promise.all(items.map(async item => {
            const {
                camera_id, camera_name, camera_ids, camera_names,
                log_type, issue_type, reason, description, solution, status,
                factory_name, location_x, location_y,
                assigned_to, reported_by,
                resolved_at, reinstalled_at, new_location, remark
            } = item;

            const result = await pool.request()
                .input('camera_id',     sql.Int,               camera_id)
                .input('camera_name',   sql.NVarChar(100),     camera_name)
                .input('camera_ids',    sql.NVarChar(sql.MAX), camera_ids    || null)
                .input('camera_names',  sql.NVarChar(sql.MAX), camera_names  || null)
                .input('log_type',      sql.NVarChar(20),      log_type      || 'repair')
                .input('issue_type',    sql.NVarChar(50),      issue_type    || null)
                .input('reason',        sql.NVarChar(50),      reason        || null)
                .input('description',   sql.NVarChar(sql.MAX), description   || null)
                .input('solution',      sql.NVarChar(sql.MAX), solution      || null)
                .input('status',        sql.NVarChar(20),      status        || (log_type === 'removal' ? 'removed' : log_type === 'install' ? 'installed' : 'pending'))
                .input('factory_name',  sql.NVarChar(200),     factory_name  || null)
                .input('location_x',    sql.Float,             location_x    ?? null)
                .input('location_y',    sql.Float,             location_y    ?? null)
                .input('assigned_to',   sql.NVarChar(100),     assigned_to   || null)
                .input('reported_by',   sql.NVarChar(100),     reported_by   || null)
                .input('resolved_at',   sql.DateTime,          resolved_at    ? new Date(resolved_at)   : null)
                .input('reinstalled_at',sql.DateTime,          reinstalled_at ? new Date(reinstalled_at): null)
                .input('new_location',  sql.NVarChar(200),     new_location  || null)
                .input('remark',        sql.NVarChar(sql.MAX), remark        || null)
                .query(`
                    INSERT INTO dbo.cctv_maintenance_logs
                        (camera_id, camera_name, camera_ids, camera_names,
                         log_type, issue_type, reason, description, solution, status,
                         factory_name, location_x, location_y, assigned_to, reported_by,
                         resolved_at, reinstalled_at, new_location, remark)
                    VALUES
                        (@camera_id, @camera_name, @camera_ids, @camera_names,
                         @log_type, @issue_type, @reason, @description, @solution, @status,
                         @factory_name, @location_x, @location_y, @assigned_to, @reported_by,
                         @resolved_at, @reinstalled_at, @new_location, @remark);
                    SELECT SCOPE_IDENTITY() AS id;
                `);

            // ── sync camera status ─────────────────────────────────────
            if (log_type === 'removal') {
                await setCamerasStatus(pool, camIdsOf(camera_id, camera_ids), 'removed');
            }

            return result.recordset[0].id;
        }));

        res.json({ success: true, ids });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

export const updateMaintenanceLog = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            issue_type, reason, description, solution, status,
            assigned_to, resolved_at, reinstalled_at,
            new_location, remark
        } = req.body;
        const pool = await getPool();

        // ดึง camera_id เพื่อ sync status
        const existing = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT camera_id, camera_ids, log_type FROM dbo.cctv_maintenance_logs WHERE id=@id');
        const log = existing.recordset[0];

        await pool.request()
            .input('id',             sql.Int,               id)
            .input('issue_type',     sql.NVarChar(50),      issue_type     || null)
            .input('reason',         sql.NVarChar(50),      reason         || null)
            .input('description',    sql.NVarChar(sql.MAX), description    || null)
            .input('solution',       sql.NVarChar(sql.MAX), solution       || null)
            .input('status',         sql.NVarChar(20),      status         || 'pending')
            .input('assigned_to',    sql.NVarChar(100),     assigned_to    || null)
            .input('resolved_at',    sql.DateTime,          resolved_at    ? new Date(resolved_at)    : null)
            .input('reinstalled_at', sql.DateTime,          reinstalled_at ? new Date(reinstalled_at) : null)
            .input('new_location',   sql.NVarChar(200),     new_location   || null)
            .input('remark',         sql.NVarChar(sql.MAX), remark         || null)
            .query(`
                UPDATE dbo.cctv_maintenance_logs
                SET issue_type=@issue_type, reason=@reason, description=@description,
                    solution=@solution, status=@status, assigned_to=@assigned_to,
                    resolved_at=@resolved_at, reinstalled_at=@reinstalled_at,
                    new_location=@new_location, remark=@remark
                WHERE id=@id
            `);

        // ── sync camera status ─────────────────────────────────────────
        if (log?.camera_id) {
            let camStatus = null;
            if (log.log_type === 'removal') {
                if (status === 'reinstalled') camStatus = 'online';
                else if (status === 'retired')     camStatus = 'retired';
                else                               camStatus = 'removed';
            } else if (log.log_type === 'repair') {
                if (status === 'resolved') camStatus = 'online';
            }
            if (camStatus) {
                await setCamerasStatus(pool, camIdsOf(log.camera_id, log.camera_ids), camStatus);
            }
        }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

export const deleteMaintenanceLog = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPool();
        // ก่อนลบ: จำกล้องที่ผูกกับบันทึกนี้ไว้ เพื่อคืนสถานะถ้าไม่เหลือบันทึกถอดที่ยังค้างอยู่
        const found = await pool.request().input('id', sql.Int, id)
            .query('SELECT camera_id, camera_ids, log_type FROM dbo.cctv_maintenance_logs WHERE id=@id');
        const old = found.recordset[0];
        await pool.request().input('id', sql.Int, id)
            .query('DELETE FROM dbo.cctv_maintenance_logs WHERE id=@id');

        if (old?.log_type === 'removal') {
            for (const camId of camIdsOf(old.camera_id, old.camera_ids)) {
                // ยังมีบันทึกถอดที่ยังไม่กลับของกล้องตัวนี้อยู่หรือไม่
                const still = await pool.request().input('cid', sql.Int, camId).query(`
                    SELECT COUNT(*) AS n FROM dbo.cctv_maintenance_logs
                    WHERE log_type = 'removal' AND status IN ('removed', 'repairing')
                      AND (camera_id = @cid OR (',' + ISNULL(camera_ids, '') + ',') LIKE '%,' + CAST(@cid AS VARCHAR(20)) + ',%')`);
                if (still.recordset[0].n === 0) {
                    // คืนเป็นออนไลน์ เฉพาะกล้องที่ยังค้างสถานะถอดออก (ping จะยืนยันสถานะจริงอีกครั้ง)
                    await pool.request().input('cid', sql.Int, camId)
                        .query(`UPDATE dbo.cctv_cameras SET status='online', updated_at=GETDATE() WHERE id=@cid AND status='removed'`);
                }
            }
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── Export Maintenance Logs as CSV ────────────────────────────────────────
export const exportMaintenanceLogs = async (req, res) => {
    try {
        const pool = await getPool();
        const { log_type } = req.query;
        const result = await pool.request()
            .input('log_type', sql.NVarChar(20), log_type || null)
            .query(`
                SELECT
                    m.id, m.log_type, m.camera_name, c.ip_address,
                    m.factory_name, m.issue_type, m.reason,
                    m.description, m.status, m.assigned_to, m.reported_by,
                    m.reported_at, m.resolved_at, m.reinstalled_at,
                    m.new_location, m.remark
                FROM dbo.cctv_maintenance_logs m
                LEFT JOIN dbo.cctv_cameras c ON c.id = m.camera_id
                WHERE (@log_type IS NULL OR m.log_type = @log_type)
                ORDER BY m.reported_at DESC
            `);

        const rows = result.recordset;
        const headers = [
            'ID','ประเภท','ชื่อกล้อง','IP','Factory',
            'ประเภทปัญหา','เหตุผลถอด','รายละเอียด','สถานะ',
            'ผู้รับผิดชอบ','ผู้แจ้ง','วันที่แจ้ง','วันที่แก้ไข',
            'วันที่ติดตั้งคืน','ตำแหน่งใหม่','หมายเหตุ'
        ];

        const formatDate = (d) => d ? new Date(d).toLocaleDateString('th-TH') : '';
        const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

        const csv = [
            headers.map(escape).join(','),
            ...rows.map(r => [
                r.id, r.log_type === 'repair' ? 'ซ่อม' : r.log_type === 'install' ? 'ติดตั้ง' : 'ถอด',
                r.camera_name, r.ip_address, r.factory_name,
                r.issue_type, r.reason, r.description, r.status,
                r.assigned_to, r.reported_by,
                formatDate(r.reported_at), formatDate(r.resolved_at),
                formatDate(r.reinstalled_at), r.new_location, r.remark
            ].map(escape).join(','))
        ].join('\r\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="cctv_maintenance_${Date.now()}.csv"`);
        res.send('\uFEFF' + csv); // BOM สำหรับ Excel อ่านภาษาไทยได้
    } catch (err) { res.status(500).json({ error: err.message }); }
};
// ── Record Servers (Master) ────────────────────────────────────────────────
export const getRecordServers = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT rs.*,
                (SELECT COUNT(*) FROM dbo.cctv_cameras c WHERE c.server_record_id = rs.id) AS camera_count
            FROM dbo.cctv_record_servers rs
            ORDER BY rs.name
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

export const createRecordServer = async (req, res) => {
    try {
        const { name, ip_address, created_by } = req.body;
        if (!name) return res.status(400).json({ error: 'name is required' });
        const pool = await getPool();
        const result = await pool.request()
            .input('name',       sql.NVarChar(100), name)
            .input('ip_address', sql.NVarChar(50),  ip_address || null)
            .input('created_by', sql.NVarChar(100), created_by || null)
            .query(`
                INSERT INTO dbo.cctv_record_servers (name, ip_address, created_by)
                VALUES (@name, @ip_address, @created_by);
                SELECT SCOPE_IDENTITY() AS id;
            `);
        res.json({ success: true, data: { id: result.recordset[0].id, name } });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

export const updateRecordServer = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, ip_address } = req.body;
        if (!name) return res.status(400).json({ error: 'name is required' });
        const pool = await getPool();
        await pool.request()
            .input('id',         sql.Int,           id)
            .input('name',       sql.NVarChar(100), name)
            .input('ip_address', sql.NVarChar(50),  ip_address || null)
            .query('UPDATE dbo.cctv_record_servers SET name=@name, ip_address=@ip_address WHERE id=@id');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

export const deleteRecordServer = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getPool();
        const check = await pool.request().input('id', sql.Int, id)
            .query('SELECT COUNT(*) AS cnt FROM dbo.cctv_cameras WHERE server_record_id=@id');
        if (check.recordset[0].cnt > 0)
            return res.status(400).json({ error: 'ไม่สามารถลบได้ มีกล้องผูกกับ Server นี้อยู่' });
        await pool.request().input('id', sql.Int, id)
            .query('DELETE FROM dbo.cctv_record_servers WHERE id=@id');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};