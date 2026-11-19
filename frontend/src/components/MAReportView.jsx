import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Download, RefreshCw, Sparkles, AlertTriangle, Wallet, Boxes, Clock,
    ChevronDown, CheckCircle, ArrowUpRight, ArrowDownRight, ShieldAlert, CircleDollarSign, Gauge,
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell,
    ComposedChart, Line, Legend,
} from 'recharts';
import * as XLSX from 'xlsx';
import { API_BASE } from '../config/api';

// ─── constants ──────────────────────────────────────────
const CAT = {
    HARDWARE: { label: 'Hardware', color: '#3b82f6', soft: 'bg-blue-500' },
    SOFTWARE: { label: 'Software', color: '#8b5cf6', soft: 'bg-violet-500' },
    SERVICE: { label: 'Service', color: '#10b981', soft: 'bg-emerald-500' },
    RENTAL: { label: 'Rental', color: '#f59e0b', soft: 'bg-amber-500' },
};
const STATUS = {
    Active: { label: 'Active', color: '#10b981' },
    Expiring: { label: 'ใกล้หมด', color: '#f97316' },
    Expired: { label: 'หมดแล้ว', color: '#ef4444' },
    Pending: { label: 'Pending', color: '#eab308' },
    Cancelled: { label: 'ยกเลิก', color: '#94a3b8' },
};
const FUNNEL = [
    { key: 'QUOTATION', label: 'ขอ QT' },
    { key: 'PR_CREATED', label: 'เปิด PR' },
    { key: 'WAITING_PO', label: 'รอ PO' },
    { key: 'PO_ISSUED', label: 'PO ออกแล้ว' },
];
const QUALITY = [
    { key: 'noEndDate', label: 'ไม่มีวันหมดอายุ', icon: Clock },
    { key: 'noPrice', label: 'ไม่มีราคา', icon: CircleDollarSign },
    { key: 'noVendor', label: 'ไม่มี Vendor', icon: Boxes },
    { key: 'hwNoSerial', label: 'Hardware ไม่มี S/N', icon: ShieldAlert },
];
const RANGES = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'thisYear', label: 'ปีนี้' },
    { id: 'last12', label: '12 เดือน' },
];

