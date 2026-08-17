import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Monitor, Search, Plus, X, RefreshCw,
    Edit2, LayoutGrid, List, AlertTriangle,
    CheckCircle, Shield, Wifi, Network, FileDown, Server
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Portal from '../components/Portal';
import { API_BASE } from '../config/api';
import * as XLSX from 'xlsx-js-style';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const INACTIVE_THRESHOLD = 15;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const getDisplayStatus = (d) => {
    if (d.reservation_status === 'reserved')
        return d.scan_result?.toLowerCase() === 'found' ? 'reserved-active' : 'reserved-inactive';
    if (d.scan_result?.toLowerCase() === 'found') return 'active';
    return 'available';
};

const isInactive = (d) => {
        if (d.scan_result?.toLowerCase() === 'found') return false;

    if (!d.last_seen_active) return false;
    return d.inactive_days !== null && d.inactive_days > INACTIVE_THRESHOLD;
};

// ─── FORMAT DATETIME ─────────────────────────────────────────────────────────
const fmtDT = (s) => s ? s.substring(0, 19).replace('T', ' ') : '—';

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
        let left = r.left + r.width / 2;
        let top = r.bottom + 6;
        if (top + 90 > window.innerHeight) top = r.top - 96;
        el.style.left = Math.min(left, window.innerWidth - 220) + 'px';
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

