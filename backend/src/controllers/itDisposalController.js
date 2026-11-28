// IT Asset Disposal — บันทึกรายการอุปกรณ์ IT ที่ทำลาย (Disposal) เป็นรอบ
// - ค้นหาข้อมูลจาก Fixed Asset (DCI FXALOCATE_API) ด้วย ASSET NO
// - แต่ละรอบ (RunCode: ITDISPOSAL-ddmmyyyy + เลข run 3 หลัก) เพิ่มรายการได้จนกว่าจะปิดรอบ
// - รูปภาพ 2 รูปต่อรายการ (ไม่บังคับ แนบเพิ่มทีหลังได้) เก็บใต้ backend/uploads/disposal/<RunID>/ และเสิร์ฟผ่าน static path
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { sql, getPool } from '../config/db.js';
import { getJwtSecret } from '../config/jwtSecret.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads/disposal');
// path ที่ browser เรียกผ่าน server.js (ต้องตรงกับ app.use ใน server.js)
const PIC_PUBLIC_PREFIX = '/ITinventory/uploads/disposal';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
// ใช้ env เดียวกับ borrowController เพื่อให้ชี้ไป FXALOCATE_API ที่เดียวกัน
const DCI_ASSET_API_BASE = process.env.DCI_ASSET_API_BASE || 'http://dciweb.dci.daikin.co.jp/FXALOCATE_API/getAssetDetail';
// โฟลเดอร์รูปเดิมของ Fixed Asset (API ส่งมาแค่ชื่อไฟล์ pic1/pic2/pic3)
const DCI_ASSET_PIC_BASE = process.env.DCI_ASSET_PIC_BASE || 'http://alpha.dci.daikin.co.jp/fapictures';

// GET JSON ด้วย http/https ของ Node (ไม่ใช้ global fetch เพราะ Node 14 ไม่มี)
const getJson = (url, timeoutMs = 15000) => new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                const e = new Error(`HTTP ${res.statusCode}`);
                e.upstreamStatus = res.statusCode;
                return reject(e);
            }
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
        res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
});

const isId = (v) => /^\d+$/.test(String(v));
const textOrNull = (v, max) => {
    const s = v == null ? '' : String(v).trim();
    return s ? s.slice(0, max) : null;
};
// คืน null ถ้าว่าง, NaN ถ้าไม่ใช่ตัวเลข (ให้ caller ตรวจ)
const numOrNull = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
};

// ผู้ใช้ที่ทำรายการ — อ่านจาก req.user หรือถอดจาก token เอง (requirePerm ไม่ได้ set req.user ตอนปิดการตรวจสิทธิ์)
const getActor = (req) => {
    let user = req.user || null;
    if (!user) {
        try {
            const raw = req.headers['authorization'];
            if (raw) user = jwt.verify(raw.startsWith('Bearer ') ? raw.slice(7) : raw, getJwtSecret());
        } catch { user = null; }
    }
    return {
        by: textOrNull(user?.username, 100),
        name: textOrNull(user?.name || user?.username, 150),
    };
};

// ─── Upload (รูป 2 ช่อง: pic1, pic2) ────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(UPLOAD_ROOT, String(req.params.id));
        fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${file.fieldname}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_BYTES, files: 2 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXT.includes(ext)) {
            return cb(new Error(`ไม่รองรับไฟล์ประเภทนี้ (อนุญาต: ${ALLOWED_EXT.join(', ')})`));
        }
        cb(null, true);
    },
});

const removeUploaded = (files = {}) => {
    for (const list of Object.values(files)) {
        for (const f of list || []) fs.unlink(f.path, () => {});
    }
};

// ลบไฟล์รูปจากดิสก์ จาก path ที่เก็บใน DB (ใช้ basename กันการไต่ path ออกนอกโฟลเดอร์)
const unlinkPic = (runId, p) => {
    if (!p) return;
    fs.unlink(path.join(UPLOAD_ROOT, String(runId), path.basename(p)), () => {});
};

// Route middleware สำหรับ POST /runs/:id/items (multipart: fields + pic1 + pic2)
export const uploadDisposalPics = (req, res, next) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    upload.fields([{ name: 'pic1', maxCount: 1 }, { name: 'pic2', maxCount: 1 }])(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'รูปภาพใหญ่เกิน 10 MB' : err.message;
            return res.status(400).json({ error: msg });
        }
        next();
    });
};

// ─── ประวัติเหตุการณ์ (ไม่ให้การบันทึกประวัติทำให้งานหลักล้มเหลว) ─────────────────
// Admin ทำได้ทุกอย่างในโมดูลนี้ (รวมถึงปิด/ลบรอบของคนอื่น)
const isAdminReq = (req) => req.user?.role === 'Admin';

const logEvent = async (runId, type, actor, detail) => {
    try {
        await getPool().request()
            .input('runId', sql.Int, Number(runId))
            .input('type', sql.NVarChar(30), type)
            .input('by', sql.NVarChar(100), actor?.by ?? null)
            .input('name', sql.NVarChar(150), actor?.name ?? null)
            .input('detail', sql.NVarChar(300), detail ? String(detail).slice(0, 300) : null)
            .query('INSERT INTO dbo.Disposal_Events (RunID, EventType, Actor, ActorName, Detail) VALUES (@runId, @type, @by, @name, @detail)');
    } catch (err) {
        console.error('logEvent error:', err.message);
    }
};

// ─── Mapping ───────────────────────────────────────────────────────────────
const mapRun = (r) => ({
    runId: r.RunID,
    runCode: r.RunCode,
    status: r.Status,
    createdBy: r.CreatedBy,
    createdByName: r.CreatedByName,
    createdAt: r.CreatedAt,
    closedBy: r.ClosedBy,
    closedAt: r.ClosedAt,
    completedBy: r.CompletedBy ?? null,
    completedByName: r.CompletedByName ?? null,
    completedAt: r.CompletedAt ?? null,
    accountingDocNo: r.AccountingDocNo ?? null,
    stage: Number(r.Stage) || 1,
    accountingDocCount: r.AccountingDocCount ?? 0,
    itemCount: r.ItemCount ?? 0,
    fullPhotoCount: r.FullPhotoCount ?? 0,
    totalCost: r.TotalCost ?? 0,
    totalAccumDP: r.TotalAccumDP ?? 0,
    totalBkAmt: r.TotalBkAmt ?? 0,
});

const mapItem = (r) => ({
    itemId: r.ItemID,
    runId: r.RunID,
    assetNo: r.AssetNo,
    assetDate: r.AssetDate,
    assetName: r.AssetName,
    place: r.Place,
    costCenter: r.CostCenter,
    cost: r.Cost,
    accumDP: r.AccumDP,
    bkAmt: r.BkAmt,
    pic1Url: r.Pic1Path,
    pic2Url: r.Pic2Path,
    isChecked: !!r.IsChecked,
    checkedAt: r.CheckedAt ?? null,
    checkedBy: r.CheckedBy ?? null,
    checkedByName: r.CheckedByName ?? null,
    isKeyed: !!r.IsKeyed,
    keyedAt: r.KeyedAt ?? null,
    keyedBy: r.KeyedBy ?? null,
    keyedByName: r.KeyedByName ?? null,
    createdBy: r.CreatedBy,
    createdByName: r.CreatedByName,
    createdAt: r.CreatedAt,
});

const findRun = async (pool, id) => {
    const r = await pool.request().input('id', sql.Int, Number(id))
        .query('SELECT RunID, RunCode, Status, CreatedBy, Stage, CompletedAt, AccountingDocNo FROM dbo.Disposal_Runs WHERE RunID = @id');
    return r.recordset[0] || null;
};

