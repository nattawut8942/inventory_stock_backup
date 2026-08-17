import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // หรือ 'motion/react'
import {
    Shield, Clock, AlertTriangle, DollarSign, Server, Monitor, Cpu, Wifi,
    Plus, Edit2, Trash2, X, Search, ChevronDown, Eye, FileText, Calendar,
    MapPin, Tag, Hash, Building, CreditCard, RefreshCw, CheckCircle, XCircle,
    HardDrive, Globe, Wrench, Printer, ChevronLeft, ChevronRight,
    ChevronUp, ArrowUpDown, User, List, LayoutGrid, Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AlertModal from '../components/AlertModal';
import Portal from '../components/Portal';
import { API_BASE } from '../config/api';


// ─── CONSTANTS ───────────────────────────
const CATEGORIES = [
    { key: 'ALL', label: 'All CATEGORIES', icon: Layers, color: 'from-slate-700 to-slate-800', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
    { key: 'HARDWARE', label: 'HARDWARE MA', icon: Server, color: 'from-blue-500 to-blue-600', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    { key: 'SOFTWARE', label: 'SOFTWARE LICENSE', icon: Globe, color: 'from-violet-500 to-purple-600', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
    { key: 'SERVICE', label: 'SERVICES', icon: Wrench, color: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
    { key: 'RENTAL', label: 'RENTAL', icon: Printer, color: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
];

const STATUS_OPTIONS = ['Active', 'Expiring', 'Expired', 'Pending', 'Cancelled'];
const STATUS_COLORS = {
    Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Expiring: 'bg-orange-100 text-orange-700 border-orange-200',
    Expired: 'bg-red-100 text-red-700 border-red-200',
    Pending: 'bg-yellow-100 text-amber-700 border-amber-500',
    Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const ALERT_DAYS = 60;
// ── NEW: Alert threshold for master contract ──
const CONTRACT_ALERT_DAYS = 90;

const PO_CYCLE_OPTIONS = [
    { value: 'annual', label: 'รายปี (Annual)' },
    { value: 'monthly', label: 'รายเดือน (Monthly)' },
    { value: 'oneshot', label: 'ครั้งเดียว (One-shot)' },
];


// ─── HELPER: Days remaining ──────────────
const getDaysRemaining = (endDate) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
};

const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDuration = (start, end) => {
    if (!start || !end) return '-';
    const s = new Date(start);
    const e = new Date(end);
    const days = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'หมดอายุแล้ว';

    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    const remainDays = days % 30;

    if (years > 0) {
        let result = `${years} ปี`;
        if (months > 0) result += ` ${months} เดือน`;
        if (remainDays > 0) result += ` ${remainDays} วัน`;
        return result;
    }
    if (months > 0) {
        return remainDays > 0 ? `${months} เดือน ${remainDays} วัน` : `${months} เดือน`;
    }
    return `${days} วัน`;
};

// ─── STAT CARD ───────────────────────────
const StatCard = ({ icon: Icon, title, value, color, subtitle, onClick, isActive }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={onClick}
        className={`bg-white rounded-2xl p-5 shadow-lg border transition-all ${onClick ? 'cursor-pointer hover:shadow-xl' : ''} ${isActive ? 'ring-2 ring-indigo-500 border-transparent scale-[1.02]' : 'border-slate-200'}`}
    >
        <div className="flex items-start justify-between">
            <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1">{title}</p>
                <h3 className="text-2xl font-black text-slate-900">{value}</h3>
                {subtitle && <p className="text-[10px] text-slate-400 mt-1">{subtitle}</p>}
            </div>
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
        </div>
    </motion.div>
);

// ─── NEW: RENTAL DUAL-TIMELINE CARD ──────
// แสดง 2 แถบ: สัญญาหลัก (ContractEndDate) + PO ปัจจุบัน (EndDate)
const RentalTimelineCard = ({ item }) => {
    const daysContract = getDaysRemaining(item.ContractEndDate);
    const daysPO = getDaysRemaining(item.EndDate);

    const contractAlert = daysContract !== null && daysContract <= CONTRACT_ALERT_DAYS && item.Status !== 'Cancelled';
    const poAlert = daysPO !== null && daysPO <= ALERT_DAYS && item.Status !== 'Cancelled';

    const renderDaysLabel = (days, label) => {
        if (days === null) return null;
        if (days <= 0) return <span className="text-red-600 font-bold text-xs animate-pulse">หมดอายุแล้ว</span>;
        const display = days < 30 ? `${days} วัน` : formatDuration(new Date(), new Date(Date.now() + days * 86400000));

        const color = days <= 30 ? 'text-red-600' : days <= ALERT_DAYS ? 'text-orange-500' : 'text-emerald-600';
        return <span className={`font-bold text-base ${color}`}>เหลือ {display}</span>;
    };



    return (
        <div className="space-y-1 pt-1 border-t border-black/5 mt-1">
            {/* PO ปัจจุบัน */}
            <div className={`rounded-lg p-2 border ${poAlert ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                    <span className={`text-[12px] font-black uppercase tracking-wider flex items-center gap-1 ${poAlert ? 'text-orange-600' : 'text-slate-500'}`}>
                        <CreditCard size={20} />
                        PO ปัจจุบัน
                        {poAlert && <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping ml-0.5" />}
                    </span>
                    {renderDaysLabel(daysPO)}
                </div>
                <div className="flex justify-between text-[12px]">
                    <span className="text-slate-500">{item.PONumber || '-'}</span>
                    <span className={`font-bold text-2xl ${poAlert ? 'text-orange-700 font-bold' : 'text-slate-700'}`}>

                        {formatDate(item.EndDate)}
                    </span>
                </div>
            </div>

            {/* สัญญาหลัก */}
            {item.ContractEndDate && (
                <div className={`rounded-lg p-2 border ${contractAlert ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-100'}`}>
                    <div className="flex items-center justify-between mb-1">
                        <span className={`text-[12px] font-black uppercase tracking-wider flex items-center gap-1 ${contractAlert ? 'text-red-600' : 'text-indigo-500'}`}>
                            <FileText size={20} />
                            สัญญาหลัก
                            {contractAlert && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-ping ml-0.5" />}
                        </span>
                        {renderDaysLabel(daysContract)}
                    </div>
                    <div className="flex justify-between text-[12px]">
                        <span className="text-slate-500">{formatDate(item.StartDate)} →</span>
                        <span className={`font-bold text-2xl ${contractAlert ? 'text-red-700 font-bold' : 'text-indigo-700'}`}>
                            {formatDate(item.ContractEndDate)}
                        </span>
                    </div>
                    <div className="text-[10px]  text-slate-600 mt-0.5 text-right">
                        ระยะสัญญา: {formatDuration(item.StartDate, item.ContractEndDate)}
                    </div>
                </div>
            )}
        </div>
    );
};
const sortByNearestExpiry = (list) => {
    return [...list].sort((a, b) => {
        const daysA = getDaysRemaining(a.EndDate);
        const daysB = getDaysRemaining(b.EndDate);
        const valA = daysA === null ? 999999 : daysA;
        const valB = daysB === null ? 999999 : daysB;
        return valA - valB;
    });
};

const TV_STATUS_STYLE_DARK = {
    Active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    Expiring: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    Expired: 'bg-red-500/20 text-red-300 border-red-500/40',
    Pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
    Cancelled: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
};
const TV_STATUS_STYLE_LIGHT = {
    Active: 'bg-emerald-200 text-emerald-800 border-emerald-400',
    Expiring: 'bg-orange-200 text-orange-800 border-orange-400',
    Expired: 'bg-red-200 text-red-800 border-red-400',
    Pending: 'bg-yellow-200 text-amber-800 border-yellow-500',
    Cancelled: 'bg-slate-200 text-slate-600 border-slate-400',
};


const MATVCard = ({ item, theme = 'dark' }) => {
    const isDark = theme === 'dark';
    const days = getDaysRemaining(item.EndDate);
    const daysContract = getDaysRemaining(item.ContractEndDate);
    const isExpiring = days !== null && days > 0 && days <= ALERT_DAYS;
    const isExpired = days !== null && days <= 0;
    const isCancelled = item.Status === 'Cancelled';
    const isPending = item.Status === 'Pending';
    const isRental = item.Category === 'RENTAL';
    const catInfo = CATEGORIES.find(c => c.key === item.Category);

    const cardBg = isDark
        ? (isCancelled ? 'bg-slate-800/60 border-slate-700 opacity-60'
            : isPending ? 'bg-yellow-950/40 border-yellow-600/50'
                : isExpired ? 'bg-red-950/50 border-red-600/60'
                    : isExpiring ? (days <= 30 ? 'bg-red-950/60 border-red-500/70' : 'bg-orange-950/40 border-orange-600/50')
                        : 'bg-slate-800/60 border-slate-700')
        : (isCancelled ? 'bg-slate-100 border-slate-300 opacity-75'
            : isPending ? 'bg-yellow-200 border-yellow-600 ring-1 ring-yellow-300'
                : isExpired ? 'bg-red-200 border-red-500 ring-1 ring-red-300'
                    : isExpiring ? (days <= 30 ? 'bg-red-300 border-red-700 ring-1 ring-red-300' : 'bg-orange-200 border-orange-500 ring-1 ring-orange-300')
                        : 'bg-emerald-50 border-emerald-200');

    const statusStyle = isDark ? TV_STATUS_STYLE_DARK : TV_STATUS_STYLE_LIGHT;

    const tBorder = isDark ? 'border-white/15' : 'border-black/10';
    const tTitle = isDark ? 'text-white' : 'text-slate-800';
    const tSub = isDark ? 'text-white/85' : 'opacity-85';
    const tLabel = isDark ? 'text-white/90 font-bold' : 'font-bold opacity-90';
    const tMuted = isDark ? 'text-white/70' : 'opacity-70';
    const tValue = isDark ? 'text-white/95 font-semibold' : 'font-semibold opacity-95';

    return (
        <div className={`rounded-2xl border shadow-lg overflow-hidden flex flex-col relative ${cardBg}`}>
            {(isExpiring || isExpired) && !isCancelled && <div className="absolute top-0 right-0 w-3 h-3 rounded-full bg-red-500 m-3 animate-ping" />}

            {/* Header */}
            <div className={`p-3.5 border-b ${tBorder} flex items-start gap-3`}>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${catInfo?.color || 'from-slate-500 to-slate-600'} flex items-center justify-center shadow-sm shrink-0`}>
                    {catInfo && <catInfo.icon className="w-6 h-6 text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className={`font-black ${tTitle} text-2xl leading-snug truncate`}>{item.ItemName}</h4>
                    {item.Brand && (
                        <p className={`font-semibold ${tSub} text-lg truncate`}>{item.Brand}</p>
                    )}
                    {item.SerialNumber && (
                        <div className="flex items-center gap-1 text-base">
                            <span className={`${isDark ? 'text-emerald-400' : 'text-emerald-700'} font-semibold whitespace-nowrap`}>S/N:</span>
                            <span className={`font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-700'} truncate`}>{item.SerialNumber}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="p-3.5 flex-1 space-y-2.5">
                <div className="flex justify-between items-center font-bold text-xl">
                    <span className={tLabel}>สถานะ:</span>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-lg font-bold border ${statusStyle[item.Status] || statusStyle.Active} ${isExpiring && !isCancelled && !isPending ? 'animate-pulse ring-2 ring-red-400/50 ring-offset-1' : ''}`}>
                        {item.Status}
                    </span>
                </div>

                {isRental ? (
                    <div className={`space-y-1.5 pt-1 border-t ${tBorder} mt-1`}>
                        <div className={`rounded-lg p-2.5 border ${isDark
                            ? (days !== null && days <= ALERT_DAYS ? 'bg-orange-950/40 border-orange-600/40' : 'bg-slate-700/40 border-slate-600/40')
                            : (days !== null && days <= ALERT_DAYS ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200')}`}>
                            <div className="flex justify-between items-center text-base mb-0.5">
                                <span className={`${tLabel} font-semibold`}>PO ปัจจุบันหมด:</span>
                                <span className={`font-bold text-3xl ${days !== null && days <= ALERT_DAYS ? (isDark ? 'text-orange-300' : 'text-orange-600') : tValue}`}>{formatDate(item.EndDate)}</span>

                            </div>
                            <div className={`text-sm ${tMuted}`}>{item.PONumber || '-'}</div>
                        </div>
                        {item.ContractEndDate && (
                            <div className={`rounded-lg p-2.5 border ${isDark
                                ? (daysContract !== null && daysContract <= CONTRACT_ALERT_DAYS ? 'bg-red-950/40 border-red-600/40' : 'bg-indigo-950/40 border-indigo-600/40')
                                : (daysContract !== null && daysContract <= CONTRACT_ALERT_DAYS ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-100')}`}>
                                <div className="flex justify-between items-center text-base">
                                    <span className={`${tLabel} font-semibold`}>สัญญาหลักหมด:</span>
                                    <span className={`font-bold text-3xl ${daysContract !== null && daysContract <= CONTRACT_ALERT_DAYS ? (isDark ? 'text-red-300' : 'text-red-600') : (isDark ? 'text-indigo-300' : 'text-indigo-700')}`}>{formatDate(item.ContractEndDate)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="flex justify-between items-center font-bold text-2xl">
                            <span className={tLabel}>หมดอายุ:</span>
                            <span className={`text-3xl ${(isExpiring || isExpired) && !isCancelled ? (isDark ? 'text-red-400 font-bold animate-pulse' : 'text-red-600 font-bold animate-pulse') : `font-semibold ${tValue}`}`}>
                                {formatDate(item.EndDate)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center font-bold text-2xl">
                            <span className={tLabel}>เหลือเวลา:</span>
                            {days === null ? <span className={tMuted}>-</span>
                                : days <= 0 ? <span className={`${isDark ? 'text-red-400' : 'text-red-600'} font-black text-3xl animate-pulse`}>หมดอายุ</span>
                                    : <span className={`font-black text-3xl ${days <= ALERT_DAYS ? (isDark ? 'text-orange-400' : 'text-orange-600') : (isDark ? 'text-emerald-400' : 'text-emerald-600')}`}>
                                        {days < 30 ? `${days} วัน` : formatDuration(new Date(), item.EndDate)}
                                    </span>}
                        </div>
                        {(item.PONumber || item.ServiceNumber) && (
                            <div className="flex justify-between items-start gap-2 text-lg">
                                <span className={`${tMuted} whitespace-nowrap`}>PO/สัญญา:</span>
                                <span className={`font-semibold  ${tValue} text-right truncate`}>{item.PONumber || item.ServiceNumber}</span>
                            </div>
                        )}
                        {item.StartDate && (
                            <div className="flex justify-between items-center text-lg">
                                <span className={`${tMuted} whitespace-nowrap`}>เริ่มต้น:</span>
                                <span className={`font-semibold ${tValue}`}>{formatDate(item.StartDate)}</span>
                            </div>
                        )}
                        {item.StartDate && item.EndDate && (
                            <div className="flex justify-between items-center text-lg">
                                <span className={`${tMuted} whitespace-nowrap`}>ระยะเวลา:</span>
                                <span className={`font-semibold ${tValue}`}>{formatDuration(item.StartDate, item.EndDate)}</span>
                            </div>
                        )}
                    </>
                )}

                <div className={`flex items-start gap-2 text-lg pt-2 border-t ${tBorder}`}>
                    <span className={`${tLabel} font-bold whitespace-nowrap`}>VENDOR :</span>
                    <span className={`font-semibold ${tValue} text-right truncate`}>{item.VendorName || '-'}</span>
                </div>
                {item.LocationName && (
                    <div className="flex items-center gap-1.5 text-lg">
                        <MapPin size={18} className={`${tMuted} shrink-0`} />
                        <span className={tValue}>{item.LocationName}</span>
                    </div>
                )}
            </div>
        </div>
    );
};


const MATVView = ({ items, onBack, theme = 'dark', onToggleTheme }) => {
    const isDark = theme === 'dark';

    useEffect(() => {
        const tick = () => {
            const el = document.getElementById('ma-tv-clock');
            if (el) el.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    const sorted = useMemo(() => sortByNearestExpiry(items.filter(i => i.Status !== 'Cancelled')), [items]);

    const expiredCount = sorted.filter(i => { const d = getDaysRemaining(i.EndDate); return d !== null && d <= 0; }).length;
    const expiringCount = sorted.filter(i => { const d = getDaysRemaining(i.EndDate); return d !== null && d > 0 && d <= ALERT_DAYS; }).length;
    const activeCount = sorted.length - expiredCount - expiringCount;

    return (
        <Portal>
            <style>{`
                .ma-tv-scroll::-webkit-scrollbar { display: none; }
                .ma-tv-scroll { scrollbar-width: none; -ms-overflow-style: none; }
            `}</style>
            <div className={`fixed inset-0 z-40 flex flex-col overflow-hidden ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}>
                {/* Header */}
                <div className={`flex items-center justify-between px-10 py-4 border-b shadow-lg flex-shrink-0 gap-6 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center gap-4">
                        <button onClick={onBack}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors border shadow-sm ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'}`}>
                            ← กลับ
                        </button>
                        <div>
                            <h1 className={`text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>MA / LICENSE EXPIRY DASHBOARD</h1>
                            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>เรียงตามวันที่ใกล้หมดอายุที่สุดก่อน · ทั้งหมด {sorted.length} รายการ</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`flex flex-col items-center px-5 py-2.5 rounded-xl border ${isDark ? 'bg-red-950/50 border-red-700/50' : 'bg-red-100 border-red-300'}`}>
                            <p className={`text-2xl font-black ${isDark ? 'text-red-400' : 'text-red-700'}`}>{expiredCount}</p>
                            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Expired</p>
                        </div>
                        <div className={`flex flex-col items-center px-5 py-2.5 rounded-xl border ${isDark ? 'bg-orange-950/50 border-orange-700/50' : 'bg-orange-100 border-orange-300'}`}>
                            <p className={`text-2xl font-black ${isDark ? 'text-orange-400' : 'text-orange-700'}`}>{expiringCount}</p>
                            <p className="text-xs mt-0.5 text-slate-500">Expiring</p>
                        </div>
                        <div className={`flex flex-col items-center px-5 py-2.5 rounded-xl border ${isDark ? 'bg-emerald-950/50 border-emerald-700/50' : 'bg-emerald-100 border-emerald-300'}`}>
                            <p className={`text-2xl font-black ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{activeCount}</p>
                            <p className="text-xs mt-0.5 text-slate-500">Active</p>
                        </div>

                        {/* ปุ่ม Dark / Light toggle */}
                        <button onClick={onToggleTheme}
                            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-yellow-300 border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'}`}>
                            {isDark ? '☀️ Light' : '🌙 Dark'}
                        </button>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <p className={`text-6xl font-mono ${isDark ? 'text-white' : 'text-slate-700'}`} id="ma-tv-clock">—</p>
                    </div>
                </div>

                {/* Grid — เลื่อนได้ ไม่เห็น scrollbar */}
                <div className="flex-1 overflow-y-auto px-8 py-6 ma-tv-scroll">
                    {sorted.length === 0 ? (
                        <p className={`text-center py-20 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>ไม่มีรายการ</p>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
                            {sorted.map(item => <MATVCard key={item.ItemID} item={item} theme={theme} />)}
                        </div>
                    )}
                </div>
            </div>
        </Portal>
    );
};


// ─── MAIN PAGE COMPONENT ─────────────────
const MALicensePage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'Staff';

    const [items, setItems] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [locations, setLocations] = useState([]);
    const [maTypes, setMaTypes] = useState([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [cardFilter, setCardFilter] = useState('all');
    const [viewMode, setViewMode] = useState('list');
    const [detailItem, setDetailItem] = useState(null);
    const [formModal, setFormModal] = useState({ isOpen: false, item: null });
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
    const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState(null);
    const itemsPerPage = 20;
    const intervalRef = useRef(null);
    const [tvMode, setTvMode] = useState(false);
    const [tvTheme, setTvTheme] = useState('dark');

    const fetchItems = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/ma`);
            if (res.ok) setItems(await res.json());
        } catch (err) { console.error('Fetch MA Items Error:', err); }
        finally { setLoading(false); }
    };

    const fetchVendors = async () => {
        try {
            const res = await fetch(`${API_BASE}/vendors`);
            if (res.ok) setVendors(await res.json());
        } catch (err) { console.error(err); }
    };

    const fetchLocations = async () => {
        try {
            const res = await fetch(`${API_BASE}/locations`);
            if (res.ok) setLocations(await res.json());
        } catch (err) { console.error(err); }
    };

    const fetchMATypes = async () => {
        try {
            const res = await fetch(`${API_BASE}/ma-types`);
            if (res.ok) setMaTypes(await res.json());
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        fetchItems();
        fetchVendors();
        fetchLocations();
        fetchMATypes();

        intervalRef.current = setInterval(() => {
            console.log('🔄 Auto-refresh:', new Date().toLocaleTimeString());
            fetchItems();
        }, 5 * 60 * 1000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const filteredItems = useMemo(() => {
        return items
            .filter(i => activeTab === 'ALL' || i.Category === activeTab)
            .filter(i => statusFilter === 'all' || i.Status === statusFilter)
            .filter(i => {
                if (cardFilter === 'all') return true;
                const days = getDaysRemaining(i.EndDate);
                if (cardFilter === 'active') return i.Status === 'Active';
                if (cardFilter === 'expiringSoon') return days !== null && days > 0 && days <= ALERT_DAYS && i.Status !== 'Cancelled';
                if (cardFilter === 'expired') return days !== null && days <= 0 && i.Status !== 'Cancelled';
                return true;
            })
            .filter(i => {
                if (!searchTerm) return true;
                const term = searchTerm.toLowerCase();
                return (
                    (i.ItemName || '').toLowerCase().includes(term) ||
                    (i.SubType || '').toLowerCase().includes(term) ||
                    (i.Brand || '').toLowerCase().includes(term) ||
                    (i.SerialNumber || '').toLowerCase().includes(term) ||
                    (i.PONumber || '').toLowerCase().includes(term) ||
                    (i.VendorName || '').toLowerCase().includes(term) ||
                    (i.ServiceNumber || '').toLowerCase().includes(term)
                );
            });
    }, [items, activeTab, statusFilter, cardFilter, searchTerm]);

    useEffect(() => { setCurrentPage(1); }, [activeTab, statusFilter, cardFilter, searchTerm]);

    const sortedItems = useMemo(() => {
        let sortableItems = [...filteredItems];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key] || '';
                let bValue = b[sortConfig.key] || '';
                if (sortConfig.key === '_duration') {
                    aValue = new Date(a.EndDate || 0).getTime();
                    bValue = new Date(b.EndDate || 0).getTime();
                }
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else if (activeTab === 'ALL') {
            sortableItems.sort((a, b) => {
                const daysA = getDaysRemaining(a.EndDate);
                const daysB = getDaysRemaining(b.EndDate);
                const valA = daysA === null ? 999999 : daysA;
                const valB = daysB === null ? 999999 : daysB;
                return valA - valB;
            });
        }
        return sortableItems;
    }, [filteredItems, sortConfig, activeTab]);

    const paginatedItems = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sortedItems.slice(startIndex, Math.min(startIndex + itemsPerPage, sortedItems.length));
    }, [sortedItems, currentPage]);

    const totalPages = Math.max(1, Math.ceil(sortedItems.length / itemsPerPage));

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const stats = useMemo(() => {
        const active = items.filter(i => i.Status === 'Active').length;
        const expiringSoon = items.filter(i => {
            const days = getDaysRemaining(i.EndDate);
            return days !== null && days > 0 && days <= ALERT_DAYS && i.Status !== 'Cancelled' && i.Status !== 'Pending';
        }).length;
        const expired = items.filter(i => {
            const days = getDaysRemaining(i.EndDate);
            return days !== null && days <= 0 && i.Status !== 'Cancelled' && i.Status !== 'Pending';
        }).length;
        const totalValue = items.filter(i => i.Status === 'Active').reduce((sum, i) => sum + (i.Price || 0), 0);
        return { active, expiringSoon, expired, totalValue };
    }, [items]);

    const handleSave = async (formData) => {
        const isEdit = !!formData.ItemID;
        const url = isEdit ? `${API_BASE}/ma/${formData.ItemID}` : `${API_BASE}/ma`;
        const method = isEdit ? 'PUT' : 'POST';
        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, CreatedBy: user?.username || 'system' })
            });
            if (res.ok) {
                setFormModal({ isOpen: false, item: null });
                fetchItems();
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: isEdit ? 'อัปเดตข้อมูลเรียบร้อย' : 'เพิ่มรายการใหม่เรียบร้อย' });
            } else {
                const err = await res.json();
                setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.error || 'ไม่สามารถบันทึกข้อมูลได้' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'Connection Error', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
        }
    };

    const handleDelete = (item) => {
        setAlertModal({
            isOpen: true, type: 'danger', title: 'ลบรายการ?',
            message: `ต้องการลบ "${item.ItemName}" ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/ma/${item.ItemID}`, { method: 'DELETE' });
                    if (res.ok) {
                        fetchItems(); setDetailItem(null);
                        setAlertModal({ isOpen: true, type: 'success', title: 'ลบสำเร็จ', message: 'ลบรายการเรียบร้อยแล้ว' });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: 'ไม่สามารถลบได้' });
                }
            },
            onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
        });
    };

    const handleStatusChange = async (item, newStatus) => {
        try {
            const res = await fetch(`${API_BASE}/ma/${item.ItemID}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Status: newStatus })
            });
            if (res.ok) {
                fetchItems(); setDetailItem(null); setStatusDropdownOpen(false);
                setAlertModal({ isOpen: true, type: 'success', title: 'อัปเดตสถานะ', message: `เปลี่ยนสถานะเป็น "${newStatus}" เรียบร้อย` });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: 'ไม่สามารถเปลี่ยนสถานะได้' });
        }
    };

    const getColumns = (cat) => {
        const trackingCols = [
            { key: 'CreatedBy', label: 'ผู้บันทึก', width: 'min-w-[100px]' },
            { key: 'CreatedAt', label: 'วันบันทึก', width: 'whitespace-nowrap min-w-[100px]' },
        ];

        if (cat === 'ALL') {
            return [
                { key: 'Category', label: 'กลุ่มหลัก', width: 'min-w-[110px]' },
                { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                { key: 'ItemName', label: 'ชื่อรายการ', width: 'min-w-[160px]' },
                { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                { key: 'EndDate', label: 'วันสิ้นสุด', width: 'whitespace-nowrap min-w-[95px]' },
                { key: '_duration', label: 'เหลือเวลา', width: 'whitespace-nowrap min-w-[85px]' },
                { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ...trackingCols,
            ];
        }

        switch (cat) {
            case 'HARDWARE': return [
                { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                { key: 'ItemName', label: 'ชื่ออุปกรณ์', width: 'min-w-[150px]' },
                { key: 'Brand', label: 'ยี่ห้อ/รุ่น', width: 'min-w-[150px]' },
                { key: 'SerialNumber', label: 'S/N', width: 'min-w-[100px] break-all' },
                { key: 'PONumber', label: 'PO/สัญญา', width: 'min-w-[100px] break-all' },
                { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                { key: 'EndDate', label: 'หมดประกัน', width: 'whitespace-nowrap min-w-[90px]' },
                { key: '_duration', label: 'เหลือเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ...trackingCols,
            ];
            case 'SOFTWARE': return [
                { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                { key: 'ItemName', label: 'ชื่อ Software', width: 'min-w-[150px]' },
                { key: 'ServiceNumber', label: 'เลขบริการ', width: 'min-w-[120px] break-all' },
                { key: 'LicenseQty', label: 'จำนวน', width: 'min-w-[60px] text-center' },
                { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                { key: 'EndDate', label: 'หมดอายุ', width: 'whitespace-nowrap min-w-[90px]' },
                { key: '_duration', label: 'เหลือเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ...trackingCols,
            ];
            case 'SERVICE': return [
                { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                { key: 'ItemName', label: 'ชื่อบริการ', width: 'min-w-[150px]' },
                { key: 'ServiceNumber', label: 'เลขสัญญา', width: 'min-w-[120px] break-all' },
                { key: 'Price', label: 'ราคา', width: 'min-w-[80px]' },
                { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                { key: 'LocationName', label: 'สถานที่', width: 'min-w-[100px]' },
                { key: 'EndDate', label: 'หมดสัญญา', width: 'whitespace-nowrap min-w-[90px]' },
                { key: '_duration', label: 'เหลือเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ...trackingCols,
            ];
            case 'RENTAL': return [
                { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                { key: 'ItemName', label: 'ชื่อรายการ', width: 'min-w-[150px]' },
                { key: 'Brand', label: 'ยี่ห้อ/รุ่น', width: 'min-w-[150px]' },
                { key: 'PONumber', label: 'เลขสัญญา', width: 'min-w-[120px] break-all' },
                { key: 'LicenseQty', label: 'จำนวน', width: 'min-w-[60px] text-center' },
                { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                { key: 'EndDate', label: 'PO หมด', width: 'whitespace-nowrap min-w-[90px]' },
                { key: 'ContractEndDate', label: 'สัญญาหลักหมด', width: 'whitespace-nowrap min-w-[110px]' },
                { key: '_duration', label: 'PO เหลือ', width: 'whitespace-nowrap min-w-[80px]' },
                { key: '_contractDuration', label: 'สัญญาหลักเหลือ', width: 'whitespace-nowrap min-w-[100px]' },
                { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ...trackingCols,
            ];
            default: return [];
        }
    };

    const renderCellValue = (item, col) => {
        if (col.key === 'Category') {
            const catItem = CATEGORIES.find(c => c.key === item.Category);
            return (
                <span className={`inline-flex items-center gap-1 font-bold text-[10px] uppercase px-2 py-0.5 rounded-md ${catItem?.bg || 'bg-slate-100'} ${catItem?.text || 'text-slate-700'} border ${catItem?.border || 'border-slate-200'}`}>
                    {catItem ? catItem.label.split(' ')[0] : item.Category}
                </span>
            );
        }
        if (col.key === 'Status') {
            const days = getDaysRemaining(item.EndDate);
            const isAlert = item.Status !== 'Cancelled' && item.Status !== 'Pending' && days !== null && days <= ALERT_DAYS;
            return (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xl font-bold border ${STATUS_COLORS[item.Status] || STATUS_COLORS.Active} ${isAlert ? 'animate-pulse ring-2 ring-red-400 ring-offset-1' : ''}`}>
                    {item.Status}
                </span>
            );
        }
        if (col.key === 'EndDate') {
            const days = getDaysRemaining(item.EndDate);
            const isAlert = item.Status !== 'Cancelled' && days !== null && days <= ALERT_DAYS;
            return <span className={`text-sm ${isAlert ? 'text-red-600 font-bold animate-pulse' : 'text-slate-700 font-medium'}`}>{formatDate(item.EndDate)}</span>;
        }
        // ── NEW: ContractEndDate cell ──
        if (col.key === 'ContractEndDate') {
            if (!item.ContractEndDate) return <span className="text-slate-400 text-xs">-</span>;
            const days = getDaysRemaining(item.ContractEndDate);
            const isAlert = item.Status !== 'Cancelled' && days !== null && days <= CONTRACT_ALERT_DAYS;
            return <span className={`text-sm ${isAlert ? 'text-red-600 font-bold animate-pulse' : 'text-indigo-700 font-medium'}`}>{formatDate(item.ContractEndDate)}</span>;
        }
        if (col.key === '_duration') {
            const days = getDaysRemaining(item.EndDate);
            if (days === null) return '-';
            if (days <= 0) return <span className="text-red-600 font-bold text-2xl animate-pulse">หมดอายุ</span>;
            const display = days < 30 ? `${days} วัน` : formatDuration(new Date(), item.EndDate);
            const isAlert = days <= ALERT_DAYS;
            return (
                <span className={`font-bold text-xl ${isAlert ? 'text-orange-600' : 'text-emerald-600'}`}>
                    {display}
                </span>
            );
        }
        // ── NEW: Contract duration cell ──
        if (col.key === '_contractDuration') {
            if (!item.ContractEndDate) return <span className="text-slate-400 text-xs">-</span>;
            const days = getDaysRemaining(item.ContractEndDate);
            if (days === null) return '-';
            if (days <= 0) return <span className="text-red-600 font-bold text-sm animate-pulse">หมดแล้ว</span>;
            const display = days < 30 ? `${days} วัน` : formatDuration(new Date(), item.ContractEndDate);
            const isAlert = days <= CONTRACT_ALERT_DAYS;
            return (
                <span className={`font-bold text-sm ${isAlert ? 'text-red-600' : 'text-indigo-600'}`}>
                    {display}
                </span>
            );
        }
        if (col.key === 'Price') return `฿${(item.Price || 0).toLocaleString()}`;
        if (col.key === 'LicenseQty') return item.LicenseQty || '-';
        if (col.key === 'CreatedAt' || col.key === 'UpdatedAt') return formatDate(item[col.key]);
        if (col.key === 'CreatedBy') return item.CreatedBy || '-';
        return item[col.key] || '-';
    };

    const activeCat = CATEGORIES.find(c => c.key === activeTab);
    if (tvMode) return <MATVView items={items} onBack={() => setTvMode(false)} theme={tvTheme} onToggleTheme={() => setTvTheme(t => t === 'dark' ? 'light' : 'dark')} />;
    return (
        <div className="space-y-6 w-full">
            {/* Header & Stats */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-3xl font-black text-slate-800">MA / LICENSE</h2>
                <p className="text-slate-500 font-medium text-sm">บริหารจัดการสัญญา MA, License, Services และ Rental</p>
            </motion.div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={CheckCircle} title="Active" value={stats.active} color="from-emerald-500 to-emerald-600" onClick={() => setCardFilter(cardFilter === 'active' ? 'all' : 'active')} isActive={cardFilter === 'active'} />
                <StatCard icon={Clock} title="Expiring (< 60 Days)" value={stats.expiringSoon} color="from-orange-400 to-orange-500" onClick={() => setCardFilter(cardFilter === 'expiringSoon' ? 'all' : 'expiringSoon')} isActive={cardFilter === 'expiringSoon'} />
                <StatCard icon={AlertTriangle} title="Expired" value={stats.expired} color="from-red-500 to-red-600" onClick={() => setCardFilter(cardFilter === 'expired' ? 'all' : 'expired')} isActive={cardFilter === 'expired'} />
                <StatCard icon={DollarSign} title="Total Value" value={`฿${(stats.totalValue / 1000).toFixed(0)}k`} color="from-indigo-500 to-indigo-600" subtitle="มูลค่ารวม Active" />
            </div>

            {/* Header Controls */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                {/* Category Tabs */}
                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 w-full xl:w-auto overflow-x-auto">
                    {CATEGORIES.map(cat => {
                        const CatIcon = cat.icon;
                        return (
                            <button key={cat.key} onClick={() => { setActiveTab(cat.key); setSearchTerm(''); setStatusFilter('all'); setCardFilter('all'); setSortConfig(null); }}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === cat.key ? `bg-gradient-to-r ${cat.color} text-white shadow-md` : 'text-slate-500 hover:text-slate-800 hover:bg-white'}`}>
                                <CatIcon size={14} />
                                <span>{cat.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Filter & Controls */}
                <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                    <div className="relative flex-1 min-w-[150px] h-[36px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="ค้นหา..." className="w-full h-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-[36px] bg-slate-50 border border-slate-200 px-2 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer hover:bg-white transition-colors">
                        <option value="all">ทุกสถานะ</option>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200 h-[36px]">
                        <button onClick={() => setViewMode('list')} className={`px-2 rounded-md transition-all flex items-center ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`} title="รายการ">
                            <List size={14} />
                        </button>
                        <button onClick={() => setViewMode('grid')} className={`px-2 rounded-md transition-all flex items-center ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`} title="การ์ด">
                            <LayoutGrid size={14} />
                        </button>
                    </div>

                    <button onClick={() => setTvMode(true)}
                        className="h-[36px] flex items-center gap-1.5 px-3 rounded-lg font-bold text-xs text-white bg-slate-800 hover:bg-slate-700 shadow-sm transition-colors">
                        📺 TV Mode
                    </button>
                    {isAdmin && activeTab !== 'ALL' && (
                        <button onClick={() => setFormModal({ isOpen: true, item: null })} /* เดิม */>
                            ...
                        </button>
                    )}
                    {isAdmin && activeTab !== 'ALL' && (
                        <button onClick={() => setFormModal({ isOpen: true, item: null })} className={`h-[36px] flex items-center gap-1.5 px-3 rounded-lg font-bold text-xs text-white bg-gradient-to-r ${activeCat?.color} shadow-sm hover:shadow-md transition-all`}>
                            <Plus size={14} />
                            <span className="hidden sm:inline">เพิ่มรายการ</span>
                        </button>
                    )}
                </div>
            </div>

            {/* LIST VIEW */}
            {viewMode === 'list' ? (
                <motion.div key={`list-${activeTab}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="overflow-x-auto max-h-[60vh] 2xl:max-h-[70vh] custom-scrollbar relative">
                        <table className="w-full text-left min-w-max">
                            <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-3 py-3 w-8 bg-slate-50 text-center">#</th>
                                    {getColumns(activeTab).map(col => (
                                        <th key={col.key} className={`px-3 py-3 ${col.width} bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors group select-none`} onClick={() => handleSort(col.key)}>
                                            <div className="flex items-center gap-1">
                                                {col.label}
                                                {sortConfig?.key === col.key ? (
                                                    sortConfig.direction === 'asc' ? <ChevronUp size={11} className="text-indigo-600" /> : <ChevronDown size={11} className="text-indigo-600" />
                                                ) : (
                                                    <ArrowUpDown size={11} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                    <th className="px-3 py-3 w-12 text-center bg-slate-50">ดู</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={getColumns(activeTab).length + 2} className="p-10 text-center text-slate-400 text-sm">
                                            ไม่พบรายการ
                                        </td>
                                    </tr>
                                ) : paginatedItems.map((item, idx) => {
                                    const days = getDaysRemaining(item.EndDate);
                                    const isExpiring = days !== null && days > 0 && days <= ALERT_DAYS && item.Status !== 'Pending';
                                    const isExpired = days !== null && days <= 0 && item.Status !== 'Pending';
                                    const isCancelled = item.Status === 'Cancelled';
                                    const globalIdx = (currentPage - 1) * itemsPerPage + idx;

                                    const rowBgColor = isCancelled ? 'bg-slate-50 hover:bg-slate-100 opacity-75'
                                        : isExpired ? 'bg-red-100 hover:bg-red-200'
                                            : isExpiring ? (days <= 30 ? 'bg-red-50 hover:bg-red-100' : 'bg-orange-50 hover:bg-orange-100')
                                                : 'bg-white hover:bg-slate-50';

                                    return (
                                        <motion.tr key={item.ItemID} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                                            className={`transition-colors cursor-pointer align-middle ${rowBgColor}`}
                                            onClick={() => setDetailItem(item)}>
                                            <td className="px-3 py-2.5 text-slate-400 font-mono text-[11px] text-center">{globalIdx + 1}</td>
                                            {getColumns(activeTab).map(col => (
                                                <td key={col.key} className={`px-3 py-2.5 text-slate-600 text-xs ${col.key === 'ItemName' || col.key === 'EndDate' || col.key === '_duration' ? 'font-bold text-sm text-slate-800' : ''} ${col.width}`}>
                                                    {renderCellValue(item, col)}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2.5 text-center">
                                                <button onClick={(e) => { e.stopPropagation(); setDetailItem(item); }} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition-colors">
                                                    <Eye size={14} />
                                                </button>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            ) : (
                /* GRID VIEW */
                <motion.div key={`grid-${activeTab}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {filteredItems.length === 0 ? (
                        <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                            ไม่พบรายการ
                        </div>
                    ) : paginatedItems.map((item, idx) => {
                        const days = getDaysRemaining(item.EndDate);
                        const daysContract = getDaysRemaining(item.ContractEndDate);
                        const isExpiring = days !== null && days > 0 && days <= ALERT_DAYS;
                        const isExpired = days !== null && days <= 0;
                        const isCancelled = item.Status === 'Cancelled';
                        const isPending = item.Status === 'Pending';

                        // ── RENTAL: ใช้ PO alert เป็นหลักในการตัดสีการ์ด ──
                        const cardBgColor = isCancelled ? 'bg-slate-50 border-slate-200 opacity-75'
                            : isPending ? 'bg-yellow-100 border-yellow-600 ring-1 ring-yellow-100'
                                : isExpired ? 'bg-red-100 border-red-300 ring-1 ring-red-200'
                                    : isExpiring ? (days <= 30 ? 'bg-red-200 border-red-600 ring-1 ring-red-100' : 'bg-orange-50 border-orange-200 ring-1 ring-orange-100')
                                        : 'bg-white border-slate-200';

                        const currentItemCat = CATEGORIES.find(c => c.key === item.Category);
                        const isRental = item.Category === 'RENTAL';

                        return (
                            <motion.div key={item.ItemID} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.02 }}
                                className={`rounded-2xl border shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all overflow-hidden cursor-pointer flex flex-col relative ${cardBgColor}`}
                                onClick={() => setDetailItem(item)}>
                                {(isExpiring || isExpired) && !isCancelled && <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500 m-3 animate-ping"></div>}

                                <div className="p-2 border-b border-black/5 flex items-start gap-2.5">
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${currentItemCat?.color || 'from-slate-500 to-slate-600'} flex items-center justify-center shadow-sm shrink-0`}>
                                        {currentItemCat && <currentItemCat.icon className="w-4 h-4 text-white" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-bold text-slate-800 text-lg truncate">{item.ItemName}</h4>
                                        {item.Brand && (
                                            <div className="flex justify-between items-start gap-1 text-sm">
                                                <span className="font-medium text-slate-800 text-right truncate">{item.Brand}</span>
                                            </div>
                                        )}
                                        {item.SerialNumber && (
                                            <div className="flex items-center gap-1 text-sm">
                                                <span className="text-emerald-700 font-medium whitespace-nowrap">S/N:</span>
                                                <span className="font-medium text-emerald-700 truncate">{item.SerialNumber}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="p-2 flex-1 space-y-1.5">
                                    <div className="flex justify-between items-center font-semibold text-[16px]">
                                        <span className="text-slate-800 ">สถานะ:</span>
                                        {renderCellValue(item, { key: 'Status' })}
                                    </div>

                                    {/* ── RENTAL: แสดง dual-timeline แทน EndDate + Duration ปกติ ── */}
                                    {isRental ? (
                                        <RentalTimelineCard item={item} />
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-center font-semibold text-[16px]">
                                                <span className="text-slate-800">หมดอายุ:</span>
                                                <span className={(isExpiring || isExpired) && !isCancelled ? 'text-red-600 font-bold animate-pulse' : 'font-medium text-slate-700'}>{formatDate(item.EndDate)}</span>
                                            </div>
                                            <div className="flex justify-between items-center font-semibold text-[16px]">
                                                <span className="text-slate-800">เหลือเวลา:</span>
                                                {renderCellValue(item, { key: '_duration' })}
                                            </div>
                                            {(item.PONumber || item.ServiceNumber) && (
                                                <div className="flex justify-between items-start gap-2 text-[15px]">
                                                    <span className="text-slate-500 whitespace-nowrap">PO/สัญญา:</span>
                                                    <span className="font-medium text-slate-700 text-right truncate">{item.PONumber || item.ServiceNumber}</span>
                                                </div>
                                            )}
                                            {item.StartDate && (
                                                <div className="flex justify-between items-center text-[15px]">
                                                    <span className="text-slate-700 whitespace-nowrap">เริ่มต้น:</span>
                                                    <span className="font-medium text-slate-700">{formatDate(item.StartDate)}</span>
                                                </div>
                                            )}
                                            {item.StartDate && item.EndDate && (
                                                <div className="flex justify-between items-center text-[15px]">
                                                    <span className="text-slate-500 whitespace-nowrap">ระยะเวลา:</span>
                                                    <span className="font-medium text-slate-700">{formatDuration(item.StartDate, item.EndDate)}</span>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <div className="flex items-start gap-2 text-[13px] pt-1 border-t border-black/5">

                                        <span className="text-slate-800 font-simibold whitespace-nowrap">VENDOR :</span>
                                        <span className="font-medium text-slate-700 text-right truncate">{item.VendorName || '-'}</span>
                                    </div>
                                    {item.LocationName && (
                                        <div className="flex items-center gap-1 text-sm">
                                            <MapPin size={11} className="text-slate-400 shrink-0" />
                                            <span className="text-slate-700 truncate">{item.LocationName}</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            )}

            {/* Footer Pagination */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mt-4">
                <div className="px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-3 text-[11px] text-slate-500">
                    <div className="flex items-center gap-3">
                        <span>ทั้งหมด <span className="font-bold text-slate-700">{filteredItems.length}</span> รายการ</span>
                        <span className="hidden sm:inline text-slate-300">|</span>
                        <span className="hidden sm:inline">มูลค่ารวม <span className="font-bold text-slate-700">฿{filteredItems.reduce((s, i) => s + (i.Price || 0), 0).toLocaleString()}</span></span>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="font-medium mr-1">หน้า {currentPage} / {totalPages}</span>
                            <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-white">
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 hover:bg-slate-50 disabled:opacity-50 border-r border-slate-200"><ChevronLeft size={14} /></button>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 hover:bg-slate-50 disabled:opacity-50"><ChevronRight size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL ข้อมูลละเอียด */}
            {detailItem && (
                <Portal>
                    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
                            <div className={`p-4 bg-gradient-to-r ${CATEGORIES.find(c => c.key === detailItem.Category)?.color || 'from-slate-700 to-slate-800'} text-white relative overflow-hidden`}>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
                                <div className="flex justify-between items-start relative z-10">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">{CATEGORIES.find(c => c.key === detailItem.Category)?.label}</p>
                                        <h3 className="font-black text-lg md:text-xl tracking-tight">{detailItem.ItemName}</h3>
                                        <p className="text-white/80 text-xs mt-0.5">{detailItem.SubType}</p>
                                    </div>
                                    <button onClick={() => { setDetailItem(null); setStatusDropdownOpen(false); }} className="p-1.5 hover:bg-white/20 rounded-full transition-colors"><X size={18} /></button>
                                </div>
                            </div>
                            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                                <div className="flex items-center gap-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${STATUS_COLORS[detailItem.Status]}`}>{detailItem.Status}</span>
                                    {detailItem.EndDate && (
                                        <span className="text-[11px] text-slate-500 font-medium">
                                            {getDaysRemaining(detailItem.EndDate) > 0 ? `PO เหลือ ${getDaysRemaining(detailItem.EndDate)} วัน` : 'PO หมดอายุแล้ว'}
                                        </span>
                                    )}
                                    {/* ── NEW: แสดง contract remaining ใน detail modal ── */}
                                    {detailItem.Category === 'RENTAL' && detailItem.ContractEndDate && (
                                        <span className="text-[11px] text-indigo-600 font-medium">
                                            {getDaysRemaining(detailItem.ContractEndDate) > 0 ? `สัญญาหลักเหลือ ${getDaysRemaining(detailItem.ContractEndDate)} วัน` : 'สัญญาหลักหมดแล้ว'}
                                        </span>
                                    )}
                                </div>
                                <div className="bg-slate-50 rounded-xl overflow-hidden divide-y divide-slate-100 border border-slate-100">
                                    {detailItem.Brand && <DetailField icon={Tag} label="ยี่ห้อ/รุ่น" value={detailItem.Brand} />}
                                    {detailItem.SerialNumber && <DetailField icon={Hash} label="Serial Number" value={detailItem.SerialNumber} />}
                                    {detailItem.ServiceNumber && <DetailField icon={FileText} label="เลขบริการ/สัญญา" value={detailItem.ServiceNumber} />}
                                    {detailItem.PONumber && <DetailField icon={CreditCard} label="PO / เลขสัญญา" value={detailItem.PONumber} />}
                                    {(detailItem.LicenseQty > 0) && <DetailField icon={Hash} label="จำนวน License" value={detailItem.LicenseQty} />}
                                    <DetailField icon={DollarSign} label="ราคา" value={`฿${(detailItem.Price || 0).toLocaleString()}`} />
                                    <DetailField icon={Building} label="Vendor" value={detailItem.VendorName || '-'} />
                                    <DetailField icon={MapPin} label="สถานที่" value={detailItem.LocationName || '-'} />
                                    <DetailField icon={Calendar} label="เริ่มต้น" value={formatDate(detailItem.StartDate)} />
                                    <DetailField icon={Calendar} label="PO หมด" value={formatDate(detailItem.EndDate)} />
                                    {/* ── NEW: RENTAL contract fields in detail ── */}
                                    {detailItem.Category === 'RENTAL' && detailItem.ContractEndDate && (
                                        <>
                                            <DetailField icon={Calendar} label="สัญญาหลักหมด" value={formatDate(detailItem.ContractEndDate)} />
                                            <DetailField icon={Clock} label="ระยะสัญญาหลัก" value={formatDuration(detailItem.StartDate, detailItem.ContractEndDate)} />
                                            {detailItem.POCycle && (
                                                <DetailField icon={RefreshCw} label="รอบ PO" value={PO_CYCLE_OPTIONS.find(o => o.value === detailItem.POCycle)?.label || detailItem.POCycle} />
                                            )}
                                        </>
                                    )}
                                    <DetailField icon={Clock} label="ระยะ PO" value={formatDuration(detailItem.StartDate, detailItem.EndDate)} />
                                </div>
                                <div className="bg-blue-50 rounded-xl overflow-hidden divide-y divide-blue-100 border border-blue-100">
                                    <DetailField icon={User} label="ผู้บันทึก" value={detailItem.CreatedBy || '-'} />
                                    <DetailField icon={Calendar} label="วันบันทึก" value={formatDate(detailItem.CreatedAt)} />
                                    <DetailField icon={Clock} label="แก้ไขล่าสุด" value={formatDate(detailItem.UpdatedAt)} />
                                </div>
                                {detailItem.Remark && (
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">หมายเหตุ</p>
                                        <p className="text-xs text-slate-700">{detailItem.Remark}</p>
                                    </div>
                                )}
                            </div>
                            {isAdmin && (
                                <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-2">
                                    <button onClick={() => { setDetailItem(null); setStatusDropdownOpen(false); setFormModal({ isOpen: true, item: detailItem }); }} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-md text-[11px] font-bold hover:bg-indigo-100 border border-indigo-200">
                                        <Edit2 size={12} /> แก้ไข
                                    </button>
                                    <div className="relative">
                                        <button onClick={() => setStatusDropdownOpen(p => !p)} className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-md text-[11px] font-bold hover:bg-amber-100 border border-amber-200">
                                            <RefreshCw size={12} /> เปลี่ยนสถานะ <ChevronDown size={10} className={`transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {statusDropdownOpen && (
                                            <div className="absolute bottom-full left-0 mb-1 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-10 min-w-[120px]">
                                                {STATUS_OPTIONS.filter(s => s !== detailItem.Status).map(s => (
                                                    <button key={s} onClick={() => handleStatusChange(detailItem, s)} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-50 text-slate-700 font-medium">{s}</button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => { setDetailItem(null); setStatusDropdownOpen(false); handleDelete(detailItem); }} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-md text-[11px] font-bold hover:bg-red-100 border border-red-200 ml-auto">
                                        <Trash2 size={12} /> ลบ
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </Portal>
            )}

            {/* FORM MODAL */}
            {formModal.isOpen && (
                <FormModal item={formModal.item} category={activeTab === 'ALL' ? 'HARDWARE' : activeTab} vendors={vendors} locations={locations} maTypes={maTypes} onSave={handleSave} onClose={() => setFormModal({ isOpen: false, item: null })} />
            )}

            <AlertModal isOpen={alertModal.isOpen} type={alertModal.type} title={alertModal.title} message={alertModal.message}
                onConfirm={alertModal.onConfirm || (() => setAlertModal(p => ({ ...p, isOpen: false })))} onCancel={alertModal.onCancel} />
        </div>
    );
};

const DetailField = ({ icon: Icon, label, value }) => (
    <div className="flex items-start sm:items-center p-2.5 sm:px-3 flex-col sm:flex-row gap-1 sm:gap-0">
        <span className="text-[11px] text-slate-500 font-bold uppercase w-48 shrink-0 flex items-center gap-1.5">
            <Icon size={12} className="text-indigo-400" /> {label}
        </span>
        <span className="text-xs font-medium text-slate-800 break-words">{value}</span>
    </div>
);
const toDateInput = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};
const FormModal = ({ item, category, vendors, locations, maTypes, onSave, onClose }) => {
    const { user } = useAuth();
    const isEdit = !!item;
    const [form, setForm] = useState({
        Category: item?.Category || category,
        SubType: item?.SubType || '',
        ItemName: item?.ItemName || '',
        Brand: item?.Brand || '',
        SerialNumber: item?.SerialNumber || '',
        ServiceNumber: item?.ServiceNumber || '',
        LicenseQty: item?.LicenseQty || 0,
        PONumber: item?.PONumber || '',
        LocationName: item?.LocationName || '',
        Price: item?.Price || 0,
        VendorID: item?.VendorID || '',
        StartDate: toDateInput(item?.StartDate),
        EndDate: toDateInput(item?.EndDate),
        ContractEndDate: toDateInput(item?.ContractEndDate),
        POCycle: item?.POCycle || 'annual',
        Status: item?.Status || 'Active',
        Remark: item?.Remark || '',
        CreatedBy: item?.CreatedBy || user?.username || '',
        CreatedAt: item?.CreatedAt || '',
        UpdatedAt: item?.UpdatedAt || '',
        ...(isEdit ? { ItemID: item.ItemID } : {}),
    });
    const [errors, setErrors] = useState({});

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    };

    const handleSubmit = (e) => {
        e?.preventDefault();
        const newErrors = {};
        if (!form.SubType) newErrors.SubType = 'กรุณาเลือกประเภทย่อย';
        if (!form.ItemName.trim()) newErrors.ItemName = 'กรุณากรอกชื่อรายการ';
        if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
        onSave(form);
    };

    const cat = form.Category || category;
    const catInfo = CATEGORIES.find(c => c.key === cat);
    const subtypeOptions = (maTypes || []).filter(t => t.Category === cat).map(t => t.TypeName);
    const isRental = cat === 'RENTAL';

    return (
        <Portal>
            <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className={`p-4 bg-gradient-to-r ${catInfo?.color || 'from-slate-700 to-slate-800'} text-white`}>
                        <div className="flex justify-between items-center">
                            <h3 className="font-black text-lg">{isEdit ? 'แก้ไขรายการ' : `เพิ่ม ${catInfo?.label || ''} ใหม่`}</h3>
                            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full transition-colors"><X size={18} /></button>
                        </div>
                    </div>
                    <form id="ma-form" onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="ประเภทย่อย" required error={errors.SubType}>
                                <select value={form.SubType} onChange={(e) => handleChange('SubType', e.target.value)} className={`w-full p-2 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100 ${errors.SubType ? 'border-red-400' : 'border-slate-200'}`}>
                                    <option value="">เลือกประเภท...</option>
                                    {subtypeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </FormField>
                            <FormField label={cat === 'SOFTWARE' ? 'ชื่อ Software / License' : cat === 'SERVICE' ? 'ชื่อบริการ' : cat === 'RENTAL' ? 'ชื่อรายการเช่า' : 'ชื่ออุปกรณ์'} error={errors.ItemName}>
                                <input type="text" value={form.ItemName} onChange={(e) => handleChange('ItemName', e.target.value)} className={`w-full p-2 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100 ${errors.ItemName ? 'border-red-400' : 'border-slate-200'}`} placeholder="ระบุชื่อ..." />
                            </FormField>
                        </div>
                        {(cat === 'HARDWARE' || cat === 'RENTAL') && (
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label="ยี่ห้อ/รุ่น"><input type="text" value={form.Brand} onChange={(e) => handleChange('Brand', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Brand / Model" /></FormField>
                                <FormField label="Serial Number"><input type="text" value={form.SerialNumber} onChange={(e) => handleChange('SerialNumber', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="S/N" /></FormField>
                            </div>
                        )}
                        {cat === 'SOFTWARE' && (
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label="หมายเลขบริการ"><input type="text" value={form.ServiceNumber} onChange={(e) => handleChange('ServiceNumber', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Service Number" /></FormField>
                                <FormField label="จำนวน License"><input type="number" min="0" value={form.LicenseQty} onChange={(e) => handleChange('LicenseQty', parseInt(e.target.value) || 0)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" /></FormField>
                            </div>
                        )}
                        {cat === 'SERVICE' && (
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label="เลขสัญญา"><input type="text" value={form.ServiceNumber} onChange={(e) => handleChange('ServiceNumber', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Contract No." /></FormField>
                                <FormField label="สถานที่ให้บริการ">
                                    <select value={form.LocationName} onChange={(e) => handleChange('LocationName', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100">
                                        <option value="">เลือกสถานที่...</option>
                                        {locations.map(l => <option key={l.LocationID} value={l.Name}>{l.Name}</option>)}
                                    </select>
                                </FormField>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            {(cat !== 'SERVICE') && (
                                <FormField label="PO / เลขสัญญา"><input type="text" value={form.PONumber} onChange={(e) => handleChange('PONumber', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="PO Number" /></FormField>
                            )}
                            {(cat === 'RENTAL') && (
                                <FormField label="จำนวน"><input type="number" min="0" value={form.LicenseQty} onChange={(e) => handleChange('LicenseQty', parseInt(e.target.value) || 0)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" /></FormField>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {(cat === 'HARDWARE' || cat === 'RENTAL') && (
                                <FormField label="สถานที่ติดตั้ง">
                                    <select value={form.LocationName} onChange={(e) => handleChange('LocationName', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100">
                                        <option value="">เลือกสถานที่...</option>
                                        {locations.map(l => <option key={l.LocationID} value={l.Name}>{l.Name}</option>)}
                                    </select>
                                </FormField>
                            )}
                            <FormField label="ราคา (฿)"><input type="number" min="0" step="0.01" value={form.Price} onChange={(e) => handleChange('Price', parseFloat(e.target.value) || 0)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" /></FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Vendor">
                                <select value={form.VendorID} onChange={(e) => handleChange('VendorID', e.target.value ? parseInt(e.target.value) : '')} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100">
                                    <option value="">เลือก Vendor...</option>
                                    {vendors.map(v => <option key={v.VendorID} value={v.VendorID}>{v.VendorName}</option>)}
                                </select>
                            </FormField>
                            <FormField label="สถานะ">
                                <select value={form.Status} onChange={(e) => handleChange('Status', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100">
                                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </FormField>
                        </div>

                        {/* ── NEW: RENTAL contract fields section ── */}
                        {isRental ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-3">
                                <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider flex items-center gap-1">
                                    <FileText size={11} /> ระยะเวลาสัญญา Rental
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField label="วันที่เริ่มสัญญา">
                                        <input type="date" value={form.StartDate} onChange={(e) => handleChange('StartDate', e.target.value)} className="w-full p-2 border border-amber-200 bg-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-100" />
                                    </FormField>
                                    <FormField label="สัญญาหลักหมด">
                                        <input type="date" value={form.ContractEndDate} onChange={(e) => handleChange('ContractEndDate', e.target.value)} className="w-full p-2 border border-amber-200 bg-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-100" />
                                    </FormField>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField label="PO ปัจจุบันหมด">
                                        <input type="date" value={form.EndDate} onChange={(e) => handleChange('EndDate', e.target.value)} className="w-full p-2 border border-orange-200 bg-white rounded-lg text-lg outline-none focus:ring-2 focus:ring-orange-100" />
                                    </FormField>
                                    <FormField label="รอบการเปิด PO">
                                        <select value={form.POCycle} onChange={(e) => handleChange('POCycle', e.target.value)} className="w-full p-2 border border-amber-200 bg-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-100">
                                            {PO_CYCLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                    </FormField>
                                </div>
                                {/* Summary: แสดงระยะเวลาที่คำนวณแล้ว */}
                                {form.StartDate && form.ContractEndDate && (
                                    <div className="text-[15px] text-amber-700 font-medium bg-amber-100 rounded-lg px-3 py-2 flex justify-between">
                                        <span>ระยะสัญญาหลัก:</span>
                                        <span className="font-black">{formatDuration(form.StartDate, form.ContractEndDate)}</span>
                                    </div>
                                )}
                                {form.StartDate && form.EndDate && (
                                    <div className="text-[11px] text-orange-700 font-medium bg-orange-100 rounded-lg px-3 py-2 flex justify-between">
                                        <span>ระยะ PO ปัจจุบัน:</span>
                                        <span className="font-black">{formatDuration(form.StartDate, form.EndDate)}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* non-RENTAL: date fields เดิม */
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label="วันที่เริ่ม/ต่อประกัน"><input type="date" value={form.StartDate} onChange={(e) => handleChange('StartDate', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" /></FormField>
                                <FormField label="วันที่หมดอายุ"><input type="date" value={form.EndDate} onChange={(e) => handleChange('EndDate', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" /></FormField>
                            </div>
                        )}

                        <FormField label="หมายเหตุ (Remark)">
                            <textarea rows={2} value={form.Remark} onChange={(e) => handleChange('Remark', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100 resize-none" placeholder="ข้อมูลเพิ่มเติม..." />
                        </FormField>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-4">
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2">📋 ข้อมูลการบันทึก</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                <div>
                                    <label className="block text-blue-600 font-bold mb-0.5">ผู้บันทึก</label>
                                    <input type="text" value={form.CreatedBy || user?.username} disabled className="w-full p-1.5 bg-white text-slate-500 rounded border border-blue-100 cursor-not-allowed" />
                                </div>
                                {isEdit && (
                                    <div>
                                        <label className="block text-blue-600 font-bold mb-0.5">วันบันทึก</label>
                                        <input type="text" value={formatDate(form.CreatedAt)} disabled className="w-full p-1.5 bg-white text-slate-500 rounded border border-blue-100 cursor-not-allowed" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </form>
                    <div className="p-3 bg-slate-50 border-t border-slate-100 flex gap-2">
                        <button type="button" onClick={onClose} className="flex-1 py-2 bg-white text-slate-600 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-100 transition-colors">ยกเลิก</button>
                        <button type="submit" form="ma-form" className={`flex-1 py-2 text-white rounded-lg text-xs font-bold bg-gradient-to-r ${catInfo?.color || 'from-slate-700 to-slate-800'} hover:shadow-lg transition-all`}>
                            {isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </Portal>
    );
};

const FormField = ({ label, required, error, children }) => (
    <div>
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            {label} {required && <span className="text-red-400">*</span>}
        </label>
        {children}
        {error && <p className="text-red-500 text-[10px] mt-0.5 font-medium">{error}</p>}
    </div>
);

export default MALicensePage;