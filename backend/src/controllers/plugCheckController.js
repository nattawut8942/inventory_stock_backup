import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { sql, getPool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '../../uploads/plug-check');
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Fiscal year runs Apr..Mar; month index 0 = Apr ... 11 = Mar
const RESULTS = ['ok', 'bad', 'use', 'fix'];
const SIGN_LEVELS = {
    TOP: ['TE', 'EN'],
    BOT: ['SE', 'S.EN', 'EN']
};
const UNLOCK_LEVELS = ['EN'];

const normPos = (p) => String(p || '').toUpperCase().replace(/\s+/g, '').replace(/^SEN$/, 'S.EN');

const currentFiscal = () => {
    const now = new Date();
    return {
        fiscalYear: now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1,
        monthIdx: (now.getMonth() + 9) % 12
    };
};

const wrap = (label, fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        console.error(`[PlugCheck] ${label} error:`, err);
        if (!res.headersSent) res.status(500).json({ success: false, error: err.message || 'Database error' });
    }
};

const saveImage = async (file) => {
    if (!file) throw Object.assign(new Error('Image file is required'), { status: 400 });
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
        throw Object.assign(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP are allowed.'), { status: 400 });
    }
    fs.mkdirSync(uploadDir, { recursive: true });
    const fileName = `plug-${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.name)}`;
    await file.mv(path.join(uploadDir, fileName));
    return `/uploads/plug-check/${fileName}`;
};

const fail = (res, err) => {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    throw err;
};

const logAction = (pool, sheetId, monthIdx, action, detail, byUser) =>
    pool.request()
        .input('SheetID', sql.Int, sheetId)
        .input('MonthIdx', sql.Int, monthIdx ?? null)
        .input('Action', sql.NVarChar(30), action)
        .input('Detail', sql.NVarChar(500), detail || null)
        .input('ByUser', sql.NVarChar(100), byUser || null)
        .query('INSERT INTO dbo.Stock_PlugLog (SheetID, MonthIdx, Action, Detail, ByUser) VALUES (@SheetID, @MonthIdx, @Action, @Detail, @ByUser)');

// ============================== FACTORIES ==============================

export const getFactories = wrap('getFactories', async (req, res) => {
    const r = await getPool().request().query('SELECT FactoryID, FactoryName, IsActive FROM dbo.Stock_PlugFactories WHERE IsActive = 1 ORDER BY FactoryName');
    res.json({ success: true, data: r.recordset });
});

export const createFactory = wrap('createFactory', async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'Factory name is required' });
    const r = await getPool().request()
        .input('name', sql.NVarChar(100), name)
        .query('INSERT INTO dbo.Stock_PlugFactories (FactoryName) OUTPUT INSERTED.FactoryID VALUES (@name)');
    res.json({ success: true, data: { FactoryID: r.recordset[0].FactoryID, FactoryName: name } });
});

export const updateFactory = wrap('updateFactory', async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'Factory name is required' });
    await getPool().request()
        .input('id', sql.Int, req.params.id)
        .input('name', sql.NVarChar(100), name)
        .query('UPDATE dbo.Stock_PlugFactories SET FactoryName = @name WHERE FactoryID = @id');
    res.json({ success: true });
});

export const deleteFactory = wrap('deleteFactory', async (req, res) => {
    const pool = getPool();
    const used = await pool.request().input('id', sql.Int, req.params.id)
        .query('SELECT COUNT(*) AS n FROM dbo.Stock_PlugAreas WHERE FactoryID = @id AND IsActive = 1');
    if (used.recordset[0].n > 0) {
        return res.status(400).json({ success: false, error: 'ยังมีพื้นที่ใช้งานอยู่ในโรงงานนี้' });
    }
    await pool.request().input('id', sql.Int, req.params.id)
        .query('UPDATE dbo.Stock_PlugFactories SET IsActive = 0 WHERE FactoryID = @id');
    res.json({ success: true });
});

// ============================== AREAS ==============================

const AREA_COLS = `a.AreaID, a.FactoryID, f.FactoryName, a.AreaName, a.DeptName, a.LayoutCaption, a.LayoutImage,
    a.Panel1Title, a.Panel1Image, a.Panel1Caption, a.Panel2Title, a.Panel2Image, a.Panel2Caption, a.IsActive`;

export const getAreas = wrap('getAreas', async (req, res) => {
    const request = getPool().request();
    let where = 'a.IsActive = 1';
    if (req.query.factoryId) {
        request.input('factoryId', sql.Int, req.query.factoryId);
        where += ' AND a.FactoryID = @factoryId';
    }
    const r = await request.query(`
        SELECT ${AREA_COLS}
        FROM dbo.Stock_PlugAreas a JOIN dbo.Stock_PlugFactories f ON f.FactoryID = a.FactoryID
        WHERE ${where} ORDER BY f.FactoryName, a.AreaName`);
    res.json({ success: true, data: r.recordset });
});

