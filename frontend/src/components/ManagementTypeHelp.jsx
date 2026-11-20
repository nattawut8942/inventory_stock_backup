import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { MANAGEMENT_TYPES } from '../utils/stockManagement';
import Portal from './Portal';

// ปุ่ม ? เล็กๆ อธิบายประเภทการจัดการสต็อก (กฎตรงกับ utils/stockManagement.js)
const DETAILS = {
  Rotating: {
    example: 'หมึก, เมาส์, คีย์บอร์ด, สาย LAN',
    rules: ['เตือนเมื่อถึงขั้นต่ำ', 'อยู่ในรายการสั่งซื้อ', 'คาดการณ์การใช้ / จุดสั่งซื้อ', 'นับ Dead stock ถ้าไม่เบิกนาน'],
    summary: 'ใช้แล้วต้องเติม',
  },
  Spare: {
    example: 'PSU สำรอง, HDD สำรอง, อะไหล่ Switch',
    rules: ['เตือนเมื่อถึงขั้นต่ำ', 'อยู่ในรายการสั่ง (หัวข้อ "เติมอุปกรณ์สำรอง")', 'ไม่คาดการณ์การใช้', 'ไม่นับ Dead stock'],
    summary: 'เก็บไว้เผื่อเสีย ให้มีไม่ต่ำกว่าขั้นต่ำ',
  },
  Stored: {
    example: 'อุปกรณ์เก่าที่ถอดมา, ของรอจำหน่าย',
    rules: ['แสดงยอดอย่างเดียว', 'ไม่เตือน ไม่อยู่ในรายการสั่ง', 'ไม่คาดการณ์ ไม่เช็คเกินสูงสุด'],
    summary: 'มีเท่าไหร่ก็เท่านั้น',
  },
};

export default function ManagementTypeHelp() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const popRef = useRef(null);

  // วางป๊อปอัปแบบ fixed ใต้ปุ่ม แล้วบีบให้อยู่ในจอ (ไม่โดนตัด/ล้นขอบเมื่อจอแคบ)
  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(352, window.innerWidth - 32);
    // เปิดไปทางขวาของปุ่มถ้ามีที่ ไม่งั้นชิดขวาของปุ่ม (บีบให้อยู่ในจอเสมอ)
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
  }, [open]);

  return (
    <div ref={ref} className="relative self-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="อธิบายประเภทการจัดการ"
        title="ประเภทการจัดการคืออะไร?"
        aria-expanded={open}
        className={`p-1.5 rounded-full transition-colors ${open ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
      >
        <HelpCircle size={18} />
      </button>
      {open && pos && (
        <Portal>
        <div ref={popRef} role="dialog" aria-label="ประเภทการจัดการสต็อก" style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: `calc(100vh - ${pos.top + 16}px)` }} className="fixed z-[1000] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-left">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">ประเภทการจัดการสต็อก</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label="ปิด" className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={14} /></button>
          </div>
          <div className="space-y-3">
            {MANAGEMENT_TYPES.map((t) => {
              const d = DETAILS[t.id];
              return (
                <div key={t.id}>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-px rounded border text-[10px] font-bold ${t.cls}`}>{t.short}</span>
                    <span className="text-sm font-semibold text-slate-700">{t.label}</span>
                    <span className="text-xs text-slate-400">— {d.summary}</span>
                  </div>
                  <ul className="mt-1 ml-1 text-xs text-slate-600 list-disc list-inside space-y-0.5">
                    {d.rules.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                  <p className="mt-0.5 ml-1 text-[11px] text-slate-400">เช่น {d.example}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            แยกจากหมวดอุปกรณ์ และแยกจาก Asset (ที่ต้องกรอก S/N + Fixed Asset) · แก้ได้ที่ปุ่มแก้ไขของแต่ละรายการ
          </p>
        </div>
        </Portal>
      )}
    </div>
  );
}
