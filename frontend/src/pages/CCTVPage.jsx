import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Plus, RefreshCw, Server, Network, Camera, Wifi, WifiOff, ChevronDown, X, Search } from 'lucide-react';
import { API_BASE, API_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { useCan, useCanAct } from '../context/PermissionContext';
import CCTVFormModal from '../components/cctv/CCTVFormModal';
import RackFormModal from '../components/cctv/RackFormModal';
import SwitchFormModal from '../components/cctv/SwitchFormModal';
import CCTVLocationModal from '../components/cctv/CCTVLocationModal';
import AlertModal from '../components/AlertModal';
import MaintenanceLogModal from '../components/cctv/MaintenanceLogModal';
import CCTVReportView from '../components/cctv/CCTVReportView';
import Portal from '../components/Portal';
import { drawCCTVIcon } from '../components/cctv/cctvIconUtils';
import { STATUS_COLOR, FOV_ANGLE_MAP, getFovAngle, drawFovCone, drawCornerFrame } from '../components/cctv/cctvCanvasUtils';
import { DataQualityPanel } from '../components/cctv/DataQualityPanel';
import { CameraDetailModal } from '../components/cctv/CameraDetailModal';
import { CameraListSection } from '../components/cctv/CameraListSection';
import { CameraTimeline } from '../components/cctv/CameraTimeline';
import { RackCameraPicker } from '../components/cctv/RackCameraPicker';
import { MaintenanceDetailModal } from '../components/cctv/MaintenanceDetailModal';
import { TooltipPortal } from '../components/cctv/TooltipPortal';
import { GlobalSearchModal } from '../components/cctv/GlobalSearchModal';
import LayoutMegaMenu from '../components/LayoutMegaMenu';



function CCTVPage() {
    const { user } = useAuth();
    const isStaff = useCan('cctv', 'edit'); // ✅ ลากย้ายตำแหน่งกล้องได้เฉพาะ staff — ดูอย่างเดียวได้ทุกคน
    const isStaffRef = useRef(isStaff);
    useEffect(() => { isStaffRef.current = isStaff; }, [isStaff]);
    const canCreateCctv = useCanAct('cctv', 'create');
    const canEditCctv = useCanAct('cctv', 'edit');
    const canDeleteCctv = useCanAct('cctv', 'delete');
    const [layouts, setLayouts] = useState([]);
    const [selectedLayout, setSelectedLayout] = useState(null);
    const [allCameras, setAllCameras] = useState([]);
    const [allRacks, setAllRacks] = useState([]);   // rack ทุกตัวจาก DB
    const [allSwitches, setAllSwitches] = useState([]);
    const [allRecordServers, setAllRecordServers] = useState([]);
    const [uptimeMap, setUptimeMap] = useState({}); // camera_id → { uptime_pct, days[] }
    const [hoveredCam, setHoveredCam] = useState(null);
    const [selectedCam, setSelectedCam] = useState(null);
    const [showLines, setShowLines] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [pinging, setPinging] = useState(false);
    const pulseRef = useRef(0);
    const [mapZoom, setMapZoom] = useState(1);            // ระดับซูมแผนผัง (1–3)
    const [fitScreen, setFitScreen] = useState(false);    // ย่อแผนผังให้สูงพอดีหน้าจอ (ไม่ต้องเลื่อน)
    const [imgAspect, setImgAspect] = useState(0);        // อัตราส่วน กว้าง/สูง ของรูปแผนผัง
    const [layers, setLayers] = useState({ fov: true, labels: true, racks: true }); // ชั้นข้อมูลที่แสดงบนแผนที่
    const mapZoomRef = useRef(1);                         // ใช้ใน listener ของ wheel (อ่านค่าล่าสุดเสมอ)
    const changeMapZoomRef = useRef(null);
    const mapViewportRef = useRef(null);                  // กรอบที่เลื่อนได้เมื่อซูม
    const pendingZoomScrollRef = useRef(null);            // จุดกลางที่ต้องคงไว้หลังเปลี่ยน zoom
    const [activeTab, setActiveTab] = useState('map');
    const [tooltip, setTooltip] = useState(null);

    // Repair & Removal logs
    const [maintenanceLogs, setMaintenanceLogs] = useState([]);
    const [maintenanceModal, setMaintenanceModal] = useState(null);
    const [maintenanceDetail, setMaintenanceDetail] = useState(null); // detail modal
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
const [globalSearchOpen, setGlobalSearchOpen] = useState(false); // ← เพิ่มบรรทัดนี้


    const canvasRef = useRef(null);
    const mapRef = useRef(null);  // ← เพิ่ม
    const animFrameRef = useRef(null);
    const animTickRef = useRef(0);
    const imageRef = useRef(null);

    // ── Drag-to-move ตำแหน่งกล้องบน map ──────────────────────────────────
    const draggingRef  = useRef(null); // { id, startClientX, startClientY, startX, startY, moved }
    const dragPosRef   = useRef(null); // { id, x, y } — ตำแหน่งล่าสุดระหว่างลาก (อ่านโดย draw loop ทุก frame)
    const suppressClickRef = useRef(false); // กัน click event ยิงเปิด modal ซ้ำหลังลากเสร็จ
    const [isDraggingCam, setIsDraggingCam] = useState(false); // แค่ใช้ toggle cursor/flag ฝั่ง React
    const [savingCamId, setSavingCamId] = useState(null);
    const DRAG_THRESHOLD = 4; // px

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


    const jumpToCamera = useCallback((cam) => {
    if (cam.factory_layout_id && cam.factory_layout_id !== selectedLayout) {
        setSelectedLayout(cam.factory_layout_id);
    }
    setActiveTab('map');
    setSelectedCam(cam.id);
    setSelectedRackId(null);
    setTimeout(() => {
        mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}, [selectedLayout]);


    useEffect(() => { fetchLayouts(); fetchCameras(); fetchRacks(); fetchSwitches(); fetchMaintenanceLogs(); }, []);
    useEffect(() => {
        fetch(`${API_BASE}/cctv/record-servers`).then(r => r.json())
            .then(d => { if (d.success) setAllRecordServers(d.data); }).catch(() => {});
        fetch(`${API_BASE}/cctv/uptime?days=14`).then(r => r.json())
            .then(d => {
                if (!d.success) return;
                setUptimeMap(Object.fromEntries(d.data.map(u => [u.camera_id, u])));
            }).catch(() => {});
    }, []);
    useEffect(() => { if (selectedLayout) { setImageLoaded(false); setListPage(1); } }, [selectedLayout]);
    useEffect(() => { setMapZoom(1); }, [selectedLayout]);

    // คงจุดกลางของภาพไว้เมื่อเปลี่ยนระดับซูม
    useEffect(() => {
        const vp = mapViewportRef.current;
        const p = pendingZoomScrollRef.current;
        if (!vp || !p) return;
        vp.scrollLeft = p.cx * vp.scrollWidth - vp.clientWidth / 2;
        vp.scrollTop = p.cy * vp.scrollHeight - vp.clientHeight / 2;
        pendingZoomScrollRef.current = null;
    }, [mapZoom]);

    const changeMapZoom = (z) => {
        const vp = mapViewportRef.current;
        const nz = Math.min(3, Math.max(1, Math.round(z * 2) / 2));
        if (vp && vp.scrollWidth && vp.scrollHeight) {
            pendingZoomScrollRef.current = {
                cx: (vp.scrollLeft + vp.clientWidth / 2) / vp.scrollWidth,
                cy: (vp.scrollTop + vp.clientHeight / 2) / vp.scrollHeight,
            };
        }
        setMapZoom(nz);
    };
    mapZoomRef.current = mapZoom;
    changeMapZoomRef.current = changeMapZoom;

    // Ctrl + เลื่อนเมาส์ = ซูมเข้า/ออก (ไม่ดักการเลื่อนปกติ)
    useEffect(() => {
        const vp = mapViewportRef.current;
        if (!vp) return;
        const onWheel = (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            changeMapZoomRef.current(mapZoomRef.current + (e.deltaY < 0 ? 0.5 : -0.5));
        };
        vp.addEventListener('wheel', onWheel, { passive: false });
        return () => vp.removeEventListener('wheel', onWheel);
    }, [activeTab, imageLoaded, selectedLayout]);

    // โฟกัสกล้องที่เลือก: ซูมอย่างน้อย 200% แล้วเลื่อนให้กล้องอยู่กลางกรอบ
    const focusSelected = () => {
        const cam = allCameras.find(c => c.id === selectedCam);
        if (!cam || cam.location_x == null) return;
        const cx = cam.location_x / 100, cy = cam.location_y / 100;
        const z = Math.max(mapZoom, 2);
        const vp = mapViewportRef.current;
        if (z === mapZoom && vp) {
            vp.scrollLeft = cx * vp.scrollWidth - vp.clientWidth / 2;
            vp.scrollTop = cy * vp.scrollHeight - vp.clientHeight / 2;
        } else {
            pendingZoomScrollRef.current = { cx, cy };
            setMapZoom(z);
        }
    };



    // ── Canvas draw ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!canvasRef.current || !imageRef.current || !imageLoaded) return;

        const canvas = canvasRef.current;
        const img = imageRef.current;
        let animFrame;

        const draw = () => {
            pulseRef.current = (pulseRef.current + 0.05) % (Math.PI * 2);
            const pulse = pulseRef.current;

            const ctx = canvas.getContext('2d');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            // ขนาดแสดงผลจริงบนหน้าจอ (px หน้าจอต่อ 1 px ของภาพ) — ใช้ให้ marker/label คงขนาดบนจอไม่ว่าซูมเท่าไร
            const screenScale = canvas.clientWidth > 0 ? canvas.clientWidth / canvas.width : 1;
            const placedLabels = []; // กล่องป้ายที่วาดแล้ว ใช้กันป้ายซ้อนทับกัน

            // ตำแหน่งกล้อง — ถ้ากำลังลากตัวนี้อยู่ ให้ใช้ตำแหน่งล่าสุดจาก dragPosRef แทนค่าจาก DB
            const getCamPos = (cam) => {
                if (dragPosRef.current && dragPosRef.current.id === cam.id) {
                    return { x: dragPosRef.current.x, y: dragPosRef.current.y };
                }
                return { x: cam.location_x, y: cam.location_y };
            };

            // ── เส้นสาย (Rack → Camera) ──────────────────────────────
            cameras.forEach(cam => {
                if (cam.location_x == null || !cam.rack_id) return;
                const rack = racks.find(r => r.id === cam.rack_id);
                if (!rack || rack.location_x == null) return;

                const isHovered = hoveredCam === cam.id;
                const isCamSel = selectedCam === cam.id;
                const isRackSel = selectedRackId === cam.rack_id;
                const show = showLines || isHovered || isCamSel || isRackSel;
                if (!show) return;

                const camPos = getCamPos(cam);
                const x1 = (canvas.width * rack.location_x) / 100;
                const y1 = (canvas.height * rack.location_y) / 100;
                const x2 = (canvas.width * camPos.x) / 100;
                const y2 = (canvas.height * camPos.y) / 100;

                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([8, 4]);
                ctx.lineWidth = (isCamSel || isHovered || isRackSel) ? 2.5 : 1.2;
                ctx.strokeStyle = isRackSel ? '#7c3aed'
                    : (isCamSel || isHovered) ? (STATUS_COLOR[cam.status] || '#9ca3af')
                        : 'rgba(124,58,237,0.45)';
                ctx.globalAlpha = (isCamSel || isHovered || isRackSel) ? 1 : 0.5;
                ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                ctx.restore();
            });

            // ── วาด Rack pins ─────────────────────────────────────────
            if (layers.racks) racks.forEach(rack => {
                if (rack.location_x == null || rack.location_y == null) return;
                const px = (canvas.width * rack.location_x) / 100;
                const py = (canvas.height * rack.location_y) / 100;
                const r = 12;
                const isSel = selectedRackId === rack.id;
                const pinColor = rack.rack_type === 'distribution' ? '#1d4ed8' : '#7c3aed';
                const selColor = rack.rack_type === 'distribution' ? '#1e3a8a' : '#5b21b6';

                ctx.save();
                if (isSel) { ctx.shadowBlur = 14; ctx.shadowColor = pinColor; }
                ctx.fillStyle = isSel ? selColor : pinColor;
                ctx.beginPath(); ctx.arc(px, py, isSel ? 22 : r, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'white'; ctx.lineWidth = isSel ? 3 : 2.5; ctx.stroke();
                ctx.fillStyle = 'white';
                ctx.font = `${isSel ? 20 : 15}px Arial`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(rack.rack_type === 'distribution' ? '🔀' : '🖥️', px, py);
                ctx.restore();

                ctx.save();
                const fontSize = isSel ? 20 : 15;
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                const tw = ctx.measureText(rack.name).width + 12;
                const ly = py + (isSel ? 22 : r) + 3;
                ctx.fillStyle = isSel ? selColor : `${pinColor}CC`;
                ctx.beginPath(); ctx.roundRect(px - tw / 2, ly, tw, fontSize + 6, 4); ctx.fill();
                ctx.fillStyle = 'white';
                ctx.fillText(rack.name, px, ly + 3);
                ctx.restore();
            });

            // ── วาด FOV cones ─────────────────────────────────────────
            const fovLen = Math.min(canvas.width, canvas.height) * 0.06;
            cameras.forEach(cam => {
                if (!layers.fov || cam.location_x === null || !cam.fov_direction) return;
                const camPos = getCamPos(cam);
                const px = (canvas.width * camPos.x) / 100;
                const py = (canvas.height * camPos.y) / 100;
                const angle = getFovAngle(cam.fov_direction);
                if (angle === null) return;

                const isHover = hoveredCam === cam.id;
                const isSel = selectedCam === cam.id;
                const dim = showLines && hoveredCam && !isHover && !isSel;

                const fill = isSel ? 'rgba(245,158,11,0.22)' : isHover ? 'rgba(59,130,246,0.28)' : 'rgba(59,130,246,0.13)';
                const stroke = isSel ? 'rgba(245,158,11,0.7)' : isHover ? 'rgba(59,130,246,0.7)' : 'rgba(59,130,246,0.40)';

                ctx.save();
                ctx.globalAlpha = dim ? 0.15 : 1;
                ctx.restore();
                drawFovCone(ctx, px, py, angle, cam.fov_spread || 60, fovLen, fill, stroke);
            });

            // ── วาด Camera pins (Style E — beacon ring + pulse) ───────
            cameras.forEach(cam => {
                if (cam.location_x === null) return;
                const camPos = getCamPos(cam);
                const px = (canvas.width * camPos.x) / 100;
                const py = (canvas.height * camPos.y) / 100;
                const isHover = hoveredCam === cam.id;
                const isSel = selectedCam === cam.id;
                const isBeingDragged = draggingRef.current?.id === cam.id && draggingRef.current?.moved;
                const r = (isHover || isSel || isBeingDragged ? 13 : 9) / screenScale; // ~9px บนจอ (ใหญ่ขึ้นเมื่อ hover/เลือก)
                const dim = showLines && hoveredCam && !isHover && !isSel;
                const bgColor = isSel ? '#f59e0b' : (STATUS_COLOR[cam.status] || '#9ca3af');

                ctx.save();

                // beacon rings กระพริบ
                const p1 = 0.12 + Math.sin(pulse) * 0.11;
                const p2 = 0.28 + Math.sin(pulse + 1.1) * 0.16;
                [{ rr: r + 14, a: p1 }, { rr: r + 7, a: p2 }].forEach(({ rr, a }) => {
                    ctx.strokeStyle = bgColor;
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = dim ? 0.04 : a;
                    ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.stroke();
                });

                // วงหลัก — สีกระพริบ
                const bgAlpha = 0.72 + Math.sin(pulse * 1.5) * 0.28;
                ctx.globalAlpha = dim ? 0.25 : bgAlpha;
                ctx.fillStyle = bgColor;
                ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.stroke();
                // กล้อง offline: วงแดงขยายช้า ๆ ให้เห็นง่ายในภาพรวม
                if (cam.status === 'offline' && !dim) {
                    const grow = 6 + 6 * (0.5 + 0.5 * Math.sin(pulse * 0.8));
                    ctx.save();
                    ctx.strokeStyle = '#dc2626';
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.6 * (1 - (grow - 6) / 12);
                    ctx.beginPath(); ctx.arc(px, py, r + grow / screenScale, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                }
                // กล้องที่ยังไม่ตั้งทิศทาง FOV: วงสีเหลืองเส้นประรอบจุด เพื่อให้รู้ว่าไม่ได้ขึ้นรัศมีเพราะยังไม่ได้ตั้งค่า
                if (!cam.fov_direction && !dim) {
                    ctx.save();
                    ctx.setLineDash([5, 4]);
                    ctx.strokeStyle = '#f59e0b';
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(px, py, r + 7 / screenScale, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                }
                ctx.globalAlpha = dim ? 0.25 : 1;

                if (isSel) {
                    // วงนอกกระพริบสีเหลือง
                    const selPulse = 0.5 + Math.sin(pulse * 2) * 0.5;
                    ctx.strokeStyle = '#f59e0b';
                    ctx.lineWidth = 3;
                    ctx.globalAlpha = selPulse;
                    ctx.beginPath(); ctx.arc(px, py, r + 20, 0, Math.PI * 2); ctx.stroke();
                    ctx.globalAlpha = 1;
                    ctx.shadowBlur = 14;
                    ctx.shadowColor = '#f59e0b';
                        drawCornerFrame(ctx, px, py, r + 32 + Math.sin(pulse * 2) * 3, '#f50b0b');

                }
                if (isBeingDragged) {
                    // วงประขาวทึบ — บอกว่ากำลังลากอยู่
                    ctx.save();
                    ctx.setLineDash([4, 3]);
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.9;
                    ctx.beginPath(); ctx.arc(px, py, r + 10, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                }
                if (savingCamId === cam.id) {
                    // arc หมุน — กำลังบันทึก
                    ctx.save();
                    ctx.strokeStyle = '#16a34a';
                    ctx.lineWidth = 3;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(px, py, r + 10, pulse * 3, pulse * 3 + Math.PI * 0.6);
                    ctx.stroke();
                    ctx.restore();
                }
                // icon กระพริบตาม bgAlpha ด้วย
                ctx.globalAlpha = dim ? 0.25 : bgAlpha;
                drawCCTVIcon(ctx, px, py, r, cam.icon_type || 'bullet', bgColor, 'white');
                // รูปร่างแยกสถานะ: กล้อง offline มีเครื่องหมาย × ทับไอคอน (ไม่พึ่งสีอย่างเดียว)
                if (cam.status === 'offline' && !dim) {
                    const k = (r * 0.45);
                    ctx.save();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = Math.max(2, 2.5 / screenScale);
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(px - k, py - k); ctx.lineTo(px + k, py + k);
                    ctx.moveTo(px + k, py - k); ctx.lineTo(px - k, py + k);
                    ctx.stroke();
                    ctx.restore();
                }
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
                ctx.restore();

                // label
                ctx.save();
                ctx.globalAlpha = dim ? 0.25 : 1;
                const labelText = cam.name;
                const fontSize = (isSel ? 14 : isHover ? 13 : 12) / screenScale;
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                const tw = ctx.measureText(labelText).width + 8 / screenScale;
                const th = fontSize + 6 / screenScale;
                const ly = py + r + 6 / screenScale;
                // ไม่ให้ป้ายล้นขอบแผนที่: เลื่อนจุดกึ่งกลางของป้ายเข้ามาให้พอดีในภาพ
                const lx = Math.min(Math.max(px, tw / 2 + 2), canvas.width - tw / 2 - 2);
                // กันป้ายซ้อนทับกัน: ข้ามป้ายที่ชนกับป้ายที่วาดไปแล้ว (ยกเว้นกล้องที่เลือก/hover/กำลังลาก)
                const forced = isSel || isHover || isBeingDragged;
                const collides = placedLabels.some(b =>
                    lx - tw / 2 < b.x + b.w && lx + tw / 2 > b.x && ly < b.y + b.h && ly + th > b.y);
                if (layers.labels && (forced || !collides)) {
                    placedLabels.push({ x: lx - tw / 2, y: ly, w: tw, h: th });
                    ctx.fillStyle = isSel ? '#f59e0b' : isHover ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.65)';
                    ctx.beginPath(); ctx.roundRect(lx - tw / 2, ly, tw, th, 4 / screenScale); ctx.fill();
                    ctx.fillStyle = 'white';
                    ctx.fillText(labelText, lx, ly + 3 / screenScale);
                }
                ctx.restore();
            });

            animFrame = requestAnimationFrame(draw);
        };

        animFrame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animFrame);

    }, [imageLoaded, cameras, racks, hoveredCam, selectedCam, selectedRackId, showLines, layers]);

    // ── Canvas events ─────────────────────────────────────────────────────
    // ── Drag-to-move ตำแหน่งกล้อง ─────────────────────────────────────────
    // แปลงพิกัดหน้าจอ (client px) → เปอร์เซ็นต์ตำแหน่งบน canvas โดยคิด object-fit:contain letterbox ด้วย
    const getRenderedCanvasRect = () => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
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
        return { rect, renderedWidth, renderedHeight, offsetX, offsetY };
    };

    const handleWindowMouseMoveDrag = useCallback((e) => {
        const drag = draggingRef.current;
        if (!drag || !canvasRef.current) return;
        const dxPx = e.clientX - drag.startClientX;
        const dyPx = e.clientY - drag.startClientY;
        if (Math.abs(dxPx) > DRAG_THRESHOLD || Math.abs(dyPx) > DRAG_THRESHOLD) drag.moved = true;
        if (!drag.moved) return;

        const { renderedWidth, renderedHeight } = getRenderedCanvasRect();
        const dxPct = (dxPx / renderedWidth) * 100;
        const dyPct = (dyPx / renderedHeight) * 100;
        let newX = drag.startX + dxPct;
        let newY = drag.startY + dyPct;
        newX = Math.min(99, Math.max(1, newX));
        newY = Math.min(99, Math.max(1, newY));
        dragPosRef.current = { id: drag.id, x: newX, y: newY };
        if (!isDraggingCam) setIsDraggingCam(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleWindowMouseUpDrag = useCallback(async () => {
        const drag = draggingRef.current;
        window.removeEventListener('mousemove', handleWindowMouseMoveDrag);
        window.removeEventListener('mouseup', handleWindowMouseUpDrag);
        draggingRef.current = null;
        setIsDraggingCam(false);

        if (!drag) return;

        if (!drag.moved) {
            // ไม่ได้ลาก แค่คลิก — ปล่อยให้ onClick ของ canvas เปิด detail modal ตามปกติ
            dragPosRef.current = null;
            return;
        }

        // ลากจริง — กัน click event (ที่จะยิงตามหลัง mouseup) ไม่ให้เปิด modal ซ้อน
        suppressClickRef.current = true;

        const finalPos = dragPosRef.current;
        if (!finalPos || finalPos.id !== drag.id) { dragPosRef.current = null; return; }

        setSavingCamId(drag.id);
        try {
            const res = await fetch(`${API_BASE}/cctv/cameras/${drag.id}/location`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    location_x: finalPos.x,
                    location_y: finalPos.y,
                    factory_layout_id: selectedLayout,
                    updated_by: user?.username || user?.name || '',
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'บันทึกตำแหน่งไม่สำเร็จ');

            setAllCameras(prev => prev.map(c =>
                c.id === drag.id ? { ...c, location_x: finalPos.x, location_y: finalPos.y } : c
            ));
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'บันทึกตำแหน่งไม่สำเร็จ', message: err.message });
        } finally {
            setSavingCamId(null);
            dragPosRef.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedLayout, user]);

    const handleCamMouseDown = (e) => {
        if (!isStaffRef.current) return; // ไม่ใช่ staff — ดูได้อย่างเดียว ลากไม่ได้ (คลิกยังเปิด detail ได้ตามปกติ)
        const cam = getHitCamera(e);
        if (!cam) return; // ไม่ได้จับกล้อง — ปล่อยให้ event ปกติ (คลิก rack ฯลฯ) ทำงานต่อ
        e.preventDefault();
        draggingRef.current = {
            id: cam.id,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startX: cam.location_x,
            startY: cam.location_y,
            moved: false,
        };
        window.addEventListener('mousemove', handleWindowMouseMoveDrag);
        window.addEventListener('mouseup', handleWindowMouseUpDrag);
    };

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
        const CLICK_RADIUS = 14 * canvas.width / renderedWidth; // ~14px บนจอ ไม่ว่าซูมเท่าไร

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
        if (draggingRef.current) return; // กำลังลากอยู่ ไม่ต้องอัปเดต hover/tooltip ให้กระพริบ
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
        if (suppressClickRef.current) { suppressClickRef.current = false; return; } // เพิ่งลากเสร็จ ไม่ต้องเปิด modal
        if (linkRack) { const c = getHitCamera(e); if (c) handleLinkClick(c); return; } // โหมดผูกกล้อง
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
                            cameras: allCameras.filter(c => c.rack_id === rack.id),
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
        pingRunningRef.current = true;
        setPinging(true);
        // server ping ทั้งระบบในคำขอเดียว จึงแสดงความคืบหน้าเป็นแบบไม่ระบุจำนวนที่เสร็จ
        const total = allCameras.filter(c => c.ip_address && c.status !== 'removed' && c.status !== 'retired').length;
        setPingProgress({ done: null, total, label: 'Ping ทั้งระบบ' });
        try {
            const r = await fetch(`${API_BASE}/cctv/ping-all`, { method: 'POST' });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`);
            finishPing(d.results || [], 'Ping ทั้งระบบ');
            await fetchCameras();
        } catch (err) {
            showToast(`Ping ไม่สำเร็จ: ${err.message}`, 'error');
        } finally {
            pingRunningRef.current = false;
            setPingProgress(null);
            setPinging(false);
        }
    };

    // ── Ping by layout ────────────────────────────────────────────────────
    const handlePingLayout = async () => {
        if (!selectedLayout) { handlePingAll(); return; }
        // ping ทีละชุดจากกล้องในโรงนี้ เพื่อให้เห็นความคืบหน้า
        const cams = allCameras.filter(c => c.factory_layout_id === selectedLayout
            && c.ip_address && c.status !== 'removed' && c.status !== 'retired');
        await runPing(cams, `Ping โรงนี้ (${current?.name || ''})`);
    };

    // ── Ping รายตัว ───────────────────────────────────────────────────────
    const [pingingId, setPingingId] = useState(null);
    // ── Ping แบบมีความคืบหน้า + สรุปผล (ปุ่ม ping ที่ยิงทีละกล้องใช้ฟังก์ชันนี้ร่วมกัน) ──
    const pingRunningRef = useRef(false);                   // กันการเปลี่ยนสถานะตอน auto-refresh ระหว่าง ping
    const [pingProgress, setPingProgress] = useState(null); // { done (null = ไม่ทราบ), total, label }
    const [pingReport, setPingReport] = useState(null);     // { label, at, online, offline[], failed, total }

    const finishPing = (results, label) => {
        skipOfflineToastRef.current = true; // ผลการ ping แสดงในสรุปอยู่แล้ว ไม่ต้องแจ้งซ้ำ
        const byId = new Map(allCameras.map(c => [c.id, c]));
        const online = results.filter(r => r.status === 'online').length;
        const offlineCams = results.filter(r => r.status === 'offline').map(r => byId.get(r.id)).filter(Boolean);
        const failed = results.filter(r => r.status === 'error').length;
        setPingReport({ label, at: new Date(), online, offline: offlineCams, failed, total: results.length });
        showToast(`${label}: ออนไลน์ ${online} · ออฟไลน์ ${offlineCams.length}${failed ? ` · ผิดพลาด ${failed}` : ''} (รวม ${results.length})`,
            offlineCams.length || failed ? 'warn' : 'ok');
    };

    const runPing = async (cams, label) => {
        if (!cams.length) return;
        pingRunningRef.current = true;
        setPinging(true);
        setPingProgress({ done: 0, total: cams.length, label });
        const results = [];
        try {
            for (let i = 0; i < cams.length; i += 10) {
                const batch = cams.slice(i, i + 10);
                const res = await Promise.all(batch.map(c =>
                    fetch(`${API_BASE}/cctv/ping/${c.id}`, { method: 'POST' })
                        .then(r => r.json()).then(d => ({ id: c.id, status: d.status || 'error' }))
                        .catch(() => ({ id: c.id, status: 'error' }))));
                results.push(...res);
                setPingProgress({ done: results.length, total: cams.length, label });
            }
            finishPing(results, label);
            await fetchCameras();
        } finally {
            pingRunningRef.current = false;
            setPingProgress(null);
            setPinging(false);
        }
    };

    // Ping เฉพาะกล้องที่เลือก (bulk)
    const pingMany = (cams) => runPing(cams, `Ping ที่เลือก (${cams.length})`);
    const [statusBusy, setStatusBusy] = useState(false);

    // ── ผูก/ถอดกล้องกับ rack (หลายตัวพร้อมกัน) แล้วรีโหลดรายการกล้องทั้งหมด ──
    const [rackBusy, setRackBusy] = useState(false);

    // ── โหมดผูกกล้องจากแผนที่: เลือก rack แล้วคลิกกล้องบนแผนที่เพื่อผูก/ถอด ──
    const [linkRack, setLinkRack] = useState(null);
    const startLinkMode = (rack) => {
        setRackDetailModal(null);
        setLinkRack(rack);
        setSelectedRackId(rack.id);
        setSelectedCam(null);
        setActiveTab("map");
        if (rack.factory_layout_id && rack.factory_layout_id !== selectedLayout) setSelectedLayout(rack.factory_layout_id);
        setTimeout(() => mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    };
    const exitLinkMode = () => { setLinkRack(null); setSelectedRackId(null); };
    const handleLinkClick = (cam) => {
        const rack = linkRack;
        const rackName = rack.name.trim();
        if (cam.rack_id === rack.id) {
            setAlertModal({
                isOpen: true, type: "danger", title: "ถอดกล้องออกจาก Rack",
                message: `ถอด "${cam.name}" ออกจาก ${rackName}?`, confirmText: "ถอด", cancelText: "ยกเลิก",
                onConfirm: () => { setAlertModal(p => ({ ...p, isOpen: false })); setRackCameras([cam.id], null); },
                onCancel: () => setAlertModal(p => ({ ...p, isOpen: false })),
            });
            return;
        }
        if (cam.rack_id) {
            const other = allRacks.find(r => r.id === cam.rack_id);
            setAlertModal({
                isOpen: true, type: "danger", title: "ย้ายกล้องไป Rack นี้?",
                message: `"${cam.name}" อยู่ที่ ${other ? other.name.trim() : "Rack อื่น"} · ย้ายมาที่ ${rackName}?`,
                confirmText: "ย้าย", cancelText: "ยกเลิก",
                onConfirm: () => { setAlertModal(p => ({ ...p, isOpen: false })); setRackCameras([cam.id], rack.id); },
                onCancel: () => setAlertModal(p => ({ ...p, isOpen: false })),
            });
            return;
        }
        setRackCameras([cam.id], rack.id);
    };
    const setRackCameras = async (cameraIds, rackId) => {
        setRackBusy(true);
        try {
            const r = await fetch(`${API_BASE}/cctv/cameras/rack`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ camera_ids: cameraIds, rack_id: rackId }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`);
            const cr = await (await fetch(`${API_BASE}/cctv/cameras`)).json();
            if (cr.success) {
                setAllCameras(cr.data);
                setRackDetailModal(p => (p ? { ...p, cameras: cr.data.filter(c => c.rack_id === p.id) } : p));
            }
            showToast(rackId ? `ผูก ${cameraIds.length} กล้องเข้า rack แล้ว` : `ถอด ${cameraIds.length} กล้องออกจาก rack แล้ว`, "ok");
        } catch (err) {
            showToast(`ทำรายการไม่สำเร็จ: ${err.message}`, "error");
        } finally {
            setRackBusy(false);
        }
    };

    // ── เสียงแจ้งเตือน offline (ปิดไว้เป็นค่าเริ่มต้น จำค่าที่เลือกไว้ในเบราว์เซอร์นี้) ──
    const [alertSound, setAlertSound] = useState(() => {
        try { return localStorage.getItem('cctvAlertSound') === '1'; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem('cctvAlertSound', alertSound ? '1' : '0'); } catch { /* ไม่มี storage ก็ไม่เป็นไร */ }
    }, [alertSound]);
    const playAlertBeep = () => {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 880;
            gain.gain.value = 0.15;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
            setTimeout(() => ctx.close(), 600);
        } catch { /* เบราว์เซอร์บางตัวบล็อกเสียงโดยไม่ได้กด */ }
    };

    // ── Auto-refresh ทุก 60 วินาที (พักระหว่าง ping และเมื่อแท็บถูกซ่อน) ──
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    useEffect(() => { if (allCameras.length) setLastUpdated(new Date()); }, [allCameras]);
    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(() => {
            if (!pingRunningRef.current && !document.hidden) fetchCameras();
        }, 60000);
        return () => clearInterval(id);
    }, [autoRefresh, fetchCameras]);

    // ── แจ้งเตือนในแอปเมื่อมีกล้องเปลี่ยนเป็น offline (ไม่แจ้งตอนโหลดครั้งแรก และไม่ซ้ำกับผล ping ที่เพิ่งสรุป) ──
    const prevOfflineRef = useRef(null);
    const skipOfflineToastRef = useRef(false);
    useEffect(() => {
        if (!allCameras.length) return; // ยังโหลดไม่เสร็จ — ยังไม่ใช่ข้อมูลจริงให้เทียบ
        const ids = new Set(allCameras.filter(c => c.status === 'offline').map(c => c.id));
        const prev = prevOfflineRef.current;
        prevOfflineRef.current = ids;
        if (skipOfflineToastRef.current) { skipOfflineToastRef.current = false; return; }
        if (!prev) return;
        const newly = allCameras.filter(c => ids.has(c.id) && !prev.has(c.id));
        if (newly.length) {
            if (alertSound) playAlertBeep();
            const names = newly.slice(0, 3).map(c => c.name).join(', ');
            showToast(`กล้องออฟไลน์ใหม่ ${newly.length} ตัว: ${names}${newly.length > 3 ? ' …' : ''}`, 'warn');
        }
    }, [allCameras]);

    // ── ปุ่มลัด: "/" เปิดค้นหากล้อง, Esc ปิดหน้าต่าง ──
    useEffect(() => {
        const onKey = (e) => {
            const tag = (e.target?.tagName || '').toLowerCase();
            const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
            if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setGlobalSearchOpen(true); }
            if (e.key === 'Escape') {
                if (globalSearchOpen) setGlobalSearchOpen(false);
                else if (linkRack) { setLinkRack(null); setSelectedRackId(null); }
                else if (detailModal) setDetailModal(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [globalSearchOpen, detailModal, linkRack]);
    // แจ้งผลแบบ toast ที่หายเอง (แทน alert ที่ต้องกดปิด)
    const [toast, setToast] = useState(null);
    const toastTimerRef = useRef(null);
    const showToast = (message, tone = 'ok') => {
        clearTimeout(toastTimerRef.current);
        setToast({ message, tone });
        toastTimerRef.current = setTimeout(() => setToast(null), 6000);
    };
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

    // ── ตั้งสถานะกล้องด้วยตนเอง ─────────────────────────────────────────
    // ถอดออก/เลิกใช้ จะหยุด ping กล้องนั้น จึงต้องยืนยันก่อน ส่วน online/offline ยืนยันไม่ต้อง
    const applyCamStatus = async (s) => {
        setStatusBusy(true);
        try {
            const r = await fetch(`${API_BASE}/cctv/cameras/${detailModal.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: s }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`);
            await fetchCameras();
            setDetailModal(p => (p ? { ...p, status: s } : p));
        } catch (err) {
            setAlertModal({
                isOpen: true, type: 'danger',
                title: 'เปลี่ยนสถานะไม่สำเร็จ', message: err.message || 'เกิดข้อผิดพลาด',
                onConfirm: () => setAlertModal(p => ({ ...p, isOpen: false })),
            });
        } finally {
            setStatusBusy(false);
        }
    };

    const requestCamStatus = (s, label) => {
        if (s !== 'removed' && s !== 'retired') return applyCamStatus(s);
        setAlertModal({
            isOpen: true, type: 'danger',
            title: 'ยืนยันเปลี่ยนสถานะ',
            message: `ตั้งสถานะเป็น "${label.replace(/^\S+\s/, '')}"? กล้องนี้จะไม่ถูก ping อีกจนกว่าจะเปลี่ยนสถานะกลับ`,
            confirmText: 'ยืนยัน', cancelText: 'ยกเลิก',
            onConfirm: () => { setAlertModal(p => ({ ...p, isOpen: false })); applyCamStatus(s); },
            onCancel: () => setAlertModal(p => ({ ...p, isOpen: false })),
        });
    };
    const rackInfo = Object.fromEntries(allRacks.map(r => [r.id, r])); // rack ทุกโรงตาม id
    const online = allCameras.filter(c => c.status === 'online').length;
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
                    <span className="text-[11px] text-slate-400 self-center tabular-nums whitespace-nowrap">
                        {lastUpdated ? `อัปเดต ${lastUpdated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
                    </span>
                    <button onClick={() => setAlertSound(v => !v)} title="เสียงเมื่อมีกล้องออฟไลน์ใหม่"
                        aria-pressed={alertSound}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50">
                        {alertSound ? '🔔 เสียงเปิด' : '🔕 เสียงปิด'}
                    </button>
                    <button onClick={() => setAutoRefresh(v => !v)} title="รีเฟรชข้อมูลอัตโนมัติทุก 60 วินาที"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50">
                        {autoRefresh ? '⏸ หยุดรีเฟรช' : '▶ รีเฟรชอัตโนมัติ'}
                    </button>
                    <button onClick={handlePingLayout} disabled={pinging}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        title={selectedLayout ? `Ping เฉพาะ ${current?.name}` : 'Ping ทุก Factory'}>
                        <RefreshCw size={13} className={pinging ? 'animate-spin' : ''} />
                        {selectedLayout ? 'Ping โรงนี้' : 'Ping ทั้งหมด'}
                    </button>
                    {selectedLayout && (
                        <button onClick={handlePingAll} disabled={pinging}
                            title="Ping กล้องทั้งระบบ"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                            <RefreshCw size={13} /> Ping ทั้งระบบ
                        </button>
                    )}
                    {canCreateCctv && <button onClick={() => setCamModal({ mode: 'add' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                        <Plus size={13} /> เพิ่มกล้อง
                    </button>}
                </div>
            </div>

            {/* ── แถบออฟไลน์ตอนนี้ (กดแล้วไปที่กล้องบนแผนที่) ── */}
            {offline > 0 && (
                <div className="flex items-center gap-2 flex-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs">
                    <span className="font-semibold text-red-700">⚠️ ออฟไลน์ตอนนี้ {offline} ตัว</span>
                    {allCameras.filter(c => c.status === 'offline').slice(0, 6).map(c => (
                        <button key={c.id} onClick={() => jumpToCamera(c)}
                            className="px-2 py-0.5 rounded-full bg-white border border-red-200 text-red-700 hover:bg-red-100">
                            {c.name}
                        </button>
                    ))}
                    {offline > 6 && <span className="text-red-500">และอีก {offline - 6} ตัว</span>}
                </div>
            )}

            {/* ── Skeleton ตอนโหลดครั้งแรก ── */}
            {layouts.length === 0 && allCameras.length === 0 && (
                <div className="grid grid-cols-4 gap-2 animate-pulse">
                    {[0, 1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-slate-200" />)}
                </div>
            )}

            {/* ── Stats bar — compact ────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-2">
                {[
                    { label: 'ทั้งหมดในระบบ', value: allCameras.length, icon: Camera, grad: 'from-blue-500 to-blue-600' },
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

            {/* ── เลือกโรง: mega menu (แสดงจำนวนกล้อง + online ของแต่ละโรง) ── */}
            {layouts.length > 0 && (
                <LayoutMegaMenu
                    layouts={layouts}
                    selectedId={selectedLayout}
                    onSelect={setSelectedLayout}
                    accent="blue"
                    getStats={(l) => ({
                        total: allCameras.filter(c => c.factory_layout_id === l.id).length,
                        online: allCameras.filter(c => c.factory_layout_id === l.id && c.status === 'online').length,
                    })}
                />
            )}

            {/* ── Toolbar ────────────────────────────────────────────────── */}
<div className="flex items-center gap-3 flex-wrap">
    {/* Tab buttons */}
    <div className="flex gap-1">
        {[
            { id: 'map', label: '🗺️ Map' },
            { id: 'maintenance', label: '🛠️ บันทึกซ่อม/ถอด/ติดตั้ง' },
            { id: 'report', label: '📊 รายงาน' },
        ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                        ${activeTab === t.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-blue-300'}`}>
                {t.label}
            </button>
        ))}
    </div>

    {/* ปุ่มค้นหา — ย้ายออกมาเป็น sibling */}
    <button onClick={() => setGlobalSearchOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
        title="ค้นหากล้อง">
        <Search size={13} /> ค้นหากล้อง
    </button>

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
                    {/* ── แถบโหมดผูกกล้องจากแผนที่ ── */}
                    {linkRack && (
                        <div className="flex items-center gap-3 flex-wrap rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-xs">
                            <span className="font-semibold text-purple-800">🔗 กำลังผูกกล้องเข้า {linkRack.name.trim()}</span>
                            <span className="text-purple-700">คลิกกล้องเพื่อผูก · คลิกกล้องที่ผูกอยู่เพื่อถอด · เปลี่ยนโรงเพื่อหากล้องข้ามโรงได้</span>
                            {linkRack.factory_layout_id !== selectedLayout && (
                                <button onClick={() => setSelectedLayout(linkRack.factory_layout_id)}
                                    className="px-2.5 py-1 rounded-lg bg-white border border-purple-200 text-purple-700 hover:bg-purple-100">
                                    ไปที่โรงของ rack ({linkRack.layout_name || "—"})
                                </button>
                            )}
                            <button onClick={exitLinkMode} className="ml-auto px-3 py-1 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700">
                                เสร็จ (Esc)
                            </button>
                        </div>
                    )}
                    {/* ── ผล ping ล่าสุด (สรุป + รายชื่อกล้อง offline ที่กดไปดูได้) ── */}
                    {pingReport && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-semibold text-slate-700">
                                    ผล {pingReport.label} · {pingReport.at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <button onClick={() => setPingReport(null)} className="text-slate-400 hover:text-slate-600" aria-label="ปิดผล ping">
                                    <X size={14} />
                                </button>
                            </div>
                            <div className="flex gap-3 text-xs mb-2 flex-wrap">
                                <span className="text-green-700 font-medium">ออนไลน์ {pingReport.online}</span>
                                <span className="text-red-700 font-medium">ออฟไลน์ {pingReport.offline.length}</span>
                                {pingReport.failed > 0 && <span className="text-amber-700 font-medium">ผิดพลาด {pingReport.failed}</span>}
                                <span className="text-slate-400">รวม {pingReport.total}</span>
                            </div>
                            {pingReport.offline.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {pingReport.offline.map(c => (
                                        <button key={c.id} onClick={() => jumpToCamera(c)}
                                            className="px-2 py-0.5 rounded-full text-[11px] bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <DataQualityPanel cameras={cameras} loadCameras={allCameras} recordServers={allRecordServers}
                        label={current?.name || 'ทุกโรง'} />
                    {/* Map — fit viewport, no scroll */}
                    <div ref={mapRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div ref={mapViewportRef} className="overflow-auto" style={{ maxHeight: !fitScreen && mapZoom > 1 ? '72vh' : undefined }}>
                        <div style={fitScreen && imgAspect
                            ? { width: `min(${mapZoom * 100}%, calc((100vh - 230px) * ${imgAspect}))`, margin: '0 auto' }
                            : { width: `${mapZoom * 100}%` }}>
                        <div className="relative bg-gray-50" style={{ height: 'auto' }}>
                            {current?.image_url ? (
                                <>
                                    <img ref={imageRef}
                                        src={current.image_url.startsWith('http') ? current.image_url : `${API_URL}${current.image_url}`}
                                        style={{ display: 'none' }}
                                        onLoad={(e) => {
                                            setImageLoaded(true);
                                            const im = e.currentTarget;
                                            if (im.naturalWidth && im.naturalHeight) setImgAspect(im.naturalWidth / im.naturalHeight);
                                        }}
                                        crossOrigin="anonymous"
                                        alt="layout"
                                    />
                                    {imageLoaded
                                        ? <canvas ref={canvasRef}
                                            onClick={handleClick}
                                            onMouseDown={handleCamMouseDown}
                                            onMouseMove={handleMouseMove}
                                            onMouseLeave={() => { setHoveredCam(null); setTooltip(null); }}
                                            style={{ width: '100%', height: 'auto', cursor: isDraggingCam ? 'grabbing' : hoveredCam ? (isStaff ? 'grab' : 'pointer') : 'crosshair', display: 'block' }}
                                        />
                                        : <div className="text-gray-400 text-sm">Loading map...</div>
                                    }
                                </>
                            ) : (
                                <div className="text-gray-400 text-sm">ไม่มีแผนผัง</div>
                            )}
                        </div>
                        </div>
                        </div>
                        <div className="flex gap-4 px-4 py-2 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-600 inline-block" />Online</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" />Offline</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />Access Rack</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-700 inline-block" />Distribution Rack</span>
                            <span className="flex items-center gap-1.5">
                                <svg width="14" height="10" viewBox="0 0 16 12"><path d="M8,6 L2,1 A7,7 0 0,1 14,1 Z" fill="rgba(59,130,246,0.3)" stroke="rgba(59,130,246,0.7)" strokeWidth="1" /></svg>FOV
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full border border-dashed border-amber-500 inline-block" />ยังไม่มี FOV
                            </span>
                            <div className="flex items-center gap-1">
                                {[
                                    { k: 'fov', label: 'FOV' },
                                    { k: 'labels', label: 'ป้าย' },
                                    { k: 'racks', label: 'Rack' },
                                ].map(t => (
                                    <button key={t.k} onClick={() => setLayers(p => ({ ...p, [t.k]: !p[t.k] }))}
                                        aria-pressed={layers[t.k]}
                                        className={`px-2 py-0.5 rounded-full border text-[11px] ${layers[t.k] ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-400 line-through'}`}>
                                        {t.label}
                                    </button>
                                ))}
                                <button onClick={focusSelected} disabled={!selectedCam}
                                    className="px-2 py-0.5 rounded-full border border-gray-200 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                                    🎯 โฟกัส
                                </button>
                            </div>
                            <div className="ml-auto flex items-center gap-2 flex-wrap">
                                <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden bg-white">
                                    <button onClick={() => changeMapZoom(mapZoom - 0.5)} disabled={mapZoom <= 1} title="ซูมออก"
                                        className="px-2 py-0.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">−</button>
                                    <button onClick={() => changeMapZoom(1)} title="รีเซ็ตซูม"
                                        className="px-2 py-0.5 text-[11px] font-semibold text-gray-600 border-x border-gray-200 hover:bg-gray-50 min-w-[52px] tabular-nums">{Math.round(mapZoom * 100)}%</button>
                                    <button onClick={() => changeMapZoom(mapZoom + 0.5)} disabled={mapZoom >= 3} title="ซูมเข้า"
                                        className="px-2 py-0.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">+</button>
                                </div>
                                <button onClick={() => { setFitScreen((v) => !v); changeMapZoom(1); }} aria-pressed={fitScreen}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${fitScreen ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                                    {fitScreen ? 'ยกเลิกพอดีหน้าจอ' : 'พอดีหน้าจอ'}
                                </button>
                            <span className="text-gray-400">
                                {isStaff
                                    ? 'ลากกล้องเพื่อย้ายตำแหน่ง (บันทึกอัตโนมัติ) · คลิกกล้อง/Rack = รายละเอียด · คลิก Rack ซ้ำ = highlight เส้นสาย'
                                    : 'คลิกกล้อง/Rack = รายละเอียด · คลิก Rack ซ้ำ = highlight เส้นสาย'}
                            </span>
                            </div>
                        </div>
                    </div>

                    {/* Camera list below map */}
                    <CameraListSection
                        cameras={cameras}
                        onPingMany={pingMany}
                        allCameras={allCameras}
                        rackInfo={rackInfo}
                        currentName={current?.name}
                        listLocFilter={listLocFilter}
                        setListLocFilter={setListLocFilter}
                        listPage={listPage}
                        setListPage={setListPage}
                        selectedCam={selectedCam}
                        setSelectedCam={setSelectedCam}
                        setDetailModal={setDetailModal}
                        setLocationModal={isStaff ? setLocationModal : null}
                        setCamModal={setCamModal}
                        fullUrl={fullUrl}
                        selectedLayout={selectedLayout}
                        onJumpToCamera={jumpToCamera}
                    />

                    {/* ── Rack & Switch section (รวมในหน้าเดียว) ─────── */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-600">Rack & Switch — {current?.name}</span>
                            </div>
                            <div className="flex gap-2">
                                {canCreateCctv && <button onClick={() => setSwitchModal({ mode: 'add' })}
                                    className="flex items-center gap-1 px-2.5 py-1 border border-gray-200 text-xs rounded-lg text-gray-600 hover:bg-gray-50">
                                    <Network size={11} /> เพิ่ม Switch
                                </button>}
                                {canCreateCctv && <button onClick={() => setRackModal({ mode: 'add' })}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700">
                                    <Server size={11} /> เพิ่ม Rack
                                </button>}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {racks.map(rack => {
                                // กล้องทุกโรงที่เชื่อมกับ rack นี้ (ไม่กรองตามโรงที่เลือก) — กล้องจากโรงอื่นจะมีป้ายบอกโรง
                                const rackCams = allCameras.filter(c => c.rack_id === rack.id);
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
                                                {canEditCctv && <button onClick={() => setRackModal({ mode: 'edit', data: rack })}
                                                    className="p-1 rounded hover:bg-gray-100 text-gray-400">✏️</button>}
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
                                                    {cam.factory_layout_id !== rack.factory_layout_id && (
                                                        <span className="ml-1 opacity-70" title={`อยู่ที่ ${cam.layout_name || 'โรงอื่น'}`}>↗ {cam.layout_name || 'โรงอื่น'}</span>
                                                    )}
                                                </span>
                                            ))}
                                            {!rackCams.length && <span className="text-[10px] text-gray-300">ยังไม่มีกล้อง</span>}
                                        </div>
                                    </div>
                                );
                            })}
                            {!racks.length && (
                                <div className="col-span-full text-center py-8 bg-white rounded-xl border border-dashed border-gray-200">
                                    <div className="text-3xl mb-2">🗄️</div>
                                    <div className="text-sm font-medium text-gray-600">ยังไม่มี Rack ใน Factory นี้</div>
                                    <div className="text-xs text-gray-400 mt-1 mb-3">เพิ่ม Rack เพื่อจัดกลุ่มกล้องและแสดงเส้นสายบนแผนที่</div>
                                    {canCreateCctv && (
                                        <button onClick={() => setRackModal({ mode: 'add' })}
                                            className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700">
                                            + เพิ่ม Rack
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Tab: บันทึก Maintenance (ซ่อม + ถอด) ────────────────── */}
            {activeTab === 'report' && <CCTVReportView />}

            {activeTab === 'maintenance' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700">
                                🛠️ บันทึกงานกล้อง
                            </span>
                            <div className="flex gap-1">
                                {['all', 'repair', 'removal', 'install'].map(t => (
                                    <button key={t} onClick={() => setMaintenanceTypeFilter(t)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors
                                                ${maintenanceTypeFilter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                        {t === 'all' ? 'ทั้งหมด' : t === 'repair' ? 'ซ่อม' : t === 'removal' ? 'ถอด' : 'ติดตั้ง'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input value={maintenanceSearch} onChange={e => setMaintenanceSearch(e.target.value)}
                                placeholder="ค้นหา..." className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-48" />
                            <button onClick={() => window.open(`${API_BASE}/cctv/maintenance-logs/export?log_type=${maintenanceTypeFilter === 'all' ? '' : maintenanceTypeFilter}`, '_blank')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                                ⬇️ Export CSV
                            </button>
                            {canCreateCctv && <button onClick={() => setMaintenanceModal({ mode: 'add', logType: maintenanceTypeFilter === 'all' ? 'repair' : maintenanceTypeFilter })}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                                + เพิ่มบันทึก
                            </button>}
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
                                <th className="px-4 py-2 text-left">วิธีแก้ไข</th>
                                <th className="px-4 py-2 text-left">สถานะ</th>
                                <th className="px-4 py-2 text-left">ผู้รับผิดชอบ</th>
                                <th className="px-4 py-2 text-left">วันที่แจ้ง</th>
                                <th className="px-4 py-2" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {maintenanceLogs
                                .filter(r => {
                                    const typeOk = maintenanceTypeFilter === 'all' || r.log_type === maintenanceTypeFilter;
                                    const searchOk = !maintenanceSearch ||
                                        r.camera_names?.toLowerCase().includes(maintenanceSearch.toLowerCase()) ||
                                        r.camera_name?.toLowerCase().includes(maintenanceSearch.toLowerCase()) ||
                                        r.description?.toLowerCase().includes(maintenanceSearch.toLowerCase()) ||
                                        r.factory_name?.toLowerCase().includes(maintenanceSearch.toLowerCase());
                                    return typeOk && searchOk;
                                })
                                .map(r => {
                                    const statusConfig = {
                                        pending:       { label: 'รอดำเนินการ',    cls: 'bg-yellow-100 text-yellow-700' },
                                        in_progress:   { label: 'กำลังซ่อม',     cls: 'bg-blue-100 text-blue-700' },
                                        waiting_parts: { label: 'รอของ',          cls: 'bg-orange-100 text-orange-700' },
                                        resolved:      { label: 'แก้แล้ว',       cls: 'bg-green-100 text-green-700' },
                                        removed:       { label: 'ถอดออกแล้ว',    cls: 'bg-red-100 text-red-700' },
                                        repairing:     { label: 'ส่งซ่อมอยู่',   cls: 'bg-blue-100 text-blue-700' },
                                        reinstalled:   { label: 'ติดตั้งคืนแล้ว', cls: 'bg-green-100 text-green-700' },
                                        retired:       { label: 'เลิกใช้งาน',    cls: 'bg-gray-100 text-gray-600' },
                                        installed:     { label: 'ติดตั้งแล้ว',   cls: 'bg-green-100 text-green-700' },
                                    };
                                    const st = statusConfig[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-600' };
                                    const isRepair = r.log_type === 'repair';

                                    // แสดงชื่อกล้อง — ถ้ามี camera_names ใช้อัน นั้น ไม่งั้นใช้ camera_name
                                    const camDisplay = r.camera_names || r.camera_name || '—';
                                    const camList = camDisplay.split(',').map(s => s.trim()).filter(Boolean);

                                    return (
                                        <tr key={r.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isRepair ? 'bg-blue-50 text-blue-600' : r.log_type === 'install' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                                                    {isRepair ? '🔧 ซ่อม' : r.log_type === 'install' ? '🆕 ติดตั้ง' : '📤 ถอด'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 font-medium text-gray-800 max-w-[160px]">
                                                {camList.length > 1 ? (
                                                    <div>
                                                        <div className="font-medium text-gray-800">{camList[0]}</div>
                                                        <div className="text-[10px] text-blue-500 cursor-pointer" title={camList.join('\n')}>
                                                            +{camList.length - 1} ตัว
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div>{camList[0]}</div>
                                                        <div className="text-gray-400 text-[10px]">{r.ip_address}</div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-gray-600 text-[11px]">{r.factory_name || '—'}</td>
                                            <td className="px-4 py-2 text-gray-600">{r.issue_type || r.reason || '—'}</td>
                                            <td className="px-4 py-2 text-gray-600 max-w-[150px] truncate">{r.description || '—'}</td>
                                            <td className="px-4 py-2 text-gray-600 max-w-[150px] truncate">{r.solution || '—'}</td>
                                            <td className="px-4 py-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                                            </td>
                                            <td className="px-4 py-2 text-gray-600">{(r.assigned_to || r.reported_by || '—').toUpperCase()}</td>
                                            <td className="px-4 py-2 text-gray-500">{r.reported_at ? new Date(r.reported_at).toLocaleDateString('th-TH') : '—'}</td>
                                            <td className="px-4 py-2">
                                                <div className="flex gap-1">
                                                    <button onClick={() => setMaintenanceDetail(r)}
                                                        className="p-1 hover:bg-blue-50 rounded text-blue-400" title="ดูรายละเอียด">👁️</button>
                                                    {canEditCctv && <button onClick={() => setMaintenanceModal({ mode: 'edit', data: r })}
                                                        className="p-1 hover:bg-gray-100 rounded text-gray-400">✏️</button>}
                                                    {canDeleteCctv && <button onClick={() => setAlertModal({
                                                        isOpen: true, type: 'danger',
                                                        title: 'ลบบันทึก', message: 'ยืนยันลบบันทึกนี้?',
                                                        onConfirm: async () => {
                                                            await fetch(`${API_BASE}/cctv/maintenance-logs/${r.id}`, { method: 'DELETE' });
                                                            fetchMaintenanceLogs();
                                                            setAlertModal(p => ({ ...p, isOpen: false }));
                                                        },
                                                        onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
                                                    })} className="p-1 hover:bg-red-50 rounded text-red-400">🗑️</button>}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            {!maintenanceLogs.filter(r => maintenanceTypeFilter === 'all' || r.log_type === maintenanceTypeFilter).length && (
                                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                                    ยังไม่มีบันทึก
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
                        racks={allRacks}
                        switches={allSwitches}
                        cameras={allCameras}
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
                        <div className="bg-white rounded-2xl w-full max-w-md lg:max-w-4xl shadow-2xl flex flex-col overflow-hidden"
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
                                {/* Cameras — จัดการกล้องใน rack (ผูก/ถอด ข้ามโรงได้) */}
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                        <Camera size={11} /> จัดการกล้องใน Rack
                                        <button onClick={() => startLinkMode(rackDetailModal)}
                                            className="ml-auto normal-case tracking-normal font-medium text-purple-600 hover:text-purple-800 border border-purple-200 rounded-lg px-2 py-0.5">
                                            🔗 ผูกกล้องจากแผนที่
                                        </button>
                                    </div>
                                    <RackCameraPicker
                                        linked={rackDetailModal.cameras || []}
                                        allCameras={allCameras}
                                        rackFactoryId={rackDetailModal.factory_layout_id}
                                        busy={rackBusy}
                                        onLink={(ids) => setRackCameras(ids, rackDetailModal.id)}
                                        onUnlink={(id) => setRackCameras([id], null)}
                                        onOpenCamera={(cam) => { setRackDetailModal(null); setSelectedRackId(null); setSelectedCam(cam.id); setDetailModal(cam); }}
                                    />
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
                                {canEditCctv && <button onClick={() => { setRackDetailModal(null); setSelectedRackId(null); setRackModal({ mode: 'edit', data: rackDetailModal }); }}
                                    className="flex-1 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-white flex items-center justify-center gap-1.5">
                                    ✏️ แก้ไข
                                </button>}
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
            {/* ── Camera Detail Modal ──────────────────────────────────── */}
           {detailModal && (
               <CameraDetailModal
                   camera={detailModal}
                   uptime={uptimeMap[detailModal.id]}
                   racks={allRacks}
                   canEdit={canEditCctv}
                   pingingId={pingingId}
                   statusBusy={statusBusy}
                   apiBase={API_BASE}
                   onClose={() => { setDetailModal(null); setSelectedCam(null); }}
                   onPing={handlePingSingle}
                   onRequestStatus={requestCamStatus}
                   onJumpMap={(cam) => { setDetailModal(null); jumpToCamera(cam); }}
                   onEdit={(cam) => { setDetailModal(null); setCamModal({ mode: 'edit', data: cam }); }}
                   onLocation={(cam) => { setDetailModal(null); setLocationModal(cam); }}
               />
           )}
            {pingProgress && (
                <div className="fixed bottom-6 left-6 z-[99997] w-72 rounded-xl bg-white shadow-2xl border border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2 gap-2">
                        <span className="truncate">{pingProgress.label}</span>
                        <span className="tabular-nums whitespace-nowrap">
                            {pingProgress.done == null ? `${pingProgress.total} กล้อง` : `${pingProgress.done}/${pingProgress.total}`}
                        </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        {pingProgress.done == null
                            ? <div className="h-full w-full bg-blue-500 animate-pulse" />
                            : <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round((pingProgress.done / Math.max(1, pingProgress.total)) * 100)}%` }} />}
                    </div>
                </div>
            )}
            {toast && (
                <div role="status" className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[99998] max-w-[90vw] px-4 py-2.5 rounded-xl shadow-2xl text-sm font-medium text-white
                    ${toast.tone === 'error' ? 'bg-red-600' : toast.tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-600'}`}>
                    {toast.message}
                </div>
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
                        confirmText={alertModal.confirmText}
                        cancelText={alertModal.cancelText}
                    />
                </div>
            </Portal>

            {/* ── Snapshot tooltip ─────────────────────────────────────── */}
            {maintenanceDetail && (
                <MaintenanceDetailModal
                    data={maintenanceDetail}
                    onClose={() => setMaintenanceDetail(null)}
                />
            )}

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
            {tooltip?.cam && <TooltipPortal tooltip={tooltip} canvasRef={canvasRef} />}
            {globalSearchOpen && (
    <GlobalSearchModal
        cameras={allCameras}
        onClose={() => setGlobalSearchOpen(false)}
        onSelect={(cam) => { setGlobalSearchOpen(false); jumpToCamera(cam); }}
    />)}
        </div>

    );
}
export default CCTVPage;