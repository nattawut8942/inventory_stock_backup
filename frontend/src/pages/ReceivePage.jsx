import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Search, Calendar, Eye, X, Package, Check, CircleArrowDown, ShoppingCart, Clock, Phone, RotateCcw, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import Portal from '../components/Portal';
import StatCard from '../components/StatCard'; // Import StatCard

import { formatThaiDate } from '../utils/formatDate';
import AlertModal from '../components/AlertModal';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import Pagination from '../components/Pagination';

import { API_BASE, API_URL } from '../config/api';

const ReceivePage = () => {
    console.log("ReceivePage: Rendering...");
    const { purchaseOrders, invoices, products, vendors, transactions, refreshData, loading } = useData();
    const { user } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activePo, setActivePo] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedInvoice, setSelectedInvoice] = useState(null); // For Invoice Detail View
    // Default to 3 months date range for UX
    const getDefaultDateRange = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();

        // ย้อนหลัง 3 เดือน
        const start = new Date(y, m - 2, 1);
        const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;

        const lastDay = new Date(y, m + 1, 0).getDate();
        const endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        return { startDate, endDate };
    };
    const defaultRange = getDefaultDateRange();
    const [dateFrom, setDateFrom] = useState(defaultRange.startDate);
    const [dateTo, setDateTo] = useState(defaultRange.endDate);
    const [selectedPO, setSelectedPO] = useState(null); // For detail view
    const [resultModal, setResultModal] = useState({ isOpen: false, type: 'success', title: '', message: '' });
    const [cancelConfirm, setCancelConfirm] = useState({ isOpen: false, invoiceNo: null });

    // Pagination State for Invoices
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

    // Selection state for Receive Modal
    const [selectedItems, setSelectedItems] = useState({});

    // Initialize selection when opening modal
    useEffect(() => {
        if (isModalOpen && activePo && Array.isArray(activePo.Items)) {
            const initial = {};
            activePo.Items.forEach((item, idx) => {
                const remaining = item.QtyOrdered - (item.QtyReceived || 0);
                if (remaining > 0) {
                    initial[idx] = true; // Default to selected if not fully received
                }
            });
            setSelectedItems(initial);
        }
    }, [isModalOpen, activePo]);

    const toggleSelection = (idx) => {
        setSelectedItems(prev => ({
            ...prev,
            [idx]: !prev[idx]
        }));
    };

    const handleReceive = async (poId, invoiceNo, itemsReceived) => {
        if (!itemsReceived || itemsReceived.length === 0) {
            setResultModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด (Error)', message: 'กรุณาเลือกรายการที่ต้องการรับอย่างน้อย 1 รายการ (Please select at least 1 item)' });
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/receive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    PO_ID: poId,
                    InvoiceNo: invoiceNo,
                    ItemsReceived: itemsReceived,
                    UserID: user.username
                })
            });
            if (res.ok) {
                setIsModalOpen(false);
                refreshData();
                setResultModal({ isOpen: true, type: 'success', title: 'รับของสำเร็จ (Receive Success)', message: `บันทึก Invoice ${invoiceNo} เรียบร้อยแล้ว (Invoice recorded)` });
            } else {
                const err = await res.json();
                setResultModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: err.details || 'ไม่สามารถบันทึกได้ (Operation failed)' });
            }
        } catch (err) {
            setResultModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Connection Error)', message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ (Cannot connect to server)' });
        }
    };

    // Cancel Invoice Handler
    const handleCancelInvoice = async (invoiceNo) => {
        try {
            const res = await fetch(`${API_BASE}/invoice/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    InvoiceNo: invoiceNo,
                    UserID: user?.username || 'system'
                })
            });
            if (res.ok) {
                refreshData();
                setSelectedInvoice(null);
                setResultModal({ isOpen: true, type: 'success', title: 'ยกเลิกสำเร็จ', message: `Invoice ${invoiceNo} ถูกยกเลิกเรียบร้อยแล้ว สต็อกและ PO ถูกปรับกลับคืน` });
            } else {
                const err = await res.json();
                setResultModal({ isOpen: true, type: 'error', title: 'ยกเลิกไม่สำเร็จ', message: err.details || 'ไม่สามารถยกเลิก Invoice ได้' });
            }
        } catch (err) {
            setResultModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
        }
    };

    // Stats Calculation
    const stats = useMemo(() => {
        const totalPOs = purchaseOrders.length;
        const pendingPOs = purchaseOrders.filter(po => po.Status !== 'Completed').length;
        const todayDate = new Date().toISOString().slice(0, 10);
        const receivedToday = invoices.filter(inv => inv.ReceiveDate?.startsWith(todayDate)).length;

        return { totalPOs, pendingPOs, receivedToday };
    }, [purchaseOrders, invoices]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'Completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'Partial': return 'bg-amber-100 text-amber-700 border-amber-200';
            default: return 'bg-blue-100 text-blue-700 border-blue-200';
        }
    };

    // 1. Filtered Data Logic
    const result = useMemo(() => {
        console.log("ReceivePage: Filtering data...");
        try {
            // Filter POs
            const safePOs = Array.isArray(purchaseOrders) ? purchaseOrders : [];
            console.log("ReceivePage: POs count:", safePOs.length);

            const filteredPOs = safePOs
                .filter(po => po && po.Status !== 'Completed')
                .filter(po => {
                    const matchSearch = String(po.PO_ID || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        String(po.VendorName || '').toLowerCase().includes(searchTerm.toLowerCase());

                    // Date range filter
                    let matchDate = true;
                    if (po.RequestDate) {
                        const d = po.RequestDate.slice(0, 10);
                        if (dateFrom) matchDate = matchDate && d >= dateFrom;
                        if (dateTo) matchDate = matchDate && d <= dateTo;
                    }

                    // UX Enhancement: Always show unfinished POs (Open/Partial) if using default date range
                    const isDefaultDate = dateFrom === defaultRange.startDate && dateTo === defaultRange.endDate;
                    const isUnfinished = po.Status === 'Open' || po.Status === 'Pending' || po.Status === 'Partial';
                    if (isDefaultDate && isUnfinished) {
                        matchDate = true;
                    }

                    return matchSearch && matchDate;
                });

            // Filter Invoices
            const safeInvoices = Array.isArray(invoices) ? invoices : [];
            console.log("ReceivePage: Invoices count:", safeInvoices.length);

            const filteredInvoices = safeInvoices
                .filter(inv => {
                    if (!inv) return false;
                    const matchSearch = (inv.InvoiceNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (inv.PO_ID || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (inv.BudgetNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (inv.VendorName || '').toLowerCase().includes(searchTerm.toLowerCase());

                    // Date range filter
                    let matchDate = true;
                    if (inv.ReceiveDate) {
                        const d = inv.ReceiveDate.slice(0, 10);
                        if (dateFrom) matchDate = matchDate && d >= dateFrom;
                        if (dateTo) matchDate = matchDate && d <= dateTo;
                    }

                    return matchSearch && matchDate;
                });

            console.log("ReceivePage: Filtering complete.");
            return { filteredPOs, filteredInvoices };
        } catch (error) {
            console.error("ReceivePage: Error during filtering:", error);
            return { filteredPOs: [], filteredInvoices: [] };
        }
    }, [purchaseOrders, invoices, searchTerm, dateFrom, dateTo]);

    const { filteredPOs, filteredInvoices } = result;

    // Pagination Logic
    const sortedInvoices = [...filteredInvoices].sort((a, b) => {
        if (!sortConfig) return 0;
        let aVal = a[sortConfig.key] || '';
        let bVal = b[sortConfig.key] || '';

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(sortedInvoices.length / itemsPerPage);
    const currentInvoices = sortedInvoices.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, dateFrom, dateTo]);

    if (loading && purchaseOrders.length === 0 && invoices.length === 0) {
        return <LoadingState message="กำลังโหลดข้อมูลการรับเข้า... (Loading entries...)" />;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    icon={ShoppingCart}
                    title="ใบสั่งซื้อทั้งหมด "
                    value={stats.totalPOs}
                    subValue="รายการ"
                    color="from-blue-500 to-blue-600"
                />
                <StatCard
                    icon={Clock}
                    title="รอรับของ"
                    value={stats.pendingPOs}
                    subValue="รายการ"
                    color="from-amber-500 to-amber-600"
                    isAlert={stats.pendingPOs > 0}
                />
                <StatCard
                    icon={Check}
                    title="รับของวันนี้"
                    value={stats.receivedToday}
                    subValue="รายการ"
                    color="from-emerald-500 to-emerald-600"
                />
            </div>

            {/* Header Controls */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4"
            >
                <div>
                    <h2 className="text-3xl font-black mb-2 text-slate-800">RECEIVE GOODS</h2>
                    <p className="text-slate-500 font-medium">บันทึกรับอุปกรณ์เข้าสต็อก</p>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap gap-3 items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                        <Search size={18} className="text-slate-400" />
                        <input
                            type="text"
                            placeholder="ค้นหา PO / ผู้ขาย..."
                            className="bg-transparent border-none outline-none text-sm w-32 lg:w-48 text-slate-700 placeholder-slate-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="h-8 w-px bg-slate-200 mx-1"></div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">วัน-เวลา:</span>
                        <input
                            type="date"
                            className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-indigo-500"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                        <span className="text-slate-300">-</span>
                        <input
                            type="date"
                            className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-indigo-500"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                    </div>
                    {(searchTerm || dateFrom !== defaultRange.startDate || dateTo !== defaultRange.endDate) && (
                        <button
                            onClick={() => { setSearchTerm(''); setDateFrom(defaultRange.startDate); setDateTo(defaultRange.endDate); }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="ล้างตัวกรอง (Clear Filters)"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </motion.div>

            {/* Compact PO Cards */}
            <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Package className="text-indigo-600" size={20} />
                    รายการที่ต้องรับ
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {filteredPOs.map((po, i) => (
                        <motion.div
                            key={po.PO_ID}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="group bg-white border border-slate-200 p-4 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
                        >
                            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${po.Status === 'Partial' ? 'from-amber-400 to-orange-500' : 'from-blue-400 to-indigo-500'} opacity-10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`}></div>

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md bg-gradient-to-br ${po.Status === 'Partial' ? 'from-amber-400 to-orange-500' : 'from-blue-500 to-indigo-600'}`}>
                                            <Package size={20} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-black text-slate-800 text-sm truncate">{po.PO_ID}</h4>
                                            <p className="text-[10px] text-slate-500 font-medium truncate">{po.VendorName || 'ไม่ระบุผู้ขาย (Unknown Vendor)'}</p>
                                        </div>
                                    </div>
                                    <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm ${getStatusColor(po.Status)}`}>
                                        {po.Status === 'Open' ? 'Pending' : po.Status === 'Partial' ? 'Partial' : po.Status === 'Completed' ? 'Completed' : po.Status}
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {po.BudgetNo && (
                                        <span className="text-[10px] bg-slate-50 text-slate-500 px-2 py-1 rounded-lg border border-slate-100 font-mono">
                                            BudgetNo.: {po.BudgetNo}
                                        </span>
                                    )}
                                    {po.DeliveryTo && (
                                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg border border-indigo-100 font-medium">
                                            👤 {po.DeliveryTo}
                                        </span>
                                    )}
                                    <span className="text-[10px] bg-slate-50 text-slate-500 px-2 py-1 rounded-lg border border-slate-100 flex items-center gap-1">
                                        <Calendar size={10} /> {formatThaiDate(po.RequestDate)}
                                    </span>
                                    {po.DueDate && (
                                        <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-1 rounded-lg border border-amber-100 flex items-center gap-1 font-medium">
                                            ⏰ Due Date: {formatThaiDate(po.DueDate)}
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-auto">
                                    <button
                                        onClick={() => setSelectedPO(po)}
                                        className="bg-slate-50 text-slate-600 font-bold py-2 rounded-xl text-xs hover:bg-white hover:shadow-md hover:text-indigo-600 border border-slate-100 transition-all flex items-center justify-center gap-1"
                                    >
                                        <Eye size={14} /> รายละเอียด
                                    </button>
                                    {user?.role === 'Staff' && (
                                        <button
                                            onClick={() => { setActivePo(po); setIsModalOpen(true); }}
                                            className="bg-emerald-600 text-white font-bold py-2 rounded-xl text-xs hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-200 transition-all flex items-center justify-center gap-1"
                                        >
                                            <Check size={14} /> รับของ
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                    {filteredPOs.length === 0 && (
                        <div className="col-span-full">
                            <EmptyState
                                title="ไม่พบรายการค้างรับ "
                                message="ไม่มีใบสั่งซื้อที่รอรับของในขณะนี้ (All items received)"
                                icon={Check}
                                actionLabel={searchTerm || dateFrom !== defaultRange.startDate ? "ล้างตัวกรอง (Clear Filters)" : null}
                                onAction={() => { setSearchTerm(''); setDateFrom(defaultRange.startDate); setDateTo(defaultRange.endDate); }}
                                className="bg-slate-50/50 border-dashed border-slate-200"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Invoice History Section */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 mb-2">
                            <FileText className="text-indigo-600" /> ประวัติการรับของ
                        </h2>
                        <p className="text-sm text-slate-500 pl-8">รายการ INVOICE ที่บันทึกรับของแล้ว</p>
                    </div>
                </div>

                {/* 1. เปลี่ยน overflow-hidden เป็น overflow-x-auto */}
                <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
                    {/* 2. เพิ่ม min-w-full และอาจกำหนด min-width ขั้นต่ำเพื่อให้แน่ใจว่าตารางจะไม่เบียดกันเกินไป */}
                    <table className="w-full min-w-[800px] text-left text-sm table-auto">
                        <thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-xs text-slate-500 uppercase border-b border-slate-200">
                            <tr>
                                {/* 3. เพิ่ม whitespace-nowrap ในคอลัมน์ที่ต้องการให้กว้างตามเนื้อหา */}
                                <th className="p-4 pl-6 font-bold whitespace-nowrap cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('InvoiceNo')}>
                                    <div className="flex items-center gap-1">เลข INVOICE {sortConfig?.key === 'InvoiceNo' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 font-bold whitespace-nowrap cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('PO_ID')}>
                                    <div className="flex items-center gap-1">PO REF. {sortConfig?.key === 'PO_ID' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 font-bold whitespace-nowrap cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('VendorName')}>
                                    <div className="flex items-center gap-1">VENDOR {sortConfig?.key === 'VendorName' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 font-bold whitespace-nowrap cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('BudgetNo')}>
                                    <div className="flex items-center gap-1">BUDGET NO. {sortConfig?.key === 'BudgetNo' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 font-bold whitespace-nowrap cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('ReceiveDate')}>
                                    <div className="flex items-center gap-1">วัน-เวลา {sortConfig?.key === 'ReceiveDate' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 font-bold text-center whitespace-nowrap cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('Status')}>
                                    <div className="flex items-center justify-center gap-1">สถานะ {sortConfig?.key === 'Status' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 font-bold text-center whitespace-nowrap cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('ReceivedBy')}>
                                    <div className="flex items-center justify-center gap-1">User {sortConfig?.key === 'ReceivedBy' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 font-bold text-center whitespace-nowrap">ดำเนินการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {currentInvoices.map((inv, i) => (
                                <tr key={inv.InvoiceID || i} className="hover:bg-indigo-50/30 transition-colors group cursor-default">
                                    <td className="p-4 pl-6 font-mono font-bold text-slate-700 group-hover:text-indigo-700 whitespace-nowrap">
                                        {inv.InvoiceNo}
                                    </td>
                                    <td className="p-4 whitespace-nowrap">
                                        <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-xs font-mono font-bold">
                                            {inv.PO_ID}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {/* ถ้าอยากให้ขยายตามชื่อผู้ขาย ให้ลบ truncate และ max-w ออก */}
                                        <div className="text-xs font-bold text-slate-700 whitespace-nowrap">
                                            {inv.VendorName || '-'}
                                        </div>
                                    </td>
                                    <td className="p-4 text-slate-500 font-mono text-xs whitespace-nowrap">
                                        {inv.BudgetNo || '-'}
                                    </td>
                                    <td className="p-4 text-slate-500 group-hover:text-slate-700 transition-colors whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar size={12} className="text-slate-300 group-hover:text-indigo-400" />
                                            {formatThaiDate(inv.ReceiveDate)}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center whitespace-nowrap">
                                        {inv.Status === 'Cancelled' ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-bold border border-red-200">
                                                ยกเลิกแล้ว
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold border border-emerald-200">
                                                <Check size={12} className="mr-1" /> ปกติ
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center whitespace-nowrap">
                                        <div className="flex items-center justify-center gap-2">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                                                {inv.ReceivedBy || '?'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center whitespace-nowrap">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => setSelectedInvoice(inv)}
                                                className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                                            >
                                                <Eye size={14} /> ดูรายละเอียด
                                            </button>
                                            {user?.role === 'Staff' && inv.Status !== 'Cancelled' && (
                                                <button
                                                    onClick={() => setCancelConfirm({ isOpen: true, invoiceNo: inv.InvoiceNo })}
                                                    className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-200"
                                                >
                                                    <RotateCcw size={14} /> ยกเลิก
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredInvoices.length > 0 && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        itemsPerPage={itemsPerPage}
                        totalItems={filteredInvoices.length}
                    />
                )}
            </div>

            {/* DETAIL MODAL */}
            <AnimatePresence>
                {selectedPO && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden"
                            >
                                {/* Header */}
                                <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 opacity-80">
                                                <Package size={16} />
                                                <span className="text-xs font-bold uppercase tracking-wider">ใบสั่งซื้อ</span>
                                            </div>
                                            <h3 className="font-black text-lg md:text-xl tracking-tight">{selectedPO.PO_ID}</h3>
                                            <p className="text-slate-300 font-medium mt-1 text-sm">{selectedPO.VendorName || 'ไม่ระบุผู้ขาย (Unknown Vendor)'}</p>
                                            {selectedPO.VendorName && (vendors || []).find(v => v.VendorName === selectedPO.VendorName)?.ContactInfo && (
                                                <div className="mt-2 text-xs bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/10 text-indigo-50">
                                                    <p className="font-bold mb-0.5 flex items-center gap-1"><Phone size={10} /> Contact Info:</p>
                                                    <p className="whitespace-pre-wrap">{(vendors || []).find(v => v.VendorName === selectedPO.VendorName)?.ContactInfo}</p>
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={() => setSelectedPO(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto bg-slate-50/50">
                                    {/* Info */}
                                    <div className="bg-white rounded-2xl overflow-hidden divide-y divide-slate-100 border border-slate-100 shadow-sm">
                                        <div className="flex items-center p-3 sm:px-4">
                                            <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">สถานะ</span>
                                            <span className={`text-sm font-bold px-3 py-1 rounded-full border ${getStatusColor(selectedPO.Status)}`}>
                                                {selectedPO.Status === 'Open' ? 'Pending' : selectedPO.Status === 'Partial' ? 'Partial' : selectedPO.Status === 'Completed' ? 'Completed' : selectedPO.Status}
                                            </span>
                                        </div>
                                        <div className="flex items-center p-3 sm:px-4">
                                            <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">REQUEST DATE</span>
                                            <span className="text-sm font-bold text-slate-800">{formatThaiDate(selectedPO.RequestDate)}</span>
                                        </div>
                                        {selectedPO.DueDate && (
                                            <div className="flex items-center p-3 sm:px-4">
                                                <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">DUE DATE</span>
                                                <span className="text-sm font-bold text-slate-800">{formatThaiDate(selectedPO.DueDate)}</span>
                                            </div>
                                        )}
                                        {selectedPO.BudgetNo && (
                                            <div className="flex items-center p-3 sm:px-4">
                                                <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">BUDGET NO.</span>
                                                <span className="text-sm font-bold text-slate-800 font-mono">{selectedPO.BudgetNo}</span>
                                            </div>
                                        )}
                                        {selectedPO.PR_No && (
                                            <div className="flex items-center p-3 sm:px-4">
                                                <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">PR NO.</span>
                                                <span className="text-sm font-bold text-slate-800 font-mono">{selectedPO.PR_No}</span>
                                            </div>
                                        )}
                                        {selectedPO.DeliveryTo && (
                                            <div className="flex items-center p-3 sm:px-4">
                                                <span className="text-xs text-slate-500 font-bold uppercase w-64 shrink-0">ผู้เปิด PR</span>
                                                <span className="text-sm font-bold text-slate-800">{selectedPO.DeliveryTo}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Items */}
                                    <div>
                                        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <Package className="text-indigo-500" size={18} />
                                            รายการอุปกรณ์ ({selectedPO.Items?.length || 0})
                                        </h4>
                                        <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 border-b border-slate-100">
                                                    <tr>
                                                        <th className="text-left p-4 font-bold text-slate-500">รายการ</th>
                                                        <th className="text-center p-4 font-bold text-slate-500 w-32">รับแล้ว/สั่งซื้อ</th>
                                                        <th className="text-center p-4 font-bold text-slate-500 w-28">สถานะ</th>
                                                        <th className="text-right p-4 font-bold text-slate-500 w-28">ราคา</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedPO.Items?.map((item, idx) => {
                                                        const prodName = item.ItemName || (Array.isArray(products) ? products : []).find(p => p.ProductID === item.ProductID)?.ProductName || `Item #${idx + 1}`;
                                                        const isFullyReceived = (item.QtyReceived || 0) >= item.QtyOrdered;
                                                        return (
                                                            <tr key={idx} className={`border-b border-slate-50 last:border-0 ${isFullyReceived ? 'bg-emerald-100' : ''}`}>
                                                                <td className={`p-2 font-medium ${isFullyReceived ? 'text-emerald-900' : 'text-slate-700'}`}>
                                                                    {prodName}
                                                                </td>
                                                                <td className="p-2 text-center">
                                                                    <div className={`inline-flex items-center rounded-lg px-2 py-1 font-mono text-xs ${isFullyReceived ? 'bg-emerald-200/50 text-emerald-800' : 'bg-slate-100'}`}>
                                                                        <span className="font-bold">{item.QtyReceived || 0}</span>
                                                                        <span className="mx-1 opacity-50">/</span>
                                                                        <span className="font-bold">{item.QtyOrdered}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 text-center">
                                                                    {isFullyReceived ? (
                                                                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold border border-emerald-200 mx-auto">
                                                                            <Check size={12} /> รับแล้ว
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full text-xs font-bold border border-amber-100 mx-auto">
                                                                            <Clock size={12} /> รอของ                                                                       </span>
                                                                    )}
                                                                </td>
                                                                <td className="p-2 text-right font-mono text-slate-600">฿{(item.UnitCost || 0).toLocaleString()}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                                    <button
                                        onClick={() => setSelectedPO(null)}
                                        className="flex-1 bg-white border-2 border-slate-100 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-50 hover:border-slate-200 transition-all"
                                    >
                                        ปิด
                                    </button>
                                    {user?.role === 'Staff' && (
                                        <button
                                            onClick={() => { setActivePo(selectedPO); setSelectedPO(null); setIsModalOpen(true); }}
                                            className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold py-2 text-sm rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-md flex items-center justify-center gap-2"
                                        >
                                            <Check size={18} /> รับของ
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* INVOICE DETAIL MODAL */}
            <AnimatePresence>
                {selectedInvoice && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden"
                            >
                                {/* Header */}
                                <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 opacity-90">
                                                <FileText size={16} />
                                                <span className="text-xs font-bold uppercase tracking-wider">รายละเอียด Invoice</span>
                                            </div>
                                            <h3 className="font-black text-lg md:text-xl tracking-tight">{selectedInvoice.InvoiceNo}</h3>
                                            <div className="flex gap-3 mt-2 text-indigo-100 text-xs font-medium">
                                                <span className="bg-white/20 px-2 py-0.5 rounded">PO: {selectedInvoice.PO_ID}</span>
                                                <span className="bg-white/20 px-2 py-0.5 rounded flex items-center gap-1"><Calendar size={10} /> {formatThaiDate(selectedInvoice.ReceiveDate)}</span>
                                            </div>
                                            {(() => {
                                                const po = (purchaseOrders || []).find(p => p.PO_ID === selectedInvoice.PO_ID);
                                                const vendorName = po?.VendorName || selectedInvoice.VendorName;
                                                const contact = (vendors || []).find(v => v.VendorName === vendorName)?.ContactInfo;

                                                if (contact) {
                                                    return (
                                                        <div className="mt-2 text-xs bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/10 text-indigo-50">
                                                            <p className="font-bold mb-0.5 flex items-center gap-1"><Phone size={10} /> Contact Info:</p>
                                                            <p className="whitespace-pre-wrap">{contact}</p>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                        <button onClick={() => setSelectedInvoice(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="p-4 bg-slate-50/50">
                                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                        <Package className="text-violet-500" size={18} />
                                        รายการที่รับเข้า
                                    </h4>

                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 border-b border-slate-100">
                                                <tr>
                                                    <th className="text-left p-2.5 font-bold text-slate-500">รายการ</th>
                                                    <th className="text-center p-2.5 font-bold text-slate-500 w-24">จำนวน</th>
                                                    <th className="text-right p-2.5 font-bold text-slate-500 w-32">มูลค่ารวม</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {(transactions || [])
                                                    .filter(t => t.RefInfo && t.RefInfo.includes(`Invoice: ${selectedInvoice.InvoiceNo}`))
                                                    .map((item, idx) => {
                                                        const product = (products || []).find(p => p.ProductID === item.ProductID);
                                                        const totalVal = (item.Qty || 0) * (product?.LastPrice || 0);
                                                        return (
                                                            <tr key={idx} className="hover:bg-emerald-50/50 bg-emerald-50/10">
                                                                <td className="p-2">
                                                                    <div className="font-bold text-slate-700">{item.ProductName || product?.ProductName || 'Unknown Item'}</div>
                                                                    <div className="text-xs text-slate-400 font-mono">{item.ProductID}</div>
                                                                </td>
                                                                <td className="p-2 text-center">
                                                                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-mono font-bold text-xs border border-emerald-200">
                                                                        +{item.Qty}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2 text-right font-mono text-slate-600">
                                                                    ฿{totalVal.toLocaleString()}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                {(transactions || []).filter(t => t.RefInfo && t.RefInfo.includes(`Invoice: ${selectedInvoice.InvoiceNo}`)).length === 0 && (
                                                    <tr>
                                                        <td colSpan="3" className="p-8 text-center text-slate-400">
                                                            ไม่พบรายการสินค้า
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Footer Info */}
                                    <div className="mt-4 flex justify-between items-center text-xs text-slate-400">
                                        <div>
                                            <span className="font-bold">ผู้รับของ:</span> {selectedInvoice.ReceivedBy || '-'}
                                        </div>
                                        <div>
                                            <span className="font-bold">Vendor:</span> {(purchaseOrders || []).find(p => p.PO_ID === selectedInvoice.PO_ID)?.VendorName || '-'}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Actions */}
                                <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                                    <button
                                        onClick={() => setSelectedInvoice(null)}
                                        className="flex-1 bg-slate-100 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-200 transition-all border border-slate-200"
                                    >
                                        ปิดหน้าต่าง
                                    </button>
                                    {user?.role === 'Staff' && selectedInvoice.Status !== 'Cancelled' && (
                                        <button
                                            onClick={() => {
                                                setSelectedInvoice(null);
                                                setCancelConfirm({ isOpen: true, invoiceNo: selectedInvoice.InvoiceNo });
                                            }}
                                            className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold py-2 text-sm rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-md flex items-center justify-center gap-2"
                                        >
                                            <RotateCcw size={16} /> ยกเลิก Invoice
                                        </button>
                                    )}
                                    {selectedInvoice.Status === 'Cancelled' && (
                                        <div className="flex-1 bg-red-50 text-red-600 font-bold py-2.5 text-sm rounded-lg text-center border border-red-200">
                                            Invoice นี้ถูกยกเลิกแล้ว
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* RECEIVE MODAL */}
            <AnimatePresence>
                {isModalOpen && activePo && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden"
                            >
                                <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 opacity-90">
                                                <Package size={16} />
                                                <span className="text-xs font-bold uppercase tracking-wider">บันทึกรับของ</span>
                                            </div>
                                            <h3 className="font-black text-lg md:text-xl tracking-tight">{activePo.PO_ID}</h3>
                                            <p className="text-indigo-100 text-xs font-medium mt-1">{activePo.VendorName}</p>
                                        </div>
                                        <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>

                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    const fd = new FormData(e.target);
                                    const items = activePo.Items.map((item, idx) => ({
                                        DetailID: item.DetailID,
                                        ProductID: item.ProductID,
                                        Qty: parseInt(fd.get(`qty-${idx}`)) || 0
                                    })).filter(i => i.Qty > 0);
                                    handleReceive(activePo.PO_ID, fd.get('InvoiceNo'), items);
                                }} className="flex flex-col h-full">
                                    <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto bg-slate-50/50">
                                        <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                                            <label className="text-xs font-bold text-indigo-500 uppercase mb-2 block tracking-wider flex items-center gap-1">
                                                <FileText size={14} /> เลข Invoice
                                            </label>
                                            <input
                                                name="InvoiceNo"
                                                required
                                                placeholder="e.g. INV-2024-001"
                                                className="w-full bg-slate-50 border-2 border-indigo-50 p-2.5 rounded-lg outline-none focus:border-indigo-500 font-mono text-sm font-bold text-slate-700 placeholder-indigo-200 transition-colors"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase mb-4 block tracking-wider">เลือกรายการที่ต้องการรับ</label>
                                            <div className="space-y-3">
                                                {activePo.Items.map((item, idx) => {
                                                    const prodName = item.ItemName || products.find(p => p.ProductID === item.ProductID)?.ProductName || 'Unknown';
                                                    const remaining = item.QtyOrdered - (item.QtyReceived || 0);
                                                    const isFullyReceived = remaining <= 0;
                                                    return (
                                                        <div key={idx} className={`relative overflow-hidden flex gap-4 items-center p-2 rounded-xl border transition-all group ${isFullyReceived
                                                            ? 'bg-emerald-100 border-emerald-200'
                                                            : selectedItems[idx]
                                                                ? 'bg-white border-indigo-500 shadow-md ring-4 ring-indigo-50'
                                                                : 'bg-white border-slate-100 hover:border-indigo-200'
                                                            }`}>

                                                            {/* Checkbox */}
                                                            {!isFullyReceived && (
                                                                <div className="flex items-center">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={!!selectedItems[idx]}
                                                                        onChange={() => toggleSelection(idx)}
                                                                        className="w-6 h-6 rounded-lg border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer transition-colors"
                                                                    />
                                                                </div>
                                                            )}

                                                            <div className="flex-1 min-w-0">
                                                                <p className={`font-bold text-sm truncate ${isFullyReceived ? 'text-emerald-900' : 'text-slate-800'}`}>{prodName}</p>
                                                                <p className="text-xs text-slate-400 font-medium mt-0.5">
                                                                    สั่งซื้อ: {item.QtyOrdered} | รับแล้ว: {item.QtyReceived || 0}
                                                                </p>
                                                            </div>

                                                            {isFullyReceived ? (
                                                                <>
                                                                    <input type="hidden" name={`qty-${idx}`} value="0" />
                                                                    <span className="flex items-center gap-1.5 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold">
                                                                        <Check size={14} /> รับแล้ว
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <div className={`flex items-center gap-3 ${!selectedItems[idx] ? 'pointer-events-none opacity-40 blur-[1px]' : ''} transition-all`}>
                                                                    <div className="flex flex-col items-end">
                                                                        <span className="text-[10px] uppercase font-bold text-slate-400">Receive</span>
                                                                        <div className="flex items-center gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    if (!selectedItems[idx]) toggleSelection(idx);
                                                                                    const el = document.querySelector(`input[name="qty-${idx}"]`);
                                                                                    if (el) el.value = remaining;
                                                                                }}
                                                                                className="text-indigo-400 hover:text-indigo-600 p-1 rounded-lg hover:bg-indigo-50 transition-colors"
                                                                                title="Receive All"
                                                                            >
                                                                                <CircleArrowDown size={18} />
                                                                            </button>
                                                                            <input
                                                                                name={`qty-${idx}`}
                                                                                type="number"
                                                                                min="0"
                                                                                max={remaining}
                                                                                defaultValue={remaining}
                                                                                disabled={!selectedItems[idx]}
                                                                                className="w-20 bg-slate-50 border border-slate-200 p-2 rounded-lg text-center text-lg font-bold font-mono outline-none focus:border-indigo-500 focus:bg-white transition-all"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsModalOpen(false)}
                                            className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2 text-sm rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
                                        >
                                            <Check size={18} /> ยืนยันการรับของ
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* Result Modal */}
            <AlertModal
                isOpen={resultModal.isOpen}
                onConfirm={() => {
                    const onClose = resultModal.onClose || (() => setResultModal({ ...resultModal, isOpen: false }));
                    onClose();
                }}
                type={resultModal.type}
                title={resultModal.title}
                message={resultModal.message}
                confirmText="ตกลง"
            />

            {/* Cancel Invoice Confirmation */}
            <AlertModal
                isOpen={cancelConfirm.isOpen}
                type="danger"
                title="ยืนยันการยกเลิก Invoice"
                message={`ต้องการยกเลิก Invoice "${cancelConfirm.invoiceNo}" หรือไม่? ระบบจะหักสต็อกที่รับเข้าออก และปรับสถานะ PO กลับคืน`}
                confirmText="ยืนยันยกเลิก"
                cancelText="ไม่ยกเลิก"
                onConfirm={() => {
                    handleCancelInvoice(cancelConfirm.invoiceNo);
                    setCancelConfirm({ isOpen: false, invoiceNo: null });
                }}
                onCancel={() => setCancelConfirm({ isOpen: false, invoiceNo: null })}
            />


        </div>
    );
};

export default ReceivePage;