export const createArea = wrap('createArea', async (req, res) => {
    const b = req.body;
    if (!b.factoryId || !String(b.areaName || '').trim()) {
        return res.status(400).json({ success: false, error: 'Factory and area name are required' });
    }
    const r = await getPool().request()
        .input('FactoryID', sql.Int, b.factoryId)
        .input('AreaName', sql.NVarChar(150), String(b.areaName).trim())
        .input('DeptName', sql.NVarChar(200), b.deptName || null)
        .input('LayoutCaption', sql.NVarChar(300), b.layoutCaption || null)
        .input('Panel1Title', sql.NVarChar(200), b.panel1Title ?? 'การตรวจสอบเต้ารับ')
        .input('Panel1Caption', sql.NVarChar(sql.MAX), b.panel1Caption ?? null)
        .input('Panel2Title', sql.NVarChar(200), b.panel2Title ?? 'การตรวจสอบปลั๊กตัวผู้')
        .input('Panel2Caption', sql.NVarChar(sql.MAX), b.panel2Caption ?? null)
        .query(`INSERT INTO dbo.Stock_PlugAreas (FactoryID, AreaName, DeptName, LayoutCaption, Panel1Title, Panel1Caption, Panel2Title, Panel2Caption)
                OUTPUT INSERTED.AreaID
                VALUES (@FactoryID, @AreaName, @DeptName, @LayoutCaption, @Panel1Title, @Panel1Caption, @Panel2Title, @Panel2Caption)`);
    res.json({ success: true, data: { AreaID: r.recordset[0].AreaID } });
});

export const updateArea = wrap('updateArea', async (req, res) => {
    const b = req.body;
    await getPool().request()
        .input('id', sql.Int, req.params.id)
        .input('FactoryID', sql.Int, b.factoryId)
        .input('AreaName', sql.NVarChar(150), String(b.areaName || '').trim())
        .input('DeptName', sql.NVarChar(200), b.deptName || null)
        .input('LayoutCaption', sql.NVarChar(300), b.layoutCaption || null)
        .input('Panel1Title', sql.NVarChar(200), b.panel1Title || null)
        .input('Panel1Caption', sql.NVarChar(sql.MAX), b.panel1Caption || null)
        .input('Panel2Title', sql.NVarChar(200), b.panel2Title || null)
        .input('Panel2Caption', sql.NVarChar(sql.MAX), b.panel2Caption || null)
        .query(`UPDATE dbo.Stock_PlugAreas SET FactoryID = @FactoryID, AreaName = @AreaName, DeptName = @DeptName,
                LayoutCaption = @LayoutCaption, Panel1Title = @Panel1Title, Panel1Caption = @Panel1Caption,
                Panel2Title = @Panel2Title, Panel2Caption = @Panel2Caption WHERE AreaID = @id`);
    res.json({ success: true });
});

export const deleteArea = wrap('deleteArea', async (req, res) => {
    // Soft delete: sheets (history) stay printable
    await getPool().request().input('id', sql.Int, req.params.id)
        .query('UPDATE dbo.Stock_PlugAreas SET IsActive = 0 WHERE AreaID = @id');
    res.json({ success: true });
});

// kind: layout | panel1 | panel2
const AREA_IMAGE_COL = { layout: 'LayoutImage', panel1: 'Panel1Image', panel2: 'Panel2Image' };

export const uploadAreaImage = wrap('uploadAreaImage', async (req, res) => {
    const col = AREA_IMAGE_COL[req.body.kind];
    if (!col) return res.status(400).json({ success: false, error: 'kind must be layout, panel1 or panel2' });
    let url;
    try { url = await saveImage(req.files?.image); } catch (e) { return fail(res, e); }
    await getPool().request()
        .input('id', sql.Int, req.params.id)
        .input('url', sql.NVarChar(500), url)
        .query(`UPDATE dbo.Stock_PlugAreas SET ${col} = @url WHERE AreaID = @id`);
    res.json({ success: true, data: { url } });
});

// ============================== STANDARDS ==============================

export const getStandards = wrap('getStandards', async (req, res) => {
    const r = await getPool().request().query(
        'SELECT StdID, Code, Name, Shape, ImageUrl, SortOrder FROM dbo.Stock_PlugStandards WHERE IsActive = 1 ORDER BY SortOrder, Code');
    res.json({ success: true, data: r.recordset });
});

