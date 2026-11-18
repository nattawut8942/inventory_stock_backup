import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RefreshCw, Pencil, Map as MapIcon, Copy, Check, Server, Network, Camera, ImageOff, Maximize2 } from 'lucide-react';
import Portal from '../Portal';
import { API_URL } from '../../config/api';
import { STATUS_COLOR } from './cctvCanvasUtils';
import { drawCCTVIcon } from './cctvIconUtils';
import { CameraTimeline } from './CameraTimeline';

// ── หน้ารายละเอียดกล้อง ─────────────────────────────────────────────────
// แยกออกจาก CCTVPage: แบ่งเป็น 3 แท็บ (ภาพรวม / สถานะ / ตำแหน่ง) และมีแถบปุ่มด้านบน
const STATUS_OPTIONS = [
    { s: 'online',  label: 'ออนไลน์',   dot: 'bg-emerald-500', ring: 'ring-emerald-400', text: 'text-emerald-700', soft: 'bg-emerald-50' },
    { s: 'offline', label: 'ออฟไลน์',   dot: 'bg-red-500',     ring: 'ring-red-400',     text: 'text-red-700',     soft: 'bg-red-50' },
    { s: 'removed', label: 'ถอดออก',    dot: 'bg-gray-400',    ring: 'ring-gray-400',    text: 'text-gray-600',    soft: 'bg-gray-100' },
    { s: 'retired', label: 'เลิกใช้',   dot: 'bg-slate-700',   ring: 'ring-slate-500',   text: 'text-slate-700',   soft: 'bg-slate-100' },
];
const TABS = [
    { id: 'overview', label: 'ภาพรวม' },
    { id: 'status', label: 'สถานะ' },
    { id: 'location', label: 'ตำแหน่ง' },
];

const relTime = (iso) => {
    if (!iso) return null;
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'เมื่อสักครู่';
    if (m < 60) return `${m} นาทีที่แล้ว`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
    return `${Math.floor(h / 24)} วันที่แล้ว`;
};

const dayKey = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

function IconBadge({ camera }) {
    const color = STATUS_COLOR[camera.status] || '#9ca3af';
    return (
        <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: color, boxShadow: `0 8px 24px -6px ${color}` }}>
            {camera.icon_url
                ? <img src={camera.icon_url.startsWith('http') ? camera.icon_url : `${API_URL}${camera.icon_url}`} alt="" className="w-full h-full object-cover rounded-2xl" />
                : <canvas width={48} height={48} ref={el => { if (el) { const ctx = el.getContext('2d'); if (ctx) { ctx.clearRect(0, 0, 48, 48); drawCCTVIcon(ctx, 24, 24, 20, camera.icon_type || 'bullet', color, 'white'); } } }} />}
            {camera.status === 'online' && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
            )}
        </div>
    );
}

