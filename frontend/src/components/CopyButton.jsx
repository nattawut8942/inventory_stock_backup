import { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';

// ปุ่มคัดลอกข้อความ — กดแล้วเปลี่ยนเป็นเครื่องหมายถูกชั่วครู่
export default function CopyButton({ text, title = 'คัดลอก', className = '' }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return undefined;
        const t = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(t);
    }, [copied]);

    const copy = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!text) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            setCopied(true);
        } catch {
            /* คัดลอกไม่ได้ก็ไม่ต้องทำอะไรต่อ */
        }
    };

    return (
        <button
            type="button"
            onClick={copy}
            title={copied ? 'คัดลอกแล้ว' : title}
            aria-label={title}
            className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0 ${className}`}
        >
            {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
        </button>
    );
}
