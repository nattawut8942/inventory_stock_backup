import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // หรือ 'motion/react'
import {
    Shield, Clock, AlertTriangle, DollarSign, Server, Monitor, Cpu, Wifi,
    Plus, Edit2, Trash2, X, Search, ChevronDown, Eye, FileText, Calendar,
    MapPin, Tag, Hash, Building, CreditCard, RefreshCw, CheckCircle, XCircle,
    HardDrive, Globe, Wrench, Printer, ChevronLeft, ChevronRight,
    ChevronUp, ArrowUpDown, User, List, LayoutGrid, Layers, Copy
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

// ── สถานะการต่ออายุ / จัดซื้อ (แยกจาก Status ของสัญญา) ──
// ค่าว่าง = ยังไม่ดำเนินการ
const RENEWAL_OPTIONS = [
    { value: 'QUOTATION', label: 'ขอใบเสนอราคา', short: 'ขอ QT', color: 'bg-sky-100 text-sky-700 border-sky-300', tvDark: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
    { value: 'PR_CREATED', label: 'เปิด PR แล้ว', short: 'เปิด PR', color: 'bg-blue-100 text-blue-700 border-blue-300', tvDark: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
    { value: 'WAITING_PO', label: 'รอ PO ออก', short: 'รอ PO', color: 'bg-violet-100 text-violet-700 border-violet-300', tvDark: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
    { value: 'PO_ISSUED', label: 'ออก PO แล้ว', short: 'PO ออกแล้ว', color: 'bg-teal-100 text-teal-700 border-teal-300', tvDark: 'bg-teal-500/20 text-teal-300 border-teal-500/40' },
];
const getRenewal = (v) => RENEWAL_OPTIONS.find(o => o.value === v) || null;
// ขั้นถัดไปของการต่ออายุ (null = ขั้นสุดท้ายแล้ว → ใช้ปุ่ม "ต่ออายุเสร็จ")
const getNextRenewal = (v) => {
    if (!v) return RENEWAL_OPTIONS[0];
    const idx = RENEWAL_OPTIONS.findIndex(o => o.value === v);
    return idx >= 0 && idx < RENEWAL_OPTIONS.length - 1 ? RENEWAL_OPTIONS[idx + 1] : null;
};

const RenewalBadge = ({ value, size = 'sm', dark = false, short = false, title = 'สถานะการต่ออายุ' }) => {
    const r = getRenewal(value);
    if (!r) return null;
    const sz = size === 'lg' ? 'text-lg px-3 py-1' : size === 'xs' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2 py-0.5';
    return (
        <span className={`inline-flex items-center gap-1 rounded-full font-bold border whitespace-nowrap ${sz} ${dark ? r.tvDark : r.color}`} title={title}>
            <RefreshCw size={size === 'lg' ? 14 : 10} />{short ? r.short : r.label}
        </span>
    );
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

// สถานะที่ตั้งเองได้: Active / Pending / Cancelled
// Expiring / Expired คำนวณจาก EndDate อัตโนมัติ (ค่าเก่าใน DB ที่เป็น Expiring/Expired ถือว่าเป็น "อัตโนมัติ")
const MANUAL_STATUS_OPTIONS = ['Active', 'Pending', 'Cancelled'];
const getEffectiveStatus = (item) => {
    if (item.Status === 'Cancelled' || item.Status === 'Pending') return item.Status;
    const d = getDaysRemaining(item.EndDate);
    if (d === null) return 'Active';
    if (d <= 0) return 'Expired';
    if (d <= ALERT_DAYS) return 'Expiring';
    return 'Active';
};
// ใกล้หมด/หมดแล้ว แต่ยังไม่เริ่มต่ออายุ
const needsRenewalAction = (item) => {
    const eff = getEffectiveStatus(item);
    return (eff === 'Expiring' || eff === 'Expired') && !item.RenewalStatus;
};
const toManualStatus = (s) => (s === 'Pending' || s === 'Cancelled') ? s : 'Active';

// ฿5,005,200 → "฿5.01M" (ล้าน), ต่ำกว่าล้านแสดงเต็ม
const formatBaht = (n) => {
    const v = n || 0;
    if (v >= 1_000_000) return `฿${(v / 1_000_000).toFixed(2)}M`;
    return `฿${v.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
};

// tooltip ของ badge สถานะต่ออายุ: ผู้อัปเดท + วันเวลา
const renewalUpdatedTitle = (item) => {
    const who = item.RenewalUpdatedBy || 'ไม่ทราบ';
    const when = item.RenewalUpdatedAt
        ? new Date(item.RenewalUpdatedAt).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'ไม่ทราบ';
    return `ผู้อัปเดท: ${who}
เมื่อ: ${when}`;
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

    const isCancelled = item.Status === 'Cancelled';
    const renderDaysLabel = (days, label) => {
        if (days === null) return null;
        if (isCancelled) return <span className="text-slate-400 font-bold text-xs">{days <= 0 ? 'หมดอายุแล้ว' : 'ยกเลิก'}</span>;
        if (days <= 0) return <span className="text-red-600 font-bold text-xs">หมดอายุแล้ว</span>;
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
                        {poAlert && <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 ml-0.5" />}
                    </span>
                    {renderDaysLabel(daysPO)}
                </div>
                <div className="flex justify-between text-[12px]">
                    <span className="text-slate-500">{item.PONumber || '-'}</span>
                    <span className={`font-bold text-base ${poAlert ? 'text-orange-700' : 'text-slate-700'}`}>

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
                            {contractAlert && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5" />}
                        </span>
                        {renderDaysLabel(daysContract)}
                    </div>
                    <div className="flex justify-between text-[12px]">
                        <span className="text-slate-500">{formatDate(item.StartDate)} →</span>
                        <span className={`font-bold text-base ${contractAlert ? 'text-red-700' : 'text-indigo-700'}`}>
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
// เรียง: รายการที่ยังมีผลก่อน (Cancelled ไว้ท้าย) แล้วตามวันหมดอายุที่ใกล้ที่สุด
const compareByUrgency = (a, b) => {
    const rank = (i) => (i.Status === 'Cancelled' ? 1 : 0);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const daysA = getDaysRemaining(a.EndDate);
    const daysB = getDaysRemaining(b.EndDate);
    return (daysA === null ? 999999 : daysA) - (daysB === null ? 999999 : daysB);
};
const sortByNearestExpiry = (list) => [...list].sort(compareByUrgency);

// ส่วนที่ใช้ไปแล้วของสัญญา 0–100 (null ถ้าไม่มีวันเริ่ม/หมด)
const getElapsedPercent = (start, end) => {
    if (!start || !end) return null;
    const s = new Date(start).getTime(), e = new Date(end).getTime();
    if (!(e > s)) return null;
    return Math.min(100, Math.max(0, Math.round(((Date.now() - s) / (e - s)) * 100)));
};
// Brand ซ้ำกับชื่อรายการไหม (เช่น "RICOH P 800" กับ "Ricoh P 800")
const isSameText = (a, b) => (a || '').replace(/\s+/g, '').toLowerCase() === (b || '').replace(/\s+/g, '').toLowerCase();

// แถวย่อสำหรับรายการ Active ใน TV (ประหยัดพื้นที่ ให้การ์ดใหญ่เป็นของรายการที่ต้องติดตาม)
const MATVMini = ({ item, isDark }) => {
    const days = getDaysRemaining(item.EndDate);
    const catInfo = CATEGORIES.find(c => c.key === item.Category);
    return (
        <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${catInfo?.color || 'from-slate-500 to-slate-600'} flex items-center justify-center shrink-0`}>
                {catInfo && <catInfo.icon className="w-4 h-4 text-white" />}
            </div>
            <div className="min-w-0 flex-1">
                <p className={`font-bold text-lg leading-tight truncate ${isDark ? 'text-white' : 'text-slate-800'}`} title={item.ItemName}>{item.ItemName}</p>
                <p className={`text-sm truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{item.LocationName || item.VendorName || '-'}</p>
            </div>
            <div className="text-right shrink-0">
                <p className={`font-bold text-base ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{formatDate(item.EndDate)}</p>
                <p className={`text-sm font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    {days === null ? '-' : days < 30 ? `${days} วัน` : formatDuration(new Date(), item.EndDate)}
                </p>
            </div>
        </div>
    );
};

const TV_ACTIVE_MODES = { cards: 'เกิน 60 วัน: แสดง', hide: 'เกิน 60 วัน: ซ่อน' };
const STALE_MINUTES = 15;

const MATVView = ({ items, onBack, theme = 'dark', onToggleTheme, onRefresh, lastFetchedAt, fetchError, renderCell }) => {
    const isDark = theme === 'dark';
    const scrollRef = useRef(null);
    const rootRef = useRef(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [activeMode, setActiveMode] = useState(() => {
        try { return localStorage.getItem('maTvActiveMode') === 'hide' ? 'hide' : 'cards'; } catch { return 'cards'; }
    });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [cursorHidden, setCursorHidden] = useState(false);
    const [now, setNow] = useState(Date.now());

    // นาฬิกา (อัปเดต DOM ตรง ไม่ re-render ทุกวินาที) + now สำหรับเช็คข้อมูลเก่า ทุก 30 วิ
    useEffect(() => {
        const tick = () => {
            const el = document.getElementById('ma-tv-clock');
            if (el) el.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };
        tick();
        const id = setInterval(tick, 1000);
        const id2 = setInterval(() => setNow(Date.now()), 30000);
        return () => { clearInterval(id); clearInterval(id2); };
    }, []);

    // TV รีเฟรชข้อมูลทุก 2 นาที
    useEffect(() => {
        if (!onRefresh) return;
        const id = setInterval(onRefresh, 2 * 60 * 1000);
        return () => clearInterval(id);
    }, [onRefresh]);

    useEffect(() => { try { localStorage.setItem('maTvActiveMode', activeMode); } catch { /* ignore */ } }, [activeMode]);

    // เต็มจอ
    useEffect(() => {
        const onFs = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFs);
        return () => document.removeEventListener('fullscreenchange', onFs);
    }, []);
    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else rootRef.current?.requestFullscreen?.().catch(() => { });
    };

    // ซ่อนเมาส์เมื่อไม่ขยับ 3 วินาที
    useEffect(() => {
        let t;
        const onMove = () => { setCursorHidden(false); clearTimeout(t); t = setTimeout(() => setCursorHidden(true), 3000); };
        onMove();
        window.addEventListener('mousemove', onMove);
        return () => { window.removeEventListener('mousemove', onMove); clearTimeout(t); };
    }, []);

    // เลื่อนอัตโนมัติ: ลงช้าๆ → ถึงล่างพัก 6 วิ → กลับขึ้นบน พัก 6 วิ
    // ผู้ใช้เลื่อนเอง/วางเมาส์บนรายการ → หยุดชั่วคราว 20 วิ
    // ตั้งค่า reduce motion ไว้ → ข้ามทีละหน้าจอทุก 15 วิแทน
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || !autoScroll) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        let raf, timer, pausedUntil = 0, last = performance.now(), pos = el.scrollTop;
        const SPEED = 40; // px ต่อวินาที
        const pause = (ms) => { pausedUntil = performance.now() + ms; };
        const onUser = () => { pause(20000); pos = el.scrollTop; };
        el.addEventListener('wheel', onUser, { passive: true });
        el.addEventListener('touchstart', onUser, { passive: true });
        el.addEventListener('mouseenter', onUser);
        el.addEventListener('mousemove', onUser);

        if (reduce) {
            timer = setInterval(() => {
                if (performance.now() < pausedUntil) return;
                const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
                el.scrollTop = atBottom ? 0 : el.scrollTop + el.clientHeight * 0.9;
            }, 15000);
        } else {
            pause(4000);
            const step = (t) => {
                const dt = (t - last) / 1000; last = t;
                if (t >= pausedUntil && el.scrollHeight > el.clientHeight) {
                    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
                        // ถึงล่างสุด: พักแล้วกลับขึ้นบน
                        pause(8000); // ยาวกว่า timeout ด้านล่าง กันตั้ง timeout ซ้ำ
                        timer = setTimeout(() => { el.scrollTo({ top: 0, behavior: 'smooth' }); pos = 0; pause(6000); }, 6000);
                    } else {
                        pos += SPEED * dt;
                        el.scrollTop = pos;
                    }
                }
                raf = requestAnimationFrame(step);
            };
            raf = requestAnimationFrame(step);
        }
        return () => {
            cancelAnimationFrame(raf); clearInterval(timer); clearTimeout(timer);
            el.removeEventListener('wheel', onUser); el.removeEventListener('touchstart', onUser);
            el.removeEventListener('mouseenter', onUser); el.removeEventListener('mousemove', onUser);
        };
    }, [autoScroll, activeMode]);

    // แยก: ต้องติดตาม (การ์ดใหญ่) / Active ปกติ
    const visible = useMemo(() => sortByNearestExpiry(items.filter(i => i.Status !== 'Cancelled')), [items]);
    const { attention, normal } = useMemo(() => {
        const attention = [], normal = [];
        visible.forEach(i => {
            const eff = getEffectiveStatus(i);
            if (eff === 'Active' && !i.RenewalStatus) normal.push(i); else attention.push(i);
        });
        return { attention, normal };
    }, [visible]);

    // ตัวเลขเหมือนหน้าหลัก (ใช้ getEffectiveStatus)
    const counts = useMemo(() => {
        const eff = visible.map(getEffectiveStatus);
        return {
            needAction: visible.filter(needsRenewalAction).length,
            inProgress: visible.filter(i => i.RenewalStatus).length,
            expired: eff.filter(s => s === 'Expired').length,
            expiring: eff.filter(s => s === 'Expiring').length,
            active: eff.filter(s => s === 'Active').length,
        };
    }, [visible]);

    const isStale = fetchError || (lastFetchedAt && now - lastFetchedAt > STALE_MINUTES * 60 * 1000);
    const lastText = lastFetchedAt ? new Date(lastFetchedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';

    const btn = `flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-colors whitespace-nowrap ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'}`;
    const Counter = ({ value, label, dark, light }) => (
        <div className={`flex flex-col items-center px-4 py-2 rounded-xl border min-w-[84px] ${isDark ? dark : light}`}>
            <p className="text-2xl 2xl:text-3xl font-black leading-none">{value}</p>
            <p className={`text-xs mt-1 font-bold whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{label}</p>
        </div>
    );
    const sectionTitle = `text-lg font-black uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`;

    return (
        <Portal>
            <style>{`
                .ma-tv-scroll::-webkit-scrollbar { display: none; }
                .ma-tv-scroll { scrollbar-width: none; -ms-overflow-style: none; }
            `}</style>
            <div ref={rootRef} className={`fixed inset-0 z-40 flex flex-col overflow-hidden ${isDark ? 'bg-slate-950' : 'bg-slate-100'} ${cursorHidden ? 'cursor-none' : ''}`}>
                {/* Header */}
                <div className={`flex flex-wrap items-center justify-between px-6 2xl:px-10 py-3 border-b shadow-lg flex-shrink-0 gap-x-6 gap-y-3 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center gap-4 min-w-0">
                        <button onClick={onBack} className={btn}>← กลับ</button>
                        <div className="min-w-0">
                            <h1 className={`text-2xl 2xl:text-3xl font-black tracking-tight whitespace-nowrap ${isDark ? 'text-white' : 'text-slate-800'}`}>MA / LICENSE DASHBOARD</h1>
                            <p className={`text-xs mt-0.5 flex items-center gap-1.5 ${isStale ? 'text-red-400 font-bold' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                <span className={`inline-block w-2 h-2 rounded-full ${isStale ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                อัปเดตล่าสุด {lastText}{fetchError ? ' · เชื่อมต่อ server ไม่ได้' : isStale ? ' · ข้อมูลอาจไม่เป็นปัจจุบัน' : ''} · {visible.length} รายการ
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Counter value={counts.needAction} label="ต้องดำเนินการ" dark="bg-rose-950/50 border-rose-700/60 text-rose-300" light="bg-rose-100 border-rose-300 text-rose-700" />
                        <Counter value={counts.inProgress} label="กำลังต่ออายุ" dark="bg-violet-950/50 border-violet-700/60 text-violet-300" light="bg-violet-100 border-violet-300 text-violet-700" />
                        <Counter value={counts.expired} label="หมดอายุ" dark="bg-red-950/50 border-red-700/50 text-red-400" light="bg-red-100 border-red-300 text-red-700" />
                        <Counter value={counts.expiring} label={`≤ ${ALERT_DAYS} วัน`} dark="bg-orange-950/50 border-orange-700/50 text-orange-400" light="bg-orange-100 border-orange-300 text-orange-700" />
                        <Counter value={counts.active} label="Active" dark="bg-emerald-950/50 border-emerald-700/50 text-emerald-400" light="bg-emerald-100 border-emerald-300 text-emerald-700" />
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setAutoScroll(v => !v)} className={btn} title="เลื่อนหน้าอัตโนมัติ">{autoScroll ? '⏸ หยุดเลื่อน' : '▶ เลื่อนอัตโนมัติ'}</button>
                        <button onClick={() => setActiveMode(m => (m === 'hide' ? 'cards' : 'hide'))} className={btn} title="วิธีแสดงรายการ Active">{TV_ACTIVE_MODES[activeMode]}</button>
                        <button onClick={onToggleTheme} className={btn}>{isDark ? '☀️ Light' : '🌙 Dark'}</button>
                        <button onClick={toggleFullscreen} className={btn}>{isFullscreen ? '🗗 ออกเต็มจอ' : '⛶ เต็มจอ'}</button>
                        <p className={`text-4xl 2xl:text-6xl font-mono tabular-nums ml-2 ${isDark ? 'text-white' : 'text-slate-700'}`} id="ma-tv-clock">—</p>
                    </div>
                </div>

                {isStale && (
                    <div className="bg-red-600 text-white text-center font-bold py-1.5 text-sm flex-shrink-0">
                        ⚠️ {fetchError ? 'เชื่อมต่อ server ไม่ได้' : `ข้อมูลไม่ได้อัปเดตเกิน ${STALE_MINUTES} นาที`} — แสดงข้อมูล ณ {lastText}
                    </div>
                )}

                {/* Body — เลื่อนอัตโนมัติ ไม่เห็น scrollbar */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 2xl:px-8 py-5 ma-tv-scroll space-y-6">
                    {visible.length === 0 ? (
                        <p className={`text-center py-20 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>ไม่มีรายการ</p>
                    ) : (<>
                        <section>
                            <h2 className={sectionTitle}>⚠️ ต้องติดตาม <span className="opacity-60">({attention.length})</span></h2>
                            {attention.length === 0 ? (
                                <p className={`text-xl font-bold py-6 text-center rounded-2xl border ${isDark ? 'text-emerald-400 border-emerald-800 bg-emerald-950/30' : 'text-emerald-700 border-emerald-200 bg-emerald-50'}`}>✓ ไม่มีรายการใกล้หมดอายุ</p>
                            ) : (
                                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
                                    {attention.map((item, i) => <MAGridCard key={item.ItemID} item={item} idx={i} readOnly renderCell={renderCell} />)}
                                </div>
                            )}
                        </section>
                        {activeMode !== 'hide' && normal.length > 0 && (
                            <section>
                                <h2 className={sectionTitle}>✓ เกิน {ALERT_DAYS} วัน <span className="opacity-60">({normal.length})</span></h2>
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                                    {normal.map(item => <MATVMini key={item.ItemID} item={item} isDark={isDark} />)}
                                </div>
                            </section>
                        )}
                    </>)}
                </div>
            </div>
        </Portal>
    );
};


// แถบขั้นตอนต่ออายุแบบย่อ สำหรับการ์ด grid และ TV (แยกแถว ไม่ทับแถบ %)
const MiniRenewalStepper = ({ value }) => {
    const cur = RENEWAL_OPTIONS.findIndex(o => o.value === value);
    const pct = cur <= 0 ? 0 : (cur / (RENEWAL_OPTIONS.length - 1)) * 100;
    return (
        <div className="pt-1" title={cur < 0 ? 'ยังไม่เริ่มขั้นตอนต่ออายุ' : `ขั้นที่ ${cur + 1}/4: ${RENEWAL_OPTIONS[cur].label}`}>
            <div className="relative flex justify-between">
                <div className="absolute top-[7px] left-[10%] right-[10%] h-[3px] rounded-full bg-violet-100" />
                <motion.div className="absolute top-[7px] left-[10%] h-[3px] rounded-full bg-gradient-to-r from-violet-400 to-teal-500 origin-left"
                    initial={{ width: 0 }} animate={{ width: `calc((100% - 20%) * ${pct / 100})` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                {RENEWAL_OPTIONS.map((o, i) => {
                    const done = cur >= i;
                    return (
                        <div key={o.value} className="relative z-10 flex flex-col items-center w-1/4">
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black border-2 ${done ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-violet-200 text-violet-300'} ${cur === i ? 'ring-2 ring-violet-200' : ''}`}>
                                {done && i < cur ? <CheckCircle size={9} /> : i + 1}
                            </div>
                            <span className={`mt-0.5 text-[10px] font-bold leading-none whitespace-nowrap ${done ? 'text-violet-700' : 'text-slate-400'}`}>{o.short}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const MAGridCard = ({ item, idx = 0, isAdmin, renderCell, onOpen, onEdit, onRenew, readOnly = false }) => {
                        const days = getDaysRemaining(item.EndDate);
                        const daysContract = getDaysRemaining(item.ContractEndDate);
                        const isExpiring = days !== null && days > 0 && days <= ALERT_DAYS;
                        const isExpired = days !== null && days <= 0;
                        const isCancelled = item.Status === 'Cancelled';
                        const isPending = item.Status === 'Pending';

                        // ── RENTAL: ใช้ PO alert เป็นหลักในการตัดสีการ์ด ──
                        const cardBgColor = isCancelled ? 'bg-slate-100 border-slate-200 opacity-60 grayscale'
                            : isPending ? 'bg-yellow-100 border-yellow-600 ring-1 ring-yellow-100'
                                : isExpired ? 'bg-red-100 border-red-300 ring-1 ring-red-200'
                                    : isExpiring ? (days <= 30 ? 'bg-red-200 border-red-600 ring-1 ring-red-100' : 'bg-orange-50 border-orange-200 ring-1 ring-orange-100')
                                        : 'bg-white border-slate-200';

                        const currentItemCat = CATEGORIES.find(c => c.key === item.Category);
                        const isRental = item.Category === 'RENTAL';

                        return (
                            <motion.div key={item.ItemID} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.02 }}
                                className={`rounded-2xl border shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all overflow-hidden cursor-pointer flex flex-col relative ${cardBgColor}`}
                                onClick={readOnly ? undefined : () => onOpen(item)}>
                                {(isExpiring || isExpired) && !isCancelled && !isPending && !item.RenewalStatus && <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500 m-3 animate-ping motion-reduce:animate-none"></div>}

                                <div className="p-2 border-b border-black/5 flex items-start gap-2.5">
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${currentItemCat?.color || 'from-slate-500 to-slate-600'} flex items-center justify-center shadow-sm shrink-0`}>
                                        {currentItemCat && <currentItemCat.icon className="w-4 h-4 text-white" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-bold text-slate-800 text-lg truncate" title={item.ItemName}>{item.ItemName}</h4>
                                        {item.Brand && !isSameText(item.Brand, item.ItemName) && (
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
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-slate-500 font-medium">สถานะ</span>
                                        {renderCell(item, { key: 'Status' })}
                                    </div>

                                    {/* ── RENTAL: แสดง dual-timeline แทน EndDate + Duration ปกติ ── */}
                                    {isRental ? (
                                        <RentalTimelineCard item={item} />
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-center text-[15px]">
                                                <span className="text-slate-500 font-medium">หมดอายุ</span>
                                                <span className={`font-bold ${isCancelled ? 'text-slate-400' : isExpired ? 'text-red-600' : isExpiring ? 'text-orange-600' : 'text-slate-800'}`}>{formatDate(item.EndDate)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-[15px]">
                                                <span className="text-slate-500 font-medium">เหลือเวลา</span>
                                                {renderCell(item, { key: '_duration' })}
                                            </div>
                                            {/* แถบระยะสัญญาที่ใช้ไปแล้ว */}
                                            {(() => {
                                                const pct = getElapsedPercent(item.StartDate, item.EndDate);
                                                if (pct === null) return null;
                                                const bar = isCancelled ? 'bg-slate-300' : isExpired ? 'bg-red-500' : isExpiring ? 'bg-orange-500' : 'bg-emerald-500';
                                                return (
                                                    <div title={`${formatDate(item.StartDate)} – ${formatDate(item.EndDate)}`}>
                                                        <div className="h-1.5 rounded-full bg-black/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="ระยะสัญญาที่ใช้ไปแล้ว">
                                                            <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <div className="flex justify-between text-[11px] text-slate-500 mt-0.5">
                                                            <span>{formatDate(item.StartDate)}</span>
                                                            <span>ใช้ไป {pct}% · {formatDuration(item.StartDate, item.EndDate)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            {item.PONumber && (
                                                <div className="flex justify-between items-start gap-2 text-[13px]">
                                                    <span className="text-slate-500 whitespace-nowrap">PO:</span>
                                                    <span className="font-medium text-slate-700 text-right truncate">{item.PONumber}</span>
                                                </div>
                                            )}
                                            {item.ServiceNumber && (
                                                <div className="flex justify-between items-start gap-2 text-[13px]">
                                                    <span className="text-slate-500 whitespace-nowrap">{item.Category === 'SERVICE' ? 'เลขสัญญา:' : 'เลขบริการ:'}</span>
                                                    <span className="font-medium text-slate-700 text-right truncate">{item.ServiceNumber}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {(item.LicenseQty > 0 || item.Price > 0) && (
                                        <div className="flex justify-between items-center gap-2 text-[13px]">
                                            <span className="text-slate-500">{item.LicenseQty > 0 ? `จำนวน ${item.LicenseQty}${item.Category === 'SOFTWARE' ? ' license' : ''}` : ''}</span>
                                            {item.Price > 0 && <span className="font-bold text-slate-700">฿{item.Price.toLocaleString()}</span>}
                                        </div>
                                    )}

                                    <MiniRenewalStepper value={item.RenewalStatus} />
                                    <div className="flex items-start gap-2 text-[13px] pt-1 border-t border-black/5">

                                        <span className="text-slate-800 font-semibold whitespace-nowrap">Vendor:</span>
                                        <span className="font-medium text-slate-700 text-right truncate">{item.VendorName || '-'}</span>
                                    </div>
                                    {item.LocationName && (
                                        <div className="flex items-center gap-1 text-sm">
                                            <MapPin size={11} className="text-slate-400 shrink-0" />
                                            <span className="text-slate-700 truncate">{item.LocationName}</span>
                                        </div>
                                    )}
                                    {item.LastRenewedAt && (
                                        <div className="flex items-center gap-1 text-[12px] text-emerald-700" title="ต่ออายุล่าสุด">
                                            <CheckCircle size={11} className="shrink-0" />
                                            <span className="truncate">ต่ออายุ {formatDate(item.LastRenewedAt)} · {item.LastRenewedBy || '-'}</span>
                                        </div>
                                    )}
                                </div>
                                {isAdmin && !readOnly && (
                                    <div className="px-2 py-1.5 border-t border-black/5 flex items-center justify-end gap-1">
                                        <button onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-indigo-600 hover:bg-indigo-50">
                                            <Edit2 size={12} /> แก้ไข
                                        </button>
                                        {(item.RenewalStatus || needsRenewalAction(item)) && (
                                            <button onClick={(e) => { e.stopPropagation(); onRenew(item); }}
                                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold ${item.RenewalStatus === 'PO_ISSUED' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'text-emerald-700 hover:bg-emerald-50'}`}>
                                                <CheckCircle size={12} /> ต่ออายุเสร็จ
                                            </button>
                                        )}
                                    </div>
                                )}
                            </motion.div>
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
    const [renewalFilter, setRenewalFilter] = useState('all');
    const [renewalDropdownOpen, setRenewalDropdownOpen] = useState(false);
    const [renewItem, setRenewItem] = useState(null);
    const [cardFilter, setCardFilter] = useState('all');
    // จอแคบ (มือถือ) เริ่มที่มุมมองการ์ด — ตาราง 10+ คอลัมน์ต้องเลื่อนแนวนอน
    const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'list'));
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

    // Esc: ปิด dropdown → ปิดหน้าต่างต่ออายุ → ปิด detail (ฟอร์มแก้ไขไม่ปิดด้วย Esc กันข้อมูลที่พิมพ์หาย)
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== 'Escape' || alertModal.isOpen) return;
            if (statusDropdownOpen || renewalDropdownOpen) { setStatusDropdownOpen(false); setRenewalDropdownOpen(false); return; }
            if (renewItem) { setRenewItem(null); return; }
            if (detailItem && !formModal.isOpen) setDetailItem(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [alertModal.isOpen, statusDropdownOpen, renewalDropdownOpen, renewItem, detailItem, formModal.isOpen]);

    // คลิกนอก dropdown → ปิด
    useEffect(() => {
        if (!statusDropdownOpen && !renewalDropdownOpen) return;
        const onDown = (e) => {
            if (!e.target.closest('[data-dropdown]')) { setStatusDropdownOpen(false); setRenewalDropdownOpen(false); }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [statusDropdownOpen, renewalDropdownOpen]);

    const [lastFetchedAt, setLastFetchedAt] = useState(null);
    const [fetchError, setFetchError] = useState(false);
    const fetchItems = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/ma`);
            if (res.ok) { setItems(await res.json()); setLastFetchedAt(Date.now()); setFetchError(false); }
            else setFetchError(true);
        } catch (err) { console.error('Fetch MA Items Error:', err); setFetchError(true); }
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
            .filter(i => statusFilter === 'all' || getEffectiveStatus(i) === statusFilter)
            .filter(i => {
                if (renewalFilter === 'all') return true;
                if (renewalFilter === 'none') return !i.RenewalStatus;
                if (renewalFilter === 'inProgress') return !!i.RenewalStatus;
                if (renewalFilter === 'needAction') return needsRenewalAction(i);
                return i.RenewalStatus === renewalFilter;
            })
            .filter(i => {
                if (cardFilter === 'all') return true;
                const eff = getEffectiveStatus(i);
                if (cardFilter === 'active') return eff === 'Active';
                if (cardFilter === 'expiringSoon') return eff === 'Expiring';
                if (cardFilter === 'expired') return eff === 'Expired';
                if (cardFilter === 'needAction') return needsRenewalAction(i);
                if (cardFilter === 'inProgress') return !!i.RenewalStatus;
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
                    (i.PRNumber || '').toLowerCase().includes(term) ||
                    (i.RenewalUpdatedBy || '').toLowerCase().includes(term) ||
                    (i.NewPONumber || '').toLowerCase().includes(term) ||
                    (i.VendorName || '').toLowerCase().includes(term) ||
                    (i.ServiceNumber || '').toLowerCase().includes(term)
                );
            });
    }, [items, activeTab, statusFilter, renewalFilter, cardFilter, searchTerm]);

    useEffect(() => { setCurrentPage(1); }, [activeTab, statusFilter, renewalFilter, cardFilter, searchTerm]);

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
        } else {
            sortableItems.sort(compareByUrgency);
        }
        return sortableItems;
    }, [filteredItems, sortConfig]);

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
        // ใช้ getEffectiveStatus เหมือนกับตัวกรองการ์ด → ตัวเลขบนการ์ดตรงกับจำนวนแถวที่กดแล้วเห็น
        const eff = items.map(getEffectiveStatus);
        const active = eff.filter(s => s === 'Active').length;
        const expiringSoon = eff.filter(s => s === 'Expiring').length;
        const expired = eff.filter(s => s === 'Expired').length;
        // มูลค่าสัญญาที่ยังมีผล (Active + Expiring)
        const totalValue = items.filter((_, idx) => eff[idx] === 'Active' || eff[idx] === 'Expiring').reduce((sum, i) => sum + (i.Price || 0), 0);
        const needAction = items.filter(needsRenewalAction).length;
        const renewalByStep = Object.fromEntries(RENEWAL_OPTIONS.map(o => [o.value, items.filter(i => i.RenewalStatus === o.value).length]));
        const inProgress = Object.values(renewalByStep).reduce((a, b) => a + b, 0);
        return { active, expiringSoon, expired, totalValue, needAction, inProgress, renewalByStep };
    }, [items]);

    const handleSave = async (formData) => {
        const isEdit = !!formData.ItemID;
        const url = isEdit ? `${API_BASE}/ma/${formData.ItemID}` : `${API_BASE}/ma`;
        const method = isEdit ? 'PUT' : 'POST';
        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, CreatedBy: user?.username || 'system', UpdatedBy: user?.username || 'system' })
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
            message: `ต้องการลบ "${item.ItemName}" ใช่หรือไม่?\n\nเป็น soft delete: รายการจะถูกซ่อนจากระบบ แต่ข้อมูลยังเก็บอยู่ในฐานข้อมูล`,
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/ma/${item.ItemID}`, { method: 'DELETE' });
                    if (res.ok) {
                        fetchItems(); setDetailItem(null);
                        setAlertModal({ isOpen: true, type: 'success', title: 'ลบสำเร็จ', message: 'ลบรายการเรียบร้อยแล้ว (soft delete: ซ่อนจากระบบ ข้อมูลยังอยู่ในฐานข้อมูล)' });
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
                fetchItems(); setDetailItem(null); setStatusDropdownOpen(false); setRenewalDropdownOpen(false);
                setAlertModal({ isOpen: true, type: 'success', title: 'อัปเดตสถานะ', message: `เปลี่ยนสถานะเป็น "${newStatus}" เรียบร้อย` });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: 'ไม่สามารถเปลี่ยนสถานะได้' });
        }
    };

    const handleRenewalChange = async (item, newRenewal) => {
        try {
            const res = await fetch(`${API_BASE}/ma/${item.ItemID}/renewal`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ RenewalStatus: newRenewal || null, UpdatedBy: user?.username || 'system' })
            });
            if (res.ok) {
                fetchItems(); setDetailItem(null); setRenewalDropdownOpen(false);
                const label = getRenewal(newRenewal)?.label || 'ยังไม่ดำเนินการ';
                setAlertModal({ isOpen: true, type: 'success', title: 'อัปเดตสถานะต่ออายุ', message: `เปลี่ยนสถานะต่ออายุเป็น "${label}" เรียบร้อย` });
            } else {
                const err = await res.json().catch(() => ({}));
                setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.error || 'ไม่สามารถเปลี่ยนสถานะต่ออายุได้' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: 'ไม่สามารถเปลี่ยนสถานะต่ออายุได้' });
        }
    };

    const handleCompleteRenewal = async (item, data) => {
        try {
            const res = await fetch(`${API_BASE}/ma/${item.ItemID}/renew`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, UpdatedBy: user?.username || 'system' })
            });
            if (res.ok) {
                setRenewItem(null); fetchItems();
                setAlertModal({ isOpen: true, type: 'success', title: 'ต่ออายุเรียบร้อย', message: `"${item.ItemName}" ต่ออายุถึง ${formatDate(data.EndDate)} แล้ว` });
            } else {
                const err = await res.json().catch(() => ({}));
                setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.error || 'ไม่สามารถบันทึกการต่ออายุได้' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'Connection Error', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
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
                { key: 'SerialNumber', label: 'S/N', width: 'min-w-[100px] break-all' },
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
                { key: 'PONumber', label: 'PO/สัญญา', width: 'min-w-[100px] break-all' },
                { key: 'SerialNumber', label: 'S/N', width: 'min-w-[100px] break-all' },
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
                { key: 'SerialNumber', label: 'S/N', width: 'min-w-[100px] break-all' },
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
            // กำลังต่ออายุอยู่ (มี RenewalStatus) → ไม่ต้องกระพริบเตือน
            const eff = getEffectiveStatus(item);
            const isAlert = (eff === 'Expiring' || eff === 'Expired') && !item.RenewalStatus;
            return (
                <span className="inline-flex flex-col items-end gap-0.5">
                    <span className="inline-flex flex-wrap items-center justify-end gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_COLORS[eff] || STATUS_COLORS.Active} ${isAlert ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}>
                            {eff}
                        </span>
                        <RenewalBadge value={item.RenewalStatus} short title={renewalUpdatedTitle(item)} />
                    </span>
                </span>
            );
        }
        if (col.key === 'EndDate') {
            const days = getDaysRemaining(item.EndDate);
            const isAlert = item.Status !== 'Cancelled' && days !== null && days <= ALERT_DAYS;
            return <span className={`text-sm ${isAlert ? 'text-red-600 font-bold' : 'text-slate-700 font-medium'}`}>{formatDate(item.EndDate)}</span>;
        }
        // ── NEW: ContractEndDate cell ──
        if (col.key === 'ContractEndDate') {
            if (!item.ContractEndDate) return <span className="text-slate-400 text-xs">-</span>;
            const days = getDaysRemaining(item.ContractEndDate);
            const isAlert = item.Status !== 'Cancelled' && days !== null && days <= CONTRACT_ALERT_DAYS;
            return <span className={`text-sm ${isAlert ? 'text-red-600 font-bold' : 'text-indigo-700 font-medium'}`}>{formatDate(item.ContractEndDate)}</span>;
        }
        if (col.key === '_duration') {
            const days = getDaysRemaining(item.EndDate);
            if (days === null) return '-';
            if (item.Status === 'Cancelled') return <span className="text-slate-400 font-bold text-sm">{days <= 0 ? 'หมดอายุ' : 'ยกเลิก'}</span>;
            if (days <= 0) return <span className="text-red-600 font-bold text-sm">หมดอายุ</span>;
            const display = days < 30 ? `${days} วัน` : formatDuration(new Date(), item.EndDate);
            const isAlert = days <= ALERT_DAYS;
            return (
                <span className={`font-bold text-sm ${isAlert ? 'text-orange-600' : 'text-emerald-600'}`}>
                    {display}
                </span>
            );
        }
        // ── NEW: Contract duration cell ──
        if (col.key === '_contractDuration') {
            if (!item.ContractEndDate) return <span className="text-slate-400 text-xs">-</span>;
            const days = getDaysRemaining(item.ContractEndDate);
            if (days === null) return '-';
            if (days <= 0) return <span className="text-red-600 font-bold text-sm">หมดแล้ว</span>;
            const display = days < 30 ? `${days} วัน` : formatDuration(new Date(), item.ContractEndDate);
            const isAlert = days <= CONTRACT_ALERT_DAYS;
            return (
                <span className={`font-bold text-sm ${isAlert ? 'text-red-600' : 'text-indigo-600'}`}>
                    {display}
                </span>
            );
        }
        if (col.key === 'LastRenewedAt') {
            if (!item.LastRenewedAt) return <span className="text-slate-400 text-xs">-</span>;
            return (
                <span className="inline-flex flex-col leading-tight">
                    <span className="text-xs font-bold text-emerald-700">{formatDate(item.LastRenewedAt)}</span>
                    <span className="text-[11px] text-slate-500">โดย {item.LastRenewedBy || '-'}</span>
                </span>
            );
        }
        if (col.key === 'SerialNumber') return item.SerialNumber ? <span className="font-mono text-[11px] text-emerald-700">{item.SerialNumber}</span> : <span className="text-slate-400">-</span>;
        if (col.key === 'Price') return `฿${(item.Price || 0).toLocaleString()}`;
        if (col.key === 'LicenseQty') return item.LicenseQty || '-';
        if (col.key === 'CreatedAt' || col.key === 'UpdatedAt') return formatDate(item[col.key]);
        if (col.key === 'CreatedBy') return item.CreatedBy || '-';
        return item[col.key] || '-';
    };

    const activeCat = CATEGORIES.find(c => c.key === activeTab);
    if (tvMode) return <MATVView items={items} onBack={() => { if (document.fullscreenElement) document.exitFullscreen?.(); setTvMode(false); }} theme={tvTheme} onToggleTheme={() => setTvTheme(t => t === 'dark' ? 'light' : 'dark')}
        onRefresh={fetchItems} lastFetchedAt={lastFetchedAt} fetchError={fetchError} renderCell={renderCellValue} />;
    return (
        <div className="space-y-6 w-full">
            {/* Header & Stats */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-3xl font-black text-slate-800">MA / LICENSE</h2>
                <p className="text-slate-500 font-medium text-sm">บริหารจัดการสัญญา MA, License, Services และ Rental</p>
            </motion.div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <StatCard icon={CheckCircle} title="ใช้งานอยู่ (Active)" value={loading && items.length === 0 ? '…' : stats.active} color="from-emerald-500 to-emerald-600" onClick={() => setCardFilter(cardFilter === 'active' ? 'all' : 'active')} isActive={cardFilter === 'active'} />
                <StatCard icon={Clock} title={`ใกล้หมดอายุ (≤ ${ALERT_DAYS} วัน)`} value={loading && items.length === 0 ? '…' : stats.expiringSoon} color="from-orange-400 to-orange-500" onClick={() => setCardFilter(cardFilter === 'expiringSoon' ? 'all' : 'expiringSoon')} isActive={cardFilter === 'expiringSoon'} />
                <StatCard icon={AlertTriangle} title="หมดอายุแล้ว" value={loading && items.length === 0 ? '…' : stats.expired} color="from-red-500 to-red-600" onClick={() => setCardFilter(cardFilter === 'expired' ? 'all' : 'expired')} isActive={cardFilter === 'expired'} />
                <StatCard icon={Shield} title="ต้องดำเนินการ" value={loading && items.length === 0 ? '…' : stats.needAction} color="from-rose-500 to-pink-600"
                    subtitle="ใกล้หมด/หมดแล้ว ยังไม่เริ่มต่ออายุ"
                    onClick={() => setCardFilter(cardFilter === 'needAction' ? 'all' : 'needAction')} isActive={cardFilter === 'needAction'} />
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    onClick={() => { setCardFilter(cardFilter === 'inProgress' ? 'all' : 'inProgress'); setRenewalFilter('all'); }}
                    className={`bg-white rounded-2xl p-5 shadow-lg border transition-all cursor-pointer hover:shadow-xl ${cardFilter === 'inProgress' ? 'ring-2 ring-indigo-500 border-transparent scale-[1.02]' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1">กำลังต่ออายุ</p>
                            <h3 className="text-2xl font-black text-slate-900">{loading && items.length === 0 ? '…' : stats.inProgress}</h3>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
                            <RefreshCw className="w-5 h-5 text-white" />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                        {RENEWAL_OPTIONS.map(o => (
                            <button key={o.value} type="button" title={`กรองเฉพาะ "${o.label}"`}
                                onClick={(e) => { e.stopPropagation(); setCardFilter('all'); setRenewalFilter(renewalFilter === o.value ? 'all' : o.value); }}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border transition-all ${o.color} ${renewalFilter === o.value ? 'ring-2 ring-offset-1 ring-violet-400' : 'opacity-90 hover:opacity-100'}`}>
                                {o.short} {stats.renewalByStep?.[o.value] ?? 0}
                            </button>
                        ))}
                    </div>
                </motion.div>
                <StatCard icon={DollarSign} title="มูลค่ารวม" value={loading && items.length === 0 ? '…' : formatBaht(stats.totalValue)} color="from-indigo-500 to-indigo-600" subtitle="มูลค่ารวมสัญญาที่ยังมีผล (Active + Expiring)" />
            </div>

            {/* Header Controls */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                {/* Category Tabs */}
                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 w-full xl:w-auto overflow-x-auto">
                    {CATEGORIES.map(cat => {
                        const CatIcon = cat.icon;
                        return (
                            <button key={cat.key} onClick={() => { setActiveTab(cat.key); setSearchTerm(''); setSortConfig(null); }}
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
                    <select value={renewalFilter} onChange={(e) => setRenewalFilter(e.target.value)} className="h-[36px] bg-slate-50 border border-slate-200 px-2 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer hover:bg-white transition-colors" title="สถานะการต่ออายุ">
                        <option value="all">ต่ออายุ: ทั้งหมด</option>
                        <option value="needAction">⚠️ ใกล้หมด/หมด แต่ยังไม่ดำเนินการ</option>
                        <option value="inProgress">กำลังดำเนินการ (ทุกขั้น)</option>
                        <option value="none">ยังไม่ดำเนินการ</option>
                        {RENEWAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                        <button onClick={() => setFormModal({ isOpen: true, item: null })} className={`h-[36px] flex items-center gap-1.5 px-3 rounded-lg font-bold text-xs text-white bg-gradient-to-r ${activeCat?.color} shadow-sm hover:shadow-md transition-all`}>
                            <Plus size={14} />
                            <span className="hidden sm:inline">เพิ่มรายการ</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Active filter chips */}
            {(() => {
                const CARD_LABELS = { active: 'Active', expiringSoon: 'Expiring', expired: 'Expired', needAction: 'ต้องดำเนินการ', inProgress: 'กำลังต่ออายุ' };
                const RENEWAL_FILTER_LABELS = { needAction: 'ใกล้หมด/หมด ยังไม่ดำเนินการ', inProgress: 'กำลังดำเนินการ', none: 'ยังไม่ดำเนินการ' };
                const chips = [
                    cardFilter !== 'all' && { key: 'card', label: `การ์ด: ${CARD_LABELS[cardFilter] || cardFilter}`, clear: () => setCardFilter('all') },
                    statusFilter !== 'all' && { key: 'status', label: `สถานะ: ${statusFilter}`, clear: () => setStatusFilter('all') },
                    renewalFilter !== 'all' && { key: 'renewal', label: `ต่ออายุ: ${getRenewal(renewalFilter)?.label || RENEWAL_FILTER_LABELS[renewalFilter] || renewalFilter}`, clear: () => setRenewalFilter('all') },
                    searchTerm && { key: 'search', label: `ค้นหา: "${searchTerm}"`, clear: () => setSearchTerm('') },
                ].filter(Boolean);
                if (chips.length === 0) return null;
                return (
                    <div className="flex flex-wrap items-center gap-2 -mt-2">
                        <span className="text-[11px] text-slate-500 font-bold">ตัวกรอง:</span>
                        {chips.map(c => (
                            <span key={c.key} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold">
                                {c.label}
                                <button type="button" onClick={c.clear} className="p-0.5 rounded-full hover:bg-indigo-100" title="ล้างตัวกรองนี้"><X size={11} /></button>
                            </span>
                        ))}
                        {chips.length > 1 && (
                            <button type="button" onClick={() => { setCardFilter('all'); setStatusFilter('all'); setRenewalFilter('all'); setSearchTerm(''); }}
                                className="text-[11px] font-bold text-slate-500 hover:text-red-600 underline underline-offset-2">ล้างทั้งหมด</button>
                        )}
                    </div>
                );
            })()}

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
                                    <th className="px-3 py-3 w-12 text-center bg-slate-50 whitespace-nowrap">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={getColumns(activeTab).length + 2} className="p-10 text-center text-slate-400 text-sm">
                                            {loading && items.length === 0 ? <LoadingText /> : 'ไม่พบรายการ'}
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
                                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                                <button onClick={(e) => { e.stopPropagation(); setDetailItem(item); }} title="ดูรายละเอียด" aria-label="ดูรายละเอียด" className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition-colors">
                                                    <Eye size={14} />
                                                </button>
                                                {isAdmin && (
                                                    <button onClick={(e) => { e.stopPropagation(); setFormModal({ isOpen: true, item }); }} title="แก้ไข" aria-label="แก้ไข" className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition-colors">
                                                        <Edit2 size={14} />
                                                    </button>
                                                )}
                                                {isAdmin && (item.RenewalStatus || needsRenewalAction(item)) && (
                                                    <button onClick={(e) => { e.stopPropagation(); setRenewItem(item); }} title="ต่ออายุเสร็จ" aria-label="ต่ออายุเสร็จ"
                                                        className={`p-1 rounded transition-colors hover:bg-white ${item.RenewalStatus === 'PO_ISSUED' ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600'}`}>
                                                        <CheckCircle size={14} />
                                                    </button>
                                                )}
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
                            {loading && items.length === 0 ? <LoadingText /> : 'ไม่พบรายการ'}
                        </div>
                    ) : paginatedItems.map((item, idx) => (
                        <MAGridCard key={item.ItemID} item={item} idx={idx} isAdmin={isAdmin} renderCell={renderCellValue}
                            onOpen={setDetailItem} onEdit={(it) => setFormModal({ isOpen: true, item: it })} onRenew={setRenewItem} />
                    ))}
                </motion.div>
            )}

            {/* Footer Pagination */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mt-4">
                <div className="px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-3 text-[11px] text-slate-500">
                    <div className="flex items-center gap-3">
                        <span>ทั้งหมด <span className="font-bold text-slate-700">{filteredItems.length}</span> รายการ</span>
                        <span className="hidden sm:inline text-slate-300">|</span>
                        <span className="hidden sm:inline">มูลค่ารวม <span className="font-bold text-slate-700">฿{filteredItems.filter(i => i.Status !== 'Cancelled').reduce((s, i) => s + (i.Price || 0), 0).toLocaleString()}</span> <span className="text-slate-400">(ไม่รวม Cancelled)</span></span>
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
                <MADetailModal
                    item={detailItem}
                    isAdmin={isAdmin}
                    onClose={() => setDetailItem(null)}
                    onEdit={() => { setDetailItem(null); setFormModal({ isOpen: true, item: detailItem }); }}
                    onStatusChange={handleStatusChange}
                    onRenewalChange={handleRenewalChange}
                    onComplete={() => { const it = detailItem; setDetailItem(null); setRenewItem(it); }}
                    onDelete={() => { const it = detailItem; setDetailItem(null); handleDelete(it); }}
                />
            )}

            {/* FORM MODAL */}
            {formModal.isOpen && (
                <FormModal item={formModal.item} category={activeTab === 'ALL' ? 'HARDWARE' : activeTab} vendors={vendors} locations={locations} maTypes={maTypes} onSave={handleSave} onClose={() => setFormModal({ isOpen: false, item: null })} />
            )}

            {renewItem && (
                <RenewModal item={renewItem} onSave={(data) => handleCompleteRenewal(renewItem, data)} onClose={() => setRenewItem(null)} />
            )}

            <AlertModal isOpen={alertModal.isOpen} type={alertModal.type} title={alertModal.title} message={alertModal.message}
                onConfirm={alertModal.onConfirm || (() => setAlertModal(p => ({ ...p, isOpen: false })))} onCancel={alertModal.onCancel} />
        </div>
    );
};

