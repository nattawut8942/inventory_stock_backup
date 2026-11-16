import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionContext';

// <ProtectedRoute>                          must be logged in
// <ProtectedRoute byRoute>                  ...and may "view" the page this URL belongs to (used once, around the Layout)
// <ProtectedRoute perm={['manual-import']}> ...and has that permission (action defaults to 'view')
// <ProtectedRoute anyView="mgmt-">          ...and may view at least one page whose key starts with the prefix
//
// While permissions are still loading nothing is decided (no redirect flash). If loading fails the
// page opens anyway: viewing is not a secret and the backend still decides what any action does.

const Gate = ({ children }) => (
    <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading...</div>
);

const NoAccess = () => (
    <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-xl font-black text-slate-700 mb-1">ไม่มีสิทธิ์เข้าหน้านี้</h2>
        <p className="text-slate-500 text-sm">กรุณาติดต่อ Admin เพื่อขอสิทธิ์</p>
    </div>
);

const ProtectedRoute = ({ children, byRoute = false, perm = null, anyView = null }) => {
    const { isAuthenticated } = useAuth();
    const { ready, settled, can, canRoute, canAnyView, firstAllowedRoute } = usePermissions();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    const needsCheck = byRoute || !!perm || !!anyView;
    if (!needsCheck) return children;

    if (!settled) return <Gate />;
    if (!ready) return children; // failed to load: stay open, backend decides

    let allowed = true;
    if (byRoute) allowed = allowed && canRoute(location.pathname);
    if (perm) allowed = allowed && can(perm[0], perm[1] || 'view');
    if (anyView) allowed = allowed && canAnyView(anyView);

    if (allowed) return children;

    // Not allowed here: send them to the first page they may view (never loop back to the same path)
    const target = firstAllowedRoute();
    if (target && target !== location.pathname) return <Navigate to={target} replace />;
    return <NoAccess />;
};

export default ProtectedRoute;
