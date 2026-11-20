import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Download, X, Plus, Edit2, Trash2, Zap, AlertTriangle } from 'lucide-react';
import Portal from '../Portal';
import { API_BASE } from '../../config/api';
import { MgmtSection, MgmtTable, SecondaryButton } from './MgmtTable';
import HelpPopover from '../HelpPopover';

// คำอธิบายว่าเก็บอะไร หน้าไหน (ต้องตรงกับ backend/src/services/auditLogService.js → TRACKED / SKIP)
const TRACKED_GROUPS = [
    ['Stock', 'สินค้า, หมวดอุปกรณ์, ผู้จัดหา, สถานที่, เหตุผลการเบิก, หมวดงบประมาณ'],
    ['MA / License', 'รายการ MA (รวมสถานะ/การต่ออายุ), ประเภท MA'],
    ['IP / อุปกรณ์', 'IP Management, PC Inventory, Monitor'],
    ['CCTV', 'กล้อง (รวมสถานะ/ตำแหน่ง), Rack, Switch, บันทึกซ่อมบำรุง, Record Server'],
    ['อื่นๆ', 'แผนผังโรงงาน, หมวดกิจกรรม, บทบาทผู้ใช้'],
];
const AuditLogHelp = () => (
    <HelpPopover title="ประวัติการทำงานเก็บอะไรบ้าง" label="อธิบายประวัติการทำงาน" width={440}>
        <div className="space-y-3 text-xs text-slate-600">
            <div>
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5"><span className="px-1.5 py-px rounded bg-emerald-50 text-emerald-700 text-[10px]">ทุกหน้า</span>บันทึกทุกการเพิ่ม / แก้ไข / ลบ</div>
                <p>ทุกหน้าในระบบ (Stock, PO, รับของ, ตรวจนับ, MA, IP, PC, CCTV, Printer, Ink/Toner, Sound, ยืม-คืน, IT Request, ปฏิทิน, Activity, KB, Quota, Management ฯลฯ) — เก็บ ใคร · เมื่อไหร่ · ทำอะไร · รายการไหน · ข้อมูลที่ส่ง · สำเร็จไหม · IP</p>
            </div>
            <div>
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5"><span className="px-1.5 py-px rounded bg-indigo-50 text-indigo-700 text-[10px]">เพิ่มเติม</span>เห็น "ค่าเดิม → ค่าใหม่" และข้อมูลก่อนลบ</div>
                <ul className="space-y-0.5">
                    {TRACKED_GROUPS.map(([g, list]) => <li key={g}><b className="text-slate-700">{g}:</b> {list}</li>)}
                </ul>
                <p className="mt-1 text-slate-400">หน้าอื่นเห็นเฉพาะข้อมูลที่ส่งมา (เช่น ตรวจนับ, รับของ, PO — ดูยอดที่เปลี่ยนได้จากประวัติรับ/เบิกอยู่แล้ว)</p>
            </div>
            <div>
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5"><span className="px-1.5 py-px rounded bg-slate-100 text-slate-600 text-[10px]">ไม่เก็บ</span>สิ่งที่ไม่อยู่ในประวัตินี้</div>
                <ul className="list-disc list-inside space-y-0.5">
                    <li>การเปิด/ดูข้อมูล (เก็บเฉพาะการเปลี่ยนข้อมูล)</li>
                    <li>การ login/logout — ดูที่ "ประวัติเข้าระบบ"</li>
                    <li>งานที่ระบบทำเองตามเวลา (ping CCTV, สแกนปริ้นเตอร์/IP ตามรอบ, ส่งอีเมล) — แต่ถ้ามีคนกดสั่งเองจะถูกเก็บ</li>
                    <li>ข้อมูลที่ agent ในเครื่อง PC ส่งเข้ามาเอง</li>
                    <li>การแก้ฐานข้อมูลโดยตรง (ไม่ผ่านเว็บ)</li>
                </ul>
            </div>
            <p className="pt-2 border-t border-slate-100 text-[11px] text-slate-400">ไม่เก็บรหัสผ่าน/token · ไฟล์เก็บแค่ชื่อ · เก็บย้อนหลัง 365 วัน · ดูได้เฉพาะ Admin</p>
        </div>
    </HelpPopover>
);

