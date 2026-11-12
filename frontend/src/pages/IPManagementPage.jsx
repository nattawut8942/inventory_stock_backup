import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, X, RefreshCw, LayoutGrid, List, AlertTriangle, CheckCircle,
    Network, FileDown, Copy, Check, Command, Monitor, Pencil, Shield, Clock, Layers
} from 'lucide-react';
import { useAuth, getAuthToken } from '../context/AuthContext';
import Portal from '../components/Portal';
import { API_BASE } from '../config/api';
import * as XLSX from 'xlsx-js-style';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// ค่านี้ใช้แสดงผลเท่านั้น — การคำนวณ inactive จริงอยู่ที่ backend (is_inactive)
const INACTIVE_THRESHOLD = 15;
const DENSE_SUBNET_PCT = 80; // subnet ที่ online เกินค่านี้ถือว่าหนาแน่น

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// สถานะที่แสดงผล: ออนไลน์ = scan_result 'Found' (นิยามเดียวกันทั้งหน้า)
const isOnline = (d) => d.scan_result?.toLowerCase() === 'found';
const isReserved = (d) => d.reservation_status === 'reserved';
const isInactive = (d) => Number(d.is_inactive) === 1; // คำนวณที่ backend
const getDisplayStatus = (d) => {
    if (isReserved(d)) return isOnline(d) ? 'reserved-active' : 'reserved-inactive';
    if (isOnline(d)) return 'active';
    return 'available';
};

const STATUS_META = {
    'active': { label: 'Online', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    'reserved-active': { label: 'จอง · Online', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    'reserved-inactive': { label: 'จอง · Offline', pill: 'bg-amber-100 text-amber-700 border-amber-200' },
    'available': { label: 'ว่าง', pill: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const fmtDT = (s) => s ? s.substring(0, 19).replace('T', ' ') : '—';
const fmtVal = (v) => (v === null || v === undefined || v === '') ? '—' : String(v);
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const normalizeMacInput = (v) => v.trim().toUpperCase().replace(/-/g, ':');

// ผู้ใช้ที่บันทึกการจอง — ใช้ username ก่อน แล้วค่อย fallback
const resolveActor = (u) => {
    if (!u) return 'unknown';
    return u.username || u.empcode || u.name || u.displayName || u.email || 'unknown';
};

// JWT จาก login — ส่งกับ request ที่มี verifyToken
const authHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    const t = getAuthToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    return headers;
};

// backend 401/403 ใช้ key `message` ส่วน error อื่นใช้ `error`
const responseError = async (r) => {
    if (r.ok) return null;
    const d = await r.json().catch(() => ({}));
    return d.error || d.message || `HTTP ${r.status}`;
};

// ── URL state: subnet / filter / view / q อยู่ใน query string ให้แชร์หรือกลับมาที่เดิมได้ ──
const FILTER_KEYS = ['all', 'active', 'reserved', 'available', 'inactive'];
// มุมมองหลัก: subnet (ค่าเริ่มต้น), ภาพรวม, ไทม์ไลน์, รายการ inactive
const MAIN_VIEWS = ['subnet', 'overview', 'owners', 'timeline', 'inactive', 'alerts'];
const readUrl = () => {
    try {
        const p = new URLSearchParams(window.location.search);
        return {
            sn: p.get('subnet') || '',
            filter: FILTER_KEYS.includes(p.get('filter')) ? p.get('filter') : 'all',
            view: p.get('view') === 'table' ? 'table' : p.get('view') === 'grid' ? 'grid' : '',
            q: p.get('q') || '',
            v: MAIN_VIEWS.includes(p.get('v')) ? p.get('v') : 'subnet',
        };
    } catch { return { sn: '', filter: 'all', view: '', q: '', v: 'subnet' }; }
};

const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
};

const blankRow = (ip, sn) => ({
    ip_address: ip, status: null, hostname: '-', owner_name: '', remark: '', last_scan: null,
    scan_result: null, reservation_status: 'available', reserveby: '', last_seen_active: null,
    inactive_days: null, is_inactive: 0, serial_number: '', mac_address: '', device: '',
});

// ตัวเลือกแนะนำสำหรับช่อง Device (พิมพ์ค่าอื่นได้)
const DEVICE_OPTIONS = ['PC', 'Notebook', 'Printer', 'CCTV', 'Switch', 'Router', 'Server', 'IP Phone', 'Access Point', 'Monitor'];
const PURPOSE_OPTIONS = ['ใช้งานทั่วไป', 'เซิร์ฟเวอร์', 'กล้องวงจรปิด', 'เครื่องพิมพ์', 'ระบบผลิต', 'Network', 'Wi-Fi', 'อื่น ๆ'];

// ฟิลด์ใน drawer: k = ชื่อใน form, api = ชื่อใน API/DB
const DRAWER_FIELDS = [
    { k: 'owner', api: 'owner_name' }, { k: 'remark', api: 'remark' },
    { k: 'device', api: 'device' }, { k: 'serial', api: 'serial_number' }, { k: 'mac', api: 'mac_address' },
    { k: 'asset', api: 'asset_tag' }, { k: 'location', api: 'location' },
    { k: 'contact', api: 'contact' }, { k: 'purpose', api: 'purpose' },
    { k: 'iptype', api: 'ip_type' },
];
const buildFull254 = (sn, rows) => {
    const map = {};
    rows.forEach(x => { if (!x.reservation_status) x.reservation_status = 'available'; map[x.ip_address] = x; });
    return Array.from({ length: 254 }, (_, i) => {
        const ip = `${sn}.${i + 1}`;
        return map[ip] || blankRow(ip, sn);
    });
};

// ─── TOOLTIP (DOM-based, ไม่ trigger re-render) ───────────────────────────────
const useTooltip = () => {
    const timer = useRef(null);
    const show = useCallback((e, text) => {
        clearTimeout(timer.current);
        const el = document.getElementById('ip-tip');
        if (!el) return;
        const r = e.currentTarget.getBoundingClientRect();
        el.textContent = text;
        el.style.display = 'block';
        el.style.opacity = '1';
        let top = r.bottom + 6;
        if (top + 90 > window.innerHeight) top = r.top - 96;
        el.style.left = Math.min(r.left + r.width / 2, window.innerWidth - 220) + 'px';
        el.style.top = top + 'px';
    }, []);
    const hide = useCallback(() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const el = document.getElementById('ip-tip');
            if (el) { el.style.opacity = '0'; el.style.display = 'none'; }
        }, 80);
    }, []);
    return { show, hide };
};

// ─── SMALL UI PIECES ──────────────────────────────────────────────────────────
const StatusPill = ({ status }) => {
    const m = STATUS_META[status] || STATUS_META.available;
    return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${m.pill}`}>{m.label}</span>;
};

const InactiveBadge = ({ days }) => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
        <AlertTriangle size={9} />{days}d
    </span>
);

const Modal = ({ onClose, children, width = 'max-w-sm', top = false }) => {
    useEffect(() => {
        document.body.dataset.modalOpen = '1';
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => { delete document.body.dataset.modalOpen; window.removeEventListener('keydown', h); };
    }, [onClose]);
    return (
        <Portal>
            <div className={`fixed inset-0 z-[70] flex justify-center bg-slate-900/40 backdrop-blur-sm p-4 ${top ? 'items-start pt-[12vh]' : 'items-center'}`}
                onMouseDown={onClose}>
                <div className={`bg-white rounded-2xl shadow-2xl w-full ${width} overflow-hidden`} onMouseDown={e => e.stopPropagation()}>
                    {children}
                </div>
            </div>
        </Portal>
    );
};

// ─── ประวัติการเปลี่ยนแปลง ──────────────────────────────────────────────────────
const HISTORY_ACTION = {
    reserve: { label: 'จอง', cls: 'bg-emerald-100 text-emerald-700' },
    release: { label: 'ยกเลิกจอง', cls: 'bg-red-100 text-red-700' },
    update: { label: 'แก้ไข', cls: 'bg-indigo-100 text-indigo-700' },
};
const HISTORY_FIELD = {
    owner_name: 'Owner', remark: 'Remark', hostname: 'Hostname', status: 'Status',
    reservation_status: 'สถานะจอง', reserveby: 'ผู้จอง', serial_number: 'Serial', mac_address: 'MAC', device: 'Device',
    asset_tag: 'Asset Tag', location: 'สถานที่', contact: 'ผู้รับผิดชอบ', purpose: 'วัตถุประสงค์', ip_type: 'ประเภท IP',
};

const IPHistory = ({ ip, api, refreshKey }) => {
    const [rows, setRows] = useState(null);
    const [err, setErr] = useState('');
    useEffect(() => {
        let alive = true;
        setRows(null); setErr('');
        (async () => {
            try {
                const r = await fetch(`${api}/ips/${ip}/history`, { headers: authHeaders() });
                const e = await responseError(r);
                if (e) throw new Error(e);
                const d = await r.json();
                if (alive) setRows(d);
            } catch (e) { if (alive) setErr(e.message); }
        })();
        return () => { alive = false; };
    }, [api, ip, refreshKey]);

    return (
        <section>
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">ประวัติการเปลี่ยนแปลง</h4>
            {err && <p className="text-xs text-red-500">โหลดประวัติไม่สำเร็จ: {err}</p>}
            {!err && rows === null && <p className="text-xs text-slate-400">กำลังโหลด…</p>}
            {rows && rows.length === 0 && <p className="text-xs text-slate-400">ยังไม่มีประวัติ</p>}
            {rows && rows.length > 0 && (
                <ul className="max-h-48 overflow-y-auto space-y-3 pr-1">
                    {rows.map(row => {
                        const act = HISTORY_ACTION[row.action] || { label: row.action, cls: 'bg-slate-100 text-slate-600' };
                        return (
                            <li key={row.id} className="text-xs border-l-2 border-slate-200 pl-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${act.cls}`}>{act.label}</span>
                                    <span className="font-mono text-[11px] text-slate-400">{row.changed_at}</span>
                                    <span className="font-semibold text-slate-600">{row.changed_by || '—'}</span>
                                </div>
                                {Object.entries(row.changes || {}).map(([f, v]) => (
                                    <div key={f} className="text-slate-500 mt-0.5">
                                        <span className="text-slate-400">{HISTORY_FIELD[f] || f}:</span>{' '}
                                        <span className="line-through opacity-70">{fmtVal(v?.from)}</span>
                                        <span className="mx-1 text-slate-300">→</span>
                                        <span className="font-semibold text-slate-700">{fmtVal(v?.to)}</span>
                                    </div>
                                ))}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

