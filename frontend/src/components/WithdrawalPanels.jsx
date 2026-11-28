import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Search, Clock, Crown, Droplet, Calendar, Layers, Package, ChevronDown, ChevronRight } from 'lucide-react';
import Portal from './Portal';
import Pagination from './Pagination';
import { API_BASE } from '../config/api';
import { PageSkeleton } from './Skeleton';

// ประวัติการเบิก + รายงาน (ข้อมูลจาก DCI SP_PartOutDetail อ่านอย่างเดียว)
// meta = { [Prt_Code]: { name, color } } — color มาจากชื่อสเปคของหมึก (ดูหมายเหตุใน InkTonerStockPage)

export const PAGE_SIZE = 20;

export const TONER_COLORS = {
    cyan: { label: 'ฟ้า (Cyan)', hex: '#06b6d4', text: 'text-cyan-700', bg: 'bg-cyan-50', ring: 'ring-cyan-200' },
    magenta: { label: 'ชมพู (Magenta)', hex: '#ec4899', text: 'text-pink-700', bg: 'bg-pink-50', ring: 'ring-pink-200' },
    yellow: { label: 'เหลือง (Yellow)', hex: '#eab308', text: 'text-yellow-700', bg: 'bg-yellow-50', ring: 'ring-yellow-200' },
    black: { label: 'ดำ (Black)', hex: '#64748b', text: 'text-slate-700', bg: 'bg-slate-100', ring: 'ring-slate-300' },
    default: { label: 'อื่นๆ / ไม่ระบุสี', hex: '#6366f1', text: 'text-indigo-700', bg: 'bg-indigo-50', ring: 'ring-indigo-200' },
};
const COLOR_ORDER = ['cyan', 'magenta', 'yellow', 'black', 'default'];

const fmtDate = (d) => {
    const t = d ? new Date(d) : null;
    if (!t || Number.isNaN(t.getTime())) return '-';
    return t.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const fmtNum = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '0%');
// ช่วงเวลาที่เลือกได้ (days = จำนวนวันย้อนหลังนับรวมวันนี้) bucket = ความละเอียดของแนวโน้ม
const PERIODS = [
    { key: '7d', label: '7 วัน', days: 7, bucket: 'day' },
    { key: '1m', label: '1 เดือน', days: 30, bucket: 'day' },
    { key: '3m', label: '3 เดือน', days: 90, bucket: 'month' },
    { key: 'all', label: 'ทั้งหมด', days: null, bucket: 'month' },
];
const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isMonth = (s) => /^\d{4}-\d{2}$/.test(String(s || ''));
const monthLabel = (m) => {
    if (isDay(m)) {
        const [y, mo, d] = m.split('-').map(Number);
        return new Date(y, mo - 1, d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
    }
    const [y, mo] = String(m || '').split('-');
    if (!y || !mo) return m || '-';
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
};
// เติมช่วงที่ไม่มีการเบิกให้เป็น 0 (รายวันหรือรายเดือน) เพื่อให้แนวโน้มต่อเนื่อง
const fillBuckets = (months, from, to, bucket) => {
    if (!from || !to) return months;
    const byKey = new Map(months.map((m) => [m.month, m]));
    const out = [];
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    if (bucket === 'day') {
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const k = toISO(d);
            out.push(byKey.get(k) || { month: k, times: 0, qty: 0, colors: {} });
        }
    } else {
        for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
            const k = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
            out.push(byKey.get(k) || { month: k, times: 0, qty: 0, colors: {} });
        }
    }
    return out;
};
const colorOf = (meta, code) => meta?.[code]?.color || 'default';

const buildQuery = (params) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); });
    return sp.toString();
};

// เรียกข้อมูล (ยกเลิกคำขอเก่าเมื่อ url เปลี่ยน)
const useApi = (url) => {
    const [state, setState] = useState({ loading: true, error: null, json: null });
    const [reloadKey, setReloadKey] = useState(0);
    useEffect(() => {
        if (!url) return undefined;
        let alive = true;
        setState((s) => ({ ...s, loading: true, error: null }));
        fetch(url)
            .then(async (res) => {
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json.success === false) throw new Error(json.error || 'โหลดข้อมูลไม่สำเร็จ');
                return json;
            })
            .then((json) => alive && setState({ loading: false, error: null, json }))
            .catch((err) => alive && setState({ loading: false, error: err.message, json: null }));
        return () => { alive = false; };
    }, [url, reloadKey]);
    return { ...state, reload: () => setReloadKey((k) => k + 1) };
};

