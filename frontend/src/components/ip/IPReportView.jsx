import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Network, Activity, Shield, AlertTriangle, Eye, Clock, Download, Printer, RefreshCw, Loader2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar } from 'recharts';
import * as XLSX from 'xlsx-js-style';

// รายงาน IP Management — โทนเดียวกับรายงานยืม-คืน / MA
const RANGES = [{ d: 7, label: '7 วัน' }, { d: 14, label: '14 วัน' }, { d: 30, label: '30 วัน' }, { d: 90, label: '90 วัน' }];
const dayLabel = (d) => { const [, m, dd] = String(d).split('-'); return `${Number(dd)}/${Number(m)}`; };

const Kpi = ({ icon: Icon, label, value, sub, tone = 'text-slate-800', accent = 'bg-slate-100 text-slate-500' }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}><Icon size={18} /></div>
        <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-500">{label}</div>
            <div className={`text-2xl font-black tabular-nums leading-tight ${tone}`}>{value}</div>
            {sub && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</div>}
        </div>
    </div>
);

const Card = ({ title, hint, children, right }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
            <div><h3 className="text-sm font-bold text-slate-700">{title}</h3>{hint && <p className="text-[11px] text-slate-400">{hint}</p>}</div>
            {right}
        </div>
        {children}
    </div>
);

