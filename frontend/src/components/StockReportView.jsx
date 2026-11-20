import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Download, RefreshCw, Wallet, Boxes, Layers, AlertTriangle, PackageX, CircleDollarSign,
    Search, ArrowUpDown, Info,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import * as XLSX from 'xlsx';
import StockMovementView from './StockMovementView';
import StockAnalysisView from './StockAnalysisView';
import StockProcurementView from './StockProcurementView';
import StockCountQualityView from './StockCountQualityView';
import { API_BASE } from '../config/api';
import { usePager, PagerBar } from './StockPager';

// ─── constants ──────────────────────────────────────────
const STATUS = {
    ok: { label: 'ปกติ', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    low: { label: 'ต่ำกว่า Min', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
    out: { label: 'หมด', badge: 'bg-red-50 text-red-700 border-red-200' },
    over: { label: 'เกิน Max', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
    negative: { label: 'ติดลบ', badge: 'bg-rose-100 text-rose-800 border-rose-300' },
};
const STATUS_FILTERS = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'low', label: 'ต่ำกว่า Min' },
    { id: 'out', label: 'หมด' },
    { id: 'over', label: 'เกิน Max' },
    { id: 'negative', label: 'ติดลบ' },
    { id: 'noPrice', label: 'ไม่มีราคา' },
    { id: 'ok', label: 'ปกติ' },
];
const VIEWS = [
    { id: 'overview', label: 'ภาพรวมและมูลค่า' },
    { id: 'movement', label: 'การเคลื่อนไหว' },
    { id: 'analysis', label: 'วิเคราะห์และสั่งซื้อ' },
    { id: 'procurement', label: 'จัดซื้อและรับของ' },
    { id: 'countquality', label: 'ตรวจนับและคุณภาพ' },
];
const BAR_COLORS =['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

// ─── helpers ────────────────────────────────────────────
const baht = (v) => `฿${Math.round(Number(v) || 0).toLocaleString()}`;
const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${Math.round(v)}`);

const Card = ({ children, className = '' }) => (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-200 ${className}`}>
        {children}
    </motion.div>
);

const Kpi = ({ icon: Icon, label, value, sub, tone = 'indigo' }) => {
    const tones = {
        indigo: 'bg-indigo-50 text-indigo-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        orange: 'bg-orange-50 text-orange-600',
        red: 'bg-red-50 text-red-600',
        slate: 'bg-slate-100 text-slate-600',
    };
    return (
        <Card className="flex items-center gap-4">
            <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}><Icon size={20} /></span>
            <div className="min-w-0">
                <p className="text-xs font-bold text-slate-500 truncate">{label}</p>
                <p className="text-xl font-black text-slate-800 tabular-nums truncate">{value}</p>
                {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
            </div>
        </Card>
    );
};

