import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, ArrowDownToLine, ArrowUpFromLine, Scale, Receipt, Search, AlertTriangle, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Cell } from 'recharts';
import * as XLSX from 'xlsx';
import { API_BASE } from '../config/api';

const RANGES = [
    { id: 'month', label: 'เดือนนี้' },
    { id: '3m', label: '3 เดือน' },
    { id: '6m', label: '6 เดือน' },
    { id: '12m', label: '12 เดือน' },
    { id: 'all', label: 'ทั้งหมด' },
];
const BAR_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

const baht = (v) => `฿${Math.round(Number(v) || 0).toLocaleString()}`;
const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${Math.round(v)}`);
const fmtDT = (d) => (d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ช่วงวันที่ (รวมวันสุดท้าย = วันนี้) → { from, to } รูปแบบ YYYY-MM-DD
const rangeOf = (id) => {
    const now = new Date();
    const to = ymd(now);
    if (id === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    if (id === '3m') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to };
    if (id === '6m') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to };
    if (id === '12m') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to };
    return { to };
};

const Card = ({ children, className = '' }) => (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-200 ${className}`}>{children}</motion.div>
);

// เปรียบเทียบกับช่วงก่อนหน้า (สำหรับ IN: เพิ่ม = เขียว, สำหรับ OUT: ไม่ตัดสินดี/ร้าย ใช้เทา/ส้ม)
const Delta = ({ now, prev, hasPrev }) => {
    if (!hasPrev) return <span className="text-[11px] text-slate-400">ไม่มีช่วงเปรียบเทียบ</span>;
    if (!prev) return <span className="text-[11px] text-slate-400">ช่วงก่อนหน้า 0</span>;
    const pct = ((now - prev) / prev) * 100;
    const Icon = pct > 0.5 ? TrendingUp : pct < -0.5 ? TrendingDown : Minus;
    const tone = pct > 0.5 ? 'text-orange-600' : pct < -0.5 ? 'text-emerald-600' : 'text-slate-400';
    return <span className={`text-[11px] font-bold inline-flex items-center gap-1 ${tone}`}><Icon size={12} />{Math.abs(pct).toFixed(0)}% vs ช่วงก่อน ({prev.toLocaleString()})</span>;
};

const Kpi = ({ icon: Icon, label, value, sub, tone, children }) => {
    const tones = { emerald: 'bg-emerald-50 text-emerald-600', orange: 'bg-orange-50 text-orange-600', indigo: 'bg-indigo-50 text-indigo-600', slate: 'bg-slate-100 text-slate-600' };
    return (
        <Card className="flex items-center gap-4">
            <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}><Icon size={20} /></span>
            <div className="min-w-0">
                <p className="text-xs font-bold text-slate-500 truncate">{label}</p>
                <p className="text-xl font-black text-slate-800 tabular-nums truncate">{value}</p>
                {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
                {children}
            </div>
        </Card>
    );
};

