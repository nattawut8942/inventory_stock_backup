import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Calendar, Image as ImageIcon, Edit2, Check, UploadCloud, Camera, Trash2, ChevronLeft, ChevronRight, Star, FileText, Archive } from 'lucide-react';
import Portal from './Portal';
import { API_BASE, API_URL } from '../config/api';
import { formatThaiDate } from '../utils/formatDate';
import { useAuth } from '../context/AuthContext';

const ActivityViewerModal = ({ albumId, onClose, onUpdated, categories = [], setAlertModal, isAdmin = false }) => {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    // แก้ไขข้อมูลอัลบัม
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ Title: '', Category: 'Network', Description: '', EventDate: '' });
    const [saving, setSaving] = useState(false);

    // เพิ่มรูปเข้าอัลบัมนี้
    const [addingPhoto, setAddingPhoto] = useState(false);
    const [newFiles, setNewFiles] = useState([]);
    const [newCaption, setNewCaption] = useState('');
    const [uploading, setUploading] = useState(false);

    const fetchData = () => {
        if (!albumId) return;
        setLoading(true);
        fetch(`${API_BASE}/albums/${albumId}/photos`)
            .then(res => res.json())
            .then(d => {
                setData(d);
                if (d?.album) {
                    setForm({
                        Title: d.album.Title || '',
                        Category: d.album.Category || 'Network',
                        Description: d.album.Description || '',
                        EventDate: d.album.EventDate ? d.album.EventDate.slice(0, 10) : '',
                    });
                }
            })
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchData(); }, [albumId]);

    if (!albumId) return null;

    const handleSave = async () => {
        if (!isAdmin) return;
        if (!form.Title.trim() || !form.EventDate) return;
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/albums/${albumId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, Role: user?.role }),
            });
            if (res.ok) {
                setEditing(false);
                fetchData();
                onUpdated?.();
            } else {
                const data = await res.json().catch(() => ({}));
                setAlertModal?.({ isOpen: true, type: 'error', title: 'บันทึกไม่สำเร็จ', message: data.error || 'เกิดข้อผิดพลาด' });
            }
        } catch (err) {
            console.error('Update album error:', err);
        }
        setSaving(false);
    };

    const handleAddPhoto = async () => {
        if (newFiles.length === 0) return;
        setUploading(true);
        try {
            let failCount = 0;
            for (const f of newFiles) {
                const formData = new FormData();
                formData.append('imageFile', f);
                formData.append('AlbumID', albumId);
                formData.append('Caption', newCaption);
                formData.append('UserID', user.username);

                const res = await fetch(`${API_BASE}/photos/upload`, { method: 'POST', body: formData });
                if (!res.ok) failCount++;
            }
            setNewFiles([]);
            setNewCaption('');
            setAddingPhoto(false);
            fetchData();
            onUpdated?.();
            if (failCount > 0 && setAlertModal) {
                setAlertModal({
                    isOpen: true,
                    type: 'error',
                    title: 'อัปโหลดไม่ครบ',
                    message: `อัปโหลดสำเร็จ ${newFiles.length - failCount}/${newFiles.length} รูป มีบางรูปอัปโหลดไม่สำเร็จ`,
                    confirmText: 'ปิด',
                    onConfirm: () => setAlertModal(prev => ({ ...prev, isOpen: false })),
                });
            }
        } catch (err) {
            console.error('Add photo error:', err);
        }
        setUploading(false);
    };

    // Lightbox — ดูรูปเต็มจอ เลื่อนซ้าย-ขวาได้
    const [lightboxIndex, setLightboxIndex] = useState(null);

    useEffect(() => {
        if (lightboxIndex === null) return;
        const handleKey = (e) => {
            if (e.key === 'Escape') setLightboxIndex(null);
            if (e.key === 'ArrowLeft') setLightboxIndex(i => (i - 1 + data.photos.length) % data.photos.length);
            if (e.key === 'ArrowRight') setLightboxIndex(i => (i + 1) % data.photos.length);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [lightboxIndex, data]);

    const handleSetCover = async (photoId) => {
        if (!isAdmin) return;
        try {
            const res = await fetch(`${API_BASE}/albums/${albumId}/cover`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ PhotoID: photoId, Role: user?.role }),
            });
            if (res.ok) {
                onUpdated?.();
            } else {
                const data = await res.json().catch(() => ({}));
                setAlertModal?.({ isOpen: true, type: 'error', title: 'ตั้งปกไม่สำเร็จ', message: data.error || 'เกิดข้อผิดพลาด' });
            }
        } catch (err) {
            console.error('Set cover error:', err);
        }
    };

    const handleDeletePhoto = async (photoId) => {
        if (!isAdmin) return;
        const doDelete = async () => {
            try {
                const res = await fetch(`${API_BASE}/photos/${photoId}?role=${encodeURIComponent(user?.role || '')}`, { method: 'DELETE' });
                if (res.ok) {
                    fetchData();
                    onUpdated?.();
                } else {
                    const data = await res.json().catch(() => ({}));
                    setAlertModal?.({ isOpen: true, type: 'error', title: 'ลบไม่สำเร็จ', message: data.error || 'เกิดข้อผิดพลาด' });
                }
            } catch (err) {
                console.error('Delete photo error:', err);
            }
        };

        if (!setAlertModal) { doDelete(); return; }
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบรูปนี้',
            message: 'ลบรูปนี้ออกจากอัลบัม? การกระทำนี้ไม่สามารถย้อนกลับได้',
            confirmText: 'ลบ',
            cancelText: 'ยกเลิก',
            onConfirm: () => { doDelete(); setAlertModal(prev => ({ ...prev, isOpen: false })); },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false })),
        });
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative bg-white w-full h-full sm:h-[90vh] sm:w-[90vw] sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10 sticky top-0">
                        {!editing ? (
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">{data?.album?.Title || 'กำลังโหลด...'}</h3>
                                {data?.album && (
                                    <p className="text-sm text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                                        <span className="flex items-center gap-1"><Calendar size={14} /> {formatThaiDate(data.album.EventDate)}</span>
                                        <span className="flex items-center gap-1"><ImageIcon size={14} /> {data.photos.length} รูปภาพ</span>
                                        {data.album.CreatedBy && (
                                            <span className="text-xs text-slate-400">
                                                สร้างโดย {data.album.CreatedBy} · {formatThaiDate(data.album.CreatedAt)}
                                            </span>
                                        )}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 max-w-lg space-y-2">
                                <input
                                    value={form.Title}
                                    onChange={(e) => setForm(f => ({ ...f, Title: e.target.value }))}
                                    placeholder="ชื่ออัลบัม"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-base font-bold"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        value={form.Category}
                                        onChange={(e) => setForm(f => ({ ...f, Category: e.target.value }))}
                                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                                    >
                                        {categories.map(c => <option key={c.CategoryCode} value={c.CategoryCode}>{c.Label}</option>)}
                                    </select>
                                    <input
                                        type="date"
                                        value={form.EventDate}
                                        onChange={(e) => setForm(f => ({ ...f, EventDate: e.target.value }))}
                                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                                    />
                                </div>
                                <textarea
                                    value={form.Description}
                                    onChange={(e) => setForm(f => ({ ...f, Description: e.target.value }))}
                                    placeholder="คำโปรยสั้นๆ (ไม่บังคับ)"
                                    rows={2}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm resize-none"
                                />
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            {!editing && (
                                <>
                                    <a
                                        href={`${API_BASE}/albums/${albumId}/export/pdf`}
                                        target="_blank" rel="noreferrer"
                                        title="ส่งออกเป็น PDF"
                                        className="text-sm text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                                    >
                                        <FileText size={14} /> PDF
                                    </a>
                                    <a
                                        href={`${API_BASE}/albums/${albumId}/export/zip`}
                                        target="_blank" rel="noreferrer"
                                        title="ดาวน์โหลดรูปทั้งหมด (ZIP)"
                                        className="text-sm text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                                    >
                                        <Archive size={14} /> ZIP
                                    </a>
                                </>
                            )}
                            {editing ? (
                                <>
                                    <button onClick={() => setEditing(false)} className="text-sm text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-100">ยกเลิก</button>
                                    <button onClick={handleSave} disabled={saving} className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                                        <Check size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                                    </button>
                                </>
                            ) : (
                                isAdmin && (
                                    <button onClick={() => setEditing(true)} className="text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                                        <Edit2 size={14} /> แก้ไขข้อมูล
                                    </button>
                                )
                            )}
                            <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                        {loading ? (
                            <div className="text-center py-16 text-slate-400">กำลังโหลดรูปภาพ...</div>
                        ) : (
                            <>
                                {/* เพิ่มรูป */}
                                {!addingPhoto ? (
                                    <button
                                        onClick={() => setAddingPhoto(true)}
                                        className="mb-6 flex items-center gap-2 bg-white border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 text-slate-500 hover:text-indigo-600 px-4 py-3 rounded-xl transition-all text-sm font-medium"
                                    >
                                        <Camera size={16} /> เพิ่มรูปเข้าอัลบัมนี้
                                    </button>
                                ) : (
                                    <div className="mb-6 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                                        <label className="border border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all">
                                            <UploadCloud size={18} className="text-slate-400 mb-1" />
                                            <span className="text-sm text-slate-600">
                                                {newFiles.length > 0 ? `เลือกแล้ว ${newFiles.length} รูป` : 'คลิกเพื่อเลือกรูป (เลือกได้หลายรูป)'}
                                            </span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                                            />
                                        </label>
                                        {newFiles.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {newFiles.map((f, i) => (
                                                    <span key={i} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-1 rounded-md truncate max-w-[140px]">{f.name}</span>
                                                ))}
                                            </div>
                                        )}
                                        <input
                                            value={newCaption}
                                            onChange={(e) => setNewCaption(e.target.value)}
                                            placeholder="คำบรรยายรูป (ใช้ร่วมกันทุกรูปที่เลือก ไม่บังคับ)"
                                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                                        />
                                        <div className="flex gap-2 justify-end">
                                            <button onClick={() => { setAddingPhoto(false); setNewFiles([]); setNewCaption(''); }} className="text-sm text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-100">ยกเลิก</button>
                                            <button onClick={handleAddPhoto} disabled={newFiles.length === 0 || uploading} className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
                                                {uploading ? 'กำลังอัปโหลด...' : `บันทึก ${newFiles.length || ''} รูป`}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Grid รูป */}
                                {!data || data.photos.length === 0 ? (
                                    <div className="text-center py-16 text-slate-400">ยังไม่มีรูปในอัลบัมนี้</div>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                        {data.photos.map((photo, idx) => {
                                            const isCover = data?.album?.CoverImageURL && photo.ImageURL === data.album.CoverImageURL;
                                            return (
                                            <div
                                                key={photo.PhotoID}
                                                className="aspect-square rounded-lg overflow-hidden bg-slate-200 group relative cursor-pointer"
                                                onClick={() => setLightboxIndex(idx)}
                                            >
                                                <img src={`${API_URL}${photo.ThumbnailURL || photo.ImageURL}`} alt={photo.Caption || ''} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                                                <div className="absolute top-2 left-2 right-2 flex justify-between">
                                                    {isAdmin && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleSetCover(photo.PhotoID); }}
                                                            className={`w-7 h-7 rounded-full backdrop-blur transition-all flex items-center justify-center ${
                                                                isCover
                                                                    ? 'bg-amber-400 text-white opacity-100'
                                                                    : 'bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-amber-500'
                                                            }`}
                                                            title={isCover ? 'รูปปกปัจจุบัน' : 'ตั้งเป็นปกอัลบัม'}
                                                        >
                                                            <Star size={12} fill={isCover ? 'currentColor' : 'none'} />
                                                        </button>
                                                    )}
                                                    {isAdmin && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.PhotoID); }}
                                                            className="w-7 h-7 rounded-full bg-black/60 backdrop-blur text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all flex items-center justify-center ml-auto"
                                                            title="ลบรูปนี้"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                                {(photo.Caption || photo.UploadedBy) && (
                                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[11px] px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {photo.Caption && <p className="truncate">{photo.Caption}</p>}
                                                        {photo.UploadedBy && (
                                                            <p className="text-white/70 truncate">{photo.UploadedBy} · {formatThaiDate(photo.UploadedAt)}</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </motion.div>

                {/* Lightbox — ดูรูปเต็มจอ */}
                {lightboxIndex !== null && data?.photos?.[lightboxIndex] && (
                    <div
                        className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center"
                        onClick={() => setLightboxIndex(null)}
                    >
                        <button
                            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
                            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                        >
                            <X size={20} />
                        </button>

                        {data.photos.length > 1 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => (i - 1 + data.photos.length) % data.photos.length); }}
                                className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                            >
                                <ChevronLeft size={22} />
                            </button>
                        )}

                        <img
                            src={`${API_URL}${data.photos[lightboxIndex].ImageURL}`}
                            alt={data.photos[lightboxIndex].Caption || ''}
                            onClick={(e) => e.stopPropagation()}
                            className="max-h-[82vh] max-w-[90vw] object-contain"
                        />

                        {data.photos.length > 1 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => (i + 1) % data.photos.length); }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                            >
                                <ChevronRight size={22} />
                            </button>
                        )}

                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center max-w-lg px-4">
                            {data.photos[lightboxIndex].Caption && (
                                <p className="text-white text-sm mb-1">{data.photos[lightboxIndex].Caption}</p>
                            )}
                            <p className="text-white/60 text-xs">
                                {lightboxIndex + 1} / {data.photos.length}
                                {data.photos[lightboxIndex].UploadedBy && ` · ${data.photos[lightboxIndex].UploadedBy}`}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </Portal>
    );
};

export default ActivityViewerModal;