// ─── helpers ────────────────────────────────────────────
const baht = (v) => `฿${Math.round(Number(v) || 0).toLocaleString()}`;
const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${Math.round(v)}`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-');
const fmtDT = (d) => (d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const num = (v) => Number(v) || 0;
const rangeParams = (id) => {
    const now = new Date();
    if (id === 'thisYear') return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: new Date(now.getFullYear() + 1, 0, 1).toISOString() };
    if (id === 'last12') return { from: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString(), to: new Date(now.getFullYear() + 1, 0, 1).toISOString() };
    return {};
};

const fade = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };

// ตัวเลขที่ค่อยๆ นับขึ้น
const CountUp = ({ value, format = (v) => Math.round(v).toLocaleString() }) => {
    const [shown, setShown] = useState(0);
    useEffect(() => {
        let raf; const start = performance.now(); const from = 0; const dur = 900;
        const tick = (t) => {
            const p = Math.min(1, (t - start) / dur);
            setShown(from + (value - from) * (1 - Math.pow(1 - p, 3)));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [value]);
    return <>{format(shown)}</>;
};

// วงแหวนแสดงสัดส่วน
const Ring = ({ pct, color, size = 44, stroke = 5 }) => {
    const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
    return (
        <svg width={size} height={size} className="-rotate-90 shrink-0">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
            <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, pct) / 100) }} transition={{ duration: 1, ease: 'easeOut' }} />
        </svg>
    );
};

const Glass = ({ children, className = '', id }) => (
    <motion.section id={id} initial="hidden" animate="show" variants={fade} className={`scroll-mt-20 rounded-2xl bg-white border border-slate-200 shadow-sm ${className}`}>
        {children}
    </motion.section>
);
const CardTitle = ({ icon: Icon, title, hint, right }) => (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Icon size={15} /></span>
            <div className="min-w-0">
                <h3 className="text-sm font-black text-slate-800 truncate">{title}</h3>
                {hint && <p className="text-[11px] text-slate-500 truncate">{hint}</p>}
            </div>
        </div>
        {right}
    </div>
);

const TooltipBox = ({ active, payload, label, fmt = baht }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl bg-slate-900 text-white px-3 py-2 shadow-xl text-xs">
            <p className="font-bold mb-1 opacity-80">{label}</p>
            {payload.filter(p => p.value > 0).map(p => (
                <p key={p.dataKey} className="flex justify-between gap-4"><span style={{ color: p.color || p.fill }}>● {p.name}</span><span className="font-bold tabular-nums">{fmt(p.value)}</span></p>
            ))}
        </div>
    );
};

// ─── main ───────────────────────────────────────────────
export default function MAReportView({ onBack }) {
    const [range, setRange] = useState('all');
    const [months, setMonths] = useState(12);
    const [growthInput, setGrowthInput] = useState('0');
    // งบประมาณต่อปี: จำไว้ในเบราว์เซอร์นี้ (ไม่ส่งให้ server)
    const [budget, setBudget] = useState(() => { try { return localStorage.getItem('maReportBudget') || ''; } catch { return ''; } });
    useEffect(() => { try { localStorage.setItem('maReportBudget', budget); } catch { /* ignore */ } }, [budget]);
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [openMonth, setOpenMonth] = useState(null);
    const [openQuality, setOpenQuality] = useState(null);
    const growth = Math.max(0, parseFloat(growthInput) || 0);

    const load = async () => {
        setLoading(true); setErr('');
        try {
            const p = new URLSearchParams({ months: String(months), growth: String(growth), ...rangeParams(range) });
            const res = await fetch(`${API_BASE}/ma/report?${p.toString()}`);
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'โหลดรายงานไม่สำเร็จ');
            setData(await res.json());
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range, months, growth]);

    const fc = data?.forecast;
    const forecastBars = useMemo(() => (fc?.buckets || []).map(b => ({ name: b.label, ...Object.fromEntries(Object.keys(CAT).map(k => [k, b.cats?.[k] || 0])), total: b.total, count: b.count })), [fc]);
    const cumulative = useMemo(() => { let s = 0; return (fc?.buckets || []).map(b => { s += b.total; return { name: b.label, cum: Math.round(s) }; }); }, [fc]);
    const peak = useMemo(() => (fc?.buckets || []).reduce((a, b) => (b.total > (a?.total || 0) ? b : a), null), [fc]);
    const maxMonth = Math.max(1, ...(fc?.buckets || []).map(b => b.total));
    // เดือนที่สูงผิดปกติ = มากกว่า 2 เท่าของค่าเฉลี่ยเดือนที่มีการจ่าย
    const activeMonths = (fc?.buckets || []).filter(b => b.total > 0);
    const avgMonth = activeMonths.length ? activeMonths.reduce((s, b) => s + b.total, 0) / activeMonths.length : 0;
    const anomalyKeys = new Set(activeMonths.filter(b => avgMonth && b.total > avgMonth * 2).map(b => b.key));
    // งบและการเปรียบเทียบ
    const budgetNum = parseFloat(budget) || 0;
    const budgetPeriod = budgetNum * (fc?.months || 12) / 12;
    const forecastTotal = fc?.total || 0;
    const budgetPct = budgetPeriod ? (forecastTotal / budgetPeriod) * 100 : 0;
    const forecastPer12 = fc ? forecastTotal * 12 / fc.months : 0;
    const actual = data?.actualLast12;
    const changePct = actual?.total ? ((forecastPer12 - actual.total) / actual.total) * 100 : 0;
    const catDonut = useMemo(() => (data?.byCategory || []).map(c => ({ name: CAT[c.key]?.label || c.key, value: c.value, count: c.count, color: CAT[c.key]?.color || '#64748b' })), [data]);
    const catTotal = catDonut.reduce((s, c) => s + c.value, 0);
    const statusTotal = Math.max(1, (data?.byStatus || []).reduce((s, x) => s + x.count, 0));
    const funnelMax = Math.max(1, ...(data?.funnel || []).map(f => f.count));

    const exportExcel = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fc.buckets.map(b => ({ 'เดือน': b.label, 'ค่าใช้จ่ายคาดการณ์ (฿)': b.total, 'จำนวนรายการ': b.count, 'Hardware': b.cats?.HARDWARE || 0, 'Software': b.cats?.SOFTWARE || 0, 'Service': b.cats?.SERVICE || 0, 'Rental': b.cats?.RENTAL || 0 }))), 'พยากรณ์รายเดือน');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fc.buckets.flatMap(b => b.items.map(i => ({ 'เดือน': b.label, 'รายการ': i.ItemName, 'หมวด': CAT[i.Category]?.label || i.Category, 'วันที่ต่อ': fmtDate(i.date), 'ค่าใช้จ่าย (฿)': i.amount })))), 'พยากรณ์รายการ');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.expiring.map(e => ({ 'รายการ': e.ItemName, 'หมวด': CAT[e.Category]?.label || e.Category, 'Vendor': e.VendorName || '-', 'วันหมดอายุ': fmtDate(e.EndDate), 'คงเหลือ (วัน)': e.daysLeft, 'ราคา (฿)': e.Price, 'ขั้นต่ออายุ': FUNNEL.find(f => f.key === e.RenewalStatus)?.label || 'ยังไม่ดำเนินการ' }))), 'ใกล้หมดอายุ');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.renewals.map(r => ({ 'รายการ': r.ItemName, 'หมวด': CAT[r.Category]?.label || r.Category, 'วันหมดอายุเดิม': fmtDate(r.OldEndDate), 'วันหมดอายุใหม่': fmtDate(r.NewEndDate), 'ราคาเดิม (฿)': r.OldPrice, 'ราคาใหม่ (฿)': r.NewPrice, 'PO เดิม': r.OldPONumber || '-', 'PO ใหม่': r.NewPONumber || '-', 'PR': r.PRNumber || '-', 'ผู้ต่ออายุ': r.CompletedBy || '-', 'เวลา': fmtDT(r.CompletedAt), 'ไฟล์แนบ': r.files, 'IP (ตอนบันทึก)': r.ClientIP || '-' }))), 'ประวัติต่ออายุ');
        XLSX.writeFile(wb, `MA_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div className="w-full">
            {/* ── HERO ── */}
            <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-5 w-full">
                <motion.div variants={fade} className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <button onClick={onBack} className="h-9 px-3 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold flex items-center gap-1.5"><ArrowLeft size={15} /> กลับ</button>
                        <div className="mr-auto min-w-0">
                            <h2 className="text-2xl sm:text-3xl font-black text-slate-800">MA / LICENSE REPORT</h2>
                            <p className="text-sm text-slate-400 font-medium">รายงานค่าใช้จ่ายสัญญา{data ? ` · ข้อมูล ณ ${fmtDT(data.generatedAt)}` : ''}</p>
                        </div>
                        <div className="flex p-1 rounded-xl bg-slate-100">
                            {RANGES.map(r => (
                                <button key={r.id} onClick={() => setRange(r.id)}
                                    className={`px-3 h-8 rounded-lg text-xs font-bold transition ${range === r.id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                            ))}
                        </div>
                        <button onClick={load} className="h-9 w-9 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center" title="รีเฟรช">
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={exportExcel} disabled={!data} className="h-9 px-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-xs font-bold flex items-center gap-1.5">
                            <Download size={14} /> Excel
                        </button>
                    </div>
                    {data && fc && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 items-center">
                            <div className="sm:col-span-2">
                                <p className="text-xs font-bold text-slate-500">คาดการณ์ค่าใช้จ่าย {fc.months} เดือนข้างหน้า</p>
                                <p className="text-4xl font-black tabular-nums text-slate-800 mt-1"><CountUp value={fc.total} format={(v) => baht(v)} /></p>
                                <p className="text-xs text-slate-500 mt-2">
                                    {peak && peak.total > 0 && <>เดือนที่จ่ายสูงสุด <b className="text-slate-700">{peak.label}</b> ({baht(peak.total)}) · </>}
                                    {fc.growth ? `ปรับราคาขึ้นปีละ ${(fc.growth * 100).toFixed(1)}%` : 'ไม่ปรับราคา'}
                                </p>
                            </div>
                            <div className="flex sm:flex-col gap-2 sm:items-end">
                                <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">{data.kpi.total - data.kpi.cancelled} รายการที่ใช้งาน (ไม่รวมยกเลิก)</span>
                                <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">มูลค่าปัจจุบัน {baht(data.kpi.totalValue)}</span>
                            </div>
                        </div>
                    )}
                </motion.div>

                {err && <p className="text-sm text-red-600 font-bold">{err}</p>}
                {!data && !err && <p className="text-sm text-slate-400">กำลังโหลดรายงาน...</p>}

                {data && (<>
                    {/* ── KPI ── */}
                    <motion.div initial="hidden" animate="show" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'ใกล้หมดอายุ ≤ 60 วัน', value: data.kpi.expiring, icon: Clock, grad: 'from-orange-400 to-rose-500', sub: `หมดแล้ว ${data.kpi.expired} รายการ` },
                            { label: 'กำลังต่ออายุ', value: data.kpi.inRenewal, icon: RefreshCw, grad: 'from-violet-500 to-indigo-600', sub: `ต่ออายุเสร็จในช่วงนี้ ${data.kpi.renewedInRange}` },
                            { label: 'Active', value: data.kpi.active, icon: CheckCircle, grad: 'from-emerald-400 to-teal-600', sub: `ยกเลิก ${data.kpi.cancelled} · Pending ${data.kpi.pending}` },
                            { label: 'ค่าต่ออายุรวม (ช่วงนี้)', value: baht(data.kpi.renewalSpendInRange), icon: Wallet, grad: 'from-sky-500 to-blue-700', sub: `เปลี่ยนแปลงราคา ${data.kpi.renewalChangeInRange >= 0 ? '+' : ''}${baht(data.kpi.renewalChangeInRange)}` },
                        ].map((k) => (
                            <motion.div key={k.label} variants={fade} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${k.grad} text-white`}><k.icon size={18} /></div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-slate-500">{k.label}</p>
                                    <p className="text-2xl font-black tabular-nums text-slate-800 leading-tight">{typeof k.value === 'number' ? <CountUp value={k.value} /> : k.value}</p>
                                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{k.sub}</p>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>

                    {/* ── SECTION NAV (ติดด้านบนขณะเลื่อน) ── */}
                    <motion.nav initial="hidden" animate="show" variants={fade} className="sticky top-2 z-20 flex gap-1 overflow-x-auto p-1.5 rounded-xl bg-white border border-slate-200 shadow-sm">
                        {[
                            { id: 'sec-forecast', label: '🔮 พยากรณ์' },
                            { id: 'sec-overview', label: '📊 ภาพรวม' },
                            { id: 'sec-expiring', label: '⏰ ใกล้หมดอายุ' },
                            { id: 'sec-renewals', label: '🔁 ประวัติต่ออายุ' },
                            { id: 'sec-quality', label: '🧹 คุณภาพข้อมูล' },
                        ].map(n => (
                            <button key={n.id} type="button" onClick={() => document.getElementById(n.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                className="shrink-0 px-3 h-8 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">{n.label}</button>
                        ))}
                    </motion.nav>

                    {/* ── FORECAST ── */}
                    <Glass id="sec-forecast" className="p-1">
                        <CardTitle icon={Sparkles} title="พยากรณ์ค่าใช้จ่ายรายเดือน" hint="แยกตามหมวด · กดแถบเดือนเพื่อดูรายการ"
                            right={
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <div className="flex p-1 rounded-xl bg-slate-100">
                                        {[6, 12, 24, 36].map(m => (
                                            <button key={m} onClick={() => setMonths(m)} className={`px-2.5 h-7 rounded-lg font-bold transition-all ${months === m ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>{m} ด.</button>
                                        ))}
                                    </div>
                                    <label className="flex items-center gap-1 font-bold text-slate-500">
                                        ขึ้นราคา
                                        <input type="number" min="0" step="0.5" value={growthInput} onChange={(e) => setGrowthInput(e.target.value)} className="w-14 h-7 px-2 rounded-lg border border-slate-200 bg-white" />
                                        %/ปี
                                    </label>
                                </div>
                            } />
                        {fc && (
                            <div className="mx-5 mt-4 grid md:grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-slate-50 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                        <p className="text-xs font-bold text-slate-600">เทียบกับงบประมาณ {fc.months} เดือน</p>
                                        <label className="flex items-center gap-1 text-xs text-slate-500">
                                            งบต่อปี ฿
                                            <input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="เช่น 5000000"
                                                className="w-32 h-7 px-2 rounded-lg border border-slate-200 bg-white text-xs" />
                                        </label>
                                    </div>
                                    {budgetNum > 0 ? (<>
                                        <div className="h-3 rounded-full bg-white border border-slate-200 overflow-hidden">
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, budgetPct)}%` }} transition={{ duration: 0.8 }}
                                                className={`h-full rounded-full ${budgetPct > 100 ? 'bg-gradient-to-r from-rose-500 to-red-600' : budgetPct > 80 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500'}`} />
                                        </div>
                                        <p className={`text-xs mt-2 font-bold ${budgetPct > 100 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                            ใช้ไป {budgetPct.toFixed(0)}% ของงบ · {budgetPct > 100 ? `เกินงบ ${baht(forecastTotal - budgetPeriod)}` : `เหลือ ${baht(budgetPeriod - forecastTotal)}`}
                                        </p>
                                    </>) : <p className="text-xs text-slate-400">ใส่งบประมาณต่อปีเพื่อดูว่าค่าใช้จ่ายคาดการณ์อยู่ในกรอบหรือไม่</p>}
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                    <p className="text-xs font-bold text-slate-600 mb-2">เทียบกับค่าที่จ่ายจริง 12 เดือนที่ผ่านมา</p>
                                    {actual && actual.count > 0 ? (<>
                                        <div className="flex items-end gap-3">
                                            <div><p className="text-[11px] text-slate-500">จ่ายจริง ({actual.count} รอบ)</p><p className="text-lg font-black tabular-nums">{baht(actual.total)}</p></div>
                                            <span className="text-slate-300 pb-1">→</span>
                                            <div><p className="text-[11px] text-slate-500">คาดการณ์ 12 เดือน</p><p className="text-lg font-black tabular-nums">{baht(forecastPer12)}</p></div>
                                        </div>
                                        <p className={`text-xs mt-2 font-bold ${changePct > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                            {changePct > 0 ? '▲' : '▼'} {Math.abs(changePct).toFixed(0)}% เทียบกับที่จ่ายจริง
                                        </p>
                                    </>) : <p className="text-xs text-slate-400">ยังไม่มีรอบต่ออายุในช่วง 12 เดือนที่ผ่านมาในระบบ ระบบจะเทียบให้เมื่อมีประวัติการต่ออายุ</p>}
                                </div>
                            </div>
                        )}
                        <div className="px-3 pt-4 h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={forecastBars} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={compact} />
                                    <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                                    {Object.entries(CAT).map(([k, c], i, arr) => (
                                        <Bar key={k} yAxisId="l" dataKey={k} name={c.label} stackId="a" fill={c.color}
                                            radius={i === arr.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]} maxBarSize={38} />
                                    ))}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        {/* heat tiles */}
                        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2 px-5 pt-2 pb-4">
                            {(fc?.buckets || []).map(b => {
                                const heat = b.total / maxMonth;
                                const open = openMonth === b.key;
                                return (
                                    <button key={b.key} onClick={() => setOpenMonth(open ? null : b.key)}
                                        className={`relative overflow-hidden rounded-2xl px-2 py-2.5 text-left transition-all border ${open ? 'border-indigo-400 ring-2 ring-indigo-100 bg-white' : anomalyKeys.has(b.key) ? 'border-rose-300 bg-rose-50' : 'border-slate-100 hover:border-slate-300 bg-white'}`}>
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-emerald-400/30 to-transparent pointer-events-none" style={{ height: `${Math.max(4, heat * 100)}%` }} />
                                        <p className="relative text-[11px] font-bold text-slate-500">{b.label}</p>
                                        <p className="relative text-sm font-black tabular-nums text-slate-800">{compact(b.total)}</p>
                                        <p className="relative text-[10px] text-slate-400">{b.count} รายการ</p>
                                        {anomalyKeys.has(b.key) && <p className="relative text-[10px] font-black text-rose-600 mt-0.5">⚠ สูงผิดปกติ</p>}
                                    </button>
                                );
                            })}
                        </div>
                        <AnimatePresence initial={false}>
                            {openMonth && (() => {
                                const b = fc.buckets.find(x => x.key === openMonth);
                                if (!b) return null;
                                return (
                                    <motion.div key={openMonth} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                        <div className="mx-5 mb-5 rounded-2xl bg-slate-50 p-4">
                                            <p className="text-xs font-black text-slate-700 mb-2">{b.label} · {baht(b.total)}</p>
                                            {b.items.length === 0 && <p className="text-xs text-slate-400">ไม่มีรายการต่ออายุในเดือนนี้</p>}
                                            <ul className="space-y-1.5">
                                                {b.items.map((i, idx) => (
                                                    <li key={`${i.ItemID}-${idx}`} className="flex items-center gap-2 text-xs">
                                                        <span className={`w-2 h-2 rounded-full ${CAT[i.Category]?.soft || 'bg-slate-400'}`} />
                                                        <span className="truncate flex-1">{i.ItemName}</span>
                                                        <span className="text-slate-400 shrink-0">{fmtDate(i.date)}</span>
                                                        <span className="font-black tabular-nums shrink-0 w-24 text-right">{baht(i.amount)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </motion.div>
                                );
                            })()}
                        </AnimatePresence>
                        <div className="mx-5 mb-5 rounded-2xl border border-dashed border-slate-200 p-3 text-[11px] text-slate-500 space-y-0.5">
                            {fc.assumptions.map((a, i) => <p key={i}>• {a}</p>)}
                        </div>
                    </Glass>

                    {/* ── cumulative + category ── */}
                    <div id="sec-overview" className="scroll-mt-20 grid lg:grid-cols-5 gap-5">
                        <Glass className="lg:col-span-3">
                            <CardTitle icon={Gauge} title="ยอดสะสมที่คาดว่าจะจ่าย" hint="เพิ่มขึ้นเรื่อยๆ ตามเดือน" />
                            <div className="px-3 pt-3 h-[240px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={cumulative} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="cumArea" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={compact} />
                                        <Tooltip content={<TooltipBox />} />
                                        <Line type="monotone" dataKey="cum" name="สะสม" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 3, fill: '#8b5cf6' }} activeDot={{ r: 6 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </Glass>
                        <Glass className="lg:col-span-2">
                            <CardTitle icon={Boxes} title="มูลค่าปัจจุบันแยกหมวด" hint={`รวม ${baht(catTotal)}`} />
                            <div className="relative h-[200px] mt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={catDonut} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none">
                                            {catDonut.map((c, i) => <Cell key={i} fill={c.color} />)}
                                        </Pie>
                                        <Tooltip content={<TooltipBox />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <p className="text-[11px] text-slate-500 font-bold">ทั้งหมด</p>
                                    <p className="text-lg font-black">{compact(catTotal)}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 px-5 pb-5">
                                {catDonut.map(c => (
                                    <div key={c.name} className="flex items-center gap-2 text-xs">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                                        <span className="text-slate-600">{c.name}</span>
                                        <span className="ml-auto font-bold tabular-nums">{c.count}</span>
                                    </div>
                                ))}
                            </div>
                        </Glass>
                    </div>

                    {/* ── status / funnel / vendor ── */}
                    <div className="grid lg:grid-cols-3 gap-5">
                        <Glass>
                            <CardTitle icon={ShieldAlert} title="สถานะสัญญา" hint="สัดส่วนจำนวนรายการ" />
                            <div className="p-5 space-y-4">
                                <div className="flex h-4 rounded-full overflow-hidden bg-slate-100">
                                    {data.byStatus.map(s => (
                                        <motion.div key={s.key} initial={{ width: 0 }} animate={{ width: `${(s.count / statusTotal) * 100}%` }} transition={{ duration: 0.8 }}
                                            style={{ background: STATUS[s.key]?.color || '#64748b' }} title={`${STATUS[s.key]?.label}: ${s.count}`} />
                                    ))}
                                </div>
                                <ul className="space-y-2.5">
                                    {data.byStatus.map(s => (
                                        <li key={s.key} className="flex items-center gap-3">
                                            <Ring pct={(s.count / statusTotal) * 100} color={STATUS[s.key]?.color} size={38} stroke={4} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-slate-700">{STATUS[s.key]?.label || s.key}</p>
                                                {s.key !== 'Cancelled' && <p className="text-[11px] text-slate-400">{baht(s.value)}</p>}
                                            </div>
                                            <span className="text-lg font-black tabular-nums">{s.count}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </Glass>

                        <Glass>
                            <CardTitle icon={RefreshCw} title="ขั้นตอนต่ออายุ" hint="รายการที่ยังไม่จบ" />
                            <div className="p-5">
                                {(() => {
                                    const none = data.funnel.find(f => f.key === null)?.count || 0;
                                    const steps = FUNNEL.map(s => ({ ...s, count: data.funnel.find(f => f.key === s.key)?.count || 0 }));
                                    return (<>
                                        <p className="text-xs text-slate-500 mb-3">ยังไม่ดำเนินการ <b className="text-slate-800">{none}</b> รายการ</p>
                                        <div className="space-y-2">
                                            {steps.map((s, i) => (
                                                <div key={s.key} className="relative">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`w-7 h-7 rounded-full text-[11px] font-black flex items-center justify-center text-white ${s.count ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-300'}`}>{i + 1}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between text-xs font-bold mb-1"><span>{s.label}</span><span>{s.count}</span></div>
                                                            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                                                                <motion.div initial={{ width: 0 }} animate={{ width: `${(s.count / funnelMax) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.1 }}
                                                                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>);
                                })()}
                            </div>
                        </Glass>

                        <Glass>
                            <CardTitle icon={Wallet} title="Vendor มูลค่าสูงสุด" hint="Top 6" />
                            <div className="px-2 pt-2 h-[260px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.byVendor.slice(0, 6)} layout="vertical" margin={{ left: 4, right: 16 }}>
                                        <defs>
                                            <linearGradient id="vendorBar" x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="0%" stopColor="#6366f1" />
                                                <stop offset="100%" stopColor="#ec4899" />
                                            </linearGradient>
                                        </defs>
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="key" width={130} tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                                        <Bar dataKey="value" name="มูลค่า" fill="url(#vendorBar)" radius={[0, 10, 10, 0]} barSize={16} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Glass>
                    </div>

                    {/* ── expiring ── */}
                    <Glass id="sec-expiring">
                        <CardTitle icon={AlertTriangle} title={`ใกล้หมดอายุภายใน 90 วัน`} hint={`${data.expiring.length} รายการ · เรียงจากใกล้หมดที่สุด`} />
                        <div className="p-5 grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {data.expiring.length === 0 && <p className="text-xs text-slate-400">ไม่มีรายการ</p>}
                            {data.expiring.map(e => {
                                const urgent = e.daysLeft <= 30;
                                const pct = Math.max(0, Math.min(100, (e.daysLeft / 90) * 100));
                                const color = e.daysLeft <= 0 ? '#ef4444' : urgent ? '#f97316' : '#10b981';
                                return (
                                    <motion.div key={e.ItemID} variants={fade} whileHover={{ y: -2 }} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                                        <div className="relative shrink-0">
                                            <Ring pct={pct} color={color} size={52} stroke={6} />
                                            <span className="absolute inset-0 flex items-center justify-center text-xs font-black tabular-nums" style={{ color }}>{e.daysLeft <= 0 ? '!' : e.daysLeft}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-black text-slate-800 truncate">{e.ItemName}</p>
                                            <p className="text-[11px] text-slate-500 truncate">{CAT[e.Category]?.label} · {e.VendorName || '-'}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[11px] font-bold text-slate-600">{fmtDate(e.EndDate)}</span>
                                                <span className="text-[11px] font-black tabular-nums ml-auto">{baht(e.Price)}</span>
                                            </div>
                                            <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${e.RenewalStatus ? 'bg-violet-100 text-violet-700' : 'bg-rose-100 text-rose-700'}`}>
                                                {FUNNEL.find(f => f.key === e.RenewalStatus)?.label || 'ยังไม่ดำเนินการ'}
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </Glass>

                    {/* ── renewal timeline ── */}
                    <Glass id="sec-renewals">
                        <CardTitle icon={RefreshCw} title="ประวัติการต่ออายุ" hint={`${data.renewals.length} รอบในช่วงที่เลือก`} />
                        <div className="p-5">
                            {data.renewals.length === 0 && <p className="text-xs text-slate-400">ยังไม่มีการต่ออายุในช่วงนี้</p>}
                            <div className="relative pl-6 space-y-4">
                                {data.renewals.length > 1 && <span className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-violet-300 to-indigo-100" />}
                                {data.renewals.map(r => {
                                    const delta = num(r.NewPrice) - num(r.OldPrice);
                                    return (
                                        <div key={r.RenewalID} className="relative">
                                            <span className="absolute -left-6 top-1.5 w-4 h-4 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 ring-4 ring-white" />
                                            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="font-black text-slate-800">{r.ItemName}</p>
                                                    <span className="text-[11px] text-slate-400">{fmtDate(r.NewStartDate)} → {fmtDate(r.NewEndDate)}</span>
                                                    <span className={`ml-auto inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-black ${delta > 0 ? 'bg-rose-100 text-rose-700' : delta < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                        {delta > 0 ? <ArrowUpRight size={12} /> : delta < 0 ? <ArrowDownRight size={12} /> : null}
                                                        {baht(r.OldPrice)} → {baht(r.NewPrice)}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mt-2">
                                                    <span>PO {r.NewPONumber || r.OldPONumber || '-'}</span>
                                                    <span>PR {r.PRNumber || '-'}</span>
                                                    <span>โดย {r.CompletedBy || '-'}</span>
                                                    <span>{fmtDT(r.CompletedAt)}</span>
                                                    <span>📎 {r.files} ไฟล์</span>
                                                    {r.ClientIP && <span className="font-mono">IP {r.ClientIP}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </Glass>

                    {/* ── data quality ── */}
                    <Glass id="sec-quality">
                        <CardTitle icon={AlertTriangle} title="คุณภาพข้อมูล" hint="กดการ์ดเพื่อดูรายการที่ต้องแก้" />
                        <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {QUALITY.map(q => {
                                const list = data.quality[q.key] || [];
                                const ok = list.length === 0;
                                const open = openQuality === q.key;
                                return (
                                    <button key={q.key} onClick={() => setOpenQuality(open ? null : q.key)}
                                        className={`text-left rounded-2xl p-4 border transition-all ${ok ? 'border-emerald-100 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60 hover:shadow'}`}>
                                        <div className="flex items-center gap-2">
                                            <q.icon size={15} className={ok ? 'text-emerald-600' : 'text-amber-600'} />
                                            <p className="text-xs font-bold text-slate-600">{q.label}</p>
                                            <ChevronDown size={13} className={`ml-auto text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                                        </div>
                                        <p className={`text-2xl font-black mt-1 ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{ok ? '✓' : list.length}</p>
                                        {open && list.length > 0 && (
                                            <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto text-[11px] text-slate-600">
                                                {list.map(i => <li key={i.ItemID} className="truncate">• {i.ItemName}</li>)}
                                            </ul>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </Glass>
                </>)}
            </motion.div>
        </div>
    );
}
