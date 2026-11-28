// NetAtlas — แผงรายละเอียดอุปกรณ์: เส้นทาง uplink, ผังพอร์ต (ถ้าประเภทมีพอร์ต) และอุปกรณ์ลูก
import React, { useEffect, useMemo, useState } from 'react';
import { X, Pencil, Trash2, ArrowUpRight, MapPin, Globe, Box, StickyNote } from 'lucide-react';
import Portal from '../Portal';
import { styleOf, findType, uplinkChain, childrenOf, linkLabel, floorplanSrc, portName, apiCall, BTN_SECONDARY, BTN_DANGER, BTN_PRIMARY, INPUT } from './netAtlasConfig';

const Row = ({ icon: Icon, children }) => (
    <div className="flex items-start gap-2 text-xs text-slate-600">
        <Icon className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
        <span className="min-w-0 break-words">{children}</span>
    </div>
);

const DeviceDetailPanel = ({ device, devices, types, canEdit, canDelete, onClose, onEdit, onDelete, onSelect, onDeviceUpdated }) => {
    const style = styleOf(findType(types, device.type), device.type);
    const Icon = style.Icon;

    const chain = useMemo(() => uplinkChain(devices, device.id), [devices, device.id]);
    const children = useMemo(() => childrenOf(devices, device.id), [devices, device.id]);

    // ผังพอร์ต: พอร์ต n → อุปกรณ์ที่เสียบอยู่ (ถ้ามี)
    const byPort = useMemo(() => {
        const m = new Map();
        for (const c of children) if (c.parentPortNo != null) m.set(c.parentPortNo, c);
        return m;
    }, [children]);
    const portCount = device.portCount || 0;

    // หมายเหตุรายพอร์ต (ใส่ได้โดยไม่ต้องมีอุปกรณ์เสียบ)
    const remarkOf = useMemo(() => new Map((device.portRemarks || []).map((x) => [x.portNo, x.remark])), [device.portRemarks]);
    const [selPort, setSelPort] = useState(null);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    useEffect(() => { setSelPort(null); setErr(''); }, [device.id]);

    const selectPort = (p) => {
        const next = selPort === p ? null : p;
        setSelPort(next);
        setDraft(next != null ? (remarkOf.get(next) || '') : '');
        setErr('');
    };
    const selChild = selPort != null ? byPort.get(selPort) : null;

    const savePortRemark = async () => {
        setSaving(true);
        setErr('');
        const res = await apiCall(`/devices/${device.id}/ports/${selPort}/remark`, { method: 'PUT', body: JSON.stringify({ remark: draft.trim() }) });
        setSaving(false);
        if (!res.ok) { setErr(res.error); return; }
        onDeviceUpdated?.(res.data);
    };

    // ดูรูปขนาดใหญ่เป็น modal (คลิกพื้นหลัง หรือกด Esc เพื่อปิด)
    const [zoom, setZoom] = useState(null);
    useEffect(() => {
        if (!zoom) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setZoom(null); } };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [zoom]);

    return (
        <>
        <aside aria-label="รายละเอียดอุปกรณ์" className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-w-0">
            <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-xl ${style.soft} ${style.text} border ${style.border} flex items-center justify-center shrink-0`}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${style.soft} ${style.text}`}>{style.label}</span>
                        <h3 className="text-sm font-black text-slate-800 truncate">{device.name}</h3>
                    </div>
                </div>
                <button type="button" onClick={onClose} aria-label="ปิดรายละเอียด"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto" style={{ maxHeight: 'min(720px, 80vh)' }}>
              <div className="space-y-4 min-w-0">
                {(device.photoUrl || device.sitePhotoUrl) && (
                    <div className="grid grid-cols-2 gap-2">
                        {[[device.photoUrl, 'รูปอุปกรณ์'], [device.sitePhotoUrl, 'รูปหน้างาน']].map(([u, t]) => (
                            u ? <button key={t} type="button" onClick={() => setZoom({ src: floorplanSrc(u), alt: t })} title={`${t} (คลิกดูขนาดใหญ่)`} className="block rounded-xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                                    <img src={floorplanSrc(u)} alt={t} className="w-full h-28 object-cover bg-slate-100 hover:opacity-90 transition" />
                                </button>
                                : <div key={t} className="w-full h-28 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[11px] text-slate-400">ไม่มี{t}</div>
                        ))}
                    </div>
                )}
                <div className="space-y-2">
                    <Row icon={MapPin}>{device.location || '-'}</Row>
                    <Row icon={Globe}><span className="font-mono">{device.ip || 'N/A'}</span></Row>
                    <Row icon={Box}>{device.model || '-'}</Row>
                    <Row icon={Globe}><span className="font-mono">MAC {device.macAddress || '-'}</span></Row>
                    <Row icon={Box}><span className="font-mono">Fix Asset {device.fixAsset || '-'}</span></Row>
                    {device.note && <Row icon={StickyNote}>{device.note}</Row>}
                </div>

                {/* เส้นทาง uplink ขึ้นไปหา Core */}
                <section>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">เส้นทาง Uplink</h4>
                    <ol className="space-y-1.5">
                        {chain.map((n, i) => {
                            const isSelf = n.id === device.id;
                            const label = i < chain.length - 1 ? linkLabel(n, chain[i + 1]) : '';
                            return (
                                <li key={n.id} className="flex items-center gap-2 text-xs">
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isSelf ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                                    <button type="button" onClick={() => onSelect(n.id)} disabled={isSelf}
                                        className={`truncate text-left ${isSelf ? 'font-bold text-slate-800 cursor-default' : 'text-indigo-600 hover:underline'}`}>
                                        {n.name}
                                    </button>
                                    {label && <span className="ml-auto font-mono text-[10px] text-slate-400 shrink-0">{label}</span>}
                                </li>
                            );
                        })}
                    </ol>
                    {chain.length === 1 && <p className="text-[11px] text-slate-400 mt-1">อุปกรณ์นี้เป็นต้นทาง (Core) ไม่มี parent</p>}
                </section>

              </div>
              <div className="space-y-4 min-w-0">
                {/* ผังพอร์ต — แสดงเฉพาะประเภทที่มีพอร์ต และแสดงเท่าจำนวนพอร์ตที่ตั้งไว้เท่านั้น */}
                {style.hasPorts && portCount > 0 && (
                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">พอร์ต</h4>
                            <span className="text-[11px] text-slate-500 tabular-nums">ใช้ {byPort.size + (device.ownPortNo != null ? 1 : 0)} / {portCount}</span>
                        </div>
                        <div className="grid grid-cols-6 gap-1.5">
                            {Array.from({ length: portCount }, (_, i) => i + 1).map((p) => {
                                const c = byPort.get(p);
                                const isOwn = !c && device.ownPortNo === p;
                                const remark = remarkOf.get(p);
                                const isSel = selPort === p;
                                const tone = isOwn ? 'bg-amber-400 text-white font-bold'
                                    : c ? 'bg-sky-500 text-white font-bold hover:bg-sky-600'
                                    : 'border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50';
                                const title = `${portName(device, p)}${c ? `: ${c.name}` : isOwn ? `: พอร์ตที่ใช้เชื่อมขึ้นไปหา ${chain[1]?.name || 'parent'}` : ': ว่าง'}${remark ? ` — ${remark}` : ''}`;
                                return (
                                    <button key={p} type="button" onClick={() => selectPort(p)} aria-pressed={isSel} title={title}
                                        className={`relative h-9 rounded-md text-[11px] flex flex-col items-center justify-center leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${tone} ${isSel ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}>
                                        <span>{p}</span>
                                        {c && <span className="text-[8px] font-normal truncate max-w-full px-0.5 opacity-90">{c.name}</span>}
                                        {isOwn && <span className="text-[8px] font-normal">uplink</span>}
                                        {remark && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500" />}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5">กดช่องเพื่อดู/ใส่หมายเหตุ · ช่องสีฟ้ามีอุปกรณ์เสียบอยู่ · จุดแดงมุมขวา = มีหมายเหตุ</p>

                        {selPort != null && (
                            <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="font-mono font-bold text-slate-700">{portName(device, selPort)}</span>
                                    {selChild && (
                                        <button type="button" onClick={() => onSelect(selChild.id)} className="inline-flex items-center gap-1 text-indigo-600 hover:underline min-w-0">
                                            <span className="truncate">{selChild.name}</span> <ArrowUpRight className="w-3 h-3 shrink-0" />
                                        </button>
                                    )}
                                </div>
                                <label htmlFor="port-remark" className="block text-[11px] font-semibold text-slate-500">หมายเหตุพอร์ต</label>
                                <div className="flex gap-2">
                                    <input id="port-remark" className={`${INPUT} flex-1 min-w-0`} value={draft} onChange={(e) => setDraft(e.target.value)}
                                        maxLength={200} disabled={!canEdit || saving} placeholder="เช่น ต่อ CCTV ชั้น 2, สำรองไว้, พอร์ตเสีย" />
                                    {canEdit && (
                                        <button type="button" onClick={savePortRemark} disabled={saving || draft.trim() === (remarkOf.get(selPort) || '')}
                                            className={`${BTN_PRIMARY} !py-2 shrink-0`}>
                                            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
                                        </button>
                                    )}
                                </div>
                                {err && <p className="text-[11px] text-rose-600">{err}</p>}
                                <p className="text-[10px] text-slate-400">ถ้าเว้นว่างแล้วบันทึก หมายเหตุของพอร์ตนี้จะถูกลบ</p>
                            </div>
                        )}
                    </section>
                )}

                {/* อุปกรณ์ที่ต่อพ่วงจากตัวนี้ */}
                <section>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">ต่อพ่วงลงไป ({children.length})</h4>
                    {children.length === 0 ? (
                        <p className="text-xs text-slate-400">ยังไม่มีอุปกรณ์ต่อพ่วง</p>
                    ) : (
                        <ul className="space-y-1">
                            {children.map((c) => (
                                <li key={c.id}>
                                    <button type="button" onClick={() => onSelect(c.id)}
                                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-left text-xs">
                                        <span className="truncate font-semibold text-slate-700">{c.name}</span>
                                        <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400 shrink-0">
                                            {linkLabel(c, device)}
                                            <ArrowUpRight className="w-3 h-3" />
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
              </div>
            </div>

            {(canEdit || canDelete) && (
                <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2">
                    {canEdit && (
                        <button type="button" onClick={() => onEdit(device)} className={`${BTN_SECONDARY} flex-1`}>
                            <Pencil className="w-4 h-4" /> แก้ไข
                        </button>
                    )}
                    {canDelete && (
                        <button type="button" onClick={() => onDelete(device)} className={`${BTN_DANGER} flex-1`}>
                            <Trash2 className="w-4 h-4" /> ลบ
                        </button>
                    )}
                </div>
            )}
        </aside>
        {zoom && (
            <Portal>
                <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) setZoom(null); }}>
                    <div role="dialog" aria-modal="true" aria-label={zoom.alt} className="relative max-w-full max-h-full flex flex-col items-center gap-2">
                        <button type="button" onClick={() => setZoom(null)} aria-label="ปิด"
                            className="self-end p-1.5 rounded-lg bg-white/90 text-slate-700 hover:bg-white shadow">
                            <X className="w-5 h-5" />
                        </button>
                        <img src={zoom.src} alt={zoom.alt} className="max-w-[90vw] max-h-[80vh] object-contain rounded-xl bg-white shadow-2xl" />
                        <span className="text-xs text-white/80">{zoom.alt}</span>
                    </div>
                </div>
            </Portal>
        )}
        </>
    );
};

export default DeviceDetailPanel;