export const createStandard = wrap('createStandard', async (req, res) => {
    const b = req.body;
    const pool = getPool();
    let code = String(b.code || '').trim().toUpperCase();
    if (!code) {
        // next free letter A, B, C ...
        const used = (await pool.request().query('SELECT Code FROM dbo.Stock_PlugStandards')).recordset.map(x => x.Code);
        for (let i = 0; i < 26; i++) {
            const c = String.fromCharCode(65 + i);
            if (!used.includes(c)) { code = c; break; }
        }
    }
    if (!code) return res.status(400).json({ success: false, error: 'Code is required' });
    const dup = await pool.request().input('c', sql.NVarChar(10), code)
        .query('SELECT StdID, IsActive FROM dbo.Stock_PlugStandards WHERE Code = @c');
    if (dup.recordset.length) {
        return res.status(400).json({ success: false, error: `แบบ ${code} มีอยู่แล้ว` });
    }
    const max = await pool.request().query('SELECT ISNULL(MAX(SortOrder),0) AS m FROM dbo.Stock_PlugStandards');
    const r = await pool.request()
        .input('Code', sql.NVarChar(10), code)
        .input('Name', sql.NVarChar(300), b.name || null)
        .input('Shape', sql.NVarChar(20), b.shape || 'square')
        .input('SortOrder', sql.Int, max.recordset[0].m + 1)
        .query(`INSERT INTO dbo.Stock_PlugStandards (Code, Name, Shape, SortOrder) OUTPUT INSERTED.StdID
                VALUES (@Code, @Name, @Shape, @SortOrder)`);
    res.json({ success: true, data: { StdID: r.recordset[0].StdID, Code: code } });
});

export const updateStandard = wrap('updateStandard', async (req, res) => {
    const b = req.body;
    await getPool().request()
        .input('id', sql.Int, req.params.id)
        .input('Name', sql.NVarChar(300), b.name || null)
        .input('Shape', sql.NVarChar(20), b.shape || 'square')
        .query('UPDATE dbo.Stock_PlugStandards SET Name = @Name, Shape = @Shape WHERE StdID = @id');
    res.json({ success: true });
});

export const deleteStandard = wrap('deleteStandard', async (req, res) => {
    const pool = getPool();
    const used = await pool.request().input('id', sql.Int, req.params.id).query(`
        SELECT COUNT(*) AS n FROM dbo.Stock_PlugPoints p
        JOIN dbo.Stock_PlugStandards s ON s.Code = p.StdCode
        WHERE s.StdID = @id AND p.IsActive = 1`);
    if (used.recordset[0].n > 0) {
        return res.status(400).json({ success: false, error: 'ยังมีจุดตรวจที่ใช้มาตรฐานนี้อยู่' });
    }
    await pool.request().input('id', sql.Int, req.params.id)
        .query('UPDATE dbo.Stock_PlugStandards SET IsActive = 0 WHERE StdID = @id');
    res.json({ success: true });
});

export const uploadStandardImage = wrap('uploadStandardImage', async (req, res) => {
    let url;
    try { url = await saveImage(req.files?.image); } catch (e) { return fail(res, e); }
    await getPool().request()
        .input('id', sql.Int, req.params.id)
        .input('url', sql.NVarChar(500), url)
        .query('UPDATE dbo.Stock_PlugStandards SET ImageUrl = @url WHERE StdID = @id');
    res.json({ success: true, data: { url } });
});

// ============================== POINTS (master) ==============================

export const getPoints = wrap('getPoints', async (req, res) => {
    const r = await getPool().request().input('areaId', sql.Int, req.params.id).query(`
        SELECT PointID, AreaID, PointNo, PointName, StdCode, PosX, PosY, Method1, Method2, Tool1, Tool2, ImageUrl
        FROM dbo.Stock_PlugPoints WHERE AreaID = @areaId AND IsActive = 1 ORDER BY PointNo`);
    res.json({ success: true, data: r.recordset });
});

export const createPoint = wrap('createPoint', async (req, res) => {
    const b = req.body;
    const name = String(b.pointName || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'Point name is required' });
    const pool = getPool();
    const max = await pool.request().input('areaId', sql.Int, req.params.id)
        .query('SELECT ISNULL(MAX(PointNo),0) AS m FROM dbo.Stock_PlugPoints WHERE AreaID = @areaId');
    const pointNo = max.recordset[0].m + 1;
    const r = await pool.request()
        .input('AreaID', sql.Int, req.params.id)
        .input('PointNo', sql.Int, pointNo)
        .input('PointName', sql.NVarChar(150), name)
        .input('StdCode', sql.NVarChar(10), b.stdCode || null)
        .input('PosX', sql.Decimal(6, 3), b.posX ?? null)
        .input('PosY', sql.Decimal(6, 3), b.posY ?? null)
        .input('Method1', sql.NVarChar(150), b.method1 || '1.เช็คด้วยสายตา')
        .input('Method2', sql.NVarChar(150), b.method2 ?? '2.เช็คกระแสไฟฟ้า')
        .input('Tool1', sql.NVarChar(100), b.tool1 ?? 'มือ,ตา')
        .input('Tool2', sql.NVarChar(100), b.tool2 ?? 'Test Lamp')
        .query(`INSERT INTO dbo.Stock_PlugPoints (AreaID, PointNo, PointName, StdCode, PosX, PosY, Method1, Method2, Tool1, Tool2)
                OUTPUT INSERTED.PointID
                VALUES (@AreaID, @PointNo, @PointName, @StdCode, @PosX, @PosY, @Method1, @Method2, @Tool1, @Tool2)`);
    res.json({ success: true, data: { PointID: r.recordset[0].PointID, PointNo: pointNo } });
});