// ─── DRAWER: รายละเอียด IP (แทน modal เดิม — grid ยังมองเห็นอยู่) ──────────────
const IPDrawer = ({ ip, data, api, onClose, onSave, onReserve, onRelease, actor, refreshKey }) => {
    const reserved = isReserved(data);
    const initial = Object.fromEntries(DRAWER_FIELDS.map(f => [f.k, data?.[f.api] || '']));
    const [form, setForm] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [confirmRelease, setConfirmRelease] = useState(false);
    const [copied, setCopied] = useState('');

    // เมื่อข้อมูลจาก server เปลี่ยน (หลังบันทึก) ให้ sync form
    useEffect(() => {
        setForm(Object.fromEntries(DRAWER_FIELDS.map(f => [f.k, data?.[f.api] || ''])));
        setConfirmRelease(false);
    }, [ip, data?.reservation_status, ...DRAWER_FIELDS.map(f => data?.[f.api])]);

    const macError = form.mac.trim() && !MAC_RE.test(form.mac.trim()) ? 'รูปแบบ MAC ไม่ถูกต้อง เช่น 00:1A:2B:3C:4D:5E' : '';
    const dirty = DRAWER_FIELDS.some(f => form[f.k] !== (data?.[f.api] || ''));

    const requestClose = useCallback(() => {
        if (busy) return;
        if (dirty && !window.confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการปิดหรือไม่?')) return;
        onClose();
    }, [busy, dirty, onClose]);

    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape' && !document.body.dataset.modalOpen) requestClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [requestClose]);

    // owner/remark ส่งเป็นข้อความ (อาจว่าง) ส่วนที่เหลือว่างหมายถึงล้างค่า (null)
    const fields = () => Object.fromEntries(DRAWER_FIELDS.map(f => {
        const v = form[f.k].trim();
        if (f.k === 'mac') return [f.api, v ? normalizeMacInput(v) : null];
        if (f.api === 'owner_name' || f.api === 'remark') return [f.api, v];
        return [f.api, v || null];
    }));

    const handleSave = async () => {
        if (macError || busy) return;
        setBusy(true);
        await onSave(ip, { ...fields(), reservation_status: data?.reservation_status || 'available' });
        setBusy(false);
    };
    const handleReserve = async () => {
        if (!form.owner.trim() || macError || busy) return;
        setBusy(true);
        const ok = await onReserve(ip, { ...fields(), reservation_status: 'reserved', reserveby: actor });
        setBusy(false);
        if (ok) onClose();
    };
    const handleRelease = async () => {
        if (busy) return;
        setBusy(true);
        const ok = await onRelease(ip);
        setBusy(false);
        if (ok) onClose();
    };

    const copy = async (key, text) => {
        if (!text) return;
        const ok = await copyText(text);
        if (ok) { setCopied(key); setTimeout(() => setCopied(''), 1200); }
    };
    const CopyBtn = ({ k, text }) => (
        <button type="button" onClick={() => copy(k, text)} disabled={!text} title="คัดลอก"
            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent">
            {copied === k ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
        </button>
    );

    const hostname = data?.hostname && data.hostname !== '-' ? data.hostname : '';
    const inputCls = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 focus:bg-white transition-all';

    return (
        <Portal>
            <div className="fixed inset-0 z-[60] bg-slate-900/20" onMouseDown={requestClose} />
            <motion.aside
                initial={{ x: 480, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 480, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                className="fixed top-0 right-0 bottom-0 z-[61] w-full sm:w-[460px] bg-white shadow-2xl flex flex-col"
                role="dialog" aria-label={`รายละเอียด IP ${ip}`}>

                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-mono text-lg font-black text-slate-900">{ip}</h3>
                            <CopyBtn k="ip" text={ip} />
                        </div>
                        {hostname ? (
                            <div className="mt-2 inline-flex max-w-full items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200">
                                <Monitor size={14} className="text-indigo-600 shrink-0" />
                                <span className="font-mono text-sm font-bold text-indigo-900 truncate" title={hostname}>{hostname}</span>
                                <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide shrink-0">ชื่อเครื่องที่สแกนพบ</span>
                                <CopyBtn k="host" text={hostname} />
                            </div>
                        ) : (
                            <p className="mt-2 text-xs text-slate-400">ยังไม่พบชื่อเครื่องจากการสแกน</p>
                        )}
                        <div className="mt-2"><StatusPill status={getDisplayStatus(data)} /></div>
                    </div>
                    <button onClick={requestClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="ปิด">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {isInactive(data) && (
                        <div className="flex items-start gap-2 px-3 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>ไม่ได้ออนไลน์มา <strong>{data.inactive_days} วัน</strong> (ล่าสุด {data.last_seen_active?.substring(0, 10)})</span>
                        </div>
                    )}

                    {/* การจอง — ปุ่มหลักเปลี่ยนตามสถานะ */}
                    <section className={`rounded-xl border p-4 ${reserved ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50/50 border-emerald-200'}`}>
                        {reserved ? (
                            <>
                                <p className="text-xs text-amber-800">จองโดย <strong className="font-mono">{data?.reserveby || '—'}</strong></p>
                                {!confirmRelease ? (
                                    <button onClick={() => setConfirmRelease(true)} disabled={busy}
                                        className="mt-3 w-full py-2 text-sm font-bold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
                                        ยกเลิกการจอง
                                    </button>
                                ) : (
                                    <div className="mt-3 space-y-2">
                                        <p className="text-xs text-red-700">ยืนยันยกเลิกการจอง? IP จะกลับเป็น "ว่าง" และชื่อผู้จองจะถูกลบ (Owner และ Remark ยังอยู่)</p>
                                        <div className="flex gap-2">
                                            <button onClick={() => setConfirmRelease(false)} className="flex-1 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-lg">ไม่ยกเลิก</button>
                                            <button onClick={handleRelease} disabled={busy}
                                                className="flex-1 py-2 text-sm font-bold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50">
                                                {busy ? 'กำลังยกเลิก…' : 'ยืนยันยกเลิก'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <p className="text-xs text-emerald-800">IP นี้ยังว่าง — ระบุ Owner แล้วจองได้เลย</p>
                                <button onClick={handleReserve} disabled={!form.owner.trim() || !!macError || busy}
                                    className="mt-3 w-full py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
                                    {busy ? 'กำลังจอง…' : 'จอง IP นี้'}
                                </button>
                            </>
                        )}
                    </section>

                    {/* ข้อมูลที่แก้ไขได้ */}
                    {/* ระบุตัวเครื่อง */}
                    <section className="space-y-3">
                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ระบุตัวเครื่อง</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-600">Device</span>
                                <input value={form.device} onChange={e => setForm({ ...form, device: e.target.value })} list="device-options" maxLength={50}
                                    placeholder="PC, Printer…" className={`${inputCls} mt-1`} />
                                <datalist id="device-options">
                                    {DEVICE_OPTIONS.map(o => <option key={o} value={o} />)}
                                </datalist>
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-600">Asset Tag</span>
                                <input value={form.asset} onChange={e => setForm({ ...form, asset: e.target.value })} maxLength={50} placeholder="เลขทรัพย์สิน"
                                    className={`${inputCls} mt-1 font-mono text-xs`} />
                            </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-600">Serial Number</span>
                                <input value={form.serial} onChange={e => setForm({ ...form, serial: e.target.value })} maxLength={100} placeholder="SN12345"
                                    className={`${inputCls} mt-1 font-mono text-xs`} />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-600">MAC Address</span>
                                <input value={form.mac} onChange={e => setForm({ ...form, mac: e.target.value })} maxLength={17} placeholder="00:1A:2B:3C:4D:5E"
                                    className={`${inputCls} mt-1 font-mono text-xs ${macError ? 'border-red-300' : ''}`} />
                            </label>
                        </div>
                    </section>

                    {/* ผู้ดูแล */}
                    <section className="space-y-3">
                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ผู้ดูแล</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-600">Owner / หน่วยงาน</span>
                                <input value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="เช่น IT-Dept" className={`${inputCls} mt-1`} />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold text-slate-600">ผู้รับผิดชอบ</span>
                                <input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} maxLength={120} placeholder="ชื่อหรือรหัสพนักงาน"
                                    className={`${inputCls} mt-1`} />
                            </label>
                        </div>
                    </section>

                    {/* ที่ตั้งและการใช้งาน */}
                    <section className="space-y-3">
                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ที่ตั้งและการใช้งาน</h4>
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-600">สถานที่ติดตั้ง (Location)</span>
                            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} maxLength={150} placeholder="เช่น อาคาร A ชั้น 2 ห้องเซิร์ฟเวอร์"
                                className={`${inputCls} mt-1`} />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-600">วัตถุประสงค์การใช้งาน</span>
                            <input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} list="purpose-options" maxLength={50}
                                placeholder="เลือกหรือพิมพ์เอง" className={`${inputCls} mt-1`} />
                            <datalist id="purpose-options">
                                {PURPOSE_OPTIONS.map(o => <option key={o} value={o} />)}
                            </datalist>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-600">ประเภท IP</span>
                            <select value={form.iptype} onChange={e => setForm({ ...form, iptype: e.target.value })} className={`${inputCls} mt-1`}>
                                <option value="">ไม่ระบุ</option>
                                <option value="Static">Static (กำหนดเอง)</option>
                                <option value="DHCP">DHCP</option>
                            </select>
                        </label>
                    </section>

                    {/* หมายเหตุ */}
                    <section className="space-y-3">
                        <label className="block">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Remark</span>
                            <input value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} placeholder="เช่น CCTV ชั้น 2" className={`${inputCls} mt-1`} />
                        </label>
                        {macError && <p className="text-xs text-red-500">{macError}</p>}
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Hostname: <span className="font-mono text-slate-700">{hostname || '—'}</span></span>
                            <CopyBtn k="host" text={hostname} />
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>MAC: <span className="font-mono text-slate-700">{data?.mac_address || '—'}</span></span>
                            <CopyBtn k="mac" text={data?.mac_address} />
                        </div>
                    </section>

                    {/* ข้อมูลสแกน */}
                    <section className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <div><span className="text-slate-400">Device</span><div className="font-semibold text-slate-700">{fmtVal(data?.device)}</div></div>
                        <div><span className="text-slate-400">ผลสแกน</span><div className="font-semibold text-slate-700">{fmtVal(data?.scan_result)}</div></div>
                        <div><span className="text-slate-400">สแกนล่าสุด</span><div className="font-mono text-slate-700">{fmtDT(data?.last_scan)}</div></div>
                        <div><span className="text-slate-400">ออนไลน์ล่าสุด</span><div className="font-mono text-slate-700">{fmtDT(data?.last_seen_active)}</div></div>
                        <div><span className="text-slate-400">แก้ไขโดย</span><div className="font-semibold text-slate-700">{fmtVal(data?.updated_by)} <span className="font-mono font-normal text-slate-400">{fmtDT(data?.updated_at)}</span></div></div>
                    </section>

                    <IPHistory ip={ip} api={api} refreshKey={refreshKey} />
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                    <span className={`text-xs ${dirty ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>{dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกแล้ว'}</span>
                    <button onClick={handleSave} disabled={!dirty || !!macError || busy}
                        className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-200">
                        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
                    </button>
                </div>
            </motion.aside>
        </Portal>
    );
};

// ─── CELL ของ grid (ไม่ memo — 254 ช่องเบามาก และไม่มีปัญหา closure เก่า) ─────────
const IPCell = ({ data, idx, showTip, hideTip, onActivate, hidden, selected, highlighted, changed }) => {
    const status = getDisplayStatus(data);
    const inactive = isInactive(data);
    const last = data.ip_address.split('.').pop();
    // แสดงเฉพาะฟิลด์ที่มีค่า — ครอบคลุมทุกช่องที่กรอกได้ใน drawer
    const hostOk = data.hostname && data.hostname !== '-';
    const tipText = [
        data.ip_address,
        `Status: ${STATUS_META[status]?.label || status}${inactive ? ` · ไม่ออนไลน์ ${data.inactive_days} วัน` : ''}`,
        hostOk ? `ชื่อเครื่อง: ${data.hostname}` : null,
        data.owner_name ? `Owner: ${data.owner_name}` : null,
        data.contact ? `ผู้รับผิดชอบ: ${data.contact}` : null,
        data.reserveby ? `ผู้จอง: ${data.reserveby}` : null,
        data.device ? `Device: ${data.device}` : null,
        data.asset_tag ? `Asset: ${data.asset_tag}` : null,
        data.serial_number ? `Serial: ${data.serial_number}` : null,
        data.mac_address ? `MAC: ${data.mac_address}` : null,
        data.location ? `สถานที่: ${data.location}` : null,
        data.purpose ? `วัตถุประสงค์: ${data.purpose}` : null,
        data.ip_type ? `ประเภท IP: ${data.ip_type}` : null,
        data.remark ? `Remark: ${data.remark}` : null,
        data.last_seen_active ? `ออนไลน์ล่าสุด: ${fmtDT(data.last_seen_active)}` : null,
        data.last_scan ? `สแกนล่าสุด: ${fmtDT(data.last_scan)}` : null,
    ].filter(Boolean).join('\n');

    const look = status === 'reserved-active' ? { bg: 'bg-emerald-50 border-emerald-400', num: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-2 ring-amber-400' }
        : status === 'reserved-inactive' ? { bg: 'bg-amber-50 border-amber-300', num: 'text-amber-700', dot: 'bg-amber-400', ring: 'ring-2 ring-amber-400' }
        : inactive ? { bg: 'bg-red-100 border-red-300', num: 'text-red-700', dot: 'bg-red-400', ring: '' }
        : status === 'active' ? { bg: 'bg-emerald-50 border-emerald-300', num: 'text-emerald-700', dot: 'bg-emerald-500 animate-pulse', ring: 'ring-1 ring-emerald-300' }
        : { bg: 'bg-white border-slate-100', num: 'text-slate-300', dot: 'bg-slate-200', ring: '' };

    const icon = status === 'reserved-active' ? '📌' : status === 'reserved-inactive' ? '🔒' : inactive ? '⚠' : null;

    return (
        <div
            id={`cell-${data.ip_address}`}
            data-idx={idx}
            tabIndex={hidden ? -1 : 0}
            role="button"
            aria-label={`${data.ip_address} ${STATUS_META[status]?.label || ''}`}
            style={hidden ? { visibility: 'hidden', pointerEvents: 'none' } : {}}
            className={`rounded-lg border cursor-pointer select-none flex flex-col items-center justify-center aspect-square min-w-0 relative
                transition-all duration-150 hover:scale-110 hover:z-10 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                ${look.bg} ${look.ring}
                ${selected ? 'ring-2 ring-indigo-500 bg-indigo-50' : ''}
                ${highlighted ? 'ring-4 ring-indigo-500 ring-offset-2 scale-125 z-20 shadow-lg shadow-indigo-300' : ''}
                ${changed ? 'ring-2 ring-sky-400 z-10 motion-safe:scale-110 shadow-md shadow-sky-200' : ''}`}
            onClick={() => onActivate(data.ip_address)}
            onMouseEnter={hidden ? undefined : e => showTip(e, tipText)}
            onMouseLeave={hidden ? undefined : hideTip}
        >
            {icon && <span className="absolute top-0 right-0.5 text-[8px] leading-none opacity-70">{icon}</span>}
            {selected && <span className="absolute -top-1 -left-1 w-3.5 h-3.5 rounded-full bg-indigo-600 text-white flex items-center justify-center"><Check size={9} strokeWidth={3} /></span>}
            <span className={`text-[12px] font-mono font-bold leading-none ${look.num}`}>{last}</span>
            <div className={`w-1.5 h-1.5 rounded-full mt-1 ${look.dot}`} />
        </div>
    );
};

// ─── SUBNET LIST (sidebar) — progress bar + ป้ายกำกับ ──────────────────────────
const SubnetList = ({ subnets, currentSN, onSelect, query, setQuery, onAdd }) => {
    const list = subnets.filter(s => !query || s.subnet.includes(query.trim()));
    return (
        <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Subnets</span>
                    <button onClick={onAdd} className="px-2.5 py-1 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">+ เพิ่ม</button>
                </div>
                <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหา subnet…"
                        className="w-full pl-8 pr-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {list.map(s => {
                    const total = s.total || 254;
                    const pct = Math.round(((s.active_count || 0) / total) * 100);
                    const active = currentSN === s.subnet;
                    return (
                        <button key={s.subnet} onClick={() => onSelect(s.subnet)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'hover:bg-slate-50 text-slate-700'}`}>
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-[13px] font-bold">{s.subnet}.x</span>
                                <span className={`text-[11px] font-bold ${active ? 'text-white/90' : 'text-slate-500'}`}>{pct}%</span>
                            </div>
                            <div className={`h-1.5 rounded-full mt-2 overflow-hidden ${active ? 'bg-white/25' : 'bg-slate-100'}`}>
                                <div className={`h-full rounded-full ${active ? 'bg-white' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <div className={`flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5 text-[10px] ${active ? 'text-white/85' : 'text-slate-500'}`}>
                                <span>● {s.active_count || 0} online</span>
                                <span>■ {s.reserved_count || 0} จอง</span>
                                <span>⚠ {s.inactive_count || 0} inactive</span>
                            </div>
                        </button>
                    );
                })}
                {subnets.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                        ยังไม่มี subnet<br />กด “+ เพิ่ม” เพื่อเริ่ม
                    </div>
                )}
                {subnets.length > 0 && list.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-slate-400">ไม่พบ subnet ที่ค้นหา</p>
                )}
            </div>
        </div>
    );
};

// ─── DIALOG: เพิ่ม subnet ─────────────────────────────────────────────────────
const AddSubnetModal = ({ onClose, onConfirm }) => {
    const [value, setValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const parts = value.trim().split('.');
    const valid = parts.length === 3 && parts.every(p => p !== '' && /^\d+$/.test(p) && +p <= 255);
    const handleAdd = async () => { setLoading(true); setError(''); const err = await onConfirm(value.trim()); if (err) { setError(err); setLoading(false); } };
    return (
        <Modal onClose={onClose}>
            <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex justify-between items-center">
                <h3 className="font-black text-lg">เพิ่ม Subnet ใหม่</h3>
                <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
                <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Subnet (x.x.x)</span>
                    <input value={value} onChange={e => { setValue(e.target.value); setError(''); }}
                        onKeyDown={e => e.key === 'Enter' && valid && !loading && handleAdd()}
                        placeholder="เช่น 10.194.50" autoFocus
                        className="mt-1 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 focus:bg-white" />
                </label>
                {valid && (
                    <div className="px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
                        จะเพิ่ม <strong className="font-mono">{value}.1 — {value}.254</strong> รวม 254 IP
                    </div>
                )}
                {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{error}</div>}
            </div>
            <div className="flex gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                <button onClick={onClose} className="flex-1 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">ยกเลิก</button>
                <button onClick={handleAdd} disabled={!valid || loading}
                    className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                    {loading && <RefreshCw size={12} className="animate-spin" />} เพิ่ม 254 IP
                </button>
            </div>
        </Modal>
    );
};

// ─── DIALOG: จองหลายรายการ ────────────────────────────────────────────────────
const BulkReserveModal = ({ count, busyProgress, onClose, onConfirm }) => {
    const [owner, setOwner] = useState('');
    const [remark, setRemark] = useState('');
    const busy = busyProgress !== null;
    return (
        <Modal onClose={busy ? () => {} : onClose}>
            <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
                <h3 className="font-black text-lg">จอง {count} รายการ</h3>
                <p className="text-xs text-white/80">เฉพาะ IP ที่ยังว่างเท่านั้นที่จะถูกจอง</p>
            </div>
            <div className="p-5 space-y-3">
                <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Owner / หน่วยงาน *</span>
                    <input value={owner} onChange={e => setOwner(e.target.value)} disabled={busy} autoFocus
                        className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 disabled:opacity-60" />
                </label>
                <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Remark</span>
                    <input value={remark} onChange={e => setRemark(e.target.value)} disabled={busy}
                        className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 disabled:opacity-60" />
                </label>
                {busy && <p className="text-xs text-indigo-600 font-semibold">กำลังจอง {busyProgress.done}/{busyProgress.total}…</p>}
            </div>
            <div className="flex gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                <button onClick={onClose} disabled={busy} className="flex-1 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl disabled:opacity-50">ยกเลิก</button>
                <button onClick={() => onConfirm(owner.trim(), remark)} disabled={!owner.trim() || busy}
                    className="flex-1 py-2 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
                    {busy ? 'กำลังจอง…' : `จอง ${count} รายการ`}
                </button>
            </div>
        </Modal>
    );
};

// ─── DIALOG: ยกเลิกการจองหลายรายการ ─────────────────────────────────────────────
const BulkReleaseModal = ({ count, busy, onClose, onConfirm }) => (
    <Modal onClose={busy ? () => {} : onClose}>
        <div className="p-5 space-y-3">
            <h3 className="font-black text-slate-800">ยกเลิกการจอง {count} รายการ?</h3>
            <p className="text-xs text-slate-600">เฉพาะ IP ที่จองอยู่จะถูกยกเลิก IP จะกลับเป็น "ว่าง" และชื่อผู้จองจะถูกลบ (Owner และ Remark ยังอยู่)</p>
        </div>
        <div className="flex gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
            <button onClick={onClose} disabled={busy} className="flex-1 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl disabled:opacity-50">ไม่ยกเลิก</button>
            <button onClick={onConfirm} disabled={busy} className="flex-1 py-2 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 disabled:opacity-50">
                {busy ? 'กำลังยกเลิก…' : 'ยืนยัน'}
            </button>
        </div>
    </Modal>
);

// ─── COMMAND PALETTE (Ctrl/Cmd + K): ค้นหา IP ข้ามทุก subnet หรือกระโดดไป subnet ─────
const CommandPalette = ({ query, onQuery, subnets, results, loading, onPickSubnet, onPickIP, onClose }) => {
    const [active, setActive] = useState(0);
    const q = query.trim().toLowerCase();
    const subnetHits = q ? subnets.filter(s => s.subnet.includes(q)).slice(0, 6) : [];
    const items = [
        ...subnetHits.map(s => ({ kind: 'subnet', key: `s-${s.subnet}`, subnet: s.subnet })),
        ...results.map(r => ({ kind: 'ip', key: `i-${r._subnet}-${r.ip_address}`, item: r })),
    ];
    useEffect(() => setActive(0), [query]);

    const pick = (it) => { if (!it) return; it.kind === 'subnet' ? onPickSubnet(it.subnet) : onPickIP(it.item); };
    const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]); }
    };

    return (
        <Modal onClose={onClose} width="max-w-xl" top>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <Search size={16} className="text-slate-400" />
                <input autoFocus value={query} onChange={e => onQuery(e.target.value)} onKeyDown={onKey}
                    placeholder="ค้นหา IP, hostname, owner, serial, MAC หรือพิมพ์ subnet…"
                    className="flex-1 text-sm outline-none bg-transparent" />
                {loading && <RefreshCw size={13} className="animate-spin text-slate-400" />}
                <kbd className="hidden sm:inline text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
            </div>
            <div className="max-h-96 overflow-y-auto">
                {!q && <p className="px-4 py-8 text-center text-xs text-slate-400">พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา</p>}
                {q.length >= 2 && items.length === 0 && !loading && <p className="px-4 py-8 text-center text-xs text-slate-400">ไม่พบรายการที่ตรงกัน</p>}
                {items.map((it, i) => (
                    <button key={it.key} onMouseEnter={() => setActive(i)} onClick={() => pick(it)}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                        {it.kind === 'subnet' ? (
                            <>
                                <span className="font-mono text-sm font-bold text-slate-700">{it.subnet}.0/24</span>
                                <span className="text-[10px] font-semibold text-slate-400 uppercase">Subnet</span>
                            </>
                        ) : (
                            <>
                                <div className="min-w-0">
                                    <p className="font-mono text-sm font-bold text-indigo-600">{it.item.ip_address}</p>
                                    <p className="text-[11px] text-slate-400 truncate">
                                        {it.item.hostname && it.item.hostname !== '-' ? it.item.hostname : 'ไม่มี hostname'}
                                        {it.item.owner_name ? ` • ${it.item.owner_name}` : ''}
                                        {it.item.serial_number ? ` • SN ${it.item.serial_number}` : ''}
                                    </p>
                                </div>
                                <StatusPill status={getDisplayStatus(it.item)} />
                            </>
                        )}
                    </button>
                ))}
            </div>
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 flex gap-3">
                <span>↑↓ เลือก</span><span>Enter เปิด</span><span>Esc ปิด</span>
            </div>
        </Modal>
    );
};

// ─── SPARKLINE: เส้นแนวโน้ม (ค่า 0–100 เป็นเปอร์เซ็นต์) ──────────────────────────
const Sparkline = ({ points }) => {
    const w = 220, h = 28;
    const step = points.length > 1 ? w / (points.length - 1) : w;
    const d = points.map((v, i) => `${(i * step).toFixed(1)},${(h - (Math.min(Math.max(v, 0), 100) / 100) * h).toFixed(1)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7" preserveAspectRatio="none" role="img" aria-label="แนวโน้ม online">
            <polyline points={d} fill="none" stroke="#10b981" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
    );
};

// ─── SCAN STATUS ──────────────────────────────────────────────────────────────
const ScanStatus = ({ scanning, lastScan }) => (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className={`w-2 h-2 rounded-full shrink-0 ${scanning ? 'bg-indigo-500 animate-pulse' : lastScan ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        {scanning
            ? <span className="text-indigo-600 font-semibold">กำลังสแกน…</span>
            : lastScan ? <span>สแกนล่าสุด <span className="font-mono text-slate-700">{lastScan}</span></span>
                : <span>ยังไม่เคยสแกน</span>}
    </div>
);

// ─── Export: สร้าง sheet จากแถวข้อมูล ───────────────────────────────────────────
const EXPORT_COLS = [
    { key: 'ip_address', label: 'IP Address', wch: 15 },
    { key: '_status', label: 'Status', wch: 18 },
    { key: 'hostname', label: 'Hostname', wch: 22 },
    { key: 'owner_name', label: 'Owner', wch: 18 },
    { key: 'remark', label: 'Remark', wch: 28 },
    { key: 'device', label: 'Device', wch: 16 },
    { key: 'asset_tag', label: 'Asset Tag', wch: 16 },
    { key: 'location', label: 'Location', wch: 28 },
    { key: 'contact', label: 'Contact', wch: 18 },
    { key: 'purpose', label: 'Purpose', wch: 18 },
    { key: 'ip_type', label: 'IP Type', wch: 10 },
    { key: 'serial_number', label: 'Serial', wch: 18 },
    { key: 'mac_address', label: 'MAC', wch: 18 },
    { key: '_reserved', label: 'Reserved', wch: 10 },
    { key: 'reserveby', label: 'Reserved By', wch: 16 },
    { key: 'last_scan', label: 'Last Scan', wch: 20 },
    { key: 'last_seen_active', label: 'Last Active', wch: 20 },
    { key: 'inactive_days', label: 'Inactive Days', wch: 13 },
];
const buildSheet = (data) => {
    const ROW_COLORS = {
        active: 'D1FAE5', 'reserved-active': 'A7F3D0', 'reserved-inactive': 'FEF3C7', inactive: 'FEE2E2', available: 'FFFFFF',
    };
    const BORDER_THIN = { style: 'thin', color: { rgb: 'CBD5E1' } };
    const BORDER_MED = { style: 'medium', color: { rgb: '312E81' } };
    const FULL_BORDER = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };
    const HEAD_BORDER = { top: BORDER_MED, bottom: BORDER_MED, left: BORDER_THIN, right: BORDER_THIN };
    const HEADER_STYLE = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        fill: { patternType: 'solid', fgColor: { rgb: '4338CA' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: HEAD_BORDER,
    };
    const ws = {};
    EXPORT_COLS.forEach((col, ci) => {
        ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = { v: col.label, t: 's', s: HEADER_STYLE };
    });
    data.forEach((d, ri) => {
        const status = getDisplayStatus(d);
        const inactive = isInactive(d);
        const fill = ROW_COLORS[inactive ? 'inactive' : status] || 'FFFFFF';
        const cellStyle = { fill: { patternType: 'solid', fgColor: { rgb: fill } }, font: { sz: 10 }, alignment: { vertical: 'center' }, border: FULL_BORDER };
        const ipStyle = { ...cellStyle, font: { sz: 10, bold: true, color: { rgb: '3730A3' } }, alignment: { horizontal: 'center', vertical: 'center' } };
        const row = {
            ip_address: d.ip_address,
            _status: inactive ? `Inactive (${d.inactive_days}d)` : (STATUS_META[status]?.label || status),
            hostname: d.hostname && d.hostname !== '-' ? d.hostname : '',
            owner_name: d.owner_name || '',
            remark: d.remark || '',
            device: d.device || '',
            asset_tag: d.asset_tag || '',
            location: d.location || '',
            contact: d.contact || '',
            purpose: d.purpose || '',
            ip_type: d.ip_type || '',
            serial_number: d.serial_number || '',
            mac_address: d.mac_address || '',
            _reserved: isReserved(d) ? 'Yes' : 'No',
            reserveby: d.reserveby || '',
            last_scan: fmtDT(d.last_scan),
            last_seen_active: fmtDT(d.last_seen_active),
            inactive_days: d.inactive_days ?? '',
        };
        EXPORT_COLS.forEach((col, ci) => {
            const val = row[col.key];
            ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = {
                v: val ?? '', t: typeof val === 'number' ? 'n' : 's', s: ci === 0 ? ipStyle : cellStyle,
            };
        });
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: EXPORT_COLS.length - 1, r: data.length } });
    ws['!cols'] = EXPORT_COLS.map(c => ({ wch: c.wch }));
    ws['!rows'] = [{ hpt: 20 }, ...data.map(() => ({ hpt: 18 }))];
    return ws;
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
const IPManagementPage = () => {
    const { user } = useAuth();
    const API = `${API_BASE}/ip-scan`;
    const actor = resolveActor(user);
    const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

    const [subnets, setSubnets] = useState([]);
    const [subnetQuery, setSubnetQuery] = useState('');
    const [allData, setAllData] = useState([]);
    const [currentSN, setCurrentSN] = useState('');
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [lastScanTime, setLastScanTime] = useState('');
    const urlInit = useRef(null);
    if (urlInit.current === null) urlInit.current = readUrl();
    const [viewMode, setViewMode] = useState(() => urlInit.current.view || (isMobile() ? 'table' : 'grid'));
    const [search, setSearch] = useState(() => urlInit.current.q);
    const [filterStatus, setFilterStatus] = useState(() => urlInit.current.filter);
    const [mainView, setMainView] = useState(() => urlInit.current.v);
    const [panel, setPanel] = useState({ kind: '', rows: [], loading: false, err: '' });
    // รายการแจ้งเตือน: MAC ซ้ำ / ชื่อเครื่องซ้ำ (โหลดตอนเปิดหน้า และตอนเข้าแท็บแจ้งเตือน)
    const [alerts, setAlerts] = useState(null);
    const [alertsErr, setAlertsErr] = useState('');
    const [alertsLoading, setAlertsLoading] = useState(false);
    const [panelQuery, setPanelQuery] = useState('');
    const [tlFilter, setTlFilter] = useState({ sn: '', action: '' });
    const [openOwner, setOpenOwner] = useState('');
    const [inactiveSel, setInactiveSel] = useState(() => new Set());
    const [inactiveReleaseOpen, setInactiveReleaseOpen] = useState(false);
    const [snapMap, setSnapMap] = useState({});
    const [colMenuOpen, setColMenuOpen] = useState(false);
    // คอลัมน์ที่ซ่อนและความหนาแน่นของตาราง — จำไว้ในเครื่อง (ไม่ส่งไป server)
    const [hiddenCols, setHiddenCols] = useState(() => {
        try { return new Set(JSON.parse(localStorage.getItem('ip_hidden_cols') || '[]')); } catch { return new Set(); }
    });
    const [dense, setDense] = useState(() => {
        try { return localStorage.getItem('ip_dense') === '1'; } catch { return false; }
    });
    const toggleCol = (key) => setHiddenCols(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        try { localStorage.setItem('ip_hidden_cols', JSON.stringify([...next])); } catch { /* storage ไม่พร้อม */ }
        return next;
    });
    const toggleDense = () => setDense(v => {
        try { localStorage.setItem('ip_dense', v ? '0' : '1'); } catch { /* storage ไม่พร้อม */ }
        return !v;
    });
    const [changedIPs, setChangedIPs] = useState(() => new Set()); // ช่องที่เปลี่ยนสถานะตอนรีเฟรช
    const [lastRefresh, setLastRefresh] = useState('');
    const prevSnapRef = useRef({ sn: '', map: null });
    const flashTimerRef = useRef(null);
    const lastFetchRef = useRef(0);
    const toastTimerRef = useRef(null);
    const [selectedIP, setSelectedIP] = useState(null);
    const [historyKey, setHistoryKey] = useState(0);
    const [addSubnet, setAddSubnet] = useState(false);
    const [toast, setToast] = useState(null);
    const [showExport, setShowExport] = useState(false);
    const [highlightIP, setHighlightIP] = useState(null);
    const highlightTimerRef = useRef(null);
    const scanPollRef = useRef(null);

    // multi-select
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState(() => new Set());
    const [bulkDialog, setBulkDialog] = useState(null); // 'reserve' | 'release' | null
    const [bulkProgress, setBulkProgress] = useState(null);

    // command palette + global search
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [globalQuery, setGlobalQuery] = useState('');
    const [globalResults, setGlobalResults] = useState([]);
    const [globalLoading, setGlobalLoading] = useState(false);
    const allSubnetsCache = useRef({});
    const globalDebounce = useRef(null);

    const { show: showTip, hide: hideTip } = useTooltip();

    // action (ไม่บังคับ) = ปุ่มในแถบแจ้งเตือน เช่น "เลิกทำ" ค้างไว้ 6 วินาที
    const showToast = useCallback((msg, type = 'success', action = null) => {
        setToast({ msg, type, action });
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), action ? 6000 : 3500);
    }, []);

    // ── โหลดข้อมูล ──────────────────────────────────────────────────────────────
    const loadSubnets = useCallback(async () => {
        try {
            const r = await fetch(`${API}/subnets`, { headers: authHeaders() });
            const err = await responseError(r);
            if (err) throw new Error(err);
            const d = await r.json();
            setSubnets(d); return d;
        } catch (e) { showToast('โหลด subnet ไม่สำเร็จ: ' + e.message, 'error'); return []; }
    }, [API, showToast]);

    // สัญญาณของแถวที่ใช้ตรวจว่า "เปลี่ยนสถานะ" หรือไม่ (ไม่รวมเวลา เพื่อไม่ให้ทุกช่องกะพริบ)
    const sigOf = (d) => `${d.scan_result || ''}|${d.reservation_status || ''}|${d.owner_name || ''}`;

    const loadIPs = useCallback(async (sn, { silent = false } = {}) => {
        lastFetchRef.current = Date.now();
        if (!silent) setLoading(true);
        try {
            const r = await fetch(`${API}/ips?subnet=${sn}`, { headers: authHeaders() });
            const err = await responseError(r);
            if (err) throw new Error(err);
            const d = await r.json();
            const next = buildFull254(sn, d);

            // ไฮไลต์เฉพาะช่องที่เปลี่ยน — เทียบกับสแนปชอตก่อนหน้าของ subnet เดิมเท่านั้น
            const prev = prevSnapRef.current;
            if (prev.sn === sn && prev.map) {
                const changed = next
                    .filter(x => prev.map.has(x.ip_address) && prev.map.get(x.ip_address) !== sigOf(x))
                    .map(x => x.ip_address);
                if (changed.length) {
                    setChangedIPs(new Set(changed));
                    clearTimeout(flashTimerRef.current);
                    flashTimerRef.current = setTimeout(() => setChangedIPs(new Set()), 2600);
                }
            }
            prevSnapRef.current = { sn, map: new Map(next.map(x => [x.ip_address, sigOf(x)])) };

            setAllData(next);
            const latest = d.filter(x => x.last_scan).sort((a, b) => b.last_scan.localeCompare(a.last_scan))[0];
            setLastScanTime(fmtDT(latest?.last_scan));
            setLastRefresh(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        } catch (e) {
            if (!silent) showToast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error');
        }
        if (!silent) setLoading(false);
    }, [API, showToast]);

    const ensureSubnetCached = async (sn) => {
        if (allSubnetsCache.current[sn]) return allSubnetsCache.current[sn];
        try {
            const r = await fetch(`${API}/ips?subnet=${sn}`, { headers: authHeaders() });
            const err = await responseError(r);
            if (err) return [];
            const full = buildFull254(sn, await r.json());
            allSubnetsCache.current[sn] = full;
            return full;
        } catch { return []; }
    };

    const runGlobalSearch = useCallback(async (q) => {
        if (!q.trim() || q.trim().length < 2) { setGlobalResults([]); return; }
        setGlobalLoading(true);
        const query = q.trim().toLowerCase();
        await Promise.all(subnets.map(s => ensureSubnetCached(s.subnet)));
        const matches = [];
        for (const s of subnets) {
            for (const d of allSubnetsCache.current[s.subnet] || []) {
                const hit = d.ip_address.includes(query)
                    || (d.hostname || '').toLowerCase().includes(query)
                    || (d.owner_name || '').toLowerCase().includes(query)
                    || (d.remark || '').toLowerCase().includes(query)
                    || (d.serial_number || '').toLowerCase().includes(query)
                    || (d.device || '').toLowerCase().includes(query)
                    || (d.asset_tag || '').toLowerCase().includes(query)
                    || (d.location || '').toLowerCase().includes(query)
                    || (d.contact || '').toLowerCase().includes(query)
                    || (d.mac_address || '').toLowerCase().includes(query);
                if (hit) {
                    matches.push({ ...d, _subnet: s.subnet });
                    if (matches.length >= 50) break;
                }
            }
            if (matches.length >= 50) break;
        }
        setGlobalResults(matches);
        setGlobalLoading(false);
    }, [subnets, API]);

    const onGlobalQueryChange = (val) => {
        setGlobalQuery(val);
        clearTimeout(globalDebounce.current);
        globalDebounce.current = setTimeout(() => runGlobalSearch(val), 300);
    };

    const closePalette = () => { setPaletteOpen(false); setGlobalQuery(''); setGlobalResults([]); };

    const focusIP = (ip, sn) => {
        setSearch(''); setFilterStatus('all');
        setViewMode(isMobile() ? 'table' : 'grid');
        const go = () => {
            const el = document.getElementById(`cell-${ip}`) || document.getElementById(`row-${ip}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        if (sn && sn !== currentSN) {
            setCurrentSN(sn);
            loadIPs(sn).then(() => setTimeout(go, 150));
        } else {
            setTimeout(go, 150);
        }
        clearTimeout(highlightTimerRef.current);
        setHighlightIP(ip);
        highlightTimerRef.current = setTimeout(() => setHighlightIP(null), 2500);
    };

    const pickPaletteIP = (item) => {
        closePalette();
        focusIP(item.ip_address, item._subnet);
        setSelectedIP(item.ip_address);
    };
    const pickPaletteSubnet = (sn) => { closePalette(); selectSubnet(sn); };

    useEffect(() => {
        loadSubnets().then(d => {
            if (!d.length) return;
            const want = urlInit.current.sn && d.some(s => s.subnet === urlInit.current.sn) ? urlInit.current.sn : d[0].subnet;
            setCurrentSN(want);
            loadIPs(want);
        });
    }, []);

    // เก็บสถานะการดูไว้ใน URL (replaceState ไม่เพิ่มประวัติการกด back)
    useEffect(() => {
        const p = new URLSearchParams();
        if (currentSN) p.set('subnet', currentSN);
        if (filterStatus !== 'all') p.set('filter', filterStatus);
        if (viewMode === 'table') p.set('view', 'table');
        if (search.trim()) p.set('q', search.trim());
        if (mainView !== 'subnet') p.set('v', mainView);
        const qs = p.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }, [currentSN, filterStatus, viewMode, search, mainView]);

    // โหลดข้อมูลของมุมมองไทม์ไลน์ / inactive (ภาพรวมใช้ข้อมูล subnet ที่โหลดอยู่แล้ว)
    const loadPanel = useCallback(async (kind, opts = {}) => {
        setPanel({ kind, rows: [], loading: true, err: '' });
        try {
            let path = '/inactive';
            if (kind === 'owners') path = '/reserved';
            if (kind === 'timeline') {
                const q = new URLSearchParams({ limit: '100' });
                if (opts.sn) q.set('subnet', opts.sn);
                if (opts.action) q.set('action', opts.action);
                path = `/history?${q.toString()}`;
            }
            const r = await fetch(`${API}${path}`, { headers: authHeaders() });
            const err = await responseError(r);
            if (err) throw new Error(err);
            setPanel({ kind, rows: await r.json(), loading: false, err: '' });
        } catch (e) {
            setPanel({ kind, rows: [], loading: false, err: e.message });
        }
    }, [API]);

    useEffect(() => {
        if (mainView === 'timeline' || mainView === 'inactive' || mainView === 'owners') loadPanel(mainView, tlFilter);
    }, [mainView, loadPanel]);

    const loadAlerts = useCallback(async () => {
        setAlertsLoading(true);
        try {
            const r = await fetch(`${API}/alerts`, { headers: authHeaders() });
            const err = await responseError(r);
            if (err) throw new Error(err);
            setAlerts(await r.json());
            setAlertsErr('');
        } catch (e) {
            setAlertsErr(e.message);
        } finally {
            setAlertsLoading(false);
        }
    }, [API]);

    // โหลดครั้งแรกเพื่อแสดงจำนวนบนแท็บ และโหลดใหม่ทุกครั้งที่เปิดแท็บแจ้งเตือน
    useEffect(() => { loadAlerts(); }, [loadAlerts]);
    useEffect(() => { if (mainView === 'alerts') loadAlerts(); }, [mainView, loadAlerts]);

    // แนวโน้ม online ต่อ subnet (สแนปชอตรายวัน) สำหรับการ์ดภาพรวม
    useEffect(() => {
        if (mainView !== 'overview') return;
        (async () => {
            try {
                const r = await fetch(`${API}/snapshots?days=14`, { headers: authHeaders() });
                if (await responseError(r)) return;
                const rows = await r.json();
                const map = {};
                rows.forEach(x => { (map[x.subnet] ||= []).push(x); });
                setSnapMap(map);
            } catch { /* แนวโน้มไม่บังคับ — ไม่แสดงก็ได้ */ }
        })();
    }, [mainView, API]);

    // เปิด IP จากมุมมองอื่น → ไปที่ subnet นั้นแล้วเปิด drawer
    const openIPFromAnywhere = (ip) => {
        const sn = ip.split('.').slice(0, 3).join('.');
        setMainView('subnet');
        focusIP(ip, sn);
        setSelectedIP(ip);
    };

    // รีเฟรชเงียบ ๆ ทุก 60 วินาที และเมื่อกลับมาที่แท็บ (จำกัดไม่เกิน 1 ครั้งต่อ 20 วินาที)
    const refreshSilently = useCallback(() => {
        if (!currentSN || scanning || document.visibilityState !== 'visible') return;
        if (Date.now() - lastFetchRef.current < 20000) return;
        loadIPs(currentSN, { silent: true });
        loadSubnets();
    }, [currentSN, scanning, loadIPs, loadSubnets]);

    useEffect(() => {
        const t = setInterval(refreshSilently, 60000);
        const onVisible = () => { if (document.visibilityState === 'visible') refreshSilently(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
    }, [refreshSilently]);

    // Ctrl/Cmd+K เปิด palette
    useEffect(() => {
        const h = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPaletteOpen(v => !v);
            }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, []);

    useEffect(() => {
        if (!showExport) return;
        const handler = (e) => { if (!e.target.closest('[data-export-dropdown]')) setShowExport(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showExport]);

    const selectSubnet = (sn) => {
        setCurrentSN(sn); setSearch(''); setFilterStatus('all');
        setSelected(new Set());
        loadIPs(sn);
    };

    // ── สรุป ─────────────────────────────────────────────────────────────────────
    const counts = useMemo(() => ({
        all: allData.length,
        active: allData.filter(isOnline).length,
        reserved: allData.filter(isReserved).length,
        available: allData.filter(d => !isOnline(d) && !isReserved(d)).length,
        inactive: allData.filter(isInactive).length,
    }), [allData]);

    const capacity = useMemo(() => {
        const total = subnets.reduce((a, s) => a + (s.total || 0), 0);
        const online = subnets.reduce((a, s) => a + (s.active_count || 0), 0);
        const reserved = subnets.reduce((a, s) => a + (s.reserved_count || 0), 0);
        const inactive = subnets.reduce((a, s) => a + (s.inactive_count || 0), 0);
        const dense = subnets.filter(s => s.total && (s.active_count || 0) / s.total * 100 >= DENSE_SUBNET_PCT).length;
        return { total, online, reserved, inactive, dense, pct: total ? Math.round(online / total * 100) : 0 };
    }, [subnets]);

    const visibleSet = useMemo(() => {
        const s = new Set();
        const q = search.trim().toLowerCase();
        allData.forEach(d => {
            const matchSearch = !q || d.ip_address.includes(q)
                || (d.hostname || '').toLowerCase().includes(q)
                || (d.owner_name || '').toLowerCase().includes(q)
                || (d.remark || '').toLowerCase().includes(q)
                || (d.serial_number || '').toLowerCase().includes(q)
                || (d.device || '').toLowerCase().includes(q)
                || (d.asset_tag || '').toLowerCase().includes(q)
                || (d.location || '').toLowerCase().includes(q)
                || (d.contact || '').toLowerCase().includes(q)
                || (d.mac_address || '').toLowerCase().includes(q);
            const matchFilter = filterStatus === 'all'
                || (filterStatus === 'inactive' && isInactive(d))
                || (filterStatus === 'active' && isOnline(d))
                || (filterStatus === 'reserved' && isReserved(d))
                || (filterStatus === 'available' && !isOnline(d) && !isReserved(d));
            if (matchSearch && matchFilter) s.add(d.ip_address);
        });
        return s;
    }, [allData, search, filterStatus]);
    const filtered = useMemo(() => allData.filter(d => visibleSet.has(d.ip_address)), [allData, visibleSet]);

    // ── เขียนข้อมูล ───────────────────────────────────────────────────────────────
    // คืน error message หรือ null (ไม่แสดง toast เอง เพื่อให้ bulk รวมผลได้)
    const putIP = async (ip, payload) => {
        try {
            const r = await fetch(`${API}/ips/${ip}`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ ...payload, updated_by: actor }),
            });
            const err = await responseError(r);
            return err || null;
        } catch (e) { return e.message; }
    };

    const refreshAfterWrite = async () => {
        allSubnetsCache.current = {};
        await loadIPs(currentSN);
        await loadSubnets();
        setHistoryKey(k => k + 1);
    };

    // สแนปชอตค่าเดิมของ IP ก่อนเขียน — ใช้ทำปุ่ม "เลิกทำ"
    const snapshotOf = (ip) => {
        const d = allData.find(x => x.ip_address === ip);
        if (!d) return null;
        return {
            owner_name: d.owner_name || '',
            remark: d.remark || '',
            serial_number: d.serial_number || null,
            mac_address: d.mac_address || null,
            device: d.device || null,
            reservation_status: d.reservation_status || 'available',
            reserveby: d.reserveby || '',
        };
    };
    const undoable = (ip, snap, msg) => showToast(msg, 'success', snap ? {
        label: 'เลิกทำ',
        onClick: async () => {
            const e = await putIP(ip, snap);
            if (e) { showToast('เลิกทำไม่สำเร็จ: ' + e, 'error'); return; }
            showToast(`✓ เลิกทำ ${ip} แล้ว`);
            await refreshAfterWrite();
        },
    } : null);

    const handleSave = async (ip, payload) => {
        const snap = snapshotOf(ip);
        const e = await putIP(ip, payload);
        if (e) { showToast('บันทึกไม่สำเร็จ: ' + e, 'error'); return false; }
        undoable(ip, snap, `✓ บันทึก ${ip} แล้ว`);
        await refreshAfterWrite();
        return true;
    };
    const handleReserve = async (ip, payload) => {
        const snap = snapshotOf(ip);
        const e = await putIP(ip, payload);
        if (e) { showToast('จองไม่สำเร็จ: ' + e, 'error'); return false; }
        undoable(ip, snap, `✓ จอง ${ip} สำหรับ ${payload.owner_name}`);
        await refreshAfterWrite();
        return true;
    };
    const handleRelease = async (ip) => {
        const snap = snapshotOf(ip);
        const e = await putIP(ip, { reservation_status: 'available', reserveby: '' });
        if (e) { showToast('ยกเลิกไม่สำเร็จ: ' + e, 'error'); return false; }
        undoable(ip, snap, `✓ ยกเลิกการจอง ${ip} แล้ว`);
        await refreshAfterWrite();
        return true;
    };

    // bulk: ทำทีละรายการ (แต่ละครั้งมีประวัติของตัวเอง) แล้วรีเฟรชครั้งเดียว
    // เลิกทำแบบกลุ่ม: คืนค่าจากสแนปชอตของแต่ละ IP ที่เขียนสำเร็จ
    const bulkUndo = (okIps, snaps, after) => (okIps.length ? {
        label: 'เลิกทำ',
        onClick: async () => {
            let n = 0;
            for (const ip of okIps) { if (snaps[ip] && !(await putIP(ip, snaps[ip]))) n++; }
            showToast(`✓ เลิกทำ ${n} รายการแล้ว`);
            await refreshAfterWrite();
            if (after) await after();
        },
    } : null);

    const runBulk = async (ips, makePayload, label) => {
        const snaps = Object.fromEntries(ips.map(ip => [ip, snapshotOf(ip)]));
        const okIps = []; const failed = [];
        for (let i = 0; i < ips.length; i++) {
            setBulkProgress({ done: i, total: ips.length });
            const e = await putIP(ips[i], makePayload(ips[i]));
            if (e) failed.push(ips[i]); else okIps.push(ips[i]);
        }
        setBulkProgress(null);
        setBulkDialog(null);
        setSelected(new Set());
        setSelectMode(false);
        await refreshAfterWrite();
        const ok = okIps.length;
        showToast(failed.length
            ? `${label} ${ok} รายการ — ไม่สำเร็จ ${failed.length} (${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''})`
            : `✓ ${label} ${ok} รายการ`, failed.length ? 'error' : 'success', bulkUndo(okIps, snaps));
    };

    // ยกเลิกการจองที่เลือกในมุมมอง Inactive (สแนปชอตจากแถวใน panel)
    const inactiveRows = panel.kind === 'inactive' ? panel.rows : [];
    const inactiveReleaseTargets = inactiveRows.filter(r => inactiveSel.has(r.ip_address) && r.reservation_status === 'reserved');
    const releaseInactiveSelected = async () => {
        const ips = inactiveReleaseTargets.map(r => r.ip_address);
        const snaps = Object.fromEntries(inactiveReleaseTargets.map(r => [r.ip_address, { reservation_status: 'reserved', reserveby: r.reserveby || '' }]));
        const okIps = []; const failed = [];
        for (const ip of ips) {
            const e = await putIP(ip, { reservation_status: 'available', reserveby: '' });
            if (e) failed.push(ip); else okIps.push(ip);
        }
        setInactiveReleaseOpen(false);
        setInactiveSel(new Set());
        await refreshAfterWrite();
        await loadPanel('inactive');
        showToast(failed.length
            ? `ยกเลิกการจอง ${okIps.length} รายการ — ไม่สำเร็จ ${failed.length}`
            : `✓ ยกเลิกการจอง ${okIps.length} รายการ`, failed.length ? 'error' : 'success',
            bulkUndo(okIps, snaps, () => loadPanel('inactive')));
    };

    const selectedRows = useMemo(() => allData.filter(d => selected.has(d.ip_address)), [allData, selected]);
    const selectedFreeIPs = selectedRows.filter(d => !isReserved(d)).map(d => d.ip_address);
    const selectedReservedIPs = selectedRows.filter(isReserved).map(d => d.ip_address);

    const bulkReserveConfirm = (owner, remark) => runBulk(
        selectedFreeIPs,
        () => ({ owner_name: owner, remark, reservation_status: 'reserved', reserveby: actor }),
        'จอง',
    );
    const bulkReleaseConfirm = () => runBulk(
        selectedReservedIPs,
        () => ({ reservation_status: 'available', reserveby: '' }),
        'ยกเลิกการจอง',
    );

    const toggleSelect = (ip) => setSelected(prev => {
        const next = new Set(prev);
        next.has(ip) ? next.delete(ip) : next.add(ip);
        return next;
    });

    const handleActivate = (ip) => {
        if (selectMode) toggleSelect(ip);
        else setSelectedIP(ip);
    };

    // ── คีย์บอร์ดใน grid: ลูกศรเลื่อนช่อง, Enter/Space เปิดรายละเอียด ───────────────
    const onGridKey = (e) => {
        const idx = Number(e.target.dataset?.idx);
        if (Number.isNaN(idx)) return;
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 20, ArrowUp: -20 }[e.key];
        if (step) {
            e.preventDefault();
            let next = idx + step;
            while (next >= 0 && next < 254) {
                const el = document.querySelector(`[data-idx="${next}"]`);
                if (el && el.tabIndex >= 0) { el.focus(); break; }
                next += step; // ข้ามช่องที่ซ่อนอยู่ในทิศทางเดิม
            }
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const d = allData[idx];
            if (d) handleActivate(d.ip_address);
        }
    };

    // ── Export ────────────────────────────────────────────────────────────────────
    const exportRows = (rows, filename) => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, buildSheet(rows), (currentSN || 'IP').slice(0, 31));
        XLSX.writeFile(wb, filename);
    };
    const exportCurrent = () => {
        const date = new Date().toLocaleDateString('sv-SE');
        exportRows(allData, `IP_${currentSN}_${date}.xlsx`);
        setShowExport(false);
        showToast(`✓ Export ${currentSN}.0/24 แล้ว`);
    };
    const exportSelected = () => {
        const date = new Date().toLocaleDateString('sv-SE');
        exportRows(selectedRows, `IP_selected_${currentSN}_${date}.xlsx`);
        showToast(`✓ Export ${selectedRows.length} รายการแล้ว`);
    };
    const exportAll = async () => {
        setShowExport(false);
        showToast('กำลัง export ทุก subnet…');
        const wb = XLSX.utils.book_new();
        for (const s of subnets) {
            const full = await ensureSubnetCached(s.subnet);
            if (!full.length) continue;
            const name = s.subnet.replace(/[/?*[\]\\:]/g, '_').substring(0, 31);
            XLSX.utils.book_append_sheet(wb, buildSheet(full), name);
        }
        const date = new Date().toLocaleDateString('sv-SE');
        XLSX.writeFile(wb, `IP_All_Subnets_${date}.xlsx`);
        showToast('✓ Export ทุก subnet แล้ว');
    };

    // ── Scan Now: poll สถานะจริงจาก server ─────────────────────────────────────────
    const stopScanPolling = useCallback(() => {
        clearInterval(scanPollRef.current);
        scanPollRef.current = null;
    }, []);
    useEffect(() => stopScanPolling, [stopScanPolling]);

    const finishScan = useCallback(() => { stopScanPolling(); setScanning(false); }, [stopScanPolling]);

    const pollScanStatus = useCallback((sn) => {
        stopScanPolling();
        scanPollRef.current = setInterval(async () => {
            try {
                const r = await fetch(`${API}/scan-status?subnet=${sn}`, { headers: authHeaders() });
                const err = await responseError(r);
                if (err) throw new Error(err);
                const job = await r.json();
                if (job.status === 'running') return;
                finishScan();
                if (job.status === 'done') {
                    showToast(`✓ สแกน ${sn}.0/24 เสร็จ — ออนไลน์ ${job.active}/254`);
                    allSubnetsCache.current = {};
                    await loadIPs(sn); await loadSubnets();
                } else if (job.status === 'error') {
                    showToast('สแกนไม่สำเร็จ: ' + job.error, 'error');
                } else {
                    showToast('ไม่พบสถานะการสแกน (server อาจรีสตาร์ท)', 'error');
                }
            } catch (e) {
                finishScan();
                showToast('ตรวจสถานะสแกนไม่สำเร็จ: ' + e.message, 'error');
            }
        }, 3000);
    }, [API, stopScanPolling, finishScan, loadIPs, loadSubnets, showToast]);

    const handleTriggerScan = async () => {
        if (!currentSN || scanning) return;
        setScanning(true);
        try {
            const r = await fetch(`${API}/trigger`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ subnet: currentSN }) });
            const err = await responseError(r);
            if (err) throw new Error(err);
            showToast(`กำลังสแกน ${currentSN}.0/24…`);
            pollScanStatus(currentSN);
        } catch (e) {
            showToast('เริ่มสแกนไม่สำเร็จ: ' + e.message, 'error');
            setScanning(false);
        }
    };

    const handleAddSubnet = async (subnet) => {
        try {
            const r = await fetch(`${API}/subnets/add`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ subnet }) });
            const err = await responseError(r);
            if (err) return err;
            allSubnetsCache.current = {};
            setAddSubnet(false); showToast(`✓ เพิ่ม ${subnet}.0/24 แล้ว`);
            await loadSubnets(); setCurrentSN(subnet); await loadIPs(subnet); return null;
        } catch (e) { return e.message; }
    };

    // ── ตัวแปรสำหรับ render ────────────────────────────────────────────────────────
    const hasFilter = !!search || filterStatus !== 'all';
    const FILTERS = [
        { key: 'all', label: 'ทั้งหมด', dot: 'bg-slate-400' },
        { key: 'active', label: 'Online', dot: 'bg-emerald-500' },
        { key: 'reserved', label: 'จองแล้ว', dot: 'bg-amber-400' },
        { key: 'available', label: 'ว่าง', dot: 'bg-slate-300' },
        { key: 'inactive', label: `ไม่ใช้งาน >${INACTIVE_THRESHOLD} วัน`, dot: 'bg-red-400' },
    ];
    const cardClass = 'bg-white rounded-2xl border border-slate-200 shadow-sm';

    const StatCard = ({ icon: Icon, title, value, sub, gradient }) => (
        <div className={`${cardClass} p-4 flex items-start justify-between gap-3`}>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">{title}</p>
                <p className="text-2xl font-black text-slate-900 mt-0.5">{value}</p>
                {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
            </div>
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm shrink-0`}>
                <Icon className="w-4.5 h-4.5 text-white" size={18} />
            </div>
        </div>
    );

    const renderGrid = () => (
        <div className={`${cardClass} p-4`} onKeyDown={onGridKey}>
            <div className="flex gap-1 pl-7 w-full">
                {Array.from({ length: 20 }, (_, i) => (
                    <div key={i} className="flex-1 text-center text-[9px] font-mono text-slate-400">+{i}</div>
                ))}
            </div>
            <div className="space-y-1.5 mt-1.5">
                {Array.from({ length: 13 }, (_, row) => (
                    <div key={row} className="flex items-center gap-1 w-full">
                        <div className="w-6 text-right text-[9px] font-mono text-slate-400 pr-1 shrink-0">{row * 20 + 1}</div>
                        {Array.from({ length: 20 }, (_, col) => {
                            const idx = row * 20 + col;
                            if (idx >= allData.length) return <div key={col} className="flex-1 aspect-square" />;
                            const d = allData[idx];
                            return (
                                <div key={d.ip_address} className="flex-1 min-w-0">
                                    <IPCell data={d} idx={idx} showTip={showTip} hideTip={hideTip}
                                        onActivate={handleActivate} hidden={!visibleSet.has(d.ip_address)}
                                        selected={selected.has(d.ip_address)} highlighted={highlightIP === d.ip_address}
                                        changed={changedIPs.has(d.ip_address)} />
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );

    // คอลัมน์ของตาราง (IP และปุ่มแก้ไขแสดงเสมอ) — ซ่อน/แสดงได้ และจำค่าไว้ในเครื่อง
    const TABLE_COLS = [
        { key: 'status', label: 'สถานะ', cell: d => <StatusPill status={getDisplayStatus(d)} /> },
        { key: 'inactive', label: 'ไม่ใช้งาน', cell: d => isInactive(d) ? <InactiveBadge days={d.inactive_days} /> : <span className="text-slate-300">—</span> },
        { key: 'hostname', label: 'ชื่อเครื่อง (Hostname)', cell: d => d.hostname && d.hostname !== '-'
            ? <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5 whitespace-nowrap"><Monitor size={12} className="text-indigo-500" />{d.hostname}</span>
            : <span className="text-slate-300">—</span> },
        { key: 'owner', label: 'Owner', cell: d => <span className="text-slate-700">{fmtVal(d.owner_name)}</span> },
        { key: 'device', label: 'Device', cell: d => <span className="text-xs text-slate-600">{fmtVal(d.device)}</span> },
        { key: 'location', label: 'สถานที่', cell: d => <span className="text-xs text-slate-600">{fmtVal(d.location)}</span> },
        { key: 'serial', label: 'Serial', cell: d => <span className="font-mono text-xs text-slate-600">{fmtVal(d.serial_number)}</span> },
        { key: 'mac', label: 'MAC', cell: d => <span className="font-mono text-xs text-slate-600">{fmtVal(d.mac_address)}</span> },
        { key: 'iptype', label: 'ประเภท IP', cell: d => <span className="text-xs text-slate-600">{fmtVal(d.ip_type)}</span> },
        { key: 'reserveby', label: 'ผู้จอง', cell: d => <span className="text-slate-600">{fmtVal(d.reserveby)}</span> },
        { key: 'updated_by', label: 'แก้ไขโดย', cell: d => <span className="text-slate-500">{fmtVal(d.updated_by)}</span> },
        { key: 'updated_at', label: 'แก้ไขเมื่อ', cell: d => <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap">{fmtDT(d.updated_at)}</span> },
        { key: 'last_active', label: 'ออนไลน์ล่าสุด', cell: d => <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap">{fmtDT(d.last_seen_active)}</span> },
        { key: 'last_scan', label: 'สแกนล่าสุด', cell: d => <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap">{fmtDT(d.last_scan)}</span> },
    ];
    const visibleCols = TABLE_COLS.filter(c => !hiddenCols.has(c.key));
    const cellPad = dense ? 'py-1.5' : 'py-2.5';

    const renderTable = () => (
        <div className={`${cardClass} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2 relative">
                    <button onClick={() => setColMenuOpen(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                        <List size={12} /> คอลัมน์ ({visibleCols.length}/{TABLE_COLS.length})
                    </button>
                    {colMenuOpen && (
                        <div className="absolute left-0 top-full mt-1.5 z-30 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-2 max-h-80 overflow-y-auto">
                            {TABLE_COLS.map(c => (
                                <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer">
                                    <input type="checkbox" className="accent-indigo-600" checked={!hiddenCols.has(c.key)} onChange={() => toggleCol(c.key)} />
                                    {c.label}
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                <button onClick={toggleDense} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                    {dense ? 'ความหนาแน่น: กระชับ' : 'ความหนาแน่น: ปกติ'}
                </button>
            </div>
            <div className="overflow-x-auto max-h-[64vh]">
                <table className="w-full text-left min-w-max text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs font-semibold sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                            {selectMode && <th className="px-3 py-3 w-8"></th>}
                            <th className="px-3 py-3 w-10 text-center">#</th>
                            <th className="px-3 py-3 whitespace-nowrap">IP Address</th>
                            {visibleCols.map(c => <th key={c.key} className="px-3 py-3 whitespace-nowrap">{c.label}</th>)}
                            <th className="px-3 py-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.map((d, idx) => {
                            const inactive = isInactive(d);
                            const isSel = selected.has(d.ip_address);
                            const rowBg = isSel ? 'bg-indigo-50' : inactive ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50';
                            return (
                                <tr key={d.ip_address} id={`row-${d.ip_address}`}
                                    className={`cursor-pointer transition-colors ${rowBg} ${changedIPs.has(d.ip_address) ? 'bg-sky-50' : ''} ${highlightIP === d.ip_address ? 'ring-2 ring-indigo-400' : ''}`}
                                    onClick={() => handleActivate(d.ip_address)}>
                                    {selectMode && (
                                        <td className={`px-3 ${cellPad}`} onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" checked={isSel} onChange={() => toggleSelect(d.ip_address)} className="w-4 h-4 accent-indigo-600" aria-label={`เลือก ${d.ip_address}`} />
                                        </td>
                                    )}
                                    <td className={`px-3 ${cellPad} text-slate-400 font-mono text-xs text-center`}>{idx + 1}</td>
                                    <td className={`px-3 ${cellPad} font-mono text-[13px] font-bold text-indigo-600 whitespace-nowrap`}>{d.ip_address}</td>
                                    {visibleCols.map(c => <td key={c.key} className={`px-3 ${cellPad}`}>{c.cell(d)}</td>)}
                                    <td className={`px-3 ${cellPad} text-center`}>
                                        <button onClick={e => { e.stopPropagation(); setSelectedIP(d.ip_address); }} className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-white rounded-lg" aria-label="แก้ไข">
                                            <Pencil size={13} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
                แสดง <span className="font-bold text-slate-700">{filtered.length}</span> จาก {allData.length} IP
            </div>
        </div>
    );

    // ── มุมมองภาพรวม: การใช้งานของทุก subnet (ใช้ข้อมูลสรุปที่โหลดอยู่แล้ว ไม่ต้องดึงเพิ่ม) ──
    const renderOverview = () => {
        const sorted = [...subnets].sort((a, b) => (b.active_count || 0) / (b.total || 254) - (a.active_count || 0) / (a.total || 254));
        if (!sorted.length) return <p className="text-sm text-slate-400 py-12 text-center">ยังไม่มี subnet</p>;
        return (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {sorted.map(s => {
                    const total = s.total || 254;
                    const online = Math.round(((s.active_count || 0) / total) * 100);
                    const reserved = Math.round(((s.reserved_count || 0) / total) * 100);
                    return (
                        <button key={s.subnet} onClick={() => { setMainView('subnet'); selectSubnet(s.subnet); }}
                            className={`${cardClass} p-4 text-left hover:shadow-md hover:border-indigo-200 transition-all`}>
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-sm font-bold text-slate-800">{s.subnet}.x</span>
                                {online >= DENSE_SUBNET_PCT && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">หนาแน่น</span>}
                            </div>
                            <div className="mt-3 space-y-2.5">
                                <div>
                                    <div className="flex justify-between text-[11px] text-slate-500"><span>Online</span><span className="font-semibold text-slate-700">{s.active_count || 0} · {online}%</span></div>
                                    <div className="h-2 mt-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${online}%` }} /></div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[11px] text-slate-500"><span>จองแล้ว</span><span className="font-semibold text-slate-700">{s.reserved_count || 0} · {reserved}%</span></div>
                                    <div className="h-2 mt-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{ width: `${reserved}%` }} /></div>
                                </div>
                            </div>
                            {snapMap[s.subnet]?.length > 1 && (
                                <div className="mt-3">
                                    <p className="text-[10px] text-slate-400">แนวโน้ม online 14 วัน</p>
                                    <Sparkline points={snapMap[s.subnet].map(p => ((p.online || 0) / (p.total || 254)) * 100)} />
                                </div>
                            )}
                            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                                <span>{total} IP</span>
                                <span className={s.inactive_count ? 'text-orange-600 font-semibold' : ''}>ไม่ใช้งาน &gt;{INACTIVE_THRESHOLD} วัน: {s.inactive_count || 0}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        );
    };

    // ── มุมมองไทม์ไลน์: ประวัติการเปลี่ยนแปลงล่าสุดของทุก IP ─────────────────────────
    const renderTimeline = () => {
        const isMine = panel.kind === 'timeline';
        const rows = isMine ? panel.rows : [];
        const loading = !isMine || panel.loading;
        return (
            <div className={`${cardClass} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div>
                        <p className="font-bold text-slate-800">ไทม์ไลน์การเปลี่ยนแปลง</p>
                        <p className="text-xs text-slate-400">100 รายการล่าสุดจากทุก subnet</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select value={tlFilter.sn} onChange={e => { const f = { ...tlFilter, sn: e.target.value }; setTlFilter(f); loadPanel('timeline', f); }}
                            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none">
                            <option value="">ทุก subnet</option>
                            {subnets.map(s => <option key={s.subnet} value={s.subnet}>{s.subnet}.x</option>)}
                        </select>
                        <select value={tlFilter.action} onChange={e => { const f = { ...tlFilter, action: e.target.value }; setTlFilter(f); loadPanel('timeline', f); }}
                            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none">
                            <option value="">ทุกการกระทำ</option>
                            <option value="reserve">จอง</option>
                            <option value="release">ยกเลิกจอง</option>
                            <option value="update">แก้ไข</option>
                        </select>
                    </div>
                    <button onClick={() => loadPanel('timeline', tlFilter)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> รีเฟรช
                    </button>
                </div>
                {isMine && panel.err && <p className="px-4 py-6 text-sm text-red-500">โหลดไม่สำเร็จ: {panel.err}</p>}
                {!panel.err && loading && <p className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลด…</p>}
                {!loading && !panel.err && rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">ยังไม่มีประวัติการเปลี่ยนแปลง</p>}
                {!loading && rows.length > 0 && (
                    <ol className="divide-y divide-slate-100 max-h-[68vh] overflow-y-auto">
                        {rows.map(row => {
                            const act = HISTORY_ACTION[row.action] || { label: row.action, cls: 'bg-slate-100 text-slate-600' };
                            const entries = Object.entries(row.changes || {});
                            return (
                                <li key={row.id} className="px-4 py-3 flex gap-3 hover:bg-slate-50">
                                    <div className="w-36 shrink-0 text-[11px] font-mono text-slate-400 pt-0.5">{row.changed_at}</div>
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${act.cls}`}>{act.label}</span>
                                            <button onClick={() => openIPFromAnywhere(row.ip_address)} className="font-mono text-sm font-bold text-indigo-600 hover:underline">{row.ip_address}</button>
                                            <span className="text-xs text-slate-500">โดย <span className="font-semibold text-slate-700">{row.changed_by || '—'}</span></span>
                                        </div>
                                        {entries.length > 0 && (
                                            <p className="text-xs text-slate-500 truncate">
                                                {entries.map(([f, v]) => `${HISTORY_FIELD[f] || f}: ${fmtVal(v?.from)} → ${fmtVal(v?.to)}`).join(' · ')}
                                            </p>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
        );
    };

    // ── มุมมองตามผู้จอง: จัดกลุ่ม IP ที่จองอยู่ตามชื่อผู้จอง ─────────────────────────
    const renderOwners = () => {
        const isMine = panel.kind === 'owners';
        const rows = isMine ? panel.rows : [];
        const loading = !isMine || panel.loading;
        const groups = new Map();
        rows.forEach(r => {
            const key = r.reserveby || '(ไม่ระบุผู้จอง)';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
        });
        const groupList = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
        return (
            <div className="space-y-3">
                <div className={`${cardClass} px-4 py-3 flex flex-wrap items-center justify-between gap-3`}>
                    <div>
                        <p className="font-bold text-slate-800">IP ที่จองอยู่ ตามผู้จอง</p>
                        <p className="text-xs text-slate-400">{rows.length.toLocaleString()} IP · {groupList.length} ผู้จอง</p>
                    </div>
                    <button onClick={() => loadPanel('owners')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> รีเฟรช
                    </button>
                </div>
                {isMine && panel.err && <p className="text-sm text-red-500 px-1">โหลดไม่สำเร็จ: {panel.err}</p>}
                {!panel.err && loading && <p className="text-center text-sm text-slate-400 py-10">กำลังโหลด…</p>}
                {!loading && !panel.err && groupList.length === 0 && <p className="text-center text-sm text-slate-400 py-10">ยังไม่มี IP ที่จอง</p>}
                {!loading && groupList.map(([who, list]) => {
                    const open = openOwner === who;
                    const subnets = [...new Set(list.map(r => r.subnet))];
                    return (
                        <div key={who} className={`${cardClass} overflow-hidden`}>
                            <button onClick={() => setOpenOwner(open ? '' : who)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-800 truncate">{who}</p>
                                    <p className="text-xs text-slate-400 truncate">{subnets.slice(0, 6).map(s => `${s}.x`).join(', ')}{subnets.length > 6 ? ' …' : ''}</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="font-mono font-bold text-slate-700">{list.length} IP</span>
                                    <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
                                </div>
                            </button>
                            {open && (
                                <ul className="divide-y divide-slate-100 border-t border-slate-100 max-h-80 overflow-y-auto">
                                    {list.map(r => (
                                        <li key={r.ip_address}>
                                            <button onClick={() => openIPFromAnywhere(r.ip_address)} className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                                                <span className={`w-2 h-2 rounded-full shrink-0 ${r.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                <span className="font-mono text-sm font-bold text-indigo-600 w-36 shrink-0">{r.ip_address}</span>
                                                <span className="text-xs text-slate-600 truncate">{fmtVal(r.owner_name)} · {fmtVal(r.device)} · {fmtVal(r.location)}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    // ── มุมมอง inactive: IP ที่ไม่ออนไลน์เกินกำหนด เรียงนานที่สุดก่อน ─────────────────
    const renderAlerts = () => {
        const macGroups = alerts?.duplicateMac || [];
        const hostGroups = alerts?.duplicateHostname || [];
        const total = alerts?.total ?? 0;
        const Section = ({ title, hint, children, count }) => (
            <div className={`${cardClass} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-slate-100">
                    <p className="font-bold text-slate-800">{title} <span className="text-slate-400 font-normal">({count})</span></p>
                    <p className="text-xs text-slate-400">{hint}</p>
                </div>
                {children}
            </div>
        );
        const IPLink = ({ ip, sub }) => (
            <button onClick={() => openIPFromAnywhere(ip)} className="block text-left hover:underline">
                <span className="font-mono font-bold text-indigo-600">{ip}</span>
                {sub && <span className="ml-2 text-xs text-slate-500">{sub}</span>}
            </button>
        );
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-500">
                        {alertsLoading && !alerts ? 'กำลังตรวจสอบ…' : total === 0 ? 'ไม่พบรายการที่ต้องตรวจสอบ' : `พบ ${total} กลุ่มที่ควรตรวจสอบ`}
                    </p>
                    <button onClick={loadAlerts} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                        <RefreshCw size={12} className={alertsLoading ? 'animate-spin' : ''} /> รีเฟรช
                    </button>
                </div>
                {alertsErr && <p className="text-sm text-red-500">โหลดไม่สำเร็จ: {alertsErr}</p>}

                <Section title="MAC ซ้ำบนหลาย IP" count={macGroups.length}
                    hint="MAC เดียวกันอยู่บน IP มากกว่า 1 — อาจเป็นการตั้ง IP เอง หรือเครื่องถูกย้ายโดยไม่ได้แจ้ง">
                    {macGroups.length === 0 ? <p className="px-4 py-6 text-sm text-slate-400 text-center">ไม่มี</p> : (
                        <div className="divide-y divide-slate-100">
                            {macGroups.map(g => (
                                <div key={g.mac} className="px-4 py-3">
                                    <p className="font-mono text-xs font-semibold text-slate-700 mb-2">{g.mac}</p>
                                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                                        {g.ips.map(i => <IPLink key={i.ip_address} ip={i.ip_address} sub={`${i.hostname && i.hostname !== '-' ? i.hostname : 'ไม่มีชื่อ'} · ${i.scan_result === 'Found' ? 'online' : 'offline'}`} />)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                <Section title="ชื่อเครื่องซ้ำ (ที่ online)" count={hostGroups.length}
                    hint="ชื่อเครื่องเดียวกันตอบ ping บนหลาย IP — อาจเป็นเครื่องเดียวกันที่มี IP หลายตัว หรือชื่อซ้ำกัน">
                    {hostGroups.length === 0 ? <p className="px-4 py-6 text-sm text-slate-400 text-center">ไม่มี</p> : (
                        <div className="divide-y divide-slate-100">
                            {hostGroups.map(g => (
                                <div key={g.hostname} className="px-4 py-3">
                                    <p className="font-mono text-xs font-semibold text-slate-700 mb-2">{g.hostname}</p>
                                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                                        {g.ips.map(i => <IPLink key={i.ip_address} ip={i.ip_address} sub={i.mac_address || ''} />)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            </div>
        );
    };

    const renderInactive = () => {
        const isMine = panel.kind === 'inactive';
        const rows = isMine ? panel.rows : [];
        const loading = !isMine || panel.loading;
        const q = panelQuery.trim().toLowerCase();
        const filtered = q
            ? rows.filter(r => [r.ip_address, r.subnet, r.owner_name, r.reserveby, r.device, r.location]
                .some(v => (v || '').toLowerCase().includes(q)))
            : rows;
        return (
            <div className={`${cardClass} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
                    <div className="mr-auto">
                        <p className="font-bold text-slate-800">IP ที่ไม่ออนไลน์เกิน {INACTIVE_THRESHOLD} วัน</p>
                        <p className="text-xs text-slate-400">เรียงจากนานที่สุด · พบ {rows.length.toLocaleString()} รายการ</p>
                    </div>
                    <input value={panelQuery} onChange={e => setPanelQuery(e.target.value)} placeholder="กรอง IP, owner, ผู้จอง, device…"
                        className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-60 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
                    {inactiveSel.size > 0 && (
                        <button onClick={() => setInactiveReleaseOpen(true)} disabled={!inactiveReleaseTargets.length}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-40">
                            ยกเลิกการจองที่เลือก ({inactiveReleaseTargets.length})
                        </button>
                    )}
                    <button onClick={() => loadPanel('inactive')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> รีเฟรช
                    </button>
                </div>
                {isMine && panel.err && <p className="px-4 py-6 text-sm text-red-500">โหลดไม่สำเร็จ: {panel.err}</p>}
                {!panel.err && loading && <p className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลด…</p>}
                {!loading && !panel.err && filtered.length === 0 && (
                    <p className="px-4 py-10 text-center text-sm text-slate-400">{rows.length === 0 ? 'ไม่มี IP ที่ไม่ออนไลน์เกินกำหนด' : 'ไม่พบรายการที่ตรงกัน'}</p>
                )}
                {!loading && filtered.length > 0 && (
                    <div className="overflow-x-auto max-h-[68vh]">
                        <table className="w-full text-left text-sm min-w-max">
                            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold sticky top-0 z-10 border-b border-slate-200">
                                <tr>
                                    {['', 'IP', 'Subnet', 'ไม่ออนไลน์', 'ออนไลน์ล่าสุด', 'Owner', 'ผู้จอง', 'Device', 'สถานที่', ''].map((h, hi) => (
                                        hi === 0 ? <th key="sel" className="px-3 py-3 w-8">
                                            <input type="checkbox" className="accent-indigo-600" aria-label="เลือกทั้งหมด"
                                                checked={filtered.length > 0 && filtered.every(r => inactiveSel.has(r.ip_address))}
                                                onChange={e => setInactiveSel(e.target.checked ? new Set(filtered.map(r => r.ip_address)) : new Set())} />
                                        </th> :
                                        <th key={h} className="px-3 py-3 whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map(r => (
                                    <tr key={r.ip_address} onClick={() => openIPFromAnywhere(r.ip_address)} className="cursor-pointer hover:bg-red-50/40">
                                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" className="accent-indigo-600" aria-label={`เลือก ${r.ip_address}`}
                                                checked={inactiveSel.has(r.ip_address)}
                                                onChange={() => setInactiveSel(prev => { const n = new Set(prev); n.has(r.ip_address) ? n.delete(r.ip_address) : n.add(r.ip_address); return n; })} />
                                        </td>
                                        <td className="px-3 py-2.5 font-mono font-bold text-indigo-600 whitespace-nowrap">{r.ip_address}</td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{r.subnet}.x</td>
                                        <td className="px-3 py-2.5"><InactiveBadge days={r.inactive_days} /></td>
                                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">{fmtDT(r.last_seen_active)}</td>
                                        <td className="px-3 py-2.5 text-slate-700">{fmtVal(r.owner_name)}</td>
                                        <td className="px-3 py-2.5 text-slate-600">{fmtVal(r.reserveby)}</td>
                                        <td className="px-3 py-2.5 text-xs text-slate-600">{fmtVal(r.device)}</td>
                                        <td className="px-3 py-2.5 text-xs text-slate-600">{fmtVal(r.location)}</td>
                                        <td className="px-3 py-2.5 text-xs font-semibold text-indigo-600 whitespace-nowrap">เปิด →</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-5 w-full">
            {/* Tooltip DOM node (grid) */}
            <div id="ip-tip" style={{ display: 'none', position: 'fixed', zIndex: 9999, pointerEvents: 'none', transform: 'translateX(-50%)', transition: 'opacity .08s' }}
                className="px-2.5 py-2 bg-slate-800 text-white text-[11px] font-mono rounded-lg shadow-xl max-w-xs whitespace-pre-wrap border border-white/10 leading-relaxed" />

            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-800">IP Management</h2>
                    <p className="text-slate-500 text-sm">ติดตาม จัดการ และจอง IP ทุก subnet</p>
                </div>
                <button onClick={() => setPaletteOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl hover:border-slate-300 shadow-sm">
                    <Search size={14} /> ค้นหา IP หรือ subnet
                    <kbd className="hidden sm:flex items-center gap-0.5 ml-2 text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1 py-0.5"><Command size={9} />K</kbd>
                </button>
            </div>

            {/* ภาพรวมทุก subnet */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
                <StatCard icon={Network} title="IP ทั้งหมด" value={capacity.total.toLocaleString()} sub={`${subnets.length} subnet`} gradient="from-slate-600 to-slate-700" />
                <StatCard icon={CheckCircle} title="Online" value={capacity.online.toLocaleString()} sub={`${capacity.pct}% ของ IP ทั้งหมด · ${capacity.dense} subnet ≥${DENSE_SUBNET_PCT}%`} gradient="from-emerald-500 to-emerald-600" />
                <StatCard icon={Shield} title="จองแล้ว" value={capacity.reserved.toLocaleString()} sub="ทุก subnet" gradient="from-amber-400 to-amber-500" />
                <StatCard icon={AlertTriangle} title={`ไม่ใช้งาน >${INACTIVE_THRESHOLD} วัน`} value={capacity.inactive.toLocaleString()} sub="ควรตรวจสอบหรือคืนให้ระบบ" gradient={capacity.inactive > 0 ? 'from-orange-500 to-orange-600' : 'from-slate-400 to-slate-500'} />
            </div>

            {/* แท็บมุมมองหลัก */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1" role="tablist">
                {[
                    { key: 'subnet', label: 'ตาม Subnet', icon: Network, count: null },
                    { key: 'overview', label: 'ภาพรวม', icon: Layers, count: subnets.length },
                    { key: 'owners', label: 'ตามผู้จอง', icon: Shield, count: capacity.reserved },
                    { key: 'timeline', label: 'ไทม์ไลน์', icon: Clock, count: null },
                    { key: 'inactive', label: `Inactive >${INACTIVE_THRESHOLD} วัน`, icon: AlertTriangle, count: capacity.inactive },
                    { key: 'alerts', label: 'แจ้งเตือน', icon: AlertTriangle, count: alerts?.total ?? null },
                ].map(t => {
                    const on = mainView === t.key;
                    return (
                        <button key={t.key} role="tab" aria-selected={on} onClick={() => setMainView(t.key)}
                            className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold border transition-colors
                                ${on ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                            <t.icon size={14} />
                            {t.label}
                            {t.count !== null && <span className={`font-mono text-xs ${on ? 'text-white/75' : 'text-slate-400'}`}>{t.count.toLocaleString()}</span>}
                        </button>
                    );
                })}
            </div>

            {mainView === 'subnet' && (
            <div className="flex gap-5 items-start">
                {/* Sidebar (desktop) */}
                <aside className={`hidden md:flex w-64 shrink-0 flex-col ${cardClass} sticky top-4 max-h-[calc(100vh-2rem)] overflow-hidden`}>
                    <SubnetList subnets={subnets} currentSN={currentSN} onSelect={selectSubnet}
                        query={subnetQuery} setQuery={setSubnetQuery} onAdd={() => setAddSubnet(true)} />
                </aside>

                <section className="flex-1 min-w-0 space-y-4">
                    {/* เลือก subnet (มือถือ) */}
                    <div className="md:hidden flex gap-2">
                        <select value={currentSN} onChange={e => selectSubnet(e.target.value)}
                            className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-700">
                            {subnets.map(s => <option key={s.subnet} value={s.subnet}>{s.subnet}.x — {s.active_count || 0} online</option>)}
                        </select>
                        <button onClick={() => setAddSubnet(true)} className="px-3 py-2.5 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-xl">+</button>
                    </div>

                    {/* หัว subnet + การกระทำ */}
                    <div className={`${cardClass} p-4 flex flex-wrap items-center gap-3`}>
                        <div className="min-w-0 mr-auto">
                            <p className="font-mono text-lg font-black text-slate-800">{currentSN ? `${currentSN}.0/24` : '—'}</p>
                            <div className="flex items-center gap-2">
                                <ScanStatus scanning={scanning} lastScan={lastScanTime} />
                                {lastRefresh && <span className="text-[11px] text-slate-400">· อัปเดต {lastRefresh}</span>}
                            </div>
                        </div>
                        <button onClick={handleTriggerScan} disabled={!currentSN || scanning}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
                            {scanning ? 'กำลังสแกน…' : 'Scan Now'}
                        </button>
                        <button onClick={() => { setSelectMode(v => !v); setSelected(new Set()); }}
                            className={`px-3 py-2 rounded-xl text-sm font-semibold border ${selectMode ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            {selectMode ? 'เลิกเลือก' : 'เลือกหลายรายการ'}
                        </button>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button onClick={() => setViewMode('grid')} aria-label="มุมมองกริด" className={`px-2.5 py-1.5 rounded-lg ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}><LayoutGrid size={15} /></button>
                            <button onClick={() => setViewMode('table')} aria-label="มุมมองตาราง" className={`px-2.5 py-1.5 rounded-lg ${viewMode === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}><List size={15} /></button>
                        </div>
                        <div className="relative" data-export-dropdown>
                            <button onClick={() => setShowExport(v => !v)} disabled={!currentSN}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40">
                                <FileDown size={14} /> Export
                            </button>
                            {showExport && (
                                <div className="absolute right-0 top-full mt-1.5 z-30 w-60 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                                    <button onClick={exportCurrent} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50">
                                        <p className="font-semibold text-slate-700">Subnet นี้</p><p className="text-[11px] text-slate-400">{currentSN}.0/24 · 254 IP</p>
                                    </button>
                                    <button onClick={exportAll} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-t border-slate-100">
                                        <p className="font-semibold text-slate-700">ทุก subnet</p><p className="text-[11px] text-slate-400">{subnets.length} sheet</p>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ตัวกรอง (พร้อมจำนวน) + ค้นหาใน subnet */}
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                            {FILTERS.map(f => {
                                const on = filterStatus === f.key;
                                return (
                                    <button key={f.key} onClick={() => setFilterStatus(f.key)}
                                        className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
                                            ${on ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                        <span className={`w-2 h-2 rounded-full ${f.dot}`} />
                                        {f.label}
                                        <span className={`font-mono ${on ? 'text-white/70' : 'text-slate-400'}`}>{counts[f.key] ?? 0}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="relative lg:ml-auto lg:w-64">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="กรองใน subnet นี้…"
                                className="w-full pl-8 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
                            {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500" aria-label="ล้าง"><X size={13} /></button>}
                        </div>
                    </div>
                    {hasFilter && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>แสดง {filtered.length} จาก {allData.length} IP</span>
                            <button onClick={() => { setSearch(''); setFilterStatus('all'); }} className="font-semibold text-indigo-600 hover:underline">ล้างตัวกรอง</button>
                        </div>
                    )}

                    {/* เนื้อหา */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full" />
                        </div>
                    ) : !currentSN ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                            <Monitor size={44} strokeWidth={1.5} className="opacity-30" />
                            <p className="text-sm">ยังไม่มี subnet — กด “+ เพิ่ม” เพื่อเริ่ม</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                            <Monitor size={44} strokeWidth={1.5} className="opacity-30" />
                            <p className="text-sm">ไม่พบ IP ที่ตรงกับตัวกรอง</p>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <>
                            {renderGrid()}
                            {/* คำอธิบายสี — แสดงตลอด */}
                            <div className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-[11px] text-slate-500">
                                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-emerald-50 border border-emerald-300" />Online (ตอบ ping)</span>
                                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-emerald-50 border-2 border-amber-400" />จอง + Online</span>
                                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-amber-50 border-2 border-amber-400" />จอง + Offline</span>
                                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-white border border-slate-200" />ว่าง</span>
                                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-red-100 border border-red-300" />ไม่ใช้งาน &gt;{INACTIVE_THRESHOLD} วัน</span>
                                <span className="text-slate-400">ลูกศรคีย์บอร์ดเลื่อนช่อง · Enter เปิดรายละเอียด</span>
                            </div>
                        </>
                    ) : renderTable()}
                </section>
            </div>
            )}

            {mainView === 'overview' && renderOverview()}
            {mainView === 'timeline' && renderTimeline()}
            {mainView === 'owners' && renderOwners()}
            {mainView === 'inactive' && renderInactive()}
            {mainView === 'alerts' && renderAlerts()}

            {/* แถบการทำงานหลายรายการ */}
            <AnimatePresence>
                {selectMode && (
                    <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
                        className="fixed bottom-4 left-0 right-0 mx-auto z-40 w-[calc(100%-2rem)] max-w-3xl flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl">
                        <span className="text-sm font-bold mr-auto">เลือกแล้ว {selected.size} รายการ</span>
                        <button onClick={() => setSelected(new Set(filtered.map(d => d.ip_address)))} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20">เลือกทั้งหมดที่แสดง</button>
                        <button onClick={() => setBulkDialog('reserve')} disabled={!selectedFreeIPs.length || !!bulkProgress}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed">จอง ({selectedFreeIPs.length})</button>
                        <button onClick={() => setBulkDialog('release')} disabled={!selectedReservedIPs.length || !!bulkProgress}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed">ยกเลิกจอง ({selectedReservedIPs.length})</button>
                        <button onClick={exportSelected} disabled={!selected.size} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40">Export</button>
                        <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="ปิด"><X size={16} /></button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Drawer รายละเอียด */}
            <AnimatePresence>
                {selectedIP && (
                    <IPDrawer key={selectedIP} ip={selectedIP}
                        data={allData.find(d => d.ip_address === selectedIP) || blankRow(selectedIP, currentSN)}
                        api={API} actor={actor} refreshKey={historyKey}
                        onClose={() => setSelectedIP(null)}
                        onSave={handleSave} onReserve={handleReserve} onRelease={handleRelease} />
                )}
            </AnimatePresence>

            {paletteOpen && (
                <CommandPalette query={globalQuery} onQuery={onGlobalQueryChange} subnets={subnets}
                    results={globalResults} loading={globalLoading}
                    onPickIP={pickPaletteIP} onPickSubnet={pickPaletteSubnet} onClose={closePalette} />
            )}
            {addSubnet && <AddSubnetModal onClose={() => setAddSubnet(false)} onConfirm={handleAddSubnet} />}
            {bulkDialog === 'reserve' && (
                <BulkReserveModal count={selectedFreeIPs.length} busyProgress={bulkProgress}
                    onClose={() => setBulkDialog(null)} onConfirm={bulkReserveConfirm} />
            )}
            {inactiveReleaseOpen && (
                <BulkReleaseModal count={inactiveReleaseTargets.length} busy={false}
                    onClose={() => setInactiveReleaseOpen(false)} onConfirm={releaseInactiveSelected} />
            )}
            {bulkDialog === 'release' && (
                <BulkReleaseModal count={selectedReservedIPs.length} busy={!!bulkProgress}
                    onClose={() => setBulkDialog(null)} onConfirm={bulkReleaseConfirm} />
            )}

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div key="toast" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                        role="status"
                        className={`fixed bottom-5 right-5 z-[100] max-w-[calc(100%-2.5rem)] flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-semibold text-white
                            ${toast.type === 'error' ? 'bg-red-500 shadow-red-200' : 'bg-emerald-600 shadow-emerald-200'}`}>
                        {toast.type === 'error' ? <X size={14} /> : <CheckCircle size={14} />}
                        {toast.msg}
                        {toast.action && (
                            <button onClick={() => { const a = toast.action; setToast(null); a.onClick(); }}
                                className="ml-1 px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-bold">
                                {toast.action.label}
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default IPManagementPage;
