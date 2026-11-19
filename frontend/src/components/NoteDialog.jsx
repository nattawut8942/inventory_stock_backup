import React, { useEffect, useState } from 'react';
import { FileEdit, Trash2, RotateCcw } from 'lucide-react';
import Portal from './Portal';

// กล่องยืนยันพร้อมช่องหมายเหตุ (แทน window.prompt) — ใช้สไตล์เดียวกับ AlertModal
// tone: 'danger' | 'primary'
export default function NoteDialog({ isOpen, tone = 'primary', title, message, label = 'หมายเหตุ', placeholder = '', required = false, confirmText = 'ยืนยัน', onConfirm, onCancel, busy = false }) {
  const [note, setNote] = useState('');
  useEffect(() => { if (isOpen) setNote(''); }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, busy, onCancel]);
  if (!isOpen) return null;

  const isDanger = tone === 'danger';
  const Icon = isDanger ? Trash2 : RotateCcw;
  const valid = !required || note.trim().length > 0;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={busy ? undefined : onCancel}>
        <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className={`px-6 pt-6 pb-4 text-center ${isDanger ? 'bg-gradient-to-b from-rose-50 to-white' : 'bg-gradient-to-b from-indigo-50 to-white'}`}>
            <div className={`w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center shadow-md ${isDanger ? 'bg-rose-500 text-white' : 'bg-indigo-600 text-white'}`}>
              <Icon size={20} />
            </div>
            <h3 className="font-black text-[17px] text-slate-800">{title}</h3>
            {message && <p className="text-[13px] text-slate-500 mt-1.5 leading-relaxed whitespace-pre-line">{message}</p>}
          </div>
          <div className="px-6 pb-2">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              <FileEdit size={12} /> {label}{required && <span className="text-rose-500">*</span>}
            </label>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} disabled={busy} rows={3} placeholder={placeholder}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 resize-none" />
            <p className="text-right text-[11px] text-slate-400 tabular-nums">{note.length}/300</p>
          </div>
          <div className="flex gap-3 px-6 py-4">
            <button onClick={onCancel} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50">ยกเลิก</button>
            <button onClick={() => valid && onConfirm?.(note.trim() || null)} disabled={busy || !valid}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white shadow-md disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${isDanger ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
