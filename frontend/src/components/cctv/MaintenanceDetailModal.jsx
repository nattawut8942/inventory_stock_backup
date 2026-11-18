import { createPortal } from 'react-dom';

// ── Maintenance Detail Modal ──────────────────────────────────────────────
export function MaintenanceDetailModal({ data, onClose }) {
    if (!data) return null;

    const isRepair = data.log_type === 'repair';
    const isInstall = data.log_type === 'install';
    const camList  = (data.camera_names || data.camera_name || '').split(',').map(s => s.trim()).filter(Boolean);

    const statusConfig = {
        pending:       { label: 'รอดำเนินการ',    cls: 'bg-yellow-100 text-yellow-700' },
        in_progress:   { label: 'กำลังซ่อม',     cls: 'bg-blue-100 text-blue-700' },
        waiting_parts: { label: 'รอของ/รออะไหล่', cls: 'bg-orange-100 text-orange-700' },
        resolved:      { label: 'แก้ไขแล้ว',     cls: 'bg-green-100 text-green-700' },
        removed:       { label: 'ถอดออกแล้ว',    cls: 'bg-red-100 text-red-700' },
        repairing:     { label: 'ส่งซ่อมอยู่',   cls: 'bg-blue-100 text-blue-700' },
        reinstalled:   { label: 'ติดตั้งคืนแล้ว', cls: 'bg-green-100 text-green-700' },
        retired:       { label: 'เลิกใช้งาน',    cls: 'bg-gray-100 text-gray-600' },
        installed:     { label: 'ติดตั้งแล้ว',   cls: 'bg-green-100 text-green-700' },
    };
    const st = statusConfig[data.status] || { label: data.status, cls: 'bg-gray-100 text-gray-600' };

    const Row = ({ label, value }) => value ? (
        <div className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
            <span className="text-xs text-gray-400 w-28 flex-shrink-0">{label}</span>
            <span className="text-xs text-gray-800 flex-1">{value}</span>
        </div>
    ) : null;

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }}>
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
                {/* Header */}
                <div className={`flex items-center justify-between px-6 py-4 rounded-t-2xl ${isRepair ? 'bg-blue-50' : isInstall ? 'bg-green-50' : 'bg-orange-50'}`}>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{isRepair ? '🔧' : isInstall ? '🆕' : '📤'}</span>
                        <div>
                            <div className="font-bold text-gray-800">{isRepair ? 'บันทึกการซ่อม' : isInstall ? 'บันทึกการติดตั้ง' : 'บันทึกการถอด'}</div>
                            <div className="text-xs text-gray-500">#{data.id} · {data.reported_at ? new Date(data.reported_at).toLocaleString('th-TH') : ''}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/50 rounded-lg text-gray-400 text-lg">✕</button>
                    </div>
                </div>

                <div className="overflow-y-auto px-6 py-4 space-y-4">
                    {/* กล้อง */}
                    <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">กล้อง ({camList.length} ตัว)</div>
                        <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-1">
    {camList.map((name, i) => (
        <div key={i} className="text-xs font-medium text-gray-700 truncate" title={name}>• {name}</div>
    ))}
</div>
                    </div>

                    {/* ข้อมูลหลัก */}
                    <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">รายละเอียด</div>
                        <div className="bg-gray-50 rounded-xl px-4 py-2">
                            <Row label="Factory"          value={data.factory_name} />
                            {!isInstall && <Row label={isRepair ? 'ประเภทปัญหา' : 'เหตุผล'} value={data.issue_type || data.reason} />}
                            <Row label={isInstall ? 'รายละเอียดการติดตั้ง' : 'รายละเอียดปัญหา'}  value={data.description} />
                            <Row label={isRepair ? 'วิธีแก้ไข' : isInstall ? 'หมายเหตุการติดตั้ง' : 'หมายเหตุการถอด'} value={data.solution} />
                            <Row label="หมายเหตุ"          value={data.remark} />
                        </div>
                    </div>

                    {/* วันที่ */}
                    <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">วันที่</div>
                        <div className="bg-gray-50 rounded-xl px-4 py-2">
                            <Row label="วันที่แจ้ง"        value={data.reported_at    ? new Date(data.reported_at).toLocaleDateString('th-TH')    : null} />
                            <Row label={isInstall ? 'วันที่ติดตั้ง' : 'วันที่แก้ไข'}       value={data.resolved_at    ? new Date(data.resolved_at).toLocaleDateString('th-TH')    : null} />
                            <Row label="วันที่ติดตั้งคืน"  value={data.reinstalled_at ? new Date(data.reinstalled_at).toLocaleDateString('th-TH') : null} />
                        </div>
                    </div>

                    {/* ผู้ดำเนินการ */}
                    <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">ผู้ดำเนินการ</div>
                        <div className="bg-gray-50 rounded-xl px-4 py-2">
                            <Row label="ผู้รับผิดชอบ"  value={data.assigned_to?.toUpperCase()} />
                            <Row label="ผู้แจ้ง"        value={data.reported_by?.toUpperCase()} />
                            {!isRepair && <Row label="ตำแหน่งใหม่" value={data.new_location} />}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                    <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">ปิด</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
