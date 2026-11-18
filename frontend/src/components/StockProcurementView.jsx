import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, AlertTriangle, ShoppingBag, Truck, Clock, CheckCircle2, Receipt, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import { API_BASE } from '../config/api';

const STATUS = {
    Open: { label: 'Open', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
    Partial: { label: 'รับบางส่วน', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
    Completed: { label: 'ครบแล้ว', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    Cancelled: { label: 'ยกเลิก', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
    Pending: { label: 'Pending', badge: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
};
const RANGES = [
    { id: '3m', label: '3 เดือน' },
    { id: '6m', label: '6 เดือน' },
    { id: '12m', label: '12 เดือน' },
    { id: 'all', label: 'ทั้งหมด' },
];

const baht = (v) => `฿${Math.round(Number(v) || 0).toLocaleString()}`;
const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${Math.round(v)}`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rangeOf = (id) => {
    const now = new Date();
    const to = ymd(now);
    if (id === '3m') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to };
    if (id === '6m') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to };
    if (id === '12m') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to };
    return { to };
};

const Card = ({ children, className = '' }) => (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-200 ${className}`}>{children}</motion.div>
);

const Kpi = ({ icon: Icon, label, value, sub, tone }) => {
    const tones = { indigo: 'bg-indigo-50 text-indigo-600', emerald: 'bg-emerald-50 text-emerald-600', orange: 'bg-orange-50 text-orange-600', red: 'bg-red-50 text-red-600', sky: 'bg-sky-50 text-sky-600' };
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

const Title = ({ title, hint, right }) => (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div><h3 className="font-bold text-slate-800">{title}</h3>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>
        {right}
    </div>
);

const Table = ({ columns, rows, limit = 10, empty = 'ไม่มีข้อมูล', rowKey }) => {
    const [open, setOpen] = useState(false);
    const shown = open ? rows : rows.slice(0, limit);
    return (
        <>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 text-xs">
                        <tr>{columns.map((c) => <th key={c.h} className={`px-3 py-2.5 font-bold ${c.right ? 'text-right' : 'text-left'}`}>{c.h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {shown.map((r, i) => (
                            <tr key={rowKey ? rowKey(r) : i} className="hover:bg-slate-50">
                                {columns.map((c) => <td key={c.h} className={`px-3 py-2 ${c.right ? 'text-right tabular-nums' : ''} ${c.cls || ''}`}>{c.cell(r)}</td>)}
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">{empty}</td></tr>}
                    </tbody>
                </table>
            </div>
            {rows.length > limit && (
                <button onClick={() => setOpen((v) => !v)} className="mt-2 text-xs font-bold text-indigo-600 hover:underline">
                    {open ? 'ย่อรายการ' : `ดูทั้งหมด (${rows.length})`}
                </button>
            )}
        </>
    );
};

const StatusBadge = ({ s }) => {
    const st = STATUS[s] || { label: s, badge: 'bg-slate-100 text-slate-600 border-slate-200' };
    return <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${st.badge}`}>{st.label}</span>;
};

export default function StockProcurementView() {
    const [range, setRange] = useState('12m');
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true); setErr('');
            try {
                const p = new URLSearchParams(rangeOf(range));
                const res = await fetch(`${API_BASE}/stock/report/procurement?${p.toString()}`);
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'โหลดรายงานไม่สำเร็จ');
                const json = await res.json();
                if (!cancelled) setData(json);
            } catch (e) { if (!cancelled) setErr(e.message); }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [range]);

    const exportExcel = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
        add('รายเดือน', data.monthly.map((m) => ({ 'เดือน': m.label, 'จำนวน PO': m.count, 'ยอดสั่งซื้อ (฿)': m.ordered, 'ยอดรับแล้ว (฿)': m.received })));
        add('Vendor', data.byVendor.map((v) => ({ 'Vendor': v.key, 'PO': v.count, 'ยอดสั่งซื้อ (฿)': v.ordered, 'ยอดรับแล้ว (฿)': v.received, 'Lead time เฉลี่ย (วัน)': v.avgLead ?? '', 'ตรงกำหนด (%)': v.onTimeRate ?? '' })));
        add('Budget', data.byBudget.map((v) => ({ 'Budget No.': v.key, 'PO': v.count, 'ยอดสั่งซื้อ (฿)': v.ordered, 'ยอดรับแล้ว (฿)': v.received })));
        add('PO ค้างรับ', data.openPOs.map((p) => ({ 'PO': p.PO_ID, 'PR': p.PR_No, 'Vendor': p.VendorName, 'สถานะ': STATUS[p.Status]?.label || p.Status, 'วันขอซื้อ': fmtDate(p.RequestDate), 'กำหนดส่ง': fmtDate(p.DueDate), 'อายุ (วัน)': p.ageDays, 'เลยกำหนด': p.overdue ? 'Y' : '', 'ค้างรับ (฿)': p.outstanding })));
        add('Invoice', data.invoices.recent.map((i) => ({ 'Invoice': i.InvoiceNo, 'PO': i.PO_ID, 'Vendor': i.VendorName, 'วันที่รับ': fmtDate(i.ReceiveDate), 'ผู้รับ': i.ReceivedBy, 'สถานะ': i.Status })));
        add('ราคาเปลี่ยน', data.priceChanges.map((p) => ({ 'สินค้า': p.ProductName, 'Vendor': p.VendorName, 'ราคาก่อน (฿)': p.previous, 'ราคาล่าสุด (฿)': p.latest, 'ต่าง (฿)': p.diff, 'ต่าง (%)': p.pct, 'PO ก่อนหน้า': fmtDate(p.previousDate), 'PO ล่าสุด': fmtDate(p.latestDate) })));
        XLSX.writeFile(wb, `Stock_Procurement_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const k = data?.kpi;

    return (
        <div className="space-y-5">
            <Card className="flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                    <h2 className="text-lg font-black text-slate-800">รายงานจัดซื้อและการรับของ</h2>
                    <p className="text-xs text-slate-500">{loading ? 'กำลังโหลด...' : data ? `ช่วงตาม วันที่ขอซื้อ (PO) • ${data.kpi.poCount} PO` : ''}</p>
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

            {data && k && (<>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Kpi icon={ShoppingBag} tone="indigo" label="ยอดสั่งซื้อ" value={baht(k.ordered)} sub={`${k.poCount} PO • เปิดอยู่ ${k.openCount}`} />
                    <Kpi icon={CheckCircle2} tone="emerald" label="รับแล้ว" value={baht(k.received)} sub={k.receiveRate === null ? '-' : `${k.receiveRate}% ของยอดสั่งซื้อ`} />
                    <Kpi icon={Clock} tone="orange" label="ค้างรับ" value={baht(k.outstanding)} sub={`PO เลยกำหนด ${k.overdueCount} รายการ`} />
                    <Kpi icon={Truck} tone="sky" label="Lead time" value={k.avgLead === null ? '-' : `${k.avgLead} วัน`} sub={`มัธยฐาน ${k.medianLead ?? '-'} • ตรงกำหนด ${k.onTimeRate ?? '-'}%`} />
                </div>

                <Card>
                    <Title title="ยอดสั่งซื้อรายเดือน" hint="เส้น = ยอดรับแล้ว • แท่ง = ยอดสั่งซื้อ (ตามวันที่ขอซื้อ)" />
                    {data.monthly.length === 0 ? <p className="text-sm text-slate-400 py-10 text-center">ไม่มี PO ในช่วงนี้</p> : (
                        <div style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={data.monthly.map((m) => ({ name: m.label, ordered: m.ordered, received: m.received }))} margin={{ left: 0, right: 12 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={compact} />
                                    <Tooltip formatter={(v) => baht(v)} />
                                    <Legend />
                                    <Bar dataKey="ordered" name="ยอดสั่งซื้อ" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    <Line dataKey="received" name="ยอดรับแล้ว" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card>
                        <Title title="Vendor" hint="ยอดสั่งซื้อ, Lead time เฉลี่ย และอัตราส่งตรงกำหนด" />
                        <Table limit={8} rows={data.byVendor} rowKey={(r) => r.key} empty="ไม่มีข้อมูล"
                            columns={[
                                { h: 'Vendor', cell: (r) => r.key, cls: 'font-medium text-slate-800 max-w-[200px] truncate' },
                                { h: 'PO', right: true, cell: (r) => r.count },
                                { h: 'ยอดสั่งซื้อ', right: true, cell: (r) => baht(r.ordered), cls: 'font-bold' },
                                { h: 'Lead', right: true, cell: (r) => (r.avgLead === null ? '-' : `${r.avgLead} วัน`), cls: 'text-slate-500' },
                                { h: 'ตรงกำหนด', right: true, cell: (r) => (r.onTimeRate === null ? '-' : <span className={r.onTimeRate >= 80 ? 'text-emerald-600 font-bold' : r.onTimeRate < 50 ? 'text-red-600 font-bold' : 'text-amber-600 font-bold'}>{r.onTimeRate}%</span>) },
                            ]} />
                    </Card>
                    <Card>
                        <Title title="Budget No." hint="ยอดสั่งซื้อแยกตามเลขงบประมาณ" />
                        <Table limit={8} rows={data.byBudget} rowKey={(r) => r.key} empty="ไม่มีข้อมูล"
                            columns={[
                                { h: 'Budget No.', cell: (r) => r.key, cls: 'font-medium text-slate-800' },
                                { h: 'PO', right: true, cell: (r) => r.count },
                                { h: 'ยอดสั่งซื้อ', right: true, cell: (r) => baht(r.ordered), cls: 'font-bold' },
                                { h: 'รับแล้ว', right: true, cell: (r) => baht(r.received), cls: 'text-slate-500' },
                            ]} />
                    </Card>
                </div>

                <Card>
                    <Title title="PO ที่ยังค้างรับ" hint={`เปิดอยู่ ${data.openPOs.length} รายการ • เลยกำหนดขึ้นก่อน`} />
                    <Table limit={10} rows={data.openPOs} rowKey={(r) => r.PO_ID} empty="ไม่มี PO ค้างรับ"
                        columns={[
                            { h: 'PO', cell: (r) => <span className="font-mono text-xs">{r.PO_ID}</span> },
                            { h: 'Vendor', cell: (r) => r.VendorName, cls: 'max-w-[200px] truncate text-slate-700' },
                            { h: 'สถานะ', cell: (r) => <StatusBadge s={r.Status} /> },
                            { h: 'กำหนดส่ง', cell: (r) => <span className={r.overdue ? 'text-red-600 font-bold' : 'text-slate-600'}>{fmtDate(r.DueDate)}{r.overdue ? ' (เลย)' : ''}</span> },
                            { h: 'อายุ', right: true, cell: (r) => `${r.ageDays} วัน`, cls: 'text-slate-500' },
                            { h: 'ค้างรับ', right: true, cell: (r) => <b>{baht(r.outstanding)}</b> },
                        ]} />
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card>
                        <Title title="การรับของ (Invoice)" hint={`${data.invoices.total} ใบ • ใช้งาน ${data.invoices.active} • ยกเลิก ${data.invoices.cancelled}`} />
                        <Table limit={8} rows={data.invoices.recent} rowKey={(r) => `${r.InvoiceNo}-${r.ReceiveDate}`} empty="ไม่มี Invoice ในช่วงนี้"
                            columns={[
                                { h: 'Invoice', cell: (r) => <span className="font-mono text-xs">{r.InvoiceNo}</span> },
                                { h: 'PO', cell: (r) => r.PO_ID },
                                { h: 'วันที่รับ', cell: (r) => fmtDate(r.ReceiveDate), cls: 'text-slate-500' },
                                { h: 'ผู้รับ', cell: (r) => r.ReceivedBy || '-', cls: 'text-slate-600' },
                                { h: 'สถานะ', cell: (r) => (r.Status === 'Cancelled' ? <span className="text-slate-500 text-xs font-bold">ยกเลิก</span> : <span className="text-emerald-600 text-xs font-bold">ใช้งาน</span>) },
                            ]} />
                    </Card>
                    <Card>
                        <Title title="ราคาต่อหน่วยที่เปลี่ยน" hint={`เทียบ PO ล่าสุดกับ PO ก่อนหน้าที่ราคาต่างกัน • ${data.priceChangeTotal} สินค้า (ไม่ขึ้นกับช่วงวันที่)`} />
                        <Table limit={8} rows={data.priceChanges} rowKey={(r) => r.ProductID} empty="ไม่มีราคาที่เปลี่ยน"
                            columns={[
                                { h: 'สินค้า', cell: (r) => r.ProductName, cls: 'font-medium text-slate-800 max-w-[200px] truncate' },
                                { h: 'ก่อน', right: true, cell: (r) => baht(r.previous), cls: 'text-slate-500' },
                                { h: 'ล่าสุด', right: true, cell: (r) => baht(r.latest), cls: 'font-bold' },
                                { h: 'เปลี่ยน', right: true, cell: (r) => (
                                    <span className={`inline-flex items-center gap-1 font-bold ${r.pct > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                        {r.pct > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{r.pct > 0 ? '+' : ''}{r.pct}%
                                    </span>) },
                            ]} />
                    </Card>
                </div>

                <p className="text-xs text-slate-400 flex items-start gap-1.5 px-1"><Info size={13} className="mt-0.5 shrink-0" /> {data.note}</p>
            </>)}
        </div>
    );
}
