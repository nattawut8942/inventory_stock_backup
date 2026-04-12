import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // หรือ 'motion/react'
import {
    Shield, Clock, AlertTriangle, DollarSign, Server, Monitor, Cpu, Wifi,
    Plus, Edit2, Trash2, X, Search, ChevronDown, Eye, FileText, Calendar,
    MapPin, Tag, Hash, Building, CreditCard, RefreshCw, CheckCircle, XCircle,
    HardDrive, Globe, Wrench, Printer, ChevronLeft, ChevronRight,
    ChevronUp, ArrowUpDown, User, List, LayoutGrid
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
    Expiring: 'bg-orange-100 text-orange-700 border-orange-200',
    Expired: 'bg-red-100 text-red-700 border-red-200',
    Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const ALERT_DAYS = 60;

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
    const days = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'หมดอายุแล้ว';

    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    const remainDays = days % 30;

    if (years > 0) {
        let result = `${years} ปี`;
        if (months > 0) result += ` ${months} เดือน`;
        if (remainDays > 0) result += ` ${remainDays} วัน`;
        return result;
    }
    if (months > 0) {
        return remainDays > 0 ? `${months} เดือน ${remainDays} วัน` : `${months} เดือน`;
    }
    return `${days} วัน`;
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
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1">{title}</p>
                <h3 className="text-2xl font-black text-slate-900">{value}</h3>
                {subtitle && <p className="text-[10px] text-slate-400 mt-1">{subtitle}</p>}
            </div>
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
        </div>
    </motion.div>
);