// แบ่งหน้าฝั่งหน้าเว็บ (หน้าละ PAGE_SIZE) — กลับไปหน้า 1 เมื่อ resetKey เปลี่ยน
const usePaged = (rows, resetKey, size = PAGE_SIZE) => {
    const [page, setPage] = useState(1);
    useEffect(() => { setPage(1); }, [resetKey]);
    const totalPages = Math.max(1, Math.ceil(rows.length / size));
    const current = Math.min(page, totalPages);
    return {
        page: current,
        setPage,
        size,
        totalPages,
        total: rows.length,
        slice: rows.slice((current - 1) * size, current * size),
    };
};

const PagedFooter = ({ paged }) => (
    <Pagination
        currentPage={paged.page}
        totalPages={paged.totalPages}
        onPageChange={paged.setPage}
        itemsPerPage={paged.size}
        totalItems={paged.total}
    />
);

const Field = ({ label, children }) => (
    <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
        {label}
        {children}
    </label>
);
const inputCls = 'border border-slate-200 rounded-xl px-3 h-[38px] text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100';

const Dot = ({ color, size = 10 }) => (
    <span className="inline-block shrink-0 rounded-full ring-2 ring-white shadow-sm"
        style={{ width: size, height: size, background: TONER_COLORS[color]?.hex || TONER_COLORS.default.hex }}
        title={TONER_COLORS[color]?.label || ''} />
);

// คำอธิบายสี (แสดงเฉพาะสีที่มีในข้อมูล)
const ColorLegend = ({ colors }) => (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
        {colors.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5"><Dot color={c} size={9} />{TONER_COLORS[c].label}</span>
        ))}
    </div>
);