// ตารางอันดับ + แถบสัดส่วน
const RankList = ({ title, hint, rows, unit = 'ชิ้น', sub }) => {
    const max = Math.max(1, ...rows.map((r) => r.qty));
    return (
        <Card>
            <h3 className="font-bold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 mb-3">{hint}</p>
            {rows.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">ไม่มีข้อมูล</p> : (
                <ul className="space-y-2.5">
                    {rows.map((r, i) => (
                        <li key={r.key}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="truncate font-medium text-slate-700" title={r.key}>{i + 1}. {r.key}</span>
                                <span className="tabular-nums shrink-0 font-bold text-slate-800">{r.qty.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">{unit} • {baht(r.value)}</span></span>
                            </div>
                            <div className="h-1.5 mt-1 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(r.qty / max) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                            </div>
                            {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub(r)}</p>}
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

export default function StockMovementView({ type, location }) {
    const [range, setRange] = useState('3m');
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [dirFilter, setDirFilter] = useState('all');
    const [metric, setMetric] = useState('qty');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true); setErr('');
            try {
                const p = new URLSearchParams(rangeOf(range));
                if (type) p.set('type', type);
                if (location) p.set('location', location);
                const res = await fetch(`${API_BASE}/stock/report/movement?${p.toString()}`);
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'โหลดรายงานไม่สำเร็จ');
                const json = await res.json();
                if (!cancelled) setData(json);
            } catch (e) { if (!cancelled) setErr(e.message); }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [range, type, location]);

    const rows = useMemo(() => {
        if (!data) return [];
        const q = query.trim().toLowerCase();
        return data.transactions.filter((t) => {
            if (dirFilter !== 'all' && t.type !== dirFilter) return false;
            return !q || [t.ProductName, t.who, t.reason, t.RefInfo, t.CostCenter, t.byUser].some((v) => String(v || '').toLowerCase().includes(q));
        });
    }, [data, query, dirFilter]);

    // แบ่งหน้าตารางรายการ (ทำฝั่ง client จากข้อมูลที่โหลดมาแล้ว)
    const PAGE_SIZE = 20;
    const [page, setPage] = useState(1);
    useEffect(() => { setPage(1); }, [query, dirFilter, data]);
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const curPage = Math.min(page, totalPages);
    const pageStart = (curPage - 1) * PAGE_SIZE;
    const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);
    // แสดงเลขหน้า: หน้าแรก, หน้าสุดท้าย และรอบหน้าปัจจุบัน ที่เหลือเป็น "…"
    const pageNumbers = (() => {
        const out = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || Math.abs(i - curPage) <= 1) out.push(i);
            else if (out[out.length - 1] !== '…') out.push('…');
        }
        return out;
    })();

    const chartData = useMemo(() => (data?.monthly || []).map((m) => ({
        name: m.label, IN: metric === 'qty' ? m.inQty : m.inValue, OUT: metric === 'qty' ? m.outQty : m.outValue,
        NET: metric === 'qty' ? m.inQty - m.outQty : Math.round(m.inValue - m.outValue),
    })), [data, metric]);

    const exportExcel = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.monthly.map((m) => ({ 'เดือน': m.label, 'รับเข้า (ชิ้น)': m.inQty, 'เบิกออก (ชิ้น)': m.outQty, 'รับเข้า (฿)': m.inValue, 'เบิกออก (฿)': m.outValue }))), 'รายเดือน');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.outByReason.map((r) => ({ 'เหตุผลการเบิก': r.key, 'ชิ้น': r.qty, 'ครั้ง': r.count, 'มูลค่า (฿)': r.value }))), 'เหตุผลการเบิก');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.topItems.map((r) => ({ 'สินค้า': r.key, 'ประเภท': r.TypeLabel, 'ชิ้น': r.qty, 'ครั้ง': r.count, 'มูลค่า (฿)': r.value }))), 'Top สินค้าที่เบิก');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.topRecipients.map((r) => ({ 'ผู้เบิก/ผู้ทำรายการ': r.key, 'ชิ้น': r.qty, 'ครั้ง': r.count, 'มูลค่า (฿)': r.value }))), 'Top ผู้เบิก');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map((t) => ({
            'วันที่': fmtDT(t.TransDate), 'ประเภท': t.type === 'IN' ? 'รับเข้า' : 'เบิกออก', 'สินค้า': t.ProductName, 'หมวด': t.TypeLabel, 'สถานที่': t.Location,
            'จำนวน': t.qty, 'มูลค่า (฿)': t.value, 'เหตุผล/แหล่งที่มา': t.reason, 'ผู้เบิก/ผู้รับ': t.who, 'ผู้ทำรายการ': t.byUser, 'Cost Center': t.CostCenter, 'อ้างอิง': t.RefInfo,
        }))), 'รายการเคลื่อนไหว');
        XLSX.writeFile(wb, `Stock_Movement_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const k = data?.kpi;
    const prev = data?.previous;
    const hasPrev = !!prev;

    return (
        <div className="space-y-5">
            <Card className="flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                    <h2 className="text-lg font-black text-slate-800">รายงานการเคลื่อนไหว (รับเข้า / เบิกออก)</h2>
                    <p className="text-xs text-slate-500">{loading ? 'กำลังโหลด...' : data ? `${data.transactionTotal.toLocaleString()} รายการในช่วงที่เลือก` : ''}</p>
                </div>
                <div className="flex p-1 rounded-xl bg-slate-100">
                    {RANGES.map((r) => (
                        <button key={r.id} onClick={() => setRange(r.id)} className={`px-3 h-8 rounded-lg text-xs font-bold transition-all ${range === r.id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                    ))}
                </div>
                <button onClick={exportExcel} disabled={!data} className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2">
                    <Download size={16} /> Export Excel
                </button>
            </Card>

            {err && <Card className="border-red-200 bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {err}</Card>}

            {k && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Kpi icon={ArrowDownToLine} tone="emerald" label="รับเข้า (ชิ้น)" value={k.inQty.toLocaleString()} sub={`${k.inCount} ครั้ง • ${baht(k.inValue)}`}>
                        <Delta now={k.inQty} prev={prev?.inQty} hasPrev={hasPrev} />
                    </Kpi>
                    <Kpi icon={ArrowUpFromLine} tone="orange" label="เบิกออก (ชิ้น)" value={k.outQty.toLocaleString()} sub={`${k.outCount} ครั้ง • ${baht(k.outValue)}`}>
                        <Delta now={k.outQty} prev={prev?.outQty} hasPrev={hasPrev} />
                    </Kpi>
                    <Kpi icon={Scale} tone="indigo" label="สุทธิ (รับ − เบิก)" value={`${k.netQty > 0 ? '+' : ''}${k.netQty.toLocaleString()}`} sub={`${k.netValue >= 0 ? '+' : '−'}${baht(Math.abs(k.netValue))}`} />
                    <Kpi icon={Receipt} tone="slate" label="จำนวนรายการ" value={(k.inCount + k.outCount).toLocaleString()} sub="รับเข้า + เบิกออก" />
                </div>
            )}

            {data && (
                <Card>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div>
                            <h3 className="font-bold text-slate-800">รับเข้า-เบิกออกรายเดือน</h3>
                            <p className="text-xs text-slate-500">เส้น = สุทธิ (รับ − เบิก)</p>
                        </div>
                        <div className="flex p-1 rounded-xl bg-slate-100">
                            {[['qty', 'จำนวนชิ้น'], ['value', 'มูลค่า']].map(([id, label]) => (
                                <button key={id} onClick={() => setMetric(id)} className={`px-3 h-7 rounded-lg text-xs font-bold ${metric === id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500'}`}>{label}</button>
                            ))}
                        </div>
                    </div>
                    {chartData.length === 0 ? <p className="text-sm text-slate-400 py-10 text-center">ไม่มีข้อมูล</p> : (
                        <div style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ left: 0, right: 12 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={metric === 'value' ? compact : undefined} />
                                    <Tooltip formatter={(v) => (metric === 'value' ? baht(v) : Number(v).toLocaleString())} />
                                    <Legend />
                                    <Bar dataKey="IN" name="รับเข้า" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="OUT" name="เบิกออก" fill="#f97316" radius={[4, 4, 0, 0]} />
                                    <Line dataKey="NET" name="สุทธิ" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Card>
            )}

            {data && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <RankList title="เหตุผลการเบิก" hint="ตามจำนวนชิ้นที่เบิกออก" rows={data.outByReason} sub={(r) => `${r.count} ครั้ง`} />
                    <RankList title="แหล่งที่มาของการรับเข้า" hint="Invoice/PO, Manual Import, คืนของ" rows={data.inBySource} sub={(r) => `${r.count} ครั้ง`} />
                    <RankList title="Top สินค้าที่เบิกบ่อย" hint="10 อันดับแรกตามจำนวนชิ้น" rows={data.topItems} sub={(r) => `${r.TypeLabel} • ${r.count} ครั้ง`} />
                    <RankList title="Top ผู้เบิก" hint="ชื่อพนักงานที่รับของ (ถ้าไม่ระบุ ใช้ผู้ทำรายการแทน)" rows={data.topRecipients} sub={(r) => `${r.count} ครั้ง`} />
                </div>
            )}

            {data && (
                <Card>
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <div className="mr-auto">
                            <h3 className="font-bold text-slate-800">รายการเคลื่อนไหว</h3>
                            <p className="text-xs text-slate-500">แสดง {rows.length === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, rows.length)} จาก {rows.length.toLocaleString()} รายการ{data.transactionTotal > data.transactions.length ? ` (โหลดมา ${data.transactions.length} ล่าสุด — Export เพื่อดูตามที่โหลด)` : ''}</p>
                        </div>
                        <div className="flex p-1 rounded-xl bg-slate-100">
                            {[['all', 'ทั้งหมด'], ['IN', 'รับเข้า'], ['OUT', 'เบิกออก']].map(([id, label]) => (
                                <button key={id} onClick={() => setDirFilter(id)} className={`px-3 h-8 rounded-lg text-xs font-bold ${dirFilter === id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500'}`}>{label}</button>
                            ))}
                        </div>
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาสินค้า / ผู้เบิก / เหตุผล"
                                className="h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                        </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600 text-xs">
                                <tr>
                                    {['วันที่', 'ประเภท', 'สินค้า', 'จำนวน', 'มูลค่า', 'เหตุผล/แหล่งที่มา', 'ผู้เบิก/ผู้รับ', 'Cost Center'].map((h, i) => (
                                        <th key={h} className={`px-3 py-2.5 font-bold ${i === 3 || i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pageRows.map((t) => (
                                    <tr key={t.TransID} className="hover:bg-slate-50" title={t.RefInfo}>
                                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDT(t.TransDate)}</td>
                                        <td className="px-3 py-2">
                                            <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${t.type === 'IN' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>{t.type === 'IN' ? 'รับเข้า' : 'เบิกออก'}</span>
                                        </td>
                                        <td className="px-3 py-2 font-medium text-slate-800 max-w-[260px] truncate">{t.ProductName}</td>
                                        <td className="px-3 py-2 text-right tabular-nums font-bold">{t.qty.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{baht(t.value)}</td>
                                        <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{t.reason}</td>
                                        <td className="px-3 py-2 text-slate-600">{t.who}</td>
                                        <td className="px-3 py-2 text-slate-500">{t.CostCenter || '-'}</td>
                                    </tr>
                                ))}
                                {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">ไม่พบรายการ</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
                            <p className="text-xs text-slate-500">หน้า {curPage} จาก {totalPages}</p>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setPage(curPage - 1)} disabled={curPage === 1}
                                    className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">ก่อนหน้า</button>
                                {pageNumbers.map((n, i) => n === '…' ? (
                                    <span key={`e${i}`} className="px-2 text-xs text-slate-400">…</span>
                                ) : (
                                    <button key={n} onClick={() => setPage(n)}
                                        className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold border transition-all ${n === curPage ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{n}</button>
                                ))}
                                <button onClick={() => setPage(curPage + 1)} disabled={curPage === totalPages}
                                    className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">ถัดไป</button>
                            </div>
                        </div>
                    )}
                </Card>
            )}

            {data && (
                <p className="text-xs text-slate-400 flex items-start gap-1.5 px-1"><Info size={13} className="mt-0.5 shrink-0" /> {data.note}</p>
            )}
        </div>
    );
}
