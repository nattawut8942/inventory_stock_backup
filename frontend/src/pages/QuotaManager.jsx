import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    HardDrive, Mail, Send, RefreshCw, AlertTriangle, AlertCircle,
    CheckCircle2, XCircle, Search, X, ChevronUp, ChevronDown,
    ArrowUpDown, Bell, Filter, Settings, Clock, FileText,
    Database, Users, BarChart3, Loader2, Lock, History,
    AlertOctagon, ShieldCheck, FileWarning
} from 'lucide-react';
import Pagination from '../components/Pagination';
import { API_BASE } from '../config/api';
import { useQuotaJobs } from '../context/QuotaJobContext';

const ITEMS_PER_PAGE = 20;

const STATUS_CONFIG = {
    Exceeded: { label: 'เต็มความจุ', cls: 'bg-red-50 text-red-600 border-red-100',      dot: 'bg-red-500'    },
    Critical: { label: 'วิกฤต',      cls: 'bg-orange-50 text-orange-600 border-orange-100', dot: 'bg-orange-500' },
    Warning:  { label: 'เตือน',      cls: 'bg-amber-50 text-amber-600 border-amber-100',   dot: 'bg-amber-500'  },
    OK:       { label: 'ปกติ',       cls: 'bg-emerald-50 text-emerald-600 border-emerald-100', dot: 'bg-emerald-500' },
};

// ── STEP definitions สำหรับ progress bar ─────────────────────
const STEPS = [
    { key: 'set_owner',   label: 'ตั้งค่า Owner'    },
    { key: 'run_report',  label: 'Run FSRM Report'  },
    { key: 'wait_report', label: 'รอ Report เสร็จ'  },
    { key: 'read_html',   label: 'อ่านไฟล์ HTML'    },
    { key: 'send_email',  label: 'ส่งอีเมล'          },
    { key: 'done',        label: 'เสร็จสิ้น'         },
];

const stepIndex = (step = '') => {
    if (!step) return 0;
    const s = step.toLowerCase();
    if (s.includes('set') || s.includes('ตั้งค่า'))      return 0;
    if (s.includes('run') || s.includes('fsrm'))          return 1;
    if (s.includes('รอ') || s.includes('wait') || s.includes('queued') || s.includes('running')) return 2;
    if (s.includes('อ่าน') || s.includes('html') || s.includes('parse')) return 3;
    if (s.includes('ส่ง') || s.includes('email') || s.includes('send')) return 4;
    if (s.includes('สำเร็จ') || s.includes('done') || s.includes('✅')) return 5;
    return 1;
};

// ════════════════════════════════════════════════════════════
//  SUB COMPONENTS
// ════════════════════════════════════════════════════════════

const Toast = ({ toasts }) => (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
            {toasts.map(t => (
                <motion.div key={t.id}
                    initial={{ opacity: 0, x: 60, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.95 }}
                    className={`pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold border
                        ${t.type === 'success' ? 'bg-emerald-600 text-white border-emerald-400' :
                          t.type === 'error'   ? 'bg-red-600 text-white border-red-400' :
                          t.type === 'warning' ? 'bg-amber-500 text-white border-amber-300' :
                          'bg-slate-800 text-white border-slate-600'}`}
                >
                    {t.type === 'success' && <CheckCircle2 size={18} />}
                    {t.type === 'error'   && <XCircle size={18} />}
                    {t.type === 'warning' && <AlertTriangle size={18} />}
                    <span>{t.message}</span>
                </motion.div>
            ))}
        </AnimatePresence>
    </div>
);

const Badge = ({ status }) => {
    const s = STATUS_CONFIG[status] || STATUS_CONFIG.OK;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${s.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
};

const StatCard = ({ icon: Icon, label, value, color, onClick, title }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        onClick={onClick}
        title={title}
        className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-200 relative overflow-hidden group transition-all hover:shadow-lg ${onClick ? 'cursor-pointer active:scale-95 hover:border-indigo-200' : ''}`}
    >
        <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${color} opacity-[0.06] rounded-bl-full group-hover:scale-110 transition-transform`} />
        <div className="flex items-start justify-between relative z-10">
            <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">{label}</p>
                <h3 className="text-2xl font-black text-slate-900 tabular-nums">{value ?? '—'}</h3>
            </div>
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
        </div>
    </motion.div>
);

// ── Step Progress Bar ─────────────────────────────────────────
const StepProgress = ({ step, status }) => {
    const idx = status === 'done' ? 5 : status === 'error' ? stepIndex(step) : stepIndex(step);
    return (
        <div className="mt-3">
            <div className="flex items-center gap-1">
                {STEPS.map((s, i) => (
                    <React.Fragment key={s.key}>
                        <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black transition-all
                            ${status === 'error' && i === idx ? 'bg-red-500 text-white' :
                              i < idx ? 'bg-indigo-500 text-white' :
                              i === idx && status !== 'error' ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' :
                              'bg-slate-100 text-slate-400'}`}>
                            {status === 'error' && i === idx ? '✕' : i < idx ? '✓' : i + 1}
                        </div>
                        {i < STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 rounded transition-all ${i < idx ? 'bg-indigo-400' : 'bg-slate-100'}`} />
                        )}
                    </React.Fragment>
                ))}
            </div>
           <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] text-slate-500 font-medium truncate">{step || 'รอดำเนินการ...'}</span>
                <span className="text-[11px] font-bold text-indigo-600 flex-shrink-0">{STEPS[Math.min(idx, 5)]?.label}</span>
            </div>
            {status === 'running' && (
                <p className="text-[11px] text-slate-500 mt-1.5  border-t border-slate-100 pt-1.5">
                    ⏱ ใช้เวลาประมาณ 3–5 นาทีต่อรายการ กรุณารอสักครู่
                </p>
            )}
        </div>
    );
};