export const updatePoint = wrap('updatePoint', async (req, res) => {
    const b = req.body;
    await getPool().request()
        .input('id', sql.Int, req.params.id)
        .input('PointName', sql.NVarChar(150), String(b.pointName || '').trim())
        .input('StdCode', sql.NVarChar(10), b.stdCode || null)
        .input('PosX', sql.Decimal(6, 3), b.posX ?? null)
        .input('PosY', sql.Decimal(6, 3), b.posY ?? null)
        .input('Method1', sql.NVarChar(150), b.method1 || null)
        .input('Method2', sql.NVarChar(150), b.method2 || null)
        .input('Tool1', sql.NVarChar(100), b.tool1 || null)
        .input('Tool2', sql.NVarChar(100), b.tool2 || null)
        .query(`UPDATE dbo.Stock_PlugPoints SET PointName = @PointName, StdCode = @StdCode, PosX = @PosX, PosY = @PosY,
                Method1 = @Method1, Method2 = @Method2, Tool1 = @Tool1, Tool2 = @Tool2 WHERE PointID = @id`);
    res.json({ success: true });
});

export const deletePoint = wrap('deletePoint', async (req, res) => {
    // Soft delete: old sheets keep their snapshot copy
    await getPool().request().input('id', sql.Int, req.params.id)
        .query('UPDATE dbo.Stock_PlugPoints SET IsActive = 0 WHERE PointID = @id');
    res.json({ success: true });
});

export const uploadPointImage = wrap('uploadPointImage', async (req, res) => {
    let url;
    try { url = await saveImage(req.files?.image); } catch (e) { return fail(res, e); }
    await getPool().request()
        .input('id', sql.Int, req.params.id)
        .input('url', sql.NVarChar(500), url)
        .query('UPDATE dbo.Stock_PlugPoints SET ImageUrl = @url WHERE PointID = @id');
    res.json({ success: true, data: { url } });
});

export const clearPointImage = wrap('clearPointImage', async (req, res) => {
    await getPool().request().input('id', sql.Int, req.params.id)
        .query('UPDATE dbo.Stock_PlugPoints SET ImageUrl = NULL WHERE PointID = @id');
    res.json({ success: true });
});

// ============================== SHEETS ==============================

const lockedMonths = async (pool, sheetId) => {
    const r = await pool.request().input('SheetID', sql.Int, sheetId)
        .query("SELECT MonthIdx FROM dbo.Stock_PlugSigns WHERE SheetID = @SheetID AND Slot = 'TOP'");
    return new Set(r.recordset.map(x => x.MonthIdx));
};

export const getSheets = wrap('getSheets', async (req, res) => {
    const r = await getPool().request().input('areaId', sql.Int, req.query.areaId)
        .query('SELECT SheetID, AreaID, FiscalYear FROM dbo.Stock_PlugSheets WHERE AreaID = @areaId ORDER BY FiscalYear DESC');
    res.json({ success: true, data: r.recordset });
});

export const getSheet = wrap('getSheet', async (req, res) => {
    const pool = getPool();
    const sheetRes = await pool.request().input('id', sql.Int, req.params.id)
        .query('SELECT SheetID, AreaID, FiscalYear, SnapshotJson, Notes FROM dbo.Stock_PlugSheets WHERE SheetID = @id');
    if (!sheetRes.recordset.length) return res.status(404).json({ success: false, error: 'Sheet not found' });
    const s = sheetRes.recordset[0];

    const [points, results, signs] = await Promise.all([
        pool.request().input('id', sql.Int, s.SheetID).query(`
            SELECT SheetPointID, PointID, PointNo, PointName, StdCode, PosX, PosY, Method1, Method2, Tool1, Tool2, ImageUrl, StartMonth
            FROM dbo.Stock_PlugSheetPoints WHERE SheetID = @id ORDER BY PointNo`),
        pool.request().input('id', sql.Int, s.SheetID).query(`
            SELECT r.SheetPointID, r.MonthIdx, r.Result, r.Note, r.PhotoUrl, r.CheckedBy, r.CheckedAt
            FROM dbo.Stock_PlugResults r JOIN dbo.Stock_PlugSheetPoints p ON p.SheetPointID = r.SheetPointID
            WHERE p.SheetID = @id`),
        pool.request().input('id', sql.Int, s.SheetID).query(`
            SELECT MonthIdx, Slot, SignedBy, EmpCode, Position, SignedAt FROM dbo.Stock_PlugSigns WHERE SheetID = @id`)
    ]);

    res.json({
        success: true,
        data: {
            sheetId: s.SheetID,
            areaId: s.AreaID,
            fiscalYear: s.FiscalYear,
            notes: s.Notes || '',
            snapshot: JSON.parse(s.SnapshotJson),
            points: points.recordset,
            results: results.recordset,
            signs: signs.recordset
        }
    });
});

