import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, X, Eye, Search, Calendar, Filter, Check, Upload, FileText, RefreshCw, Trash2, Pencil, ChevronUp, ChevronDown, ArrowUpDown, Download, Lock, Truck, Clock, Package } from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useCan } from '../context/PermissionContext';
import AlertModal from '../components/AlertModal';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import POFormModal from '../components/POFormModal';
import PurchaseRequestForm from '../components/PurchaseRequestForm';
import PODetailModal from '../components/PODetailModal';

import { API_BASE } from '../config/api';

import { formatThaiDate } from '../utils/formatDate';

// ---------- helpers ----------
const OPEN_STATUSES = ['Open', 'Pending', 'Partial'];
const isOpenStatus = (s) => OPEN_STATUSES.includes(s);
const statusLabel = (s) => (s === 'Open' ? 'Pending' : s);
const STATUS_CHIP = {
    Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Partial: 'bg-amber-100 text-amber-700 border-amber-200',
    Cancelled: 'bg-red-100 text-red-700 border-red-200',
};
const statusChip = (s) => STATUS_CHIP[s] || 'bg-blue-100 text-blue-700 border-blue-200';
const BAR_COLOR = { Completed: 'bg-emerald-500', Partial: 'bg-amber-400', Cancelled: 'bg-red-400' };
const barColor = (s) => BAR_COLOR[s] || 'bg-indigo-500';
const money = (n) => `฿${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const poTotal = (po) => (po.Items || []).reduce((s, it) => s + Number(it.QtyOrdered || 0) * Number(it.UnitCost || 0), 0);
const poProgress = (po) => {
    const items = po.Items || [];
    const ordered = items.reduce((s, it) => s + Number(it.QtyOrdered || 0), 0);
    const received = items.reduce((s, it) => s + Number(it.QtyReceived || 0), 0);
    return { ordered, received, pct: ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0 };
};
const parseDate = (s) => {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
};
const daysUntil = (s) => {
    const d = parseDate(s);
    if (!d) return null;
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
};
// แจ้งเตือนกำหนดส่ง เฉพาะ PO ที่ยังค้างอยู่
const dueInfo = (po) => {
    if (!isOpenStatus(po.Status)) return null;
    const d = daysUntil(po.DueDate);
    if (d === null) return null;
    if (d < 0) return { tone: 'red', text: `เกิน ${-d} วัน` };
    if (d <= 3) return { tone: 'amber', text: d === 0 ? 'ถึงกำหนดวันนี้' : `อีก ${d} วัน` };
    return null;
};
const itemsSummary = (po) => {
    const items = po.Items || [];
    if (!items.length) return '-';
    const first = items[0].ItemName || items[0].ProductName || '-';
    return items.length > 1 ? `${first} +${items.length - 1}` : first;
};
const toIsoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const presetRange = (kind) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (kind === 'month') return { from: toIsoDate(new Date(y, m, 1)), to: toIsoDate(new Date(y, m + 1, 0)) };
    if (kind === '3m') return { from: toIsoDate(new Date(y, m - 2, 1)), to: toIsoDate(new Date(y, m + 1, 0)) };
    if (kind === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
    return { from: '', to: '' }; // all
};
const PRESETS = [
    { key: 'month', label: 'เดือนนี้' },
    { key: '3m', label: '3 เดือน' },
    { key: 'year', label: 'ปีนี้' },
    { key: 'all', label: 'ทั้งหมด' },
];
const sortValue = (po, key) => {
    switch (key) {
        case 'Progress': return poProgress(po).pct;
        case 'Total': return poTotal(po);
        case 'Status': return statusLabel(po.Status);
        default: return po[key] ?? '';
    }
};

const PurchaseOrdersPage = () => {
    const { purchaseOrders, products, deviceTypes, vendors, refreshData } = useData();
    const { user } = useAuth();
    const navigate = useNavigate();
    const canCreatePO = useCan('purchase-orders', 'create');
    const canEditPO = useCan('purchase-orders', 'edit');
    const canDeletePO = useCan('purchase-orders', 'delete');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);

    // Top Level Tabs
    const [activeTab, setActiveTab] = useState('po-list'); // 'po-list' or 'open-pr'
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
    const [selectedPO, setSelectedPO] = useState(null);
    const [modalInitialData, setModalInitialData] = useState(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const defaultRange = presetRange('3m');
    const [preset, setPreset] = useState('3m');
    const [dateFrom, setDateFrom] = useState(defaultRange.from);
    const [dateTo, setDateTo] = useState(defaultRange.to);
    const [filterStatus, setFilterStatus] = useState('all');

    // Pagination & sorting
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [sortConfig, setSortConfig] = useState({ key: 'RequestDate', direction: 'desc' });

    const [resultModal, setResultModal] = useState({ isOpen: false, type: 'success', title: '', message: '' });

    const handleSort = (key) => {
        setSortConfig(prev => (prev && prev.key === key
            ? { key, direction: prev.direction === 'desc' ? 'asc' : 'desc' }
            : { key, direction: 'desc' }));
    };

    const applyPreset = (key) => {
        const r = presetRange(key);
        setPreset(key);
        setDateFrom(r.from);
        setDateTo(r.to);
    };

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
                    const res = await fetch(`${API_BASE}/pos/${po.PO_ID}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (res.ok) {
                        setResultModal({ isOpen: true, type: 'success', title: 'ลบสำเร็จ', message: 'ลบใบสั่งซื้อเรียบร้อยแล้ว' });
                        refreshData();
                    } else {
                        setResultModal({ isOpen: true, type: 'error', title: 'ลบไม่สำเร็จ', message: data.error || data.message });
                    }
                } catch (err) {
                    setResultModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด', message: err.message });
                }
            }
        });
    };

    const handleModalSuccess = async (formData, file) => {
        try {
            const url = isEditMode ? `${API_BASE}/pos/${formData.PO_ID}` : `${API_BASE}/pos`;
            const method = isEditMode ? 'PUT' : 'POST';

            // มีไฟล์แนบ -> ส่งแบบ multipart (ข้อมูล PO อยู่ในฟิลด์ payload, ไฟล์ในฟิลด์ file)
            let body;
            let headers = {};
            if (file) {
                body = new FormData();
                body.append('payload', JSON.stringify(formData));
                body.append('file', file);
            } else {
                body = JSON.stringify(formData);
                headers = { 'Content-Type': 'application/json' };
            }

            const res = await fetch(url, { method, headers, body });
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
            setResultModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด', message: err.message });
        }
    };

    // ---------- filtering ----------
    const matchSearch = (po) => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return true;
        const hay = [
            po.PO_ID, po.VendorName, po.PR_No, po.BudgetNo, po.RequestedBy, po.DeliveryTo,
            ...(po.Items || []).flatMap(it => [it.ItemName, it.ProductName, it.BG_No])
        ].filter(Boolean).join(' ').toLowerCase();
        return q.split(/\s+/).every(t => hay.includes(t));
    };

    const matchDate = (po) => {
        const d = po.RequestDate ? String(po.RequestDate).slice(0, 10) : '';
        // ช่วง 3 เดือนค่าเริ่มต้น: ให้ PO ที่ยังค้างแสดงเสมอ แม้เก่ากว่าช่วง
        const keepOpen = preset === '3m' && isOpenStatus(po.Status);
        if (keepOpen || !d) return true;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
    };

    const matchStatus = (po) => {
        if (filterStatus === 'all') return true;
        if (filterStatus === 'Pending') return po.Status === 'Pending' || po.Status === 'Open';
        return po.Status === filterStatus;
    };

    // รายการที่ผ่านการค้นหาและช่วงวันที่ (ไม่รวมสถานะ) ใช้นับการ์ดสรุป
    const baseList = useMemo(
        () => purchaseOrders.filter(po => matchSearch(po) && matchDate(po)),
        [purchaseOrders, searchTerm, dateFrom, dateTo, preset]
    );

    const listFiltered = useMemo(() => baseList.filter(matchStatus), [baseList, filterStatus]);

    const sortedList = useMemo(() => {
        const arr = [...listFiltered];
        if (!sortConfig) return arr;
        const sign = sortConfig.direction === 'asc' ? 1 : -1;
        arr.sort((a, b) => {
            const av = sortValue(a, sortConfig.key);
            const bv = sortValue(b, sortConfig.key);
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign;
            return String(av).localeCompare(String(bv), 'th') * sign;
        });
        return arr;
    }, [listFiltered, sortConfig]);

    const sumAmt = (list) => list.reduce((s, p) => s + poTotal(p), 0);
    const stats = useMemo(() => {
        const open = baseList.filter(p => p.Status === 'Open' || p.Status === 'Pending');
        const partial = baseList.filter(p => p.Status === 'Partial');
        const completed = baseList.filter(p => p.Status === 'Completed');
        const cancelled = baseList.filter(p => p.Status === 'Cancelled');
        const overdue = baseList.filter(p => dueInfo(p)?.tone === 'red');
        return {
            all: { n: baseList.length, amt: sumAmt(baseList) },
            pending: { n: open.length, amt: sumAmt(open), overdue: overdue.length },
            partial: { n: partial.length, amt: sumAmt(partial) },
            completed: { n: completed.length, amt: sumAmt(completed) },
            cancelled: { n: cancelled.length, amt: sumAmt(cancelled) },
        };
    }, [baseList]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(sortedList.length / itemsPerPage));
    const currentTableData = sortedList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const handlePageChange = (page) => setCurrentPage(page);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, dateFrom, dateTo, filterStatus, itemsPerPage]);

    const hasActiveFilter = searchTerm || filterStatus !== 'all' || preset !== '3m';
    const clearFilters = () => {
        setSearchTerm('');
        setFilterStatus('all');
        applyPreset('3m');
    };

    // ---------- export ----------
    const exportExcel = () => {
        const rows = sortedList.map(po => {
            const pr = poProgress(po);
            return {
                'เลข PO': po.PO_ID,
                'วันที่บันทึก': formatThaiDate(po.RequestDate),
                'ผู้ขาย': po.VendorName || '',
                'รายการ': (po.Items || []).map(it => `${it.ItemName || it.ProductName} x${it.QtyOrdered}`).join('; '),
                'กำหนดส่ง': po.DueDate ? formatThaiDate(po.DueDate) : '',
                'ผู้บันทึก': po.RequestedBy || '',
                'แผนก': po.Section || '',
                'PR No.': po.PR_No || '',
                'Budget No.': po.BudgetNo || '',
                'สถานะ': statusLabel(po.Status),
                'รับแล้ว': pr.received,
                'สั่งทั้งหมด': pr.ordered,
                'ยอดรวม (฿)': poTotal(po),
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'PO');
        XLSX.writeFile(wb, `PO_${toIsoDate(new Date())}.xlsx`);
    };

    // ---------- small pieces ----------
    const SortTh = ({ k, children, className = '' }) => (
        <th
            className={`p-2 cursor-pointer select-none hover:bg-slate-100 transition-colors ${className}`}
            onClick={() => handleSort(k)}
        >
            <div className={`flex items-center gap-1 ${className.includes('text-center') ? 'justify-center' : className.includes('text-right') ? 'justify-end' : ''}`}>
                {children}
                {sortConfig?.key === k
                    ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                    : <ArrowUpDown size={12} className="opacity-30" />}
            </div>
        </th>
    );

    const StatCard = ({ active, onClick, label, value, sub, valueClass, gradient, icon: Icon }) => (
        <button
            type="button"
            onClick={onClick}
            className={`text-left p-4 md:p-5 rounded-2xl border shadow-sm transition-all hover:shadow-md ${gradient ? 'bg-gradient-to-br text-white border-transparent ' + gradient : 'bg-white border-slate-200'} ${active ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${gradient ? 'text-white/80' : 'text-slate-500'}`}>{label}</p>
                    <h3 className={`text-2xl font-black ${valueClass || ''}`}>{value}</h3>
                    {sub && <p className={`text-[11px] font-semibold mt-1 ${gradient ? 'text-white/80' : 'text-slate-400'}`}>{sub}</p>}
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${gradient ? 'bg-white/20' : 'bg-slate-100'}`}>
                    <Icon className={`w-5 h-5 ${gradient ? 'text-white' : 'text-slate-500'}`} />
                </div>
            </div>
        </button>
    );

    const ActionButtons = ({ po, compact = false }) => {
        const open = isOpenStatus(po.Status);
        const { ordered, received } = poProgress(po);
        const canReceive = open && received < ordered;
        const statusEditable = (po.Status === 'Open' || po.Status === 'Pending');
        const size = compact ? 14 : 16;
        const btn = compact ? 'p-1.5' : 'p-1.5';
        return (
            <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => setSelectedPO(po)} className={`${btn} text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all`} title="ดูรายละเอียด">
                    <Eye size={size} />
                </button>
                {canReceive && (
                    <button onClick={() => navigate('/receive')} className={`${btn} text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all`} title="ไปหน้ารับของ">
                        <Truck size={size} />
                    </button>
                )}
                {statusEditable && (canEditPO || canDeletePO) && (
                    <>
                        {canEditPO && <button onClick={() => handleEditPO(po)} className={`${btn} text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all`} title="แก้ไข">
                            <Pencil size={size} />
                        </button>}
                        {canDeletePO && <button onClick={() => handleDeletePO(po)} className={`${btn} text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all`} title="ลบ">
                            <Trash2 size={size} />
                        </button>}
                    </>
                )}
                {(canEditPO || canDeletePO) && !statusEditable && (
                    <span className={`${btn} text-slate-300`} title="แก้ไข/ลบไม่ได้ เพราะใบนี้ดำเนินการไปแล้ว">
                        <Lock size={size} />
                    </span>
                )}
            </div>
        );
    };

    const DueBadge = ({ po }) => {
        const info = dueInfo(po);
        if (!info) return null;
        const cls = info.tone === 'red' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200';
        return (
            <span className={`inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>
                <Clock size={10} /> {info.text}
            </span>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                        <ShoppingCart className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">ใบสั่งซื้อ (PO)</h2>
                        <p className="text-xs text-slate-400">ติดตามการสั่งซื้อและการรับของ</p>
                    </div>
                </div>

                <div className="flex bg-slate-100 p-1.5 rounded-xl shadow-inner border border-slate-200">
                    <button
                        onClick={() => setActiveTab('po-list')}
                        className={`px-5 py-2 rounded-lg font-bold text-sm transition-all duration-300 ${activeTab === 'po-list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        รายการ PO
                    </button>
                    <button
                        onClick={() => setActiveTab('open-pr')}
                        className={`px-5 py-2 rounded-lg font-bold text-sm transition-all duration-300 ${activeTab === 'open-pr' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        เปิดใบ PR (A5)
                    </button>
                </div>
            </div>

            {activeTab === 'open-pr' ? (
                <div>
                    <PurchaseRequestForm />
                </div>
            ) : (
                <div className="space-y-5">
                    <div className="flex justify-end">
                        {canCreatePO && (
                            <button
                                onClick={handleOpenCreateModal}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl transition-all shadow-lg shadow-indigo-200"
                            >
                                <Plus size={18} /> สร้าง PO ใหม่
                            </button>
                        )}
                    </div>

                    {/* Summary cards (นับตามการค้นหาและช่วงวันที่) */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
                        <StatCard
                            active={filterStatus === 'all'}
                            onClick={() => setFilterStatus('all')}
                            label="ทั้งหมด"
                            value={stats.all.n}
                            sub={money(stats.all.amt)}
                            gradient="from-indigo-500 to-indigo-600"
                            icon={FileText}
                        />
                        <StatCard
                            active={filterStatus === 'Pending'}
                            onClick={() => setFilterStatus('Pending')}
                            label="รอดำเนินการ"
                            value={stats.pending.n}
                            valueClass="text-blue-500"
                            sub={stats.pending.overdue > 0 ? `เกินกำหนด ${stats.pending.overdue} ใบ` : `${money(stats.pending.amt)}`}
                            icon={RefreshCw}
                        />
                        <StatCard
                            active={filterStatus === 'Partial'}
                            onClick={() => setFilterStatus('Partial')}
                            label="รับบางส่วน"
                            value={stats.partial.n}
                            valueClass="text-amber-500"
                            sub={money(stats.partial.amt)}
                            icon={Upload}
                        />
                        <StatCard
                            active={filterStatus === 'Completed'}
                            onClick={() => setFilterStatus('Completed')}
                            label="เสร็จสิ้น"
                            value={stats.completed.n}
                            valueClass="text-emerald-500"
                            sub={money(stats.completed.amt)}
                            icon={Check}
                        />
                        <StatCard
                            active={filterStatus === 'Cancelled'}
                            onClick={() => setFilterStatus('Cancelled')}
                            label="ยกเลิก"
                            value={stats.cancelled.n}
                            valueClass="text-red-500"
                            sub={money(stats.cancelled.amt)}
                            icon={X}
                        />
                    </div>

                    {/* Filter bar */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 md:p-4 space-y-3">
                        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                            <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
                                <Search size={16} className="text-slate-400 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="ค้นหา PO, ผู้ขาย, อุปกรณ์, B/G, PR, ผู้บันทึก..."
                                    className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-700 placeholder-slate-400"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button type="button" onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    {PRESETS.map(p => (
                                        <button
                                            key={p.key}
                                            type="button"
                                            onClick={() => applyPreset(p.key)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${preset === p.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                                    <Calendar size={16} className="text-slate-400 shrink-0" />
                                    <input type="date" className="bg-transparent text-sm text-slate-700 outline-none" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset('custom'); }} />
                                    <span className="text-slate-400">-</span>
                                    <input type="date" className="bg-transparent text-sm text-slate-700 outline-none" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset('custom'); }} />
                                </div>
                                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                                    <Filter size={16} className="text-slate-400" />
                                    <select className="bg-transparent outline-none text-sm text-slate-700" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                                        <option value="all">ทุกสถานะ</option>
                                        <option value="Pending">Pending</option>
                                        <option value="Partial">Partial</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 lg:ml-auto">
                                {hasActiveFilter && (
                                    <button onClick={clearFilters} className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold px-2">
                                        ล้างตัวกรอง
                                    </button>
                                )}
                                <button
                                    onClick={exportExcel}
                                    disabled={sortedList.length === 0}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Download size={15} /> Excel
                                </button>
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        title="มุมมองรายการ"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                                    </button>
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        title="มุมมองการ์ด"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>
                                แสดง <b className="text-slate-700">{sortedList.length}</b> ใบ
                                {stats.pending.overdue > 0 && <span className="text-red-600 font-bold"> · เกินกำหนด {stats.pending.overdue} ใบ</span>}
                            </span>
                            <label className="flex items-center gap-2">
                                ต่อหน้า
                                <select className="bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none" value={itemsPerPage} onChange={e => setItemsPerPage(Number(e.target.value))}>
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                </select>
                            </label>
                        </div>
                    </div>

                    {/* Content */}
                    {viewMode === 'list' ? (
                        <motion.div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                            <div className="overflow-x-auto max-h-[62vh] custom-scrollbar relative">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] tracking-wider border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <SortTh k="PO_ID" className="pl-4 min-w-[120px]">เลข PO</SortTh>
                                            <SortTh k="RequestDate" className="hidden sm:table-cell min-w-[100px]">วันที่บันทึก</SortTh>
                                            <SortTh k="VendorName" className="min-w-[160px]">ผู้ขาย</SortTh>
                                            <th className="p-2 hidden md:table-cell min-w-[180px]">รายการ</th>
                                            <SortTh k="DueDate" className="min-w-[110px]">กำหนดส่ง</SortTh>
                                            <SortTh k="Progress" className="hidden md:table-cell min-w-[130px]">รับแล้ว / สั่ง</SortTh>
                                            <SortTh k="RequestedBy" className="hidden xl:table-cell min-w-[110px]">ผู้บันทึก</SortTh>
                                            <SortTh k="Total" className="hidden xl:table-cell text-right min-w-[110px]">ยอดรวม</SortTh>
                                            <SortTh k="Status" className="text-center min-w-[100px]">สถานะ</SortTh>
                                            <th className="p-2 pr-4 text-right min-w-[120px]">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {currentTableData.map((po) => {
                                            const pr = poProgress(po);
                                            const full = pr.ordered > 0 && pr.received >= pr.ordered;
                                            return (
                                                <tr key={po.PO_ID} className="hover:bg-indigo-50/40 transition-colors cursor-pointer" onClick={() => setSelectedPO(po)}>
                                                    <td className="p-2 pl-4 font-bold text-slate-800 font-mono text-xs">{po.PO_ID}</td>
                                                    <td className="p-2 hidden sm:table-cell text-slate-600 text-xs">{formatThaiDate(po.RequestDate)}</td>
                                                    <td className="p-2">
                                                        <div className="font-medium text-slate-800 break-words leading-tight">{po.VendorName || '-'}</div>
                                                        <div className="text-[11px] text-slate-400 md:hidden">{itemsSummary(po)}</div>
                                                    </td>
                                                    <td className="p-2 hidden md:table-cell">
                                                        <div className="text-slate-700 text-xs truncate max-w-[200px]" title={(po.Items || []).map(i => i.ItemName || i.ProductName).join(', ')}>{itemsSummary(po)}</div>
                                                        {po.BudgetNo && <div className="text-[10px] text-slate-400 font-mono">BG {po.BudgetNo}</div>}
                                                    </td>
                                                    <td className="p-2">
                                                        <div className="text-xs text-slate-700">{po.DueDate ? formatThaiDate(po.DueDate) : '-'}</div>
                                                        <DueBadge po={po} />
                                                    </td>
                                                    <td className="p-2 hidden md:table-cell">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs whitespace-nowrap">
                                                                <b className={full ? 'text-emerald-600' : 'text-slate-700'}>{pr.received}</b>
                                                                <span className="text-slate-400"> / {pr.ordered}</span>
                                                            </span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                                                            <div className={`h-full ${full ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pr.pct}%` }} />
                                                        </div>
                                                    </td>
                                                    <td className="p-2 hidden xl:table-cell">
                                                        <div className="text-slate-700 text-xs">{po.RequestedBy || '-'}</div>
                                                        <div className="text-[10px] text-slate-400">{po.Section || ''}</div>
                                                    </td>
                                                    <td className="p-2 hidden xl:table-cell text-right font-mono text-xs text-slate-700">{money(poTotal(po))}</td>
                                                    <td className="p-2 text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusChip(po.Status)}`}>
                                                            {statusLabel(po.Status)}
                                                        </span>
                                                    </td>
                                                    <td className="p-2 pr-4">
                                                        <ActionButtons po={po} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {sortedList.length === 0 && (
                                            <tr>
                                                <td colSpan={10} className="p-10 text-center text-slate-500">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <ShoppingCart size={44} className="text-slate-200 mb-3" />
                                                        <p className="font-medium">ไม่พบใบสั่งซื้อ</p>
                                                        {hasActiveFilter && <button onClick={clearFilters} className="mt-2 text-indigo-600 text-sm font-semibold">ล้างตัวกรอง</button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {currentTableData.map((po) => {
                                const pr = poProgress(po);
                                const full = pr.ordered > 0 && pr.received >= pr.ordered;
                                return (
                                    <div
                                        key={po.PO_ID}
                                        className="group bg-white border border-slate-200 p-4 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all relative overflow-hidden cursor-pointer flex flex-col"
                                        onClick={() => setSelectedPO(po)}
                                    >
                                        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${po.Status === 'Partial' ? 'from-amber-400 to-orange-500' : po.Status === 'Completed' ? 'from-emerald-400 to-green-500' : po.Status === 'Cancelled' ? 'from-red-400 to-pink-500' : 'from-blue-400 to-indigo-500'}`} />

                                        <div className="flex justify-between items-start gap-2 mt-1">
                                            <div className="min-w-0">
                                                <p className="font-mono font-black text-slate-800 text-sm">{po.PO_ID}</p>
                                                <p className="text-xs text-slate-600 font-medium break-words">{po.VendorName || 'ไม่ระบุผู้ขาย'}</p>
                                            </div>
                                            <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusChip(po.Status)}`}>
                                                {statusLabel(po.Status)}
                                            </span>
                                        </div>

                                        <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                                            <Package size={13} className="text-slate-400 shrink-0" />
                                            <span className="truncate">{itemsSummary(po)}</span>
                                        </div>

                                        <div className="mt-3">
                                            <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                                                <span>รับแล้ว <b className={full ? 'text-emerald-600' : 'text-slate-700'}>{pr.received}</b> / {pr.ordered}</span>
                                                <span>{pr.pct}%</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className={`h-full ${barColor(po.Status)}`} style={{ width: `${pr.pct}%` }} />
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                                            <span className="bg-slate-50 text-slate-600 px-2 py-0.5 rounded-lg border border-slate-100 flex items-center gap-1">
                                                <Calendar size={11} /> {formatThaiDate(po.RequestDate)}
                                            </span>
                                            {po.DueDate && (
                                                <span className="bg-slate-50 text-slate-600 px-2 py-0.5 rounded-lg border border-slate-100">
                                                    ส่ง {formatThaiDate(po.DueDate)}
                                                </span>
                                            )}
                                            <DueBadge po={po} />
                                        </div>

                                        <div className="mt-auto pt-3 flex items-center justify-between gap-2 border-t border-slate-100 mt-4">
                                            <div>
                                                <p className="text-[10px] text-slate-400 uppercase font-bold">ยอดรวม</p>
                                                <p className="font-black text-slate-800 text-sm">{money(poTotal(po))}</p>
                                            </div>
                                            <ActionButtons po={po} compact />
                                        </div>
                                    </div>
                                );
                            })}
                            {sortedList.length === 0 && (
                                <div className="col-span-full">
                                    <EmptyState
                                        title="ไม่พบ PO"
                                        message="ลองเปลี่ยนตัวกรอง หรือสร้าง PO ใหม่"
                                        icon={ShoppingCart}
                                        actionLabel={hasActiveFilter ? 'ล้างตัวกรอง' : 'สร้าง PO ใหม่'}
                                        onAction={() => (hasActiveFilter ? clearFilters() : handleOpenCreateModal())}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pagination */}
                    {sortedList.length > 0 && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={handlePageChange}
                            itemsPerPage={itemsPerPage}
                            totalItems={sortedList.length}
                        />
                    )}

                    <PODetailModal po={selectedPO} vendors={vendors} onClose={() => setSelectedPO(null)} />

                    {/* CREATE / EDIT PO MODAL */}
                    <POFormModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        initialData={modalInitialData}
                        isEditMode={isEditMode}
                        products={products}
                        deviceTypes={deviceTypes}
                        purchaseOrders={purchaseOrders}
                        vendors={vendors}
                        user={user}
                        onSuccess={handleModalSuccess}
                    />

                    {/* ALERT MODAL */}
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
                </div>
            )}
        </div>
    );
};

export default PurchaseOrdersPage;
