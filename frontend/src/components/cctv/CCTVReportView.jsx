import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, Camera, WifiOff, Activity, Clock } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import * as XLSX from 'xlsx';
import { API_BASE } from '../../config/api';
import { usePager, PagerBar } from '../StockPager';

const RANGES = [{ id: 7, label: '7 วัน' }, { id: 30, label: '30 วัน' }, { id: 90, label: '90 วัน' }];
const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

// วันที่เป็นเวลาท้องถิ่น รูปแบบ YYYY-MM-DD
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => ymd(new Date());
const shiftDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };

const fmtDT = (v) => (v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-');
const fmtMin = (m) => {
    if (!m) return '0 นาที';
    if (m < 60) return `${m} นาที`;
    const h = Math.floor(m / 60); const r = m % 60;
    return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
};
const pctText = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const pctColor = (v, target) => (v === null || v === undefined ? 'text-slate-400' : v < target ? 'text-red-600 font-bold' : 'text-emerald-700');

const Stat = ({ icon: Icon, label, value, sub, tone = 'slate' }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Icon size={14} className={tone === 'red' ? 'text-red-500' : tone === 'green' ? 'text-emerald-600' : 'text-slate-400'} /> {label}
        </div>
        <div className={`mt-1 text-2xl font-bold tabular-nums ${tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
);

const STATUS_LABEL = {
    pending: 'รอดำเนินการ', in_progress: 'กำลังซ่อม', waiting_parts: 'รออะไหล่', resolved: 'แก้ไขแล้ว',
    removed: 'ถอดออกแล้ว', repairing: 'ส่งซ่อมอยู่', reinstalled: 'ติดตั้งคืนแล้ว', retired: 'เลิกใช้งาน', installed: 'ติดตั้งแล้ว',
};

// รายการจัดอันดับแบบแถบ (key + count)
const BarList = ({ items, empty = 'ไม่มีข้อมูล' }) => {
    if (!items || items.length === 0) return <p className="text-sm text-slate-400">{empty}</p>;
    const max = Math.max(...items.map((i) => i.count));
    return (
        <ul className="space-y-2.5">
            {items.map((i) => (
                <li key={i.key} className="text-sm">
                    <div className="flex justify-between gap-3"><span className="text-slate-800 break-words">{i.key}</span><span className="font-bold tabular-nums shrink-0">{i.count}</span></div>
                    <div className="h-2 rounded-full bg-slate-100 mt-1"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${(i.count / max) * 100}%` }} /></div>
                </li>
            ))}
        </ul>
    );
};

