import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, AlertTriangle, ClipboardCheck, PackageCheck, ShieldAlert, TrendingUp, TrendingDown, Info, MapPinOff, CircleDollarSign } from 'lucide-react';
import * as XLSX from 'xlsx';
import { API_BASE } from '../config/api';
import { usePager, PagerBar } from './StockPager';

const SESSION_STATUS = {
    Draft: { label: 'ร่าง', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
    Confirmed: { label: 'ยืนยันแล้ว (รอปรับ)', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
    Adjusted: { label: 'ปรับแล้ว', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};
const RANGES = [
    { id: '3m', label: '3 เดือน' },
    { id: '6m', label: '6 เดือน' },
    { id: '12m', label: '12 เดือน' },
    { id: 'all', label: 'ทั้งหมด' },
];
const QUALITY_TABS = [
    { id: 'noPrice', label: 'ไม่มีราคา', icon: CircleDollarSign, hint: 'ไม่นับในมูลค่าคงคลังและรายงานสั่งซื้อ' },
    { id: 'noLocation', label: 'ไม่มี Location', icon: MapPinOff, hint: 'มูลค่าตามสถานที่จะไปอยู่กลุ่ม "ไม่ระบุ"' },
    { id: 'negative', label: 'สต็อกติดลบ', icon: ShieldAlert, hint: 'ควรตรวจการเบิกหรือการรับเข้าที่ทำให้ยอดติดลบ' },
    { id: 'minGtMax', label: 'Min > Max', icon: AlertTriangle, hint: 'ค่าตั้งขั้นต่ำสูงกว่าสูงสุด ทำให้คำนวณสั่งซื้อผิด' },
];

const baht = (v) => `฿${Math.round(Number(v) || 0).toLocaleString()}`;
const fmtDT = (d) => (d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
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
    const tones = { indigo: 'bg-indigo-50 text-indigo-600', emerald: 'bg-emerald-50 text-emerald-600', orange: 'bg-orange-50 text-orange-600', red: 'bg-red-50 text-red-600', slate: 'bg-slate-100 text-slate-600' };
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

// ตารางแบ่งหน้า (limit = จำนวนรายการต่อหน้า)
const Table = ({ columns, rows, limit = 10, empty = 'ไม่มีข้อมูล', rowKey }) => {
    const pager = usePager(rows, limit);
    return (
        <>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 text-xs">
                        <tr>{columns.map((c) => <th key={c.h} className={`px-3 py-2.5 font-bold ${c.right ? 'text-right' : 'text-left'}`}>{c.h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {pager.pageRows.map((r, i) => (
                            <tr key={rowKey ? rowKey(r) : pager.pageStart + i} className="hover:bg-slate-50">
                                {columns.map((c) => <td key={c.h} className={`px-3 py-2 ${c.right ? 'text-right tabular-nums' : ''} ${c.cls || ''}`}>{c.cell(r)}</td>)}
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">{empty}</td></tr>}
                    </tbody>
                </table>
            </div>
            <PagerBar curPage={pager.curPage} totalPages={pager.totalPages} setPage={pager.setPage} pageStart={pager.pageStart} pageSize={pager.pageSize} total={pager.total} />
        </>
    );
};

export default function StockCountQualityView() {
    const [range, setRange] = useState('12m');
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [qTab, setQTab] = useState('noPrice');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true); setErr('');
            try {
                const p = new URLSearchParams(rangeOf(range));
                const res = await fetch(`${API_BASE}/stock/report/count-quality?${p.toString()}`);
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
        const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'หมายเหตุ': 'ไม่มีข้อมูล' }]), name);
        add('Session', data.sessions.map((s) => ({ 'รหัส': s.SessionCode, 'วันที่นับ': fmtDT(s.CountDate), 'ผู้ยืนยัน': s.ConfirmedBy, 'รายการที่นับ': s.TotalItems, 'มีส่วนต่าง': s.DiffItems, 'สถานะ': SESSION_STATUS[s.Status]?.label || s.Status, 'หมายเหตุ': s.Note })));
        add('ส่วนต่าง', data.diffItems.map((d) => ({ 'สินค้า': d.ProductName, 'ประเภท': d.TypeLabel, 'ระบบ': d.SystemQty, 'นับจริง': d.ActualQty, 'ส่วนต่าง': d.DiffQty, 'ราคา (฿)': d.price, 'มูลค่า (฿)': d.value, 'Session': d.SessionCode, 'วันที่นับ': fmtDT(d.CountDate), 'สถานะ': SESSION_STATUS[d.Status]?.label || d.Status })));
        add('สินค้าที่ปรับบ่อย', data.frequent.map((f) => ({ 'สินค้า': f.key, 'ประเภท': f.TypeLabel, 'จำนวนครั้ง': f.count, 'ส่วนต่างสุทธิ (ชิ้น)': f.netQty, 'มูลค่าสุทธิ (฿)': f.netValue })));
        QUALITY_TABS.forEach((t) => add(`คุณภาพ-${t.label}`, data.quality[t.id].items.map((p) => ({ 'สินค้า': p.ProductName, 'ประเภท': p.TypeLabel, 'คงเหลือ': p.CurrentStock, 'Min': p.MinStock, 'Max': p.MaxStock, 'ราคา (฿)': p.LastPrice, 'Location': p.Location }))));
        XLSX.writeFile(wb, `Stock_Count_Quality_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const c = data?.count;
    const q = data?.quality;
    const activeQ = QUALITY_TABS.find((t) => t.id === qTab);

    return (
        <div className="space-y-5">
            <Card className="flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                    <h2 className="text-lg font-black text-slate-800">ผลตรวจนับสต็อกและคุณภาพข้อมูล</h2>
                    <p className="text-xs text-slate-500">{loading ? 'กำลังโหลด...' : 'ผลนับตามช่วงวันที่ • คุณภาพข้อมูลดูทั้งระบบ'}</p>
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

            {data && c && (<>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Kpi icon={ClipboardCheck} tone="indigo" label="Session ที่นับ" value={`${c.sessions}`} sub={Object.entries(c.sessionStatus).map(([s, n]) => `${SESSION_STATUS[s]?.label || s} ${n}`).join(' • ') || '-'} />
                    <Kpi icon={PackageCheck} tone="slate" label="รายการที่นับ" value={c.itemsCounted.toLocaleString()} sub={`มีส่วนต่าง ${c.diffItems} รายการ`} />
                    <Kpi icon={TrendingUp} tone="emerald" label="มูลค่าที่ปรับแล้ว (สุทธิ)" value={baht(c.adjustedValue)} sub={`เพิ่ม ${c.plusItems} • ลด ${c.minusItems} รายการ`} />
                    <Kpi icon={TrendingDown} tone="orange" label="รอปรับ" value={baht(c.pendingValue)} sub={`${c.pendingCount} รายการ (ยืนยันแล้วแต่ยังไม่ปรับ)`} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card>
                        <Title title="Session การนับ" hint={`${data.sessions.length} session ในช่วงที่เลือก`} />
                        <Table limit={8} rows={data.sessions} rowKey={(s) => s.SessionCode} empty="ไม่มี session ในช่วงนี้"
                            columns={[
                                { h: 'รหัส', cell: (s) => <span className="font-mono text-xs">{s.SessionCode}</span> },
                                { h: 'วันที่นับ', cell: (s) => fmtDT(s.CountDate), cls: 'text-slate-500 whitespace-nowrap' },
                                { h: 'นับ', right: true, cell: (s) => s.TotalItems },
                                { h: 'ส่วนต่าง', right: true, cell: (s) => <b className={s.DiffItems ? 'text-orange-600' : 'text-slate-400'}>{s.DiffItems}</b> },
                                { h: 'สถานะ', cell: (s) => <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${SESSION_STATUS[s.Status]?.badge || ''}`}>{SESSION_STATUS[s.Status]?.label || s.Status}</span> },
                            ]} />
                    </Card>

                    <Card>
                        <Title title="สินค้าที่ปรับบ่อย" hint="จำนวน session ที่มีส่วนต่าง (ตามช่วงวันที่)" />
                        <Table limit={8} rows={data.frequent} rowKey={(f) => f.key} empty="ไม่มีส่วนต่างในช่วงนี้"
                            columns={[
                                { h: 'สินค้า', cell: (f) => f.key, cls: 'font-medium text-slate-800 max-w-[220px] truncate' },
                                { h: 'ครั้ง', right: true, cell: (f) => <b>{f.count}</b> },
                                { h: 'ส่วนต่างสุทธิ', right: true, cell: (f) => <span className={f.netQty >= 0 ? 'text-emerald-600' : 'text-red-600'}>{f.netQty > 0 ? '+' : ''}{f.netQty}</span> },
                                { h: 'มูลค่าสุทธิ', right: true, cell: (f) => baht(f.netValue), cls: 'text-slate-600' },
                            ]} />
                    </Card>
                </div>

                <Card>
                    <Title title="รายการส่วนต่างจากการนับ" hint="เรียงตามมูลค่าส่วนต่างสูงสุด (รวม session ยืนยันแล้วที่ยังไม่ปรับ)" />
                    <Table limit={10} rows={data.diffItems} rowKey={(d) => `${d.SessionCode}-${d.ProductName}`} empty="ไม่มีส่วนต่าง"
                        columns={[
                            { h: 'สินค้า', cell: (d) => d.ProductName, cls: 'font-medium text-slate-800 max-w-[240px] truncate' },
                            { h: 'ระบบ', right: true, cell: (d) => d.SystemQty },
                            { h: 'นับจริง', right: true, cell: (d) => d.ActualQty },
                            { h: 'ส่วนต่าง', right: true, cell: (d) => <b className={d.DiffQty > 0 ? 'text-emerald-600' : 'text-red-600'}>{d.DiffQty > 0 ? '+' : ''}{d.DiffQty}</b> },
                            { h: 'มูลค่า', right: true, cell: (d) => <span className={d.value >= 0 ? 'text-emerald-700' : 'text-red-700'}>{baht(d.value)}</span> },
                            { h: 'Session', cell: (d) => <span className="font-mono text-xs text-slate-500">{d.SessionCode}</span> },
                            { h: 'สถานะ', cell: (d) => <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${SESSION_STATUS[d.Status]?.badge || ''}`}>{SESSION_STATUS[d.Status]?.label || d.Status}</span> },
                        ]} />
                </Card>

                {q && (
                    <Card>
                        <Title title="คุณภาพข้อมูลสินค้า" hint={`ทั้งระบบ ${q.total} รายการ (Active) • มีปัญหาอย่างน้อยหนึ่งข้อ ${q.issueItems} รายการ`} />
                        <div className="flex flex-wrap gap-2 mb-4">
                            {QUALITY_TABS.map((t) => {
                                const Icon = t.icon;
                                const n = q[t.id].count;
                                return (
                                    <button key={t.id} onClick={() => setQTab(t.id)}
                                        className={`flex items-center gap-2 px-3 h-9 rounded-xl text-xs font-bold border transition-all ${qTab === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                        <Icon size={14} /> {t.label}
                                        <span className={`px-1.5 rounded-md ${qTab === t.id ? 'bg-white/20' : n ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{n}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-xs text-slate-500 mb-3">{activeQ.hint}</p>
                        <Table limit={10} rows={q[qTab].items} rowKey={(p) => p.ProductID} empty="ไม่พบปัญหาในหัวข้อนี้ ✓"
                            columns={[
                                { h: 'สินค้า', cell: (p) => p.ProductName, cls: 'font-medium text-slate-800 max-w-[260px] truncate' },
                                { h: 'ประเภท', cell: (p) => p.TypeLabel, cls: 'text-slate-600' },
                                { h: 'Location', cell: (p) => <span className={p.Location === 'ไม่ระบุ' ? 'text-red-500 font-bold' : 'text-slate-600'}>{p.Location}</span> },
                                { h: 'คงเหลือ', right: true, cell: (p) => <span className={p.CurrentStock < 0 ? 'text-red-600 font-bold' : ''}>{p.CurrentStock}</span> },
                                { h: 'Min/Max', right: true, cell: (p) => `${p.MinStock}/${p.MaxStock || '-'}`, cls: 'text-slate-500' },
                                { h: 'ราคา', right: true, cell: (p) => (p.LastPrice > 0 ? baht(p.LastPrice) : <span className="text-red-500 font-bold">ไม่มี</span>) },
                            ]} />
                    </Card>
                )}

                <p className="text-xs text-slate-400 flex items-start gap-1.5 px-1"><Info size={13} className="mt-0.5 shrink-0" /> {data.note}</p>
            </>)}
        </div>
    );
}
