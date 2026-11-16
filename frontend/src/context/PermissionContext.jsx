import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE } from '../config/api';

// Page-level permissions for the logged-in user, loaded from GET /me/permissions.
//   can('inventory', 'edit')   -> true/false      (Admin is always true)
//   can('inventory')           -> same as 'view'
//   canRoute('/inventory')     -> may this user open that menu/route? (true for paths not in the catalog)
//   canAnyView('mgmt-')        -> has "view" on at least one page whose key starts with the prefix
//
// Until the permissions have loaded, can() is false, so edit buttons are never shown to someone who
// might not have the right. Viewing is not a secret, so menus/routes stay open until the answer is
// known (and if loading fails). The backend is always the real gatekeeper; this only hides UI.

const EMPTY = { ready: false, failed: false, isAdmin: false, mode: 'log', perms: new Set(), routes: [] };

const PermissionContext = createContext({
    ...EMPTY,
    settled: false,
    can: () => false,
    canRoute: () => true,
    canAnyView: () => false,
    firstAllowedRoute: () => null,
    refresh: async () => {},
});

const MIN_GAP_MS = 15 * 1000; // don't refetch more often than this on focus changes

export const PermissionProvider = ({ children }) => {
    const { token, user, isAuthenticated } = useAuth();
    const empCode = user?.empcode || '';
    const [state, setState] = useState(EMPTY);
    const lastFetchAt = useRef(0);
    const inflight = useRef(false);
    const tokenRef = useRef(token);
    tokenRef.current = token;

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

    const value = useMemo(() => {
        const can = (page, action = 'view') => state.isAdmin || state.perms.has(`${page}:${action}`);

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
            canRoute,
            canAnyView,
            firstAllowedRoute,
            refresh,
        };
    }, [state, refresh]);

    return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
};

export const usePermissions = () => useContext(PermissionContext);

// const canEdit = useCan('ma-license', 'edit');
export const useCan = (page, action = 'view') => useContext(PermissionContext).can(page, action);
