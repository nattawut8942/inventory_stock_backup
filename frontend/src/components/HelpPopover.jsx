import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import Portal from './Portal';

// ปุ่ม ? เล็กๆ เปิดกล่องคำอธิบาย (วางที่ body จึงไม่ถูกตัด · เปิดไปทางขวาถ้ามีที่ · ปิดด้วย X / คลิกนอก / Esc / เลื่อนจอ)
export default function HelpPopover({ title, label = 'คำอธิบาย', width = 420, children }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const ref = useRef(null);
    const popRef = useRef(null);

    const place = () => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const w = Math.min(width, window.innerWidth - 32);
        const preferred = r.left + w <= window.innerWidth - 16 ? r.left : r.right - w;
        const left = Math.max(16, Math.min(preferred, window.innerWidth - w - 16));
        setPos({ top: r.bottom + 8, left, width: w });
    };

    useEffect(() => {
        if (!open) return;
        place();
        const close = () => setOpen(false);
        const onDown = (e) => {
            if (ref.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', close);
        window.addEventListener('scroll', close, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', close);
            window.removeEventListener('scroll', close, true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <div ref={ref} className="relative self-center inline-flex">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-label={label} title={label} aria-expanded={open}
                className={`p-1.5 rounded-full transition-colors ${open ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}>
                <HelpCircle size={18} />
            </button>
            {open && pos && (
                <Portal>
                    <div ref={popRef} role="dialog" aria-label={title || label}
                        style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: `calc(100vh - ${pos.top + 16}px)` }}
                        className="fixed z-[1000] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-left font-normal">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                            <button type="button" onClick={() => setOpen(false)} aria-label="ปิด" className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={14} /></button>
                        </div>
                        {children}
                    </div>
                </Portal>
            )}
        </div>
    );
}
