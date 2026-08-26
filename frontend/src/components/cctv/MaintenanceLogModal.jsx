import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE } from '../../config/api';

const ISSUE_TYPES = ['ภาพไม่ชัด/มืด', 'ออฟไลน์/ping ไม่ได้', 'สายไฟ/สายสัญญาณหลวม', 'กล้องเสียหาย', 'ต้องเปลี่ยนอะไหล่', 'ต้องย้ายตำแหน่ง', 'ตั้งค่าใหม่', 'อื่นๆ'];
const REMOVAL_REASONS = [
    { value: 'repair',   label: 'ส่งซ่อม' },
    { value: 'relocate', label: 'ย้ายตำแหน่ง' },
    { value: 'damaged',  label: 'ชำรุดหนัก' },
    { value: 'retired',  label: 'เลิกใช้งาน' },
];
const REPAIR_STATUSES = [
    { value: 'pending',       label: 'รอดำเนินการ',   cls: 'border-yellow-400 text-yellow-700' },
    { value: 'in_progress',   label: 'กำลังซ่อม',    cls: 'border-blue-400 text-blue-700' },
    { value: 'waiting_parts', label: 'รอของ/รออะไหล่', cls: 'border-orange-400 text-orange-700' },
    { value: 'resolved',      label: 'แก้ไขแล้ว',   cls: 'border-green-400 text-green-700' },
];
const REMOVAL_STATUSES = [
    { value: 'removed',     label: '🔴 ถอดออกแล้ว',     cls: 'border-red-400 text-red-700' },
    { value: 'repairing',   label: '🔵 ส่งซ่อมอยู่',    cls: 'border-blue-400 text-blue-700' },
    { value: 'reinstalled', label: '🟢 ติดตั้งคืนแล้ว', cls: 'border-green-400 text-green-700' },
    { value: 'retired',     label: '⚫ เลิกใช้งาน',     cls: 'border-gray-400 text-gray-600' },
];

