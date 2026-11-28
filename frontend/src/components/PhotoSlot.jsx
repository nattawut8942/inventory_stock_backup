import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { API_BASE, API_URL } from '../config/api';
import PhotoLightbox from './PhotoLightbox';
import { confirmDialog } from './ConfirmDialog';
import { toast } from './Toast';

// ช่องรูปของเครื่องพรินเตอร์ 1 รูป: แสดง กดดูขนาดใหญ่ และอัปโหลด/เปลี่ยน/ลบ (ต้องมีสิทธิ์แก้ไข)
// field     = ชื่อคอลัมน์ URL ที่ backend ส่งมา เช่น 'PhotoUrl' (รูปหลัก) หรือ 'SitePhotoUrl' (รูปหน้างาน)
// endpoint  = path ต่อท้าย /printer-health/:id/ เช่น 'photo' หรือ 'site-photo'
// enablePaste = ให้วางรูปด้วย Ctrl+V ได้ (เปิดเฉพาะรูปหลักเพื่อไม่ให้สองช่องรับรูปซ้ำ)
export default function PhotoSlot({ printer, field, endpoint, label, canEdit, onChanged, enablePaste = false }) {
    const toAbs = (p) => (p ? `${API_URL}${p}` : null);
    const [photoUrl, setPhotoUrl] = useState(toAbs(printer[field]));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [viewing, setViewing] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [pending, setPending] = useState(null); // { file, url } รูปที่เลือกแล้วแต่ยังไม่บันทึก
    const inputRef = useRef(null);
    const endpointUrl = `${API_BASE}/printer-health/${printer.PrinterId}/${endpoint}`;

    useEffect(() => { setPhotoUrl(toAbs(printer[field])); }, [printer[field]]);

    const stage = (file) => {
        setError('');
        setPending((prev) => {
            if (prev) URL.revokeObjectURL(prev.url);
            return { file, url: URL.createObjectURL(file) };
        });
    };
    const cancelPending = () => {
        setPending((prev) => {
            if (prev) URL.revokeObjectURL(prev.url);
            return null;
        });
    };

    const upload = async (file) => {
        setBusy(true);
        setError('');
        try {
            const fd = new FormData();
            fd.append('photo', file);
            const res = await fetch(endpointUrl, { method: 'POST', body: fd });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || 'อัปโหลดรูปไม่สำเร็จ');
            setPhotoUrl(toAbs(json.data.photoUrl));
            toast.success(`บันทึก${label}แล้ว`);
            onChanged?.();
            return true;
        } catch (err) {
            setError(err.message);
            toast.error(err.message);
            return false;
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const savePending = async () => {
        if (!pending) return;
        const ok = await upload(pending.file);
        if (ok) cancelPending();
    };

    const remove = async () => {
        // แสดงรูปที่กำลังจะลบให้เห็นก่อนยืนยัน
        const ok = await confirmDialog({
            title: `ลบ${label}?`,
            message: 'รูปนี้จะถูกลบออกจากระบบ ต้องอัปโหลดใหม่ถ้าต้องการกลับมา',
            confirmText: 'ลบรูป',
            danger: true,
            preview: photoUrl ? (
                <img src={photoUrl} alt={`${label}ที่จะลบ`} className="w-full h-44 object-contain rounded-2xl bg-white border border-slate-100 p-2" />
            ) : null,
        });
        if (!ok) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch(endpointUrl, { method: 'DELETE' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || 'ลบรูปไม่สำเร็จ');
            setPhotoUrl(null);
            toast.success(`ลบ${label}แล้ว`);
            onChanged?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    // วางรูปจาก clipboard (Ctrl+V) — เฉพาะช่องที่เปิด enablePaste และมีสิทธิ์แก้ไข
    useEffect(() => {
        if (!canEdit || !enablePaste) return undefined;
        const onPaste = (e) => {
            const item = Array.from(e.clipboardData?.items || []).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
            const file = item?.getAsFile();
            if (!file) return;
            e.preventDefault();
            stage(file);
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [canEdit, enablePaste, printer.PrinterId]);

    return (
        <div>
            <p className="text-[11px] font-bold text-slate-500 mb-1.5">{label}</p>
            <div
                onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer?.files?.[0];
                    if (!f) return;
                    if (f.type.startsWith('image/')) stage(f);
                    else setError('ลากมาได้เฉพาะไฟล์รูป');
                }}
                className={`rounded-2xl transition-shadow ${dragOver ? 'ring-2 ring-indigo-400' : ''}`}
            >
                {pending && photoUrl ? (
                    // เปลี่ยนรูป: แสดงรูปเดิมคู่กับรูปใหม่ก่อนกดบันทึก
                    <div className="grid grid-cols-2 gap-2">
                        <figure>
                            <figcaption className="text-[10px] font-bold text-slate-400 mb-1">รูปเดิม (จะถูกแทนที่)</figcaption>
                            <img src={photoUrl} alt="รูปเดิม" className="w-full h-44 object-contain rounded-2xl bg-white border border-slate-100 p-2 opacity-70" />
                        </figure>
                        <figure>
                            <figcaption className="text-[10px] font-bold text-indigo-600 mb-1">รูปใหม่ (ยังไม่บันทึก)</figcaption>
                            <img src={pending.url} alt="รูปใหม่ที่เลือก" className="w-full h-44 object-contain rounded-2xl bg-white border-2 border-dashed border-indigo-300 p-2" />
                        </figure>
                    </div>
                ) : pending ? (
                    <img
                        src={pending.url}
                        alt="ตัวอย่างก่อนบันทึก"
                        className="w-full h-56 object-contain rounded-2xl bg-white border-2 border-dashed border-indigo-300 p-2"
                    />
                ) : photoUrl ? (
                    <img
                        src={photoUrl}
                        alt={`${label} ${printer.Name}`}
                        onClick={() => setViewing(true)}
                        className="w-full h-56 object-contain rounded-2xl bg-white border border-slate-100 p-2 cursor-zoom-in shadow-inner"
                    />
                ) : (
                    <div className="h-32 rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-xs text-slate-400">
                        <span>ยังไม่มี{label}</span>
                        {canEdit && enablePaste && <span className="text-[10px]">ลากรูปมาวางที่นี่ หรือกด Ctrl+V</span>}
                        {canEdit && !enablePaste && <span className="text-[10px]">ลากรูปมาวางที่นี่ได้</span>}
                    </div>
                )}
            </div>

            {canEdit && pending && (
                <div className="flex items-center gap-2 mt-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={savePending}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                    >
                        {busy ? 'กำลังบันทึก...' : 'บันทึกรูป'}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={cancelPending}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                    >
                        ยกเลิก
                    </button>
                    <span className="text-[10px] text-amber-600">ยังไม่ได้บันทึก</span>
                </div>
            )}

            {canEdit && !pending && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) stage(f); }}
                    />
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => inputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                    >
                        <Upload size={13} />
                        {busy ? 'กำลังดำเนินการ...' : photoUrl ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                    </button>
                    {photoUrl && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={remove}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                        >
                            <Trash2 size={13} />
                            ลบรูป
                        </button>
                    )}
                    <span className="text-[10px] text-slate-400">JPG, PNG, WEBP ไม่เกิน 5MB</span>
                </div>
            )}
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

            {viewing && photoUrl && (
                <PhotoLightbox src={photoUrl} alt={printer.Name} caption={`${label} · ${printer.Name} · ${printer.IpAddress}`} onClose={() => setViewing(false)} />
            )}
        </div>
    );
}