const LoadingText = () => (
    <span className="inline-flex items-center gap-2 text-slate-500">
        <RefreshCw size={14} className="animate-spin" /> กำลังโหลดข้อมูล...
    </span>
);

// ─── DETAIL MODAL (ข้อมูลละเอียด) ─────────
const fadeUp = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } } };
const staggerList = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } };
const fmtDT = (d) => d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const DETAIL_TONES = {
    slate: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600' },
    amber: { bg: 'bg-amber-50/60', border: 'border-amber-100', text: 'text-amber-700' },
    violet: { bg: 'bg-violet-50/60', border: 'border-violet-100', text: 'text-violet-700' },
    blue: { bg: 'bg-blue-50/60', border: 'border-blue-100', text: 'text-blue-700' },
};
const TONE_BTN = {
    plain: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    violetSolid: 'bg-violet-600 text-white border-violet-700 hover:bg-violet-700 shadow-md shadow-violet-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    emeraldSolid: 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 shadow-md shadow-emerald-200',
    red: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100',
};

// ตัวเลขวิ่งขึ้นตอนเปิด modal
const useCountUp = (target, duration = 800) => {
    const [v, setV] = useState(0);
    useEffect(() => {
        const to = Number(target) || 0;
        let raf;
        const t0 = performance.now();
        const tick = (now) => {
            const p = Math.min(1, (now - t0) / duration);
            setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);
    return v;
};

const CopyValue = ({ value }) => {
    const [ok, setOk] = useState(false);
    if (!value || value === '-') return null;
    return (
        <button type="button" title="คัดลอก" aria-label="คัดลอก"
            onClick={async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(String(value));
                    setOk(true);
                    setTimeout(() => setOk(false), 1200);
                } catch { /* clipboard ไม่พร้อมใช้งาน */ }
            }}
            className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0">
            {ok ? <CheckCircle size={11} className="text-emerald-500" /> : <Copy size={11} />}
        </button>
    );
};

