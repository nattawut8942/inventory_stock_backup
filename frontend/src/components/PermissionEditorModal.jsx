import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Search, RotateCcw, Copy, History, ShieldCheck, Eraser } from 'lucide-react';
import { motion } from 'motion/react';
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
const loadCatalog = () => {
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

    const checkbox = (page, action, label) => (
        <input
            type="checkbox"
            className="w-4 h-4 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
            checked={isAdminTarget || current.has(`${page.key}:${action}`)}
            disabled={isAdminTarget || saving}
            onChange={() => toggle(page, action)}
            aria-label={`${page.label} ${label}`}
        />
    );

    let lastGroup = null;

    return (
        <>
        <ModalShell onBackdrop={requestClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden border border-white/20"
                role="dialog" aria-modal="true" aria-label="ตั้งค่าสิทธิ์"
            >
                {/* Header */}
                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        {avatar}
                        <div className="min-w-0">
                            <h3 className="font-black text-xl tracking-tight truncate">
                                {isDefaults ? 'สิทธิ์ตั้งต้นของผู้ใช้ใหม่' : `สิทธิ์ของ ${target.Name || target.Username || target.EmpCode}`}
                            </h3>
                            <p className="text-white/80 text-xs mt-0.5 truncate">
                                {isDefaults
                                    ? 'ใช้กับคนที่ login ครั้งแรกจากนี้ไป (ไม่เปลี่ยนสิทธิ์ของคนที่มีอยู่แล้ว)'
                                    : `รหัส ${target.EmpCode} · ${target.Role}${target.Sect ? ` · ${target.Sect}` : ''}`}
                            </p>
                        </div>
                    </div>
                    <button onClick={requestClose} className="p-2 hover:bg-white/10 rounded-full shrink-0" aria-label="ปิด"><X size={20} /></button>
                </div>

                {isAdminTarget && (
                    <div className="px-5 py-3 bg-violet-50 text-violet-700 text-sm font-bold flex items-center gap-2 border-b border-violet-100">
                        <ShieldCheck size={16} /> Admin ทำได้ทุกอย่างอยู่แล้ว ไม่ต้องตั้งสิทธิ์ (ถ้าต้องการจำกัด ให้เปลี่ยน Role เป็น Staff ก่อน)
                    </div>
                )}

                {/* Toolbar */}
                {!loading && catalog && (
                    <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                                value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาหน้า..."
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        {!isAdminTarget && (
                            <>
                                <button onClick={useDefaults} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50" title="ตั้งตามสิทธิ์ตั้งต้น (ยังไม่บันทึกจนกว่าจะกดบันทึก)">
                                    <RotateCcw size={14} /> {isDefaults ? 'คืนค่าเริ่มต้นของระบบ' : 'ใช้ค่าตั้งต้น'}
                                </button>
                                <button onClick={clearAll} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50" title="ล้างสิทธิ์ทั้งหมด">
                                    <Eraser size={14} /> ล้างทั้งหมด
                                </button>
                                {!isDefaults && (
                                    <label className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600">
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
                            <button onClick={loadAudit} className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-bold ${showAudit ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                <History size={14} /> ประวัติ
                            </button>
                        )}
                    </div>
                )}

                {error && (
                    <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-sm font-medium flex items-center justify-between gap-3">
                        <span>{error}</span>
                        {!catalog && <button onClick={load} className="font-bold underline shrink-0">ลองใหม่</button>}
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-auto px-5 py-3">
                    {loading ? (
                        <div className="text-center py-16 text-slate-400">Loading...</div>
                    ) : !catalog ? (
                        <div className="text-center py-16 text-slate-400">โหลดรายการสิทธิ์ไม่ได้</div>
                    ) : showAudit && !isDefaults ? (
                        <div className="space-y-1">
                            {audit === null ? <div className="text-center py-10 text-slate-400">Loading...</div>
                                : audit.length === 0 ? <div className="text-center py-10 text-slate-400">ยังไม่มีประวัติการเปลี่ยนสิทธิ์</div>
                                    : audit.map((a) => (
                                        <div key={a.ID} className="flex items-center gap-3 text-sm py-1.5 border-b border-slate-100">
                                            <span className="font-mono text-xs text-slate-400 w-32 shrink-0">{fmtTime(a.ChangedAt)}</span>
                                            <span className={`px-2 py-0.5 rounded text-[11px] font-black ${a.Change === 'GRANT' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                                {a.Change === 'GRANT' ? 'เพิ่ม' : 'ถอน'}
                                            </span>
                                            <span className="text-slate-700 flex-1">{labelOf(`${a.PageKey}:${a.Action}`)}</span>
                                            <span className="text-xs text-slate-400">โดย {a.ChangedBy || '-'}</span>
                                        </div>
                                    ))}
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white z-10">
                                <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                                    <th className="py-2 pr-3 font-bold">หน้า</th>
                                    {COMMON.map((a) => {
                                        const { pages, all } = columnState(a);
                                        return (
                                            <th key={a} className="py-2 px-2 font-bold text-center w-16">
                                                <label className="flex flex-col items-center gap-1 cursor-pointer" title={`${all ? 'ถอน' : 'ให้'}สิทธิ์ "${COMMON_LABEL[a]}" ทุกหน้าที่แสดงอยู่`}>
                                                    <span>{COMMON_LABEL[a]}</span>
                                                    <input type="checkbox" className="w-3.5 h-3.5 accent-indigo-600" checked={isAdminTarget || (pages.length > 0 && all)} disabled={isAdminTarget || pages.length === 0 || saving} onChange={() => toggleColumn(a)} aria-label={`ทั้งคอลัมน์ ${COMMON_LABEL[a]}`} />
                                                </label>
                                            </th>
                                        );
                                    })}
                                    <th className="py-2 pl-3 font-bold">สิทธิ์เพิ่มเติม</th>
                                    <th className="py-2 pl-2 font-bold text-center w-14">ทั้งแถว</th>
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
                                    const rowOn = isAdminTarget || p.actions.every((a) => current.has(`${p.key}:${a.key}`));
                                    return (
                                        <React.Fragment key={p.key}>
                                            {header && (
                                                <tr><td colSpan={7} className="pt-4 pb-1 text-[11px] font-black text-indigo-500 uppercase tracking-wider">{p.group}</td></tr>
                                            )}
                                            <tr className="border-b border-slate-100 hover:bg-slate-50/70">
                                                <td className="py-2 pr-3 text-sm font-bold text-slate-700">
                                                    {p.label}
                                                    {!p.defaultView && <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Admin เดิม</span>}
                                                </td>
                                                {COMMON.map((a) => (
                                                    <td key={a} className="py-2 px-2 text-center">
                                                        {p.actions.some((x) => x.key === a) ? checkbox(p, a, COMMON_LABEL[a]) : <span className="text-slate-200">—</span>}
                                                    </td>
                                                ))}
                                                <td className="py-2 pl-3">
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                                        {extras.map((a) => (
                                                            <label key={a.key} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
                                                                {checkbox(p, a.key, a.label)} {a.label}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="py-2 pl-2 text-center">
                                                    <input type="checkbox" className="w-4 h-4 accent-violet-600" checked={rowOn} disabled={isAdminTarget || saving} onChange={() => rowAll(p)} aria-label={`${p.label} ทุกสิทธิ์`} />
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
                <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50">
                    <div className="text-xs text-slate-500">
                        {isAdminTarget ? 'ทุกสิทธิ์' : (<>เลือกแล้ว <b className="text-slate-700">{current.size}</b> / {totalPossible}{dirty && <span className="ml-2 text-amber-600 font-bold">● ยังไม่บันทึก</span>}</>)}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={requestClose} disabled={saving} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-lg hover:bg-slate-50 disabled:opacity-50">
                            {isAdminTarget ? 'ปิด' : 'ยกเลิก'}
                        </button>
                        {!isAdminTarget && (
                            <button onClick={save} disabled={!dirty || saving || loading || !catalog} className="px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50">
                                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
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

// "Who has what on this page?" — pick a page on the left, tick each person's actions on the right.
// Admins always pass every check, so they are not listed here.
export const PermissionHoldersModal = ({ onClose }) => {
    const [catalog, setCatalog] = useState(null);
    const [pageKey, setPageKey] = useState('');
    const [pageSearch, setPageSearch] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [busyCell, setBusyCell] = useState('');
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadCatalog()
            .then((cat) => { setCatalog(cat); if (cat.pages.length) setPageKey(cat.pages[0].key); })
            .catch((e) => setError(e.message));
    }, []);

    const reload = useCallback(async (k) => {
        setData(await getJson(`/permissions/holders?page=${encodeURIComponent(k)}`));
    }, []);

    useEffect(() => {
        if (!pageKey) { setData(null); return undefined; }
        let cancelled = false;
        setLoading(true);
        setError('');
        reload(pageKey)
            .catch((e) => { if (!cancelled) { setData(null); setError(e.message); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [pageKey, reload]);

    // Read the person's current list, change only this page's permission(s), then save the whole list.
    // View is required for every other action, so: ticking an action also ticks view;
    // unticking view also unticks the rest of this page.
    const setCell = async (u, action, want) => {
        setBusyCell(`${u.EmpCode}:${action}`);
        setError('');
        try {
            const cur = await getJson(`/permissions/users/${encodeURIComponent(u.EmpCode)}`);
            const set = new Set(cur.permissions || []);
            const mine = data.actions.map((a) => a.key);
            if (want) {
                set.add(`${pageKey}:${action}`);
                if (action !== 'view') set.add(`${pageKey}:view`);
            } else if (action === 'view') {
                mine.forEach((a) => set.delete(`${pageKey}:${a}`));
            } else {
                set.delete(`${pageKey}:${action}`);
            }
            const res = await fetch(`${API_BASE}/permissions/users/${encodeURIComponent(u.EmpCode)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permissions: [...set] }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || d.message || `HTTP ${res.status}`);
            await reload(pageKey);
        } catch (e) {
            setError(`${u.Name || u.EmpCode}: ${e.message}`);
        } finally {
            setBusyCell('');
        }
    };

    const users = data?.users || [];
    const actions = data?.actions || [];
    const q = search.trim().toLowerCase();
    const visible = users.filter((u) => !q || `${u.Name || ''} ${u.Username || ''} ${u.EmpCode}`.toLowerCase().includes(q));
    const pq = pageSearch.trim().toLowerCase();
    const groups = catalog ? [...new Set(catalog.pages.map((p) => p.group))] : [];
    const currentLabel = catalog?.pages.find((p) => p.key === pageKey)?.label || '';

    return (
        <ModalShell onBackdrop={onClose}>
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                className="w-full max-w-5xl max-h-[88vh] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden border border-white/20"
                role="dialog" aria-modal="true" aria-label="ใครมีสิทธิ์อะไรบ้าง">
                <div className="p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex items-start justify-between">
                    <div>
                        <h3 className="font-black text-xl tracking-tight">ใครมีสิทธิ์อะไรบ้าง</h3>
                        <p className="text-white/80 text-xs mt-0.5">เลือกหน้าทางซ้าย แล้วติ๊กสิทธิ์ของแต่ละคนทางขวา · มีผลทันที ไม่ต้องกดบันทึก</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full shrink-0" aria-label="ปิด"><X size={20} /></button>
                </div>

                <div className="flex flex-1 min-h-0 flex-col md:flex-row">
                    {/* left: pages */}
                    <aside className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col min-h-0">
                        <div className="p-3">
                            <input
                                type="search"
                                value={pageSearch}
                                onChange={(e) => setPageSearch(e.target.value)}
                                placeholder="ค้นหาหน้า"
                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                        </div>
                        <div className="overflow-y-auto px-2 pb-3 max-h-48 md:max-h-none flex-1">
                            {!catalog ? <div className="text-slate-400 text-sm px-2 py-4">กำลังโหลด...</div> : groups.map((g) => {
                                const items = catalog.pages.filter((p) => p.group === g && (!pq || p.label.toLowerCase().includes(pq) || p.key.includes(pq)));
                                if (!items.length) return null;
                                return (
                                    <div key={g} className="mb-2">
                                        <div className="px-2 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{g}</div>
                                        {items.map((p) => (
                                            <button
                                                key={p.key}
                                                type="button"
                                                onClick={() => setPageKey(p.key)}
                                                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition ${pageKey === p.key ? 'bg-violet-600 text-white font-bold' : 'text-slate-600 hover:bg-violet-50'}`}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </aside>

                    {/* right: users x actions */}
                    <section className="flex-1 min-w-0 flex flex-col min-h-0">
                        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="font-black text-slate-800">{currentLabel}</div>
                                <div className="text-xs text-slate-400">{data ? `${users.length} คน` : ''}</div>
                            </div>
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="ค้นหาคน ชื่อหรือรหัส"
                                className="w-56 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                        </div>
                        {error && <div className="m-4 px-3 py-2 rounded-lg bg-rose-50 text-rose-600 text-sm">{error}</div>}
                        <div className="flex-1 overflow-auto">
                            {loading && !data ? <div className="text-center py-10 text-slate-400">กำลังโหลด...</div>
                                : !data ? null
                                    : users.length === 0 ? <div className="text-slate-400 text-sm py-10 text-center">ยังไม่มีผู้ใช้ (Staff) ในระบบ</div>
                                        : (
                                            <table className="w-full text-sm">
                                                <thead className="sticky top-0 bg-slate-50 z-10">
                                                    <tr className="text-xs text-slate-500 border-b border-slate-200">
                                                        <th className="text-left py-2.5 px-4 font-bold sticky left-0 bg-slate-50">ผู้ใช้</th>
                                                        {actions.map((a) => (
                                                            <th key={a.key} className="py-2.5 px-2 font-bold text-center">
                                                                {a.label}
                                                                <div className="font-mono font-normal text-[10px] text-slate-400">{a.key}</div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {visible.map((u) => (
                                                        <tr key={u.EmpCode} className="border-b border-slate-100 hover:bg-violet-50/40">
                                                            <td className="py-2.5 px-4 sticky left-0 bg-white">
                                                                <div className="flex items-center gap-3">
                                                                    <EmpAvatar pic={u.EmpPic} empCode={u.EmpCode} name={u.Name || u.Username} />
                                                                    <div>
                                                                        <div className="font-bold text-slate-700 whitespace-nowrap">{u.Name || u.Username || '-'}</div>
                                                                        <div className="font-mono text-xs text-slate-400">{u.EmpCode}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            {actions.map((a) => {
                                                                const has = u.actions.includes(a.key);
                                                                const busy = busyCell === `${u.EmpCode}:${a.key}`;
                                                                return (
                                                                    <td key={a.key} className="py-2.5 px-2 text-center">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="w-5 h-5 accent-violet-600 cursor-pointer disabled:cursor-wait"
                                                                            checked={has}
                                                                            disabled={busy || !!busyCell}
                                                                            onChange={(e) => setCell(u, a.key, e.target.checked)}
                                                                            aria-label={`${u.Name || u.EmpCode} ${a.label}`}
                                                                        />
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                        </div>
                        <div className="px-4 py-3 border-t border-slate-100 text-[11px] text-slate-400">
                            ติ๊ก "แก้ไข" จะให้ "ดู" ด้วยอัตโนมัติ · เอา "ดู" ออกจะเอาทุกสิทธิ์ของหน้านี้ออก
                        </div>
                    </section>
                </div>
            </motion.div>
        </ModalShell>
    );
};