// ── แท็บประวัติการเบิก ──
export const WithdrawalHistoryTab = ({ meta, name }) => {
    const [code, setCode] = useState('');
    const [cost, setCost] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [limit, setLimit] = useState(500);
    const url = `${API_BASE}/ink-toner/withdrawals?${buildQuery({ code: code.trim(), cost, from, to, limit })}`;
    const { loading, error, json, reload } = useApi(url);
    const all = useApi(`${API_BASE}/ink-toner/withdrawals/report`);
    const costOptions = useMemo(
        () => [...new Set((all.json?.costItem || []).map((r) => r.CostCenter).filter(Boolean))].sort(),
        [all.json]
    );
    const rows = json?.data || [];
    const paged = usePaged(rows, url);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <Field label="รหัสหมึก">
                    <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6CC-ITP0018" className={`${inputCls} pl-8 w-44`} />
                    </div>
                </Field>
                <Field label="Cost Center">
                    <select value={cost} onChange={(e) => setCost(e.target.value)} className={`${inputCls} w-40`}>
                        <option value="">ทั้งหมด</option>
                        {costOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </Field>
                <Field label="ตั้งแต่"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
                <Field label="ถึง"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
                <Field label="ดึงข้อมูล">
                    <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={`${inputCls} w-32`}>
                        {[100, 500, 1000, 2000].map((n) => <option key={n} value={n}>สูงสุด {n}</option>)}
                    </select>
                </Field>
                <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={() => { setCode(''); setCost(''); setFrom(''); setTo(''); }}
                        className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 h-[38px]">ล้างตัวกรอง</button>
                    <button type="button" onClick={reload} disabled={loading}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-3 h-[38px] rounded-xl">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
                    </button>
                </div>
            </div>

            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 text-xs text-slate-500">
                    <span>
                        พบ <b className="text-slate-800">{paged.total.toLocaleString()}</b> รายการ
                        {rows.length >= limit ? ` (ดึงสูงสุด ${limit})` : ''}
                        {paged.total > 0 && <> · หน้า {paged.page}/{paged.totalPages}</>}
                    </span>
                    <span className="inline-flex items-center gap-1"><Clock size={12} /> ข้อมูลจาก DCI (อ่านอย่างเดียว)</span>
                </div>
                {loading && rows.length === 0 ? (
                    <div className="p-4"><PageSkeleton variant="list" /></div>
                ) : rows.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-400">ไม่มีประวัติการเบิกตามเงื่อนไขนี้</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-3 py-2.5 whitespace-nowrap">วันที่</th>
                                    <th className="px-3 py-2.5 whitespace-nowrap">รหัส</th>
                                    <th className="px-3 py-2.5">ชื่อรายการ</th>
                                    <th className="px-3 py-2.5 text-right">จำนวน</th>
                                    <th className="px-3 py-2.5 whitespace-nowrap">Cost Center</th>
                                    <th className="px-3 py-2.5">ผู้เบิก</th>
                                    <th className="px-3 py-2.5">เหตุผล</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paged.slice.map((r, i) => {
                                    const color = colorOf(meta, r.Part_Code);
                                    return (
                                        <tr key={`${r.Part_Code}-${r.upd_dt}-${i}`} className="hover:bg-indigo-50/40">
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(r.upd_dt)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-700">
                                                    <Dot color={color} size={8} />{r.Part_Code}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-700 max-w-[260px] truncate" title={meta?.[r.Part_Code]?.name || ''}>{meta?.[r.Part_Code]?.name || '-'}</td>
                                            <td className="px-3 py-2 text-right font-bold text-slate-800">{fmtNum(r.Qty)}</td>
                                            <td className="px-3 py-2"><span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{r.CostCerter || '-'}</span></td>
                                            <td className="px-3 py-2 text-slate-600">{r.cr_by || '-'}</td>
                                            <td className="px-3 py-2 text-slate-500 max-w-[320px] truncate" title={r.ReasonText || ''}>{r.ReasonText || '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="px-4 pb-3"><PagedFooter paged={paged} /></div>
            </div>
        </div>
    );
};

// รวมข้อมูลดิบ (Cost × รายการ, เดือน × รายการ) เป็นสรุปตามสี/Cost Center/เดือน/รายการ
const aggregate = (costItem, monthItem, meta) => {
    const totals = { times: 0, qty: 0 };
    const costMap = new Map();
    const itemMap = new Map();
    const colorMap = {};
    const maxDate = (a, b) => (a && b ? (a > b ? a : b) : a || b || null);

    for (const r of costItem) {
        const t = Number(r.Times) || 0;
        const q = Number(r.TotalQty) || 0;
        const c = colorOf(meta, r.Part_Code);
        totals.times += t;
        totals.qty += q;

        const cs = costMap.get(r.CostCenter) || { cost: r.CostCenter, times: 0, qty: 0, items: new Set(), last: null, colors: {} };
        cs.times += t; cs.qty += q; cs.items.add(r.Part_Code); cs.last = maxDate(cs.last, r.LastAt);
        cs.colors[c] = (cs.colors[c] || 0) + t;
        costMap.set(r.CostCenter, cs);

        const it = itemMap.get(r.Part_Code) || { code: r.Part_Code, name: meta?.[r.Part_Code]?.name || '', color: c, times: 0, qty: 0, costs: new Set(), byCost: {}, last: null };
        it.times += t; it.qty += q; it.costs.add(r.CostCenter); it.last = maxDate(it.last, r.LastAt);
        it.byCost[r.CostCenter] = { times: (it.byCost[r.CostCenter]?.times || 0) + t, qty: (it.byCost[r.CostCenter]?.qty || 0) + q };
        itemMap.set(r.Part_Code, it);

        const col = colorMap[c] || (colorMap[c] = { color: c, times: 0, qty: 0, items: new Set(), costs: new Map() });
        col.times += t; col.qty += q; col.items.add(r.Part_Code);
        col.costs.set(r.CostCenter, (col.costs.get(r.CostCenter) || 0) + t);
    }

    const costs = [...costMap.values()]
        .map((c) => ({ ...c, itemCount: c.items.size }))
        .sort((a, b) => b.times - a.times || b.qty - a.qty || String(a.cost).localeCompare(String(b.cost)));
    const items = [...itemMap.values()]
        .map((i) => ({ ...i, costCount: i.costs.size }))
        .sort((a, b) => b.times - a.times || b.qty - a.qty);
    const colors = COLOR_ORDER.filter((c) => colorMap[c]).map((c) => {
        const col = colorMap[c];
        const top = [...col.costs.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
            color: c,
            times: col.times,
            qty: col.qty,
            itemCount: col.items.size,
            share: totals.times ? col.times / totals.times : 0,
            topCost: top ? top[0] : null,
            topCostTimes: top ? top[1] : 0,
        };
    }).sort((a, b) => b.times - a.times);

    const monthMap = new Map();
    for (const r of monthItem) {
        if (!r.Month) continue; // แถวที่ไม่มีวันที่ข้ามไป
        const t = Number(r.Times) || 0;
        const c = colorOf(meta, r.Part_Code);
        const m = monthMap.get(r.Month) || { month: r.Month, times: 0, qty: 0, colors: {} };
        m.times += t; m.qty += Number(r.TotalQty) || 0; m.colors[c] = (m.colors[c] || 0) + t;
        monthMap.set(r.Month, m);
    }
    const months = [...monthMap.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
    const topMonth = months.reduce((best, m) => (!best || m.times > best.times ? m : best), null);

    return {
        totals: { times: totals.times, qty: totals.qty, items: itemMap.size, costs: costMap.size },
        costs,
        items,
        colors,
        months,
        topCost: costs[0] || null,
        topItem: items[0] || null,
        topColor: colors[0] || null,
        topMonth,
    };
};

// การ์ดไฮไลต์ 4 ใบ
const Highlight = ({ icon: Icon, label, main, sub, accent }) => (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <Icon size={13} className={accent} /> {label}
        </div>
        <div className="mt-2 text-lg font-black text-slate-800 truncate">{main}</div>
        <div className="text-xs text-slate-500 truncate">{sub}</div>
    </div>
);

// วงแหวนสัดส่วน (SVG) — segments: [{ key, value, color }]
const Donut = ({ segments, centerTop, centerBottom, size = 168, stroke = 24 }) => {
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    let offset = 0;
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-100" />
                {segments.filter((s) => s.value > 0).map((s) => {
                    const len = (s.value / total) * c;
                    const el = (
                        <circle key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
                            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
                    );
                    offset += len;
                    return el;
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="text-xl font-black text-slate-800">{centerTop}</div>
                <div className="text-[11px] text-slate-500">{centerBottom}</div>
            </div>
        </div>
    );
};

const COST_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b'];

// ── แท็บรายงานการเบิก ──
export const WithdrawalReportTab = ({ meta }) => {
    const [period, setPeriod] = useState('all'); // '7d' | '1m' | '3m' | 'all' | 'custom'
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [cost, setCost] = useState('');
    const [expandedCode, setExpandedCode] = useState(null);
    const applyPeriod = (key) => {
        const p = PERIODS.find((x) => x.key === key);
        setPeriod(key);
        if (!p || !p.days) { setFrom(''); setTo(''); return; }
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - (p.days - 1));
        setFrom(toISO(start));
        setTo(toISO(end));
    };
    const onDateChange = (setter) => (v) => { setter(v); setPeriod('custom'); };
    // ช่วงไม่เกิน 62 วันแสดงเป็นรายวัน ที่เกินนั้นแสดงเป็นรายเดือน
    const spanDays = from && to ? Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1 : null;
    const bucket = spanDays !== null && spanDays <= 62 ? 'day' : 'month';
    const url = `${API_BASE}/ink-toner/withdrawals/report?${buildQuery({ from, to, cost, bucket })}`;
    const { loading, error, json, reload } = useApi(url);
    const all = useApi(`${API_BASE}/ink-toner/withdrawals/report`);
    const costOptions = useMemo(
        () => [...new Set((all.json?.costItem || []).map((r) => r.CostCenter).filter(Boolean))].sort(),
        [all.json]
    );

    const agg = useMemo(
        () => aggregate(json?.costItem || [], json?.monthItem || [], meta),
        [json, meta]
    );
    const costPaged = usePaged(agg.costs, url, 10); // Cost Center แสดงหน้าละ 10
    const itemPaged = usePaged(agg.items, url);
    const maxCostTimes = Math.max(1, ...agg.costs.map((c) => c.times));
    // สัดส่วน Cost Center: 5 อันดับแรก + อื่นๆ
    const topCosts = agg.costs.slice(0, 5);
    const restCostTimes = agg.costs.slice(5).reduce((s, c) => s + c.times, 0);
    const costSegments = [
        ...topCosts.map((c, i) => ({ key: c.cost, value: c.times, color: COST_COLORS[i] })),
        ...(restCostTimes ? [{ key: 'rest', value: restCostTimes, color: '#94a3b8' }] : []),
    ];
    // จำนวนเดือนที่สต็อกพอใช้ = คงเหลือ ÷ อัตราเบิกเฉลี่ยต่อเดือนในช่วงที่เลือก
    const monthsWindow = (() => {
        if (from && to && spanDays) return Math.max(1, spanDays / 30);
        if (agg.months.length && agg.months[0].month) {
            const [fy, fm] = agg.months[0].month.slice(0, 7).split('-').map(Number);
            const [ly, lm] = agg.months[agg.months.length - 1].month.slice(0, 7).split('-').map(Number);
            return Math.max(1, (ly - fy) * 12 + (lm - fm) + 1);
        }
        return 1;
    })();
    const coverage = useMemo(() => agg.items
        .filter((i) => i.qty > 0 && meta?.[i.code]?.stock != null)
        .map((i) => {
            const stock = Number(meta[i.code].stock) || 0;
            const rate = i.qty / monthsWindow;
            return { code: i.code, name: i.name, color: i.color, stock, rate, months: rate > 0 ? stock / rate : null, minStock: meta[i.code].minStock };
        })
        .sort((a, b) => (a.months ?? Infinity) - (b.months ?? Infinity)),
        [agg.items, meta, monthsWindow]);
    const coveragePaged = usePaged(coverage, url, 10);
    const monthsBadge = (m) => (m <= 0 ? 'bg-red-100 text-red-700' : m < 1 ? 'bg-red-100 text-red-700' : m < 3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700');

    const trend = fillBuckets(agg.months, from, to, bucket);
    const trendStep = Math.max(1, Math.ceil(trend.length / 12)); // แสดงป้ายวันที่ไม่ถี่เกินไป
    const maxMonthTimes = Math.max(1, ...trend.map((m) => m.times));
    const periodLabel = PERIODS.find((p) => p.key === period)?.label || (from && to ? `${from} ถึง ${to}` : 'ทั้งหมด');
    const presentColors = agg.colors.map((c) => c.color);
    const empty = !loading && !error && agg.totals.times === 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <Field label="ระยะเวลา">
                    <div role="group" aria-label="ระยะเวลา" className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 h-[38px] items-center">
                        {PERIODS.map((p) => (
                            <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => applyPeriod(p.key)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${period === p.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </Field>
                <Field label="ตั้งแต่"><input type="date" value={from} onChange={(e) => onDateChange(setFrom)(e.target.value)} className={inputCls} /></Field>
                <Field label="ถึง"><input type="date" value={to} onChange={(e) => onDateChange(setTo)(e.target.value)} className={inputCls} /></Field>
                <Field label="Cost Center">
                    <select value={cost} onChange={(e) => setCost(e.target.value)} className={`${inputCls} w-40`}>
                        <option value="">ทั้งหมด</option>
                        {costOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </Field>
                <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={() => { applyPeriod('all'); setCost(''); }}
                        className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 h-[38px]">ล้างตัวกรอง</button>
                    <button type="button" onClick={reload} disabled={loading}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-3 h-[38px] rounded-xl">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
                    </button>
                </div>
            </div>

            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {loading && !json && <PageSkeleton variant="grid" cards={4} />}
            {empty && <div className="p-10 text-center text-sm text-slate-400 rounded-2xl border border-slate-100 bg-white">ไม่มีข้อมูลการเบิกในช่วงนี้</div>}

            {agg.totals.times > 0 && (
                <>
                    {/* ไฮไลต์ */}
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                        <Highlight icon={Crown} accent="text-amber-500" label="Cost Center เบิกบ่อยสุด"
                            main={agg.topCost.cost} sub={`${fmtNum(agg.topCost.times)} ครั้ง · ${fmtNum(agg.topCost.qty)} ชิ้น (${pct(agg.topCost.times, agg.totals.times)})`} />
                        <Highlight icon={Droplet} accent="text-indigo-500" label="สีที่เบิกบ่อยสุด"
                            main={<span className="inline-flex items-center gap-2"><Dot color={agg.topColor.color} size={12} />{TONER_COLORS[agg.topColor.color].label}</span>}
                            sub={`${fmtNum(agg.topColor.times)} ครั้ง · ${pct(agg.topColor.times, agg.totals.times)} ของทั้งหมด`} />
                        <Highlight icon={Package} accent="text-emerald-500" label="หมึกเบิกบ่อยสุด"
                            main={agg.topItem.code} sub={`${agg.topItem.name || '-'} · ${fmtNum(agg.topItem.times)} ครั้ง`} />
                        <Highlight icon={Calendar} accent="text-sky-500" label="เดือนที่เบิกมากสุด"
                            main={monthLabel(agg.topMonth?.month)} sub={`${fmtNum(agg.topMonth?.times)} ครั้ง · ${fmtNum(agg.topMonth?.qty)} ชิ้น`} />
                    </div>

                    <div className="text-xs text-slate-500">
                        รวม <b className="text-slate-800">{fmtNum(agg.totals.times)}</b> ครั้ง ·
                        <b className="text-slate-800"> {fmtNum(agg.totals.qty)}</b> ชิ้น ·
                        <b className="text-slate-800"> {fmtNum(agg.totals.items)}</b> รายการ ·
                        <b className="text-slate-800"> {fmtNum(agg.totals.costs)}</b> Cost Center
                    </div>

                    {/* สัดส่วนตามสี */}
                    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-black text-slate-800 mb-1">การเบิกแยกตามสีหมึก</h3>
                        <p className="text-[11px] text-slate-400 mb-3">สีมาจากชื่อสเปคของหมึกในสต็อก</p>
                        <div className="flex flex-col md:flex-row items-center gap-6 mb-5">
                            <Donut
                                segments={agg.colors.map((c) => ({ key: c.color, value: c.times, color: TONER_COLORS[c.color].hex }))}
                                centerTop={fmtNum(agg.totals.times)}
                                centerBottom="ครั้งทั้งหมด"
                            />
                            <ul className="w-full md:flex-1 space-y-2 text-xs">
                                {agg.colors.map((c) => (
                                    <li key={c.color} className="flex items-center justify-between gap-3">
                                        <span className="inline-flex items-center gap-2 font-bold text-slate-700"><Dot color={c.color} size={10} />{TONER_COLORS[c.color].label}</span>
                                        <span className="text-slate-500">{fmtNum(c.times)} ครั้ง · <b className="text-slate-800">{pct(c.times, agg.totals.times)}</b></span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                            {agg.colors.map((c) => (
                                <div key={c.color} className={`rounded-xl ring-1 ${TONER_COLORS[c.color].ring} ${TONER_COLORS[c.color].bg} p-3`}>
                                    <div className="flex items-center gap-2 text-xs font-black text-slate-700"><Dot color={c.color} size={11} />{TONER_COLORS[c.color].label}</div>
                                    <div className="mt-2 text-2xl font-black text-slate-800">{fmtNum(c.times)} <span className="text-xs font-bold text-slate-500">ครั้ง</span></div>
                                    <div className="text-[11px] text-slate-600">{pct(c.times, agg.totals.times)} · {fmtNum(c.qty)} ชิ้น · {fmtNum(c.itemCount)} รายการ</div>
                                    <div className="mt-1 text-[11px] text-slate-500 truncate">
                                        เบิกบ่อยสุด: {c.topCost ? `${c.topCost} (${fmtNum(c.topCostTimes)} ครั้ง)` : '-'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {/* สัดส่วน Cost Center */}
                        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                            <h3 className="text-sm font-black text-slate-800 mb-1">สัดส่วน Cost Center</h3>
                            <p className="text-[11px] text-slate-400 mb-4">5 อันดับแรก และอื่นๆ (ตามจำนวนครั้ง)</p>
                            <div className="flex flex-col sm:flex-row items-center gap-6">
                                <Donut
                                    segments={costSegments}
                                    centerTop={fmtNum(agg.costs.length)}
                                    centerBottom="Cost Center"
                                />
                                <ul className="w-full sm:flex-1 space-y-2 text-xs">
                                    {topCosts.map((c, i) => (
                                        <li key={c.cost} className="flex items-center justify-between gap-3">
                                            <span className="inline-flex items-center gap-2 font-bold text-slate-700">
                                                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COST_COLORS[i] }} />{c.cost}
                                            </span>
                                            <span className="text-slate-500">{fmtNum(c.times)} ครั้ง · <b className="text-slate-800">{pct(c.times, agg.totals.times)}</b></span>
                                        </li>
                                    ))}
                                    {restCostTimes > 0 && (
                                        <li className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                                            <span className="inline-flex items-center gap-2 font-bold text-slate-700">
                                                <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />อื่นๆ ({agg.costs.length - topCosts.length} โค้ด)
                                            </span>
                                            <span className="text-slate-500">{fmtNum(restCostTimes)} ครั้ง · <b className="text-slate-800">{pct(restCostTimes, agg.totals.times)}</b></span>
                                        </li>
                                    )}
                                </ul>
                            </div>
                        </section>

                        {/* จำนวนเดือนที่สต็อกพอใช้ */}
                        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                            <h3 className="text-sm font-black text-slate-800 mb-1">จำนวนเดือนที่สต็อกพอใช้</h3>
                            <p className="text-[11px] text-slate-400 mb-3">
                                คงเหลือ ÷ อัตราเบิกเฉลี่ยต่อเดือน (ช่วง {monthsWindow.toFixed(1)} เดือน) · เรียงจากที่จะหมดก่อน
                            </p>
                            {coverage.length === 0 ? (
                                <div className="py-8 text-center text-sm text-slate-400">ไม่มีรายการที่มียอดเบิกในช่วงนี้</div>
                            ) : (
                                <>
                                    <ul className="divide-y divide-slate-100">
                                        {coveragePaged.slice.map((c) => (
                                            <li key={c.code} className="flex items-center gap-3 py-2 text-xs">
                                                <Dot color={c.color} size={9} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-mono font-bold text-slate-700">{c.code}</div>
                                                    <div className="truncate text-slate-500">{c.name || '-'}</div>
                                                </div>
                                                <div className="text-right whitespace-nowrap text-slate-500">
                                                    <div>คงเหลือ <b className="text-slate-800">{fmtNum(c.stock)}</b></div>
                                                    <div>ใช้ {c.rate < 1 ? c.rate.toFixed(2) : c.rate.toFixed(1)}/เดือน</div>
                                                </div>
                                                <span className={`min-w-[78px] text-center rounded-full px-2.5 py-1 text-[11px] font-black ${monthsBadge(c.months)}`}>
                                                    {c.months <= 0 ? 'หมดแล้ว' : `${c.months.toFixed(1)} เดือน`}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-3"><PagedFooter paged={coveragePaged} /></div>
                                </>
                            )}
                        </section>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                        {/* Cost Center: แถบซ้อนตามสี */}
                        <section className="xl:col-span-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                <h3 className="text-sm font-black text-slate-800">Cost Center ที่เบิกบ่อย</h3>
                                <ColorLegend colors={presentColors} />
                            </div>
                            <p className="text-[11px] text-slate-400 mb-3">เรียงตามจำนวนครั้ง · แถบยาว = เบิกบ่อย · สีในแถบ = สัดส่วนสีที่เบิก</p>
                            <ol className="space-y-3">
                                {costPaged.slice.map((c, i) => {
                                    const rank = (costPaged.page - 1) * costPaged.size + i + 1;
                                    const topColor = COLOR_ORDER.filter((k) => c.colors[k]).sort((a, b) => c.colors[b] - c.colors[a])[0];
                                    return (
                                        <li key={c.cost}>
                                            <div className="flex items-baseline justify-between gap-2 text-xs">
                                                <span className="font-bold text-slate-700 truncate">
                                                    <span className="text-slate-400 mr-1.5">{rank}.</span>{c.cost}
                                                </span>
                                                <span className="text-slate-500 whitespace-nowrap">
                                                    <b className="text-slate-800">{fmtNum(c.times)}</b> ครั้ง · {fmtNum(c.qty)} ชิ้น · {fmtNum(c.itemCount)} รายการ
                                                </span>
                                            </div>
                                            <div className="mt-1 h-3 rounded-full bg-slate-100 overflow-hidden" style={{ width: `${Math.max(8, (c.times / maxCostTimes) * 100)}%` }}>
                                                <div className="flex h-full w-full">
                                                    {COLOR_ORDER.filter((k) => c.colors[k]).map((k) => (
                                                        <div key={k} title={`${TONER_COLORS[k].label}: ${c.colors[k]} ครั้ง`}
                                                            style={{ width: `${(c.colors[k] / c.times) * 100}%`, background: TONER_COLORS[k].hex }} />
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="mt-0.5 text-[10px] text-slate-400">สีที่เบิกบ่อย: {topColor ? TONER_COLORS[topColor].label : '-'}</div>
                                        </li>
                                    );
                                })}
                            </ol>
                            <div className="mt-3"><PagedFooter paged={costPaged} /></div>
                        </section>

                        {/* รายเดือน: แท่งซ้อนตามสี */}
                        <section className="xl:col-span-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                            <h3 className="flex items-center gap-2 text-sm font-black text-slate-800 mb-1"><Layers size={15} className="text-indigo-600" /> แนวโน้ม · {periodLabel}</h3>
                            <p className="text-[11px] text-slate-400 mb-3">{bucket === 'day' ? 'จำนวนครั้งต่อวัน' : 'จำนวนครั้งต่อเดือน'} แยกตามสี (วันที่ไม่มีการเบิกแสดงเป็นศูนย์)</p>
                            <div className="flex items-end gap-1.5 h-52 overflow-x-auto pb-1">
                                {trend.map((m, idx) => (
                                    <div key={m.month} className="flex-1 min-w-[22px] flex flex-col items-center justify-end gap-1 h-full"
                                        title={`${monthLabel(m.month)}: ${m.times} ครั้ง, ${m.qty} ชิ้น`}>
                                        <span className="text-[10px] font-bold text-slate-500">{m.times || ''}</span>
                                        <div className={`w-full flex flex-col-reverse overflow-hidden rounded-t-md ${m.times ? '' : 'bg-slate-200/60'}`}
                                            style={{ height: `${m.times ? Math.max(4, (m.times / maxMonthTimes) * 100) : 4}%` }}>
                                            {COLOR_ORDER.filter((k) => m.colors[k]).map((k) => (
                                                <div key={k} style={{ height: `${(m.colors[k] / m.times) * 100}%`, background: TONER_COLORS[k].hex }} />
                                            ))}
                                        </div>
                                        <span className="text-[10px] text-slate-400 whitespace-nowrap h-3">{idx % trendStep === 0 ? monthLabel(m.month) : ''}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* รายการหมึก */}
                    <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 text-sm font-black text-slate-800">รายการหมึกที่เบิกบ่อย</div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2.5">#</th>
                                        <th className="px-3 py-2.5">สี</th>
                                        <th className="px-3 py-2.5 whitespace-nowrap">รหัส</th>
                                        <th className="px-3 py-2.5">ชื่อรายการ</th>
                                        <th className="px-3 py-2.5 text-right">ครั้ง</th>
                                        <th className="px-3 py-2.5 text-right">จำนวนรวม</th>
                                        <th className="px-3 py-2.5 text-right whitespace-nowrap">Cost Center</th>
                                        <th className="px-3 py-2.5 whitespace-nowrap">เบิกล่าสุด</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {itemPaged.slice.map((r, i) => {
                                        const open = expandedCode === r.code;
                                        const costRows = Object.entries(r.byCost).sort((a, b) => b[1].times - a[1].times);
                                        return (
                                        <Fragment key={r.code}>
                                        <tr className="hover:bg-indigo-50/40">
                                            <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                                                <button type="button" onClick={() => setExpandedCode(open ? null : r.code)}
                                                    aria-expanded={open} aria-label={`แสดง Cost Center ของ ${r.code}`}
                                                    className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-slate-500 hover:bg-slate-100">
                                                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{(itemPaged.page - 1) * PAGE_SIZE + i + 1}
                                                </button>
                                            </td>
                                            <td className="px-3 py-2"><Dot color={r.color} size={10} /></td>
                                            <td className="px-3 py-2 whitespace-nowrap font-mono font-semibold text-slate-700">{r.code}</td>
                                            <td className="px-3 py-2 text-slate-600 max-w-[280px] truncate">{r.name || '-'}</td>
                                            <td className="px-3 py-2 text-right font-bold text-slate-800">{fmtNum(r.times)}</td>
                                            <td className="px-3 py-2 text-right text-slate-700">{fmtNum(r.qty)}</td>
                                            <td className="px-3 py-2 text-right text-slate-700">{fmtNum(r.costCount)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(r.last)}</td>
                                        </tr>
                                        {open && (
                                            <tr className="bg-slate-50/70">
                                                <td colSpan={8} className="px-4 py-3">
                                                    <div className="mb-2 text-[11px] font-bold text-slate-500">แยกตาม Cost Center ({costRows.length} โค้ด)</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {costRows.map(([cc, v]) => (
                                                            <span key={cc} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px]">
                                                                <span className="font-mono font-bold text-slate-700">{cc}</span>
                                                                <span className="text-slate-500">{fmtNum(v.times)} ครั้ง · {fmtNum(v.qty)} ชิ้น</span>
                                                                <span className="text-slate-400">{pct(v.times, r.times)}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-4 pb-3"><PagedFooter paged={itemPaged} /></div>
                    </section>
                </>
            )}
        </div>
    );
};

// ── ประวัติการเบิกของรายการเดียว (เปิดจากแต่ละแถว) ──
export const WithdrawalHistoryModal = ({ code, name, color, onClose }) => {
    const { loading, error, json } = useApi(`${API_BASE}/ink-toner/withdrawals?${buildQuery({ code, limit: 300 })}`);
    const rows = json?.data || [];
    const paged = usePaged(rows, code);
    const total = rows.reduce((s, r) => s + Number(r.Qty || 0), 0);
    const costs = new Set(rows.map((r) => r.CostCerter).filter(Boolean));

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <Portal>
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
                <div role="dialog" aria-modal="true" aria-label={`ประวัติการเบิก ${code}`}
                    className="w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-500"><Dot color={color || 'default'} size={9} />{code}</div>
                            <h3 className="font-black text-slate-800 truncate">{name || 'ประวัติการเบิก'}</h3>
                            <p className="mt-1 text-xs text-slate-500">
                                {loading ? 'กำลังโหลด...' : `เบิก ${rows.length.toLocaleString()} ครั้ง · รวม ${fmtNum(total)} ชิ้น · ${costs.size} Cost Center`}
                            </p>
                        </div>
                        <button type="button" onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {error && <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                        {!loading && !error && rows.length === 0 && (
                            <div className="p-10 text-center text-sm text-slate-400">ยังไม่มีประวัติการเบิกของรายการนี้</div>
                        )}
                        {paged.slice.length > 0 && (
                            <ul className="divide-y divide-slate-100">
                                {paged.slice.map((r, i) => (
                                    <li key={`${r.upd_dt}-${i}`} className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 text-xs">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-slate-700">{fmtDate(r.upd_dt)}</span>
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{r.CostCerter || 'ไม่ระบุ'}</span>
                                                {r.cr_by && <span className="text-slate-500">ผู้เบิก {r.cr_by}</span>}
                                            </div>
                                            <div className="mt-1 text-slate-500 truncate" title={r.ReasonText || ''}>{r.ReasonText || '-'}</div>
                                        </div>
                                        <div className="text-right font-black text-slate-800 whitespace-nowrap">{fmtNum(r.Qty)} ชิ้น</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {rows.length > PAGE_SIZE && <div className="border-t border-slate-100 px-4 py-3"><PagedFooter paged={paged} /></div>}
                </div>
            </div>
        </Portal>
    );
};
