import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Plus, X, Eye, Search, Calendar, Filter, Check, Building2, Upload, FileText, Loader2, RefreshCw, AlertTriangle, Phone, Trash2, Pencil, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import ProductCombobox from '../components/ProductCombobox';
import VendorCombobox from '../components/VendorCombobox';
import Portal from '../components/Portal';
import AlertModal from '../components/AlertModal';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import Pagination from '../components/Pagination';
import POFormModal from '../components/POFormModal';
import PurchaseRequestForm from '../components/PurchaseRequestForm';

import { API_BASE, API_URL } from '../config/api';

import { formatThaiDate } from '../utils/formatDate';

const PurchaseOrdersPage = () => {
    const { purchaseOrders, products, vendors, refreshData, loading } = useData();
    const { user } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);

    // Top Level Tabs
    const [activeTab, setActiveTab] = useState('po-list'); // 'po-list' or 'open-pr'

    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
    const [selectedPO, setSelectedPO] = useState(null);

    // Form State (Only for passing to Modal)
    const [modalInitialData, setModalInitialData] = useState(null);

    // Filter & Pagination State
    const [searchTerm, setSearchTerm] = useState('');

    const getDefaultDateRange = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();

        // ย้อนหลัง 3 เดือนสำหรับค่าเริ่มต้น
        const start = new Date(y, m - 2, 1);
        const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;

        const lastDay = new Date(y, m + 1, 0).getDate();
        const endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        return { startDate, endDate };
    };
    const defaultRange = getDefaultDateRange();
    const [dateFrom, setDateFrom] = useState(defaultRange.startDate);
    const [dateTo, setDateTo] = useState(defaultRange.endDate);
    const [filterStatus, setFilterStatus] = useState('all');

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [sortConfig, setSortConfig] = useState(null);

    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };
    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    const [resultModal, setResultModal] = useState({ isOpen: false, type: 'success', title: '', message: '' });

    const handleEditPO = (po) => {
        setModalInitialData(po);
        setIsEditMode(true);
        setIsModalOpen(true);
    };

    const handleOpenCreateModal = () => {
        setModalInitialData(null);
        setIsEditMode(false);
        setIsModalOpen(true);
    };

    const handleDeletePO = (po) => {
        setResultModal({
            isOpen: true,
            type: 'danger',
            title: 'ยืนยันการลบ',
            message: `คุณต้องการลบใบสั่งซื้อ ${po.PO_ID} ใช่หรือไม่?`,
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE}/pos/${po.PO_ID}`, {
                        method: 'DELETE'
                    });
                    const data = await res.json();
                    if (res.ok) {
                        setResultModal({
                            isOpen: true,
                            type: 'success',
                            title: 'ลบสำเร็จ',
                            message: 'ลบใบสั่งซื้อเรียบร้อยแล้ว'
                        });
                        refreshData();
                    } else {
                        setResultModal({
                            isOpen: true,
                            type: 'error',
                            title: 'ลบไม่สำเร็จ',
                            message: data.error || data.message
                        });
                    }
                } catch (err) {
                    setResultModal({
                        isOpen: true,
                        type: 'error',
                        title: 'ข้อผิดพลาด',
                        message: err.message
                    });
                }
            }
        });
    };

    const handleModalSuccess = async (formData) => {
        try {
            const url = isEditMode ? `${API_BASE}/pos/${formData.PO_ID}` : `${API_BASE}/pos`;
            const method = isEditMode ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await res.json();

            if (res.ok) {
                setResultModal({
                    isOpen: true,
                    type: 'success',
                    title: isEditMode ? 'แก้ไขใบสั่งซื้อสำเร็จ' : 'สร้างใบสั่งซื้อสำเร็จ',
                    message: isEditMode ? `แก้ไขข้อมูล PO ${formData.PO_ID} เรียบร้อยแล้ว` : `สร้างใบสั่งซื้อ ${formData.PO_ID} เรียบร้อยแล้ว`
                });
                setIsModalOpen(false);
                refreshData();
            } else {
                setResultModal({
                    isOpen: true,
                    type: 'error',
                    title: isEditMode ? 'แก้ไขล้มเหลว' : 'สร้าง PO ไม่สำเร็จ',
                    message: data.error || data.message
                });
            }
        } catch (err) {
            setResultModal({
                isOpen: true,
                type: 'error',
                title: 'ข้อผิดพลาด',
                message: err.message
            });
        }
    };





    const getStatusColor = (status) => {
        switch (status) {
            case 'Completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'Partial': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'Cancelled': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-blue-100 text-blue-700 border-blue-200'; // Pending/Open
        }
    };

    // Filter POs
    const filteredPOs = purchaseOrders.filter(po => {
        const matchSearch = po.PO_ID.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (po.VendorName && po.VendorName.toLowerCase().includes(searchTerm.toLowerCase()));

        // Date range filter
        let matchDate = true;
        if (po.RequestDate) {
            const d = po.RequestDate.slice(0, 10);
            if (dateFrom) matchDate = matchDate && d >= dateFrom;
            if (dateTo) matchDate = matchDate && d <= dateTo;
        }

        // UX Enhancement: Always force-show pending/partial POs if using the default date range, 
        // ensuring they never get lost even if they are very old.
        const isDefaultDate = dateFrom === defaultRange.startDate && dateTo === defaultRange.endDate;
        const isUnfinished = po.Status === 'Open' || po.Status === 'Pending' || po.Status === 'Partial';
        if (isDefaultDate && isUnfinished) {
            matchDate = true;
        }

        const matchStatus = filterStatus === 'all' || po.Status === filterStatus ||
            (filterStatus === 'Pending' && (po.Status === 'Pending' || po.Status === 'Open'));

        return matchSearch && matchDate && matchStatus;
    });

    // Pagination Logic
    const sortedPOs = [...filteredPOs].sort((a, b) => {
        if (!sortConfig) return 0;
        let aVal = a[sortConfig.key] || '';
        let bVal = b[sortConfig.key] || '';

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(sortedPOs.length / itemsPerPage);
    const currentTableData = sortedPOs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, dateFrom, dateTo, filterStatus]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
            >
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                            <ShoppingCart className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 tracking-tight">PURCHASE ORDERS</h2>
                    </div>
                </div>

                <div className="flex bg-slate-100 p-1.5 rounded-xl shadow-inner border border-slate-200">
                    <button
                        onClick={() => setActiveTab('po-list')}
                        className={`px-6 py-2 rounded-lg font-bold text-sm transition-all duration-300 ${activeTab === 'po-list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        รายการ PO
                    </button>
                    <button
                        onClick={() => setActiveTab('open-pr')}
                        className={`px-6 py-2 rounded-lg font-bold text-sm transition-all duration-300 ${activeTab === 'open-pr' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        เปิดใบ PR (A5)
                    </button>
                </div>
            </motion.div>

            {activeTab === 'open-pr' ? (
                <motion.div
                    key="pr-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <PurchaseRequestForm />
                </motion.div>
            ) : (
                <motion.div
                    key="po-list-tab"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                >
                    <div className="flex justify-end pr-1">
                        {user?.role === 'Staff' && (
                            <button
                                onClick={handleOpenCreateModal}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl transition-all shadow-lg shadow-indigo-200"
                            >
                                <Plus size={18} /> สร้าง PO ใหม่ (จาก PR)
                            </button>
                        )}
                    </div>
                    {/* Dashboard Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-5 rounded-2xl text-white shadow-lg cursor-pointer transition-all hover:shadow-xl" onClick={() => setFilterStatus('all')}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-indigo-100 text-xs font-bold uppercase tracking-wider mb-1">ทั้งหมด</p>
                                    <h3 className="text-3xl font-black">{purchaseOrders.length}</h3>
                                </div>
                                <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-white" />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setFilterStatus('Pending')}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">รอดำเนินการ</p>
                                    <h3 className="text-2xl font-black text-blue-500">{purchaseOrders.filter(p => p.Status === 'Open' || p.Status === 'Pending').length}</h3>
                                </div>
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                                    <RefreshCw className="w-5 h-5 text-white" />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setFilterStatus('Partial')}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">รับบางส่วน</p>
                                    <h3 className="text-2xl font-black text-amber-500">{purchaseOrders.filter(p => p.Status === 'Partial').length}</h3>
                                </div>
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
                                    <Upload className="w-5 h-5 text-white" />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setFilterStatus('Completed')}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">เสร็จสิ้น</p>
                                    <h3 className="text-2xl font-black text-emerald-500">{purchaseOrders.filter(p => p.Status === 'Completed').length}</h3>
                                </div>
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md">
                                    <Check className="w-5 h-5 text-white" />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setFilterStatus('Cancelled')}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">ยกเลิก</p>
                                    <h3 className="text-2xl font-black text-red-500">{purchaseOrders.filter(p => p.Status === 'Cancelled').length}</h3>
                                </div>
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center shadow-md">
                                    <X className="w-5 h-5 text-white" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* View Toggle & Filter Controls */}
                    <div className="flex flex-wrap gap-3 items-center justify-between scroll-mt-24">
                        <div className="flex flex-wrap gap-3 items-center">
                            <div className="flex gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                                <Search size={18} className="text-slate-400 self-center" />
                                <input
                                    type="text"
                                    placeholder="ค้นหา PO / ผู้ขาย..."
                                    className="bg-transparent border-none outline-none text-sm w-40 text-slate-700 placeholder-slate-400"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            {/* Date Filters */}
                            <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm transition-all">
                                <Calendar size={18} className="text-slate-400 shrink-0" />
                                <input type="date" className="bg-transparent text-sm text-slate-700 outline-none" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                                <span className="text-slate-400">-</span>
                                <input type="date" className="bg-transparent text-sm text-slate-700 outline-none" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                            </div>

                            <div className="flex gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm">
                                <Filter size={18} className="text-slate-400 self-center" />
                                <select
                                    className="bg-transparent border-none outline-none text-sm text-slate-700"
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                >
                                    <option value="all">ทุกสถานะ</option>
                                    <option value="Pending">PENDING</option>
                                    <option value="Partial">PARTIAL</option>
                                    <option value="Completed">COMPLETED</option>
                                    <option value="Cancelled">CANCELLED</option>
                                </select>
                            </div>

                            {(searchTerm || dateFrom !== defaultRange.startDate || dateTo !== defaultRange.endDate || filterStatus !== 'all') && (
                                <button
                                    onClick={() => { setSearchTerm(''); setDateFrom(defaultRange.startDate); setDateTo(defaultRange.endDate); setFilterStatus('all'); }}
                                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                                >
                                    ล้างตัวกรอง
                                </button>
                            )}
                        </div>

                        {/* View Mode Toggle */}
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                title="มุมมองรายการ"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                            </button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                title="มุมมองการ์ด"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    {viewMode === 'list' ? (
                        /* Table View */
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
                        >
                            <div className="overflow-x-auto max-h-[60vh] 2xl:max-h-[70vh] custom-scrollbar relative">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] tracking-wider border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="p-2 pl-4 min-w-[120px] bg-slate-50 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('PO_ID')}>
                                                <div className="flex items-center gap-1">เลข PO {sortConfig?.key === 'PO_ID' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                            </th>
                                            <th className="p-2 min-w-[100px] bg-slate-50 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('RequestDate')}>
                                                <div className="flex items-center gap-1">วันที่บันทึก {sortConfig?.key === 'RequestDate' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                            </th>
                                            <th className="p-2 min-w-[150px] bg-slate-50 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('VendorName')}>
                                                <div className="flex items-center gap-1">VENDOR {sortConfig?.key === 'VendorName' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                            </th>
                                            <th className="p-2 min-w-[120px] bg-slate-50 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('DeliveryTo')}>
                                                <div className="flex items-center gap-1">DELIVERY TO {sortConfig?.key === 'DeliveryTo' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                            </th>
                                            <th className="p-2 min-w-[100px] bg-slate-50 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('DueDate')}>
                                                <div className="flex items-center gap-1">DUE DATE {sortConfig?.key === 'DueDate' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                            </th>
                                            <th className="p-2 min-w-[120px] bg-slate-50 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('RequestedBy')}>
                                                <div className="flex items-center gap-1">ผู้ทำรายการ {sortConfig?.key === 'RequestedBy' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                            </th>
                                            <th className="p-2 min-w-[100px] text-center bg-slate-50 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('Status')}>
                                                <div className="flex items-center justify-center gap-1">สถานะ {sortConfig?.key === 'Status' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                            </th>
                                            <th className="p-2 min-w-[60px] text-center bg-slate-50">จำนวน</th>
                                            <th className="p-2 min-w-[120px] text-right pr-4 bg-slate-50">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {currentTableData.map((po) => (
                                            <tr key={po.PO_ID} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelectedPO(po)}>
                                                <td className="p-2 pl-4 font-bold text-slate-700">{po.PO_ID}</td>
                                                <td className="p-2 text-slate-600">{formatThaiDate(po.RequestDate)}</td>
                                                <td className="p-2">
                                                    <div className="font-medium text-slate-800 break-words">{po.VendorName || '-'}</div>
                                                </td>
                                                <td className="p-2">
                                                    <div className="text-slate-700 break-words">{po.DeliveryTo || '-'}</div>
                                                </td>
                                                <td className="p-2 text-slate-600">{po.DueDate ? formatThaiDate(po.DueDate) : '-'}</td>
                                                <td className="p-2">
                                                    <div className="text-slate-700">{po.RequestedBy}</div>
                                                    <div className="text-xs text-slate-400">{po.Section}</div>
                                                </td>
                                                <td className="p-2 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusColor(po.Status)}`}>
                                                        {po.Status === 'Open' ? 'Pending' : po.Status}
                                                    </span>
                                                </td>
                                                <td className="p-2 text-center font-mono text-slate-600">
                                                    {po.Items?.reduce((sum, item) => sum + (item.QtyOrdered || 0), 0) || 0}
                                                </td>
                                                <td className="p-2 text-right pr-4">
                                                    <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => setSelectedPO(po)}
                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                            title="ดูรายละเอียด"
                                                        >
                                                            <Eye size={16} />
                                                        </button>
                                                        {user?.role === 'Staff' && (po.Status === 'Open' || po.Status === 'Pending') && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleEditPO(po)}
                                                                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                                                                    title="แก้ไข"
                                                                >
                                                                    <Pencil size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeletePO(po)}
                                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                    title="ลบ"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredPOs.length === 0 && (
                                            <tr>
                                                <td colSpan="9" className="p-8 text-center text-slate-500">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <ShoppingCart size={48} className="text-slate-200 mb-4" />
                                                        <p className="font-medium">ไม่พบใบสั่งซื้อ</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    ) : (
                        /* Grid View */
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {currentTableData.map((po, i) => (
                                <motion.div
                                    key={po.PO_ID}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="group bg-white border border-slate-200 p-4 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden cursor-pointer"
                                    onClick={() => setSelectedPO(po)}
                                >
                                    <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${po.Status === 'Partial' ? 'from-amber-400 to-orange-500' : po.Status === 'Completed' ? 'from-emerald-400 to-green-500' : po.Status === 'Cancelled' ? 'from-red-400 to-pink-500' : 'from-blue-400 to-indigo-500'} opacity-10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`}></div>

                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md bg-gradient-to-br ${po.Status === 'Partial' ? 'from-amber-400 to-orange-500' : po.Status === 'Completed' ? 'from-emerald-500 to-green-600' : po.Status === 'Cancelled' ? 'from-red-500 to-pink-600' : 'from-blue-500 to-indigo-600'}`}>
                                                    <ShoppingCart size={20} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="font-black text-slate-800 text-sm truncate">{po.PO_ID}</h4>
                                                    <p className="text-[10px] text-slate-500 font-medium break-words">{po.VendorName || 'ไม่ระบุผู้ขาย'}</p>
                                                </div>
                                            </div>
                                            <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm ${getStatusColor(po.Status)}`}>
                                                {po.Status === 'Open' ? 'Pending' : po.Status}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-2 mb-4">
                                            {po.BudgetNo && (
                                                <span className="text-[9px] bg-slate-50 text-slate-500 px-2 py-1 rounded-lg border border-slate-100 font-mono">
                                                    BUDGET NO.: {po.BudgetNo}
                                                </span>
                                            )}
                                            {po.DeliveryTo && (
                                                <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg border border-indigo-100 font-medium">
                                                    👤 {po.DeliveryTo}
                                                </span>
                                            )}
                                            <span className="text-[9px] bg-slate-50 text-slate-500 px-2 py-1 rounded-lg border border-slate-100 flex items-center gap-1">
                                                <Calendar size={10} /> {formatThaiDate(po.RequestDate)}
                                            </span>
                                            {po.DueDate && (
                                                <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-1 rounded-lg border border-amber-100 flex items-center gap-1 font-medium">
                                                    ⏰ DUE DATE: {formatThaiDate(po.DueDate)}
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-auto pt-2 border-t border-slate-50 flex gap-2">
                                            <button
                                                className="flex-1 bg-slate-50 text-slate-600 font-bold py-2 rounded-xl text-xs hover:bg-indigo-50 hover:text-indigo-600 border border-slate-100 transition-all flex items-center justify-center gap-1 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 group-hover:shadow-lg"
                                            >
                                                <Eye size={14} /> ดูรายละเอียด
                                            </button>
                                            {user?.role === 'Staff' && (po.Status === 'Open' || po.Status === 'Pending') && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEditPO(po); }}
                                                        className="px-3 bg-amber-50 text-amber-600 font-bold rounded-xl text-xs hover:bg-amber-100 border border-amber-100 transition-all flex items-center justify-center"
                                                        title="แก้ไข"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeletePO(po); }}
                                                        className="px-3 bg-red-50 text-red-600 font-bold rounded-xl text-xs hover:bg-red-100 border border-red-100 transition-all flex items-center justify-center"
                                                        title="ลบ"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                            {filteredPOs.length === 0 && (
                                <div className="col-span-full">
                                    <EmptyState
                                        title="ไม่พบ PO"
                                        message="ลองเปลี่ยนตัวกรอง หรือสร้าง PO ใหม่"
                                        icon={ShoppingCart}
                                        actionLabel={searchTerm || dateFrom !== defaultRange.startDate || filterStatus !== 'all' ? "ล้างตัวกรอง" : "สร้าง PO ใหม่"}
                                        onAction={() => {
                                            if (searchTerm || dateFrom !== defaultRange.startDate || filterStatus !== 'all') {
                                                setSearchTerm(''); setDateFrom(defaultRange.startDate); setDateTo(defaultRange.endDate); setFilterStatus('all');
                                            } else {
                                                handleOpenCreateModal();
                                            }
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pagination */}
                    {
                        filteredPOs.length > 0 && (
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={handlePageChange}
                                itemsPerPage={itemsPerPage}
                                totalItems={filteredPOs.length}
                            />
                        )
                    }

                    {/* DETAIL MODAL */}
                    <AnimatePresence>
                        {selectedPO && (
                            <Portal>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
                                >
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden"
                                    >
                                        {/* Header */}
                                        <div className="p-4 md:p-5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-black text-xl md:text-2xl tracking-tight">{selectedPO.PO_ID}</h3>
                                                    <p className="text-indigo-200 mt-1">{selectedPO.VendorName || 'ไม่ระบุผู้ขาย'}</p>
                                                    {(() => {
                                                        const normalize = (str) => str ? str.toLowerCase().trim() : '';
                                                        const vendor = (vendors || []).find(v => normalize(v.VendorName) === normalize(selectedPO.VendorName));

                                                        if (vendor?.ContactInfo) {
                                                            return (
                                                                <div className="mt-2 text-xs bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/10 text-indigo-50">
                                                                    <p className="font-bold mb-0.5 flex items-center gap-1"><Phone size={10} /> CONTACT INFO:</p>
                                                                    <p className="whitespace-pre-wrap">{vendor.ContactInfo}</p>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}

                                                </div>
                                                <button onClick={() => setSelectedPO(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                                                    <X size={20} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Body */}
                                        <div className="p-4 md:p-5 space-y-4 max-h-[60vh] overflow-y-auto bg-slate-50/50">
                                            {/* Details List */}
                                            <div className="bg-slate-50 rounded-xl overflow-hidden divide-y divide-slate-100 border border-slate-100">
                                                <div className="flex items-center p-3 sm:px-4">
                                                    <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">สถานะ</span>
                                                    <span className={`text-sm font-bold px-3 py-1 rounded-full border ${getStatusColor(selectedPO.Status)}`}>
                                                        {selectedPO.Status === 'Open' ? 'Pending' : selectedPO.Status}
                                                    </span>
                                                </div>
                                                <div className="flex items-center p-3 sm:px-4">
                                                    <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">วันที่สร้าง</span>
                                                    <span className="text-sm font-bold text-slate-800">{formatThaiDate(selectedPO.RequestDate)}</span>
                                                </div>
                                                <div className="flex items-center p-3 sm:px-4">
                                                    <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">ผู้บันทึก</span>
                                                    <span className="text-sm font-bold text-slate-800">{selectedPO.RequestedBy || '-'}</span>
                                                </div>
                                                <div className="flex items-center p-3 sm:px-4">
                                                    <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">แผนก</span>
                                                    <span className="text-sm font-bold text-slate-800">{selectedPO.Section || '-'}</span>
                                                </div>
                                                {selectedPO.DueDate && (
                                                    <div className="flex items-center p-3 sm:px-4">
                                                        <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">DUE DATE</span>
                                                        <span className="text-sm font-bold text-slate-800">{formatThaiDate(selectedPO.DueDate)}</span>
                                                    </div>
                                                )}
                                                {selectedPO.PR_No && (
                                                    <div className="flex items-center p-3 sm:px-4">
                                                        <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">PR NO.</span>
                                                        <span className="text-sm font-bold text-slate-800">{selectedPO.PR_No}</span>
                                                    </div>
                                                )}
                                                {selectedPO.BudgetNo && (
                                                    <div className="flex items-center p-3 sm:px-4">
                                                        <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">BUDGET NO.</span>
                                                        <span className="text-sm font-bold text-slate-800">{selectedPO.BudgetNo}</span>
                                                    </div>
                                                )}
                                                {selectedPO.DeliveryTo && (
                                                    <div className="flex items-center p-3 sm:px-4">
                                                        <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">DELIVERY TO</span>
                                                        <span className="text-sm font-bold text-slate-800">{selectedPO.DeliveryTo}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Items List */}
                                            <div >
                                                <h4 className="font-bold text-slate-800 mb-3">INVENTORY LIST ({selectedPO.Items?.length || 0})</h4>
                                                <div className="bg-slate-50 rounded-xl overflow-hidden overflow-x-auto">
                                                    <table className="w-full  text-sm">
                                                        <thead className="bg-slate-100">
                                                            <tr>
                                                                <th className="text-left p-3 font-bold text-slate-600">รายการ</th>
                                                                <th className="text-center p-3 font-bold text-slate-600 w-25">รับแล้ว/สั่งซื้อ</th>
                                                                <th className="text-center p-3 font-bold text-slate-600 w-28">สถานะ</th>
                                                                <th className="text-right p-3 font-bold text-slate-600 w-28">ราคาต่อหน่วย</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {selectedPO.Items?.map((item, idx) => {
                                                                const isFullyReceived = (item.QtyReceived || 0) >= item.QtyOrdered;
                                                                return (
                                                                    <tr key={idx} className={`border-t ${isFullyReceived ? 'bg-emerald-100' : 'border-slate-200'}`}>
                                                                        <td className={`p-3 ${isFullyReceived ? 'text-emerald-700 ' : 'text-slate-700'}`}>
                                                                            {item.ItemName || item.ProductName || `Item #${idx + 1}`}
                                                                        </td>
                                                                        <td className="p-3 text-center font-mono">
                                                                            <span className="text-slate-600 font-bold">{item.QtyReceived || 0}</span>
                                                                            <span className="text-slate-400"> / {item.QtyOrdered}</span>
                                                                        </td>
                                                                        <td className="p-3 text-center">
                                                                            {isFullyReceived ? (
                                                                                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold border border-emerald-200">
                                                                                    <Check size={12} /> รับแล้ว
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                                                    รอของ
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="p-3 text-right font-mono text-slate-600">฿{(item.UnitCost || 0).toLocaleString()}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>

                                            {/* Remark */}
                                            {selectedPO.Remark && (
                                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                                                    <p className="text-xs text-amber-600 font-bold mb-1">หมายเหตุ</p>
                                                    <p className="text-sm text-amber-800">{selectedPO.Remark}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Footer */}
                                        <div className="p-4 bg-slate-50 border-t border-slate-200">
                                            <button
                                                onClick={() => setSelectedPO(null)}
                                                className="w-full bg-slate-800 text-white font-bold py-2.5 text-sm rounded-lg hover:bg-slate-700 transition-all"
                                            >
                                                ปิด
                                            </button>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            </Portal>
                        )}
                    </AnimatePresence>

                    {/* CREATE PO MODAL */}
                    <POFormModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        initialData={modalInitialData}
                        isEditMode={isEditMode}
                        products={products}
                        vendors={vendors}
                        user={user}
                        onSuccess={handleModalSuccess}
                    />
                    {/* RESULT MODAL */}
                    {/* ALERT MODAL (Replaces ResultModal) */}
                    <AlertModal
                        isOpen={resultModal.isOpen}
                        onConfirm={() => {
                            if (resultModal.onConfirm) {
                                resultModal.onConfirm();
                            } else {
                                setResultModal({ ...resultModal, isOpen: false });
                            }
                        }}
                        onCancel={resultModal.type === 'danger' || resultModal.type === 'confirm' ? () => setResultModal({ ...resultModal, isOpen: false }) : undefined}
                        type={resultModal.type}
                        title={resultModal.title}
                        message={resultModal.message}
                        confirmText={resultModal.confirmText || "ตกลง "}
                        cancelText={resultModal.cancelText || "ยกเลิก"}
                    />
                </motion.div>
            )}
        </div>
    );
};

export default PurchaseOrdersPage;
