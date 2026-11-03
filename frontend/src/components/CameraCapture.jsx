import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImagePlus, X, RefreshCw, Check, RotateCcw } from 'lucide-react';

const MAX_SIDE = 1600;

// Shrink a captured frame so phone/webcam photos stay small
const frameToFile = (video) => new Promise((resolve) => {
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.88);
});

const CameraModal = ({ onFile, onClose, onUnavailable }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [facing, setFacing] = useState('environment');
    const [error, setError] = useState('');
    const [shot, setShot] = useState(null); // { file, url }

    const stop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    };

    const start = useCallback(async () => {
        stop();
        setError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => { });
            }
        } catch (e) {
            setError(e?.name === 'NotAllowedError' ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง (ตรวจสอบสิทธิ์กล้องของเบราว์เซอร์)' : 'เปิดกล้องไม่ได้ หรือไม่พบกล้องในเครื่องนี้');
        }
    }, [facing]);

    useEffect(() => {
        if (!shot) start();
        return stop;
    }, [start, shot]);

    useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url); }, [shot]);

    const capture = async () => {
        const v = videoRef.current;
        if (!v || !v.videoWidth) return;
        const file = await frameToFile(v);
        stop();
        setShot({ file, url: URL.createObjectURL(file) });
    };

    return createPortal(
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-3">
            <div className="bg-slate-900 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 text-white">
                    <span className="font-bold flex items-center gap-2"><Camera size={18} /> ถ่ายรูป</span>
                    <button onClick={onClose} className="text-slate-300 hover:text-white"><X size={20} /></button>
                </div>
                <div className="bg-black aspect-video flex items-center justify-center">
                    {error ? (
                        <div className="text-center text-slate-200 text-sm px-6 space-y-3">
                            <p>{error}</p>
                            <button onClick={onUnavailable} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 font-bold">ใช้กล้องของเครื่อง / เลือกไฟล์แทน</button>
                        </div>
                    ) : shot ? (
                        <img src={shot.url} alt="" className="max-h-full max-w-full object-contain" />
                    ) : (
                        <video ref={videoRef} playsInline muted className="max-h-full max-w-full" />
                    )}
                </div>
                <div className="flex items-center justify-center gap-3 p-4">
                    {shot ? (
                        <>
                            <button onClick={() => setShot(null)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20"><RotateCcw size={16} /> ถ่ายใหม่</button>
                            <button onClick={() => onFile(shot.file)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600"><Check size={16} /> ใช้รูปนี้</button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20"><RefreshCw size={16} /> สลับกล้อง</button>
                            <button onClick={capture} disabled={!!error} className="flex items-center gap-2 px-6 py-3 rounded-full bg-white text-slate-900 font-black hover:bg-slate-200 disabled:opacity-40"><Camera size={18} /> ถ่าย</button>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

/**
 * Two buttons: take a photo / pick a file.
 * - Secure context (https or localhost) with a camera API: live in-page camera.
 * - Otherwise (e.g. plain http on an intranet host): the phone's own camera via <input capture>.
 */
const PhotoPicker = ({ onFile, disabled = false, className = '' }) => {
    const [open, setOpen] = useState(false);
    const cameraInputRef = useRef(null);
    const fileInputRef = useRef(null);

    const canLiveCamera = typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
    const btn = 'flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40';

    const handle = (e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
    };

    return (
        <div className={`flex items-center gap-2 flex-wrap ${className}`}>
            <button type="button" disabled={disabled} className={btn} onClick={() => (canLiveCamera ? setOpen(true) : cameraInputRef.current?.click())}>
                <Camera size={16} /> ถ่ายรูป
            </button>
            <button type="button" disabled={disabled} className={btn} onClick={() => fileInputRef.current?.click()}>
                <ImagePlus size={16} /> เลือกไฟล์
            </button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handle} />
            {open && (
                <CameraModal
                    onClose={() => setOpen(false)}
                    onFile={(f) => { setOpen(false); onFile(f); }}
                    onUnavailable={() => { setOpen(false); cameraInputRef.current?.click(); }}
                />
            )}
        </div>
    );
};

export default PhotoPicker;
