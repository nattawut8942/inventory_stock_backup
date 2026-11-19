import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../../config/api';
import { RefreshCw, Loader2 } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

// รายงาน PC Inventory — ใช้สไตล์เดียวกับการ์ดสรุปในหน้า PC Inventory (กรอบขาว เส้นเทา ตัวเลขหนา)
const BAR = ['#3b82f6', '#6366f1', '#0ea5e9', '#14b8a6', '#8b5cf6', '#64748b'];
const STATUS = {
    Active: { label: 'ใช้งาน', color: '#10b981' },
    Inactive: { label: 'Inactive', color: '#f59e0b' },
    Disposed: { label: 'ทำทิ้งแล้ว', color: '#f43f5e' },
};

const Section = ({ title, hint, children, className = '' }) => (
    <div className={className}>
        <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1">
            {title}{hint && <span className="normal-case tracking-normal font-normal text-gray-400 ml-2">{hint}</span>}
        </div>
        {children}
    </div>
);

const Stat = ({ label, value, sub, valueClass = 'text-gray-800' }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-3 px-3.5 shadow-sm">
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className={`text-2xl font-bold leading-none mt-2 ${valueClass}`}>{value}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-1.5">{sub}</div>}
    </div>
);

const Card = ({ title, hint, children, className = '' }) => (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm p-4 ${className}`}>
        <div className="text-[13px] font-bold text-gray-800">{title}</div>
        {hint && <div className="text-[11px] text-gray-400 mb-3">{hint}</div>}
        {!hint && <div className="mb-3" />}
        {children}
    </div>
);

const Bars = ({ rows, limit = 8 }) => {
    const max = Math.max(1, ...rows.map(r => r.n));
    const total = rows.reduce((s, r) => s + r.n, 0) || 1;
    if (!rows.length) return <p className="text-[13px] text-gray-400 py-6 text-center">ไม่มีข้อมูล</p>;
    return (
        <ul className="space-y-2.5">
            {rows.slice(0, limit).map((r, i) => (
                <li key={r.name}>
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="truncate text-gray-700" title={r.name}>{r.name}</span>
                        <span className="tabular-nums shrink-0"><b className="text-gray-900">{r.n}</b> <span className="text-[11px] text-gray-400">{Math.round((r.n / total) * 100)}%</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(r.n / max) * 100}%`, background: BAR[i % BAR.length] }} />
                    </div>
                </li>
            ))}
        </ul>
    );
};

