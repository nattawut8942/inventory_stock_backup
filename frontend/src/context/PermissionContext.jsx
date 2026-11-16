import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE } from '../config/api';

// Page-level permissions for the logged-in user, loaded from GET /me/permissions.
//   can('inventory', 'edit')  -> true/false      (Admin is always true)
//   can('inventory')          -> same as 'view'
// Until the permissions have loaded, can() is false, so edit buttons are never shown to someone
// who might not have the right. The backend is always the real gatekeeper; this only hides UI.

const EMPTY = { ready: false, isAdmin: false, mode: 'log', perms: new Set() };

const PermissionContext = createContext({
    ...EMPTY,
    can: () => false,
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
                    isAdmin: !!d.isAdmin,
                    mode: d.mode || 'log',
                    perms: new Set(Array.isArray(d.permissions) ? d.permissions : []),
                });
                lastFetchAt.current = Date.now();
            }
            // On error keep whatever we had: a failed refresh must not wipe or grant anything.
        } catch {
            /* network error: keep previous state */
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

    const value = useMemo(() => ({
        ready: state.ready,
        isAdmin: state.isAdmin,
        mode: state.mode,
        can: (page, action = 'view') => state.isAdmin || state.perms.has(`${page}:${action}`),
        refresh,
    }), [state, refresh]);

    return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
};

export const usePermissions = () => useContext(PermissionContext);

// const canEdit = useCan('ma-license', 'edit');
export const useCan = (page, action = 'view') => useContext(PermissionContext).can(page, action);
