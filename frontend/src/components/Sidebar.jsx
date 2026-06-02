import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Package, ShoppingCart, LogOut, Plus,
    ArrowDownToLine, History, Database, FileSpreadsheet, Shield,
    Printer, ChevronDown, FileKey, Monitor, HardDrive,
    Camera, ChevronLeft, ChevronRight,Cctv,Calendar
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
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800"/>
            </div>
        </div>
    );
};

// ── NavItem ────────────────────────────────────────────────────────────────
const NavItem = ({ icon: Icon, label, to, isSubItem = false, onClose, collapsed }) => {
    const location  = useLocation();
    const navigate  = useNavigate();
    const isActive  = location.pathname === to || location.pathname.startsWith(`${to}/`);

    const handleNav = () => { navigate(to); if (onClose) onClose(); };

    const btn = (
        <button
            onClick={handleNav}
            className={`
                w-full flex items-center transition-all duration-200 font-medium rounded-xl
                ${collapsed
                    ? 'justify-center p-3'
                    : isSubItem ? 'space-x-3 pl-11 pr-3 py-2.5' : 'space-x-3 p-3'
                }
                ${isActive
                    ? 'bg-white text-indigo-900 shadow-xl shadow-indigo-900/10 ' + (!isSubItem && !collapsed ? 'scale-105' : '')
                    : 'text-indigo-100/70 hover:bg-white/10 hover:text-white'
                }
            `}
        >
            <Icon size={isSubItem ? 15 : 18} className="flex-shrink-0"/>
            {!collapsed && <span className={isSubItem ? 'text-xs font-semibold' : 'text-sm'}>{label}</span>}
        </button>
    );

    return <Tooltip label={label} collapsed={collapsed}>{btn}</Tooltip>;
};