// ─── GET /disposal/lookup/:code ────────────────────────────────────────────
// ค้นหาครุภัณฑ์จาก Fixed Asset (DCI) — proxy ฝั่ง backend เพราะ endpoint อยู่บน intranet
export const lookupAsset = async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,30}$/.test(code)) {
        return res.status(400).json({ error: 'รูปแบบรหัสครุภัณฑ์ไม่ถูกต้อง' });
    }
    try {
        let data;
        try {
            data = await getJson(`${DCI_ASSET_API_BASE}/${encodeURIComponent(code)}`);
        } catch (err) {
            if (err.upstreamStatus) {
                return res.status(404).json({ error: 'ไม่พบรหัสครุภัณฑ์นี้ในระบบ Fixed Asset' });
            }
            throw err;
        }
        const rec = Array.isArray(data) ? data[0] : data;
        if (!rec || !rec.asno) {
            return res.status(404).json({ error: 'ไม่พบรหัสครุภัณฑ์นี้ในระบบ Fixed Asset' });
        }
        res.json({
            success: true,
            item: {
                assetNo: rec.asno,
                assetDate: rec.asdate ?? null,
                assetName: rec.asname ?? null,
                place: rec.place ?? null,
                costCenter: rec.costcenter != null ? String(rec.costcenter) : null,
                cost: rec.cost ?? null,
                accumDP: rec.accumdp ?? null,
                bkAmt: rec.bkamt ?? null,
                // DCI ส่ง default.png แทนช่องที่ไม่มีรูปจริง จึงตัดทิ้ง
                legacyPicUrls: [rec.pic1, rec.pic2, rec.pic3]
                    .filter((p) => p && !/^default\.(png|jpe?g)$/i.test(String(p).trim()))
                    .map((p) => `${DCI_ASSET_PIC_BASE}/${encodeURIComponent(p)}`),
            },
        });
    } catch (err) {
        console.error('Disposal lookup error:', { message: err.message, code: err.cause?.code || err.code || null });
        res.status(502).json({ error: 'ไม่สามารถเชื่อมต่อระบบ Fixed Asset (DCI) ได้' });
    }
};

// ─── GET /disposal/runs ────────────────────────────────────────────────────
export const listRuns = async (req, res) => {
    try {
        const pool = getPool();
        const r = await pool.request().query(`
            SELECT r.RunID, r.RunCode, r.Status, r.CreatedBy, r.CreatedByName, r.CreatedAt, r.ClosedBy, r.ClosedAt, r.CompletedBy, r.CompletedByName, r.CompletedAt, r.AccountingDocNo, r.Stage,
                   (SELECT COUNT(*) FROM dbo.Disposal_Attachments a WHERE a.RunID = r.RunID AND a.DocType = 'ACCOUNTING_DONE') AS AccountingDocCount,
                   COUNT(i.ItemID)        AS ItemCount,
                   SUM(CASE WHEN i.Pic1Path IS NOT NULL AND i.Pic2Path IS NOT NULL THEN 1 ELSE 0 END) AS FullPhotoCount,
                   SUM(i.Cost)            AS TotalCost,
                   SUM(i.AccumDP)         AS TotalAccumDP,
                   SUM(i.BkAmt)           AS TotalBkAmt
            FROM dbo.Disposal_Runs r
            LEFT JOIN dbo.Disposal_Items i ON i.RunID = r.RunID
            GROUP BY r.RunID, r.RunCode, r.Status, r.CreatedBy, r.CreatedByName, r.CreatedAt, r.ClosedBy, r.ClosedAt, r.CompletedBy, r.CompletedByName, r.CompletedAt, r.AccountingDocNo, r.Stage
            ORDER BY r.RunID DESC
        `);
        res.json({ success: true, data: r.recordset.map(mapRun) });
    } catch (err) {
        console.error('listRuns error:', err);
        res.status(500).json({ error: 'โหลดรายการรอบ Disposal ไม่สำเร็จ' });
    }
};

// ─── POST /disposal/runs ───────────────────────────────────────────────────
// เปิดรอบใหม่: RunCode = ITDISPOSAL-ddmmyyyy + เลข run 3 หลัก (นับต่อวัน)
export const createRun = async (req, res) => {
    const actor = getActor(req);
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const prefix = `ITDISPOSAL-${dd}${mm}${yyyy}`;

    try {
        const pool = getPool();
        // ลองใหม่ได้ถ้าชน UNIQUE (มีคนเปิดรอบพร้อมกัน)
        for (let attempt = 0; attempt < 3; attempt++) {
            const cnt = await pool.request().input('p', sql.NVarChar(50), `${prefix}%`)
                .query('SELECT COUNT(*) AS n FROM dbo.Disposal_Runs WHERE RunCode LIKE @p');
            // หมายเหตุ: prefix มีขีด '-' ไม่ใช่ wildcard ของ LIKE จึงใช้ค่านี้ได้ตรง ๆ
            const runCode = `${prefix}${String((cnt.recordset[0].n || 0) + 1 + attempt).padStart(3, '0')}`;
            try {
                const ins = await pool.request()
                    .input('code', sql.NVarChar(50), runCode)
                    .input('by', sql.NVarChar(100), actor.by)
                    .input('name', sql.NVarChar(150), actor.name)
                    .query(`INSERT INTO dbo.Disposal_Runs (RunCode, Status, CreatedBy, CreatedByName)
                            OUTPUT inserted.RunID, inserted.RunCode, inserted.Status, inserted.CreatedBy,
                                   inserted.CreatedByName, inserted.CreatedAt, inserted.ClosedBy, inserted.ClosedAt
                            VALUES (@code, 'Open', @by, @name)`);
                res.locals.auditSummary = runCode;
                await logEvent(ins.recordset[0].RunID, 'OPEN', actor, runCode);
                return res.status(201).json({ success: true, data: mapRun(ins.recordset[0]) });
            } catch (e) {
                if (e.number !== 2627 && e.number !== 2601) throw e;
            }
        }
        res.status(409).json({ error: 'ไม่สามารถสร้างรอบได้ กรุณาลองใหม่' });
    } catch (err) {
        console.error('createRun error:', err);
        res.status(500).json({ error: 'เปิดรอบ Disposal ไม่สำเร็จ' });
    }
};

// ─── GET /disposal/runs/:id/items ──────────────────────────────────────────
export const getRunItems = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    try {
        const pool = getPool();
        const runRes = await pool.request().input('id', sql.Int, Number(req.params.id)).query(`
            SELECT r.RunID, r.RunCode, r.Status, r.CreatedBy, r.CreatedByName, r.CreatedAt, r.ClosedBy, r.ClosedAt, r.CompletedBy, r.CompletedByName, r.CompletedAt, r.AccountingDocNo, r.Stage,
                   COUNT(i.ItemID) AS ItemCount, SUM(i.Cost) AS TotalCost,
                   SUM(i.AccumDP) AS TotalAccumDP, SUM(i.BkAmt) AS TotalBkAmt
            FROM dbo.Disposal_Runs r
            LEFT JOIN dbo.Disposal_Items i ON i.RunID = r.RunID
            WHERE r.RunID = @id
            GROUP BY r.RunID, r.RunCode, r.Status, r.CreatedBy, r.CreatedByName, r.CreatedAt, r.ClosedBy, r.ClosedAt, r.CompletedBy, r.CompletedByName, r.CompletedAt, r.AccountingDocNo, r.Stage
        `);
        if (!runRes.recordset[0]) return res.status(404).json({ error: 'ไม่พบรอบ Disposal นี้' });

        const itemRes = await pool.request().input('id', sql.Int, Number(req.params.id))
            .query('SELECT * FROM dbo.Disposal_Items WHERE RunID = @id ORDER BY ItemID ASC');
        res.json({
            success: true,
            run: mapRun(runRes.recordset[0]),
            items: itemRes.recordset.map(mapItem),
        });
    } catch (err) {
        console.error('getRunItems error:', err);
        res.status(500).json({ error: 'โหลดรายการ Disposal ไม่สำเร็จ' });
    }
};