export default function MaintenanceLogModal({ mode, logType, data, cameras, layouts, user, onClose, onSave }) {
    const isEdit   = mode === 'edit';
    const isRepair = logType === 'repair';

    const [form, setForm] = useState({
        issue_type:     '',
        reason:         '',
        description:    '',
        solution:       '',
        status:         isRepair ? 'pending' : 'removed',
        assigned_to:    '',
        resolved_at:    '',
        reinstalled_at: '',
        new_location:   '',
        remark:         '',
    });
    const [selectedCams, setSelectedCams] = useState([]);
    const [camSearch, setCamSearch]       = useState('');
    const [camFilter, setCamFilter]       = useState('all');
    const [loading, setLoading]           = useState(false);
    const [error, setError]               = useState('');

    useEffect(() => {
        if (isEdit && data) {
            setForm({
                issue_type:     data.issue_type     || '',
                reason:         data.reason         || '',
                description:    data.description    || '',
                solution:       data.solution       || '',
                status:         data.status         || (isRepair ? 'pending' : 'removed'),
                assigned_to:    data.assigned_to    || '',
                resolved_at:    data.resolved_at    ? new Date(data.resolved_at).toISOString().split('T')[0]    : '',
                reinstalled_at: data.reinstalled_at ? new Date(data.reinstalled_at).toISOString().split('T')[0] : '',
                new_location:   data.new_location   || '',
                remark:         data.remark         || '',
            });
        } else {
            setForm(p => ({ ...p, assigned_to: user?.username || user?.name || '' }));
        }
    }, [isEdit, data]);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const toggleCam = (cam) => {
        if (!isRepair) return; // removal = single select
        setSelectedCams(prev =>
            prev.find(c => c.id === cam.id)
                ? prev.filter(c => c.id !== cam.id)
                : [...prev, cam]
        );
    };

    const handleCamSelect = (e) => {
        const cam = cameras.find(c => c.id === +e.target.value);
        if (cam) setSelectedCamId(cam.id);
    };

    const handleSubmit = async () => {
        setError('');
        if (!isEdit && selectedCams.length === 0) {
            setError('กรุณาเลือกกล้องอย่างน้อย 1 ตัว');
            return;
        }

        setLoading(true);
        try {
            if (isEdit) {
                await fetch(`${API_BASE}/cctv/maintenance-logs/${data.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...form,
                        resolved_at:    form.resolved_at    || null,
                        reinstalled_at: form.reinstalled_at || null,
                    }),
                });
            } else {
                // ส่งเป็น 1 record ต่อเหตุการณ์ พร้อม camera_ids และ camera_names
                const factoryNames = [...new Set(selectedCams.map(c =>
                    layouts.find(l => l.id === c.factory_layout_id)?.name || ''
                ).filter(Boolean))].join(', ');

                const payload = [{
                    camera_id:    selectedCams[0].id,          // primary camera
                    camera_name:  selectedCams[0].name,
                    camera_ids:   selectedCams.map(c => c.id).join(','),
                    camera_names: selectedCams.map(c => c.name).join(', '),
                    log_type:     isRepair ? 'repair' : 'removal',
                    factory_name: factoryNames,
                    location_x:   selectedCams[0].location_x,
                    location_y:   selectedCams[0].location_y,
                    issue_type:   isRepair ? form.issue_type : null,
                    reason:       isRepair ? null : form.reason,
                    description:  form.description,
                    solution:     form.solution,
                    status:       isRepair ? 'pending' : 'removed',
                    assigned_to:  form.assigned_to,
                    reported_by:  user?.username || user?.name || '',
                    remark:       form.remark,
                }];

                await fetch(`${API_BASE}/cctv/maintenance-logs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }
            onSave();
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
        } finally {
            setLoading(false);
        }
    };

    const filteredCams = cameras.filter(c => {
        const searchOk = !camSearch ||
            c.name.toLowerCase().includes(camSearch.toLowerCase()) ||
            (c.ip_address || '').includes(camSearch);
        const statusOk = camFilter === 'all' || c.status === camFilter;
        return searchOk && statusOk;
    });

    const statusList = isRepair ? REPAIR_STATUSES : REMOVAL_STATUSES;

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{isRepair ? '🔧' : '📤'}</span>
                        <h2 className="font-bold text-gray-800">
                            {isEdit ? 'แก้ไขบันทึก' : (isRepair ? 'เพิ่มบันทึกซ่อม' : 'บันทึกการถอดกล้อง')}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 text-lg">✕</button>
                </div>

                <div className="overflow-y-auto px-6 py-4 space-y-4">
                    {error && <div className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

                    {/* เลือกกล้อง — ใช้ checkbox ทั้ง repair และ removal */}
                    {!isEdit ? (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                                เลือกกล้อง <span className="text-red-500">*</span>
                                <span className="text-gray-400 ml-1">(เลือกได้หลายตัว)</span>
                            </label>
                            <input value={camSearch} onChange={e => setCamSearch(e.target.value)}
                                   placeholder="ค้นหากล้อง..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs mb-1"/>
                            {/* Filter status */}
                            <div className="flex gap-1.5 mb-1 flex-wrap">
                                {[
                                    { v: 'all',     label: 'ทั้งหมด' },
                                    { v: 'offline', label: '🔴 Offline' },
                                    { v: 'online',  label: '🟢 Online' },
                                    { v: 'removed', label: '⚫ ถอดออก' },
                                ].map(f => (
                                    <button key={f.v} onClick={() => setCamFilter(f.v)}
                                            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors
                                                ${camFilter === f.v ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'}`}>
                                        {f.label}
                                        <span className="ml-1 opacity-60">({cameras.filter(c => f.v === 'all' ? true : c.status === f.v).length})</span>
                                    </button>
                                ))}
                            </div>
                            <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
                                {filteredCams.length === 0
                                    ? <div className="px-3 py-4 text-center text-xs text-gray-400">ไม่พบกล้อง</div>
                                    : filteredCams.map(cam => (
                                        <label key={cam.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                            <input type="checkbox"
                                                   checked={!!selectedCams.find(c => c.id === cam.id)}
                                                   onChange={() => {
                                                       setSelectedCams(prev =>
                                                           prev.find(c => c.id === cam.id)
                                                               ? prev.filter(c => c.id !== cam.id)
                                                               : [...prev, cam]
                                                       );
                                                   }} className="rounded"/>
                                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                                cam.status === 'online'  ? 'bg-green-500' :
                                                cam.status === 'offline' ? 'bg-red-500'   :
                                                cam.status === 'removed' ? 'bg-gray-400'  : 'bg-gray-300'}`}/>
                                            <span className="text-xs font-medium text-gray-700 flex-1">{cam.name}</span>
                                            <span className="text-[10px] text-gray-400">{cam.ip_address}</span>
                                        </label>
                                    ))
                                }
                            </div>
                            {selectedCams.length > 0 && (
                                <div className="text-xs text-blue-600 mt-1">
                                    เลือก {selectedCams.length} ตัว: {selectedCams.map(c => c.name).join(', ')}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">กล้อง</label>
                            <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm font-medium text-gray-700">
                                {data?.camera_names || data?.camera_name}
                                <span className="text-xs text-gray-400 ml-2">{data?.factory_name}</span>
                            </div>
                        </div>
                    )}

                    {/* ประเภทปัญหา / เหตุผล */}
                    {isRepair ? (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">ประเภทปัญหา</label>
                            <select value={form.issue_type} onChange={e => set('issue_type', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                                <option value="">— เลือกประเภท —</option>
                                {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    ) : !isEdit && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">เหตุผลที่ถอด</label>
                            <div className="flex gap-2 flex-wrap">
                                {REMOVAL_REASONS.map(r => (
                                    <button key={r.value} onClick={() => set('reason', r.value)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                                                ${form.reason === r.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* รายละเอียด */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">รายละเอียดปัญหา</label>
                        <textarea value={form.description} onChange={e => set('description', e.target.value)}
                                  rows={2} placeholder={isRepair ? 'อธิบายปัญหาที่พบ...' : 'รายละเอียดเพิ่มเติม...'}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"/>
                    </div>

                    {/* วิธีแก้ไข */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                            {isRepair ? 'วิธีแก้ไข' : 'หมายเหตุการถอด'}
                        </label>
                        <textarea value={form.solution} onChange={e => set('solution', e.target.value)}
                                  rows={2} placeholder={isRepair ? 'วิธีแก้ไขปัญหา...' : 'รายละเอียดการถอด, ตำแหน่งที่นำไป...'}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"/>
                    </div>

                    {/* สถานะ (edit only) */}
                    {isEdit && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">สถานะ</label>
                            <div className="flex gap-2 flex-wrap">
                                {statusList.map(s => (
                                    <button key={s.value} onClick={() => set('status', s.value)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors
                                                ${form.status === s.value ? `${s.cls} bg-opacity-10 border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        {/* ผู้รับผิดชอบ */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                                {isRepair ? 'ผู้รับผิดชอบ' : 'ผู้ถอด'}
                            </label>
                            <input type="text" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}
                                   className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"/>
                        </div>

                        {/* วันที่แก้ไข / ติดตั้งคืน (edit only) */}
                        {isEdit && (
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                    {isRepair ? 'วันที่แก้ไข' : 'วันที่ติดตั้งคืน'}
                                </label>
                                <input type="date"
                                       value={isRepair ? form.resolved_at : form.reinstalled_at}
                                       onChange={e => set(isRepair ? 'resolved_at' : 'reinstalled_at', e.target.value)}
                                       className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"/>
                            </div>
                        )}

                        {/* ตำแหน่งใหม่ (removal) */}
                        {!isRepair && (
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">ตำแหน่งใหม่ (ถ้าย้าย)</label>
                                <input type="text" value={form.new_location} onChange={e => set('new_location', e.target.value)}
                                       placeholder="เช่น Guard House 4"
                                       className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"/>
                            </div>
                        )}
                    </div>

                    {/* หมายเหตุ */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">หมายเหตุ</label>
                        <textarea value={form.remark} onChange={e => set('remark', e.target.value)}
                                  rows={2} placeholder="หมายเหตุเพิ่มเติม..."
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"/>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                    <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                        ยกเลิก
                    </button>
                    <button onClick={handleSubmit} disabled={loading}
                            className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                        {loading ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' :
                            `${isRepair ? 'เพิ่มบันทึกซ่อม' : 'บันทึกการถอด'}${selectedCams.length > 1 ? ` (${selectedCams.length} ตัว)` : ''}`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}