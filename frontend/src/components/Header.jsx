import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Menu,
    Clock,
    Calendar,
    LayoutDashboard,
    Package,
    ShoppingCart,
    ArrowDownToLine,
    ArrowUpFromLine,
    History,
    FileSpreadsheet,
    Shield,
    Plus,
    User,
    FileKey,
    Printer,
    ClipboardList
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatThaiDate } from '../utils/formatDate';

const Header = ({ onMenuClick }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const location = useLocation();
    const { user } = useAuth();

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const getPageConfig = (pathname) => {
        switch (pathname) {
            case '/': return { title: 'DASHBOARD', icon: LayoutDashboard, color: 'text-indigo-600' };
            case '/inventory': return { title: 'STOCK INVENTORY', icon: Package, color: 'text-emerald-600' };
            case '/receive': return { title: 'RECEIVE GOODS', icon: ArrowDownToLine, color: 'text-blue-600' };
            case '/withdraw': return { title: 'WITHDRAW GOODS', icon: ArrowUpFromLine, color: 'text-orange-600' };
            case '/history': return { title: 'TRANSACTION HISTORY', icon: History, color: 'text-violet-600' };
            case '/purchase-orders': return { title: 'PURCHASE ORDERS', icon: ShoppingCart, color: 'text-pink-600' };
            case '/reports': return { title: 'REPORTS & ANALYTICS', icon: FileSpreadsheet, color: 'text-teal-600' };
            case '/management': return { title: 'SYSTEM MANAGEMENT', icon: Shield, color: 'text-indigo-600' };
            case '/manual-import': return { title: 'MANUAL STOCK IMPORT', icon: Plus, color: 'text-cyan-600' };
            case '/ma-license': return { title: 'MA / LICENSE MANAGEMENT', icon: FileKey, color: 'text-amber-600' };
            case '/ink-toner': return { title: 'INK & TONER STOCK', icon: Printer, color: 'text-cyan-600' };
            case '/bitlocker': return { title: 'BITLOCKER MANAGEMENT', icon: Shield, color: 'text-indigo-600' };
            default: return { title: 'IT STOCK MANAGEMENT', icon: Package, color: 'text-slate-600' };
        }
    };

    const { title, icon: Icon, color } = getPageConfig(location.pathname);

    return (
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm px-6 py-3 flex items-center justify-between transition-all duration-300">
            {/* Left: Title & Toggle */}
            <div className="flex items-center gap-4">
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-600"
                >
                    <Menu size={24} />
                </button>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-slate-50 border border-slate-100 ${color}`}>
                        <Icon size={20} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-800 hidden sm:block tracking-tight">
                            {title}
                        </h1>
                        <h1 className="text-lg font-bold text-slate-800 sm:hidden">
                            {title.split(' ')[0]}
                        </h1>
                    </div>
                </div>
            </div>

            {/* Right: Clock & Profile */}
            <div className="flex items-center gap-4">
                {/* Clock Pill */}
                <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-50 to-white rounded-full border border-slate-200 shadow-sm">
                    <Clock size={16} className="text-indigo-500" />
                    <span className="font-mono text-sm font-semibold text-slate-600 min-w-[140px] text-center">
                        {formatThaiDate(currentTime)}
                    </span>
                </div>

                {/* Mobile Clock (Simple) */}
                <div className="md:hidden flex items-center gap-1 text-slate-600">
                    <span className="text-xs font-mono font-bold">
                        {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>

                {/* Vertical Diavider (Removed) */}
                {/* User Profile (Removed) */}
            </div>
        </header>
    );
};

export default Header;
