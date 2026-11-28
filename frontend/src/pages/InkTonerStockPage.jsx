import React, { useState, useEffect, Fragment } from 'react';
import { Search, Printer, Package, AlertTriangle, List, LayoutGrid, TrendingDown, Truck, Droplet, RefreshCw, ChevronUp, ChevronDown, ArrowUpDown, Pencil, Clock, Link2, X } from 'lucide-react';
import Portal from '../components/Portal';
import { motion, AnimatePresence } from 'framer-motion'; 
import { API_BASE, API_URL } from '../config/api';
import Pagination from '../components/Pagination';
import InkTonerCompatModal from '../components/InkTonerCompatModal';
import CtspPicImage from '../components/CtspPicImage';
import { getTonerType as detectTonerType } from '../utils/tonerColor';
import PhotoLightbox from '../components/PhotoLightbox';
import PhotoSlot from '../components/PhotoSlot';
import ConnectionBadge from '../components/ConnectionBadge';
import StatusBadge from '../components/StatusBadge';
import { PageSkeleton } from '../components/Skeleton';
import { toast } from '../components/Toast';
import { confirmDialog } from '../components/ConfirmDialog';
import CopyButton from '../components/CopyButton';
import { useCanAct } from '../context/PermissionContext';

// StatCard Component
const StatCard = ({ icon: Icon, title, value, color, onClick, active }) => (
    <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={onClick ? { y: -2 } : undefined}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        className={`group relative overflow-hidden bg-white rounded-2xl p-5 border shadow-sm transition-all ${onClick ? 'cursor-pointer hover:shadow-md' : ''} ${active ? 'ring-2 ring-rose-300 border-rose-200' : 'border-slate-200'}`}
    >
        <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br ${color} opacity-10 group-hover:opacity-20 transition-opacity`} />
        <div className="relative flex items-center justify-between">
            <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">{title}</p>
                <h3 className="text-2xl font-black tabular-nums text-slate-900">{value}</h3>
            </div>
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
        </div>
    </motion.div>
);

// ป้ายสถานะ: ใช้ป้ายกลาง StatusBadge เพื่อให้สีและขนาดเหมือนหน้า Printer Health
const Pill = ({ tone, label }) => (
    <StatusBadge tone={tone} className="text-[11px] px-2.5 py-1">{label}</StatusBadge>
);

// รายชื่อเครื่องที่ผูกกับหมึก (ใช้ในแถวที่กางออก)
// การ์ดเครื่องพรินเตอร์ 1 เครื่อง พร้อมรูป (กดดูรูปขนาดใหญ่ได้)
// แก้ไขรูปเครื่องจากหน้า Ink & Toner โดยไม่ต้องเข้าหน้า Printer Health
const PrinterPhotoEditModal = ({ printer, onClose, onChanged }) => (
    <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-label="รูปเครื่องพรินเตอร์" className="w-full max-w-lg rounded-3xl bg-white shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                        <h3 className="font-black text-slate-800">รูปเครื่องพรินเตอร์</h3>
                        <p className="text-xs text-slate-500 truncate">{printer.Name} · {printer.IpAddress}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="ปิด" className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
                </div>
                <PhotoSlot printer={printer} field="PhotoUrl" endpoint="photo" label="รูปเครื่อง" canEdit enablePaste onChanged={onChanged} />
            </div>
        </div>
    </Portal>
);

const CompatPrinterCard = ({ link: l, onPhotoChanged }) => {
    const [viewing, setViewing] = useState(false);
    const [editing, setEditing] = useState(false);
    const canEditPrinter = useCanAct('printer-health', 'edit');
    const photoSrc = l.PhotoUrl ? `${API_URL}${l.PhotoUrl}` : null;
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 flex gap-3 shadow-sm">
            {photoSrc ? (
                <button type="button" onClick={() => setViewing(true)} className="shrink-0 w-16 h-16 rounded-2xl border border-slate-100 bg-white p-1 overflow-hidden cursor-zoom-in shadow-inner">
                    <img src={photoSrc} alt={l.Name} loading="lazy" className="w-full h-full object-contain rounded-xl" />
                </button>
            ) : (
                <div className="shrink-0 w-16 h-16 rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-300">
                    <Printer size={20} />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 truncate">{l.Name}</span>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">{l.Model || 'ไม่ระบุรุ่น'}</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                    {l.IpAddress}{l.Location ? ` · ${l.Location}` : ''}{l.Factory ? ` · ${l.Factory}` : ''}
                </p>
                <div className="mt-1"><ConnectionBadge type={l.ConnectionType} host={l.UsbHost} /></div>
                {l.Remark && <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 inline-block">เงื่อนไข: {l.Remark}</p>}
            </div>
            {canEditPrinter && (
                <button type="button" onClick={() => setEditing(true)} title="เปลี่ยนรูปเครื่อง" aria-label={`เปลี่ยนรูปเครื่อง ${l.Name}`}
                    className="self-start shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                    <Pencil size={13} />
                </button>
            )}
            {viewing && (
                <PhotoLightbox src={photoSrc} alt={l.Name} caption={`${l.Name} · ${l.Model || ''}`} onClose={() => setViewing(false)} />
            )}
            {editing && (
                <PrinterPhotoEditModal printer={l} onClose={() => setEditing(false)} onChanged={() => onPhotoChanged?.()} />
            )}
        </div>
    );
};

const CompatList = ({ links, onPhotoChanged }) => {
    if (!links || links.length === 0) {
        return <p className="text-xs text-slate-400 py-2">ยังไม่ได้ผูกเครื่องใดกับหมึกนี้</p>;
    }
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {links.map(l => (
                <CompatPrinterCard key={l.PrinterId} link={l} onPhotoChanged={onPhotoChanged} />
            ))}
        </div>
    );
};

// ตัวเลือกสีหมึก (ทั้งหมด + 4 สี)
const TONER_OPTIONS = [
    { key: 'all', label: 'ทั้งหมด', dot: null },
    { key: 'black', label: 'ดำ', dot: 'bg-slate-800' },
    { key: 'cyan', label: 'ฟ้า', dot: 'bg-cyan-500' },
    { key: 'magenta', label: 'ชมพู', dot: 'bg-pink-500' },
    { key: 'yellow', label: 'เหลือง', dot: 'bg-yellow-400' },
];

// ผูกเครื่องพรินเตอร์ให้หลายรายการหมึกพร้อมกัน — เพิ่มเครื่องที่เลือกเข้าทุกรายการ (ไม่ลบเครื่องเดิม)
const BulkLinkModal = ({ codes, compatMap, onClose, onSaved }) => {
    const [printers, setPrinters] = useState([]);
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState({}); // { [PrinterId]: true }
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch(`${API_BASE}/printer-health`)
            .then((res) => (res.ok ? res.json() : []))
            .then(setPrinters)
            .catch(() => setPrinters([]));
    }, []);

    const q = search.trim().toLowerCase();
    const filtered = printers.filter((p) => !q || [p.Name, p.Model, p.IpAddress, p.Location, p.Factory]
        .some((v) => (v || '').toLowerCase().includes(q)));
    const pickedIds = Object.keys(picked).filter((k) => picked[k]).map(Number);

    const save = async () => {
        if (pickedIds.length === 0) return;
        setSaving(true);
        setError('');
        let failed = 0;
        await Promise.all(codes.map(async (code) => {
            const existing = compatMap[code] || [];
            const existingIds = new Set(existing.map((l) => l.PrinterId));
            const items = [
                ...existing.map((l) => ({ PrinterId: l.PrinterId, Remark: l.Remark || '' })),
                ...pickedIds.filter((id) => !existingIds.has(id)).map((id) => ({ PrinterId: id, Remark: '' })),
            ];
            try {
                const res = await fetch(`${API_BASE}/ink-toner/${encodeURIComponent(code)}/printers`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items }),
                });
                if (!res.ok) failed++;
            } catch {
                failed++;
            }
        }));
        setSaving(false);
        onSaved(failed === 0);
        if (failed > 0) {
            setError(`บันทึกไม่สำเร็จ ${failed} จาก ${codes.length} รายการ ลองอีกครั้ง`);
            toast.error(`ผูกเครื่องไม่สำเร็จ ${failed} รายการ`);
            return;
        }
        toast.success(`ผูกเครื่อง ${pickedIds.length} เครื่องกับ ${codes.length} รายการแล้ว`);
        onClose();
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
                <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
                        <div className="min-w-0">
                            <h3 className="font-black text-slate-800">ผูกเครื่องกับหมึกที่เลือก</h3>
                            <p className="text-xs text-slate-500 mt-0.5">{codes.length} รายการ · เลือกเครื่องแล้วกดบันทึก เครื่องเดิมของแต่ละรายการจะยังอยู่</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                                {codes.slice(0, 6).map((c) => (
                                    <span key={c} className="font-mono text-[10px] font-bold text-cyan-800 bg-cyan-50 rounded px-1.5 py-0.5">{c}</span>
                                ))}
                                {codes.length > 6 && <span className="text-[10px] text-slate-400">+{codes.length - 6}</span>}
                            </div>
                        </div>
                        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" aria-label="ปิด"><X size={18} /></button>
                    </div>

                    <div className="p-5 space-y-3 overflow-y-auto">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="ค้นหาชื่อ รุ่น IP หรือตำแหน่ง..."
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                        />
                        <p className="text-xs text-slate-500">เลือกแล้ว <strong className="text-indigo-600">{pickedIds.length}</strong> เครื่อง</p>
                        <div className="space-y-1.5">
                            {filtered.map((p) => (
                                <label key={p.PrinterId} className={`flex items-center gap-3 rounded-xl border px-3 py-2 cursor-pointer transition-colors ${picked[p.PrinterId] ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    <input
                                        type="checkbox"
                                        checked={!!picked[p.PrinterId]}
                                        onChange={(e) => setPicked((prev) => ({ ...prev, [p.PrinterId]: e.target.checked }))}
                                        className="h-4 w-4 accent-indigo-600"
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-bold text-slate-800 truncate">{p.Name}</span>
                                        <span className="block text-[11px] text-slate-500 truncate">{p.Model || 'ไม่ระบุรุ่น'} · {p.IpAddress}{p.Location ? ` · ${p.Location}` : ''}</span>
                                    </span>
                                </label>
                            ))}
                            {filtered.length === 0 && <p className="text-center text-xs text-slate-400 py-6">ไม่พบเครื่อง</p>}
                        </div>
                        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}
                    </div>

                    <div className="flex gap-3 p-5 border-t border-slate-100">
                        <button type="button" onClick={onClose} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-200">ยกเลิก</button>
                        <button type="button" onClick={save} disabled={saving || pickedIds.length === 0}
                            className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                            {saving ? 'กำลังบันทึก...' : `เพิ่มเข้า ${codes.length} รายการ`}
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