function UptimeBars({ uptime }) {
    const byDay = Object.fromEntries((uptime?.days || []).map(d => [d.day, d]));
    const slots = Array.from({ length: 14 }, (_, i) => {
        const dt = new Date(); dt.setDate(dt.getDate() - (13 - i));
        const key = dayKey(dt);
        return { key, d: byDay[key] };
    });
    const pct = uptime?.uptime_pct;
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-end justify-between mb-3">
                <div>
                    <div className="text-xs text-slate-500">Uptime 14 วัน</div>
                    <div className={`text-2xl font-bold tabular-nums ${pct == null ? 'text-slate-300' : pct >= 95 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {pct != null ? `${pct}%` : '—'}
                    </div>
                </div>
                <div className="text-[11px] text-slate-400 text-right">
                    {uptime?.samples ? `จาก ${uptime.samples} ครั้ง${uptime.samples < 10 ? ' · ข้อมูลยังน้อย' : ''}` : 'ยังไม่มีข้อมูล · กด Ping เพื่อเริ่มเก็บ'}
                </div>
            </div>
            <div className="relative flex items-end gap-1 h-16">
                {/* เส้นเป้าหมาย 95% */}
                <div className="absolute left-0 right-0 border-t border-dashed border-slate-300" style={{ bottom: '95%' }} />
                {slots.map(({ key, d }, i) => {
                    if (!d || !d.total) return <div key={key} title={`${key}: ไม่มีข้อมูล`} className="flex-1 h-1.5 rounded-full bg-slate-200" />;
                    const p = d.online / d.total;
                    return (
                        <motion.div key={key} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.03, duration: 0.4 }}
                            title={`${key}: ${Math.round(p * 100)}% (${d.online}/${d.total})`}
                            style={{ height: `${Math.max(12, p * 100)}%`, transformOrigin: 'bottom' }}
                            className={`flex-1 rounded-md ${p >= 0.95 ? 'bg-emerald-500' : p >= 0.5 ? 'bg-amber-400' : 'bg-red-500'}`} />
                    );
                })}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1.5"><span>14 วันก่อน</span><span>วันนี้</span></div>
        </div>
    );
}

function InfoCard({ label, value, copy }) {
    const [copied, setCopied] = useState(false);
    if (!value) return null;
    return (
        <div className="group rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-blue-200 hover:shadow-sm transition">
            <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
                {copy && (
                    <button onClick={() => { navigator.clipboard?.writeText(String(value)); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
                        className="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-blue-600" title="คัดลอก">
                        {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    </button>
                )}
            </div>
            <div className="text-sm font-semibold text-slate-800 mt-0.5 break-words tabular-nums">{value}</div>
        </div>
    );
}

export function CameraDetailModal({ camera, uptime, racks = [], canEdit, pingingId, statusBusy, onClose, onPing, onRequestStatus, onJumpMap, onEdit, onLocation, apiBase }) {
    const [tab, setTab] = useState('overview');
    const [lightbox, setLightbox] = useState(false);
    const [, force] = useState(0);

    // ทำให้เวลา "x นาทีที่แล้ว" อัปเดตเอง
    useEffect(() => { const t = setInterval(() => force(n => n + 1), 30000); return () => clearInterval(t); }, []);
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { if (lightbox) setLightbox(false); else onClose(); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lightbox, onClose]);

    if (!camera) return null;
    const cam = camera;
    const rack = racks.find(r => r.id === cam.rack_id);
    const crossLayout = rack && rack.factory_layout_id !== cam.factory_layout_id;
    const st = STATUS_OPTIONS.find(s => s.s === cam.status);
    const pinging = pingingId === cam.id;
    const snapshot = cam.snapshot_url ? (cam.snapshot_url.startsWith('http') ? cam.snapshot_url : `${API_URL}${cam.snapshot_url}`) : null;
    const headerTint = cam.status === 'online' ? 'from-emerald-50 to-white' : cam.status === 'offline' ? 'from-red-50 to-white' : 'from-slate-100 to-white';

    return (
        <Portal>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]"
                onClick={onClose}>
                <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    onClick={e => e.stopPropagation()}
                    className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>

                    {/* Header */}
                    <div className={`bg-gradient-to-b ${headerTint} px-6 pt-5 pb-4 border-b border-slate-100`}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                                <IconBadge camera={cam} />
                                <div className="min-w-0">
                                    <div className="font-bold text-slate-900 text-lg truncate">{cam.name}</div>
                                    <div className="text-xs text-slate-500 truncate">{cam.model || 'ไม่ระบุ model'}{cam.layout_name ? ` · ${cam.layout_name}` : ''}</div>
                                    <span className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${st?.soft || 'bg-slate-100'} ${st?.text || 'text-slate-600'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${st?.dot || 'bg-slate-400'}`} />{st?.label || cam.status}
                                    </span>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/80 text-slate-400 hover:text-slate-700 transition" title="ปิด (Esc)">
                                <X size={18} />
                            </button>
                        </div>

                        {/* แถบปุ่มหลัก */}
                        <div className="flex gap-2 mt-4">
                            <button onClick={() => onPing(cam.id)} disabled={pinging}
                                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-60 transition">
                                <RefreshCw size={14} className={pinging ? 'animate-spin' : ''} />{pinging ? 'กำลัง Ping…' : 'Ping'}
                            </button>
                            {canEdit && (
                                <button onClick={() => onEdit(cam)}
                                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 transition">
                                    <Pencil size={14} />แก้ไข
                                </button>
                            )}
                            <button onClick={() => onJumpMap(cam)}
                                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-blue-600 text-xs font-semibold text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700 transition">
                                <MapIcon size={14} />ดูบนแผนที่
                            </button>
                        </div>

                        {/* แท็บ */}
                        <div className="flex gap-6 mt-4 -mb-4">
                            {TABS.map(t => (
                                <button key={t.id} onClick={() => setTab(t.id)}
                                    className={`relative pb-3 text-sm font-semibold transition ${tab === t.id ? 'text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}>
                                    {t.label}
                                    {tab === t.id && <motion.span layoutId="cam-tab" className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-blue-600" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* เนื้อหา */}
                    <div className="flex-1 overflow-y-auto px-6 py-5 bg-slate-50/60">
                        <AnimatePresence mode="wait">
                            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-4">

                                {tab === 'overview' && (<>
                                    {snapshot ? (
                                        <button onClick={() => setLightbox(true)} className="group relative block w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-900">
                                            <img src={snapshot} alt={cam.name} className="w-full max-h-60 object-cover group-hover:scale-[1.01] transition-transform duration-500" />
                                            <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 text-[11px] font-medium text-white bg-black/50 backdrop-blur px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition">
                                                <Maximize2 size={12} />ดูเต็มจอ
                                            </span>
                                        </button>
                                    ) : (
                                        <div className="flex items-center justify-center gap-2 h-28 rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">
                                            <ImageOff size={16} />ยังไม่มีภาพ snapshot
                                        </div>
                                    )}
                                    <UptimeBars uptime={uptime} />
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <InfoCard label="IP Address" value={cam.ip_address} copy />
                                        <InfoCard label="Fix Asset" value={cam.fix_asset} copy />
                                        <InfoCard label="Model" value={cam.model} />
                                        <InfoCard label="Factory" value={cam.layout_name} />
                                        <InfoCard label="Record Server" value={cam.record_server_name} />
                                        <InfoCard label="เก็บย้อนหลัง" value={cam.recording_days ? `${cam.recording_days} วัน` : null} />
                                    </div>
                                </>)}

                                {tab === 'status' && (<>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="text-sm font-semibold text-slate-800">สถานะปัจจุบัน</div>
                                            <div className="text-[11px] text-slate-400">
                                                {cam.last_ping ? `ping ล่าสุด ${relTime(cam.last_ping)}` : 'ยังไม่เคย ping'}
                                            </div>
                                        </div>
                                        {canEdit ? (
                                            <>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {STATUS_OPTIONS.map(o => {
                                                        const active = cam.status === o.s;
                                                        return (
                                                            <button key={o.s} disabled={statusBusy || active} onClick={() => onRequestStatus(o.s, o.label)}
                                                                className={`flex items-center gap-2 px-3 h-10 rounded-xl border text-sm font-medium transition
                                                                    ${active ? `${o.soft} ${o.text} border-transparent ring-2 ${o.ring}` : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}
                                                                    disabled:cursor-not-allowed ${!active && statusBusy ? 'opacity-50' : ''}`}>
                                                                <span className={`w-2 h-2 rounded-full ${o.dot}`} />{o.label}
                                                                {active && <Check size={14} className="ml-auto" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <p className="text-[11px] text-slate-400 mt-2">การตั้งด้วยตนเองจะทับผล ping จนกว่าจะ ping ใหม่ การถอดออกจะหยุด ping กล้องนี้</p>
                                            </>
                                        ) : (
                                            <div className="text-sm text-slate-500">คุณไม่มีสิทธิ์เปลี่ยนสถานะ</div>
                                        )}
                                    </div>

                                    {cam.remark && (
                                        <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">
                                            <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-500 mb-1">หมายเหตุ</div>
                                            {cam.remark}
                                        </div>
                                    )}

                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="text-sm font-semibold text-slate-800 mb-2">ประวัติการเปลี่ยนสถานะ</div>
                                        <CameraTimeline cameraId={cam.id} apiBase={apiBase} />
                                    </div>

                                    {cam.updated_by && (
                                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                            <Camera size={12} />แก้ไขล่าสุดโดย <span className="font-medium text-slate-500">{cam.updated_by}</span>
                                        </div>
                                    )}
                                </>)}

                                {tab === 'location' && (<>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">ตำแหน่งบนแผนที่</div>
                                            <div className="relative w-full aspect-[4/3] rounded-xl bg-slate-100 border border-slate-200 overflow-hidden">
                                                {cam.location_x != null ? (
                                                    <span className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-blue-600 ring-4 ring-blue-200"
                                                        style={{ left: `${cam.location_x}%`, top: `${cam.location_y}%` }} />
                                                ) : (
                                                    <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">ยังไม่ได้วาง</span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-2 tabular-nums">
                                                {cam.location_x != null ? `X ${Number(cam.location_x).toFixed(1)}% · Y ${Number(cam.location_y).toFixed(1)}%` : '—'}
                                            </div>
                                        </div>
                                        <div className="space-y-2.5">
                                            <InfoCard label="ทิศทาง FOV" value={cam.fov_direction ? (cam.fov_direction.startsWith('CUSTOM_') ? `Custom ${cam.fov_direction.replace('CUSTOM_', '')}°` : cam.fov_direction) : null} />
                                            <InfoCard label="Factory" value={cam.layout_name} />
                                            <InfoCard label="ระยะ FOV" value={cam.fov_spread ? `${cam.fov_spread}°` : null} />
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-3">เส้นสาย</div>
                                        {!cam.rack_name && !cam.switch_name ? (
                                            <div className="text-sm text-slate-400">ยังไม่ได้ผูก Rack หรือ Switch</div>
                                        ) : (
                                            <div className="flex items-center gap-2 flex-wrap text-sm">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-medium"><Camera size={13} />{cam.name}</span>
                                                {cam.switch_name && <>
                                                    <span className="text-slate-300">→</span>
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium"><Network size={13} />{cam.switch_name}{cam.switch_ip ? ` (${cam.switch_ip})` : ''}</span>
                                                </>}
                                                {cam.rack_name && <>
                                                    <span className="text-slate-300">→</span>
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 font-medium"><Server size={13} />{cam.rack_name}</span>
                                                </>}
                                            </div>
                                        )}
                                        {crossLayout && <div className="text-[11px] text-amber-600 mt-2">Rack นี้อยู่ที่ {rack.layout_name || 'โรงอื่น'}</div>}
                                    </div>

                                    <button onClick={() => onLocation(cam)}
                                        className="w-full h-10 rounded-xl border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition">
                                        แก้ไขตำแหน่งและ FOV
                                    </button>
                                </>)}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </motion.div>
            </motion.div>

            {/* ภาพเต็มจอ */}
            <AnimatePresence>
                {lightbox && snapshot && (
                    <motion.div key="lb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setLightbox(false)}
                        className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out">
                        <motion.img initial={{ scale: 0.94 }} animate={{ scale: 1 }} src={snapshot} alt={cam.name} className="max-w-full max-h-full rounded-xl shadow-2xl" />
                    </motion.div>
                )}
            </AnimatePresence>
        </Portal>
    );
}