// ─── PUT /disposal/runs/:id/close ──────────────────────────────────────────
export const closeRun = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    try {
        const pool = getPool();
        const run = await findRun(pool, req.params.id);
        if (!run) return res.status(404).json({ error: 'ไม่พบรอบ Disposal นี้' });
        if (run.Status === 'Closed') return res.status(409).json({ error: 'รอบนี้ปิดแล้ว' });

        // ปิดรอบได้เฉพาะผู้ที่เปิดรอบนั้น หรือ Admin (เทียบ username แบบไม่สนตัวพิมพ์เล็ก-ใหญ่)
        const actor = getActor(req);
        const creator = String(run.CreatedBy || '').toUpperCase();
        if (!isAdminReq(req) && (!actor.by || creator !== actor.by.toUpperCase())) {
            return res.status(403).json({ error: 'ปิดรอบได้เฉพาะผู้ที่เปิดรอบนี้เท่านั้น' });
        }
        // บังคับ: ต้องทำขั้นที่ 1 "บันทึกและถ่ายภาพ" ให้ครบก่อน (ขั้นต้องไปถึงขั้นที่ 2 ขึ้นไป)
        if ((Number(run.Stage) || 1) < 2) {
            return res.status(409).json({ error: 'ยังปิดรอบไม่ได้ ต้องทำขั้นที่ 1 "บันทึกและถ่ายภาพ" ให้ครบก่อน' });
        }
        await pool.request()
            .input('id', sql.Int, Number(req.params.id))
            .input('by', sql.NVarChar(100), actor.by)
            .query(`UPDATE dbo.Disposal_Runs SET Status = 'Closed', ClosedBy = @by, ClosedAt = GETDATE()
                    WHERE RunID = @id`);
        res.locals.auditSummary = run.RunCode;
        await logEvent(Number(req.params.id), 'CLOSE', actor, run.RunCode);
        res.json({ success: true });
    } catch (err) {
        console.error('closeRun error:', err);
        res.status(500).json({ error: 'ปิดรอบ Disposal ไม่สำเร็จ' });
    }
};

// ─── PUT /disposal/runs/:id/reopen — เปิดรอบที่ปิดแล้วอีกครั้ง (เฉพาะ Admin) ──────
export const reopenRun = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const run = await findRun(pool, runId);
        if (!run) return res.status(404).json({ error: 'ไม่พบรอบ Disposal นี้' });
        if (run.Status !== 'Closed') return res.status(409).json({ error: 'รอบนี้ยังเปิดอยู่' });

        await pool.request().input('id', sql.Int, runId)
            .query(`UPDATE dbo.Disposal_Runs SET Status = 'Open', ClosedBy = NULL, ClosedAt = NULL,
                    CompletedBy = NULL, CompletedByName = NULL, CompletedAt = NULL,
                    Stage = CASE WHEN Stage >= 3 THEN 2 ELSE Stage END WHERE RunID = @id`);
        res.locals.auditSummary = run.RunCode;
        await logEvent(runId, 'REOPEN', getActor(req), run.RunCode);
        res.json({ success: true });
    } catch (err) {
        console.error('reopenRun error:', err);
        res.status(500).json({ error: 'เปิดรอบอีกครั้งไม่สำเร็จ' });
    }
};

// ─── PUT /disposal/runs/:id/complete — ทำเป็น "เสร็จสิ้น" (ต้องปิดรอบแล้ว, สิทธิ์ edit-run) ──
export const completeRun = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const run = await findRun(pool, runId);
        if (!run) return res.status(404).json({ error: 'ไม่พบรอบ Disposal นี้' });
        if (run.Status !== 'Closed') return res.status(409).json({ error: 'ต้องปิดรอบก่อนจึงจะทำเป็นเสร็จสิ้นได้' });

        const current = await pool.request().input('id', sql.Int, runId)
            .query('SELECT CompletedAt FROM dbo.Disposal_Runs WHERE RunID = @id');
        if (current.recordset[0]?.CompletedAt) return res.status(409).json({ error: 'รอบนี้เสร็จสิ้นแล้ว' });

        // ทำเป็นเสร็จสิ้นได้เฉพาะเมื่อถึงขั้นที่ 5 "รอจำหน่ายจริง" และแนบรูปหลักฐานการทิ้งครบ 3 รูปแล้ว
        if ((Number(run.Stage) || 1) !== 5) return res.status(409).json({ error: 'ต้องทำขั้นที่ 1-5 ให้ครบตามลำดับก่อน จึงจะทำเป็นเสร็จสิ้นได้' });
        const gate = await stageGateError(pool, { ...run, RunID: runId }, 6);
        if (gate) return res.status(409).json({ error: gate });

        const actor = getActor(req);
        // ทำเป็นเสร็จสิ้น = ขั้นที่ 6 "ทำทิ้งแล้ว"
        await pool.request()
            .input('id', sql.Int, runId)
            .input('by', sql.NVarChar(100), actor.by)
            .input('name', sql.NVarChar(150), actor.name)
            .query(`UPDATE dbo.Disposal_Runs SET CompletedBy = @by, CompletedByName = @name, CompletedAt = GETDATE(), Stage = 6
                    WHERE RunID = @id`);
        res.locals.auditSummary = run.RunCode;
        await logEvent(runId, 'COMPLETE', actor, run.RunCode);
        res.json({ success: true });
    } catch (err) {
        console.error('completeRun error:', err);
        res.status(500).json({ error: 'ทำเป็นเสร็จสิ้นไม่สำเร็จ' });
    }
};

// ─── PUT /disposal/runs/:id/uncomplete — ยกเลิกสถานะเสร็จสิ้น (สิทธิ์ edit-run) ──────
export const uncompleteRun = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const run = await findRun(pool, runId);
        if (!run) return res.status(404).json({ error: 'ไม่พบรอบ Disposal นี้' });
        const current = await pool.request().input('id', sql.Int, runId)
            .query('SELECT CompletedAt FROM dbo.Disposal_Runs WHERE RunID = @id');
        if (!current.recordset[0]?.CompletedAt) return res.status(409).json({ error: 'รอบนี้ยังไม่ได้เป็นเสร็จสิ้น' });

        // ยกเลิกเสร็จสิ้น = กลับไปขั้นที่ 5 "รอจำหน่ายจริง"
        await pool.request().input('id', sql.Int, runId)
            .query(`UPDATE dbo.Disposal_Runs SET CompletedBy = NULL, CompletedByName = NULL, CompletedAt = NULL,
                    Stage = CASE WHEN Stage = 6 THEN 5 ELSE Stage END WHERE RunID = @id`);
        res.locals.auditSummary = run.RunCode;
        await logEvent(runId, 'UNCOMPLETE', getActor(req), run.RunCode);
        res.json({ success: true });
    } catch (err) {
        console.error('uncompleteRun error:', err);
        res.status(500).json({ error: 'ยกเลิกสถานะเสร็จสิ้นไม่สำเร็จ' });
    }
};

// ─── GET /disposal/summary/yearly — สรุปรายปี (ตามปีที่เปิดรอบ) ────────────────
export const getYearlySummary = async (req, res) => {
    try {
        const r = await getPool().request().query(`
            SELECT YEAR(r.CreatedAt) AS Yr,
                   COUNT(DISTINCT r.RunID) AS Runs,
                   COUNT(i.ItemID)         AS Items,
                   SUM(i.Cost)             AS TotalCost,
                   SUM(i.AccumDP)          AS TotalAccumDP,
                   SUM(i.BkAmt)            AS TotalBkAmt
            FROM dbo.Disposal_Runs r
            LEFT JOIN dbo.Disposal_Items i ON i.RunID = r.RunID
            GROUP BY YEAR(r.CreatedAt)
            ORDER BY Yr DESC`);
        res.json({
            success: true,
            data: r.recordset.map((x) => ({
                year: x.Yr,
                runs: x.Runs,
                items: x.Items,
                totalCost: Number(x.TotalCost) || 0,
                totalAccumDP: Number(x.TotalAccumDP) || 0,
                totalBkAmt: Number(x.TotalBkAmt) || 0,
            })),
        });
    } catch (err) {
        console.error('getYearlySummary error:', err);
        res.status(500).json({ error: 'โหลดสรุปรายปีไม่สำเร็จ' });
    }
};

// ─── GET /disposal/runs/:id/events — ประวัติเหตุการณ์ของรอบ (เรียงตามเวลา) ──────
export const getRunEvents = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    try {
        const r = await getPool().request().input('id', sql.Int, Number(req.params.id))
            .query('SELECT EventID, EventType, Actor, ActorName, Detail, At FROM dbo.Disposal_Events WHERE RunID = @id ORDER BY At ASC, EventID ASC');
        res.json({
            success: true,
            data: r.recordset.map((e) => ({
                eventId: e.EventID,
                type: e.EventType,
                actor: e.Actor,
                actorName: e.ActorName,
                detail: e.Detail,
                at: e.At,
            })),
        });
    } catch (err) {
        console.error('getRunEvents error:', err);
        res.status(500).json({ error: 'โหลดประวัติไม่สำเร็จ' });
    }
};

