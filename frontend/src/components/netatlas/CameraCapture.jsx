// NetAtlas — เปิดกล้องเพื่อถ่ายรูปอุปกรณ์/หน้างาน (ใช้ getUserMedia ได้ทั้งคอมและมือถือ)
import React, { useEffect, useRef, useState } from 'react';
import { X, Camera } from 'lucide-react';
import Portal from '../Portal';
import { BTN_PRIMARY, BTN_SECONDARY } from './netAtlasConfig';

const CameraCapture = ({ open, onCapture, onClose }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        setError('');
        setReady(false);
        if (!navigator.mediaDevices?.getUserMedia) {
            setError('เบราว์เซอร์นี้เปิดกล้องไม่ได้ (ต้องใช้ https หรือ localhost)');
            return undefined;
        }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
            .then((stream) => {
                if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(() => { /* เล่นวิดีโออัตโนมัติไม่ได้ก็ยังถ่ายได้ */ });
                }
                setReady(true);
            })
            .catch(() => setError('เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์'));
        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const snap = () => {
        const v = videoRef.current;
        if (!v || !v.videoWidth) return;
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        c.toBlob((blob) => {
            if (!blob) return;
            onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-[9995] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
                onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
                <div role="dialog" aria-modal="true" aria-label="ถ่ายรูป" className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Camera className="w-4 h-4 text-indigo-600" /> ถ่ายรูป</h3>
                        <button type="button" onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="bg-black aspect-video flex items-center justify-center">
                        {error
                            ? <p className="text-sm text-rose-300 px-4 text-center">{error}</p>
                            : <video ref={videoRef} playsInline muted className="w-full h-full object-contain" />}
                    </div>
                    <div className="px-4 py-3 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className={BTN_SECONDARY}>ยกเลิก</button>
                        <button type="button" onClick={snap} disabled={!ready} className={BTN_PRIMARY}><Camera className="w-4 h-4" /> ถ่าย</button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

export default CameraCapture;
