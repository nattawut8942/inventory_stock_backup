import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Search, RotateCcw, Copy, History, ShieldCheck, Eraser } from 'lucide-react';
import { motion } from 'motion/react';
import Portal from './Portal';
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
        if (dirty && !window.confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการปิดโดยไม่บันทึกหรือไม่?')) return;
        onClose?.();
    }, [dirty, saving, onClose]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') requestClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [requestClose]);

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
    );
};

// ── What "log" mode would have blocked (helps decide when it is safe to switch to enforce) ──
export const PermissionLogModal = ({ onClose }) => {
    const [data, setData] = useState(null);
    const [catalog, setCatalog] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

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
        if (!window.confirm('ล้างรายงานทั้งหมดและเริ่มนับใหม่ใช่หรือไม่? (ใช้หลังแก้สิทธิ์แล้ว เพื่อดูว่ายังมีอะไรถูกบล็อกอีกไหม)')) return;
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
                        <button onClick={clearAll} disabled={busy || !data || data.items.length === 0} className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-bold disabled:opacity-50">ล้างรายงาน</button>
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
    );
};

export default PermissionEditorModal;
