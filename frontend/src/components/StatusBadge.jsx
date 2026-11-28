// ป้ายสถานะกลาง — ใช้ร่วมกันทั้งหน้า Printer Health และ Ink & Toner (ขนาดและสีเดียวกัน)
const TONES = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rose: 'bg-red-50 text-red-700 ring-red-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    orange: 'bg-orange-50 text-orange-700 ring-orange-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function StatusBadge({ tone = 'slate', icon: Icon, children, title, className = '' }) {
    return (
        <span
            title={title}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ring-1 whitespace-nowrap ${TONES[tone] || TONES.slate} ${className}`}
        >
            {Icon && <Icon size={11} />}
            {children}
        </span>
    );
}