// ชื่อหน้า/ส่วนของระบบ จากส่วนแรกของ path (ที่ไม่รู้จักจะแสดงตามเดิม)
export const MODULE_LABELS = {
    products: 'สินค้า', types: 'หมวดอุปกรณ์', vendors: 'ผู้จัดหา', locations: 'สถานที่', reasons: 'เหตุผลการเบิก',
    pos: 'ใบสั่งซื้อ (PO)', 'po-attachments': 'ไฟล์แนบ PO', receive: 'รับของ', invoice: 'ใบแจ้งหนี้', 'stock-count': 'ตรวจนับสต็อก',
    budgets: 'หมวดงบประมาณ', ma: 'MA / License', 'ma-types': 'ประเภท MA', 'ink-toner': 'หมึก/โทนเนอร์',
    'pc-inventory': 'PC Inventory', 'pc-inventory-bulk': 'PC Inventory', 'pc-location': 'ตำแหน่ง PC', 'mo-inventory': 'Monitor', 'mo-location': 'ตำแหน่ง Monitor',
    devices: 'Devices Layout', cctv: 'CCTV', calendar: 'ปฏิทิน', reminders: 'การแจ้งเตือน', 'ip-scan': 'IP Management', quota: 'Quota',
    'printer-health': 'Printer Health', 'printer-locations': 'ตำแหน่งปริ้นเตอร์', sound: 'Sound Engineering', borrowings: 'ระบบยืม-คืน',
    'knowledge-base': 'Knowledge Base', albums: 'กิจกรรม', photos: 'รูปกิจกรรม', upload: 'อัปโหลดไฟล์', 'activity-categories': 'หมวดกิจกรรม',
    'factory-layouts': 'แผนผังโรงงาน', permissions: 'สิทธิ์การใช้งาน', 'stock-users': 'ผู้ใช้', 'admin-users': 'ผู้ใช้ (เดิม)', 'it-request': 'IT Request',
};
const moduleLabel = (m) => MODULE_LABELS[m] || m || '-';

