// NetAtlas — tab "ประเภทอุปกรณ์ (NetAtlas)" ใน Management
// master ของประเภทอุปกรณ์: ชื่อ, สี, ไอคอน, มีพอร์ตไหม, เป็นต้นทางได้ไหม, เปิดใช้งาน
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, AlertTriangle, X, Loader2, Trash2 } from 'lucide-react';
import Portal from '../Portal';
import { MgmtSection, MgmtTable, RowActions, PrimaryButton } from '../management/MgmtTable';
import {
    apiCall, styleOf, INPUT, BTN_PRIMARY, BTN_SECONDARY, BTN_DANGER,
    COLOR_KEYS, COLOR_CLASSES, ICON_KEYS, ICON_MAP,
} from './netAtlasConfig';

const Check = ({ checked, onChange, label, hint, disabled }) => (
    <label className={`flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400" />
        <span>
            <span className="block text-sm font-semibold text-slate-700">{label}</span>
            {hint && <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>}
        </span>
    </label>
);

const EMPTY = { code: '', label: '', shortLabel: '', colorKey: 'blue', iconKey: 'box', hasPorts: false, canBeParent: false, sortOrder: 0, isActive: true };

const TypeModal = ({ type, onClose, onSaved }) => {
    const isNew = !type;
    const [form, setForm] = useState(type ? { ...type } : EMPTY);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const save = async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!form.label.trim()) { setError('กรุณาระบุชื่อประเภท'); return; }
        if (!form.shortLabel.trim()) { setError('กรุณาระบุตัวย่อ (เช่น L2, AP)'); return; }
        if (isNew && !/^[A-Za-z0-9]{1,10}$/.test(form.code.trim())) { setError('รหัสประเภทต้องเป็นตัวอักษรภาษาอังกฤษหรือตัวเลข ไม่เกิน 10 ตัว'); return; }
        if (form.canBeParent && !form.hasPorts) { setError('ประเภทที่เป็นต้นทางได้ ต้องมีพอร์ตด้วย'); return; }
        const body = {
            code: form.code.trim(), label: form.label.trim(), shortLabel: form.shortLabel.trim(),
            colorKey: form.colorKey, iconKey: form.iconKey, hasPorts: form.hasPorts, canBeParent: form.canBeParent,
            sortOrder: Number(form.sortOrder) || 0, isActive: form.isActive,
        };
        setBusy(true); setError('');
        const res = isNew
            ? await apiCall('/device-types', { method: 'POST', body: JSON.stringify(body) })
            : await apiCall(`/device-types/${encodeURIComponent(type.code)}`, { method: 'PUT', body: JSON.stringify(body) });
        setBusy(false);
        if (!res.ok) { setError(res.error); return; }
        onSaved();
    };

    const preview = styleOf({ ...form, code: form.code || '?' }, form.code);
    const PreviewIcon = preview.Icon;

    return (
        <Portal>
            <div className="fixed inset-0 z-[9990] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
                <form role="dialog" aria-modal="true" aria-labelledby="netatlas-type-title" onSubmit={save}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 id="netatlas-type-title" className="font-black text-slate-800">{isNew ? 'เพิ่มประเภทอุปกรณ์' : `แก้ไขประเภท ${type.code}`}</h3>
                        <button type="button" onClick={onClose} disabled={busy} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="w-5 h-5" /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                        {/* ตัวอย่างการแสดงผล */}
                        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                            <div className={`w-10 h-10 rounded-xl ${preview.soft} ${preview.text} border ${preview.border} flex items-center justify-center`}>
                                <PreviewIcon className="w-5 h-5" />
                            </div>
                            <div>
                                <span className={`inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${preview.soft} ${preview.text}`}>{form.shortLabel || '??'}</span>
                                <p className="text-sm font-bold text-slate-700">{form.label || 'ชื่อประเภท'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">รหัส {isNew && <span className="text-rose-500">*</span>}</label>
                                <input className={`${INPUT} font-mono uppercase`} value={isNew ? form.code : type.code} disabled={!isNew} maxLength={10}
                                    onChange={(e) => set('code')(e.target.value.toUpperCase())} placeholder="เช่น PC, PRN" />
                                {!isNew && <p className="text-[11px] text-slate-400 mt-1">เปลี่ยนรหัสไม่ได้</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">ตัวย่อที่แสดง <span className="text-rose-500">*</span></label>
                                <input className={INPUT} value={form.shortLabel} maxLength={10} onChange={(e) => set('shortLabel')(e.target.value)} placeholder="เช่น PC" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">ชื่อประเภท <span className="text-rose-500">*</span></label>
                            <input className={INPUT} value={form.label} maxLength={80} onChange={(e) => set('label')(e.target.value)} placeholder="เช่น Desktop PC, Printer" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">สี</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {COLOR_KEYS.map((k) => (
                                        <button key={k} type="button" onClick={() => set('colorKey')(k)} aria-label={`สี ${k}`} aria-pressed={form.colorKey === k}
                                            className={`w-7 h-7 rounded-full ${COLOR_CLASSES[k].dot} ${form.colorKey === k ? 'ring-2 ring-offset-2 ring-slate-600' : ''}`} />
                                    ))}
                                </div>
                            </div>
                            <div>
                                <span className="block text-xs font-semibold text-slate-600 mb-1">ไอคอน</span>
                                <div role="radiogroup" aria-label="ไอคอน" className="grid grid-cols-5 gap-1.5">
                                    {ICON_KEYS.map((k) => {
                                        const Ic = ICON_MAP[k];
                                        const on = form.iconKey === k;
                                        return (
                                            <button key={k} type="button" role="radio" aria-checked={on} aria-label={k} title={k} onClick={() => set('iconKey')(k)}
                                                className={`h-9 rounded-lg border flex items-center justify-center transition ${on ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                                <Ic className="w-4 h-4" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Check checked={form.hasPorts} onChange={(v) => { set('hasPorts')(v); if (!v) set('canBeParent')(false); }}
                                label="มีพอร์ตให้เสียบอุปกรณ์อื่น" hint="เช่น Switch, Hub — ต้องระบุจำนวนพอร์ตตอนเพิ่มอุปกรณ์" />
                            <Check checked={form.canBeParent} disabled={!form.hasPorts} onChange={set('canBeParent')}
                                label="เป็นต้นทางให้อุปกรณ์อื่นต่อพ่วงได้" hint="ต้องเปิด 'มีพอร์ต' ก่อน" />
                            <Check checked={form.isActive} onChange={set('isActive')}
                                label="เปิดใช้งาน" hint="ปิดแล้วจะไม่แสดงให้เลือกตอนเพิ่มอุปกรณ์ใหม่ อุปกรณ์เดิมยังแสดงผลปกติ" />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">ลำดับการแสดง</label>
                            <input type="number" className={`${INPUT} w-32`} value={form.sortOrder} onChange={(e) => set('sortOrder')(e.target.value)} />
                        </div>

                        {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</p>}
                    </div>

                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                        <button type="button" onClick={onClose} disabled={busy} className={BTN_SECONDARY}>ยกเลิก</button>
                        <button type="submit" disabled={busy} className={BTN_PRIMARY}>
                            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {isNew ? 'เพิ่มประเภท' : 'บันทึก'}
                        </button>
                    </div>
                </form>
            </div>
        </Portal>
    );
};

const NetAtlasDeviceTypesTab = ({ canCreate, canEdit, canDelete }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modal, setModal] = useState(null); // null | { type | null }
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const res = await apiCall('/device-types');
        setLoading(false);
        if (!res.ok) { setError(res.error); return; }
        setError('');
        setRows(res.data);
    }, []);

    useEffect(() => { load(); }, [load]);

    const confirmDelete = async () => {
        setDeleting(true); setDeleteError('');
        const res = await apiCall(`/device-types/${encodeURIComponent(deleteTarget.code)}`, { method: 'DELETE' });
        setDeleting(false);
        if (!res.ok) { setDeleteError(res.error); return; }
        setDeleteTarget(null);
        load();
    };

    const columns = [
        { key: 'code', label: 'รหัส', primary: true, sortValue: (r) => r.code,
            render: (r) => {
                const s = styleOf(r, r.code);
                const Icon = s.Icon;
                return <span className="font-bold text-slate-700 flex items-center gap-2"><span className={`w-7 h-7 rounded-lg ${s.soft} ${s.text} flex items-center justify-center`}><Icon className="w-4 h-4" /></span><span className="font-mono">{r.code}</span></span>;
            } },
        { key: 'label', label: 'ชื่อประเภท', sortValue: (r) => r.label, render: (r) => <span className="text-slate-700">{r.label}</span> },
        { key: 'ports', label: 'มีพอร์ต', align: 'center', sortValue: (r) => (r.hasPorts ? 1 : 0),
            render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.hasPorts ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>{r.hasPorts ? 'มี' : 'ไม่มี'}</span> },
        { key: 'parent', label: 'เป็นต้นทางได้', align: 'center', sortValue: (r) => (r.canBeParent ? 1 : 0),
            render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.canBeParent ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{r.canBeParent ? 'ได้' : 'ไม่ได้'}</span> },
        { key: 'active', label: 'สถานะ', align: 'center', sortValue: (r) => (r.isActive ? 1 : 0),
            render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{r.isActive ? 'ใช้งาน' : 'ปิด'}</span> },
        { key: 'usage', label: 'อุปกรณ์', align: 'center', sortValue: (r) => r.usage || 0,
            render: (r) => <span className="text-xs text-slate-500">{r.usage ?? 0} รายการ</span> },
        { key: 'act', label: 'จัดการ', actions: true, render: (r) => <RowActions
            onEdit={canEdit ? () => setModal({ type: r }) : undefined}
            onDelete={canDelete ? () => { setDeleteError(''); setDeleteTarget(r); } : undefined} /> },
    ];

    return (
        <MgmtSection title="ประเภทอุปกรณ์ (NetAtlas)" count={rows.length}
            subtitle="ประเภทที่ใช้ตอนเพิ่มอุปกรณ์ในผังเครือข่าย · กำหนดว่ามีพอร์ตไหม และเป็นต้นทางให้อุปกรณ์อื่นต่อได้หรือไม่"
            actions={canCreate && <PrimaryButton icon={Plus} onClick={() => setModal({ type: null })}>เพิ่มประเภท</PrimaryButton>}>
            {error && (
                <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <AlertTriangle className="w-4 h-4" /> {error}
                    <button type="button" onClick={load} className="ml-auto font-bold underline">ลองใหม่</button>
                </div>
            )}
            <MgmtTable columns={columns} rows={rows} rowKey={(r) => r.code} loading={loading} minWidth={820}
                searchText={(r) => `${r.code} ${r.label} ${r.shortLabel}`} searchPlaceholder="ค้นหารหัสหรือชื่อ…" emptyText="ยังไม่มีประเภทอุปกรณ์" />

            {modal && <TypeModal type={modal.type} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}

            {deleteTarget && (
                <Portal>
                    <div className="fixed inset-0 z-[9990] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                        onMouseDown={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}>
                        <div role="alertdialog" aria-modal="true" className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5" /></div>
                                <div>
                                    <h3 className="font-black text-slate-800">ลบประเภท {deleteTarget.code}?</h3>
                                    {deleteTarget.usage > 0
                                        ? <p className="text-sm text-amber-700 mt-1">มีอุปกรณ์ใช้ประเภทนี้อยู่ {deleteTarget.usage} รายการ ลบไม่ได้ ให้ปิดการใช้งานแทน</p>
                                        : <p className="text-sm text-slate-600 mt-1">ไม่มีอุปกรณ์ใช้ประเภทนี้ ลบแล้วกู้คืนไม่ได้</p>}
                                    {deleteError && <p className="text-xs text-rose-700 mt-2">{deleteError}</p>}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className={BTN_SECONDARY}>ยกเลิก</button>
                                <button type="button" onClick={confirmDelete} disabled={deleting || deleteTarget.usage > 0} className={BTN_DANGER}>
                                    {deleting && <Loader2 className="w-4 h-4 animate-spin" />} ลบประเภท
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </MgmtSection>
    );
};

export default NetAtlasDeviceTypesTab;