// ─── GET /disposal/search?assetNo= — ค้นหา ASSET NO ข้ามทุกรอบ ────────────────
export const searchAssetAcrossRuns = async (req, res) => {
    const q = String(req.query.assetNo || '').trim().toUpperCase();
    if (q.length < 3) return res.json({ success: true, data: [] });
    // escape อักขระพิเศษของ LIKE
    const pattern = `%${q.replace(/[%_[]/g, (m) => `[${m}]`)}%`;
    try {
        const r = await getPool().request().input('q', sql.NVarChar(60), pattern).query(`
            SELECT TOP 50 i.ItemID, i.AssetNo, i.AssetName, i.CreatedBy, i.CreatedByName, i.CreatedAt,
                   r.RunID, r.RunCode, r.Status
            FROM dbo.Disposal_Items i
            JOIN dbo.Disposal_Runs r ON r.RunID = i.RunID
            WHERE i.AssetNo LIKE @q
            ORDER BY i.CreatedAt DESC`);
        res.json({
            success: true,
            data: r.recordset.map((x) => ({
                itemId: x.ItemID,
                assetNo: x.AssetNo,
                assetName: x.AssetName,
                createdByName: x.CreatedByName || x.CreatedBy,
                createdAt: x.CreatedAt,
                runId: x.RunID,
                runCode: x.RunCode,
                runStatus: x.Status,
            })),
        });
    } catch (err) {
        console.error('searchAssetAcrossRuns error:', err);
        res.status(500).json({ error: 'ค้นหาไม่สำเร็จ' });
    }
};

// ─── DELETE /disposal/runs/:id ─────────────────────────────────────────────
// ลบรอบทั้งรอบ (รายการ + รูปภาพ) — เฉพาะผู้ที่เปิดรอบนั้น และต้องมีสิทธิ์ลบ
export const deleteRun = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const run = await findRun(pool, runId);
        if (!run) return res.status(404).json({ error: 'ไม่พบรอบ Disposal นี้' });

        const actor = getActor(req);
        if (!isAdminReq(req) && (!actor.by || String(run.CreatedBy || '').toUpperCase() !== actor.by.toUpperCase())) {
            return res.status(403).json({ error: 'ลบรอบได้เฉพาะผู้ที่เปิดรอบนี้หรือ Admin เท่านั้น' });
        }

        res.locals.auditSummary = run.RunCode;
        // ลบรายการและรอบพร้อมกันใน transaction เดียว
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const rAtt = new sql.Request(tx);
            await rAtt.input('id', sql.Int, runId).query('DELETE FROM dbo.Disposal_Attachments WHERE RunID = @id');
            const r = new sql.Request(tx);
            await r.input('id', sql.Int, runId).query('DELETE FROM dbo.Disposal_Events WHERE RunID = @id');
            const rEv = new sql.Request(tx);
            await rEv.input('id', sql.Int, runId).query('DELETE FROM dbo.Disposal_Items WHERE RunID = @id');
            const r2 = new sql.Request(tx);
            await r2.input('id', sql.Int, runId).query('DELETE FROM dbo.Disposal_Runs WHERE RunID = @id');
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            throw e;
        }

        // ลบโฟลเดอร์รูปของรอบ (หลังลบ DB สำเร็จแล้วเท่านั้น)
        fs.rm(path.join(UPLOAD_ROOT, String(runId)), { recursive: true, force: true }, () => {});
        res.json({ success: true });
    } catch (err) {
        console.error('deleteRun error:', err);
        res.status(500).json({ error: 'ลบรอบ Disposal ไม่สำเร็จ' });
    }
};

// ─── POST /disposal/runs/:id/items ─────────────────────────────────────────
// multipart: assetNo, assetDate, assetName, place, costCenter, cost, accumDP, bkAmt + pic1/pic2 (ไม่บังคับ)
const REQUIRED_COST_CENTER = '7510';

export const addItem = async (req, res) => {
    const files = req.files || {};
    const body = req.body || {};
    const fail = (status, error) => {
        removeUploaded(files);
        return res.status(status).json({ error });
    };

    const assetNo = textOrNull(body.assetNo, 50);
    if (!assetNo) return fail(400, 'กรุณาระบุ ASSET NO');
    // บันทึกได้เฉพาะ COSTCENTER 7510 เท่านั้น
    if (String(body.costCenter ?? '').trim() !== REQUIRED_COST_CENTER) {
        return fail(400, `บันทึกได้เฉพาะ COSTCENTER ${REQUIRED_COST_CENTER} เท่านั้น`);
    }

    const cost = numOrNull(body.cost);
    const accumDP = numOrNull(body.accumDP);
    const bkAmt = numOrNull(body.bkAmt);
    if ([cost, accumDP, bkAmt].some((n) => Number.isNaN(n))) return fail(400, 'ค่าเงิน (COST / ACCUMDP / BKAMT) ไม่ถูกต้อง');

    let assetDate = null;
    if (body.assetDate) {
        const d = new Date(body.assetDate);
        if (!Number.isNaN(d.getTime())) assetDate = d;
    }

    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const run = await findRun(pool, runId);
        if (!run) return fail(404, 'ไม่พบรอบ Disposal นี้');
        if (run.Status !== 'Open') return fail(409, 'รอบนี้ปิดแล้ว ไม่สามารถเพิ่มรายการได้');
        // ตั้งแต่ขั้นที่ 3 "ผู้บริหารอนุมัติ" เป็นต้นไป ห้ามเพิ่มรายการ (กันข้อมูลไม่ตรงกับเอกสารที่ส่งผู้บริหาร)
        if ((Number(run.Stage) || 1) >= 3) return fail(409, 'รอบนี้อยู่ขั้นผู้บริหารอนุมัติแล้ว ไม่สามารถเพิ่มรายการได้');

        const dup = await pool.request().input('id', sql.Int, runId).input('no', sql.NVarChar(50), assetNo)
            .query('SELECT 1 AS x FROM dbo.Disposal_Items WHERE RunID = @id AND AssetNo = @no');
        if (dup.recordset[0]) return fail(409, `ASSET NO ${assetNo} มีอยู่ในรอบนี้แล้ว`);

        const picUrl = (f) => `${PIC_PUBLIC_PREFIX}/${runId}/${path.basename(f.path)}`;
        const actor = getActor(req);

        const ins = await pool.request()
            .input('runId', sql.Int, runId)
            .input('assetNo', sql.NVarChar(50), assetNo)
            .input('assetDate', sql.DateTime, assetDate)
            .input('assetName', sql.NVarChar(300), textOrNull(body.assetName, 300))
            .input('place', sql.NVarChar(300), textOrNull(body.place, 300))
            .input('costCenter', sql.NVarChar(50), textOrNull(body.costCenter, 50))
            .input('cost', sql.Decimal(18, 2), cost)
            .input('accumDP', sql.Decimal(18, 2), accumDP)
            .input('bkAmt', sql.Decimal(18, 2), bkAmt)
            .input('pic1', sql.NVarChar(300), files.pic1?.[0] ? picUrl(files.pic1[0]) : null)
            .input('pic2', sql.NVarChar(300), files.pic2?.[0] ? picUrl(files.pic2[0]) : null)
            .input('by', sql.NVarChar(100), actor.by)
            .input('name', sql.NVarChar(150), actor.name)
            .query(`INSERT INTO dbo.Disposal_Items
                        (RunID, AssetNo, AssetDate, AssetName, Place, CostCenter, Cost, AccumDP, BkAmt,
                         Pic1Path, Pic2Path, CreatedBy, CreatedByName)
                    OUTPUT inserted.*
                    VALUES (@runId, @assetNo, @assetDate, @assetName, @place, @costCenter, @cost, @accumDP, @bkAmt,
                            @pic1, @pic2, @by, @name)`);

        res.locals.auditSummary = assetNo;
        await logEvent(runId, 'ADD_ITEM', actor, assetNo);
        res.status(201).json({ success: true, data: mapItem(ins.recordset[0]) });
    } catch (err) {
        if (err.number === 2627 || err.number === 2601) return fail(409, `ASSET NO ${assetNo} มีอยู่ในรอบนี้แล้ว`);
        console.error('addItem error:', err);
        return fail(500, 'บันทึกรายการ Disposal ไม่สำเร็จ');
    }
};

