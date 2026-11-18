import { useState, useEffect } from 'react';

// ── Camera Maintenance Log History ───────────────────────────────────────
export function CameraMaintenanceLogs({ cameraId, apiBase }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!cameraId) return;
        setLoading(true);
        fetch(`${apiBase}/cctv/maintenance-logs?camera_id=${cameraId}`)
            .then(r => r.json())
            .then(d => { if (d.success) setLogs(d.data); })
            .finally(() => setLoading(false));
    }, [cameraId]);

    if (loading) return <div className="text-xs text-gray-400 py-2">กำลังโหลดประวัติ...</div>;
    if (!logs.length) return (
        <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">ประวัติการแก้ไข</div>
            <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">ยังไม่มีประวัติ</div>
        </div>
    );

    const statusLabel = {
        pending: 'รอดำเนินการ', in_progress: 'กำลังซ่อม',
        waiting_parts: 'รอของ', resolved: 'แก้แล้ว',
        removed: 'ถอดออก', repairing: 'ส่งซ่อม',
        reinstalled: 'ติดตั้งคืน', retired: 'เลิกใช้',
    };
    const statusCls = {
        pending: 'bg-yellow-100 text-yellow-700', in_progress: 'bg-blue-100 text-blue-700',
        waiting_parts: 'bg-orange-100 text-orange-700', resolved: 'bg-green-100 text-green-700',
        removed: 'bg-gray-100 text-gray-600', repairing: 'bg-blue-100 text-blue-700',
        reinstalled: 'bg-green-100 text-green-700', retired: 'bg-slate-100 text-slate-600',
    };

    return (
        <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                ประวัติการแก้ไข ({logs.length})
            </div>
            <div className="space-y-2">
                {logs.map(log => (
                    <div key={log.id} className="bg-gray-50 rounded-xl px-3 py-2.5 text-xs">
                        <div className="flex items-center justify-between mb-1">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${log.log_type === 'repair' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                {log.log_type === 'repair' ? '🔧 ซ่อม' : '📤 ถอด'}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusCls[log.status] || 'bg-gray-100 text-gray-600'}`}>
                                {statusLabel[log.status] || log.status}
                            </span>
                        </div>
                        <div className="text-gray-600">{log.issue_type || log.reason || '—'}</div>
                        {log.description && <div className="text-gray-500 mt-0.5 truncate">{log.description}</div>}
                        <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400">
                            <span>{log.assigned_to || log.reported_by || '—'}</span>
                            <span>{new Date(log.reported_at).toLocaleDateString('th-TH')}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