// ── Job Item ──────────────────────────────────────────────────
const JobItem = ({ job, onCancel }) => {
    const isRunning   = job.status === 'running';
    const isDone      = job.status === 'done';
    const isError     = job.status === 'error';
    const isCancelled = job.status === 'cancelled';

    return (
        <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className={`p-4 rounded-2xl border transition-all shadow-sm
                ${isDone      ? 'bg-emerald-50/40 border-emerald-100' :
                  isError     ? 'bg-red-50/40 border-red-100' :
                  isCancelled ? 'bg-slate-50 border-slate-200' :
                  'bg-white border-slate-100'}`}
        >
            <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner
                    ${isRunning   ? 'bg-indigo-100 text-indigo-600' :
                      isDone      ? 'bg-emerald-100 text-emerald-600' :
                      isCancelled ? 'bg-slate-100 text-slate-400' :
                      'bg-red-100 text-red-600'}`}>
                    {isRunning   ? <Loader2 size={16} className="animate-spin" /> :
                     isDone      ? <CheckCircle2 size={16} /> :
                     isCancelled ? <X size={16} /> :
                                   <XCircle size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center gap-2">
                        <span className="font-mono text-xs font-black text-slate-700 truncate">{job.username}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isDone && job.filesFound !== undefined && (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                    {job.filesFound} files
                                </span>
                            )}
                            {isCancelled && (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">ยกเลิกแล้ว</span>
                            )}
                            {isRunning && onCancel && (
                                <button onClick={() => onCancel(job.jobId, job.username)}
                                    title="หยุด FSRM process ทันที"
                                    className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-[10px] font-bold border border-red-100 transition-all whitespace-nowrap">
                                    ยกเลิก
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {isRunning && <StepProgress step={job.step} status={job.status} />}
            {isError && <p className="text-xs text-red-500 mt-1.5 font-medium">{job.step}</p>}
        </motion.div>
    );
};

const SortTh = ({ label, sortKey, currentSort, onSort }) => (
    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">
        {sortKey ? (
            <button onClick={() => onSort(sortKey)} className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors group">
                {label}
                <div className="flex flex-col opacity-30 group-hover:opacity-100 transition-opacity">
                    <ChevronUp size={9} className={currentSort.key === sortKey && currentSort.direction === 'asc' ? 'text-indigo-600 opacity-100' : ''} />
                    <ChevronDown size={9} className={currentSort.key === sortKey && currentSort.direction === 'desc' ? 'text-indigo-600 opacity-100' : ''} />
                </div>
            </button>
        ) : label}
    </th>
);

const QuotaBar = ({ pct, status }) => {
    const colors = { Exceeded: 'bg-red-500', Critical: 'bg-orange-500', Warning: 'bg-amber-500', OK: 'bg-emerald-500' };
    return (
        <div className="flex items-center gap-2.5 min-w-[130px]">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(pct || 0, 100)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={`h-full rounded-full ${colors[status] || colors.OK}`}
                />
            </div>
            <span className="text-[11px] font-black tabular-nums w-8 text-right text-slate-600">{pct || 0}%</span>
        </div>
    );
};

const ConfirmModal = ({ open, onClose, onConfirm, title, sub, note }) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center flex-shrink-0 text-indigo-600">
                        <Mail size={22} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-800">{title}</h3>
                        <p className="text-sm text-slate-500 mt-0.5">{sub}</p>
                    </div>
                </div>
                {note && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 mb-4 leading-relaxed">
                        ⚠️ {note}
                    </div>
                )}
                <div className="flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                        ยกเลิก
                    </button>
                    <button onClick={onConfirm}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200/50 transition-all flex items-center justify-center gap-2">
                        <Send size={14} /> ดำเนินการ
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

// ── Log Step Progress ─────────────────────────────────────────
const LogStepProgress = ({ log, activeJob }) => {
    // ถ้า log นี้มี job กำลัง running อยู่
    if (activeJob && activeJob.username === log.Username && activeJob.status === 'running') {
        return (
            <div className="mt-2">
                <StepProgress step={activeJob.step} status="running" />
            </div>
        );
    }
    if (log.Status === 'sent') {
        return (
            <div className="mt-1">
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-bold">
                    <CheckCircle2 size={12} /> ส่งสำเร็จ · {log.FilesFound || 0} files
                </div>
            </div>
        );
    }
    if (log.Status === 'error') {
        return (
            <div className="mt-1 text-[11px] text-red-500 font-medium truncate" title={log.ErrorMsg}>
                ❌ {log.ErrorMsg || 'เกิดข้อผิดพลาด'}
            </div>
        );
    }
    return null;
};

// ── Delete Confirm Modal ─────────────────────────────────────
const DeleteConfirmModal = ({ item, onConfirm, onClose }) => {
    if (!item) return null;
    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                    <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0 text-red-500">
                        <XCircle size={22} />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-slate-800">ยืนยันการลบ</h3>
                        <p className="text-xs text-slate-500 mt-0.5">รายการนี้จะถูกลบออกจากฐานข้อมูลถาวร</p>
                    </div>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-3 mb-5 border border-slate-100">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-black text-indigo-600">{item.username}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{new Date(item.sentAt).toLocaleString('th-TH')}</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                        ยกเลิก
                    </button>
                    <button onClick={onConfirm}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2">
                        <XCircle size={14} /> ลบ
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════════
const QuotaManager = () => {
    const [tab, setTab]           = useState('quota');
    const [users, setUsers]       = useState([]);
    const [stats, setStats]       = useState(null);
    const [logs,  setLogs]        = useState([]);
    const [loading, setLoading]   = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [lastSynced, setLastSynced]   = useState(null);

    const [filter, setFilter] = useState('all');
    const [query,  setQuery]  = useState('');
    const [sort,   setSort]   = useState({ key: 'pctUsed', direction: 'desc' });
    const [page,   setPage]   = useState(1);
    const [logsPage, setLogsPage] = useState(1);

    const [selected,    setSelected]    = useState(new Set());
    const [threshold,   setThreshold]   = useState(80);
    const [adminEmails, setAdminEmails] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [showSelected, setShowSelected] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, username, sentAt }

    const {
        jobItems, setJobItems,
        activeJobs, setActiveJobs,
        bulkProgress, setBulkProgress,
        toastQueue, consumeToast,
        addJob, updateJob, finishJob,
        startPollJob, cancelJobById: ctxCancelJob,
        clearDoneJobs, restorePolling,
    } = useQuotaJobs();

    const [sendMode,      setSendMode]      = useState('');
    const [confirmOpen,   setConfirmOpen]   = useState(false);
    const [confirmTarget, setConfirmTarget] = useState(null);
    const [sending,       setSending]       = useState(false);

    const [toasts, setToasts] = useState([]);
    const toastRef = useRef(0);
    const [fsrmBusy, setFsrmBusy] = useState(false);
    const [fsrmQueue, setFsrmQueue] = useState(0);

    const API = `${API_BASE}/quota`;

    // ── helpers ───────────────────────────────────────────────
    const pushToast = useCallback((message, type = 'info') => {
        const id = ++toastRef.current;
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
    }, []);

    // ── Latest log per user — ต้องอยู่ก่อน isUserLogBusy ────
    const latestLogByUser = useMemo(() => {
        const map = {};
        logs.forEach(l => { if (!map[l.Username]) map[l.Username] = l; });
        return map;
    }, [logs]);

    // ── เช็ค email log ล่าสุดของ user ว่า status = running/pending หรือไม่
    const isUserLogBusy = useCallback((username) => {
        const latest = latestLogByUser[username];
        if (!latest) return false;
        // running = กำลังทำงาน, pending = รอคิว
        return latest.Status === 'running' || latest.Status === 'pending';
    }, [latestLogByUser]);

    // ── เช็ครวม: activeJobs (memory) + log DB + response 409
    const isUserBusyStrict = useCallback((username) => {
        return Object.keys(activeJobs).includes(username) || isUserLogBusy(username);
    }, [activeJobs, isUserLogBusy]);

    const isUserBusy = useCallback((username) => {
        // primary: activeJobs (real-time, ไม่ต้องรอ DB)
        if (Object.keys(activeJobs).includes(username)) return true;
        // secondary: log DB (กัน double submit จากหน้าอื่น)
        return isUserLogBusy(username);
    }, [activeJobs, isUserLogBusy]);

    // ── fetch ─────────────────────────────────────────────────
    const fetchUsers = useCallback(async (forceSync = false) => {
        setLoading(true);
        try {
            const url = forceSync ? `${API}/users?refresh=1` : `${API}/users`;
            const [uRes, sRes] = await Promise.all([
                fetch(url).then(r => r.json()),
                fetch(`${API}/stats`).then(r => r.json()),
            ]);
            setUsers(uRes.data || []);
            setStats(sRes.data || null);
            if (uRes.lastSynced) setLastSynced(new Date(uRes.lastSynced));
        } catch { pushToast('โหลดข้อมูลล้มเหลว', 'error'); }
        setLoading(false);
    }, [API, pushToast]);

    const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
        const res = await fetch(`${API}/logs?limit=200`).then(r => r.json());
        setLogs(res.data || []);
        setLogsPage(1);  // ← เพิ่ม
    } catch { pushToast('โหลด log ล้มเหลว', 'error'); }
    setLogsLoading(false);
    }, [API, pushToast]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    // ── restore polling เมื่อกลับมาหน้านี้ ──────────────────
    useEffect(() => {
        restorePolling(pushToast);
    }, []); // eslint-disable-line

    // ── consume toast จาก context (เมื่อ poll เสร็จขณะอยู่หน้าอื่น) ──
    useEffect(() => {
        if (toastQueue.length > 0) {
            const t = toastQueue[0];
            if (t) {
                pushToast(t.message, t.type);
                consumeToast();
            }
        }
    }, [toastQueue, pushToast, consumeToast]);
    // fetch logs ทุกครั้ง mount
    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    // poll logs — ถี่ขึ้นเมื่อมี running jobs (5 วิ) หรือ idle (15 วิ)
    useEffect(() => {
        const hasRunning = Object.keys(activeJobs).length > 0 ||
                           logs.some(l => l.Status === 'running');
        const interval = hasRunning ? 5000 : 15000;
        const iv = setInterval(fetchLogs, interval);
        return () => clearInterval(iv);
    }, [fetchLogs, activeJobs, logs]);

    // fetch extra เมื่อสลับมา tab logs
    useEffect(() => { if (tab === 'logs') fetchLogs(); }, [tab, fetchLogs]);

    // ── poll FSRM status (graceful — ถ้า 404 ยังใช้งานได้ปกติ) ──
    useEffect(() => {
        const checkFsrm = async () => {
            try {
                const r = await fetch(`${API}/fsrm-status`);
                if (!r.ok) return; // route ยังไม่มี ข้ามไป
                const res = await r.json();
                setFsrmBusy(res.busy || false);
                setFsrmQueue(res.queueSize || 0);
            } catch {}
        };
        checkFsrm();
        const iv = setInterval(checkFsrm, 10000); // ลด frequency เป็น 10s
        return () => clearInterval(iv);
    }, [API]);

    // ── poll log เมื่ออยู่ที่ tab logs ───────────────────────
    useEffect(() => {
        if (tab !== 'logs') return;
        const hasRunning = Object.keys(activeJobs).length > 0;
        if (!hasRunning) return;
        const iv = setInterval(fetchLogs, 5000);
        return () => clearInterval(iv);
    }, [tab, activeJobs, fetchLogs]);

    // ── derived ───────────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = users;
        if (filter !== 'all') list = list.filter(u => u.status === filter);
        if (query) {
            const q = query.toLowerCase();
            list = list.filter(u =>
                (u.username||'').toLowerCase().includes(q) ||
                (u.name||'').toLowerCase().includes(q) ||
                (u.email||'').toLowerCase().includes(q)
            );
        }
        // แปลง size string → MB เพื่อ sort
        const toMBSort = (s) => {
            if (!s || s === '—') return 0;
            const n = parseFloat(s.replace(/,/g, ''));
            if (isNaN(n)) return 0;
            if (s.includes('TB')) return n * 1024 * 1024;
            if (s.includes('GB')) return n * 1024;
            if (s.includes('MB')) return n;
            if (s.includes('KB')) return n / 1024;
            return n;
        };

        return [...list].sort((a, b) => {
            // size columns — parse Fmt string
            if (sort.key === 'sizeUsed')  {
                const av = toMBSort(a.sizeUsedFmt), bv = toMBSort(b.sizeUsedFmt);
                return sort.direction === 'asc' ? av - bv : bv - av;
            }
            if (sort.key === 'sizeLimit') {
                const av = toMBSort(a.sizeLimitFmt), bv = toMBSort(b.sizeLimitFmt);
                return sort.direction === 'asc' ? av - bv : bv - av;
            }
            let av = a[sort.key] ?? '', bv = b[sort.key] ?? '';
            if (typeof av === 'number' && typeof bv === 'number') {
                return sort.direction === 'asc' ? av - bv : bv - av;
            }
            if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv ?? '').toString().toLowerCase(); }
            if (av < bv) return sort.direction === 'asc' ? -1 : 1;
            if (av > bv) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [users, filter, query, sort]);

    const paged        = useMemo(() => filtered.slice((page-1)*ITEMS_PER_PAGE, page*ITEMS_PER_PAGE), [filtered, page]);
    const pagedLogs    = useMemo(() => logs.slice((logsPage-1)*ITEMS_PER_PAGE, logsPage*ITEMS_PER_PAGE), [logs, logsPage]);
    const warningCount = useMemo(() => users.filter(u => u.pctUsed >= threshold).length, [users, threshold]);
    const overallPct   = useMemo(() => bulkProgress.total === 0 ? 0 : Math.round((bulkProgress.current / bulkProgress.total) * 100), [bulkProgress]);

    // ── getActiveJobForUser — ส่งคืน job object ที่กำลัง run อยู่สำหรับ username นั้น
    const getActiveJobForUser = useCallback((username) => {
        const jobId = activeJobs[username];
        if (!jobId) return null;
        return jobItems.find(j => j.jobId === jobId) || null;
    }, [activeJobs, jobItems]);

    // ── Sync ─────────────────────────────────────────────────
    const doSync = async () => {
        setSending(true);
        pushToast('⏳ กำลัง Sync จาก File Server...', 'info');
        try {
            const res = await fetch(`${API}/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
            if (res.jobId) {
                const iv = setInterval(async () => {
                    const job = await fetch(`${API}/job/${res.jobId}`).then(r => r.json());
                    if (job.status === 'done') {
                        clearInterval(iv); setSending(false);
                        pushToast('✅ Sync สำเร็จ', 'success');
                        fetchUsers();
                    } else if (job.status === 'error') {
                        clearInterval(iv); setSending(false);
                        pushToast('❌ Sync ล้มเหลว: ' + job.error, 'error');
                    }
                }, 3000);
                setTimeout(() => clearInterval(iv), 600000);
            }
        } catch { pushToast('Sync ล้มเหลว', 'error'); setSending(false); }
    };

    // pollJob ย้ายไปใช้ context.startPollJob แล้ว

    // ── Send single ───────────────────────────────────────────
    const sendOne = useCallback(async (username) => {
        const u = users.find(x => x.username === username);
        if (!u?.email) { pushToast('ไม่มี email', 'error'); return; }

        // เช็ค activeJobs ก่อน (real-time ที่สุด)
        if (Object.keys(activeJobs).includes(username)) {
            pushToast(`⏳ ${username} กำลัง run อยู่ กรุณารอให้เสร็จก่อน`, 'warning');
            return;
        }
        if (isUserBusy(username)) {
            pushToast(`⏳ ${username} กำลัง run report อยู่ กรุณารอ`, 'warning');
            return;
        }

        const tempId = `job_${username}_${Date.now()}`;
        addJob(tempId, username, 'รอ FSRM ว่าง...');

        try {
            const r = await fetch(`${API}/send-warning-single`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: u }),
            });
            const res = await r.json();

            // backend lock — user กำลัง run อยู่
            if (r.status === 409 || res.locked) {
                finishJob(tempId, username, 'error', { step: `🔒 ${res.error}` });
                pushToast(`🔒 ${username}: ${res.error}`, 'warning');
                await fetchLogs(); // refresh log เพื่ออัปเดต lock state
                return;
            }

            if (res.jobId) {
                // replace tempId → real jobId + เก็บ logId ไว้ match กับ log table
                setJobItems(prev => prev.map(j =>
                    j.jobId === tempId ? { ...j, jobId: res.jobId, logId: res.logId } : j
                ));
                setActiveJobs(prev => ({ ...prev, [username]: res.jobId }));
                startPollJob(res.jobId, username, pushToast);
            }
        } catch (e) {
            finishJob(tempId, username, 'error', { step: e.message });
            pushToast('ส่งล้มเหลว', 'error');
        }
    }, [users, isUserBusy, API, addJob, finishJob, startPollJob, pushToast]);

    // ── Cancel job (wrapper ใช้ context) ─────────────────────
    const cancelJobById = useCallback((jobId, username) =>
        ctxCancelJob(jobId, username, pushToast),
    [ctxCancelJob, pushToast]);

    // ── Delete email log ─────────────────────────────────────
    const deleteLog = useCallback(async (id) => {
        try {
            await fetch(`${API}/log/${id}`, { method: 'DELETE' }).then(r => r.json());
            setLogs(prev => prev.filter(l => l.ID !== id));
            pushToast('ลบ log แล้ว', 'success');
        } catch {
            pushToast('ลบล้มเหลว', 'error');
        }
    }, [API, pushToast]);

    // ── Clear logs ───────────────────────────────────────────
    const clearLogs = useCallback(async (status = 'all') => {
        try {
            await fetch(`${API}/logs?status=${status}`, { method: 'DELETE' }).then(r => r.json());
            await fetchLogs();
            pushToast('ล้าง log แล้ว', 'success');
        } catch {
            pushToast('ล้างล้มเหลว', 'error');
        }
    }, [API, pushToast, fetchLogs]);

    // ── Reset stale running logs (หลัง server restart) ──────
    const resetStaleLogs = useCallback(async () => {
        try {
            const res = await fetch(`${API}/reset-stale`, { method: 'POST' }).then(r => r.json());
            await fetchLogs();
            pushToast(`รีเซ็ต ${res.affected || 0} รายการที่ค้างอยู่`, 'success');
        } catch {
            pushToast('รีเซ็ตล้มเหลว', 'error');
        }
    }, [API, pushToast, fetchLogs]);

    // ── handleSendClick — เช็ค lock ก่อนเปิด modal ───────────
    const handleSendClick = useCallback((username) => {
        // เช็คจาก activeJobs ก่อน (real-time) แล้วค่อยเช็ค log
        const inActive = Object.keys(activeJobs).includes(username);
        if (inActive || isUserBusy(username)) {
            pushToast(`⏳ ${username} กำลัง run report อยู่ กรุณารอให้เสร็จก่อน`, 'warning');
            return;
        }
        setConfirmTarget(username);
        setSendMode('single');
        setConfirmOpen(true);
    }, [activeJobs, isUserBusy, pushToast]);

    // ── Confirm & Send ────────────────────────────────────────
    const getTargets = useCallback(() =>
        selected.size
            ? users.filter(u => selected.has(u.username))
            : users.filter(u => u.pctUsed >= threshold),
    [selected, users, threshold]);

    const doSend = async () => {
        setConfirmOpen(false);

        if (sendMode === 'single' && confirmTarget) {
            sendOne(confirmTarget);
            setConfirmTarget(null);
            return;
        }

        if (sendMode === 'warning') {
            const targets = getTargets().filter(u => u.email);
            const busyUsers = targets.filter(u => isUserBusy(u.username));
            if (busyUsers.length > 0) {
                pushToast(`⚠️ ${busyUsers.map(u=>u.username).join(', ')} กำลัง run อยู่ จะข้ามไป`, 'warning');
            }
            const freTargets = targets.filter(u => !isUserBusy(u.username));
            if (!freTargets.length) { pushToast('ไม่มีผู้ใช้ที่พร้อมส่ง', 'error'); return; }

            setSending(true);
            setBulkProgress({ current: 0, total: freTargets.length });

            // เพิ่ม job items ผ่าน context
            freTargets.forEach(u => addJob(`q_${u.username}`, u.username, 'รอคิว...'));

            const res = await fetch(`${API}/send-warning`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users: freTargets }),
            }).then(r => r.json()).catch(() => null);

            if (res?.jobId) {
                const bulkJobId = res.jobId;
                const iv = setInterval(async () => {
                    try {
                        const job = await fetch(`${API}/job/${bulkJobId}`).then(r => r.json());
                        setBulkProgress({ current: (job.sent||0)+(job.failed||0), total: freTargets.length });

                        // อัปเดต step ของ user ที่กำลัง run
                        if (job.current) {
                            setJobItems(prev => prev.map(j =>
                                j.username === job.current
                                    ? { ...j, status: 'running', step: job.step || 'กำลังดำเนินการ...' }
                                    : j
                            ));
                            // mark คนอื่นที่ยังรออยู่
                            freTargets.forEach(u => {
                                if (u.username !== job.current) {
                                    setJobItems(prev => prev.map(j =>
                                        j.username === u.username && j.step === 'รอคิว...'
                                            ? { ...j, step: 'รอในคิว...' } : j
                                    ));
                                }
                            });
                        }

                        // อัปเดต completed items
                        if (job.results?.length) {
                            job.results.forEach(r => {
                                const isDone  = r.status === 'sent';
                                const isError = r.status === 'error';
                                if (isDone || isError) {
                                    finishJob(
                                        `q_${r.username}`,
                                        r.username,
                                        isDone ? 'done' : 'error',
                                        {
                                            step: isDone ? `✅ ส่งสำเร็จ ${r.filesFound||0} files` : `❌ ${r.error||'ล้มเหลว'}`,
                                            filesFound: r.filesFound,
                                        }
                                    );
                                }
                            });
                        }

                        if (job.status === 'done') {
                            clearInterval(iv);
                            setSending(false);
                            pushToast(`✅ ส่งเสร็จ ${job.sent}/${freTargets.length} คน${job.failed ? ` (ล้มเหลว ${job.failed})` : ''}`, 'success');
                            fetchLogs();
                        } else if (job.status === 'error') {
                            clearInterval(iv);
                            setSending(false);
                        }
                    } catch { /* keep polling */ }
                }, 3000);
                setTimeout(() => clearInterval(iv), 1800000);
            } else {
                setSending(false);
                pushToast('ส่งคำขอล้มเหลว', 'error');
            }
        }

        if (sendMode === 'report') {
            const emails = adminEmails.split(',').map(e => e.trim()).filter(Boolean);
            if (!emails.length) { pushToast('กรุณาตั้งค่า Admin Email ก่อน', 'error'); return; }
            try {
                const summary = {
                    total:    users.length,
                    warning:  users.filter(u => u.pctUsed >= 80 && u.pctUsed < 90).length,
                    critical: users.filter(u => u.pctUsed >= 90 && u.pctUsed < 100).length,
                    exceeded: users.filter(u => u.pctUsed >= 100).length,
                };
                const res = await fetch(`${API}/send-report`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipients: emails, summary }),  // ลบ data: users ออก
            }).then(r => r.json());
                pushToast(res.message || '✅ ส่ง Report สำเร็จ', 'success');
            } catch { pushToast('ส่ง Report ล้มเหลว', 'error'); }
        }
    };

    // ── Selection ─────────────────────────────────────────────
    const toggleRow  = (u, ck) => setSelected(s => { const n = new Set(s); ck ? n.add(u) : n.delete(u); return n; });
    const toggleAll  = (ck)    => setSelected(s => { const n = new Set(s); paged.forEach(u => ck ? n.add(u.username) : n.delete(u.username)); return n; });
    const clearSel   = ()      => setSelected(new Set());

    // ── Sort handler ──────────────────────────────────────────
    const handleSort = useCallback((key) => {
        const numericKeys = ['sizeUsed', 'sizeLimit', 'pctUsed'];
        setSort(prev => {
            if (prev.key === key) {
                // toggle
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            // key ใหม่ — numeric default desc, string default asc
            return { key, direction: numericKeys.includes(key) ? 'desc' : 'asc' };
        });
        setPage(1);
    }, []);

    // ════════════════════════════════════════════════════════
    //  RENDER
    // ════════════════════════════════════════════════════════
    return (
        <div className="space-y-6">
            <Toast toasts={toasts} />
            <DeleteConfirmModal
                item={deleteConfirm}
                onConfirm={() => { deleteLog(deleteConfirm.id); setDeleteConfirm(null); }}
                onClose={() => setDeleteConfirm(null)}
            />
            <ConfirmModal
                open={confirmOpen} onClose={() => { setConfirmOpen(false); setConfirmTarget(null); }}
                onConfirm={doSend}
                title={sendMode === 'single' ? `ส่ง Warning Email` : sendMode === 'warning' ? 'ส่ง Bulk Warning Email' : 'ส่ง Daily Report'}
                sub={sendMode === 'single'
                    ? `ส่ง FSRM Report + Email ให้ ${confirmTarget}`
                    : sendMode === 'warning'
                    ? `จะส่งให้ ${getTargets().filter(u=>u.email && !isUserBusy(u.username)).length} คน (ใช้เวลา ~${getTargets().filter(u=>u.email && !isUserBusy(u.username)).length * 3} นาที)`
                    : `ส่งให้: ${adminEmails || '(ยังไม่ได้ตั้งค่า)'}`}
                note={sendMode === 'warning'
                    ? selected.size > 0
                        ? `ส่งให้รายการที่เลือก ${selected.size} คน — ทีละคนตามคิว`
                        : `⚠️ ไม่ได้เลือกรายการ จะส่งให้ทุกคนที่เกิน ${threshold}% ทั้งหมด ${getTargets().filter(u=>u.email).length} คน`
                    : sendMode !== 'report' ? 'ระบบจะ run FSRM report แนบรายการไฟล์ขนาดใหญ่ไปในอีเมลด้วย' : null}
            />

            {/* ── Header ── */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-3xl font-black text-slate-800 flex items-center gap-2">
                            <HardDrive size={28} className="text-indigo-500" /> QUOTA MANAGER
                        </h2>
                        <p className="text-slate-500 font-medium">File Server Resource Manager — จัดการพื้นที่และส่งอีเมลแจ้งเตือน</p>
                        {lastSynced && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <Clock size={11} /> อัปเดตล่าสุด: {lastSynced.toLocaleString('th-TH')}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowSettings(!showSettings)}
                            title="ตั้งค่า threshold และ Admin Email"
                            className={`p-2.5 rounded-xl border text-sm transition-all
                                ${showSettings ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                            <Settings size={16} />
                        </button>
                        <button onClick={doSync} disabled={sending}
                            title="ดึงข้อมูล Disk Quota จาก Windows Server ใหม่ทั้งหมด"
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all active:scale-95">
                            <Database size={14} className={sending ? 'animate-spin' : ''} /> SYNC SERVER
                        </button>
                        {fsrmBusy && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-700">
                            <Loader2 size={13} className="animate-spin" />
                            FSRM กำลัง run{fsrmQueue > 1 ? ` (คิว ${fsrmQueue})` : ''}
                        </div>
                    )}
                    <button onClick={() => fetchUsers()} disabled={loading}
                            title="โหลดข้อมูลจาก Database (ไม่ดึงจาก Server)"
                            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* ── Settings ── */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-white border border-slate-200 rounded-2xl p-5 overflow-hidden shadow-sm">
                        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <Settings size={14} className="text-indigo-500" /> ตั้งค่าการแจ้งเตือน
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Threshold (%)</label>
                                <div className="flex items-center gap-3">
                                    <input type="range" min="50" max="99" value={threshold}
                                        onChange={e => setThreshold(Number(e.target.value))} className="flex-1 accent-indigo-600" />
                                    <span className="w-12 text-center font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg py-1 text-sm">{threshold}%</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Admin Emails</label>
                                <input type="text" value={adminEmails} onChange={e => setAdminEmails(e.target.value)}
                                    placeholder="admin@dci.daikin.co.jp"
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Stats ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Users}         label="ผู้ใช้ทั้งหมด"        value={stats?.total ?? users.length} color="from-indigo-500 to-indigo-600"
                    title="แสดงทั้งหมด"       onClick={() => { setFilter('all');      setTab('quota'); setPage(1); }} />
                <StatCard icon={AlertTriangle} label={`เตือน (≥${threshold}%)`}  value={warningCount}              color="from-amber-400 to-orange-500"
                    title="กรองเฉพาะที่เตือน" onClick={() => { setFilter('Warning');  setTab('quota'); setPage(1); }} />
                <StatCard icon={AlertCircle}   label="วิกฤต (≥90%)"              value={stats?.critical ?? 0}      color="from-orange-500 to-red-500"
                    title="กรองเฉพาะวิกฤต"   onClick={() => { setFilter('Critical'); setTab('quota'); setPage(1); }} />
                <StatCard icon={XCircle}       label="เต็ม (100%)"               value={stats?.exceeded ?? 0}      color="from-red-500 to-red-600"
                    title="กรองเฉพาะที่เต็ม" onClick={() => { setFilter('Exceeded'); setTab('quota'); setPage(1); }} />
            </div>

            {/* ── Job Progress Panel ── */}
            <AnimatePresence>
                {jobItems.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                        className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <Send size={15} className="text-indigo-500" />
                                    <span className="text-sm font-bold text-slate-700">Sending Queue</span>
                                </div>
                                {bulkProgress.total > 0 && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <motion.div
                                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                                                animate={{ width: `${overallPct}%` }} transition={{ duration: 0.5 }}
                                            />
                                        </div>
                                        <span className="text-xs font-bold text-indigo-600">{overallPct}%</span>
                                        <span className="text-xs text-slate-400">{bulkProgress.current}/{bulkProgress.total}</span>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => { clearDoneJobs(); setBulkProgress({current:0,total:0}); }}
                                className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors">
                                <X size={12} /> ล้าง
                            </button>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto">
                            <AnimatePresence mode="popLayout">
                                {jobItems.map(j => <JobItem key={j.jobId} job={j} onCancel={cancelJobById} />)}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Tabs ── */}
            <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-fit gap-1">
                {[
                    { key: 'quota', label: 'Quota Usage', icon: BarChart3 },
                    { key: 'logs',  label: 'Email Log',   icon: History   },
                ].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all
                            ${tab === t.key
                                ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-200'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
                        <t.icon size={15} />
                        {t.label}
                        {t.key === 'logs' && Object.keys(activeJobs).length > 0 && (
                            <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                                {Object.keys(activeJobs).length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ════ QUOTA TAB ════ */}
            {tab === 'quota' && (
                <motion.div key="quota" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

                    {/* Toolbar */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center gap-2 shadow-sm"
                        onClick={e => { if (!e.target.closest('.relative')) setShowSelected(false); }}>
                        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5">
                            {['all','Exceeded','Critical','Warning','OK'].map(f => (
                                <button key={f} onClick={() => { setFilter(f); setPage(1); }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                                        ${filter === f ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                                    {f === 'all' ? 'ทั้งหมด' : STATUS_CONFIG[f]?.label || f}
                                </button>
                            ))}
                        </div>

                        <div className="relative flex-1 min-w-[200px]">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" value={query}
                                onChange={e => { setQuery(e.target.value); setPage(1); }}
                                placeholder="ค้นหา Username, ชื่อ, Email..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
                            {query && (
                                <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                                    <X size={12} strokeWidth={3} />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 ml-auto flex-wrap">
                            {selected.size > 0 && (
                                <div className="relative flex items-center gap-1.5">
                                    <button
                                        onClick={() => setShowSelected(v => !v)}
                                        className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1 hover:bg-indigo-100 transition-all flex items-center gap-1">
                                        เลือก {selected.size} คน
                                        <ChevronDown size={11} className={`transition-transform ${showSelected ? 'rotate-180' : ''}`} />
                                    </button>
                                    <button onClick={() => { clearSel(); setShowSelected(false); }} title="ยกเลิกการเลือกทั้งหมด" className="text-slate-400 hover:text-red-500"><X size={13} /></button>
                                    {showSelected && (
                                        <div className="absolute top-full left-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                                            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">รายการที่เลือก ({selected.size})</span>
                                                <button onClick={() => setShowSelected(false)} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
                                            </div>
                                            <div className="max-h-64 overflow-y-auto py-1">
                                                {users.filter(u => selected.has(u.username)).map(u => (
                                                    <div key={u.username} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-xs font-bold text-indigo-600">{u.username}</span>
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                                                                    ${u.status === 'Exceeded' ? 'bg-red-50 text-red-600' :
                                                                      u.status === 'Critical'  ? 'bg-orange-50 text-orange-600' :
                                                                      u.status === 'Warning'   ? 'bg-amber-50 text-amber-600' :
                                                                      'bg-emerald-50 text-emerald-600'}`}>
                                                                    {u.pctUsed}%
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 truncate">{u.name}</div>
                                                        </div>
                                                        <button onClick={() => toggleRow(u.username, false)}
                                                            className="text-slate-300 hover:text-red-500 flex-shrink-0 ml-2 transition-colors">
                                                            <X size={12} strokeWidth={2.5} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
                                                <button onClick={() => { clearSel(); setShowSelected(false); }}
                                                    className="w-full text-xs font-bold text-red-500 hover:text-red-700 transition-colors">
                                                    ยกเลิกทั้งหมด
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <button onClick={() => {
                                setSelected(new Set(users.filter(u => u.pctUsed >= threshold).map(u => u.username)));
                                pushToast(`เลือก ${users.filter(u => u.pctUsed >= threshold).length} คน`, 'info');
                            }} title={`เลือก checkbox ทุกคนที่ใช้พื้นที่เกิน ${threshold}% อัตโนมัติ`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50">
                                <Filter size={12} /> เลือกที่เกิน {threshold}%
                            </button>
                            <button disabled={sending} onClick={() => { setSendMode('warning'); setConfirmOpen(true); }}
                                title="ส่งอีเมลแจ้งเตือนพร้อมรายการไฟล์ให้ user ที่เลือก (ทีละคนตามคิว)"
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50 transition-all">
                                <Bell size={12} /> ส่ง Warning Email
                            </button>
                            <button disabled={sending} onClick={() => { setSendMode('report'); setConfirmOpen(true); }}
                                title="ส่งรายงานสรุปรวมให้ Admin Email ที่ตั้งค่าไว้"
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 transition-all">
                                <Send size={12} /> ส่ง Report
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {filtered.length} รายการ{query ? ` — "${query}"` : ''}
                            </span>
                            {Object.keys(activeJobs).length > 0 && (
                                <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                                    <Loader2 size={11} className="animate-spin" />
                                    กำลังดำเนินการ {Object.keys(activeJobs).length} รายการ
                                </span>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-max">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 w-8">
                                            <input type="checkbox"
                                                checked={paged.length > 0 && paged.every(u => selected.has(u.username))}
                                                onChange={e => toggleAll(e.target.checked)} />
                                        </th>
                                        <SortTh label="Username"  sortKey="username"  currentSort={sort} onSort={handleSort} />
                                        <SortTh label="ชื่อ"      sortKey="name"      currentSort={sort} onSort={handleSort} />
                                        <SortTh label="Email"     sortKey="email"     currentSort={sort} onSort={handleSort} />
                                        <SortTh label="ใช้ไป"     sortKey="sizeUsed"  currentSort={sort} onSort={handleSort} />
                                        <SortTh label="โควต้า"    sortKey="sizeLimit" currentSort={sort} onSort={handleSort} />
                                        <SortTh label="การใช้งาน" sortKey="pctUsed"   currentSort={sort} onSort={handleSort} />
                                        <SortTh label="สถานะ"     sortKey="status"    currentSort={sort} onSort={handleSort} />
                                        <th className="px-4 py-3 text-[11px] font-black uppercase text-slate-400">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {loading ? (
                                        [...Array(8)].map((_, i) => (
                                            <tr key={i}>{[...Array(9)].map((_, j) => (
                                                <td key={j} className="px-4 py-3">
                                                    <div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }} />
                                                </td>
                                            ))}</tr>
                                        ))
                                    ) : paged.length === 0 ? (
                                        <tr><td colSpan={9} className="py-16 text-center text-slate-400">
                                            <HardDrive size={36} strokeWidth={1} className="mx-auto mb-2 text-slate-200" />
                                            <p className="text-sm">ไม่พบข้อมูล</p>
                                        </td></tr>
                                    ) : paged.map((u, i) => {
                                        const busy = isUserBusy(u.username);
                                        const activeJob = getActiveJobForUser(u.username);
                                        return (
                                            <motion.tr key={u.username}
                                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                transition={{ delay: i * 0.01 }}
                                                className={`transition-colors align-middle
                                                    ${selected.has(u.username) ? 'bg-indigo-50/30' :
                                                      busy ? 'bg-amber-50/30' : 'hover:bg-slate-50/70'}`}>
                                                <td className="px-4 py-3 w-8">
                                                    <input type="checkbox" checked={selected.has(u.username)}
                                                        onChange={e => toggleRow(u.username, e.target.checked)} />
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs text-indigo-600 font-bold">{u.username}</span>
                                                        {busy && (
                                                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                                                                <Loader2 size={9} className="animate-spin" /> running
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* mini step progress ใต้ username */}
                                                    {busy && activeJob && (
                                                        <div className="mt-1">
                                                            <div className="flex gap-0.5">
                                                                {STEPS.map((s, idx) => {
                                                                    const cur = stepIndex(activeJob.step);
                                                                    return (
                                                                        <div key={s.key}
                                                                            className={`flex-1 h-1 rounded-full transition-all
                                                                                ${idx < cur ? 'bg-indigo-400' :
                                                                                  idx === cur ? 'bg-indigo-600 animate-pulse' :
                                                                                  'bg-slate-100'}`} />
                                                                    );
                                                                })}
                                                            </div>
                                                            <p className="text-[9px] text-slate-400 mt-0.5 truncate">{activeJob.step}</p>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700 font-medium text-xs whitespace-nowrap max-w-[180px] truncate" title={u.name}>
                                                    {u.name || '—'}
                                                </td>
                                                <td className="px-4 py-3 text-xs whitespace-nowrap">
                                                    {u.email
                                                        ? <a href={`mailto:${u.email}`} className="text-indigo-500 hover:underline">{u.email}</a>
                                                        : <span className="text-slate-300 italic">ไม่มี email</span>}
                                                </td>
                                                <td className="px-4 py-3 text-xs font-mono font-bold whitespace-nowrap">{u.sizeUsedFmt || '—'}</td>
                                                <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{u.sizeLimitFmt || '—'}</td>
                                                <td className="px-4 py-3 min-w-[140px]">
                                                    <QuotaBar pct={u.pctUsed} status={u.status} />
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap"><Badge status={u.status} /></td>
                                                <td className="px-4 py-3">
                                                    {u.email && (
                                                        <div className="relative group/btn">
                                                            <button
                                                                onClick={() => handleSendClick(u.username)}
                                                                disabled={busy}
                                                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all select-none
                                                                    ${busy
                                                                        ? 'bg-amber-50 text-amber-600 border border-amber-300 cursor-not-allowed'
                                                                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 cursor-pointer'}`}
                                                            >
                                                                {busy
                                                                    ? <><Loader2 size={11} className="animate-spin" /> กำลัง run...</>
                                                                    : <><Mail size={11} /> ส่งแจ้ง</>}
                                                            </button>
                                                            {busy && (
                                                                <div className="absolute bottom-full right-0 mb-2 w-56 px-3 py-2.5 bg-slate-900 text-white text-[11px] rounded-xl opacity-0 group-hover/btn:opacity-100 transition-all pointer-events-none z-20 shadow-2xl border border-slate-700">
                                                                    <div className="font-bold text-amber-400 flex items-center gap-1.5 mb-1">
                                                                        <Loader2 size={10} className="animate-spin" /> กำลัง run FSRM Report
                                                                    </div>
                                                                    <div className="text-slate-300 leading-relaxed">ไม่สามารถส่งซ้ำได้<br/>รอให้ดำเนินการเสร็จก่อน</div>
                                                                    {activeJob && (
                                                                        <div className="mt-1.5 text-[10px] text-slate-400 truncate">{activeJob.step}</div>
                                                                    )}
                                                                    <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                         <Pagination
                            currentPage={page}
                            totalPages={Math.ceil(filtered.length / ITEMS_PER_PAGE)}
                            onPageChange={setPage}
                            itemsPerPage={ITEMS_PER_PAGE}
                            totalItems={filtered.length}
                        />
                    </div>
                </motion.div>
            )}

            {/* ════ LOG TAB ════ */}
            {tab === 'logs' && (
                <motion.div key="logs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {logsLoading ? 'กำลังโหลด...' : `${logs.length} รายการ (หน้า ${logsPage}/${Math.ceil(logs.length / ITEMS_PER_PAGE) || 1})`}
                                </span>
                                {Object.keys(activeJobs).length > 0 && (
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                                        <Loader2 size={11} className="animate-spin" />
                                        กำลังส่ง {Object.keys(activeJobs).length} รายการ
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {logs.some(l => l.Status === 'running') && (
                                    <button onClick={resetStaleLogs}
                                        title="รีเซ็ต log ที่ค้าง status=running เป็น error (ใช้หลัง server restart)"
                                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all whitespace-nowrap">
                                        รีเซ็ต Running
                                    </button>
                                )}
                                <button onClick={fetchLogs}
                                    title="โหลด Email Log ใหม่จาก Database"
                                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-semibold transition-colors">
                                    <RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} /> Refresh
                                </button>
                            </div>
                        </div>

                        {/* Active jobs progress ─── แสดงด้านบนสุดของ log */}
                        <AnimatePresence>
                            {Object.keys(activeJobs).length > 0 && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="border-b border-amber-100 bg-amber-50/50 px-4 py-3">
                                    <p className="text-[11px] font-black text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <Bell size={11} /> กำลังดำเนินการอยู่
                                    </p>
                                    <div className="space-y-2">
                                        {Object.entries(activeJobs).map(([username, jobId]) => {
                                            const job = jobItems.find(j => j.jobId === jobId);
                                            if (!job) return null;
                                            return (
                                                <div key={username} className="bg-white rounded-xl border border-amber-100 px-3 py-2.5 shadow-sm">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="font-mono text-xs font-black text-indigo-700">{username}</span>
                                                        <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full">running</span>
                                                    </div>
                                                    <StepProgress step={job.step} status={job.status} />
                                                </div>
                                            );
                                        })}
                                        <Pagination
                            currentPage={logsPage}
                            totalPages={Math.ceil(logs.length / ITEMS_PER_PAGE)}
                            onPageChange={setLogsPage}
                            itemsPerPage={ITEMS_PER_PAGE}
                            totalItems={logs.length}
                        />
                                    </div>
                                    
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-max">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        {['เวลา','Username','ชื่อ','Email','%','ใช้ไป','ไฟล์','สถานะ','หมายเหตุ',''].map(h => (
                                            <th key={h} className="px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {logsLoading ? (
                                        [...Array(5)].map((_, i) => (
                                            <tr key={i}>{[...Array(9)].map((_,j) => (
                                                <td key={j} className="px-3 py-3">
                                                    <div className="h-4 bg-slate-100 rounded animate-pulse w-20" />
                                                </td>
                                            ))}</tr>
                                        ))
                                    ) : logs.length === 0 ? (
                                        <tr><td colSpan={9} className="py-16 text-center">
                                            <History size={36} strokeWidth={1} className="mx-auto mb-2 text-slate-200" />
                                            <p className="text-sm text-slate-400">ยังไม่มี log</p>
                                        </td></tr>
                                    ) : pagedLogs.map((l, i) => {
                                        // match ด้วย logId (แม่นยำ) ก่อน ถ้าไม่มีค่อย fallback username
                                        const logJob = jobItems.find(j => j.logId === l.ID) ||
                                            (activeJobs[l.Username]
                                                ? jobItems.find(j => j.jobId === activeJobs[l.Username])
                                                : null);
                                        const isLogBusy = !!logJob && logJob.status === 'running' && l.Status === 'running';

                                        return (
                                            <motion.tr key={i}
                                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                transition={{ delay: i * 0.008 }}
                                                className={`transition-colors align-top
                                                    ${isLogBusy ? 'bg-amber-50/30' : 'hover:bg-slate-50/50'}`}>
                                                <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                                                    {new Date(l.SentAt).toLocaleString('th-TH')}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono text-xs text-indigo-600 font-bold whitespace-nowrap">{l.Username}</span>
                                                        {isLogBusy && <Loader2 size={10} className="animate-spin text-amber-500 flex-shrink-0" />}
                                                    </div>
                                                    {/* step จาก DB (อัปเดต real-time) */}
                                                    {isLogBusy && (
                                                        <div className="mt-1 min-w-[160px]">
                                                            <div className="flex gap-0.5">
                                                                {STEPS.map((s, idx) => {
                                                                    const curStep = logJob?.step || l.Step || '';
                                                                    const cur = stepIndex(curStep);
                                                                    return (
                                                                        <div key={s.key}
                                                                            className={`flex-1 h-1 rounded-full transition-all
                                                                                ${idx < cur ? 'bg-indigo-400' :
                                                                                  idx === cur ? 'bg-indigo-600 animate-pulse' :
                                                                                  'bg-slate-100'}`} />
                                                                    );
                                                                })}
                                                            </div>
                                                            <p className="text-[9px] text-amber-600 font-medium mt-0.5 truncate max-w-[160px]">
                                                                {logJob?.step || l.Step || 'กำลังดำเนินการ...'}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {/* step จาก DB */}
                                                    {!isLogBusy && l.Step && l.Status !== 'sent' && (
                                                        <p className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[160px]" title={l.Step}>{l.Step}</p>
                                                    )}
                                                    
                                                </td>
                                                <td className="px-3 py-2.5 text-xs text-slate-700 font-medium whitespace-nowrap max-w-[150px] truncate">{l.DisplayName || '—'}</td>
                                                <td className="px-3 py-2.5 text-xs text-indigo-500 whitespace-nowrap">{l.Email || '—'}</td>
                                                <td className={`px-3 py-2.5 text-xs font-bold font-mono whitespace-nowrap
                                                    ${l.PctUsed >= 90 ? 'text-orange-600' : l.PctUsed >= 80 ? 'text-yellow-600' : 'text-slate-500'}`}>
                                                    {l.PctUsed || 0}%
                                                </td>
                                                <td className="px-3 py-2.5 text-xs font-mono text-slate-600 whitespace-nowrap">{l.SizeUsedFmt || '—'}</td>
                                                <td className="px-3 py-2.5 text-xs text-center font-bold text-emerald-600 whitespace-nowrap">{l.FilesFound || 0}</td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    {isLogBusy ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border bg-amber-50 text-amber-600 border-amber-200">
                                                            <Loader2 size={9} className="animate-spin" /> running
                                                        </span>
                                                    ) : (
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-colors
                                                        ${l.Status === 'sent'    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        l.Status === 'error'   ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                        l.Status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                        l.Status === 'running' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                                'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                        
                                                        {l.Status === 'sent' ? (
                                                            <><span className="mr-1">✓</span> ส่งแล้ว</>
                                                        ) : l.Status === 'error' ? (
                                                            <><span className="mr-1">✗</span> ล้มเหลว</>
                                                        ) : (
                                                            l.Status
                                                        )}
                                                    </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-xs max-w-[200px] truncate">
                                                    {l.Status === 'sent' && l.ReportFile ? (
                                                        <span className="text-indigo-400" title={l.ReportFile}>
                                                            📄 {l.ReportFile}
                                                        </span>
                                                    ) : (
                                                        <span className="text-red-500" title={l.ErrorMsg || ''}>{l.ErrorMsg || ''}</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    {!isLogBusy && (
                                                        <button
                                                            onClick={() => setDeleteConfirm({ id: l.ID, username: l.Username, sentAt: l.SentAt })}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 transition-all whitespace-nowrap">
                                                            ลบ
                                                        </button>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                          <Pagination
                currentPage={logsPage}
                totalPages={Math.ceil(logs.length / ITEMS_PER_PAGE)}
                onPageChange={setLogsPage}
                itemsPerPage={ITEMS_PER_PAGE}
                totalItems={logs.length}
            />
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default QuotaManager;