import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwtSecret.js';
import { assertPermission } from '../config/permissions.config.js';
import {
    getPermissionMode, loadUserAccess, userCan, recordWouldDeny,
} from '../services/permissionService.js';

// Guard a route with a page-level permission:
//   router.put('/ma/:id', requirePerm('ma-license', 'edit'), handler)
//
// - Admin always passes (role is read from the database, not the token).
// - mode "off"     : does nothing.
// - mode "log"     : lets the request through but records what would have been denied
//                    (visible at GET /permissions/log-summary and in the server log).
// - mode "enforce" : 401 when there is no valid token, 403 when the permission is missing.
// A wrong page/action name throws when the route file is loaded, so typos fail at startup.
export const requirePerm = (page, action) => {
    assertPermission(page, action);

    return async (req, res, next) => {
        const mode = getPermissionMode();
        if (mode === 'off') return next();

        // Identify the caller (works whether or not verifyToken already ran on this route).
        let user = req.user || null;
        if (!user) {
            try {
                const raw = req.headers['authorization'];
                if (raw) user = jwt.verify(raw.startsWith('Bearer ') ? raw.slice(7) : raw, getJwtSecret());
            } catch { user = null; }
        }

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

        if (allowed) return next();

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
