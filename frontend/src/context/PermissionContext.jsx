import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, PERMISSION_DENIED_EVENT } from './AuthContext';
import { API_BASE } from '../config/api';

// Page-level permissions for the logged-in user, loaded from GET /me/permissions.
//   can('inventory', 'edit')      -> true/false      (Admin is always true)
//   can('inventory')              -> same as 'view'
//   canAct('inventory','withdraw')-> for actions the server only LOGS for now (see below)
//   canRoute('/inventory')        -> may this user open that menu/route? (true for paths not in the catalog)
//   canAnyView('mgmt-')           -> has "view" on at least one page whose key starts with the prefix
//
// Two kinds of server-side checks exist:
//   * strict routes (everything that used to be Admin only) are enforced now  -> use can()
//   * the rest are "log" routes: the server records who would be blocked but lets everyone through until
//     the owner switches PERMISSIONS_MODE to "enforce"                           -> use canAct()
// canAct() therefore shows the button to everyone while the server is in log mode, and follows the
// permissions once the server enforces them - so switching the mode never needs a frontend change.
//
// Until the permissions have loaded, can()/canAct() are false, so action buttons are never shown to someone
// who might not have the right. Viewing is not a secret, so menus/routes stay open until the answer is
// known (and if loading fails). The backend is always the real gatekeeper; this only hides UI.

const EMPTY = { ready: false, failed: false, isAdmin: false, mode: 'log', perms: new Set(), routes: [], pageLabels: {}, actionLabels: {} };

const PermissionContext = createContext({
    ...EMPTY,
    settled: false,
    can: () => false,
    canAct: () => false,
    canRoute: () => true,
    canAnyView: () => false,
    firstAllowedRoute: () => null,
    refresh: async () => {},
});

const MIN_GAP_MS = 15 * 1000; // don't refetch more often than this on focus changes

// "You do not have permission" notice (shown when the server refuses an action)
const DeniedNotice = ({ notice, onClose }) => {
    if (!notice) return null;
    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] max-w-[92vw]" role="alert">
            <div className="flex items-start gap-3 bg-white border border-rose-200 shadow-xl rounded-xl px-4 py-3">
                <div className="text-xl leading-none">🔒</div>
                <div className="text-sm">
                    <p className="font-bold text-rose-700">คุณไม่มีสิทธิ์ดำเนินการนี้</p>
                    <p className="text-slate-600">{notice}</p>
                    <p className="text-slate-400 text-xs mt-0.5">กรุณาติดต่อ Admin เพื่อขอสิทธิ์</p>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none" aria-label="ปิด">×</button>
            </div>
        </div>
    );
};

