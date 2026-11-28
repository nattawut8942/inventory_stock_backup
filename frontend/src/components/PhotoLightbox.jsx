import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';

// แสดงรูปขนาดใหญ่เต็มจอ
// - รูปเดียว: ส่ง src, alt, caption
// - หลายรูป (แกลเลอรี): ส่ง items=[{ src, alt, caption }] และ startIndex
// ปิดด้วยปุ่ม X, คลิกพื้นหลัง หรือ Esc — เลื่อนด้วยปุ่มลูกศรหรือปุ่ม ← → บนคีย์บอร์ด
export default function PhotoLightbox({ src, alt, caption, items, startIndex = 0, onClose }) {
    const list = items?.length ? items : [{ src, alt, caption }];
    const count = list.length;
    const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), count - 1));
    const [broken, setBroken] = useState({}); // { [index]: true } รูปที่โหลดไม่ได้
    const multi = count > 1;

    const move = (d) => setIndex((i) => Math.min(Math.max(i + d, 0), count - 1));

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowLeft') move(-1);
            else if (e.key === 'ArrowRight') move(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [count, onClose]);

    const cur = list[index];
    if (!cur) return null;
    const isBroken = !!broken[index];

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
            <button
                type="button"
                aria-label="ปิด"
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            >
                <X size={20} />
            </button>

            {multi && (
                <button
                    type="button"
                    aria-label="รูปก่อนหน้า"
                    disabled={index === 0}
                    onClick={(e) => { e.stopPropagation(); move(-1); }}
                    className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ChevronLeft size={22} />
                </button>
            )}
            {multi && (
                <button
                    type="button"
                    aria-label="รูปถัดไป"
                    disabled={index === count - 1}
                    onClick={(e) => { e.stopPropagation(); move(1); }}
                    className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ChevronRight size={22} />
                </button>
            )}

            <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
                {isBroken ? (
                    <div className="w-[min(70vw,420px)] h-[50vh] rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 text-white/70">
                        <ImageOff size={28} />
                        <span className="text-sm">ไม่มีรูปของรายการนี้</span>
                    </div>
                ) : (
                    <img
                        key={cur.src}
                        src={cur.src}
                        alt={cur.alt || cur.caption || ''}
                        onError={() => setBroken((b) => ({ ...b, [index]: true }))}
                        className="max-h-[80vh] max-w-[90vw] rounded-xl bg-white object-contain shadow-2xl"
                    />
                )}
                {cur.caption && <span className="text-sm text-white/80 text-center">{cur.caption}</span>}
                {multi && <span className="text-xs text-white/50">{index + 1} / {count}</span>}
            </div>
        </div>,
        document.body
    );
}
