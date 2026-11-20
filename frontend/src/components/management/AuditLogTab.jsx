import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Download, X, Plus, Edit2, Trash2, Zap, AlertTriangle } from 'lucide-react';
import Portal from '../Portal';
import { API_BASE } from '../../config/api';
import { MgmtSection, MgmtTable, SecondaryButton } from './MgmtTable';

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
    return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${m.cls}`}><Icon size={12} />{m.label}</span>;
};

// แสดงเป็นเวลาท้องถิ่น (driver ส่งมาเป็น ISO แบบ UTC — เหมือน formatDbDate ในหน้า Management)
const fmt = (d) => {
    const t = d ? new Date(d) : null;
    if (!t || isNaN(t)) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
};
const parseBody = (b) => { if (!b) return null; try { return JSON.parse(b); } catch { return b; } };

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
        const head = ['เวลา', 'รหัสพนักงาน', 'ชื่อ', 'การทำงาน', 'ส่วนของระบบ', 'รายการ', 'รหัสรายการ', 'ผลลัพธ์', 'HTTP', 'Path', 'IP', 'ข้อมูลที่ส่ง'];
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [head.map(esc).join(',')].concat(rows.map((r) => [
            fmt(r.CreatedAt), r.EmpCode, r.Name || r.Username, ACTION_META[r.Action]?.label || r.Action, moduleLabel(r.Module), r.Summary, r.RecordId,
            r.Success ? 'สำเร็จ' : 'ไม่สำเร็จ', r.StatusCode, `${r.Method} ${r.Path}`, r.IpAddress, r.Body,
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
            title="ประวัติการทำงาน" count={state.rows.length}
            subtitle={<>
                ทุกการเพิ่ม/แก้ไข/ลบ ที่ผู้ใช้ทำในระบบ · เพิ่ม <b className="text-emerald-600">{counts.create}</b> · แก้ไข <b className="text-sky-600">{counts.update}</b> · ลบ <b className="text-rose-600">{counts.delete}</b> · ดำเนินการ <b className="text-violet-600">{counts.action}</b> · ไม่สำเร็จ <b className="text-amber-600">{counts.fail}</b> · ผู้ใช้ {counts.users.size} คน
                <span className="block text-slate-400">เก็บย้อนหลัง {state.retentionDays} วัน · ไม่เก็บรหัสผ่าน/token และไฟล์ (เก็บแค่ชื่อไฟล์){state.rows.length >= state.limit ? ` · แสดง ${state.limit.toLocaleString()} รายการล่าสุด — ใช้ตัวกรองเพื่อดูเพิ่ม` : ''}</span>
            </>}
            actions={<SecondaryButton icon={Download} onClick={exportCsv} disabled={state.rows.length === 0}>Export CSV</SecondaryButton>}
        >
            {state.error && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">{state.error}</div>}
            <MgmtTable
                search={search} onSearch={setSearch} loading={state.loading} rows={state.rows} rowKey={(r) => r.AuditID} pageSize={25} minWidth={980}
                searchText={(r) => [r.Name, r.Username, r.EmpCode, moduleLabel(r.Module), r.Summary, r.Path, r.RecordId, r.Body].join(' ')}
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
                        <div className="flex items-center gap-2">
                            {UserAvatar && r.EmpCode ? <UserAvatar pic={r.EmpPic} empCode={r.EmpCode} name={r.Name || r.Username} size={28} /> : null}
                            <div className="min-w-0">
                                <div className="font-bold text-slate-700 truncate">{r.Name || r.Username || '-'}</div>
                                <div className="text-[11px] text-slate-400 font-mono">{r.EmpCode || ''}</div>
                            </div>
                        </div>
                    ) },
                    { key: 'action', label: 'การทำงาน', sortValue: (r) => r.Action, render: (r) => <ActionChip a={r.Action} /> },
                    { key: 'what', label: 'รายการ', primary: true, sortValue: (r) => `${moduleLabel(r.Module)} ${r.Summary || ''}`, render: (r) => (
                        <div className="min-w-0">
                            <div className="font-bold text-slate-700 truncate max-w-[320px]" title={r.Summary || ''}>
                                {moduleLabel(r.Module)}{r.Summary ? <span className="font-semibold text-slate-500"> · {r.Summary}</span> : null}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono truncate max-w-[320px]" title={`${r.Method} ${r.Path}`}>{r.RecordId ? `#${r.RecordId} · ` : ''}{r.Method} {r.Path}</div>
                        </div>
                    ) },
                    { key: 'result', label: 'ผลลัพธ์', sortValue: (r) => (r.Success ? 0 : 1), render: (r) => (
                        r.Success ? <span className="text-xs font-bold text-emerald-600">สำเร็จ</span>
                            : <span className="text-xs font-bold text-amber-700" title={`HTTP ${r.StatusCode}`}>ไม่สำเร็จ ({r.StatusCode})</span>
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
                                <div>
                                    <div className="text-xs font-bold text-slate-500 mb-1">ข้อมูลที่ส่งมา</div>
                                    {detail.Body ? (
                                        <pre className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap break-words">{(() => { const b = parseBody(detail.Body); return typeof b === 'string' ? b : JSON.stringify(b, null, 2); })()}</pre>
                                    ) : <p className="text-xs text-slate-400">ไม่มีข้อมูล (เช่น การลบที่ส่งแค่รหัสรายการ)</p>}
                                    <p className="text-[11px] text-slate-400 mt-1">ระดับ 1 เก็บเฉพาะค่าที่ส่งมา ไม่มีค่าเดิมก่อนแก้</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </MgmtSection>
    );
}
