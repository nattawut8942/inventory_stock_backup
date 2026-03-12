import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Shield, Clock, AlertTriangle, DollarSign, Server, Monitor, Cpu, Wifi,
    Plus, Edit2, Trash2, X, Search, ChevronDown, Eye, FileText, Calendar,
    MapPin, Tag, Hash, Building, CreditCard, RefreshCw, CheckCircle, XCircle,
    HardDrive, Globe, Wrench, Printer, ChevronLeft, ChevronRight,
    ChevronUp, ArrowUpDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AlertModal from '../components/AlertModal';
import Portal from '../components/Portal';
import { API_BASE } from '../config/api';

// ─── CONSTANTS ───────────────────────────
const CATEGORIES = [
    { key: 'HARDWARE', label: 'Hardware MA', icon: Server, color: 'from-blue-500 to-blue-600', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    { key: 'SOFTWARE', label: 'Software License', icon: Globe, color: 'from-violet-500 to-purple-600', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
    { key: 'SERVICE', label: 'Services', icon: Wrench, color: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
    { key: 'RENTAL', label: 'Rental', icon: Printer, color: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
];

const STATUS_OPTIONS = ['Active', 'Expiring', 'Expired', 'Cancelled'];
const STATUS_COLORS = {
    Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Expiring: 'bg-amber-100 text-amber-700 border-amber-200',
    Expired: 'bg-red-100 text-red-700 border-red-200',
    Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const SW_SERVICE_TYPES = ['Subscription', 'Perpetual', 'Software Service Support (SSS)', 'SaaS', 'Other'];

// ─── HELPER: Days remaining ──────────────
const getDaysRemaining = (endDate) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
};

const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDuration = (start, end) => {
    if (!start || !end) return '-';
    const s = new Date(start);
    const e = new Date(end);
    const diffMs = e - s;
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days < 0) return 'หมดอายุแล้ว';
    if (days <= 30) return `${days} วัน`;
    if (days <= 365) return `${Math.round(days / 30)} เดือน`;
    const years = Math.floor(days / 365);
    const months = Math.round((days % 365) / 30);
    return months > 0 ? `${years} ปี ${months} เดือน` : `${years} ปี`;
};

// ─── STAT CARD ───────────────────────────
const StatCard = ({ icon: Icon, title, value, color, subtitle, onClick, isActive }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={onClick}
        className={`bg-white rounded-2xl p-5 shadow-lg border transition-all ${onClick ? 'cursor-pointer hover:shadow-xl' : ''} ${isActive ? 'ring-2 ring-indigo-500 border-transparent scale-[1.02]' : 'border-slate-200'}`}
    >
        <div className="flex items-start justify-between">
            <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">{title}</p>
                <h3 className="text-2xl font-black text-slate-900">{value}</h3>
                {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
            </div>
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
                <Icon className="w-6 h-6 text-white" />
            </div>
        </div>
    </motion.div>
);

// ─── MAIN PAGE COMPONENT ─────────────────
const MALicensePage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'Staff';

    // Data States
    const [items, setItems] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [locations, setLocations] = useState([]);
    const [maTypes, setMaTypes] = useState([]);
    const [loading, setLoading] = useState(true);

    // UI States
    const [activeTab, setActiveTab] = useState('HARDWARE');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [cardFilter, setCardFilter] = useState('all'); // 'all', 'active', 'expiringSoon', 'expired'
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
    const [detailItem, setDetailItem] = useState(null);
    const [formModal, setFormModal] = useState({ isOpen: false, item: null }); // null = create, object = edit
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });

    // Pagination and Sort State
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState(null);
    const itemsPerPage = 10;

    // ─── FETCH DATA ──────────────────────
    const fetchItems = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/ma`);
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (err) {
            console.error('Fetch MA Items Error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchVendors = async () => {
        try {
            const res = await fetch(`${API_BASE}/vendors`);
            if (res.ok) setVendors(await res.json());
        } catch (err) { console.error(err); }
    };

    const fetchLocations = async () => {
        try {
            const res = await fetch(`${API_BASE}/locations`);
            if (res.ok) setLocations(await res.json());
        } catch (err) { console.error(err); }
    };

    const fetchMATypes = async () => {
        try {
            const res = await fetch(`${API_BASE}/ma-types`);
            if (res.ok) setMaTypes(await res.json());
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        fetchItems();
        fetchVendors();
        fetchLocations();
        fetchMATypes();
    }, []);

    // ─── COMPUTED DATA ───────────────────
    const filteredItems = useMemo(() => {
        // Reset to page 1 when filters change
        setCurrentPage(1);
        return items
            .filter(i => i.Category === activeTab)
            .filter(i => statusFilter === 'all' || i.Status === statusFilter)
            .filter(i => {
                if (cardFilter === 'all') return true;
                const days = getDaysRemaining(i.EndDate);
                if (cardFilter === 'active') return i.Status === 'Active';
                if (cardFilter === 'expiringSoon') return days !== null && days > 0 && days <= 90 && i.Status !== 'Cancelled';
                if (cardFilter === 'expired') return days !== null && days <= 0 && i.Status !== 'Cancelled';
                return true;
            })
            .filter(i => {
                if (!searchTerm) return true;
                const term = searchTerm.toLowerCase();
                return (
                    (i.ItemName || '').toLowerCase().includes(term) ||
                    (i.SubType || '').toLowerCase().includes(term) ||
                    (i.Brand || '').toLowerCase().includes(term) ||
                    (i.SerialNumber || '').toLowerCase().includes(term) ||
                    (i.PONumber || '').toLowerCase().includes(term) ||
                    (i.VendorName || '').toLowerCase().includes(term) ||
                    (i.ServiceNumber || '').toLowerCase().includes(term)
                );
            });
    }, [items, activeTab, statusFilter, cardFilter, searchTerm]);

    const sortedItems = useMemo(() => {
        let sortableItems = [...filteredItems];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key] || '';
                let bValue = b[sortConfig.key] || '';

                if (sortConfig.key === '_duration') {
                    // Sort by EndDate for duration
                    aValue = new Date(a.EndDate || 0).getTime();
                    bValue = new Date(b.EndDate || 0).getTime();
                } else if (sortConfig.key === 'Status') {
                    // Custom order could be implemented here, string comparison suffices usually
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [filteredItems, sortConfig]);

    const paginatedItems = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sortedItems.slice(startIndex, Math.min(startIndex + itemsPerPage, sortedItems.length));
    }, [sortedItems, currentPage]);

    const totalPages = Math.max(1, Math.ceil(sortedItems.length / itemsPerPage));

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const stats = useMemo(() => {
        const active = items.filter(i => i.Status === 'Active').length;
        const expiringSoon = items.filter(i => {
            const days = getDaysRemaining(i.EndDate);
            return days !== null && days > 0 && days <= 90 && i.Status !== 'Cancelled';
        }).length;
        const expired = items.filter(i => {
            const days = getDaysRemaining(i.EndDate);
            return days !== null && days <= 0 && i.Status !== 'Cancelled';
        }).length;
        const totalValue = items.filter(i => i.Status !== 'Cancelled').reduce((sum, i) => sum + (i.Price || 0), 0);
        return { active, expiringSoon, expired, totalValue };
    }, [items]);

    // ─── ACTIONS ─────────────────────────
    const handleSave = async (formData) => {
        const isEdit = !!formData.ItemID;
        const url = isEdit ? `${API_BASE}/ma/${formData.ItemID}` : `${API_BASE}/ma`;
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, CreatedBy: user?.username || 'system' })
            });
            if (res.ok) {
                setFormModal({ isOpen: false, item: null });
                fetchItems();
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: isEdit ? 'อัปเดตข้อมูลเรียบร้อย' : 'เพิ่มรายการใหม่เรียบร้อย' });
            } else {
                const err = await res.json();
                setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: err.error || 'ไม่สามารถบันทึกข้อมูลได้' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'Connection Error', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
        }
    };

    const handleDelete = (item) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบรายการ?',
            message: `ต้องการลบ "${item.ItemName}" ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/ma/${item.ItemID}`, { method: 'DELETE' });
                    if (res.ok) {
                        fetchItems();
                        setDetailItem(null);
                        setAlertModal({ isOpen: true, type: 'success', title: 'ลบสำเร็จ', message: 'ลบรายการเรียบร้อยแล้ว' });
                    }
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: 'ไม่สามารถลบได้' });
                }
            },
            onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
        });
    };

    const handleStatusChange = async (item, newStatus) => {
        try {
            const res = await fetch(`${API_BASE}/ma/${item.ItemID}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Status: newStatus })
            });
            if (res.ok) {
                fetchItems();
                setDetailItem(null);
                setAlertModal({ isOpen: true, type: 'success', title: 'อัปเดตสถานะ', message: `เปลี่ยนสถานะเป็น "${newStatus}" เรียบร้อย` });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: 'ไม่สามารถเปลี่ยนสถานะได้' });
        }
    };

    // ─── GET COLUMNS BY CATEGORY ─────────
    const getColumns = (cat) => {
        switch (cat) {
            case 'HARDWARE':
                return [
                    { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                    { key: 'ItemName', label: 'ชื่ออุปกรณ์', width: 'min-w-[150px]' },
                    { key: 'Brand', label: 'ยี่ห้อ/รุ่น', width: 'min-w-[100px]' },
                    { key: 'SerialNumber', label: 'S/N', width: 'min-w-[100px] break-all' },
                    { key: 'PONumber', label: 'PO/สัญญา', width: 'min-w-[100px] break-all' },
                    { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                    { key: 'EndDate', label: 'หมดประกัน', width: 'whitespace-nowrap min-w-[90px]' },
                    { key: '_duration', label: 'ระยะเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                    { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ];
            case 'SOFTWARE':
                return [
                    { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                    { key: 'ItemName', label: 'ชื่อ Software', width: 'min-w-[150px]' },
                    { key: 'ServiceNumber', label: 'เลขบริการ', width: 'min-w-[120px] break-all' },
                    { key: 'LicenseQty', label: 'จำนวน', width: 'min-w-[60px] text-center' },
                    { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                    { key: 'EndDate', label: 'หมดอายุ', width: 'whitespace-nowrap min-w-[90px]' },
                    { key: '_duration', label: 'ระยะเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                    { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ];
            case 'SERVICE':
                return [
                    { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                    { key: 'ItemName', label: 'ชื่อบริการ', width: 'min-w-[150px]' },
                    { key: 'ServiceNumber', label: 'เลขสัญญา', width: 'min-w-[120px] break-all' },
                    { key: 'Price', label: 'ราคา', width: 'min-w-[80px]' },
                    { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                    { key: 'LocationName', label: 'สถานที่', width: 'min-w-[100px]' },
                    { key: 'EndDate', label: 'หมดสัญญา', width: 'whitespace-nowrap min-w-[90px]' },
                    { key: '_duration', label: 'ระยะเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                    { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ];
            case 'RENTAL':
                return [
                    { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                    { key: 'ItemName', label: 'ชื่อรายการ', width: 'min-w-[150px]' },
                    { key: 'Brand', label: 'ยี่ห้อ/รุ่น', width: 'min-w-[100px]' },
                    { key: 'PONumber', label: 'เลขสัญญา', width: 'min-w-[120px] break-all' },
                    { key: 'LicenseQty', label: 'จำนวน', width: 'min-w-[60px] text-center' },
                    { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                    { key: 'EndDate', label: 'หมดสัญญา', width: 'whitespace-nowrap min-w-[90px]' },
                    { key: '_duration', label: 'ระยะเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                    { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ];
            default:
                return [];
        }
    };

    const renderCellValue = (item, col) => {
        if (col.key === 'Status') {
            const days = getDaysRemaining(item.EndDate);
            const isAlert = item.Status !== 'Cancelled' && days !== null && days <= 90;
            return (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[item.Status] || STATUS_COLORS.Active} ${isAlert ? 'animate-pulse ring-2 ring-red-400 ring-offset-1' : ''}`}>
                    {item.Status}
                </span>
            );
        }
        if (col.key === 'EndDate') {
            const days = getDaysRemaining(item.EndDate);
            const isAlert = item.Status !== 'Cancelled' && days !== null && days <= 90;
            return (
                <span className={isAlert ? 'text-red-600 font-bold animate-pulse' : ''}>
                    {formatDate(item.EndDate)}
                </span>
            );
        }
        if (col.key === '_duration') {
            const days = getDaysRemaining(item.EndDate);
            if (days === null) return '-';
            if (days <= 0) return <span className="text-red-500 font-bold text-xs animate-pulse">หมดอายุ</span>;
            if (days <= 90) return <span className="text-amber-500 font-bold text-xs animate-pulse">{days} วัน</span>;
            return <span className="text-emerald-600 font-bold text-xs">{formatDuration(item.StartDate, item.EndDate)}</span>;
        }
        if (col.key === 'Price') return `฿${(item.Price || 0).toLocaleString()}`;
        if (col.key === 'LicenseQty') return item.LicenseQty || '-';
        return item[col.key] || '-';
    };

    const activeCat = CATEGORIES.find(c => c.key === activeTab);

    // ─── RENDER ──────────────────────────
    return (
        <div className="space-y-6">
            {/* Page Header */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-3xl font-black text-slate-800">MA / LICENSE</h2>
                <p className="text-slate-500 font-medium">บริหารจัดการสัญญา MA, License, Services และ Rental</p>
            </motion.div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={CheckCircle} title="Active" value={stats.active} color="from-emerald-500 to-emerald-600" subtitle="รายการที่ยังมีผล" onClick={() => setCardFilter(cardFilter === 'active' ? 'all' : 'active')} isActive={cardFilter === 'active'} />
                <StatCard icon={Clock} title="Expiring Soon" value={stats.expiringSoon} color="from-amber-500 to-amber-600" subtitle="หมดอายุภายใน 90 วัน" onClick={() => setCardFilter(cardFilter === 'expiringSoon' ? 'all' : 'expiringSoon')} isActive={cardFilter === 'expiringSoon'} />
                <StatCard icon={AlertTriangle} title="Expired" value={stats.expired} color="from-red-500 to-red-600" subtitle="หมดอายุแล้ว" onClick={() => setCardFilter(cardFilter === 'expired' ? 'all' : 'expired')} isActive={cardFilter === 'expired'} />
                <StatCard icon={DollarSign} title="Total Value" value={`฿${(stats.totalValue / 1000).toFixed(1)}K`} color="from-indigo-500 to-indigo-600" subtitle="มูลค่ารวมรายการ Active" />
            </div>

            {/* Tab Navigation + Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Tabs */}
                <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                    {CATEGORIES.map(cat => {
                        const CatIcon = cat.icon;
                        return (
                            <button
                                key={cat.key}
                                onClick={() => { setActiveTab(cat.key); setSearchTerm(''); setStatusFilter('all'); setCardFilter('all'); setSortConfig(null); }}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === cat.key
                                    ? `bg-gradient-to-r ${cat.color} text-white shadow-lg`
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                    }`}
                            >
                                <CatIcon size={16} />
                                <span className="hidden sm:inline">{cat.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100">
                        <Search size={16} className="text-slate-400 self-center" />
                        <input
                            type="text"
                            placeholder="ค้นหา..."
                            className="bg-transparent border-none outline-none text-sm w-32 md:w-40 text-slate-700 placeholder-slate-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 shadow-sm outline-none cursor-pointer"
                    >
                        <option value="all">ทุกสถานะ</option>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {/* View Mode Toggle */}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="มุมมองรายการ"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="มุมมองการ์ด"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                        </button>
                    </div>

                    {isAdmin && (
                        <button
                            onClick={() => setFormModal({ isOpen: true, item: null })}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r ${activeCat?.color} shadow-lg hover:shadow-xl transition-all`}
                        >
                            <Plus size={16} />
                            <span className="hidden sm:inline">เพิ่มรายการ</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Data Display */}
            {viewMode === 'list' ? (
                <motion.div
                    key={`list-${activeTab}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden flex flex-col"
                >
                    <div className="overflow-x-auto max-h-[60vh] 2xl:max-h-[70vh] custom-scrollbar relative">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] tracking-wider border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-2 pl-3 w-8 bg-slate-50">#</th>
                                    {getColumns(activeTab).map(col => (
                                        <th key={col.key} className={`p-2 ${col.width} bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors group select-none`} onClick={() => handleSort(col.key)}>
                                            <div className="flex items-center gap-1">
                                                {col.label}
                                                {sortConfig?.key === col.key ? (
                                                    sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />
                                                ) : (
                                                    <ArrowUpDown size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                    <th className="p-2 w-16 text-center bg-slate-50">ดู</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={getColumns(activeTab).length + 2} className="p-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center gap-3">
                                                <FileText size={40} className="text-slate-300" />
                                                <p className="font-bold">ไม่พบรายการ</p>
                                                <p className="text-xs">เพิ่มรายการใหม่หรือเปลี่ยนตัวกรอง</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : paginatedItems.map((item, idx) => {
                                    const days = getDaysRemaining(item.EndDate);
                                    const isExpiring = days !== null && days > 0 && days <= 90;
                                    const isExpired = days !== null && days <= 0;
                                    const globalIdx = (currentPage - 1) * itemsPerPage + idx;
                                    return (
                                        <motion.tr
                                            key={item.ItemID}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: idx * 0.02 }}
                                            className={`hover:bg-slate-50 transition-colors cursor-pointer ${isExpired && item.Status !== 'Cancelled' ? 'bg-red-50/50' : isExpiring && item.Status !== 'Cancelled' ? 'bg-amber-50/50' : ''}`}
                                            onClick={() => setDetailItem(item)}
                                        >
                                            <td className="p-2 pl-3 text-slate-400 font-mono text-xs">{globalIdx + 1}</td>
                                            {getColumns(activeTab).map(col => (
                                                <td key={col.key} className={`p-2 text-slate-700 text-xs font-medium ${col.width}`}>
                                                    {renderCellValue(item, col)}
                                                </td>
                                            ))}
                                            <td className="p-2 text-center">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    key={`grid-${activeTab}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                    {filteredItems.length === 0 ? (
                        <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                            <div className="flex flex-col items-center gap-3">
                                <FileText size={40} className="text-slate-300" />
                                <p className="font-bold">ไม่พบรายการ</p>
                                <p className="text-xs">เพิ่มรายการใหม่หรือเปลี่ยนตัวกรอง</p>
                            </div>
                        </div>
                    ) : (
                        paginatedItems.map((item, idx) => {
                            const days = getDaysRemaining(item.EndDate);
                            const isExpiring = days !== null && days > 0 && days <= 90;
                            const isExpired = days !== null && days <= 0;
                            const isAlert = item.Status !== 'Cancelled' && (isExpiring || isExpired);

                            return (
                                <motion.div
                                    key={item.ItemID}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.02 }}
                                    className={`bg-white rounded-2xl border ${isAlert ? 'border-red-200 shadow-red-100' : 'border-slate-200'} shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all overflow-hidden cursor-pointer flex flex-col relative`}
                                    onClick={() => setDetailItem(item)}
                                >
                                    {isAlert && (
                                        <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500 m-3 animate-ping"></div>
                                    )}
                                    <div className="p-4 border-b border-slate-50 flex items-start gap-3">
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeCat?.color} flex items-center justify-center shadow-lg shrink-0`}>
                                            <activeCat.icon className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-bold text-slate-800 text-sm truncate">{item.ItemName}</h4>
                                            <p className="text-xs text-slate-500 truncate">{item.SubType}</p>
                                        </div>
                                    </div>
                                    <div className="p-4 flex-1 space-y-3">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">สถานะ:</span>
                                            {renderCellValue(item, { key: 'Status' })}
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">หมดอายุ:</span>
                                            <span className={isAlert ? 'text-red-600 font-bold animate-pulse' : 'font-medium text-slate-700'}>
                                                {formatDate(item.EndDate)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">ระยะเวลา:</span>
                                            {renderCellValue(item, { key: '_duration' })}
                                        </div>
                                        <div className="flex justify-between items-start gap-2 text-xs">
                                            <span className="text-slate-500 whitespace-nowrap">Vendor:</span>
                                            <span className="font-medium text-slate-700 text-right break-words">{item.VendorName || '-'}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            )
                        })
                    )}
                </motion.div>
            )}

            {/* Pagination Control Container */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mt-4">
                {/* Table Footer with Pagination */}
                <div className="px-5 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-4">
                        <span>ทั้งหมด <span className="font-bold text-slate-700">{filteredItems.length}</span> รายการ</span>
                        <span className="hidden sm:inline text-slate-300">|</span>
                        <span className="hidden sm:inline">มูลค่ารวม <span className="font-bold text-slate-700">฿{filteredItems.reduce((s, i) => s + (i.Price || 0), 0).toLocaleString()}</span></span>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="font-medium mr-2">
                                หน้า {currentPage} จาก {totalPages}
                            </span>
                            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors border-r border-slate-200"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1.5 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── DETAIL MODAL ────────────── */}
            {detailItem && (
                <Portal>
                    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden"
                        >
                            {/* Header */}
                            <div className={`p-4 md:p-5 bg-gradient-to-r ${activeCat?.color} text-white relative overflow-hidden`}>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
                                <div className="flex justify-between items-start relative z-10">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">{activeCat?.label}</p>
                                        <h3 className="font-black text-xl md:text-2xl tracking-tight">{detailItem.ItemName}</h3>
                                        <p className="text-white/70 text-sm mt-1">{detailItem.SubType}</p>
                                    </div>
                                    <button onClick={() => setDetailItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="p-4 md:p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                                {/* Status Badge */}
                                <div className="flex items-center gap-3">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[detailItem.Status]}`}>
                                        {detailItem.Status}
                                    </span>
                                    {detailItem.EndDate && (
                                        <span className="text-xs text-slate-500">
                                            {getDaysRemaining(detailItem.EndDate) > 0
                                                ? `เหลือ ${getDaysRemaining(detailItem.EndDate)} วัน`
                                                : 'หมดอายุแล้ว'}
                                        </span>
                                    )}
                                </div>

                                {/* Detail Grid */}
                                <div className="bg-slate-50 rounded-xl overflow-hidden divide-y divide-slate-100 border border-slate-100 shadow-sm">
                                    {detailItem.Brand && (
                                        <DetailField icon={Tag} label="ยี่ห้อ/รุ่น" value={detailItem.Brand} />
                                    )}
                                    {detailItem.SerialNumber && (
                                        <DetailField icon={Hash} label="Serial Number" value={detailItem.SerialNumber} />
                                    )}
                                    {detailItem.ServiceNumber && (
                                        <DetailField icon={FileText} label="เลขบริการ/สัญญา" value={detailItem.ServiceNumber} />
                                    )}
                                    {detailItem.PONumber && (
                                        <DetailField icon={CreditCard} label="PO / เลขสัญญา" value={detailItem.PONumber} />
                                    )}
                                    {(detailItem.LicenseQty > 0) && (
                                        <DetailField icon={Hash} label="จำนวน License" value={detailItem.LicenseQty} />
                                    )}
                                    <DetailField icon={DollarSign} label="ราคา" value={`฿${(detailItem.Price || 0).toLocaleString()}`} />
                                    <DetailField icon={Building} label="Vendor" value={detailItem.VendorName || '-'} />
                                    <DetailField icon={MapPin} label="สถานที่" value={detailItem.LocationName || '-'} />
                                    <DetailField icon={Calendar} label="เริ่มต้น" value={formatDate(detailItem.StartDate)} />
                                    <DetailField icon={Calendar} label="สิ้นสุด" value={formatDate(detailItem.EndDate)} />
                                    <DetailField icon={Clock} label="ระยะเวลา" value={formatDuration(detailItem.StartDate, detailItem.EndDate)} />
                                </div>

                                {detailItem.Remark && (
                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">หมายเหตุ</p>
                                        <p className="text-sm text-slate-700">{detailItem.Remark}</p>
                                    </div>
                                )}
                            </div>

                            {/* Footer Actions */}
                            {isAdmin && (
                                <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-2">
                                    <button
                                        onClick={() => { setDetailItem(null); setFormModal({ isOpen: true, item: detailItem }); }}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors border border-indigo-200"
                                    >
                                        <Edit2 size={14} /> แก้ไข
                                    </button>
                                    <div className="relative group">
                                        <button className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-600 rounded-lg text-sm font-bold hover:bg-amber-100 transition-colors border border-amber-200">
                                            <RefreshCw size={14} /> เปลี่ยนสถานะ <ChevronDown size={12} />
                                        </button>
                                        <div className="absolute bottom-full left-0 mb-1 bg-white rounded-lg shadow-xl border border-slate-200 py-1 hidden group-hover:block z-10 min-w-[140px]">
                                            {STATUS_OPTIONS.filter(s => s !== detailItem.Status).map(s => (
                                                <button
                                                    key={s}
                                                    onClick={() => handleStatusChange(detailItem, s)}
                                                    className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 text-slate-700 font-medium"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setDetailItem(null); handleDelete(detailItem); }}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors border border-red-200 ml-auto"
                                    >
                                        <Trash2 size={14} /> ลบ
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </Portal>
            )}

            {/* ─── ADD/EDIT MODAL ──────────── */}
            {formModal.isOpen && (
                <FormModal
                    item={formModal.item}
                    category={activeTab}
                    vendors={vendors}
                    locations={locations}
                    maTypes={maTypes}
                    onSave={handleSave}
                    onClose={() => setFormModal({ isOpen: false, item: null })}
                />
            )}

            {/* Alert Modal */}
            <AlertModal
                isOpen={alertModal.isOpen}
                type={alertModal.type}
                title={alertModal.title}
                message={alertModal.message}
                onConfirm={alertModal.onConfirm || (() => setAlertModal(p => ({ ...p, isOpen: false })))}
                onCancel={alertModal.onCancel}
            />
        </div>
    );
};

// ─── DETAIL FIELD COMPONENT ──────────────
const DetailField = ({ icon: Icon, label, value }) => (
    <div className="flex items-center p-3 sm:px-4">
        <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0 flex items-center gap-2">
            <Icon size={14} className="text-indigo-400" /> {label}
        </span>
        <span className="text-sm font-bold text-slate-800">{value}</span>
    </div>
);

// ─── FORM MODAL COMPONENT ────────────────
const FormModal = ({ item, category, vendors, locations, maTypes, onSave, onClose }) => {
    const isEdit = !!item;
    const [form, setForm] = useState({
        Category: item?.Category || category,
        SubType: item?.SubType || '',
        ItemName: item?.ItemName || '',
        Brand: item?.Brand || '',
        SerialNumber: item?.SerialNumber || '',
        ServiceNumber: item?.ServiceNumber || '',
        LicenseQty: item?.LicenseQty || 0,
        PONumber: item?.PONumber || '',
        LocationName: item?.LocationName || '',
        Price: item?.Price || 0,
        VendorID: item?.VendorID || '',
        StartDate: item?.StartDate ? new Date(item.StartDate).toISOString().split('T')[0] : '',
        EndDate: item?.EndDate ? new Date(item.EndDate).toISOString().split('T')[0] : '',
        Status: item?.Status || 'Active',
        Remark: item?.Remark || '',
        ...(isEdit ? { ItemID: item.ItemID } : {}),
    });

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(form);
    };

    const cat = form.Category || category;
    const catInfo = CATEGORIES.find(c => c.key === cat);
    const subtypeOptions = (maTypes || []).filter(t => t.Category === cat).map(t => t.TypeName);

    return (
        <Portal>
            <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden"
                >
                    {/* Header */}
                    <div className={`p-4 md:p-5 bg-gradient-to-r ${catInfo?.color} text-white`}>
                        <div className="flex justify-between items-center">
                            <h3 className="font-black text-lg md:text-xl">
                                {isEdit ? 'แก้ไขรายการ' : `เพิ่ม ${catInfo?.label} ใหม่`}
                            </h3>
                            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-4 md:p-5 space-y-4 max-h-[65vh] overflow-y-auto">
                        {/* Row 1 */}
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="ประเภทย่อย" required>
                                <select
                                    value={form.SubType}
                                    onChange={(e) => handleChange('SubType', e.target.value)}
                                    className="form-input"
                                >
                                    <option value="">เลือกประเภท...</option>
                                    {subtypeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </FormField>
                            <FormField label={cat === 'SOFTWARE' ? 'ชื่อ Software / License' : cat === 'SERVICE' ? 'ชื่อบริการ' : cat === 'RENTAL' ? 'ชื่อรายการเช่า' : 'ชื่ออุปกรณ์'}>
                                <input type="text" value={form.ItemName} onChange={(e) => handleChange('ItemName', e.target.value)} className="form-input" placeholder="ระบุชื่อ..." />
                            </FormField>
                        </div>

                        {/* Conditional Fields */}
                        {(cat === 'HARDWARE' || cat === 'RENTAL') && (
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="ยี่ห้อ/รุ่น">
                                    <input type="text" value={form.Brand} onChange={(e) => handleChange('Brand', e.target.value)} className="form-input" placeholder="Brand / Model" />
                                </FormField>
                                <FormField label="Serial Number">
                                    <input type="text" value={form.SerialNumber} onChange={(e) => handleChange('SerialNumber', e.target.value)} className="form-input" placeholder="S/N" />
                                </FormField>
                            </div>
                        )}

                        {cat === 'SOFTWARE' && (
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="หมายเลขบริการ">
                                    <input type="text" value={form.ServiceNumber} onChange={(e) => handleChange('ServiceNumber', e.target.value)} className="form-input" placeholder="Service Number" />
                                </FormField>
                                <FormField label="จำนวน License">
                                    <input type="number" min="0" value={form.LicenseQty} onChange={(e) => handleChange('LicenseQty', parseInt(e.target.value) || 0)} className="form-input" />
                                </FormField>
                            </div>
                        )}

                        {cat === 'SERVICE' && (
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="เลขสัญญา">
                                    <input type="text" value={form.ServiceNumber} onChange={(e) => handleChange('ServiceNumber', e.target.value)} className="form-input" placeholder="Contract No." />
                                </FormField>
                                <FormField label="สถานที่ให้บริการ">
                                    <select value={form.LocationName} onChange={(e) => handleChange('LocationName', e.target.value)} className="form-input">
                                        <option value="">เลือกสถานที่...</option>
                                        {locations.map(l => <option key={l.LocationID} value={l.Name}>{l.Name}</option>)}
                                    </select>
                                </FormField>
                            </div>
                        )}

                        {/* Common fields */}
                        <div className="grid grid-cols-2 gap-4">
                            {(cat !== 'SERVICE') && (
                                <FormField label="PO / เลขสัญญา">
                                    <input type="text" value={form.PONumber} onChange={(e) => handleChange('PONumber', e.target.value)} className="form-input" placeholder="PO Number" />
                                </FormField>
                            )}
                            {(cat === 'RENTAL') && (
                                <FormField label="จำนวน">
                                    <input type="number" min="0" value={form.LicenseQty} onChange={(e) => handleChange('LicenseQty', parseInt(e.target.value) || 0)} className="form-input" />
                                </FormField>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {(cat === 'HARDWARE' || cat === 'RENTAL') && (
                                <FormField label="สถานที่ติดตั้ง">
                                    <select value={form.LocationName} onChange={(e) => handleChange('LocationName', e.target.value)} className="form-input">
                                        <option value="">เลือกสถานที่...</option>
                                        {locations.map(l => <option key={l.LocationID} value={l.Name}>{l.Name}</option>)}
                                    </select>
                                </FormField>
                            )}
                            <FormField label="ราคา (฿)">
                                <input type="number" min="0" step="0.01" value={form.Price} onChange={(e) => handleChange('Price', parseFloat(e.target.value) || 0)} className="form-input" />
                            </FormField>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Vendor">
                                <select value={form.VendorID} onChange={(e) => handleChange('VendorID', e.target.value ? parseInt(e.target.value) : '')} className="form-input">
                                    <option value="">เลือก Vendor...</option>
                                    {vendors.map(v => <option key={v.VendorID} value={v.VendorID}>{v.VendorName}</option>)}
                                </select>
                            </FormField>
                            <FormField label="สถานะ">
                                <select value={form.Status} onChange={(e) => handleChange('Status', e.target.value)} className="form-input">
                                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </FormField>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="วันที่เริ่ม/ต่อประกัน">
                                <input type="date" value={form.StartDate} onChange={(e) => handleChange('StartDate', e.target.value)} className="form-input" />
                            </FormField>
                            <FormField label="วันที่หมดอายุ">
                                <input type="date" value={form.EndDate} onChange={(e) => handleChange('EndDate', e.target.value)} className="form-input" />
                            </FormField>
                        </div>

                        <FormField label="หมายเหตุ (Remark)">
                            <textarea rows={2} value={form.Remark} onChange={(e) => handleChange('Remark', e.target.value)} className="form-input resize-none" placeholder="ข้อมูลเพิ่มเติม..." />
                        </FormField>
                    </form>

                    {/* Footer */}
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                        <button onClick={onClose} className="flex-1 py-2.5 bg-white text-slate-600 rounded-lg text-sm font-bold border border-slate-200 hover:bg-slate-50 transition-colors">
                            ยกเลิก
                        </button>
                        <button
                            onClick={handleSubmit}
                            className={`flex-1 py-2.5 text-white rounded-lg text-sm font-bold bg-gradient-to-r ${catInfo?.color} hover:shadow-lg transition-all`}
                        >
                            {isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </Portal>
    );
};

// ─── FORM FIELD COMPONENT ────────────────
const FormField = ({ label, required, children }) => (
    <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            {label} {required && <span className="text-red-400">*</span>}
        </label>
        {children}
    </div>
);

export default MALicensePage;
