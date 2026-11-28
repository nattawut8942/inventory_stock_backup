// NetAtlas — ผังเครือข่ายและอุปกรณ์ (หน้าหลัก)
// - ประเภทอุปกรณ์มาจาก master (จัดการที่ Management) — ปุ่มเพิ่มอุปกรณ์ให้เลือกประเภทจาก master ก่อน
// - เลือกผัง (จัดการผังที่ Management) → วาง/ลาก/แก้ไข/ลบอุปกรณ์ และเสียบพอร์ตของ switch/hub
// - ทุกการเขียนข้อมูลผ่าน API ที่ตรวจสิทธิ์ฝั่ง server; หน้านี้ซ่อนปุ่มตามสิทธิ์เพื่อความสะดวกเท่านั้น
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Network, Settings2, Loader2, AlertTriangle, CheckCircle2, X, Map as MapIcon, List, Eye, EyeOff, MousePointerClick, Tags, Route } from 'lucide-react';
import { useCan, useCanAct } from '../context/PermissionContext';
import Portal from '../components/Portal';
import NetAtlasCanvas from '../components/netatlas/NetAtlasCanvas';
import DeviceDetailPanel from '../components/netatlas/DeviceDetailPanel';
import DeviceFormModal from '../components/netatlas/DeviceFormModal';
import DeviceTable from '../components/netatlas/DeviceTable';
import {
    styleOf, BTN_PRIMARY, BTN_SECONDARY, BTN_DANGER, INPUT,
    apiCall, matchesSearch, floorplanSrc, descendantIds,
} from '../components/netatlas/netAtlasConfig';

const LAST_LAYOUT_KEY = 'netatlas_last_layout'; // จำผังที่เปิดล่าสุดของเครื่องนี้ (ค่าความสะดวกของผู้ใช้ ไม่ใช่ข้อมูลสำคัญ)

const StatCard = ({ label, value, unit, tone }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
        <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-black text-slate-800 mt-0.5 tabular-nums">{value} <span className={`text-xs font-semibold ${tone}`}>{unit}</span></p>
        </div>
    </div>
);

const Skeleton = ({ className = '' }) => <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;

