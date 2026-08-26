import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Package, ShoppingCart, LogOut, Plus,
    ArrowDownToLine, History, Database, FileSpreadsheet, Shield,
    Printer, ChevronDown, FileKey, Monitor, HardDrive,
    Camera, ChevronLeft, ChevronRight, Cctv, Calendar, Network, ClipboardList, Activity, Briefcase, BookOpen
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logodaikin from '../../public/DAIKIN_logo.svg.png';
import logodaikinn from '../../public/icon-daikin (Custom).png';

// ── Tooltip wrapper (แสดงเมื่อ sidebar หุบ) ──────────────────────────────
const Tooltip = ({ label, children, collapsed }) => {
    if (!collapsed) return children;
    return (
        <div className="relative group/tip flex">
            {children}
            <div className="
                pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2
                px-2.5 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg
                whitespace-nowrap opacity-0 group-hover/tip:opacity-100
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
const NavItem = ({ icon: Icon, label, to, isSubItem = false, onClose, collapsed }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`);

    const handleNav = () => { navigate(to); if (onClose) onClose(); };

    const btn = (
        <button
            onClick={handleNav}
            className={`
                w-full flex items-center transition-all duration-200 font-medium rounded-lg
                ${collapsed
                    ? 'justify-center p-2'
                    : isSubItem ? 'space-x-2.5 pl-9 pr-2 py-1.5' : 'space-x-2 p-2'
                }
                ${isActive
                    ? 'bg-white text-indigo-900 shadow-lg shadow-indigo-900/10 ' + (!isSubItem && !collapsed ? 'scale-105' : '')
                    : 'text-indigo-100/70 hover:bg-white/10 hover:text-white'
                }
            `}
        >
            <Icon size={isSubItem ? 14 : 16} className="flex-shrink-0" />
            {!collapsed && <span className={isSubItem ? 'text-xs font-medium' : 'text-xs font-medium'}>{label}</span>}
        </button>
    );

    return <Tooltip label={label} collapsed={collapsed}>{btn}</Tooltip>;
};

// ── NavGroupHeader (Header ธรรมดา ไม่หุบซ่อน) ────────────────────────────
const NavGroupHeader = ({ label, collapsed }) => {
    if (collapsed) return null;
    return (
        <div className="pb-1 text-[9px] font-bold uppercase text-slate-500 tracking-wider pl-3 mt-4 mb-2">
            {label}
        </div>
    );
};

// ── Divider ────────────────────────────────────────────────────────────────
const Divider = ({ collapsed }) => (
    collapsed
        ? <div className="my-2 mx-auto w-6 border-t border-white/10" />
        : <div className="my-2 border-t border-white/5 mx-3" />
);

// ── SIDEBAR ────────────────────────────────────────────────────────────────
const Sidebar = ({ isOpen, onClose }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    // collapsed state — persist ใน localStorage
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
    });

    const toggleCollapse = () => {
        setCollapsed(p => {
            try { localStorage.setItem('sidebar_collapsed', String(!p)); } catch { }
            return !p;
        });
    };

    const handleLogout = () => { logout(); navigate('/login'); if (onClose) onClose(); };

    const w = collapsed ? 'w-[72px]' : 'w-50';

    return (
        <>
            {/* Mobile backdrop */}
            {isOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 lg:hidden" onClick={onClose} />
            )}

            <aside className={`
                fixed lg:static inset-y-0 left-0 z-40 flex-shrink-0
                ${w} bg-slate-900 flex flex-col text-white
                transform transition-[width,transform] duration-300 ease-in-out shadow-2xl
                ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                overflow-hidden
            `}>
                {/* Background gradients */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 z-0" />
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2 z-0" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500 rounded-full blur-[100px] opacity-10 translate-y-1/2 -translate-x-1/2 z-0" />

                {/* Header */}
                <div className={`relative z-10 flex flex-col items-center pt-6 pb-4 px-4 ${collapsed ? 'px-2' : ''}`}>
                    {collapsed ? (
                        <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center mb-1">
                            <img src={logodaikinn} alt="DAIKINN" className="w-full h-full object-contain" />
                        </div>
                    ) : (
                        <>
                            <div className="p-2 rounded-xl mb-2 w-full max-w-[200px] relative">
                                <img src={logodaikin} alt="DAIKIN" className="h-8 w-auto mx-auto object-contain" />
                                {/* Mobile close */}
                                <button onClick={onClose} className="absolute -right-4 -top-2 lg:hidden text-slate-400 hover:text-white p-2">
                                    <LogOut className="rotate-180" size={20} />
                                </button>
                            </div>
                            <h1 className="text-2xl font-black tracking-tight text-white leading-none">IT INVENTORY</h1>
                            <span className="text-[11px] font-bold text-indigo-300 tracking-[0.15em] uppercase">MANAGEMENT SYSTEM</span>
                        </>
                    )}
                </div>

                {/* Toggle collapse button */}
                <button
                    onClick={toggleCollapse}
                    className="hidden lg:flex relative z-10 mx-auto mb-3 items-center justify-center w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-indigo-200 hover:text-white transition-all border border-white/10 flex-shrink-0"
                    title={collapsed ? 'ขยาย sidebar' : 'หุบ sidebar'}
                >
                    {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                </button>

                {/* Nav */}
                <nav className={`relative z-10 flex-1 overflow-y-auto overflow-x-hidden pb-6 space-y-1 ${collapsed ? 'px-2' : 'px-4'}`}>

    {/* 📸 ACTIVITY GALLERY — บนสุด */}
    <NavItem icon={Camera} label="ACTIVITY" to="/activity" onClose={onClose} collapsed={collapsed} />
    <Divider collapsed={collapsed} />

    <NavItem icon={LayoutDashboard} label="DASHBOARD" to="/dashboard" onClose={onClose} collapsed={collapsed} />
    <Divider collapsed={collapsed} />

                    {/* 📦 INVENTORY & PROCUREMENT */}
                    <NavGroupHeader label="📦 Inventory & Procurement" collapsed={collapsed} />
                    {user?.role === 'Staff' ? (
                        <>
                            <NavItem icon={Database} label="STOCK INVENTORY" to="/inventory" onClose={onClose} collapsed={collapsed} />
                            <NavItem icon={Printer} label="INK & TONER" to="/ink-toner" onClose={onClose} collapsed={collapsed} />
                            <NavItem icon={Activity} label="PRINTER HEALTH" to="/printer-health" onClose={onClose} collapsed={collapsed} />
                            <NavItem icon={ShoppingCart} label="PR & ORDERS" to="/purchase-orders"  onClose={onClose} collapsed={collapsed} />
                            <NavItem icon={ArrowDownToLine} label="RECEIVE ITEMS" to="/receive" onClose={onClose} collapsed={collapsed} />
                        </>
                    ) : (
                        <>
                            <NavItem icon={Database} label="STOCK INVENTORY" to="/inventory" onClose={onClose} collapsed={collapsed} />
                            <NavItem icon={Printer} label="INK & TONER" to="/ink-toner" onClose={onClose} collapsed={collapsed} />
                            <NavItem icon={Activity} label="PRINTER HEALTH" to="/printer-health" onClose={onClose} collapsed={collapsed} />
                        </>
                    )}
                    <NavItem icon={Briefcase} label="BORROWING SYSTEM" to="/borrowings" onClose={onClose} collapsed={collapsed} />

                    <Divider collapsed={collapsed} />

                    {/* 💻 ASSET MANAGEMENT */}
                    <NavGroupHeader label="💻 Asset Management" collapsed={collapsed} />
                    <NavItem icon={Monitor} label="PC INVENTORY" to="/pc-inventory" onClose={onClose} collapsed={collapsed} />
                    <NavItem icon={Cctv} label="CCTV MANAGEMENT" to="/cctv-management" onClose={onClose} collapsed={collapsed} />
                    <NavItem icon={FileKey} label="MA / LICENSE" to="/ma-license" onClose={onClose} collapsed={collapsed} />

                    <Divider collapsed={collapsed} />

                    {/* 🌐 INFRASTRUCTURE & NETWORK */}
                    <NavGroupHeader label="🌐 Infrastructure & Network" collapsed={collapsed} />
                    <NavItem icon={Network} label="IP MANAGEMENT" to="/ip-management" onClose={onClose} collapsed={collapsed} />
                    <NavItem icon={Shield} label="AD EXPLORER" to="/ad-explorer" onClose={onClose} collapsed={collapsed} />

                    <Divider collapsed={collapsed} />

                    {/* ⚙️ SYSTEM ADMINISTRATION */}
                    <NavGroupHeader label="⚙️ System Administration" collapsed={collapsed} />
                    <NavItem icon={HardDrive} label="QUOTA MANAGER" to="/quota-manager" onClose={onClose} collapsed={collapsed} />
                    <NavItem icon={Calendar} label="CALENDAR" to="/calendar" onClose={onClose} collapsed={collapsed} />
                    <NavItem icon={Activity} label="SOUND ENGINEERING" to="/sound-layout" onClose={onClose} collapsed={collapsed} />

                    <Divider collapsed={collapsed} />

                    {/* 📋 OPERATIONS & REQUESTS */}
                    <NavGroupHeader label="📋 Operations & Requests" collapsed={collapsed} />
                    <NavItem icon={ClipboardList} label="IT REQUEST" to="/it-request" onClose={onClose} collapsed={collapsed} />
                    <NavItem icon={History} label="HISTORY LOG" to="/history" onClose={onClose} collapsed={collapsed} />

                    <Divider collapsed={collapsed} />

                    {/* 📚 KNOWLEDGE & DOCUMENTATION */}
                    <NavGroupHeader label="📚 Knowledge & Documentation" collapsed={collapsed} />
                    <NavItem icon={FileSpreadsheet} label="REPORTS" to="/reports" onClose={onClose} collapsed={collapsed} />
                    <NavItem icon={BookOpen} label="KNOWLEDGE BASE" to="/knowledge-base" onClose={onClose} collapsed={collapsed} />

                    {/* 👤 STAFF CONTROLS */}
                    {user?.role === 'Staff' && (
                        <>
                            <Divider collapsed={collapsed} />
                            <NavGroupHeader label="👤 Staff Controls" collapsed={collapsed} />
                            <NavItem icon={Plus} label="MANUAL IMPORT" to="/manual-import" onClose={onClose} collapsed={collapsed} />
                            <NavItem icon={Shield} label="MANAGEMENT" to="/management" onClose={onClose} collapsed={collapsed} />
                        </>
                    )}
                </nav>

                {/* User card */}
                <div className={`relative z-10 pt-4 border-t border-white/5 ${collapsed ? 'px-2 pb-4' : 'px-4 pb-5'}`}>
                    {collapsed ? (
                        <Tooltip label={`${user?.name} (${user?.role})`} collapsed={true}>
                            <button onClick={handleLogout}
                                className="w-full flex justify-center p-2 rounded-xl hover:bg-white/10 transition-colors group">
                                {user?.empPic
                                    ? <img src={user.empPic} alt="" className="w-9 h-9 rounded-xl object-cover ring-2 ring-white/10" />
                                    : <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                                        {user?.name?.[0]?.toUpperCase() || '?'}
                                    </div>
                                }
                            </button>
                        </Tooltip>
                    ) : (
                        <div className="flex items-center space-x-3 px-3 py-3 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors group cursor-pointer">
                            {user?.empPic
                                ? <img src={user.empPic} alt="" className="w-12 h-12 rounded-xl object-cover shadow-lg ring-2 ring-white/10 group-hover:scale-105 transition-transform" />
                                : <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-lg font-bold shadow-lg ring-2 ring-white/10 group-hover:scale-105 transition-transform">
                                    {user?.name?.[0]?.toUpperCase() || '?'}
                                </div>
                            }
                            <div className="flex-1 overflow-hidden">
                                <p className="text-xs font-bold truncate text-white group-hover:text-indigo-200 transition-colors">{user?.name}</p>
                                <p className="text-[10px] text-slate-400 font-medium">{user?.empcode}</p>
                                <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">{user?.role}</p>
                            </div>
                            <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 transition-colors p-2 hover:bg-white/5 rounded-lg">
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