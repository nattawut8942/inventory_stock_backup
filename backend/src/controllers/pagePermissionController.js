import { sql, getPool } from '../config/db.js';
import { allPermissionKeys, catalogForClient, PAGES, ACTION_LABELS, isValidPermission } from '../config/permissions.config.js';
import {
    getPermissionMode, loadUserAccess, getUserPermissionList, getDefaultPermissionList,
    normalisePermissionInput, setUserPermissions, setDefaultPermissions, getAuditLog,
    getWouldDenySummary, clearWouldDenySummary,
} from '../services/permissionService.js';

// GET /permissions/catalog — pages, actions and labels (single source: permissions.config.js)
export const getCatalog = (req, res) => {
    res.json({ ...catalogForClient(), mode: getPermissionMode() });
};

// GET /me/permissions — what the logged-in user may do (role is read from the database)
export const getMyPermissions = async (req, res) => {
    try {
        const empCode = req.user?.empcode;
        if (!empCode) return res.status(401).json({ error: 'Unauthorized' });
        const access = await loadUserAccess(empCode);
        if (!access.found) return res.status(404).json({ error: 'User not found, please log in again' });
        const isAdmin = access.role === 'Admin';
        res.json({
            empCode: String(empCode),
            role: access.role,
            isAdmin,
            mode: getPermissionMode(),
            permissions: isAdmin ? allPermissionKeys() : [...access.perms].sort(),
            // menu/route -> page key, in menu order (the frontend uses it to hide pages without "view")
            routes: PAGES.filter((p) => p.route).map((p) => ({ route: p.route, page: p.key })),
            // names for the "you do not have permission" notice
            pageLabels: Object.fromEntries(PAGES.map((p) => [p.key, p.label])),
            actionLabels: ACTION_LABELS,
        });
    } catch (err) {
        console.error('Get my permissions error:', err);
        res.status(500).json({ error: err.message });
    }
};

const findUser = async (empCode) => {
    const r = await getPool().request()
        .input('e', sql.NVarChar, String(empCode))
        .query('SELECT EmpCode, Name, Username, Role FROM dbo.Stock_Users WHERE EmpCode = @e');
    return r.recordset[0] || null;
};

// GET /permissions/users/:empCode (Admin)
export const getUserPermissions = async (req, res) => {
    try {
        const user = await findUser(req.params.empCode);
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        res.json({ ...user, permissions: await getUserPermissionList(user.EmpCode) });
    } catch (err) {
        console.error('Get user permissions error:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /permissions/users/:empCode  { permissions: ["inventory:view", ...] } (Admin)
export const putUserPermissions = async (req, res) => {
    const { ok, keys, invalid } = normalisePermissionInput(req.body?.permissions);
    if (!ok) return res.status(400).json({ error: 'มีสิทธิ์ที่ไม่ถูกต้อง', invalid });
    try {
        const user = await findUser(req.params.empCode);
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        const result = await setUserPermissions(user.EmpCode, keys, req.user?.empcode || req.user?.username);
        res.json({ success: true, ...result, message: 'บันทึกสิทธิ์สำเร็จ (มีผลทันที)' });
    } catch (err) {
        console.error('Put user permissions error:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /permissions/users/:empCode/audit (Admin)
export const getUserPermissionAudit = async (req, res) => {
    try {
        res.json(await getAuditLog(req.params.empCode, req.query.limit));
    } catch (err) {
        console.error('Get permission audit error:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /permissions/defaults (Admin)
export const getDefaults = async (req, res) => {
    try {
        res.json({ permissions: await getDefaultPermissionList() });
    } catch (err) {
        console.error('Get defaults error:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /permissions/defaults  { permissions: [...] } (Admin) — applies to users created from now on
export const putDefaults = async (req, res) => {
    const { ok, keys, invalid } = normalisePermissionInput(req.body?.permissions);
    if (!ok) return res.status(400).json({ error: 'มีสิทธิ์ที่ไม่ถูกต้อง', invalid });
    try {
        const result = await setDefaultPermissions(keys, req.user?.empcode || req.user?.username);
        res.json({ success: true, ...result, message: 'บันทึกสิทธิ์ตั้งต้นสำเร็จ (ใช้กับผู้ใช้ใหม่ที่ login ครั้งแรกจากนี้)' });
    } catch (err) {
        console.error('Put defaults error:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /permissions/log-summary (Admin) — requests that WOULD have been denied while in "log" mode
export const getLogSummary = async (req, res) => {
    try {
        const items = await getWouldDenySummary();
        // add the person's name next to the employee code
        const names = new Map();
        const r = await getPool().request().query('SELECT EmpCode, Name, Username FROM dbo.Stock_Users');
        r.recordset.forEach((u) => names.set(String(u.EmpCode), u.Name || u.Username || ''));
        res.json({
            mode: getPermissionMode(),
            since: items.length ? items.reduce((m, i) => (i.first && i.first < m ? i.first : m), items[0].first) : null,
            items: items.map((i) => ({ ...i, name: names.get(String(i.empCode)) || '' })),
        });
    } catch (err) {
        console.error('Get log summary error:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE /permissions/log-summary (Admin) — start a fresh review period
export const clearLogSummary = async (req, res) => {
    try {
        await clearWouldDenySummary();
        res.json({ success: true });
    } catch (err) {
        console.error('Clear log summary error:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /permissions/holders?page=inventory (Admin)
// One row per non-Admin user; for each action of the page, whether they hold it.
// Admins always pass every check, so they are not listed here.
export const getPermissionHolders = async (req, res) => {
    const page = String(req.query.page || '');
    const pageDef = PAGES.find((p) => p.key === page);
    if (!pageDef) return res.status(400).json({ error: 'ไม่พบหน้านี้ในระบบ', page });
    try {
        const r = await getPool().request()
            .input('p', sql.NVarChar, page)
            .query(`
                SELECT u.EmpCode, u.Name, u.Username, u.Role, u.EmpPic, g.Action
                FROM dbo.Stock_Users u
                LEFT JOIN dbo.Stock_PagePermissions g
                       ON g.EmpCode = u.EmpCode AND g.PageKey = @p
                WHERE u.Role <> 'Admin'
                ORDER BY u.Name, u.EmpCode`);
        const byEmp = new Map();
        for (const row of r.recordset) {
            if (!byEmp.has(row.EmpCode)) {
                byEmp.set(row.EmpCode, { EmpCode: row.EmpCode, Name: row.Name, Username: row.Username, Role: row.Role, EmpPic: row.EmpPic, actions: [] });
            }
            if (row.Action) byEmp.get(row.EmpCode).actions.push(row.Action);
        }
        res.json({
            page,
            label: pageDef.label,
            actions: pageDef.actions.map((a) => ({ key: a, label: ACTION_LABELS[a] })),
            users: [...byEmp.values()],
        });
    } catch (err) {
        console.error('Get permission holders error:', err);
        res.status(500).json({ error: err.message });
    }
};