// ─── PUT /disposal/runs/:id/items/:itemId/photos ───────────────────────────
// แนบ/เปลี่ยนรูปทีหลังได้ (ส่ง pic1 หรือ pic2 อย่างใดอย่างหนึ่งหรือทั้งคู่) — ทำได้ทั้งตอนรอบเปิดและปิดแล้ว
export const updateItemPhotos = async (req, res) => {
    const files = req.files || {};
    const fail = (status, error) => {
        removeUploaded(files);
        return res.status(status).json({ error });
    };
    if (!isId(req.params.itemId)) return fail(400, 'Invalid item id');
    if (!files.pic1?.[0] && !files.pic2?.[0]) return fail(400, 'กรุณาเลือกรูปอย่างน้อย 1 รูป');

    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const r = await pool.request()
            .input('id', sql.Int, Number(req.params.itemId))
            .input('runId', sql.Int, runId)
            .query('SELECT ItemID, AssetNo, Pic1Path, Pic2Path FROM dbo.Disposal_Items WHERE ItemID = @id AND RunID = @runId');
        const item = r.recordset[0];
        if (!item) return fail(404, 'ไม่พบรายการนี้ในรอบนี้');

        const pic1 = files.pic1?.[0] ? `${PIC_PUBLIC_PREFIX}/${runId}/${path.basename(files.pic1[0].path)}` : item.Pic1Path;
        const pic2 = files.pic2?.[0] ? `${PIC_PUBLIC_PREFIX}/${runId}/${path.basename(files.pic2[0].path)}` : item.Pic2Path;

        await pool.request()
            .input('id', sql.Int, item.ItemID)
            .input('pic1', sql.NVarChar(300), pic1)
            .input('pic2', sql.NVarChar(300), pic2)
            .query('UPDATE dbo.Disposal_Items SET Pic1Path = @pic1, Pic2Path = @pic2 WHERE ItemID = @id');

        res.locals.auditSummary = item.AssetNo;
        await logEvent(runId, 'PHOTO', getActor(req), `ItemID ${item.ItemID}${files.pic1?.[0] ? ' pic1' : ''}${files.pic2?.[0] ? ' pic2' : ''}`);

        // ลบไฟล์เดิมที่ถูกแทนที่แล้ว
        if (files.pic1?.[0] && item.Pic1Path) unlinkPic(runId, item.Pic1Path);
        if (files.pic2?.[0] && item.Pic2Path) unlinkPic(runId, item.Pic2Path);

        res.json({ success: true, data: { itemId: item.ItemID, pic1Url: pic1, pic2Url: pic2 } });
    } catch (err) {
        console.error('updateItemPhotos error:', err);
        return fail(500, 'แนบรูปไม่สำเร็จ');
    }
};

// ─── PUT /disposal/runs/:id/doc ──────────────────────────────
// บันทึก/แก้ไขเลขเอกสารบัญชีของทั้งรอบ (ว่าง = ล้างค่า) — ทำได้ทั้งตอนรอบเปิดและปิดแล้ว
export const updateRunDoc = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    const docNo = textOrNull(req.body?.accountingDocNo, 50);
    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const r = await pool.request().input('id', sql.Int, runId)
            .query('SELECT RunID, RunCode, Stage, AccountingDocNo FROM dbo.Disposal_Runs WHERE RunID = @id');
        const run = r.recordset[0];
        if (!run) return res.status(404).json({ error: 'ไม่พบรอบ Disposal นี้' });
        // ตั้งแต่ขั้นที่ 3 ต้องมีเลขเอกสารบัญชีแล้ว จึงแก้ไขหรือล้างเลขไม่ได้ (ต้องย้อนขั้นตอนก่อน)
        if ((Number(run.Stage) || 1) >= 3 && (run.AccountingDocNo ?? null) !== docNo) {
            return res.status(409).json({ error: 'แก้ไขเลขเอกสารบัญชีไม่ได้ เพราะรอบถึงขั้นที่ 3 แล้ว (ย้อนขั้นตอนก่อน)' });
        }

        await pool.request()
            .input('id', sql.Int, runId)
            .input('doc', sql.NVarChar(50), docNo)
            .query('UPDATE dbo.Disposal_Runs SET AccountingDocNo = @doc WHERE RunID = @id');

        res.locals.auditSummary = run.RunCode;
        await logEvent(runId, 'DOC', getActor(req), `เลขเอกสารบัญชี ${docNo ?? '(ล้าง)'}`);
        res.json({ success: true, data: { runId, accountingDocNo: docNo } });
    } catch (err) {
        console.error('updateRunDoc error:', err);
        res.status(500).json({ error: 'บันทึกเลขเอกสารไม่สำเร็จ' });
    }
};

// ─── ขั้นตอนของรอบ (progress bar 5 ขั้น) ────────────────────────────────────────
const STAGE_LABEL = {
    1: 'บันทึกและถ่ายภาพ',
    2: 'จัดทำเอกสารบัญชี',
    3: 'ผู้บริหารอนุมัติ',
    4: 'ส่งฝ่ายบัญชี',
    5: 'รอจำหน่ายจริง',
    6: 'ทำทิ้งแล้ว',
};

