import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { API_BASE } from '../config/api';
import PhotoLightbox from './PhotoLightbox';

// แสดงรูปจากเครื่องแชร์ CTSP_Pic ตามรหัส (<รหัส>.JPG)
// props:
//   code        รหัสสินค้า (ชื่อไฟล์โดยไม่มีนามสกุล)
//   cover       true = เติมเต็มกรอบ (object-cover), false = เห็นทั้งรูป (object-contain)
//   enlargeable true = คลิกเพื่อดูรูปขนาดใหญ่ (เปิดเฉพาะรูปนี้)
//   onEnlarge   ถ้าส่งมา จะเรียกฟังก์ชันนี้แทนการเปิดรูปเดี่ยว (ใช้กับแกลเลอรี)
//   fallback    JSX ที่แสดงเมื่อไม่มีรูป (ถ้าไม่ส่งจะแสดงไอคอน ImageOff)
export default function CtspPicImage({
    code,
    className = '',
    alt,
    fallback,
    cover = false,
    enlargeable = false,
    onEnlarge,
    ...rest
}) {
    const [failed, setFailed] = useState(false);
    const [open, setOpen] = useState(false);

    if (!code || failed) {
        return fallback ?? (
            <div className={`flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 ${className}`}>
                <ImageOff size={20} />
            </div>
        );
    }

    const src = `${API_BASE}/ctsp-pic/${encodeURIComponent(code)}`;
    const fit = cover ? 'object-cover' : 'object-contain';
    const clickable = enlargeable || !!onEnlarge;

    const handleClick = (e) => {
        if (!clickable) return;
        e.stopPropagation();
        if (onEnlarge) onEnlarge();
        else setOpen(true);
    };

    return (
        <>
            <img
                src={src}
                alt={alt || code}
                loading="lazy"
                onError={() => setFailed(true)}
                onClick={clickable ? handleClick : undefined}
                className={`${fit} bg-white ${clickable ? 'cursor-zoom-in' : ''} ${className}`}
                {...rest}
            />
            {open && (
                <PhotoLightbox src={src} alt={alt || code} caption={code} onClose={() => setOpen(false)} />
            )}
        </>
    );
}
