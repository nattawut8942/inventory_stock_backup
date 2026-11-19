import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Loader2, X, Upload, Download, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import PCMOSyncModal from './PCMOSyncModal';
import Portal from '../Portal';

// คุณภาพข้อมูล IP: จองแล้วข้อมูลไม่ครบ / online แต่ไม่มีใครจอง / จองค้าง + เติมข้อมูลหลายรายการ + นำเข้า Excel
const FIELDS = [
    { k: 'contact', label: 'ผู้รับผิดชอบ' },
    { k: 'location', label: 'สถานที่' },
    { k: 'ip_type', label: 'ประเภท IP' },
    { k: 'device', label: 'อุปกรณ์' },
    { k: 'purpose', label: 'วัตถุประสงค์' },
    { k: 'mac_address', label: 'MAC' },
];
const PAGE = 50;
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const LIMITS = { contact: 120, location: 150, device: 50, purpose: 50, owner_name: 120 };
const DHCP_KEY = 'ipQualityDhcpSubnets';
const blank = (v) => v == null || String(v).trim() === '';
const inputCls = 'mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 disabled:opacity-60';

const Overlay = ({ children, onClose, width = 'max-w-lg' }) => (
    <Portal>
        <div className="fixed inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className={`bg-white rounded-2xl shadow-2xl w-full ${width} max-h-[90vh] overflow-hidden flex flex-col`} onClick={e => e.stopPropagation()}>{children}</div>
        </div>
    </Portal>
);

