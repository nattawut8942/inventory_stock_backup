import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, RotateCcw, Copy, History, ShieldCheck, Eraser, Check, Minus, Loader2, UserPlus, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Portal from './Portal';
import AlertModal from './AlertModal';
import { API_BASE } from '../config/api';

// Editor for page permissions.
//   <PermissionEditorModal target={user} users={allUsers} onClose onSaved />   one person
//   <PermissionEditorModal target={null} ... />                                the defaults given to new users
// The global fetch adds the Authorization header for every API URL, so plain fetch is enough here.

const COMMON = ['view', 'create', 'edit', 'delete'];
const COMMON_LABEL = { view: 'ดู', create: 'เพิ่ม', edit: 'แก้ไข', delete: 'ลบ' };

// Cache the in-flight promise (not just the result) so concurrent opens share one request;
// a failed load is forgotten so the next open retries.
let catalogPromise = null;
export const loadCatalog = () => {
    if (!catalogPromise) {
        catalogPromise = (async () => {
            const res = await fetch(`${API_BASE}/permissions/catalog`);
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || d.message || `โหลดรายการสิทธิ์ไม่สำเร็จ (HTTP ${res.status})`);
            return d;
        })().catch((err) => { catalogPromise = null; throw err; });
    }
    return catalogPromise;
};

