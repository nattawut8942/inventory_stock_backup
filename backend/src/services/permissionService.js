import { sql, getPool } from '../config/db.js';
import { isValidPermission, defaultPermissionKeys } from '../config/permissions.config.js';

// ─── Mode ────────────────────────────────────────────────────────────────────
// off     = requirePerm does nothing
// log     = requirePerm records "would deny" but lets the request through (default)
// enforce = requirePerm rejects with 401/403
export const getPermissionMode = () => {
    const m = String(process.env.PERMISSIONS_MODE || 'log').trim().toLowerCase();
    return m === 'off' || m === 'enforce' ? m : 'log';
};

// ─── Per-user cache (30 s; cleared immediately whenever permissions are saved) ───
const TTL_MS = 30 * 1000;
const cache = new Map(); // empCode -> { found, role, perms:Set, at }

export const invalidateUser = (empCode) => {
    if (empCode === undefined || empCode === null) cache.clear();
    else cache.delete(String(empCode));
};

// Role and permissions always come from the database, never from the JWT, so a change
// (including demoting an Admin) takes effect on the next request instead of after re-login.
export const loadUserAccess = async (empCode) => {
    const key = String(empCode);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit;

    const pool = getPool();
    const u = await pool.request()
        .input('e', sql.NVarChar, key)
        .query('SELECT Role FROM dbo.Stock_Users WHERE EmpCode = @e');
    let value;
    if (u.recordset.length === 0) {
        value = { found: false, role: null, perms: new Set(), at: Date.now() };
    } else {
        const p = await pool.request()
            .input('e', sql.NVarChar, key)
            .query('SELECT PageKey, Action FROM dbo.Stock_PagePermissions WHERE EmpCode = @e');
        value = {
            found: true,
            role: u.recordset[0].Role,
            perms: new Set(p.recordset.map((r) => `${r.PageKey}:${r.Action}`)),
            at: Date.now(),
        };
    }
    cache.set(key, value);
    return value;
};

export const userCan = (access, page, action) =>
    !!access && access.found && (access.role === 'Admin' || access.perms.has(`${page}:${action}`));

// ─── New users: copy the default set once (called from login; never throws) ─────────
export const ensureUserPermissions = async (empCode) => {
    try {
        const pool = getPool();
        const r = await pool.request()
            .input('e', sql.NVarChar, String(empCode))
            .query('SELECT PermInitAt FROM dbo.Stock_Users WHERE EmpCode = @e');
        if (r.recordset.length === 0 || r.recordset[0].PermInitAt) return;
        await pool.request()
            .input('e', sql.NVarChar, String(empCode))
            .query(`
                INSERT INTO dbo.Stock_PagePermissions (EmpCode, PageKey, Action, GrantedBy)
                SELECT @e, d.PageKey, d.Action, 'SYSTEM'
                FROM dbo.Stock_PermissionDefaults d
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.Stock_PagePermissions p
                    WHERE p.EmpCode = @e AND p.PageKey = d.PageKey AND p.Action = d.Action
                );
                UPDATE dbo.Stock_Users SET PermInitAt = GETDATE() WHERE EmpCode = @e;
            `);
        invalidateUser(empCode);
    } catch (err) {
        console.error('ensureUserPermissions error:', err.message);
    }
};

// ─── Reading / writing permission sets ──────────────────────────────────────────
export const getUserPermissionList = async (empCode) => {
    const r = await getPool().request()
        .input('e', sql.NVarChar, String(empCode))
        .query('SELECT PageKey, Action FROM dbo.Stock_PagePermissions WHERE EmpCode = @e ORDER BY PageKey, Action');
    return r.recordset.map((x) => `${x.PageKey}:${x.Action}`);
};

export const getDefaultPermissionList = async () => {
    const r = await getPool().request()
        .query('SELECT PageKey, Action FROM dbo.Stock_PermissionDefaults ORDER BY PageKey, Action');
    return r.recordset.map((x) => `${x.PageKey}:${x.Action}`);
};

// Normalises client input: array of unique, valid "page:action" strings. Returns { ok, keys, invalid }.
export const normalisePermissionInput = (input) => {
    if (!Array.isArray(input)) return { ok: false, keys: [], invalid: ['(permissions must be an array)'] };
    if (input.length > 500) return { ok: false, keys: [], invalid: ['(too many items)'] };
    const keys = [...new Set(input)];
    const invalid = keys.filter((k) => !isValidPermission(k));
    if (invalid.length) return { ok: false, keys: [], invalid };
    // Any action on a page needs "view" on that page (otherwise the page is hidden but still writable).
    const set = new Set(keys);
    for (const k of keys) {
        const page = k.slice(0, k.indexOf(':'));
        set.add(`${page}:view`);
    }
    return { ok: true, keys: [...set], invalid: [] };
};

const splitKey = (k) => {
    const i = k.indexOf(':');
    return [k.slice(0, i), k.slice(i + 1)];
};

