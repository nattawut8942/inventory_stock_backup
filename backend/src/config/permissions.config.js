// Single source of truth for page-level permissions.
// Backend (requirePerm, validation, defaults) and the frontend permission editor
// (via GET /permissions/catalog) both read this list, so a typo in a page/action
// name fails at server start instead of silently locking someone out.
//
// A permission is the string "<pageKey>:<action>", e.g. "inventory:edit".
// Admin always passes every check and is NOT listed here: managing users, roles,
// permissions and the login log can never be granted to anyone else.

export const ACTION_LABELS = {
    view: 'ดู',
    create: 'เพิ่ม',
    open: 'เปิดรอบ',
    'delete-run': 'ลบรอบ',
    'edit-run': 'แก้ไขรอบ',
    edit: 'แก้ไข',
    delete: 'ลบ',
    withdraw: 'เบิกของ',
    receive: 'รับของ',
    cancel: 'ยกเลิกใบรับ',
    return: 'รับคืน',
    count: 'นับสต็อก',
    adjust: 'ปรับสต็อก',
    manage: 'จัดการ subnet / สั่งสแกน',
    send: 'ส่งแจ้งเตือน / รายงาน',
    extend: 'ปรับขนาดโควต้าพื้นที่',
};

const CRUD = ['view', 'create', 'edit', 'delete'];

// defaultView:false = page is not visible to new users by default (Admin-only today)
export const PAGES = [
    // ── ทั่วไป ──
    { key: 'dashboard',       group: 'ทั่วไป', label: 'Dashboard', route: '/dashboard', actions: ['view'] },
    { key: 'activity',        group: 'ทั่วไป', label: 'Activity',  route: '/activity',  actions: CRUD },
    // ── Inventory & Procurement ──
    { key: 'inventory',       group: 'Inventory & Procurement', label: 'Stock Inventory',  route: '/inventory',       actions: ['view', 'withdraw', 'return', 'edit', 'delete'] },
    { key: 'stock-count',     group: 'Inventory & Procurement', label: 'Stock Count',      route: null,               actions: ['view', 'count', 'adjust', 'edit', 'delete'] },
    { key: 'ink-toner',       group: 'Inventory & Procurement', label: 'Ink & Toner',      route: '/ink-toner',       actions: ['view'] },
    { key: 'printer-health',  group: 'Inventory & Procurement', label: 'Printer Health',   route: '/printer-health',  actions: ['view', 'create', 'edit'] },
    { key: 'purchase-orders', group: 'Inventory & Procurement', label: 'PR & Orders',      route: '/purchase-orders', actions: CRUD },
    { key: 'receive',         group: 'Inventory & Procurement', label: 'Receive Items',    route: '/receive',         actions: ['view', 'receive', 'cancel'] },
    { key: 'borrowings',      group: 'Inventory & Procurement', label: 'Borrowing System', route: '/borrowings',      actions: ['view', 'create', 'return', 'edit'] },
    // ── Asset Management ──
    { key: 'pc-inventory',    group: 'Asset Management', label: 'PC / Monitor Inventory', route: '/pc-inventory',    actions: ['view', 'edit', 'delete'] },
    { key: 'devices-layout',  group: 'Asset Management', label: 'Devices Layout',         route: '/pc-control',      actions: ['view', 'edit'] },
    { key: 'it-disposal',     group: 'Asset Management', label: 'IT Asset Disposal',      route: '/it-disposal',     actions: ['view', 'open', 'create', 'edit', 'edit-run', 'delete', 'delete-run'] },
    { key: 'cctv',            group: 'Asset Management', label: 'CCTV Management',        route: '/cctv-management', actions: CRUD },
    { key: 'ma-license',      group: 'Asset Management', label: 'MA / License',           route: '/ma-license',      actions: CRUD },
    // ── Infrastructure & Network ──
    { key: 'ip-management',   group: 'Infrastructure & Network', label: 'IP Management', route: '/ip-management', actions: ['view', 'edit', 'manage'] },
    { key: 'ad-explorer',     group: 'Infrastructure & Network', label: 'AD Explorer',   route: '/ad-explorer',   actions: ['view'] },
    // ── System Administration ──
    { key: 'quota-manager',   group: 'System Administration', label: 'Quota Manager',     route: '/quota-manager', actions: ['view', 'send', 'delete', 'extend'] },
    { key: 'calendar',        group: 'System Administration', label: 'Calendar',          route: '/calendar',      actions: CRUD },
    { key: 'sound-layout',    group: 'System Administration', label: 'Sound Engineering', route: '/sound-layout',  actions: CRUD },
    // ── Operations & Knowledge ──
    { key: 'it-request',      group: 'Operations & Knowledge', label: 'IT Request',     route: '/it-request',     actions: ['view'] },
    { key: 'history',         group: 'Operations & Knowledge', label: 'History Log',    route: '/history',        actions: ['view'] },
    { key: 'reports',         group: 'Operations & Knowledge', label: 'Reports',        route: '/reports',        actions: ['view'] },
    { key: 'knowledge-base',  group: 'Operations & Knowledge', label: 'Knowledge Base', route: '/knowledge-base', actions: CRUD },
    // ── Staff Controls (Admin-only today → not visible by default) ──
    { key: 'manual-import',   group: 'Staff Controls', label: 'Manual Import', route: '/manual-import', actions: ['view', 'create'], defaultView: false },
    // ── Management tabs (the Users / Login Log tabs stay Admin-only and are not listed) ──
    { key: 'mgmt-vendors',             group: 'Management', label: 'Vendors',                route: null, actions: CRUD, defaultView: false },
    { key: 'mgmt-locations',           group: 'Management', label: 'Locations',              route: null, actions: CRUD, defaultView: false },
    { key: 'mgmt-reasons',             group: 'Management', label: 'Reasons',                route: null, actions: CRUD, defaultView: false },
    { key: 'mgmt-ma-types',            group: 'Management', label: 'MA Types',               route: null, actions: CRUD, defaultView: false },
    { key: 'mgmt-budgets',             group: 'Management', label: 'Budgets',                route: null, actions: CRUD, defaultView: false },
    { key: 'mgmt-device-types',        group: 'Management', label: 'Device Types',           route: null, actions: CRUD, defaultView: false },
    { key: 'mgmt-factory-layouts',     group: 'Management', label: 'Maps (Factory Layouts)', route: null, actions: CRUD, defaultView: false },
    { key: 'mgmt-record-servers',      group: 'Management', label: 'Record Servers',         route: null, actions: CRUD, defaultView: false },
    { key: 'mgmt-activity-categories', group: 'Management', label: 'Activity Categories',    route: null, actions: CRUD, defaultView: false },
];