const Th = ({ children, right }) => (
    <th className={`px-3 py-2.5 font-bold ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);

export default function CCTVReportView() {
    const [from, setFrom] = useState(() => shiftDays(todayStr(), -29));
    const [to, setTo] = useState(() => todayStr());
    const setQuick = (n) => { setFrom(shiftDays(todayStr(), -(n - 1))); setTo(todayStr()); };
    const isQuick = (n) => to === todayStr() && from === shiftDays(todayStr(), -(n - 1));
    const setYear = (y) => { setFrom(`${y}-01-01`); setTo(`${y}-12-31` > todayStr() ? todayStr() : `${y}-12-31`); };
    const yearValue = (from.slice(5) === '01-01' && (to.slice(5) === '12-31' || to === todayStr()) && from.slice(0, 4) === to.slice(0, 4)) ? from.slice(0, 4) : '';
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [layout, setLayout] = useState('all');
    const [query, setQuery] = useState('');
    const [onlyProblem, setOnlyProblem] = useState(false);
    const [logType, setLogType] = useState('all');
    const [maintTab, setMaintTab] = useState('repair');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true); setErr('');
            try {
                const res = await fetch(`${API_BASE}/cctv/report?from=${from}&to=${to}`);
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'โหลดรายงานไม่สำเร็จ');
                const json = await res.json();
                if (!cancelled) setData(json);
            } catch (e) { if (!cancelled) setErr(e.message); }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [from, to]);

    const layouts = useMemo(() => [...new Set((data?.cameras || []).map((c) => c.layout))].sort(), [data]);

    const cameras = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = (data?.cameras || []).filter((c) => {
            if (layout !== 'all' && c.layout !== layout) return false;
            if (onlyProblem && !(c.status !== 'online' || (c.uptimePct !== null && c.uptimePct < data.kpi.target))) return false;
            return !q || [c.name, c.ip, c.rack].some((v) => String(v || '').toLowerCase().includes(q));
        });
        // แสดงกล้องที่ uptime ต่ำสุดก่อน (ที่ยังไม่มีข้อมูลไว้ท้าย)
        return list.sort((a, b) => (a.uptimePct ?? 101) - (b.uptimePct ?? 101));
    }, [data, layout, query, onlyProblem]);

    const camPager = usePager(cameras, 15);
    const eventPager = usePager(data?.events || [], 15);
    const logs = useMemo(() => (data?.logs || []).filter((l) => logType === 'all' || l.logType === logType), [data, logType]);
    const logPager = usePager(logs, 15);

    const exportExcel = () => {
        if (!data) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cameras.map((c) => ({
            'กล้อง': c.name, 'IP': c.ip, 'Layout': c.layout, 'Rack': c.rack, 'สถานะตอนนี้': c.status,
            'Uptime (%)': c.uptimePct ?? '', 'จำนวนตัวอย่าง (ping)': c.samples, 'ออฟไลน์ (ครั้ง)': c.offlineCount,
            'เวลาดาวน์ (นาที)': c.downtimeMin, 'ออฟไลน์ล่าสุด': fmtDT(c.lastOfflineAt),
            'ครั้งที่ซ่อม': c.repairCount, 'ครั้งที่ถอด': c.removalCount,
        }))), 'กล้อง');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.events.map((e) => ({
            'เวลา': fmtDT(e.changedAt), 'กล้อง': e.cameraName, 'สถานะใหม่': e.status, 'สถานะเดิม': e.prevStatus || '', 'แหล่งที่มา': e.source,
        }))), 'เหตุการณ์');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.daily.map((d) => ({
            'วันที่': d.day, 'Uptime (%)': d.uptimePct ?? '', 'ตอบสนอง': d.online, 'ทั้งหมด': d.total,
        }))), 'รายวัน');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((data.logs || []).map((l) => ({
            'ประเภท': l.logType === 'repair' ? 'ซ่อม' : l.logType === 'install' ? 'ติดตั้ง' : 'ถอด', 'กล้อง': l.cameraName, 'ปัญหา': l.issueType || '', 'เหตุผล': l.reason || '',
            'สถานะ': STATUS_LABEL[l.status] || l.status, 'ผู้รับผิดชอบ': l.assignedTo || '', 'ผู้แจ้ง': l.reportedBy || '',
            'แจ้งเมื่อ': fmtDT(l.reportedAt), 'แก้ไขเสร็จ': fmtDT(l.resolvedAt), 'ติดตั้งคืน': fmtDT(l.reinstalledAt),
            'สถานที่ใหม่': l.newLocation || '', 'รายละเอียด': l.description || '', 'วิธีแก้': l.solution || '',
        }))), 'งานซ่อมถอด');
        XLSX.writeFile(wb, `CCTV_Report_${from}_to_${to}.xlsx`);
    };

    const k = data?.kpi;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex p-1 rounded-xl bg-slate-100">
                    {RANGES.map((r) => (
                        <button key={r.id} onClick={() => setQuick(r.id)}
                            className={`px-3 h-8 rounded-lg text-xs font-bold ${isQuick(r.id) ? 'bg-white text-blue-700 shadow' : 'text-slate-500'}`}>{r.label}</button>
                    ))}
                </div>
                <select value={yearValue} onChange={(e) => e.target.value && setYear(Number(e.target.value))} className="h-9 px-3 rounded-xl border border-slate-200 text-sm bg-white">
                    <option value="">ดูทั้งปี</option>
                    {YEARS.map((y) => <option key={y} value={y}>ปี {y}</option>)}
                </select>
                <div className="flex items-center gap-2">
                    <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 px-2 rounded-xl border border-slate-200 text-sm bg-white" />
                    <span className="text-xs text-slate-400">ถึง</span>
                    <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-9 px-2 rounded-xl border border-slate-200 text-sm bg-white" />
                </div>
                <select value={layout} onChange={(e) => setLayout(e.target.value)} className="h-9 px-3 rounded-xl border border-slate-200 text-sm bg-white">
                    <option value="all">ทุก Layout</option>
                    {layouts.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <label className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                    <input type="checkbox" checked={onlyProblem} onChange={(e) => setOnlyProblem(e.target.checked)} /> เฉพาะกล้องที่มีปัญหา
                </label>
                <button onClick={exportExcel} disabled={!data}
                    className="ml-auto h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-40">
                    <Download size={14} /> Export Excel
                </button>
            </div>

            {err && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>}
            {loading && !data && <div className="text-sm text-slate-400 py-10 text-center">กำลังโหลดรายงาน...</div>}

            {k && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Stat icon={Camera} label="กล้องทั้งหมด" value={k.cameras} sub={`ออนไลน์ ${k.onlineNow} · ออฟไลน์ ${k.offlineNow} · ถอด/เลิกใช้ ${k.removedNow + k.retiredNow}`} tone={k.offlineNow ? 'red' : 'green'} />
                        <Stat icon={Activity} label={`Uptime เฉลี่ย ${data?.range?.days ?? ''} วัน`} value={pctText(k.avgUptimePct)} sub={`เป้าหมาย ${k.target}% · ต่ำกว่าเป้า ${k.belowTarget} ตัว`} tone={k.avgUptimePct !== null && k.avgUptimePct < k.target ? 'red' : 'green'} />
                        <Stat icon={WifiOff} label="ออฟไลน์ (ครั้ง)" value={k.offlineEvents} sub="นับจากการเปลี่ยนสถานะ" />
                        <Stat icon={Clock} label="เวลาดาวน์รวม" value={fmtMin(k.downtimeMin)} sub={`ซ่อม ${k.repairCount} ครั้ง · ถอด ${k.removalCount} ครั้ง`} />
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                        <h3 className="font-bold text-slate-800">Uptime รายวัน (ทุกกล้องรวมกัน)</h3>
                        <p className="text-xs text-slate-500 mb-3">เส้นประ = เป้าหมาย {k.target}%</p>
                        {data.daily.length === 0 ? (
                            <div className="text-sm text-slate-400 py-10 text-center">ยังไม่มีข้อมูล ping ในช่วงนี้</div>
                        ) : (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={data.daily} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                                        <Tooltip formatter={(v) => `${v}%`} />
                                        <ReferenceLine y={k.target} stroke="#ef4444" strokeDasharray="4 4" />
                                        <Line type="monotone" dataKey="uptimePct" name="Uptime" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                            <div className="mr-auto">
                                <h3 className="font-bold text-slate-800">รายงานรายกล้อง</h3>
                                <p className="text-xs text-slate-500">เรียงจาก uptime ต่ำสุด · {cameras.length} กล้อง</p>
                            </div>
                            <div className="relative">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ / IP / Rack"
                                    className="h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                            </div>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 text-xs">
                                    <tr>
                                        <Th>กล้อง</Th><Th>IP</Th><Th>Layout / Rack</Th><Th>สถานะตอนนี้</Th>
                                        <Th right>Uptime</Th><Th right>ออฟไลน์</Th><Th right>เวลาดาวน์</Th><Th>ออฟไลน์ล่าสุด</Th><Th right>ซ่อม / ถอด</Th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {camPager.pageRows.map((c) => (
                                        <tr key={c.id} className="hover:bg-slate-50">
                                            <td className="px-3 py-2 font-medium text-slate-800">{c.name}</td>
                                            <td className="px-3 py-2 text-slate-600 tabular-nums">{c.ip || '-'}</td>
                                            <td className="px-3 py-2 text-slate-600">{c.layout}{c.rack !== '-' ? ` / ${c.rack}` : ''}</td>
                                            <td className="px-3 py-2">
                                                <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${c.status === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : c.status === 'offline' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                    {{ online: 'ออนไลน์', offline: 'ออฟไลน์', removed: 'ถอดออก', retired: 'เลิกใช้งาน' }[c.status] || c.status || '-'}
                                                </span>
                                            </td>
                                            <td className={`px-3 py-2 text-right tabular-nums ${pctColor(c.uptimePct, k.target)}`}>{pctText(c.uptimePct)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{c.offlineCount}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{fmtMin(c.downtimeMin)}</td>
                                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDT(c.lastOfflineAt)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{c.repairCount} / {c.removalCount}</td>
                                        </tr>
                                    ))}
                                    {cameras.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">ไม่พบกล้อง</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <PagerBar {...camPager} />
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-1">ประวัติการเปลี่ยนสถานะ</h3>
                        <p className="text-xs text-slate-500 mb-3">
                            แสดง {Math.min(data.events.length, data.eventsTotal)} รายการล่าสุด จากทั้งหมด {data.eventsTotal.toLocaleString()} รายการในช่วงนี้
                        </p>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 text-xs">
                                    <tr><Th>เวลา</Th><Th>กล้อง</Th><Th>เปลี่ยนเป็น</Th><Th>จาก</Th><Th>แหล่งที่มา</Th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {eventPager.pageRows.map((e) => (
                                        <tr key={e.id} className="hover:bg-slate-50">
                                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDT(e.changedAt)}</td>
                                            <td className="px-3 py-2 font-medium text-slate-800">{e.cameraName}</td>
                                            <td className="px-3 py-2">
                                                <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${e.status === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                    {e.status === 'online' ? 'ออนไลน์' : 'ออฟไลน์'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">{e.prevStatus || '-'}</td>
                                            <td className="px-3 py-2 text-slate-500">{e.source === 'manual' ? 'ตั้งเอง' : 'Ping'}</td>
                                        </tr>
                                    ))}
                                    {data.events.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">ไม่มีการเปลี่ยนสถานะในช่วงนี้</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <PagerBar {...eventPager} />
                    </div>

                    {data.maintenance && (() => {
                        const m = data.maintenance;
                        const TABS = [
                            { id: 'repair', label: '🔧 ซ่อม', count: m.repair.total },
                            { id: 'removal', label: '📤 ถอด', count: m.removal.total },
                            { id: 'install', label: '🆕 ติดตั้ง', count: m.install?.total ?? 0 },
                        ];
                        const Tile = ({ value, label, tone = '' }) => (
                            <div className="rounded-xl bg-slate-50 p-3 text-center">
                                <div className={`text-3xl font-bold tabular-nums ${tone}`}>{value}</div>
                                <div className="text-xs text-slate-600 mt-1">{label}</div>
                            </div>
                        );
                        const Section = ({ title, children }) => (
                            <div>
                                <p className="text-sm font-bold text-slate-700 mb-2">{title}</p>
                                {children}
                            </div>
                        );
                        return (
                            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                    <h3 className="font-bold text-slate-800">🛠️ งานซ่อม / ถอด / ติดตั้ง</h3>
                                    <div className="flex p-1 rounded-xl bg-slate-100">
                                        {TABS.map(t => (
                                            <button key={t.id} onClick={() => setMaintTab(t.id)}
                                                className={`px-3 h-8 rounded-lg text-xs font-bold flex items-center gap-1.5 ${maintTab === t.id ? 'bg-white text-blue-700 shadow' : 'text-slate-500'}`}>
                                                {t.label}
                                                <span className="tabular-nums opacity-70">{t.count}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {maintTab === 'repair' && (
                                    <div className="space-y-5">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            <Tile value={m.repair.total} label="ทั้งหมด" />
                                            <Tile value={m.repair.open} label="ยังเปิดอยู่" tone="text-amber-600" />
                                            <Tile value={m.repair.resolved} label="แก้ไขแล้ว" tone="text-emerald-700" />
                                            <Tile value={m.repair.mttrDays ?? '—'} label={`MTTR (วัน) จาก ${m.repair.mttrSample} งาน${m.repair.mttrExcluded ? ` · ข้าม ${m.repair.mttrExcluded} รายการที่วันที่ผิด` : ''}`} />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 border-t border-slate-100 pt-4">
                                            <Section title="ประเภทปัญหา"><BarList items={m.repair.byIssue} /></Section>
                                            <Section title="เหตุผล"><BarList items={m.repair.byReason} /></Section>
                                            <Section title="ผู้รับผิดชอบ (งานเปิด)"><BarList items={m.repair.byAssignee} empty="ไม่มีงานเปิด" /></Section>
                                        </div>
                                    </div>
                                )}

                                {maintTab === 'removal' && (
                                    <div className="space-y-5">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            <Tile value={m.removal.total} label="ทั้งหมด" />
                                            <Tile value={m.removal.out} label="ยังไม่กลับ" tone="text-red-600" />
                                            <Tile value={m.removal.reinstalled} label="ติดตั้งคืนแล้ว" tone="text-emerald-700" />
                                            <Tile value={m.removal.retired} label="เลิกใช้งาน" />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border-t border-slate-100 pt-4">
                                            <Section title="เหตุผลการถอด"><BarList items={m.removal.byReason} /></Section>
                                            <Section title="กล้องที่ยังไม่ได้ติดตั้งคืน">
                                                {m.removal.outList.length === 0 ? <p className="text-sm text-slate-400">ไม่มี</p> : (
                                                    <ul className="text-sm space-y-2 max-h-56 overflow-y-auto">
                                                        {m.removal.outList.map(r => (
                                                            <li key={r.id} className="flex justify-between gap-3">
                                                                <span className="truncate">{r.cameraName}</span>
                                                                <span className="text-slate-500 whitespace-nowrap">{STATUS_LABEL[r.status] || r.status} · {r.daysOut} วัน</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </Section>
                                        </div>
                                    </div>
                                )}

                                {maintTab === 'install' && (
                                    <div className="space-y-5">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            <Tile value={m.install?.total ?? 0} label="ติดตั้งในช่วงนี้" tone="text-emerald-700" />
                                        </div>
                                        <div className="border-t border-slate-100 pt-4">
                                            <Section title="ผู้ติดตั้ง"><BarList items={m.install?.byAssignee} empty="ยังไม่มีการบันทึกการติดตั้ง" /></Section>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </>
            )}
        </div>
    );
}