export const createSheet = wrap('createSheet', async (req, res) => {
    const areaId = parseInt(req.body.areaId, 10);
    const fiscalYear = parseInt(req.body.fiscalYear, 10) || currentFiscal().fiscalYear;
    if (!areaId) return res.status(400).json({ success: false, error: 'areaId is required' });

    const pool = getPool();
    const exists = await pool.request().input('a', sql.Int, areaId).input('fy', sql.Int, fiscalYear)
        .query('SELECT SheetID FROM dbo.Stock_PlugSheets WHERE AreaID = @a AND FiscalYear = @fy');
    if (exists.recordset.length) {
        return res.status(409).json({ success: false, error: 'มีใบตรวจของปีนี้อยู่แล้ว', data: { sheetId: exists.recordset[0].SheetID } });
    }

    const areaRes = await pool.request().input('a', sql.Int, areaId).query(`
        SELECT ${AREA_COLS} FROM dbo.Stock_PlugAreas a JOIN dbo.Stock_PlugFactories f ON f.FactoryID = a.FactoryID
        WHERE a.AreaID = @a`);
    if (!areaRes.recordset.length) return res.status(404).json({ success: false, error: 'Area not found' });
    const area = areaRes.recordset[0];

    const pts = await pool.request().input('a', sql.Int, areaId).query(`
        SELECT PointID, PointNo, PointName, StdCode, PosX, PosY, Method1, Method2, Tool1, Tool2, ImageUrl
        FROM dbo.Stock_PlugPoints WHERE AreaID = @a AND IsActive = 1 ORDER BY PointNo`);
    if (!pts.recordset.length) {
        return res.status(400).json({ success: false, error: 'พื้นที่นี้ยังไม่มีจุดตรวจ (เพิ่มได้ที่ Management > Plug Master)' });
    }

    const stds = await pool.request().query(
        'SELECT Code, Name, Shape, ImageUrl FROM dbo.Stock_PlugStandards WHERE IsActive = 1 ORDER BY SortOrder, Code');

    const snapshot = {
        factoryName: area.FactoryName,
        areaName: area.AreaName,
        deptName: area.DeptName,
        layoutCaption: area.LayoutCaption,
        layoutImage: area.LayoutImage,
        standards: stds.recordset.map(s => ({ code: s.Code, name: s.Name, shape: s.Shape, imageUrl: s.ImageUrl })),
        panels: [
            { title: area.Panel1Title, imageUrl: area.Panel1Image, caption: area.Panel1Caption },
            { title: area.Panel2Title, imageUrl: area.Panel2Image, caption: area.Panel2Caption }
        ]
    };

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const ins = await new sql.Request(tx)
            .input('AreaID', sql.Int, areaId)
            .input('FiscalYear', sql.Int, fiscalYear)
            .input('Snap', sql.NVarChar(sql.MAX), JSON.stringify(snapshot))
            .input('By', sql.NVarChar(100), req.user?.name || null)
            .query(`INSERT INTO dbo.Stock_PlugSheets (AreaID, FiscalYear, SnapshotJson, CreatedBy)
                    OUTPUT INSERTED.SheetID VALUES (@AreaID, @FiscalYear, @Snap, @By)`);
        const sheetId = ins.recordset[0].SheetID;

        for (const p of pts.recordset) {
            await new sql.Request(tx)
                .input('SheetID', sql.Int, sheetId)
                .input('PointID', sql.Int, p.PointID)
                .input('PointNo', sql.Int, p.PointNo)
                .input('PointName', sql.NVarChar(150), p.PointName)
                .input('StdCode', sql.NVarChar(10), p.StdCode)
                .input('PosX', sql.Decimal(6, 3), p.PosX)
                .input('PosY', sql.Decimal(6, 3), p.PosY)
                .input('Method1', sql.NVarChar(150), p.Method1)
                .input('Method2', sql.NVarChar(150), p.Method2)
                .input('Tool1', sql.NVarChar(100), p.Tool1)
                .input('Tool2', sql.NVarChar(100), p.Tool2)
                .input('ImageUrl', sql.NVarChar(500), p.ImageUrl)
                .query(`INSERT INTO dbo.Stock_PlugSheetPoints
                        (SheetID, PointID, PointNo, PointName, StdCode, PosX, PosY, Method1, Method2, Tool1, Tool2, ImageUrl)
                        VALUES (@SheetID, @PointID, @PointNo, @PointName, @StdCode, @PosX, @PosY, @Method1, @Method2, @Tool1, @Tool2, @ImageUrl)`);
        }
        await tx.commit();
        await logAction(pool, sheetId, null, 'CREATE_SHEET', `FY${fiscalYear} area ${areaId}`, req.user?.name);
        res.json({ success: true, data: { sheetId } });
    } catch (err) {
        await tx.rollback();
        throw err;
    }
});

