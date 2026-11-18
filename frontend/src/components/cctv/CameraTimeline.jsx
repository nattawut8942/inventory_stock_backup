import { useEffect, useState } from 'react';

// ไทม์ไลน์รวมของกล้องตัวเดียว: การเปลี่ยนสถานะ (30 วัน) + ประวัติซ่อม/ถอด เรียงจากใหม่ไปเก่า
const STATUS_TH = { online: 'ออนไลน์', offline: 'ออฟไลน์', unknown: 'ไม่ทราบ', removed: 'ถอดออก', retired: 'เลิกใช้' };
const MAINT_STATUS_TH = {
    pending: 'รอดำเนินการ', in_progress: 'กำลังซ่อม', waiting_parts: 'รอของ', resolved: 'แก้แล้ว',
    removed: 'ถอดออก', repairing: 'ส่งซ่อม', reinstalled: 'ติดตั้งคืน', retired: 'เลิกใช้',
};

function fmt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function CameraTimeline({ cameraId, apiBase }) {
    const [items, setItems] = useState(null);

    useEffect(() => {
        if (!cameraId) return;
        let alive = true;
        setItems(null);
        Promise.all([
            fetch(`${apiBase}/cctv/cameras/${cameraId}/status-history?days=30`).then(r => r.json()).catch(() => ({ data: [] })),
            fetch(`${apiBase}/cctv/maintenance-logs?camera_id=${cameraId}`).then(r => r.json()).catch(() => ({ data: [] })),
        ]).then(([s, m]) => {
            if (!alive) return;
            const statusItems = (s.data || []).map(e => ({
                key: `s${e.id}`, at: e.changed_at, kind: 'status',
                title: `${STATUS_TH[e.prev_status] || e.prev_status || 'เริ่มบันทึก'} → ${STATUS_TH[e.status] || e.status}`,
                sub: e.source === 'manual' ? 'ตั้งด้วยตนเอง' : 'จากการ ping',
            }));
            const maintItems = (m.data || []).map(x => ({
                key: `m${x.id}`, at: x.reported_at, kind: x.log_type === 'repair' ? 'repair' : 'removal',
                title: x.log_type === 'repair' ? `ซ่อม: ${x.issue_type || x.reason || '—'}` : `ถอด: ${x.reason || x.issue_type || '—'}`,
                sub: MAINT_STATUS_TH[x.status] || x.status,
            }));
            setItems([...statusItems, ...maintItems].sort((a, b) => new Date(b.at) - new Date(a.at)));
        });
        return () => { alive = false; };
    }, [cameraId, apiBase]);

    const dot = { status: 'bg-slate-400', repair: 'bg-blue-500', removal: 'bg-orange-500' };

    return (
        <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                ไทม์ไลน์ {items ? `(${items.length})` : ''} <span className="normal-case font-normal">· 30 วันล่าสุด</span>
            </div>
            {items === null && <div className="text-xs text-gray-400 py-2">กำลังโหลด...</div>}
            {items && items.length === 0 && (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">ยังไม่มีเหตุการณ์</div>
            )}
            {items && items.length > 0 && (
                <ol className="relative border-l border-gray-200 ml-1.5 space-y-3 max-h-64 overflow-y-auto pr-1">
                    {items.map(it => (
                        <li key={it.key} className="ml-4">
                            <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${dot[it.kind]}`} />
                            <div className="text-xs text-gray-800 font-medium">{it.title}</div>
                            <div className="text-[11px] text-gray-400">{fmt(it.at)} · {it.sub}</div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
