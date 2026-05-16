import { useState, useEffect } from 'react';
import { X, Upload } from 'lucide-react';
import { API_BASE, API_URL } from '../../config/api';

export default function SwitchFormModal({ mode, data, racks, onClose, onSave }) {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState({
        name: '', ip_address: '', rack_id: '', remark: '',
    });
    const [iconFile,    setIconFile]    = useState(null);
    const [iconPreview, setIconPreview] = useState(null);
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState('');

    useEffect(() => {
        if (isEdit && data) {
            setForm({
                name:       data.name       || '',
                ip_address: data.ip_address || '',
                rack_id:    data.rack_id    || '',
                remark:     data.remark     || '',
            });
            if (data.icon_url) setIconPreview(`${API_URL}${data.icon_url}`);
        }
    }, [isEdit, data]);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async () => {
        if (!form.name.trim()) { setError('กรุณากรอกชื่อ Switch'); return; }
        setLoading(true); setError('');
        try {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
            if (iconFile) fd.append('icon', iconFile);

            const url    = isEdit ? `${API_BASE}/cctv/switches/${data.id}` : `${API_BASE}/cctv/switches`;
            const method = isEdit ? 'PUT' : 'POST';
            const r = await fetch(url, { method, body: fd });
            const d = await r.json();
            if (!d.success) throw new Error(d.error);
            onSave();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm(`ลบ Switch "${data.name}" ?`)) return;
        setLoading(true);
        try {
            await fetch(`${API_BASE}/cctv/switches/${data.id}`, { method: 'DELETE' });
            onSave();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-xl">🔌</div>
                        <div className="font-bold text-gray-900">{isEdit ? 'แก้ไข Switch' : 'เพิ่ม Switch'}</div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                </div>

                {/* Body */}
                <div className="px-6 py-4 space-y-4">
                    {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}

                    {/* Icon */}
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50">
                            {iconPreview
                                ? <img src={iconPreview} className="w-full h-full object-cover" alt="icon"/>
                                : <span className="text-2xl">🔌</span>
                            }
                        </div>
                        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 text-gray-600">
                            <Upload size={12}/> อัปโหลด Icon
                            <input type="file" accept="image/*" className="hidden" onChange={e => {
                                const f = e.target.files[0];
                                if (f) { setIconFile(f); setIconPreview(URL.createObjectURL(f)); }
                            }}/>
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                                ชื่อ Switch <span className="text-red-500">*</span>
                            </label>
                            <input
                                value={form.name}
                                onChange={e => set('name', e.target.value)}
                                placeholder="SW-A-01"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">IP Address</label>
                            <input
                                value={form.ip_address}
                                onChange={e => set('ip_address', e.target.value)}
                                placeholder="192.168.1.2"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Rack ที่ติดตั้ง</label>
                        <select
                            value={form.rack_id}
                            onChange={e => set('rack_id', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white"
                        >
                            <option value="">-- เลือก Rack --</option>
                            {racks?.map(r => (
                                <option key={r.id} value={r.id}>
                                    {r.name}{r.remark ? ` (${r.remark})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Remark</label>
                        <input
                            value={form.remark}
                            onChange={e => set('remark', e.target.value)}
                            placeholder="หมายเหตุ..."
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50 rounded-b-2xl">
                    <div>
                        {isEdit && (
                            <button onClick={handleDelete} disabled={loading}
                                    className="text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-50">
                                ลบ Switch
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose}
                                className="px-5 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-white">
                            ยกเลิก
                        </button>
                        <button onClick={handleSubmit} disabled={loading}
                                className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                            {loading ? 'Saving...' : isEdit ? 'บันทึก' : 'เพิ่ม Switch'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}