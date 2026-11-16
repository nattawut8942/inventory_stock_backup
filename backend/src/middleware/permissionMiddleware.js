import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwtSecret.js';
import { assertPermission } from '../config/permissions.config.js';
import {
    getPermissionMode, loadUserAccess, userCan, recordWouldDeny,
} from '../services/permissionService.js';

// Guard a route with a page-level permission:
//   router.put('/ma/:id', requirePerm('ma-license', 'edit', { strict: true }), handler)
//
// - Admin always passes (role is read from the database, not the token).
// - mode "off"     : does nothing.
// - mode "log"     : lets the request through but records what would have been denied
//                    (visible at GET /permissions/log-summary and in the server log).
// - mode "enforce" : 401 when there is no valid token, 403 when the permission is missing.
//
// { strict: true } is for routes that were ALREADY locked (Admin only) before the permission
// system existed. They stay enforced even in "log" mode, so converting them never opens anything.
// In "off" mode (the emergency switch) strict routes fall back to the old rule: token role Admin.
//
// A wrong page/action name throws when the route file is loaded, so typos fail at startup.
// The returned middleware carries .permMeta so tests can audit the whole route table.

const identify = (req) => {
    let user = req.user || null;
    if (!user) {
        try {
            const raw = req.headers['authorization'];
            if (raw) user = jwt.verify(raw.startsWith('Bearer ') ? raw.slice(7) : raw, getJwtSecret());
        } catch { user = null; }
    }
    return user;
};

export const requirePerm = (page, action, options = {}) => {
    assertPermission(page, action);
    const strict = !!options.strict;

    const middleware = async (req, res, next) => {
        const configured = getPermissionMode();
        const user = identify(req);

        // Emergency switch on an already-locked route: old behaviour (token role Admin only).
        if (strict && configured === 'off') {
            if (!user) return res.status(401).json({ success: false, error: 'กรุณาเข้าสู่ระบบ', code: 'UNAUTHORIZED' });
            if (user.role !== 'Admin') {
                return res.status(403).json({ success: false, error: 'คุณไม่มีสิทธิ์ดำเนินการนี้ กรุณาติดต่อ Admin', code: 'PERMISSION_DENIED', page, action });
            }
            return next();
        }

        const mode = strict ? 'enforce' : configured;
        if (mode === 'off') return next();

        let allowed = false;
        let reason = '';
        let lookupFailed = false;
        if (!user || !user.empcode) {
            reason = 'no-token';
        } else {
            try {
                const access = await loadUserAccess(user.empcode);
                allowed = userCan(access, page, action);
                if (!allowed) reason = access.found ? 'no-permission' : 'user-not-found';
            } catch (err) {
                lookupFailed = true;
                reason = 'lookup-failed';
                console.error('[perm] lookup failed:', err.message);
            }
        }

        if (allowed) {
            req.perm = { page, action };
            return next();
        }

        if (mode === 'log') {
            recordWouldDeny({ empCode: user?.empcode, page, action, reason });
            console.warn(`[perm] WOULD DENY ${req.method} ${req.originalUrl.split('?')[0]} user=${user?.empcode || '-'} needs=${page}:${action} (${reason})`);
            return next();
        }

        // enforce
        if (lookupFailed) {
            return res.status(503).json({ success: false, error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองใหม่', code: 'PERMISSION_LOOKUP_FAILED' });
        }
        if (reason === 'no-token') {
            return res.status(401).json({ success: false, error: 'กรุณาเข้าสู่ระบบ', code: 'UNAUTHORIZED' });
        }
        return res.status(403).json({
            success: false,
            error: 'คุณไม่มีสิทธิ์ดำเนินการนี้ กรุณาติดต่อ Admin',
            code: 'PERMISSION_DENIED',
            page,
            action,
        });
    };

    middleware.permMeta = { page, action, strict };
    return middleware;
};

// For controllers that need an extra, conditional check (e.g. "deleting a confirmed stock count
// needs stock-count:delete, but cancelling your own draft does not"). Same rules as strict routes.
export const hasPermission = async (req, page, action) => {
    assertPermission(page, action);
    const user = identify(req);
    if (!user?.empcode) return false;
    if (getPermissionMode() === 'off') return user.role === 'Admin'; // emergency switch: old rule
    try {
        return userCan(await loadUserAccess(user.empcode), page, action);
    } catch (err) {
        console.error('[perm] lookup failed:', err.message);
        return false;
    }
};

// Admin check that reads the role from the database (not the token), so demoting an Admin
// takes effect on the very next request. Used for the permission-management endpoints.
export const requireDbAdmin = async (req, res, next) => {
    try {
        if (!req.user?.empcode) return res.status(401).json({ message: 'Unauthorized' });
        const access = await loadUserAccess(req.user.empcode);
        if (!access.found || access.role !== 'Admin') {
            return res.status(403).json({ message: 'Forbidden: Admin only' });
        }
        next();
    } catch (err) {
        console.error('[perm] admin lookup failed:', err.message);
        res.status(503).json({ message: 'ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองใหม่' });
    }
};