export default function IPReportView({ api, authHeaders, onOpenSubnet }) {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [sortBy, setSortBy] = useState('usedPct');

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const r = await fetch(`${api}/report?days=${days}`, { headers: authHeaders() });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
            setData(await r.json());
        } catch (e) { setErr(e.message); }
        setLoading(false);
    }, [api, days, authHeaders]);
    useEffect(() => { load(); }, [load]);

    const k = data?.kpi;
    const subnets = useMemo(() => {
        const rows = [...(data?.bySubnet || [])];
        rows.sort((a, b) => sortBy === 'free' ? a.free - b.free : sortBy === 'unreserved' ? b.onlineUnreserved - a.onlineUnreserved : b.usedPct - a.usedPct);
        return rows;
    }, [data, sortBy]);
    const trend = useMemo(() => (data?.trend || []).map(t => ({ ...t, name: dayLabel(t.day) })), [data]);
    const activity = useMemo(() => (data?.activity || []).map(t => ({ ...t, name: dayLabel(t.day) })), [data]);
    const maxOwner = Math.max(1, ...(data?.topOwners || []).map(o => o.n));

    const exportXlsx = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
            { หัวข้อ: 'IP ทั้งหมด', ค่า: k.total }, { หัวข้อ: 'Subnet', ค่า: k.subnets }, { หัวข้อ: 'ใช้ไป (online หรือจอง)', ค่า: k.used },
            { หัวข้อ: 'ใช้ไป (%)', ค่า: k.usedPct }, { หัวข้อ: 'Online', ค่า: k.online }, { หัวข้อ: 'จองแล้ว', ค่า: k.reserved },
            { หัวข้อ: 'Online แต่ไม่ได้จอง', ค่า: k.onlineUnreserved }, { หัวข้อ: `จองค้าง (offline > ${k.staleDays} วัน)`, ค่า: k.staleReserved },
        ]), 'สรุป');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.bySubnet.map(s => ({
            Subnet: `${s.subnet}.x`, ทั้งหมด: s.total, Online: s.online, จองแล้ว: s.reserved, 'ใช้ไป': s.used, 'ใช้ไป (%)': s.usedPct, ว่าง: s.free,
            'Online ไม่ได้จอง': s.onlineUnreserved, 'จองค้าง': s.staleReserved,
        }))), 'ตาม Subnet');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.trend), 'แนวโน้มรายวัน');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.topOwners.map(o => ({ ผู้จอง: o.name, จำนวน: o.n }))), 'ผู้จอง');
        XLSX.writeFile(wb, `IP_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div className="space-y-5">
            <style>{`@media print { .no-print { display:none !important; } @page { size: A4 landscape; margin: 10mm; } }`}</style>
            <div className="no-print flex flex-wrap items-center gap-2">
                <div className="flex bg-slate-100 rounded-xl p-1">
                    {RANGES.map(r => (
                        <button key={r.d} onClick={() => setDays(r.d)}
                            className={`px-3 h-8 rounded-lg text-xs font-bold transition ${days === r.d ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}>{r.label}</button>
                    ))}
                </div>
                <span className="text-[11px] text-slate-400 mr-auto">แนวโน้มจากสแนปชอตรายวัน · ข้อมูล ณ {data ? new Date(data.generatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '…'}</span>
                <button onClick={load} className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center" title="รีเฟรช"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
                <button onClick={exportXlsx} disabled={!data} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-40"><Download size={14} />Excel</button>
                <button onClick={() => window.print()} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"><Printer size={14} />พิมพ์</button>
            </div>

            {err && <p className="text-sm text-red-600">โหลดรายงานไม่สำเร็จ: {err}</p>}
            {!data && !err && <div className="py-20 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={24} />กำลังโหลดรายงาน…</div>}

            {k && (
                <div className={`space-y-5 ${loading ? 'opacity-60' : ''} transition-opacity`}>
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                        <Kpi icon={Network} label="IP ทั้งหมด" value={k.total.toLocaleString()} sub={`${k.subnets} subnet`} />
                        <Kpi icon={Activity} label="ใช้ไปแล้ว" value={`${k.usedPct}%`} sub={`${k.used.toLocaleString()} (online หรือจอง)`} tone="text-indigo-600" accent="bg-indigo-50 text-indigo-600" />
                        <Kpi icon={Eye} label="Online" value={k.online.toLocaleString()} accent="bg-emerald-50 text-emerald-600" tone="text-emerald-600" />
                        <Kpi icon={Shield} label="จองแล้ว" value={k.reserved.toLocaleString()} accent="bg-amber-50 text-amber-600" />
                        <Kpi icon={AlertTriangle} label="Online ไม่ได้จอง" value={k.onlineUnreserved.toLocaleString()} sub="ไม่ทราบเจ้าของ" tone={k.onlineUnreserved ? 'text-orange-600' : 'text-slate-800'} accent="bg-orange-50 text-orange-600" />
                        <Kpi icon={Clock} label="จองค้าง" value={k.staleReserved.toLocaleString()} sub={`offline > ${k.staleDays} วัน`} tone={k.staleReserved ? 'text-rose-600' : 'text-slate-800'} accent="bg-rose-50 text-rose-600" />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                        <div className="xl:col-span-2">
                            <Card title="แนวโน้มจำนวน IP" hint={`รวมทุก subnet · ${trend.length} วันที่มีสแนปชอต`}>
                                {trend.length < 2 ? <p className="text-sm text-slate-400 py-12 text-center">ยังมีสแนปชอตไม่พอสำหรับวาดกราฟ</p> : (
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={trend} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#e2e8f0" />
                                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <Tooltip />
                                                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                                                <Line type="monotone" dataKey="online" name="Online" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                                                <Line type="monotone" dataKey="reserved" name="จองแล้ว" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                                                <Line type="monotone" dataKey="inactive" name="Inactive" stroke="#f43f5e" strokeWidth={2} dot={{ r: 2 }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </Card>
                        </div>
                        <Card title="ผู้จองมากที่สุด" hint="Top 10 (ตามชื่อผู้จอง)">
                            <ul className="space-y-3">
                                {data.topOwners.map(o => (
                                    <li key={o.name}>
                                        <div className="flex justify-between text-sm"><span className="truncate text-slate-700">{o.name}</span><b className="tabular-nums text-slate-800">{o.n}</b></div>
                                        <div className="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${(o.n / maxOwner) * 100}%` }} /></div>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2 text-[11px]">
                                {data.byType.map(t => <span key={t.name} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-semibold">{t.name} {t.n}</span>)}
                            </div>
                        </Card>
                    </div>

                    <Card title="การใช้งานแต่ละ Subnet" hint="แถบ = ใช้ไปแล้ว (เขียว online · เหลืองจองแต่ไม่ online) · กดเพื่อเปิด subnet"
                        right={
                            <div className="no-print flex bg-slate-100 rounded-lg p-0.5 text-[11px] font-bold">
                                {[['usedPct', 'ใช้มากสุด'], ['free', 'ว่างน้อยสุด'], ['unreserved', 'ไม่ได้จองมากสุด']].map(([key, label]) => (
                                    <button key={key} onClick={() => setSortBy(key)} className={`px-2.5 h-7 rounded-md ${sortBy === key ? 'bg-white text-indigo-700 shadow' : 'text-slate-500'}`}>{label}</button>
                                ))}
                            </div>
                        }>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead><tr className="text-[11px] text-slate-400 text-left">
                                    <th className="py-2 pr-3 font-semibold">Subnet</th><th className="py-2 pr-3 font-semibold w-1/3">การใช้งาน</th>
                                    <th className="py-2 px-2 font-semibold text-right">ใช้ไป</th><th className="py-2 px-2 font-semibold text-right">ว่าง</th>
                                    <th className="py-2 px-2 font-semibold text-right">Online</th><th className="py-2 px-2 font-semibold text-right">จอง</th>
                                    <th className="py-2 px-2 font-semibold text-right">ไม่ได้จอง</th><th className="py-2 pl-2 font-semibold text-right">จองค้าง</th>
                                </tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {subnets.map(s => {
                                        const onlinePct = (s.online / s.total) * 100;
                                        const rsvPct = ((s.used - s.online) / s.total) * 100;
                                        return (
                                            <tr key={s.subnet} onClick={() => onOpenSubnet?.(s.subnet)} className="hover:bg-slate-50 cursor-pointer">
                                                <td className="py-2.5 pr-3 font-mono font-bold text-slate-800 whitespace-nowrap">{s.subnet}.x</td>
                                                <td className="py-2.5 pr-3">
                                                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
                                                        <div className="h-full bg-emerald-500" style={{ width: `${onlinePct}%` }} />
                                                        <div className="h-full bg-amber-400" style={{ width: `${rsvPct}%` }} />
                                                    </div>
                                                </td>
                                                <td className={`py-2.5 px-2 text-right tabular-nums font-bold ${s.usedPct >= 90 ? 'text-rose-600' : s.usedPct >= 75 ? 'text-orange-600' : 'text-slate-700'}`}>{s.usedPct}%</td>
                                                <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">{s.free}</td>
                                                <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">{s.online}</td>
                                                <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">{s.reserved}</td>
                                                <td className={`py-2.5 px-2 text-right tabular-nums ${s.onlineUnreserved ? 'text-orange-600 font-semibold' : 'text-slate-400'}`}>{s.onlineUnreserved}</td>
                                                <td className={`py-2.5 pl-2 text-right tabular-nums ${s.staleReserved ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{s.staleReserved}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <Card title="กิจกรรมการจอง / ปล่อย / แก้ไข" hint={`รายวัน ใน ${days} วันล่าสุด`}>
                        {activity.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">ไม่มีกิจกรรมในช่วงนี้</p> : (
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={activity} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                        <Tooltip />
                                        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="reserve" name="จอง" stackId="a" fill="#10b981" />
                                        <Bar dataKey="release" name="ปล่อย" stackId="a" fill="#f59e0b" />
                                        <Bar dataKey="update" name="แก้ไข" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
}
