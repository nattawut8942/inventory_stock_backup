// NetAtlas — tab "ผังเครือข่าย (NetAtlas)" ในหน้า Management
// จัดการผัง (ชั้น/ห้อง) และรูปแปลน — แยกจากแผนผังโรงงาน (CCTV) และผังตำแหน่ง PC โดยสิ้นเชิง
import React, { useCallback, useEffect, useState } from 'react';
import { Network, Plus, Pencil, Trash2, Upload, X, Loader2, ImageOff, AlertTriangle, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import Portal from '../Portal';
import { MgmtSection, MgmtTable, RowActions, PrimaryButton } from '../management/MgmtTable';
import { apiCall, INPUT, BTN_PRIMARY, BTN_SECONDARY, BTN_DANGER, NETATLAS_API, floorplanSrc } from './netAtlasConfig';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_MB = 10;
// ขนาด px ที่ใช้ได้ (1..10000) หรือ null ถ้ากรอกไม่ถูกต้อง
const dimValue = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 1 && n <= 10000 ? n : null; };

const LayoutModal = ({ layout, onClose, onSaved, canEditFloorplan }) => {
    const [name, setName] = useState(layout?.name || '');
    const [current, setCurrent] = useState(layout || null);
    // หลังสร้างผังแล้ว current มีค่า → ปุ่มจะเปลี่ยนเป็นการแก้ชื่อ (ไม่สร้างซ้ำ)
    const isNew = !current;
    const [file, setFile] = useState(null);
    // ขนาดผังเป็น px — ค่าเริ่มต้นมาจากผังเดิม หรือจากขนาดรูปที่เลือก (แก้ไขได้)
    const [dims, setDims] = useState({ w: layout?.width ?? '', h: layout?.height ?? '' });
    const [preview, setPreview] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    useEffect(() => {
        if (!file) { setPreview(''); return undefined; }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const saveName = async () => {
        const n = name.trim();
        if (!n) { setError('กรุณาระบุชื่อผัง'); return; }
        setBusy(true); setError(''); setInfo('');
        const res = isNew
            ? await apiCall('/layouts', { method: 'POST', body: JSON.stringify({ name: n }) })
            : await apiCall(`/layouts/${current.id}`, { method: 'PUT', body: JSON.stringify({ name: n, width: dimValue(dims.w), height: dimValue(dims.h) }) });
        setBusy(false);
        if (!res.ok) { setError(res.error); return; }
        setCurrent(res.data);
        if (isNew) {
            // สร้างผังแล้ว ให้ต่อด้วยการอัปโหลดรูปในหน้าเดียวกัน
            setInfo('สร้างผังแล้ว — อัปโหลดรูปแปลนต่อได้เลย');
        }
        onSaved();
    };

    const pickFile = (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > MAX_MB * 1024 * 1024) { setError(`ไฟล์ใหญ่เกิน ${MAX_MB} MB`); return; }
        if (!ACCEPT.split(',').includes(f.type)) { setError('รองรับเฉพาะ JPG, PNG, WEBP'); return; }
        setError(''); setInfo('');
        setFile(f);
        // อ่านขนาดจริงของรูปมาเป็นค่าเริ่มต้นของผัง
        const img = new Image();
        const url = URL.createObjectURL(f);
        img.onload = () => { setDims({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
    };

    const uploadFloorplan = async () => {
        if (!file || !current) return;
        setBusy(true); setError(''); setInfo('');
        const form = new FormData();
        form.append('floorplan', file);
        if (dimValue(dims.w)) form.append('width', String(dimValue(dims.w)));
        if (dimValue(dims.h)) form.append('height', String(dimValue(dims.h)));
        try {
            // ไม่ตั้ง Content-Type เอง ให้ browser ใส่ boundary ของ multipart ให้
            const res = await fetch(`${NETATLAS_API}/layouts/${current.id}/floorplan`, { method: 'PUT', body: form });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) { setError(json.error || `อัปโหลดไม่สำเร็จ (${res.status})`); }
            else { setCurrent(json.data); setFile(null); setInfo('อัปโหลดรูปแปลนแล้ว'); onSaved(); }
        } catch {
            setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
        }
        setBusy(false);
    };

    const removeFloorplan = async () => {
        if (!current?.floorplanUrl) return;
        setBusy(true); setError(''); setInfo('');
        const res = await apiCall(`/layouts/${current.id}/floorplan`, { method: 'DELETE' });
        setBusy(false);
        if (!res.ok) { setError(res.error); return; }
        setCurrent(res.data);
        setInfo('ลบรูปแปลนแล้ว');
        onSaved();
    };

    const shownImg = preview || floorplanSrc(current?.floorplanUrl) || '';

    return (
        <Portal>
            <div className="fixed inset-0 z-[9990] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
                <div role="dialog" aria-modal="true" aria-labelledby="netatlas-layout-title"
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 id="netatlas-layout-title" className="font-black text-slate-800">{isNew ? 'เพิ่มผังเครือข่าย' : 'แก้ไขผังเครือข่าย'}</h3>
                        <button type="button" onClick={onClose} disabled={busy} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                        <div>
                            <label htmlFor="netatlas-layout-name" className="block text-xs font-semibold text-slate-600 mb-1">ชื่อผัง / ชั้น / ห้อง <span className="text-rose-500">*</span></label>
                            <div className="flex gap-2">
                                <input id="netatlas-layout-name" className={INPUT} value={name} maxLength={120} placeholder="เช่น ชั้น 1 — ห้อง Server"
                                    onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }} />
                                <button type="button" onClick={saveName} disabled={busy || !name.trim() || (!isNew && name.trim() === current?.name)} className={BTN_SECONDARY}>
                                    {isNew ? 'สร้าง' : 'บันทึกชื่อ'}
                                </button>
                            </div>
                        </div>

                        {/* ขนาดผังเป็น px (เหมือนแผนผังโรงงาน) */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="netatlas-layout-w" className="block text-xs font-semibold text-slate-600 mb-1">ความกว้าง (px)</label>
                                <input id="netatlas-layout-w" type="number" min={1} max={10000} className={INPUT} value={dims.w} placeholder="เช่น 1920"
                                    onChange={(e) => setDims((d) => ({ ...d, w: e.target.value }))} />
                            </div>
                            <div>
                                <label htmlFor="netatlas-layout-h" className="block text-xs font-semibold text-slate-600 mb-1">ความสูง (px)</label>
                                <input id="netatlas-layout-h" type="number" min={1} max={10000} className={INPUT} value={dims.h} placeholder="เช่น 1080"
                                    onChange={(e) => setDims((d) => ({ ...d, h: e.target.value }))} />
                            </div>
                        </div>
                        <p className="text-[11px] text-slate-400 -mt-3">ค่าเริ่มต้นจะเป็นขนาดของรูปแปลนที่เลือก · กรอกว่างได้ (ใช้สัดส่วนของรูป)</p>

                        {current && canEditFloorplan && (
                            <div className="space-y-3">
                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">รูปแปลน</h4>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 aspect-video flex items-center justify-center overflow-hidden">
                                    {shownImg
                                        ? <img src={shownImg} alt="ตัวอย่างรูปแปลน" className="w-full h-full object-contain" />
                                        : <div className="text-center text-slate-400"><ImageOff className="w-7 h-7 mx-auto mb-1" /><p className="text-xs">ยังไม่มีรูปแปลน</p></div>}
                                </div>
                                <p className="text-[11px] text-slate-400">รองรับ JPG, PNG, WEBP ไม่เกิน {MAX_MB} MB (ไม่รับ SVG เพื่อความปลอดภัย)</p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <label className={`${BTN_SECONDARY} cursor-pointer`}>
                                        <Upload className="w-4 h-4" /> เลือกรูป
                                        <input type="file" accept={ACCEPT} className="sr-only" onChange={pickFile} disabled={busy} />
                                    </label>
                                    {file && (
                                        <button type="button" onClick={uploadFloorplan} disabled={busy} className={BTN_PRIMARY}>
                                            {busy && <Loader2 className="w-4 h-4 animate-spin" />} อัปโหลด "{file.name.slice(0, 24)}"
                                        </button>
                                    )}
                                    {current.floorplanUrl && !file && (
                                        <button type="button" onClick={removeFloorplan} disabled={busy} className={BTN_DANGER}>
                                            <Trash2 className="w-4 h-4" /> ลบรูปแปลน
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {info && <p role="status" className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{info}</p>}
                        {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</p>}
                    </div>

                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
                        <button type="button" onClick={onClose} disabled={busy} className={BTN_SECONDARY}>ปิด</button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

const NetAtlasLayoutsTab = ({ canCreate, canEdit, canDelete }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modal, setModal] = useState(null); // null | { layout | null }
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const res = await apiCall('/layouts');
        setLoading(false);
        if (!res.ok) { setError(res.error); return; }
        setError('');
        setRows(res.data);
    }, []);

    useEffect(() => { load(); }, [load]);

    // ── จัดลำดับ: ลำดับก่อนลากไว้เพื่อเทียบ และบันทึกเมื่อปล่อยมือ ──
    const [dragIdx, setDragIdx] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const orderBeforeRef = React.useRef(null);
    const rowsRef = React.useRef(rows);
    rowsRef.current = rows;

    const moveRow = (from, to) => {
        setRows((list) => {
            const next = [...list];
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            return next;
        });
    };

    const saveOrder = async (before, after) => {
        if (!before || before.map((r) => r.id).join() === after.map((r) => r.id).join()) return;
        setSaving(true); setSaveError('');
        const res = await apiCall('/layouts/order', { method: 'PUT', body: JSON.stringify({ ids: after.map((r) => r.id) }) });
        setSaving(false);
        if (!res.ok) { setSaveError(`บันทึกลำดับไม่สำเร็จ: ${res.error}`); load(); }
    };

    const endDrag = () => {
        const before = orderBeforeRef.current;
        orderBeforeRef.current = null;
        setDragIdx(null);
        saveOrder(before, rowsRef.current);
    };

    const moveBy = async (i, delta) => {
        const j = i + delta;
        if (j < 0 || j >= rows.length || saving) return;
        const before = rows;
        const after = [...rows];
        [after[i], after[j]] = [after[j], after[i]];
        setRows(after);
        await saveOrder(before, after);
    };

    const confirmDelete = async () => {
        setDeleting(true); setDeleteError('');
        const res = await apiCall(`/layouts/${deleteTarget.id}`, { method: 'DELETE' });
        setDeleting(false);
        if (!res.ok) { setDeleteError(res.error); return; }
        setDeleteTarget(null);
        load();
    };

    const columns = [
        { key: 'name', label: 'ชื่อผัง', primary: true, sortValue: (r) => r.name,
            render: (r) => <span className="font-bold text-slate-700 flex items-center gap-2"><Network size={16} className="text-indigo-600 shrink-0" />{r.name}</span> },
        { key: 'floor', label: 'รูปแปลน', sortValue: (r) => (r.floorplanUrl ? 1 : 0),
            render: (r) => r.floorplanUrl
                ? <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">มีรูปแล้ว</span>
                : <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-400">ยังไม่มีรูป</span> },
        { key: 'devices', label: 'อุปกรณ์', align: 'center', sortValue: (r) => r.deviceCount || 0,
            render: (r) => <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${r.deviceCount > 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>{r.deviceCount || 0} รายการ</span> },
        { key: 'act', label: 'จัดการ', actions: true, render: (r) => <RowActions
            onEdit={canEdit ? () => setModal({ layout: r }) : undefined}
            onDelete={canDelete ? () => { setDeleteError(''); setDeleteTarget(r); } : undefined} /> },
    ];

    return (
        <MgmtSection title="ผังเครือข่าย (NetAtlas)" count={rows.length}
            subtitle="ผัง/ชั้น/ห้อง และรูปแปลนสำหรับหน้า NetAtlas · แยกจากแผนผังโรงงาน (CCTV) และผังตำแหน่ง PC"
            actions={canCreate && <PrimaryButton icon={Plus} onClick={() => setModal({ layout: null })}>เพิ่มผัง</PrimaryButton>}>
            {error && (
                <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <AlertTriangle className="w-4 h-4" /> {error}
                    <button type="button" onClick={load} className="ml-auto font-bold underline">ลองใหม่</button>
                </div>
            )}
            {/* รายการผัง: ลากเพื่อจัดลำดับ (หรือใช้ปุ่มลูกศร) ลำดับนี้คือลำดับที่แสดงในหน้า NetAtlas */}
            {loading && rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
            ) : rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีผังเครือข่าย</div>
            ) : (
                <ul className="space-y-2" aria-label="ลำดับผังเครือข่าย">
                    {rows.map((r, i) => {
                        const isDragging = dragIdx === i;
                        return (
                            <li key={r.id}
                                draggable={canEdit && !saving}
                                onDragStart={(e) => { if (!canEdit) return; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(r.id)); orderBeforeRef.current = rowsRef.current; setDragIdx(i); }}
                                onDragOver={(e) => { if (dragIdx == null) return; e.preventDefault(); if (dragIdx !== i) { moveRow(dragIdx, i); setDragIdx(i); } }}
                                onDragEnd={endDrag}
                                onDrop={(e) => e.preventDefault()}
                                className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm transition ${isDragging ? 'border-indigo-400 opacity-60' : 'border-slate-200'} ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                                {canEdit && <GripVertical className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />}
                                <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">{i + 1}</span>
                                <span className="font-bold text-slate-700 flex items-center gap-2 min-w-0 flex-1">
                                    <Network size={16} className="text-indigo-600 shrink-0" />
                                    <span className="truncate">{r.name}</span>
                                    {r.width && r.height && <span className="text-[11px] font-mono text-slate-400 shrink-0">{r.width}×{r.height} px</span>}
                                </span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${r.floorplanUrl ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                    {r.floorplanUrl ? 'มีรูปแล้ว' : 'ยังไม่มีรูป'}
                                </span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${r.deviceCount > 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>{r.deviceCount || 0} อุปกรณ์</span>
                                <div className="flex items-center gap-1">
                                    {canEdit && (
                                        <>
                                            <button type="button" onClick={() => moveBy(i, -1)} disabled={i === 0 || saving} aria-label={`เลื่อน ${r.name}ขึ้น`}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                                            <button type="button" onClick={() => moveBy(i, 1)} disabled={i === rows.length - 1 || saving} aria-label={`เลื่อน ${r.name} ลง`}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                                        </>
                                    )}
                                    {canEdit && <button type="button" onClick={() => setModal({ layout: r })} aria-label={`แก้ไข ${r.name}`} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil className="w-4 h-4" /></button>}
                                    {canDelete && <button type="button" onClick={() => { setDeleteError(''); setDeleteTarget(r); }} aria-label={`ลบ ${r.name}`} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            {saveError && (
                <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{saveError}</p>
            )}

            {modal && (
                <LayoutModal
                    layout={modal.layout}
                    canEditFloorplan={canEdit}
                    onClose={() => { setModal(null); load(); }}
                    onSaved={load}
                />
            )}

            {deleteTarget && (
                <Portal>
                    <div className="fixed inset-0 z-[9990] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                        onMouseDown={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}>
                        <div role="alertdialog" aria-modal="true" className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5" /></div>
                                <div>
                                    <h3 className="font-black text-slate-800">ลบผัง "{deleteTarget.name}"?</h3>
                                    {deleteTarget.deviceCount > 0
                                        ? <p className="text-sm text-amber-700 mt-1">ผังนี้มีอุปกรณ์ {deleteTarget.deviceCount} รายการ ต้องย้ายหรือลบอุปกรณ์ออกก่อน</p>
                                        : <p className="text-sm text-slate-600 mt-1">ลบแล้วกู้คืนไม่ได้ (รูปแปลนก็จะถูกลบด้วย)</p>}
                                    {deleteError && <p className="text-xs text-rose-700 mt-2">{deleteError}</p>}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className={BTN_SECONDARY}>ยกเลิก</button>
                                <button type="button" onClick={confirmDelete} disabled={deleting || deleteTarget.deviceCount > 0} className={BTN_DANGER}>
                                    {deleting && <Loader2 className="w-4 h-4 animate-spin" />} ลบผัง
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </MgmtSection>
    );
};

export default NetAtlasLayoutsTab;
