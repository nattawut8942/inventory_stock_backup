import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

// แจ้งผลสำเร็จ/ล้มเหลวแบบ toast — เรียกได้จากทุกที่: toast.success('บันทึกแล้ว')
// ต้องมี <ToastHost /> ไว้ในแอปหนึ่งจุด (ติดตั้งที่ App.jsx แล้ว)
const EVENT = 'app:toast';
const emit = (type, message, duration) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { type, message, duration } }));
};
export const toast = {
    success: (message, duration = 3000) => emit('success', message, duration),
    error: (message, duration = 5000) => emit('error', message, duration),
    info: (message, duration = 3000) => emit('info', message, duration),
};

const STYLE = {
    success: { icon: CheckCircle2, box: 'border-emerald-200 bg-emerald-50 text-emerald-800', icoClass: 'text-emerald-600' },
    error: { icon: XCircle, box: 'border-red-200 bg-red-50 text-red-800', icoClass: 'text-red-600' },
    info: { icon: Info, box: 'border-indigo-200 bg-indigo-50 text-indigo-800', icoClass: 'text-indigo-600' },
};

export function ToastHost() {
    const [items, setItems] = useState([]);

    useEffect(() => {
        const onToast = (e) => {
            const { type = 'info', message, duration = 3000 } = e.detail || {};
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            setItems((prev) => [...prev.slice(-3), { id, type, message }]);
            setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), duration);
        };
        window.addEventListener(EVENT, onToast);
        return () => window.removeEventListener(EVENT, onToast);
    }, []);

    if (items.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 w-[min(92vw,360px)] pointer-events-none" aria-live="polite">
            {items.map((t) => {
                const s = STYLE[t.type] || STYLE.info;
                const Icon = s.icon;
                return (
                    <div key={t.id} role="status"
                        className={`pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-4 py-3 shadow-lg ${s.box}`}>
                        <Icon size={18} className={`${s.icoClass} shrink-0 mt-0.5`} />
                        <p className="flex-1 text-sm font-semibold leading-snug">{t.message}</p>
                        <button type="button" aria-label="ปิด"
                            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                            className="text-current/60 hover:opacity-100 opacity-60 p-0.5">
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

export default ToastHost;
