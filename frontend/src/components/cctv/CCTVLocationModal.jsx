import { useState, useRef, useEffect } from 'react';
import { X, Info, MapPin, RotateCcw } from 'lucide-react';
import { API_BASE, API_URL } from '../../config/api';

// ── 16 ทิศทาง ─────────────────────────────────────────────────────────────
const FOV_DIRECTIONS = [
    { label: 'เหนือ (N) ↑',             value: 'N',   angle: 270 },
    { label: 'เหนือ-ตะวันออก (NNE) ↑→', value: 'NNE', angle: 292.5 },
    { label: 'ตะวันออกเฉียงเหนือ (NE) ↗', value: 'NE',  angle: 315 },
    { label: 'ตะวันออก-เหนือ (ENE) →↑', value: 'ENE', angle: 337.5 },
    { label: 'ตะวันออก (E) →',           value: 'E',   angle: 0   },
    { label: 'ตะวันออก-ใต้ (ESE) →↓',   value: 'ESE', angle: 22.5 },
    { label: 'ตะวันออกเฉียงใต้ (SE) ↘', value: 'SE',  angle: 45  },
    { label: 'ใต้-ตะวันออก (SSE) ↓→',   value: 'SSE', angle: 67.5 },
    { label: 'ใต้ (S) ↓',               value: 'S',   angle: 90  },
    { label: 'ใต้-ตะวันตก (SSW) ↓←',   value: 'SSW', angle: 112.5 },
    { label: 'ตะวันตกเฉียงใต้ (SW) ↙', value: 'SW',  angle: 135 },
    { label: 'ตะวันตก-ใต้ (WSW) ←↓',   value: 'WSW', angle: 157.5 },
    { label: 'ตะวันตก (W) ←',           value: 'W',   angle: 180 },
    { label: 'ตะวันตก-เหนือ (WNW) ←↑', value: 'WNW', angle: 202.5 },
    { label: 'ตะวันตกเฉียงเหนือ (NW) ↖', value: 'NW',  angle: 225 },
    { label: 'เหนือ-ตะวันตก (NNW) ↑←', value: 'NNW', angle: 247.5 },
    { label: 'กำหนดเอง (Custom)',        value: 'CUSTOM', angle: null },
];

const FOV_SPREAD_DEFAULT = 60;