const DetailRow = ({ icon: Icon, label, value, copy = false }) => (
    <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-3.5 py-2.5 hover:bg-slate-50/80 transition-colors">
        <span className="sm:w-40 shrink-0 text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <Icon size={13} className="text-indigo-400" />{label}
        </span>
        <span className="text-[13px] font-semibold text-slate-800 break-words min-w-0 flex items-center">
            {value}
            {copy && <CopyValue value={value} />}
        </span>
    </motion.div>
);

const DetailSection = ({ title, icon: Icon, tone, children }) => (
    <motion.section variants={fadeUp} className={`rounded-2xl border ${tone.border} ${tone.bg} overflow-hidden shadow-sm`}>
        <header className={`flex items-center gap-2 px-3.5 py-2 border-b ${tone.border}`}>
            <Icon size={13} className={tone.text} />
            <h4 className={`text-[11px] font-black uppercase tracking-wider ${tone.text}`}>{title}</h4>
        </header>
        <div className="divide-y divide-slate-100">{children}</div>
    </motion.section>
);

// แถบขั้นตอนต่ออายุ: ขอ QT → เปิด PR → รอ PO → ออก PO
const RenewalStepper = ({ value }) => {
    const cur = RENEWAL_OPTIONS.findIndex(o => o.value === value);
    const pct = cur <= 0 ? 0 : (cur / (RENEWAL_OPTIONS.length - 1)) * 100;
    return (
        <div className="px-4 pt-4 pb-3">
            <div className="relative flex justify-between">
                <div className="absolute top-3.5 left-8 right-8 h-1 rounded-full bg-violet-100" />
                <motion.div className="absolute top-3.5 left-8 h-1 rounded-full bg-gradient-to-r from-violet-400 to-teal-500 origin-left"
                    initial={{ width: 0 }} animate={{ width: `calc((100% - 4rem) * ${pct / 100})` }} transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }} />
                {RENEWAL_OPTIONS.map((o, i) => {
                    const done = cur >= i;
                    const active = cur === i;
                    return (
                        <div key={o.value} className="relative z-10 flex flex-col items-center w-16">
                            <motion.div animate={{ scale: active ? 1.15 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black border-2 transition-colors ${done ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-violet-200 text-violet-300'} ${active ? 'ring-4 ring-violet-200' : ''}`}>
                                {done && i < cur ? <CheckCircle size={13} /> : i + 1}
                            </motion.div>
                            <span className={`mt-1.5 text-[10px] font-bold text-center leading-tight ${done ? 'text-violet-700' : 'text-slate-400'}`}>{o.short}</span>
                        </div>
                    );
                })}
            </div>
            {cur < 0 && <p className="text-center text-[11px] text-slate-400 mt-3">ยังไม่เริ่มขั้นตอนต่ออายุ</p>}
        </div>
    );
};

// วงแหวนแสดงวันคงเหลือของ PO (เต็มวง = เหลือมาก, หมดวง = หมดอายุ)
const DueRing = ({ percent, days }) => {
    const R = 32, C = 2 * Math.PI * R;
    const shown = useCountUp(Math.abs(days ?? 0), 900);
    const pct = Math.max(0, Math.min(100, percent ?? 0));
    const label = days == null ? 'ไม่มีกำหนด' : days > 0 ? 'วันเหลือ' : 'เลยกำหนด';
    return (
        <div className="relative w-[84px] h-[84px] shrink-0">
            <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
                <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="8" />
                <motion.circle cx="42" cy="42" r={R} fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={C}
                    initial={{ strokeDashoffset: C }}
                    animate={{ strokeDashoffset: C * (1 - pct / 100) }}
                    transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                <span className="text-xl font-black leading-none tabular-nums">{days == null ? '—' : shown}</span>
                <span className="text-[9px] font-bold opacity-85 mt-1">{label}</span>
            </div>
        </div>
    );
};

const ActionBtn = ({ icon: Icon, tone, onClick, children, className = '', title }) => (
    <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={onClick} title={title}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border transition-colors ${TONE_BTN[tone]} ${className}`}>
        <Icon size={13} />{children}
    </motion.button>
);

const MADetailModal = ({ item, isAdmin, onClose, onEdit, onStatusChange, onRenewalChange, onComplete, onDelete }) => {
    const cat = CATEGORIES.find(c => c.key === item.Category) || CATEGORIES[1];
    const CatIcon = cat.icon;
    const status = getEffectiveStatus(item);
    const daysPO = getDaysRemaining(item.EndDate);
    const daysContract = item.Category === 'RENTAL' ? getDaysRemaining(item.ContractEndDate) : null;
    const elapsed = getElapsedPercent(item.StartDate, item.EndDate);
    const remainingPct = elapsed == null ? 0 : 100 - elapsed;
    const renewal = getRenewal(item.RenewalStatus);
    const nextStep = getNextRenewal(item.RenewalStatus);
    const price = useCountUp(item.Price || 0, 900);
    const [menu, setMenu] = useState(null); // 'status' | 'renewal' | null
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menu) return;
        const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [menu]);

    // ประวัติ เรียงจากล่าสุด
    const events = [
        item.CreatedAt && { key: 'c', label: 'บันทึกรายการ', who: item.CreatedBy, at: item.CreatedAt, dot: 'bg-blue-500' },
        item.RenewalUpdatedAt && { key: 'r', label: 'เปลี่ยนสถานะต่ออายุ', who: item.RenewalUpdatedBy, at: item.RenewalUpdatedAt, dot: 'bg-violet-500' },
        item.LastRenewedAt && { key: 'l', label: 'ต่ออายุล่าสุด', who: item.LastRenewedBy, at: item.LastRenewedAt, dot: 'bg-emerald-500' },
        item.UpdatedAt && { key: 'u', label: 'แก้ไขล่าสุด', who: null, at: item.UpdatedAt, dot: 'bg-amber-500' },
    ].filter(Boolean).sort((a, b) => new Date(b.at) - new Date(a.at));

    return (
        <Portal>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
                onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
                <motion.div role="dialog" aria-modal="true" aria-label={item.ItemName}
                    initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                    className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">

                    {/* HERO */}
                    <div className={`relative bg-gradient-to-br ${cat.color} text-white px-5 pt-5 pb-5 overflow-hidden shrink-0`}>
                        <div className="absolute -top-16 -right-12 w-56 h-56 rounded-full bg-white/10 blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-20 -left-10 w-48 h-48 rounded-full bg-black/10 blur-3xl pointer-events-none" />
                        <button type="button" onClick={onClose} aria-label="ปิด"
                            className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/15 hover:bg-white/30 transition-colors">
                            <X size={16} />
                        </button>
                        <div className="relative flex gap-3.5 pr-8">
                            <motion.div initial={{ rotate: -14, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }}
                                transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                                className="w-12 h-12 rounded-2xl bg-white/20 ring-1 ring-white/30 flex items-center justify-center shrink-0">
                                <CatIcon size={22} />
                            </motion.div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/75">{cat.label}</p>
                                <h3 className="font-black text-xl leading-tight tracking-tight break-words">{item.ItemName}</h3>
                                {item.SubType && <p className="text-white/80 text-xs mt-0.5">{item.SubType}</p>}
                                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[status]}`}>{status}</span>
                                    {renewal && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-violet-700 border border-white">
                                            <RefreshCw size={10} />{renewal.label}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="relative mt-5 flex items-center gap-4">
                            <DueRing percent={remainingPct} days={daysPO} />
                            <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
                                <div className="rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25 px-3 py-2.5 min-w-0">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">ราคา</p>
                                    <p className="text-base font-black tabular-nums truncate">฿{price.toLocaleString()}</p>
                                </div>
                                <div className="rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25 px-3 py-2.5 min-w-0">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">{daysContract != null ? 'สัญญาหลัก' : 'ระยะ PO'}</p>
                                    <p className="text-sm font-black truncate">
                                        {daysContract != null
                                            ? (daysContract > 0 ? `เหลือ ${daysContract} วัน` : 'หมดแล้ว')
                                            : formatDuration(item.StartDate, item.EndDate)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* BODY */}
                    <motion.div variants={staggerList} initial="hidden" animate="show"
                        className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/70">
                        <DetailSection title="ข้อมูลรายการ" icon={Tag} tone={DETAIL_TONES.slate}>
                            {item.Brand && <DetailRow icon={Tag} label="ยี่ห้อ/รุ่น" value={item.Brand} />}
                            {item.SerialNumber && <DetailRow icon={Hash} label="Serial Number" value={item.SerialNumber} copy />}
                            {item.ServiceNumber && <DetailRow icon={FileText} label="เลขบริการ/สัญญา" value={item.ServiceNumber} copy />}
                            {item.LicenseQty > 0 && <DetailRow icon={Hash} label="จำนวน License" value={item.LicenseQty} />}
                            <DetailRow icon={Building} label="Vendor" value={item.VendorName || '-'} />
                            <DetailRow icon={MapPin} label="สถานที่" value={item.LocationName || '-'} />
                        </DetailSection>

                        <DetailSection title="สัญญา & PO" icon={CreditCard} tone={DETAIL_TONES.amber}>
                            {item.PONumber && <DetailRow icon={CreditCard} label="PO / เลขสัญญา" value={item.PONumber} copy />}
                            <DetailRow icon={Calendar} label="เริ่มต้น" value={formatDate(item.StartDate)} />
                            <DetailRow icon={Calendar} label="PO หมด" value={formatDate(item.EndDate)} />
                            <DetailRow icon={Clock} label="ระยะ PO" value={formatDuration(item.StartDate, item.EndDate)} />
                            {item.Category === 'RENTAL' && item.ContractEndDate && (
                                <>
                                    <DetailRow icon={Calendar} label="สัญญาหลักหมด" value={formatDate(item.ContractEndDate)} />
                                    <DetailRow icon={Clock} label="ระยะสัญญาหลัก" value={formatDuration(item.StartDate, item.ContractEndDate)} />
                                    {item.POCycle && <DetailRow icon={RefreshCw} label="รอบ PO" value={PO_CYCLE_OPTIONS.find(o => o.value === item.POCycle)?.label || item.POCycle} />}
                                </>
                            )}
                        </DetailSection>

                        <DetailSection title="ต่ออายุ" icon={RefreshCw} tone={DETAIL_TONES.violet}>
                            <RenewalStepper value={item.RenewalStatus} />
                            <DetailRow icon={FileText} label="เลขที่ PR" value={item.PRNumber || '-'} copy />
                            <DetailRow icon={CreditCard} label="เลขที่ PO ใหม่" value={item.NewPONumber || '-'} copy />
                        </DetailSection>

                        <DetailSection title="ประวัติ" icon={Clock} tone={DETAIL_TONES.blue}>
                            {events.length === 0 && <p className="px-4 py-3 text-xs text-slate-400">ยังไม่มีประวัติ</p>}
                            <div className="relative px-4 py-3 space-y-3">
                                {events.length > 1 && <span className="absolute left-[23px] top-5 bottom-5 w-px bg-blue-200" />}
                                {events.map(ev => (
                                    <motion.div key={ev.key} variants={fadeUp} className="relative pl-7">
                                        <span className={`absolute left-0 top-1 w-3 h-3 rounded-full ring-4 ring-white ${ev.dot}`} />
                                        <p className="text-xs font-bold text-slate-800">{ev.label}</p>
                                        <p className="text-[11px] text-slate-500">{ev.who ? `${ev.who} · ` : ''}{fmtDT(ev.at)}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </DetailSection>

                        {item.Remark && (
                            <motion.blockquote variants={fadeUp} className="rounded-2xl bg-white border border-slate-200 border-l-4 border-l-amber-400 px-4 py-3 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 mb-1">หมายเหตุ</p>
                                <p className="text-sm text-slate-700 whitespace-pre-line">{item.Remark}</p>
                            </motion.blockquote>
                        )}
                    </motion.div>

                    {/* ACTIONS */}
                    {isAdmin && (
                        <div ref={menuRef} className="p-3 bg-white border-t border-slate-100 flex flex-wrap items-center gap-2 shrink-0">
                            <ActionBtn icon={Edit2} tone="indigo" onClick={onEdit}>แก้ไข</ActionBtn>

                            <div className="relative">
                                <ActionBtn icon={RefreshCw} tone="amber" onClick={() => setMenu(m => m === 'status' ? null : 'status')}>
                                    เปลี่ยนสถานะ <ChevronDown size={12} className={`transition-transform ${menu === 'status' ? 'rotate-180' : ''}`} />
                                </ActionBtn>
                                <AnimatePresence>
                                    {menu === 'status' && (
                                        <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}
                                            className="absolute bottom-full left-0 mb-2 min-w-[140px] bg-white rounded-xl shadow-xl border border-slate-200 p-1 z-20">
                                            {MANUAL_STATUS_OPTIONS.filter(s => s !== toManualStatus(item.Status)).map(s => (
                                                <button key={s} type="button" onClick={() => { setMenu(null); onStatusChange(item, s); }}
                                                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg">{s}</button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="relative">
                                <ActionBtn icon={FileText} tone="plain" onClick={() => setMenu(m => m === 'renewal' ? null : 'renewal')}>
                                    สถานะต่ออายุ <ChevronDown size={12} className={`transition-transform ${menu === 'renewal' ? 'rotate-180' : ''}`} />
                                </ActionBtn>
                                <AnimatePresence>
                                    {menu === 'renewal' && (
                                        <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}
                                            className="absolute bottom-full left-0 mb-2 min-w-[160px] bg-white rounded-xl shadow-xl border border-slate-200 p-1 z-20">
                                            {[{ value: '', label: 'ยังไม่ดำเนินการ' }, ...RENEWAL_OPTIONS]
                                                .filter(o => o.value !== (item.RenewalStatus || ''))
                                                .map(o => (
                                                    <button key={o.value || 'none'} type="button" onClick={() => { setMenu(null); onRenewalChange(item, o.value); }}
                                                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg">{o.label}</button>
                                                ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {nextStep && (
                                <ActionBtn icon={ChevronRight} tone="violetSolid" title="เลื่อนไปขั้นถัดไป" onClick={() => onRenewalChange(item, nextStep.value)}>
                                    {nextStep.label}
                                </ActionBtn>
                            )}
                            <ActionBtn icon={CheckCircle} tone={renewal?.value === 'PO_ISSUED' ? 'emeraldSolid' : 'emerald'} onClick={onComplete}>
                                ต่ออายุเสร็จ
                            </ActionBtn>
                            <ActionBtn icon={Trash2} tone="red" className="ml-auto" onClick={onDelete}>ลบ</ActionBtn>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </Portal>
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
// ─── RENEW MODAL: "ต่ออายุเสร็จ" ─────────
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const RenewModal = ({ item, onSave, onClose }) => {
    const isRental = item.Category === 'RENTAL';
    // ค่าเริ่มต้น: เริ่มวันถัดจากวันหมดเดิม (หรือวันนี้), หมดตามรอบ PO (รายเดือน = 1 เดือน, อื่นๆ = 1 ปี)
    const defaultStart = item.EndDate ? addDays(item.EndDate, 1) : new Date();
    const defaultEnd = (() => {
        const e = new Date(defaultStart);
        if (isRental && item.POCycle === 'monthly') e.setMonth(e.getMonth() + 1); else e.setFullYear(e.getFullYear() + 1);
        return addDays(e, -1);
    })();
    const [form, setForm] = useState({
        StartDate: toDateInput(defaultStart),
        EndDate: toDateInput(defaultEnd),
        PONumber: item.NewPONumber || '',
        Price: item.Price || 0,
    });
    const [error, setError] = useState('');
    const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError(''); };

    const submit = (e) => {
        e?.preventDefault();
        if (!form.EndDate) return setError('กรุณาระบุวันหมดอายุใหม่');
        if (form.StartDate && form.StartDate > form.EndDate) return setError('วันเริ่มต้องไม่เกินวันหมดอายุ');
        onSave(form);
    };

    const inputCls = 'w-full p-2 border border-emerald-200 bg-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-100';
    return (
        <Portal>
            <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex justify-between items-start">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">ต่ออายุเสร็จ</p>
                            <h3 className="font-black text-lg">{item.ItemName}</h3>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full transition-colors"><X size={18} /></button>
                    </div>
                    <form onSubmit={submit} className="p-4 space-y-3">
                        <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-0.5">
                            <div>รอบเดิม: {formatDate(item.StartDate)} – {formatDate(item.EndDate)}</div>
                            <div>PO เดิม: {item.PONumber || '-'}{item.PRNumber ? ` · PR: ${item.PRNumber}` : ''}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label={isRental ? 'PO ใหม่เริ่ม' : 'วันที่เริ่ม (ใหม่)'}>
                                <input type="date" value={form.StartDate} onChange={(e) => set('StartDate', e.target.value)} className={inputCls} />
                            </FormField>
                            <FormField label={isRental ? 'PO ใหม่หมด' : 'วันหมดอายุ (ใหม่)'} required>
                                <input type="date" value={form.EndDate} onChange={(e) => set('EndDate', e.target.value)} className={inputCls} />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="PO / เลขสัญญา (ใหม่)">
                                <input type="text" value={form.PONumber} onChange={(e) => set('PONumber', e.target.value)} className={inputCls} placeholder={item.PONumber ? `เว้นว่าง = ใช้ ${item.PONumber}` : 'PO Number'} />
                            </FormField>
                            <FormField label="ราคา (฿)">
                                <input type="number" min="0" step="0.01" value={form.Price} onChange={(e) => set('Price', parseFloat(e.target.value) || 0)} className={inputCls} />
                            </FormField>
                        </div>
                        {form.StartDate && form.EndDate && form.StartDate <= form.EndDate && (
                            <div className="text-[11px] text-emerald-700 font-medium bg-emerald-50 rounded-lg px-3 py-2 flex justify-between">
                                <span>ระยะรอบใหม่:</span><span className="font-black">{formatDuration(form.StartDate, form.EndDate)}</span>
                            </div>
                        )}
                        <p className="text-[10px] text-slate-500">เมื่อบันทึก: สถานะ → Active, ล้างสถานะต่ออายุ / เลข PR / เลข PO ใหม่ และบันทึกชื่อผู้ต่ออายุ{isRental ? ' (วันสิ้นสุดสัญญาหลักไม่เปลี่ยน — แก้ผ่านปุ่มแก้ไขถ้าต่อสัญญาหลักด้วย)' : ''}</p>
                        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}
                        <div className="flex justify-end gap-2 pt-1">
                            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">ยกเลิก</button>
                            <button type="submit" className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow-sm hover:shadow-md flex items-center gap-1">
                                <CheckCircle size={14} /> บันทึกการต่ออายุ
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </Portal>
    );
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
        Status: toManualStatus(item?.Status),
        RenewalStatus: item?.RenewalStatus || '',
        PRNumber: item?.PRNumber || '',
        NewPONumber: item?.NewPONumber || '',
        Remark: item?.Remark || '',
        CreatedBy: item?.CreatedBy || user?.username || '',
        CreatedAt: item?.CreatedAt || '',
        UpdatedAt: item?.UpdatedAt || '',
        ...(isEdit ? { ItemID: item.ItemID } : {}),
    });
    const [errors, setErrors] = useState({});
    // ส่วนการต่ออายุ: เปิดอัตโนมัติถ้ามีข้อมูลอยู่แล้ว ไม่งั้นพับไว้ให้ฟอร์มสั้นลง
    const [showRenewal, setShowRenewal] = useState(!!(item?.RenewalStatus || item?.PRNumber || item?.NewPONumber));

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
                                    {MANUAL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <p className="text-[10px] text-slate-400 mt-0.5">Expiring / Expired คำนวณจากวันหมดอายุอัตโนมัติ</p>
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

                        {/* ── สถานะการต่ออายุ / จัดซื้อ ── */}
                        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-3">
                            <button type="button" onClick={() => setShowRenewal(v => !v)} aria-expanded={showRenewal}
                                className="w-full flex items-center justify-between text-[10px] font-black text-violet-700 uppercase tracking-wider">
                                <span className="flex items-center gap-1"><RefreshCw size={11} /> การต่ออายุ / จัดซื้อ</span>
                                <span className="flex items-center gap-1 normal-case font-bold">
                                    {!showRenewal && (getRenewal(form.RenewalStatus)?.label || 'ยังไม่ดำเนินการ')}
                                    <ChevronDown size={12} className={`transition-transform ${showRenewal ? 'rotate-180' : ''}`} />
                                </span>
                            </button>
                            {showRenewal && (<>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <FormField label="สถานะต่ออายุ">
                                    <select value={form.RenewalStatus} onChange={(e) => handleChange('RenewalStatus', e.target.value)} className="w-full p-2 border border-violet-200 bg-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-100">
                                        <option value="">ยังไม่ดำเนินการ</option>
                                        {RENEWAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </FormField>
                                <FormField label="เลขที่ PR">
                                    <input type="text" value={form.PRNumber} onChange={(e) => handleChange('PRNumber', e.target.value)} className="w-full p-2 border border-violet-200 bg-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-100" placeholder="PR Number" />
                                </FormField>
                                <FormField label="เลขที่ PO ใหม่">
                                    <input type="text" value={form.NewPONumber} onChange={(e) => handleChange('NewPONumber', e.target.value)} className="w-full p-2 border border-violet-200 bg-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-100" placeholder="New PO Number" />
                                </FormField>
                            </div>
                            <p className="text-[10px] text-violet-600">ต่ออายุเสร็จแล้ว ใช้ปุ่ม "ต่ออายุเสร็จ" ในหน้ารายละเอียด — ระบบจะอัปเดตวันที่ / PO และล้างส่วนนี้ให้</p>
                            </>)}
                        </div>

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