// ─── เติมข้อมูล / จองหลายรายการ ───────────────────────────────────────────────
function BulkFillModal({ ips, mode, progress, onClose, onConfirm }) {
    const reserve = mode === 'rogue';
    const [f, setF] = useState({ owner_name: '', contact: '', location: '', device: '', purpose: '', ip_type: '' });
    const busy = !!progress;
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const ownerNeeded = reserve && !f.owner_name.trim();
    const filled = Object.values(f).some(v => v.trim());
    const submit = () => {
        const p = {};
        for (const [k, v] of Object.entries(f)) if (v.trim()) p[k] = v.trim();
        if (reserve) p.reservation_status = 'reserved';
        onConfirm(p);
    };
    return (
        <Overlay onClose={busy ? undefined : onClose}>
            <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-black text-slate-800">{reserve ? `จอง ${ips.length} IP` : `เติมข้อมูล ${ips.length} IP`}</h3>
                <p className="text-xs text-slate-500 mt-0.5">กรอกเฉพาะช่องที่ต้องการใส่ให้เหมือนกันทุกรายการ ช่องที่ว่างจะไม่ไปแก้ค่าเดิม</p>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
                {reserve && (
                    <label className="block"><span className="text-xs font-semibold text-slate-600">Owner / หน่วยงาน *</span>
                        <input autoFocus value={f.owner_name} onChange={set('owner_name')} disabled={busy} maxLength={LIMITS.owner_name} className={inputCls} /></label>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-xs font-semibold text-slate-600">ผู้รับผิดชอบ</span><input value={f.contact} onChange={set('contact')} disabled={busy} maxLength={LIMITS.contact} className={inputCls} /></label>
                    <label className="block"><span className="text-xs font-semibold text-slate-600">ประเภท IP</span>
                        <select value={f.ip_type} onChange={set('ip_type')} disabled={busy} className={inputCls}><option value="">— ไม่แก้ —</option><option>Static</option><option>DHCP</option></select></label>
                    <label className="block col-span-2"><span className="text-xs font-semibold text-slate-600">สถานที่ติดตั้ง</span><input value={f.location} onChange={set('location')} disabled={busy} maxLength={LIMITS.location} className={inputCls} /></label>
                    <label className="block"><span className="text-xs font-semibold text-slate-600">อุปกรณ์</span><input value={f.device} onChange={set('device')} disabled={busy} maxLength={LIMITS.device} className={inputCls} /></label>
                    <label className="block"><span className="text-xs font-semibold text-slate-600">วัตถุประสงค์</span><input value={f.purpose} onChange={set('purpose')} disabled={busy} maxLength={LIMITS.purpose} className={inputCls} /></label>
                </div>
                {busy && (
                    <div><div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                        <p className="text-xs text-slate-500 mt-1">กำลังบันทึก {progress.done}/{progress.total}…</p></div>
                )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
                <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50">ยกเลิก</button>
                <button onClick={submit} disabled={busy || ownerNeeded || !filled}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40">{reserve ? 'จอง' : 'บันทึก'}</button>
            </div>
        </Overlay>
    );
}

// ─── นำเข้าจาก Excel ──────────────────────────────────────────────────────────
const HEADER_ALIAS = {
    ip: 'ip_address', ipaddress: 'ip_address', ip_address: 'ip_address',
    owner: 'owner_name', ownername: 'owner_name', owner_name: 'owner_name',
    contact: 'contact', location: 'location', device: 'device', purpose: 'purpose', remark: 'remark',
    type: 'ip_type', iptype: 'ip_type', ip_type: 'ip_type',
    mac: 'mac_address', macaddress: 'mac_address', mac_address: 'mac_address',
    reserve: 'reserve', จอง: 'reserve',
};
const parseSheet = (rows) => rows.map((raw, idx) => {
    const r = {};
    for (const [h, v] of Object.entries(raw)) {
        const key = HEADER_ALIAS[String(h).toLowerCase().replace(/[\s-]/g, '')];
        if (key) r[key] = String(v ?? '').trim();
    }
    const errs = [];
    if (!IP_RE.test(r.ip_address || '') || r.ip_address.split('.').some(n => Number(n) > 255)) errs.push('IP ไม่ถูกต้อง');
    if (r.ip_type) { const t = r.ip_type.toLowerCase(); if (t === 'static') r.ip_type = 'Static'; else if (t === 'dhcp') r.ip_type = 'DHCP'; else errs.push('ประเภทต้องเป็น Static/DHCP'); }
    if (r.mac_address && !MAC_RE.test(r.mac_address)) errs.push('MAC ไม่ถูกต้อง');
    for (const [k, max] of Object.entries(LIMITS)) if ((r[k] || '').length > max) errs.push(`${k} ยาวเกิน ${max}`);
    r.reserve = ['y', 'yes', '1', 'true', 'จอง', 'x'].includes((r.reserve || '').toLowerCase());
    if (r.reserve && !r.owner_name) errs.push('จองต้องมี owner_name');
    return { ...r, _row: idx + 2, _errs: errs };
});

function ImportModal({ progress, onClose, onApply }) {
    const [rows, setRows] = useState(null);
    const [fileName, setFileName] = useState('');
    const [parseErr, setParseErr] = useState('');
    const fileRef = useRef(null);
    const busy = !!progress;
    const good = (rows || []).filter(r => !r._errs.length);
    const bad = (rows || []).length - good.length;

    const onFile = async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        setParseErr(''); setFileName(file.name);
        try {
            const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
            if (!data.length) throw new Error('ไม่พบข้อมูลในไฟล์');
            if (data.length > 1000) throw new Error('นำเข้าได้ครั้งละไม่เกิน 1,000 แถว');
            const parsed = parseSheet(data);
            if (!parsed.some(r => r.ip_address)) throw new Error('ไม่พบคอลัมน์ ip_address');
            setRows(parsed);
        } catch (err) { setRows(null); setParseErr(err.message); }
    };
    const template = () => {
        const ws = XLSX.utils.json_to_sheet([{ ip_address: '10.194.120.27', owner_name: 'DCI', contact: 'ชื่อ-นามสกุล', location: 'อาคาร A ชั้น 2', device: 'Printer', purpose: 'Office', ip_type: 'Static', mac_address: '00:1A:2B:3C:4D:5E', remark: '', reserve: '' }]);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'IP');
        XLSX.writeFile(wb, 'IP_import_template.xlsx');
    };
    return (
        <Overlay onClose={busy ? undefined : onClose} width="max-w-3xl">
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-black text-slate-800">นำเข้าข้อมูล IP จาก Excel</h3>
                    <p className="text-xs text-slate-500 mt-0.5">คอลัมน์: ip_address (จำเป็น), owner_name, contact, location, device, purpose, ip_type (Static/DHCP), mac_address, remark, reserve (Y = จอง) · ช่องว่างจะไม่แก้ค่าเดิม</p>
                </div>
                <button onClick={template} className="shrink-0 text-xs font-bold text-indigo-600 inline-flex items-center gap-1 hover:underline"><Download size={13} />เทมเพลต</button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={busy}
                    className="w-full border-2 border-dashed border-slate-200 rounded-xl py-6 text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 flex flex-col items-center gap-1">
                    <Upload size={20} />{fileName || 'เลือกไฟล์ .xlsx / .csv'}
                </button>
                {parseErr && <p className="text-sm text-red-600">{parseErr}</p>}
                {rows && (<>
                    <p className="text-sm"><b className="text-emerald-600">{good.length}</b> แถวพร้อมนำเข้า{bad > 0 && <> · <b className="text-red-600">{bad}</b> แถวมีปัญหา (จะถูกข้าม)</>}</p>
                    <div className="border border-slate-200 rounded-xl overflow-auto max-h-64">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 sticky top-0"><tr className="text-left text-slate-500"><th className="p-2">#</th><th className="p-2">IP</th><th className="p-2">Owner</th><th className="p-2">ผู้รับผิดชอบ</th><th className="p-2">สถานที่</th><th className="p-2">ประเภท</th><th className="p-2">จอง</th><th className="p-2">ผลตรวจ</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.slice(0, 200).map(r => (
                                    <tr key={r._row} className={r._errs.length ? 'bg-red-50/60' : ''}>
                                        <td className="p-2 text-slate-400">{r._row}</td><td className="p-2 font-mono">{r.ip_address}</td><td className="p-2">{r.owner_name}</td>
                                        <td className="p-2">{r.contact}</td><td className="p-2">{r.location}</td><td className="p-2">{r.ip_type}</td><td className="p-2">{r.reserve ? '✓' : ''}</td>
                                        <td className="p-2">{r._errs.length ? <span className="text-red-600">{r._errs.join(', ')}</span> : <span className="text-emerald-600">OK</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {rows.length > 200 && <p className="text-[11px] text-slate-400">แสดง 200 แถวแรก จากทั้งหมด {rows.length}</p>}
                </>)}
                {busy && (
                    <div><div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                        <p className="text-xs text-slate-500 mt-1">กำลังนำเข้า {progress.done}/{progress.total}…</p></div>
                )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
                <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50">ปิด</button>
                <button onClick={() => onApply(good)} disabled={busy || !good.length}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40">นำเข้า {good.length || ''} แถว</button>
            </div>
        </Overlay>
    );
}

// ─── ตารางรายการแบบเลือกได้ + แบ่งหน้า ─────────────────────────────────────────
function PickTable({ rows, cols, selected, setSelected, canEdit, onOpenIP, empty }) {
    const [page, setPage] = useState(0);
    useEffect(() => { setPage(0); }, [rows]);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    const view = rows.slice(page * PAGE, page * PAGE + PAGE);
    const allOn = view.length > 0 && view.every(r => selected.has(r.ip_address));
    const toggle = (ip) => setSelected(s => { const n = new Set(s); n.has(ip) ? n.delete(ip) : n.add(ip); return n; });
    if (!rows.length) return <p className="text-sm text-slate-400 py-12 text-center flex flex-col items-center gap-1"><CheckCircle2 className="text-emerald-500" size={22} />{empty}</p>;
    return (
        <div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead><tr className="text-[11px] text-slate-400 text-left border-b border-slate-100">
                        {canEdit && <th className="py-2 pl-4 w-8"><input type="checkbox" checked={allOn} onChange={() => setSelected(s => { const n = new Set(s); view.forEach(r => allOn ? n.delete(r.ip_address) : n.add(r.ip_address)); return n; })} /></th>}
                        <th className="py-2 px-3 font-semibold">IP</th>
                        {cols.map(c => <th key={c.k} className="py-2 px-3 font-semibold">{c.label}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                        {view.map(r => (
                            <tr key={r.ip_address} className="hover:bg-slate-50">
                                {canEdit && <td className="py-2 pl-4"><input type="checkbox" checked={selected.has(r.ip_address)} onChange={() => toggle(r.ip_address)} /></td>}
                                <td className="py-2 px-3"><button onClick={() => onOpenIP(r.ip_address)} className="font-mono font-bold text-indigo-600 hover:underline">{r.ip_address}</button></td>
                                {cols.map(c => <td key={c.k} className="py-2 px-3 text-slate-600">{c.cell ? c.cell(r) : (blank(r[c.k]) ? <span className="text-rose-400 text-xs">ว่าง</span> : r[c.k])}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
                    <span>{page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} จาก {rows.length}</span>
                    <div className="flex items-center gap-1">
                        <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40"><ChevronLeft size={14} /></button>
                        <span className="px-2">{page + 1}/{pages}</span>
                        <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40"><ChevronRight size={14} /></button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function IPQualityView({ api, authHeaders, canEdit, putIP, actor, onOpenIP, onChanged, showToast }) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState('missing'); // missing | rogue | stale
    const [field, setField] = useState('any'); // กรองฟิลด์ที่ว่าง
    const [rogueSn, setRogueSn] = useState('');
    const [selected, setSelected] = useState(() => new Set());
    const [modal, setModal] = useState(null); // 'fill' | 'import' | 'release'
    const [progress, setProgress] = useState(null);
    const [dhcp, setDhcp] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(DHCP_KEY) || '[]')); } catch { return new Set(); } });
    useEffect(() => { try { localStorage.setItem(DHCP_KEY, JSON.stringify([...dhcp])); } catch { /* ignore */ } }, [dhcp]);

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const r = await fetch(`${api}/quality`, { headers: authHeaders() });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
            setData(await r.json());
        } catch (e) { setErr(e.message); }
        setLoading(false);
    }, [api, authHeaders]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { setSelected(new Set()); }, [tab, field, rogueSn]);

    const missingRows = useMemo(() => {
        if (!data) return [];
        const keys = field === 'any' ? ['contact', 'location', 'ip_type'] : [field];
        return data.reserved.filter(r => keys.some(k => blank(r[k])));
    }, [data, field]);
    const rogueAll = useMemo(() => (data?.rogue || []).filter(r => !dhcp.has(r.subnet)), [data, dhcp]);
    const rogueRows = useMemo(() => rogueSn ? rogueAll.filter(r => r.subnet === rogueSn) : rogueAll, [rogueAll, rogueSn]);
    const rogueBySubnet = useMemo(() => {
        const m = new Map();
        for (const r of data?.rogue || []) m.set(r.subnet, (m.get(r.subnet) || 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    }, [data]);
    const staleSet = useMemo(() => new Set(data?.stale || []), [data]);
    const staleRows = useMemo(() => (data?.reserved || []).filter(r => staleSet.has(r.ip_address)), [data, staleSet]);

    const toggleDhcp = (sn) => setDhcp(s => { const n = new Set(s); n.has(sn) ? n.delete(sn) : n.add(sn); return n; });

    // เขียนทีละรายการ (ใช้ putIP ของหน้าหลัก → เก็บประวัติ + updated_by)
    const runBatch = async (items, label) => {
        let ok = 0; const failed = [];
        for (let i = 0; i < items.length; i++) {
            setProgress({ done: i, total: items.length });
            const e = await putIP(items[i].ip, items[i].payload);
            if (e) failed.push(`${items[i].ip}: ${e}`); else ok++;
        }
        setProgress(null); setModal(null); setSelected(new Set());
        showToast?.(failed.length ? `${label} ${ok} รายการ — ไม่สำเร็จ ${failed.length} (${failed[0]})` : `✓ ${label} ${ok} รายการ`, failed.length ? 'error' : 'success');
        await load();
        onChanged?.();
    };
    const applyFill = (payload) => {
        const ips = [...selected];
        const p = { ...payload };
        if (p.reservation_status === 'reserved') p.reserveby = actor;
        runBatch(ips.map(ip => ({ ip, payload: p })), p.reservation_status === 'reserved' ? 'จอง' : 'เติมข้อมูล');
    };
    const applyRelease = () => runBatch([...selected].map(ip => ({ ip, payload: { reservation_status: 'available', reserveby: '' } })), 'ยกเลิกการจอง');
    const applyImport = (rows) => {
        const items = rows.map(r => {
            const p = {};
            for (const k of ['owner_name', 'contact', 'location', 'device', 'purpose', 'ip_type', 'remark']) if (r[k]) p[k] = r[k];
            if (r.mac_address) p.mac_address = r.mac_address.toUpperCase().replace(/-/g, ':');
            if (r.reserve) { p.reservation_status = 'reserved'; p.reserveby = actor; }
            return { ip: r.ip_address, payload: p };
        }).filter(i => Object.keys(i.payload).length);
        runBatch(items, 'นำเข้า');
    };

    const counts = data?.counts || {};
    const incomplete = data ? new Set([...(data.missing.contact || []), ...(data.missing.location || []), ...(data.missing.ip_type || [])]).size : 0;

    const TabBtn = ({ id, label, count, tone }) => (
        <button onClick={() => setTab(id)} className={`px-4 h-10 rounded-xl text-sm font-bold transition inline-flex items-center gap-2 ${tab === id ? 'bg-indigo-600 text-white shadow' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {label}<span className={`px-1.5 rounded-md text-[11px] ${tab === id ? 'bg-white/25' : tone}`}>{count}</span>
        </button>
    );
    const actionBar = (children) => canEdit && (
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 mr-auto">เลือกแล้ว <b className="text-slate-800">{selected.size}</b> รายการ</span>
            {children}
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-slate-500 mr-auto">ตรวจรายการ IP ที่ข้อมูลไม่ครบ ไม่ทราบเจ้าของ หรือจองค้าง แล้วแก้ทีละหลายรายการ</p>
                {canEdit && <button onClick={() => setModal('sync')} className="h-9 px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-indigo-700 shadow-sm"><Layers size={14} />เติมจาก PC/MO</button>}
                {canEdit && <button onClick={() => setModal('import')} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50"><Upload size={14} />นำเข้า Excel</button>}
                <button onClick={load} className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center" title="รีเฟรช"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
            </div>
            {err && <p className="text-sm text-red-600">โหลดไม่สำเร็จ: {err}</p>}
            {!data && !err && <div className="py-20 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2" size={24} />กำลังตรวจสอบ…</div>}

            {data && (<>
                <div className="flex flex-wrap gap-2">
                    <TabBtn id="missing" label="จองแล้วข้อมูลไม่ครบ" count={incomplete} tone="bg-amber-100 text-amber-700" />
                    <TabBtn id="rogue" label="Online แต่ไม่มีใครจอง" count={rogueAll.length} tone="bg-orange-100 text-orange-700" />
                    <TabBtn id="stale" label={`จองค้าง (offline > ${data.staleDays} วัน)`} count={staleRows.length} tone="bg-rose-100 text-rose-700" />
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {tab === 'missing' && (<>
                        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500">ขาด:</span>
                            {[{ k: 'any', label: 'ผู้รับผิดชอบ / สถานที่ / ประเภท', n: incomplete }, ...FIELDS.map(f => ({ ...f, n: counts[f.k] || 0 }))].map(f => (
                                <button key={f.k} onClick={() => setField(f.k)}
                                    className={`px-2.5 h-7 rounded-lg text-xs font-bold border ${field === f.k ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{f.label} <span className="opacity-60">{f.n}</span></button>
                            ))}
                        </div>
                        {actionBar(<button onClick={() => setModal('fill')} disabled={!selected.size || !!progress} className="px-3 h-8 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40">เติมข้อมูลที่เลือก</button>)}
                        <PickTable rows={missingRows} selected={selected} setSelected={setSelected} canEdit={canEdit} onOpenIP={onOpenIP} empty="ข้อมูลครบทุกรายการ"
                            cols={[{ k: 'owner_name', label: 'Owner' }, { k: 'contact', label: 'ผู้รับผิดชอบ' }, { k: 'location', label: 'สถานที่' }, { k: 'ip_type', label: 'ประเภท' }, { k: 'device', label: 'อุปกรณ์' }]} />
                    </>)}

                    {tab === 'rogue' && (<>
                        <div className="px-4 py-3 border-b border-slate-100 space-y-2">
                            <p className="text-xs text-slate-500">IP ที่ตอบ ping แต่ยังไม่มีใครจอง — เครือข่ายที่แจก IP อัตโนมัติ (DHCP) ไม่ต้องจอง ให้กด <b>"ไม่ต้องจอง"</b> ที่ subnet นั้นเพื่อซ่อนออกจากรายการ (จำไว้ในเบราว์เซอร์นี้)</p>
                            <div className="flex flex-wrap gap-1.5">
                                <button onClick={() => setRogueSn('')} className={`px-2.5 h-7 rounded-lg text-xs font-bold border ${!rogueSn ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>ทั้งหมด {rogueAll.length}</button>
                                {rogueBySubnet.map(([sn, n]) => {
                                    const off = dhcp.has(sn);
                                    return (
                                        <span key={sn} className={`inline-flex items-center rounded-lg border text-xs font-bold overflow-hidden ${off ? 'border-slate-200 bg-slate-50 text-slate-400' : rogueSn === sn ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                                            <button onClick={() => !off && setRogueSn(rogueSn === sn ? '' : sn)} className={`px-2 h-7 font-mono ${off ? 'line-through' : ''}`}>{sn} <span className="opacity-60 font-sans">{n}</span></button>
                                            <button onClick={() => { toggleDhcp(sn); if (rogueSn === sn) setRogueSn(''); }} title={off ? 'กลับมานับ' : 'ไม่ต้องจอง (DHCP)'} className="px-1.5 h-7 border-l border-slate-200 text-[10px] hover:bg-slate-100">{off ? '↺' : '✕'}</button>
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                        {actionBar(<button onClick={() => setModal('fill')} disabled={!selected.size || !!progress} className="px-3 h-8 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40">จองที่เลือก</button>)}
                        <PickTable rows={rogueRows} selected={selected} setSelected={setSelected} canEdit={canEdit} onOpenIP={onOpenIP} empty="ไม่มี IP ที่ online โดยไม่มีผู้จอง"
                            cols={[{ k: 'hostname', label: 'ชื่อเครื่อง', cell: r => r.hostname && r.hostname !== '-' ? r.hostname : <span className="text-slate-300">—</span> }, { k: 'subnet', label: 'Subnet', cell: r => <span className="font-mono text-xs">{r.subnet}.x</span> }, { k: 'last_seen_active', label: 'เห็นล่าสุด', cell: r => (r.last_seen_active || '').slice(0, 16) }]} />
                    </>)}

                    {tab === 'stale' && (<>
                        <div className="px-4 py-3 border-b border-slate-100 text-xs text-slate-500">จองไว้แต่ไม่เคย online หรือ offline เกิน {data.staleDays} วัน — ตรวจสอบแล้วคืน IP ให้ว่างได้</div>
                        {actionBar(<button onClick={() => setModal('release')} disabled={!selected.size || !!progress} className="px-3 h-8 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40">ยกเลิกการจองที่เลือก</button>)}
                        <PickTable rows={staleRows} selected={selected} setSelected={setSelected} canEdit={canEdit} onOpenIP={onOpenIP} empty="ไม่มีรายการจองค้าง"
                            cols={[{ k: 'owner_name', label: 'Owner' }, { k: 'reserveby', label: 'ผู้จอง' }, { k: 'idle_days', label: 'Offline', cell: r => r.idle_days == null ? <span className="text-rose-500 text-xs">ไม่เคย online</span> : `${r.idle_days} วัน` }, { k: 'remark', label: 'หมายเหตุ', cell: r => <span className="truncate block max-w-[220px]">{r.remark || '—'}</span> }]} />
                    </>)}
                </div>
            </>)}

            {modal === 'fill' && <BulkFillModal ips={[...selected]} mode={tab === 'rogue' ? 'rogue' : 'missing'} progress={progress} onClose={() => setModal(null)} onConfirm={applyFill} />}
            {modal === 'sync' && <PCMOSyncModal api={api} authHeaders={authHeaders} onClose={() => setModal(null)} onDone={load} showToast={showToast} />}
            {modal === 'import' && <ImportModal progress={progress} onClose={() => setModal(null)} onApply={applyImport} />}
            {modal === 'release' && (
                <Overlay onClose={progress ? undefined : () => setModal(null)} width="max-w-sm">
                    <div className="p-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center mb-3"><AlertTriangle size={22} /></div>
                        <h3 className="font-black text-slate-800">ยกเลิกการจอง {selected.size} IP?</h3>
                        <p className="text-xs text-slate-500 mt-1">IP จะกลับเป็นว่าง และบันทึกประวัติไว้ในไทม์ไลน์</p>
                        {progress && <p className="text-xs text-slate-500 mt-3">กำลังบันทึก {progress.done}/{progress.total}…</p>}
                        <div className="flex gap-2 mt-5">
                            <button onClick={() => setModal(null)} disabled={!!progress} className="flex-1 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600">ยกเลิก</button>
                            <button onClick={applyRelease} disabled={!!progress} className="flex-1 py-2 rounded-xl text-sm font-bold bg-rose-600 text-white disabled:opacity-50">ยืนยัน</button>
                        </div>
                    </div>
                </Overlay>
            )}
        </div>
    );
}