// Replace the whole set in one transaction; writes one audit row per grant/revoke.
// table: 'user' (Stock_PagePermissions for empCode) or 'defaults' (Stock_PermissionDefaults)
const replaceSet = async ({ table, empCode, keys, changedBy }) => {
    const pool = getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const isUser = table === 'user';
        const cur = isUser
            ? await new sql.Request(tx).input('e', sql.NVarChar, String(empCode))
                .query('SELECT PageKey, Action FROM dbo.Stock_PagePermissions WHERE EmpCode = @e')
            : await new sql.Request(tx).query('SELECT PageKey, Action FROM dbo.Stock_PermissionDefaults');
        const before = new Set(cur.recordset.map((r) => `${r.PageKey}:${r.Action}`));
        const after = new Set(keys);
        const added = [...after].filter((k) => !before.has(k));
        const removed = [...before].filter((k) => !after.has(k));
        const auditEmp = isUser ? String(empCode) : '(DEFAULT)';

        for (const k of removed) {
            const [page, action] = splitKey(k);
            const rq = new sql.Request(tx).input('p', sql.NVarChar, page).input('a', sql.NVarChar, action);
            if (isUser) {
                await rq.input('e', sql.NVarChar, String(empCode))
                    .query('DELETE FROM dbo.Stock_PagePermissions WHERE EmpCode = @e AND PageKey = @p AND Action = @a');
            } else {
                await rq.query('DELETE FROM dbo.Stock_PermissionDefaults WHERE PageKey = @p AND Action = @a');
            }
        }
        for (const k of added) {
            const [page, action] = splitKey(k);
            const rq = new sql.Request(tx).input('p', sql.NVarChar, page).input('a', sql.NVarChar, action);
            if (isUser) {
                await rq.input('e', sql.NVarChar, String(empCode)).input('by', sql.NVarChar, changedBy || null)
                    .query('INSERT INTO dbo.Stock_PagePermissions (EmpCode, PageKey, Action, GrantedBy) VALUES (@e, @p, @a, @by)');
            } else {
                await rq.query('INSERT INTO dbo.Stock_PermissionDefaults (PageKey, Action) VALUES (@p, @a)');
            }
        }
        for (const [list, change] of [[added, 'GRANT'], [removed, 'REVOKE']]) {
            for (const k of list) {
                const [page, action] = splitKey(k);
                await new sql.Request(tx)
                    .input('e', sql.NVarChar, auditEmp).input('p', sql.NVarChar, page).input('a', sql.NVarChar, action)
                    .input('c', sql.NVarChar, change).input('by', sql.NVarChar, changedBy || null)
                    .query('INSERT INTO dbo.Stock_PermissionAudit (EmpCode, PageKey, Action, Change, ChangedBy) VALUES (@e, @p, @a, @c, @by)');
            }
        }
        if (isUser) {
            // Saving explicitly counts as initialised, so defaults are never re-applied on top.
            await new sql.Request(tx).input('e', sql.NVarChar, String(empCode))
                .query('UPDATE dbo.Stock_Users SET PermInitAt = COALESCE(PermInitAt, GETDATE()) WHERE EmpCode = @e');
        }
        await tx.commit();
        if (isUser) invalidateUser(empCode);
        return { added: added.length, removed: removed.length };
    } catch (err) {
        try { await tx.rollback(); } catch { /* already rolled back */ }
        throw err;
    }
};

export const setUserPermissions = (empCode, keys, changedBy) =>
    replaceSet({ table: 'user', empCode, keys, changedBy });

export const setDefaultPermissions = (keys, changedBy) =>
    replaceSet({ table: 'defaults', keys, changedBy });

export const getAuditLog = async (empCode, limit = 100) => {
    const n = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    const r = await getPool().request()
        .input('e', sql.NVarChar, String(empCode))
        .input('n', sql.Int, n)
        .query(`SELECT TOP (@n) ID, EmpCode, PageKey, Action, Change, ChangedBy, ChangedAt
                FROM dbo.Stock_PermissionAudit WHERE EmpCode = @e ORDER BY ID DESC`);
    return r.recordset;
};

// ─── "Would deny" tally for log mode (in memory; resets when the server restarts) ─────
const wouldDeny = new Map(); // "empCode|page|action|reason" -> { count, last }
export const recordWouldDeny = ({ empCode, page, action, reason }) => {
    const k = `${empCode || '-'}|${page}|${action}|${reason}`;
    const cur = wouldDeny.get(k) || { count: 0, last: null };
    cur.count += 1;
    cur.last = new Date().toISOString();
    wouldDeny.set(k, cur);
};
export const getWouldDenySummary = () =>
    [...wouldDeny.entries()].map(([k, v]) => {
        const [empCode, page, action, reason] = k.split('|');
        return { empCode, page, action, reason, count: v.count, last: v.last };
    }).sort((a, b) => b.count - a.count);

export { defaultPermissionKeys };

// Safety net run at server start: any user created while the permission code was not running
// (e.g. between the migration and a restart) gets the default set, so nobody is left with none.
export const backfillUninitialisedUsers = async () => {
    try {
        const r = await getPool().request().query(`
            INSERT INTO dbo.Stock_PagePermissions (EmpCode, PageKey, Action, GrantedBy)
            SELECT u.EmpCode, d.PageKey, d.Action, 'SYSTEM'
            FROM dbo.Stock_Users u
            CROSS JOIN dbo.Stock_PermissionDefaults d
            WHERE u.PermInitAt IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.Stock_PagePermissions p
                  WHERE p.EmpCode = u.EmpCode AND p.PageKey = d.PageKey AND p.Action = d.Action
              );
            UPDATE dbo.Stock_Users SET PermInitAt = GETDATE() WHERE PermInitAt IS NULL;
        `);
        invalidateUser();
        const n = (r.rowsAffected || []).reduce((a, b) => a + b, 0);
        if (n > 0) console.log(`[perm] backfilled default permissions for new users (${n} rows touched)`);
    } catch (err) {
        console.error('[perm] backfill failed:', err.message);
    }
};