const getJson = async (path) => {
    const res = await fetch(`${API_BASE}${path}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || d.message || `HTTP ${res.status}`);
    return d;
};

const fmtTime = (d) => {
    const t = d ? new Date(d) : null;
    if (!t || isNaN(t)) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
};

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const ModalShell = ({ children, onBackdrop }) => (
    <Portal>
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onBackdrop?.(); }}
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
        >
            {children}
        </motion.div>
    </Portal>
);

const PermissionEditorModal = ({ target, users = [], avatar = null, onClose, onSaved }) => {
    const isDefaults = !target;
    const isAdminTarget = !!target && target.Role === 'Admin';

    const [catalog, setCatalog] = useState(null);
    const [original, setOriginal] = useState(new Set());
    const [current, setCurrent] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [copyFrom, setCopyFrom] = useState('');
    const [showAudit, setShowAudit] = useState(false);
    const [audit, setAudit] = useState(null); // null = not loaded
    const [confirmDiscard, setConfirmDiscard] = useState(false); // "close without saving?" dialog

    const dirty = !sameSet(original, current);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [cat, cur] = await Promise.all([
                loadCatalog(),
                isDefaults ? getJson('/permissions/defaults') : getJson(`/permissions/users/${encodeURIComponent(target.EmpCode)}`),
            ]);
            setCatalog(cat);
            const s = new Set(cur.permissions || []);
            setOriginal(s);
            setCurrent(new Set(s));
        } catch (err) {
            setError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    }, [isDefaults, target?.EmpCode]);

    useEffect(() => { load(); }, [load]);

    const pageByKey = useMemo(() => new Map((catalog?.pages || []).map((p) => [p.key, p])), [catalog]);
    const totalPossible = useMemo(() => (catalog?.pages || []).reduce((n, p) => n + p.actions.length, 0), [catalog]);

    const requestClose = useCallback(() => {
        if (saving) return;
        if (dirty) { setConfirmDiscard(true); return; } // ask with the site's own dialog
        onClose?.();
    }, [dirty, saving, onClose]);

    useEffect(() => {
        // Escape closes the confirm dialog first (stay in the editor), otherwise asks to close the editor
        const onKey = (e) => { if (e.key === 'Escape') { if (confirmDiscard) setConfirmDiscard(false); else requestClose(); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [requestClose, confirmDiscard]);

    // ── editing rules: any action on a page needs "view"; removing "view" removes the rest ──
    const toggle = (page, action) => {
        if (isAdminTarget) return;
        setCurrent((prev) => {
            const next = new Set(prev);
            const key = `${page.key}:${action}`;
            if (next.has(key)) {
                next.delete(key);
                if (action === 'view') page.actions.forEach((a) => next.delete(`${page.key}:${a.key}`));
            } else {
                next.add(key);
                if (action !== 'view') next.add(`${page.key}:view`);
            }
            return next;
        });
    };

    const rowAll = (page) => {
        if (isAdminTarget) return;
        setCurrent((prev) => {
            const next = new Set(prev);
            const keys = page.actions.map((a) => `${page.key}:${a.key}`);
            if (keys.every((k) => next.has(k))) keys.forEach((k) => next.delete(k));
            else keys.forEach((k) => next.add(k));
            return next;
        });
    };

    const visiblePages = useMemo(() => {
        const q = search.trim().toLowerCase();
        const pages = catalog?.pages || [];
        if (!q) return pages;
        return pages.filter((p) => `${p.label} ${p.key} ${p.group}`.toLowerCase().includes(q));
    }, [catalog, search]);

    const columnState = (action) => {
        const pages = visiblePages.filter((p) => p.actions.some((a) => a.key === action));
        if (pages.length === 0) return { pages, all: false };
        return { pages, all: pages.every((p) => current.has(`${p.key}:${action}`)) };
    };

    const toggleColumn = (action) => {
        if (isAdminTarget) return;
        const { pages, all } = columnState(action);
        if (pages.length === 0) return;
        setCurrent((prev) => {
            const next = new Set(prev);
            for (const p of pages) {
                const key = `${p.key}:${action}`;
                if (all) {
                    next.delete(key);
                    if (action === 'view') p.actions.forEach((a) => next.delete(`${p.key}:${a.key}`));
                } else {
                    next.add(key);
                    if (action !== 'view') next.add(`${p.key}:view`);
                }
            }
            return next;
        });
    };

    // ── shortcuts ──
    const applyList = (list) => setCurrent(new Set(list));

    const clearAll = () => applyList([]);

    const useDefaults = async () => {
        try {
            if (isDefaults) {
                applyList((catalog?.pages || []).filter((p) => p.defaultView).map((p) => `${p.key}:view`));
            } else {
                const d = await getJson('/permissions/defaults');
                applyList(d.permissions || []);
            }
            setError('');
        } catch (err) {
            setError(err.message);
        }
    };

    const doCopy = async (empCode) => {
        setCopyFrom(empCode);
        if (!empCode) return;
        try {
            const d = await getJson(`/permissions/users/${encodeURIComponent(empCode)}`);
            applyList(d.permissions || []);
            setError('');
        } catch (err) {
            setError(`คัดลอกสิทธิ์ไม่สำเร็จ: ${err.message}`);
        } finally {
            setCopyFrom('');
        }
    };

    const loadAudit = async () => {
        const next = !showAudit;
        setShowAudit(next);
        if (next && audit === null && !isDefaults) {
            try {
                setAudit(await getJson(`/permissions/users/${encodeURIComponent(target.EmpCode)}/audit?limit=100`));
            } catch (err) {
                setAudit([]);
                setError(`โหลดประวัติไม่สำเร็จ: ${err.message}`);
            }
        }
    };

    const save = async () => {
        if (saving || !dirty || isAdminTarget) return;
        setSaving(true);
        setError('');
        try {
            const url = isDefaults ? `${API_BASE}/permissions/defaults` : `${API_BASE}/permissions/users/${encodeURIComponent(target.EmpCode)}`;
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permissions: [...current] }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok || !d.success) throw new Error(d.error || d.message || `บันทึกไม่สำเร็จ (HTTP ${res.status})`);
            onSaved?.(d.message || 'บันทึกสิทธิ์สำเร็จ');
            onClose?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const labelOf = (key) => {
        const i = key.indexOf(':');
        const p = pageByKey.get(key.slice(0, i));
        const a = p?.actions.find((x) => x.key === key.slice(i + 1));
        return `${p?.label || key.slice(0, i)} · ${a?.label || key.slice(i + 1)}`;
    };

    // what changed since opening: added / removed permission keys
    const added = [...current].filter((k) => !original.has(k));
    const removed = [...original].filter((k) => !current.has(k));
    const resetChanges = () => setCurrent(new Set(original));

    // One permission cell. A ring marks what changed since the editor opened (green = added, red = removed).
    const cell = (page, action, label, withText = false) => {
        const key = `${page.key}:${action}`;
        const on = isAdminTarget || current.has(key);
        const was = isAdminTarget || original.has(key);
        const ring = on && !was ? 'ring-2 ring-emerald-300 ring-offset-1' : !on && was ? 'ring-2 ring-rose-300 ring-offset-1' : '';
        const title = on && !was ? 'เพิ่มใหม่ (ยังไม่บันทึก)' : !on && was ? 'จะถูกเอาออก (ยังไม่บันทึก)' : undefined;
        if (withText) {
            return (
                <button
                    key={action}
                    type="button"
                    onClick={() => toggle(page, action)}
                    disabled={isAdminTarget || saving}
                    aria-pressed={on}
                    aria-label={`${page.label} ${label}`}
                    title={title}
                    className={`inline-flex items-center gap-1 h-7 pl-1.5 pr-2.5 rounded-full text-xs font-bold border transition-all disabled:cursor-not-allowed ${ring} ${on ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-white border-slate-200 text-slate-400 hover:border-violet-300 hover:text-violet-600'}`}
                >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${on ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white' : 'bg-slate-100'}`}>
                        {on && <Check size={10} strokeWidth={4} />}
                    </span>
                    {label}
                </button>
            );
        }
        return (
            <motion.button
                type="button"
                whileTap={{ scale: 0.85 }}
                onClick={() => toggle(page, action)}
                disabled={isAdminTarget || saving}
                aria-pressed={on}
                aria-label={`${page.label} ${label}`}
                title={title}
                className={`mx-auto w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:cursor-not-allowed ${ring} ${on ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-sm shadow-violet-300/50' : 'bg-white border-2 border-slate-200 hover:border-violet-400'}`}
            >
                {on && <Check size={14} strokeWidth={3.5} />}
            </motion.button>
        );
    };

    const groupStats = (g) => {
        const ps = (catalog?.pages || []).filter((p) => p.group === g);
        const total = ps.reduce((n, p) => n + p.actions.length, 0);
        const on = isAdminTarget ? total : ps.reduce((n, p) => n + p.actions.filter((a) => current.has(`${p.key}:${a.key}`)).length, 0);
        return { on, total };
    };

    const pct = totalPossible ? Math.round(((isAdminTarget ? totalPossible : current.size) / totalPossible) * 100) : 0;

    let lastGroup = null;

    return (
        <>
        <ModalShell onBackdrop={requestClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-2xl shadow-violet-900/20 overflow-hidden"
                role="dialog" aria-modal="true" aria-label="ตั้งค่าสิทธิ์"
            >
                {/* Header */}
                <div className={`relative overflow-hidden px-6 py-5 text-white bg-gradient-to-br ${isDefaults ? 'from-indigo-600 via-sky-600 to-teal-500' : 'from-violet-600 via-indigo-600 to-fuchsia-600'}`}>
                    <div className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
                    <div className="pointer-events-none absolute -bottom-20 left-1/4 w-64 h-40 rounded-full bg-white/10 blur-3xl" />
                    <div className="relative flex items-center gap-4">
                        {isDefaults ? (
                            <div className="w-12 h-12 rounded-2xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center shrink-0"><UserPlus size={24} /></div>
                        ) : avatar && <div className="shrink-0 rounded-2xl ring-2 ring-white/40 overflow-hidden">{avatar}</div>}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-black text-xl tracking-tight truncate">
                                {isDefaults ? 'สิทธิ์ตั้งต้นของผู้ใช้ใหม่' : `สิทธิ์ของ ${target.Name || target.Username || target.EmpCode}`}
                            </h3>
                            <p className="text-white/75 text-xs mt-0.5 truncate">
                                {isDefaults
                                    ? 'แม่แบบที่คน login ครั้งแรกจะได้รับ · ไม่กระทบสิทธิ์ของคนที่มีอยู่แล้ว'
                                    : `รหัส ${target.EmpCode} · ${target.Role}${target.Sect ? ` · ${target.Sect}` : ''}`}
                            </p>
                        </div>
                        {/* progress ring */}
                        {catalog && (
                            <div className="hidden sm:block relative w-14 h-14 shrink-0" title={`${isAdminTarget ? totalPossible : current.size} / ${totalPossible} สิทธิ์`}>
                                <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                                    <motion.circle cx="18" cy="18" r="15.5" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"
                                        strokeDasharray={97.4} initial={false} animate={{ strokeDashoffset: 97.4 * (1 - pct / 100) }} transition={{ duration: 0.4 }} />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center text-xs font-black tabular-nums">{pct}%</div>
                            </div>
                        )}
                        <button onClick={requestClose} className="p-2 hover:bg-white/15 rounded-full shrink-0 self-start" aria-label="ปิด (Esc)" title="ปิด (Esc)"><X size={20} /></button>
                    </div>
                </div>

                {isAdminTarget && (
                    <div className="px-5 py-3 bg-violet-50 text-violet-700 text-sm font-bold flex items-center gap-2 border-b border-violet-100">
                        <ShieldCheck size={16} /> Admin ทำได้ทุกอย่างอยู่แล้ว ไม่ต้องตั้งสิทธิ์ (ถ้าต้องการจำกัด ให้เปลี่ยน Role เป็น Staff ก่อน)
                    </div>
                )}

                {isDefaults && (
                    <div className="px-5 py-2.5 bg-sky-50 border-b border-sky-100 text-sky-800 text-xs flex items-start gap-2">
                        <Info size={14} className="shrink-0 mt-0.5" />
                        <span>
                            หน้านี้ตั้ง<b>แม่แบบ</b>สำหรับคนที่ยังไม่เคยเข้าระบบ · ถ้าจะแก้สิทธิ์<b>คนที่มีอยู่แล้ว</b> ใช้ปุ่ม <b>"ตั้งสิทธิ์"</b> ในแถวของคนนั้น
                            หรือ <b>"ใครมีสิทธิ์นี้"</b> เพื่อแก้ทีละหน้าให้หลายคนพร้อมกัน
                        </span>
                    </div>
                )}

                {/* Toolbar */}
                {!loading && catalog && (
                    <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                                type="search"
                                value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาหน้า..."
                                aria-label="ค้นหาหน้า"
                                className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                            />
                        </div>
                        {!isAdminTarget && (
                            <>
                                <button onClick={useDefaults} className="flex items-center gap-1.5 px-3 h-9 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-violet-600" title="ตั้งตามสิทธิ์ตั้งต้น (ยังไม่บันทึกจนกว่าจะกดบันทึก)">
                                    <RotateCcw size={14} /> {isDefaults ? 'คืนค่าเริ่มต้นของระบบ' : 'ใช้ค่าตั้งต้น'}
                                </button>
                                <button onClick={clearAll} className="flex items-center gap-1.5 px-3 h-9 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200" title="ล้างสิทธิ์ทั้งหมด">
                                    <Eraser size={14} /> ล้างทั้งหมด
                                </button>
                                {!isDefaults && (
                                    <label className="flex items-center gap-1.5 px-3 h-9 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50">
                                        <Copy size={14} />
                                        <select value={copyFrom} onChange={(e) => doCopy(e.target.value)} className="bg-transparent outline-none max-w-[150px]" aria-label="คัดลอกสิทธิ์จากผู้ใช้อื่น">
                                            <option value="">คัดลอกจาก...</option>
                                            {users.filter((u) => u.EmpCode !== target.EmpCode && u.Role !== 'Admin').map((u) => (
                                                <option key={u.EmpCode} value={u.EmpCode}>{u.Name || u.Username || u.EmpCode}</option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                            </>
                        )}
                        {!isDefaults && (
                            <button onClick={loadAudit} className={`flex items-center gap-1.5 px-3 h-9 border rounded-xl text-xs font-bold ${showAudit ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                <History size={14} /> ประวัติ
                            </button>
                        )}
                    </div>
                )}

                {error && (
                    <div className="mx-5 mt-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm font-medium flex items-center justify-between gap-3">
                        <span>{error}</span>
                        {!catalog && <button onClick={load} className="font-bold underline shrink-0">ลองใหม่</button>}
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-auto px-5 pb-3">
                    {loading ? (
                        <div className="py-4 space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />)}</div>
                    ) : !catalog ? (
                        <div className="text-center py-16 text-slate-400">โหลดรายการสิทธิ์ไม่ได้</div>
                    ) : showAudit && !isDefaults ? (
                        <div className="py-3">
                            {audit === null ? <div className="text-center py-10 text-slate-400">กำลังโหลด...</div>
                                : audit.length === 0 ? <div className="text-center py-10 text-slate-400">ยังไม่มีประวัติการเปลี่ยนสิทธิ์</div>
                                    : (
                                        <ol className="relative border-l-2 border-slate-100 ml-2 space-y-1">
                                            {audit.map((a) => (
                                                <li key={a.ID} className="relative pl-5 py-1.5 text-sm">
                                                    <span className={`absolute -left-[7px] top-3 w-3 h-3 rounded-full ring-2 ring-white ${a.Change === 'GRANT' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${a.Change === 'GRANT' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                                            {a.Change === 'GRANT' ? 'เพิ่ม' : 'ถอน'}
                                                        </span>
                                                        <span className="text-slate-700 font-bold flex-1">{labelOf(`${a.PageKey}:${a.Action}`)}</span>
                                                        <span className="text-xs text-slate-400">โดย {a.ChangedBy || '-'} · <span className="font-mono">{fmtTime(a.ChangedAt)}</span></span>
                                                    </div>
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white/95 backdrop-blur z-10">
                                <tr className="text-slate-500 text-xs border-b border-slate-200">
                                    <th className="py-2.5 pr-3 font-bold">หน้า</th>
                                    {COMMON.map((a) => {
                                        const { pages, all } = columnState(a);
                                        const some = !all && pages.some((p) => current.has(`${p.key}:${a}`));
                                        return (
                                            <th key={a} className="py-2 px-1 font-bold text-center w-16">
                                                <div>{COMMON_LABEL[a]}</div>
                                                <ColumnToggle
                                                    state={isAdminTarget || all ? 'all' : some ? 'some' : 'none'}
                                                    onClick={() => toggleColumn(a)}
                                                    disabled={isAdminTarget || pages.length === 0 || saving}
                                                    label={`ทั้งคอลัมน์ ${COMMON_LABEL[a]}`}
                                                />
                                            </th>
                                        );
                                    })}
                                    <th className="py-2.5 pl-3 font-bold">สิทธิ์เฉพาะหน้า</th>
                                    <th className="py-2.5 pl-2 font-bold text-center w-20">ทั้งแถว</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visiblePages.length === 0 && (
                                    <tr><td colSpan={7} className="py-12 text-center text-slate-400">ไม่พบหน้าที่ค้นหา</td></tr>
                                )}
                                {visiblePages.map((p) => {
                                    const header = p.group !== lastGroup;
                                    lastGroup = p.group;
                                    const extras = p.actions.filter((a) => !COMMON.includes(a.key));
                                    const onCount = isAdminTarget ? p.actions.length : p.actions.filter((a) => current.has(`${p.key}:${a.key}`)).length;
                                    const rowOn = onCount === p.actions.length;
                                    const gs = header ? groupStats(p.group) : null;
                                    return (
                                        <React.Fragment key={p.key}>
                                            {header && (
                                                <tr>
                                                    <td colSpan={7} className="pt-5 pb-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[11px] font-black text-violet-600 uppercase tracking-wider">{p.group}</span>
                                                            <span className="flex-1 h-px bg-gradient-to-r from-violet-200 to-transparent" />
                                                            <span className="text-[10px] font-bold text-slate-400 tabular-nums">{gs.on}/{gs.total}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr className={`border-b border-slate-100 transition-colors ${onCount ? 'hover:bg-violet-50/40' : 'hover:bg-slate-50'}`}>
                                                <td className="py-2 pr-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-1.5 h-6 rounded-full ${rowOn ? 'bg-violet-500' : onCount ? 'bg-amber-400' : 'bg-slate-200'}`} />
                                                        <span className={`text-sm font-bold ${onCount ? 'text-slate-800' : 'text-slate-400'}`}>{p.label}</span>
                                                        {!p.defaultView && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">Admin เดิม</span>}
                                                    </div>
                                                </td>
                                                {COMMON.map((a) => (
                                                    <td key={a} className="py-2 px-1 text-center">
                                                        {p.actions.some((x) => x.key === a) ? cell(p, a, COMMON_LABEL[a]) : <span className="text-slate-200">—</span>}
                                                    </td>
                                                ))}
                                                <td className="py-2 pl-3">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {extras.map((a) => cell(p, a.key, a.label, true))}
                                                    </div>
                                                </td>
                                                <td className="py-2 pl-2 text-center">
                                                    {!isAdminTarget && (
                                                        <button type="button" onClick={() => rowAll(p)} disabled={saving}
                                                            className={`px-2.5 h-7 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 ${rowOn ? 'text-rose-500 hover:bg-rose-50' : 'text-violet-600 hover:bg-violet-100'}`}>
                                                            {rowOn ? 'ล้าง' : 'ให้ทั้งหมด'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
                    <div className="flex items-center gap-3 text-xs text-slate-500 min-w-0">
                        {isAdminTarget ? 'ทุกสิทธิ์' : (
                            <>
                                <span>เลือกแล้ว <b className="text-slate-700 tabular-nums">{current.size}</b> / {totalPossible}</span>
                                <AnimatePresence>
                                    {dirty && (
                                        <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                                            {added.length > 0 && <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-black tabular-nums">+{added.length}</span>}
                                            {removed.length > 0 && <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 font-black tabular-nums">−{removed.length}</span>}
                                            <span className="text-amber-600 font-bold">ยังไม่บันทึก</span>
                                            <button type="button" onClick={resetChanges} disabled={saving} className="ml-1 text-slate-400 hover:text-slate-700 underline underline-offset-2">ย้อนกลับ</button>
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={requestClose} disabled={saving} className="px-4 h-10 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 disabled:opacity-50">
                            {isAdminTarget ? 'ปิด' : 'ยกเลิก'}
                        </button>
                        {!isAdminTarget && (
                            <button onClick={save} disabled={!dirty || saving || loading || !catalog}
                                className="flex items-center gap-2 px-5 h-10 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-xl shadow-md shadow-violet-500/25 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:shadow-none">
                                {saving && <Loader2 size={15} className="animate-spin" />}
                                {saving ? 'กำลังบันทึก...' : dirty ? `บันทึก (${added.length + removed.length})` : 'บันทึก'}
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </ModalShell>
        <AlertModal
            isOpen={confirmDiscard}
            type="danger"
            title="ปิดโดยไม่บันทึก?"
            message="มีการแก้ไขสิทธิ์ที่ยังไม่ได้บันทึก ถ้าปิดตอนนี้การแก้ไขจะหายไป"
            confirmText="ปิดโดยไม่บันทึก"
            cancelText="กลับไปแก้ไข"
            onConfirm={() => { setConfirmDiscard(false); onClose?.(); }}
            onCancel={() => setConfirmDiscard(false)}
        />
        </>
    );
};

// ── What "log" mode would have blocked (helps decide when it is safe to switch to enforce) ──
export const PermissionLogModal = ({ onClose }) => {
    const [data, setData] = useState(null);
    const [catalog, setCatalog] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const load = useCallback(async () => {
        setError('');
        try {
            const [d, cat] = await Promise.all([getJson('/permissions/log-summary'), loadCatalog().catch(() => null)]);
            setData(d);
            if (cat) setCatalog(cat);
        } catch (e) {
            setError(e.message);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const clearAll = async () => {
        setConfirmClear(false);
        setBusy(true);
        try {
            const res = await fetch(API_BASE + '/permissions/log-summary', { method: 'DELETE' });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || d.message || 'HTTP ' + res.status);
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const reasonText = { 'no-permission': 'ไม่มีสิทธิ์', 'no-token': 'ไม่ได้ login / ไม่มี token', 'user-not-found': 'ไม่พบผู้ใช้', 'lookup-failed': 'ตรวจสิทธิ์ไม่สำเร็จ' };
    const pageLabel = (key) => (catalog && catalog.pages.find((p) => p.key === key)?.label) || key;
    const actionLabel = (key) => (catalog && catalog.actionLabels && catalog.actionLabels[key]) || key;

    return (
        <>
        <ModalShell onBackdrop={onClose}>
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                className="w-full max-w-4xl max-h-[88vh] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden border border-white/20"
                role="dialog" aria-modal="true" aria-label="รายงานการตรวจสิทธิ์">
                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex items-start justify-between">
                    <div>
                        <h3 className="font-black text-xl tracking-tight">รายงานการตรวจสิทธิ์</h3>
                        <p className="text-white/80 text-xs mt-0.5">
                            โหมดปัจจุบัน: <b>{data?.mode || '...'}</b>
                            {data?.since ? ' · สะสมตั้งแต่ ' + fmtTime(data.since) + ' (เก็บในฐานข้อมูล ไม่หายเมื่อรีสตาร์ท)' : ''}
                            {data?.mode === 'log' && ' · โหมด log ยังไม่บล็อกใคร แค่บันทึกว่า "ถ้าบังคับจริงจะบล็อกอะไร"'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={load} disabled={busy} className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-bold disabled:opacity-50">รีเฟรช</button>
                        <button onClick={() => setConfirmClear(true)} disabled={busy || !data || data.items.length === 0} className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-bold disabled:opacity-50">ล้างรายงาน</button>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full" aria-label="ปิด"><X size={20} /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto p-5">
                    {error ? <div className="text-rose-600 text-sm">{error}</div>
                        : !data ? <div className="text-center py-10 text-slate-400">Loading...</div>
                            : data.items.length === 0 ? <div className="text-center py-10 text-slate-400">ยังไม่มีรายการที่จะถูกบล็อก</div>
                                : (
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                                <th className="py-2 pr-3">ผู้ใช้</th><th className="py-2 pr-3">ต้องมีสิทธิ์</th><th className="py-2 pr-3">สาเหตุ</th><th className="py-2 pr-3 text-right">ครั้ง</th><th className="py-2 pr-3">ครั้งแรก</th><th className="py-2">ล่าสุด</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.items.map((r, i) => (
                                                <tr key={i} className="border-b border-slate-100">
                                                    <td className="py-2 pr-3"><div className="text-sm font-bold text-slate-700">{r.name || (r.empCode === '-' ? '(ไม่ได้ login)' : '-')}</div><div className="font-mono text-[11px] text-slate-400">{r.empCode}</div></td>
                                                    <td className="py-2 pr-3"><div className="font-bold text-slate-700">{pageLabel(r.page)} · {actionLabel(r.action)}</div><div className="font-mono text-[11px] text-slate-400">{r.page}:{r.action}</div></td>
                                                    <td className="py-2 pr-3 text-slate-600">{reasonText[r.reason] || r.reason}</td>
                                                    <td className="py-2 pr-3 text-right font-bold">{r.count}</td>
                                                    <td className="py-2 pr-3 font-mono text-xs text-slate-400">{fmtTime(r.first)}</td>
                                                    <td className="py-2 font-mono text-xs text-slate-400">{fmtTime(r.last)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                </div>
            </motion.div>
        </ModalShell>
        <AlertModal
            isOpen={confirmClear}
            type="danger"
            title="ล้างรายงานทั้งหมด?"
            message="รายงานจะถูกลบและเริ่มนับใหม่ (ใช้หลังแก้สิทธิ์แล้ว เพื่อดูว่ายังมีอะไรถูกบล็อกอีกไหม)"
            confirmText="ล้างรายงาน"
            cancelText="ยกเลิก"
            onConfirm={clearAll}
            onCancel={() => setConfirmClear(false)}
        />
        </>
    );
};

export default PermissionEditorModal;

// Employee photo: saved AD picture URL, else the standard DCI picture by EmpCode; initials if it cannot load.
const EMP_PIC_BASE = 'http://dcidmc.dci.daikin.co.jp/PICTURE';
const EmpAvatar = ({ pic, empCode, name, size = 32 }) => {
    const src = pic || (empCode ? `${EMP_PIC_BASE}/${encodeURIComponent(empCode)}.jpg` : '');
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    const style = { width: size, height: size };
    if (!src || failed) {
        const initials = String(name || empCode || '?').trim().slice(0, 2).toUpperCase();
        return <div style={style} className="shrink-0 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-black">{initials}</div>;
    }
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} style={style} className="shrink-0 rounded-lg object-cover bg-slate-100 ring-1 ring-slate-200" />;
};

// On/off switch used in the holders grid. Shows a spinner in the knob while that person is saving.
const PermSwitch = ({ checked, onChange, disabled, busy, label }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:cursor-wait ${checked ? 'bg-gradient-to-r from-violet-500 to-indigo-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]' : 'bg-slate-200 hover:bg-slate-300'}`}
    >
        <motion.span
            layout
            transition={{ type: 'spring', stiffness: 700, damping: 38 }}
            className={`h-5 w-5 rounded-full bg-white shadow-md flex items-center justify-center ${checked ? 'ml-[22px]' : 'ml-0.5'}`}
        >
            {busy ? <Loader2 size={11} className="animate-spin text-violet-500" />
                : checked ? <Check size={11} strokeWidth={3.5} className="text-violet-600" /> : null}
        </motion.span>
    </button>
);

// Header checkbox for a whole column: none / some / all of the people shown.
const ColumnToggle = ({ state, onClick, disabled, label }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={state === 'all' ? 'เอาออกจากทุกคนที่แสดง' : 'ให้ทุกคนที่แสดง'}
        aria-label={label}
        className={`mx-auto mt-1.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${state === 'none' ? 'border-slate-300 bg-white hover:border-violet-400' : 'border-violet-500 bg-violet-500 text-white hover:bg-violet-600'}`}
    >
        {state === 'all' ? <Check size={12} strokeWidth={3.5} /> : state === 'some' ? <Minus size={12} strokeWidth={3.5} /> : null}
    </button>
);

const FILTERS = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'has', label: 'มีสิทธิ์' },
    { id: 'none', label: 'ไม่มีสิทธิ์' },
];

// "Who has what on this page?" — pick a page on the left, switch each person's actions on the right.
// Admins always pass every check, so they are not listed here.
// Changes save immediately (optimistically shown, reverted if the server refuses).
export const PermissionHoldersModal = ({ onClose }) => {
    const [catalog, setCatalog] = useState(null);
    const [pageKey, setPageKey] = useState('');
    const [pageSearch, setPageSearch] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [busyUsers, setBusyUsers] = useState(() => new Set());
    const [bulk, setBulk] = useState(null); // { label, done, total }
    const [confirm, setConfirm] = useState(null);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

    const flash = (text) => {
        clearTimeout(toastTimer.current);
        setToast({ text, id: Date.now() });
        toastTimer.current = setTimeout(() => setToast(null), 1800);
    };
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    useEffect(() => {
        loadCatalog()
            .then((cat) => { setCatalog(cat); if (cat.pages.length) setPageKey(cat.pages[0].key); })
            .catch((e) => setError(e.message));
        // what a brand-new user gets — shown per page so the two tools read as one system
        getJson('/permissions/defaults').then((d) => setDefaults(new Set(d.permissions || []))).catch(() => {});
    }, []);
    const [defaults, setDefaults] = useState(null);

    // Esc closes (unless a confirm box is open — it handles its own buttons)
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !confirm) onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, confirm]);

    useEffect(() => {
        if (!pageKey) { setData(null); return undefined; }
        let cancelled = false;
        setLoading(true);
        setError('');
        getJson(`/permissions/holders?page=${encodeURIComponent(pageKey)}`)
            .then((d) => { if (!cancelled) setData(d); })
            .catch((e) => { if (!cancelled) { setData(null); setError(e.message); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [pageKey]);

    const users = data?.users || [];
    const actions = data?.actions || [];
    const hasView = actions.some((a) => a.key === 'view');

    // View is required for every other action: turning an action on also turns view on;
    // turning view off turns off the rest of this page.
    const nextActions = (has, action, want) => {
        const s = new Set(has);
        if (want) {
            s.add(action);
            if (action !== 'view' && hasView) s.add('view');
        } else if (action === 'view') {
            s.clear();
        } else {
            s.delete(action);
        }
        return [...s];
    };

    const patchUser = (pk, empCode, acts) => setData((d) => (d && d.page === pk
        ? { ...d, users: d.users.map((x) => (x.EmpCode === empCode ? { ...x, actions: acts } : x)) }
        : d));

    // Read the person's whole list, replace only this page's part, save the whole list.
    const saveUser = async (u, acts) => {
        const pk = pageKey;
        const before = u.actions;
        setBusyUsers((s) => new Set(s).add(u.EmpCode));
        patchUser(pk, u.EmpCode, acts);
        try {
            const cur = await getJson(`/permissions/users/${encodeURIComponent(u.EmpCode)}`);
            const set = new Set(cur.permissions || []);
            actions.forEach((a) => set.delete(`${pk}:${a.key}`));
            acts.forEach((a) => set.add(`${pk}:${a}`));
            const res = await fetch(`${API_BASE}/permissions/users/${encodeURIComponent(u.EmpCode)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permissions: [...set] }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || d.message || `HTTP ${res.status}`);
            return true;
        } catch (e) {
            patchUser(pk, u.EmpCode, before);
            setError(`${u.Name || u.EmpCode}: ${e.message}`);
            return false;
        } finally {
            setBusyUsers((s) => { const n = new Set(s); n.delete(u.EmpCode); return n; });
        }
    };

    const setCell = async (u, action, want) => {
        setError('');
        const ok = await saveUser(u, nextActions(u.actions, action, want));
        if (ok) flash(`${want ? 'ให้' : 'เอาออก'}สิทธิ์ "${actions.find((a) => a.key === action)?.label || action}" · ${u.Name || u.EmpCode}`);
    };

    const toggleRowAll = async (u) => {
        setError('');
        const full = actions.every((a) => u.actions.includes(a.key));
        const ok = await saveUser(u, full ? [] : actions.map((a) => a.key));
        if (ok) flash(full ? `เอาสิทธิ์หน้านี้ออกทั้งหมด · ${u.Name || u.EmpCode}` : `ให้ทุกสิทธิ์ของหน้านี้ · ${u.Name || u.EmpCode}`);
    };

    const q = search.trim().toLowerCase();
    const visible = users.filter((u) => {
        if (q && !`${u.Name || ''} ${u.Username || ''} ${u.EmpCode}`.toLowerCase().includes(q)) return false;
        if (filter === 'has') return u.actions.length > 0;
        if (filter === 'none') return u.actions.length === 0;
        return true;
    });

    const columnState = (key) => {
        const n = visible.filter((u) => u.actions.includes(key)).length;
        return n === 0 ? 'none' : n === visible.length ? 'all' : 'some';
    };

    // Whole column for everyone shown — confirm first, then save one person at a time.
    const askColumn = (a) => {
        const grant = columnState(a.key) !== 'all';
        const targets = visible.filter((u) => u.actions.includes(a.key) !== grant);
        if (!targets.length) return;
        setConfirm({
            type: grant ? 'confirm' : 'danger',
            title: grant ? `ให้สิทธิ์ "${a.label}" ${targets.length} คน?` : `เอาสิทธิ์ "${a.label}" ออก ${targets.length} คน?`,
            message: `หน้า ${data.label} · มีผลทันที`
                + (grant && a.key !== 'view' && hasView ? ' (จะให้สิทธิ์ "ดู" ด้วย)' : '')
                + (!grant && a.key === 'view' ? ' (จะเอาทุกสิทธิ์ของหน้านี้ออกด้วย)' : ''),
            confirmText: grant ? 'ให้สิทธิ์' : 'เอาออก',
            onConfirm: async () => {
                setConfirm(null);
                setError('');
                setBulk({ label: a.label, done: 0, total: targets.length });
                let ok = 0;
                for (const u of targets) {
                    if (await saveUser(u, nextActions(u.actions, a.key, grant))) ok += 1;
                    setBulk((b) => b && { ...b, done: b.done + 1 });
                }
                setBulk(null);
                flash(`${grant ? 'ให้' : 'เอาออก'}สิทธิ์ "${a.label}" สำเร็จ ${ok}/${targets.length} คน`);
            },
        });
    };

    const pq = pageSearch.trim().toLowerCase();
    const groups = catalog ? [...new Set(catalog.pages.map((p) => p.group))] : [];
    const currentPage = catalog?.pages.find((p) => p.key === pageKey);
    const withAny = users.filter((u) => u.actions.length > 0).length;
    const locked = !!bulk;

    return (
        <ModalShell onBackdrop={onClose}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="relative w-full max-w-6xl h-[90vh] md:h-[86vh] flex flex-col bg-white rounded-3xl shadow-2xl shadow-violet-900/20 overflow-hidden"
                role="dialog" aria-modal="true" aria-label="ใครมีสิทธิ์อะไรบ้าง">

                {/* header */}
                <div className="relative overflow-hidden px-6 py-5 bg-gradient-to-br from-violet-600 via-indigo-600 to-fuchsia-600 text-white">
                    <div className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
                    <div className="pointer-events-none absolute -bottom-20 left-1/3 w-64 h-40 rounded-full bg-fuchsia-300/20 blur-3xl" />
                    <div className="relative flex items-start gap-4">
                        <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur items-center justify-center shrink-0">
                            <ShieldCheck size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-black text-xl tracking-tight">ใครมีสิทธิ์อะไรบ้าง</h3>
                            <p className="text-white/75 text-xs mt-0.5">เลือกหน้าทางซ้าย แล้วเปิด/ปิดสิทธิ์ของแต่ละคน · บันทึกทันที ไม่ต้องกดบันทึก</p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/15 transition-colors shrink-0" aria-label="ปิด (Esc)" title="ปิด (Esc)"><X size={20} /></button>
                    </div>
                </div>

                <div className="flex flex-1 min-h-0 flex-col md:flex-row">
                    {/* left: pages */}
                    <aside className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/60 flex flex-col min-h-0">
                        <div className="p-3">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    value={pageSearch}
                                    onChange={(e) => setPageSearch(e.target.value)}
                                    placeholder="ค้นหาหน้า"
                                    aria-label="ค้นหาหน้า"
                                    className="w-full h-9 pl-8 pr-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                                />
                            </div>
                        </div>
                        <div className="overflow-y-auto px-2 pb-3 max-h-44 md:max-h-none flex-1">
                            {!catalog ? (
                                <div className="space-y-2 px-1">{[...Array(8)].map((_, i) => <div key={i} className="h-8 rounded-lg bg-slate-200/70 animate-pulse" />)}</div>
                            ) : groups.map((g) => {
                                const items = catalog.pages.filter((p) => p.group === g && (!pq || p.label.toLowerCase().includes(pq) || p.key.includes(pq)));
                                if (!items.length) return null;
                                return (
                                    <div key={g} className="mb-2">
                                        <div className="px-2 pt-2 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">{g}</div>
                                        {items.map((p) => {
                                            const on = pageKey === p.key;
                                            return (
                                                <button
                                                    key={p.key}
                                                    type="button"
                                                    onClick={() => { if (!locked) setPageKey(p.key); }}
                                                    disabled={locked && !on}
                                                    aria-current={on ? 'page' : undefined}
                                                    className={`relative w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-50 ${on ? 'text-white font-bold' : 'text-slate-600 hover:bg-white hover:text-violet-700'}`}
                                                >
                                                    {on && (
                                                        <motion.span layoutId="holders-page-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                                                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md shadow-violet-500/30" />
                                                    )}
                                                    <span className="relative flex-1 truncate">{p.label}</span>
                                                    <span className={`relative text-[10px] font-bold tabular-nums ${on ? 'text-white/70' : 'text-slate-300'}`}>{p.actions.length}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </aside>

                    {/* right: people x actions */}
                    <section className="flex-1 min-w-0 flex flex-col min-h-0">
                        <div className="px-5 pt-4 pb-3 border-b border-slate-100 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-lg text-slate-800 truncate">{currentPage?.label || '—'}</span>
                                        {currentPage?.route && <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-mono text-[10px]">{currentPage.route}</span>}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span>{data ? <>มีสิทธิ์ <b className="text-violet-600">{withAny}</b> จาก {users.length} คน (ไม่นับ Admin)</> : ' '}</span>
                                        {defaults && data && (() => {
                                            const got = actions.filter((a) => defaults.has(`${pageKey}:${a.key}`));
                                            return (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-bold"
                                                    title="สิทธิ์ที่คน login ครั้งแรกจะได้ในหน้านี้ — แก้ได้ที่ปุ่ม &quot;สิทธิ์ตั้งต้นผู้ใช้ใหม่&quot;">
                                                    <UserPlus size={11} /> ผู้ใช้ใหม่ได้: {got.length ? got.map((a) => a.label).join(', ') : 'ไม่มี'}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex p-0.5 rounded-xl bg-slate-100" role="tablist" aria-label="กรองคน">
                                        {FILTERS.map((f) => (
                                            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                                                className={`relative px-3 h-8 rounded-lg text-xs font-bold transition-colors ${filter === f.id ? 'text-violet-700' : 'text-slate-500 hover:text-slate-700'}`}>
                                                {filter === f.id && <motion.span layoutId="holders-filter" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                                                <span className="relative">{f.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="search"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="ค้นหาชื่อหรือรหัส"
                                            aria-label="ค้นหาคน"
                                            className="w-48 h-9 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* per-action summary */}
                            {data && users.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {actions.map((a) => {
                                        const n = users.filter((u) => u.actions.includes(a.key)).length;
                                        const pct = users.length ? Math.round((n / users.length) * 100) : 0;
                                        return (
                                            <div key={a.key} className="min-w-[96px] px-3 py-1.5 rounded-xl border border-slate-100 bg-gradient-to-b from-white to-slate-50">
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <span className="text-[11px] font-bold text-slate-600">{a.label}</span>
                                                    <span className="text-[11px] font-black tabular-nums text-violet-600">{n}<span className="text-slate-300 font-bold">/{users.length}</span></span>
                                                </div>
                                                <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                                                    <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <AnimatePresence>
                            {error && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                    className="mx-5 mt-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm flex items-center gap-2">
                                    <span className="flex-1">{error}</span>
                                    <button type="button" onClick={() => setError('')} className="p-1 rounded hover:bg-rose-100" aria-label="ปิดข้อความ"><X size={14} /></button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex-1 overflow-auto relative">
                            {loading && !data ? (
                                <div className="p-5 space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}</div>
                            ) : !data ? null : users.length === 0 ? (
                                <div className="text-slate-400 text-sm py-16 text-center">ยังไม่มีผู้ใช้ (Staff) ในระบบ</div>
                            ) : visible.length === 0 ? (
                                <div className="text-slate-400 text-sm py-16 text-center">
                                    <Search className="mx-auto mb-2 text-slate-300" size={28} />
                                    ไม่พบคนที่ตรงกับเงื่อนไข
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur">
                                        <tr className="text-xs text-slate-500 border-b border-slate-200">
                                            <th className="text-left py-2.5 px-5 font-bold sticky left-0 bg-white/95">
                                                ผู้ใช้ <span className="font-normal text-slate-400">({visible.length})</span>
                                            </th>
                                            {actions.map((a) => (
                                                <th key={a.key} className="py-2 px-2 font-bold text-center min-w-[78px]">
                                                    <div>{a.label}</div>
                                                    <ColumnToggle state={columnState(a.key)} onClick={() => askColumn(a)} disabled={locked || busyUsers.size > 0} label={`สลับสิทธิ์ ${a.label} ของทุกคนที่แสดง`} />
                                                </th>
                                            ))}
                                            {actions.length > 1 && <th className="py-2.5 px-3 font-bold text-center w-20">ทั้งหน้า</th>}
                                        </tr>
                                    </thead>
                                    <motion.tbody key={pageKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                                        {visible.map((u) => {
                                            const busy = busyUsers.has(u.EmpCode);
                                            const full = actions.every((a) => u.actions.includes(a.key));
                                            const none = u.actions.length === 0;
                                            return (
                                                <tr key={u.EmpCode} className={`group border-b border-slate-100 transition-colors ${none ? 'hover:bg-slate-50' : 'hover:bg-violet-50/50'}`}>
                                                    <td className="py-2.5 px-5 sticky left-0 bg-white group-hover:bg-violet-50/50 transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative">
                                                                <EmpAvatar pic={u.EmpPic} empCode={u.EmpCode} name={u.Name || u.Username} size={36} />
                                                                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${full ? 'bg-violet-500' : none ? 'bg-slate-300' : 'bg-amber-400'}`}
                                                                    title={full ? 'มีทุกสิทธิ์ของหน้านี้' : none ? 'ไม่มีสิทธิ์หน้านี้' : 'มีบางสิทธิ์'} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className={`font-bold whitespace-nowrap ${none ? 'text-slate-400' : 'text-slate-700'}`}>{u.Name || u.Username || '-'}</div>
                                                                <div className="font-mono text-[11px] text-slate-400">{u.EmpCode}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    {actions.map((a) => (
                                                        <td key={a.key} className="py-2.5 px-2 text-center">
                                                            <div className="flex justify-center">
                                                                <PermSwitch
                                                                    checked={u.actions.includes(a.key)}
                                                                    busy={busy}
                                                                    disabled={busy || locked}
                                                                    onChange={(want) => setCell(u, a.key, want)}
                                                                    label={`${u.Name || u.EmpCode} ${a.label}`}
                                                                />
                                                            </div>
                                                        </td>
                                                    ))}
                                                    {actions.length > 1 && (
                                                        <td className="py-2.5 px-3 text-center">
                                                            <button type="button" onClick={() => toggleRowAll(u)} disabled={busy || locked}
                                                                className={`px-2.5 h-7 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 ${full ? 'text-rose-500 hover:bg-rose-50' : 'text-violet-600 hover:bg-violet-100'}`}>
                                                                {full ? 'ล้าง' : 'ให้ทั้งหมด'}
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </motion.tbody>
                                </table>
                            )}

                            {/* bulk progress */}
                            <AnimatePresence>
                                {bulk && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        className="absolute inset-0 z-20 bg-white/70 backdrop-blur-sm flex items-center justify-center">
                                        <div className="w-64 p-4 rounded-2xl bg-white shadow-xl border border-slate-100 text-center">
                                            <Loader2 className="mx-auto mb-2 animate-spin text-violet-500" size={22} />
                                            <div className="text-sm font-bold text-slate-700">กำลังบันทึก "{bulk.label}"</div>
                                            <div className="text-xs text-slate-400 mt-0.5 tabular-nums">{bulk.done} / {bulk.total} คน</div>
                                            <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                <motion.div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500" animate={{ width: `${(bulk.done / bulk.total) * 100}%` }} />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div className="px-5 py-2.5 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500" />ครบทุกสิทธิ์</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />บางสิทธิ์</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" />ไม่มีสิทธิ์</span>
                            <span className="sm:ml-auto">เปิดสิทธิ์อื่นจะเปิด "ดู" ให้อัตโนมัติ · ปิด "ดู" จะปิดทุกสิทธิ์ของหน้านี้</span>
                        </div>
                    </section>
                </div>

                {/* saved toast */}
                <AnimatePresence>
                    {toast && (
                        <motion.div key={toast.id} initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
                            className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-slate-900/90 text-white text-xs font-bold shadow-lg flex items-center gap-2 whitespace-nowrap pointer-events-none">
                            <span className="w-4 h-4 rounded-full bg-emerald-400 text-slate-900 flex items-center justify-center"><Check size={11} strokeWidth={3.5} /></span>
                            {toast.text}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            <AlertModal
                isOpen={!!confirm}
                type={confirm?.type}
                title={confirm?.title}
                message={confirm?.message}
                confirmText={confirm?.confirmText}
                cancelText="ยกเลิก"
                onConfirm={() => confirm?.onConfirm()}
                onCancel={() => setConfirm(null)}
            />
        </ModalShell>
    );
};
