import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { confirmDialog } from './ConfirmDialog';
import { toast } from './Toast';
import { X, Search, Printer, Check, Save, AlertTriangle, Trash2 } from 'lucide-react';
import { API_BASE } from '../config/api';

const REMARK_MAX = 200;

// เลือกเครื่องพรินเตอร์ที่ใช้หมึกสเปคนี้ได้ (หลายเครื่องต่อหมึกได้, เครื่องหนึ่งใช้หมึกหลายรหัสได้)
// links: [{ PrinterId, Remark }]  |  onSaved(code, newLinks)  |  canEdit = มีสิทธิ์แก้ไข
const InkTonerCompatModal = ({ item, links, canEdit, onClose, onSaved }) => {
    const [printers, setPrinters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [search, setSearch] = useState('');
    const [onlySelected, setOnlySelected] = useState(false);

    // snapshot ตอนเปิด เพื่อเช็กว่ามีการแก้ไขที่ยังไม่บันทึกหรือไม่
    const initial = useMemo(() => {
        const m = new Map();
        (links || []).forEach(l => m.set(l.PrinterId, (l.Remark || '').trim()));
        return m;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [selected, setSelected] = useState(() => new Map(initial));
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const isDirty = useMemo(() => {
        if (selected.size !== initial.size) return true;
        for (const [id, remark] of selected) {
            if (!initial.has(id) || initial.get(id) !== remark.trim()) return true;
        }
        return false;
    }, [selected, initial]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/printer-health`);
                if (!res.ok) throw new Error('load failed');
                const json = await res.json();
                if (alive) setPrinters(Array.isArray(json) ? json : []);
            } catch (e) {
                if (alive) setLoadError('ไม่สามารถโหลดรายการเครื่องพรินเตอร์ได้');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const requestClose = async () => {
        if (saving) return;
        if (isDirty) {
            const ok = await confirmDialog({
                title: 'ปิดโดยไม่บันทึก?',
                message: 'มีการแก้ไขที่ยังไม่ได้บันทึก ถ้าปิดตอนนี้การแก้ไขจะหายไป',
                confirmText: 'ปิดโดยไม่บันทึก',
                cancelText: 'กลับไปแก้ไข',
                danger: true,
            });
            if (!ok) return;
        }
        onClose();
    };

    useEffect(() => {
        const onKey = (e) => {
            // ถ้ามีกล่องยืนยันเปิดอยู่ ให้กล่องนั้นจัดการปุ่ม Esc เอง
            if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) requestClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return printers.filter(p => {
            if (onlySelected && !selected.has(p.PrinterId)) return false;
            if (!q) return true;
            return [p.Name, p.Model, p.IpAddress, p.Location, p.Factory]
                .some(v => (v || '').toLowerCase().includes(q));
        });
    }, [printers, search, onlySelected, selected]);

    const togglePrinter = (id) => {
        if (!canEdit) return;
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(id)) next.delete(id); else next.set(id, '');
            return next;
        });
    };

    const setRemark = (id, text) => {
        setSelected(prev => {
            const next = new Map(prev);
            next.set(id, text.slice(0, REMARK_MAX));
            return next;
        });
    };

    const selectVisible = () => {
        setSelected(prev => {
            const next = new Map(prev);
            filtered.forEach(p => { if (!next.has(p.PrinterId)) next.set(p.PrinterId, ''); });
            return next;
        });
    };

    const clearAll = async () => {
        const ok = await confirmDialog({
            title: 'เอาเครื่องทั้งหมดออก?',
            message: 'จะมีผลเมื่อกดบันทึก ถ้ายังไม่บันทึกกลับไปได้',
            confirmText: 'เอาออกทั้งหมด',
            danger: true,
        });
        if (ok) setSelected(new Map());
    };

    const selectedPrinters = printers.filter(p => selected.has(p.PrinterId));
    // เครื่องที่ผูกไว้แต่ไม่อยู่ในรายการ (เช่น ถูกปิดใช้งานไปแล้ว) ยังต้องแสดงให้เห็น
    const orphanIds = [...selected.keys()].filter(id => !printers.some(p => p.PrinterId === id));
    const orphanLinks = (links || []).filter(l => orphanIds.includes(l.PrinterId));

    const handleSave = async () => {
        if (!canEdit || !isDirty) return;
        setSaving(true);
        setSaveError(null);
        const items = [...selected.entries()].map(([PrinterId, Remark]) => ({ PrinterId, Remark: Remark.trim() }));
        try {
            const res = await fetch(`${API_BASE}/ink-toner/${encodeURIComponent(item.Prt_Code)}/printers`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || 'บันทึกไม่สำเร็จ');
            onSaved(item.Prt_Code, items);
            toast.success(`บันทึกเครื่องที่ใช้ได้ของ ${item.Prt_Code} แล้ว`);
            onClose();
        } catch (e) {
            setSaveError(e.message);
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
            <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            {canEdit ? 'แก้ไขเครื่องที่ใช้หมึกนี้ได้' : 'เครื่องที่ใช้หมึกนี้ได้'}
                        </p>
                        <h3 className="text-base font-black text-slate-800 truncate">{item.Prt_Name}</h3>
                        <p className="font-mono text-[11px] text-slate-500 truncate">{item.Prt_Code}{item.Spect ? ` · ${item.Spect}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 rounded-full px-2.5 py-1">เลือกแล้ว {selected.size}</span>
                        <button onClick={requestClose} disabled={saving} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="ปิด">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                    {/* ซ้าย: รายการเครื่องทั้งหมด */}
                    <div className="flex flex-col min-h-0">
                        <div className="p-3 border-b border-slate-100 space-y-2">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="ค้นหาชื่อ / รุ่น / IP / ที่ตั้ง"
                                    className="w-full h-9 bg-white border border-slate-200 rounded-lg pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                                />
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                                <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} className="accent-indigo-600" />
                                    แสดงเฉพาะที่เลือก
                                </label>
                                {canEdit && (
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={selectVisible} disabled={filtered.length === 0} className="font-bold text-indigo-600 hover:underline disabled:opacity-40 disabled:no-underline">
                                            เลือกทั้งหมดที่แสดง
                                        </button>
                                        <span className="text-slate-300">|</span>
                                        <button type="button" onClick={clearAll} disabled={selected.size === 0} className="font-bold text-rose-500 hover:underline disabled:opacity-40 disabled:no-underline">
                                            ล้างทั้งหมด
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {loading && <div className="p-6 text-center text-xs text-slate-400">กำลังโหลด...</div>}
                            {loadError && <div className="p-4 text-xs text-red-600 flex items-center gap-2"><AlertTriangle size={14} />{loadError}</div>}
                            {!loading && !loadError && filtered.length === 0 && (
                                <div className="p-6 text-center text-xs text-slate-400">ไม่พบเครื่อง</div>
                            )}
                            <ul className="divide-y divide-slate-100">
                                {filtered.map(p => {
                                    const on = selected.has(p.PrinterId);
                                    return (
                                        <li key={p.PrinterId}>
                                            <button
                                                type="button"
                                                onClick={() => togglePrinter(p.PrinterId)}
                                                disabled={!canEdit}
                                                aria-pressed={on}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${on ? 'bg-indigo-50/70' : 'hover:bg-slate-50'} ${canEdit ? '' : 'cursor-default'}`}
                                            >
                                                <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                                                    {on && <Check size={12} />}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-xs font-bold text-slate-800 truncate">{p.Name}</span>
                                                    <span className="block text-[11px] text-slate-500 truncate">
                                                        {p.Model || 'ไม่ระบุรุ่น'} · {p.IpAddress}{p.Location ? ` · ${p.Location}` : ''}
                                                    </span>
                                                </span>
                                                {!p.Online && <span className="text-[9px] font-bold text-red-600 bg-red-50 rounded px-1 shrink-0">ออฟไลน์</span>}
                                                <Printer size={14} className="text-slate-300 shrink-0" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>

                    {/* ขวา: ที่เลือกแล้ว + เงื่อนไข */}
                    <div className="flex flex-col min-h-0">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600">
                            <span>เครื่องที่ผูกไว้</span>
                            {isDirty && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">ยังไม่ได้บันทึก</span>}
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {selected.size === 0 && (
                                <p className="text-center text-xs text-slate-400 py-8">ยังไม่ได้เลือกเครื่อง</p>
                            )}
                            {[...selectedPrinters, ...orphanLinks.map(l => ({ PrinterId: l.PrinterId, Name: l.Name, Model: l.Model, IpAddress: l.IpAddress, orphan: true }))].map(p => (
                                <div key={p.PrinterId} className="rounded-xl border border-slate-200 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <span className="block text-xs font-bold text-slate-800 truncate">{p.Name}</span>
                                            <span className="block text-[10px] text-slate-500 truncate">
                                                {p.Model || 'ไม่ระบุรุ่น'} · {p.IpAddress}{p.orphan ? ' · (ไม่อยู่ในรายการ)' : ''}
                                            </span>
                                        </div>
                                        {canEdit && (
                                            <button type="button" onClick={() => setSelected(prev => { const n = new Map(prev); n.delete(p.PrinterId); return n; })}
                                                className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 shrink-0" title="เอาออก">
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="mt-2 relative">
                                        <input
                                            type="text"
                                            value={selected.get(p.PrinterId) || ''}
                                            onChange={(e) => setRemark(p.PrinterId, e.target.value)}
                                            disabled={!canEdit}
                                            maxLength={REMARK_MAX}
                                            placeholder="เงื่อนไข (ไม่บังคับ) เช่น ใช้ได้เฉพาะรุ่น DN"
                                            className="w-full h-8 bg-white border border-slate-200 rounded-lg pl-2.5 pr-12 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
                                        />
                                        {canEdit && (
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400">
                                                {(selected.get(p.PrinterId) || '').length}/{REMARK_MAX}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50/60">
                    <div className="min-w-0 text-xs text-red-600 truncate">{saveError}</div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={requestClose} disabled={saving} className="px-4 h-9 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100">
                            {canEdit ? 'ยกเลิก' : 'ปิด'}
                        </button>
                        {canEdit && (
                            <button onClick={handleSave} disabled={saving || !isDirty} className="px-4 h-9 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm">
                                <Save size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default InkTonerCompatModal;
