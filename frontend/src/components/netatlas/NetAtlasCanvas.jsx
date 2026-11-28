// NetAtlas — canvas ผังจุดติดตั้ง: รูปแปลน, หมุดอุปกรณ์ (ลากได้), เส้น uplink และป้ายพอร์ต
// ไม่มีการเลื่อน (scroll) — ผังย่อให้พอดีพื้นที่เสมอ ตำแหน่งหมุดคิดเป็น % ของรูปจึงตรงกับรูปเสมอ
import React, { useMemo, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import Portal from '../Portal';
import { styleOf, findType, parentEnd, childEnd, childrenOf, floorplanSrc, portName } from './netAtlasConfig';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

const NetAtlasCanvas = ({
    devices, allDevices, types, floorplanUrl, selectedId, showLines, canEdit,
    onSelect, onMoveLive, onMoveEnd, onEdit,
    pickMode = false, pickableIds = null, onPick, layoutRatio = null, showNames = false,
}) => {
    // สัดส่วนของกรอบผัง: ใช้ขนาด px ของผังถ้ากำหนดไว้ ไม่งั้นใช้สัดส่วนของรูป
    const [imgRatio, setImgRatio] = useState(16 / 9);
    const ratio = layoutRatio || imgRatio;
    const [imgFailed, setImgFailed] = useState(false);
    const [fitScreen, setFitScreen] = useState(false); // false = เต็มความกว้างการ์ด (เหมือนหน้า Devices Layout)
    const [dragId, setDragId] = useState(null);
    const dragRef = useRef(null);
    const movedRef = useRef(false);
    const [hoverId, setHoverId] = useState(null); // อุปกรณ์ที่กำลังชี้เมาส์ (แสดงการ์ดรูป + ข้อมูล)
    const wrapRef = useRef(null);

    const hasImage = !!floorplanUrl && !imgFailed;
    const byId = useMemo(() => new Map(allDevices.map((d) => [d.id, d])), [allDevices]);
    const visibleIds = useMemo(() => new Set(devices.map((d) => d.id)), [devices]);

    // เส้น uplink แสดงเฉพาะเมื่อทั้งสองปลายอยู่ในรายการที่กรองแล้ว
    const links = useMemo(() => {
        if (!showLines) return [];
        return devices
            .filter((c) => c.uplinkDeviceId != null && visibleIds.has(c.uplinkDeviceId) && byId.has(c.uplinkDeviceId))
            .map((c) => ({ child: c, parent: byId.get(c.uplinkDeviceId) }));
    }, [devices, showLines, visibleIds, byId]);

    const onPointerDown = (e, d) => {
        // โหมดเลือกต้นทาง: คลิกได้เฉพาะหมุดที่เป็นต้นทางที่ใช้ได้ ไม่เลือก/ไม่ลาก
        if (pickMode) {
            if (pickableIds?.has(d.id)) onPick?.(d.id);
            return;
        }
        // เลือก (เปิดรายละเอียด) เกิดตอนคลิก ไม่ใช่ตอนกดค้างเพื่อลาก
        if (!canEdit) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { id: d.id, pointerId: e.pointerId, moved: false, x: d.x, y: d.y };
        setDragId(d.id);
    };

    const onPointerMove = (e) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId || !wrapRef.current) return;
        const rect = wrapRef.current.getBoundingClientRect();
        const x = round1(clamp(((e.clientX - rect.left) / rect.width) * 100, 4, 96));
        const y = round1(clamp(((e.clientY - rect.top) / rect.height) * 100, 6, 92));
        if (x === drag.x && y === drag.y) return;
        drag.moved = true;
        drag.x = x;
        drag.y = y;
        onMoveLive(drag.id, x, y);
    };

    const endDrag = (e) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragRef.current = null;
        setDragId(null);
        if (drag.moved) {
            movedRef.current = true; // ไม่ให้ click ตามหลังการลากเปิดรายละเอียด
            onMoveEnd(drag.id, drag.x, drag.y);
        }
    };

    const onKeyDown = (e, d) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(d.id); }
        if (e.key === 'Enter' && e.shiftKey && canEdit) onEdit(d.id);
    };

    return (
        <div className="flex flex-col gap-2 min-w-0">
            <button type="button" onClick={() => setFitScreen((v) => !v)} aria-pressed={fitScreen}
                className="self-end inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                {fitScreen ? 'เต็มความกว้าง' : 'พอดีจอ'}
            </button>
            {/* กรอบผัง: ปกติเต็มความกว้างการ์ด · โหมดพอดีจอ จำกัดความสูงไม่เกิน 68% ของหน้าจอ (ไม่มี scroll) */}
            <div
                ref={wrapRef}
                className="relative select-none touch-none bg-white border border-slate-200 rounded-xl overflow-hidden"
                style={{
                    width: fitScreen ? `min(100%, calc(68vh * ${ratio}))` : '100%',
                    aspectRatio: `${ratio}`,
                    backgroundImage: hasImage ? 'none' : 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                }}
            >
                {hasImage ? (
                    <img
                        src={floorplanUrl}
                        alt="รูปแปลนผัง"
                        draggable={false}
                        onLoad={(e) => { if (e.currentTarget.naturalHeight) setImgRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight); }}
                        onError={() => setImgFailed(true)}
                        className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-slate-400 pointer-events-none p-4">
                        <ImageOff className="w-8 h-8 mb-2" />
                        <p className="text-sm font-semibold text-slate-500">ยังไม่มีรูปแปลนสำหรับผังนี้</p>
                        <p className="text-xs mt-1">ผู้ดูแลอัปโหลดรูปได้ที่เมนู Management → ผังเครือข่าย (NetAtlas)</p>
                    </div>
                )}

                {/* เส้น uplink (SVG ใช้พิกัด 0-100 ตรงกับหมุด) */}
                {links.length > 0 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        {links.map(({ child, parent }) => {
                            const hot = selectedId === child.id || selectedId === parent.id;
                            return (
                                <line key={`l-${child.id}`} x1={parent.x} y1={parent.y} x2={child.x} y2={child.y}
                                    vectorEffect="non-scaling-stroke"
                                    stroke={hot ? '#0ea5e9' : 'rgba(99,102,241,0.55)'}
                                    strokeWidth={hot ? 2.5 : 1.6}
                                    strokeDasharray="6 5" />
                            );
                        })}
                    </svg>
                )}

                {/* ป้ายบนเส้น (HTML เพื่อไม่ให้ตัวอักษรบิดตามสัดส่วนผัง) */}
                {/* ป้ายพอร์ตทั้งสองปลาย: ใกล้ parent = พอร์ตฝั่ง parent, ใกล้อุปกรณ์ลูก = พอร์ตฝั่งลูก */}
                {links.flatMap(({ child, parent }) => {
                    const hot = selectedId === child.id || selectedId === parent.id;
                    const cls = `whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[10px] shadow-sm ${hot ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600'}`;
                    const ends = [
                        { t: 0.2, text: parentEnd(child, parent) || portName(parent, child.parentPortNo), key: 'pe' },
                        { t: 0.8, text: childEnd(child), key: 'ce' },
                    ];
                    return ends.filter((e) => e.text).map((e) => (
                        <div key={`${e.key}-${child.id}`} className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 z-10"
                            style={{ left: `${parent.x + (child.x - parent.x) * e.t}%`, top: `${parent.y + (child.y - parent.y) * e.t}%` }}>
                            <span className={cls}>{e.text}</span>
                        </div>
                    ));
                })}

                {/* การ์ดชี้เมาส์: รูป + ข้อมูล (เหมือนหน้า CCTV) */}
                {(() => {
                    const h = hoverId != null && !dragId && !pickMode ? devices.find((x) => x.id === hoverId) : null;
                    if (!h) return null;
                    const hs = styleOf(findType(types, h.type), h.type);
                    const used = hs.hasPorts ? childrenOf(allDevices, h.id).length : null;
                    const right = h.x > 55;
                    // การ์ดวาดนอกกรอบผัง (Portal + fixed) เพื่อไม่ให้ถูกตัดด้วย overflow-hidden ของกรอบ
                    const fr = wrapRef.current?.getBoundingClientRect();
                    if (!fr) return null;
                    const px = fr.left + (h.x / 100) * fr.width;
                    const py = fr.top + (h.y / 100) * fr.height;
                    return (
                        <Portal>
                        <div className="pointer-events-none fixed z-[60] w-96 max-w-[80vw] rounded-xl overflow-hidden bg-slate-900/95 text-white shadow-2xl border border-white/10"
                            style={{ left: `${px}px`, top: `${py}px`, transform: right ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)' }}>
                            {(h.photoUrl || h.sitePhotoUrl) ? (
                                <div className="grid grid-cols-2 gap-px bg-slate-800">
                                    {[[h.photoUrl, 'รูปอุปกรณ์'], [h.sitePhotoUrl, 'รูปหน้างาน']].map(([u, t]) => (
                                        u ? <img key={t} src={floorplanSrc(u)} alt={t} title={t} className="w-full h-48 object-cover" />
                                            : <div key={t} className="w-full h-48 flex items-center justify-center text-xs text-slate-500">ไม่มี{t}</div>
                                    ))}
                                </div>
                            ) : <div className="w-full h-24 flex items-center justify-center text-xs text-slate-400 bg-slate-800">ไม่มีรูป</div>}
                            <div className="px-4 py-3 space-y-1.5">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${hs.dot}`} />
                                    <span className="text-sm font-bold truncate">{h.name}</span>
                                    <span className="ml-auto text-xs text-slate-300 shrink-0">{hs.short}</span>
                                </div>
                                <div className="text-xs text-slate-300 font-mono truncate">{h.ip || 'N/A'}</div>
                                {h.macAddress && <div className="text-xs text-slate-400 font-mono truncate">MAC {h.macAddress}</div>}
                                {h.fixAsset && <div className="text-xs text-slate-400 font-mono truncate">Fix Asset {h.fixAsset}</div>}
                                {h.source?.user && <div className="text-xs text-slate-300 truncate">ผู้ใช้: {h.source.user}</div>}
                                {h.location && <div className="text-xs text-slate-400 truncate">{h.location}</div>}
                                <div className="text-xs text-slate-400">
                                    {h.source?.adapter && <span className="mr-2">{h.source.adapter}</span>}
                                    {used != null && <span>พอร์ต {used}/{h.portCount}</span>}
                                </div>
                            </div>
                        </div>
                        </Portal>
                    );
                })()}

                {/* หมุดอุปกรณ์ */}
                {devices.map((d) => {
                    const meta = styleOf(findType(types, d.type), d.type);
                    const Icon = meta.Icon;
                    const portsUsed = meta.hasPorts ? childrenOf(allDevices, d.id).length : null;
                    const selected = selectedId === d.id;
                    const dragging = dragId === d.id;
                    const pickable = pickMode && pickableIds?.has(d.id);
                    const cursor = pickMode
                        ? (pickable ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed')
                        : (canEdit ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer');
                    return (
                        <div key={d.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`${d.name} ${meta.label} ${d.location || ''}`}
                            aria-pressed={selected}
                            title={`${d.name}\nIP: ${d.ip || 'N/A'}\n${d.location || ''}`}
                            onPointerEnter={() => setHoverId(d.id)}
                            onPointerLeave={() => setHoverId((cur) => (cur === d.id ? null : cur))}
                            onPointerDown={(e) => onPointerDown(e, d)}
                            onPointerMove={onPointerMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onClick={() => {
                                if (movedRef.current) { movedRef.current = false; return; }
                                if (!pickMode) onSelect(d.id);
                            }}
                            onDoubleClick={() => canEdit && !pickMode && onEdit(d.id)}
                            onKeyDown={(e) => onKeyDown(e, d)}
                            className={`group absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center focus:outline-none hover:z-40 ${cursor} ${dragging ? 'z-30' : selected ? 'z-20' : 'z-10'}`}
                            style={{ left: `${d.x}%`, top: `${d.y}%` }}
                        >
                            <div className={`relative flex items-center justify-center ${dragging ? 'scale-110' : 'hover:scale-110'} transition-transform`}>
                                {selected && <span className={`absolute w-8 h-8 rounded-full ${meta.dot} opacity-30 animate-ping`} />}
                                {pickable && <span className="absolute w-9 h-9 rounded-full border-2 border-emerald-500 animate-pulse" />}
                                <div className={`w-7 h-7 rounded-full ${meta.dot} border-2 ${selected ? 'border-sky-400 ring-2 ring-sky-200' : 'border-white'} shadow-md flex items-center justify-center text-white`}>
                                    <Icon className="w-3.5 h-3.5" />
                                </div>
                            </div>
                            <div className={`${showNames || selected ? '' : 'hidden group-hover:block'} mt-0.5 whitespace-nowrap rounded-full border px-1.5 py-px text-[9px] leading-tight font-semibold shadow-sm ${selected ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                                {d.name}{portsUsed != null && <span className="ml-1 font-normal text-slate-400">· {portsUsed}/{d.portCount}</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default NetAtlasCanvas;
