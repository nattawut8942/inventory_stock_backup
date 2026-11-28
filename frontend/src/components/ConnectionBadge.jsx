import { Usb, Network } from 'lucide-react';

// ป้ายประเภทการเชื่อมต่อของเครื่องพรินเตอร์: Ethernet หรือ USB (พร้อมชื่อคอมพิวเตอร์ที่ต่ออยู่)
export default function ConnectionBadge({ type, host }) {
    const isUsb = type === 'usb';
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                isUsb ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-sky-50 text-sky-700 ring-sky-200'
            }`}
        >
            {isUsb ? <Usb size={11} /> : <Network size={11} />}
            {isUsb ? `USB · ${host || 'ไม่ระบุเครื่อง'}` : 'Ethernet'}
        </span>
    );
}
