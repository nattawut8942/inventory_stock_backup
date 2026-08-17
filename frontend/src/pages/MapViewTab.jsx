import { MapPin, Info, Pencil } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { API_BASE, API_URL } from '../config/api';

const MapViewTab = ({ hostname, locationData, detailData, onEditLocation, onSelectPC, locationApiBase = 'pc-location', labelMode = 'user' }) => {
    const canvasRef = useRef(null);
    const imageRef = useRef(null);
    const containerRef = useRef(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [hoveredPC, setHoveredPC] = useState(null);
    const [allPCsInLayout, setAllPCsInLayout] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (locationData?.factory_layout_id) {
            fetchPCsByLayout(locationData.factory_layout_id);
        }
    }, [locationData?.factory_layout_id]);

    const fetchPCsByLayout = async (layoutId) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/${locationApiBase}/layout/${layoutId}`);
            const data = await res.json();
            if (data.success) {
                setAllPCsInLayout(data.data || []);
            }
        } catch (err) {
            console.error('Error fetching PCs:', err);
        } finally {
            setLoading(false);
        }
    };

    const getDeviceIcon = (type) => {
        const t = (type || '').toLowerCase();
        if (t.includes('notebook')) return '💻';
        if (t.includes('tablet')) return '📱';
        return '🖥️';
    };

    useEffect(() => {
        if (!canvasRef.current || !imageRef.current || !imageLoaded || !locationData) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const img = imageRef.current;

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        allPCsInLayout.forEach((pc) => {
            if (pc.location_x !== null && pc.location_y !== null) {
                const pixelX = (canvas.width * pc.location_x) / 100;
                const pixelY = (canvas.height * pc.location_y) / 100;

                const isCurrent = pc.hostname === hostname;
                const radius = isCurrent ? 20 : 15;
                const fillColor = isCurrent ? '#3b82f6' : 'rgba(75, 85, 99, 0.8)';

                ctx.save();
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                ctx.fillStyle = fillColor;
                ctx.beginPath();
                ctx.arc(pixelX, pixelY, radius, 0, Math.PI * 2);
                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.restore();

                ctx.font = isCurrent ? '15px Arial' : '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(getDeviceIcon(pc.computer_type), pixelX, pixelY);

                const skipPatterns = /^(UMFD|DWM|NT AUTHORITY|NETWORK|LOCAL|SYSTEM|ANONYMOUS)/i;
                const rawUser = pc.username
                    ? pc.username.split(',').map(u => {
                        return u.trim()
                            .replace(/^[^\\]*\\/, '')   // ลบ domain prefix
                            .replace(/\$$/, '')          // ลบ $ suffix
                            .trim();
                    }).find(u => {
                        if (!u) return false;
                        if (skipPatterns.test(u)) return false;
                        if (/^[A-Z0-9]+-[A-Z0-9_-]+$/i.test(u) && !u.includes('.')) return false;
                        return true;
                    })
                    : null;
                const username = rawUser || 'No User';
                const asset = pc.fix_asset || 'No Asset';

                const drawTextWithBg = (text, x, y, size, color, isBold = false) => {
                    ctx.font = `${isBold ? 'bold' : ''} ${size}px Prompt, sans-serif`;
                    const textWidth = ctx.measureText(text).width;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.fillRect(x - (textWidth / 2) - 4, y - size + 2, textWidth + 8, size + 4);
                    ctx.fillStyle = color;
                    ctx.fillText(text, x, y + 2);
                };


                const textStartY = pixelY + radius + 12;
                const primaryLabel = labelMode === 'hostname' ? pc.hostname : (rawUser || 'No User');

                drawTextWithBg(primaryLabel, pixelX, textStartY, isCurrent ? 12 : 10, isCurrent ? '#1d4ed8' : '#374151', true);
                drawTextWithBg(asset, pixelX, textStartY + 16, isCurrent ? 11 : 9, '#6b7280');
            }
        });
    }, [imageLoaded, allPCsInLayout, hostname]);

    const handleCanvasClick = (e) => {
        if (!canvasRef.current || !allPCsInLayout.length) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        const clickXPercent = (canvasX / canvas.width) * 100;
        const clickYPercent = (canvasY / canvas.height) * 100;

        allPCsInLayout.forEach((pc) => {
            if (pc.location_x !== null && pc.location_y !== null) {
                const dx = clickXPercent - pc.location_x;
                const dy = clickYPercent - pc.location_y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= 3.5) {
                    onSelectPC?.(pc.hostname);
                }
            }
        });
    };

    const handleCanvasHover = (e) => {
        if (!canvasRef.current || !allPCsInLayout.length) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        const hoverXPercent = (canvasX / canvas.width) * 100;
        const hoverYPercent = (canvasY / canvas.height) * 100;

        let hovering = null;
        for (const pc of allPCsInLayout) {
            if (pc.location_x !== null && pc.location_y !== null) {
                const dx = hoverXPercent - pc.location_x;
                const dy = hoverYPercent - pc.location_y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= 3.5) {
                    hovering = pc.hostname;
                    break;
                }
            }
        }

        setHoveredPC(hovering);
        canvas.style.cursor = hovering ? 'pointer' : 'crosshair';
    };

    if (!locationData) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                <div className="text-[14px] text-amber-700 font-medium mb-2">📍 No location set</div>
                <p className="text-[13px] text-amber-600 mb-4">This computer doesn't have a location assigned yet.</p>
                <button
                    onClick={() => onEditLocation?.()}
                    className="px-4 py-2 rounded-lg bg-amber-600 text-white text-[12px] font-semibold hover:bg-amber-700 transition-colors"
                >
                    Set Location on Map
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Header bar */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[13px] font-bold text-gray-900 flex items-center gap-2">
                            <MapPin size={15} className="text-blue-600" />
                            {locationData.layout_name}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                            {locationData.location_x !== null && (
                                <span>📍 ({locationData.location_x.toFixed(1)}, {locationData.location_y.toFixed(1)})</span>
                            )}
                            <span className="ml-2 text-gray-400">{allPCsInLayout.length} PCs in layout</span>
                        </div>
                    </div>
                    <button
                        onClick={() => onEditLocation?.()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-[12px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                        <Pencil size={13} />
                        Edit
                    </button>
                </div>
            </div>

            {/* ✅ Map — fit width, no scroll */}
            <div ref={containerRef} className="relative bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                <img
                    ref={imageRef}
                    // เปลี่ยนจาก:
                    src={locationData?.image_url ? `${API_URL}${locationData.image_url.startsWith('/') ? '' : '/'}${locationData.image_url}` : null}
                    alt="Factory layout"
                    style={{ display: 'none' }}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageLoaded(false)}
                    crossOrigin="anonymous"
                />

                {!locationData?.image_url ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Info size={36} className="mb-2" />
                        <p className="text-sm">ไม่พบรูปภาพแผนผังสำหรับเครื่องนี้</p>
                    </div>
                ) : imageLoaded ? (
                    <canvas
                        ref={canvasRef}
                        onClick={handleCanvasClick}
                        onMouseMove={handleCanvasHover}
                        onMouseLeave={() => {
                            setHoveredPC(null);
                            if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
                        }}
                        // ✅ w-full + h-auto = fit container ไม่มี scroll
                        className="w-full h-auto cursor-crosshair block"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                        <p className="text-sm">Loading map...</p>
                    </div>
                )}

                {hoveredPC && (
                    <div className="absolute bottom-3 left-3 bg-gray-900 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-medium pointer-events-none shadow-xl border border-white/10">
                        💻 {hoveredPC}
                    </div>
                )}
            </div>

            <div className="text-[11px] text-gray-400 flex items-center gap-1.5 px-1">
                <Info size={12} className="text-blue-400" />
                <span><strong>🔵</strong> Current · <strong>⚫</strong> Others · Click to switch view</span>
            </div>

            {/* ✅ PC list — compact cards */}
            {allPCsInLayout.length > 0 && (
                <div>
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                        Computers in this location
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-10 gap-1.5 max-h-[180px] overflow-y-auto custom-scrollbar">
                        {allPCsInLayout.map((pc) => (
                            <button
                                key={pc.hostname}
                                onClick={() => onSelectPC?.(pc.hostname)}
                                className={`text-left px-2.5 py-2 rounded-lg border transition-all ${pc.hostname === hostname
                                        ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200'
                                        : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                                    }`}
                            >
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <span className="text-[11px] font-bold text-gray-800 truncate">
                                        {getDeviceIcon(pc.computer_type)} {pc.hostname}
                                    </span>
                                    {pc.hostname === hostname && (
                                        <span className="text-[11px] bg-blue-600 text-white px-1 py-0.5 rounded-full shrink-0">●</span>
                                    )}
                                </div>
                                <div className="text-[11px] text-blue-600 truncate">
                                    {labelMode === 'hostname'
                                        ? (pc.fix_asset || 'No Asset')
                                        : (() => {
                                            const skip = /^(UMFD|DWM|NT AUTHORITY|NETWORK|LOCAL|SYSTEM|ANONYMOUS)/i;
                                            return pc.username
                                                ? pc.username.split(',').map(u => u.trim().replace(/^[^\\]*\\/, '').replace(/\$$/, '').trim())
                                                    .find(u => u && !skip.test(u) && !((/^[A-Z0-9]+-[A-Z0-9_-]+$/i.test(u)) && !u.includes('.')))
                                                || 'No User'
                                                : 'No User';
                                        })()
                                    }
                                </div>
                                {pc.fix_asset && (
                                    <div className="text-[11px] text-gray-600 font-mono mt-0.5 truncate">{pc.fix_asset}</div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MapViewTab;