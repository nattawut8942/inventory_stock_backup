import { useMemo, useState } from 'react';
import { STATUS_COLOR } from './cctvCanvasUtils';

// จัดการกล้องใน rack จากหน้า rack: ดูกล้องที่ผูกอยู่ (ถอดได้ทีละตัว) และเพิ่มกล้องจากทุกโรงหลายตัวพร้อมกัน
export function RackCameraPicker({ linked, allCameras, rackFactoryId, busy, onLink, onUnlink, onOpenCamera }) {
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState(() => new Set());

    const linkedIds = useMemo(() => new Set(linked.map(c => c.id)), [linked]);
    const candidates = useMemo(() => {
        const q = query.trim().toLowerCase();
        return allCameras
            .filter(c => !linkedIds.has(c.id) && c.status !== 'removed' && c.status !== 'retired')
            .filter(c => !q || [c.name, c.ip_address, c.layout_name, c.model]
                .some(v => (v || '').toLowerCase().includes(q)))
            .slice(0, 60);
    }, [allCameras, linkedIds, query]);

    const toggle = (id) => setPicked(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });

    const linkPicked = async () => {
        const ids = [...picked];
        if (!ids.length) return;
        await onLink(ids);
        setPicked(new Set());
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* กล้องที่ผูกอยู่ */}
            <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                    กล้องที่เชื่อมต่อ ({linked.length})
                </div>
                {linked.length === 0 && (
                    <div className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-lg">ยังไม่มีกล้องใน Rack นี้</div>
                )}
                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                    {linked.map(cam => {
                        const other = cam.factory_layout_id !== rackFactoryId;
                        return (
                            <div key={cam.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                                <button onClick={() => onOpenCamera(cam)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[cam.status] }} />
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-gray-800 truncate">{cam.name}</div>
                                        <div className="text-[11px] text-gray-400 truncate">
                                            {cam.ip_address || '—'}
                                            {other && <span className="ml-2 text-amber-600">↗ อยู่ที่ {cam.layout_name || 'โรงอื่น'}</span>}
                                        </div>
                                    </div>
                                </button>
                                <button onClick={() => onUnlink(cam.id)} disabled={busy}
                                    className="px-2 py-1 text-[11px] rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40">
                                    ถอด
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* เพิ่มกล้องจากทุกโรง */}
            <div className="border-t lg:border-t-0 lg:border-l border-gray-100 pt-3 lg:pt-0 lg:pl-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">เพิ่มกล้องจากทุกโรง</div>
                    <button onClick={linkPicked} disabled={busy || picked.size === 0}
                        className="px-2.5 py-1 text-[11px] rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40">
                        ผูก {picked.size} กล้อง
                    </button>
                </div>
                <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="ค้นหาชื่อ, IP, โรง, model..."
                    className="w-full px-3 py-1.5 mb-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-purple-400" />
                <div className="max-h-[60vh] overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                    {candidates.map(cam => (
                        <label key={cam.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs">
                            <input type="checkbox" checked={picked.has(cam.id)} onChange={() => toggle(cam.id)} className="rounded border-gray-300" />
                            <span className="flex-1 min-w-0 truncate text-gray-800">{cam.name}</span>
                            <span className="text-[10px] text-gray-400 truncate max-w-[40%]">
                                {cam.layout_name || '—'}{cam.rack_id ? ' · มี rack แล้ว' : ''}
                            </span>
                        </label>
                    ))}
                    {candidates.length === 0 && <div className="text-xs text-gray-400 text-center py-3">ไม่พบกล้องที่ตรงกับคำค้น</div>}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                    แสดงสูงสุด 60 รายการ · กล้องที่มี rack อยู่แล้วจะถูกย้ายมา rack นี้เมื่อผูก
                </div>
            </div>
        </div>
    );
}
