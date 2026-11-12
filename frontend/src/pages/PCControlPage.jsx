import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Monitor, Laptop2, Printer, X, Loader2, MapPin, Search } from 'lucide-react';
import { API_BASE, API_URL } from '../config/api';
import Portal from '../components/Portal';
import { useAuth } from '../context/AuthContext';

// ─── helpers ──────────────────────────────────────────────────────────────
const getPcIcon = (computerType) => {
  const t = (computerType || '').toLowerCase();
  if (t.includes('notebook') || t.includes('laptop')) return '💻';
  if (t.includes('tablet')) return '📱';
  return '🖥️';
};

const extractRealUser = (raw) => {
  if (!raw) return null;
  const skip = /^(UMFD|DWM|NT AUTHORITY|NETWORK|LOCAL|SYSTEM|ANONYMOUS)/i;
  return (
    raw
      .split(',')
      .map((u) => u.trim().replace(/^[^\\]*\\/, '').replace(/\$$/, '').trim())
      .find((u) => u && !skip.test(u) && !(/^[A-Z0-9]+-[A-Z0-9_-]+$/i.test(u) && !u.includes('.'))) || null
  );
};

// ─── สีของแต่ละประเภทอุปกรณ์บนแผนผัง ────────────────────────────────────────
const TYPE_TONE = {
  pc: { dot: 'bg-blue-600', ping: 'bg-blue-400', label: 'text-blue-700', chip: 'bg-blue-50 text-blue-600', text: 'text-blue-600', name: 'PC' },
  mo: { dot: 'bg-violet-600', ping: 'bg-violet-400', label: 'text-violet-700', chip: 'bg-violet-50 text-violet-600', text: 'text-violet-600', name: 'Monitor' },
  printer: { dot: 'bg-emerald-600', ping: 'bg-emerald-400', label: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-600', name: 'Printer' },
};

// ─── printer (Printer Health) → รูปแบบเดียวกับจุดอื่นบนแผนผัง ─────────────────
const toPrinterDevice = (p, layoutName) => ({
  key: `pr-${p.PrinterId}`,
  type: 'printer',
  printerId: p.PrinterId,
  hostname: p.Name,
  x: p.location_x,
  y: p.location_y,
  ip: p.IpAddress,
  icon: '🖨️',
  user: null,
  layoutId: p.factory_layout_id,
  layoutName,
  printer: p, // ข้อมูลจาก dbo.Printers ใช้แสดงในโมดัล
});

// endpoint สำหรับบันทึกตำแหน่ง/ย้ายแผนผัง แยกตามประเภทอุปกรณ์
const placementApiPath = (device) =>
  device.type === 'printer'
    ? `${API_BASE}/printer-locations/${device.printerId}`
    : `${API_BASE}/${device.type === 'pc' ? 'pc-location' : 'mo-location'}/${encodeURIComponent(device.hostname)}`;

// ─── รายละเอียดในโมดัล — แถวข้อมูลเดียว ────────────────────────────────────
const InfoRow = ({ label, value }) => (
  <div className="flex items-center px-3 py-1.5">
    <span className="text-[11px] text-slate-400 w-24 shrink-0">{label}</span>
    <span className="text-[12.5px] font-medium text-slate-800 truncate">{value || '—'}</span>
  </div>
);

// ─── Global Search Modal — ค้นข้ามทุกแผนผัง คลิกแล้ววิ่งไปหาเลย (pattern เดียวกับ CCTVPage) ──
const GlobalSearchModal = ({ devices, loading, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const results = (
    q
      ? devices.filter(
          (d) =>
            d.hostname.toLowerCase().includes(q) ||
            (d.fixAsset || '').toLowerCase().includes(q) ||
            (d.ip || '').toLowerCase().includes(q) ||
            (d.user || '').toLowerCase().includes(q) ||
            (d.layoutName || '').toLowerCase().includes(q)
        )
      : devices
  ).slice(0, 40);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/40 p-4"
        style={{ paddingTop: '10vh' }}
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div
          className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          style={{ maxHeight: '70vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาเครื่อง: hostname, fix asset, user, ชื่อผัง..."
              className="flex-1 outline-none text-sm bg-transparent"
            />
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 shrink-0">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
                <Loader2 size={16} className="animate-spin" /> กำลังโหลดรายชื่อเครื่องทั้งหมด...
              </div>
            ) : results.length ? (
              results.map((d) => (
                <button
                  key={d.key}
                  onClick={() => onSelect(d)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 text-left border-b border-slate-50 last:border-0 transition-colors"
                >
                  <span className="text-base shrink-0">{d.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{d.hostname}</div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {(d.type === 'printer' ? d.ip || 'ไม่ระบุ IP' : d.user || 'No User')} · {d.layoutName || 'ไม่ระบุแผนผัง'}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${TYPE_TONE[d.type].chip}`}
                  >
                    {TYPE_TONE[d.type].name}
                  </span>
                </button>
              ))
            ) : (
              <div className="text-center py-10 text-slate-400 text-sm">ไม่พบเครื่องที่ตรงกับคำค้นหา</div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
};

const PCControlPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Staff'; // ✅ ลาก/ย้ายตำแหน่งได้เฉพาะ staff — ดูอย่างเดียวได้ทุกคน
  // ⚠️ นี่เป็นแค่การกันเบื้องต้นฝั่ง frontend เท่านั้น — endpoint PUT /pc-location/:hostname
  // และ /mo-location/:hostname ฝั่ง backend ควรมี auth middleware เช็ค role อีกชั้นด้วย
  // เพราะใครก็ยิง API ตรงๆ ข้าม UI นี้ได้

  const [layouts, setLayouts] = useState([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState(null);
  const [layoutsLoading, setLayoutsLoading] = useState(true);

  const [pcDevices, setPcDevices] = useState([]);
  const [moDevices, setMoDevices] = useState([]);
  const [allPrinters, setAllPrinters] = useState([]); // printer ทุกเครื่องจาก MA (รวมที่ยังไม่ได้วาง)
  const [devicesLoading, setDevicesLoading] = useState(false);

  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  // ตำแหน่งแบบ live ระหว่างลาก (key -> {x, y}) — override ตำแหน่งจริงชั่วคราวตอนลาก
  const [dragPos, setDragPos] = useState(null); // { key, x, y }
  const dragPosRef = useRef(null); // mirror ของ dragPos ให้ handler ที่ stable อ่านค่าล่าสุดได้เสมอ
  const draggingRef = useRef(null); // { key, type, hostname, startClientX, startClientY, startX, startY, moved }
  const containerRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const filteredDevicesRef = useRef([]); // mirror ของ filteredDevices
  const selectedLayoutIdRef = useRef(null); // mirror ของ selectedLayoutId

  const [savingKey, setSavingKey] = useState(null);
  const [toast, setToast] = useState(null);
  const isAdminRef = useRef(isAdmin);
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // ── Global search (ค้นข้ามทุกผัง แล้ววิ่งไปหา) ──
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalDevices, setGlobalDevices] = useState([]);
  const [globalDevicesLoading, setGlobalDevicesLoading] = useState(false);
  const [globalDevicesFetchedAt, setGlobalDevicesFetchedAt] = useState(0);
  const [highlightKey, setHighlightKey] = useState(null);
  const mapContainerWrapRef = useRef(null);

  // ── โมดัลรายละเอียดเครื่อง ──
  const [modalDevice, setModalDevice] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState({ inv: null, users: [] });

  const showToast = (msg, tone = 'success') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2500);
  };

  // ── โหลด layout ทั้งหมด ──
  useEffect(() => {
    (async () => {
      setLayoutsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/factory-layouts`).then((r) => r.json());
        if (res.success) {
          setLayouts(res.data || []);
          if (res.data?.length > 0) setSelectedLayoutId(res.data[0].id);
        }
      } catch (err) {
        console.error('Error fetching layouts:', err);
      } finally {
        setLayoutsLoading(false);
      }
    })();
  }, []);

  const selectedLayout = useMemo(() => layouts.find((l) => l.id === selectedLayoutId) || null, [layouts, selectedLayoutId]);

  // ── โหลด PC + Monitor ของ layout ที่เลือก ──
  const fetchDevices = useCallback(async () => {
    if (!selectedLayoutId) return;
    setDevicesLoading(true);
    setImageLoaded(false);
    try {
      const [pcRes, moRes] = await Promise.all([
        fetch(`${API_BASE}/pc-location/layout/${selectedLayoutId}`).then((r) => r.json()),
        fetch(`${API_BASE}/mo-location/layout/${selectedLayoutId}`).then((r) => r.json()),
      ]);
      setPcDevices(pcRes.success ? pcRes.data || [] : []);
      setMoDevices(moRes.success ? moRes.data || [] : []);
    } catch (err) {
      console.error('Error fetching devices for layout:', err);
      setPcDevices([]);
      setMoDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  }, [selectedLayoutId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // ── โหลด printer ทั้งหมดจาก Printer Health — ผูกกับแผนผังผ่าน FactoryLayoutID ──
  const fetchPrinters = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/printer-locations`).then((r) => r.json());
      setAllPrinters(res.success ? res.data || [] : []);
    } catch (err) {
      console.error('Error fetching printers:', err);
    }
  }, []);

  useEffect(() => {
    fetchPrinters();
  }, [fetchPrinters]);

  // ── โหลดเครื่องทั้งหมดจากทุกผัง (สำหรับ global search) — โหลดครั้งเดียว cache ไว้ ──
  const fetchAllDevicesAcrossLayouts = useCallback(async () => {
    if (layouts.length === 0) return;
    setGlobalDevicesLoading(true);
    try {
      const results = await Promise.all(
        layouts.map(async (l) => {
          const [pcRes, moRes] = await Promise.all([
            fetch(`${API_BASE}/pc-location/layout/${l.id}`).then((r) => r.json()).catch(() => ({ success: false })),
            fetch(`${API_BASE}/mo-location/layout/${l.id}`).then((r) => r.json()).catch(() => ({ success: false })),
          ]);
          const pcs = (pcRes.success ? pcRes.data || [] : []).map((d) => ({
            key: `pc-${d.hostname}`,
            type: 'pc',
            hostname: d.hostname,
            fixAsset: d.fix_asset,
            icon: getPcIcon(d.computer_type),
            user: extractRealUser(d.username),
            layoutId: l.id,
            layoutName: l.name,
          }));
          const mos = (moRes.success ? moRes.data || [] : []).map((d) => ({
            key: `mo-${d.hostname}`,
            type: 'mo',
            hostname: d.hostname,
            fixAsset: d.fix_asset,
            icon: '🖥️',
            user: extractRealUser(d.username),
            layoutId: l.id,
            layoutName: l.name,
          }));
          return [...pcs, ...mos];
        })
      );
      const printers = allPrinters
        .filter((p) => p.factory_layout_id != null && p.location_x != null)
        .map((p) => toPrinterDevice(p, layouts.find((l) => l.id === p.factory_layout_id)?.name));
      setGlobalDevices([...results.flat(), ...printers]);
      setGlobalDevicesFetchedAt(Date.now());
    } catch (err) {
      console.error('Error fetching all devices:', err);
    } finally {
      setGlobalDevicesLoading(false);
    }
  }, [layouts, allPrinters]);

  const openGlobalSearch = () => {
    setGlobalSearchOpen(true);
    // โหลดใหม่ทุกครั้งที่เปิด ถ้ายังไม่เคยโหลด หรือโหลดมาเกิน 2 นาทีแล้ว (ข้อมูลอาจไม่สดแล้ว)
    if (Date.now() - globalDevicesFetchedAt > 120000) fetchAllDevicesAcrossLayouts();
  };

  const jumpToDevice = (device) => {
    setGlobalSearchOpen(false);
    if (device.layoutId && device.layoutId !== selectedLayoutId) {
      setSelectedLayoutId(device.layoutId);
    }
    setHighlightKey(device.key);
    setTimeout(() => {
      mapContainerWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    setTimeout(() => setHighlightKey(null), 4000);
  };

  // printer ของแผนผังที่เลือก (เฉพาะที่มีพิกัดแล้ว) และรายการที่ยังไม่ได้วาง
  const printerDevices = useMemo(
    () =>
      allPrinters
        .filter((p) => p.factory_layout_id === selectedLayoutId && p.location_x != null && p.location_y != null)
        .map((p) => toPrinterDevice(p, selectedLayout?.name)),
    [allPrinters, selectedLayoutId, selectedLayout]
  );
  const unplacedPrinters = useMemo(() => allPrinters.filter((p) => p.location_x == null || p.location_y == null), [allPrinters]);

  const allDevices = useMemo(() => {
    const pcs = pcDevices.map((d) => ({
      key: `pc-${d.hostname}`,
      type: 'pc',
      hostname: d.hostname,
      x: d.location_x,
      y: d.location_y,
      fixAsset: d.fix_asset,
      icon: getPcIcon(d.computer_type),
      user: extractRealUser(d.username),
    }));
    const mos = moDevices.map((d) => ({
      key: `mo-${d.hostname}`,
      type: 'mo',
      hostname: d.hostname,
      x: d.location_x,
      y: d.location_y,
      fixAsset: d.fix_asset,
      icon: '🖥️',
      user: extractRealUser(d.username),
    }));
    return [...pcs, ...mos, ...printerDevices];
  }, [pcDevices, moDevices, printerDevices]);

  const filteredDevices = useMemo(() => {
    let list = allDevices;
    if (typeFilter !== 'all') list = list.filter((d) => d.type === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.hostname.toLowerCase().includes(q) ||
          (d.fixAsset || '').toLowerCase().includes(q) ||
          (d.user || '').toLowerCase().includes(q)
      );
    }
    return list.filter((d) => d.x !== null && d.y !== null && d.x !== undefined && d.y !== undefined);
  }, [allDevices, typeFilter, search]);

  const counts = useMemo(
    () => ({ all: allDevices.length, pc: pcDevices.length, mo: moDevices.length, printer: printerDevices.length }),
    [allDevices, pcDevices, moDevices, printerDevices]
  );

  useEffect(() => {
    filteredDevicesRef.current = filteredDevices;
  }, [filteredDevices]);
  useEffect(() => {
    selectedLayoutIdRef.current = selectedLayoutId;
  }, [selectedLayoutId]);
  useEffect(() => {
    dragPosRef.current = dragPos;
  }, [dragPos]);

  // ── ลาก & บันทึกตำแหน่ง ──────────────────────────────────────────────
  const DRAG_THRESHOLD = 4; // px — ขยับน้อยกว่านี้ถือว่าเป็นคลิก ไม่ใช่ลาก

  // ✅ handler พวกนี้ถูกสร้างครั้งเดียวตลอดอายุ component (deps ว่าง) แล้วอ่านค่าล่าสุดผ่าน ref เท่านั้น
  // กัน bug ที่ addEventListener/removeEventListener อาจอ้างอิงคนละ closure กันตอน re-render ระหว่างลาก
  const handleWindowMouseMove = useCallback((e) => {
    const drag = draggingRef.current;
    if (!drag || !containerRef.current) return;
    const dxPx = e.clientX - drag.startClientX;
    const dyPx = e.clientY - drag.startClientY;
    if (Math.abs(dxPx) > DRAG_THRESHOLD || Math.abs(dyPx) > DRAG_THRESHOLD) drag.moved = true;
    if (!drag.moved) return;

    const rect = containerRef.current.getBoundingClientRect();
    const dxPct = (dxPx / rect.width) * 100;
    const dyPct = (dyPx / rect.height) * 100;
    let newX = drag.startX + dxPct;
    let newY = drag.startY + dyPct;
    newX = Math.min(98, Math.max(2, newX));
    newY = Math.min(96, Math.max(2, newY));
    setDragPos({ key: drag.key, x: newX, y: newY });
  }, []);

  const handleWindowMouseUp = useCallback(async () => {
    const drag = draggingRef.current;
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);
    draggingRef.current = null;

    if (!drag) return;

    if (!drag.moved) {
      // ไม่ได้ลาก ถือว่าเป็นคลิก → เปิดโมดัล
      setDragPos(null);
      const device = filteredDevicesRef.current.find((d) => d.key === drag.key);
      if (device) openDeviceDetail(device);
      return;
    }

    // ลากจริง → บันทึกตำแหน่งใหม่
    const finalPos = dragPosRef.current && dragPosRef.current.key === drag.key ? dragPosRef.current : null;
    if (!finalPos) {
      setDragPos(null);
      return;
    }
    setSavingKey(drag.key);
    try {
      const res = await fetch(placementApiPath(drag), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factory_layout_id: selectedLayoutIdRef.current,
          location_x: finalPos.x,
          location_y: finalPos.y,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'บันทึกไม่สำเร็จ');

      if (drag.type === 'pc') {
        setPcDevices((prev) => prev.map((p) => (p.hostname === drag.hostname ? { ...p, location_x: finalPos.x, location_y: finalPos.y } : p)));
      } else if (drag.type === 'mo') {
        setMoDevices((prev) => prev.map((p) => (p.hostname === drag.hostname ? { ...p, location_x: finalPos.x, location_y: finalPos.y } : p)));
      } else {
        setAllPrinters((prev) => prev.map((p) => (p.PrinterId === drag.printerId ? { ...p, location_x: finalPos.x, location_y: finalPos.y } : p)));
      }
      showToast(`✓ บันทึกตำแหน่ง ${drag.hostname} แล้ว`);
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    } finally {
      setSavingKey(null);
      setDragPos(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkerMouseDown = useCallback((e, device) => {
    if (e.button !== 0) return; // เฉพาะคลิกซ้ายเท่านั้น
    if (!isAdminRef.current) {
      // ไม่ใช่ staff — ดูได้อย่างเดียว ไม่ให้ลาก คลิกแล้วเปิด detail ตรงๆ เลย
      openDeviceDetail(device);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = {
      key: device.key,
      type: device.type,
      hostname: device.hostname,
      printerId: device.printerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: device.x,
      startY: device.y,
      moved: false,
    };
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── เปิดโมดัลรายละเอียด — ดึงข้อมูลจริงจาก endpoint inventory เดิม ──────
  const openDeviceDetail = async (device) => {
    if (device.type === 'printer') {
      // printer ไม่มี inventory — ข้อมูลอยู่ใน device.printer (dbo.Printers) แล้ว
      setModalDevice(device);
      setModalData({ inv: null, users: [] });
      setModalLoading(false);
      return;
    }
    setModalDevice(device);
    setModalLoading(true);
    setModalData({ inv: null, users: [] });
    try {
      const invBase = device.type === 'pc' ? 'pc-inventory' : 'mo-inventory';
      const usersBase = device.type === 'pc' ? 'pc-active-users' : 'mo-active-users';
      const [invRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/${invBase}/${encodeURIComponent(device.hostname)}`).then((r) => r.json()).catch(() => ({ success: false })),
        fetch(`${API_BASE}/${usersBase}/${encodeURIComponent(device.hostname)}`).then((r) => r.json()).catch(() => ({ success: false })),
      ]);
      setModalData({
        inv: invRes.success ? invRes.data : null,
        users: usersRes.success ? usersRes.data || [] : [],
      });
    } catch (err) {
      console.error('Error loading device detail:', err);
    } finally {
      setModalLoading(false);
    }
  };

  const goToFullDetail = () => {
    if (!modalDevice) return;
    navigate('/pc-inventory', { state: { openHostname: modalDevice.hostname, openType: modalDevice.type } });
  };

  const [movingLayout, setMovingLayout] = useState(false);

  const moveToLayout = async (newLayoutId) => {
    if (!isAdmin) return; // กันเบื้องต้นฝั่ง frontend — endpoint จริงควรเช็ค role เองด้วย
    if (!modalDevice || !newLayoutId) return;
    setMovingLayout(true);
    try {
      const res = await fetch(placementApiPath(modalDevice), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factory_layout_id: Number(newLayoutId),
          location_x: 50,
          location_y: 50,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'ย้ายไม่สำเร็จ');

      // เอาเครื่องนี้ออกจาก list ของ layout เดิม (มันไม่ได้อยู่ที่นี่แล้ว)
      if (modalDevice.type === 'pc') {
        setPcDevices((prev) => prev.filter((p) => p.hostname !== modalDevice.hostname));
      } else if (modalDevice.type === 'mo') {
        setMoDevices((prev) => prev.filter((p) => p.hostname !== modalDevice.hostname));
      } else {
        // printer: ยังอยู่ใน dbo.Printers แค่เปลี่ยนแผนผัง — อัปเดต state ให้ filter ตามแผนผังใหม่เอง
        setAllPrinters((prev) =>
          prev.map((p) => (p.PrinterId === modalDevice.printerId ? { ...p, factory_layout_id: Number(newLayoutId), location_x: 50, location_y: 50 } : p))
        );
      }

      showToast(`✓ ย้าย ${modalDevice.hostname} ไปยัง "${layouts.find((l) => l.id === Number(newLayoutId))?.name}" แล้ว`);
      closeModal();
      // สลับไปดู layout ปลายทางทันที จะได้เห็น + ลากปรับตำแหน่งต่อได้เลย
      setSelectedLayoutId(Number(newLayoutId));
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    } finally {
      setMovingLayout(false);
    }
  };

  const closeModal = () => {
    setModalDevice(null);
    setModalData({ inv: null, users: [] });
  };

  // dropdown ย้ายไปแผนผังอื่น (ใช้ร่วมกันทั้ง PC/Monitor และ Printer)
  // printer ที่ยังไม่ได้วาง ไม่มีแผนผังปัจจุบัน จึงแสดงทุกแผนผังให้เลือก
  const currentLayoutIdOfModal = modalDevice?.type === 'printer' ? modalDevice.layoutId : selectedLayoutId;
  const layoutMover =
    isAdmin && layouts.length > 1 ? (
      <div className="border-t border-slate-100 px-3 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">ย้ายไปแผนผังอื่น</div>
        <select
          value=""
          disabled={movingLayout}
          onChange={(e) => {
            if (e.target.value) moveToLayout(e.target.value);
          }}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">{movingLayout ? 'กำลังย้าย...' : '-- เลือกแผนผังปลายทาง --'}</option>
          {layouts
            .filter((l) => l.id !== currentLayoutIdOfModal)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
        <p className="text-[11px] text-slate-400 mt-1.5">เลือกแล้วจะย้ายไปวางกลางแผนผังใหม่ ค่อยลากปรับตำแหน่งต่อได้</p>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 flex items-center gap-2.5">
            <LayoutGrid className="text-indigo-500" size={28} />
            PC LAYOUT
          </h2>
          <p className="text-slate-500 font-medium">
            {isAdmin ? 'ลากจุดเพื่อย้ายตำแหน่ง · คลิกจุดเพื่อดูรายละเอียดเครื่อง' : 'คลิกจุดเพื่อดูรายละเอียดเครื่อง'}
          </p>
        </div>
        <button
          onClick={openGlobalSearch}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all bg-white border border-slate-200 text-slate-600 hover:border-indigo-500 hover:text-indigo-600 shadow-sm hover:shadow active:scale-95"
        >
          <Search size={16} /> ค้นหาเครื่อง
        </button>
      </div>

      {/* ── เลือก Layout — ตัวหนังสือล้วน ไม่มีรูป ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">เลือกแผนผัง</div>
        {layoutsLoading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
            <Loader2 size={16} className="animate-spin" /> กำลังโหลด...
          </div>
        ) : layouts.length === 0 ? (
          <div className="text-sm text-slate-400 py-2">ยังไม่มีแผนผังในระบบ</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {layouts.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedLayoutId(l.id)}
                className={`px-4 py-2 rounded-xl text-[13px] font-bold border transition-all ${
                  l.id === selectedLayoutId
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Filter + Search ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {[
          { key: 'all', label: 'ทั้งหมด', icon: LayoutGrid, count: counts.all, activeCls: 'bg-slate-800 text-white border-slate-800' },
          { key: 'pc', label: 'PC', icon: Laptop2, count: counts.pc, activeCls: 'bg-blue-600 text-white border-blue-600' },
          { key: 'mo', label: 'Monitor', icon: Monitor, count: counts.mo, activeCls: 'bg-violet-600 text-white border-violet-600' },
          { key: 'printer', label: 'Printer', icon: Printer, count: counts.printer, activeCls: 'bg-emerald-600 text-white border-emerald-600' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
              typeFilter === f.key ? f.activeCls : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            <f.icon size={14} /> {f.label} <span className="opacity-70">({f.count})</span>
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหา hostname, fix asset, user..."
          className="flex-1 min-w-[200px] bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-[13px] outline-none shadow-sm focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* ── Map — โชว์รูปแผนผังจริง พร้อมจุดที่ลาก/คลิกได้ ── */}
      <div
        ref={(el) => {
          containerRef.current = el;
          mapContainerWrapRef.current = el;
        }}
        className="relative bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden shadow-sm select-none"
      >
        {selectedLayout?.image_url && (
          <img
            src={`${API_URL}${selectedLayout.image_url.startsWith('/') ? '' : '/'}${selectedLayout.image_url}`}
            alt={selectedLayout.name}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(false)}
            className="w-full h-auto block"
            draggable={false}
          />
        )}

        {!selectedLayout ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <MapPin size={36} className="mb-2" />
            <p className="text-sm">เลือกแผนผังก่อนเพื่อดูตำแหน่งเครื่อง</p>
          </div>
        ) : !selectedLayout.image_url ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <p className="text-sm">แผนผังนี้ไม่มีรูปภาพ</p>
          </div>
        ) : !imageLoaded ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-100">
            <Loader2 size={20} className="animate-spin" />
            <p className="text-sm">กำลังโหลดแผนผัง...</p>
          </div>
        ) : devicesLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 bg-white/60">
            <Loader2 size={20} className="animate-spin" />
            <p className="text-sm">กำลังโหลดเครื่อง...</p>
          </div>
        ) : (
          imageLoaded &&
          filteredDevices.map((d) => {
            const pos = dragPos && dragPos.key === d.key ? dragPos : d;
            const isDragging = dragPos?.key === d.key;
            const isSaving = savingKey === d.key;
            const isHighlighted = highlightKey === d.key;
            return (
              <button
                key={d.key}
                onMouseDown={(e) => handleMarkerMouseDown(e, d)}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group ${
                  isDragging
                    ? 'cursor-grabbing z-20'
                    : isHighlighted
                    ? 'z-30'
                    : isAdmin
                    ? 'cursor-grab z-10 hover:z-20'
                    : 'cursor-pointer z-10 hover:z-20'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  {isHighlighted && (
                    <span
                      className={`absolute inline-flex h-full w-full rounded-full animate-ping opacity-75 ${TYPE_TONE[d.type].ping}`}
                    />
                  )}
                  <div
                    className={`relative w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] shadow-md border border-white transition-transform ${
                      TYPE_TONE[d.type].dot
                    } ${isDragging || isHighlighted ? 'scale-125' : 'group-hover:scale-110'}`}
                  >
                    {isSaving ? <Loader2 size={7} className="animate-spin text-white" /> : d.icon}
                  </div>
                </div>
                <div className="mt-0.5 flex flex-col items-center gap-0.5">
                  <div
                    className={`px-1 py-0.5 rounded text-[8px] font-semibold whitespace-nowrap shadow-sm ${
                      isHighlighted ? 'bg-amber-300 text-slate-900' : `bg-white/90 ${TYPE_TONE[d.type].label}`
                    }`}
                  >
                    {d.hostname}
                  </div>
                  {d.type === 'printer' && d.ip && (
                    <div className={`px-1 py-0.5 rounded text-[8px] font-medium whitespace-nowrap shadow-sm bg-white/80 ${TYPE_TONE[d.type].text}`}>
                      {d.ip}
                    </div>
                  )}
                  {d.user && (
                    <div className="px-1 py-0.5 rounded text-[8px] font-semibold whitespace-nowrap shadow-sm bg-white/80 text-red-500">
                      {d.user}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-slate-400 px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> PC
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-600 inline-block" /> Monitor
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Printer
        </span>
        <span>{isAdmin ? 'ลากจุดเพื่อย้ายตำแหน่ง (บันทึกอัตโนมัติ) · คลิกเฉยๆ เพื่อดูรายละเอียด' : 'คลิกจุดเพื่อดูรายละเอียดเครื่อง'}</span>
      </div>

      {/* ── รายการเครื่อง ── */}
      {filteredDevices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">เครื่องในแผนผังนี้ ({filteredDevices.length})</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {filteredDevices.map((d) => (
              <button
                key={d.key}
                onClick={() => openDeviceDetail(d)}
                className="text-left px-3 py-2.5 rounded-xl border bg-white border-slate-200 hover:border-slate-300 transition-all"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{d.icon}</span>
                  <span className="text-[12px] font-bold text-slate-800 truncate">{d.hostname}</span>
                </div>
                <div className={`text-[11px] truncate ${TYPE_TONE[d.type].text}`}>{d.user || (d.type === 'printer' ? d.ip : 'No User') || '—'}</div>
                {d.fixAsset && <div className="text-[11px] text-slate-400 font-mono truncate">{d.fixAsset}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── printer ที่ยังไม่ได้วางบนแผนผัง — กดเพื่อเลือกแผนผังในโมดัล ── */}
      {unplacedPrinters.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Printer ยังไม่ได้วางตำแหน่ง ({unplacedPrinters.length})
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {unplacedPrinters.map((p) => (
              <button
                key={p.PrinterId}
                onClick={() => openDeviceDetail(toPrinterDevice(p))}
                className="text-left px-3 py-2.5 rounded-xl border border-dashed bg-white border-emerald-300 hover:border-emerald-500 transition-all"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">🖨️</span>
                  <span className="text-[12px] font-bold text-slate-800 truncate">{p.Name}</span>
                </div>
                <div className="text-[11px] text-emerald-600 truncate">{p.IpAddress || 'ไม่ระบุ IP'}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── โมดัลรายละเอียดเครื่อง ── */}
      {modalDevice && (
        <Portal>
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div
              className={`p-4 text-white relative overflow-hidden rounded-t-2xl ${
                modalDevice.type === 'pc'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600'
                  : modalDevice.type === 'printer'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                  : 'bg-gradient-to-r from-violet-600 to-purple-600'
              }`}
            >
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1 opacity-90 text-xs font-bold uppercase tracking-wider">
                    {modalDevice.type === 'pc' ? <Laptop2 size={14} /> : modalDevice.type === 'printer' ? <Printer size={14} /> : <Monitor size={14} />}
                    {TYPE_TONE[modalDevice.type].name}
                  </div>
                  <h3 className="font-black text-lg tracking-tight">{modalDevice.hostname}</h3>
                </div>
                <button onClick={closeModal} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            {modalDevice.type === 'printer' ? (
              <div>
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  <InfoRow label="IP Address" value={modalDevice.printer?.IpAddress} />
                  <InfoRow label="Model" value={modalDevice.printer?.Model} />
                  <InfoRow label="สถานที่" value={modalDevice.printer?.Location} />
                  <InfoRow label="โรงงาน" value={modalDevice.printer?.Factory} />
                </div>
                {layoutMover}
              </div>
            ) : modalLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 size={22} className="animate-spin" />
                กำลังโหลดข้อมูล...
              </div>
            ) : !modalData.inv ? (
              <div className="p-6 text-center text-slate-400 text-sm">ไม่พบข้อมูล inventory สำหรับเครื่องนี้</div>
            ) : (
              <div>
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  <InfoRow label="Manufacturer" value={modalData.inv.manufacturer} />
                  <InfoRow label="Model" value={modalData.inv.model} />
                  <InfoRow label="Serial" value={modalData.inv.serial_number} />
                  <InfoRow label="IP Address" value={modalData.inv.ip_address} />
                  <InfoRow label="Fix Asset" value={modalData.inv.fix_asset} />
                  {modalDevice.type === 'pc' && (
                    <>
                      <InfoRow label="OS" value={`${modalData.inv.os_name || ''} ${modalData.inv.os_release || ''}`.trim()} />
                      <InfoRow label="RAM" value={modalData.inv.ram_gb ? `${modalData.inv.ram_gb} GB` : null} />
                      <InfoRow label="BitLocker" value={modalData.inv.bitlocker} />
                    </>
                  )}
                  <InfoRow label="Last Updated" value={modalData.inv.updated_at ? new Date(modalData.inv.updated_at).toLocaleString('th-TH') : null} />
                </div>

                {modalData.users.length > 0 && (
                  <div className="border-t border-slate-100">
                    <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Active Sessions</div>
                    <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                      {modalData.users.map((u, i) => (
                        <span key={i} className="text-[11px] font-medium bg-slate-100 text-slate-700 rounded-full px-2.5 py-1">
                          {u.username}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {layoutMover}
              </div>
            )}

            <div className="flex gap-2.5 px-4 py-3 border-t border-slate-100">
              <button
                onClick={closeModal}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-sm py-2.5 rounded-xl transition-colors"
              >
                ปิด
              </button>
              {modalDevice.type !== 'printer' && (
                <button
                  onClick={goToFullDetail}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
                >
                  ดูรายละเอียดทั้งหมด
                </button>
              )}
            </div>
          </div>
        </div>
        </Portal>
      )}

      {globalSearchOpen && (
        <GlobalSearchModal
          devices={globalDevices}
          loading={globalDevicesLoading}
          onSelect={jumpToDevice}
          onClose={() => setGlobalSearchOpen(false)}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-bold text-white z-50 ${
            toast.tone === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default PCControlPage;