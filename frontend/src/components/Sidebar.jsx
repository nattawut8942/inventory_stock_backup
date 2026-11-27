import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, ChevronDown, ChevronLeft, ChevronRight, Search, Star, X } from 'lucide-react';
import { useAuth, getAuthToken } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionContext';
import { API_BASE } from '../config/api';
import { NAV_GROUPS } from '../config/navConfig';
import logodaikin from '../../public/DAIKIN_logo.svg.png';
import logodaikinn from '../../public/icon-daikin (Custom).png';

const STORAGE_KEYS = { pinned: 'sidebar_pinned', groups: 'sidebar_groups' };
const COUNTS_REFRESH_MS = 60000;

// ── สีของ badge (เขียนเป็น class เต็มเพื่อให้ Tailwind เก็บได้) ────────────
// solid = พื้นทึบของตัวเลข | onDark = สีข้อความบนเมนูปกติ | onLight = สีข้อความบนเมนูที่เลือกอยู่ (พื้นขาว)
const BADGE_TONES = {
    indigo: { solid: 'bg-indigo-400 text-indigo-950', onDark: 'text-indigo-300', onLight: 'text-indigo-600', dot: 'bg-indigo-400' },
    sky: { solid: 'bg-sky-400 text-sky-950', onDark: 'text-sky-300', onLight: 'text-sky-600', dot: 'bg-sky-400' },
    amber: { solid: 'bg-amber-400 text-amber-950', onDark: 'text-amber-300', onLight: 'text-amber-600', dot: 'bg-amber-400' },
    rose: { solid: 'bg-rose-500 text-white', onDark: 'text-rose-300', onLight: 'text-rose-600', dot: 'bg-rose-400' },
    orange: { solid: 'bg-orange-500 text-white', onDark: 'text-orange-300', onLight: 'text-orange-600', dot: 'bg-orange-400' },
    violet: { solid: 'bg-violet-400 text-violet-950', onDark: 'text-violet-300', onLight: 'text-violet-600', dot: 'bg-violet-400' },
    emerald: { solid: 'bg-emerald-400 text-emerald-950', onDark: 'text-emerald-300', onLight: 'text-emerald-600', dot: 'bg-emerald-400' },
};
const DEFAULT_TONE = BADGE_TONES.rose;

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70';

// ── localStorage helpers (ไม่ throw ถ้า storage ใช้ไม่ได้) ─────────────────
const readJSON = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
};
const writeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { } };

// ── Tooltip (แสดงเมื่อ sidebar หุบ) ──────────────────────────────────────
const Tooltip = ({ label, children, collapsed }) => {
    if (!collapsed) return children;
    return (
        <div className="relative group/tip flex">
            {children}
            <div className="
                pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2
                px-2.5 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg
                whitespace-nowrap opacity-0 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100
                transition-all duration-150 shadow-xl z-[100]
                border border-white/10
            ">
                {label}
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
            </div>
        </div>
    );
};