function drawFOV(ctx, px, py, canvasAngleDeg, spreadDeg = FOV_SPREAD_DEFAULT, fovLen = 80,
    fillColor = 'rgba(59,130,246,0.2)', strokeColor = 'rgba(59,130,246,0.65)') {
    ctx.save();
    ctx.beginPath();

    if (spreadDeg >= 360) {
        // 360° = วงกลมเต็ม ไม่ต้องสนใจทิศ
        ctx.arc(px, py, fovLen, 0, Math.PI * 2);
    } else {
        const rad  = canvasAngleDeg * (Math.PI / 180);
        const half = (spreadDeg / 2) * (Math.PI / 180);
        const x1 = px + Math.cos(rad - half) * fovLen;
        const y1 = py + Math.sin(rad - half) * fovLen;
        ctx.moveTo(px, py);
        ctx.lineTo(x1, y1);
        ctx.arc(px, py, fovLen, rad - half, rad + half);
        ctx.closePath();
    }

    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

// แปลง fov_direction + customAngle → canvas angle (องศาที่วาดบน canvas)
function toCanvasAngle(fovValue, customAngle) {
    if (fovValue === 'CUSTOM') return customAngle ?? 0;
    const dir = FOV_DIRECTIONS.find(d => d.value === fovValue);
    return dir?.angle ?? 0;
}

export default function CCTVLocationModal({ camera, rack, layouts, onClose, onSave }) {
    const isRack    = !!rack || !!camera?._isRack;  // รองรับทั้ง rack prop และ _isRack flag
    const target    = isRack ? (rack || camera) : camera;
    const typeLabel = isRack ? 'Rack' : 'กล้อง';

    const [selectedLayout, setSelectedLayout] = useState(target?.factory_layout_id || null);
    const [locX,        setLocX]        = useState(target?.location_x  ?? null);
    const [locY,        setLocY]        = useState(target?.location_y  ?? null);
    const [fovDir,      setFovDir]      = useState(target?.fov_direction || 'E');
    const [customAngle, setCustomAngle] = useState(0);   // 0–360
    const [fovSpread,   setFovSpread]   = useState(target?.fov_spread || 60);  // มุมกว้าง FOV
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState('');
    const [imageLoaded, setImageLoaded] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const canvasRef = useRef(null);
    const imageRef  = useRef(null);
    const currentLayout = layouts?.find(l => l.id === +selectedLayout);

    // fetch กล้องอื่นใน layout เพื่อแสดงบน map
    const [others, setOthers] = useState([]);
    useEffect(() => {
        if (!selectedLayout) return;
        fetch(`${API_BASE}/cctv/cameras/layout/${selectedLayout}`)
            .then(r => r.json())
            .then(d => { if (d.success) setOthers(d.data || []); })
            .catch(() => {});
    }, [selectedLayout]);

    // ── Draw canvas ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!canvasRef.current || !imageRef.current || !imageLoaded) return;
        const canvas = canvasRef.current;
        const ctx    = canvas.getContext('2d');
        const img    = imageRef.current;

        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const scaleX = canvas.width  / 100;
        const scaleY = canvas.height / 100;
        // FOV len proportional to canvas size
        const fovLen = Math.min(canvas.width, canvas.height) * 0.10;

        // ── กล้องอื่น (จาง) ────────────────────────────────────────────
        others.forEach(o => {
            // safe guard — skip ถ้าไม่มี id หรือเป็นตัวเดียวกัน
            if (!o || o.id == null) return;
            if (target?.id != null && o.id === target.id) return;
            if (o.location_x == null || o.location_y == null) return;

            const px = o.location_x * scaleX;
            const py = o.location_y * scaleY;

            // FOV จาง
            if (o.fov_direction) {
                const angle = toCanvasAngle(o.fov_direction, 0);
                drawFOV(ctx, px, py, angle, 60, fovLen,
                    'rgba(107,114,128,0.10)', 'rgba(107,114,128,0.25)');
            }

            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#6b7280';
            ctx.beginPath();
            ctx.arc(px, py, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.font = '10px Arial';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('📹', px, py);
            ctx.restore();
        });

        // ── กล้องปัจจุบัน ──────────────────────────────────────────────
        if (locX != null && locY != null) {
            const px = locX * scaleX;
            const py = locY * scaleY;

            // วาด FOV cone
            if (!isRack) {
                const angle = toCanvasAngle(fovDir, customAngle);
                drawFOV(ctx, px, py, angle, fovSpread, fovLen);
            }

            // pin
            ctx.save();
            ctx.shadowBlur  = 14;
            ctx.shadowColor = isRack ? '#7c3aed' : '#2563eb';
            ctx.fillStyle   = isRack ? '#7c3aed' : '#2563eb';
            ctx.beginPath();
            ctx.arc(px, py, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.font = '15px Arial';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(isRack ? '🖥️' : '📹', px, py);

            // label
            const label = target?.name || typeLabel;
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const tw = ctx.measureText(label).width + 10;
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            ctx.beginPath();
            ctx.roundRect(px - tw / 2, py + 22, tw, 18, 4);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.fillText(label, px, py + 25);
            ctx.restore();
        }
    }, [imageLoaded, locX, locY, others, fovDir, customAngle, fovSpread, isRack]);

    // ── Handlers ───────────────────────────────────────────────────────────
    const handleCanvasClick = (e) => {
        if (!canvasRef.current || !currentLayout) return;
        const canvas = canvasRef.current;
        const rect   = canvas.getBoundingClientRect();
        const sx = canvas.width  / rect.width;
        const sy = canvas.height / rect.height;
        const x = ((e.clientX - rect.left) * sx / canvas.width)  * 100;
        const y = ((e.clientY - rect.top)  * sy / canvas.height) * 100;
        setLocX(parseFloat(x.toFixed(2)));
        setLocY(parseFloat(y.toFixed(2)));
    };

    const handleSave = async () => {
        if (!selectedLayout || locX == null) return;
        setLoading(true); setError('');
        try {
            const saveFovDir = fovDir === 'CUSTOM' ? `CUSTOM_${customAngle}` : fovDir;
            let res;
            if (isRack) {
                res = await fetch(`${API_BASE}/cctv/racks/${target.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: target.name, factory_layout_id: selectedLayout, location_x: locX, location_y: locY, remark: target.remark }),
                });
            } else {
                res = await fetch(`${API_BASE}/cctv/cameras/${target.id}/location`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        factory_layout_id: selectedLayout,
                        location_x: locX,
                        location_y: locY,
                        fov_direction: saveFovDir,
                        fov_spread: fovSpread,
                    }),
                });
            }
            const d = await res.json();
            if (!d.success) throw new Error(d.error);
            onSave();
        } catch (err) { setError(err.message); } finally { setLoading(false); }
    };

    const doClear = async () => {
        setLoading(true); setError('');
        try {
            if (isRack) {
                // ส่ง factory_layout_id เดิมไปด้วย ป้องกัน rack หายจากรายการ
                await fetch(`${API_BASE}/cctv/racks/${target.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name:               target.name,
                        factory_layout_id:  target.factory_layout_id,  // keep ไว้
                        location_x:         null,
                        location_y:         null,
                        remark:             target.remark,
                        rack_type:          target.rack_type,
                    }),
                });
            } else {
                // ส่งแค่ location null ไม่แตะ factory_layout_id
                await fetch(`${API_BASE}/cctv/cameras/${target.id}/location`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ location_x: null, location_y: null }),
                });
            }
            setLocX(null); setLocY(null); setConfirmClear(false);
            onSave();
        } catch (err) { setError(err.message); } finally { setLoading(false); }
    };

    const hasExistingLocation = target?.location_x != null;
    const currentFovAngle = fovDir === 'CUSTOM' ? customAngle : (FOV_DIRECTIONS.find(d => d.value === fovDir)?.angle ?? 0);

    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight:'92vh' }}>

                {/* Inline confirm clear */}
                {confirmClear && (
                    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:16 }}>
                        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
                            <div className="text-center mb-4">
                                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <MapPin size={22} className="text-red-500"/>
                                </div>
                                <div className="font-bold text-gray-900 text-base mb-1">ล้างตำแหน่งออกจากแผนผัง?</div>
                                <div className="text-sm text-gray-500">
                                    ตำแหน่งของ <span className="font-semibold text-gray-700">"{target?.name}"</span> จะถูกล้างออก<br/>
                                    <span className="text-green-600 font-medium text-xs">✓ ข้อมูลกล้องยังคงอยู่ครบถ้วน</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setConfirmClear(false)} disabled={loading}
                                        className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                                    ยกเลิก
                                </button>
                                <button onClick={doClear} disabled={loading}
                                        className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                                    {loading ? 'กำลังล้าง...' : 'ล้างตำแหน่ง'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${isRack ? 'bg-purple-100' : 'bg-blue-100'}`}>
                            {isRack ? '🖥️' : '📍'}
                        </div>
                        <div>
                            <div className="font-bold text-gray-900">ระบุตำแหน่ง{typeLabel}บนแผนผัง</div>
                            <div className="text-sm text-gray-500">{target?.name}</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={22}/></button>
                </div>

                <div className="p-5 flex flex-col gap-3 overflow-hidden flex-1">

                    {/* Row 1: Layout + FOV */}
                    <div className="flex gap-3 flex-wrap items-end">
                        <div className="flex-1 min-w-[180px]">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Factory Layout</label>
                            <select value={selectedLayout || ''}
                                    onChange={e => { setSelectedLayout(e.target.value ? +e.target.value : null); setLocX(null); setImageLoaded(false); }}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white">
                                <option value="">-- เลือกแผนผัง --</option>
                                {layouts?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>

                        {!isRack && (
                            <div className="min-w-[200px]">
                                <label className="block text-xs font-medium text-gray-500 mb-1">ทิศทางกล้อง (FOV)</label>
                                <select value={fovDir} onChange={e => setFovDir(e.target.value)}
                                        className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-blue-50">
                                    {FOV_DIRECTIONS.map(d => (
                                        <option key={d.value} value={d.value}>{d.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {locX != null && (
                            <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 whitespace-nowrap">
                                X: {locX.toFixed(1)}%  Y: {locY?.toFixed(1)}%
                            </div>
                        )}
                    </div>

                    {/* Row 2: Custom angle + FOV spread (เฉพาะกล้อง) */}
                    {!isRack && (
                        <div className="flex gap-3 flex-wrap items-center bg-blue-50 rounded-xl px-4 py-3 border border-blue-100">
                            {fovDir === 'CUSTOM' && (
                                <div className="flex-1 min-w-[180px]">
                                    <label className="block text-xs font-medium text-blue-600 mb-1">
                                        มุมกำหนดเอง: <span className="font-bold">{customAngle}°</span>
                                    </label>
                                    <input type="range" min="0" max="359" step="1"
                                           value={customAngle}
                                           onChange={e => setCustomAngle(+e.target.value)}
                                           className="w-full accent-blue-500"/>
                                    <div className="flex justify-between text-[10px] text-blue-400 mt-0.5">
                                        <span>0° (→)</span><span>90° (↓)</span><span>180° (←)</span><span>270° (↑)</span><span>359°</span>
                                    </div>
                                </div>
                            )}
                            <div className="flex-1 min-w-[160px]">
                                <label className="block text-xs font-medium text-blue-600 mb-1">
                                    มุมกว้าง FOV: <span className="font-bold">{fovSpread}°</span>
                                    <span className="text-blue-400 font-normal ml-1">
                                        ({fovSpread <= 40 ? 'Narrow/Telephoto' : fovSpread <= 70 ? 'Standard' : fovSpread <= 100 ? 'Wide' : fovSpread < 360 ? 'Ultra Wide' : '360° Fisheye'})
                                    </span>
                                </label>
                                <input type="range" min="15" max="360" step="5"
                                       value={fovSpread}
                                       onChange={e => setFovSpread(+e.target.value)}
                                       className="w-full accent-blue-500"/>
                                <div className="flex justify-between text-[10px] text-blue-400 mt-0.5">
                                    <span>15° Tele</span><span>60° Std</span><span>120° Wide</span><span>180°</span><span>360°</span>
                                </div>
                            </div>

                            {/* FOV compass preview */}
                            <div className="flex flex-col items-center gap-1">
                                <div className="text-[10px] text-blue-500 font-medium">Preview</div>
                                <svg width="56" height="56" viewBox="-28 -28 56 56">
                                    <circle cx="0" cy="0" r="26" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="1"/>
                                    {/* compass ticks */}
                                    {['N','E','S','W'].map((t,i) => {
                                        const a = i * 90 * Math.PI / 180;
                                        return <text key={t} x={Math.cos(a-Math.PI/2)*20} y={Math.sin(a-Math.PI/2)*20}
                                                    fontSize="5" textAnchor="middle" dominantBaseline="middle" fill="#93c5fd">{t}</text>;
                                    })}
                                    {/* FOV cone */}
                                    {(() => {
                                        if (fovSpread >= 360) {
                                            return <circle cx="0" cy="0" r="22" fill="rgba(59,130,246,0.35)" stroke="rgba(59,130,246,0.8)" strokeWidth="1"/>;
                                        }
                                        const ang = currentFovAngle * Math.PI / 180;
                                        const half = (fovSpread / 2) * Math.PI / 180;
                                        const r = 22;
                                        const x1 = Math.cos(ang - half) * r;
                                        const y1 = Math.sin(ang - half) * r;
                                        const x2 = Math.cos(ang + half) * r;
                                        const y2 = Math.sin(ang + half) * r;
                                        const large = fovSpread > 180 ? 1 : 0;
                                        return (
                                            <path d={`M0,0 L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`}
                                                  fill="rgba(59,130,246,0.35)" stroke="rgba(59,130,246,0.8)" strokeWidth="1"/>
                                        );
                                    })()}
                                    <circle cx="0" cy="0" r="3.5" fill="#2563eb"/>
                                </svg>
                            </div>
                        </div>
                    )}

                    {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}

                    {/* Map canvas */}
                    <div className="relative bg-gray-100 rounded-xl border border-gray-200 overflow-auto flex items-start justify-center flex-1 min-h-0" style={{ minHeight:260 }}>
                        {selectedLayout && currentLayout ? (
                            <>
                                <img ref={imageRef}
                                     src={currentLayout.image_url?.startsWith('http') ? currentLayout.image_url : `${API_URL}${currentLayout.image_url || ''}`}
                                     style={{ display:'none' }}
                                     onLoad={() => setImageLoaded(true)}
                                     crossOrigin="anonymous"
                                     alt="layout"
                                />
                                {imageLoaded
                                    ? <canvas ref={canvasRef} onClick={handleCanvasClick} className="max-w-full h-auto cursor-crosshair shadow-sm"/>
                                    : <div className="self-center text-gray-400 text-sm">Loading...</div>
                                }
                            </>
                        ) : (
                            <div className="self-center flex flex-col items-center text-gray-400 gap-2 py-10">
                                <Info size={28}/>
                                <p className="text-sm">เลือกแผนผังก่อน</p>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Info size={11} className="text-blue-400 flex-shrink-0"/>
                        <span>คลิกบนแผนผังเพื่อวางตำแหน่ง · สีฟ้า = กล้องนี้ · สีจาง = กล้องอื่น</span>
                        {!isRack && <span className="ml-auto text-blue-500 font-medium">🔵 = มุมมอง FOV</span>}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50 rounded-b-2xl">
                    <button onClick={() => setConfirmClear(true)}
                            disabled={loading || !hasExistingLocation}
                            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-30">
                        <RotateCcw size={13}/> ล้างตำแหน่งออกจากแผนผัง
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-5 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-white">
                            ยกเลิก
                        </button>
                        <button onClick={handleSave} disabled={loading || !selectedLayout || locX == null}
                                className="px-7 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                            {loading ? 'Saving...' : 'บันทึกตำแหน่ง'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}