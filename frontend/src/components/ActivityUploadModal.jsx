import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, UploadCloud, Camera } from 'lucide-react';
import Portal from './Portal';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';

// ย่อรูปที่ใหญ่เกินไปก่อนอัปโหลด (ด้านยาวสุด 2048px, JPEG 85%) — รูปเล็กหรือไม่ใช่รูปจะส่งต้นฉบับ
const compressImage = async (file) => {
    if (!file.type.startsWith('image/') || file.size < 1.5 * 1024 * 1024) return file;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        if (!blob || blob.size >= file.size) return file;
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (err) {
        return file;
    }
};

const ActivityUploadModal = ({ isOpen, onClose, onUploaded, albums, categories = [], setAlertModal }) => {
    const { user } = useAuth();
    const [dragOver, setDragOver] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [albumQuery, setAlbumQuery] = useState('');
    const [previews, setPreviews] = useState([]);

    const [mode, setMode] = useState('existing'); // 'existing' | 'new'
    const [albumId, setAlbumId] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [category, setCategory] = useState('');

    useEffect(() => {
        if (categories.length > 0 && !category) setCategory(categories[0].CategoryCode);
    }, [categories]);
    const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [caption, setCaption] = useState('');
    const [files, setFiles] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    // พรีวิวรูปที่เลือก และคืนหน่วยความจำเมื่อเปลี่ยนไฟล์
    useEffect(() => {
        const urls = files.map(f => URL.createObjectURL(f));
        setPreviews(urls);
        return () => urls.forEach(u => URL.revokeObjectURL(u));
    }, [files]);

    if (!isOpen) return null;

    const pickFiles = (list) => {
        const imgs = Array.from(list || []).filter(f => f.type.startsWith('image/'));
        if (imgs.length > 0) setFiles(imgs);
    };

    const filteredAlbums = albums.filter(a => a.Title.toLowerCase().includes(albumQuery.trim().toLowerCase()));

    const resetForm = () => {
        setMode('existing'); setAlbumId(''); setNewTitle(''); setNewDescription('');
        setCategory(categories[0]?.CategoryCode || '');
        setCaption(''); setFiles([]); setAlbumQuery(''); setProgress({ done: 0, total: 0 });
    };

    const handleSubmit = async () => {
        if (files.length === 0) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด', message: 'กรุณาเลือกรูปภาพอย่างน้อย 1 รูป' });
            return;
        }
        if (mode === 'existing' && !albumId) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด', message: 'กรุณาเลือกอัลบัม' });
            return;
        }
        if (mode === 'new' && !newTitle.trim()) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด', message: 'กรุณาตั้งชื่ออัลบัมใหม่' });
            return;
        }

        setSubmitting(true);
        try {
            let targetAlbumId = albumId;

            if (mode === 'new') {
                const res = await fetch(`${API_BASE}/albums`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        Title: newTitle, Category: category, Description: newDescription, EventDate: eventDate, UserID: user.username,
                    }),
                });
                if (!res.ok) throw new Error('สร้างอัลบัมไม่สำเร็จ');
                const data = await res.json();
                targetAlbumId = data.AlbumID;
            }

            // อัปโหลดทีละไฟล์ วนลูปตามลำดับ (backend รับได้ครั้งละ 1 ไฟล์)
            let failCount = 0;
            setProgress({ done: 0, total: files.length });
            for (const [i, original] of files.entries()) {
                const f = await compressImage(original);
                const formData = new FormData();
                formData.append('imageFile', f);
                formData.append('AlbumID', targetAlbumId);
                formData.append('Caption', caption);
                formData.append('ProductID', '');
                formData.append('UserID', user.username);

                const uploadRes = await fetch(`${API_BASE}/photos/upload`, { method: 'POST', body: formData });
                if (!uploadRes.ok) failCount++;
                setProgress({ done: i + 1, total: files.length });
            }

            if (failCount > 0) {
                const emptyNew = mode === 'new' && failCount === files.length;
                setAlertModal({
                    isOpen: true,
                    type: 'error',
                    title: 'อัปโหลดไม่ครบ',
                    message: emptyNew
                        ? 'สร้างอัลบัมแล้วแต่อัปโหลดรูปไม่สำเร็จ อัลบัมจึงยังว่างอยู่ ลองเพิ่มรูปจากหน้าต่างดูอัลบัม'
                        : `อัปโหลดสำเร็จ ${files.length - failCount}/${files.length} รูป มีบางรูปอัปโหลดไม่สำเร็จ`,
                });
            } else {
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: `อัปโหลด ${files.length} รูปเรียบร้อย` });
            }
            resetForm();
            onUploaded?.();
            onClose();
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด', message: err.message || 'ทำรายการไม่สำเร็จ' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-full max-w-lg bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                        <h3 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
                            <Camera size={18} className="text-indigo-600" /> เพิ่มรูปกิจกรรม
                        </h3>
                        <button onClick={() => { resetForm(); onClose(); }} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"><X size={15} /></button>
                    </div>

                    <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
                        {/* Upload area — เลือกได้หลายไฟล์ */}
                        <label
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFiles(e.dataTransfer.files); }}
                            className={`border border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30'}`}
                        >
                            <UploadCloud size={22} className={`mb-2 ${dragOver ? 'text-indigo-500' : 'text-slate-400'}`} />
                            <span className="text-sm text-slate-600">
                                {dragOver ? 'ปล่อยรูปที่นี่' : files.length > 0 ? `เลือกแล้ว ${files.length} รูป (คลิกหรือลากเพื่อเปลี่ยน)` : 'ลากรูปมาวางที่นี่ หรือคลิกเพื่อเลือก'}
                            </span>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => pickFiles(e.target.files)}
                            />
                        </label>

                        {files.length > 0 && (
                            <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto">
                                {previews.map((src, i) => (
                                    <div key={i} className="relative aspect-square rounded-md overflow-hidden bg-slate-100">
                                        <img src={src} alt={files[i]?.name || ''} className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                                            aria-label={`เอา ${files[i]?.name || 'รูป'} ออก`}
                                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500"
                                        >
                                            <X size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Album mode toggle */}
                        <div className="flex bg-slate-100 p-1 rounded-lg text-sm font-medium">
                            <button onClick={() => setMode('existing')} className={`flex-1 py-1.5 rounded-md transition-all ${mode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>อัลบัมเดิม</button>
                            <button onClick={() => setMode('new')} className={`flex-1 py-1.5 rounded-md transition-all ${mode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>สร้างอัลบัมใหม่</button>
                        </div>

                        {mode === 'existing' ? (
                            <div className="space-y-2">
                                <input
                                    value={albumQuery}
                                    onChange={(e) => setAlbumQuery(e.target.value)}
                                    placeholder="พิมพ์เพื่อค้นหาอัลบัม..."
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                                />
                                <select
                                    value={albumId}
                                    onChange={(e) => setAlbumId(e.target.value)}
                                    size={Math.min(6, Math.max(2, filteredAlbums.length + 1))}
                                    className="w-full border border-slate-200 rounded-lg px-1 py-1 text-sm"
                                >
                                    <option value="">-- เลือกอัลบัม ({filteredAlbums.length}) --</option>
                                    {filteredAlbums.map(a => <option key={a.AlbumID} value={a.AlbumID}>{a.Title}</option>)}
                                </select>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="ชื่ออัลบัม" className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                                <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="คำโปรยสั้นๆ เกี่ยวกับอัลบัมนี้ (ไม่บังคับ) — ใช้โชว์บน Hero" rows={2} className="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
                                <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                                    {categories.map(c => <option key={c.CategoryCode} value={c.CategoryCode}>{c.Label}</option>)}
                                </select>
                                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                            </div>
                        )}

                        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="คำบรรยายรูป (ใช้ร่วมกันทุกรูปที่เลือก ไม่บังคับ)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                    </div>

                    <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
                        <button onClick={() => { resetForm(); onClose(); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-[13px] py-2.5 rounded-xl transition-colors">ยกเลิก</button>
                        <button onClick={handleSubmit} disabled={submitting} className="flex-[2] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-[13px] py-2.5 rounded-xl transition-colors">
                            {submitting ? (progress.total > 0 ? `กำลังอัปโหลด ${progress.done}/${progress.total}` : 'กำลังบันทึก...') : 'บันทึกรูป'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </Portal>
    );
};

export default ActivityUploadModal;