export const PermissionProvider = ({ children }) => {
    const { token, user, isAuthenticated } = useAuth();
    const empCode = user?.empcode || '';
    const [state, setState] = useState(EMPTY);
    const [notice, setNotice] = useState('');
    const lastFetchAt = useRef(0);
    const inflight = useRef(false);
    const tokenRef = useRef(token);
    tokenRef.current = token;
    const stateRef = useRef(state);
    stateRef.current = state;

    const refresh = useCallback(async (force = false) => {
        const t = tokenRef.current;
        if (!t) return;
        if (inflight.current) return;
        if (!force && Date.now() - lastFetchAt.current < MIN_GAP_MS) return;
        inflight.current = true;
        try {
            const res = await fetch(`${API_BASE}/me/permissions`, { headers: { Authorization: `Bearer ${t}` } });
            if (res.ok) {
                const d = await res.json();
                setState({
                    ready: true,
                    failed: false,
                    isAdmin: !!d.isAdmin,
                    mode: d.mode || 'log',
                    perms: new Set(Array.isArray(d.permissions) ? d.permissions : []),
                    routes: Array.isArray(d.routes) ? d.routes : [],
                    pageLabels: d.pageLabels || {},
                    actionLabels: d.actionLabels || {},
                });
                lastFetchAt.current = Date.now();
            } else {
                // Keep whatever we had; only mark "failed" if we never had an answer, so the app can still open.
                setState((prev) => (prev.ready ? prev : { ...prev, failed: true }));
            }
        } catch {
            setState((prev) => (prev.ready ? prev : { ...prev, failed: true }));
        } finally {
            inflight.current = false;
        }
    }, []);

    // New login / logout / different user: reset, then load fresh
    useEffect(() => {
        setState(EMPTY);
        setNotice('');
        lastFetchAt.current = 0;
        if (isAuthenticated && token) refresh(true);
    }, [isAuthenticated, token, empCode, refresh]);

    // Pick up changes an Admin made while this tab was open
    useEffect(() => {
        if (!isAuthenticated) return undefined;
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(false); };
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener('focus', onVisible);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [isAuthenticated, refresh]);

    // The server refused something: say which permission is missing and refresh our copy of the permissions
    useEffect(() => {
        if (!isAuthenticated) return undefined;
        const onDenied = (e) => {
            const { page, action } = e.detail || {};
            const s = stateRef.current;
            const pageName = s.pageLabels[page] || page || '';
            const actionName = s.actionLabels[action] || action || '';
            setNotice(pageName || actionName ? `ต้องมีสิทธิ์ "${actionName}" ของหน้า ${pageName}` : 'ไม่ได้รับสิทธิ์ให้ทำรายการนี้');
            refresh(true);
        };
        window.addEventListener(PERMISSION_DENIED_EVENT, onDenied);
        return () => window.removeEventListener(PERMISSION_DENIED_EVENT, onDenied);
    }, [isAuthenticated, refresh]);

    useEffect(() => {
        if (!notice) return undefined;
        const t = setTimeout(() => setNotice(''), 7000);
        return () => clearTimeout(t);
    }, [notice]);

    const value = useMemo(() => {
        const can = (page, action = 'view') => state.isAdmin || state.perms.has(`${page}:${action}`);
        // Follows the server: shown to everyone while it only logs, follows the permissions once it enforces.
        // If the lookup failed we cannot know, so do not hide anything (the server still decides).
        const canAct = (page, action) => {
            if (state.failed) return true;
            if (!state.ready) return false;
            return state.isAdmin || state.mode !== 'enforce' || state.perms.has(`${page}:${action}`);
        };

        // longest route first so '/ad-explorer/user/x' matches '/ad-explorer'
        const byLength = [...state.routes].sort((a, b) => b.route.length - a.route.length);
        const pageForPath = (path) => {
            const hit = byLength.find((r) => path === r.route || path.startsWith(`${r.route}/`));
            return hit ? hit.page : null;
        };
        // Not ready / failed: viewing stays open (the backend decides what actually happens).
        const canRoute = (path) => {
            if (!state.ready) return true;
            const page = pageForPath(path);
            return !page || can(page, 'view');
        };
        const canAnyView = (prefix) =>
            state.isAdmin || [...state.perms].some((k) => k.startsWith(prefix) && k.endsWith(':view'));
        const firstAllowedRoute = () => {
            const hit = state.routes.find((r) => can(r.page, 'view'));
            return hit ? hit.route : null;
        };

        return {
            ready: state.ready,
            failed: state.failed,
            settled: state.ready || state.failed,
            isAdmin: state.isAdmin,
            mode: state.mode,
            can,
            canAct,
            canRoute,
            canAnyView,
            firstAllowedRoute,
            refresh,
        };
    }, [state, refresh]);

    return (
        <PermissionContext.Provider value={value}>
            {children}
            <DeniedNotice notice={notice} onClose={() => setNotice('')} />
        </PermissionContext.Provider>
    );
};

export const usePermissions = () => useContext(PermissionContext);

// const canEdit = useCan('ma-license', 'edit');         enforced now (used for what used to be Admin only)
// const canWithdraw = useCanAct('inventory', 'withdraw');  follows the server mode (see the note at the top)
export const useCan = (page, action = 'view') => useContext(PermissionContext).can(page, action);
export const useCanAct = (page, action) => useContext(PermissionContext).canAct(page, action);