const InkTonerStockPage = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // รับ ?q=รหัสหมึก จากลิงก์ในหน้า Printer Health ให้ค้นหาไว้ให้เลย
    const [searchTerm, setSearchTerm] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
    // มือถือเริ่มที่มุมมองการ์ด (ตารางกว้างเกินจอ)
    const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'list'));
    const [showLowStock, setShowLowStock] = useState(false);
    const [showUnlinked, setShowUnlinked] = useState(false); // กรองเฉพาะหมึกที่ยังไม่ผูกเครื่อง
    const [colorFilter, setColorFilter] = useState('all');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [selected, setSelected] = useState({}); // { [Prt_Code]: true } รายการที่เลือกไว้ผูกเครื่องพร้อมกัน
    const [bulkOpen, setBulkOpen] = useState(false);
    const [gallery, setGallery] = useState(null); // { items, index } แกลเลอรีรูปหมึกในหน้าปัจจุบัน
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState(null);
    const [compatMap, setCompatMap] = useState({}); // { [Prt_Code]: [{ PrinterId, Remark, Name, Model, ... }] }
    const [compatItem, setCompatItem] = useState(null); // รายการที่เปิด modal "เครื่องที่ใช้ได้"
    const [expanded, setExpanded] = useState({}); // { [Prt_Code]: true } แถวที่กางดูเครื่องอยู่
    const canEditCompat = useCanAct('ink-toner', 'edit');
    const itemsPerPage = 20;

    const fetchCompat = async () => {
        try {
            const res = await fetch(`${API_BASE}/ink-toner/compat`);
            if (!res.ok) throw new Error('Failed to fetch compat');
            const json = await res.json();
            const map = {};
            (json.data || []).forEach(row => {
                (map[row.Prt_Code] ||= []).push(row);
            });
            setCompatMap(map);
        } catch (err) {
            console.error('Error fetching ink-toner compat:', err);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/ink-toner`);
            if (!res.ok) throw new Error('Failed to fetch data');
            const json = await res.json();
            setData(json);
            setLastUpdated(new Date());
            fetchCompat();
        } catch (err) {
            console.error('Error fetching ink & toner stock:', err);
            setError('ไม่สามารถดึงข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // ตรวจสีหมึกจากสเปค (ใช้ทั้งตัวกรองสีและการแสดงผล)
    const getTonerType = (item) => detectTonerType(item.Spect, item.Prt_Name);

    // กฎสถานะ (ประกาศก่อนใช้งานทั้งการกรอง การเรียง และการแสดงผล)
    // ต่ำ/ใกล้หมด: ต้องตั้ง Minimum > 0 เท่านั้น (ตรงกับหน้า Stock)
    const isLowStock = (item) => item.Minimum > 0 && item.CurrentStock <= item.Minimum;
    const isOutOfStock = (item) => item.CurrentStock <= 0;
    // ต่ำกว่า Safety: อยู่เหนือระดับใกล้หมด แต่ต่ำกว่าค่า Safety
    const isBelowSafety = (item) => item.SaftyStock > 0 && item.CurrentStock < item.SaftyStock && !isLowStock(item) && !isOutOfStock(item);
    const isHealthy = (item) => item.CurrentStock >= item.SaftyStock;
    // อันดับสถานะสำหรับการเรียง: หมด < ใกล้หมด < ต่ำกว่า Safety < ปกติ
    const statusRank = (item) => (isOutOfStock(item) ? 0 : isLowStock(item) ? 1 : isBelowSafety(item) ? 2 : 3);

    // Filtered data
    const filteredData = data.filter(item => {
        const q = searchTerm.trim().toLowerCase();
        // ค้นจากชื่อ/รุ่น/IP ของเครื่องที่ผูกไว้ด้วย เช่น พิมพ์ "IM 2500" แล้วเจอหมึกที่ใช้กับรุ่นนี้
        const linkedPrinterMatch = (compatMap[item.Prt_Code] || []).some(c =>
            [c.Name, c.Model, c.IpAddress, c.Location].some(v => (v || '').toLowerCase().includes(q)));
        const matchesSearch = !q ||
            item.Prt_Code?.toLowerCase().includes(q) ||
            item.Prt_Name?.toLowerCase().includes(q) ||
            item.Vender?.toLowerCase().includes(q) ||
            item.Spect?.toLowerCase().includes(q) ||
            linkedPrinterMatch;
        const matchesLowStock = !showLowStock || isLowStock(item);
        const matchesUnlinked = !showUnlinked || (compatMap[item.Prt_Code] || []).length === 0;
        const matchesColor = colorFilter === 'all' || getTonerType(item) === colorFilter;
        return matchesSearch && matchesLowStock && matchesUnlinked && matchesColor;
    });

    // Sorting Data
    const SORT_VALUE = {
        Prt_Code: p => p.Prt_Code || '',
        Prt_Name: p => p.Prt_Name || '',
        Spect: p => p.Spect || '',
        CurrentStock: p => Number(p.CurrentStock) || 0,
        SaftyStock: p => Number(p.SaftyStock) || 0,
        Minimum: p => Number(p.Minimum) || 0,
        Um: p => p.Um || '',
        Vender: p => p.Vender || '',
        status: p => statusRank(p),
    };
    const sortedData = [...filteredData].sort((a, b) => {
        if (!sortConfig) return 0;
        const get = SORT_VALUE[sortConfig.key] || (p => p[sortConfig.key] || '');
        const va = get(a), vb = get(b);
        const r = typeof va === 'string' ? va.localeCompare(vb, 'th') : va - vb;
        return sortConfig.direction === 'asc' ? r : -r;
    });

    const handleSort = (key) => {
        const direction = sortConfig?.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
        setSortConfig({ key, direction });
        setCurrentPage(1);
    };

    // หัวคอลัมน์ที่คลิกเรียงได้ (ใช้ซ้ำทุกคอลัมน์)
    const sortTh = (key, label, align = 'text-left', extra = '') => {
        const active = sortConfig?.key === key;
        const Arrow = !active ? ArrowUpDown : sortConfig.direction === 'asc' ? ChevronUp : ChevronDown;
        return (
            <th className={`px-3 py-2 ${align} ${extra} cursor-pointer select-none hover:bg-slate-100 transition-colors ${active ? 'text-indigo-700' : ''}`}
                onClick={() => handleSort(key)} aria-sort={active ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <span className={`inline-flex items-center gap-1 ${align === 'text-center' ? 'justify-center' : ''}`}>
                    {label}<Arrow size={11} className={active ? 'text-indigo-600' : 'text-slate-300'} />
                </span>
            </th>
        );
    };

    // Pagination
    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const paginatedData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, showLowStock, showUnlinked, colorFilter]);

    // Stats
    const totalItems = data.length;
    const lowStockCount = data.filter(isLowStock).length;
    const uniqueVendors = [...new Set(data.map(item => item.Vender).filter(Boolean))].length;
    const outOfStockCount = data.filter(item => item.CurrentStock <= 0).length;
    const unlinkedCount = data.filter(item => (compatMap[item.Prt_Code] || []).length === 0).length;

    // แกลเลอรีรูปของรายการที่เห็นในหน้านี้ (กดรูปไหนก็เริ่มที่รูปนั้น แล้วเลื่อนต่อได้)
    const openGallery = (index) => {
        const items = paginatedData.map((i) => ({
            src: `${API_BASE}/ctsp-pic/${encodeURIComponent(i.Prt_Code)}`,
            alt: i.Prt_Name,
            caption: `${i.Prt_Code} · ${i.Prt_Name}`,
        }));
        setGallery({ items, index });
    };

    const selectedCodes = Object.keys(selected).filter((k) => selected[k]);
    const toggleSelect = (code) => setSelected((prev) => ({ ...prev, [code]: !prev[code] }));
    const pageAllSelected = paginatedData.length > 0 && paginatedData.every((i) => selected[i.Prt_Code]);
    const togglePageAll = () => {
        setSelected((prev) => {
            const next = { ...prev };
            paginatedData.forEach((i) => { next[i.Prt_Code] = !pageAllSelected; });
            return next;
        });
    };



    // Gradient for card icon & background based on toner color
    const getTonerGradient = (item) => {
        switch (getTonerType(item)) {
            case 'cyan':    return 'from-cyan-400 to-cyan-600';
            case 'black':   return 'from-slate-700 to-slate-900';
            case 'magenta': return 'from-pink-400 to-pink-600';
            case 'yellow':  return 'from-yellow-400 to-yellow-500';
            default:        return 'from-indigo-500 to-indigo-600';
        }
    };

    // Badge background color
    const getTonerBadgeBg = (item) => {
    switch (getTonerType(item)) {
        case 'cyan':    return 'bg-cyan-500';
        case 'black':   return 'bg-slate-800';
        case 'magenta': return 'bg-pink-500';
        case 'yellow':  return 'bg-yellow-500';
        default:        return 'bg-indigo-600';
    }
    };

    // Icon text color for Droplet (for yellow we use darker text)
    const getTonerIconColor = (item) => {
        return getTonerType(item) === 'yellow' ? 'text-yellow-900' : 'text-white';
    };

    // Color helper for stock status
    const getStockColor = (item) => {
        if (isOutOfStock(item)) return 'text-red-600';
        if (isLowStock(item)) return 'text-amber-700'; // เปลี่ยนสีตัวเลขตอนใกล้หมดให้เป็นแดงด้วย
        if (isHealthy(item)) return 'text-emerald-600';
        return 'text-amber-500'; 
    };

    // โหลดครั้งแรกแสดงโครงหน้า (skeleton) ตอนรีเฟรชให้คงหน้าเดิม (ค้นหา/ตัวกรองยังอยู่)
    if (loading && data.length === 0) {
        return <PageSkeleton variant="list" />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">เกิดข้อผิดพลาด</h3>
                <p className="text-slate-500">{error}</p>
                <button
                    onClick={fetchData}
                    className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                    ลองใหม่อีกครั้ง
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    icon={Printer}
                    title="รายการทั้งหมด"
                    value={totalItems.toLocaleString()}
                    color="from-blue-500 to-blue-600"
                />
                <StatCard
                    icon={AlertTriangle}
                    title="สต็อกต่ำ (กดเพื่อกรอง)"
                    value={lowStockCount}
                    color="from-orange-500 to-orange-600"
                    onClick={() => setShowLowStock(v => !v)}
                    active={showLowStock}
                />
                <StatCard
                    icon={Package}
                    title="หมดสต็อก"
                    value={outOfStockCount}
                    color="from-red-500 to-red-600"
                />
                <StatCard
                    icon={Truck}
                    title="ผู้จัดจำหน่าย"
                    value={uniqueVendors}
                    color="from-purple-500 to-purple-600"
                />
            </div>

            {/* Header Controls */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4"
            >
                <div>
                    <h2 className="text-3xl font-black mb-1 text-slate-800">INK & TONER STOCK</h2>
                    <p className="text-slate-500 font-medium">ข้อมูลสต็อกหมึกและโทนเนอร์จากระบบ DCI</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    {/* 1. ปุ่ม Refresh */}
                    {/* 1. ปุ่ม Refresh (เด่น) + เวลาอัปเดตล่าสุดของข้อมูลจาก DCI */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-2 h-[42px]"
                            title="ดึงข้อมูลสต็อกล่าสุดจาก DCI"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            <span className="text-sm">{loading ? 'กำลังโหลด...' : 'รีเฟรช'}</span>
                        </button>
                        <span className="hidden xl:inline-flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
                            <Clock size={12} />
                            {lastUpdated ? `ข้อมูล ณ ${lastUpdated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'ยังไม่มีข้อมูล'}
                        </span>
                    </div>

                    {/* 1b. ปุ่มกรองหมึกที่ยังไม่ผูกเครื่อง */}
                    <button
                        onClick={() => setShowUnlinked(!showUnlinked)}
                        aria-pressed={showUnlinked}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all font-bold text-sm h-[42px] ${showUnlinked
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm ring-2 ring-indigo-100'
                            : 'bg-white text-slate-500 border-slate-200 hover:text-indigo-600 hover:border-indigo-200'
                            }`}
                    >
                        <Link2 size={14} />
                        <span>ยังไม่ผูกเครื่อง</span>
                        <span className={`rounded-full px-1.5 text-[10px] ${showUnlinked ? 'bg-indigo-100' : 'bg-slate-100 text-slate-500'}`}>{unlinkedCount}</span>
                    </button>

                    {/* 2. ปุ่ม สต็อกต่ำ */}
                    <button
                        onClick={() => setShowLowStock(!showLowStock)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all font-bold text-sm h-[42px] ${showLowStock
                            ? 'bg-red-50 text-red-600 border-red-200 shadow-sm ring-2 ring-red-100'
                            : 'bg-white text-slate-500 border-slate-200 hover:text-red-500 hover:border-red-200'
                            }`}
                    >
                        <AlertTriangle size={14} className={showLowStock ? "fill-current" : ""} />
                        <span>สต็อกต่ำ</span>
                    </button>

                    {/* 3. ปุ่ม View Mode Toggle */}
                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm h-[42px]">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-2.5 rounded-lg transition-all flex items-center ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                        >
                            <List size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`px-2.5 rounded-lg transition-all flex items-center ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                        >
                            <LayoutGrid size={16} />
                        </button>
                    </div>

                    {/* 4. Search */}
                    <div className="relative flex-1 min-w-[200px] sm:max-w-xs h-[42px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="ค้นหาหมึก/โทนเนอร์..."
                            className="w-full h-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </motion.div>

            {/* ตัวกรองสีหมึก */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 mr-1">สีหมึก:</span>
                {TONER_OPTIONS.map(opt => {
                    const count = opt.key === 'all' ? data.length : data.filter(i => getTonerType(i) === opt.key).length;
                    const active = colorFilter === opt.key;
                    return (
                        <button key={opt.key} type="button" onClick={() => setColorFilter(opt.key)} aria-pressed={active}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${active ? 'bg-slate-800 border-slate-800 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-sm'}`}>
                            {opt.dot && <span className={`h-2.5 w-2.5 rounded-full ${opt.dot} ring-2 ring-white`} />}
                            {opt.label}
                            <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* แถบเลือกหลายรายการ */}
            {selectedCodes.length > 0 && (
                <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/95 backdrop-blur px-4 py-3 shadow-md">
                    <span className="text-sm font-bold text-indigo-800">เลือกไว้ {selectedCodes.length} รายการ</span>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setSelected({})} className="text-xs font-bold text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-white">
                            ล้างการเลือก
                        </button>
                        {canEditCompat && (
                            <button type="button" onClick={() => setBulkOpen(true)}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg shadow-sm">
                                <Link2 size={12} /> ผูกเครื่องพรินเตอร์
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* LIST VIEW */}
            {viewMode === 'list' && (
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto"
                >
                    <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-xs font-semibold text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="pl-3 pr-1 py-2 w-8">
                                    <input type="checkbox" aria-label="เลือกทั้งหน้า" checked={pageAllSelected} onChange={togglePageAll} className="h-4 w-4 accent-indigo-600 cursor-pointer" />
                                </th>
                                {sortTh('Prt_Code', 'รหัส', 'text-left', 'pl-2')}
                                {sortTh('Prt_Name', 'ชื่อรายการ')}
                                {sortTh('Spect', 'สเปค', 'text-left', 'hidden md:table-cell')}
                                <th className="px-3 py-2 text-left whitespace-nowrap">เครื่องที่ใช้ได้</th>
                                {sortTh('CurrentStock', 'คงเหลือ', 'text-center')}
                                {sortTh('SaftyStock', 'Safety', 'text-center', 'hidden lg:table-cell')}
                                {sortTh('Minimum', 'Min', 'text-center', 'hidden lg:table-cell')}
                                {sortTh('Um', 'หน่วย', 'text-left', 'hidden lg:table-cell')}
                                {sortTh('Vender', 'ผู้จัดจำหน่าย', 'text-left', 'hidden xl:table-cell')}
                                {sortTh('status', 'สถานะ', 'text-center')}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.map((item, idx) => {
                                const out = isOutOfStock(item);
                                const low = !out && isLowStock(item);
                                const below = !out && !low && isBelowSafety(item);
                                const isOpen = !!expanded[item.Prt_Code];
                                const linkCount = (compatMap[item.Prt_Code] || []).length;
                                return (
                                    <Fragment key={item.Prt_Code}>
                                    <motion.tr
                                        key={item.Prt_Code}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(idx, 15) * 0.02 }}
                                        className="bg-white hover:bg-indigo-50/50 transition-colors"
                                    >
                                        <td className="pl-3 pr-1 py-2.5">
                                            <input type="checkbox" aria-label={`เลือก ${item.Prt_Code}`} checked={!!selected[item.Prt_Code]} onChange={() => toggleSelect(item.Prt_Code)} className="h-4 w-4 accent-indigo-600 cursor-pointer" />
                                        </td>
                                        <td className="relative px-3 py-2.5">
                                            {/* แถบสีตามหมึกด้านซ้ายของแถว ดูสีได้ในระยะไกล */}
                                            <span aria-hidden="true" className={`absolute inset-y-1 left-0 w-1 rounded-r-full bg-gradient-to-b ${getTonerGradient(item)}`} />
                                            <div className="flex items-center gap-2.5">
                                                <div className="relative shrink-0">
                                                    <CtspPicImage
                                                        code={item.Prt_Code}
                                                        alt={item.Prt_Name}
                                                        enlargeable
                                                        className="w-12 h-12 rounded-xl p-1 ring-1 ring-slate-200 shadow-sm"
                                                        onEnlarge={() => openGallery(idx)}
                                                        fallback={
                                                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getTonerGradient(item)} flex items-center justify-center shadow-sm`}>
                                                                <Droplet size={18} className={getTonerIconColor(item)} />
                                                            </div>
                                                        }
                                                    />
                                                    {/* จุดสีของหมึกที่มุมรูป */}
                                                    <span title={item.Spect || ''} aria-hidden="true"
                                                        className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-br ${getTonerGradient(item)} ring-2 ring-white shadow`} />
                                                </div>
                                                <span className="inline-flex items-center gap-1">
                                                    <span className="font-mono text-[11px] font-semibold text-slate-500">{item.Prt_Code}</span>
                                                    <CopyButton text={item.Prt_Code} title="คัดลอกรหัส" />
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="block font-semibold text-slate-800 text-[13px] whitespace-nowrap">{item.Prt_Name}</span>
                                        </td>
                                        <td className="hidden md:table-cell px-3 py-2.5 text-slate-500 text-[11px] whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1">
                                                {item.Spect || '-'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                <button type="button" aria-expanded={isOpen}
                                                    onClick={() => setExpanded(prev => ({ ...prev, [item.Prt_Code]: !prev[item.Prt_Code] }))}
                                                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200">
                                                    <ChevronDown size={11} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                                    {linkCount} เครื่อง
                                                </button>
                                                {canEditCompat && (
                                                    <button type="button" onClick={() => setCompatItem(item)} title="แก้ไขเครื่องที่ใช้ได้"
                                                        className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                                                        <Pencil size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <span className={`font-mono font-black text-sm tabular-nums ${getStockColor(item)}`}>{item.CurrentStock ?? 0}</span>
                                        </td>
                                        <td className="hidden lg:table-cell px-3 py-2.5 text-center text-slate-500 font-mono text-[11px] tabular-nums">{item.SaftyStock ?? 0}</td>
                                        <td className="hidden lg:table-cell px-3 py-2.5 text-center text-slate-500 font-mono text-[11px] tabular-nums">{item.Minimum ?? 0}</td>
                                        <td className="hidden lg:table-cell px-3 py-2.5 text-slate-500 text-[11px]">{item.Um || '-'}</td>
                                        <td className="hidden xl:table-cell px-3 py-2.5">
                                            <span className="inline-block max-w-[180px] truncate rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">{item.Vender || '-'}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            {out ? <Pill tone="rose" label="หมด" />
                                                : low ? <Pill tone="amber" label="ใกล้หมด" />
                                                    : below ? <Pill tone="orange" label="ต่ำกว่า Safety" />
                                                        : <Pill tone="emerald" label="ปกติ" />}
                                        </td>
                                    </motion.tr>
                                    {isOpen && (
                                        <tr className="bg-slate-50/70">
                                            <td colSpan={11} className="px-4 py-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">เครื่องที่ใช้หมึกนี้ได้ ({linkCount})</span>
                                                    {canEditCompat && (
                                                        <button type="button" onClick={() => setCompatItem(item)}
                                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
                                                            <Pencil size={11} /> แก้ไขรายการเครื่อง
                                                        </button>
                                                    )}
                                                </div>
                                                <CompatList links={compatMap[item.Prt_Code] || []} onPhotoChanged={fetchCompat} />
                                            </td>
                                        </tr>
                                    )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredData.length === 0 && (
                        <div className="text-center py-10 text-slate-400 text-xs">ไม่พบรายการ</div>
                    )}
                </motion.div>
            )}

            {/* GRID VIEW */}
            {viewMode === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {paginatedData.map((item, idx) => (
                        <motion.div
                            key={item.Prt_Code}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            // ✅ เปลี่ยนสีพื้นหลังตรงนี้
                            className={`group rounded-3xl border p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden ${
                                isOutOfStock(item) 
                                    ? 'bg-white border-rose-300 ring-1 ring-rose-200' 
                                    : isLowStock(item) 
                                        ? 'bg-white border-amber-300 ring-1 ring-amber-100' 
                                        : 'bg-white border-slate-100'
                            }`}
                        >
                            {/* Decorative Gradient Background */}
                            <div className={`absolute top-0 left-0 w-full h-20 bg-gradient-to-br ${getTonerGradient(item)} opacity-10 z-0`}></div>

                            {/* Status Badge */}
                            {(isOutOfStock(item) || isLowStock(item)) && (
                                <div className="absolute top-2 right-2 z-20">
                                    {isOutOfStock(item) ? (
                                        <span className="text-[9px] font-bold text-white bg-red-600 px-2 py-0.5 rounded-full shadow-sm">หมดสต็อก</span>
                                    ) : (
                                        <span className="text-[9px] font-bold text-white bg-red-400 px-2 py-0.5 rounded-full shadow-sm">ใกล้หมด</span>
                                    )}
                                </div>
                            )}

                            <div className="relative z-10 flex flex-col items-center text-center">
                                {/* Icon */}
                                {/* Icon */}
                                <div className={`w-16 h-16 mb-2 rounded-xl overflow-hidden shadow-sm flex items-center justify-center border-2 border-white group-hover:scale-105 transition-transform bg-gradient-to-br ${getTonerGradient(item)}`}>
                                    <Droplet size={24} className={getTonerIconColor(item)} />
                                </div>

                                {/* Photo */}
                                <CtspPicImage
                                    code={item.Prt_Code}
                                    alt={item.Prt_Name}
                                    cover
                                    enlargeable
                                    onEnlarge={() => openGallery(idx)}
                                    className="w-full h-36 mb-3 rounded-2xl shadow-sm border border-slate-100 p-1 bg-white group-hover:scale-[1.02] transition-transform"
                                    fallback={<></>}
                                />

                                <h3 className="font-bold text-slate-800 text-xs mb-1 line-clamp-2 min-h-[2rem]">{item.Prt_Name}</h3>
                                <span className="inline-flex items-center gap-1 mb-2">
                                    <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full shadow-sm text-white ${getTonerBadgeBg(item)}`}>
                                        {item.Prt_Code}
                                    </span>
                                    <CopyButton text={item.Prt_Code} title="คัดลอกรหัส" />
                                </span>

                                <div className="grid grid-cols-2 gap-2 w-full pt-2 border-t border-black/5 mb-2">
                                    <div>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">คงเหลือ</p>
                                        <p className={`text-base font-black ${getStockColor(item)}`}>
                                            {item.CurrentStock ?? 0}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Safety</p>
                                        <p className="text-base font-black text-slate-700">{item.SaftyStock ?? 0}</p>
                                    </div>
                                </div>

                                {/* Vendor Info */}
                                <div className="w-full mb-1 px-1">
                                    <div className="flex items-center gap-2 bg-white/60 border border-black/5 rounded-lg p-1.5">
                                        <div className="p-1 bg-white rounded-md shadow-sm text-purple-500">
                                            <Truck size={12} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[9px] text-slate-500 font-bold uppercase leading-none mb-0.5">ผู้จัดจำหน่าย</p>
                                            <p className="text-[10px] font-bold text-slate-700 truncate">{item.Vender || '-'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Unit & Spec */}
                                <div className="w-full px-1 mt-1">
                                    <div className="flex items-center justify-between text-[9px] text-slate-500">
                                        <span>หน่วย: <strong className="text-slate-700">{item.Um || '-'}</strong></span>
                                        <span>Min: <strong className="text-slate-700">{item.Minimum ?? 0}</strong></span>
                                    </div>
                                </div>

                                {/* Compatible printers */}
                                <button type="button" onClick={() => setCompatItem(item)}
                                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50">
                                    <Printer size={11} />
                                    เครื่องที่ใช้ได้: {(compatMap[item.Prt_Code] || []).length} เครื่อง
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {filteredData.length === 0 && viewMode === 'grid' && (
                <div className="text-center py-10 text-slate-400 text-xs">ไม่พบรายการ</div>
            )}

            {bulkOpen && (
                <BulkLinkModal
                    codes={selectedCodes}
                    compatMap={compatMap}
                    onClose={() => setBulkOpen(false)}
                    onSaved={(ok) => { fetchCompat(); if (ok) setSelected({}); }}
                />
            )}

            {gallery && (
                <PhotoLightbox items={gallery.items} startIndex={gallery.index} onClose={() => setGallery(null)} />
            )}

            {compatItem && (
                <InkTonerCompatModal
                    item={compatItem}
                    links={compatMap[compatItem.Prt_Code] || []}
                    canEdit={canEditCompat}
                    onClose={() => setCompatItem(null)}
                    onSaved={() => fetchCompat()}
                />
            )}

            {/* Pagination */}
            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                totalItems={filteredData.length}
            />

        </div>
    );
};

export default InkTonerStockPage;
