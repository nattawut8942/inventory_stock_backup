import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Edit2, Upload, MapPin, Factory, LayoutGrid, Plug, X, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AlertModal from './AlertModal';
import Portal from './Portal';
import { API_BASE, API_URL } from '../config/api';

const SHAPES = [
    { value: 'circle', label: 'วงกลม' },
    { value: 'trap', label: 'สี่เหลี่ยมคางหมู' },
    { value: 'shield', label: 'โล่' },
    { value: 'diamond', label: 'ข้าวหลามตัด' },
    { value: 'square', label: 'สี่เหลี่ยม' }
];

const ShapeIcon = ({ shape, color = '#2b64b8', className = 'w-7 h-7' }) => {
    const body = {
        circle: <circle cx="15" cy="15" r="14" fill={color} />,
        trap: <path d="M4 3h22l-4 24H8z" fill={color} />,
        shield: <path d="M2 4h26v16l-13 8-13-8z" fill={color} />,
        diamond: <path d="M15 1l14 14-14 14L1 15z" fill={color} />,
        square: <rect x="2" y="2" width="26" height="26" rx="3" fill={color} />
    }[shape] || <rect x="2" y="2" width="26" height="26" rx="3" fill={color} />;
    return <svg viewBox="0 0 30 30" className={className}>{body}</svg>;
};

const imgSrc = (url) => (url ? `${API_URL}${url}` : '');

const inputCls = 'w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const btnPri = 'flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all';
const btnGhost = 'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors';

const SUB_TABS = [
    { id: 'factories', label: 'โรงงาน', icon: Factory },
    { id: 'areas', label: 'พื้นที่', icon: LayoutGrid },
    { id: 'standards', label: 'มาตรฐานเต้ารับ', icon: Plug },
    { id: 'points', label: 'จุดตรวจ / ผัง', icon: MapPin }
];

const emptyAreaForm = {
    areaName: '', deptName: '', layoutCaption: '',
    panel1Title: 'การตรวจสอบเต้ารับ', panel1Caption: '',
    panel2Title: 'การตรวจสอบปลั๊กตัวผู้', panel2Caption: ''
};

