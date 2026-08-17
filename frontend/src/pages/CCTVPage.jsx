import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Plus, RefreshCw, Server, Network, Camera, Wifi, WifiOff, ChevronDown, X } from 'lucide-react';
import { API_BASE, API_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import CCTVFormModal from '../components/cctv/CCTVFormModal';
import RackFormModal from '../components/cctv/RackFormModal';
import SwitchFormModal from '../components/cctv/SwitchFormModal';
import CCTVLocationModal from '../components/cctv/CCTVLocationModal';
import AlertModal from '../components/AlertModal';
import MaintenanceLogModal from '../components/cctv/MaintenanceLogModal';
import Portal from '../components/Portal';
import { drawCCTVIcon } from '../components/cctv/cctvIconUtils';

// ── SearchInput แยก component เพื่อไม่ให้ CCTVPage re-render ทุก keystroke ──
function CameraSearchInput({ value, onChange, onClear }) {
    const [local, setLocal] = useState(value);
    const timerRef = useRef(null);

    useEffect(() => { if (value === '') setLocal(''); }, [value]);

    const handleChange = (e) => {
        const v = e.target.value;
        setLocal(v);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onChange(v), 150);
    };

    return (
        <div className="relative">
            <input
                type="text"
                placeholder="ค้นหา ชื่อ, IP, model, asset..."
                value={local}
                onChange={handleChange}
                className="pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400 w-52 bg-white"
            />
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            {local && (
                <button onClick={() => { setLocal(''); onClear(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={11} />
                </button>
            )}
        </div>
    );
}

const STATUS_COLOR = { online: '#16a34a', offline: '#dc2626', unknown: '#9ca3af', removed: '#6b7280', retired: '#374151' };

// แปลง fov_direction string → canvas angle (องศา)
const FOV_ANGLE_MAP = {
    N: 270, NNE: 292.5, NE: 315, ENE: 337.5,
    E: 0, ESE: 22.5, SE: 45, SSE: 67.5,
    S: 90, SSW: 112.5, SW: 135, WSW: 157.5,
    W: 180, WNW: 202.5, NW: 225, NNW: 247.5,
};

function getFovAngle(fovDirection) {
    if (!fovDirection) return null;
    if (fovDirection.startsWith('CUSTOM_')) return parseFloat(fovDirection.replace('CUSTOM_', ''));
    return FOV_ANGLE_MAP[fovDirection] ?? null;
}

function drawFovCone(ctx, px, py, angleDeg, spreadDeg = 60, len = 80,
    fill = 'rgba(59,130,246,0.18)', stroke = 'rgba(59,130,246,0.55)') {
    ctx.save();
    ctx.beginPath();
    if (spreadDeg >= 360) {
        ctx.arc(px, py, len, 0, Math.PI * 2);
    } else {
        const rad = angleDeg * (Math.PI / 180);
        const half = (spreadDeg / 2) * (Math.PI / 180);
        const x1 = px + Math.cos(rad - half) * len;
        const y1 = py + Math.sin(rad - half) * len;
        ctx.moveTo(px, py);
        ctx.lineTo(x1, y1);
        ctx.arc(px, py, len, rad - half, rad + half);
        ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
}



// ── CameraListSection — แยก component เพื่อให้ search/listSearch state
// ไม่อยู่ใน CCTVPage และไม่ทำให้ CCTVPage re-render เมื่อพิมพ์ค้นหา ──────────
const CameraListSection = ({ cameras, currentName, listLocFilter, setListLocFilter,
    listPage, setListPage, selectedCam, setSelectedCam, setDetailModal,
    setLocationModal, setCamModal, fullUrl, selectedLayout ,onJumpToCamera  }) => {

    const [search, setSearch] = useState('');
    const ITEMS = 20;

    // reset search เมื่อ layout เปลี่ยน
    useEffect(() => { setSearch(''); setListPage(1); }, [selectedLayout]);

    const noLoc = cameras.filter(c => c.location_x === null || c.location_y === null);
    const byLoc = listLocFilter === 'no-location' ? noLoc
        : listLocFilter === 'has-location' ? cameras.filter(c => c.location_x !== null)
            : cameras;
    const displayed = search.trim()
        ? byLoc.filter(c => {
            const q = search.toLowerCase();
            return (c.name || '').toLowerCase().includes(q)
                || (c.ip_address || '').toLowerCase().includes(q)
                || (c.model || '').toLowerCase().includes(q)
                || (c.fix_asset || '').toLowerCase().includes(q)
                || (c.rack_name || '').toLowerCase().includes(q)
                || (c.switch_name || '').toLowerCase().includes(q)
                || (c.layout_name || '').toLowerCase().includes(q); 
        })
        : byLoc;

    const totalPages = Math.max(1, Math.ceil(displayed.length / ITEMS));
    const paginated = displayed.slice((listPage - 1) * ITEMS, listPage * ITEMS);
    
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600">รายการกล้องทั้งหมด — {currentName}</span>
                    <button onClick={() => setCamModal({ mode: 'add' })}
                        className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                        <Plus size={11} /> เพิ่มกล้อง
                    </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Search — local state ไม่กระทบ CCTVPage */}
                    <div className="relative">
                        <input type="text" placeholder="ค้นหา ชื่อ, IP, model, asset..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setListPage(1); }}
                            className="pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400 w-52 bg-white" />
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                        {search && <button onClick={() => { setSearch(''); setListPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={11} /></button>}
                    </div>
                    {noLoc.length > 0 && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">⚠️ {noLoc.length} ยังไม่มีตำแหน่ง</span>
                    )}
                    {[
                        { id: 'all', label: `ทั้งหมด (${cameras.length})` },
                        { id: 'has-location', label: `มีตำแหน่ง (${cameras.length - noLoc.length})` },
                        { id: 'no-location', label: `ยังไม่มี (${noLoc.length})` },
                    ].map(f => (
                        <button key={f.id} onClick={() => { setListLocFilter(f.id); setListPage(1); }}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${listLocFilter === f.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

           <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">

                <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
    <col style={{ width: 36 }} /><col style={{ width: '20%' }} /><col style={{ width: '11%' }} />
    <col style={{ width: '15%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
    <col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: 64 }} />
</colgroup>
                        <thead>
                            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium bg-gray-50">
                                <th className="px-3 py-2" /><th className="px-3 py-2 text-left">ชื่อ / IP</th>
                                <th className="px-3 py-2 text-left">Model</th><th className="px-3 py-2 text-left">Rack / Switch</th>
                                <th className="px-3 py-2 text-left">Fix Asset</th><th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-left">Factory</th>
                                <th className="px-3 py-2 text-left">ตำแหน่ง</th><th className="px-3 py-2" />
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                       <tbody className="divide-y divide-gray-50">
    {paginated.map(cam => {
        const hasLoc = cam.location_x !== null && cam.location_y !== null;
        const isSel = selectedCam === cam.id;
        return (
            <tr key={cam.id}
                onClick={() => onJumpToCamera(cam)}
                className={`transition-colors cursor-pointer ${isSel ? 'bg-amber-50' : !hasLoc ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-gray-50'}`}>
                <td className="px-3 py-2">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center overflow-hidden"
                        style={{ background: `${STATUS_COLOR[cam.status]}22` }}>
                        {cam.icon_url ? <img src={fullUrl(cam.icon_url)} className="w-full h-full object-cover" /> : <span className="text-sm">📹</span>}
                    </div>
                </td>
                <td className="px-3 py-2">
                    <div className={`font-medium truncate text-xs ${isSel ? 'text-amber-700' : 'text-gray-900'}`}>{cam.name}</div>
                    <div className="text-[11px] text-gray-400">{cam.ip_address || '—'}</div>
                </td>
                <td className="px-3 py-2 text-gray-600 text-xs truncate">{cam.model || '—'}</td>
                <td className="px-3 py-2">
                    {cam.rack_name && <div className="text-xs font-medium text-purple-700 truncate">{cam.rack_name}</div>}
                    {cam.switch_name && <div className="text-[11px] text-gray-400 truncate">{cam.switch_name}</div>}
                    {!cam.rack_name && <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 text-gray-600 text-xs">{cam.fix_asset || '—'}</td>
                <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${cam.status === 'online' ? 'bg-green-100 text-green-700' :
                            cam.status === 'offline' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[cam.status] }} />
                        {cam.status}
                    </span>
                </td>
                {/* Factory — ย้ายมาก่อนตำแหน่ง */}
                <td className="px-3 py-2 text-gray-600 text-xs whitespace-normal leading-tight">{cam.layout_name || '—'}</td>
                {/* ตำแหน่ง */}
                <td className="px-3 py-2">
                    {hasLoc
                        ? <span className="inline-flex items-center gap-1 text-[11px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full"><MapPin size={9} /> มีแล้ว</span>
                        : <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium"><MapPin size={9} /> ยังไม่มี</span>
                    }
                </td>
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                        <button onClick={() => setLocationModal(cam)} title="ตำแหน่ง"
                            className={`p-1 rounded transition-colors ${!hasLoc ? 'text-amber-500 hover:bg-amber-50' : 'text-blue-400 hover:bg-blue-50'}`}>
                            <MapPin size={12} />
                        </button>
                        <button onClick={() => setCamModal({ mode: 'edit', data: cam })} title="แก้ไข"
                            className="p-1 rounded hover:bg-gray-100 text-gray-400">✏️</button>
                    </div>
                </td>
            </tr>
        );
    })}
    {!paginated.length && (
        <tr><td colSpan={9} className="text-center py-8 text-gray-400 text-sm">
            {listLocFilter === 'no-location' ? '🎉 กล้องทุกตัวมีตำแหน่งแล้ว!' : 'ยังไม่มีกล้องใน Factory นี้'}
        </td></tr>
    )}
</tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                        <span className="text-xs text-gray-500">แสดง {((listPage - 1) * ITEMS) + 1}–{Math.min(listPage * ITEMS, displayed.length)} จาก {displayed.length} รายการ</span>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setListPage(1)} disabled={listPage === 1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-white">«</button>
                            <button onClick={() => setListPage(p => Math.max(1, p - 1))} disabled={listPage === 1} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-white">‹</button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - listPage) <= 1)
                                .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...'); acc.push(p); return acc; }, [])
                                .map((p, i) => p === '...'
                                    ? <span key={`e${i}`} className="px-1.5 text-xs text-gray-400">…</span>
                                    : <button key={p} onClick={() => setListPage(p)} className={`px-2.5 py-1 text-xs rounded border transition-colors ${listPage === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-white'}`}>{p}</button>
                                )}
                            <button onClick={() => setListPage(p => Math.min(totalPages, p + 1))} disabled={listPage === totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-white">›</button>
                            <button onClick={() => setListPage(totalPages)} disabled={listPage === totalPages} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-white">»</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Camera Maintenance Log History ───────────────────────────────────────
function CameraMaintenanceLogs({ cameraId, apiBase }) {
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

// ── Snapshot Tooltip Portal ───────────────────────────────────────────────
function TooltipPortal({ tooltip, canvasRef }) {
    const TW = 280, TH = 210, margin = 12;
    const canvasEl   = canvasRef.current;
    const canvasRect = canvasEl ? canvasEl.getBoundingClientRect() : null;

    let left = tooltip.x + 16;
    let top  = tooltip.y - 10;

    if (canvasRect) {
        if (left + TW > canvasRect.right  - margin) left = tooltip.x - TW - 16;
        if (left       < canvasRect.left  + margin) left = canvasRect.left + margin;
        if (top  + TH  > canvasRect.bottom - margin) top = canvasRect.bottom - TH - margin;
        if (top        < canvasRect.top   + margin) top  = canvasRect.top + margin;
    }

    return (
        <Portal>
            <div style={{ position:'fixed', left, top, zIndex:99990, pointerEvents:'none' }}>
                <div className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-white/10"
                     style={{ width: TW }}>
                    <img src={`${API_URL}${tooltip.cam.snapshot_url}`}
                         alt={tooltip.cam.name}
                         className="w-full object-cover"
                         style={{ maxHeight: 160 }}/>
                    <div className="px-3 py-2">
                        <div className="text-white text-xs font-semibold truncate">{tooltip.cam.name}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ background: STATUS_COLOR[tooltip.cam.status] }}/>
                            <span className="text-[11px] text-gray-400">{tooltip.cam.status}</span>
                        </div>
                    </div>
                </div>
            </div>
        </Portal>
    );
}

function CCTVPage() {
    const { user } = useAuth();
    const [layouts, setLayouts] = useState([]);
    const [selectedLayout, setSelectedLayout] = useState(null);
    const [allCameras, setAllCameras] = useState([]);
    const [allRacks, setAllRacks] = useState([]);   // rack ทุกตัวจาก DB
    const [allSwitches, setAllSwitches] = useState([]);
    const [hoveredCam, setHoveredCam] = useState(null);
    const [selectedCam, setSelectedCam] = useState(null);
    const [showLines, setShowLines] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [pinging, setPinging] = useState(false);
    const pulseRef = useRef(0);
    const [activeTab, setActiveTab] = useState('map');
    const [tooltip, setTooltip] = useState(null);

    // Repair & Removal logs
    const [maintenanceLogs, setMaintenanceLogs] = useState([]);
    const [maintenanceModal, setMaintenanceModal] = useState(null); // null | {mode:'add',logType:'repair'|'removal'} | {mode:'edit', data}
    const [maintenanceSearch, setMaintenanceSearch] = useState('');
    const [maintenanceTypeFilter, setMaintenanceTypeFilter] = useState('all'); // all/repair/removal

    // Modals
    const [camModal, setCamModal] = useState(null);
    const [rackModal, setRackModal] = useState(null);
    const [switchModal, setSwitchModal] = useState(null);
    const [locationModal, setLocationModal] = useState(null);
    const [detailModal, setDetailModal] = useState(null);
    const [rackDetailModal, setRackDetailModal] = useState(null); // modal รายละเอียด rack
    const [selectedRackId, setSelectedRackId] = useState(null); // highlight เส้นสาย
    const [listLocFilter, setListLocFilter] = useState('all');
    const [listPage, setListPage] = useState(1);
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
    const [layoutDropOpen, setLayoutDropOpen] = useState(false);

    const canvasRef = useRef(null);
    const mapRef    = useRef(null);  // ← เพิ่ม
    const animFrameRef = useRef(null);
    const animTickRef  = useRef(0);
    const imageRef = useRef(null);

    // derived cameras + racks — filter ตาม selectedLayout ใน frontend
    // ต้อง declare ก่อน useEffect เพราะ canvas useEffect ใช้ทั้งคู่
    const cameras = selectedLayout
        ? allCameras.filter(c =>
            c.factory_layout_id === selectedLayout ||
            c.factory_layout_id === +selectedLayout)
        : allCameras;

    const racks = selectedLayout
        ? allRacks.filter(r =>
            r.factory_layout_id === selectedLayout ||
            r.factory_layout_id === +selectedLayout)
        : allRacks;

    // ── Fetch ─────────────────────────────────────────────────────────────
    const fetchLayouts = async () => {
        const r = await fetch(`${API_BASE}/factory-layouts`);
        const d = await r.json();
        if (d.success && d.data.length) {
            setLayouts(d.data);
            setSelectedLayout(prev => prev || d.data[0].id);
        }
    };

    const fetchCameras = useCallback(async () => {
        // ดึงกล้องทุกตัว แล้ว filter ใน frontend — ป้องกันกล้องหายถ้า factory_layout_id ไม่ตรง
        const r = await fetch(`${API_BASE}/cctv/cameras`);
        const d = await r.json();
        if (d.success) setAllCameras(d.data);
    }, []);

    const fetchRacks = useCallback(async () => {
        // ดึง rack ทุกตัว แล้ว filter ใน frontend — ป้องกัน rack หายถ้า factory_layout_id null
        const r = await fetch(`${API_BASE}/cctv/racks`);
        const d = await r.json();
        if (d.success) setAllRacks(d.data);
    }, []);

    const fetchSwitches = async () => {
        const r = await fetch(`${API_BASE}/cctv/switches`);
        const d = await r.json();
        if (d.success) setAllSwitches(d.data);
    };

    const fetchMaintenanceLogs = async () => {
        const r = await fetch(`${API_BASE}/cctv/maintenance-logs`);
        const d = await r.json();
        if (d.success) setMaintenanceLogs(d.data);
    };

    const refreshAll = useCallback(() => {
        fetchCameras();
        fetchRacks();
        fetchSwitches();
    }, [fetchCameras, fetchRacks]);

    useEffect(() => { fetchLayouts(); fetchCameras(); fetchRacks(); fetchSwitches(); fetchMaintenanceLogs(); }, []);
    useEffect(() => { if (selectedLayout) { setImageLoaded(false); setListPage(1); } }, [selectedLayout]);
    


    // ── Canvas draw ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!canvasRef.current || !imageRef.current || !imageLoaded) return;
 
        const canvas = canvasRef.current;
        const img    = imageRef.current;
        let animFrame;
 
        const draw = () => {
            pulseRef.current = (pulseRef.current + 0.05) % (Math.PI * 2);
            const pulse = pulseRef.current;
 
            const ctx = canvas.getContext('2d');
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
 
            // ── เส้นสาย (Rack → Camera) ──────────────────────────────
            cameras.forEach(cam => {
                if (cam.location_x == null || !cam.rack_id) return;
                const rack = racks.find(r => r.id === cam.rack_id);
                if (!rack || rack.location_x == null) return;
 
                const isHovered = hoveredCam === cam.id;
                const isCamSel  = selectedCam === cam.id;
                const isRackSel = selectedRackId === cam.rack_id;
                const show = showLines || isHovered || isCamSel || isRackSel;
                if (!show) return;
 
                const x1 = (canvas.width  * rack.location_x) / 100;
                const y1 = (canvas.height * rack.location_y) / 100;
                const x2 = (canvas.width  * cam.location_x)  / 100;
                const y2 = (canvas.height * cam.location_y)  / 100;
 
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([8, 4]);
                ctx.lineWidth   = (isCamSel || isHovered || isRackSel) ? 2.5 : 1.2;
                ctx.strokeStyle = isRackSel ? '#7c3aed'
                    : (isCamSel || isHovered) ? (STATUS_COLOR[cam.status] || '#9ca3af')
                    : 'rgba(124,58,237,0.45)';
                ctx.globalAlpha = (isCamSel || isHovered || isRackSel) ? 1 : 0.5;
                ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                ctx.restore();
            });

            // ── วาด Rack pins ─────────────────────────────────────────
            racks.forEach(rack => {
                if (rack.location_x == null || rack.location_y == null) return;
                const px = (canvas.width  * rack.location_x) / 100;
                const py = (canvas.height * rack.location_y) / 100;
                const r  = 12;
                const isSel    = selectedRackId === rack.id;
                const pinColor = rack.rack_type === 'distribution' ? '#1d4ed8' : '#7c3aed';
                const selColor = rack.rack_type === 'distribution' ? '#1e3a8a' : '#5b21b6';
 
                ctx.save();
                if (isSel) { ctx.shadowBlur = 14; ctx.shadowColor = pinColor; }
                ctx.fillStyle = isSel ? selColor : pinColor;
                ctx.beginPath(); ctx.arc(px, py, isSel ? 22 : r, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'white'; ctx.lineWidth = isSel ? 3 : 2.5; ctx.stroke();
                ctx.fillStyle = 'white';
                ctx.font = `${isSel ? 16 : 13}px Arial`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(rack.rack_type === 'distribution' ? '🔀' : '🖥️', px, py);
                ctx.restore();
 
                ctx.save();
                const fontSize = isSel ? 12 : 11;
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                const tw = ctx.measureText(rack.name).width + 10;
                const ly = py + (isSel ? 22 : r) + 3;
                ctx.fillStyle = isSel ? selColor : `${pinColor}CC`;
                ctx.beginPath(); ctx.roundRect(px - tw / 2, ly, tw, fontSize + 6, 4); ctx.fill();
                ctx.fillStyle = 'white';
                ctx.fillText(rack.name, px, ly + 3);
                ctx.restore();
            });
 
            // ── วาด FOV cones ─────────────────────────────────────────
            const fovLen = Math.min(canvas.width, canvas.height) * 0.09;
            cameras.forEach(cam => {
                if (cam.location_x === null || !cam.fov_direction) return;
                const px    = (canvas.width  * cam.location_x) / 100;
                const py    = (canvas.height * cam.location_y) / 100;
                const angle = getFovAngle(cam.fov_direction);
                if (angle === null) return;
 
                const isHover = hoveredCam === cam.id;
                const isSel   = selectedCam === cam.id;
                const dim     = showLines && hoveredCam && !isHover && !isSel;
 
                const fill   = isSel ? 'rgba(245,158,11,0.22)' : isHover ? 'rgba(59,130,246,0.28)' : 'rgba(59,130,246,0.13)';
                const stroke = isSel ? 'rgba(245,158,11,0.7)'  : isHover ? 'rgba(59,130,246,0.7)'  : 'rgba(59,130,246,0.40)';
 
                ctx.save();
                ctx.globalAlpha = dim ? 0.15 : 1;
                ctx.restore();
                drawFovCone(ctx, px, py, angle, cam.fov_spread || 60, fovLen, fill, stroke);
            });
 
            // ── วาด Camera pins (Style E — beacon ring + pulse) ───────
            cameras.forEach(cam => {
                if (cam.location_x === null) return;
                const px      = (canvas.width  * cam.location_x) / 100;
                const py      = (canvas.height * cam.location_y) / 100;
                const isHover = hoveredCam === cam.id;
                const isSel   = selectedCam === cam.id;
                const r       = isHover || isSel ? 14 : 10;
                const dim     = showLines && hoveredCam && !isHover && !isSel;
                const bgColor = isSel ? '#f59e0b' : (STATUS_COLOR[cam.status] || '#9ca3af');
 
                ctx.save();
 
                // beacon rings กระพริบ
                const p1 = 0.12 + Math.sin(pulse)       * 0.11;
                const p2 = 0.28 + Math.sin(pulse + 1.1) * 0.16;
                [{ rr: r + 14, a: p1 }, { rr: r + 7, a: p2 }].forEach(({ rr, a }) => {
                    ctx.strokeStyle = bgColor;
                    ctx.lineWidth   = 2;
                    ctx.globalAlpha = dim ? 0.04 : a;
                    ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.stroke();
                });
 
                // วงหลัก — สีกระพริบ
                const bgAlpha = 0.72 + Math.sin(pulse * 1.5) * 0.28;
                ctx.globalAlpha = dim ? 0.25 : bgAlpha;
                ctx.fillStyle   = bgColor;
                ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.stroke();
                ctx.globalAlpha = dim ? 0.25 : 1;
 
                if (isSel) {
    // วงนอกกระพริบสีเหลือง
    const selPulse = 0.5 + Math.sin(pulse * 2) * 0.5;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth   = 3;
    ctx.globalAlpha = selPulse;
    ctx.beginPath(); ctx.arc(px, py, r + 20, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 14;
    ctx.shadowColor = '#f59e0b';
}
// icon กระพริบตาม bgAlpha ด้วย
ctx.globalAlpha = dim ? 0.25 : bgAlpha;
drawCCTVIcon(ctx, px, py, r, cam.icon_type || 'bullet', bgColor, 'white');
ctx.globalAlpha = 1;
ctx.shadowBlur = 0;
                ctx.restore();
 
                // label
                ctx.save();
                ctx.globalAlpha = dim ? 0.25 : 1;
                const labelText = cam.name;
                const fontSize  = isSel ? 13 : (isHover ? 12 : 11);
                ctx.font        = `bold ${fontSize}px Arial`;
                ctx.textAlign   = 'center'; ctx.textBaseline = 'top';
                const tw  = ctx.measureText(labelText).width + 10;
                const ly  = py + r + 9;
                ctx.fillStyle = isSel ? '#f59e0b' : isHover ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.65)';
                ctx.beginPath(); ctx.roundRect(px - tw / 2, ly, tw, fontSize + 6, 4); ctx.fill();
                ctx.fillStyle = 'white';
                ctx.fillText(labelText, px, ly + 3);
                ctx.restore();
            });
 
            animFrame = requestAnimationFrame(draw);
        };
 
        animFrame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animFrame);
 
    }, [imageLoaded, cameras, racks, hoveredCam, selectedCam, selectedRackId, showLines]);

    // ── Canvas events ─────────────────────────────────────────────────────
    const getHitCamera = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();

        // คำนวณสัดส่วนการขยายของภาพแบบ object-fit: contain เพื่อหาขนาดพิกเซลแสดงผลจริงบนหน้าจอ
        const imgRatio = canvas.width / canvas.height;
        const containerRatio = rect.width / rect.height;
        let renderedWidth, renderedHeight, offsetX = 0, offsetY = 0;

        if (imgRatio > containerRatio) {
            renderedWidth = rect.width;
            renderedHeight = rect.width / imgRatio;
            offsetY = (rect.height - renderedHeight) / 2;
        } else {
            renderedHeight = rect.height;
            renderedWidth = rect.height * imgRatio;
            offsetX = (rect.width - renderedWidth) / 2;
        }

        // แปลงพิกเซลเมาส์ที่คลิก ให้ตรงกับพิกเซลจริงภายในเนื้อผ้า Canvas
        const mx = (e.clientX - rect.left - offsetX) * (canvas.width / renderedWidth);
        const my = (e.clientY - rect.top - offsetY) * (canvas.height / renderedHeight);
        const CLICK_RADIUS = 20;

        return cameras.find(cam => {
            if (cam.location_x === null || cam.location_y === null) return false;
            const cx = (canvas.width * cam.location_x) / 100;
            const cy = (canvas.height * cam.location_y) / 100;
            const dx = mx - cx;
            const dy = my - cy;
            return Math.sqrt(dx * dx + dy * dy) <= CLICK_RADIUS;
        });
    };

    const handleMouseMove = (e) => {
        const cam = getHitCamera(e);
        setHoveredCam(cam?.id ?? null);

        if (cam) {
            canvasRef.current.style.cursor = 'pointer';
            setTooltip({ cam, x: e.clientX, y: e.clientY });
            return;
        }
        setTooltip(null);
        // เช็คว่า hover Rack pin ไหม
        if (canvasRef.current) {
            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const sx = canvas.width / rect.width;
            const sy = canvas.height / rect.height;
            const pct_x = ((e.clientX - rect.left) * sx / canvas.width) * 100;
            const pct_y = ((e.clientY - rect.top) * sy / canvas.height) * 100;
            const onRack = racks.some(r => {
                if (r.location_x == null) return false;
                const dx = pct_x - r.location_x;
                const dy = pct_y - r.location_y;
                return Math.sqrt(dx * dx + dy * dy) <= 3;
            });
            canvasRef.current.style.cursor = onRack ? 'pointer' : 'default';
        }
    };

    const handleClick = (e) => {
        const cam = getHitCamera(e);
        if (cam) {
            setSelectedCam(cam.id);
            setSelectedRackId(null);
            setDetailModal(cam);
            return;
        }
        // ตรวจสอบว่าคลิก Rack pin ไหม → highlight เส้นสายทุกตัวใน rack นั้น
        if (canvasRef.current) {
            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const sx = canvas.width / rect.width;
            const sy = canvas.height / rect.height;
            const pct_x = ((e.clientX - rect.left) * sx / canvas.width) * 100;
            const pct_y = ((e.clientY - rect.top) * sy / canvas.height) * 100;

            for (const rack of racks) {
                if (rack.location_x == null) continue;
                const dx = pct_x - rack.location_x;
                const dy = pct_y - rack.location_y;
                if (Math.sqrt(dx * dx + dy * dy) <= 3) {
                    // toggle highlight + เปิด detail modal
                    const isToggleOff = selectedRackId === rack.id;
                    setSelectedRackId(isToggleOff ? null : rack.id);
                    setSelectedCam(null);
                    if (!isToggleOff) {
                        setRackDetailModal({
                            ...rack,
                            cameras: cameras.filter(c => c.rack_id === rack.id),
                            switches: allSwitches.filter(s => s.rack_id === rack.id),
                        });
                    } else {
                        setRackDetailModal(null);
                    }
                    return;
                }
            }
        }
        setSelectedCam(null);
        setSelectedRackId(null);
    };

    // ── Ping all ──────────────────────────────────────────────────────────
    const handlePingAll = async () => {
        setPinging(true);
        try {
            await fetch(`${API_BASE}/cctv/ping-all`, { method: 'POST' });
            await fetchCameras();
        } finally {
            setPinging(false);
        }
    };

    // ── Ping by layout ────────────────────────────────────────────────────
    const handlePingLayout = async () => {
        if (!selectedLayout) { handlePingAll(); return; }
        setPinging(true);
        try {
            // ping เฉพาะกล้องใน layout ที่เลือก
            const camsInLayout = allCameras.filter(c => c.factory_layout_id === selectedLayout && c.ip_address);
            await Promise.all(camsInLayout.map(c =>
                fetch(`${API_BASE}/cctv/ping/${c.id}`, { method: 'POST' })
            ));
            await fetchCameras();
        } finally {
            setPinging(false);
        }
    };

    // ── Ping รายตัว ───────────────────────────────────────────────────────
    const [pingingId, setPingingId] = useState(null);
    const handlePingSingle = async (camId) => {
        setPingingId(camId);
        try {
            const r = await fetch(`${API_BASE}/cctv/ping/${camId}`, { method: 'POST' });
            const d = await r.json();
            await fetchCameras();
            setDetailModal(p => p?.id === camId ? { ...p, status: d.status, last_ping: new Date().toISOString() } : p);
        } finally {
            setPingingId(null);
        }
    };

    const handleCamModalSave = useCallback(() => {
        setCamModal(prev => {
            setAlertModal({
                isOpen: true, type: 'success', title: 'สำเร็จ',
                message: prev?.mode === 'add' ? 'เพิ่มกล้องเรียบร้อยแล้ว' : 'บันทึกข้อมูลเรียบร้อยแล้ว'
            });
            return null;
        });
        refreshAll();
    }, [refreshAll]);

    const handleCamModalClose = useCallback(() => setCamModal(null), []);
    const online  = allCameras.filter(c => c.status === 'online').length;
    const offline = allCameras.filter(c => c.status === 'offline').length;
    const current = layouts.find(l => l.id === selectedLayout);
    const fullUrl = (url) => !url ? null : url.startsWith('http') ? url : `${API_URL}${url}`;

    return (
        <div className="space-y-8 p-1">

            {/* ── Header row ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200">
                            <Camera className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 tracking-tight">CCTV MANAGEMENT</h2>
                    </div>
                    <p className="text-slate-500 font-medium pl-[52px]">จัดการกล้องวงจรปิด — แผนผัง Factory</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handlePingLayout} disabled={pinging}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        title={selectedLayout ? `Ping เฉพาะ ${current?.name}` : 'Ping ทุก Factory'}>
                        <RefreshCw size={13} className={pinging ? 'animate-spin' : ''} />
                        {selectedLayout ? `Ping ${current?.name?.split(':')[0] || 'Layout'}` : 'Ping All'}
                    </button>
                    {selectedLayout && (
                        <button onClick={handlePingAll} disabled={pinging}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                            <RefreshCw size={13} /> Ping All
                        </button>
                    )}
                    <button onClick={() => setCamModal({ mode: 'add' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                        <Plus size={13} /> เพิ่มกล้อง
                    </button>
                </div>
            </div>

            {/* ── Stats bar — compact ────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-2">
                {[
                    { label: 'ทั้งหมด', value: allCameras.length, icon: Camera, grad: 'from-blue-500 to-blue-600' },
                    { label: 'Online', value: online, icon: Wifi, grad: 'from-emerald-500 to-emerald-600' },
                    { label: 'Offline', value: offline, icon: WifiOff, grad: 'from-red-500 to-red-600' },
                    { label: 'Rack', value: allRacks.length, icon: Server, grad: 'from-violet-500 to-purple-600' },
                ].map(s => (
                    <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2.5 flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.grad} flex items-center justify-center flex-shrink-0`}>
                            <s.icon size={15} className="text-white" />
                        </div>
                        <div>
                            <div className="text-2xl font-black text-slate-900 leading-none">{s.value}</div>
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Camera count per Factory ───────────────────────────────── */}
            {layouts.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">กล้องแต่ละโรง</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-1.5">
                        {layouts.map(l => {
                            const count   = allCameras.filter(c => c.factory_layout_id === l.id).length;
                            const onlineC = allCameras.filter(c => c.factory_layout_id === l.id && c.status === 'online').length;
                            const isSel   = selectedLayout === l.id;
                            return (
                                <button key={l.id}
                                        onClick={() => { setSelectedLayout(l.id); setLayoutDropOpen(false); }}
                                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all
                                            ${isSel ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                                    <span className={`text-xs truncate ${isSel ? 'text-blue-700 font-semibold' : 'text-slate-600'}`}>{l.name}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <span className="text-xs font-bold text-slate-700">{count}</span>
                                        {count > 0 && (
                                            <span className={`text-[10px] px-1 rounded-full font-medium
                                                ${onlineC === count ? 'bg-green-100 text-green-600'
                                                : onlineC === 0 ? 'bg-red-100 text-red-600'
                                                : 'bg-amber-100 text-amber-600'}`}>
                                                {onlineC}/{count}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Toolbar ────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Tab buttons */}
                <div className="flex gap-1">
                    {[
                        { id: 'map',     label: '🗺️ Map' },
                        { id: 'repair',  label: '🔧 บันทึกซ่อม' },
                        { id: 'removal', label: '📤 บันทึกถอด' },
                    ].map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                                    ${activeTab === t.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-blue-300'}`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'map' && (
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none ml-auto">
                        <input type="checkbox" checked={showLines} onChange={e => setShowLines(e.target.checked)} className="rounded" />
                        แสดงเส้นสายทั้งหมด
                    </label>
                )}
            </div>

            {/* ── MAP TAB — map + list below ────────────────────────────── */}
            {activeTab === 'map' && (
                <div className="space-y-3">
                    {/* Map — fit viewport, no scroll */}
                    <div ref={mapRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="relative bg-gray-50" style={{ height: 'auto' }}>
                            {current?.image_url ? (
                                <>
                                    <img ref={imageRef}
                                        src={current.image_url.startsWith('http') ? current.image_url : `${API_URL}${current.image_url}`}
                                        style={{ display: 'none' }}
                                        onLoad={() => setImageLoaded(true)}
                                        crossOrigin="anonymous"
                                        alt="layout"
                                    />
                                    {imageLoaded
                                        ? <canvas ref={canvasRef}
                                            onClick={handleClick}
                                            onMouseMove={handleMouseMove}
                                            onMouseLeave={() => { setHoveredCam(null); setTooltip(null); }}
                                            style={{ width: '100%', height: 'auto', cursor: 'crosshair', display: 'block' }}
                                        />
                                        : <div className="text-gray-400 text-sm">Loading map...</div>
                                    }
                                </>
                            ) : (
                                <div className="text-gray-400 text-sm">ไม่มีแผนผัง</div>
                            )}
                        </div>
                        <div className="flex gap-4 px-4 py-2 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-600 inline-block" />Online</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" />Offline</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />Access Rack</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-700 inline-block" />Distribution Rack</span>
                            <span className="flex items-center gap-1.5">
                                <svg width="14" height="10" viewBox="0 0 16 12"><path d="M8,6 L2,1 A7,7 0 0,1 14,1 Z" fill="rgba(59,130,246,0.3)" stroke="rgba(59,130,246,0.7)" strokeWidth="1" /></svg>FOV
                            </span>
                            <span className="ml-auto text-gray-400">คลิกกล้อง/Rack = รายละเอียด · คลิก Rack ซ้ำ = highlight เส้นสาย</span>
                        </div>
                    </div>

                    {/* Camera list below map */}
                    <CameraListSection
                        cameras={allCameras} 
                        currentName={current?.name}
                        listLocFilter={listLocFilter}
                        setListLocFilter={setListLocFilter}
                        listPage={listPage}
                        setListPage={setListPage}
                        selectedCam={selectedCam}
                        setSelectedCam={setSelectedCam}
                        setDetailModal={setDetailModal}
                        setLocationModal={setLocationModal}
                        setCamModal={setCamModal}
                        fullUrl={fullUrl}
                        selectedLayout={selectedLayout}
          onJumpToCamera={(cam) => {
    // เปลี่ยน layout ถ้ากล้องอยู่คนละ layout
    if (cam.factory_layout_id && cam.factory_layout_id !== selectedLayout) {
        setSelectedLayout(cam.factory_layout_id);
    }
    setSelectedCam(cam.id);
    setSelectedRackId(null);
    // scroll ไปที่ map ก่อน แล้วค่อยเปิด modal
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}}
                    />

                    {/* ── Rack & Switch section (รวมในหน้าเดียว) ─────── */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-600">Rack & Switch — {current?.name}</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setSwitchModal({ mode: 'add' })}
                                    className="flex items-center gap-1 px-2.5 py-1 border border-gray-200 text-xs rounded-lg text-gray-600 hover:bg-gray-50">
                                    <Network size={11} /> เพิ่ม Switch
                                </button>
                                <button onClick={() => setRackModal({ mode: 'add' })}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700">
                                    <Server size={11} /> เพิ่ม Rack
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {racks.map(rack => {
                                const rackCams = cameras.filter(c => c.rack_id === rack.id);
                                const rackSwitches = allSwitches.filter(s => s.rack_id === rack.id);
                                const isAccess = rack.rack_type !== 'distribution';
                                return (
                                    <div key={rack.id} className={`bg-white border rounded-xl p-3.5 ${isAccess ? 'border-purple-100' : 'border-blue-100'}`}>
                                        <div className="flex items-center gap-2.5 mb-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isAccess ? 'bg-purple-100' : 'bg-blue-100'}`}>
                                                {isAccess ? '🖥️' : '🔀'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-gray-900 text-xs truncate">{rack.name}</div>
                                                <div className={`text-[10px] font-medium ${isAccess ? 'text-purple-500' : 'text-blue-500'}`}>
                                                    {isAccess ? 'Access Rack' : 'Distribution Rack'}
                                                </div>
                                            </div>
                                            <div className="flex gap-1 flex-shrink-0">
                                                <button onClick={() => setLocationModal({ ...rack, _isRack: true })}
                                                    title="วางตำแหน่ง"
                                                    className={`p-1 rounded transition-colors ${rack.location_x != null ? 'text-blue-400 hover:bg-blue-50' : 'text-amber-500 bg-amber-50 hover:bg-amber-100'}`}>
                                                    <MapPin size={12} />
                                                </button>
                                                <button onClick={() => setRackModal({ mode: 'edit', data: rack })}
                                                    className="p-1 rounded hover:bg-gray-100 text-gray-400">✏️</button>
                                            </div>
                                        </div>
                                        {rackSwitches.length > 0 && (
                                            <div className="mb-2.5">
                                                <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Switch</div>
                                                {rackSwitches.map(sw => (
                                                    <div key={sw.id} className="flex items-center justify-between text-[11px] mb-0.5">
                                                        <span className="flex items-center gap-1 text-blue-600 font-medium">
                                                            <Network size={9} />{sw.name}
                                                        </span>
                                                        <span className="text-gray-400 font-mono">{sw.ip_address || '—'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">กล้อง ({rackCams.length})</div>
                                        <div className="flex flex-wrap gap-1">
                                            {rackCams.map(cam => (
                                                <span key={cam.id}
                                                    onClick={() => { setSelectedCam(cam.id); setDetailModal(cam); }}
                                                    className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer font-medium hover:opacity-80 ${cam.status === 'online' ? 'bg-green-100 text-green-700' :
                                                            cam.status === 'offline' ? 'bg-red-100 text-red-700' :
                                                                'bg-gray-100 text-gray-500'}`}>
                                                    {cam.name}
                                                </span>
                                            ))}
                                            {!rackCams.length && <span className="text-[10px] text-gray-300">ยังไม่มีกล้อง</span>}
                                        </div>
                                    </div>
                                );
                            })}
                            {!racks.length && (
                                <div className="col-span-full text-center py-6 text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
                                    ยังไม่มี Rack ใน Factory นี้
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Tab: บันทึก Maintenance (ซ่อม + ถอด) ────────────────── */}
            {(activeTab === 'repair' || activeTab === 'removal') && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700">
                                {activeTab === 'repair' ? '🔧 บันทึกการซ่อม' : '📤 บันทึกการถอด'}
                            </span>
                            <div className="flex gap-1">
                                {['all','repair','removal'].map(t => (
                                    <button key={t} onClick={() => setMaintenanceTypeFilter(t)}
                                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors
                                                ${maintenanceTypeFilter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                        {t === 'all' ? 'ทั้งหมด' : t === 'repair' ? 'ซ่อม' : 'ถอด'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input value={maintenanceSearch} onChange={e => setMaintenanceSearch(e.target.value)}
                                   placeholder="ค้นหา..." className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-48"/>
                            <button onClick={() => window.open(`${API_BASE}/cctv/maintenance-logs/export?log_type=${activeTab === 'repair' ? 'repair' : 'removal'}`, '_blank')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                                ⬇️ Export CSV
                            </button>
                            <button onClick={() => setMaintenanceModal({ mode: 'add', logType: activeTab === 'repair' ? 'repair' : 'removal' })}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                                + {activeTab === 'repair' ? 'เพิ่มบันทึกซ่อม' : 'บันทึกถอด'}
                            </button>
                        </div>
                    </div>
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wider">
                                <th className="px-4 py-2 text-left">ประเภท</th>
                                <th className="px-4 py-2 text-left">กล้อง</th>
                                <th className="px-4 py-2 text-left">Factory</th>
                                <th className="px-4 py-2 text-left">ปัญหา/เหตุผล</th>
                                <th className="px-4 py-2 text-left">รายละเอียด</th>
                                <th className="px-4 py-2 text-left">สถานะ</th>
                                <th className="px-4 py-2 text-left">ผู้รับผิดชอบ</th>
                                <th className="px-4 py-2 text-left">วันที่แจ้ง</th>
                                <th className="px-4 py-2"/>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {maintenanceLogs
                                .filter(r => {
                                    const typeOk = maintenanceTypeFilter === 'all' || r.log_type === maintenanceTypeFilter;
                                    const tabOk  = activeTab === 'repair' ? r.log_type === 'repair' : r.log_type === 'removal';
                                    const searchOk = !maintenanceSearch ||
                                        r.camera_name?.toLowerCase().includes(maintenanceSearch.toLowerCase()) ||
                                        r.description?.toLowerCase().includes(maintenanceSearch.toLowerCase()) ||
                                        r.factory_name?.toLowerCase().includes(maintenanceSearch.toLowerCase());
                                    return typeOk && tabOk && searchOk;
                                })
                                .map(r => {
                                    const statusConfig = {
                                        pending:       { label: 'รอดำเนินการ', cls: 'bg-yellow-100 text-yellow-700' },
                                        in_progress:   { label: 'กำลังซ่อม',  cls: 'bg-blue-100 text-blue-700' },
                                        waiting_parts: { label: 'รอของ',       cls: 'bg-orange-100 text-orange-700' },
                                        resolved:      { label: 'แก้แล้ว',    cls: 'bg-green-100 text-green-700' },
                                        removed:       { label: 'ถอดออกแล้ว', cls: 'bg-red-100 text-red-700' },
                                        repairing:     { label: 'ส่งซ่อมอยู่', cls: 'bg-blue-100 text-blue-700' },
                                        reinstalled:   { label: 'ติดตั้งคืนแล้ว', cls: 'bg-green-100 text-green-700' },
                                        retired:       { label: 'เลิกใช้งาน', cls: 'bg-gray-100 text-gray-600' },
                                    };
                                    const st = statusConfig[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-600' };
                                    const isRepair = r.log_type === 'repair';
                                    return (
                                        <tr key={r.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isRepair ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                                    {isRepair ? '🔧 ซ่อม' : '📤 ถอด'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 font-medium text-gray-800">
                                                {r.camera_name}
                                                <div className="text-gray-400 text-[10px]">{r.ip_address}</div>
                                            </td>
                                            <td className="px-4 py-2 text-gray-600 text-[11px]">{r.factory_name || '—'}</td>
                                            <td className="px-4 py-2 text-gray-600">{r.issue_type || r.reason || '—'}</td>
                                            <td className="px-4 py-2 text-gray-600 max-w-[180px] truncate">{r.description || '—'}</td>
                                            <td className="px-4 py-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                                            </td>
                                            <td className="px-4 py-2 text-gray-600">{(r.assigned_to || r.reported_by || '—').toUpperCase()}</td>
                                            <td className="px-4 py-2 text-gray-500">{r.reported_at ? new Date(r.reported_at).toLocaleDateString('th-TH') : '—'}</td>
                                            <td className="px-4 py-2">
                                                <div className="flex gap-1">
                                                    <button onClick={() => setMaintenanceModal({ mode: 'edit', data: r })}
                                                            className="p-1 hover:bg-gray-100 rounded text-gray-400">✏️</button>
                                                    <button onClick={() => setAlertModal({
                                                        isOpen: true, type: 'danger',
                                                        title: 'ลบบันทึก', message: 'ยืนยันลบบันทึกนี้?',
                                                        onConfirm: async () => {
                                                            await fetch(`${API_BASE}/cctv/maintenance-logs/${r.id}`, { method: 'DELETE' });
                                                            fetchMaintenanceLogs();
                                                            setAlertModal(p => ({ ...p, isOpen: false }));
                                                        },
                                                        onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
                                                    })} className="p-1 hover:bg-red-50 rounded text-red-400">🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            {!maintenanceLogs.filter(r => activeTab === 'repair' ? r.log_type === 'repair' : r.log_type === 'removal').length && (
                                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                                    {activeTab === 'repair' ? 'ยังไม่มีบันทึกการซ่อม' : 'ยังไม่มีบันทึกการถอด'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            {/* ── Modals ───────────────────────────────────────────────────── */}
            {camModal && (
                <Portal>
                    <CCTVFormModal
                        mode={camModal.mode}
                        data={camModal.data}
                        layouts={layouts}
                        racks={racks}
                        switches={allSwitches}
                        selectedLayoutId={selectedLayout}
                        onClose={handleCamModalClose}
                        onSave={handleCamModalSave}
                    />
                </Portal>
            )}
            {rackModal && (
                <Portal>
                    <RackFormModal
                        mode={rackModal.mode}
                        data={rackModal.data}
                        layouts={layouts}
                        selectedLayoutId={selectedLayout}
                        onClose={() => setRackModal(null)}
                        onSave={() => { setRackModal(null); fetchRacks(); }}
                    />
                </Portal>
            )}
            {switchModal && (
                <Portal>
                    <SwitchFormModal
                        mode={switchModal.mode}
                        data={switchModal.data}
                        racks={racks}
                        onClose={() => setSwitchModal(null)}
                        onSave={() => { setSwitchModal(null); fetchSwitches(); }}
                    />
                </Portal>
            )}
            {locationModal && (
                <Portal>
                    <CCTVLocationModal
                        camera={locationModal}
                        layouts={layouts}
                        racks={racks}
                        onClose={() => setLocationModal(null)}
                        onSave={() => { setLocationModal(null); refreshAll(); }}
                    />
                </Portal>
            )}

            {/* ── Rack Detail Modal ────────────────────────────────────── */}
            {rackDetailModal && (
                <Portal>
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                        onClick={() => { setRackDetailModal(null); setSelectedRackId(null); }}>
                        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden"
                            style={{ maxHeight: '85vh' }}
                            onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0 ${rackDetailModal.rack_type === 'distribution' ? 'bg-blue-50' : 'bg-purple-50'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${rackDetailModal.rack_type === 'distribution' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                                        {rackDetailModal.rack_type === 'distribution' ? '🔀' : '🖥️'}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-900">{rackDetailModal.name}</div>
                                        <div className={`text-xs font-medium ${rackDetailModal.rack_type === 'distribution' ? 'text-blue-600' : 'text-purple-600'}`}>
                                            {rackDetailModal.rack_type === 'distribution' ? 'Distribution Rack' : 'Access Rack'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-gray-400">
                                        X:{rackDetailModal.location_x?.toFixed(1)}% Y:{rackDetailModal.location_y?.toFixed(1)}%
                                    </span>
                                    <button onClick={() => { setRackDetailModal(null); setSelectedRackId(null); }}
                                        className="p-1.5 hover:bg-black/10 rounded-full"><X size={16} /></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                                {/* Switches */}
                                {rackDetailModal.switches?.length > 0 && (
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                            <Network size={11} /> Switch ({rackDetailModal.switches.length})
                                        </div>
                                        <div className="space-y-1.5">
                                            {rackDetailModal.switches.map(sw => (
                                                <div key={sw.id} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                                                    <span className="text-sm font-semibold text-blue-700">{sw.name}</span>
                                                    <span className="text-xs text-blue-400 font-mono">{sw.ip_address || '—'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* Cameras */}
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                        <Camera size={11} /> กล้องที่เชื่อมต่อ ({rackDetailModal.cameras?.length || 0})
                                    </div>
                                    <div className="space-y-1.5">
                                        {rackDetailModal.cameras?.map(cam => (
                                            <button key={cam.id}
                                                onClick={() => { setRackDetailModal(null); setSelectedRackId(null); setSelectedCam(cam.id); setDetailModal(cam); }}
                                                className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors text-left">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[cam.status] }} />
                                                    <div>
                                                        <div className="text-sm font-semibold text-gray-800">{cam.name}</div>
                                                        <div className="text-[11px] text-gray-400">{cam.ip_address || '—'}</div>
                                                    </div>
                                                </div>
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cam.status === 'online' ? 'bg-green-100 text-green-700' :
                                                        cam.status === 'offline' ? 'bg-red-100 text-red-700' :
                                                            'bg-gray-100 text-gray-500'}`}>{cam.status}</span>
                                            </button>
                                        ))}
                                        {!rackDetailModal.cameras?.length && (
                                            <div className="text-xs text-gray-400 text-center py-3">ยังไม่มีกล้องใน Rack นี้</div>
                                        )}
                                    </div>
                                </div>
                                {rackDetailModal.remark && (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-700">{rackDetailModal.remark}</div>
                                )}
                            </div>
                            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex gap-2 flex-shrink-0">
                                <button onClick={() => { setRackDetailModal(null); setSelectedRackId(null); setLocationModal({ ...rackDetailModal, _isRack: true }); }}
                                    className="flex-1 py-2 bg-purple-50 border border-purple-200 rounded-xl text-xs font-semibold text-purple-600 hover:bg-purple-100 flex items-center justify-center gap-1.5">
                                    <MapPin size={12} /> ตำแหน่ง
                                </button>
                                <button onClick={() => { setRackDetailModal(null); setSelectedRackId(null); setRackModal({ mode: 'edit', data: rackDetailModal }); }}
                                    className="flex-1 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-white flex items-center justify-center gap-1.5">
                                    ✏️ แก้ไข
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
            {/* ── Camera Detail Modal ──────────────────────────────────── */}
            {detailModal && (
                <Portal>
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                        onClick={() => { setDetailModal(null); setSelectedCam(null); }}>
                        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden"
                            style={{ maxHeight: '90vh' }}
                            onClick={e => e.stopPropagation()}>

                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0"
                                style={{ background: detailModal.status === 'online' ? '#f0fdf4' : detailModal.status === 'offline' ? '#fef2f2' : '#f9fafb' }}>
                                <div className="flex items-center gap-3">
                                    {/* icon preview */}
                                    <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0" style={{ background: STATUS_COLOR[detailModal.status] }}>
                                        {detailModal.icon_url
                                            ? <img src={fullUrl(detailModal.icon_url)} className="w-full h-full object-cover" />
                                            : <canvas width={44} height={44}
                                                ref={el => { if (el) { const ctx = el.getContext('2d'); if (ctx) drawCCTVIcon(ctx, 22, 22, 20, detailModal.icon_type || 'bullet', STATUS_COLOR[detailModal.status], 'white'); } }} />
                                        }
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-900 text-base">{detailModal.name}</div>
                                        <div className="text-xs text-gray-500">{detailModal.model || 'ไม่ระบุ model'}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${detailModal.status === 'online' ? 'bg-green-100 text-green-700' :
                                            detailModal.status === 'offline' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-500'
                                        }`}>● {detailModal.status}</span>
                                    <button onClick={() => { setDetailModal(null); setSelectedCam(null); }}
                                        className="p-1.5 hover:bg-black/10 rounded-full"><X size={16} /></button>
                                </div>
                            </div>

                            {/* Body — scrollable */}
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                                {/* Section: ข้อมูลกล้อง */}
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">ข้อมูลกล้อง</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            ['IP Address', detailModal.ip_address],
                                            ['Model', detailModal.model],
                                            ['Fix Asset', detailModal.fix_asset],
                                            ['Factory', detailModal.layout_name],
                                            ['ตำแหน่ง Map', detailModal.location_x != null
                                                ? `X: ${detailModal.location_x.toFixed(1)}%, Y: ${detailModal.location_y?.toFixed(1)}%`
                                                : null],
                                            ['ทิศทาง (FOV)', detailModal.fov_direction
                                                ? detailModal.fov_direction.startsWith('CUSTOM_')
                                                    ? `Custom ${detailModal.fov_direction.replace('CUSTOM_', '')}°`
                                                    : detailModal.fov_direction
                                                : null],
                                        ].map(([k, v]) => v ? (
                                            <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
                                                <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{k}</div>
                                                <div className="text-sm font-semibold text-gray-800 mt-0.5 break-words">{v}</div>
                                            </div>
                                        ) : null)}
                                    </div>
                                </div>

                                {/* Section: เส้นสาย */}
                                {(detailModal.rack_name || detailModal.switch_name) && (
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">เส้นสาย</div>
                                        <div className="bg-purple-50 rounded-xl px-4 py-3 space-y-2">
                                            {detailModal.rack_name && (
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-500 flex items-center gap-1.5"><Server size={12} className="text-purple-500" />Rack</span>
                                                    <span className="font-semibold text-purple-700">{detailModal.rack_name}</span>
                                                </div>
                                            )}
                                            {detailModal.switch_name && (
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-500 flex items-center gap-1.5"><Network size={12} className="text-blue-500" />Switch</span>
                                                    <span className="font-semibold text-blue-700">
                                                        {detailModal.switch_name}
                                                        {detailModal.switch_ip && <span className="text-blue-400 font-normal ml-1">({detailModal.switch_ip})</span>}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Section: สถานะ */}
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">สถานะ</div>
                                    <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-500">Status</span>
                                            <span className={`font-semibold ${detailModal.status === 'online' ? 'text-green-600' :
                                                    detailModal.status === 'offline' ? 'text-red-600' :
                                                    detailModal.status === 'removed' ? 'text-gray-500' :
                                                    detailModal.status === 'retired' ? 'text-gray-800' : 'text-gray-400'
                                                }`}>● {detailModal.status}</span>
                                        </div>
                                        {detailModal.last_ping && (
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-gray-500 flex items-center gap-1.5"><RefreshCw size={11} />Last ping</span>
                                                <span className="font-medium text-gray-700 text-xs">
                                                    {new Date(detailModal.last_ping).toLocaleString('th-TH')}
                                                </span>
                                            </div>
                                        )}
                                        <button onClick={() => handlePingSingle(detailModal.id)}
                                                disabled={pingingId === detailModal.id}
                                                className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors">
                                            <RefreshCw size={11} className={pingingId === detailModal.id ? 'animate-spin' : ''} />
                                            {pingingId === detailModal.id ? 'กำลัง Ping...' : 'Ping กล้องนี้'}
                                        </button>
                                        {/* เปลี่ยนสถานะด้วยตัวเอง */}
                                        <div className="pt-1 border-t border-gray-200">
                                            <div className="text-[10px] text-gray-400 mb-1.5">เปลี่ยนสถานะ:</div>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {[
                                                    { s: 'online',   label: '🟢 Online',   cls: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' },
                                                    { s: 'offline',  label: '🔴 Offline',  cls: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' },
                                                    { s: 'removed',  label: '⚫ ถอดออก',  cls: 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100' },
                                                    { s: 'retired',  label: '🚫 เลิกใช้',  cls: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100' },
                                                ].map(({ s, label, cls }) => (
                                                    <button key={s}
                                                            disabled={detailModal.status === s}
                                                            onClick={async () => {
                                                                await fetch(`${API_BASE}/cctv/cameras/${detailModal.id}/status`, {
                                                                    method: 'PATCH',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ status: s }),
                                                                });
                                                                await fetchCameras();
                                                                setDetailModal(p => ({ ...p, status: s }));
                                                            }}
                                                            className={`px-2 py-1 text-[11px] font-medium border rounded-lg transition-colors
                                                                disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}>
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: ประวัติ Maintenance */}
                                <CameraMaintenanceLogs cameraId={detailModal.id} apiBase={API_BASE} />

                                {/* Section: Remark */}
                                {detailModal.remark && (
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">หมายเหตุ</div>
                                        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-800">
                                            {detailModal.remark}
                                        </div>
                                    </div>
                                )}

                                {/* Section: บันทึกโดย */}
                                {detailModal.updated_by && (
                                    <div className="flex items-center gap-1.5 text-xs text-gray-400 pb-1">
                                        <Camera size={11} />
                                        บันทึก/แก้ไขโดย: <span className="font-medium text-gray-500">{detailModal.updated_by}</span>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 bg-gray-50 flex-shrink-0">
                                <button onClick={() => { setDetailModal(null); setCamModal({ mode: 'edit', data: detailModal }); }}
                                    className="flex-1 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-white flex items-center justify-center gap-1.5">
                                    ✏️ แก้ไข
                                </button>
                                <button onClick={() => { setDetailModal(null); setLocationModal(detailModal); }}
                                    className="flex-1 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-blue-600 hover:bg-blue-100 flex items-center justify-center gap-1.5">
                                    <MapPin size={12} /> ตำแหน่ง / FOV
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
            {layoutDropOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setLayoutDropOpen(false)} />
            )}

            {/* Alert Modal */}
            <Portal>
                <div style={{ position: 'relative', zIndex: 99999 }}>
                    <AlertModal
                        isOpen={alertModal.isOpen}
                        type={alertModal.type}
                        title={alertModal.title}
                        message={alertModal.message}
                        onConfirm={alertModal.onConfirm || (() => setAlertModal(p => ({ ...p, isOpen: false })))}
                        onCancel={alertModal.onCancel}
                    />
                </div>
            </Portal>

            {/* ── Snapshot tooltip ─────────────────────────────────────── */}
            {maintenanceModal && (
                <MaintenanceLogModal
                    mode={maintenanceModal.mode}
                    logType={maintenanceModal.logType || maintenanceModal.data?.log_type}
                    data={maintenanceModal.data || null}
                    cameras={allCameras}
                    layouts={layouts}
                    user={user}
                    onClose={() => setMaintenanceModal(null)}
                    onSave={() => { fetchMaintenanceLogs(); fetchCameras(); setMaintenanceModal(null); }}
                />
            )}
            {tooltip?.cam?.snapshot_url && <TooltipPortal tooltip={tooltip} canvasRef={canvasRef} />}
        </div>
    );
}
export default CCTVPage;