import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FileText, Search, Calendar, Eye, X, Package, Check, ShoppingCart, Clock, RotateCcw, ChevronUp, ChevronDown, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import StatCard from '../components/StatCard';

import { formatThaiDate } from '../utils/formatDate';
import AlertModal from '../components/AlertModal';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import Pagination from '../components/Pagination';
import ReceiveFormModal from '../components/receive/ReceiveFormModal';
import InvoiceDetailModal from '../components/receive/InvoiceDetailModal';
import ReceivePODetailModal from '../components/receive/ReceivePODetailModal';
import {
    toDateKey, todayKey, money, getOverdue, poProgress, getStatusColor, statusText, isOpenStatus,
} from '../components/receive/receiveUtils';

import { API_BASE } from '../config/api';

const ITEMS_PER_PAGE = 10;

const ReceivePage = () => {
    const { purchaseOrders, invoices, products, vendors, transactions, refreshData, loading } = useData();
    const { user } = useAuth();
    const isStaff = user?.role === 'Staff';

    // ---------- Filter state ----------
    const defaultRange = useMemo(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const start = new Date(y, m - 2, 1); // ย้อนหลัง 3 เดือน
        const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        const endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        return { startDate, endDate };
    }, []);
    const [searchTerm, setSearchTerm] = useState('');
    const searchRef = useRef(null);
    const [dateFrom, setDateFrom] = useState(defaultRange.startDate);
    const [dateTo, setDateTo] = useState(defaultRange.endDate);
    const [statusFilter, setStatusFilter] = useState('all'); // all | Open | Partial | overdue
    const [includeAllOpen, setIncludeAllOpen] = useState(true); // แสดง PO ค้างรับทุกช่วงวันที่

    // ---------- Modal state ----------
    const [receiveTarget, setReceiveTarget] = useState(null); // PO ที่กำลังบันทึกรับของ (null = ปิด)
    const [selectedPO, setSelectedPO] = useState(null);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [resultModal, setResultModal] = useState({ isOpen: false, type: 'success', title: '', message: '' });
    const [cancelConfirm, setCancelConfirm] = useState({ isOpen: false, invoiceNo: null });
    const [discardConfirm, setDiscardConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ---------- Table state ----------
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState({ key: 'ReceiveDate', direction: 'desc' });

    const handleSort = (key) => {
        setSortConfig(prev => (prev && prev.key === key)
            ? { key, direction: prev.direction === 'desc' ? 'asc' : 'desc' }
            : { key, direction: 'desc' });
        setCurrentPage(1);
    };

    // ---------- Derived data ----------
    const pendingPOs = useMemo(
        () => (Array.isArray(purchaseOrders) ? purchaseOrders : []).filter(po => po && po.Status !== 'Completed'),
        [purchaseOrders]
    );

    const counts = useMemo(() => {
        const t = todayKey();
        let open = 0, partial = 0, overdue = 0;
        pendingPOs.forEach(po => {
            if (po.Status === 'Partial') partial++; else open++;
            if (getOverdue(po, t)) overdue++;
        });
        return { all: pendingPOs.length, open, partial, overdue };
    }, [pendingPOs]);

    const stats = useMemo(() => {
        const t = todayKey();
        const receivedToday = (invoices || []).filter(inv =>
            inv && inv.Status !== 'Cancelled' && toDateKey(inv.ReceiveDate) === t
        ).length;
        return { totalPOs: (purchaseOrders || []).length, receivedToday };
    }, [purchaseOrders, invoices]);

    // จับคู่ transaction กับ invoice ด้วยเลขเต็ม (ป้องกัน INV-1 ไปจับ INV-10)
    const txByInvoice = useMemo(() => {
        const m = new Map();
        (transactions || []).forEach(t => {
            const r = /^Invoice: (.+?) \(PO: .*\)$/.exec(t?.RefInfo || '');
            if (!r) return;
            if (!m.has(r[1])) m.set(r[1], []);
            m.get(r[1]).push(t);
        });
        return m;
    }, [transactions]);

    const poById = useMemo(() => {
        const m = new Map();
        (purchaseOrders || []).forEach(po => po && m.set(po.PO_ID, po));
        return m;
    }, [purchaseOrders]);

    const filteredPOs = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const t = todayKey();
        return pendingPOs.filter(po => {
            if (statusFilter === 'Open' && !isOpenStatus(po.Status)) return false;
            if (statusFilter === 'Partial' && po.Status !== 'Partial') return false;
            if (statusFilter === 'overdue' && !getOverdue(po, t)) return false;

            if (q) {
                const itemNames = (Array.isArray(po.Items) ? po.Items : []).map(it => it.ItemName);
                const hay = [po.PO_ID, po.VendorName, po.BudgetNo, po.PR_No, po.DeliveryTo, ...itemNames]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }

            // PO ที่ยังค้างรับจะแสดงเสมอถ้าเปิด "รวม PO ค้างทั้งหมด"
            if (includeAllOpen) return true;
            if (!po.RequestDate) return true;
            const d = toDateKey(po.RequestDate);
            if (dateFrom && d < dateFrom) return false;
            if (dateTo && d > dateTo) return false;
            return true;
        });
    }, [pendingPOs, searchTerm, statusFilter, includeAllOpen, dateFrom, dateTo]);

    const filteredInvoices = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return (invoices || []).filter(inv => {
            if (!inv) return false;
            if (q) {
                const hay = [inv.InvoiceNo, inv.PO_ID, inv.BudgetNo, inv.VendorName, inv.ReceivedBy]
                    .filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (inv.ReceiveDate) {
                const d = toDateKey(inv.ReceiveDate);
                if (dateFrom && d < dateFrom) return false;
                if (dateTo && d > dateTo) return false;
            }
            return true;
        });
    }, [invoices, searchTerm, dateFrom, dateTo]);

    const sortedInvoices = useMemo(() => {
        const arr = [...filteredInvoices];
        const mul = sortConfig?.direction === 'asc' ? 1 : -1;
        const key = sortConfig?.key;
        if (!key) return arr;
        arr.sort((a, b) => {
            let av = a[key] ?? '';
            let bv = b[key] ?? '';
            if (key === 'ReceiveDate') {
                av = new Date(av).getTime() || 0;
                bv = new Date(bv).getTime() || 0;
                return (av - bv) * mul;
            }
            return String(av).localeCompare(String(bv), 'th') * mul;
        });
        return arr;
    }, [filteredInvoices, sortConfig]);

    const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / ITEMS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const currentInvoices = sortedInvoices.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, dateFrom, dateTo, statusFilter, includeAllOpen]);

    // กด "/" เพื่อไปช่องค้นหา (ข้ามเมื่อกำลังพิมพ์อยู่ หรือมี modal เปิดอยู่)
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
            if (document.querySelector('[role="dialog"]')) return;
            e.preventDefault();
            searchRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const hasActiveFilter = searchTerm || statusFilter !== 'all' || dateFrom !== defaultRange.startDate || dateTo !== defaultRange.endDate;
    const resetFilters = () => {
        setSearchTerm('');
        setStatusFilter('all');
        setDateFrom(defaultRange.startDate);
        setDateTo(defaultRange.endDate);
    };

    // ---------- Invoice detail derived ----------
    const invDetail = useMemo(() => {
        if (!selectedInvoice) return null;
        const txs = txByInvoice.get(selectedInvoice.InvoiceNo) || [];
        const po = poById.get(selectedInvoice.PO_ID);
        // ราคาจริงของรายการคือราคาต่อหน่วยใน PO ณ ตอนสั่งซื้อ (ไม่ใช้ LastPrice ของสินค้า)
        const rows = txs.map(t => {
            const poItem = po?.Items?.find(it => it.ProductID === t.ProductID);
            const unit = poItem ? Number(poItem.UnitCost || 0) : null;
            const product = (products || []).find(p => p.ProductID === t.ProductID);
            return {
                t,
                name: t.ProductName || product?.ProductName || 'Unknown Item',
                qty: Number(t.Qty || 0),
                value: unit === null ? null : Number(t.Qty || 0) * unit,
            };
        });
        return {
            rows,
            totalQty: rows.reduce((s, r) => s + r.qty, 0),
            totalValue: rows.reduce((s, r) => s + (r.value || 0), 0),
            vendor: po?.VendorName || selectedInvoice.VendorName,
            contact: (vendors || []).find(v => v.VendorName === (po?.VendorName || selectedInvoice.VendorName))?.ContactInfo,
        };
    }, [selectedInvoice, txByInvoice, poById, products, vendors]);

    // ---------- Actions ----------
    const handleReceive = async (poId, invNo, itemsReceived) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`${API_BASE}/receive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    PO_ID: poId,
                    InvoiceNo: invNo,
                    ItemsReceived: itemsReceived,
                    UserID: (user?.username || '').toUpperCase(),
                }),
            });
            // อ่าน body แบบปลอดภัย (ถ้าไม่ใช่ JSON จะไม่ทำให้เข้าใจผิดว่าเชื่อมต่อไม่ได้)
            let data = null;
            try { data = await res.json(); } catch { data = null; }

            if (res.ok) {
                setReceiveTarget(null);
                refreshData();
                setResultModal({ isOpen: true, type: 'success', title: 'รับของสำเร็จ (Receive Success)', message: `บันทึก Invoice ${invNo} เรียบร้อยแล้ว (Invoice recorded)` });
            } else {
                setResultModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Error)', message: data?.details || data?.error || 'ไม่สามารถบันทึกได้ (Operation failed)' });
            }
        } catch (err) {
            setResultModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด (Connection Error)', message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ (Cannot connect to server)' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancelInvoice = async (invNo) => {
        try {
            const res = await fetch(`${API_BASE}/invoice/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    InvoiceNo: invNo,
                    UserID: (user?.username || 'system').toUpperCase(),
                }),
            });
            let data = null;
            try { data = await res.json(); } catch { data = null; }
            if (res.ok) {
                refreshData();
                setSelectedInvoice(null);
                setResultModal({ isOpen: true, type: 'success', title: 'ยกเลิกสำเร็จ', message: `Invoice ${invNo} ถูกยกเลิกเรียบร้อยแล้ว สต็อกและ PO ถูกปรับกลับคืน` });
            } else {
                setResultModal({ isOpen: true, type: 'error', title: 'ยกเลิกไม่สำเร็จ', message: data?.details || 'ไม่สามารถยกเลิก Invoice ได้' });
            }
        } catch (err) {
            setResultModal({ isOpen: true, type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
        }
    };

    // ฟอร์มรับของ: ถ้ามีข้อมูลค้างอยู่ให้ถามก่อนทิ้ง
    const handleReceiveRequestClose = (dirty) => {
        if (dirty) setDiscardConfirm(true);
        else setReceiveTarget(null);
    };

    const openReceive = (po) => {
        setSelectedPO(null);
        setReceiveTarget(po);
    };

    const anyAlertOpen = discardConfirm || cancelConfirm.isOpen || resultModal.isOpen;

    const requestCancelInvoice = (invNo) => {
        setSelectedInvoice(null);
        setCancelConfirm({ isOpen: true, invoiceNo: invNo });
    };

    const chip = (key, label, count, tone) => {
        const active = statusFilter === key;
        return (
            <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${active
                    ? `${tone} shadow-sm`
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            >
                {label}
                <span className={`px-1.5 rounded-full text-[10px] ${active ? 'bg-white/30' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
            </button>
        );
    };

    if (loading && purchaseOrders.length === 0 && invoices.length === 0) {
        return <LoadingState message="กำลังโหลดข้อมูลการรับเข้า... (Loading entries...)" />;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard icon={ShoppingCart} title="ใบสั่งซื้อทั้งหมด " value={stats.totalPOs} subValue="รายการ" color="from-blue-500 to-blue-600" />
                <StatCard
                    icon={Clock}
                    title="รอรับของ"
                    value={counts.all}
                    subValue={`บางส่วน ${counts.partial} · เลย ${counts.overdue}`}
                    color="from-amber-500 to-amber-600"
                    isAlert={counts.overdue > 0 || counts.all > 0}
                />
                <StatCard icon={Check} title="รับของวันนี้" value={stats.receivedToday} subValue="รายการ" color="from-emerald-500 to-emerald-600" />
            </div>

            {/* Header Controls */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col 2xl:flex-row justify-between items-start 2xl:items-center gap-4 w-full"
            >
                <div>
                    <h2 className="text-3xl font-black mb-2 text-slate-800">RECEIVE GOODS</h2>
                    <p className="text-slate-500 font-medium">บันทึกรับอุปกรณ์เข้าสต็อก</p>
                </div>

                <div className="flex flex-wrap gap-3 items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-full 2xl:w-auto">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 focus-within:ring-2 focus-within:ring-indigo-100 transition-all flex-1 min-w-[220px] 2xl:flex-none">
                        <Search size={18} className="text-slate-400 shrink-0" />
                        <input
                            ref={searchRef}
                            type="search"
                            placeholder="ค้นหา PO / ผู้ขาย / งบ / PR... (กด /)"
                            aria-label="ค้นหาใบสั่งซื้อและ Invoice"
                            className="bg-transparent border-none outline-none text-sm w-full 2xl:w-56 text-slate-700 placeholder-slate-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="hidden 2xl:block h-8 w-px bg-slate-200 mx-1"></div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">วันที่:</span>
                        <input
                            type="date"
                            aria-label="วันที่เริ่มต้น"
                            className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-indigo-500"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                        <span className="text-slate-300">-</span>
                        <input
                            type="date"
                            aria-label="วันที่สิ้นสุด"
                            className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-indigo-500"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 cursor-pointer select-none px-2" title="ถ้าเปิด จะแสดง PO ที่ยังค้างรับทุกช่วงวันที่">
                        <input
                            type="checkbox"
                            checked={includeAllOpen}
                            onChange={(e) => setIncludeAllOpen(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        รวม PO ค้างทั้งหมด
                    </label>
                    {hasActiveFilter && (
                        <button
                            onClick={resetFilters}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="ล้างตัวกรอง (Clear Filters)"
                            aria-label="ล้างตัวกรอง"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </motion.div>

            {/* PO Cards */}
            <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Package className="text-indigo-600" size={20} />
                        รายการที่ต้องรับ
                        <span className="text-sm font-medium text-slate-400">({filteredPOs.length})</span>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {chip('all', 'ทั้งหมด', counts.all, 'bg-indigo-600 text-white border-indigo-600')}
                        {chip('Open', 'รอรับ', counts.open, 'bg-blue-600 text-white border-blue-600')}
                        {chip('Partial', 'รับบางส่วน', counts.partial, 'bg-amber-500 text-white border-amber-500')}
                        {chip('overdue', 'เลยกำหนด', counts.overdue, 'bg-red-600 text-white border-red-600')}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {filteredPOs.map((po, i) => {
                        const prog = poProgress(po);
                        const overdueDays = getOverdue(po, todayKey());
                        const partial = po.Status === 'Partial';
                        return (
                            <motion.div
                                key={po.PO_ID}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(i, 12) * 0.03 }}
                                className={`group bg-white border p-4 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col ${overdueDays > 0 ? 'border-red-200' : 'border-slate-200'}`}
                            >
                                <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${partial ? 'from-amber-400 to-orange-500' : 'from-blue-400 to-indigo-500'} opacity-10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`}></div>

                                <div className="relative z-10 flex flex-col flex-1">
                                    <div className="flex justify-between items-start mb-3 gap-2">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-white shadow-md bg-gradient-to-br ${partial ? 'from-amber-400 to-orange-500' : 'from-blue-500 to-indigo-600'}`}>
                                                <Package size={20} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-black text-slate-800 text-sm truncate">{po.PO_ID}</h4>
                                                <p className="text-[10px] text-slate-500 font-medium truncate">{po.VendorName || 'ไม่ระบุผู้ขาย (Unknown Vendor)'}</p>
                                            </div>
                                        </div>
                                        <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm ${getStatusColor(po.Status)}`}>
                                            {statusText(po.Status)}
                                        </span>
                                    </div>

                                    {overdueDays > 0 && (
                                        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                                            <AlertTriangle size={12} /> เลยกำหนดส่ง {overdueDays} วัน
                                        </div>
                                    )}

                                    <div className="mb-3">
                                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                            <span>รับแล้ว {prog.received}/{prog.ordered}</span>
                                            <span>{prog.itemCount} รายการ</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={prog.pct} aria-valuemin={0} aria-valuemax={100}>
                                            <div
                                                className={`h-full rounded-full transition-all ${prog.pct >= 100 ? 'bg-emerald-500' : partial ? 'bg-amber-500' : 'bg-indigo-500'}`}
                                                style={{ width: `${prog.pct}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-1.5 mb-4">
                                        {po.BudgetNo && (
                                            <span className="text-[10px] bg-slate-50 text-slate-500 px-2 py-1 rounded-lg border border-slate-100 font-mono">
                                                BudgetNo.: {po.BudgetNo}
                                            </span>
                                        )}
                                        {po.DeliveryTo && (
                                            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg border border-indigo-100 font-medium truncate max-w-full">
                                                👤 {po.DeliveryTo}
                                            </span>
                                        )}
                                        <span className="text-[10px] bg-slate-50 text-slate-500 px-2 py-1 rounded-lg border border-slate-100 flex items-center gap-1">
                                            <Calendar size={10} /> {formatThaiDate(po.RequestDate)}
                                        </span>
                                        {po.DueDate && (
                                            <span className={`text-[10px] px-2 py-1 rounded-lg border flex items-center gap-1 font-medium ${overdueDays > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                ⏰ กำหนดส่ง: {formatThaiDate(po.DueDate)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-auto">
                                        <div className="flex justify-between items-center text-[11px] text-slate-500 mb-2">
                                            <span>มูลค่าสั่งซื้อ</span>
                                            <span className="font-mono font-bold text-slate-700">{money(prog.value)}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setSelectedPO(po)}
                                                className="bg-slate-50 text-slate-600 font-bold py-2 rounded-xl text-xs hover:bg-white hover:shadow-md hover:text-indigo-600 border border-slate-100 transition-all flex items-center justify-center gap-1"
                                            >
                                                <Eye size={14} /> รายละเอียด
                                            </button>
                                            {isStaff && (
                                                <button
                                                    onClick={() => openReceive(po)}
                                                    className="bg-emerald-600 text-white font-bold py-2 rounded-xl text-xs hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-200 transition-all flex items-center justify-center gap-1"
                                                >
                                                    <Check size={14} /> รับของ
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                    {filteredPOs.length === 0 && (
                        <div className="col-span-full">
                            <EmptyState
                                title={statusFilter === 'overdue' ? 'ไม่มีรายการเลยกำหนด' : 'ไม่พบรายการค้างรับ'}
                                message={hasActiveFilter ? 'ลองปรับหรือล้างตัวกรอง (No matching POs)' : 'ไม่มีใบสั่งซื้อที่รอรับของในขณะนี้ (All items received)'}
                                icon={Check}
                                actionLabel={hasActiveFilter ? 'ล้างตัวกรอง (Clear Filters)' : null}
                                onAction={resetFilters}
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
                            <span className="text-sm font-medium text-slate-400">({sortedInvoices.length})</span>
                        </h2>
                        <p className="text-sm text-slate-500 pl-8">รายการ INVOICE ที่บันทึกรับของแล้ว</p>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
                    <table className="w-full min-w-[860px] text-left text-sm table-auto">
                        <thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-xs text-slate-500 uppercase border-b border-slate-200">
                            <tr>
                                {[
                                    { key: 'InvoiceNo', label: 'เลข INVOICE', align: 'left', first: true },
                                    { key: 'PO_ID', label: 'PO REF.', align: 'left' },
                                    { key: 'VendorName', label: 'VENDOR', align: 'left' },
                                    { key: 'BudgetNo', label: 'BUDGET NO.', align: 'left' },
                                    { key: 'ReceiveDate', label: 'วัน-เวลา', align: 'left' },
                                    { key: null, label: 'จำนวน', align: 'center' },
                                    { key: 'Status', label: 'สถานะ', align: 'center' },
                                    { key: 'ReceivedBy', label: 'USER', align: 'center' },
                                ].map(col => {
                                    const sorted = col.key && sortConfig?.key === col.key;
                                    return (
                                        <th
                                            key={col.label}
                                            className={`p-4 ${col.first ? 'pl-6' : ''} font-bold whitespace-nowrap ${col.key ? 'cursor-pointer hover:bg-slate-100 group transition-colors' : ''}`}
                                            onClick={col.key ? () => handleSort(col.key) : undefined}
                                            aria-sort={sorted ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                                        >
                                            <div className={`flex items-center gap-1 ${col.align === 'center' ? 'justify-center' : ''}`}>
                                                {col.label}
                                                {col.key && (sorted
                                                    ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                                                    : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />)}
                                            </div>
                                        </th>
                                    );
                                })}
                                <th className="p-4 font-bold text-center whitespace-nowrap">ดำเนินการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {currentInvoices.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="p-10 text-center text-slate-400">
                                        {hasActiveFilter ? 'ไม่พบ Invoice ที่ตรงกับตัวกรอง' : 'ยังไม่มีประวัติการรับของ'}
                                    </td>
                                </tr>
                            )}
                            {currentInvoices.map((inv, i) => {
                                const cancelled = inv.Status === 'Cancelled';
                                const txs = txByInvoice.get(inv.InvoiceNo) || [];
                                const qty = txs.reduce((s, t) => s + Number(t.Qty || 0), 0);
                                return (
                                    <tr
                                        key={inv.InvoiceID || i}
                                        className={`hover:bg-indigo-50/30 transition-colors group cursor-default ${cancelled ? 'opacity-60 bg-slate-50/60' : ''}`}
                                    >
                                        <td className="p-4 pl-6 font-mono font-bold text-slate-700 group-hover:text-indigo-700 whitespace-nowrap">
                                            <span className={cancelled ? 'line-through' : ''}>{inv.InvoiceNo}</span>
                                        </td>
                                        <td className="p-4 whitespace-nowrap">
                                            <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-xs font-mono font-bold">
                                                {inv.PO_ID}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="text-xs font-bold text-slate-700 whitespace-nowrap">{inv.VendorName || '-'}</div>
                                        </td>
                                        <td className="p-4 text-slate-500 font-mono text-xs whitespace-nowrap">{inv.BudgetNo || '-'}</td>
                                        <td className="p-4 text-slate-500 group-hover:text-slate-700 transition-colors whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <Calendar size={12} className="text-slate-300 group-hover:text-indigo-400" />
                                                {formatThaiDate(inv.ReceiveDate)}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center whitespace-nowrap text-xs text-slate-600">
                                            {txs.length > 0 ? <span><b>{txs.length}</b> รายการ · <b>{qty}</b> ชิ้น</span> : <span className="text-slate-300">-</span>}
                                        </td>
                                        <td className="p-4 text-center whitespace-nowrap">
                                            {cancelled ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-bold border border-red-200">ยกเลิกแล้ว</span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold border border-emerald-200">
                                                    <Check size={12} className="mr-1" /> ปกติ
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center whitespace-nowrap">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                                                {(inv.ReceivedBy || '?').toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center whitespace-nowrap">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => setSelectedInvoice(inv)}
                                                    className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                                                >
                                                    <Eye size={14} /> ดูรายละเอียด
                                                </button>
                                                {isStaff && !cancelled && (
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
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {sortedInvoices.length > 0 && (
                    <Pagination
                        currentPage={safePage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        itemsPerPage={ITEMS_PER_PAGE}
                        totalItems={sortedInvoices.length}
                    />
                )}
            </div>

            {/* Modals */}
            <AnimatePresence>
                {selectedPO && (
                    <ReceivePODetailModal
                        key="modal-po"
                        po={selectedPO}
                        products={products}
                        contact={(vendors || []).find(v => v.VendorName === selectedPO.VendorName)?.ContactInfo}
                        invoices={invoices}
                        isStaff={isStaff}
                        onClose={() => setSelectedPO(null)}
                        onReceive={openReceive}
                        onOpenInvoice={(inv) => { setSelectedPO(null); setSelectedInvoice(inv); }}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {selectedInvoice && invDetail && (
                    <InvoiceDetailModal
                        key="modal-invoice"
                        invoice={selectedInvoice}
                        rows={invDetail.rows}
                        totalQty={invDetail.totalQty}
                        totalValue={invDetail.totalValue}
                        vendor={invDetail.vendor}
                        contact={invDetail.contact}
                        isStaff={isStaff}
                        onClose={() => setSelectedInvoice(null)}
                        onCancelRequest={requestCancelInvoice}
                        onViewPO={poById.get(selectedInvoice.PO_ID) ? () => { setSelectedInvoice(null); setSelectedPO(poById.get(selectedInvoice.PO_ID)); } : undefined}
                        onPrintBlocked={() => setResultModal({ isOpen: true, type: 'error', title: 'พิมพ์ไม่ได้', message: 'เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up ของเว็บนี้แล้วลองใหม่' })}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {receiveTarget && (
                    <ReceiveFormModal
                        key={`receive-${receiveTarget.PO_ID}`}
                        po={receiveTarget}
                        products={products}
                        invoices={invoices}
                        isSubmitting={isSubmitting}
                        closeOnEscape={!anyAlertOpen}
                        onRequestClose={handleReceiveRequestClose}
                        onSubmit={handleReceive}
                    />
                )}
            </AnimatePresence>

            {/* Discard receive form confirmation */}
            <AlertModal
                isOpen={discardConfirm}
                type="danger"
                title="ยกเลิกการรับของ?"
                message="ข้อมูลที่กรอกไว้ในฟอร์มนี้จะหายไป"
                confirmText="ทิ้งข้อมูล"
                cancelText="กลับไปกรอก"
                onConfirm={() => {
                    setDiscardConfirm(false);
                    setReceiveTarget(null);
                }}
                onCancel={() => setDiscardConfirm(false)}
            />

            {/* Result Modal */}
            <AlertModal
                isOpen={resultModal.isOpen}
                onConfirm={() => setResultModal({ ...resultModal, isOpen: false })}
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
