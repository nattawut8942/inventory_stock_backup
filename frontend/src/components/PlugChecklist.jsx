import React, { useState, useMemo } from 'react';
import { Lock, Unlock } from 'lucide-react';
import PhotoPicker from './CameraCapture';
import { MONTHS, RESULT_INFO, SIGN_LEVELS, Sym, currentFiscal, imgUrl } from './PlugShared';

const SHORT = { ok: 'ปกติ', bad: 'ซ่อมด่วน', use: 'ใช้ได้', fix: 'แก้แล้ว' };

// Phone-friendly view: one card per check point with big tap targets
const PlugChecklist = ({
    sheet, month, setMonth, resultMap, signMap, lockedMonths, position, canUnlock,
    onSet, onNote, onPhoto, onFillOk, onSign, onUnlock
}) => {
    const [onlyTodo, setOnlyTodo] = useState(false);
    const stdByCode = useMemo(() => Object.fromEntries((sheet.snapshot.standards || []).map(s => [s.code, s])), [sheet]);
    const eligible = sheet.points.filter(p => month >= p.StartMonth);
    const done = eligible.filter(p => resultMap[`${p.SheetPointID}|${month}`]?.Result).length;
    const locked = lockedMonths.has(month);
    const shown = sheet.points.filter(p => !onlyTodo || (month >= p.StartMonth && !resultMap[`${p.SheetPointID}|${month}`]?.Result));
    const monthLabel = (i) => `${MONTHS[i]}'${String((i < 9 ? sheet.fiscalYear : sheet.fiscalYear + 1) % 100).padStart(2, '0')}`;
    const cur = currentFiscal();

    return (
        <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {MONTHS.map((_, i) => (
                    <button key={i} onClick={() => setMonth(i)}
                        className={`shrink-0 px-3 py-2 rounded-xl text-sm font-bold border ${i === month ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'} ${i === cur.monthIdx && sheet.fiscalYear === cur.fiscalYear && i !== month ? 'ring-2 ring-indigo-200' : ''}`}>
                        {monthLabel(i)}{lockedMonths.has(i) ? ' 🔒' : ''}
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-3">
                <div className="flex items-center justify-between text-sm">
                    <span className="font-black text-slate-700">เดือน {monthLabel(month)}</span>
                    <span className="font-bold text-slate-500">ตรวจแล้ว {done}/{eligible.length}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${eligible.length ? (done / eligible.length) * 100 : 0}%` }} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button disabled={locked || done === eligible.length} onClick={onFillOk}
                        className="flex-1 min-w-[10rem] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">
                        <Sym r="ok" size={18} /> ตั้ง "ปกติ" ให้ทุกจุดที่ยังว่าง
                    </button>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 px-2">
                        <input type="checkbox" checked={onlyTodo} onChange={e => setOnlyTodo(e.target.checked)} className="w-4 h-4" /> เฉพาะที่ยังไม่ตรวจ
                    </label>
                </div>
                {locked && <p className="flex items-center gap-2 text-xs font-bold text-amber-600"><Lock size={14} /> เดือนนี้ถูกเซ็นรับรองแล้ว แก้ไขไม่ได้</p>}
            </div>

            {shown.map(p => {
                const r = resultMap[`${p.SheetPointID}|${month}`];
                const na = month < p.StartMonth;
                const thumb = p.ImageUrl || stdByCode[p.StdCode]?.imageUrl;
                return (
                    <div key={p.SheetPointID} className={`bg-white rounded-2xl border p-3 space-y-3 ${r?.Result ? 'border-slate-200' : 'border-amber-200'} ${na ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-3">
                            <span className="shrink-0 w-10 h-10 rounded-full border-2 border-slate-700 flex items-center justify-center font-black text-slate-700">{p.PointNo}</span>
                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-800 leading-tight">{p.PointName}</p>
                                <p className="text-xs text-slate-500">{p.StdCode ? `แบบ ${p.StdCode}` : ''}{p.Method1 ? ` · ${p.Method1}` : ''}</p>
                            </div>
                            {thumb && <img src={imgUrl(thumb)} alt="" className="w-14 h-14 object-contain shrink-0" />}
                        </div>
                        {na ? (
                            <p className="text-xs text-slate-400">ยังไม่ถึงเดือนที่เริ่มตรวจจุดนี้</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-4 gap-2">
                                    {Object.entries(RESULT_INFO).map(([k, v]) => (
                                        <button key={k} disabled={locked} onClick={() => onSet(p, k)}
                                            className={`min-h-[58px] rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${v.cls} ${r?.Result === k ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300' : 'border-slate-200 bg-white'} disabled:opacity-50`}>
                                            <Sym r={k} size={24} />
                                            <span className="text-slate-600">{SHORT[k]}</span>
                                        </button>
                                    ))}
                                </div>
                                {r?.Result && (
                                    <div className="space-y-2">
                                        <input key={`${p.SheetPointID}|${month}|${r.Note || ''}`} type="text" defaultValue={r.Note || ''} disabled={locked}
                                            placeholder="หมายเหตุ (ถ้ามี)"
                                            onBlur={(e) => { if (e.target.value !== (r.Note || '')) onNote(p, e.target.value); }}
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-500" />
                                        <div className="flex items-center gap-3 flex-wrap">
                                            {!locked && <PhotoPicker onFile={(f) => onPhoto(p, f)} />}
                                            {r.PhotoUrl && <a href={imgUrl(r.PhotoUrl)} target="_blank" rel="noreferrer"><img src={imgUrl(r.PhotoUrl)} alt="" className="h-14 rounded-lg border border-slate-200" /></a>}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                );
            })}
            {!shown.length && <p className="text-center text-slate-400 text-sm py-6">ตรวจครบทุกจุดแล้ว</p>}

            <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-3">
                <p className="font-black text-slate-700 text-sm">เซ็นรับรองเดือน {monthLabel(month)}</p>
                {[['TOP', 'ผู้รับผิดชอบ'], ['BOT', 'ผู้รับทราบ']].map(([slot, label]) => {
                    const s = signMap[`${month}|${slot}`];
                    const allowed = SIGN_LEVELS[slot].includes(position);
                    return (
                        <div key={slot} className="flex items-center justify-between gap-3 border border-slate-100 rounded-xl p-2.5">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-700">{label} <span className="text-slate-400 font-medium">({SIGN_LEVELS[slot].join(', ')})</span></p>
                                {s && <p className="text-xs text-indigo-600">{s.SignedBy} · {s.Position} · {new Date(s.SignedAt).toLocaleDateString('th-TH')}</p>}
                                {!s && !allowed && <p className="text-xs text-slate-400">ตำแหน่งของคุณ ({position || 'ไม่ระบุ'}) เซ็นช่องนี้ไม่ได้</p>}
                            </div>
                            {!s && <button disabled={!allowed} onClick={() => onSign(slot)} className="shrink-0 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-30">เซ็น</button>}
                            {s && <span className="text-emerald-600 text-xl">✓</span>}
                        </div>
                    );
                })}
                {locked && canUnlock && (
                    <button onClick={onUnlock} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-100 text-amber-700 text-sm font-bold"><Unlock size={16} /> ปลดล็อกเดือนนี้</button>
                )}
            </div>
        </div>
    );
};

export default PlugChecklist;