// เงื่อนไขที่ต้องครบก่อนเข้าแต่ละขั้น (เดินหน้าทีละขั้นเท่านั้น) — คืนข้อความที่ยังขาด หรือ null ถ้าผ่าน
const stageGateError = async (pool, run, target) => {
    const counts = await pool.request().input('id', sql.Int, run.RunID).query(`
        SELECT
          (SELECT COUNT(*) FROM dbo.Disposal_Items WHERE RunID = @id) AS ItemCount,
          (SELECT COUNT(*) FROM dbo.Disposal_Items WHERE RunID = @id AND (Pic1Path IS NULL OR Pic2Path IS NULL)) AS MissingPhotos,
          (SELECT COUNT(*) FROM dbo.Disposal_Attachments WHERE RunID = @id AND DocType = 'DOC_ACCOUNTING') AS DocAccounting,
          (SELECT COUNT(*) FROM dbo.Disposal_Attachments WHERE RunID = @id AND DocType = 'DOC_APPROVED') AS DocApproved,
          (SELECT COUNT(*) FROM dbo.Disposal_Attachments WHERE RunID = @id AND DocType = 'DOC_SENT_ACCOUNTING') AS DocSent,
          (SELECT COUNT(*) FROM dbo.Disposal_Attachments WHERE RunID = @id AND DocType = 'DISPOSED_PHOTO') AS DisposedPhotos`);
    const c = counts.recordset[0];
    const photosOk = c.ItemCount > 0 && c.MissingPhotos === 0;
    if (target >= 2 && !photosOk) return 'ต้องแนบรูปให้ครบ 2 รูปทุกรายการก่อน';
    if (target >= 3) {
        if (!run.AccountingDocNo) return 'ต้องกรอกเลขเอกสารบัญชีของรอบก่อน';
        if (!c.DocAccounting) return 'ต้องแนบเอกสารบัญชีก่อน';
    }
    if (target >= 4 && !c.DocApproved) return 'ต้องแนบเอกสารที่ผู้บริหารอนุมัติก่อน';
    if (target >= 5 && !c.DocSent) return 'ต้องแนบหลักฐานส่งฝ่ายบัญชีก่อน';
    if (target >= 6 && c.DisposedPhotos < 3) return 'ต้องแนบรูปหลักฐานการทิ้งให้ครบ 3 รูปก่อน';
    return null;
};
// PUT /disposal/runs/:id/stage  body: { stage: 1..5 }
export const setRunStage = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    const stage = Number(req.body?.stage);
    if (!Number.isInteger(stage) || !STAGE_LABEL[stage]) return res.status(400).json({ error: 'ขั้นตอนไม่ถูกต้อง' });
    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const run = await findRun(pool, runId);
        if (!run) return res.status(404).json({ error: 'ไม่พบรอบ Disposal นี้' });
        // ถ้าทำเป็นเสร็จสิ้นแล้ว ต้องยกเลิกเสร็จสิ้นก่อน จึงจะเปลี่ยนขั้นได้ (กันสถานะไม่ตรงกัน)
        if (run.CompletedAt) return res.status(409).json({ error: 'รอบนี้เสร็จสิ้นแล้ว ต้องยกเลิกเสร็จสิ้นก่อนจึงจะเปลี่ยนขั้นได้' });
        const current = Number(run.Stage) || 1;
        // ขั้นที่ 6 ตั้งได้ด้วยปุ่มทำเป็นเสร็จสิ้นเท่านั้น
        if (stage === 6) return res.status(409).json({ error: 'ขั้นที่ 6 ตั้งได้จากปุ่มทำเป็นเสร็จสิ้นเท่านั้น' });
        // เดินหน้าหรือถอยกลับได้ทีละ 1 ขั้นเท่านั้น ห้ามข้ามขั้น
        if (Math.abs(stage - current) !== 1) return res.status(409).json({ error: 'เปลี่ยนสถานะได้ทีละ 1 ขั้นเท่านั้น' });
        // รอบที่ปิดแล้วต้องอยู่ขั้นที่ 2 ขึ้นไป (ตรงกับกฎการปิดรอบ)
        if (run.Status === 'Closed' && stage < 2) return res.status(409).json({ error: 'รอบที่ปิดแล้วต้องอยู่ที่ขั้นที่ 2 ขึ้นไป' });
        // เดินหน้าเข้าขั้นใหม่ต้องผ่านเงื่อนไขของขั้นนั้นก่อน
        if (stage > current) {
            const gate = await stageGateError(pool, run, stage);
            if (gate) return res.status(409).json({ error: gate });
        }
        await pool.request()
            .input('id', sql.Int, runId)
            .input('stage', sql.Int, stage)
            .query('UPDATE dbo.Disposal_Runs SET Stage = @stage WHERE RunID = @id');
        res.locals.auditSummary = `${run.RunCode} → ${STAGE_LABEL[stage]}`;
        await logEvent(runId, 'STAGE', getActor(req), `ขั้นที่ ${stage}: ${STAGE_LABEL[stage]}`);
        res.json({ success: true, data: { runId, stage } });
    } catch (err) {
        console.error('setRunStage error:', err);
        res.status(500).json({ error: 'เปลี่ยนขั้นตอนไม่สำเร็จ' });
    }
};

// ─── ตรวจนับรายการในรอบ (สแกน QR/Barcode หรือพิมพ์ ASSET NO) ─────────────────
const setItemChecked = async (pool, itemId, checked, actor) => {
    await pool.request()
        .input('id', sql.Int, itemId)
        .input('checked', sql.Bit, checked ? 1 : 0)
        .input('by', sql.NVarChar(100), checked ? (actor?.by ?? null) : null)
        .input('name', sql.NVarChar(150), checked ? (actor?.name ?? null) : null)
        .query(`UPDATE dbo.Disposal_Items
                SET IsChecked = @checked,
                    CheckedAt = CASE WHEN @checked = 1 THEN GETDATE() ELSE NULL END,
                    CheckedBy = @by,
                    CheckedByName = @name
                WHERE ItemID = @id`);
};

// POST /disposal/runs/:id/scan  body: { code }
// ผลลัพธ์: checked (ตรวจสำเร็จ) | duplicate (ตรวจไปแล้ว) | notfound (ไม่อยู่ในรอบนี้)
export const scanItem = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    const code = String(req.body?.code ?? '').trim().toUpperCase().slice(0, 30);
    if (!code) return res.status(400).json({ error: 'กรุณาระบุรหัส' });
    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const r = await pool.request()
            .input('runId', sql.Int, runId)
            .input('no', sql.NVarChar(30), code)
            .query('SELECT ItemID, AssetNo, IsChecked FROM dbo.Disposal_Items WHERE RunID = @runId AND AssetNo = @no');
        const item = r.recordset[0];
        if (!item) return res.json({ success: true, status: 'notfound', code });
        if (item.IsChecked) return res.json({ success: true, status: 'duplicate', code, itemId: item.ItemID });

        const actor = getActor(req);
        await setItemChecked(pool, item.ItemID, true, actor);
        res.locals.auditSummary = item.AssetNo;
        await logEvent(runId, 'CHECK', actor, `ItemID ${item.ItemID} ${item.AssetNo}`);
        res.json({ success: true, status: 'checked', code, itemId: item.ItemID });
    } catch (err) {
        console.error('scanItem error:', err);
        res.status(500).json({ error: 'บันทึกการตรวจนับไม่สำเร็จ' });
    }
};

// PUT /disposal/runs/:id/items/:itemId/check  body: { checked: true|false }
export const setItemCheck = async (req, res) => {
    if (!isId(req.params.id) || !isId(req.params.itemId)) return res.status(400).json({ error: 'Invalid id' });
    const checked = req.body?.checked === true;
    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const r = await pool.request()
            .input('id', sql.Int, Number(req.params.itemId))
            .input('runId', sql.Int, runId)
            .query('SELECT ItemID, AssetNo FROM dbo.Disposal_Items WHERE ItemID = @id AND RunID = @runId');
        const item = r.recordset[0];
        if (!item) return res.status(404).json({ error: 'ไม่พบรายการนี้ในรอบนี้' });

        const actor = getActor(req);
        await setItemChecked(pool, item.ItemID, checked, actor);
        res.locals.auditSummary = item.AssetNo;
        await logEvent(runId, checked ? 'CHECK' : 'UNCHECK', actor, `ItemID ${item.ItemID} ${item.AssetNo}`);
        res.json({ success: true, data: { itemId: item.ItemID, isChecked: checked } });
    } catch (err) {
        console.error('setItemCheck error:', err);
        res.status(500).json({ error: 'บันทึกการตรวจนับไม่สำเร็จ' });
    }
};

// ─── สถานะ "กรอกลงระบบบัญชีแล้ว" ของรายการ ─────────────────────────────────────
// PUT /disposal/runs/:id/keyed  body: { itemIds: [number], keyed: true|false }
// รองรับติ๊กทีละรายการหรือหลายรายการพร้อมกัน (ไม่เกิน 500 รายการต่อครั้ง)
export const setItemsKeyed = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    const keyed = req.body?.keyed === true;
    const raw = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
    const ids = [...new Set(raw.map((x) => Number(x)))];
    if (!ids.length) return res.status(400).json({ error: 'กรุณาเลือกรายการอย่างน้อย 1 รายการ' });
    if (ids.length > 500) return res.status(400).json({ error: 'เลือกได้ไม่เกิน 500 รายการต่อครั้ง' });
    if (!ids.every((n) => Number.isInteger(n) && n > 0)) return res.status(400).json({ error: 'Invalid item id' });
    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const names = ids.map((_, i) => `@id${i}`);
        const reqQ = pool.request().input('runId', sql.Int, runId);
        ids.forEach((id, i) => reqQ.input(`id${i}`, sql.Int, id));
        const found = await reqQ.query(`SELECT ItemID, AssetNo FROM dbo.Disposal_Items
                                        WHERE RunID = @runId AND ItemID IN (${names.join(',')})`);
        if (found.recordset.length !== ids.length) {
            return res.status(404).json({ error: 'มีบางรายการไม่อยู่ในรอบนี้' });
        }

        const actor = getActor(req);
        const upQ = pool.request()
            .input('keyed', sql.Bit, keyed ? 1 : 0)
            .input('by', sql.NVarChar(100), keyed ? (actor?.by ?? null) : null)
            .input('name', sql.NVarChar(150), keyed ? (actor?.name ?? null) : null)
            .input('runId', sql.Int, runId);
        ids.forEach((id, i) => upQ.input(`id${i}`, sql.Int, id));
        await upQ.query(`UPDATE dbo.Disposal_Items
                         SET IsKeyed = @keyed,
                             KeyedAt = CASE WHEN @keyed = 1 THEN GETDATE() ELSE NULL END,
                             KeyedBy = @by,
                             KeyedByName = @name
                         WHERE RunID = @runId AND ItemID IN (${names.join(',')})`);

        res.locals.auditSummary = `${ids.length} รายการ`;
        // บันทึกประวัติแยกทีละรายการ (รูปแบบ "ItemID n ASSETNO" เหมือนตรวจนับ) เพื่อให้ขึ้นในประวัติของแต่ละรายการ
        for (const x of found.recordset) {
            await logEvent(runId, keyed ? 'KEYED' : 'UNKEYED', actor, `ItemID ${x.ItemID} ${x.AssetNo}`);
        }
        res.json({
            success: true,
            data: {
                itemIds: ids,
                isKeyed: keyed,
                keyedByName: keyed ? (actor?.name || actor?.by || null) : null,
                keyedAt: keyed ? new Date().toISOString() : null,
            },
        });
    } catch (err) {
        console.error('setItemsKeyed error:', err);
        res.status(500).json({ error: 'บันทึกสถานะการกรอกบัญชีไม่สำเร็จ' });
    }
};