const ValueChart = ({ title, rows }) => {
    const data = rows.slice(0, 10).map((r) => ({ name: r.key, value: r.value, items: r.items, qty: r.qty }));
    return (
        <Card>
            <h3 className="font-bold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 mb-3">10 อันดับแรกตามมูลค่า • ทั้งหมด {rows.length} กลุ่ม</p>
            {data.length === 0 || data.every((d) => d.value === 0) ? (
                <p className="text-sm text-slate-400 py-10 text-center">ไม่มีข้อมูลมูลค่า</p>
            ) : (
                <div style={{ height: Math.max(180, data.length * 34) }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                            <Tooltip
                                cursor={{ fill: '#f1f5f9' }}
                                content={({ active, payload }) => active && payload?.length ? (
                                    <div className="rounded-xl bg-slate-900 text-white px-3 py-2 text-xs shadow-xl">
                                        <p className="font-bold mb-1">{payload[0].payload.name}</p>
                                        <p>มูลค่า {baht(payload[0].payload.value)}</p>
                                        <p className="opacity-70">{payload[0].payload.items} รายการ • {payload[0].payload.qty.toLocaleString()} ชิ้น</p>
                                    </div>
                                ) : null}
                            />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                                {data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
};

// ─── main ───────────────────────────────────────────────
export default function StockReportView() {
    const [view, setView] = useState('overview');
    const [type, setType] = useState('');
    const [location, setLocation] = useState('');
    const [mgmt, setMgmt] = useState('');   // ประเภทการจัดการ (Rotating / Spare / Stored)
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sort, setSort] = useState({ key: 'value', dir: 'desc' });

    const load = async () => {
        setLoading(true); setErr('');
        try {
            const p = new URLSearchParams();
            if (type) p.set('type', type);
            if (location) p.set('location', location);
            if (mgmt) p.set('mgmt', mgmt);
            const res = await fetch(`${API_BASE}/stock/report?${p.toString()}`);
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'โหลดรายงานไม่สำเร็จ');
            setData(await res.json());
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [type, location, mgmt]);

    const rows = useMemo(() => {
        if (!data) return [];
        const q = query.trim().toLowerCase();
        const list = data.items.filter((r) => {
            if (statusFilter === 'noPrice' ? !r.noPrice : statusFilter !== 'all' && r.status !== statusFilter) return false;
            return !q || r.ProductName.toLowerCase().includes(q) || r.TypeLabel.toLowerCase().includes(q) || r.Location.toLowerCase().includes(q);
        });
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...list].sort((a, b) => {
            const x = a[sort.key]; const y = b[sort.key];
            return (typeof x === 'string' ? x.localeCompare(y, 'th') : x - y) * dir;
        });
    }, [data, query, statusFilter, sort]);
    const pager = usePager(rows, 20);

    const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'ProductName' ? 'asc' : 'desc' }));

    const exportExcel = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map((r) => ({
            'สินค้า': r.ProductName, 'ประเภท': r.TypeLabel, 'สถานที่': r.Location,
            'คงเหลือ': r.CurrentStock, 'หน่วย': r.UnitOfMeasure, 'Min': r.MinStock, 'Max': r.MaxStock,
            'ราคาล่าสุด (฿)': r.LastPrice, 'มูลค่า (฿)': r.value,
            'สถานะ': STATUS[r.status].label, 'ไม่มีราคา': r.noPrice ? 'Y' : '',
        }))), 'รายการสินค้า');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byType.map((g) => ({ 'ประเภท': g.key, 'รายการ': g.items, 'จำนวนชิ้น': g.qty, 'มูลค่า (฿)': g.value }))), 'มูลค่าตามประเภท');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byLocation.map((g) => ({ 'สถานที่': g.key, 'รายการ': g.items, 'จำนวนชิ้น': g.qty, 'มูลค่า (฿)': g.value }))), 'มูลค่าตามสถานที่');
        XLSX.writeFile(wb, `Stock_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const k = data?.kpi;
    const Th = ({ k: key, children, right }) => (
        <th className={`px-3 py-2.5 font-bold ${right ? 'text-right' : 'text-left'}`}>
            <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-indigo-600">
                {children}<ArrowUpDown size={11} className={sort.key === key ? 'text-indigo-600' : 'opacity-30'} />
            </button>
        </th>
    );

    return (
        <div className="space-y-5">
            {/* ── ตัวกรอง ── */}
            <Card className="flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                    <div className="flex p-1 rounded-xl bg-slate-100 w-fit mb-2">
                        {VIEWS.map((v) => (
                            <button key={v.id} onClick={() => setView(v.id)} className={`px-4 h-8 rounded-lg text-xs font-bold transition-all ${view === v.id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}>{v.label}</button>
                        ))}
                    </div>
                    <p className="text-xs text-slate-500">{data ? `ข้อมูลคงคลัง ณ ${new Date(data.generatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}` : 'กำลังโหลด...'}</p>
                </div>
                <select value={type} onChange={(e) => setType(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium">
                    <option value="">ทุกประเภท</option>
                    {data?.options.types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <select value={location} onChange={(e) => setLocation(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium">
                    <option value="">ทุกสถานที่</option>
                    {data?.options.locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                {view !== 'movement' && (
                    <select value={mgmt} onChange={(e) => setMgmt(e.target.value)} aria-label="ประเภทการจัดการ" className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium">
                        <option value="">ทุกการจัดการ</option>
                        {(data?.options.managementTypes || []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                )}
                {view === 'overview' && (<>
                    <button onClick={load} className="h-10 w-10 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center" title="รีเฟรช">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={exportExcel} disabled={!data} className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2">
                        <Download size={16} /> Export Excel
                    </button>
                </>)}
            </Card>

            {view === 'overview' && (<>
            {err && (
                <Card className="border-red-200 bg-red-50 text-red-700 text-sm flex items-center gap-2">
                    <AlertTriangle size={16} /> {err}
                </Card>
            )}

            {/* ── KPI ── */}
            {k && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <Kpi icon={Boxes} label="รายการสินค้า" value={k.items.toLocaleString()} tone="indigo" />
                    <Kpi icon={Layers} label="จำนวนชิ้นรวม" value={k.totalQty.toLocaleString()} tone="slate" />
                    <Kpi icon={Wallet} label="มูลค่ารวม" value={baht(k.totalValue)} sub="ราคาล่าสุด × คงเหลือ" tone="emerald" />
                    <Kpi icon={AlertTriangle} label="ต่ำกว่า Min" value={k.low.toLocaleString()} sub={`หมดสต็อก ${k.out} • ติดลบ ${k.negative}`} tone="orange" />
                    <Kpi icon={CircleDollarSign} label="ไม่มีราคา" value={k.noPrice.toLocaleString()} sub="ไม่นับในมูลค่ารวม" tone="red" />
                </div>
            )}

            {/* ── กราฟมูลค่า ── */}
            {data && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <ValueChart title="มูลค่าตามประเภทอุปกรณ์" rows={data.byType} />
                    <ValueChart title="มูลค่าตามสถานที่" rows={data.byLocation} />
                </div>
            )}

            {/* ── ตารางสินค้า ── */}
            {data && (
                <Card>
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <div className="mr-auto">
                            <h3 className="font-bold text-slate-800">รายการสินค้าทั้งหมด</h3>
                            <p className="text-xs text-slate-500">แสดง {rows.length.toLocaleString()} จาก {data.items.length.toLocaleString()} รายการ</p>
                        </div>
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาสินค้า / ประเภท / สถานที่"
                                className="h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {STATUS_FILTERS.map((f) => (
                            <button key={f.id} onClick={() => setStatusFilter(f.id)}
                                className={`px-3 h-8 rounded-lg text-xs font-bold border transition-all ${statusFilter === f.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600 text-xs">
                                <tr>
                                    <Th k="ProductName">สินค้า</Th>
                                    <Th k="TypeLabel">ประเภท</Th>
                                    <Th k="Location">สถานที่</Th>
                                    <Th k="CurrentStock" right>คงเหลือ</Th>
                                    <Th k="MinStock" right>Min</Th>
                                    <Th k="MaxStock" right>Max</Th>
                                    <Th k="LastPrice" right>ราคาล่าสุด</Th>
                                    <Th k="value" right>มูลค่า</Th>
                                    <th className="px-3 py-2.5 font-bold text-left">สถานะ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pager.pageRows.map((r) => (
                                    <tr key={r.ProductID} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 font-medium text-slate-800 max-w-[260px] truncate" title={r.ProductName}>{r.ProductName}</td>
                                        <td className="px-3 py-2 text-slate-600">{r.TypeLabel}</td>
                                        <td className="px-3 py-2 text-slate-600">{r.Location}</td>
                                        <td className="px-3 py-2 text-right tabular-nums font-bold">{r.CurrentStock.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">{r.UnitOfMeasure}</span></td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.MinStock || '-'}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.MaxStock || '-'}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{r.noPrice ? <span className="text-red-500 text-xs font-bold">ไม่มีราคา</span> : baht(r.LastPrice)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums font-bold">{baht(r.value)}</td>
                                        <td className="px-3 py-2">
                                            <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${STATUS[r.status].badge}`}>{STATUS[r.status].label}</span>
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400"><PackageX size={20} className="inline mr-2" />ไม่พบรายการ</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PagerBar curPage={pager.curPage} totalPages={pager.totalPages} setPage={pager.setPage} pageStart={pager.pageStart} pageSize={pager.pageSize} total={pager.total} />
                </Card>
            )}

            {data && (
                <p className="text-xs text-slate-400 flex items-start gap-1.5 px-1">
                    <Info size={13} className="mt-0.5 shrink-0" /> {data.note} (ย้อนหลังเป็นค่าประมาณ เพราะระบบไม่เก็บราคาต่อรายการเคลื่อนไหว)
                </p>
            )}
            </>)}

            {view === 'movement' && <StockMovementView type={type} location={location} />}
            {view === 'analysis' && <StockAnalysisView type={type} location={location} mgmt={mgmt} />}
            {view === 'procurement' && <StockProcurementView />}
            {view === 'countquality' && <StockCountQualityView />}
        </div>
    );
}