// ── NavItem ────────────────────────────────────────────────────────────────
// โครงแถว: [ปุ่มเมนู: ไอคอน + ชื่อ + สถานะรอง] [ตัวเลขนอกปุ่ม] [ดาวปักหมุด]
// ชื่อเมนูจึงไม่ถูกตัดด้วยป้าย และป้ายอยู่นอกปุ่มทั้งหมด
const NavItem = ({ item, active, collapsed, pinned, badgeCount, onNavigate, onTogglePin }) => {
    const Icon = item.icon;
    const hasBadge = badgeCount > 0;
    const tone = BADGE_TONES[item.badgeTone] || DEFAULT_TONE;
    const countText = badgeCount > 99 ? '99+' : badgeCount;

    const btn = (
        <button
            type="button"
            onClick={() => onNavigate(item.to)}
            aria-current={active ? 'page' : undefined}
            aria-label={collapsed ? item.label : undefined}
            className={`
                relative flex-1 min-w-0 flex items-center rounded-xl transition-all duration-200 ${FOCUS_RING}
                ${collapsed ? 'justify-center p-2.5' : 'gap-3 py-2 pl-3 pr-2'}
                ${active
                    ? 'bg-[#ffffff] text-indigo-950 shadow-lg shadow-indigo-950/20'
                    : 'text-indigo-100/75 hover:bg-white/10 hover:text-white'}
            `}
        >
            {active && !collapsed && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-indigo-500" />
            )}
            <Icon size={16} className={`flex-shrink-0 ${active ? 'text-indigo-600' : ''}`} />

            {!collapsed && (
                <span className="flex-1 min-w-0 flex flex-col items-start text-left">
                    <span className="w-full truncate text-[13px] font-medium leading-tight">{item.label}</span>
                    {hasBadge && item.badgeLabel && (
                        <span className={`w-full truncate text-[10px] font-semibold leading-tight mt-0.5 ${active ? tone.onLight : tone.onDark}`}>
                            {item.badgeLabel}
                        </span>
                    )}
                </span>
            )}

            {hasBadge && collapsed && (
                <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full ring-2 ring-slate-900 text-[10px] font-bold leading-[18px] text-center tabular-nums shadow ${tone.solid}`}>
                    {countText}
                </span>
            )}
        </button>
    );

    if (collapsed) {
        const tip = hasBadge && item.badgeLabel ? `${item.label} · ${item.badgeLabel} ${countText}` : item.label;
        return <Tooltip label={tip} collapsed>{btn}</Tooltip>;
    }

    return (
        <div className="group/row flex items-center gap-1">
            {btn}
            {hasBadge && (
                <span
                    aria-label={`${badgeCount} รายการ`}
                    className={`flex-shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold leading-[22px] text-center tabular-nums shadow-md ${tone.solid}`}
                >
                    {countText}
                </span>
            )}
            <button
                type="button"
                onClick={() => onTogglePin(item.to)}
                aria-label={pinned ? `ยกเลิกปักหมุด ${item.label}` : `ปักหมุด ${item.label}`}
                title={pinned ? 'ยกเลิกปักหมุด' : 'ปักหมุด'}
                className={`flex-shrink-0 w-6 h-8 flex items-center justify-center rounded-md transition-all ${FOCUS_RING}
                    ${pinned
                        ? 'opacity-100 text-amber-400'
                        : `opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 ${active ? 'text-indigo-400 hover:text-amber-500' : 'text-indigo-200/60 hover:text-amber-300'}`}`}
            >
                <Star size={12} fill={pinned ? 'currentColor' : 'none'} />
            </button>
        </div>
    );
};

// ── GroupHeader (กดเพื่อพับ/กางกลุ่ม) ────────────────────────────────────
const GroupHeader = ({ label, icon: Icon, open, hasActive, onToggle }) => (
    <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 pl-3 pr-2 pt-4 pb-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 hover:text-indigo-200 transition-colors ${FOCUS_RING}`}
    >
        <Icon size={12} className="flex-shrink-0" />
        <span className="flex-1 text-left truncate">{label}</span>
        {!open && hasActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" title="มีหน้าที่กำลังใช้งานอยู่" />
        )}
        <ChevronDown size={12} className={`flex-shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
    </button>
);

const SectionLabel = ({ children, className = '' }) => (
    <div className={`flex items-center gap-2 pl-3 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${className}`}>
        {children}
    </div>
);

// ── Divider ────────────────────────────────────────────────────────────────
const Divider = ({ collapsed }) => (
    collapsed
        ? <div className="my-2 mx-auto w-6 border-t border-white/10" />
        : <div className="my-2 border-t border-white/5 mx-3" />
);

// ── SIDEBAR ────────────────────────────────────────────────────────────────
const Sidebar = ({ isOpen, onClose, collapsed = false, onToggleCollapse }) => {
    const { user, logout } = useAuth();
    const { isAdmin, can, canAnyView, canRoute } = usePermissions();
    const canSeeManualImport = isAdmin || can('manual-import', 'view');
    const canSeeManagement = isAdmin || canAnyView('mgmt-');
    const navigate = useNavigate();
    const location = useLocation();

    const [pinned, setPinned] = useState(() => readJSON(STORAGE_KEYS.pinned, []));
    const [openGroups, setOpenGroups] = useState(() => readJSON(STORAGE_KEYS.groups, {}));
    const [counts, setCounts] = useState({});
    const [query, setQuery] = useState('');
    const searchRef = useRef(null);
    const focusSearchOnExpand = useRef(false);

    useEffect(() => { writeJSON(STORAGE_KEYS.pinned, pinned); }, [pinned]);
    useEffect(() => { writeJSON(STORAGE_KEYS.groups, openGroups); }, [openGroups]);

    const isActive = (to) => location.pathname === to || location.pathname.startsWith(`${to}/`);

    // กรองเมนูตามสิทธิ์ — ซ่อนกลุ่มที่ไม่มีเมนูให้เห็นเลย
    const groups = NAV_GROUPS
        .map(g => ({
            ...g,
            items: g.items.filter(i =>
                (i.gate !== 'manualImport' || canSeeManualImport) &&
                (i.gate !== 'management' || canSeeManagement) &&
                canRoute(i.to)
            ),
        }))
        .filter(g => g.items.length > 0);

    const allItems = groups.flatMap(g => g.items.map(i => ({ ...i, groupLabel: g.label })));
    const pinnedItems = pinned.map(to => allItems.find(i => i.to === to)).filter(Boolean);

    const isGroupOpen = (group) => group.flat || collapsed || openGroups[group.id] !== false;
    const toggleGroup = (id) => setOpenGroups(p => ({ ...p, [id]: p[id] === false }));

    // เปิดกลุ่มที่มีหน้าปัจจุบันอยู่ให้อัตโนมัติ
    useEffect(() => {
        const g = groups.find(grp => grp.items.some(i => isActive(i.to)));
        if (g && openGroups[g.id] === false) setOpenGroups(p => ({ ...p, [g.id]: true }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    // ดึงจำนวนงานค้างสำหรับ badge — โหลดเมื่อเปลี่ยนหน้า และรีเฟรชทุก 1 นาที
    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const t = getAuthToken();
                const res = await fetch(`${API_BASE}/nav-counts`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
                if (!res.ok) return;
                const json = await res.json();
                if (alive && json?.success) setCounts(json.data || {});
            } catch { /* badge เป็นส่วนเสริม — ล้มเหลวก็ไม่กระทบการใช้งาน */ }
        };
        load();
        const timer = setInterval(load, COUNTS_REFRESH_MS);
        return () => { alive = false; clearInterval(timer); };
    }, [location.pathname]);

    // ปุ่มลัด: Ctrl/⌘+K หรือ "/" = ค้นหา, Esc = ล้างการค้นหา / ปิด drawer มือถือ
    useEffect(() => {
        const onKey = (e) => {
            const tag = e.target?.tagName || '';
            const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (collapsed) {
                    focusSearchOnExpand.current = true;
                    onToggleCollapse?.();
                } else {
                    searchRef.current?.focus();
                }
                return;
            }
            if (e.key === '/' && !typing && !collapsed) {
                e.preventDefault();
                searchRef.current?.focus();
                return;
            }
            if (e.key === 'Escape') {
                if (query) setQuery('');
                else if (isOpen && onClose) onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [collapsed, isOpen, query, onClose, onToggleCollapse]);

    useEffect(() => {
        if (!collapsed && focusSearchOnExpand.current) {
            focusSearchOnExpand.current = false;
            searchRef.current?.focus();
        }
    }, [collapsed]);

    const handleNavigate = (to) => { navigate(to); if (onClose) onClose(); };
    const togglePin = (to) => setPinned(p => p.includes(to) ? p.filter(x => x !== to) : [...p, to]);
    const handleLogout = () => { logout(); navigate('/login'); if (onClose) onClose(); };

    const q = query.trim().toLowerCase();
    const showSearch = q.length > 0 && !collapsed;
    const searchResults = showSearch
        ? allItems.filter(i => i.label.toLowerCase().includes(q) || i.groupLabel.toLowerCase().includes(q))
        : [];

    const renderItem = (item) => (
        <NavItem
            key={item.to}
            item={item}
            active={isActive(item.to)}
            collapsed={collapsed}
            pinned={pinned.includes(item.to)}
            badgeCount={item.badge ? counts[item.badge] : null}
            onNavigate={handleNavigate}
            onTogglePin={togglePin}
        />
    );

    const w = collapsed ? 'w-[72px]' : 'w-64';

    return (
        <>
            {/* Mobile backdrop */}
            {isOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 lg:hidden" onClick={onClose} />
            )}

            <aside className={`
                fixed lg:relative inset-y-0 left-0 z-40 flex-shrink-0
                ${w} bg-slate-900 flex flex-col text-white
                transform transition-[width,transform] duration-300 ease-in-out shadow-2xl
                motion-reduce:transition-none
                ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                overflow-hidden
            `}>
                {/* Background gradients */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 z-0 pointer-events-none" />
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2 z-0 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500 rounded-full blur-[100px] opacity-10 translate-y-1/2 -translate-x-1/2 z-0 pointer-events-none" />

                {/* Header */}
                <div className={`relative z-10 flex flex-col items-center pt-6 pb-3 ${collapsed ? 'px-2' : 'px-4'}`}>
                    {collapsed ? (
                        <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center mb-1">
                            <img src={logodaikinn} alt="DAIKINN" className="w-full h-full object-contain" />
                        </div>
                    ) : (
                        <>
                            <div className="p-2 rounded-xl mb-2 w-full max-w-[200px] relative">
                                <img src={logodaikin} alt="DAIKIN" className="h-8 w-auto mx-auto object-contain" />
                                {/* Mobile close */}
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label="ปิดเมนู"
                                    className={`absolute -right-3 -top-2 lg:hidden text-slate-400 hover:text-white p-2 rounded-lg ${FOCUS_RING}`}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <h1 className="text-xl font-black tracking-tight text-white leading-none">IT INVENTORY</h1>
                            <span className="mt-1 text-[10px] font-bold text-indigo-300 tracking-[0.15em] uppercase">Management System</span>
                        </>
                    )}
                </div>

                {/* Toggle collapse button */}
                <button
                    type="button"
                    onClick={onToggleCollapse}
                    aria-label={collapsed ? 'ขยาย sidebar' : 'หุบ sidebar'}
                    title={collapsed ? 'ขยาย sidebar (Ctrl+K เพื่อค้นหา)' : 'หุบ sidebar'}
                    className={`hidden lg:flex absolute top-7 right-[-12px] z-20 items-center justify-center w-6 h-6 rounded-full bg-slate-800 hover:bg-indigo-600 text-indigo-200 hover:text-white transition-all border border-white/10 shadow-lg ${FOCUS_RING}`}
                >
                    {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                </button>

                {/* Search */}
                {!collapsed && (
                    <div className="relative z-10 px-3 pb-2">
                        <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            ref={searchRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="ค้นหาเมนู…"
                            aria-label="ค้นหาเมนู"
                            title="ค้นหา (Ctrl+K หรือ /)"
                            className="w-full rounded-xl bg-white/5 border border-white/10 py-2 pl-9 pr-8 text-xs text-white placeholder-slate-500 outline-none focus:bg-white/10 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/30 transition-all"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                aria-label="ล้างการค้นหา"
                                className={`absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white rounded ${FOCUS_RING}`}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                )}

                {/* Nav */}
                <nav className={`relative z-10 flex-1 overflow-y-auto overflow-x-hidden pb-6 ${collapsed ? 'px-2' : 'px-3'}`}>
                    {showSearch ? (
                        <div className="space-y-1">
                            {searchResults.length > 0
                                ? searchResults.map(renderItem)
                                : <p className="text-xs text-slate-400 text-center py-8">ไม่พบเมนูที่ค้นหา</p>}
                        </div>
                    ) : (
                        <>
                            {pinnedItems.length > 0 && (
                                <>
                                    {!collapsed && (
                                        <SectionLabel className="text-amber-300/80">
                                            <Star size={11} fill="currentColor" /> ปักหมุด
                                        </SectionLabel>
                                    )}
                                    <div className="space-y-1">{pinnedItems.map(renderItem)}</div>
                                    <Divider collapsed={collapsed} />
                                </>
                            )}

                            {groups.map((g, idx) => {
                                const open = isGroupOpen(g);
                                const hasActive = g.items.some(i => isActive(i.to));
                                return (
                                    <div key={g.id}>
                                        {collapsed
                                            ? (idx > 0 && <Divider collapsed />)
                                            : (!g.flat && (
                                                <GroupHeader
                                                    label={g.label}
                                                    icon={g.icon}
                                                    open={open}
                                                    hasActive={hasActive}
                                                    onToggle={() => toggleGroup(g.id)}
                                                />
                                            ))}
                                        {open && <div className="space-y-1">{g.items.map(renderItem)}</div>}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </nav>

                {/* User card */}
                <div className={`relative z-10 pt-4 border-t border-white/5 ${collapsed ? 'px-2 pb-4' : 'px-3 pb-5'}`}>
                    {collapsed ? (
                        <Tooltip label={`${user?.name} (${user?.role}) · ออกจากระบบ`} collapsed={true}>
                            <button
                                type="button"
                                onClick={handleLogout}
                                aria-label="ออกจากระบบ"
                                className={`w-full flex justify-center p-2 rounded-xl hover:bg-white/10 transition-colors group ${FOCUS_RING}`}
                            >
                                {user?.empPic
                                    ? <img src={user.empPic} alt="" className="w-9 h-9 rounded-xl object-cover ring-2 ring-white/10" />
                                    : <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                                        {user?.name?.[0]?.toUpperCase() || '?'}
                                    </div>
                                }
                            </button>
                        </Tooltip>
                    ) : (
                        <div className="flex items-center gap-3 px-3 py-3 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors group">
                            {user?.empPic
                                ? <img src={user.empPic} alt="" className="w-11 h-11 rounded-xl object-cover shadow-lg ring-2 ring-white/10" />
                                : <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-lg font-bold shadow-lg ring-2 ring-white/10">
                                    {user?.name?.[0]?.toUpperCase() || '?'}
                                </div>
                            }
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate text-white">{user?.name}</p>
                                <p className="text-[10px] text-slate-400 font-medium truncate">{user?.empcode}</p>
                                <span className="inline-block mt-0.5 px-1.5 py-px rounded bg-indigo-500/20 text-[9px] text-indigo-300 font-bold uppercase tracking-wider">{user?.role}</span>
                            </div>
                            <button
                                type="button"
                                onClick={handleLogout}
                                aria-label="ออกจากระบบ"
                                title="ออกจากระบบ"
                                className={`text-slate-400 hover:text-red-400 transition-colors p-2 hover:bg-white/5 rounded-lg ${FOCUS_RING}`}
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    )}
                    {!collapsed && (
                        <p className="text-[10px] text-center mt-4 text-slate-500">
                            © 2026 by: Natthawut.Y <span className="font-bold text-indigo-400">All rights reserved.</span>
                        </p>
                    )}
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