// ─── GET /disposal/runs/:id/report ─────────────────────────────────────────
// รายงานของรอบ: ยอดรวม, แยกตาม COSTCENTER, แยกตามผู้บันทึก, รายการที่ยังไม่มีรูป
export const getRunReport = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    try {
        const pool = getPool();
        const runId = Number(req.params.id);
        const runRes = await pool.request().input('id', sql.Int, runId)
            .query('SELECT RunID, RunCode, Status, CreatedBy, CreatedByName, CreatedAt, ClosedBy, ClosedAt FROM dbo.Disposal_Runs WHERE RunID = @id');
        const runRow = runRes.recordset[0];
        if (!runRow) return res.status(404).json({ error: 'ไม่พบรอบ Disposal นี้' });

        const itemRes = await pool.request().input('id', sql.Int, runId)
            .query('SELECT * FROM dbo.Disposal_Items WHERE RunID = @id ORDER BY ItemID ASC');
        const items = itemRes.recordset.map(mapItem);

        const round2 = (n) => Math.round(n * 100) / 100;
        const group = (keyFn) => {
            const m = new Map();
            for (const it of items) {
                const k = keyFn(it);
                const g = m.get(k) || { key: k, count: 0, cost: 0, accumDP: 0, bkAmt: 0 };
                g.count += 1;
                g.cost += Number(it.cost) || 0;
                g.accumDP += Number(it.accumDP) || 0;
                g.bkAmt += Number(it.bkAmt) || 0;
                m.set(k, g);
            }
            return [...m.values()]
                .map((g) => ({ ...g, cost: round2(g.cost), accumDP: round2(g.accumDP), bkAmt: round2(g.bkAmt) }))
                .sort((a, b) => b.cost - a.cost);
        };

        // ช่วงวันที่ของสินทรัพย์ในรอบ (ASSET DATE เก่าสุด–ใหม่สุด)
        const assetTimes = items.map((it) => (it.assetDate ? new Date(it.assetDate).getTime() : NaN)).filter((t) => !Number.isNaN(t));
        // วันที่บันทึก (ตามวันเวลาท้องถิ่นของ server)
        const dayKey = (v) => {
            const d = new Date(v);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        const missing = items.filter((it) => !it.pic1Url || !it.pic2Url);
        const sum = (k) => round2(items.reduce((s, it) => s + (Number(it[k]) || 0), 0));

        res.json({
            success: true,
            run: {
                runId: runRow.RunID,
                runCode: runRow.RunCode,
                status: runRow.Status,
                createdByName: runRow.CreatedByName,
                createdAt: runRow.CreatedAt,
                closedBy: runRow.ClosedBy,
                closedAt: runRow.ClosedAt,
            },
            summary: {
                itemCount: items.length,
                withPhotos: items.length - missing.length,
                missingPhotos: missing.length,
                totalCost: sum('cost'),
                totalAccumDP: sum('accumDP'),
                totalBkAmt: sum('bkAmt'),
                firstAssetDate: assetTimes.length ? new Date(Math.min(...assetTimes)) : null,
                lastAssetDate: assetTimes.length ? new Date(Math.max(...assetTimes)) : null,
            },
            byDay: group((it) => dayKey(it.createdAt)).sort((a, b) => (a.key < b.key ? -1 : 1)),
            byCostCenter: group((it) => it.costCenter || '-'),
            byRecorder: group((it) => it.createdByName || it.createdBy || '-'),
            missingPhotoItems: missing.map((it) => ({
                itemId: it.itemId,
                assetNo: it.assetNo,
                assetName: it.assetName,
                hasPic1: !!it.pic1Url,
                hasPic2: !!it.pic2Url,
            })),
        });
    } catch (err) {
        console.error('getRunReport error:', err);
        res.status(500).json({ error: 'โหลดรายงาน Disposal ไม่สำเร็จ' });
    }
};

// ─── DELETE /disposal/items/:itemId ────────────────────────────────────────
// ลบได้เฉพาะรายการในรอบที่ยังเปิดอยู่ (ลบรูปที่เกี่ยวข้องด้วย)
export const deleteItem = async (req, res) => {
    if (!isId(req.params.itemId)) return res.status(400).json({ error: 'Invalid item id' });
    try {
        const pool = getPool();
        const r = await pool.request().input('id', sql.Int, Number(req.params.itemId)).query(`
            SELECT i.ItemID, i.AssetNo, i.RunID, i.Pic1Path, i.Pic2Path, r.Status, r.Stage
            FROM dbo.Disposal_Items i
            JOIN dbo.Disposal_Runs r ON r.RunID = i.RunID
            WHERE i.ItemID = @id`);
        const item = r.recordset[0];
        if (!item) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
        if (item.Status !== 'Open') return res.status(409).json({ error: 'รอบนี้ปิดแล้ว ไม่สามารถลบรายการได้' });
        // ตั้งแต่ขั้นที่ 3 "ผู้บริหารอนุมัติ" ห้ามลบรายการ (ตรงกับการล็อกการเพิ่ม)
        if ((Number(item.Stage) || 1) >= 3) return res.status(409).json({ error: 'รอบอยู่ขั้นผู้บริหารอนุมัติแล้ว ไม่สามารถลบรายการได้' });

        await pool.request().input('id', sql.Int, Number(req.params.itemId))
            .query('DELETE FROM dbo.Disposal_Items WHERE ItemID = @id');

        res.locals.auditSummary = item.AssetNo;
        await logEvent(item.RunID, 'DELETE_ITEM', getActor(req), `ItemID ${item.ItemID}`);
        for (const p of [item.Pic1Path, item.Pic2Path]) {
            if (!p) continue;
            fs.unlink(path.join(UPLOAD_ROOT, String(item.RunID), path.basename(p)), () => {});
        }
        res.json({ success: true });
    } catch (err) {
        console.error('deleteItem error:', err);
        res.status(500).json({ error: 'ลบรายการ Disposal ไม่สำเร็จ' });
    }
};

// ─── ไฟล์แนบของรอบ (PDF หลักฐาน เช่น บช. ดำเนินการทิ้งเสร็จแล้ว) ─────────────────────
const DOC_MAX_BYTES = 20 * 1024 * 1024;
const DOC_TYPES = ['ACCOUNTING_DONE', 'APPROVAL', 'OTHER', 'DOC_ACCOUNTING', 'DOC_APPROVED', 'DOC_SENT_ACCOUNTING', 'DISPOSED_PHOTO'];
// รูปหลักฐานการทิ้ง (DISPOSED_PHOTO) เป็นรูปภาพ ที่เหลือเป็น PDF
const IMAGE_EXT = ['.jpg', '.jpeg', '.png'];
const isPhotoType = (docType) => docType === 'DISPOSED_PHOTO';

const docStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(UPLOAD_ROOT, String(req.params.id), 'docs');
        fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
});

