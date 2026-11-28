// NetAtlas — ฟอร์มเพิ่ม/แก้ไขอุปกรณ์ (ประเภทมาจาก master, พอร์ตตามจำนวนที่ตั้งไว้)
// เลือกต้นทางได้ 2 แบบ: dropdown หรือ "เลือกจากผัง" (ซ่อนฟอร์มชั่วคราวแล้วให้คลิกหมุดบนผัง)
import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, MousePointerClick } from 'lucide-react';
import Portal from '../Portal';
import CameraCapture from './CameraCapture';
import { Camera, ClipboardPaste } from 'lucide-react';
import {
    INPUT, BTN_PRIMARY, BTN_SECONDARY, validateDeviceForm, descendantIds, apiCall, styleOf, findType, portName,
    NETATLAS_API, floorplanSrc,
} from './netAtlasConfig';

// ช่องรูป 1 ช่อง: เลือกไฟล์ / ถ่ายด้วยกล้อง / วางจากคลิปบอร์ด (Ctrl+V)
const PhotoField = ({ label, hint, preview, onPick, onClear, onCamera, disabled, error }) => {
    const onPaste = (e) => {
        if (disabled) return;
        const img = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
        if (!img) return;
        e.preventDefault();
        onPick({ target: { files: [img], value: '' } });
    };
    return (
        <Field label={label} error={error} hint={hint}>
            <div tabIndex={disabled ? -1 : 0} onPaste={onPaste} title="คลิกช่องนี้แล้วกด Ctrl+V เพื่อวางรูปจากคลิปบอร์ด"
                className="flex items-center gap-3 rounded-xl p-1 -m-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                <div className="w-20 h-20 shrink-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 overflow-hidden flex items-center justify-center">
                    {preview
                        ? <img src={preview} alt={label} className="w-full h-full object-cover" />
                        : <span className="text-[11px] text-slate-400">ไม่มีรูป</span>}
                </div>
                <div className="flex flex-col items-start gap-1.5">
                    <label className={`${BTN_SECONDARY} cursor-pointer !py-1 !text-xs`}>
                        เลือกไฟล์
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPick} disabled={disabled} />
                    </label>
                    <button type="button" onClick={onCamera} disabled={disabled} className={`${BTN_SECONDARY} !py-1 !text-xs`}><Camera className="w-3.5 h-3.5" /> เปิดกล้อง</button>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><ClipboardPaste className="w-3 h-3" /> คลิกช่องแล้ว Ctrl+V</span>
                    {preview && <button type="button" onClick={onClear} disabled={disabled} className="text-xs font-semibold text-rose-600 hover:underline">ลบรูป</button>}
                </div>
            </div>
        </Field>
    );
};

const emptyForm = {
    name: '', type: '', model: '', ip: '', location: '', note: '',
    portCount: '', parentId: '', parentPort: '', ownPort: '', fromPort: '', toPort: '', portPrefix: '', layoutId: '', macAddress: '', fixAsset: '',
};

