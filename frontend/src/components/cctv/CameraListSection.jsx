import { useState, useEffect } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import { useCanAct } from '../../context/PermissionContext';
import { STATUS_COLOR } from './cctvCanvasUtils';

// ── CameraListSection — แยก component เพื่อให้ search/listSearch state
// ไม่อยู่ใน CCTVPage และไม่ทำให้ CCTVPage re-render เมื่อพิมพ์ค้นหา ──────────
// ตัวเรียงลำดับของตารางกล้อง
export const STATUS_RANK = { online: 0, offline: 1, removed: 2, retired: 3 };
const CAM_SORTERS = {
    name: (a, b) => (a.name || '').localeCompare(b.name || '', 'th', { numeric: true }),
    ip: (a, b) => (a.ip_address || '').localeCompare(b.ip_address || '', undefined, { numeric: true }),
    status: (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
    loc: (a, b) => (a.location_x === null ? 0 : 1) - (b.location_x === null ? 0 : 1),
};

// หัวคอลัมน์ที่กดเพื่อเรียงได้ → คีย์การเรียงใน CAM_SORTERS
const SORT_BY_COL = { name: 'name', status: 'status', loc: 'loc' };

export const CameraListSection = ({ cameras, currentName, listLocFilter, setListLocFilter,
    listPage, setListPage, selectedCam, setSelectedCam, setDetailModal,
    setLocationModal, setCamModal, fullUrl, selectedLayout, onJumpToCamera, onPingMany, allCameras = [], rackInfo = {} }) => {
    const canCreateCctv = useCanAct('cctv', 'create');
    const canEditCctv = useCanAct('cctv', 'edit');
    const canDeleteCctv = useCanAct('cctv', 'delete');

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortKey, setSortKey] = useState('name');
    const [picked, setPicked] = useState(() => new Set()); // กล้องที่เลือกไว้สำหรับ bulk action
    const [openMenuId, setOpenMenuId] = useState(null);     // เมนู ⋯ ที่เปิดอยู่ (id กล้อง)
    const togglePick = (id) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const ITEMS = 20;

    // reset search เมื่อ layout เปลี่ยน
    useEffect(() => { setSearch(''); setStatusFilter('all'); setPicked(new Set()); setListPage(1); }, [selectedLayout]);

    const noLoc = cameras.filter(c => c.location_x === null || c.location_y === null);
    const byLoc = listLocFilter === 'no-location' ? noLoc
        : listLocFilter === 'has-location' ? cameras.filter(c => c.location_x !== null)
            : cameras;
    const searchedRows = search.trim()
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
    // กรองตามสถานะ แล้วเรียงลำดับ — ผลนี้ใช้ทั้งตาราง การ์ด และการแบ่งหน้า
    const statusCounts = byLoc.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {});
    const displayed = [...(statusFilter === 'all' ? searchedRows : searchedRows.filter(c => c.status === statusFilter))]
        .sort(CAM_SORTERS[sortKey] || CAM_SORTERS.name);

    const totalPages = Math.max(1, Math.ceil(displayed.length / ITEMS));
    const paginated = displayed.slice((listPage - 1) * ITEMS, listPage * ITEMS);

    // คอลัมน์ที่ซ่อนได้ — ซ่อนเมื่อทั้งรายการที่กรองแล้วไม่มีข้อมูลนั้นเลย
    const hasRack = displayed.some(c => c.rack_name || c.switch_name);
    const hasFix = displayed.some(c => c.fix_asset);
    const hasServer = displayed.some(c => c.record_server_name);
    const COLS = [
        { key: 'icon', label: '', w: 4 },
        { key: 'name', label: 'ชื่อ / IP', w: 18 },
        { key: 'model', label: 'Model', w: 11 },
        { key: 'rack', label: 'Rack / Switch', w: 13, show: hasRack },
        { key: 'fix', label: 'Fix Asset', w: 10, show: hasFix },
        { key: 'status', label: 'Status', w: 9 },
        { key: 'factory', label: 'Factory', w: 11 },
        { key: 'server', label: 'Server Record', w: 10, show: hasServer },
        { key: 'loc', label: 'ตำแหน่ง', w: 9 },
        { key: 'act', label: '', w: 6 },
    ].filter(c => c.show !== false);
    const totalW = COLS.reduce((s, c) => s + c.w, 0) || 1;
    const emptyText = listLocFilter === 'no-location' && statusFilter === 'all' && !search.trim() ? '🎉 กล้องทุกตัวมีตำแหน่งแล้ว!'
        : (search.trim() || statusFilter !== 'all') ? '🔍 ไม่พบกล้องที่ตรงกับตัวกรอง'
            : 'ยังไม่มีกล้องใน Factory นี้';

    // ส่งออกรายการที่กำลังแสดงอยู่ (หลังกรอง/ค้นหา/เรียง) เป็น CSV — มี BOM ให้ Excel อ่านภาษาไทยได้
    const exportCsv = (rows0 = displayed) => {
        const header = ['ชื่อ', 'IP', 'Model', 'Fix Asset', 'สถานะ', 'โรง', 'Rack', 'Switch', 'Record Server', 'มีตำแหน่ง', 'Ping ล่าสุด'];
        const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = rows0.map(c => [
            c.name, c.ip_address, c.model, c.fix_asset, c.status, c.layout_name, c.rack_name, c.switch_name,
            c.record_server_name, c.location_x != null ? 'ใช่' : 'ไม่', c.last_ping ? new Date(c.last_ping).toLocaleString('th-TH') : '',
        ].map(esc).join(','));
        const csv = '﻿' + [header.map(esc).join(','), ...rows].join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `cctv-cameras-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const camIcon = (cam, size) => (
        <div className={`${size} rounded-md flex items-center justify-center overflow-hidden flex-shrink-0`}
            style={{ background: `${STATUS_COLOR[cam.status]}22` }}>
            {cam.icon_url ? <img src={fullUrl(cam.icon_url)} className="w-full h-full object-cover" /> : <span className="text-sm">📹</span>}
        </div>
    );

    const statusPill = (cam) => (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${cam.status === 'online' ? 'bg-green-100 text-green-700' :
            cam.status === 'offline' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[cam.status] }} />
            {cam.status}
        </span>
    );

    const locBadge = (hasLoc) => hasLoc
        ? <span className="inline-flex items-center gap-1 text-[11px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full"><MapPin size={9} /> มีแล้ว</span>
        : <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium"><MapPin size={9} /> ยังไม่มี</span>;

    // ปุ่ม "⋯" เปิดเมนูรวม แทนการมีปุ่มหลายตัวในทุกแถว
    const actionButtons = (cam, hasLoc, vertical) => {
        const open = openMenuId === cam.id;
        const item = (label, onPick) => (
            <button key={label} onClick={() => { setOpenMenuId(null); onPick(); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700">{label}</button>
        );
        return (
            <div className={`relative flex ${vertical ? 'justify-center' : 'justify-end'}`} onClick={e => e.stopPropagation()}>
                <button onClick={() => setOpenMenuId(open ? null : cam.id)} aria-label="เมนูกล้อง" aria-expanded={open}
                    className="px-2 py-1 rounded-lg hover:bg-gray-100 text-gray-500 text-base leading-none">⋯</button>
                {open && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-0 top-full mt-1 z-40 w-44 bg-white rounded-xl border border-gray-200 shadow-xl py-1 text-xs">
                            {item('🎯 ไปที่แผนที่', () => onJumpToCamera(cam))}
                            {setLocationModal && item(`📍 ตำแหน่ง / FOV${hasLoc ? '' : ' (ยังไม่มี)'}`, () => setLocationModal(cam))}
                            {canEditCctv && item('✏️ แก้ไข', () => setCamModal({ mode: 'edit', data: cam }))}
                        </div>
                    </>
                )}
            </div>
        );
    };

    // เรนเดอร์ 1 ช่องของตาราง ตาม key ของคอลัมน์
    const cellFor = (key, cam, hasLoc, isSel) => {
        switch (key) {
            case 'icon':
                return (
                    <td key={key} className="px-3 py-2">
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={picked.has(cam.id)} onChange={() => togglePick(cam.id)}
                                aria-label={`เลือก ${cam.name}`} className="rounded border-gray-300" />
                            {camIcon(cam, 'w-7 h-7')}
                        </div>
                    </td>
                );
            case 'name':
                return (
                    <td key={key} className="px-3 py-2">
                        <div className={`font-medium truncate text-xs ${isSel ? 'text-amber-700' : 'text-gray-900'}`}>{cam.name}</div>
                        <div className="text-[11px] text-gray-400">{cam.ip_address || '—'}</div>
                    </td>
                );
            case 'model':
                return <td key={key} className="px-3 py-2 text-gray-600 text-xs truncate">{cam.model || '—'}</td>;
            case 'rack':
                return (
                    <td key={key} className="px-3 py-2">
                        {cam.rack_name && (
                            <div className="text-xs font-medium text-purple-700 truncate">
                                {cam.rack_name}
                                {rackInfo[cam.rack_id] && rackInfo[cam.rack_id].factory_layout_id !== cam.factory_layout_id && (
                                    <span className="ml-1 text-amber-600" title={`อยู่ที่ ${rackInfo[cam.rack_id].layout_name || "โรงอื่น"}`}>↗ {rackInfo[cam.rack_id].layout_name || "โรงอื่น"}</span>
                                )}
                            </div>
                        )}
                        {cam.switch_name && <div className="text-[11px] text-gray-400 truncate">{cam.switch_name}</div>}
                        {!cam.rack_name && !cam.switch_name && <span className="text-xs text-gray-300">—</span>}
                    </td>
                );
            case 'fix':
                return <td key={key} className="px-3 py-2 text-gray-600 text-xs truncate">{cam.fix_asset || '—'}</td>;
            case 'status':
                return <td key={key} className="px-3 py-2">{statusPill(cam)}</td>;
            case 'factory':
                return <td key={key} className="px-3 py-2 text-gray-600 text-xs whitespace-normal leading-tight">{cam.layout_name || '—'}</td>;
            case 'server':
                return (
                    <td key={key} className="px-3 py-2 text-xs">
                        {cam.record_server_name
                            ? <span className="text-teal-700 font-medium truncate block">{cam.record_server_name}</span>
                            : <span className="text-gray-300">—</span>}
                    </td>
                );
            case 'loc':
                return <td key={key} className="px-3 py-2">{locBadge(hasLoc)}</td>;
            case 'act':
                return <td key={key} className="px-3 py-2">{actionButtons(cam, hasLoc, false)}</td>;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600">รายการกล้องทั้งหมด — {currentName}</span>
                    <button onClick={() => exportCsv()} disabled={!displayed.length}
                        className="flex items-center gap-1 px-2.5 py-1 border border-gray-200 bg-white text-gray-600 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-40">
                        ⬇️ Export CSV ({displayed.length})
                    </button>
                    <button onClick={() => exportCsv(allCameras)} disabled={!allCameras.length}
                        title="ส่งออกกล้องทุกโรงเป็นไฟล์เดียว"
                        className="flex items-center gap-1 px-2.5 py-1 border border-blue-200 bg-blue-50 text-blue-700 text-xs rounded-lg hover:bg-blue-100 disabled:opacity-40">
                        ⬇️ Export ทั้งระบบ ({allCameras.length})
                    </button>
                    {canCreateCctv && <button onClick={() => setCamModal({ mode: 'add' })}
                        className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                        <Plus size={11} /> เพิ่มกล้อง
                    </button>}
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
                    <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setListPage(1); }}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none focus:border-blue-400">
                        <option value="all">สถานะ: ทั้งหมด</option>
                        <option value="online">Online ({statusCounts.online || 0})</option>
                        <option value="offline">Offline ({statusCounts.offline || 0})</option>
                        <option value="removed">ถอดออก ({statusCounts.removed || 0})</option>
                        <option value="retired">เลิกใช้ ({statusCounts.retired || 0})</option>
                    </select>
                    <select value={sortKey} onChange={e => { setSortKey(e.target.value); setListPage(1); }}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none focus:border-blue-400">
                        <option value="name">เรียง: ชื่อ</option>
                        <option value="ip">เรียง: IP</option>
                        <option value="status">เรียง: สถานะ</option>
                        <option value="loc">เรียง: ยังไม่มีตำแหน่งก่อน</option>
                    </select>
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

                {/* ── แถบ bulk action (แสดงเมื่อมีการเลือกกล้อง) ── */}
                {picked.size > 0 && (
                    <div className="flex items-center gap-2 flex-wrap px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs">
                        <span className="font-semibold text-blue-700">เลือกแล้ว {picked.size} ตัว</span>
                        <button onClick={() => onPingMany(displayed.filter(c => picked.has(c.id)))} disabled={!onPingMany}
                            className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 disabled:opacity-40">
                            🔄 Ping ที่เลือก
                        </button>
                        <button onClick={() => exportCsv(displayed.filter(c => picked.has(c.id)))}
                            className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-100">
                            ⬇️ Export ที่เลือก
                        </button>
                        <button onClick={() => setPicked(new Set())} className="ml-auto text-gray-500 hover:text-gray-700">ล้างการเลือก</button>
                    </div>
                )}

                {/* ── Desktop/Tablet: ตาราง (คอลัมน์ที่ว่างทั้งรายการจะถูกซ่อน) ── */}
                <div className="hidden md:block overflow-auto max-h-[560px]">
                    <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                            {COLS.map(c => <col key={c.key} style={{ width: `${(c.w / totalW) * 100}%` }} />)}
                        </colgroup>
                        <thead>
                            <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium bg-gray-50">
                                {COLS.map(c => {
                                    const sortable = SORT_BY_COL[c.key];
                                    const active = sortable && sortKey === sortable;
                                    return (
                                        <th key={c.key} className="px-3 py-2 text-left whitespace-nowrap sticky top-0 z-10 bg-gray-50">
                                            {sortable ? (
                                                <button onClick={() => { setSortKey(sortable); setListPage(1); }}
                                                    className={`hover:text-gray-700 ${active ? 'text-blue-600 font-semibold' : ''}`}>
                                                    {c.label}{active ? ' ▲' : ''}
                                                </button>
                                            ) : c.label}
                                        </th>
                                    );
                                })}
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
                                        {COLS.map(c => cellFor(c.key, cam, hasLoc, isSel))}
                                    </tr>
                                );
                            })}
                            {!paginated.length && (
                                <tr><td colSpan={COLS.length} className="text-center py-8 text-gray-400 text-sm">{emptyText}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ── Mobile: การ์ดแทนตาราง ── */}
                <div className="md:hidden divide-y divide-gray-100">
                    {paginated.map(cam => {
                        const hasLoc = cam.location_x !== null && cam.location_y !== null;
                        const isSel = selectedCam === cam.id;
                        return (
                            <div key={cam.id}
                                onClick={() => onJumpToCamera(cam)}
                                className={`flex gap-3 px-3 py-3 cursor-pointer active:bg-gray-50 ${isSel ? 'bg-amber-50' : !hasLoc ? 'bg-amber-50/30' : ''}`}>
                                <input type="checkbox" checked={picked.has(cam.id)} onChange={() => togglePick(cam.id)}
                                    onClick={e => e.stopPropagation()} aria-label={`เลือก ${cam.name}`}
                                    className="mt-3 rounded border-gray-300 flex-shrink-0" />
                                {camIcon(cam, 'w-9 h-9')}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={`font-medium text-sm truncate ${isSel ? 'text-amber-700' : 'text-gray-900'}`}>{cam.name}</span>
                                        {statusPill(cam)}
                                    </div>
                                    <div className="text-[11px] text-gray-400 truncate">{cam.ip_address || '—'} · {cam.model || '—'}</div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
                                        {cam.layout_name && <span className="text-gray-500 truncate max-w-full">{cam.layout_name}</span>}
                                        {cam.rack_name && <span className="text-purple-700 font-medium truncate max-w-full">▣ {cam.rack_name}</span>}
                                        {cam.record_server_name && <span className="text-teal-700 truncate max-w-full">🖥 {cam.record_server_name}</span>}
                                        {locBadge(hasLoc)}
                                    </div>
                                </div>
                                {actionButtons(cam, hasLoc, true)}
                            </div>
                        );
                    })}
                    {!paginated.length && <div className="text-center py-8 text-gray-400 text-sm">{emptyText}</div>}
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