// Re-copy appearance data (standards, images, panels, layout, point photos/positions) from the master into an existing sheet.
// Results and signatures are kept; only descriptive fields change.
export const refreshSheet = wrap('refreshSheet', async (req, res) => {
    const pool = getPool();
    const sheetRes = await pool.request().input('id', sql.Int, req.params.id)
        .query('SELECT SheetID, AreaID FROM dbo.Stock_PlugSheets WHERE SheetID = @id');
    if (!sheetRes.recordset.length) return res.status(404).json({ success: false, error: 'Sheet not found' });
    const { SheetID, AreaID } = sheetRes.recordset[0];

    const areaRes = await pool.request().input('a', sql.Int, AreaID).query(`
        SELECT ${AREA_COLS} FROM dbo.Stock_PlugAreas a JOIN dbo.Stock_PlugFactories f ON f.FactoryID = a.FactoryID
        WHERE a.AreaID = @a`);
    const area = areaRes.recordset[0];
    const stds = await pool.request().query(
        'SELECT Code, Name, Shape, ImageUrl FROM dbo.Stock_PlugStandards WHERE IsActive = 1 ORDER BY SortOrder, Code');

    const snapshot = {
        factoryName: area.FactoryName,
        areaName: area.AreaName,
        deptName: area.DeptName,
        layoutCaption: area.LayoutCaption,
        layoutImage: area.LayoutImage,
        standards: stds.recordset.map(s => ({ code: s.Code, name: s.Name, shape: s.Shape, imageUrl: s.ImageUrl })),
        panels: [
            { title: area.Panel1Title, imageUrl: area.Panel1Image, caption: area.Panel1Caption },
            { title: area.Panel2Title, imageUrl: area.Panel2Image, caption: area.Panel2Caption }
        ]
    };

    await pool.request()
        .input('id', sql.Int, SheetID)
        .input('snap', sql.NVarChar(sql.MAX), JSON.stringify(snapshot))
        .query('UPDATE dbo.Stock_PlugSheets SET SnapshotJson = @snap WHERE SheetID = @id');
    const upd = await pool.request().input('id', sql.Int, SheetID).query(`
        UPDATE sp SET sp.PointName = p.PointName, sp.StdCode = p.StdCode, sp.PosX = p.PosX, sp.PosY = p.PosY,
            sp.Method1 = p.Method1, sp.Method2 = p.Method2, sp.Tool1 = p.Tool1, sp.Tool2 = p.Tool2, sp.ImageUrl = p.ImageUrl
        FROM dbo.Stock_PlugSheetPoints sp JOIN dbo.Stock_PlugPoints p ON p.PointID = sp.PointID
        WHERE sp.SheetID = @id;
        SELECT @@ROWCOUNT AS updated;`);
    await logAction(pool, SheetID, null, 'REFRESH_FROM_MASTER', `points ${upd.recordset[0].updated}`, req.user?.name);
    res.json({ success: true, data: { updated: upd.recordset[0].updated } });
});

// Add master points that are not in the sheet yet (a plug added mid-year)
export const syncSheet = wrap('syncSheet', async (req, res) => {
    const pool = getPool();
    const sheetRes = await pool.request().input('id', sql.Int, req.params.id)
        .query('SELECT SheetID, AreaID, FiscalYear FROM dbo.Stock_PlugSheets WHERE SheetID = @id');
    if (!sheetRes.recordset.length) return res.status(404).json({ success: false, error: 'Sheet not found' });
    const sheet = sheetRes.recordset[0];

    // A plug added to a running sheet can be checked in every month (it may already have been in use);
    // pass startMonth (0-11) to make earlier months not applicable instead.
    const requested = parseInt(req.body?.startMonth, 10);
    const startMonth = requested >= 0 && requested <= 11 ? requested : 0;

    const ins = await pool.request()
        .input('SheetID', sql.Int, sheet.SheetID)
        .input('AreaID', sql.Int, sheet.AreaID)
        .input('StartMonth', sql.Int, startMonth)
        .query(`
            INSERT INTO dbo.Stock_PlugSheetPoints (SheetID, PointID, PointNo, PointName, StdCode, PosX, PosY, Method1, Method2, Tool1, Tool2, ImageUrl, StartMonth)
            SELECT @SheetID, p.PointID, p.PointNo, p.PointName, p.StdCode, p.PosX, p.PosY, p.Method1, p.Method2, p.Tool1, p.Tool2, p.ImageUrl, @StartMonth
            FROM dbo.Stock_PlugPoints p
            WHERE p.AreaID = @AreaID AND p.IsActive = 1
              AND NOT EXISTS (SELECT 1 FROM dbo.Stock_PlugSheetPoints sp WHERE sp.SheetID = @SheetID AND sp.PointID = p.PointID);
            SELECT @@ROWCOUNT AS added;`);
    const added = ins.recordset[0].added;
    if (added) await logAction(pool, sheet.SheetID, null, 'SYNC_POINTS', `added ${added}`, req.user?.name);
    res.json({ success: true, data: { added } });
});

