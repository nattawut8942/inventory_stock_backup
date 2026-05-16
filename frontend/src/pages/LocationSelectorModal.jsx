import { X, MapPin, Trash2, Info } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { API_BASE, API_URL } from '../config/api';

const LocationSelectorModal = ({ hostname, initialLocation, layouts, onSave, onClose, saveApiBase = 'pc-location' }) => {
    const [selectedLayout, setSelectedLayout] = useState(initialLocation?.factory_layout_id || null);
    const [locationX, setLocationX] = useState(initialLocation?.location_x || null);
    const [locationY, setLocationY] = useState(initialLocation?.location_y || null);
    const [allPCsInLayout, setAllPCsInLayout] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [imageLoaded, setImageLoaded] = useState(false);
    const canvasRef = useRef(null);
    const imageRef = useRef(null);

    const currentLayout = layouts?.find(l => l.id === selectedLayout);

    // ดึงข้อมูลเครื่องอื่นพร้อมประเภทเครื่อง
    useEffect(() => {
        if (selectedLayout) {
           fetch(`${API_BASE}/${saveApiBase}/layout/${selectedLayout}`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) setAllPCsInLayout(data.data || []);
                })
                .catch(err => console.error('Error fetching other PCs:', err));
        }
    }, [selectedLayout]);

    // ฟังก์ชันช่วยเลือก Icon ตามประเภทเครื่อง
    const getDeviceIcon = (type) => {
        const t = (type || '').toLowerCase();
        if (t.includes('notebook')) return '💻'; // หน้า pcinventory ใช้ notebook เป็นเงื่อนไขหลัก
        if (t.includes('tablet')) return '📱';
        return '🖥️'; // อื่นๆ เป็น desktop/pc ตามหน้า pcinventory
    };

    useEffect(() => {
        if (!canvasRef.current || !imageRef.current || !imageLoaded) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const img = imageRef.current;

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        // --- วาดเครื่องอื่น ๆ (ใช้ Icon ตามประเภท) ---
        allPCsInLayout.forEach(pc => {
            if (pc.hostname === hostname) return;
            if (pc.location_x !== null && pc.location_y !== null) {
                const px = (canvas.width * pc.location_x) / 100;
                const py = (canvas.height * pc.location_y) / 100;
                
                // วาดวงกลมพื้นหลังจางๆ
                ctx.fillStyle = 'rgba(75, 85, 99, 0.4)';
                ctx.beginPath();
                ctx.arc(px, py, 18, 0, Math.PI * 2);
                ctx.fill();

                // วาด Icon ตามประเภท
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(getDeviceIcon(pc.computer_type), px, py);

                // ชื่อเครื่อง
                ctx.font = 'bold 12px Arial';
                ctx.fillStyle = '#4b5563';
                ctx.fillText(pc.hostname, px, py + 35);
            }
        });

        // --- วาดเครื่องปัจจุบัน (สีน้ำเงิน Highlight) ---
        if (locationX !== null && locationY !== null) {
            const pixelX = (canvas.width * locationX) / 100;
            const pixelY = (canvas.height * locationY) / 100;

            ctx.shadowBlur = 15;
            ctx.shadowColor = "rgba(59, 130, 246, 0.5)";
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.arc(pixelX, pixelY, 22, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.stroke();

            // วาด Icon เครื่องปัจจุบัน
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // หาประเภทเครื่องปัจจุบันจากข้อมูลที่ส่งมา
            const currentType = allPCsInLayout.find(p => p.hostname === hostname)?.computer_type || 'PC';
            ctx.fillText(getDeviceIcon(currentType), pixelX, pixelY);

            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = '#1d4ed8';
            ctx.fillText("YOU", pixelX, pixelY + 40);
        }
    }, [imageLoaded, locationX, locationY, allPCsInLayout]);

    // ✅ FIX: คำนวณ position โดยคำนึงถึง canvas scale factor
    const handleCanvasClick = (e) => {
        if (!canvasRef.current || !currentLayout) return;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        // ✅ สำคัญ: คำนวณ scale factor ของ canvas
        // canvas.width = ขนาด pixel จริงของ canvas
        // rect.width = ขนาด DOM ที่แสดงบนหน้าจอ (อาจถูกปรับขนาด CSS)
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        // ✅ คำนวณตำแหน่งใน canvas pixel space
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        // ✅ แปลงเป็น percentage
        const x = (canvasX / canvas.width) * 100;
        const y = (canvasY / canvas.height) * 100;

        setLocationX(parseFloat(x.toFixed(1)));
        setLocationY(parseFloat(y.toFixed(1)));
    };

    const handleSave = async () => {
        if (!selectedLayout || locationX === null) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/${saveApiBase}/${encodeURIComponent(hostname)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    factory_layout_id: selectedLayout,
                    location_x: locationX,
                    location_y: locationY
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            onSave?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
            {/* ปรับขนาด Modal ให้ลดลงมาหน่อยเป็น max-w-5xl (ประมาณ 1000px) */}
            <div className="bg-white rounded-2xl w-full max-w-7xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
                
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-xl">📍</div>
                        <div>
                            <div className="text-lg font-bold text-gray-900">ระบุตำแหน่งคอมพิวเตอร์</div>
                            <div className="text-sm text-gray-500">{hostname}</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 flex flex-col space-y-4 overflow-hidden">
                    <div className="shrink-0 flex flex-col sm:flex-row gap-4 items-center">
                        <div className="flex-1 w-full">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Layout</label>
                            <select
                                value={selectedLayout || ''}
                                onChange={(e) => {
                                    setSelectedLayout(e.target.value ? parseInt(e.target.value) : null);
                                    setLocationX(null); setImageLoaded(false);
                                }}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm outline-none bg-white"
                            >
                                <option value="">-- เลือกแผนผัง --</option>
                                {layouts?.map((l) => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-4 text-[11px] bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-100 shrink-0">
                           <div className="flex items-center gap-2">เครื่องนี้ <span className="text-lg">🔵</span></div>
                           <div className="flex items-center gap-2">อื่น ๆ <span className="text-lg opacity-50">⚫</span></div>
                        </div>
                    </div>

                    <div className="relative bg-gray-100 rounded-2xl border border-gray-200 overflow-auto flex items-start justify-center p-2 h-[500px]">
                        {selectedLayout && currentLayout ? (
                            <>
                                <img
                                    ref={imageRef}
                                    src={currentLayout.image_url?.startsWith('http') ? currentLayout.image_url : `${API_URL}${currentLayout.image_url}`}
                                    alt="layout"
                                    style={{ display: 'none' }}
                                    onLoad={() => setImageLoaded(true)}
                                    crossOrigin="anonymous"
                                />
                                {imageLoaded ? (
                                    <canvas
                                        ref={canvasRef}
                                        onClick={handleCanvasClick}
                                        className="max-w-full h-auto cursor-crosshair shadow-sm bg-white"
                                    />
                                ) : (
                                    <div className="self-center flex flex-col items-center gap-2 text-gray-400">
                                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        <p>Loading Layout...</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="self-center flex flex-col items-center text-gray-400 gap-2">
                                <Info size={32} />
                                <p>กรุณาเลือกแผนผังเพื่อดูตำแหน่ง</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50">
                    <button
                        onClick={async () => {
                            if (!confirm('ล้างข้อมูลตำแหน่ง?')) return;
                            setLoading(true);
                            await fetch(`${API_BASE}/${saveApiBase}/${encodeURIComponent(hostname)}`, { method: 'DELETE' });
                            setLocationX(null); setLocationY(null); setSelectedLayout(null);
                            onSave?.(); setLoading(false);
                        }}
                        className="text-red-500 font-bold text-sm hover:underline"
                    >
                        ล้างตำแหน่ง
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-white transition-colors">ยกเลิก</button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !selectedLayout || locationX === null}
                            className="px-8 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200"
                        >
                            {loading ? 'Saving...' : 'บันทึกตำแหน่ง'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LocationSelectorModal;