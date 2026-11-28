import { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Check, Search, Map as MapIcon } from 'lucide-react';
import { API_URL } from '../config/api';

// Mega menu สำหรับเลือกแผนผัง/โรง — ใช้ร่วมกันทั้ง CCTV และ PC Layout
// props:
//  - layouts:    [{ id, name, image_url }]
//  - selectedId: id ที่เลือกอยู่ (null = ยังไม่เลือก)
//  - onSelect:   (id) => void
//  - getStats:   optional (layout) => { total, online } | null  → แสดงจำนวนกล้อง/อุปกรณ์ + online
//  - accent:     'blue' | 'indigo' (สี active)
//  - loading:    boolean
const ACCENT = {
    blue:   { btn: 'bg-blue-600 border-blue-600', text: 'text-blue-600', soft: 'bg-blue-50', ring: 'hover:border-blue-300' },
    indigo: { btn: 'bg-indigo-600 border-indigo-600', text: 'text-indigo-600', soft: 'bg-indigo-50', ring: 'hover:border-indigo-300' },
};

const fullImg = (url) => (!url ? null : url.startsWith('http') ? url : `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`);

export default function LayoutMegaMenu({ layouts = [], selectedId, onSelect, getStats, accent = 'blue', loading = false }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const wrapRef = useRef(null);
    const theme = ACCENT[accent] || ACCENT.blue;

    const current = layouts.find((l) => l.id === selectedId) || null;

    // ปิดเมื่อคลิกนอก หรือกด Esc
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? layouts.filter((l) => (l.name || '').toLowerCase().includes(q)) : layouts;
    }, [layouts, query]);

    const currentStats = current && getStats ? getStats(current) : null;

    const pick = (id) => { onSelect(id); setOpen(false); setQuery(''); };

    return (
        <div ref={wrapRef} className="relative inline-block max-w-full">
            {/* ── Trigger ── */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className={`flex items-center gap-3 pl-3 pr-3 py-2 rounded-xl border bg-white shadow-sm transition-all ${theme.ring} ${open ? theme.text + ' border-slate-300' : 'border-slate-200'}`}
            >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${theme.btn}`}>
                    <MapIcon size={15} />
                </span>
                <span className="text-left min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none">เลือกโรง / แผนผัง</span>
                    <span className="block text-sm font-bold text-slate-800 truncate max-w-[220px] mt-0.5">
                        {loading ? 'กำลังโหลด...' : current ? current.name : layouts.length ? 'ทั้งหมด' : 'ยังไม่มีแผนผัง'}
                    </span>
                </span>
                {currentStats && (
                    <span className="hidden sm:flex items-center gap-1.5 pl-2 ml-1 border-l border-slate-200">
                        <span className="text-sm font-black text-slate-700">{currentStats.total}</span>
                        <span className={`text-[10px] px-1.5 rounded-full font-semibold ${currentStats.online === currentStats.total && currentStats.total > 0 ? 'bg-green-100 text-green-600' : currentStats.online === 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                            {currentStats.online}/{currentStats.total}
                        </span>
                    </span>
                )}
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* ── Mega panel ── */}
            {open && (
                <div className="absolute left-0 top-full mt-2 z-50 w-[min(92vw,820px)] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                        <div className="relative flex-1">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="ค้นหาโรง / แผนผัง..."
                                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] outline-none focus:border-slate-400"
                            />
                        </div>
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">{filtered.length} / {layouts.length} รายการ</span>
                    </div>

                    <div className="p-3 max-h-[60vh] overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="py-10 text-center text-sm text-slate-400">ไม่พบแผนผังที่ค้นหา</div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {filtered.map((l) => {
                                    const isSel = l.id === selectedId;
                                    const stats = getStats ? getStats(l) : null;
                                    const img = fullImg(l.image_url);
                                    return (
                                        <button
                                            key={l.id}
                                            type="button"
                                            onClick={() => pick(l.id)}
                                            className={`group flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                                                isSel ? `${theme.soft} border-current ${theme.text}` : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                {img
                                                    ? <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" />
                                                    : <MapIcon size={16} className="text-slate-300" />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className={`block text-[13px] font-bold truncate ${isSel ? theme.text : 'text-slate-700'}`}>{l.name}</span>
                                                {stats && (
                                                    <span className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="text-[11px] text-slate-500">{stats.total} รายการ</span>
                                                        {stats.total > 0 && (
                                                            <span className={`text-[10px] px-1.5 rounded-full font-semibold ${stats.online === stats.total ? 'bg-green-100 text-green-600' : stats.online === 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                                                                ออนไลน์ {stats.online}/{stats.total}
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                            </span>
                                            {isSel && <Check size={16} className="flex-shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