const Field = ({ label, required, error, children, hint }) => (
    <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
            {label}{required && <span className="text-rose-500"> *</span>}
        </label>
        {children}
        {hint && !error && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
        {error && <p className="text-[11px] text-rose-600 mt-1" role="alert">{error}</p>}
    </div>
);

const DeviceFormModal = ({
    open, device, layoutId, layoutName, allDevices, types, presetType, onClose, onSaved, layouts = [],
    hidden = false, onStartPick, pickedParent,
}) => {
    const isEdit = !!device;
    const [form, setForm] = useState(emptyForm);
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [saving, setSaving] = useState(false);
    const [cameraFor, setCameraFor] = useState(null); // 'device' | 'site' | null

    useEffect(() => {
        if (!open) return;
        setErrors({});
        setServerError('');
        setSaving(false);
        const firstActive = types.find((t) => t.isActive)?.code || '';
        setForm(device ? {
            name: device.name || '',
            type: device.type || firstActive,
            model: device.model && device.model !== '-' ? device.model : '',
            ip: device.ip && device.ip !== 'N/A' ? device.ip : '',
            location: device.location || '',
            note: device.note || '',
            portCount: device.portCount != null ? String(device.portCount) : '',
            parentId: device.uplinkDeviceId != null ? String(device.uplinkDeviceId) : '',
            parentPort: device.parentPortNo != null ? String(device.parentPortNo) : '',
            ownPort: device.ownPortNo != null ? String(device.ownPortNo) : '',
            portPrefix: device.portPrefix || '',
            fromPort: device.uplinkFromPort || '',
            toPort: device.uplinkToPort || '',
            layoutId: String(device.layoutId ?? layoutId ?? ''),
            macAddress: device.macAddress || '',
            fixAsset: device.fixAsset || '',
        } : { ...emptyForm, type: presetType || firstActive, layoutId: String(layoutId ?? '') });
    }, [open, device, presetType, types]);

    // รับค่าต้นทางที่คลิกเลือกจากผัง
    useEffect(() => {
        if (!pickedParent) return;
        setForm((f) => ({ ...f, parentId: String(pickedParent.id), parentPort: '' }));
        setErrors((er) => ({ ...er, parentId: undefined, parentPort: undefined }));
    }, [pickedParent]);

    // Esc ปิดได้ (ไม่ทำงานขณะซ่อนเพื่อเลือกจากผัง)
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape' && !saving && !hidden && !cameraFor) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, saving, hidden, onClose, cameraFor]);

    const selectedType = findType(types, form.type);
    const selectedStyle = styleOf(selectedType, form.type);

    // ตัวเลือกประเภท: เฉพาะที่เปิดใช้งาน (ถ้าแก้ไขอุปกรณ์ที่ประเภทถูกปิดไปแล้ว ให้ยังแสดงค่าเดิมได้)
    const typeOptions = types.filter((t) => t.isActive || t.code === form.type);

    // ต้นทางที่เลือกได้: ต้องเป็นประเภทที่เป็นต้นทางได้ ไม่ใช่ตัวเอง และไม่ใช่ลูกหลาน (กันวนลูป)
    const parentOptions = useMemo(() => {
        const blocked = device ? descendantIds(allDevices, device.id) : new Set();
        return allDevices
            .filter((d) => (!device || (d.id !== device.id && !blocked.has(d.id))))
            .filter((d) => findType(types, d.type)?.canBeParent)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [allDevices, device, types]);

    const parent = parentOptions.find((d) => String(d.id) === form.parentId) || allDevices.find((d) => String(d.id) === form.parentId) || null;

    // พอร์ตของ parent: ช่องที่มีคนเสียบอยู่แล้ว (ยกเว้นตัวที่กำลังแก้ไข) จะเลือกไม่ได้
    const portChoices = useMemo(() => {
        if (!parent?.portCount) return [];
        const takenBy = new Map();
        for (const d of allDevices) {
            if (d.uplinkDeviceId === parent.id && d.parentPortNo != null && (!device || d.id !== device.id)) {
                takenBy.set(d.parentPortNo, d.name);
            }
        }
        return Array.from({ length: parent.portCount }, (_, i) => {
            const n = i + 1;
            // พอร์ตที่ parent ใช้เชื่อมขึ้นไปหาอุปกรณ์อื่นอยู่แล้ว เลือกเป็นพอร์ตเสียบลูกไม่ได้
            const own = parent.ownPortNo === n ? 'ใช้เชื่อมขึ้นไปอยู่แล้ว' : null;
            return { n, taken: takenBy.get(n) || own };
        });
    }, [parent, allDevices, device]);

    // พอร์ตของอุปกรณ์นี้เองที่ใช้เชื่อมขึ้นไป: ช่องที่อุปกรณ์ลูกเสียบอยู่แล้วเลือกไม่ได้
    const ownChoices = useMemo(() => {
        const n = selectedType?.hasPorts ? Number(form.portCount) || 0 : 0;
        const takenBy = new Map();
        if (device) {
            for (const d of allDevices) {
                if (d.uplinkDeviceId === device.id && d.parentPortNo != null) takenBy.set(d.parentPortNo, d.name);
            }
        }
        return Array.from({ length: n }, (_, i) => ({ n: i + 1, taken: takenBy.get(i + 1) || null }));
    }, [form.portCount, selectedType, allDevices, device]);

    // มีการเชื่อมต่อ (ต้นทาง หรืออุปกรณ์ลูก) อยู่หรือไม่ — ถ้ามี ย้ายผังไม่ได้
    const hasLinks = !!device && (device.uplinkDeviceId != null || allDevices.some((d) => d.uplinkDeviceId === device.id));

    // ── รูปอุปกรณ์ + รูปหน้างาน (แสดงเมื่อชี้เมาส์บนหมุดบนผัง) ──
    const [photoFile, setPhotoFile] = useState(null);
    const [photoPreview, setPhotoPreview] = useState('');
    const [removePhoto, setRemovePhoto] = useState(false);
    const [sitePhotoFile, setSitePhotoFile] = useState(null);
    const [sitePhotoPreview, setSitePhotoPreview] = useState('');
    const [removeSitePhoto, setRemoveSitePhoto] = useState(false);
    useEffect(() => {
        if (!open) return;
        setPhotoFile(null);
        setRemovePhoto(false);
        setPhotoPreview(device?.photoUrl ? floorplanSrc(device.photoUrl) : '');
        setSitePhotoFile(null);
        setRemoveSitePhoto(false);
        setSitePhotoPreview(device?.sitePhotoUrl ? floorplanSrc(device.sitePhotoUrl) : '');
    }, [open, device]);
    useEffect(() => {
        if (!photoFile) return undefined;
        const url = URL.createObjectURL(photoFile);
        setPhotoPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [photoFile]);
    useEffect(() => {
        if (!sitePhotoFile) return undefined;
        const url = URL.createObjectURL(sitePhotoFile);
        setSitePhotoPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [sitePhotoFile]);
    const pickInto = (e, key, setFile, setRemove) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { setErrors((er) => ({ ...er, [key]: 'ไฟล์ใหญ่เกิน 5 MB' })); return; }
        setErrors((er) => ({ ...er, [key]: undefined }));
        setRemove(false);
        setFile(f);
    };
    const pickPhoto = (e) => pickInto(e, 'photo', setPhotoFile, setRemovePhoto);
    const pickSitePhoto = (e) => pickInto(e, 'sitePhoto', setSitePhotoFile, setRemoveSitePhoto);
    const clearPhoto = () => { setPhotoFile(null); setPhotoPreview(''); setRemovePhoto(true); };
    const clearSitePhoto = () => { setSitePhotoFile(null); setSitePhotoPreview(''); setRemoveSitePhoto(true); };

    // ── เครื่องจริงจาก PC / Monitor inventory (ประเภทที่ requiresSource) ──
    const [source, setSource] = useState(null);
    const [srcQuery, setSrcQuery] = useState('');
    const [srcResults, setSrcResults] = useState([]);
    const [srcLoading, setSrcLoading] = useState(false);
    useEffect(() => {
        if (!open) return;
        setSource(device?.source ? { ...device.source, ip: device.ip } : null);
        setSrcQuery('');
    }, [open, device]);
    useEffect(() => {
        if (!open || isEdit || !selectedType?.requiresSource) return undefined;
        const t = setTimeout(async () => {
            setSrcLoading(true);
            const res = await apiCall(`/sources?q=${encodeURIComponent(srcQuery)}`);
            setSrcLoading(false);
            if (res.ok) setSrcResults(res.data);
        }, 250);
        return () => clearTimeout(t);
    }, [open, isEdit, srcQuery, selectedType?.requiresSource]);

    if (!open) return null;

    const set = (key) => (e) => {
        const value = e.target.value;
        setForm((f) => ({ ...f, [key]: value, ...(key === 'parentId' ? { parentPort: '' } : {}) }));
        if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
    };

    const submit = async (e) => {
        e?.preventDefault?.();
        if (saving) return;
        const v = validateDeviceForm(form, selectedType);
        if (form.parentId && !form.parentPort && !form.fromPort.trim()) v.parentPort = 'กรุณาระบุชื่อพอร์ตหรือหมายเลขพอร์ตของต้นทาง';
        if (form.parentId && !parent) v.parentId = 'ไม่พบอุปกรณ์ต้นทาง';
        if (selectedType?.requiresSource && !isEdit && !source) v.sourceHostname = 'กรุณาเลือกเครื่องจาก Inventory';
        if (source?.adapter === 'Wi-Fi' && form.parentId) v.parentId = 'เครื่อง Wi-Fi เชื่อมพอร์ตไม่ได้';
        setErrors(v);
        setServerError('');
        if (Object.keys(v).length) return;

        const payload = {
            layoutId: Number(form.layoutId) || layoutId,
            macAddress: form.macAddress.trim(),
            fixAsset: form.fixAsset.trim(),
            name: form.name.trim(),
            deviceType: form.type,
            portCount: selectedType?.hasPorts ? Number(form.portCount) : null,
            model: form.model.trim(),
            ipAddress: form.ip.trim() || 'N/A',
            location: form.location.trim(),
            note: form.note.trim(),
            uplinkDeviceId: form.parentId ? Number(form.parentId) : null,
            parentPortNo: form.parentId && form.parentPort ? Number(form.parentPort) : null,
            ownPortNo: form.parentId && selectedType?.hasPorts && form.ownPort ? Number(form.ownPort) : null,
            ...(selectedType?.requiresSource && !isEdit ? { sourceTable: source?.table, sourceHostname: source?.hostname } : {}),
            portPrefix: form.portPrefix.trim(),
            uplinkFromPort: form.parentId ? form.fromPort.trim() : '',
            uplinkToPort: form.parentId ? form.toPort.trim() : '',
            x: isEdit ? device.x : 50,
            y: isEdit ? device.y : 50,
        };

        setSaving(true);
        const res = isEdit
            ? await apiCall(`/devices/${device.id}`, { method: 'PUT', body: JSON.stringify(payload) })
            : await apiCall('/devices', { method: 'POST', body: JSON.stringify(payload) });
        setSaving(false);

        if (!res.ok) { setServerError(res.error); return; }
        // รูปอุปกรณ์ / รูปหน้างาน: ส่งแยกหลังบันทึกข้อมูล
        const devId = res.data.id;
        const sendPhoto = async (file, remove, route) => {
            if (file) {
                const fd = new FormData();
                fd.append('photo', file);
                try { await fetch(`${NETATLAS_API}/devices/${devId}${route}`, { method: 'PUT', body: fd }); } catch { /* ข้อมูลถูกบันทึกแล้ว */ }
            } else if (remove && isEdit) {
                await apiCall(`/devices/${devId}${route}`, { method: 'DELETE' });
            }
        };
        await sendPhoto(photoFile, removePhoto, '/photo');
        await sendPhoto(sitePhotoFile, removeSitePhoto, '/site-photo');
        onSaved(res.data, isEdit ? 'updated' : 'created');
    };

    return (
        <Portal>
            <div className={`fixed inset-0 z-[9990] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 ${hidden ? 'hidden' : ''}`}
                onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
                <div role="dialog" aria-modal="true" aria-labelledby="netatlas-form-title"
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="min-w-0">
                            <h3 id="netatlas-form-title" className="text-base font-black text-slate-800">
                                {isEdit ? 'แก้ไขอุปกรณ์' : `เพิ่ม${selectedStyle.label}`}
                            </h3>
                            <p className="text-[11px] text-slate-400 truncate">ผัง: {layoutName || '-'}</p>
                        </div>
                        <button type="button" onClick={onClose} disabled={saving} aria-label="ปิด"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-5" noValidate>
                        {/* 1. ข้อมูลพื้นฐาน */}
                        <section className="space-y-3">
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">ข้อมูลพื้นฐาน</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <PhotoField label="รูปอุปกรณ์" hint="ตัวเครื่องจริง" preview={photoPreview} onPick={pickPhoto} onClear={clearPhoto} onCamera={() => setCameraFor('device')} disabled={saving} error={errors.photo} />
                                <PhotoField label="รูปหน้างาน" hint="ตำแหน่งที่ติดตั้ง" preview={sitePhotoPreview} onPick={pickSitePhoto} onClear={clearSitePhoto} onCamera={() => setCameraFor('site')} disabled={saving} error={errors.sitePhoto} />
                            </div>
                            {isEdit && (
                                <Field label="ผัง" error={errors.layoutId}
                                    hint={hasLinks ? 'ต้องปลดการเชื่อมต่อ (ต้นทาง และอุปกรณ์ลูก) ก่อนจึงย้ายไปผังอื่นได้' : 'ย้ายไปผังอื่นได้ เมื่อไม่มีการเชื่อมต่อ'}>
                                    <select className={INPUT} value={form.layoutId} onChange={set('layoutId')} disabled={hasLinks}>
                                        {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                </Field>
                            )}
                            {selectedType?.requiresSource && (
                                <Field label="เครื่องจริง (จาก PC / Monitor Inventory)" required error={errors.sourceHostname}
                                    hint="ดึงเฉพาะเครื่องที่ใช้งานอยู่และยังไม่ถูกวางในผังใด">
                                    {source ? (
                                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                            <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">{source.table}</span>
                                            <span className="font-mono font-bold text-slate-800">{source.hostname}</span>
                                            <span className="font-mono text-slate-500">{source.ip || 'N/A'}</span>
                                            <span className={`px-1.5 py-0.5 rounded font-bold ${source.adapter === 'Ethernet' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{source.adapter || '-'}</span>
                                            {!isEdit && <button type="button" onClick={() => { setSource(null); setForm((f) => ({ ...f, name: '' })); }} className="ml-auto text-indigo-600 font-semibold hover:underline">เปลี่ยนเครื่อง</button>}
                                        </div>
                                    ) : isEdit ? (
                                        <p className="text-xs text-slate-400">ไม่พบข้อมูลเครื่องในตารางต้นทาง</p>
                                    ) : (
                                        <div>
                                            <input type="search" value={srcQuery} onChange={(e) => setSrcQuery(e.target.value)} placeholder="พิมพ์ชื่อเครื่อง (hostname)" className={INPUT} aria-label="ค้นหาเครื่อง" />
                                            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                                                {srcLoading && <p className="px-3 py-2 text-xs text-slate-400">กำลังค้นหา…</p>}
                                                {!srcLoading && srcResults.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">ไม่พบเครื่องที่ใช้งานอยู่และยังไม่ถูกวาง</p>}
                                                {!srcLoading && srcResults.map((r) => (
                                                    <button key={`${r.table}-${r.hostname}`} type="button"
                                                        onClick={() => { setSource(r); setForm((f) => ({ ...f, name: r.hostname })); setErrors((er) => ({ ...er, sourceHostname: undefined })); }}
                                                        className="w-full text-left px-3 py-2 flex flex-wrap items-center gap-2 text-xs hover:bg-slate-50">
                                                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">{r.table}</span>
                                                        <span className="font-mono font-bold text-slate-800">{r.hostname}</span>
                                                        <span className="font-mono text-slate-500">{r.ip || 'N/A'}</span>
                                                        <span className={`px-1.5 py-0.5 rounded font-bold ${r.adapter === 'Ethernet' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{r.adapter || '-'}</span>
                                                        {r.user && <span className="text-slate-400 truncate">{r.user}</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </Field>
                            )}
                            {!selectedType?.requiresSource && (
                            <Field label="ชื่ออุปกรณ์" required error={errors.name}>
                                <input className={INPUT} value={form.name} onChange={set('name')} placeholder="เช่น SW-Core-01 หรือ AP-Lobby" autoFocus maxLength={120} />
                            </Field>)}
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="ประเภท (จาก master)" required error={errors.type}>
                                    <select className={INPUT} value={form.type} onChange={set('type')}>
                                        {typeOptions.map((t) => (
                                            <option key={t.code} value={t.code}>{t.label}{!t.isActive ? ' (ปิดใช้งาน)' : ''}</option>
                                        ))}
                                    </select>
                                </Field>
                                {!selectedType?.requiresSource && (
                                <Field label="IP Address" error={errors.ip} hint="เว้นว่างได้ ระบบจะใช้ N/A">
                                    <input className={INPUT} value={form.ip} onChange={set('ip')} placeholder="192.168.1.x" maxLength={45} inputMode="decimal" />
                                </Field>
                                )}
                            </div>
                            {selectedType?.hasPorts && (
                                <Field label="จำนวนพอร์ต (ไม่บังคับ)" error={errors.portCount} hint="ถ้ากรอก ระบบจะช่วยตรวจหมายเลขพอร์ตไม่ให้เกิน เว้นว่างได้">
                                    <div className="flex items-center gap-2">
                                        <input className={`${INPUT} w-28`} type="number" min={1} max={96} value={form.portCount} onChange={set('portCount')} placeholder="เช่น 8" />
                                        <div className="flex gap-1">
                                            {[4, 8, 16, 24, 48].map((n) => (
                                                <button key={n} type="button" onClick={() => setForm((f) => ({ ...f, portCount: String(n) }))}
                                                    className={`px-2 py-1 rounded-md text-[11px] font-semibold border ${String(form.portCount) === String(n) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{n}</button>
                                            ))}
                                        </div>
                                    </div>
                                </Field>
                            )}
                            {selectedType?.hasPorts && (
                                <Field label="รูปแบบชื่อพอร์ต" hint="ใช้ตั้งชื่อพอร์ตบนเส้น เช่น Gi1/0/ จะได้ Gi1/0/23 (เว้นว่าง = P23)">
                                    <input className={`${INPUT} font-mono`} value={form.portPrefix} onChange={set('portPrefix')} maxLength={40} placeholder="เช่น Gi1/0/ หรือ Port " />
                                </Field>
                            )}
                            <Field label="ยี่ห้อ / รุ่น">
                                <input className={INPUT} value={form.model} onChange={set('model')} placeholder="เช่น Cisco SG350-24P" maxLength={200} />
                            </Field>
                            <Field label="จุดติดตั้ง / ห้อง" required error={errors.location}>
                                <input className={INPUT} value={form.location} onChange={set('location')} placeholder="เช่น ตู้ Rack ห้อง Server ชั้น 1" maxLength={200} />
                            </Field>
                        </section>

                        {/* 2. การเชื่อมต่อ uplink: ชื่อพอร์ต (ตามอุปกรณ์จริง) + หมายเลขพอร์ต (ไม่บังคับ) */}
                        <section className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/50 p-4">
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-sky-700">การเชื่อมต่อต้นทาง (Uplink)</h4>
                            {source?.adapter === 'Wi-Fi' && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">เครื่องนี้ใช้ Wi-Fi วางบนผังได้ แต่เชื่อมพอร์ตไม่ได้ (เชื่อมได้เฉพาะสาย Ethernet)</p>
                            )}
                            <Field label="ต่อพ่วงจากอุปกรณ์" error={errors.parentId} hint={parentOptions.length ? 'ไม่เลือก = เป็นอุปกรณ์ต้นทาง (Core)' : 'ยังไม่มีอุปกรณ์ประเภทที่เป็นต้นทาง'}>
                                <div className="flex gap-2">
                                    <select className={`${INPUT} flex-1 min-w-0`} value={form.parentId} onChange={set('parentId')} disabled={source?.adapter === 'Wi-Fi'}>
                                        <option value="">— ไม่มี (Core) —</option>
                                        {parentOptions.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name} ({findType(types, d.type)?.shortLabel || d.type}{d.portCount ? `, ${d.portCount} พอร์ต` : ''}) — {d.location}</option>
                                        ))}
                                    </select>
                                    <button type="button" onClick={() => onStartPick?.()} disabled={saving || source?.adapter === 'Wi-Fi'}
                                        className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg border border-sky-300 bg-white text-sky-700 text-xs font-bold hover:bg-sky-50 disabled:opacity-40">
                                        <MousePointerClick className="w-4 h-4" /> เลือกจากผัง
                                    </button>
                                </div>
                            </Field>
                            {form.parentId && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label={`พอร์ตของ ${parent?.name || 'ต้นทาง'}`} required error={errors.parentPort} hint="พิมพ์ชื่อ เช่น Gi1/0/23 (หรือเลือกหมายเลขทางขวา)">
                                        <input className={`${INPUT} font-mono`} value={form.fromPort} onChange={set('fromPort')} placeholder="เช่น Gi1/0/23" maxLength={50} />
                                    </Field>
                                    <Field label="หมายเลขพอร์ตของต้นทาง (ไม่บังคับ)" hint={parent?.portCount ? 'เลือกจากพอร์ตของต้นทาง' : 'พิมพ์ตัวเลขหรือเว้นว่าง'}>
                                        {parent?.portCount ? (
                                            <select className={INPUT} value={form.parentPort} onChange={set('parentPort')}>
                                                <option value="">— ไม่ระบุ —</option>
                                                {portChoices.map((p) => (
                                                    <option key={p.n} value={p.n} disabled={!!p.taken}>
                                                        {portName(parent, p.n)}{p.taken ? ` — ${p.taken}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input className={INPUT} type="number" min={1} value={form.parentPort} onChange={set('parentPort')} placeholder="เช่น 23" />
                                        )}
                                    </Field>
                                </div>
                            )}
                            {form.parentId && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label="พอร์ตของอุปกรณ์นี้" hint="พิมพ์ชื่อ เช่น Gi1/0/24 หรือ PoE In (ไม่บังคับ)">
                                        <input className={`${INPUT} font-mono`} value={form.toPort} onChange={set('toPort')} placeholder="เช่น Gi1/0/24" maxLength={50} />
                                    </Field>
                                    {selectedType?.hasPorts && (
                                        <Field label="หมายเลขพอร์ตของอุปกรณ์นี้ (ไม่บังคับ)" error={errors.ownPort} hint={ownChoices.length ? 'เลือกจากพอร์ตของอุปกรณ์นี้' : 'กรอกจำนวนพอร์ตข้างบนก่อนจึงจะเลือกได้ หรือพิมพ์ตัวเลข'}>
                                            {ownChoices.length ? (
                                                <select className={INPUT} value={form.ownPort} onChange={set('ownPort')}>
                                                    <option value="">— ไม่ระบุ —</option>
                                                    {ownChoices.map((p) => (
                                                        <option key={p.n} value={p.n} disabled={!!p.taken}>
                                                            {portName({ portPrefix: form.portPrefix }, p.n)}{p.taken ? ` — ใช้โดย ${p.taken}` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input className={INPUT} type="number" min={1} value={form.ownPort} onChange={set('ownPort')} placeholder="เช่น 24" />
                                            )}
                                        </Field>
                                    )}
                                </div>
                            )}
                        </section>

<div className="grid grid-cols-2 gap-3">
                            <Field label="MAC Address" hint={device?.source ? 'ดึงจาก inventory อัตโนมัติ' : 'เช่น 00-1B-44-11-3A-B7'}>
                                <input className={`${INPUT} font-mono`} value={form.macAddress} onChange={set('macAddress')} maxLength={40} placeholder="00-00-00-00-00-00" disabled={!!device?.source} />
                            </Field>
                            <Field label="Fix Asset" hint={device?.source ? 'ดึงจาก inventory อัตโนมัติ' : 'หมายเลขครุภัณฑ์'}>
                                <input className={`${INPUT} font-mono`} value={form.fixAsset} onChange={set('fixAsset')} maxLength={60} placeholder="เช่น FA-000123" disabled={!!device?.source} />
                            </Field>
                        </div>
                        <Field label="หมายเหตุ">
                            <textarea className={`${INPUT} min-h-[64px]`} value={form.note} onChange={set('note')} maxLength={500} placeholder="เช่น 24 Port PoE+, ต่อมาจาก Fiber" />
                        </Field>

                        {serverError && (
                            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{serverError}</div>
                        )}
                    </form>

                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                        <button type="button" onClick={onClose} disabled={saving} className={BTN_SECONDARY}>ยกเลิก</button>
                        <button type="button" onClick={submit} disabled={saving} className={BTN_PRIMARY}>
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มอุปกรณ์'}
                        </button>
                    </div>
                </div>
            </div>
            <CameraCapture
                open={!!cameraFor}
                onClose={() => setCameraFor(null)}
                onCapture={(file) => {
                    const pick = cameraFor === 'site' ? pickSitePhoto : pickPhoto;
                    pick({ target: { files: [file], value: '' } });
                    setCameraFor(null);
                }}
            />
        </Portal>
    );
};

export default DeviceFormModal;