const ACTION_META = {
    create: { label: 'เพิ่ม', cls: 'bg-emerald-50 text-emerald-700', icon: Plus },
    update: { label: 'แก้ไข', cls: 'bg-sky-50 text-sky-700', icon: Edit2 },
    delete: { label: 'ลบ', cls: 'bg-rose-50 text-rose-700', icon: Trash2 },
    action: { label: 'ดำเนินการ', cls: 'bg-violet-50 text-violet-700', icon: Zap },
};
const ActionChip = ({ a }) => {
    const m = ACTION_META[a] || { label: a, cls: 'bg-slate-100 text-slate-600', icon: Zap };
    const Icon = m.icon;
    return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${m.cls}`}><Icon size={11} />{m.label}</span>;
};

// แสดงเป็นเวลาท้องถิ่น (driver ส่งมาเป็น ISO แบบ UTC — เหมือน formatDbDate ในหน้า Management)
const fmt = (d) => {
    const t = d ? new Date(d) : null;
    if (!t || isNaN(t)) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
};
const parseBody = (b) => { if (!b) return null; try { return JSON.parse(b); } catch { return b; } };

// ระดับ 2: การเปลี่ยนแปลง (คอลัมน์ Changes หรือ Body.__changes ถ้ายังไม่มีคอลัมน์)
const changesOf = (r) => {
    if (r.__ch !== undefined) return r.__ch;
    let c = null;
    if (r.Changes) { try { c = JSON.parse(r.Changes); } catch { c = null; } }
    if (!c && r.Body) { const b = parseBody(r.Body); if (b && typeof b === 'object' && b.__changes) c = b.__changes; }
    r.__ch = c; // cache บนแถว
    return c;
};
// ชื่อช่องที่พบบ่อยเป็นภาษาไทย (ที่เหลือแสดงชื่อคอลัมน์ตามจริง)
const FIELD_TH = {
    ProductName: 'ชื่อสินค้า', MinStock: 'ขั้นต่ำ', MaxStock: 'สูงสุด', CurrentStock: 'คงเหลือ', LastPrice: 'ราคาล่าสุด', Location: 'สถานที่',
    DeviceType: 'หมวด', ManagementType: 'ประเภทการจัดการ', DefaultManagementType: 'ค่าเริ่มต้นการจัดการ', IsActive: 'ใช้งาน', IsAsset: 'Asset',
    UnitOfMeasure: 'หน่วย', BarcodeID: 'บาร์โค้ด', ImageURL: 'รูป', VendorName: 'ชื่อผู้จัดหา', ContactInfo: 'ข้อมูลติดต่อ', Name: 'ชื่อ', Label: 'ชื่อ',
    TypeName: 'ชื่อประเภท', Category: 'หมวด', CategoryLabel: 'ชื่อหมวด', CategoryCode: 'รหัส', BudgetFormat: 'รูปแบบเลขงบ', Role: 'บทบาท', TypeId: 'ประเภท',
    ColorHex: 'สี', SortOrder: 'ลำดับ', Status: 'สถานะ', pc_status: 'สถานะเครื่อง', owner_name: 'ผู้ใช้งาน', Note: 'หมายเหตุ', Reason: 'เหตุผล',
    Qty: 'จำนวน', ActualQty: 'จำนวนนับได้', EmployeeName: 'ชื่อพนักงาน', EmployeeCode: 'รหัสพนักงาน', CostCenter: 'Cost Center',
    name: 'ชื่อ', status: 'สถานะ', location: 'ตำแหน่ง', ip_address: 'IP', hostname: 'ชื่อเครื่อง', remark: 'หมายเหตุ', note: 'หมายเหตุ', Remark: 'หมายเหตุ',
};
const fieldLabel = (f) => (FIELD_TH[f] ? `${FIELD_TH[f]} (${f})` : f);
const showVal = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'ใช่' : 'ไม่';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return fmt(v);
    return String(v);
};
const changePreview = (c) => {
    if (!c) return null;
    if (c.deleted) return 'เก็บข้อมูลก่อนลบไว้';
    const f = c.fields || [];
    if (f.length === 0) return 'ไม่มีช่องที่เปลี่ยน';
    const first = f.slice(0, 2).map((x) => `${FIELD_TH[x.field] || x.field}: ${showVal(x.from)} → ${showVal(x.to)}`).join(' · ');
    return f.length > 2 ? `${first} · +${f.length - 2} ช่อง` : first;
};

export default function AuditLogTab({ UserAvatar, authHeaders }) {
    const [state, setState] = useState({ loading: false, ready: true, rows: [], limit: 2000, retentionDays: 365, error: '' });
    const [days, setDays] = useState(7);
    const [action, setAction] = useState('');
    const [moduleF, setModuleF] = useState('');
    const [resultF, setResultF] = useState('');
    const [search, setSearch] = useState('');
    const [detail, setDetail] = useState(null);

    const load = useCallback(async () => {
        setState((s) => ({ ...s, loading: true, error: '' }));
        try {
            const p = new URLSearchParams({ days: String(days) });
            if (action) p.set('action', action);
            if (moduleF) p.set('module', moduleF);
            if (resultF) p.set('result', resultF);
            const res = await fetch(`${API_BASE}/audit-log?${p}`, { headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'โหลดไม่สำเร็จ');
            setState({ loading: false, ready: data.ready !== false, rows: data.rows || [], limit: data.limit || 2000, retentionDays: data.retentionDays || 365, error: '' });
        } catch (err) {
            setState((s) => ({ ...s, loading: false, error: err.message }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days, action, moduleF, resultF]);
    useEffect(() => { load(); }, [load]);

    const counts = useMemo(() => {
        const c = { create: 0, update: 0, delete: 0, action: 0, fail: 0, users: new Set() };
        for (const r of state.rows) { c[r.Action] = (c[r.Action] || 0) + 1; if (!r.Success) c.fail += 1; if (r.EmpCode) c.users.add(r.EmpCode); }
        return c;
    }, [state.rows]);
    const modules = useMemo(() => [...new Set(state.rows.map((r) => r.Module).filter(Boolean))].sort((a, b) => moduleLabel(a).localeCompare(moduleLabel(b), 'th')), [state.rows]);

    const exportCsv = () => {
        const q = search.trim().toLowerCase();
        const rows = state.rows.filter((r) => !q || [r.Name, r.Username, r.EmpCode, moduleLabel(r.Module), r.Summary, r.Path, r.RecordId].join(' ').toLowerCase().includes(q));
        const head = ['เวลา', 'รหัสพนักงาน', 'ชื่อ', 'การทำงาน', 'ส่วนของระบบ', 'รายการ', 'รหัสรายการ', 'ผลลัพธ์', 'HTTP', 'Path', 'IP', 'การเปลี่ยนแปลง', 'ข้อมูลที่ส่ง'];
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [head.map(esc).join(',')].concat(rows.map((r) => [
            fmt(r.CreatedAt), r.EmpCode, r.Name || r.Username, ACTION_META[r.Action]?.label || r.Action, moduleLabel(r.Module), r.Summary, r.RecordId,
            r.Success ? 'สำเร็จ' : 'ไม่สำเร็จ', r.StatusCode, `${r.Method} ${r.Path}`, r.IpAddress,
            (() => { const c = changesOf(r); if (!c) return ''; if (c.deleted) return `ลบ: ${JSON.stringify(c.deleted)}`; return (c.fields || []).map((x) => `${x.field}: ${showVal(x.from)} → ${showVal(x.to)}`).join(' | '); })(),
            r.Body,
        ].map(esc).join(',')));
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `audit-log_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    if (!state.ready) {
        return (
            <MgmtSection title="ประวัติการทำงาน">
                <div className="px-4 py-6 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex gap-3">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <div>ยังไม่ได้สร้างตารางเก็บประวัติ (<code>Stock_AuditLog</code>) — ต้องรัน migration <code>2026-11-21_stock_audit_log.sql</code> ก่อน ระบบจะเริ่มบันทึกอัตโนมัติหลังรัน</div>
                </div>
            </MgmtSection>
        );
    }

    const sel = 'h-10 px-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 bg-white';
    return (
        <MgmtSection
            title="ประวัติการทำงาน" count={state.rows.length} titleExtra={<AuditLogHelp />}
            subtitle={<>
                ทุกการเพิ่ม/แก้ไข/ลบ ที่ผู้ใช้ทำในระบบ · เพิ่ม <b className="text-emerald-600">{counts.create}</b> · แก้ไข <b className="text-sky-600">{counts.update}</b> · ลบ <b className="text-rose-600">{counts.delete}</b> · ดำเนินการ <b className="text-violet-600">{counts.action}</b> · ไม่สำเร็จ <b className="text-amber-600">{counts.fail}</b> · ผู้ใช้ {counts.users.size} คน
                <span className="block text-slate-400">เก็บย้อนหลัง {state.retentionDays} วัน · ไม่เก็บรหัสผ่าน/token และไฟล์ (เก็บแค่ชื่อไฟล์){state.rows.length >= state.limit ? ` · แสดง ${state.limit.toLocaleString()} รายการล่าสุด — ใช้ตัวกรองเพื่อดูเพิ่ม` : ''}</span>
            </>}
            actions={<SecondaryButton icon={Download} onClick={exportCsv} disabled={state.rows.length === 0}>Export CSV</SecondaryButton>}
        >
            {state.error && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">{state.error}</div>}
            <MgmtTable
                search={search} onSearch={setSearch} loading={state.loading} rows={state.rows} rowKey={(r) => r.AuditID} pageSize={25} minWidth={900} dense
                searchText={(r) => [r.Name, r.Username, r.EmpCode, moduleLabel(r.Module), r.Summary, r.Path, r.RecordId, r.Body, r.Changes].join(' ')}
                searchPlaceholder="ค้นหาชื่อคน, รายการ, ข้อมูลที่แก้…" emptyText="ยังไม่มีประวัติในช่วงนี้"
                rowClassName={(r) => (r.Success ? 'cursor-pointer' : 'cursor-pointer bg-amber-50/40')}
                rowProps={(r) => ({ onClick: () => setDetail(r), title: 'ดูรายละเอียด' })}
                toolbar={<>
                    <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="ช่วงเวลา" className={sel}>
                        <option value={1}>24 ชม.</option><option value={7}>7 วัน</option><option value={30}>30 วัน</option><option value={90}>90 วัน</option><option value={365}>1 ปี</option>
                    </select>
                    <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="การทำงาน" className={sel}>
                        <option value="">ทุกการทำงาน</option>
                        {Object.entries(ACTION_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                    </select>
                    <select value={moduleF} onChange={(e) => setModuleF(e.target.value)} aria-label="ส่วนของระบบ" className={sel}>
                        <option value="">ทุกส่วนของระบบ</option>
                        {(moduleF && !modules.includes(moduleF) ? [moduleF, ...modules] : modules).map((m) => <option key={m} value={m}>{moduleLabel(m)}</option>)}
                    </select>
                    <select value={resultF} onChange={(e) => setResultF(e.target.value)} aria-label="ผลลัพธ์" className={sel}>
                        <option value="">ทุกผลลัพธ์</option><option value="ok">สำเร็จ</option><option value="fail">ไม่สำเร็จ</option>
                    </select>
                    <button type="button" onClick={load} title="รีเฟรช" aria-label="รีเฟรช" className="h-10 w-10 flex items-center justify-center border border-slate-200 rounded-xl bg-white text-slate-500 hover:text-indigo-600">
                        <RefreshCw size={16} className={state.loading ? 'animate-spin' : ''} />
                    </button>
                </>}
                columns={[
                    { key: 'time', label: 'เวลา', sortValue: (r) => r.CreatedAt, render: (r) => <span className="font-mono text-slate-600 whitespace-nowrap">{fmt(r.CreatedAt)}</span> },
                    { key: 'user', label: 'ผู้ใช้', sortValue: (r) => r.Name || r.Username, render: (r) => (
                        <span className="whitespace-nowrap">
                            <b className="text-slate-700">{r.Name || r.Username || '-'}</b>
                            {r.EmpCode ? <span className="ml-1.5 text-[11px] text-slate-400 font-mono">{r.EmpCode}</span> : null}
                        </span>
                    ) },
                    { key: 'action', label: 'การทำงาน', sortValue: (r) => r.Action, render: (r) => <ActionChip a={r.Action} /> },
                    { key: 'what', label: 'รายการ', primary: true, sortValue: (r) => `${moduleLabel(r.Module)} ${r.Summary || ''}`, render: (r) => (
                        <div className="min-w-0">
                            <div className="font-bold text-slate-700 truncate max-w-[360px] leading-tight" title={r.Summary || ''}>
                                {moduleLabel(r.Module)}{r.Summary ? <span className="font-semibold text-slate-500"> · {r.Summary}</span> : null}
                            </div>
                            {changePreview(changesOf(r))
                                ? <div className="text-[10.5px] text-indigo-600 font-semibold truncate max-w-[360px] leading-tight" title={changePreview(changesOf(r))}>{changePreview(changesOf(r))}</div>
                                : <div className="text-[10.5px] text-slate-400 font-mono truncate max-w-[360px] leading-tight" title={`${r.Method} ${r.Path}`}>{r.RecordId ? `#${r.RecordId} · ` : ''}{r.Method} {r.Path}</div>}
                        </div>
                    ) },
                    { key: 'result', label: 'ผลลัพธ์', sortValue: (r) => (r.Success ? 0 : 1), render: (r) => (
                        r.Success ? <span className="font-bold text-emerald-600">สำเร็จ</span>
                            : <span className="font-bold text-amber-700 whitespace-nowrap" title={`HTTP ${r.StatusCode}`}>ไม่สำเร็จ ({r.StatusCode})</span>
                    ) },
                    { key: 'ip', label: 'IP', mobileHidden: true, sortValue: (r) => r.IpAddress, render: (r) => <span className="font-mono text-slate-500">{r.IpAddress || '-'}</span> },
                ]}
            />

            {detail && (
                <Portal>
                    <div className="fixed inset-0 z-[9980] bg-slate-900/50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
                        <div role="dialog" aria-label="รายละเอียดประวัติการทำงาน" className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap"><ActionChip a={detail.Action} /><span className="font-bold text-slate-800">{moduleLabel(detail.Module)}</span>{detail.Summary && <span className="text-slate-500">· {detail.Summary}</span>}</div>
                                    <p className="text-xs text-slate-500 mt-1">{fmt(detail.CreatedAt)} · {detail.Name || detail.Username || '-'} ({detail.EmpCode || '-'})</p>
                                </div>
                                <button type="button" onClick={() => setDetail(null)} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                            </div>
                            <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm">
                                <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
                                    <dt className="text-slate-400">ผลลัพธ์</dt><dd className={detail.Success ? 'text-emerald-600 font-bold' : 'text-amber-700 font-bold'}>{detail.Success ? 'สำเร็จ' : 'ไม่สำเร็จ'} (HTTP {detail.StatusCode})</dd>
                                    <dt className="text-slate-400">คำขอ</dt><dd className="font-mono text-xs break-all">{detail.Method} {detail.Path}</dd>
                                    {detail.RecordId && <><dt className="text-slate-400">รหัสรายการ</dt><dd className="font-mono">{detail.RecordId}</dd></>}
                                    <dt className="text-slate-400">IP</dt><dd className="font-mono">{detail.IpAddress || '-'}</dd>
                                    <dt className="text-slate-400">ใช้เวลา</dt><dd>{detail.DurationMs ?? '-'} ms</dd>
                                </dl>
                                {(() => {
                                    const c = changesOf(detail);
                                    if (!c) return null;
                                    if (c.deleted) {
                                        return (
                                            <div>
                                                <div className="text-xs font-bold text-rose-600 mb-1">ข้อมูลก่อนลบ</div>
                                                <div className="rounded-xl border border-rose-100 divide-y divide-rose-50 text-xs">
                                                    {Object.entries(c.deleted).map(([k, v]) => (
                                                        <div key={k} className="grid grid-cols-[minmax(0,2fr),minmax(0,3fr)] gap-3 px-3 py-1.5">
                                                            <span className="text-slate-500 break-words">{fieldLabel(k)}</span><span className="text-slate-800 break-words">{showVal(v)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    const f = c.fields || [];
                                    return (
                                        <div>
                                            <div className="text-xs font-bold text-indigo-600 mb-1">การเปลี่ยนแปลง ({f.length} ช่อง)</div>
                                            {f.length === 0 ? <p className="text-xs text-slate-400">บันทึกแล้วแต่ไม่มีช่องไหนเปลี่ยน (ค่าเท่าเดิม)</p> : (
                                                <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                                                    <div className="grid grid-cols-[minmax(0,2fr),minmax(0,2fr),minmax(0,2fr)] gap-3 px-3 py-1.5 bg-slate-50 font-bold text-slate-500"><span>ช่อง</span><span>ค่าเดิม</span><span>ค่าใหม่</span></div>
                                                    {f.map((x) => (
                                                        <div key={x.field} className="grid grid-cols-[minmax(0,2fr),minmax(0,2fr),minmax(0,2fr)] gap-3 px-3 py-1.5 border-t border-slate-100">
                                                            <span className="text-slate-600 break-words">{fieldLabel(x.field)}</span>
                                                            <span className="text-rose-600 line-through decoration-rose-300 break-words">{showVal(x.from)}</span>
                                                            <span className="text-emerald-700 font-bold break-words">{showVal(x.to)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                                {(() => {
                                    const raw = parseBody(detail.Body);
                                    const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (({ __changes, ...rest }) => rest)(raw) : null;
                                    const entries = obj ? Object.entries(obj) : [];
                                    const c = changesOf(detail);
                                    const hasChanges = !!c && (c.deleted || (c.fields || []).length > 0);
                                    const content = !detail.Body ? (
                                        <p className="text-xs text-slate-400">ไม่มีข้อมูล (เช่น การลบที่ส่งแค่รหัสรายการ)</p>
                                    ) : obj ? (
                                        entries.length === 0 ? <p className="text-xs text-slate-400">ไม่มีข้อมูล</p> : (
                                            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                                                {entries.map(([k, v]) => (
                                                    <div key={k} className="grid grid-cols-[minmax(0,2fr),minmax(0,3fr)] gap-3 px-3 py-1.5">
                                                        <span className="text-slate-500 break-words">{k === '__files' ? 'ไฟล์ที่แนบ' : fieldLabel(k)}</span>
                                                        <span className="text-slate-800 break-words whitespace-pre-wrap">
                                                            {Array.isArray(v) && k === '__files' ? v.join(', ')
                                                                : v !== null && typeof v === 'object' ? <code className="text-[11px] text-slate-600">{JSON.stringify(v)}</code>
                                                                : showVal(v)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    ) : (
                                        <pre className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap break-words">{String(raw)}</pre>
                                    );
                                    const label = `ข้อมูลที่ส่งมา${entries.length ? ` (${entries.length} ช่อง)` : ''}`;
                                    return (
                                        <div>
                                            {hasChanges ? (
                                                // มีการเปลี่ยนแปลงให้ดูแล้ว → ซ่อนข้อมูลที่ส่งไว้ กดเปิดได้
                                                <details className="group">
                                                    <summary className="cursor-pointer select-none text-xs font-bold text-slate-500 hover:text-indigo-600 list-none flex items-center gap-1">
                                                        <span className="inline-block transition-transform group-open:rotate-90">▸</span>{label}
                                                    </summary>
                                                    <div className="mt-1.5">{content}</div>
                                                </details>
                                            ) : (
                                                <>
                                                    <div className="text-xs font-bold text-slate-500 mb-1">{label}</div>
                                                    {content}
                                                </>
                                            )}
                                            <p className="text-[11px] text-slate-400 mt-1">
                                                {!c ? 'ส่วนนี้ไม่ได้ติดตามค่าเดิม → ค่าใหม่ จึงเห็นเฉพาะค่าที่ผู้ใช้ส่งมาตอนกดบันทึก'
                                                    : 'ค่าทั้งหมดในฟอร์มที่ผู้ใช้ส่งมาตอนกดบันทึก (รวมช่องที่ไม่ได้เปลี่ยน)'}
                                            </p>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </MgmtSection>
    );
}