const PAGE_BY_KEY = new Map(PAGES.map((p) => [p.key, p]));

// Fail fast on a malformed catalog (duplicate key, missing view, unknown action label).
(() => {
    if (PAGE_BY_KEY.size !== PAGES.length) throw new Error('permissions.config: duplicate page key');
    for (const p of PAGES) {
        if (!p.actions.includes('view')) throw new Error(`permissions.config: page ${p.key} must have a "view" action`);
        for (const a of p.actions) {
            if (!ACTION_LABELS[a]) throw new Error(`permissions.config: unknown action "${a}" on ${p.key}`);
        }
    }
})();

export const permKey = (page, action) => `${page}:${action}`;

export const isValidPermission = (key) => {
    if (typeof key !== 'string') return false;
    const i = key.indexOf(':');
    if (i <= 0) return false;
    const page = PAGE_BY_KEY.get(key.slice(0, i));
    return !!page && page.actions.includes(key.slice(i + 1));
};

// Throws at startup if a route is guarded with a page/action that does not exist.
export const assertPermission = (page, action) => {
    if (!isValidPermission(permKey(page, action))) {
        throw new Error(`requirePerm: unknown permission "${page}:${action}" (not in permissions.config.js)`);
    }
};

export const allPermissionKeys = () => PAGES.flatMap((p) => p.actions.map((a) => permKey(p.key, a)));

// What a brand-new user gets: "view" on every page that is not Admin-only today.
export const defaultPermissionKeys = () =>
    PAGES.filter((p) => p.defaultView !== false).map((p) => permKey(p.key, 'view'));

export const catalogForClient = () => ({
    actionLabels: ACTION_LABELS,
    pages: PAGES.map((p) => ({
        key: p.key,
        group: p.group,
        label: p.label,
        route: p.route,
        defaultView: p.defaultView !== false,
        actions: p.actions.map((a) => ({ key: a, label: ACTION_LABELS[a] })),
    })),
});