// ─── STATUS META ──────────────────────────────────────────────────────────────
const STATUS_META = {
    'active': { label: 'Active', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    'reserved-active': { label: '✓ Reserved', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    'reserved-inactive': { label: '✓ Reserved', pill: 'bg-amber-100 text-amber-700 border-amber-200' },
    'available': { label: 'Available', pill: 'bg-slate-100 text-slate-500 border-slate-200' },
};

// ─── STAT CARD ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, title, value, color, onClick, isActive }) => (
    <div onClick={onClick}
        className={`bg-white rounded-2xl p-5 shadow-lg border transition-all
            ${onClick ? 'cursor-pointer hover:shadow-xl' : ''}
            ${isActive ? 'ring-2 ring-indigo-500 border-transparent scale-[1.02]' : 'border-slate-200'}`}>
        <div className="flex items-start justify-between">
            <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1">{title}</p>
                <h3 className="text-2xl font-black text-slate-900">{value}</h3>
            </div>
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
        </div>
    </div>
);

// ─── STATUS PILL ──────────────────────────────────────────────────────────────
const StatusPill = ({ status }) => {
    const m = STATUS_META[status] || STATUS_META.available;
    return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${m.pill}`}>{m.label}</span>;
};

const InactiveBadge = ({ days }) => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
        <AlertTriangle size={9} />{days}d
    </span>
);

// ─── IP CELL — memo + tooltip ภายใน ไม่สร้าง closure ใหม่จาก parent ──────────
const IPCell = React.memo(({ data, showTip, hideTip, onClick, hidden, cellId, highlighted }) => {
    const status = getDisplayStatus(data);
    const inactive = isInactive(data);
    const last = data.ip_address.split('.').pop();

    // สร้าง tooltip text ครั้งเดียวตอน render
    const tipText = [
        data.ip_address,
        data.hostname && data.hostname !== '-' ? `Hostname: ${data.hostname}` : null,
        data.owner_name ? `Owner: ${data.owner_name}` : null,
        data.remark ? `Remark: ${data.remark}` : null,
        `Status: ${STATUS_META[status]?.label || status}`,
        data.reserveby ? `Reserved by: ${data.reserveby}` : null,
        inactive ? `⚠ ไม่ active ${data.inactive_days} วัน` : null,
        data.last_scan ? `Last scan: ${fmtDT(data.last_scan)}` : null,
    ].filter(Boolean).join('\n');

    const cellCls = {
        'active': 'border-emerald-200 bg-emerald-50',
        'reserved-active': 'border-emerald-200 bg-emerald-50 ring-1 ring-emerald-300',
        'reserved-inactive': 'border-amber-200 bg-amber-50 ring-1 ring-amber-300',
        'available': 'border-slate-100 bg-white opacity-60 hover:opacity-100',
    };
    const numCls = {
        'active': 'text-emerald-700 font-black',
        'reserved-active': 'text-emerald-700 font-black',
        'reserved-inactive': 'text-amber-700 font-black',
        'available': 'text-slate-400 font-bold',
    };
    const dotCls = {
        'active': 'bg-emerald-500',
        'reserved-active': 'bg-emerald-500',
        'reserved-inactive': 'bg-amber-400',
        'available': 'bg-slate-200',
    };

    // ── สีพื้น + style แต่ละ status ─────────────────────────────────────────────
    const isReserved = data.reservation_status === 'reserved';
    const isOnline = data.scan_result?.toLowerCase() === 'found';


    const cellCfg = isReserved && isOnline ? {
        bg: 'bg-emerald-50 border-emerald-400',
        num: 'text-emerald-700',
        dot: 'bg-emerald-500',
        ring: 'ring-2 ring-amber-400 shadow-sm shadow-amber-100',
        dotAnim: '',
        icon: '📌',
    } : isReserved && !isOnline ? {
        bg: 'bg-amber-50 border-amber-300',
        num: 'text-amber-700',
        dot: 'bg-amber-400',
        ring: 'ring-2 ring-amber-400',
        dotAnim: '',
        icon: '🔒',
    } : inactive ? {
        bg: 'bg-red-100 border-red-300',
        num: 'text-red-700',
        dot: 'bg-red-400',
        ring: '',
        dotAnim: '',
        icon: '⚠',
    } : isOnline ? {
        bg: 'bg-emerald-50 border-emerald-300',
        num: 'text-emerald-700',
        dot: 'bg-emerald-500',
        ring: 'ring-1 ring-emerald-300 shadow-sm shadow-emerald-200',
        dotAnim: 'animate-pulse',
        icon: null,
    } : {
        bg: 'bg-white border-slate-100',
        num: 'text-slate-300',
        dot: 'bg-slate-200',
        ring: '',
        dotAnim: '',
        icon: null,
    };
    return (
        <div
            id={cellId}
            style={hidden ? { visibility: 'hidden', pointerEvents: 'none' } : {}}
            className={`rounded-lg border cursor-pointer select-none flex flex-col items-center justify-center
                transition-all duration-150 hover:scale-110 hover:z-10 hover:shadow-md
                aspect-square flex-1 min-w-0 relative
                ${cellCfg.bg} ${cellCfg.ring}
                ${highlighted ? 'ring-4 ring-indigo-500 ring-offset-2 scale-125 z-20 animate-pulse shadow-lg shadow-indigo-300' : ''}`}
            onClick={() => onClick(data.ip_address)}
            onMouseEnter={hidden ? undefined : e => showTip(e, tipText)}
            onMouseLeave={hidden ? undefined : hideTip}
        >
            {/* lock icon สำหรับ reserved */}
            {cellCfg.icon && (
                <div className="absolute top-0.5 right-0.5 text-[7px] leading-none opacity-60">
                    {cellCfg.icon}


                </div>
            )}

            {/* inactive warning */}
            {inactive && (
                <div className="absolute top-0.5 right-0.5 text-[7px] leading-none opacity-70">⚠</div>
            )}

            {/* IP last octet */}
            <span className={`text-[12px] font-mono font-bold leading-none ${cellCfg.num}`}>{last}</span>

            {/* dot — pulse บน active */}
            <div className={`w-1.5 h-1.5 rounded-full mt-1 ${cellCfg.dot} ${cellCfg.dotAnim}`} />
        </div>
    );
});

// ─── MODAL: Confirm Release ───────────────────────────────────────────────────
const ConfirmReleaseModal = ({ ip, onClose, onConfirm }) => {
    const [loading, setLoading] = useState(false);
    return (
        <Portal>
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4" onClick={onClose}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                        <p className="font-black text-slate-800">⚠️ ยกเลิกการจอง</p>
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><X size={16} /></button>
                    </div>
                    <div className="p-5 space-y-3">
                        <p className="text-center font-mono text-base font-bold text-indigo-600">{ip}</p>
                        <div className="px-3 py-2.5 bg-red-50 border-l-4 border-red-400 rounded-r-xl text-[12px] text-red-700 space-y-1">
                            <p>IP จะกลับเป็น <strong>Available</strong></p>
                            <p>Reservation owner จะถูกลบ</p>
                        </div>
                    </div>
                    <div className="flex gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                        <button onClick={onClose} className="flex-1 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">ยกเลิก</button>
                        <button onClick={async () => { setLoading(true); await onConfirm(); }} disabled={loading}
                            className="flex-1 py-2 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-1.5">
                            {loading ? <RefreshCw size={12} className="animate-spin" /> : '🔓'} ยืนยัน
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

// ─── MODAL: Edit / Reserve IP ─────────────────────────────────────────────────
const IPModal = ({ ip, data, onClose, onSave, onReserve, onRelease, currentUser }) => {
    // debug: uncomment บรรทัดนี้เพื่อดู field ใน user object
    // console.log('[IPModal] currentUser =', currentUser);
    const resolvedUser = currentUser
        ? (currentUser.username || currentUser.empcode || currentUser.name
            || currentUser.displayName || currentUser.email
            || Object.values(currentUser).find(v => typeof v === 'string' && v.length > 0)
            || 'unknown')
        : 'unknown';

    const [owner, setOwner] = useState(data?.owner_name || '');
    const [remark, setRemark] = useState(data?.remark || '');
    const [saving, setSaving] = useState(false);
    const [showRelease, setShowRelease] = useState(false);

    const status = getDisplayStatus(data);
    const inactive = isInactive(data);
    const isRes = data?.reservation_status === 'reserved';

    const handleSave = async () => {
        setSaving(true);
        await onSave(ip, { owner_name: owner, remark, reservation_status: data?.reservation_status || 'available' });
        setSaving(false);
    };

    return (
        <>
            <Portal>
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4" onClick={onClose}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
                            <div className="flex justify-between items-start relative z-10">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">IP Address</p>
                                    <h3 className="font-black text-xl font-mono">{ip}</h3>
                                    <p className="text-white/80 text-xs mt-0.5">{data?.hostname && data.hostname !== '-' ? data.hostname : 'No hostname'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <StatusPill status={status} />
                                    <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full"><X size={18} /></button>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 space-y-4">
                            {inactive && (
                                <div className="flex items-start gap-2 px-3 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-[12px] text-orange-700">
                                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                    <span>ไม่ได้ active มา <strong>{data.inactive_days} วัน</strong> (last: {data.last_seen_active?.substring(0, 10)})</span>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">Owner / Department</label>
                                    <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="เช่น IT-Dept"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 focus:bg-white transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">Hostname</label>
                                    <input value={data?.hostname && data.hostname !== '-' ? data.hostname : ''} disabled
                                        className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-400 cursor-not-allowed" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">Remark</label>
                                <input value={remark} onChange={e => setRemark(e.target.value)} placeholder="เช่น CCTV Floor 2, Printer"
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 focus:bg-white transition-all" />
                            </div>
                            {isRes && (
                                <div>
                                    <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reserved By</label>
                                    <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-mono text-amber-700">{data?.reserveby || '—'}</div>
                                </div>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-0.5 text-[11px]">
                                <span className="text-slate-400 font-semibold">Scan Result:</span>
                                <span className="font-bold text-slate-700">{data?.scan_result || '—'}</span>
                                <span className="text-slate-300">•</span>

                                <span className="text-slate-400 font-semibold">Last Scan:</span>
                                <span className="font-bold text-slate-700 font-mono">{fmtDT(data?.last_scan)}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-slate-400 font-semibold">Last Active:</span>
                                <span className="font-bold text-slate-700 font-mono">{fmtDT(data?.last_seen_active)}</span>
                                <span className="text-slate-300">•</span>
<span className="text-slate-400 font-semibold">แก้ไขโดย:</span>
<span className="font-bold text-slate-700">{data?.updated_by || '—'}</span>
<span className="text-slate-300">•</span>
<span className="text-slate-400 font-semibold">แก้ไขเมื่อ:</span>
<span className="font-bold text-slate-700 font-mono">{fmtDT(data?.updated_at)}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">ยกเลิก</button>
                            <div className="flex-1" />
                            {isRes ? (
                                <button onClick={() => setShowRelease(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100">
                                    🔓 ยกเลิกจอง
                                </button>
                            ) : (
                                <button onClick={() => owner.trim() && onReserve(ip, owner, remark, resolvedUser)} disabled={!owner.trim()}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed">
                                    🔖 จอง
                                </button>
                            )}
                            <button onClick={handleSave} disabled={saving}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 shadow-lg shadow-indigo-200">
                                {saving && <RefreshCw size={12} className="animate-spin" />}
                                💾 บันทึก
                            </button>
                        </div>
                    </div>
                </div>
            </Portal>

            {showRelease && (
                <ConfirmReleaseModal ip={ip}
                    onClose={() => setShowRelease(false)}
                    onConfirm={async () => { setShowRelease(false); await onRelease(ip); }} />
            )}
        </>
    );
};

// ─── MODAL: Add Subnet ────────────────────────────────────────────────────────
const AddSubnetModal = ({ onClose, onConfirm }) => {
    const [value, setValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const parts = value.trim().split('.');
    const valid = parts.length === 3 && parts.every(p => p !== '' && /^\d+$/.test(p) && +p <= 255);
    const handleAdd = async () => { setLoading(true); setError(''); const err = await onConfirm(value.trim()); if (err) { setError(err); setLoading(false); } };
    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4" onClick={onClose}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex justify-between items-center">
                        <h3 className="font-black text-lg">➕ เพิ่ม Subnet ใหม่</h3>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full"><X size={18} /></button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div>
                            <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">Subnet (x.x.x)</label>
                            <input value={value} onChange={e => { setValue(e.target.value); setError(''); }}
                                onKeyDown={e => e.key === 'Enter' && valid && !loading && handleAdd()}
                                placeholder="เช่น 10.194.50" autoFocus
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 focus:bg-white transition-all" />
                        </div>
                        {valid && (
                            <div className="px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[12px] text-emerald-700">
                                จะเพิ่ม <strong className="font-mono">{value}.1 — {value}.254</strong> ทั้งหมด 254 IPs
                            </div>
                        )}
                        {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[12px] text-red-600">{error}</div>}
                    </div>
                    <div className="flex gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                        <button onClick={onClose} className="flex-1 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">ยกเลิก</button>
                        <button onClick={handleAdd} disabled={!valid || loading}
                            className="flex-1 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                            {loading ? <RefreshCw size={12} className="animate-spin" /> : '➕'} เพิ่ม 254 IPs
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

// ─── SCAN STATUS ──────────────────────────────────────────────────────────────
const ScanStatus = ({ scanning, lastScan }) => (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className={`w-2 h-2 rounded-full shrink-0 ${scanning ? 'bg-indigo-500 animate-pulse' : lastScan ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        {scanning
            ? <span className="text-indigo-600 font-semibold">Scanning...</span>
            : lastScan ? <span>Last scan: <span className="text-slate-600 font-medium">{lastScan}</span></span>
                : <span>ยังไม่เคยสแกน</span>}
    </div>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
const IPManagementPage = () => {
    const { user } = useAuth();
    const API = `${API_BASE}/ip-scan`;

    const [subnets, setSubnets] = useState([]);
    const [allData, setAllData] = useState([]);
    const [currentSN, setCurrentSN] = useState('');
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [lastScanTime, setLastScanTime] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [cardFilter, setCardFilter] = useState('all');
    const [selectedIP, setSelectedIP] = useState(null);
    const [addSubnet, setAddSubnet] = useState(false);
    const [toast, setToast] = useState(null);
    const [showLegend, setShowLegend] = useState(false);
    const [showExport, setShowExport] = useState(false);
    const [scanCountdown, setScanCountdown] = useState(0);
    const scanTimerRef = useRef(null);
    const [globalQuery, setGlobalQuery] = useState('');
    const [globalResults, setGlobalResults] = useState([]);
    const [globalLoading, setGlobalLoading] = useState(false);
    const [showGlobalDD, setShowGlobalDD] = useState(false);
    const allSubnetsCache = useRef({}); // { [subnet]: fullArray254 }
    const globalDebounce = useRef(null);
    const [highlightIP, setHighlightIP] = useState(null);
    const highlightTimerRef = useRef(null);

    const { show: showTip, hide: hideTip } = useTooltip();

    const showToast = useCallback((msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    const loadSubnets = useCallback(async () => {
        try {
            const r = await fetch(`${API}/subnets`);
            const d = await r.json();
            setSubnets(d); return d;
        } catch { return []; }
    }, [API]);

    const loadIPs = useCallback(async (sn) => {
        setLoading(true);
        try {
            const r = await fetch(`${API}/ips?subnet=${sn}`);
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            const map = {};
            d.forEach(x => { if (!x.reservation_status) x.reservation_status = 'available'; map[x.ip_address] = x; });
            setAllData(Array.from({ length: 254 }, (_, i) => {
                const ip = `${sn}.${i + 1}`;
                return map[ip] || { ip_address: ip, status: null, hostname: '-', owner_name: '', remark: '', last_scan: null, scan_result: null, reservation_status: 'available', reserveby: '', last_seen_active: null, inactive_days: null };
            }));
            const latest = d.filter(x => x.last_scan).sort((a, b) => b.last_scan.localeCompare(a.last_scan))[0];
            setLastScanTime(fmtDT(latest?.last_scan));
        } catch (e) { showToast('โหลดไม่สำเร็จ: ' + e.message, 'error'); }
        setLoading(false);
    }, [API, showToast]);

    const buildFull254 = (sn, rows) => {
        const map = {};
        rows.forEach(x => { if (!x.reservation_status) x.reservation_status = 'available'; map[x.ip_address] = x; });
        return Array.from({ length: 254 }, (_, i) => {
            const ip = `${sn}.${i + 1}`;
            return map[ip] || { ip_address: ip, status: null, hostname: '-', owner_name: '', remark: '', last_scan: null, scan_result: null, reservation_status: 'available', reserveby: '', last_seen_active: null, inactive_days: null };
        });
    };

    const ensureSubnetCached = async (sn) => {
        if (allSubnetsCache.current[sn]) return allSubnetsCache.current[sn];
        try {
            const r = await fetch(`${API}/ips?subnet=${sn}`);
            const d = await r.json();
            if (d.error) return [];
            const full = buildFull254(sn, d);
            allSubnetsCache.current[sn] = full;
            return full;
        } catch { return []; }
    };

    const runGlobalSearch = useCallback(async (q) => {
        if (!q.trim() || q.trim().length < 2) { setGlobalResults([]); return; }
        setGlobalLoading(true);
        const query = q.trim().toLowerCase();
        // โหลดทุก subnet ที่ยังไม่ cache (ขนานกัน)
        await Promise.all(subnets.map(s => ensureSubnetCached(s.subnet)));

        const matches = [];
        for (const s of subnets) {
            const rows = allSubnetsCache.current[s.subnet] || [];
            for (const d of rows) {
                const hit = d.ip_address.includes(query)
                    || (d.hostname || '').toLowerCase().includes(query)
                    || (d.owner_name || '').toLowerCase().includes(query)
                    || (d.remark || '').toLowerCase().includes(query);
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
        setShowGlobalDD(true);
        clearTimeout(globalDebounce.current);
        globalDebounce.current = setTimeout(() => runGlobalSearch(val), 350);
    };

    const jumpToResult = async (item) => {
        setShowGlobalDD(false);
        setGlobalQuery('');
        setGlobalResults([]);
        setSearch('');
        setFilterStatus('all');
        setCardFilter('all');
        setViewMode('grid'); // บังคับเป็น grid view เพื่อให้เห็นตำแหน่ง

        if (item._subnet !== currentSN) {
            setCurrentSN(item._subnet);
            await loadIPs(item._subnet);
        }

        // รอให้ DOM render cell ก่อนค่อย scroll
        setTimeout(() => {
            const el = document.getElementById(`cell-${item.ip_address}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);

        clearTimeout(highlightTimerRef.current);
        setHighlightIP(item.ip_address);
        highlightTimerRef.current = setTimeout(() => setHighlightIP(null), 2500);
    };

    useEffect(() => {
        if (!showGlobalDD) return;
        const handler = (e) => { if (!e.target.closest('[data-global-search]')) setShowGlobalDD(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showGlobalDD]);

    useEffect(() => {
        loadSubnets().then(d => { if (d.length) { setCurrentSN(d[0].subnet); loadIPs(d[0].subnet); } });
    }, []);

    // Close export dropdown on outside click
    useEffect(() => {
        if (!showExport) return;
        const handler = (e) => {
            if (!e.target.closest('[data-export-dropdown]')) setShowExport(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showExport]);


    const selectSubnet = (sn) => {
        setCurrentSN(sn); setSearch(''); setFilterStatus('all'); setCardFilter('all');
        loadIPs(sn);
    };

    const stats = useMemo(() => ({
        total: allData.length,
        active: allData.filter(d => d.status?.toLowerCase() === 'active').length,
        reserved: allData.filter(d => d.reservation_status === 'reserved').length,
        available: allData.filter(d => d.status?.toLowerCase() !== 'active' && d.reservation_status !== 'reserved').length,
        inactive: allData.filter(d => isInactive(d)).length,
    }), [allData]);

    // visibleSet — Set ของ ip ที่ผ่าน filter ใช้ CSS hide แทนการ unmount
    const visibleSet = useMemo(() => {
        const s = new Set();
        allData.forEach(d => {
            const status = getDisplayStatus(d);
            const inactive = isInactive(d);
            const q = search.toLowerCase();
            const matchSearch = !q || d.ip_address.includes(q)
                || (d.hostname || '').toLowerCase().includes(q)
                || (d.owner_name || '').toLowerCase().includes(q)
                || (d.remark || '').toLowerCase().includes(q);
            const matchFilter = filterStatus === 'all'
                || (filterStatus === 'inactive' && inactive)
                || (filterStatus === 'active' && d.status?.toLowerCase() === 'active')
                || (filterStatus === 'reserved' && d.reservation_status === 'reserved')
                || (filterStatus === 'available' && d.status?.toLowerCase() !== 'active' && d.reservation_status !== 'reserved');
            const matchCard = cardFilter === 'all'
                || (cardFilter === 'inactive' && inactive)
                || (cardFilter === 'active' && d.status?.toLowerCase() === 'active')
                || (cardFilter === 'reserved' && d.reservation_status === 'reserved')
                || (cardFilter === 'available' && d.status?.toLowerCase() !== 'active' && d.reservation_status !== 'reserved');
            if (matchSearch && matchFilter && matchCard) s.add(d.ip_address);
        });
        return s;
    }, [allData, search, filterStatus, cardFilter]);
    const filtered = allData.filter(d => visibleSet.has(d.ip_address));

    const apiUpdate = async (ip, payload) => {
        try {
        const r = await fetch(`${API}/ips/${ip}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...payload,
                updated_by: user?.username || 'unknown',
            })   });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            await loadIPs(currentSN); await loadSubnets(); return null;
        } catch (e) { return e.message; }
    };

    const handleSave = async (ip, payload) => { const e = await apiUpdate(ip, payload); e ? showToast('บันทึกไม่สำเร็จ: ' + e, 'error') : (setSelectedIP(null), showToast(`✓ บันทึก ${ip}`)); };
    const handleReserve = async (ip, owner, remark, by) => { const e = await apiUpdate(ip, { owner_name: owner, remark, reservation_status: 'reserved', reserveby: by || 'unknown' }); e ? showToast('จองไม่สำเร็จ: ' + e, 'error') : (setSelectedIP(null), showToast(`✓ จอง ${ip} สำหรับ ${owner}`)); };
    const handleRelease = async (ip) => { const e = await apiUpdate(ip, { reservation_status: 'available', reserveby: '' }); e ? showToast('ยกเลิกไม่สำเร็จ: ' + e, 'error') : (setSelectedIP(null), showToast(`✓ ยกเลิกจอง ${ip}`)); };

    const handleAddSubnet = async (subnet) => {
        try {
            const r = await fetch(`${API}/subnets/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subnet }) });
            const d = await r.json();
            if (d.error) return d.error;
            setAddSubnet(false); showToast(`✓ เพิ่ม ${subnet}.0/24 สำเร็จ`);
            await loadSubnets(); setCurrentSN(subnet); await loadIPs(subnet); return null;
        } catch (e) { return e.message; }
    };

    // ── Export Excel with row highlight ─────────────────────────────────────
    const exportExcel = async (mode) => {
        const wb = XLSX.utils.book_new();

        // ── สีแต่ละ status ──────────────────────────────────────────────────
        const ROW_COLORS = {
            active: { fgColor: { rgb: 'D1FAE5' } }, // emerald-100
            'reserved-active': { fgColor: { rgb: 'A7F3D0' } }, // emerald-200
            'reserved-inactive': { fgColor: { rgb: 'FEF3C7' } }, // amber-100
            inactive: { fgColor: { rgb: 'FEE2E2' } }, // red-100

            available: { fgColor: { rgb: 'FFFFFF' } }, // white
        };

        const BORDER_THIN = { style: 'thin', color: { rgb: 'CBD5E1' } };   // slate-300
        const BORDER_MED = { style: 'medium', color: { rgb: '312E81' } };

        const FULL_BORDER = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };
        const HEAD_BORDER = { top: BORDER_MED, bottom: BORDER_MED, left: BORDER_THIN, right: BORDER_THIN };

        const HEADER_STYLE = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
            fill: { patternType: 'solid', fgColor: { rgb: '4338CA' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
            border: HEAD_BORDER,
        };

        const COLS = [
            { key: 'ip_address', label: 'IP Address', wch: 15 },
            { key: '_status', label: 'Status', wch: 18 },
            { key: 'hostname', label: 'Hostname', wch: 22 },
            { key: 'owner_name', label: 'Owner', wch: 18 },
            { key: 'remark', label: 'Remark', wch: 28 },
            { key: '_reserved', label: 'Reserved', wch: 10 },
            { key: 'reserveby', label: 'Reserved By', wch: 16 },
            { key: 'last_scan', label: 'Last Scan', wch: 20 },
            { key: 'last_seen_active', label: 'Last Active', wch: 20 },
            { key: 'inactive_days', label: 'Inactive Days', wch: 13 },
        ];

        const buildSheet = (data) => {
            const ws = {};
            const range = { s: { c: 0, r: 0 }, e: { c: COLS.length - 1, r: data.length } };

            // header row
            COLS.forEach((col, ci) => {
                const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
                ws[addr] = { v: col.label, t: 's', s: HEADER_STYLE };
            });

            // data rows
            data.forEach((d, ri) => {
                const status = getDisplayStatus(d);
                const inactive = isInactive(d);
                const rowKey = inactive ? 'inactive' : status;
                const fillStyle = ROW_COLORS[rowKey] || ROW_COLORS.available;

                const cellStyle = {
                    fill: { patternType: 'solid', ...fillStyle },
                    font: { sz: 10 },
                    alignment: { vertical: 'center' },
                    border: FULL_BORDER,
                };

                const ipStyle = {
                    ...cellStyle,
                    font: { sz: 10, bold: true, color: { rgb: '3730A3' } },
                    alignment: { horizontal: 'center', vertical: 'center' },
                };

                const statusLabel = inactive
                    ? `Inactive (${d.inactive_days}d)`
                    : STATUS_META[status]?.label || status;

                const row = {
                    ip_address: d.ip_address,
                    _status: statusLabel,
                    hostname: d.hostname && d.hostname !== '-' ? d.hostname : '',
                    owner_name: d.owner_name || '',
                    remark: d.remark || '',
                    _reserved: d.reservation_status === 'reserved' ? 'Yes' : 'No',
                    reserveby: d.reserveby || '',
                    last_scan: fmtDT(d.last_scan),
                    last_seen_active: fmtDT(d.last_seen_active),
                    inactive_days: d.inactive_days ?? '',
                };

                COLS.forEach((col, ci) => {
                    const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
                    const val = row[col.key];
                    ws[addr] = {
                        v: val ?? '',
                        t: typeof val === 'number' ? 'n' : 's',
                        s: ci === 0 ? ipStyle : cellStyle,
                    };
                });
            });

            ws['!ref'] = XLSX.utils.encode_range(range);
            ws['!cols'] = COLS.map(c => ({ wch: c.wch }));
            ws['!rows'] = [{ hpt: 20 }, ...data.map(() => ({ hpt: 18 }))];
            return ws;
        };

        if (mode === 'current') {
            const ws = buildSheet(allData);
            XLSX.utils.book_append_sheet(wb, ws, currentSN || 'subnet');
        } else {
            showToast('⏳ กำลัง export ทุก subnet...');
            for (const s of subnets) {
                try {
                    const r = await fetch(`${API}/ips?subnet=${s.subnet}`);
                    const d = await r.json();
                    if (d.error) continue;
                    const map = {};
                    d.forEach(x => { if (!x.reservation_status) x.reservation_status = 'available'; map[x.ip_address] = x; });
                    const full = Array.from({ length: 254 }, (_, i) => {
                        const ip = `${s.subnet}.${i + 1}`;
                        return map[ip] || { ip_address: ip, status: null, hostname: '-', owner_name: '', remark: '', last_scan: null, reservation_status: 'available', reserveby: '', last_seen_active: null, inactive_days: null };
                    });
                    const ws = buildSheet(full);
                    const sheetName = s.subnet.replace(/[/?*[\]\\:]/g, '_').substring(0, 31);
                    XLSX.utils.book_append_sheet(wb, ws, sheetName);
                } catch { }
            }
        }

        const date = new Date().toLocaleDateString('sv-SE');
        const filename = mode === 'current'
            ? `IP_${currentSN}_${date}.xlsx`
            : `IP_All_Subnets_${date}.xlsx`;
        XLSX.writeFile(wb, filename);
        setShowExport(false);
        showToast(`✓ Export สำเร็จ: ${filename}`);
    };

    const handleTriggerScan = async () => {
        if (!currentSN) return;
        setScanning(true);
        setScanCountdown(120);
        try {
            const r = await fetch(`${API}/trigger`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subnet: currentSN }) });
            const d = await r.json();
            showToast(`⟳ ${d.message} — ผลจะอัปเดตใน ~2 นาที`);
            // countdown timer
            clearInterval(scanTimerRef.current);
            scanTimerRef.current = setInterval(() => {
                setScanCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(scanTimerRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            setTimeout(async () => {
                clearInterval(scanTimerRef.current);
                await loadIPs(currentSN); await loadSubnets();
                setScanning(false); setScanCountdown(0);
            }, 120000);
        } catch (e) { showToast('Scan trigger ไม่สำเร็จ: ' + e.message, 'error'); setScanning(false); setScanCountdown(0); }
    };

    const selectedData = selectedIP ? allData.find(d => d.ip_address === selectedIP) : null;
    const FILTER_OPTIONS = [
        { key: 'all', label: 'ทั้งหมด' },
        { key: 'active', label: '● Active' },
        { key: 'reserved', label: '■ Reserved' },
        { key: 'available', label: '○ Available' },
        { key: 'inactive', label: `⚠ >${INACTIVE_THRESHOLD}d` },
    ];

    return (
        <div className="space-y-6 w-full">

            {/* Tooltip DOM node — ไม่ได้อยู่ใน React state */}
            <div id="ip-tip" style={{ display: 'none', position: 'fixed', zIndex: 9999, pointerEvents: 'none', transform: 'translateX(-50%)', transition: 'opacity .08s' }}
                className="px-2.5 py-2 bg-slate-800 text-white text-[11px] font-mono rounded-lg shadow-xl max-w-xs whitespace-pre-wrap border border-white/10 leading-relaxed" />

            {/* Header */}
            <div>
                <h2 className="text-3xl font-black text-slate-800">IP MANAGEMENT</h2>
                <p className="text-slate-500 font-medium text-sm">ติดตาม จัดการ และจอง IP Address ใน Network</p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard icon={Network} title="Total IPs" value={stats.total} color="from-slate-600 to-slate-700" />
                <StatCard icon={CheckCircle} title="Active" value={stats.active} color="from-emerald-500 to-emerald-600" onClick={() => setCardFilter(f => f === 'active' ? 'all' : 'active')} isActive={cardFilter === 'active'} />
                <StatCard icon={Shield} title="Reserved" value={stats.reserved} color="from-amber-400 to-amber-500" onClick={() => setCardFilter(f => f === 'reserved' ? 'all' : 'reserved')} isActive={cardFilter === 'reserved'} />
                <StatCard icon={Wifi} title="Available" value={stats.available} color="from-blue-400 to-blue-500" onClick={() => setCardFilter(f => f === 'available' ? 'all' : 'available')} isActive={cardFilter === 'available'} />
                <StatCard icon={AlertTriangle} title={`Inactive >${INACTIVE_THRESHOLD}d`} value={stats.inactive} color={stats.inactive > 0 ? 'from-orange-500 to-orange-600' : 'from-slate-400 to-slate-500'} onClick={() => setCardFilter(f => f === 'inactive' ? 'all' : 'inactive')} isActive={cardFilter === 'inactive'} />
            </div>


           {/* Legend + Global Search — แถวเดียวกัน */}
            <div className="flex items-start gap-3">
                {/* Legend — collapsible */}
                <div className="relative shrink-0">
                    <button onClick={() => setShowLegend(v => !v)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all
                            ${showLegend ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'}`}>
                        <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[9px] font-black shrink-0">?</span>
                        คำอธิบายสี
                        <span className={`text-[10px] transition-transform ${showLegend ? 'rotate-180' : ''}`}>▾</span>
                    </button>

                    {showLegend && (
                        <div className="absolute top-full left-0 mt-1.5 z-20 flex flex-wrap gap-x-4 gap-y-2 px-4 py-3 bg-white rounded-2xl border border-slate-200 shadow-lg text-[11px] min-w-max">
                            {[
                                { border: 'border-emerald-200', bg: 'bg-emerald-50', ring: '', dot: <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />, label: 'Active — เครื่อง online ตอบ ping' },
                                { border: 'border-emerald-300', bg: 'bg-emerald-50', ring: 'ring-1 ring-emerald-300', dot: <span className="text-[7px] font-black text-emerald-600">R</span>, label: 'Reserved + Online — จองแล้ว เครื่อง online' },
                                { border: 'border-amber-300', bg: 'bg-amber-50', ring: 'ring-1 ring-amber-300', dot: <span className="text-[7px] font-black text-amber-600">R</span>, label: 'Reserved + Offline — จองแล้ว เครื่อง offline' },
                                { border: 'border-slate-200', bg: 'bg-white opacity-70', ring: '', dot: <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />, label: 'Available — ว่าง ไม่มีการใช้งาน' },
                                { border: 'border-orange-200', bg: 'bg-orange-50', ring: 'ring-1 ring-orange-200', dot: <span className="text-[8px] font-black text-orange-500">!</span>, label: `Inactive >${INACTIVE_THRESHOLD}d — ไม่ active เกิน ${INACTIVE_THRESHOLD} วัน` },
                            ].map(({ border, bg, ring, dot, label }) => (
                                <div key={label} className="flex items-center gap-1.5">
                                    <div className={`w-5 h-5 rounded-md border ${border} ${bg} ${ring} flex items-center justify-center shrink-0`}>{dot}</div>
                                    <span className="text-slate-600 font-medium whitespace-nowrap">{label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Global Search — ค้นข้ามทุก subnet */}
                <div className="relative flex-1 max-w-md" data-global-search>
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        value={globalQuery}
                        onChange={e => onGlobalQueryChange(e.target.value)}
                        onFocus={() => globalQuery && setShowGlobalDD(true)}
                        placeholder="ค้นหา IP ทุก subnet… (IP, hostname, owner, remark)"
                        className="w-full pl-9 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 shadow-sm transition-all"
                    />
                    {globalQuery && (
                        <button onClick={() => { setGlobalQuery(''); setGlobalResults([]); setShowGlobalDD(false); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                            <X size={13} />
                        </button>
                    )}

                    {showGlobalDD && globalQuery.trim().length >= 2 && (
                        <div className="absolute top-full left-0 mt-1.5 z-30 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-80 overflow-y-auto">
                            {globalLoading ? (
                                <div className="px-4 py-4 text-center text-[12px] text-slate-400 flex items-center justify-center gap-2">
                                    <RefreshCw size={12} className="animate-spin" /> กำลังค้นหา...
                                </div>
                            ) : globalResults.length === 0 ? (
                                <div className="px-4 py-4 text-center text-[12px] text-slate-400">ไม่พบ IP ที่ตรงกัน</div>
                            ) : (
                                globalResults.map(item => {
                                    const status = getDisplayStatus(item);
                                    return (
                                        <div key={`${item._subnet}-${item.ip_address}`} onClick={() => jumpToResult(item)}
                                            className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0">
                                            <div className="min-w-0">
                                                <p className="font-mono text-xs font-bold text-indigo-600">{item.ip_address}</p>
                                                <p className="text-[11px] text-slate-400 truncate">
                                                    {item.hostname && item.hostname !== '-' ? item.hostname : 'No hostname'}
                                                    {item.owner_name ? ` • ${item.owner_name}` : ''}
                                                </p>
                                            </div>
                                            <StatusPill status={status} />
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
            {/* Body */}
            <div className="flex gap-5 items-stretch">


               {/* Sidebar */}
<div className="w-56 shrink-0 flex flex-col bg-slate-900 rounded-2xl shadow-lg overflow-hidden">

    {/* Header */}
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10">
        <div className="flex items-center gap-2">
            <Network size={15} className="text-indigo-400" />
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Subnets</span>
        </div>
        <button onClick={() => setAddSubnet(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-slate-300 hover:bg-indigo-500 hover:text-white transition-all text-base font-bold">
            +
        </button>
    </div>

    {/* List */}
    <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-1.5">
        {subnets.map(s => {
            const isActive = currentSN === s.subnet;
            return (
                <div key={s.subnet} onClick={() => selectSubnet(s.subnet)}
                    className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer select-none transition-all duration-150
                        ${isActive
                            ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 shadow-md shadow-indigo-900/50'
                            : 'bg-white/[0.03] hover:bg-white/[0.07]'
                        }`}>

                    {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full" />
                    )}

                    <span className={`font-mono text-[13px] font-bold tracking-wide ${isActive ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                        {s.subnet}<span className={isActive ? 'text-white/60' : 'text-slate-500'}>.x</span>
                    </span>

                    <div className="flex items-center gap-1">
                        <span className={`flex items-center justify-center min-w-[20px] h-[20px] px-1 text-[10px] font-mono font-bold rounded-md
                            ${isActive ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-emerald-400'}`}>
                            {s.active_count || 0}
                        </span>
                        <span className={`flex items-center justify-center min-w-[20px] h-[20px] px-1 text-[10px] font-mono font-bold rounded-md
                            ${isActive ? 'bg-white/20 text-white' : 'bg-amber-500/15 text-amber-400'}`}>
                            {s.reserved_count || 0}
                        </span>
                        <span className={`flex items-center justify-center min-w-[20px] h-[20px] px-1 text-[10px] font-mono font-bold rounded-md
                            ${isActive ? 'bg-white/20 text-white' : 'bg-orange-500/15 text-orange-400'}`}>
                            {s.inactive_count || 0}
                        </span>
                    </div>
                </div>
            );
        })}

        {subnets.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-slate-500 bg-white/[0.03] border border-dashed border-white/10 rounded-xl mt-2">
                ยังไม่มี subnet<br />กด + เพื่อเพิ่ม
            </div>
        )}
    </div>
</div>

                {/* Main */}
                <div className="flex-1 min-w-0 flex flex-col gap-4">


                    <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                        <span className="font-mono text-[13px] font-bold text-slate-700 mr-1">{currentSN ? `${currentSN}.0/24` : '—'}</span>
                        <ScanStatus scanning={scanning} lastScan={lastScanTime} />
                        <div className="flex-1" />
                        <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200 h-[36px]">
                            {FILTER_OPTIONS.map(f => (
                                <button key={f.key} onClick={() => setFilterStatus(f.key)}
                                    className={`px-2.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${filterStatus === f.key ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200 h-[36px]">
                            <button onClick={() => setViewMode('grid')} className={`px-2 rounded-md flex items-center transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={14} /></button>
                            <button onClick={() => setViewMode('table')} className={`px-2 rounded-md flex items-center transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}><List size={14} /></button>
                        </div>
                        <button onClick={handleTriggerScan} disabled={!currentSN || scanning}
                            className="h-[36px] flex items-center gap-1.5 px-3 rounded-lg font-bold text-xs text-white bg-gradient-to-r from-indigo-500 to-indigo-600 shadow-sm hover:shadow-md transition-shadow disabled:opacity-40 disabled:cursor-not-allowed min-w-[90px] justify-center">
                            <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
                            {scanning && scanCountdown > 0 ? `${scanCountdown}s` : 'Scan Now'}
                        </button>

                        {/* Export button */}
                        <div className="relative" data-export-dropdown>
                            <button onClick={() => setShowExport(v => !v)} disabled={!currentSN}
                                className="h-[36px] flex items-center gap-1.5 px-3 rounded-lg font-bold text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                <FileDown size={13} /> Export
                            </button>
                            {showExport && (
                                <div className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[200px]">
                                    <div className="px-3 py-2 border-b border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Export Excel</p>
                                    </div>
                                    <button onClick={() => exportExcel('current')}
                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors text-left">
                                        <FileDown size={13} className="text-emerald-600 shrink-0" />
                                        <div>
                                            <p className="font-semibold">Subnet ปัจจุบัน</p>
                                            <p className="text-[10px] text-slate-400">{currentSN}.0/24 — 254 IPs</p>
                                        </div>
                                    </button>
                                    <button onClick={() => exportExcel('all')}
                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100">
                                        <FileDown size={13} className="text-indigo-600 shrink-0" />
                                        <div>
                                            <p className="font-semibold">ทุก Subnet</p>
                                            <p className="text-[10px] text-slate-400">{subnets.length} subnets แยก sheet ละ subnet</p>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                            <Monitor size={48} strokeWidth={1.5} className="opacity-20" />
                            <p className="text-sm font-medium">
                                {search || filterStatus !== 'all' || cardFilter !== 'all' ? 'ไม่พบ IP ที่ตรงกัน' : 'เลือก Subnet จากเมนูซ้าย'}
                            </p>
                            {(search || filterStatus !== 'all' || cardFilter !== 'all') && (
                                <button
                                    onClick={() => { setSearch(''); setFilterStatus('all'); setCardFilter('all'); }}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[12px] font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm">
                                    <X size={12} /> ล้าง filter ทั้งหมด
                                </button>
                            )}
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                            {/* col labels */}
                            <div className="flex gap-1 pl-[28px] w-full">
                                {Array.from({ length: 20 }, (_, i) => (
                                    <div key={i} className="flex-1 text-center text-[9px] font-mono text-slate-400">+{i}</div>
                                ))}
                            </div>
                            {/* rows */}
                            {Array.from({ length: 13 }, (_, row) => (
                                <div key={row} className="flex items-center gap-1 w-full">
                                    {/* row label */}
                                    <div className="w-7 text-right text-[9px] font-mono text-slate-400 pr-1 shrink-0">
                                        {row * 20 + 1}
                                    </div>
                                    {Array.from({ length: 20 }, (_, col) => {
                                        const idx = row * 20 + col;
                                        if (idx >= allData.length) return <div key={col} className="flex-1 aspect-square" />;
                                        const d = allData[idx];
                                        return (
                                            <IPCell key={d.ip_address} data={d} onClick={setSelectedIP}
                                                showTip={showTip} hideTip={hideTip}
                                                hidden={!visibleSet.has(d.ip_address)}
                                                cellId={`cell-${d.ip_address}`}
                                                highlighted={highlightIP === d.ip_address} />
                                        );
                                    })}
                                </div>
                            ))}
                            {/* legend + footer */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <div className="flex items-center gap-4 flex-wrap">
                                    {/* Active */}
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-300 ring-1 ring-emerald-300 shadow-sm shadow-emerald-200 flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        </div>
                                        <span className="text-[10px] text-slate-500">Active — online ตอบ ping</span>
                                    </div>
                                    {/* Reserved online */}
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-400 ring-2 ring-amber-400 flex items-center justify-center relative">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            <span className="absolute -top-1 -right-1 text-[8px]">🔒</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500">Reserved + Online</span>
                                    </div>
                                    {/* Reserved offline */}
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-300 ring-2 ring-amber-400 flex items-center justify-center relative">
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                            <span className="absolute -top-1 -right-1 text-[8px]">📌</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500">Reserved + Offline</span>
                                    </div>
                                    {/* Available */}
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-6 h-6 rounded-lg bg-white border border-slate-100 flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                        </div>
                                        <span className="text-[10px] text-slate-500">Available — ว่าง</span>
                                    </div>
                                    {/* Inactive */}
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-6 h-6 rounded-lg bg-orange-100 border border-orange-300 flex items-center justify-center relative">
                                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                            <span className="absolute -top-1 -right-1 text-[8px]">⚠</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500">Inactive &gt;{INACTIVE_THRESHOLD}d</span>
                                    </div>
                                </div>
                                <div className="text-[11px] text-slate-400">
                                    แสดง <span className="font-bold text-slate-600">{visibleSet.size}</span> จาก <span className="font-bold text-slate-600">{allData.length}</span> IPs
                                    {visibleSet.size < allData.length && (
                                        <button onClick={() => { setSearch(''); setFilterStatus('all'); setCardFilter('all'); }}
                                            className="ml-2 text-indigo-500 hover:text-indigo-700 font-semibold underline underline-offset-2">
                                            ล้าง filter
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto max-h-[60vh] 2xl:max-h-[70vh]">
                                <table className="w-full text-left min-w-max">
                                    <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                        <tr>
      {['#','IP Address','Status','Inactive','Hostname','Owner','Reserved By','แก้ไขโดย','แก้ไขเมื่อ','Last Scan',''].map((h, i) => (
    <th key={i} className={`px-3 py-3 ${i === 0 ? 'text-center w-8' : i === 10 ? 'w-12 text-center' : ''}`}>{h}</th>
))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filtered.map((d, idx) => {
                                            const status = getDisplayStatus(d);
                                            const inactive = isInactive(d);
                                            const tipText = [
                                                d.ip_address,
                                                d.hostname && d.hostname !== '-' ? `Hostname: ${d.hostname}` : null,
                                                d.owner_name ? `Owner: ${d.owner_name}` : null,
                                                d.remark ? `Remark: ${d.remark}` : null,
                                                `Status: ${STATUS_META[status]?.label || status}`,
                                                d.reserveby ? `Reserved by: ${d.reserveby}` : null,
                                                inactive ? `⚠ ไม่ active ${d.inactive_days} วัน` : null,
                                                d.last_scan ? `Last scan: ${fmtDT(d.last_scan)}` : null,
                                            ].filter(Boolean).join('\n');
                                            const rowBg = inactive ? 'bg-red-50 hover:bg-red-100'
                                                : status === 'reserved-active' ? 'bg-emerald-50/30 hover:bg-emerald-50'
                                                    : status === 'reserved-inactive' ? 'bg-amber-50/30 hover:bg-amber-50'
                                                        : 'bg-white hover:bg-slate-50';
                                            return (
                                                <tr key={d.ip_address} className={`cursor-pointer transition-colors align-middle ${rowBg}`}
                                                    onClick={() => setSelectedIP(d.ip_address)}
                                                    onMouseEnter={e => showTip(e, tipText)} onMouseLeave={hideTip}>
                                                    <td className="px-3 py-2.5 text-slate-400 font-mono text-[11px] text-center">{idx + 1}</td>
                                                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-indigo-600">{d.ip_address}</td>
                                                    <td className="px-3 py-2.5"><StatusPill status={status} /></td>
                                                    <td className="px-3 py-2.5">{inactive ? <InactiveBadge days={d.inactive_days} /> : <span className="text-slate-200 text-xs">—</span>}</td>
                                                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{d.hostname && d.hostname !== '-' ? d.hostname : '—'}</td>
                                                    <td className="px-3 py-2.5 text-xs text-slate-600">{d.owner_name || '—'}</td>
<td className="px-3 py-2.5 text-xs text-slate-500">{d.reserveby || '—'}</td>
{/* เพิ่ม 2 บรรทัดนี้ */}
<td className="px-3 py-2.5 text-xs text-slate-500">{d.updated_by || '—'}</td>
<td className="px-3 py-2.5 text-[11px] text-slate-400">{fmtDT(d.updated_at)}</td>
{/* บรรทัดต่อไปเดิม */}
<td className="px-3 py-2.5 text-[11px] text-slate-400">{fmtDT(d.last_seen_active)}</td>
<td className="px-3 py-2.5 text-[11px] text-slate-400">{fmtDT(d.last_scan)}</td>
                                                    <td className="px-3 py-2.5 text-center">
                                                        <button onClick={e => { e.stopPropagation(); setSelectedIP(d.ip_address); }} className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-white rounded transition-colors"><Edit2 size={13} /></button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                             <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400">
                                แสดง <span className="font-bold text-slate-700">{filtered.length}</span> จาก {allData.length} IPs
                            </div>
                        </div>
                    )}
                    </div>
                </div>
           

            {/* Modals */}
            {selectedIP && selectedData && (
                <IPModal ip={selectedIP} data={selectedData} onClose={() => setSelectedIP(null)}
                    onSave={handleSave} onReserve={handleReserve} onRelease={handleRelease} currentUser={user} />
            )}
            {addSubnet && <AddSubnetModal onClose={() => setAddSubnet(false)} onConfirm={handleAddSubnet} />}

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div key="toast" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                        className={`fixed bottom-5 right-5 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-bold text-white
                            ${toast.type === 'error' ? 'bg-red-500 shadow-red-200' : 'bg-emerald-600 shadow-emerald-200'}`}>
                        {toast.type === 'error' ? <X size={14} /> : <CheckCircle size={14} />}
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default IPManagementPage;