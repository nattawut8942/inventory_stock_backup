import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { X, Upload, User } from 'lucide-react';
import { API_BASE, API_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { drawCCTVIcon } from './cctvIconUtils';
import AlertModal from '../AlertModal';

// ── Preset icons list ──────────────────────────────────────────────────────
const PRESET_ICONS = [
    { id: 'bullet',   label: 'Bullet',    desc: 'กล้องยาว outdoor' },
    { id: 'dome',     label: 'Dome',      desc: 'กล้องโดม indoor'  },
    { id: 'ptz',      label: 'PTZ',       desc: 'กล้องหมุนได้'     },
    { id: 'fisheye',  label: 'Fisheye',   desc: '360°'              },
    { id: 'box',      label: 'Box',       desc: 'กล้องกล่อง'       },
    { id: 'pin',      label: 'Map pin',   desc: 'pin style'         },
    { id: 'flat',     label: 'Flat',      desc: 'minimal flat'      },
    { id: 'outline',  label: 'Outline',   desc: 'เส้นขอบ'           },
];

// Mini canvas preview
function IconCanvas({ type, selected, onClick }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!ref.current) return;
        const ctx = ref.current.getContext('2d');
        ctx.clearRect(0, 0, 48, 48);
        drawCCTVIcon(ctx, 24, 24, 20, type, selected ? '#1d4ed8' : '#4b5563', 'white');
    }, [type, selected]);
    return (
        <button onClick={onClick}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                    selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 bg-white'
                }`}>
            <canvas ref={ref} width={48} height={48} style={{ borderRadius: 8 }}/>
        </button>
    );
}

// ── Field และ Input ต้องอยู่นอก CCTVFormModal ──────────────────────────────
// ถ้าอยู่ข้างใน React จะสร้าง component ใหม่ทุก render → focus หาย
const Field = ({ label, children, required }) => (
    <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
            {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {children}
    </div>
);

const CCTVFormModal = memo(function CCTVFormModal({ mode, data, layouts, racks, switches, selectedLayoutId, onClose, onSave }) {
    const isEdit    = mode === 'edit';
    const { user }  = useAuth();
    const updatedBy = user?.name || user?.empcode || '';

    const [form, setForm] = useState({
        name: '', ip_address: '', model: '', fix_asset: '', remark: '',
        factory_layout_id: selectedLayoutId || '',
        rack_id: '', switch_id: '',
    });
    const [selectedIcon, setSelectedIcon] = useState('bullet');
    const [iconFile,     setIconFile]     = useState(null);
    const [iconPreview,  setIconPreview]  = useState(null);
    const [useCustom,    setUseCustom]    = useState(false);
    const [snapshotFile,    setSnapshotFile]    = useState(null);
    const [snapshotPreview, setSnapshotPreview] = useState(null);
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState('');

    // useMemo ป้องกัน re-compute ทุก keystroke
    const filteredSwitches = useMemo(
        () => switches.filter(s => !form.rack_id || s.rack_id === +form.rack_id),
        [switches, form.rack_id]
    );

    // ใช้ data.id เป็น dependency แทน data object ทั้งก้อน — ป้องกัน re-run ทุก render
    useEffect(() => {
        if (isEdit && data) {
            setForm({
                name:              data.name              || '',
                ip_address:        data.ip_address        || '',
                model:             data.model             || '',
                fix_asset:         data.fix_asset         || '',
                remark:            data.remark            || '',
                factory_layout_id: data.factory_layout_id || '',
                rack_id:           data.rack_id           || '',
                switch_id:         data.switch_id         || '',
            });
            if (data.icon_url) { setUseCustom(true); setIconPreview(`${API_URL}${data.icon_url}`); }
            if (data.icon_type) setSelectedIcon(data.icon_type);
            if (data.snapshot_url) setSnapshotPreview(`${API_URL}${data.snapshot_url}`);
        }
    }, [data?.id]); // ← เฉพาะเมื่อ id เปลี่ยน ไม่ใช่ทุก render

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async () => {
        if (!form.name.trim())            { setError('กรุณากรอกชื่อกล้อง'); return; }
        if (!form.factory_layout_id)      { setError('กรุณาเลือก Factory Layout'); return; }
        setLoading(true); setError('');
        try {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
            fd.append('updated_by', updatedBy);

            if (useCustom && iconFile) {
                fd.append('icon', iconFile);
                fd.append('icon_type', 'custom');
            } else if (!useCustom) {
                fd.append('icon_type', selectedIcon);
            }
            if (snapshotFile) fd.append('snapshot', snapshotFile);

            const url    = isEdit ? `${API_BASE}/cctv/cameras/${data.id}` : `${API_BASE}/cctv/cameras`;
            const method = isEdit ? 'PUT' : 'POST';
            const r      = await fetch(url, { method, body: fd });
            const d      = await r.json();
            if (!d.success) throw new Error(d.error);
            onSave();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const [deleteConfirm, setDeleteConfirm] = useState(false);

    const handleDelete = async () => {
        setLoading(true);
        try {
            await fetch(`${API_BASE}/cctv/cameras/${data.id}`, { method: 'DELETE' });
            onSave();
        } finally { setLoading(false); }
    };

    const mainModal = (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[92vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-xl">📹</div>
                        <div>
                            <div className="font-bold text-gray-900">{isEdit ? 'แก้ไขกล้อง' : 'เพิ่มกล้อง CCTV'}</div>
                            {isEdit && <div className="text-xs text-gray-400">{data.name}</div>}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}

                    {/* บันทึกโดย badge */}
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                        <User size={13} className="text-blue-400 flex-shrink-0"/>
                        <span className="text-xs text-blue-600">
                            บันทึกโดย: <span className="font-semibold">{updatedBy || '—'}</span>
                            {user?.empcode && <span className="text-blue-400 ml-1">({user.empcode})</span>}
                        </span>
                    </div>

                    {/* ── Icon selector ──────────────────────────────────── */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-gray-500">Icon กล้อง</label>
                            <button onClick={() => setUseCustom(p => !p)}
                                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${useCustom ? 'bg-gray-100 border-gray-300 text-gray-600' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                                {useCustom ? '← กลับใช้ preset' : '↑ Upload รูปเอง'}
                            </button>
                        </div>

                        {!useCustom ? (
                            // Preset grid
                            <div className="grid grid-cols-4 gap-2">
                                {PRESET_ICONS.map(ic => (
                                    <div key={ic.id} className="flex flex-col items-center gap-0.5">
                                        <IconCanvas type={ic.id} selected={selectedIcon === ic.id}
                                                    onClick={() => setSelectedIcon(ic.id)}/>
                                        <span className="text-[10px] text-gray-500 text-center leading-tight">{ic.label}</span>
                                        <span className="text-[9px] text-gray-400 text-center leading-tight">{ic.desc}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            // Custom upload
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
                                    {iconPreview
                                        ? <img src={iconPreview} className="w-full h-full object-cover" alt="icon"/>
                                        : <span className="text-2xl">📹</span>
                                    }
                                </div>
                                <div>
                                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 text-gray-600">
                                        <Upload size={12}/> อัปโหลดรูป
                                        <input type="file" accept="image/*" className="hidden"
                                               onChange={e => { const f = e.target.files[0]; if(f){ setIconFile(f); setIconPreview(URL.createObjectURL(f)); }}}/>
                                    </label>
                                    <div className="text-[11px] text-gray-400 mt-1">PNG/JPG/SVG ≤2MB</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Form fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <Field label="ชื่อกล้อง" required>
                                <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                                       placeholder="เช่น CAM-A-001"
                                       className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white"/>
                            </Field>
                        </div>
                        <Field label="IP Address">
                            <input type="text" value={form.ip_address} onChange={e => set('ip_address', e.target.value)}
                                   placeholder="192.168.10.101"
                                   className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white"/>
                        </Field>
                        <Field label="Model">
                            <input type="text" value={form.model} onChange={e => set('model', e.target.value)}
                                   placeholder="Hikvision DS-2CD..."
                                   className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white"/>
                        </Field>
                        <div className="col-span-2">
                            <Field label="Fix Asset">
                                <input type="text" value={form.fix_asset} onChange={e => set('fix_asset', e.target.value)}
                                       placeholder="IT-2024-001"
                                       className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white"/>
                            </Field>
                        </div>
                    </div>

                    {/* Factory Layout */}
                    <Field label="Factory Layout" required>
                        <select value={form.factory_layout_id} onChange={e => set('factory_layout_id', e.target.value)}
                                className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-blue-400 bg-white ${!form.factory_layout_id ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                            <option value="">-- เลือก Factory --</option>
                            {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        {!form.factory_layout_id && (
                            <p className="text-amber-600 text-[11px] mt-1">⚠️ ต้องเลือก Factory เพื่อให้กล้องแสดงบน map</p>
                        )}
                    </Field>

                    {/* เส้นสาย */}
                    <div className="bg-purple-50 rounded-xl p-3 space-y-3">
                        <div className="text-xs font-semibold text-purple-700">🔌 เส้นสาย (Rack → Switch)</div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Rack ตู้สาย">
                                <select value={form.rack_id}
                                        onChange={e => { set('rack_id', e.target.value); set('switch_id', ''); }}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-purple-400 bg-white">
                                    <option value="">-- เลือก Rack --</option>
                                    {racks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </Field>
                            <Field label="Switch">
                                <select value={form.switch_id} onChange={e => set('switch_id', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-purple-400 bg-white"
                                        disabled={!form.rack_id}>
                                    <option value="">-- เลือก Switch --</option>
                                    {filteredSwitches.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}{s.ip_address ? ` (${s.ip_address})` : ''}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                        <div className="text-[11px] text-purple-500">เลือก Rack ก่อน Switch จะ filter ให้อัตโนมัติ</div>
                    </div>

                    <Field label="Remark">
                        <textarea value={form.remark} onChange={e => set('remark', e.target.value)}
                                  placeholder="หมายเหตุเพิ่มเติม..." rows={2}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white resize-none"/>
                    </Field>

                    {/* ── รูปมุมกล้อง (snapshot) ──────────────────────── */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-500">
                            รูปมุมกล้อง <span className="text-gray-400 font-normal">(แสดงเมื่อ hover บน map)</span>
                        </label>
                        <div className="flex items-center gap-4">
                            {/* preview */}
                            <div className="w-24 h-16 rounded-lg border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center flex-shrink-0">
                                {snapshotPreview
                                    ? <img src={snapshotPreview} className="w-full h-full object-cover" alt="snapshot"/>
                                    : <span className="text-2xl">🖼️</span>
                                }
                            </div>
                            <div className="space-y-1">
                                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 text-gray-600 w-fit">
                                    <Upload size={12}/> อัปโหลดรูปมุมกล้อง
                                    <input type="file" accept="image/*" className="hidden"
                                           onChange={e => {
                                               const f = e.target.files[0];
                                               if (f) { setSnapshotFile(f); setSnapshotPreview(URL.createObjectURL(f)); }
                                           }}/>
                                </label>
                                {snapshotPreview && (
                                    <button onClick={() => { setSnapshotFile(null); setSnapshotPreview(null); }}
                                            className="text-[11px] text-red-400 hover:text-red-600">
                                        ลบรูป
                                    </button>
                                )}
                                <div className="text-[11px] text-gray-400">JPG/PNG ≤2MB · แสดงใน tooltip เมื่อ hover กล้อง</div>
                            </div>
                        </div>
                    </div>

                    {isEdit && data?.updated_by && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-1">
                            <User size={11}/>
                            แก้ไขล่าสุดโดย: <span className="font-medium text-gray-500">{data.updated_by}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50 rounded-b-2xl">
                    <div>
                        {isEdit && (
                            <button onClick={() => setDeleteConfirm(true)} disabled={loading}
                                    className="text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-50">
                                ลบกล้อง
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
                            {loading ? 'Saving...' : isEdit ? 'บันทึก' : 'เพิ่มกล้อง'}
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );

    return (
        <>
            {mainModal}
            {deleteConfirm && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }}>
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 text-center animate-in zoom-in-95">
                        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">🗑️</span>
                        </div>
                        <h3 className="font-black text-lg mb-2 text-slate-800">ลบกล้อง</h3>
                        <p className="text-slate-500 text-sm mb-5 px-4 leading-relaxed">
                            ยืนยันลบกล้อง <span className="font-bold text-red-600">"{data?.name}"</span> ? ข้อมูลจะหายถาวร
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirm(false)}
                                    className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg font-bold hover:bg-slate-200 transition-colors">
                                ยกเลิก
                            </button>
                            <button onClick={() => { setDeleteConfirm(false); handleDelete(); }}
                                    className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-bold hover:bg-red-700 transition-colors shadow-md">
                                ลบเลย
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
});

export default CCTVFormModal;