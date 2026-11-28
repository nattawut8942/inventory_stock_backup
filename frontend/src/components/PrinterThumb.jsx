import { useState } from 'react';
import { Printer } from 'lucide-react';
import PhotoLightbox from './PhotoLightbox';

// รูปเครื่องขนาดเล็ก (เท่าไอคอนเดิม) กดเพื่อดูขนาดใหญ่ — ถ้าไม่มีรูปแสดงไอคอนเครื่องพิมพ์
export default function PrinterThumb({ src, name, caption }) {
    const [viewing, setViewing] = useState(false);

    if (!src) {
        return (
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Printer size={16} className="text-indigo-600" />
            </div>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewing(true); }}
                title="ดูรูปขนาดใหญ่"
                className="w-9 h-9 rounded-xl bg-white border border-slate-100 p-0.5 shrink-0 overflow-hidden cursor-zoom-in shadow-inner"
            >
                <img src={src} alt={name} loading="lazy" className="w-full h-full object-contain rounded-lg" />
            </button>
            {viewing && (
                <PhotoLightbox src={src} alt={name} caption={caption || name} onClose={() => setViewing(false)} />
            )}
        </>
    );
}
