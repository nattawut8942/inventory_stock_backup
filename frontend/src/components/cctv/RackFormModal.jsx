import { useState, useEffect } from 'react';
import { X, Upload } from 'lucide-react';
import { API_BASE, API_URL } from '../../config/api';

export default function RackFormModal({ mode, data, layouts, selectedLayoutId, onClose, onSave }) {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState({
        name: '', factory_layout_id: selectedLayoutId || '', remark: '', rack_type: 'access',
    });
    const [iconFile,    setIconFile]    = useState(null);
    const [iconPreview, setIconPreview] = useState(null);
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState('');

    useEffect(() => {
        if (isEdit && data) {
            setForm({
                name:              data.name              || '',
                factory_layout_id: data.factory_layout_id || '',
                remark:            data.remark            || '',
                rack_type:         data.rack_type          || 'access',
            });
            if (data.icon_url) setIconPreview(`${API_URL}${data.icon_url}`);
        }
    }, [isEdit, data]);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async () => {
        if (!form.name.trim()) { setError('กรุณากรอกชื่อ Rack'); return; }
        setLoading(true); setError('');
        try {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
            if (iconFile) fd.append('icon', iconFile);

            const url    = isEdit ? `${API_BASE}/cctv/racks/${data.id}` : `${API_BASE}/cctv/racks`;
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
        if (!confirm(`ลบ Rack "${data.name}" ?\nกล้องใน Rack นี้จะถูก unlink`)) return;
        setLoading(true);
        try {
            await fetch(`${API_BASE}/cctv/racks/${data.id}`, { method: 'DELETE' });
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
                        <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-xl">🖥️</div>
                        <div className="font-bold text-gray-900">{isEdit ? 'แก้ไข Rack' : 'เพิ่ม Rack'}</div>
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
                                : <span className="text-2xl">🖥️</span>
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
                                ชื่อ Rack <span className="text-red-500">*</span>
                            </label>
                            <input
                                value={form.name}
                                onChange={e => set('name', e.target.value)}
                                placeholder="เช่น CCTV_FAC2_D1"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-purple-400"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">ประเภท Rack</label>
                            <select value={form.rack_type} onChange={e => set('rack_type', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-purple-400 bg-white">
                                <option value="access">Access Rack</option>
                                <option value="distribution">Distribution Rack</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Factory Layout</label>
                        <select
                            value={form.factory_layout_id}
                            onChange={e => set('factory_layout_id', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-purple-400 bg-white"
                        >
                            <option value="">-- เลือก Factory --</option>
                            {layouts?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Remark / ตำแหน่งจริง</label>
                        <input
                            value={form.remark}
                            onChange={e => set('remark', e.target.value)}
                            placeholder="เช่น ห้อง MDF ชั้น 1"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-purple-400"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50 rounded-b-2xl">
                    <div>
                        {isEdit && (
                            <button onClick={handleDelete} disabled={loading}
                                    className="text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-50">
                                ลบ Rack
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose}
                                className="px-5 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-white">
                            ยกเลิก
                        </button>
                        <button onClick={handleSubmit} disabled={loading}
                                className="px-6 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
                            {loading ? 'Saving...' : isEdit ? 'บันทึก' : 'เพิ่ม Rack'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}