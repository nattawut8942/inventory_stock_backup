import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

// กล่องยืนยันที่ออกแบบเอง แทน window.confirm
// ใช้: const ok = await confirmDialog({ title, message, confirmText, danger, preview })
// ต้องมี <ConfirmHost /> ไว้ในแอปหนึ่งจุด (ติดตั้งที่ App.jsx แล้ว)
const EVENT = 'app:confirm';
export const confirmDialog = (options = {}) => new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...options, resolve } }));
});

export function ConfirmHost() {
    const [req, setReq] = useState(null);

    useEffect(() => {
        const onAsk = (e) => setReq(e.detail);
        window.addEventListener(EVENT, onAsk);
        return () => window.removeEventListener(EVENT, onAsk);
    }, []);

    useEffect(() => {
        if (!req) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Enter') close(true);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [req]);

    const close = (result) => {
        if (!req) return;
        req.resolve(result);
        setReq(null);
    };

    if (!req) return null;

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => close(false)}>
            <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
                className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${req.danger ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        <AlertTriangle size={18} />
                    </div>
                    <div className="min-w-0">
                        <h3 id="confirm-title" className="font-black text-slate-800">{req.title || 'ยืนยันการทำรายการ'}</h3>
                        {req.message && <p className="text-sm text-slate-500 mt-1">{req.message}</p>}
                    </div>
                </div>

                {req.preview && <div className="mt-4">{req.preview}</div>}

                <div className="flex gap-3 mt-6">
                    <button type="button" onClick={() => close(false)}
                        className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-200">
                        {req.cancelText || 'ยกเลิก'}
                    </button>
                    <button type="button" autoFocus onClick={() => close(true)}
                        className={`flex-1 text-white py-2.5 rounded-xl font-bold text-sm shadow-sm ${req.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                        {req.confirmText || 'ยืนยัน'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default ConfirmHost;
