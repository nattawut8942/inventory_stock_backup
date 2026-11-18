import { API_URL } from '../../config/api';
import Portal from '../Portal';
import { STATUS_COLOR } from './cctvCanvasUtils';

// ── Hover card ของกล้องบนแผนที่: snapshot (ถ้ามี) + สถานะ + IP + FOV + ping ล่าสุด ──
const STATUS_TH = { online: 'ออนไลน์', offline: 'ออฟไลน์', unknown: 'ไม่ทราบ', removed: 'ถอดออก', retired: 'เลิกใช้' };

// แปลงเวลาเป็นข้อความสั้น เช่น "3 นาทีที่แล้ว"
function relativeTime(iso) {
    if (!iso) return 'ยังไม่เคย ping';
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'เมื่อสักครู่';
    if (min < 60) return `${min} นาทีที่แล้ว`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} ชม. ที่แล้ว`;
    return `${Math.floor(hr / 24)} วันที่แล้ว`;
}

export function TooltipPortal({ tooltip, canvasRef }) {
    const TW = 280, TH = 240, margin = 12;
    const canvasEl = canvasRef.current;
    const canvasRect = canvasEl ? canvasEl.getBoundingClientRect() : null;
    const cam = tooltip.cam;

    let left = tooltip.x + 16;
    let top = tooltip.y - 10;

    if (canvasRect) {
        if (left + TW > canvasRect.right - margin) left = tooltip.x - TW - 16;
        if (left < canvasRect.left + margin) left = canvasRect.left + margin;
        if (top + TH > canvasRect.bottom - margin) top = canvasRect.bottom - TH - margin;
        if (top < canvasRect.top + margin) top = canvasRect.top + margin;
    }

    const fov = !cam.fov_direction ? 'ยังไม่ตั้ง'
        : cam.fov_direction.startsWith('CUSTOM_') ? `Custom ${cam.fov_direction.replace('CUSTOM_', '')}°`
            : cam.fov_direction;

    return (
        <Portal>
            <div style={{ position: 'fixed', left, top, zIndex: 99990, pointerEvents: 'none' }}>
                <div className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-white/10" style={{ width: TW }}>
                    {cam.snapshot_url
                        ? <img src={`${API_URL}${cam.snapshot_url}`} alt={cam.name} className="w-full object-cover" style={{ maxHeight: 130 }} />
                        : <div className="w-full h-16 flex items-center justify-center text-gray-500 text-xs bg-gray-800">ไม่มีภาพ snapshot</div>}
                    <div className="px-3 py-2 space-y-1">
                        <div className="text-white text-xs font-semibold truncate">{cam.name}</div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[cam.status] }} />
                            <span className="text-[11px] text-gray-300">{STATUS_TH[cam.status] || cam.status}</span>
                            <span className="text-[11px] text-gray-500">· {cam.ip_address || 'ไม่มี IP'}</span>
                        </div>
                        <div className="text-[11px] text-gray-400">ทิศทาง FOV: {fov}</div>
                        <div className="text-[11px] text-gray-400">ping ล่าสุด: {relativeTime(cam.last_ping)}</div>
                    </div>
                </div>
            </div>
        </Portal>
    );
}