// ── NavGroup ───────────────────────────────────────────────────────────────
const NavGroup = ({ icon: Icon, label, children, paths = [], collapsed, onClose }) => {
    const location      = useLocation();
    const isActiveGroup = paths.some(p => location.pathname === p || location.pathname.startsWith(`${p}/`));
    const [open, setOpen] = useState(isActiveGroup);

    useEffect(() => { if (isActiveGroup) setOpen(true); }, [location.pathname]);

    // เมื่อ collapsed → render แค่ icon แต่ละ sub item
    if (collapsed) {
        return (
            <div className="space-y-1">
                {React.Children.map(children, child =>
                    child ? React.cloneElement(child, { collapsed: true }) : null
                )}
            </div>
        );
    }

    return (
        <div className="space-y-1 mb-1">
            <button
                onClick={() => setOpen(p => !p)}
                className={`
                    w-full flex items-center justify-between p-3 rounded-xl transition-all duration-200 font-medium
                    ${isActiveGroup || open
                        ? 'bg-white/10 text-white shadow-inner shadow-white/5'
                        : 'text-indigo-100/70 hover:bg-white/10 hover:text-white'
                    }
                `}
            >
                <div className="flex items-center space-x-3">
                    <Icon size={18} className={isActiveGroup ? 'text-indigo-300' : ''}/>
                    <span className="text-sm font-bold tracking-wide uppercase">{label}</span>
                </div>
                <ChevronDown size={15} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}/>
            </button>
            <div
                style={{ display:'grid', gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
                className="transition-[grid-template-rows,opacity] duration-200 ease-in-out overflow-hidden"
            >
                <div className="min-h-0">
                    <div className="space-y-1 mt-1">
                        {React.Children.map(children, child =>
                            child ? React.cloneElement(child, { collapsed: false, onClose }) : null
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Divider ────────────────────────────────────────────────────────────────
const Divider = ({ collapsed }) => (
    collapsed
        ? <div className="my-2 mx-auto w-6 border-t border-white/10"/>
        : <div className="my-2 border-t border-white/5 mx-3"/>
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
            try { localStorage.setItem('sidebar_collapsed', String(!p)); } catch {}
            return !p;
        });
    };

    const handleLogout = () => { logout(); navigate('/login'); if (onClose) onClose(); };

    const w = collapsed ? 'w-[72px]' : 'w-72';

    return (
        <>
            {/* Mobile backdrop */}
            {isOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 lg:hidden" onClick={onClose}/>
            )}

            <aside className={`
                fixed lg:static inset-y-0 left-0 z-40 flex-shrink-0
                ${w} bg-slate-900 flex flex-col text-white
                transform transition-[width,transform] duration-300 ease-in-out shadow-2xl
                ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                overflow-hidden
            `}>
                {/* Background gradients */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 z-0"/>
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2 z-0"/>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500 rounded-full blur-[100px] opacity-10 translate-y-1/2 -translate-x-1/2 z-0"/>

                {/* Header */}
                <div className={`relative z-10 flex flex-col items-center pt-6 pb-4 px-4 ${collapsed ? 'px-2' : ''}`}>
                    {collapsed ? (
                        <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center mb-1">
                            <img src={logodaikinn} alt="DAIKINN" className="w-full h-full object-contain"/>   
                            {/* <img src="./public/icon-daikin (Custom).png" alt="Daikin" className="w-full h-full object-contain"/> */}
                        </div>
                    ) : (
                        <>
                            <div className="p-2 rounded-xl mb-2 w-full max-w-[200px] relative">
                                <img src={logodaikin} alt="DAIKIN" className="h-8 w-auto mx-auto object-contain"/>
                                {/* Mobile close */}
                                <button onClick={onClose} className="absolute -right-4 -top-2 lg:hidden text-slate-400 hover:text-white p-2">
                                    <LogOut className="rotate-180" size={20}/>
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
                    className="hidden lg:flex relative z-10 mx-auto mb-3 items-center justify-center w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-indigo-200 hover:text-white transition-all border border-white/10 flex-shrink-0"
                    title={collapsed ? 'ขยาย sidebar' : 'หุบ sidebar'}
                >
                    {collapsed ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
                </button>

                {/* Nav */}
                <nav className={`relative z-10 flex-1 overflow-y-auto overflow-x-hidden pb-6 space-y-1 ${collapsed ? 'px-2' : 'px-4'}`}>

                    <NavItem icon={LayoutDashboard} label="DASHBOARD" to="/" onClose={onClose} collapsed={collapsed}/>
                    <Divider collapsed={collapsed}/>

                    {user?.role === 'Staff' ? (
                        <NavGroup icon={Package} label="STOCK & ORDERS"
                            paths={['/inventory','/ink-toner','/purchase-orders','/receive']}
                            collapsed={collapsed} onClose={onClose}
                        >
                            <NavItem icon={Database}       label="STOCK INVENTORY" to="/inventory"       isSubItem onClose={onClose} collapsed={collapsed}/>
                            <NavItem icon={Printer}        label="INK & TONER"     to="/ink-toner"       isSubItem onClose={onClose} collapsed={collapsed}/>
                            <NavItem icon={ShoppingCart}   label="PR & ORDERS"     to="/purchase-orders" isSubItem onClose={onClose} collapsed={collapsed}/>
                            <NavItem icon={ArrowDownToLine} label="RECEIVE ITEMS"  to="/receive"         isSubItem onClose={onClose} collapsed={collapsed}/>
                        </NavGroup>
                    ) : (
                        <>
                            <NavItem icon={Database} label="STOCK INVENTORY" to="/inventory" onClose={onClose} collapsed={collapsed}/>
                            <NavItem icon={Printer}  label="INK & TONER"     to="/ink-toner" onClose={onClose} collapsed={collapsed}/>
                        </>
                    )}

                    <Divider collapsed={collapsed}/>
                    <NavItem icon={FileKey}    label="MA / LICENSE"      to="/ma-license"      onClose={onClose} collapsed={collapsed}/>
                    <Divider collapsed={collapsed}/>
                    <NavItem icon={Cctv}     label="CCTV MANAGEMENT"   to="/cctv-management" onClose={onClose} collapsed={collapsed}/>
                    <Divider collapsed={collapsed}/>
                    <NavItem icon={Monitor}    label="PC INVENTORY"      to="/pc-inventory"    onClose={onClose} collapsed={collapsed}/>
                    <Divider collapsed={collapsed}/>
                    <NavItem icon={Shield}     label="AD EXPLORER"       to="/ad-explorer"     onClose={onClose} collapsed={collapsed}/>
                    <Divider collapsed={collapsed}/>
                    <NavItem icon={HardDrive}  label="QUOTA MANAGER"     to="/quota-manager"   onClose={onClose} collapsed={collapsed}/>
                    <NavItem icon={Calendar} label="CALENDAR"          to="/calendar"        onClose={onClose} collapsed={collapsed}/>
                    {user?.role === 'Staff' && (
                        <>
                            <div className={`mt-5 mb-2 border-t border-white/10 ${collapsed ? 'mx-1' : 'mx-3'}`}/>
                            {!collapsed && (
                                <div className="pb-1 text-[10px] font-bold uppercase text-slate-500 tracking-wider pl-3">
                                    Staff Controls
                                </div>
                            )}
                            <NavItem icon={Plus}   label="MANUAL IMPORT" to="/manual-import" onClose={onClose} collapsed={collapsed}/>
                            <NavItem icon={Shield} label="MANAGEMENT"    to="/management"    onClose={onClose} collapsed={collapsed}/>
                        </>
                    )}

                    <div className={`mt-5 mb-2 border-t border-white/10 ${collapsed ? 'mx-1' : 'mx-3'}`}/>
                    {!collapsed && (
                        <div className="pb-1 text-[10px] font-bold uppercase text-slate-500 tracking-wider pl-3">
                            ทั่วไป (General)
                        </div>
                    )}
                    <NavItem icon={History}       label="HISTORY LOG" to="/history" onClose={onClose} collapsed={collapsed}/>
                    <NavItem icon={FileSpreadsheet} label="REPORTS"   to="/reports" onClose={onClose} collapsed={collapsed}/>
                </nav>

                {/* User card */}
                <div className={`relative z-10 pt-4 border-t border-white/5 ${collapsed ? 'px-2 pb-4' : 'px-4 pb-5'}`}>
                    {collapsed ? (
                        <Tooltip label={`${user?.name} (${user?.role})`} collapsed={true}>
                            <button onClick={handleLogout}
                                className="w-full flex justify-center p-2 rounded-xl hover:bg-white/10 transition-colors group">
                                {user?.empPic
                                    ? <img src={user.empPic} alt="" className="w-9 h-9 rounded-xl object-cover ring-2 ring-white/10"/>
                                    : <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                                        {user?.name?.[0]?.toUpperCase() || '?'}
                                      </div>
                                }
                            </button>
                        </Tooltip>
                    ) : (
                        <div className="flex items-center space-x-3 px-3 py-3 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors group cursor-pointer">
                            {user?.empPic
                                ? <img src={user.empPic} alt="" className="w-12 h-12 rounded-xl object-cover shadow-lg ring-2 ring-white/10 group-hover:scale-105 transition-transform"/>
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
                                <LogOut size={16}/>
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