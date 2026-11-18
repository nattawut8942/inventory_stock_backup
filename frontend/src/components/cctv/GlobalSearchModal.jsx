import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { STATUS_COLOR } from './cctvCanvasUtils';

// ── Global Camera Search Modal ────────────────────────────────────────────
export function GlobalSearchModal({ cameras, onSelect, onClose }) {
    const [query, setQuery] = useState('');
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const q = query.trim().toLowerCase();
    const results = (q
        ? cameras.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.ip_address || '').toLowerCase().includes(q) ||
            (c.model || '').toLowerCase().includes(q) ||
            (c.fix_asset || '').toLowerCase().includes(q) ||
            (c.rack_name || '').toLowerCase().includes(q) ||
            (c.switch_name || '').toLowerCase().includes(q) ||
            (c.layout_name || '').toLowerCase().includes(q)
        )
        : cameras
    ).slice(0, 30);

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16, paddingTop: '10vh' }}
            onClick={onClose}
            onKeyDown={e => e.key === 'Escape' && onClose()}>
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '70vh' }}
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
                    <Search size={16} className="text-gray-400 flex-shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="ค้นหากล้อง ชื่อ, IP, model, asset, rack, factory..."
                        className="flex-1 outline-none text-sm bg-transparent"
                    />
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 flex-shrink-0">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {results.length ? results.map(cam => {
                        const hasLoc = cam.location_x !== null && cam.location_y !== null;
                        return (
                            <button key={cam.id}
                                onClick={() => onSelect(cam)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0 transition-colors">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[cam.status] }} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-800 truncate">{cam.name}</div>
                                    <div className="text-[11px] text-gray-400 truncate">
                                        {cam.ip_address || '—'} · {cam.layout_name || 'ไม่ระบุ Factory'}
                                        {cam.rack_name && ` · ${cam.rack_name}`}
                                    </div>
                                </div>
                                {!hasLoc && (
                                    <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex-shrink-0">ไม่มีตำแหน่ง</span>
                                )}
                            </button>
                        );
                    }) : (
                        <div className="text-center py-8 text-gray-400 text-sm">ไม่พบกล้องที่ตรงกับคำค้นหา</div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