const NetAtlasPage = () => {
    const canView = useCan('netatlas', 'view');
    const canCreate = useCanAct('netatlas', 'create');
    const canEdit = useCanAct('netatlas', 'edit');
    const canDelete = useCanAct('netatlas', 'delete');
    const canManageLayouts = useCan('mgmt-netatlas-layouts', 'view');
    const canManageTypes = useCan('mgmt-netatlas-device-types', 'view');

    const [types, setTypes] = useState([]);
    const [layouts, setLayouts] = useState([]);
    const [layoutId, setLayoutId] = useState(() => {
        try { return Number(localStorage.getItem(LAST_LAYOUT_KEY)) || null; } catch { return null; }
    });
    const [devices, setDevices] = useState([]);
    const [loadingLayouts, setLoadingLayouts] = useState(true);
    const [loadingDevices, setLoadingDevices] = useState(false);
    const [pageError, setPageError] = useState('');

    const [tab, setTab] = useState('map'); // map | list
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [showLines, setShowLines] = useState(true);
    const [showNames, setShowNames] = useState(false); // แสดงชื่อทุกเครื่อง (ปกติแสดงเมื่อชี้เมาส์หรือเลือก)
    const [selectedId, setSelectedId] = useState(null);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [presetType, setPresetType] = useState(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState(null);
    const [pickMode, setPickMode] = useState(false); // โหมดคลิกเลือกต้นทางจากผัง
    const [pickedParent, setPickedParent] = useState(null); // { id, nonce } ค่าที่คลิกเลือกล่าสุด

    const notify = useCallback((message, type = 'success') => {
        setToast({ message, type, id: Date.now() });
    }, []);

    useEffect(() => {
        if (!toast) return undefined;
        const t = setTimeout(() => setToast(null), 3500);
        return () => clearTimeout(t);
    }, [toast]);

    // ── ประเภทอุปกรณ์จาก master ──
    const loadTypes = useCallback(async () => {
        const res = await apiCall('/device-types');
        if (res.ok) setTypes(res.data);
        else setPageError(res.error);
    }, []);

    // ประเภทที่เลือกได้ตอนเพิ่มอุปกรณ์ = เปิดใช้งานอยู่เท่านั้น
    const activeTypes = useMemo(() => types.filter((t) => t.isActive), [types]);
    // ตัวกรอง: ประเภทที่เปิดใช้งาน หรือมีอุปกรณ์ใช้อยู่ (เพื่อไม่ให้อุปกรณ์เดิมหายจากการกรอง)
    const filterTypes = useMemo(
        () => types.filter((t) => t.isActive || devices.some((d) => d.type === t.code)),
        [types, devices],
    );

    // ── โหลดรายการผัง ──
    const loadLayouts = useCallback(async () => {
        setLoadingLayouts(true);
        const res = await apiCall('/layouts');
        setLoadingLayouts(false);
        if (!res.ok) { setPageError(res.error); return; }
        setPageError('');
        setLayouts(res.data);
        setLayoutId((cur) => (res.data.some((l) => l.id === cur) ? cur : (res.data[0]?.id ?? null)));
    }, []);

    // ── โหลดอุปกรณ์ของผังที่เลือก ──
    const loadDevices = useCallback(async (id) => {
        if (id == null) { setDevices([]); return; }
        setLoadingDevices(true);
        const res = await apiCall(`/devices?layoutId=${id}`);
        setLoadingDevices(false);
        if (!res.ok) { setPageError(res.error); return; }
        setPageError('');
        setDevices(res.data);
    }, []);

    useEffect(() => {
        if (!canView) { setLoadingLayouts(false); return; }
        loadTypes();
        loadLayouts();
    }, [canView, loadTypes, loadLayouts]);

    useEffect(() => {
        if (layoutId == null) return;
        try { localStorage.setItem(LAST_LAYOUT_KEY, String(layoutId)); } catch { /* ไม่มี storage ก็ใช้งานได้ */ }
        setSelectedId(null);
        loadDevices(layoutId);
    }, [layoutId, loadDevices]);

    // ถ้าตัวกรองที่เลือกหายไปแล้ว ให้กลับไป "ทั้งหมด"
    useEffect(() => {
        if (typeFilter !== 'ALL' && !filterTypes.some((t) => t.code === typeFilter)) setTypeFilter('ALL');
    }, [filterTypes, typeFilter]);

    const currentLayout = layouts.find((l) => l.id === layoutId) || null;
    const selected = devices.find((d) => d.id === selectedId) || null;

    const visible = useMemo(
        () => devices.filter((d) => (typeFilter === 'ALL' || d.type === typeFilter) && matchesSearch(d, search.trim())),
        [devices, typeFilter, search],
    );

    const countByType = useMemo(() => {
        const m = new Map();
        for (const d of devices) m.set(d.type, (m.get(d.type) || 0) + 1);
        return m;
    }, [devices]);

    // ── ลากหมุด: อัปเดตในหน้าทันที แล้วค่อยบันทึกตอนปล่อยเมาส์ ──
    const moveLive = useCallback((id, x, y) => {
        setDevices((list) => list.map((d) => (d.id === id ? { ...d, x, y } : d)));
    }, []);

    const moveEnd = useCallback(async (id, x, y) => {
        const res = await apiCall(`/devices/${id}/position`, { method: 'PATCH', body: JSON.stringify({ x, y }) });
        if (!res.ok) {
            notify(`บันทึกตำแหน่งไม่สำเร็จ: ${res.error}`, 'error');
            loadDevices(layoutId); // ย้อนกลับเป็นค่าจริงจากเซิร์ฟเวอร์
        }
    }, [layoutId, loadDevices, notify]);

    const locate = (id) => { setSelectedId(id); setTab('map'); };

    // ต้นทางที่คลิกเลือกได้จากผัง: ประเภทที่เป็นต้นทางได้ ไม่ใช่ตัวที่กำลังแก้ และไม่ใช่ลูกหลานของตัวนั้น
    const parentCandidateIds = useMemo(() => {
        const blocked = editing ? descendantIds(devices, editing.id) : new Set();
        const ids = new Set();
        for (const d of devices) {
            if (d.id === editing?.id || blocked.has(d.id)) continue;
            if (types.find((t) => t.code === d.type)?.canBeParent) ids.add(d.id);
        }
        return ids;
    }, [devices, editing, types]);

    const startPick = () => {
        setTab('map');
        setTypeFilter('ALL');
        setSearch('');
        setSelectedId(null);
        setPickMode(true);
    };
    const onPickParent = (id) => {
        setPickMode(false);
        setPickedParent({ id, nonce: Date.now() });
    };

    // Esc ยกเลิกโหมดเลือกจากผัง (กลับไปที่ฟอร์ม)
    useEffect(() => {
        if (!pickMode) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setPickMode(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [pickMode]);

    // ปุ่มเพิ่มอุปกรณ์: เลือกประเภทจาก master ก่อน
    const openCreate = () => {
        if (activeTypes.length === 0) { notify('ยังไม่มีประเภทอุปกรณ์ที่เปิดใช้งาน — เพิ่มได้ที่ Management → ประเภทอุปกรณ์ (NetAtlas)', 'error'); return; }
        setPickerOpen(true);
    };
    const pickType = (code) => { setPickerOpen(false); setEditing(null); setPresetType(code); setFormOpen(true); };
    const openEdit = (d) => { setSelectedId(null); setEditing(d); setPresetType(null); setFormOpen(true); };

    // รายละเอียดอุปกรณ์แสดงเป็น modal: Esc หรือคลิกพื้นหลังเพื่อปิด
    useEffect(() => {
        if (!selectedId) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setSelectedId(null); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [selectedId]);

    const onSaved = async (saved, mode) => {
        setFormOpen(false);
        notify(mode === 'created' ? `เพิ่ม "${saved.name}" บนผังแล้ว` : `บันทึกการแก้ไข "${saved.name}" แล้ว`);
        setSelectedId(saved.id);
        // ย้ายไปผังอื่น: เปิดผังปลายทางให้เห็นเครื่องที่ย้ายไป
        if (saved.layoutId !== layoutId) { setLayoutId(saved.layoutId); return; }
        await loadDevices(layoutId);
    };

    const doDelete = async () => {
        if (!confirmDelete) return;
        setDeleting(true);
        const res = await apiCall(`/devices/${confirmDelete.id}`, { method: 'DELETE' });
        setDeleting(false);
        if (!res.ok) { notify(`ลบไม่สำเร็จ: ${res.error}`, 'error'); return; }
        const cleared = res.body?.clearedChildren || 0;
        notify(cleared > 0
            ? `ลบ "${confirmDelete.name}" แล้ว และปลดการเชื่อมต่อของอุปกรณ์ลูก ${cleared} รายการ`
            : `ลบ "${confirmDelete.name}" แล้ว`);
        if (selectedId === confirmDelete.id) setSelectedId(null);
        setConfirmDelete(null);
        loadDevices(layoutId);
    };

    const childCountOf = (d) => devices.filter((x) => x.uplinkDeviceId === d.id).length;

    // ตัวเลือกผัง + ลิงก์จัดการ (ใช้ที่หัวการ์ดผัง)
    const layoutPicker = (
        <div className="flex flex-wrap items-center gap-2 min-w-0">
            <label htmlFor="netatlas-layout" className="text-xs font-semibold text-slate-500 shrink-0">ผัง</label>
            {loadingLayouts ? (
                <Skeleton className="h-9 w-56" />
            ) : (
                <select id="netatlas-layout" className={`${INPUT} w-auto min-w-[14rem] max-w-full`} value={layoutId ?? ''}
                    onChange={(e) => setLayoutId(Number(e.target.value))} disabled={layouts.length === 0}>
                    {layouts.length === 0 && <option value="">— ยังไม่มีผัง —</option>}
                    {layouts.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.deviceCount ?? 0})</option>)}
                </select>
            )}
            {canManageLayouts && (
                <Link to="/management?tab=netatlas-layouts" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline shrink-0">
                    <Settings2 className="w-3.5 h-3.5" /> จัดการผัง
                </Link>
            )}
            {canManageTypes && (
                <Link to="/management?tab=netatlas-device-types" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline shrink-0">
                    <Settings2 className="w-3.5 h-3.5" /> ประเภทอุปกรณ์
                </Link>
            )}
        </div>
    );

    // ── สถานะพิเศษของหน้า ──
    if (!canView && !loadingLayouts) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h2 className="text-xl font-black text-slate-700 mb-1">ไม่มีสิทธิ์เข้าหน้านี้</h2>
                <p className="text-slate-500 text-sm">กรุณาติดต่อ Admin เพื่อขอสิทธิ์ NetAtlas</p>
            </div>
        );
    }

    return (
        <div className="space-y-5 min-w-0">
            {/* หัวหน้า */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                        <Network className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-2xl sm:text-3xl font-black text-slate-800 truncate">NetAtlas</h2>
                        <p className="text-xs text-slate-500">ผังเครือข่ายและอุปกรณ์ตามประเภทที่กำหนดไว้</p>
                    </div>
                </div>
            </div>

            {pageError && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span className="flex-1">{pageError}</span>
                    <button type="button" onClick={() => { setPageError(''); loadTypes(); loadLayouts(); }} className="font-bold underline underline-offset-2">ลองใหม่</button>
                </div>
            )}

            {/* ตัวเลขสรุป — แสดงเมื่อมีอุปกรณ์ในผัง */}
            {devices.length > 0 && (
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard label="อุปกรณ์ทั้งหมด" value={devices.length} unit="รายการ" tone="text-slate-400" />
                    {filterTypes.slice(0, 3).map((t) => {
                        const s = styleOf(t, t.code);
                        return <StatCard key={t.code} label={s.label} value={countByType.get(t.code) || 0} unit={s.short} tone={s.text} />;
                    })}
                </section>
            )}

            {/* แถบควบคุม 2 แถว: มุมมอง + ตัวแสดงผลบนผัง / ตัวกรอง + ค้นหา + เพิ่มอุปกรณ์ */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div role="tablist" aria-label="มุมมอง" className="inline-flex p-1 rounded-xl bg-slate-100">
                        {[{ id: 'map', label: 'ผังจุดติดตั้ง', Icon: MapIcon }, { id: 'list', label: 'รายการอุปกรณ์', Icon: List }].map(({ id, label, Icon }) => (
                            <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${tab === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <Icon className="w-3.5 h-3.5" /> {label}
                            </button>
                        ))}
                    </div>
                    {tab === 'map' && (
                        <div role="group" aria-label="ตัวแสดงผลบนผัง" className="inline-flex p-1 rounded-xl bg-slate-100">
                            <button type="button" onClick={() => setShowNames((v) => !v)} aria-pressed={showNames} title="แสดงชื่ออุปกรณ์ทุกเครื่อง"
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${showNames ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <Tags className="w-3.5 h-3.5" /> ชื่อ
                            </button>
                            <button type="button" onClick={() => setShowLines((v) => !v)} aria-pressed={showLines} title="แสดงเส้นเชื่อมระหว่างอุปกรณ์"
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${showLines ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <Route className="w-3.5 h-3.5" /> เส้นเชื่อม
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="กรองตามประเภท">
                        {[{ code: 'ALL', label: 'ทั้งหมด' }, ...filterTypes.map((t) => ({ code: t.code, label: styleOf(t, t.code).label }))].map(({ code, label }) => {
                            const active = typeFilter === code;
                            return (
                                <button key={code} type="button" onClick={() => setTypeFilter(code)} aria-pressed={active}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-0">
                        <div className="relative flex-1 sm:w-64">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                                placeholder="ค้นหาชื่อ, รุ่น, IP, จุดติดตั้ง, หมายเหตุพอร์ต" aria-label="ค้นหาอุปกรณ์"
                                className={`${INPUT} pl-9`} />
                            {search && (
                                <button type="button" onClick={() => setSearch('')} aria-label="ล้างการค้นหา" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        {canCreate && (
                            <button type="button" onClick={openCreate} disabled={!currentLayout} className={`${BTN_PRIMARY} !py-2 whitespace-nowrap shrink-0`}>
                                <Plus className="w-4 h-4" /> เพิ่มอุปกรณ์
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* เนื้อหาหลัก */}
            {layouts.length === 0 && !loadingLayouts ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-16 px-6 text-center">
                    <Network className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <h3 className="font-bold text-slate-700">ยังไม่มีผังเครือข่าย</h3>
                    <p className="text-sm text-slate-500 mt-1 mb-4">ผู้ดูแลต้องสร้างผัง (ชั้น/ห้อง) ก่อน จึงจะเพิ่มอุปกรณ์ได้</p>
                    {canManageLayouts && (
                        <Link to="/management?tab=netatlas-layouts" className={BTN_PRIMARY}><Settings2 className="w-4 h-4" /> ไปที่จัดการผัง</Link>
                    )}
                </div>
            ) : loadingDevices && devices.length === 0 ? (
                <div className="grid gap-4 lg:grid-cols-[1fr_300px]"><Skeleton className="h-[420px]" /><Skeleton className="h-[300px]" /></div>
            ) : tab === 'map' ? (
                <div className="grid gap-4 min-w-0">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 min-w-0 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-3 flex-wrap min-w-0">
                                {layoutPicker}
                                {currentLayout?.width && currentLayout?.height && <span className="text-[11px] font-mono text-slate-400">{currentLayout.width}×{currentLayout.height} px</span>}
                            </div>
                            <span className="text-[11px] text-slate-500">
                                {canEdit ? 'ลากหมุดเพื่อย้ายตำแหน่ง · ดับเบิลคลิกเพื่อแก้ไข' : 'ดูอย่างเดียว (ไม่มีสิทธิ์แก้ไข)'}
                                {visible.length !== devices.length && ` · แสดง ${visible.length} จาก ${devices.length}`}
                            </span>
                        </div>
                        {pickMode && (
                            <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                <MousePointerClick className="w-4 h-4 shrink-0" />
                                <span className="flex-1 min-w-0">คลิกหมุด Switch / Hub ที่ไฮไลต์เพื่อเป็นต้นทาง (กด Esc หรือปุ่มยกเลิกเพื่อกลับไปที่ฟอร์ม)</span>
                                <button type="button" onClick={() => setPickMode(false)} className="font-bold underline underline-offset-2">ยกเลิก</button>
                            </div>
                        )}
                        <NetAtlasCanvas
                            pickMode={pickMode}
                            pickableIds={parentCandidateIds}
                            onPick={onPickParent}
                            devices={visible}
                            allDevices={devices}
                            types={types}
                            floorplanUrl={floorplanSrc(currentLayout?.floorplanUrl)}
                            layoutRatio={currentLayout?.width && currentLayout?.height ? currentLayout.width / currentLayout.height : null}
                            showNames={showNames}
                            selectedId={selectedId}
                            showLines={showLines}
                            canEdit={canEdit}
                            onSelect={setSelectedId}
                            onMoveLive={moveLive}
                            onMoveEnd={moveEnd}
                            onEdit={(id) => { const d = devices.find((x) => x.id === id); if (d) openEdit(d); }}
                        />
                        {devices.length === 0 && !loadingDevices && (
                            <div className="flex flex-col items-center gap-2 py-2 text-center">
                                <p className="text-sm text-slate-500">ยังไม่มีอุปกรณ์ในผังนี้</p>
                                {canCreate && <button type="button" onClick={openCreate} disabled={!currentLayout} className={BTN_PRIMARY}><Plus className="w-4 h-4" /> เพิ่มอุปกรณ์แรก</button>}
                            </div>
                        )}
                        {/* legend จาก master */}
                        <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 pt-1">
                            {filterTypes.map((t) => (
                                <span key={t.code} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${styleOf(t, t.code).dot}`} />{styleOf(t, t.code).label}</span>
                            ))}
                        </div>
                    </div>

                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">{layoutPicker}</div>
                        <span className="text-[11px] text-slate-500">{visible.length} รายการ</span>
                    </div>
                    {devices.length === 0 && (
                        <div className="p-8 text-center space-y-3">
                            <p className="text-sm text-slate-500">ยังไม่มีอุปกรณ์ในผังนี้</p>
                            {canCreate && <button type="button" onClick={openCreate} disabled={!currentLayout} className={BTN_PRIMARY}><Plus className="w-4 h-4" /> เพิ่มอุปกรณ์แรก</button>}
                        </div>
                    )}
                    <DeviceTable
                        devices={visible}
                        allDevices={devices}
                        types={types}
                        selectedId={selectedId}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        onSelect={setSelectedId}
                        onLocate={locate}
                        onEdit={openEdit}
                        onDelete={(d) => setConfirmDelete(d)}
                    />
                </div>
            )}

            {/* เลือกประเภทก่อนเพิ่มอุปกรณ์ */}
            {selected && !formOpen && (
                <Portal>
                    <div className="fixed inset-0 z-[9980] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                        onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
                        <div className="w-full max-w-3xl max-h-[90vh]">
                            <DeviceDetailPanel
                                device={selected}
                                devices={devices}
                                types={types}
                                canEdit={canEdit}
                                canDelete={canDelete}
                                onClose={() => setSelectedId(null)}
                                onEdit={openEdit}
                                onDelete={(d) => setConfirmDelete(d)}
                                onSelect={setSelectedId}
                                onDeviceUpdated={(u) => setDevices((list) => list.map((d) => (d.id === u.id ? u : d)))}
                            />
                        </div>
                    </div>
                </Portal>
            )}

            {pickerOpen && (
                <Portal>
                    <div className="fixed inset-0 z-[9990] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                        onMouseDown={(e) => { if (e.target === e.currentTarget) setPickerOpen(false); }}>
                        <div role="dialog" aria-modal="true" aria-labelledby="netatlas-picker-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 id="netatlas-picker-title" className="font-black text-slate-800">เลือกประเภทอุปกรณ์</h3>
                                <button type="button" onClick={() => setPickerOpen(false)} aria-label="ปิด" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {activeTypes.map((t) => {
                                    const s = styleOf(t, t.code);
                                    const Icon = s.Icon;
                                    return (
                                        <button key={t.code} type="button" onClick={() => pickType(t.code)}
                                            className={`text-left rounded-xl border ${s.border} ${s.soft} p-3 hover:shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}>
                                            <div className={`w-9 h-9 rounded-lg bg-white ${s.text} flex items-center justify-center mb-2`}><Icon className="w-4 h-4" /></div>
                                            <div className="text-sm font-bold text-slate-800">{s.label}</div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">{s.hasPorts ? 'มีพอร์ตให้เสียบอุปกรณ์' : 'ไม่มีพอร์ต'}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </Portal>
            )}

            {formOpen && (
                <DeviceFormModal
                    open={formOpen}
                    device={editing}
                    layoutId={layoutId}
                    layoutName={currentLayout?.name}
                    allDevices={devices}
                    types={types}
                    presetType={presetType}
                    layouts={layouts}
                    hidden={pickMode}
                    onStartPick={startPick}
                    pickedParent={pickedParent}
                    onClose={() => setFormOpen(false)}
                    onSaved={onSaved}
                />
            )}

            {confirmDelete && (
                <Portal>
                    <div className="fixed inset-0 z-[9990] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                        onMouseDown={(e) => { if (e.target === e.currentTarget && !deleting) setConfirmDelete(null); }}>
                        <div role="alertdialog" aria-modal="true" aria-labelledby="netatlas-del-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5" /></div>
                                <div>
                                    <h3 id="netatlas-del-title" className="font-black text-slate-800">ลบอุปกรณ์นี้?</h3>
                                    <p className="text-sm text-slate-600 mt-1">"{confirmDelete.name}" จะถูกลบออกจากผัง</p>
                                    {childCountOf(confirmDelete) > 0 && (
                                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                                            อุปกรณ์ต่อพ่วงจากตัวนี้ {childCountOf(confirmDelete)} รายการ จะถูกปลดการเชื่อมต่อ (ยังอยู่บนผัง)
                                        </p>
                                    )}
                                    <p className="text-[11px] text-slate-400 mt-2">การลบนี้จะถูกบันทึกในประวัติการทำงาน</p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting} className={BTN_SECONDARY}>ยกเลิก</button>
                                <button type="button" onClick={doDelete} disabled={deleting} className={BTN_DANGER}>
                                    {deleting && <Loader2 className="w-4 h-4 animate-spin" />} ลบอุปกรณ์
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}

            {toast && (
                <Portal>
                    <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[9995]">
                        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-bold text-white ${toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                            {toast.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            {toast.message}
                        </div>
                    </div>
                </Portal>
            )}
        </div>
    );
};

export default NetAtlasPage;
