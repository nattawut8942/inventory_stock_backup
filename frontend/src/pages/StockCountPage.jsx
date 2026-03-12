import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Search, Scan, Save, Package, AlertCircle, CheckCircle2,
    Trash2, History, ClipboardList, ArrowLeft,
    PlusCircle, ChevronRight, FileBarChart, X, Edit3, Lock, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import AlertModal from '../components/AlertModal';
import Portal from '../components/Portal';
import { API_BASE, API_URL } from '../config/api';

const StockCountPage = () => {
    const { user } = useAuth();

    // View state
    const [currentView, setCurrentView] = useState('counting'); // counting | history
    const [selectedSession, setSelectedSession] = useState(null);

    // Counting state
    const [activeSession, setActiveSession] = useState(null);
    const [countingList, setCountingList] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [showUncountedModal, setShowUncountedModal] = useState(false);
    const [scanInput, setScanInput] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const scanInputRef = useRef(null);
    const searchDropdownRef = useRef(null);
    const searchTimeoutRef = useRef(null);

    // History state
    const [sessions, setSessions] = useState([]);
    const [detailData, setDetailData] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(null);
    const [editItems, setEditItems] = useState([]);
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Alert
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });

    const showAlert = (type, title, message, autoClose = null) => {
        setAlertModal({ isOpen: true, type, title, message, autoClose });
    };

    // Focus scan input
    useEffect(() => {
        if (currentView === 'counting' && activeSession) {
            scanInputRef.current?.focus();
        }
    }, [currentView, activeSession]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target)) {
                setShowSearchDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchSessions = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions`);
            if (res.ok) {
                const data = await res.json();
                setSessions(data); // Display all: Valid ones are 'Confirmed', 'Adjusted', 'Draft'
            }
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
        }
    }, []);

    const fetchAllProducts = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/products`);
            if (res.ok) {
                const data = await res.json();
                setAllProducts(data);
            }
        } catch (err) {
            console.error('Failed to fetch all products:', err);
        }
    }, []);

    useEffect(() => {
        fetchSessions();
        fetchAllProducts();
    }, [fetchSessions, fetchAllProducts]);

    // =================== COUNTING ===================

    const handleCreateSession = async () => {
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Note: '' })
            });
            if (res.ok) {
                const data = await res.json();
                setActiveSession(data.session);
                setCountingList([]);
                showAlert('success', 'สร้างรอบนับใหม่', `สร้างรอบ ${data.session.SessionCode} เรียบร้อย`, 1500);
            }
        } catch (err) {
            showAlert('error', 'ผิดพลาด', 'ไม่สามารถสร้างรอบนับใหม่ได้');
        }
    };

    // Search/scan logic
    const handleSearchInput = (value) => {
        setScanInput(value);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        if (!value.trim()) {
            setSearchResults([]);
            setShowSearchDropdown(false);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch(`${API_BASE}/stock-count/search?q=${encodeURIComponent(value.trim())}`);
                if (res.ok) {
                    const data = await res.json();
                    setSearchResults(data);
                    setShowSearchDropdown(data.length > 0);
                }
            } catch (err) {
                console.error('Search error:', err);
            }
            setIsSearching(false);
        }, 300);
    };

    const handleScanSubmit = async (e) => {
        e.preventDefault();
        if (!scanInput.trim() || !activeSession) return;

        // If search results has exactly 1 match, add it directly
        if (searchResults.length === 1) {
            await addProductToSession(searchResults[0]);
        } else if (searchResults.length > 1) {
            setShowSearchDropdown(true);
        } else {
            // Try exact match
            setIsSearching(true);
            try {
                const res = await fetch(`${API_BASE}/stock-count/search?q=${encodeURIComponent(scanInput.trim())}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.length === 1) {
                        await addProductToSession(data[0]);
                    } else if (data.length > 1) {
                        setSearchResults(data);
                        setShowSearchDropdown(true);
                    } else {
                        showAlert('error', 'ไม่พบ', `ไม่พบรายการอุปกรณ์: ${scanInput}`, 2000);
                    }
                }
            } catch (err) {
                showAlert('error', 'ผิดพลาด', 'ไม่สามารถค้นหาได้');
            }
            setIsSearching(false);
        }
    };

    const addProductToSession = async (product) => {
        if (!activeSession) return;

        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${activeSession.SessionID}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ProductID: product.ProductID })
            });
            const data = await res.json();
            if (res.ok) {
                setCountingList(prev => [data.item, ...prev]);
                setScanInput('');
                setSearchResults([]);
                setShowSearchDropdown(false);
                scanInputRef.current?.focus();
                showAlert('success', 'เพิ่มแล้ว', `เพิ่มรายการ: ${product.ProductName}`, 1200);
            } else {
                if (data.duplicate) {
                    showAlert('info', 'ซ้ำ', `${product.ProductName} อยู่ในรายการนับแล้ว`, 1500);
                } else {
                    showAlert('error', 'ผิดพลาด', data.error);
                }
            }
        } catch (err) {
            showAlert('error', 'ผิดพลาด', 'ไม่สามารถเพิ่มรายการได้');
        }
        setScanInput('');
        setShowSearchDropdown(false);
    };

    const handleUpdateQty = async (itemId, value) => {
        const numVal = value === '' ? null : parseInt(value, 10);
        setCountingList(prev => prev.map(item =>
            item.ItemID === itemId ? { ...item, ActualQty: numVal, DiffQty: numVal !== null ? numVal - item.SystemQty : null } : item
        ));

        if (numVal !== null && activeSession) {
            try {
                await fetch(`${API_BASE}/stock-count/sessions/${activeSession.SessionID}/items/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ActualQty: numVal })
                });
            } catch (err) {
                console.error('Failed to save qty:', err);
            }
        }
    };

    const handleRemoveItem = async (itemId) => {
        if (!activeSession) return;
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${activeSession.SessionID}/items/${itemId}`, { method: 'DELETE' });
            if (res.ok) {
                setCountingList(prev => prev.filter(item => item.ItemID !== itemId));
            }
        } catch (err) {
            console.error('Failed to remove item:', err);
        }
    };

    const handleConfirm = async () => {
        if (!activeSession) return;
        const incomplete = countingList.filter(i => i.ActualQty === null || i.ActualQty === undefined);
        if (incomplete.length > 0) {
            showAlert('error', 'กรอกไม่ครบ', 'กรุณากรอกจำนวนนับจริงให้ครบทุกรายการ');
            return;
        }
        if (countingList.length === 0) {
            showAlert('error', 'ไม่มีรายการ', 'กรุณาเพิ่มรายการก่อนยืนยัน');
            return;
        }

        setAlertModal({
            isOpen: true,
            type: 'confirm',
            title: 'ยืนยันการนับสต็อก?',
            message: `จะทำการบันทึกยอดการนับ ${countingList.length} รายการ (ยังไม่มีการปรับยอดสต็อกจริงในตอนนี้)`,
            confirmText: 'ยืนยัน',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                setAlertModal(prev => ({ ...prev, isOpen: false }));
                setIsConfirming(true);
                try {
                    const res = await fetch(`${API_BASE}/stock-count/sessions/${activeSession.SessionID}/confirm`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ConfirmedBy: user?.username || user?.name })
                    });
                    if (res.ok) {
                        showAlert('success', 'บันทึกสำเร็จ', 'บันทึกการนับสต็อกเรียบร้อยแล้วไปที่ประวัติเพื่อปรับยอด');
                        setActiveSession(null);
                        setCountingList([]);
                        fetchSessions();
                        setCurrentView('history');
                    } else {
                        const data = await res.json();
                        showAlert('error', 'ผิดพลาด', data.error || 'ไม่สามารถยืนยันได้');
                    }
                } catch (err) {
                    showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
                }
                setIsConfirming(false);
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    // =================== HISTORY ===================
    const [isAdjusting, setIsAdjusting] = useState(false);

    const handleAdjustStock = async () => {
        if (!selectedSession) return;
        setAlertModal({
            isOpen: true,
            type: 'confirm',
            title: 'ปรับยอดสต็อกตามจริง?',
            message: `จะทำการปรับยอดสต็อกตามรายการที่นับได้ในเอกสาร ${selectedSession.SessionCode} การกระทำนี้ไม่สามารถย้อนกลับได้`,
            confirmText: 'ปรับยอด',
            cancelText: 'ยกเลิก',
            onConfirm: async () => {
                setAlertModal(prev => ({ ...prev, isOpen: false }));
                setIsAdjusting(true);
                try {
                    const res = await fetch(`${API_BASE}/stock-count/sessions/${selectedSession.SessionID}/adjust`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ AdjustedBy: user?.username || user?.name })
                    });
                    if (res.ok) {
                        showAlert('success', 'ยืนยันสำเร็จ', 'ปรับยอดสต็อกตามการนับจริงเรียบร้อยแล้ว');
                        await loadSessionDetail(selectedSession.SessionID);
                        fetchSessions();
                    } else {
                        const data = await res.json();
                        showAlert('error', 'ผิดพลาด', data.error || 'ไม่สามารถปรับยอดได้');
                    }
                } catch (err) {
                    showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
                }
                setIsAdjusting(false);
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    const loadSessionDetail = async (sessionId) => {
        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${sessionId}`);
            if (res.ok) {
                const data = await res.json();

                // If the session is a draft, we resume the count
                if (data.session.Status === 'Draft') {
                    setActiveSession(data.session);
                    setCountingList(data.items);
                    setCurrentView('counting');
                    return;
                }

                // Normal view for history details
                setSelectedSession(data.session);
                setDetailData(data); // Reverting this line back to data, as the object structure has { session, items }
                setEditItems(data.items.map(i => ({ ItemID: i.ItemID, ActualQty: i.ActualQty })));
                setIsEditing(false);
            }
        } catch (err) {
            console.error('Failed to load detail:', err);
        }
    };

    const startEditing = () => {
        if (!detailData) return;
        setEditItems(detailData.items.map(i => ({ ...i, newActualQty: i.ActualQty })));
        setIsEditing(true);
    };

    const handleSaveEdit = async () => {
        if (!selectedSession) return;
        setIsSavingEdit(true);

        const changedItems = editItems.filter(i => i.newActualQty !== i.ActualQty).map(i => ({
            ItemID: i.ItemID,
            ActualQty: i.newActualQty
        }));

        if (changedItems.length === 0) {
            setIsEditing(false);
            setIsSavingEdit(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/stock-count/sessions/${selectedSession.SessionID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: changedItems,
                    ConfirmedBy: user?.username || user?.name
                })
            });
            if (res.ok) {
                showAlert('success', 'บันทึกสำเร็จ', 'แก้ไขข้อมูลการนับเรียบร้อยแล้ว');
                await loadSessionDetail(selectedSession.SessionID);
                fetchSessions();
                setIsEditing(false);
            } else {
                const data = await res.json();
                showAlert('error', 'ผิดพลาด', data.error || 'ไม่สามารถบันทึกได้');
            }
        } catch (err) {
            showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
        }
        setIsSavingEdit(false);
    };

    // Delete session from history
    const handleDeleteSession = async (sessionId, sessionCode, e) => {
        e.stopPropagation();
        setAlertModal({
            isOpen: true, type: 'danger', title: 'ลบรอบนับ?',
            message: `ต้องการลบรอบการนับ ${sessionCode}? การกระทำนี้ไม่สามารถย้อนกลับได้`,
            confirmText: 'ลบ', cancelText: 'ยกเลิก',
            onConfirm: async () => {
                setAlertModal(p => ({ ...p, isOpen: false }));
                setIsDeleting(sessionId);
                try {
                    const res = await fetch(`${API_BASE}/stock-count/sessions/${sessionId}`, { method: 'DELETE' });
                    if (res.ok) {
                        showAlert('success', 'ลบแล้ว', `ลบรอบ ${sessionCode} เรียบร้อย`, 1500);
                        fetchSessions();
                    } else {
                        const data = await res.json();
                        showAlert('error', 'ผิดพลาด', data.error || 'ไม่สามารถลบได้');
                    }
                } catch (err) {
                    showAlert('error', 'Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
                }
                setIsDeleting(null);
            },
            onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
        });
    };

    // Format date
    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getDaysAgo = (dateStr) => {
        if (!dateStr) return 999;
        const d = new Date(dateStr);
        const now = new Date();
        return Math.floor((now - d) / (1000 * 60 * 60 * 24));
    };

    // =================== RENDER ===================

    return (
        <div className="space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
            >
                <div>
                    <h2 className="text-3xl font-black mb-1 text-slate-800">STOCK COUNT</h2>
                    <p className="text-slate-500 font-medium">ตรวจนับสต็อกและปรับยอด</p>
                </div>

                {/* View Tabs */}
                <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                    <button
                        onClick={() => { setCurrentView('counting'); setSelectedSession(null); setDetailData(null); }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${currentView === 'counting'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                            }`}
                    >
                        <ClipboardList size={18} /> นับสต็อก
                    </button>
                    <button
                        onClick={() => { setCurrentView('history'); setSelectedSession(null); setDetailData(null); fetchSessions(); }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${currentView === 'history'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                            }`}
                    >
                        <History size={18} /> ประวัติ
                    </button>
                </div>
            </motion.div>

            {/* ========================= COUNTING VIEW ========================= */}
            {currentView === 'counting' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                >
                    {/* No active session → show start button */}
                    {!activeSession ? (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center"
                        >
                            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-200">
                                <ClipboardList className="text-white" size={40} />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 mb-2">เริ่มการนับสต็อก</h3>
                            <p className="text-slate-400 mb-8 max-w-md mx-auto">สร้างรอบนับใหม่ แล้วสแกนบาร์โค้ดหรือพิมพ์ค้นหาอุปกรณ์เพื่อเริ่มนับ</p>
                            <button
                                onClick={handleCreateSession}
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-10 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 hover:shadow-xl hover:scale-105 transition-all flex items-center gap-3 mx-auto"
                            >
                                <PlusCircle size={22} /> สร้างรอบนับใหม่
                            </button>
                        </motion.div>
                    ) : (
                        <>
                            {/* Active session info */}
                            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-wider">{activeSession.SessionCode}</span>
                                            <span className="bg-yellow-400/20 text-yellow-200 px-2 py-0.5 rounded-full text-[10px] font-bold">DRAFT</span>
                                        </div>
                                        <p className="text-indigo-100 text-sm">กำลังนับสต็อก • นับแล้ว {countingList.length} / {allProducts.length} รายการ</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setShowUncountedModal(true)}
                                            className="bg-white/20 hover:bg-white text-white hover:text-indigo-600 text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-sm"
                                        >
                                            ดูรายการที่ยังไม่ได้นับ ({(allProducts.length - countingList.length) > 0 ? allProducts.length - countingList.length : 0})
                                        </button>
                                        <button
                                            onClick={() => {
                                                setAlertModal({
                                                    isOpen: true, type: 'confirm', title: 'ยกเลิกรอบนับ?',
                                                    message: 'ยกเลิกรอบการนับนี้? ข้อมูลจะไม่ถูกบันทึก',
                                                    confirmText: 'ยกเลิก', cancelText: 'กลับไปนับ',
                                                    onConfirm: async () => {
                                                        setAlertModal(p => ({ ...p, isOpen: false }));
                                                        try {
                                                            await fetch(`${API_BASE}/stock-count/sessions/${activeSession.SessionID}`, { method: 'DELETE' });
                                                        } catch (err) { console.error('Failed to delete draft:', err); }
                                                        setActiveSession(null); setCountingList([]);
                                                    },
                                                    onCancel: () => setAlertModal(p => ({ ...p, isOpen: false }))
                                                });
                                            }}
                                            className="text-white/70 hover:text-white text-sm font-medium hover:bg-white/10 px-3 py-2 rounded-xl transition-all"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Scan input */}
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative" ref={searchDropdownRef}>
                                <form onSubmit={handleScanSubmit} className="flex gap-3">
                                    <div className="relative flex-1">
                                        <Scan className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                        <input
                                            ref={scanInputRef}
                                            type="text"
                                            value={scanInput}
                                            onChange={(e) => handleSearchInput(e.target.value)}
                                            placeholder="สแกนบาร์โค้ด หรือ พิมพ์ชื่ออุปกรณ์เพื่อค้นหา..."
                                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 text-base font-medium outline-none transition-all"
                                            autoComplete="off"
                                        />
                                        {isSearching && (
                                            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" size={20} />
                                        )}
                                    </div>
                                    <button
                                        type="submit"
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 rounded-xl font-bold shadow-md shadow-indigo-200 transition-all active:scale-95"
                                    >
                                        เพิ่ม
                                    </button>
                                </form>

                                {/* Search dropdown */}
                                <AnimatePresence>
                                    {showSearchDropdown && searchResults.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto"
                                        >
                                            {searchResults.map(product => (
                                                <button
                                                    key={product.ProductID}
                                                    onClick={() => addProductToSession(product)}
                                                    className="w-full flex items-center gap-3 p-3 hover:bg-indigo-50 transition-colors text-left border-b border-slate-50 last:border-0"
                                                >
                                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                                        {product.ImageURL ? (
                                                            <img src={`${API_URL}${product.ImageURL}`} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Package size={18} className="text-slate-400" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-sm text-slate-800 truncate">{product.ProductName}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {product.BarcodeID && (
                                                                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{product.BarcodeID}</span>
                                                            )}
                                                            <span className="text-[10px] text-slate-400">ID: {product.ProductID}</span>
                                                            <span className="text-[10px] text-slate-400">{product.DeviceType}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-sm font-bold text-indigo-600">{product.CurrentStock}</p>
                                                        <p className="text-[10px] text-slate-400">{product.UnitOfMeasure || 'Pcs'}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Counting list */}
                            <div>
                                <div className="flex justify-between items-center mb-3 px-1">
                                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                        <ClipboardList size={18} className="text-indigo-500" /> รายการที่สแกน
                                    </h3>
                                    <span className="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">{countingList.length} รายการ</span>
                                </div>

                                {countingList.length === 0 ? (
                                    <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                                        <Search className="mx-auto mb-3 text-slate-200" size={48} />
                                        <p className="text-slate-400 font-medium">ยังไม่มีรายการสแกน</p>
                                        <p className="text-slate-300 text-sm mt-1">สแกนบาร์โค้ดหรือพิมพ์ค้นหาเพื่อเพิ่มรายการ</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {countingList.map((item, idx) => {
                                            const diff = item.ActualQty !== null && item.ActualQty !== undefined
                                                ? item.ActualQty - item.SystemQty : null;
                                            return (
                                                <motion.div
                                                    key={item.ItemID}
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: idx * 0.03 }}
                                                    className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                                            {item.ImageURL ? (
                                                                <img src={`${API_URL}${item.ImageURL}`} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Package size={20} className="text-slate-400" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-bold text-slate-800 text-sm truncate">{item.ProductName}</h4>
                                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                                {item.BarcodeID && (
                                                                    <span className="text-[10px] font-mono text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{item.BarcodeID}</span>
                                                                )}
                                                                <span className="text-[10px] text-slate-400">ID: {item.ProductID}</span>
                                                                <span className="text-[10px] text-slate-400">ในระบบ: <span className="font-bold text-slate-600">{item.SystemQty}</span> {item.UnitOfMeasure || 'Pcs'}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-3 shrink-0">
                                                            <div className="flex flex-col items-center">
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1">นับจริง</label>

                                                                <div className="flex items-center bg-slate-50 border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                                                                    <button
                                                                        onClick={() => handleUpdateQty(item.ItemID, Math.max(0, (item.ActualQty || 0) - 1))}
                                                                        className="px-3 py-2 text-slate-500 hover:bg-slate-200 hover:text-slate-700 font-black transition-colors"
                                                                    >
                                                                        -
                                                                    </button>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        value={item.ActualQty ?? ''}
                                                                        onChange={(e) => handleUpdateQty(item.ItemID, e.target.value)}
                                                                        placeholder="?"
                                                                        className="w-16 px-1 py-2 text-center text-xl font-black bg-transparent outline-none"
                                                                    />
                                                                    <button
                                                                        onClick={() => handleUpdateQty(item.ItemID, (item.ActualQty || 0) + 1)}
                                                                        className="px-3 py-2 text-slate-500 hover:bg-slate-200 hover:text-slate-700 font-black transition-colors"
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>

                                                                {diff !== 0 && (
                                                                    <button
                                                                        onClick={() => handleUpdateQty(item.ItemID, item.SystemQty)}
                                                                        className="mt-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-full transition-colors flex items-center gap-1"
                                                                    >
                                                                        <CheckCircle2 size={12} /> ยอดตรงกับระบบ
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {diff !== null && (
                                                                <div className={`w-16 text-center py-1.5 rounded-lg text-xs font-black ${diff === 0
                                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                                                    : diff > 0
                                                                        ? 'bg-blue-50 text-blue-600 border border-blue-200'
                                                                        : 'bg-red-50 text-red-600 border border-red-200'
                                                                    }`}>
                                                                    {diff === 0 ? '✓' : diff > 0 ? `+${diff}` : diff}
                                                                </div>
                                                            )}

                                                            <button
                                                                onClick={() => handleRemoveItem(item.ItemID)}
                                                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Confirm button */}
                            {countingList.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-200"
                                >
                                    <div className="text-sm text-slate-500">
                                        <span className="font-bold text-slate-700">{countingList.length}</span> รายการ •
                                        <span className="font-bold text-emerald-600 ml-1">{countingList.filter(i => i.ActualQty !== null && i.ActualQty !== undefined && i.ActualQty === i.SystemQty).length}</span> ตรง •
                                        <span className="font-bold text-red-500 ml-1">{countingList.filter(i => i.ActualQty !== null && i.ActualQty !== undefined && i.ActualQty !== i.SystemQty).length}</span> แตกต่าง
                                    </div>
                                    <button
                                        onClick={handleConfirm}
                                        disabled={isConfirming}
                                        className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-10 py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {isConfirming ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                                        บันทึกการนับสต็อก
                                    </button>
                                </motion.div>
                            )}
                        </>
                    )}
                </motion.div>
            )}

            {/* ========================= HISTORY VIEW ========================= */}
            {currentView === 'history' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    {selectedSession && detailData ? (
                        /* Detail View */
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => { setSelectedSession(null); setDetailData(null); setIsEditing(false); }}
                                    className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors"
                                >
                                    <ArrowLeft size={22} />
                                </button>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h2 className="text-xl font-black text-slate-800">{selectedSession.SessionCode}</h2>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedSession.Status === 'Adjusted' ? 'bg-emerald-100 text-emerald-700' :
                                            selectedSession.Status === 'Confirmed' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                            {selectedSession.Status === 'Adjusted' ? 'ปรับยอดแล้ว' : selectedSession.Status === 'Confirmed' ? 'รอยืนยันปรับยอด' : 'ฉบับร่าง'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-500">
                                        {formatDate(selectedSession.CountDate)}
                                        {selectedSession.ConfirmedBy && <> • ผู้บันทึก: <span className="font-bold text-indigo-600">{selectedSession.ConfirmedBy}</span></>}
                                    </p>
                                </div>

                                {/* Edit and Adjust buttons */}
                                {(user?.role === 'Admin' || user?.role === 'Staff') && selectedSession.Status === 'Confirmed' && (
                                    <div className="flex items-center gap-3">
                                        {getDaysAgo(selectedSession.CountDate) <= 3 ? (
                                            !isEditing ? (
                                                <button
                                                    onClick={startEditing}
                                                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-bold text-sm hover:bg-amber-100 transition-all"
                                                >
                                                    <Edit3 size={16} /> แก้ไขจำนวน
                                                </button>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setIsEditing(false)}
                                                        className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-medium text-sm transition-all"
                                                    >
                                                        ยกเลิก
                                                    </button>
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        disabled={isSavingEdit}
                                                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all disabled:opacity-50"
                                                    >
                                                        {isSavingEdit ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                                        บันทึกที่แก้ไข
                                                    </button>
                                                </div>
                                            )
                                        ) : (
                                            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-sm font-medium">
                                                <Lock size={16} /> ไม่สามารถแก้ไขได้ (เกิน 3 วัน)
                                            </div>
                                        )}

                                        {!isEditing && (
                                            <button
                                                onClick={handleAdjustStock}
                                                disabled={isAdjusting}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 shadow-md transition-all disabled:opacity-50"
                                            >
                                                {isAdjusting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                                                สรุปการปรับยอดสต็อก
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Summary cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">รายการทั้งหมด</p>
                                    <p className="text-2xl font-black text-slate-700">{selectedSession.TotalItems}</p>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">พบส่วนต่าง</p>
                                    <p className={`text-2xl font-black ${selectedSession.Variances > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {selectedSession.Variances}
                                    </p>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center sm:col-span-1 col-span-2">
                                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">สถานะ</p>
                                    <p className={`text-lg font-black ${selectedSession.Status === 'Adjusted' ? 'text-emerald-600' :
                                        selectedSession.Status === 'Confirmed' ? 'text-indigo-600' : 'text-amber-600'
                                        }`}>
                                        {selectedSession.Status === 'Adjusted' ? '✓ ปรับยอดแล้ว' : selectedSession.Status === 'Confirmed' ? '◐ ยังไม่ปรับยอด' : '◐ ฉบับร่าง'}
                                    </p>
                                </div>
                            </div>

                            {/* Items table */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">อุปกรณ์</th>
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center">ในระบบ</th>
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center">นับจริง</th>
                                                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase text-center">ส่วนต่าง</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(isEditing ? editItems : detailData.items).map((item, idx) => {
                                                const actualQty = isEditing ? item.newActualQty : item.ActualQty;
                                                const diff = actualQty !== null ? actualQty - item.SystemQty : null;
                                                return (
                                                    <tr key={item.ItemID || idx} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-4">
                                                            <p className="font-bold text-slate-800 text-sm">{item.ProductName}</p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[10px] font-mono text-slate-400">ID: {item.ProductID}</span>
                                                                {item.BarcodeID && <span className="text-[10px] font-mono text-indigo-400">{item.BarcodeID}</span>}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 text-center text-sm text-slate-600 font-medium">
                                                            {item.SystemQty} {item.UnitOfMeasure || 'Pcs'}
                                                        </td>
                                                        <td className="px-4 py-4 text-center">
                                                            {isEditing ? (
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={item.newActualQty ?? ''}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                                                                        setEditItems(prev => prev.map(i =>
                                                                            i.ItemID === item.ItemID ? { ...i, newActualQty: val } : i
                                                                        ));
                                                                    }}
                                                                    className="w-20 px-2 py-1.5 text-center text-base font-bold bg-amber-50 border-2 border-amber-200 rounded-lg focus:border-amber-400 outline-none"
                                                                />
                                                            ) : (
                                                                <span className="text-sm text-indigo-600 font-bold">{item.ActualQty} {item.UnitOfMeasure || 'Pcs'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4 text-center">
                                                            {diff !== null && (
                                                                <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${diff === 0
                                                                    ? 'bg-emerald-50 text-emerald-600'
                                                                    : diff > 0
                                                                        ? 'bg-blue-50 text-blue-600'
                                                                        : 'bg-red-50 text-red-600'
                                                                    }`}>
                                                                    {diff === 0 ? '✓ ตรง' : diff > 0 ? `+${diff}` : diff}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Session List */
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <History size={20} className="text-indigo-600" /> ประวัติการนับสต็อก
                                </h3>
                                <button
                                    onClick={() => { setCurrentView('counting'); }}
                                    className="text-indigo-600 font-bold text-sm flex items-center gap-1 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all"
                                >
                                    <PlusCircle size={16} /> เริ่มการนับใหม่
                                </button>
                            </div>

                            {sessions.length === 0 ? (
                                <div className="bg-white p-16 rounded-2xl text-center border-2 border-dashed border-slate-200">
                                    <FileBarChart className="mx-auto mb-4 text-slate-200" size={64} />
                                    <p className="text-slate-400 font-medium">ยังไม่มีประวัติการนับสต็อก</p>
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {sessions.map(session => {
                                        const daysAgo = getDaysAgo(session.CountDate);
                                        const isLocked = daysAgo > 3 && session.Status === 'Confirmed';
                                        return (
                                            <motion.div
                                                key={session.SessionID}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                onClick={() => loadSessionDetail(session.SessionID)}
                                                className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                                            >
                                                <div className="absolute right-0 top-0 bottom-0 w-1 bg-indigo-500 transform scale-y-0 group-hover:scale-y-100 transition-transform origin-top"></div>
                                                <div className="flex justify-between items-start gap-4">
                                                    <div className="space-y-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="bg-indigo-50 text-indigo-600 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-indigo-100">
                                                                {session.SessionCode}
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${session.Status === 'Confirmed'
                                                                ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                                }`}>{session.Status === 'Confirmed' ? 'ยืนยันแล้ว' : 'ฉบับร่าง'}</span>
                                                            {isLocked && (
                                                                <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Lock size={10} /> ล็อก</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-400">{formatDate(session.CountDate)}</p>
                                                        <h3 className="font-bold text-slate-800">ตรวจนับ {session.TotalItems} รายการ</h3>
                                                        <div className="flex gap-4 mt-1 flex-wrap">
                                                            <div className="flex items-center gap-1">
                                                                <AlertCircle size={14} className={session.Variances > 0 ? "text-red-400" : "text-slate-300"} />
                                                                <span className="text-xs text-slate-500">ส่วนต่าง: <span className="font-bold">{session.Variances}</span></span>
                                                            </div>
                                                            {session.ConfirmedBy && (
                                                                <div className="flex items-center gap-1 text-indigo-600">
                                                                    <CheckCircle2 size={14} />
                                                                    <span className="text-xs font-medium">{session.ConfirmedBy}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {!isLocked && (user?.role === 'Admin' || user?.role === 'Staff') && (
                                                            <button
                                                                onClick={(e) => handleDeleteSession(session.SessionID, session.SessionCode, e)}
                                                                disabled={isDeleting === session.SessionID}
                                                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all z-10"
                                                                title="ลบรอบนับ"
                                                            >
                                                                {isDeleting === session.SessionID ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                                                            </button>
                                                        )}
                                                        <ChevronRight className="text-slate-300 group-hover:text-indigo-500 transition-colors" size={24} />
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Uncounted Products Modal */}
            <Portal>
                <AnimatePresence>
                    {showUncountedModal && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowUncountedModal(false)}
                                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-[70] flex flex-col max-h-[85vh]"
                            >
                                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-20">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                            <Search className="text-indigo-500" size={20} /> รายการที่ยังไม่ได้นับ
                                        </h3>
                                        <p className="text-sm text-slate-500 mt-1">
                                            อุปกรณ์ที่มีการเคลื่อนไหวในระบบ แต่ยังไม่มีการนับในรอบนี้ ({(allProducts.length - countingList.length) > 0 ? allProducts.length - countingList.length : 0} รายการ)
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowUncountedModal(false)}
                                        className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="p-0 overflow-y-auto flex-1 bg-slate-50/50">
                                    {allProducts.filter(p => !countingList.some(c => c.ProductID === p.ProductID)).length === 0 ? (
                                        <div className="p-10 text-center">
                                            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
                                            <h4 className="text-lg font-bold text-slate-700 mb-1">เยี่ยมยอด!</h4>
                                            <p className="text-sm text-slate-500">คุณได้สแกนและนับอุปกรณ์ทั้งหมดในระบบครบทุกรายการแล้ว</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {allProducts.filter(p => !countingList.some(c => c.ProductID === p.ProductID)).map(product => (
                                                <div key={product.ProductID} className="p-4 flex items-center justify-between hover:bg-white transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                                            {product.ImageURL ? (
                                                                <img src={`${API_URL}${product.ImageURL}`} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Package size={20} className="text-slate-400" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-slate-800 text-sm">{product.ProductName}</h4>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                {product.BarcodeID && (
                                                                    <span className="text-[10px] font-mono text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{product.BarcodeID}</span>
                                                                )}
                                                                <span className="text-[10px] text-slate-400">ID: {product.ProductID}</span>
                                                                <span className="text-[10px] text-slate-400">ในระบบ: <span className="font-bold text-slate-600">{product.CurrentStock}</span> {product.UnitOfMeasure || 'Pcs'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => addProductToSession(product)}
                                                        className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl font-bold text-sm shadow-sm transition-all"
                                                    >
                                                        + เพิ่ม
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </Portal>

            {/* Alert Modal */}
            <AlertModal
                isOpen={alertModal.isOpen}
                type={alertModal.type}
                title={alertModal.title}
                message={alertModal.message}
                confirmText={alertModal.confirmText}
                cancelText={alertModal.cancelText}
                onConfirm={alertModal.onConfirm || (() => setAlertModal(prev => ({ ...prev, isOpen: false })))}
                onCancel={alertModal.onCancel}
                onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
                autoClose={alertModal.autoClose}
            />
        </div>
    );
};

export default StockCountPage;