const ModalShell = ({ title, onClose, children, wide }) => (
    <Portal>
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm">
            <div className="flex min-h-screen items-center justify-center p-4">
                <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} bg-white rounded-2xl shadow-2xl p-6`}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-lg text-slate-800">{title}</h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    </Portal>
);

const Field = ({ label, children }) => (
    <label className="block mb-3">
        <span className="block text-xs font-bold text-slate-500 mb-1">{label}</span>
        {children}
    </label>
);

const PlugMasterTab = () => {
    const { user } = useAuth();
    const [subTab, setSubTab] = useState('factories');
    const [factories, setFactories] = useState([]);
    const [areas, setAreas] = useState([]);
    const [standards, setStandards] = useState([]);
    const [points, setPoints] = useState([]);
    const [factoryId, setFactoryId] = useState('');
    const [areaId, setAreaId] = useState('');
    const [busy, setBusy] = useState(false);
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });

    // modals
    const [factoryModal, setFactoryModal] = useState(null); // { id?, name }
    const [areaModal, setAreaModal] = useState(null); // { id?, form }
    const [pointModal, setPointModal] = useState(null); // { mode:'create'|'edit', ...fields }

    // points editor
    const [placing, setPlacing] = useState(false);
    const [placeStd, setPlaceStd] = useState('');
    const layoutRef = useRef(null);
    const dragRef = useRef(null);

    const authHeaders = useCallback(() => ({ Authorization: `Bearer ${user?.token}` }), [user]);

    const showError = (message) => setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: message || 'เกิดข้อผิดพลาด' });
    const closeAlert = () => setAlertModal(prev => ({ ...prev, isOpen: false }));
    const confirmAction = (message, onConfirm) => setAlertModal({
        isOpen: true, type: 'confirm', title: 'ยืนยัน', message, confirmText: 'ยืนยัน', cancelText: 'ยกเลิก',
        onConfirm: () => { closeAlert(); onConfirm(); },
        onCancel: closeAlert
    });

    // Generic request helper. Returns data on success, null on failure (error already shown)
    const request = useCallback(async (path, { method = 'GET', json, form } = {}) => {
        try {
            const opts = { method, headers: {} };
            if (method !== 'GET') opts.headers = authHeaders();
            if (json !== undefined) {
                opts.headers['Content-Type'] = 'application/json';
                opts.body = JSON.stringify(json);
            }
            if (form) opts.body = form;
            const res = await fetch(`${API_BASE}${path}`, opts);
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body.success === false) {
                showError(body.error || body.message || `Request failed (${res.status})`);
                return null;
            }
            return body.data !== undefined ? body.data : true;
        } catch (err) {
            showError(err.message);
            return null;
        }
    }, [authHeaders]);

    // ---------- loaders ----------
    const loadFactories = useCallback(async () => {
        const data = await request('/plug/factories');
        if (data) setFactories(data === true ? [] : data);
    }, [request]);

    const loadAreas = useCallback(async () => {
        const data = await request('/plug/areas');
        if (data) setAreas(data === true ? [] : data);
    }, [request]);

    const loadStandards = useCallback(async () => {
        const data = await request('/plug/standards');
        if (data) setStandards(data === true ? [] : data);
    }, [request]);

    const loadPoints = useCallback(async (id) => {
        if (!id) { setPoints([]); return; }
        const data = await request(`/plug/areas/${id}/points`);
        if (data) setPoints(data === true ? [] : data);
    }, [request]);

    useEffect(() => { loadFactories(); loadAreas(); loadStandards(); }, [loadFactories, loadAreas, loadStandards]);
    useEffect(() => { loadPoints(areaId); }, [areaId, loadPoints]);

    // keep selections valid
    useEffect(() => {
        if (!factoryId && factories.length) setFactoryId(String(factories[0].FactoryID));
    }, [factories, factoryId]);

    const areasOfFactory = areas.filter(a => !factoryId || String(a.FactoryID) === String(factoryId));
    useEffect(() => {
        if (areaId && !areasOfFactory.some(a => String(a.AreaID) === String(areaId))) setAreaId('');
        if (!areaId && areasOfFactory.length) setAreaId(String(areasOfFactory[0].AreaID));
    }, [areasOfFactory, areaId]);
    useEffect(() => {
        if (!placeStd && standards.length) setPlaceStd(standards[0].Code);
    }, [standards, placeStd]);

    const selectedArea = areas.find(a => String(a.AreaID) === String(areaId));
    const stdByCode = (code) => standards.find(s => s.Code === code);

    // ---------- factories ----------
    const saveFactory = async () => {
        const name = (factoryModal.name || '').trim();
        if (!name) return showError('กรุณากรอกชื่อโรงงาน');
        setBusy(true);
        const ok = factoryModal.id
            ? await request(`/plug/factories/${factoryModal.id}`, { method: 'PUT', json: { name } })
            : await request('/plug/factories', { method: 'POST', json: { name } });
        setBusy(false);
        if (ok) { setFactoryModal(null); loadFactories(); }
    };

    const removeFactory = (f) => confirmAction(`ลบโรงงาน "${f.FactoryName}" ?`, async () => {
        if (await request(`/plug/factories/${f.FactoryID}`, { method: 'DELETE' })) loadFactories();
    });

    // ---------- areas ----------
    const openAreaModal = (a) => setAreaModal(a ? {
        id: a.AreaID,
        factoryId: a.FactoryID,
        form: {
            areaName: a.AreaName || '', deptName: a.DeptName || '', layoutCaption: a.LayoutCaption || '',
            panel1Title: a.Panel1Title || '', panel1Caption: a.Panel1Caption || '',
            panel2Title: a.Panel2Title || '', panel2Caption: a.Panel2Caption || ''
        }
    } : { factoryId: factoryId, form: { ...emptyAreaForm } });

    const saveArea = async () => {
        const { form } = areaModal;
        if (!areaModal.factoryId) return showError('กรุณาเลือกโรงงาน');
        if (!form.areaName.trim()) return showError('กรุณากรอกชื่อพื้นที่');
        setBusy(true);
        const json = { factoryId: Number(areaModal.factoryId), ...form };
        const ok = areaModal.id
            ? await request(`/plug/areas/${areaModal.id}`, { method: 'PUT', json })
            : await request('/plug/areas', { method: 'POST', json });
        setBusy(false);
        if (ok) {
            setAreaModal(null);
            await loadAreas();
            if (ok !== true && ok.AreaID) { setFactoryId(String(areaModal.factoryId)); setAreaId(String(ok.AreaID)); }
        }
    };

    const removeArea = (a) => confirmAction(`ลบพื้นที่ "${a.AreaName}" ? (ใบตรวจเก่ายังพิมพ์ย้อนหลังได้)`, async () => {
        if (await request(`/plug/areas/${a.AreaID}`, { method: 'DELETE' })) loadAreas();
    });

    const uploadAreaImage = async (a, kind, file) => {
        if (!file) return;
        const form = new FormData();
        form.append('kind', kind);
        form.append('image', file);
        setBusy(true);
        const ok = await request(`/plug/areas/${a.AreaID}/image`, { method: 'POST', form });
        setBusy(false);
        if (ok) loadAreas();
    };

    // ---------- standards ----------
    const addStandard = async () => {
        if (await request('/plug/standards', { method: 'POST', json: { name: '', shape: 'square' } })) loadStandards();
    };

    const patchStandardLocal = (id, patch) => setStandards(prev => prev.map(s => (s.StdID === id ? { ...s, ...patch } : s)));

    const saveStandard = async (s) => {
        await request(`/plug/standards/${s.StdID}`, { method: 'PUT', json: { name: s.Name || '', shape: s.Shape } });
    };

    const removeStandard = (s) => confirmAction(`ลบมาตรฐานแบบ ${s.Code} ?`, async () => {
        if (await request(`/plug/standards/${s.StdID}`, { method: 'DELETE' })) loadStandards();
    });

    const uploadStandardImage = async (s, file) => {
        if (!file) return;
        const form = new FormData();
        form.append('image', file);
        setBusy(true);
        const ok = await request(`/plug/standards/${s.StdID}/image`, { method: 'POST', form });
        setBusy(false);
        if (ok) loadStandards();
    };

    // ---------- points ----------
    const pointBody = (p, over = {}) => ({
        pointName: p.PointName, stdCode: p.StdCode, posX: p.PosX, posY: p.PosY,
        method1: p.Method1, method2: p.Method2, tool1: p.Tool1, tool2: p.Tool2, ...over
    });

    const pctFromEvent = (e) => {
        const box = layoutRef.current.getBoundingClientRect();
        return {
            x: Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)),
            y: Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100))
        };
    };

    const onLayoutClick = (e) => {
        if (!placing || e.target.closest('[data-pin]')) return;
        const { x, y } = pctFromEvent(e);
        setPointModal({
            mode: 'create', pointName: 'ปลั๊กไฟ 5 เต้ารับ', stdCode: placeStd,
            posX: Number(x.toFixed(3)), posY: Number(y.toFixed(3)),
            method1: '1.เช็คด้วยสายตา', method2: '2.เช็คกระแสไฟฟ้า', tool1: 'มือ,ตา', tool2: 'Test Lamp'
        });
    };

    const savePoint = async () => {
        const m = pointModal;
        if (!m.pointName.trim()) return showError('กรุณากรอกชื่อจุดตรวจ');
        setBusy(true);
        const json = {
            pointName: m.pointName.trim(), stdCode: m.stdCode || null, posX: m.posX, posY: m.posY,
            method1: m.method1, method2: m.method2, tool1: m.tool1, tool2: m.tool2
        };
        const ok = m.mode === 'edit'
            ? await request(`/plug/points/${m.pointId}`, { method: 'PUT', json })
            : await request(`/plug/areas/${areaId}/points`, { method: 'POST', json });
        setBusy(false);
        if (ok) { setPointModal(null); loadPoints(areaId); }
    };

    const editPoint = (p) => setPointModal({
        mode: 'edit', pointId: p.PointID, pointName: p.PointName, stdCode: p.StdCode || '',
        posX: p.PosX, posY: p.PosY, method1: p.Method1 || '', method2: p.Method2 || '',
        tool1: p.Tool1 || '', tool2: p.Tool2 || ''
    });

    const removePoint = (p) => confirmAction(`ลบจุดตรวจที่ ${p.PointNo} "${p.PointName}" ? (ใบตรวจเก่ายังคงข้อมูลเดิม)`, async () => {
        if (await request(`/plug/points/${p.PointID}`, { method: 'DELETE' })) loadPoints(areaId);
    });

    // drag a pin; PUT the full body on release
    const onPinPointerDown = (e, p) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { id: p.PointID, startX: e.clientX, startY: e.clientY, moved: false, x: p.PosX, y: p.PosY };
    };
    const onPinPointerMove = (e, p) => {
        const d = dragRef.current;
        if (!d || d.id !== p.PointID) return;
        if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3) d.moved = true;
        if (!d.moved) return;
        const { x, y } = pctFromEvent(e);
        d.x = x; d.y = y;
        setPoints(prev => prev.map(q => (q.PointID === p.PointID ? { ...q, PosX: x, PosY: y } : q)));
    };
    const onPinPointerUp = async (e, p) => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d || d.id !== p.PointID || !d.moved) return;
        const posX = Number(d.x.toFixed(3));
        const posY = Number(d.y.toFixed(3));
        const ok = await request(`/plug/points/${p.PointID}`, { method: 'PUT', json: pointBody(p, { posX, posY }) });
        if (!ok) loadPoints(areaId);
    };

    // ---------- render ----------
    const FactoryPicker = () => (
        <select className={`${inputCls} max-w-xs`} value={factoryId} onChange={(e) => setFactoryId(e.target.value)}>
            {!factories.length && <option value="">— ยังไม่มีโรงงาน —</option>}
            {factories.map(f => <option key={f.FactoryID} value={f.FactoryID}>{f.FactoryName}</option>)}
        </select>
    );

    const AreaPicker = () => (
        <select className={`${inputCls} max-w-xs`} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {!areasOfFactory.length && <option value="">— ยังไม่มีพื้นที่ —</option>}
            {areasOfFactory.map(a => <option key={a.AreaID} value={a.AreaID}>{a.AreaName}</option>)}
        </select>
    );

    const ImageUploadBox = ({ label, url, onFile }) => (
        <div className="flex flex-col items-start gap-1">
            <span className="text-[11px] font-bold text-slate-500">{label}</span>
            <label className="relative w-24 h-20 border border-dashed border-slate-300 rounded-lg flex items-center justify-center overflow-hidden cursor-pointer hover:border-indigo-400 bg-slate-50">
                {url ? <img src={imgSrc(url)} alt={label} className="w-full h-full object-contain" /> : <Upload size={18} className="text-slate-400" />}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
            </label>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">PLUG MASTER</h3>
                    <p className="text-slate-500 text-xs">ตั้งค่าโรงงาน พื้นที่ มาตรฐานเต้ารับ และจุดตรวจสำหรับใบตรวจปลั๊กไฟประจำเดือน</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto">
                    {SUB_TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setSubTab(t.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${subTab === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <t.icon size={15} />
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ================= FACTORIES ================= */}
            {subTab === 'factories' && (
                <div className="space-y-3">
                    <div className="flex justify-end">
                        <button className={btnPri} onClick={() => setFactoryModal({ name: '' })}><Plus size={16} /> เพิ่มโรงงาน</button>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-xs">
                                <tr><th className="text-left px-4 py-2">โรงงาน</th><th className="text-left px-4 py-2">จำนวนพื้นที่</th><th className="w-28" /></tr>
                            </thead>
                            <tbody>
                                {factories.map(f => (
                                    <tr key={f.FactoryID} className="border-t border-slate-100">
                                        <td className="px-4 py-2 font-bold text-slate-700">{f.FactoryName}</td>
                                        <td className="px-4 py-2 text-slate-500">{areas.filter(a => a.FactoryID === f.FactoryID).length}</td>
                                        <td className="px-4 py-2 flex gap-2 justify-end">
                                            <button className={btnGhost} onClick={() => setFactoryModal({ id: f.FactoryID, name: f.FactoryName })}><Edit2 size={13} /></button>
                                            <button className={`${btnGhost} text-red-600`} onClick={() => removeFactory(f)}><Trash2 size={13} /></button>
                                        </td>
                                    </tr>
                                ))}
                                {!factories.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">ยังไม่มีโรงงาน</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ================= AREAS ================= */}
            {subTab === 'areas' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        {FactoryPicker()}
                        <button className={btnPri} onClick={() => openAreaModal(null)} disabled={!factoryId}><Plus size={16} /> เพิ่มพื้นที่</button>
                    </div>
                    {areasOfFactory.map(a => (
                        <div key={a.AreaID} className="border border-slate-200 rounded-xl p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <div className="font-black text-slate-800">{a.AreaName}</div>
                                    <div className="text-xs text-slate-500">{a.DeptName || '— ไม่ระบุฝ่าย/แผนก —'}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button className={btnGhost} onClick={() => openAreaModal(a)}><Edit2 size={13} /> แก้ไข</button>
                                    <button className={`${btnGhost} text-red-600`} onClick={() => removeArea(a)}><Trash2 size={13} /></button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                {ImageUploadBox({ label: "รูปผัง (Layout)", url: a.LayoutImage, onFile: (f) => uploadAreaImage(a, 'layout', f) })}
                                {ImageUploadBox({ label: a.Panel1Title || 'ช่องรูป 1', url: a.Panel1Image, onFile: (f) => uploadAreaImage(a, 'panel1', f) })}
                                {ImageUploadBox({ label: a.Panel2Title || 'ช่องรูป 2', url: a.Panel2Image, onFile: (f) => uploadAreaImage(a, 'panel2', f) })}
                            </div>
                        </div>
                    ))}
                    {!areasOfFactory.length && <div className="text-center text-slate-400 py-10">ยังไม่มีพื้นที่ในโรงงานนี้</div>}
                </div>
            )}

            {/* ================= STANDARDS ================= */}
            {subTab === 'standards' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">มาตรฐานใช้ร่วมกันทุกพื้นที่ — ใบตรวจเก็บสำเนา ณ ตอนสร้างใบ การแก้ไขภายหลังไม่กระทบใบเก่า</p>
                        <button className={btnPri} onClick={addStandard}><Plus size={16} /> เพิ่มมาตรฐาน</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {standards.map(s => (
                            <div key={s.StdID} className="border border-slate-200 rounded-xl p-4 flex gap-3">
                                <label className="w-20 h-28 border border-dashed border-slate-300 rounded-lg flex items-center justify-center overflow-hidden cursor-pointer hover:border-indigo-400 bg-slate-50 shrink-0">
                                    {s.ImageUrl ? <img src={imgSrc(s.ImageUrl)} alt={s.Code} className="w-full h-full object-contain" /> : <Upload size={18} className="text-slate-400" />}
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { uploadStandardImage(s, e.target.files[0]); e.target.value = ''; }} />
                                </label>
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="font-black text-slate-800">มาตรฐานเต้ารับ แบบ {s.Code}</span>
                                        <button className="text-slate-400 hover:text-red-600" onClick={() => removeStandard(s)}><Trash2 size={15} /></button>
                                    </div>
                                    <textarea
                                        rows={2}
                                        className={inputCls}
                                        placeholder={'ยี่ห้อ/รุ่น\nมอก.'}
                                        value={s.Name || ''}
                                        onChange={(e) => patchStandardLocal(s.StdID, { Name: e.target.value })}
                                        onBlur={() => saveStandard(s)}
                                    />
                                    <div className="flex items-center gap-2">
                                        <ShapeIcon shape={s.Shape} />
                                        <select
                                            className={inputCls}
                                            value={s.Shape}
                                            onChange={(e) => { const next = { ...s, Shape: e.target.value }; patchStandardLocal(s.StdID, { Shape: e.target.value }); saveStandard(next); }}
                                        >
                                            {SHAPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {!standards.length && <div className="text-center text-slate-400 py-10">ยังไม่มีมาตรฐาน</div>}
                </div>
            )}

            {/* ================= POINTS ================= */}
            {subTab === 'points' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                        {FactoryPicker()}
                        {AreaPicker()}
                    </div>
                    <p className="text-xs text-slate-500 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                        ใบตรวจที่สร้างแล้วเป็นสำเนา (snapshot) การเพิ่ม/ย้ายจุดที่นี่จะไม่เปลี่ยนใบเดิมอัตโนมัติ — จุดใหม่ต้องกด
                        <b> “เพิ่มจุดใหม่เข้าใบ” </b>ที่หน้า Plug Check เพื่อเพิ่มเข้าใบที่กำลังใช้งาน
                    </p>

                    {!selectedArea && <div className="text-center text-slate-400 py-10">กรุณาเลือกพื้นที่</div>}

                    {selectedArea && (
                        <>
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    className={`${btnGhost} ${placing ? '!bg-indigo-600 !text-white' : ''}`}
                                    onClick={() => setPlacing(p => !p)}
                                >
                                    <MapPin size={14} /> {placing ? 'กำลังวางปลั๊ก (คลิกบนผัง)' : 'วางปลั๊ก'}
                                </button>
                                <select className={`${inputCls} max-w-[200px]`} value={placeStd} onChange={(e) => setPlaceStd(e.target.value)}>
                                    {standards.map(s => <option key={s.Code} value={s.Code}>แบบ {s.Code}</option>)}
                                </select>
                                <span className="text-[11px] text-slate-400">ลากหมุดเพื่อย้าย · ดับเบิลคลิกเพื่อแก้ไข</span>
                            </div>

                            <div
                                ref={layoutRef}
                                onClick={onLayoutClick}
                                className={`relative w-full max-w-4xl aspect-[805/703] border border-slate-300 rounded-lg overflow-hidden bg-slate-50 select-none ${placing ? 'cursor-crosshair' : ''}`}
                            >
                                {selectedArea.LayoutImage
                                    ? <img src={imgSrc(selectedArea.LayoutImage)} alt="layout" draggable={false} className="absolute inset-0 w-full h-full object-contain" />
                                    : <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm text-center px-6">ยังไม่มีรูปผัง — อัปโหลดที่แท็บ “พื้นที่”</div>}
                                {points.filter(p => p.PosX != null && p.PosY != null).map(p => {
                                    const std = stdByCode(p.StdCode);
                                    return (
                                        <div
                                            key={p.PointID}
                                            data-pin
                                            title={`จุดที่ ${p.PointNo} · ${p.PointName}`}
                                            className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-grab active:cursor-grabbing drop-shadow touch-none"
                                            style={{ left: `${p.PosX}%`, top: `${p.PosY}%` }}
                                            onPointerDown={(e) => onPinPointerDown(e, p)}
                                            onPointerMove={(e) => onPinPointerMove(e, p)}
                                            onPointerUp={(e) => onPinPointerUp(e, p)}
                                            onDoubleClick={() => editPoint(p)}
                                        >
                                            <ShapeIcon shape={std?.Shape || 'circle'} className="absolute inset-0 w-full h-full" />
                                            <span className="relative text-white text-[11px] font-bold">{p.PointNo}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-500 text-xs">
                                        <tr>
                                            <th className="px-3 py-2 text-left">เลขที่</th>
                                            <th className="px-3 py-2 text-left">จุดตรวจ</th>
                                            <th className="px-3 py-2 text-left">มาตรฐาน</th>
                                            <th className="px-3 py-2 text-left">วิธีการ</th>
                                            <th className="px-3 py-2 text-left">เครื่องมือ</th>
                                            <th className="px-3 py-2 text-left">ตำแหน่ง</th>
                                            <th className="w-24" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {points.map(p => (
                                            <tr key={p.PointID} className="border-t border-slate-100">
                                                <td className="px-3 py-2 font-bold">{p.PointNo}</td>
                                                <td className="px-3 py-2">{p.PointName}</td>
                                                <td className="px-3 py-2">
                                                    <span className="inline-flex items-center gap-1">
                                                        <ShapeIcon shape={stdByCode(p.StdCode)?.Shape || 'circle'} className="w-4 h-4" />
                                                        {p.StdCode ? `แบบ ${p.StdCode}` : '-'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-xs text-slate-500">{[p.Method1, p.Method2].filter(Boolean).join(' / ')}</td>
                                                <td className="px-3 py-2 text-xs text-slate-500">{[p.Tool1, p.Tool2].filter(Boolean).join(' / ')}</td>
                                                <td className="px-3 py-2 text-xs text-slate-400">{p.PosX != null ? `${Number(p.PosX).toFixed(1)}%, ${Number(p.PosY).toFixed(1)}%` : 'ยังไม่วางบนผัง'}</td>
                                                <td className="px-3 py-2 flex gap-2 justify-end">
                                                    <button className={btnGhost} onClick={() => editPoint(p)}><Edit2 size={13} /></button>
                                                    <button className={`${btnGhost} text-red-600`} onClick={() => removePoint(p)}><Trash2 size={13} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                        {!points.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">ยังไม่มีจุดตรวจ — กด “วางปลั๊ก” แล้วคลิกบนผัง</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ================= MODALS ================= */}
            {factoryModal && (
                <ModalShell title={factoryModal.id ? 'แก้ไขโรงงาน' : 'เพิ่มโรงงาน'} onClose={() => setFactoryModal(null)}>
                    <Field label="ชื่อโรงงาน">
                        <input autoFocus className={inputCls} value={factoryModal.name} onChange={(e) => setFactoryModal({ ...factoryModal, name: e.target.value })} />
                    </Field>
                    <div className="flex justify-end gap-2 mt-2">
                        <button className={btnGhost} onClick={() => setFactoryModal(null)}>ยกเลิก</button>
                        <button className={btnPri} disabled={busy} onClick={saveFactory}><Check size={16} /> บันทึก</button>
                    </div>
                </ModalShell>
            )}

            {areaModal && (
                <ModalShell title={areaModal.id ? 'แก้ไขพื้นที่' : 'เพิ่มพื้นที่'} onClose={() => setAreaModal(null)} wide>
                    <Field label="โรงงาน">
                        <select className={inputCls} value={areaModal.factoryId || ''} onChange={(e) => setAreaModal({ ...areaModal, factoryId: e.target.value })}>
                            {factories.map(f => <option key={f.FactoryID} value={f.FactoryID}>{f.FactoryName}</option>)}
                        </select>
                    </Field>
                    {[
                        ['areaName', 'ชื่อพื้นที่ (เช่น OFFICE Factory 2)'],
                        ['deptName', 'ฝ่าย / แผนก'],
                        ['layoutCaption', 'ข้อความบนผัง (Lay out Area ...)'],
                        ['panel1Title', 'หัวข้อช่องรูปที่ 1'],
                        ['panel2Title', 'หัวข้อช่องรูปที่ 2']
                    ].map(([key, label]) => (
                        <Field key={key} label={label}>
                            <input className={inputCls} value={areaModal.form[key]} onChange={(e) => setAreaModal({ ...areaModal, form: { ...areaModal.form, [key]: e.target.value } })} />
                        </Field>
                    ))}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[['panel1Caption', 'คำอธิบายช่องรูปที่ 1'], ['panel2Caption', 'คำอธิบายช่องรูปที่ 2']].map(([key, label]) => (
                            <Field key={key} label={label}>
                                <textarea rows={4} className={inputCls} value={areaModal.form[key]} onChange={(e) => setAreaModal({ ...areaModal, form: { ...areaModal.form, [key]: e.target.value } })} />
                            </Field>
                        ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">รูปผังและรูปช่องที่ 1-2 อัปโหลดได้หลังบันทึกพื้นที่ (ในรายการพื้นที่)</p>
                    <div className="flex justify-end gap-2">
                        <button className={btnGhost} onClick={() => setAreaModal(null)}>ยกเลิก</button>
                        <button className={btnPri} disabled={busy} onClick={saveArea}><Check size={16} /> บันทึก</button>
                    </div>
                </ModalShell>
            )}

            {pointModal && (
                <ModalShell title={pointModal.mode === 'edit' ? 'แก้ไขจุดตรวจ' : 'เพิ่มจุดตรวจ'} onClose={() => setPointModal(null)}>
                    <Field label="ชื่อจุดตรวจ">
                        <input autoFocus className={inputCls} value={pointModal.pointName} onChange={(e) => setPointModal({ ...pointModal, pointName: e.target.value })} />
                    </Field>
                    <Field label="มาตรฐานเต้ารับ">
                        <select className={inputCls} value={pointModal.stdCode || ''} onChange={(e) => setPointModal({ ...pointModal, stdCode: e.target.value })}>
                            <option value="">— ไม่ระบุ —</option>
                            {standards.map(s => <option key={s.Code} value={s.Code}>แบบ {s.Code}</option>)}
                        </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="วิธีการ 1"><input className={inputCls} value={pointModal.method1} onChange={(e) => setPointModal({ ...pointModal, method1: e.target.value })} /></Field>
                        <Field label="เครื่องมือ 1"><input className={inputCls} value={pointModal.tool1} onChange={(e) => setPointModal({ ...pointModal, tool1: e.target.value })} /></Field>
                        <Field label="วิธีการ 2"><input className={inputCls} value={pointModal.method2} onChange={(e) => setPointModal({ ...pointModal, method2: e.target.value })} /></Field>
                        <Field label="เครื่องมือ 2"><input className={inputCls} value={pointModal.tool2} onChange={(e) => setPointModal({ ...pointModal, tool2: e.target.value })} /></Field>
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                        <button className={btnGhost} onClick={() => setPointModal(null)}>ยกเลิก</button>
                        <button className={btnPri} disabled={busy} onClick={savePoint}><Check size={16} /> บันทึก</button>
                    </div>
                </ModalShell>
            )}

            <AlertModal {...alertModal} />
        </div>
    );
};

export default PlugMasterTab;