// ─── MAIN PAGE COMPONENT ─────────────────
const MALicensePage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'Staff';

    const [items, setItems] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [locations, setLocations] = useState([]);
    const [maTypes, setMaTypes] = useState([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState('HARDWARE');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [cardFilter, setCardFilter] = useState('all');
    const [viewMode, setViewMode] = useState('list');
    const [detailItem, setDetailItem] = useState(null);
    const [formModal, setFormModal] = useState({ isOpen: false, item: null });
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
    const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState(null);
    const itemsPerPage = 20;

    const fetchItems = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/ma`);
            if (res.ok) setItems(await res.json());
        } catch (err) { console.error('Fetch MA Items Error:', err); }
        finally { setLoading(false); }
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

    const filteredItems = useMemo(() => {
        return items
            .filter(i => i.Category === activeTab)
            .filter(i => statusFilter === 'all' || i.Status === statusFilter)
            .filter(i => {
                if (cardFilter === 'all') return true;
                const days = getDaysRemaining(i.EndDate);
                if (cardFilter === 'active') return i.Status === 'Active';
                if (cardFilter === 'expiringSoon') return days !== null && days > 0 && days <= ALERT_DAYS && i.Status !== 'Cancelled';
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

    useEffect(() => { setCurrentPage(1); }, [activeTab, statusFilter, cardFilter, searchTerm]);

    const sortedItems = useMemo(() => {
        let sortableItems = [...filteredItems];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key] || '';
                let bValue = b[sortConfig.key] || '';
                if (sortConfig.key === '_duration') {
                    aValue = new Date(a.EndDate || 0).getTime();
                    bValue = new Date(b.EndDate || 0).getTime();
                }
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
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
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const stats = useMemo(() => {
        const active = items.filter(i => i.Status === 'Active').length;
        const expiringSoon = items.filter(i => {
            const days = getDaysRemaining(i.EndDate);
            return days !== null && days > 0 && days <= ALERT_DAYS && i.Status !== 'Cancelled';
        }).length;
        const expired = items.filter(i => {
            const days = getDaysRemaining(i.EndDate);
            return days !== null && days <= 0 && i.Status !== 'Cancelled';
        }).length;
        const totalValue = items.filter(i => i.Status === 'Active').reduce((sum, i) => sum + (i.Price || 0), 0);
        return { active, expiringSoon, expired, totalValue };
    }, [items]);

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
            isOpen: true, type: 'danger', title: 'ลบรายการ?',
            message: `ต้องการลบ "${item.ItemName}" ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/ma/${item.ItemID}`, { method: 'DELETE' });
                    if (res.ok) {
                        fetchItems(); setDetailItem(null);
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
                fetchItems(); setDetailItem(null); setStatusDropdownOpen(false);
                setAlertModal({ isOpen: true, type: 'success', title: 'อัปเดตสถานะ', message: `เปลี่ยนสถานะเป็น "${newStatus}" เรียบร้อย` });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: 'ไม่สามารถเปลี่ยนสถานะได้' });
        }
    };

    const getColumns = (cat) => {
        const trackingCols = [
            { key: 'CreatedBy', label: 'ผู้บันทึก', width: 'min-w-[100px]' },
            { key: 'CreatedAt', label: 'วันบันทึก', width: 'whitespace-nowrap min-w-[100px]' },
        ];
        switch (cat) {
            case 'HARDWARE': return [
                { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                { key: 'ItemName', label: 'ชื่ออุปกรณ์', width: 'min-w-[150px]' },
                { key: 'Brand', label: 'ยี่ห้อ/รุ่น', width: 'min-w-[150px]' },
                { key: 'SerialNumber', label: 'S/N', width: 'min-w-[100px] break-all' },
                { key: 'PONumber', label: 'PO/สัญญา', width: 'min-w-[100px] break-all' },
                { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                { key: 'EndDate', label: 'หมดประกัน', width: 'whitespace-nowrap min-w-[90px]' },
                { key: '_duration', label: 'เหลือเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ...trackingCols,
            ];
            case 'SOFTWARE': return [
                { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                { key: 'ItemName', label: 'ชื่อ Software', width: 'min-w-[150px]' },
                { key: 'ServiceNumber', label: 'เลขบริการ', width: 'min-w-[120px] break-all' },
                { key: 'LicenseQty', label: 'จำนวน', width: 'min-w-[60px] text-center' },
                { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                { key: 'EndDate', label: 'หมดอายุ', width: 'whitespace-nowrap min-w-[90px]' },
                { key: '_duration', label: 'เหลือเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ...trackingCols,
            ];
            case 'SERVICE': return [
                { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                { key: 'ItemName', label: 'ชื่อบริการ', width: 'min-w-[150px]' },
                { key: 'ServiceNumber', label: 'เลขสัญญา', width: 'min-w-[120px] break-all' },
                { key: 'Price', label: 'ราคา', width: 'min-w-[80px]' },
                { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                { key: 'LocationName', label: 'สถานที่', width: 'min-w-[100px]' },
                { key: 'EndDate', label: 'หมดสัญญา', width: 'whitespace-nowrap min-w-[90px]' },
                { key: '_duration', label: 'เหลือเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ...trackingCols,
            ];
            case 'RENTAL': return [
                { key: 'SubType', label: 'ประเภท', width: 'min-w-[100px]' },
                { key: 'ItemName', label: 'ชื่อรายการ', width: 'min-w-[150px]' },
                { key: 'Brand', label: 'ยี่ห้อ/รุ่น', width: 'min-w-[150px]' },
                { key: 'PONumber', label: 'เลขสัญญา', width: 'min-w-[120px] break-all' },
                { key: 'LicenseQty', label: 'จำนวน', width: 'min-w-[60px] text-center' },
                { key: 'VendorName', label: 'Vendor', width: 'min-w-[120px]' },
                { key: 'EndDate', label: 'หมดสัญญา', width: 'whitespace-nowrap min-w-[90px]' },
                { key: '_duration', label: 'เหลือเวลา', width: 'whitespace-nowrap min-w-[80px]' },
                { key: 'Status', label: 'สถานะ', width: 'whitespace-nowrap min-w-[80px]' },
                ...trackingCols,
            ];
            default: return [];
        }
    };

    const renderCellValue = (item, col) => {
        if (col.key === 'Status') {
            const days = getDaysRemaining(item.EndDate);
            const isAlert = item.Status !== 'Cancelled' && days !== null && days <= ALERT_DAYS;
            return (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${STATUS_COLORS[item.Status] || STATUS_COLORS.Active} ${isAlert ? 'animate-pulse ring-2 ring-red-400 ring-offset-1' : ''}`}>
                    {item.Status}
                </span>
            );
        }
        if (col.key === 'EndDate') {
            const days = getDaysRemaining(item.EndDate);
            const isAlert = item.Status !== 'Cancelled' && days !== null && days <= ALERT_DAYS;
            return <span className={isAlert ? 'text-red-600 font-bold animate-pulse' : ''}>{formatDate(item.EndDate)}</span>;
        }
        if (col.key === '_duration') {
            const days = getDaysRemaining(item.EndDate);
            if (days === null) return '-';
            if (days <= 0) return <span className="text-red-600 font-bold text-[10px] animate-pulse">หมดอายุ</span>;
            const display = days < 30 ? `${days} วัน` : formatDuration(new Date(), item.EndDate);
            const isAlert = days <= ALERT_DAYS;
            return (
                <span className={`font-bold text-[10px] ${isAlert ? 'text-orange-600' : 'text-emerald-600'}`}>
                    {display}
                </span>
            );
        }
        if (col.key === 'Price') return `฿${(item.Price || 0).toLocaleString()}`;
        if (col.key === 'LicenseQty') return item.LicenseQty || '-';
        if (col.key === 'CreatedAt' || col.key === 'UpdatedAt') return formatDate(item[col.key]);
        if (col.key === 'CreatedBy') return item.CreatedBy || '-';
        return item[col.key] || '-';
    };

    const activeCat = CATEGORIES.find(c => c.key === activeTab);

    return (
        <div className="space-y-6 w-full">
            {/* Header & Stats */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-3xl font-black text-slate-800">MA / LICENSE</h2>
                <p className="text-slate-500 font-medium text-sm">บริหารจัดการสัญญา MA, License, Services และ Rental</p>
            </motion.div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={CheckCircle} title="Active" value={stats.active} color="from-emerald-500 to-emerald-600" onClick={() => setCardFilter(cardFilter === 'active' ? 'all' : 'active')} isActive={cardFilter === 'active'} />
                <StatCard icon={Clock} title="Expiring (< 60 Days)" value={stats.expiringSoon} color="from-orange-400 to-orange-500" onClick={() => setCardFilter(cardFilter === 'expiringSoon' ? 'all' : 'expiringSoon')} isActive={cardFilter === 'expiringSoon'} />
                <StatCard icon={AlertTriangle} title="Expired" value={stats.expired} color="from-red-500 to-red-600" onClick={() => setCardFilter(cardFilter === 'expired' ? 'all' : 'expired')} isActive={cardFilter === 'expired'} />
                <StatCard icon={DollarSign} title="Total Value" value={`฿${(stats.totalValue/1000).toFixed(0)}k`} color="from-indigo-500 to-indigo-600" subtitle="มูลค่ารวม Active" />
            </div>

            {/* Header Controls (เรียงแถวเดียวกัน) */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                
                {/* Category Tabs */}
                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 w-full xl:w-auto overflow-x-auto">
                    {CATEGORIES.map(cat => {
                        const CatIcon = cat.icon;
                        return (
                            <button key={cat.key} onClick={() => { setActiveTab(cat.key); setSearchTerm(''); setStatusFilter('all'); setCardFilter('all'); setSortConfig(null); }}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === cat.key ? `bg-gradient-to-r ${cat.color} text-white shadow-md` : 'text-slate-500 hover:text-slate-800 hover:bg-white'}`}>
                                <CatIcon size={14} />
                                <span>{cat.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Filter & Controls */}
                <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[150px] h-[36px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="ค้นหา..." className="w-full h-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>

                    {/* Status Filter */}
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-[36px] bg-slate-50 border border-slate-200 px-2 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer hover:bg-white transition-colors">
                        <option value="all">ทุกสถานะ</option>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {/* View Mode Toggle */}
                    <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200 h-[36px]">
                        <button onClick={() => setViewMode('list')} className={`px-2 rounded-md transition-all flex items-center ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`} title="รายการ">
                            <List size={14} />
                        </button>
                        <button onClick={() => setViewMode('grid')} className={`px-2 rounded-md transition-all flex items-center ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`} title="การ์ด">
                            <LayoutGrid size={14} />
                        </button>
                    </div>

                    {/* Add Button */}
                    {isAdmin && (
                        <button onClick={() => setFormModal({ isOpen: true, item: null })} className={`h-[36px] flex items-center gap-1.5 px-3 rounded-lg font-bold text-xs text-white bg-gradient-to-r ${activeCat?.color} shadow-sm hover:shadow-md transition-all`}>
                            <Plus size={14} />
                            <span className="hidden sm:inline">เพิ่มรายการ</span>
                        </button>
                    )}
                </div>
            </div>

            {/* LIST VIEW */}
            {viewMode === 'list' ? (
                <motion.div key={`list-${activeTab}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="overflow-x-auto max-h-[60vh] 2xl:max-h-[70vh] custom-scrollbar relative">
                        <table className="w-full text-left text-xs min-w-max">
                            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-3 py-2.5 w-8 bg-slate-50">#</th>
                                    {getColumns(activeTab).map(col => (
                                        <th key={col.key} className={`px-3 py-2.5 ${col.width} bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors group select-none`} onClick={() => handleSort(col.key)}>
                                            <div className="flex items-center gap-1">
                                                {col.label}
                                                {sortConfig?.key === col.key ? (
                                                    sortConfig.direction === 'asc' ? <ChevronUp size={10} className="text-indigo-600" /> : <ChevronDown size={10} className="text-indigo-600" />
                                                ) : (
                                                    <ArrowUpDown size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                    <th className="px-3 py-2.5 w-12 text-center bg-slate-50">ดู</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={getColumns(activeTab).length + 2} className="p-10 text-center text-slate-400">
                                            ไม่พบรายการ
                                        </td>
                                    </tr>
                                ) : paginatedItems.map((item, idx) => {
                                    const days = getDaysRemaining(item.EndDate);
                                    const isExpiring = days !== null && days > 0 && days <= ALERT_DAYS;
                                    const isExpired = days !== null && days <= 0;
                                    const isCancelled = item.Status === 'Cancelled';
                                    const globalIdx = (currentPage - 1) * itemsPerPage + idx;
                                    
                                    // 🎨 ลอจิกสีพื้นหลังตาราง
                                    const rowBgColor = isCancelled ? 'bg-slate-50 hover:bg-slate-100 opacity-75'
                                        : isExpired ? 'bg-red-100 hover:bg-red-200'
                                        : isExpiring ? (days <= 30 ? 'bg-red-50 hover:bg-red-100' : 'bg-orange-50 hover:bg-orange-100')
                                        : 'bg-white hover:bg-slate-50';

                                    return (
                                        <motion.tr key={item.ItemID} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                                            className={`transition-colors cursor-pointer align-top ${rowBgColor}`}
                                            onClick={() => setDetailItem(item)}>
                                            <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">{globalIdx + 1}</td>
                                            {getColumns(activeTab).map(col => (
                                                <td key={col.key} className={`px-3 py-2 text-slate-700 text-[11px] ${col.key === 'ItemName' ? 'font-bold text-xs' : ''} ${col.width}`}>
                                                    {renderCellValue(item, col)}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2 text-center">
                                                <button onClick={(e) => { e.stopPropagation(); setDetailItem(item); }} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition-colors">
                                                    <Eye size={14} />
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
                /* GRID VIEW */
                <motion.div key={`grid-${activeTab}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {filteredItems.length === 0 ? (
                        <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                            ไม่พบรายการ
                        </div>
                    ) : paginatedItems.map((item, idx) => {
                        const days = getDaysRemaining(item.EndDate);
                        const isExpiring = days !== null && days > 0 && days <= ALERT_DAYS;
                        const isExpired = days !== null && days <= 0;
                        const isCancelled = item.Status === 'Cancelled';
                        
                        // 🎨 ลอจิกสีพื้นหลังการ์ด
                        const cardBgColor = isCancelled ? 'bg-slate-50 border-slate-200 opacity-75'
                            : isExpired ? 'bg-red-100 border-red-300 ring-1 ring-red-200'
                            : isExpiring ? (days <= 30 ? 'bg-red-50 border-red-200 ring-1 ring-red-100' : 'bg-orange-50 border-orange-200 ring-1 ring-orange-100')
                            : 'bg-white border-slate-200';

                        return (
                            <motion.div key={item.ItemID} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.02 }}
                                className={`rounded-2xl border shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all overflow-hidden cursor-pointer flex flex-col relative ${cardBgColor}`}
                                onClick={() => setDetailItem(item)}>
                                {(isExpiring || isExpired) && !isCancelled && <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500 m-3 animate-ping"></div>}
                                
                                <div className="p-3 border-b border-black/5 flex items-start gap-2.5">
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${activeCat?.color} flex items-center justify-center shadow-sm shrink-0`}>
                                        <activeCat.icon className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-bold text-slate-800 text-xs truncate">{item.ItemName}</h4>
                                        <p className="text-[10px] text-slate-500 truncate">{item.SubType}</p>
                                    </div>
                                </div>
                                <div className="p-3 flex-1 space-y-2">
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-slate-500">สถานะ:</span>
                                        {renderCellValue(item, { key: 'Status' })}
                                    </div>
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-slate-500">หมดอายุ:</span>
                                        <span className={(isExpiring || isExpired) && !isCancelled ? 'text-red-600 font-bold animate-pulse' : 'font-medium text-slate-700'}>{formatDate(item.EndDate)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-slate-500">เหลือเวลา:</span>
                                        {renderCellValue(item, { key: '_duration' })}
                                    </div>
                                    <div className="flex justify-between items-start gap-2 text-[10px] pt-1 border-t border-black/5">
                                        <span className="text-slate-500 whitespace-nowrap">Vendor:</span>
                                        <span className="font-medium text-slate-700 text-right truncate">{item.VendorName || '-'}</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            )}

            {/* Footer Pagination */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mt-4">
                <div className="px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-3 text-[11px] text-slate-500">
                    <div className="flex items-center gap-3">
                        <span>ทั้งหมด <span className="font-bold text-slate-700">{filteredItems.length}</span> รายการ</span>
                        <span className="hidden sm:inline text-slate-300">|</span>
                        <span className="hidden sm:inline">มูลค่ารวม <span className="font-bold text-slate-700">฿{filteredItems.reduce((s, i) => s + (i.Price || 0), 0).toLocaleString()}</span></span>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <span className="font-medium mr-1">หน้า {currentPage} / {totalPages}</span>
                            <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-white">
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 hover:bg-slate-50 disabled:opacity-50 border-r border-slate-200"><ChevronLeft size={14} /></button>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 hover:bg-slate-50 disabled:opacity-50"><ChevronRight size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL ข้อมูลละเอียด */}
            {detailItem && (
                <Portal>
                    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
                            <div className={`p-4 bg-gradient-to-r ${activeCat?.color} text-white relative overflow-hidden`}>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
                                <div className="flex justify-between items-start relative z-10">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">{activeCat?.label}</p>
                                        <h3 className="font-black text-lg md:text-xl tracking-tight">{detailItem.ItemName}</h3>
                                        <p className="text-white/80 text-xs mt-0.5">{detailItem.SubType}</p>
                                    </div>
                                    <button onClick={() => { setDetailItem(null); setStatusDropdownOpen(false); }} className="p-1.5 hover:bg-white/20 rounded-full transition-colors"><X size={18} /></button>
                                </div>
                            </div>
                            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                                <div className="flex items-center gap-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${STATUS_COLORS[detailItem.Status]}`}>{detailItem.Status}</span>
                                    {detailItem.EndDate && (
                                        <span className="text-[11px] text-slate-500 font-medium">
                                            {getDaysRemaining(detailItem.EndDate) > 0 ? `เหลือ ${getDaysRemaining(detailItem.EndDate)} วัน` : 'หมดอายุแล้ว'}
                                        </span>
                                    )}
                                </div>
                                <div className="bg-slate-50 rounded-xl overflow-hidden divide-y divide-slate-100 border border-slate-100">
                                    {detailItem.Brand && <DetailField icon={Tag} label="ยี่ห้อ/รุ่น" value={detailItem.Brand} />}
                                    {detailItem.SerialNumber && <DetailField icon={Hash} label="Serial Number" value={detailItem.SerialNumber} />}
                                    {detailItem.ServiceNumber && <DetailField icon={FileText} label="เลขบริการ/สัญญา" value={detailItem.ServiceNumber} />}
                                    {detailItem.PONumber && <DetailField icon={CreditCard} label="PO / เลขสัญญา" value={detailItem.PONumber} />}
                                    {(detailItem.LicenseQty > 0) && <DetailField icon={Hash} label="จำนวน License" value={detailItem.LicenseQty} />}
                                    <DetailField icon={DollarSign} label="ราคา" value={`฿${(detailItem.Price || 0).toLocaleString()}`} />
                                    <DetailField icon={Building} label="Vendor" value={detailItem.VendorName || '-'} />
                                    <DetailField icon={MapPin} label="สถานที่" value={detailItem.LocationName || '-'} />
                                    <DetailField icon={Calendar} label="เริ่มต้น" value={formatDate(detailItem.StartDate)} />
                                    <DetailField icon={Calendar} label="สิ้นสุด" value={formatDate(detailItem.EndDate)} />
                                    <DetailField icon={Clock} label="ระยะเวลา" value={formatDuration(detailItem.StartDate, detailItem.EndDate)} />
                                </div>
                                <div className="bg-blue-50 rounded-xl overflow-hidden divide-y divide-blue-100 border border-blue-100">
                                    <DetailField icon={User} label="ผู้บันทึก" value={detailItem.CreatedBy || '-'} />
                                    <DetailField icon={Calendar} label="วันบันทึก" value={formatDate(detailItem.CreatedAt)} />
                                    <DetailField icon={Clock} label="แก้ไขล่าสุด" value={formatDate(detailItem.UpdatedAt)} />
                                </div>
                                {detailItem.Remark && (
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">หมายเหตุ</p>
                                        <p className="text-xs text-slate-700">{detailItem.Remark}</p>
                                    </div>
                                )}
                            </div>
                            {isAdmin && (
                                <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-2">
                                    <button onClick={() => { setDetailItem(null); setStatusDropdownOpen(false); setFormModal({ isOpen: true, item: detailItem }); }} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-md text-[11px] font-bold hover:bg-indigo-100 border border-indigo-200">
                                        <Edit2 size={12} /> แก้ไข
                                    </button>
                                    <div className="relative">
                                        <button onClick={() => setStatusDropdownOpen(p => !p)} className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-md text-[11px] font-bold hover:bg-amber-100 border border-amber-200">
                                            <RefreshCw size={12} /> เปลี่ยนสถานะ <ChevronDown size={10} className={`transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {statusDropdownOpen && (
                                            <div className="absolute bottom-full left-0 mb-1 bg-white rounded-md shadow-lg border border-slate-200 py-1 z-10 min-w-[120px]">
                                                {STATUS_OPTIONS.filter(s => s !== detailItem.Status).map(s => (
                                                    <button key={s} onClick={() => handleStatusChange(detailItem, s)} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-50 text-slate-700 font-medium">{s}</button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => { setDetailItem(null); setStatusDropdownOpen(false); handleDelete(detailItem); }} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-md text-[11px] font-bold hover:bg-red-100 border border-red-200 ml-auto">
                                        <Trash2 size={12} /> ลบ
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </Portal>
            )}

            {/* FORM MODAL */}
            {formModal.isOpen && (
                <FormModal item={formModal.item} category={activeTab} vendors={vendors} locations={locations} maTypes={maTypes} onSave={handleSave} onClose={() => setFormModal({ isOpen: false, item: null })} />
            )}

            <AlertModal isOpen={alertModal.isOpen} type={alertModal.type} title={alertModal.title} message={alertModal.message}
                onConfirm={alertModal.onConfirm || (() => setAlertModal(p => ({ ...p, isOpen: false })))} onCancel={alertModal.onCancel} />
        </div>
    );
};

const DetailField = ({ icon: Icon, label, value }) => (
    <div className="flex items-start sm:items-center p-2.5 sm:px-3 flex-col sm:flex-row gap-1 sm:gap-0">
        <span className="text-[11px] text-slate-500 font-bold uppercase w-48 shrink-0 flex items-center gap-1.5">
            <Icon size={12} className="text-indigo-400" /> {label}
        </span>
        <span className="text-xs font-medium text-slate-800 break-words">{value}</span>
    </div>
);

const FormModal = ({ item, category, vendors, locations, maTypes, onSave, onClose }) => {
    const { user } = useAuth();
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
        CreatedBy: item?.CreatedBy || user?.username || '',
        CreatedAt: item?.CreatedAt || '',
        UpdatedAt: item?.UpdatedAt || '',
        ...(isEdit ? { ItemID: item.ItemID } : {}),
    });
    const [errors, setErrors] = useState({});

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    };

    const handleSubmit = (e) => {
        e?.preventDefault();
        const newErrors = {};
        if (!form.SubType) newErrors.SubType = 'กรุณาเลือกประเภทย่อย';
        if (!form.ItemName.trim()) newErrors.ItemName = 'กรุณากรอกชื่อรายการ';
        if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
        onSave(form);
    };

    const cat = form.Category || category;
    const catInfo = CATEGORIES.find(c => c.key === cat);
    const subtypeOptions = (maTypes || []).filter(t => t.Category === cat).map(t => t.TypeName);

    return (
        <Portal>
            <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className={`p-4 bg-gradient-to-r ${catInfo?.color} text-white`}>
                        <div className="flex justify-between items-center">
                            <h3 className="font-black text-lg">{isEdit ? 'แก้ไขรายการ' : `เพิ่ม ${catInfo?.label} ใหม่`}</h3>
                            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full transition-colors"><X size={18} /></button>
                        </div>
                    </div>
                    <form id="ma-form" onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="ประเภทย่อย" required error={errors.SubType}>
                                <select value={form.SubType} onChange={(e) => handleChange('SubType', e.target.value)} className={`w-full p-2 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100 ${errors.SubType ? 'border-red-400' : 'border-slate-200'}`}>
                                    <option value="">เลือกประเภท...</option>
                                    {subtypeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </FormField>
                            <FormField label={cat === 'SOFTWARE' ? 'ชื่อ Software / License' : cat === 'SERVICE' ? 'ชื่อบริการ' : cat === 'RENTAL' ? 'ชื่อรายการเช่า' : 'ชื่ออุปกรณ์'} error={errors.ItemName}>
                                <input type="text" value={form.ItemName} onChange={(e) => handleChange('ItemName', e.target.value)} className={`w-full p-2 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100 ${errors.ItemName ? 'border-red-400' : 'border-slate-200'}`} placeholder="ระบุชื่อ..." />
                            </FormField>
                        </div>
                        {(cat === 'HARDWARE' || cat === 'RENTAL') && (
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label="ยี่ห้อ/รุ่น"><input type="text" value={form.Brand} onChange={(e) => handleChange('Brand', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Brand / Model" /></FormField>
                                <FormField label="Serial Number"><input type="text" value={form.SerialNumber} onChange={(e) => handleChange('SerialNumber', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="S/N" /></FormField>
                            </div>
                        )}
                        {cat === 'SOFTWARE' && (
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label="หมายเลขบริการ"><input type="text" value={form.ServiceNumber} onChange={(e) => handleChange('ServiceNumber', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Service Number" /></FormField>
                                <FormField label="จำนวน License"><input type="number" min="0" value={form.LicenseQty} onChange={(e) => handleChange('LicenseQty', parseInt(e.target.value) || 0)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" /></FormField>
                            </div>
                        )}
                        {cat === 'SERVICE' && (
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label="เลขสัญญา"><input type="text" value={form.ServiceNumber} onChange={(e) => handleChange('ServiceNumber', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Contract No." /></FormField>
                                <FormField label="สถานที่ให้บริการ">
                                    <select value={form.LocationName} onChange={(e) => handleChange('LocationName', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100">
                                        <option value="">เลือกสถานที่...</option>
                                        {locations.map(l => <option key={l.LocationID} value={l.Name}>{l.Name}</option>)}
                                    </select>
                                </FormField>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            {(cat !== 'SERVICE') && (
                                <FormField label="PO / เลขสัญญา"><input type="text" value={form.PONumber} onChange={(e) => handleChange('PONumber', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" placeholder="PO Number" /></FormField>
                            )}
                            {(cat === 'RENTAL') && (
                                <FormField label="จำนวน"><input type="number" min="0" value={form.LicenseQty} onChange={(e) => handleChange('LicenseQty', parseInt(e.target.value) || 0)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" /></FormField>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {(cat === 'HARDWARE' || cat === 'RENTAL') && (
                                <FormField label="สถานที่ติดตั้ง">
                                    <select value={form.LocationName} onChange={(e) => handleChange('LocationName', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100">
                                        <option value="">เลือกสถานที่...</option>
                                        {locations.map(l => <option key={l.LocationID} value={l.Name}>{l.Name}</option>)}
                                    </select>
                                </FormField>
                            )}
                            <FormField label="ราคา (฿)"><input type="number" min="0" step="0.01" value={form.Price} onChange={(e) => handleChange('Price', parseFloat(e.target.value) || 0)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" /></FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Vendor">
                                <select value={form.VendorID} onChange={(e) => handleChange('VendorID', e.target.value ? parseInt(e.target.value) : '')} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100">
                                    <option value="">เลือก Vendor...</option>
                                    {vendors.map(v => <option key={v.VendorID} value={v.VendorID}>{v.VendorName}</option>)}
                                </select>
                            </FormField>
                            <FormField label="สถานะ">
                                <select value={form.Status} onChange={(e) => handleChange('Status', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100">
                                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="วันที่เริ่ม/ต่อประกัน"><input type="date" value={form.StartDate} onChange={(e) => handleChange('StartDate', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" /></FormField>
                            <FormField label="วันที่หมดอายุ"><input type="date" value={form.EndDate} onChange={(e) => handleChange('EndDate', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100" /></FormField>
                        </div>
                        <FormField label="หมายเหตุ (Remark)">
                            <textarea rows={2} value={form.Remark} onChange={(e) => handleChange('Remark', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100 resize-none" placeholder="ข้อมูลเพิ่มเติม..." />
                        </FormField>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-4">
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2">📋 ข้อมูลการบันทึก</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                <div>
                                    <label className="block text-blue-600 font-bold mb-0.5">ผู้บันทึก</label>
                                    <input type="text" value={form.CreatedBy || user?.username} disabled className="w-full p-1.5 bg-white text-slate-500 rounded border border-blue-100 cursor-not-allowed" />
                                </div>
                                {isEdit && (
                                    <div>
                                        <label className="block text-blue-600 font-bold mb-0.5">วันบันทึก</label>
                                        <input type="text" value={formatDate(form.CreatedAt)} disabled className="w-full p-1.5 bg-white text-slate-500 rounded border border-blue-100 cursor-not-allowed" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </form>
                    <div className="p-3 bg-slate-50 border-t border-slate-100 flex gap-2">
                        <button type="button" onClick={onClose} className="flex-1 py-2 bg-white text-slate-600 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-100 transition-colors">ยกเลิก</button>
                        <button type="submit" form="ma-form" className={`flex-1 py-2 text-white rounded-lg text-xs font-bold bg-gradient-to-r ${catInfo?.color} hover:shadow-lg transition-all`}>
                            {isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </Portal>
    );
};

const FormField = ({ label, required, error, children }) => (
    <div>
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            {label} {required && <span className="text-red-400">*</span>}
        </label>
        {children}
        {error && <p className="text-red-500 text-[10px] mt-0.5 font-medium">{error}</p>}
    </div>
);

export default MALicensePage;