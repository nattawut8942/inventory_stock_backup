import React, { useEffect, useState } from 'react';
import { X, Loader2, Copy, Check, Sparkles } from 'lucide-react';
import Portal from '../Portal';

// แนะนำ IP ว่างใน subnet: ไม่ถูกจอง ไม่ online และไม่เคยเห็น/ไม่เห็นนานที่สุดก่อน
export default function FreeIPFinder({ api, authHeaders, subnet, canReserve, onPick, onClose }) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [limit, setLimit] = useState(10);
    const [copied, setCopied] = useState('');

    useEffect(() => {
        let alive = true;
        setData(null); setErr('');
        (async () => {
            try {
                const r = await fetch(`${api}/free?subnet=${subnet}&limit=${limit}`, { headers: authHeaders() });
                if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
                const d = await r.json();
                if (alive) setData(d);
            } catch (e) { if (alive) setErr(e.message); }
        })();
        return () => { alive = false; };
    }, [api, subnet, limit, authHeaders]);

    const copy = async (ip) => {
        try { await navigator.clipboard.writeText(ip); setCopied(ip); setTimeout(() => setCopied(''), 1200); } catch { /* ignore */ }
    };

    return (
        <Portal><div className="fixed inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Sparkles size={17} /></span>
                        <div>
                            <h3 className="font-black text-slate-800">หา IP ว่าง</h3>
                            <p className="text-xs text-slate-500 font-mono">{subnet}.0/24{data ? ` · ว่าง ${data.totalFree} IP` : ''}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
                </div>
                <div className="p-4 overflow-y-auto">
                    <p className="text-[11px] text-slate-400 mb-3">เรียงจาก IP ที่ไม่เคยพบ online ก่อน แล้วตามด้วยที่ไม่เห็นมานานที่สุด (ไม่รวม .0 .1 .254 .255) — ปลอดภัยที่สุดที่จะนำไปใช้</p>
                    {err && <p className="text-sm text-red-600">{err}</p>}
                    {!data && !err && <div className="py-10 text-center text-slate-400"><Loader2 className="animate-spin mx-auto" size={20} /></div>}
                    {data && data.suggestions.length === 0 && <p className="py-8 text-center text-sm text-slate-400">ไม่มี IP ว่างใน subnet นี้</p>}
                    {data && (
                        <ul className="space-y-2">
                            {data.suggestions.map((s, i) => (
                                <li key={s.ip_address} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${i === 0 ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100'}`}>
                                    <div className="min-w-0 mr-auto">
                                        <p className="font-mono font-bold text-slate-800">{s.ip_address}{i === 0 && <span className="ml-2 text-[10px] font-bold text-indigo-600 bg-indigo-100 rounded px-1.5 py-0.5 font-sans">แนะนำ</span>}</p>
                                        <p className="text-[11px] text-slate-400">{s.idle_days == null ? 'ไม่เคยพบ online' : `ไม่ online มา ${s.idle_days} วัน`}</p>
                                    </div>
                                    <button onClick={() => copy(s.ip_address)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400" title="คัดลอก">{copied === s.ip_address ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}</button>
                                    {canReserve && <button onClick={() => onPick(s.ip_address)} className="px-3 h-8 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700">จอง</button>}
                                </li>
                            ))}
                        </ul>
                    )}
                    {data && data.totalFree > limit && (
                        <button onClick={() => setLimit(l => Math.min(50, l + 10))} className="mt-3 w-full py-2 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100">แสดงเพิ่ม</button>
                    )}
                </div>
            </div>
        </div>
    </Portal>
    );
}
