import React, { useMemo, useState } from 'react';
import { X, Minus, Plus, AlertTriangle, Loader2, ClipboardCheck } from 'lucide-react';
import Portal from './Portal';
import { API_BASE } from '../config/api';

// ปรับยอดคงเหลือจริง: ระบุจำนวนที่นับได้ เหตุผล และรายละเอียด แล้วบันทึกเป็นรายการ ADJ
const REASONS = [
  { key: 'miscount', label: 'นับผิด / ตรวจนับพบต่าง', tone: 'indigo' },
  { key: 'damaged', label: 'ชำรุด / เสียหาย', tone: 'orange' },
  { key: 'lost', label: 'สูญหาย', tone: 'rose' },
  { key: 'found', label: 'พบเพิ่ม', tone: 'emerald' },
  { key: 'wrong_entry', label: 'บันทึกผิดก่อนหน้า', tone: 'violet' },
  { key: 'other', label: 'อื่น ๆ', tone: 'slate' },
];
const TONE = {
  indigo: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  orange: 'border-orange-300 bg-orange-50 text-orange-700',
  rose: 'border-rose-300 bg-rose-50 text-rose-700',
  emerald: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  violet: 'border-violet-300 bg-violet-50 text-violet-700',
  slate: 'border-slate-300 bg-slate-100 text-slate-700',
};
const baht = (v) => `฿${Math.round(Number(v) || 0).toLocaleString()}`;

export default function AdjustStockModal({ product, userId, onClose, onDone, showToast }) {
  const current = Number(product.CurrentStock) || 0;
  const price = Number(product.LastPrice) || 0;
  const [actual, setActual] = useState(current);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const diff = actual - current;
  const impact = diff * price;
  const bigChange = current > 0 ? Math.abs(diff) / current >= 0.2 : Math.abs(diff) >= 5;
  const valid = Number.isInteger(actual) && actual >= 0 && diff !== 0 && reason && note.trim().length >= 3;
  const missing = useMemo(() => {
    const m = [];
    if (diff === 0) m.push('จำนวนที่นับได้ (ต้องต่างจากเดิม)');
    if (!reason) m.push('เหตุผล');
    if (note.trim().length < 3) m.push('รายละเอียด (อย่างน้อย 3 ตัวอักษร)');
    return m;
  }, [diff, reason, note]);

  const setQty = (v) => {
    const n = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    setActual(n);
    setErr('');
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr('');
    try {
      const reasonLabel = REASONS.find(r => r.key === reason)?.label || reason;
      const res = await fetch(`${API_BASE}/products/${product.ProductID}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ NewQty: actual, Reason: reasonLabel, Note: note.trim(), UserID: userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'ปรับยอดไม่สำเร็จ');
      showToast?.(`✓ ปรับยอด ${product.ProductName}: ${current} → ${actual}`, 'success');
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[75] bg-slate-900/60 flex items-center justify-center p-4" onClick={busy ? undefined : onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {/* header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><ClipboardCheck size={18} /></span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">ปรับยอดคงเหลือ</p>
                <p className="font-black text-slate-800 truncate">{product.ProductName}</p>
              </div>
            </div>
            <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
          </div>

          <div className="p-5 space-y-5 overflow-y-auto">
            {/* จำนวน: ระบบ vs นับได้ */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-[11px] font-bold text-slate-500">ในระบบ</p>
                <p className="text-3xl font-black text-slate-700 tabular-nums">{current}</p>
              </div>
              <div className={`rounded-xl border p-3 ${diff === 0 ? 'bg-white border-slate-200' : diff > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <p className="text-[11px] font-bold text-slate-500">นับได้จริง</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <button onClick={() => setQty(actual - 1)} disabled={busy || actual <= 0} className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"><Minus size={14} /></button>
                  <input type="number" min={0} value={actual} onChange={(e) => setQty(parseInt(e.target.value, 10))} disabled={busy}
                    className="w-full min-w-0 text-center text-2xl font-black tabular-nums bg-transparent outline-none" aria-label="จำนวนที่นับได้จริง" />
                  <button onClick={() => setQty(actual + 1)} disabled={busy} className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50"><Plus size={14} /></button>
                </div>
              </div>
            </div>

            {/* ผลต่าง */}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
              <span className="text-sm text-slate-500">ผลต่าง</span>
              <span className="flex items-center gap-2">
                <span className={`text-sm font-black tabular-nums px-2.5 py-0.5 rounded-full ${diff === 0 ? 'bg-slate-200 text-slate-600' : diff > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {diff === 0 ? 'ไม่เปลี่ยน' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} ชิ้น`}
                </span>
                {diff !== 0 && price > 0 && <span className="text-xs text-slate-500 tabular-nums">≈ {impact > 0 ? '+' : '−'}{baht(Math.abs(impact))}</span>}
              </span>
            </div>
            {bigChange && diff !== 0 && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> ผลต่างค่อนข้างมาก กรุณาตรวจนับซ้ำก่อนยืนยัน
              </div>
            )}

            {/* เหตุผล */}
            <div>
              <p className="text-[12px] font-bold text-slate-500 mb-2">เหตุผล <span className="text-rose-500">*</span></p>
              <div className="grid grid-cols-2 gap-2">
                {REASONS.map((r) => (
                  <button key={r.key} type="button" onClick={() => setReason(r.key)} disabled={busy}
                    className={`text-left text-[13px] font-semibold px-3 py-2 rounded-xl border transition-all ${reason === r.key ? TONE[r.tone] : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* รายละเอียด */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-bold text-slate-500">รายละเอียด <span className="text-rose-500">*</span></p>
                <span className="text-[11px] text-slate-400 tabular-nums">{note.length}/300</span>
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} disabled={busy} rows={3}
                placeholder="เช่น นับซ้ำแล้วพบ 2 ชิ้นในตู้ชั้น 3 / ชิ้นหนึ่งชำรุดจากการใช้งาน"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none" />
            </div>

            {err && <p className="text-sm text-rose-600 font-semibold">{err}</p>}
          </div>

          {/* footer */}
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
            {missing.length > 0 && <p className="text-[11px] text-slate-500 mb-2">ยังต้องกรอก: {missing.join(' · ')}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={onClose} disabled={busy} className="py-2.5 rounded-xl text-sm font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-100">ยกเลิก</button>
              <button onClick={submit} disabled={!valid || busy}
                className="py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none inline-flex items-center justify-center gap-2">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {diff === 0 ? 'ยืนยันปรับยอด' : `ยืนยันปรับยอด (${diff > 0 ? '+' : ''}${diff})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