const uploadDoc = multer({
    storage: docStorage,
    limits: { fileSize: DOC_MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.pdf' && !IMAGE_EXT.includes(ext)) {
            return cb(new Error('รองรับเฉพาะไฟล์ PDF หรือรูปภาพ (JPG/PNG)'));
        }
        cb(null, true);
    },
});

// Route middleware สำหรับ POST /runs/:id/attachments (multipart: file + docType + title)
export const uploadDisposalDoc = (req, res, next) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    uploadDoc.single('file')(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกิน 20 MB' : err.message;
            return res.status(400).json({ error: msg });
        }
        next();
    });
};

const mapAttachment = (r) => ({
    attachmentId: r.AttachmentID,
    docType: r.DocType,
    title: r.Title,
    fileName: r.FileName,
    fileSize: r.FileSize,
    uploadedBy: r.UploadedBy,
    uploadedByName: r.UploadedByName,
    uploadedAt: r.UploadedAt,
});

const attachmentPath = (runId, storedName) =>
    path.join(UPLOAD_ROOT, String(runId), 'docs', path.basename(storedName));

// ─── GET /disposal/runs/:id/attachments ───────────────────────────────────────────
export const listAttachments = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid run id' });
    try {
        const r = await getPool().request().input('id', sql.Int, Number(req.params.id))
            .query('SELECT AttachmentID, DocType, Title, FileName, FileSize, UploadedBy, UploadedByName, UploadedAt FROM dbo.Disposal_Attachments WHERE RunID = @id ORDER BY UploadedAt DESC, AttachmentID DESC');
        res.json({ success: true, data: r.recordset.map(mapAttachment) });
    } catch (err) {
        console.error('listAttachments error:', err);
        res.status(500).json({ error: 'โหลดเอกสารแนบไม่สำเร็จ' });
    }
};

// ─── POST /disposal/runs/:id/attachments ──────────────────────────────────────────
export const addAttachment = async (req, res) => {
    const runId = Number(req.params.id);
    const file = req.file;
    const discard = () => { if (file) fs.unlink(file.path, () => {}); };
    try {
        const pool = getPool();
        const run = await findRun(pool, runId);
        if (!run) { discard(); return res.status(404).json({ error: 'ไม่พบรอบนี้' }); }
        if (!file) return res.status(400).json({ error: 'กรุณาเลือกไฟล์ PDF' });

        const docType = DOC_TYPES.includes(req.body.docType) ? req.body.docType : 'OTHER';
        // ตรวจชนิดไฟล์จากหัวไฟล์จริง (ไม่เชื่อแค่นามสกุล) ให้ตรงกับประเภทเอกสาร
        const head = Buffer.alloc(8);
        const fd = fs.openSync(file.path, 'r');
        fs.readSync(fd, head, 0, 8, 0);
        fs.closeSync(fd);
        const isPdfHead = head.subarray(0, 5).toString('latin1') === '%PDF-';
        const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
        const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
        const isImage = isJpeg || isPng;
        // รูปหลักฐานการทิ้ง ต้องเป็นรูปเท่านั้น ส่วนประเภทอื่นแนบได้ทั้ง PDF และรูป (JPG/PNG)
        const allowed = isPhotoType(docType) ? isImage : (isPdfHead || isImage);
        if (!allowed) {
            discard();
            return res.status(400).json({ error: isPhotoType(docType) ? 'รูปหลักฐานต้องเป็นไฟล์ JPG หรือ PNG' : 'รองรับเฉพาะไฟล์ PDF หรือรูป JPG/PNG' });
        }

        const title = textOrNull(req.body.title, 200);
        const actor = getActor(req);
        const originalName = textOrNull(path.basename(file.originalname), 260) || 'document.pdf';

        const ins = await pool.request()
            .input('runId', sql.Int, runId)
            .input('docType', sql.NVarChar(50), docType)
            .input('title', sql.NVarChar(200), title)
            .input('fileName', sql.NVarChar(260), originalName)
            .input('storedName', sql.NVarChar(260), path.basename(file.path))
            .input('size', sql.Int, file.size)
            .input('by', sql.NVarChar(100), actor.by)
            .input('byName', sql.NVarChar(150), actor.name)
            .query(`INSERT INTO dbo.Disposal_Attachments (RunID, DocType, Title, FileName, StoredName, FileSize, UploadedBy, UploadedByName)
                    OUTPUT INSERTED.AttachmentID, INSERTED.DocType, INSERTED.Title, INSERTED.FileName, INSERTED.FileSize, INSERTED.UploadedBy, INSERTED.UploadedByName, INSERTED.UploadedAt
                    VALUES (@runId, @docType, @title, @fileName, @storedName, @size, @by, @byName)`);

        res.locals.auditSummary = originalName;
        await logEvent(runId, 'ATTACH', actor, `${originalName}${title ? ` (${title})` : ''}`);
        res.status(201).json({ success: true, data: mapAttachment(ins.recordset[0]) });
    } catch (err) {
        discard();
        console.error('addAttachment error:', err);
        res.status(500).json({ error: 'แนบเอกสารไม่สำเร็จ' });
    }
};

// ─── GET /disposal/attachments/:id/file (ต้องล็อกอิน) ─────────────────────────────
export const getAttachmentFile = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    try {
        const r = await getPool().request().input('id', sql.Int, Number(req.params.id))
            .query('SELECT RunID, StoredName, FileName FROM dbo.Disposal_Attachments WHERE AttachmentID = @id');
        const row = r.recordset[0];
        if (!row) return res.status(404).json({ error: 'ไม่พบไฟล์แนบ' });
        const abs = attachmentPath(row.RunID, row.StoredName);
        if (!fs.existsSync(abs)) return res.status(404).json({ error: 'ไม่พบไฟล์บนเซิร์ฟเวอร์' });
        const ext = path.extname(row.StoredName).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'application/pdf';
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.FileName)}`);
        res.sendFile(abs);
    } catch (err) {
        console.error('getAttachmentFile error:', err);
        res.status(500).json({ error: 'เปิดไฟล์ไม่สำเร็จ' });
    }
};

// ประเภทเอกสาร → ขั้นที่ต้องใช้เอกสารนั้นผ่าน (ถ้ารอบถึงขั้นนี้แล้ว ห้ามลบเอกสาร)
const DOC_LOCK_STAGE = { DOC_ACCOUNTING: 3, DOC_APPROVED: 4, DOC_SENT_ACCOUNTING: 5, DISPOSED_PHOTO: 6 };

// ─── DELETE /disposal/attachments/:id ─────────────────────────────────────────────
export const deleteAttachment = async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    try {
        const pool = getPool();
        const r = await pool.request().input('id', sql.Int, Number(req.params.id))
            .query(`SELECT a.RunID, a.StoredName, a.FileName, a.DocType, r.Stage
                    FROM dbo.Disposal_Attachments a JOIN dbo.Disposal_Runs r ON r.RunID = a.RunID
                    WHERE a.AttachmentID = @id`);
        const row = r.recordset[0];
        if (!row) return res.status(404).json({ error: 'ไม่พบไฟล์แนบ' });
        // เอกสารที่ใช้ผ่านเงื่อนไขขั้นแล้ว ลบไม่ได้ (ต้องย้อนขั้นตอนก่อน)
        const lockStage = DOC_LOCK_STAGE[row.DocType];
        if (lockStage && (Number(row.Stage) || 1) >= lockStage) {
            return res.status(409).json({ error: `ลบเอกสารนี้ไม่ได้ เพราะรอบผ่านขั้นที่ ${lockStage} แล้ว (ย้อนขั้นตอนก่อน)` });
        }

        await pool.request().input('id', sql.Int, Number(req.params.id))
            .query('DELETE FROM dbo.Disposal_Attachments WHERE AttachmentID = @id');
        res.locals.auditSummary = row.FileName;
        await logEvent(row.RunID, 'ATTACH_DELETE', getActor(req), row.FileName);
        fs.unlink(attachmentPath(row.RunID, row.StoredName), () => {});
        res.json({ success: true });
    } catch (err) {
        console.error('deleteAttachment error:', err);
        res.status(500).json({ error: 'ลบไฟล์แนบไม่สำเร็จ' });
    }
};
