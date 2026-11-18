import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, AlertTriangle, ShoppingCart, Hourglass, Snowflake, Layers, Info } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import * as XLSX from 'xlsx';
import { API_BASE } from '../config/api';

const CLS = {
    A: { color: '#ef4444', badge: 'bg-red-50 text-red-700 border-red-200', hint: '80% แรกของมูลค่าเบิก' },
    B: { color: '#f59e0b', badge: 'bg-amber-50 text-amber-700 border-amber-200', hint: 'ถัดมา 15%' },
    C: { color: '#94a3b8', badge: 'bg-slate-100 text-slate-600 border-slate-200', hint: '5% สุดท้าย' },
};
const AGING_COLORS = ['#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];

const baht = (v) => `฿${Math.round(Number(v) || 0).toLocaleString()}`;
const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${Math.round(v)}`);

const Card = ({ children, className = '' }) => (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-200 ${className}`}>{children}</motion.div>
);

const Kpi = ({ icon: Icon, label, value, sub, tone }) => {
    const tones = { orange: 'bg-orange-50 text-orange-600', red: 'bg-red-50 text-red-600', sky: 'bg-sky-50 text-sky-600', indigo: 'bg-indigo-50 text-indigo-600' };
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

// ตารางที่ย่อไว้ก่อน กด "ดูทั้งหมด" เพื่อขยาย
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

const Title = ({ title, hint, right }) => (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div><h3 className="font-bold text-slate-800">{title}</h3>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>
        {right}
    </div>
);

export default function StockAnalysisView({ type, location }) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true); setErr('');
            try {
                const p = new URLSearchParams();
                if (type) p.set('type', type);
                if (location) p.set('location', location);
                const res = await fetch(`${API_BASE}/stock/report/analysis?${p.toString()}`);
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'โหลดรายงานไม่สำเร็จ');
                const json = await res.json();
                if (!cancelled) setData(json);
            } catch (e) { if (!cancelled) setErr(e.message); }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [type, location]);

    const exportExcel = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
        add('รายการสั่งซื้อ', data.reorder.items.map((r) => ({ 'สินค้า': r.ProductName, 'ประเภท': r.TypeLabel, 'Vendor': r.VendorName, 'คงเหลือ': r.CurrentStock, 'Min': r.MinStock, 'Max': r.MaxStock, 'สั่งเพิ่ม': r.suggestQty, 'ราคา (฿)': r.price, 'ประมาณการ (฿)': r.estCost, 'Lead time (วัน)': r.LeadTime, 'ใช้ได้อีก (วัน)': r.daysLeft ?? '' })));
        add('ABC', data.abc.items.map((r) => ({ 'Class': r.cls, 'สินค้า': r.ProductName, 'ประเภท': r.TypeLabel, 'เบิก 12 เดือน (ชิ้น)': r.qty, 'มูลค่าเบิก (฿)': r.value, 'สะสม (%)': r.cumPct })));
        add('Aging', data.aging.buckets.map((b) => ({ 'ช่วง': b.label, 'รายการ': b.count, 'มูลค่า (฿)': b.value, 'สัดส่วน (%)': b.share })));
        add('Dead stock', data.deadStock.items.map((r) => ({ 'สินค้า': r.ProductName, 'ประเภท': r.TypeLabel, 'สถานที่': r.Location, 'คงเหลือ': r.CurrentStock, 'มูลค่า (฿)': r.value, 'เบิกล่าสุด (วันที่แล้ว)': r.lastOutDays ?? 'ไม่เคยเบิก' })));
        add('Days of cover', data.daysOfCover.items.map((r) => ({ 'สินค้า': r.ProductName, 'คงเหลือ': r.CurrentStock, 'เบิกเฉลี่ย/วัน': r.dailyUse, 'ใช้ได้อีก (วัน)': r.days, 'Lead time (วัน)': r.LeadTime, 'วิกฤต': r.critical ? 'Y' : '' })));
        add('Turnover', data.turnover.map((t) => ({ 'ประเภท': t.key, 'มูลค่าคงคลัง (฿)': t.stockValue, 'มูลค่าเบิก 12 เดือน (฿)': t.outValue, 'Turnover (เท่า)': t.turnover ?? '', 'วันที่ stock อยู่ได้': t.daysOfStock ?? '' })));
        add('Overstock', data.overstock.items.map((r) => ({ 'สินค้า': r.ProductName, 'คงเหลือ': r.CurrentStock, 'Max': r.MaxStock, 'เกิน (ชิ้น)': r.excessQty, 'มูลค่าส่วนเกิน (฿)': r.excessValue })));
        XLSX.writeFile(wb, `Stock_Analysis_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div className="space-y-5">
            <Card className="flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                    <h2 className="text-lg font-black text-slate-800">วิเคราะห์สินค้าและรายการที่ต้องสั่งซื้อ</h2>
                    <p className="text-xs text-slate-500">{loading ? 'กำลังโหลด...' : 'กรอบเวลาคงที่: ABC 12 เดือน • Dead stock และอัตราเบิก 90 วัน'}</p>
                </div>
                <button onClick={exportExcel} disabled={!data} className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2">
                    <Download size={16} /> Export Excel
                </button>
            </Card>

            {err && <Card className="border-red-200 bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {err}</Card>}

            {data && (<>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Kpi icon={ShoppingCart} tone="orange" label="ต้องสั่งซื้อ" value={`${data.reorder.count} รายการ`} sub={`ประมาณการ ${baht(data.reorder.totalCost)}${data.reorder.noPrice ? ` • ไม่มีราคา ${data.reorder.noPrice}` : ''}`} />
                    <Kpi icon={Hourglass} tone="red" label="วิกฤต (ใช้หมดก่อนของมา)" value={`${data.daysOfCover.criticalCount} รายการ`} sub="Days of cover ≤ Lead time" />
                    <Kpi icon={Snowflake} tone="sky" label="Dead stock (90 วัน)" value={baht(data.deadStock.value)} sub={`${data.deadStock.count} รายการไม่มีการเบิก`} />
                    <Kpi icon={Layers} tone="indigo" label="Overstock" value={baht(data.overstock.value)} sub={`${data.overstock.count} รายการเกิน Max (ส่วนเกิน)`} />
                </div>

                <Card>
                    <Title title="🛒 รายการที่ต้องสั่งซื้อ" hint={`คงเหลือ ≤ Min • สั่งเพิ่ม = Max − คงเหลือ (ไม่มี Max ใช้ Min) • รวมประมาณการ ${baht(data.reorder.totalCost)}`} />
                    <Table limit={10} rows={data.reorder.items} rowKey={(r) => r.ProductID} empty="ไม่มีรายการต่ำกว่า Min"
                        columns={[
                            { h: 'สินค้า', cell: (r) => <span className="font-medium text-slate-800">{r.ProductName}</span>, cls: 'max-w-[260px] truncate' },
                            { h: 'ประเภท', cell: (r) => r.TypeLabel, cls: 'text-slate-600' },
                            { h: 'Vendor', cell: (r) => r.VendorName, cls: 'text-slate-600' },
                            { h: 'คงเหลือ', right: true, cell: (r) => <b>{r.CurrentStock}</b> },
                            { h: 'Min/Max', right: true, cell: (r) => `${r.MinStock}/${r.MaxStock || '-'}`, cls: 'text-slate-500' },
                            { h: 'สั่งเพิ่ม', right: true, cell: (r) => <b className="text-orange-600">{r.suggestQty}</b> },
                            { h: 'ประมาณการ', right: true, cell: (r) => (r.price > 0 ? baht(r.estCost) : <span className="text-red-500 text-xs font-bold">ไม่มีราคา</span>) },
                            { h: 'ใช้ได้อีก', right: true, cell: (r) => (r.daysLeft === null ? '-' : `${r.daysLeft} วัน`), cls: 'text-slate-500' },
                            { h: 'Lead time', right: true, cell: (r) => `${r.LeadTime} วัน`, cls: 'text-slate-500' },
                        ]} />
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card>
                        <Title title="ABC Analysis" hint={`มูลค่าเบิก 12 เดือน ${baht(data.abc.total)} • ${data.abc.itemCount} รายการที่มีการเบิก`} />
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            {['A', 'B', 'C'].map((c) => (
                                <div key={c} className="rounded-xl border border-slate-200 p-3 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-black ${CLS[c].badge}`}>{c}</span>
                                    <p className="text-lg font-black text-slate-800 mt-1">{data.abc.summary[c].count} <span className="text-xs font-normal text-slate-400">รายการ</span></p>
                                    <p className="text-[11px] text-slate-500">{data.abc.summary[c].share}% • {baht(data.abc.summary[c].value)}</p>
                                    <p className="text-[10px] text-slate-400">{CLS[c].hint}</p>
                                </div>
                            ))}
                        </div>
                        <Table limit={8} rows={data.abc.items} rowKey={(r) => r.ProductID} empty="ยังไม่มีการเบิกใน 12 เดือน"
                            columns={[
                                { h: 'Class', cell: (r) => <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-black ${CLS[r.cls].badge}`}>{r.cls}</span> },
                                { h: 'สินค้า', cell: (r) => r.ProductName, cls: 'font-medium text-slate-800 max-w-[200px] truncate' },
                                { h: 'ชิ้น', right: true, cell: (r) => r.qty.toLocaleString() },
                                { h: 'มูลค่าเบิก', right: true, cell: (r) => baht(r.value) },
                                { h: 'สะสม', right: true, cell: (r) => `${r.cumPct}%`, cls: 'text-slate-500' },
                            ]} />
                    </Card>

                    <Card>
                        <Title title="Stock Aging" hint={`มูลค่าคงคลัง ${baht(data.aging.total)} แยกตามเวลาที่เบิกล่าสุด`} />
                        <div style={{ height: 230 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.aging.buckets} margin={{ left: 0, right: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={compact} />
                                    <Tooltip content={({ active, payload }) => active && payload?.length ? (
                                        <div className="rounded-xl bg-slate-900 text-white px-3 py-2 text-xs shadow-xl">
                                            <p className="font-bold mb-1">{payload[0].payload.label}</p>
                                            <p>{baht(payload[0].payload.value)} ({payload[0].payload.share}%)</p>
                                            <p className="opacity-70">{payload[0].payload.count} รายการ</p>
                                        </div>) : null} />
                                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>{data.aging.buckets.map((_, i) => <Cell key={i} fill={AGING_COLORS[i]} />)}</Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">"ไม่เคยเบิก" {data.aging.buckets[4].count} รายการ มูลค่า {baht(data.aging.buckets[4].value)} ({data.aging.buckets[4].share}%)</p>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card>
                        <Title title="Days of cover" hint="คงเหลือใช้ได้กี่วัน (อัตราเบิกเฉลี่ย 90 วัน) • แดง = หมดก่อน Lead time" />
                        <Table limit={10} rows={data.daysOfCover.items} rowKey={(r) => r.ProductID} empty="ไม่มีสินค้าที่มีการเบิกใน 90 วัน"
                            columns={[
                                { h: 'สินค้า', cell: (r) => r.ProductName, cls: 'font-medium text-slate-800 max-w-[220px] truncate' },
                                { h: 'คงเหลือ', right: true, cell: (r) => r.CurrentStock },
                                { h: 'เบิก/วัน', right: true, cell: (r) => r.dailyUse, cls: 'text-slate-500' },
                                { h: 'ใช้ได้อีก', right: true, cell: (r) => <b className={r.critical ? 'text-red-600' : 'text-slate-800'}>{r.days} วัน</b> },
                                { h: 'Lead time', right: true, cell: (r) => `${r.LeadTime} วัน`, cls: 'text-slate-500' },
                            ]} />
                    </Card>

                    <Card>
                        <Title title="Turnover ตามประเภท" hint="มูลค่าเบิก 12 เดือน ÷ มูลค่าคงคลังปัจจุบัน (ประมาณการ)" />
                        <Table limit={10} rows={data.turnover} rowKey={(r) => r.key} empty="ไม่มีข้อมูล"
                            columns={[
                                { h: 'ประเภท', cell: (r) => r.key, cls: 'font-medium text-slate-800' },
                                { h: 'คงคลัง', right: true, cell: (r) => baht(r.stockValue) },
                                { h: 'เบิก 12 ด.', right: true, cell: (r) => baht(r.outValue) },
                                { h: 'Turnover', right: true, cell: (r) => (r.turnover === null ? '-' : `${r.turnover}x`), cls: 'font-bold' },
                                { h: 'อยู่ได้', right: true, cell: (r) => (r.daysOfStock === null ? '-' : `${r.daysOfStock} วัน`), cls: 'text-slate-500' },
                            ]} />
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card>
                        <Title title="Dead stock" hint={`ยังมีของแต่ไม่มีการเบิกใน 90 วัน • ${data.deadStock.count} รายการ ${baht(data.deadStock.value)}`} />
                        <Table limit={10} rows={data.deadStock.items} rowKey={(r) => r.ProductID} empty="ไม่มี Dead stock"
                            columns={[
                                { h: 'สินค้า', cell: (r) => r.ProductName, cls: 'font-medium text-slate-800 max-w-[220px] truncate' },
                                { h: 'คงเหลือ', right: true, cell: (r) => r.CurrentStock },
                                { h: 'มูลค่า', right: true, cell: (r) => baht(r.value), cls: 'font-bold' },
                                { h: 'เบิกล่าสุด', right: true, cell: (r) => (r.lastOutDays === null ? 'ไม่เคย' : `${r.lastOutDays} วันก่อน`), cls: 'text-slate-500' },
                            ]} />
                    </Card>
                    <Card>
                        <Title title="Overstock" hint={`คงเหลือเกิน Max • ส่วนเกินรวม ${baht(data.overstock.value)}`} />
                        <Table limit={10} rows={data.overstock.items} rowKey={(r) => r.ProductID} empty="ไม่มีรายการเกิน Max"
                            columns={[
                                { h: 'สินค้า', cell: (r) => r.ProductName, cls: 'font-medium text-slate-800 max-w-[220px] truncate' },
                                { h: 'คงเหลือ/Max', right: true, cell: (r) => `${r.CurrentStock}/${r.MaxStock}` },
                                { h: 'เกิน', right: true, cell: (r) => `+${r.excessQty}`, cls: 'text-sky-600 font-bold' },
                                { h: 'มูลค่าส่วนเกิน', right: true, cell: (r) => baht(r.excessValue), cls: 'font-bold' },
                            ]} />
                    </Card>
                </div>

                <p className="text-xs text-slate-400 flex items-start gap-1.5 px-1"><Info size={13} className="mt-0.5 shrink-0" /> {data.note}</p>
            </>)}
        </div>
    );
}