// Set results for one month. items: [{ sheetPointId, result, note }]; overwrite=false fills only empty cells
export const saveResults = wrap('saveResults', async (req, res) => {
    const sheetId = parseInt(req.params.id, 10);
    const monthIdx = parseInt(req.body.monthIdx, 10);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const overwrite = req.body.overwrite !== false;
    if (!(monthIdx >= 0 && monthIdx <= 11) || !items.length) {
        return res.status(400).json({ success: false, error: 'monthIdx (0-11) and items are required' });
    }

    const pool = getPool();
    if ((await lockedMonths(pool, sheetId)).has(monthIdx)) {
        return res.status(403).json({ success: false, error: 'เดือนนี้ถูกเซ็นรับรองแล้ว ต้องปลดล็อกก่อนแก้ไข' });
    }

    const valid = await pool.request().input('SheetID', sql.Int, sheetId)
        .query('SELECT SheetPointID, StartMonth FROM dbo.Stock_PlugSheetPoints WHERE SheetID = @SheetID');
    const startOf = new Map(valid.recordset.map(r => [r.SheetPointID, r.StartMonth]));
    const existing = await pool.request().input('SheetID', sql.Int, sheetId).input('m', sql.Int, monthIdx).query(`
        SELECT r.SheetPointID, r.Result FROM dbo.Stock_PlugResults r
        JOIN dbo.Stock_PlugSheetPoints p ON p.SheetPointID = r.SheetPointID
        WHERE p.SheetID = @SheetID AND r.MonthIdx = @m`);
    const has = new Map(existing.recordset.map(r => [r.SheetPointID, r.Result]));

    const by = req.user?.name || req.user?.username || null;
    let changed = 0;
    for (const it of items) {
        const spId = parseInt(it.sheetPointId, 10);
        if (!startOf.has(spId) || monthIdx < startOf.get(spId)) continue;
        const result = it.result === '' || it.result == null ? null : String(it.result);
        if (result !== null && !RESULTS.includes(result)) continue;
        if (!overwrite && has.get(spId)) continue;

        await pool.request()
            .input('sp', sql.Int, spId)
            .input('m', sql.Int, monthIdx)
            .input('result', sql.NVarChar(10), result)
            .input('note', sql.NVarChar(500), it.note ?? null)
            .input('by', sql.NVarChar(100), by)
            .query(`
                MERGE dbo.Stock_PlugResults AS t
                USING (SELECT @sp AS SheetPointID, @m AS MonthIdx) AS s
                ON t.SheetPointID = s.SheetPointID AND t.MonthIdx = s.MonthIdx
                WHEN MATCHED THEN UPDATE SET Result = @result,
                    Note = CASE WHEN @note IS NULL THEN t.Note ELSE @note END,
                    CheckedBy = @by, CheckedAt = GETDATE()
                WHEN NOT MATCHED THEN INSERT (SheetPointID, MonthIdx, Result, Note, CheckedBy, CheckedAt)
                    VALUES (@sp, @m, @result, @note, @by, GETDATE());`);
        changed++;
    }
    res.json({ success: true, data: { changed } });
});

export const uploadResultPhoto = wrap('uploadResultPhoto', async (req, res) => {
    const sheetId = parseInt(req.params.id, 10);
    const monthIdx = parseInt(req.body.monthIdx, 10);
    const spId = parseInt(req.body.sheetPointId, 10);
    if (!(monthIdx >= 0 && monthIdx <= 11) || !spId) {
        return res.status(400).json({ success: false, error: 'monthIdx and sheetPointId are required' });
    }
    const pool = getPool();
    if ((await lockedMonths(pool, sheetId)).has(monthIdx)) {
        return res.status(403).json({ success: false, error: 'เดือนนี้ถูกเซ็นรับรองแล้ว ต้องปลดล็อกก่อนแก้ไข' });
    }
    const own = await pool.request().input('SheetID', sql.Int, sheetId).input('sp', sql.Int, spId)
        .query('SELECT 1 AS ok FROM dbo.Stock_PlugSheetPoints WHERE SheetID = @SheetID AND SheetPointID = @sp');
    if (!own.recordset.length) return res.status(404).json({ success: false, error: 'Point not in this sheet' });

    let url;
    try { url = await saveImage(req.files?.image); } catch (e) { return fail(res, e); }
    await pool.request()
        .input('sp', sql.Int, spId).input('m', sql.Int, monthIdx).input('url', sql.NVarChar(500), url)
        .input('by', sql.NVarChar(100), req.user?.name || null)
        .query(`
            MERGE dbo.Stock_PlugResults AS t
            USING (SELECT @sp AS SheetPointID, @m AS MonthIdx) AS s
            ON t.SheetPointID = s.SheetPointID AND t.MonthIdx = s.MonthIdx
            WHEN MATCHED THEN UPDATE SET PhotoUrl = @url
            WHEN NOT MATCHED THEN INSERT (SheetPointID, MonthIdx, PhotoUrl, CheckedBy, CheckedAt) VALUES (@sp, @m, @url, @by, GETDATE());`);
    res.json({ success: true, data: { url } });
});

export const updateSheetNotes = wrap('updateSheetNotes', async (req, res) => {
    await getPool().request()
        .input('id', sql.Int, req.params.id)
        .input('notes', sql.NVarChar(sql.MAX), req.body.notes || null)
        .query('UPDATE dbo.Stock_PlugSheets SET Notes = @notes WHERE SheetID = @id');
    res.json({ success: true });
});