export default function PCReportView({ endpoint = '/pc-inventory/report', title = 'รายงาน PC' }) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState('');

    const load = async () => {
        setLoading(true); setErr('');
        try {
            const r = await fetch(`${API_BASE}${endpoint}`);
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
            setData(await r.json());
        } catch (e) { setErr(e.message); }
        setLoading(false);
    };
    useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

    const k = data?.kpi;
    const donut = useMemo(() => (data ? Object.entries(data.byStatus).filter(([, n]) => n > 0).map(([key, n]) => ({ key, name: STATUS[key]?.label || key, value: n, color: STATUS[key]?.color || '#94a3b8' })) : []), [data]);
    const warrantyRows = useMemo(() => (data?.warrantyList || []).filter(w => !q || `${w.hostname} ${w.fix_asset} ${w.location} ${w.user} ${w.model}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
    const warrantyPie = data ? [
        { name: 'ยังไม่หมด', value: data.warranty.valid, color: '#10b981' },
        { name: 'ใกล้หมด ≤ 90 วัน', value: data.warranty.soon, color: '#f59e0b' },
        { name: 'หมดแล้ว', value: data.warranty.expired, color: '#f43f5e' },
        { name: 'ไม่มีข้อมูล', value: data.warranty.unknown, color: '#cbd5e1' },
    ].filter(x => x.value > 0) : [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-[12px] font-bold uppercase tracking-widest text-gray-400 ml-1">{title}</div>
                    <div className="text-[12px] text-gray-400 ml-1">{data ? `ข้อมูล ณ ${new Date(data.generatedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}` : 'กำลังโหลด…'}</div>
                </div>
                <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold bg-white border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> รีเฟรช
                </button>
            </div>

            {err && <p className="text-[13px] text-red-600">โหลดรายงานไม่สำเร็จ: {err}</p>}
            {!data && !err && <div className="py-20 text-center text-gray-400 text-[13px]"><Loader2 className="animate-spin mx-auto mb-2" size={22} />กำลังโหลด…</div>}

            {k && (<>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                    <Stat label="เครื่องทั้งหมด" value={k.total.toLocaleString()} sub={`ใช้งาน ${k.active}`} />
                    <Stat label="ใช้งานอยู่" value={k.active.toLocaleString()} valueClass="text-emerald-600" sub={`${Math.round((k.active / (k.total || 1)) * 100)}% ของทั้งหมด`} />
                    <Stat label="Inactive" value={k.inactive} valueClass="text-amber-600" sub="ยังไม่ทำทิ้ง" />
                    <Stat label="ทำทิ้งแล้ว" value={k.disposed} valueClass="text-rose-600" sub="ไม่นับในสถิติ" />
                    <Stat label="ประกันหมด / ใกล้หมด" value={`${k.warrantyExpired} / ${k.warrantySoon}`} valueClass={k.warrantyExpired ? 'text-rose-600' : 'text-gray-800'} sub="≤ 90 วัน" />
                    <Stat label="ไม่มี Fix Asset" value={k.noFixAsset} valueClass={k.noFixAsset ? 'text-orange-600' : 'text-gray-800'} sub="เครื่องใช้งาน" />
                </div>

                <div className={`grid grid-cols-1 ${data.hasWarranty ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4`}>
                    <Card title="สถานะเครื่อง" hint="ทุกเครื่องในระบบ">
                        <div className="relative h-52">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={donut} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
                                        {donut.map(d => <Cell key={d.key} fill={d.color} />)}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <div className="text-[11px] text-gray-400">ทั้งหมด</div>
                                <div className="text-xl font-bold text-gray-800">{k.total}</div>
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1">
                            {donut.map(d => <span key={d.key} className="flex items-center gap-1.5 text-[12px] text-gray-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name} <b>{d.value}</b></span>)}
                        </div>
                    </Card>

                    {data.hasWarranty && <Card title="สถานะประกัน" hint="เฉพาะเครื่องที่ใช้งาน">
                        <div className="flex items-center gap-4">
                            <div className="w-32 h-32 shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={warrantyPie} dataKey="value" innerRadius={36} outerRadius={58} paddingAngle={2} stroke="none">
                                            {warrantyPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <ul className="space-y-2 text-[13px] flex-1">
                                {warrantyPie.map(d => (
                                    <li key={d.name} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-gray-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name}</span><b className="tabular-nums text-gray-800">{d.value}</b></li>
                                ))}
                            </ul>
                        </div>
                    </Card>}

                    {data.hasWarranty && <Card title="ประกันหมดในแต่ละปี" hint="เฉพาะเครื่องที่ใช้งาน">
                        {data.warrantyByYear.length === 0 ? <p className="text-[13px] text-gray-400 py-10 text-center">ไม่มีข้อมูลวันหมดประกัน</p> : (
                            <div className="h-40">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.warrantyByYear} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e5e7eb" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                        <Tooltip />
                                        <Bar dataKey="n" name="เครื่อง" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Card>}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Card title="ประเภทเครื่อง"><Bars rows={data.byType} /></Card>
                    <Card title="ยี่ห้อ" hint="Top 8"><Bars rows={data.byManufacturer} /></Card>
                    <Card title="ระบบปฏิบัติการ" hint="Top 8 · ใช้งานอยู่"><Bars rows={data.byOs} /></Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Card title="หน่วยความจำ (RAM)" hint="ใช้งานอยู่"><Bars rows={data.byRam} /></Card>
                    <Card title="สถานที่ติดตั้ง" hint="Top 12"><Bars rows={data.byLocation} limit={12} /></Card>
                    <Card title="ข้อมูลที่ยังไม่ครบ" hint="ควรกรอกเพิ่ม">
                        <ul className="space-y-2 text-[13px]">
                            <li className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"><span className="text-gray-600">ไม่มีวันซื้อ</span><b className="text-orange-600 tabular-nums">{k.noPurchaseDate}</b></li>
                            <li className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"><span className="text-gray-600">ไม่มี Fix Asset</span><b className="text-orange-600 tabular-nums">{k.noFixAsset}</b></li>
                            <li className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"><span className="text-gray-600">ไม่มีวันหมดประกัน</span><b className="text-gray-700 tabular-nums">{data.warranty.unknown}</b></li>
                            <li className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"><span className="text-gray-600">ไม่อัปเดตเกิน 30 วัน</span><b className="text-gray-700 tabular-nums">{k.stale30}</b></li>
                        </ul>
                    </Card>
                </div>

                {data.hasWarranty && <Section title="เครื่องที่ประกันใกล้หมดหรือหมดแล้ว" hint={`${data.warrantyList.length} เครื่อง · เรียงจากใกล้หมดที่สุด`}>
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
                            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา hostname / fix asset / สถานที่ / ผู้ใช้"
                                className="w-full sm:w-80 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-blue-400" />
                            <span className="text-[11px] text-gray-400 whitespace-nowrap">{warrantyRows.length} รายการ</span>
                        </div>
                        {warrantyRows.length === 0 ? <p className="text-[13px] text-gray-400 py-8 text-center">ไม่มีเครื่องที่ประกันใกล้หมดหรือหมดแล้ว</p> : (
                            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                                <table className="w-full text-[13px]">
                                    <thead className="sticky top-0 bg-gray-50 z-10"><tr className="text-[11px] text-gray-500 text-left">
                                        <th className="py-2 px-4 font-semibold">Hostname</th><th className="py-2 px-3 font-semibold">Fix Asset</th><th className="py-2 px-3 font-semibold">ยี่ห้อ / รุ่น</th><th className="py-2 px-3 font-semibold">สถานที่</th><th className="py-2 px-3 font-semibold">ผู้ใช้</th><th className="py-2 px-3 font-semibold">หมดประกัน</th><th className="py-2 px-4 font-semibold text-right">สถานะ</th>
                                    </tr></thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {warrantyRows.map(w => (
                                            <tr key={w.hostname} className="hover:bg-blue-50/40">
                                                <td className="py-2 px-4 font-mono font-bold text-gray-800">{w.hostname}</td>
                                                <td className="py-2 px-3 font-mono text-xs text-gray-500">{w.fix_asset || '—'}</td>
                                                <td className="py-2 px-3 text-gray-600 truncate max-w-[220px]">{[w.manufacturer, w.model].filter(Boolean).join(' ') || '—'}</td>
                                                <td className="py-2 px-3 text-gray-500 truncate max-w-[180px]">{w.location || '—'}</td>
                                                <td className="py-2 px-3 text-gray-500">{w.user || '—'}</td>
                                                <td className="py-2 px-3 tabular-nums text-gray-600">{w.warranty_expire_date}</td>
                                                <td className="py-2 px-4 text-right">{w.days < 0
                                                    ? <span className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-2 py-0.5">หมดแล้ว {Math.abs(w.days)} วัน</span>
                                                    : <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">อีก {w.days} วัน</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </Section>}
            </>)}
        </div>
    );
}