// ============================== SIGN / UNLOCK ==============================

export const signMonth = wrap('signMonth', async (req, res) => {
    const sheetId = parseInt(req.params.id, 10);
    const monthIdx = parseInt(req.body.monthIdx, 10);
    const slot = req.body.slot;
    if (!(monthIdx >= 0 && monthIdx <= 11) || !SIGN_LEVELS[slot]) {
        return res.status(400).json({ success: false, error: 'monthIdx (0-11) and slot (TOP|BOT) are required' });
    }

    // Level (Position) comes from the AD login token, never from the request body
    const position = normPos(req.user?.position);
    if (!SIGN_LEVELS[slot].includes(position)) {
        return res.status(403).json({
            success: false,
            error: `ตำแหน่ง ${position || 'ไม่ระบุ'} เซ็นช่องนี้ไม่ได้ (ต้องเป็น ${SIGN_LEVELS[slot].join(', ')})`
        });
    }

    const pool = getPool();
    const signs = await pool.request().input('id', sql.Int, sheetId).input('m', sql.Int, monthIdx)
        .query('SELECT Slot FROM dbo.Stock_PlugSigns WHERE SheetID = @id AND MonthIdx = @m');
    const done = signs.recordset.map(r => r.Slot);
    if (done.includes(slot)) return res.status(409).json({ success: false, error: 'ช่องนี้เซ็นแล้ว' });
    if (slot === 'BOT' && !done.includes('TOP')) {
        return res.status(400).json({ success: false, error: 'ต้องให้ผู้รับผิดชอบ (ช่องบน) เซ็นก่อน' });
    }
    if (slot === 'TOP') {
        const any = await pool.request().input('id', sql.Int, sheetId).input('m', sql.Int, monthIdx).query(`
            SELECT COUNT(*) AS n FROM dbo.Stock_PlugResults r
            JOIN dbo.Stock_PlugSheetPoints p ON p.SheetPointID = r.SheetPointID
            WHERE p.SheetID = @id AND r.MonthIdx = @m AND r.Result IS NOT NULL`);
        if (!any.recordset[0].n) return res.status(400).json({ success: false, error: 'ยังไม่มีผลตรวจในเดือนนี้' });
        const missing = await pool.request().input('id', sql.Int, sheetId).input('m', sql.Int, monthIdx).query(`
            SELECT COUNT(*) AS n FROM dbo.Stock_PlugSheetPoints p
            WHERE p.SheetID = @id AND p.StartMonth <= @m
              AND NOT EXISTS (SELECT 1 FROM dbo.Stock_PlugResults r
                              WHERE r.SheetPointID = p.SheetPointID AND r.MonthIdx = @m AND r.Result IS NOT NULL)`);
        if (missing.recordset[0].n) {
            return res.status(400).json({ success: false, error: `ยังตรวจไม่ครบ (เหลือ ${missing.recordset[0].n} จุด)` });
        }
    }

    await pool.request()
        .input('SheetID', sql.Int, sheetId).input('MonthIdx', sql.Int, monthIdx).input('Slot', sql.NVarChar(3), slot)
        .input('SignedBy', sql.NVarChar(100), req.user?.name || req.user?.username)
        .input('EmpCode', sql.NVarChar(20), req.user?.empcode ? String(req.user.empcode) : null)
        .input('Position', sql.NVarChar(20), position)
        .query(`INSERT INTO dbo.Stock_PlugSigns (SheetID, MonthIdx, Slot, SignedBy, EmpCode, Position)
                VALUES (@SheetID, @MonthIdx, @Slot, @SignedBy, @EmpCode, @Position)`);
    await logAction(pool, sheetId, monthIdx, 'SIGN_' + slot, position, req.user?.name);
    res.json({ success: true });
});

export const unlockMonth = wrap('unlockMonth', async (req, res) => {
    const sheetId = parseInt(req.params.id, 10);
    const monthIdx = parseInt(req.body.monthIdx, 10);
    const reason = String(req.body.reason || '').trim();
    if (!(monthIdx >= 0 && monthIdx <= 11)) return res.status(400).json({ success: false, error: 'monthIdx is required' });
    if (!reason) return res.status(400).json({ success: false, error: 'กรุณาระบุเหตุผลในการปลดล็อก' });

    const position = normPos(req.user?.position);
    if (!UNLOCK_LEVELS.includes(position)) {
        return res.status(403).json({ success: false, error: `เฉพาะ ${UNLOCK_LEVELS.join(', ')} เท่านั้นที่ปลดล็อกได้` });
    }
    const pool = getPool();
    await pool.request().input('id', sql.Int, sheetId).input('m', sql.Int, monthIdx)
        .query('DELETE FROM dbo.Stock_PlugSigns WHERE SheetID = @id AND MonthIdx = @m');
    await logAction(pool, sheetId, monthIdx, 'UNLOCK', reason, req.user?.name);
    res.json({ success: true });
});
