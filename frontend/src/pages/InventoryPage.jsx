import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Monitor, Network, Archive, Database, Package, List, LayoutGrid, Edit2, Trash2, X, TrendingUp, TrendingDown, AlertTriangle, DollarSign, HardDrive, Mouse, Droplet, Printer, ShoppingBag, ShoppingCart, Minus, Plus, FileEdit, ScanLine, Check, Truck, Settings, ClipboardList } from 'lucide-react';
import Barcode from 'react-barcode';
import { motion, AnimatePresence } from 'motion/react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import AlertModal from '../components/AlertModal';
import Portal from '../components/Portal';
import { getBadgeStyle, getColorGradient, getChartColor, getDeviceTypeColor } from '../utils/styleHelpers';
import { formatThaiDate } from '../utils/formatDate';

import { API_BASE, API_URL } from '../config/api';
import StockCountPage from './StockCountPage';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

// StatCard Component
const StatCard = ({ icon: Icon, title, value, change, changeType, color }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow"
    >
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm text-slate-600 mb-1">{title}</p>
                <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
                {change !== undefined && (
                    <div className="flex items-center gap-1 mt-2">
                        {changeType === 'up' ? (
                            <TrendingUp className="w-4 h-4 text-green-500" />
                        ) : (
                            <TrendingDown className="w-4 h-4 text-red-500" />
                        )}
                        <span className={`text-sm font-medium ${changeType === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                            {change}
                        </span>
                    </div>
                )}
            </div>
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center`}>
                <Icon className="w-7 h-7 text-white" />
            </div>
        </div>
    </motion.div>
);

const InventoryPage = () => {
    const { products, deviceTypes, refreshData } = useData();
    const { user } = useAuth();
    const location = useLocation();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedType, setSelectedType] = useState('all');
    const [showLowStock, setShowLowStock] = useState(location.state?.filter === 'lowstock');
    const [viewMode, setViewMode] = useState('grid');
    const [activeTab, setActiveTab] = useState('inventory');
    const [editItem, setEditItem] = useState(null);
    const [historyItem, setHistoryItem] = useState(null);
    const [historyData, setHistoryData] = useState([]);

    const [detailItem, setDetailItem] = useState(null);

    // Modal & Alert States
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
    const [locations, setLocations] = useState([]);

    useEffect(() => {
        fetchLocations();
    }, []);

    useEffect(() => {
        if (location.state?.filter === 'lowstock' && !showLowStock) {
            setShowLowStock(true);
            // Clear the state so it doesn't re-trigger on subsequent internal navigations if any
            window.history.replaceState({}, document.title);
        }
    }, [location.state?.filter]);

    const fetchLocations = async () => {
        try {
            const res = await fetch(`${API_BASE}/locations`);
            if (res.ok) {
                const data = await res.json();
                setLocations(data);
            }
        } catch (error) {
            console.error('Error fetching locations:', error);
        }
    };
    // --- WITHDRAW & CART STATE ---
    const [cart, setCart] = useState(() => {
        const savedCart = localStorage.getItem('cart');
        return savedCart ? JSON.parse(savedCart) : [];
    });

    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(cart));
    }, [cart]);
    const [isCartOpen, setIsCartOpen] = useState(false);

    // Qty Modal (Shared for Cart & Quick Withdraw)
    const [qtyModal, setQtyModal] = useState({ isOpen: false, product: null, mode: 'cart' }); // mode: 'cart' | 'withdraw'
    const [selectQty, setSelectQty] = useState(1);

    // Reason State
    const [reasons, setReasons] = useState([]);
    const [reasonOptions, setReasonOptions] = useState([]); // Filtered options for current interaction

    useEffect(() => {
        const fetchReasons = async () => {
            try {
                const res = await fetch(`${API_BASE}/reasons`);
                if (!res.ok) throw new Error('Failed to fetch reasons');
                const data = await res.json();
                setReasons(data);
            } catch (err) {
                console.error('Error fetching reasons:', err);
            }
        };
        fetchReasons();
    }, []);

    const [selectedReason, setSelectedReason] = useState('');
    const [reasonDetail, setReasonDetail] = useState('');

    // Scan Modal
    const [scanModal, setScanModal] = useState({ isOpen: false, scannedCode: '', foundProduct: null, error: '' });
    const [scanQty, setScanQty] = useState(1);
    const [scanReason, setScanReason] = useState('New Withdrawal');
    const [scanReasonDetail, setScanReasonDetail] = useState('');

    // --- HELPERS ---
    const getFilteredReasons = (product) => {
        if (!product) return [];
        return reasons.filter(r => !r.TypeId || r.TypeId === product.DeviceType);
    };

    const openCartModal = (product) => {
        const existing = cart.find(c => c.ProductID === product.ProductID);
        setSelectQty(existing ? existing.qty : 1);

        const filtered = getFilteredReasons(product);
        setReasonOptions(filtered);

        // Use existing reason if valid, otherwise default to first available
        const defaultReason = filtered.length > 0 ? filtered[0].Label : 'Other';
        setSelectedReason(existing ? existing.reason : defaultReason);

        setReasonDetail(existing ? existing.reasonDetail : '');
        setQtyModal({ isOpen: true, product, mode: 'cart' });
    };

    const openWithdrawModal = (product) => {
        setSelectQty(1);
        const filtered = getFilteredReasons(product);
        setReasonOptions(filtered);

        const defaultReason = filtered.length > 0 ? filtered[0].Label : 'Other';
        setSelectedReason(defaultReason);

        setReasonDetail('');
        setQtyModal({ isOpen: true, product, mode: 'withdraw' });
    };

    const getRefInfo = (reason, detail) => {
        let info = reason || selectedReason;
        const d = detail !== undefined ? detail : reasonDetail;
        if (d && d.trim()) {
            info += `: ${d.trim()}`;
        }
        return info;
    };

    // Confirm Qty Logic
    const handleQtyConfirm = async () => {
        const product = qtyModal.product;
        if (!product || selectQty <= 0) return;

        if (qtyModal.mode === 'cart') {
            // Add to Cart
            const existingIndex = cart.findIndex(c => c.ProductID === product.ProductID);
            let newCart = [...cart];
            if (existingIndex >= 0) {
                newCart[existingIndex] = { ...newCart[existingIndex], qty: selectQty, reason: selectedReason, reasonDetail };
            } else {
                newCart.push({ ...product, qty: selectQty, reason: selectedReason, reasonDetail });
            }
            setCart(newCart);
            setQtyModal({ isOpen: false, product: null, mode: 'cart' });
            setAlertModal({ isOpen: true, type: 'success', title: 'เพิ่มลงตะกร้า', message: `เพิ่ม ${product.ProductName} ลงในตะกร้าแล้ว`, autoClose: 1500 });
        } else {
            // Quick Withdraw
            try {
                const res = await fetch(`${API_BASE}/products/withdraw`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ProductID: product.ProductID,
                        Qty: selectQty,
                        UserID: user.username,
                        RefInfo: getRefInfo()
                    })
                });
                if (res.ok) {
                    setAlertModal({ isOpen: true, type: 'success', title: 'เบิกสำเร็จ', message: `เบิก ${product.ProductName} จำนวน ${selectQty} ชิ้นเรียบร้อย` });
                    refreshData();
                } else {
                    const data = await res.json();
                    setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.message || 'เบิกไม่สำเร็จ' });
                }
            } catch (err) {
                setAlertModal({ isOpen: true, type: 'error', title: 'Connection Error', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
            }
            setQtyModal({ isOpen: false, product: null, mode: 'cart' });
        }
    };

    // Cart Managment
    const removeFromCart = (id) => setCart(cart.filter(c => c.ProductID !== id));
    const updateCartQty = (id, newQty) => {
        setCart(cart.map(c => c.ProductID === id ? { ...c, qty: Math.max(1, Math.min(c.CurrentStock, newQty)) } : c));
    };
    const getCartTotal = () => cart.reduce((sum, item) => sum + item.qty, 0);
    const isInCart = (id) => cart.some(c => c.ProductID === id);
    const clearCart = () => setCart([]);

    const executeWithdrawAll = async () => {
        if (cart.length === 0) return;
        let successCount = 0;

        for (const item of cart) {
            try {
                const res = await fetch(`${API_BASE}/products/withdraw`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ProductID: item.ProductID,
                        Qty: item.qty,
                        UserID: user.username,
                        RefInfo: getRefInfo(item.reason, item.reasonDetail)
                    })
                });
                if (res.ok) successCount++;
            } catch (err) { console.error(err); }
        }

        setCart([]);
        setIsCartOpen(false);
        refreshData();
        setAlertModal({
            isOpen: true,
            type: successCount > 0 ? 'success' : 'error',
            title: 'ผลการเบิก',
            message: `ทำรายการสำเร็จ ${successCount} รายการ`
        });
    };

    // Scan Logic
    const handleScanLookup = (code) => {
        if (!code.trim()) return;
        // Search by BarcodeID first, then Exact ProductID, then Name
        const found = products.find(p => p.BarcodeID && p.BarcodeID === code.trim()) ||
            products.find(p => String(p.ProductID) === code.trim()) ||
            products.find(p => p.ProductName.toLowerCase() === code.trim().toLowerCase());

        if (found) {
            setScanModal(prev => ({ ...prev, foundProduct: found, error: '' }));
            setScanQty(1);

            const filtered = getFilteredReasons(found);
            setReasonOptions(filtered);
            const defaultReason = filtered.length > 0 ? filtered[0].Label : 'Other';
            setScanReason(defaultReason);

            setScanReasonDetail('');
        } else {
            setScanModal(prev => ({ ...prev, foundProduct: null, error: `ไม่พบอุปกรณ์: ${code}` }));
        }
    };

    const handleScanWithdraw = async () => {
        const product = scanModal.foundProduct;
        if (!product) return;

        const refInfo = getRefInfo(scanReason, scanReasonDetail);

        try {
            const res = await fetch(`${API_BASE}/products/withdraw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ProductID: product.ProductID,
                    Qty: scanQty,
                    UserID: user.username,
                    RefInfo: refInfo
                })
            });
            if (res.ok) {
                setAlertModal({ isOpen: true, type: 'success', title: 'เบิกสำเร็จ', message: `เบิก ${product.ProductName} เรียบร้อย` });
                refreshData();
                setScanModal({ isOpen: false, scannedCode: '', foundProduct: null, error: '' });
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: 'เบิกไม่สำเร็จ' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'Connection Error', message: 'เชื่อมต่อไม่ได้' });
        }
    };

    const viewHistory = async (product) => {
        setHistoryItem(product);
        try {
            const res = await fetch(`${API_BASE}/stock/history/${product.ProductID}`);
            if (res.ok) {
                const data = await res.json();
                setHistoryData(data);
            }
        } catch (err) {
            console.error('Failed to fetch history');
        }
    };

    const [barcodeItem, setBarcodeItem] = useState(null);
    const printRef = useRef();

    const isAdmin = user?.role === 'Staff';

    const getIcon = (type) => {
        switch (type) {
            case 'Monitor': return Monitor;
            case 'Network': return Network;
            case 'Asset': return Archive;
            case 'Consumable': return Droplet;
            case 'Storage': return HardDrive;
            case 'Peripheral': return Mouse;
            case 'Office Supplies': return ClipboardList;
            case 'Office': return ClipboardList;
            default: return Package;
        }
    };





    const filteredProducts = products.filter(p =>
        p.ProductName.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (selectedType === 'all' || p.DeviceType === selectedType) &&
        (!showLowStock || (p.CurrentStock <= p.MinStock && p.MinStock > 0))
    );

    // Stats Calculations
    const totalProducts = products.length;
    const lowStockCount = products.filter(p => p.CurrentStock <= p.MinStock && p.MinStock > 0).length;
    const totalValue = products.reduce((sum, p) => sum + (p.CurrentStock * (p.LastPrice || 0)), 0);
    const typeDistribution = deviceTypes.map(t => ({
        name: t.Label,
        count: products.filter(p => p.DeviceType === t.TypeId).length
    }));

    const handleFileUpload = async (file) => {
        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                const data = await res.json();
                return data.imageUrl;
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาดการอัปโหลด (Upload Error)', message: 'เซิร์ฟเวอร์ไม่สามารถประมวลผลการอัปโหลดได้ (Server Error)' });
            }
        } catch (err) {
            console.error('Upload failed', err);
            setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาดการเชื่อมต่อ (Connection Error)', message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ (Cannot connect to server)' });
        }
        return null;
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const file = fd.get('imageFile');
        let imageUrl = editItem.ImageURL;

        if (file && file.size > 0) {
            const uploadedPath = await handleFileUpload(file);
            if (uploadedPath) imageUrl = uploadedPath;
        }

        const payload = Object.fromEntries(fd);
        payload.ImageURL = imageUrl;
        // Ensure numeric fields are properly converted
        payload.MinStock = parseInt(payload.MinStock, 10) || 0;
        payload.MaxStock = parseInt(payload.MaxStock, 10) || 0;
        payload.CurrentStock = parseInt(payload.CurrentStock, 10) || 0;
        payload.LastPrice = parseFloat(payload.LastPrice) || 0;


        try {
            const res = await fetch(`${API_BASE}/products/${editItem.ProductID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setEditItem(null);
                refreshData();
                setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ (Success)', message: 'อัปเดตข้อมูลอุปกรณ์เรียบร้อยแล้ว (Product updated successfully!)' });
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด (Error)', message: 'ไม่สามารถอัปเดตข้อมูลอุปกรณ์ได้ (Failed to update product)' });
            }
        } catch (err) {
            setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาดเครือข่าย (Network Error)', message: 'ไม่สามารถเชื่อมต่อเพื่ออัปเดตอุปกรณ์ได้ (Failed to connect to update)' });
        }
    };

    const handleDelete = (id) => {
        setAlertModal({
            isOpen: true,
            type: 'danger',
            title: 'ลบอุปกรณ์? ',
            message: 'การดำเนินการนี้ไม่สามารถย้อนกลับได้ คุณแน่ใจหรือไม่ว่าต้องการลบอุปกรณ์ชิ้นนี้? (This action cannot be undone)',
            confirmText: 'ลบ ',
            cancelText: 'ยกเลิก ',
            onConfirm: async () => {
                try {
                    await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
                    setAlertModal({ isOpen: true, type: 'success', title: 'ลบเรียบร้อย ', message: 'ลบข้อมูลอุปกรณ์ออกจากระบบแล้ว (Product deleted successfully)', onConfirm: () => setAlertModal(prev => ({ ...prev, isOpen: false })) });
                    refreshData();
                } catch (err) {
                    setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด ', message: 'ไม่สามารถลบข้อมูลอุปกรณ์ได้ (Failed to delete product)' });
                }
            },
            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    return (
        <div className="space-y-6">
            {/* Tab Switcher */}
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
                <button
                    onClick={() => setActiveTab('inventory')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'inventory'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                        }`}
                >
                    <Package size={18} /> คลังสินค้า
                </button>
                <button
                    onClick={() => setActiveTab('stockcount')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'stockcount'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                        }`}
                >
                    <ClipboardList size={18} /> ตรวจนับสต็อก
                </button>
            </div>

            {/* StockCount Tab */}
            {activeTab === 'stockcount' && <StockCountPage />}

            {/* Inventory Tab */}
            {activeTab === 'inventory' && (<>
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard
                        icon={Package}
                        title="อุปกรณ์ทั้งหมด "
                        value={totalProducts.toLocaleString()}
                        color="from-blue-500 to-blue-600"
                    />
                    <StatCard
                        icon={DollarSign}
                        title="มูลค่าสต็อค"
                        value={`฿${(totalValue / 1000).toFixed(1)}K`}
                        color="from-purple-500 to-purple-600"
                    />
                    <StatCard
                        icon={AlertTriangle}
                        title="สต็อกต่ำ "
                        value={lowStockCount}
                        changeType={lowStockCount > 0 ? 'down' : 'up'}
                        color="from-orange-500 to-orange-600"
                    />
                    <StatCard
                        icon={LayoutGrid}
                        title="หมวดหมู่ "
                        value={deviceTypes.length}
                        color="from-pink-500 to-pink-600"
                    />
                </div>

                {/* Header Controls */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-3xl font-black mb-1 text-slate-800">INVENTORY</h2>
                        <p className="text-slate-500 font-medium">จัดการและตรวจสอบสถานะอุปกรณ์</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Cart & Scan Buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { setSelectedReason('New Withdrawal'); setReasonDetail(''); setIsCartOpen(true); }}
                                className="relative bg-white hover:bg-indigo-50 text-indigo-600 border border-slate-200 font-bold px-3 py-2 rounded-xl transition-all shadow-sm flex items-center gap-2"
                            >
                                <ShoppingCart size={18} />
                                <span className="hidden sm:inline">ตะกร้า</span>
                                {cart.length > 0 && (
                                    <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                                        {getCartTotal()}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setScanModal({ isOpen: true, scannedCode: '', foundProduct: null, error: '' })}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-3 py-2 rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center gap-2"
                            >
                                <ScanLine size={18} />
                                <span className="hidden sm:inline">สแกนเบิก</span>
                            </button>
                        </div>

                        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                            >
                                <List size={18} />
                            </button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                            >
                                <LayoutGrid size={18} />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="flex gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                            <Search size={18} className="text-slate-400 self-center" />
                            <input
                                type="text"
                                placeholder="ค้นหาอุปกรณ์..."
                                className="bg-transparent border-none outline-none text-sm w-32 sm:w-48 text-slate-700 placeholder-slate-400"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Filters */}
                        <select
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 outline-none cursor-pointer"
                        >
                            <option value="all">ทุกประเภท</option>
                            {deviceTypes.map(t => <option key={t.TypeId} value={t.TypeId}>{t.Label}</option>)}
                        </select>

                        <button
                            onClick={() => setShowLowStock(!showLowStock)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all font-bold text-sm ${showLowStock
                                ? 'bg-red-50 text-red-600 border-red-200 shadow-sm ring-2 ring-red-100'
                                : 'bg-white text-slate-500 border-slate-200 hover:text-red-500 hover:border-red-200'
                                }`}
                        >
                            <AlertTriangle size={16} className={showLowStock ? "fill-current" : ""} />
                            <span>สต็อกต่ำ</span>
                        </button>
                    </div>
                </motion.div>

                {/* LIST VIEW */}
                {viewMode === 'list' && (
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-lg overflow-x-auto"
                    >
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 uppercase text-[12px] tracking-widest border-b border-slate-200">
                                <tr>
                                    <th className="p-4 pl-6">รายการ </th>
                                    <th className="p-4">หมวดหมู่ </th>
                                    <th className="p-4">ราคาต่อหน่วย </th>
                                    <th className="p-4 text-center">คงเหลือ</th>
                                    <th className="p-4 text-center">ขั้นต่ำ </th>
                                    <th className="p-4">ที่เก็บ </th>
                                    <th className="p-4">สถานะ </th>
                                    <th className="p-4 text-center">เบิกจ่าย </th>
                                    <th className="p-4 text-center">ประวัติอุปกรณ์ </th>
                                    {isAdmin && <th className="p-4 text-center">จัดการ </th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredProducts.map((p, idx) => {
                                    const Icon = getIcon(p.DeviceType);
                                    const inCart = isInCart(p.ProductID);
                                    return (
                                        <motion.tr
                                            key={p.ProductID}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                            className={`hover:bg-slate-50 transition-colors ${inCart ? 'bg-indigo-50/30' : ''}`}
                                        >
                                            <td className="p-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getColorGradient(p.DeviceType)} flex items-center justify-center overflow-hidden shrink-0 shadow-md`}>
                                                        {p.ImageURL ? (
                                                            <img src={`${API_URL}${p.ImageURL}`} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Icon size={18} className="text-white" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-slate-700 block truncate max-w-[200px]">{p.ProductName}</span>
                                                        {inCart && <span className="text-[10px] text-indigo-600 font-bold bg-indigo-100 px-1.5 rounded-sm">ในตะกร้า</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="flex items-center w-fit gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm text-white" style={{ backgroundColor: getChartColor(p.DeviceType) }}>
                                                    {p.DeviceType}
                                                </span>
                                            </td>
                                            <td className="p-4 text-slate-500 font-mono">฿{p.LastPrice?.toLocaleString()}</td>
                                            <td className={`p-4 text-center font-mono font-bold text-lg ${p.CurrentStock <= p.MinStock && p.MinStock > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                {p.CurrentStock}
                                            </td>
                                            <td className="p-4 text-center text-slate-400 font-mono">{p.MinStock}</td>
                                            <td className="p-4 text-slate-500 font-medium text-xs">{p.Location || '-'}</td>
                                            <td className="p-4">
                                                {p.CurrentStock <= p.MinStock && p.MinStock > 0 ?
                                                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-100 flex items-center gap-1 w-fit">
                                                        <AlertTriangle size={12} /> ต่ำ                                                 </span> :
                                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">ปกติ </span>
                                                }
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-1">
                                                    <button
                                                        onClick={() => openCartModal(p)}
                                                        disabled={p.CurrentStock <= 0}
                                                        className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg disabled:opacity-30"
                                                        title="เพิ่มลงตะกร้า"
                                                    >
                                                        <ShoppingCart size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => openWithdrawModal(p)}
                                                        disabled={p.CurrentStock <= 0}
                                                        className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg disabled:opacity-30"
                                                        title="เบิกด่วน"
                                                    >
                                                        <ShoppingBag size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-1">
                                                    <button onClick={() => viewHistory(p)} className="text-slate-400 hover:text-indigo-600 transition-colors p-1.5 hover:bg-indigo-50 rounded-lg" title="ดูประวัติ (History)">
                                                        <Search size={16} />
                                                    </button>
                                                    <button onClick={() => setDetailItem(p)} className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-lg" title="ดูรายละเอียด (Detail)">
                                                        <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center font-bold text-[10px]">i</div>
                                                    </button>
                                                    <button onClick={() => setBarcodeItem(p)} className="text-slate-400 hover:text-emerald-600 transition-colors p-1.5 hover:bg-emerald-50 rounded-lg" title="พิมพ์บาร์โค้ด (Print Barcode)">
                                                        <Printer size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                            {isAdmin && (
                                                <td className="p-4">
                                                    <div className="flex justify-center gap-2">
                                                        <button
                                                            onClick={() => setEditItem(p)}
                                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(p.ProductID)}
                                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {filteredProducts.length === 0 && (
                            <div className="text-center py-10 text-slate-400">ไม่พบอุปกรณ์</div>
                        )}
                    </motion.div>
                )}

                {/* GRID VIEW */}
                {viewMode === 'grid' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {filteredProducts.map((p, idx) => {
                            const inCart = isInCart(p.ProductID);
                            return (
                                <motion.div
                                    key={p.ProductID}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.03 }}
                                    className={`group bg-white rounded-2xl border p-3 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden ${inCart ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-100'}`}
                                >
                                    {/* Decorative Gradient Background */}
                                    <div className={`absolute top-0 left-0 w-full h-20 bg-gradient-to-br ${getColorGradient(p.DeviceType)} opacity-10 z-0`}></div>

                                    {/* Actions Overlay - Always visible on mobile, hover on desktop */}
                                    <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => viewHistory(p)} className="p-1.5 bg-white/90 backdrop-blur text-indigo-600 rounded-full shadow-sm hover:bg-indigo-50" title="ดูประวัติ (History)"><List size={14} /></button>
                                        <button onClick={() => setDetailItem(p)} className="p-1.5 bg-white/90 backdrop-blur text-blue-600 rounded-full shadow-sm hover:bg-blue-50" title="ดูรายละเอียด (Detail)"><div className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center font-bold text-[9px]">i</div></button>
                                        <button onClick={() => setBarcodeItem(p)} className="p-1.5 bg-white/90 backdrop-blur text-emerald-600 rounded-full shadow-sm hover:bg-emerald-50" title="พิมพ์บาร์โค้ด (Print Barcode)"><Printer size={14} /></button>
                                        {isAdmin && (
                                            <>
                                                <button onClick={() => setEditItem(p)} className="p-1.5 bg-white/90 backdrop-blur text-amber-500 rounded-full shadow-sm hover:bg-amber-50"><Edit2 size={14} /></button>
                                                <button onClick={() => handleDelete(p.ProductID)} className="p-1.5 bg-white/90 backdrop-blur text-red-500 rounded-full shadow-sm hover:bg-red-50"><Trash2 size={14} /></button>
                                            </>
                                        )}
                                    </div>

                                    <div className="relative z-10 flex flex-col items-center text-center">
                                        {/* Larger Image */}
                                        <div className={`w-28 h-28 mb-3 rounded-xl overflow-hidden shadow-lg flex items-center justify-center border-2 border-white group-hover:scale-105 transition-transform bg-gradient-to-br ${getColorGradient(p.DeviceType)}`}>
                                            {p.ImageURL ? (
                                                <img src={`${API_URL}${p.ImageURL}`} alt={p.ProductName} className="w-full h-full object-cover" />
                                            ) : (
                                                React.createElement(getIcon(p.DeviceType), { size: 40, className: 'text-white' })
                                            )}
                                        </div>

                                        <h3 className="font-bold text-slate-800 text-sm mb-1 line-clamp-2 min-h-[2.5rem]">{p.ProductName}</h3>
                                        {inCart && <span className="text-[10px] text-indigo-600 font-bold bg-indigo-100 px-1.5 py-0.5 rounded-sm mb-1">ในตะกร้า</span>}
                                        <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full mb-2 shadow-sm text-white" style={{ backgroundColor: getChartColor(p.DeviceType) }}>{p.DeviceType}</span>

                                        <div className="grid grid-cols-2 gap-2 w-full pt-2 border-t border-slate-100 mb-2">
                                            <div>
                                                <p className="text-[12px] text-slate-700 font-bold uppercase">คงเหลือ </p>
                                                <p className={`text-lg font-black ${p.CurrentStock <= p.MinStock && p.MinStock > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                    {p.CurrentStock}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[12px] text-slate-700 font-bold uppercase">ราคา </p>
                                                <p className="text-lg font-black text-slate-700">฿{p.LastPrice?.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div className="w-full mb-3 px-1">
                                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg p-2">
                                                <div className="p-1.5 bg-white rounded-md shadow-sm text-indigo-500">
                                                    <Archive size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] text-slate-700 font-bold uppercase leading-none mb-0.5">ที่เก็บ</p>
                                                    <p className="text-xs font-bold text-slate-700 truncate">{p.Location || 'Not Assigned'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex w-full gap-1">
                                            <button
                                                onClick={() => openCartModal(p)}
                                                disabled={p.CurrentStock <= 0}
                                                className="flex-1 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 disabled:opacity-50"
                                            >
                                                ใส่ตะกร้า
                                            </button>
                                            <button
                                                onClick={() => openWithdrawModal(p)}
                                                disabled={p.CurrentStock <= 0}
                                                className="flex-1 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 disabled:opacity-50"
                                            >
                                                เบิกด่วน
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )
                }

                {/* HISTORY MODAL */}
                {
                    historyItem && (
                        <Portal>
                            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden"
                                >
                                    <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                        <div className="flex justify-between items-start relative z-10">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1 opacity-90">
                                                    <List size={16} />
                                                    <span className="text-xs font-bold uppercase tracking-wider">ประวัติอุปกรณ์</span>
                                                </div>
                                                <h3 className="font-black text-lg md:text-xl tracking-tight">{historyItem.ProductName}</h3>
                                                <p className="text-indigo-100 text-xs font-medium mt-1 font-mono opacity-80">{historyItem.ProductID}</p>
                                            </div>
                                            <button onClick={() => setHistoryItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                                <X size={20} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4 md:p-5 bg-slate-50/50 max-h-[60vh] overflow-y-auto">
                                        {/* 1. ตรวจสอบว่ามี overflow-x-auto และใส่ min-w-max เพื่อให้ตารางกว้างตามเนื้อหา */}
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                                            <table className="w-full text-left text-xs table-auto min-w-max">
                                                <thead className="bg-slate-50 border-b border-slate-100 uppercase text-xs font-bold text-slate-500 tracking-wider">
                                                    <tr>
                                                        {/* 2. ใส่ whitespace-nowrap ให้หัวตารางทุกตัวเพื่อความเป๊ะ */}
                                                        <th className="p-4 whitespace-nowrap">วันที่</th>
                                                        <th className="p-4 text-center whitespace-nowrap">จำนวน</th>
                                                        <th className="p-4 whitespace-nowrap">เหตุผล</th>
                                                        <th className="p-4 whitespace-nowrap">Budget No.</th>
                                                        <th className="p-4 whitespace-nowrap">User</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {historyData.map((h, i) => (
                                                        <motion.tr
                                                            key={i}
                                                            initial={{ opacity: 0, x: -10 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: i * 0.05 }}
                                                            className="hover:bg-slate-50/50 transition-colors"
                                                        >
                                                            <td className="p-4 text-slate-600 font-medium whitespace-nowrap">
                                                                {formatThaiDate(h.TransDate)}
                                                            </td>
                                                            <td className={`p-4 text-center font-bold font-mono whitespace-nowrap ${(h.TransType || '').toUpperCase().trim() === 'IN' || (h.RefInfo || '').toLowerCase().includes('invoice') ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                {(h.TransType || '').toUpperCase().trim() === 'IN' || (h.RefInfo || '').toLowerCase().includes('invoice') ? '+' : '-'}{Math.abs(h.Qty)}
                                                            </td>

                                                            {/* 3. ลบ truncate และ max-w ออก แล้วใส่ whitespace-nowrap แทน */}
                                                            <td className="p-4 text-indigo-600 font-medium whitespace-nowrap">
                                                                {h.RefInfo}
                                                            </td>
                                                            <td className="p-4 text-slate-500 font-mono text-xs whitespace-nowrap">
                                                                {h.BudgetNo || '-'}
                                                            </td>
                                                            <td className="p-4 text-xs text-slate-400 whitespace-nowrap">
                                                                {h.UserID}
                                                            </td>
                                                        </motion.tr>
                                                    ))}
                                                    {historyData.length === 0 && (
                                                        <tr>
                                                            <td colSpan="5" className="p-8 text-center text-slate-400">
                                                                ไม่มีประวัติ
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100">
                                        <button onClick={() => setHistoryItem(null)} className="w-full bg-slate-100 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-200 transition-all">
                                            ปิดหน้าต่าง
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        </Portal>
                    )
                }

                {/* EDIT MODAL */}
                {
                    editItem && (
                        <Portal>
                            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden"
                                >
                                    <div className="p-4 md:p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                        <div className="flex justify-between items-start relative z-10">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1 opacity-90">
                                                    <Edit2 size={16} />
                                                    <span className="text-xs font-bold uppercase tracking-wider">แก้ไขอุปกรณ์</span>
                                                </div>
                                                <h3 className="font-black text-lg md:text-xl tracking-tight">{editItem.ProductName}</h3>
                                                <p className="text-indigo-100 text-xs font-medium mt-1 font-mono opacity-80">{editItem.ProductID}</p>
                                            </div>
                                            <button onClick={() => setEditItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                                <X size={20} />
                                            </button>
                                        </div>
                                    </div>
                                    <form onSubmit={handleUpdate} className="flex flex-col h-full">
                                        <div className="p-4 md:p-5 bg-slate-50/50 space-y-4 max-h-[60vh] overflow-y-auto">
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-bold text-slate-700 mb-2">ชื่ออุปกรณ์</label>
                                                    <input name="ProductName" defaultValue={editItem.ProductName} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700" required />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-slate-700 mb-2">รูปอุปกรณ์</label>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${getColorGradient(editItem.DeviceType)} flex items-center justify-center overflow-hidden shadow-md ring-2 ring-white ring-offset-2`}>
                                                            {editItem.ImageURL ? (
                                                                <img src={`${API_URL}${editItem.ImageURL}`} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Package className="text-white" size={24} />
                                                            )}
                                                        </div>
                                                        <div className="flex-1">
                                                            <input type="file" name="imageFile" accept="image/*" className="block w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer transition-all" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-bold text-slate-700 mb-2">หมวดหมู่</label>
                                                        <select name="DeviceType" defaultValue={editItem.DeviceType} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700">
                                                            {deviceTypes.map(t => <option key={t.TypeId} value={t.TypeId}>{t.Label}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-bold text-slate-700 mb-2">ราคาต่อหน่วย</label>
                                                        <div className="relative">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">฿</span>
                                                            <input name="LastPrice" type="number" step="0.01" defaultValue={editItem.LastPrice} className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono font-medium text-slate-700" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-bold text-slate-700 mb-2">คงเหลือ</label>
                                                        <input name="CurrentStock" type="number" defaultValue={editItem.CurrentStock} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono font-medium text-slate-700" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-bold text-slate-700 mb-2">สต็อคขั้นต่ำ</label>
                                                        <input name="MinStock" type="number" defaultValue={editItem.MinStock} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono font-medium text-slate-700" />
                                                    </div>
                                                    <div className="col-span-1">
                                                        <label className="block text-sm font-bold text-slate-700 mb-2">สต็อคสูงสุด</label>
                                                        <input name="MaxStock" type="number" defaultValue={editItem.MaxStock || 0} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono font-medium text-slate-700" />
                                                    </div>
                                                    <div className="col-span-1">
                                                        <label className="block text-sm font-bold text-slate-700 mb-2">ที่เก็บ</label>
                                                        <div className="relative">
                                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                                                <Archive size={18} />
                                                            </div>
                                                            <select
                                                                name="Location"
                                                                defaultValue={editItem.Location || ''}
                                                                className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-slate-700 appearance-none"
                                                            >
                                                                <option value="">-- ระบุตำแหน่ง --</option>
                                                                {locations.map(loc => (
                                                                    <option key={loc.LocationID} value={loc.Name}>{loc.Name}</option>
                                                                ))}
                                                            </select>
                                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="block text-sm font-bold text-slate-700 mb-2">บาร์โค้ดจริง (Barcode ID)</label>
                                                        <div className="relative">
                                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                                                <ScanLine size={18} />
                                                            </div>
                                                            <input
                                                                name="BarcodeID"
                                                                defaultValue={editItem.BarcodeID || ''}
                                                                placeholder="สแกนหรือพิมพ์เลขบาร์โค้ดจริงของอุปกรณ์"
                                                                className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono font-medium text-slate-700"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setEditItem(null)}
                                                className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-all"
                                            >
                                                ยกเลิก
                                            </button>
                                            <button
                                                type="submit"
                                                className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2 text-sm rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-indigo-200"
                                            >
                                                บันทึกการแก้ไข
                                            </button>
                                        </div>
                                    </form>
                                </motion.div>
                            </div>
                        </Portal>
                    )
                }



                {/* BARCODE PRINT MODAL */}
                {
                    barcodeItem && (
                        <Portal>
                            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/20"
                                >
                                    <div className="p-4 md:p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden print:hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                        <div className="flex justify-between items-start relative z-10">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1 opacity-90">
                                                    <Printer size={16} />
                                                    <span className="text-sm font-bold uppercase tracking-wider">พิมพ์บาร์โค้ด (Print Barcode)</span>
                                                </div>
                                                <h3 className="font-black text-lg tracking-tight">{barcodeItem.ProductName}</h3>
                                                <p className="text-indigo-100 text-xs font-medium mt-1 font-mono opacity-80">{barcodeItem.ProductID}</p>
                                            </div>
                                            <button onClick={() => setBarcodeItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                                <X size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-5 bg-slate-50/50 flex flex-col items-center gap-4">
                                        <div ref={printRef} className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center gap-3 w-full shadow-sm" id="barcode-print-area">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">IT INVENTORY</p>
                                            <h4 className="text-sm font-bold text-slate-800 text-center leading-tight mb-2">{barcodeItem.ProductName}</h4>
                                            <Barcode
                                                value={barcodeItem.ProductID}
                                                width={1.5}
                                                height={50}
                                                fontSize={12}
                                                margin={0}
                                                displayValue={true}
                                            />
                                            <div className="flex gap-4 text-[10px] text-slate-400 font-medium mt-2 uppercase tracking-wide">
                                                <span>Type: {barcodeItem.DeviceType}</span>
                                                <span>Min: {barcodeItem.MinStock}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white border-t border-slate-100 flex gap-3 print:hidden">
                                        <button
                                            onClick={() => setBarcodeItem(null)}
                                            className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-all"
                                        >
                                            ปิด
                                        </button>
                                        <button
                                            onClick={() => {
                                                const printContents = document.getElementById('barcode-print-area').innerHTML;
                                                const win = window.open('', '_blank', 'width=400,height=300');
                                                win.document.write(`
                                                <html><head><title>Barcode - ${barcodeItem.ProductName}</title>
                                                <style>
                                                    body { font-family: 'Segoe UI', Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                                                    .label { border: 2px dashed #e2e8f0; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
                                                    .title { font-size: 10px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; }
                                                    .name { font-size: 14px; font-weight: bold; color: #1e293b; text-align: center; }
                                                    .meta { font-size: 9px; color: #94a3b8; display: flex; gap: 16px; }
                                                    @media print { body { margin: 0; } .label { border: none; } }
                                                </style></head><body>
                                                <div class="label">${printContents}</div>
                                                </body></html>
                                            `);
                                                win.document.close();
                                                win.focus();
                                                win.print();
                                            }}
                                            className="flex-1 bg-emerald-600 text-white font-bold py-2 text-sm rounded-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Printer size={16} /> พิมพ์
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        </Portal>
                    )
                }


                {/* DETAIL MODAL (Read-Only) */}
                {
                    detailItem && (
                        <Portal>
                            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/20"
                                >
                                    <div className="relative h-40 bg-slate-900 overflow-hidden">
                                        <div className={`absolute inset-0 bg-gradient-to-br ${getColorGradient(detailItem.DeviceType)} opacity-90`}></div>
                                        <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>

                                        <div className="absolute inset-0 flex flex-col justify-end p-8">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-xs font-bold text-white border border-white/30 shadow-sm flex items-center gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                                                    {detailItem.DeviceType}
                                                </span>
                                                {detailItem.CurrentStock <= detailItem.MinStock && (
                                                    <span className="px-3 py-1 bg-red-500/80 backdrop-blur rounded-full text-xs font-bold text-white border border-red-400 shadow-sm flex items-center gap-1.5">
                                                        <AlertTriangle size={12} /> Low Stock
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="font-black text-3xl text-white tracking-tight leading-tight shadow-sm">{detailItem.ProductName}</h3>
                                            <p className="text-white/80 font-mono text-sm mt-1 flex items-center gap-2">
                                                <span className="opacity-60">ID:</span> {detailItem.ProductID}
                                            </p>
                                        </div>

                                        <button onClick={() => setDetailItem(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 backdrop-blur rounded-full text-white transition-all">
                                            <X size={18} />
                                        </button>
                                    </div>

                                    <div className="p-6 bg-slate-50/50 max-h-[60vh] overflow-y-auto">
                                        <div className="flex flex-col md:flex-row gap-6">
                                            {/* Left Column: Image */}
                                            <div className="w-full md:w-1/3 flex flex-col gap-4">
                                                <div className={`aspect-square rounded-2xl bg-white p-2 shadow-md border border-slate-100 flex items-center justify-center overflow-hidden`}>
                                                    {detailItem.ImageURL ? (
                                                        <img src={`${API_URL}${detailItem.ImageURL}`} alt="" className="w-full h-full object-cover rounded-xl" />
                                                    ) : (
                                                        <div className={`w-full h-full rounded-xl bg-gradient-to-br ${getColorGradient(detailItem.DeviceType)} flex items-center justify-center opacity-20`}>
                                                            <Package className="text-slate-900 w-16 h-16 opacity-50" />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
                                                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">ราคาต่อหน่วย</p>
                                                    <p className="text-2xl font-black text-slate-700">฿{detailItem.LastPrice?.toLocaleString()}</p>
                                                </div>
                                            </div>

                                            {/* Right Column: Details Grid */}
                                            <div className="w-full md:w-2/3 space-y-4">
                                                {/* Stock Status Section */}
                                                <div className="bg-white rounded-2xl overflow-hidden divide-y divide-slate-100 border border-slate-100 shadow-sm">
                                                    <div className="flex items-center p-3 sm:px-4">
                                                        <span className="text-xs text-slate-500 font-bold uppercase w-48 shrink-0 flex items-center gap-2">
                                                            <Archive size={14} className={getDeviceTypeColor(detailItem.DeviceType).text} /> คงเหลือ
                                                        </span>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className={`text-sm font-black ${detailItem.CurrentStock <= detailItem.MinStock ? 'text-red-500' : 'text-emerald-500'}`}>
                                                                {detailItem.CurrentStock}
                                                            </span>
                                                            <span className="text-xs font-bold text-slate-400">{detailItem.UnitOfMeasure || 'หน่วย'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center p-3 sm:px-4">
                                                        <span className="text-xs text-slate-500 font-bold uppercase w-48 shrink-0 flex items-center gap-2">
                                                            <AlertTriangle size={14} className="text-orange-500" /> ขั้นต่ำ
                                                        </span>
                                                        <span className="text-sm font-black text-orange-500">{detailItem.MinStock}</span>
                                                    </div>
                                                    <div className="flex items-center p-3 sm:px-4">
                                                        <span className="text-xs text-slate-500 font-bold uppercase w-48 shrink-0 flex items-center gap-2">
                                                            <Truck size={14} className="text-slate-400" /> สูงสุด
                                                        </span>
                                                        <span className="text-sm font-black text-slate-600">{detailItem.MaxStock || '-'}</span>
                                                    </div>
                                                    <div className="flex items-center p-3 sm:px-4">
                                                        <span className="text-xs text-slate-500 font-bold uppercase w-48 shrink-0 flex items-center gap-2">
                                                            <Settings size={14} className="text-slate-400" /> หน่วยนับ
                                                        </span>
                                                        <span className="text-sm font-bold text-slate-700">{detailItem.UnitOfMeasure || '-'}</span>
                                                    </div>
                                                    <div className="flex items-center p-3 sm:px-4">
                                                        <span className="text-xs text-slate-500 font-bold uppercase w-48 shrink-0 flex items-center gap-2">
                                                            <Truck size={14} className={getDeviceTypeColor(detailItem.DeviceType).text} /> จัดเก็บ
                                                        </span>
                                                        <span className="text-sm font-bold text-slate-700">{detailItem.Location || 'ไม่ได้ระบุ (Not Assigned)'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white border-t border-slate-100 bg-slate-50/50">
                                        <button
                                            onClick={() => setDetailItem(null)}
                                            className="w-full bg-slate-200 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-300 hover:text-slate-800 transition-all shadow-sm"
                                        >
                                            ปิดหน้าต่าง
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        </Portal>
                    )
                }

                {/* ALERT MODAL */}
                <AlertModal
                    isOpen={alertModal.isOpen}
                    type={alertModal.type}
                    title={alertModal.title}
                    message={alertModal.message}
                    onConfirm={alertModal.onConfirm || (() => setAlertModal(prev => ({ ...prev, isOpen: false })))}
                    onCancel={alertModal.onCancel}
                    confirmText={alertModal.confirmText || "ปิด"}
                    cancelText={alertModal.cancelText || "ยกเลิก"}
                />


                {/* QTY & REASON MODAL */}
                <AnimatePresence>
                    {qtyModal.isOpen && qtyModal.product && (
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
                            >
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                    className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                                >
                                    <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                                        <h3 className="font-bold flex items-center gap-2">
                                            {qtyModal.mode === 'cart' ? <ShoppingCart size={18} /> : <ShoppingBag size={18} />}
                                            {qtyModal.mode === 'cart' ? 'เพิ่มลงตะกร้า' : 'เบิกด่วน'}
                                        </h3>
                                        <button onClick={() => setQtyModal({ isOpen: false, product: null, mode: 'cart' })} className="p-1 hover:bg-white/20 rounded-full">
                                            <X size={18} />
                                        </button>
                                    </div>
                                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex gap-3">
                                        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getColorGradient(qtyModal.product.DeviceType)} flex items-center justify-center overflow-hidden`}>
                                            {qtyModal.product.ImageURL ? (
                                                <img src={`${API_URL}${qtyModal.product.ImageURL}`} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <Package size={20} className="text-white" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-slate-800 line-clamp-1">{qtyModal.product.ProductName}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full shadow-sm" style={{ backgroundColor: getChartColor(qtyModal.product.DeviceType) }}>
                                                    {qtyModal.product.DeviceType}
                                                </span>
                                                <p className="text-xs text-slate-500">คงเหลือ: <span className="font-bold text-emerald-600">{qtyModal.product.CurrentStock}</span></p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 overflow-y-auto space-y-5">
                                        {/* Qty Selector */}
                                        <div className="flex items-center gap-4 justify-center">
                                            <button onClick={() => setSelectQty(Math.max(1, selectQty - 1))} className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 shadow-sm"><Minus size={16} /></button>
                                            <div className="text-center">
                                                <input
                                                    type="number"
                                                    value={selectQty}
                                                    onChange={(e) => setSelectQty(Math.max(1, Math.min(qtyModal.product.CurrentStock, parseInt(e.target.value) || 1)))}
                                                    className="w-16 text-center text-xl font-black bg-transparent outline-none"
                                                />
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">จำนวน</p>
                                            </div>
                                            <button onClick={() => setSelectQty(Math.min(qtyModal.product.CurrentStock, selectQty + 1))} className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 shadow-sm"><Plus size={16} /></button>
                                        </div>

                                        {/* Reason Selector */}
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">เหตุผลการเบิก</label>
                                            <div className="space-y-2">
                                                {reasonOptions.map((opt) => (
                                                    <label key={opt.ReasonID} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all ${selectedReason === opt.Label ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-200'}`}>
                                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedReason === opt.Label ? 'border-indigo-500' : 'border-slate-300'}`}>
                                                            {selectedReason === opt.Label && <div className="w-2 h-2 bg-indigo-500 rounded-full" />}
                                                        </div>
                                                        <input type="radio" name="reason" value={opt.Label} checked={selectedReason === opt.Label} onChange={(e) => setSelectedReason(e.target.value)} className="hidden" />
                                                        <span className={`text-sm font-medium ${selectedReason === opt.Label ? 'text-indigo-700' : 'text-slate-600'}`}>{opt.Label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="pt-2">
                                                <div className="flex items-center gap-2 mb-1.5 opacity-70">
                                                    <FileEdit size={12} />
                                                    <span className="text-xs font-bold">รายละเอียดเพิ่มเติม (Optional)</span>
                                                </div>
                                                <textarea
                                                    value={reasonDetail}
                                                    onChange={(e) => setReasonDetail(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none resize-none h-20"
                                                    placeholder="เช่น ระบุชื่อโปรเจกต์ หรือหมายเลขแจ้งซ่อม..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3">
                                        <button onClick={() => setQtyModal({ isOpen: false, product: null, mode: 'cart' })} className="py-2 text-sm rounded-lg border border-slate-200 bg-white font-bold text-slate-500 hover:bg-slate-100 transition-all">ยกเลิก</button>
                                        <button onClick={handleQtyConfirm} className={`py-2 text-sm rounded-lg font-bold text-white shadow-md transition-all ${qtyModal.mode === 'cart' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                                            {qtyModal.mode === 'cart' ? 'ยืนยัน' : 'เบิกเลย'}
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        </Portal>
                    )}
                </AnimatePresence>

                {/* CART DRAWER */}
                <AnimatePresence>
                    {isCartOpen && (
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm"
                                onClick={() => setIsCartOpen(false)}
                            >
                                <motion.div
                                    initial={{ x: '100%' }}
                                    animate={{ x: 0 }}
                                    exit={{ x: '100%' }}
                                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                    className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="p-4 bg-indigo-600 text-white flex justify-between items-center shadow-md z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-white/20 p-2 rounded-lg"><ShoppingCart size={18} /></div>
                                            <div>
                                                <h3 className="font-bold text-base">รายการเบิก</h3>
                                                <p className="text-indigo-200 text-xs">{cart.length} รายการ</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {cart.length > 0 && (
                                                <button onClick={clearCart} className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-all mr-2">
                                                    <Trash2 size={14} /> ล้างตะกร้า
                                                </button>
                                            )}
                                            <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                                        {cart.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                                                <ShoppingCart size={48} className="mb-2" />
                                                <p className="font-bold">ตะกร้าว่างเปล่า</p>
                                            </div>
                                        ) : (
                                            cart.map(item => (
                                                <div key={item.ProductID} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group">
                                                    <button onClick={() => removeFromCart(item.ProductID)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 p-1"><X size={16} /></button>
                                                    <div className="flex gap-3 mb-3">
                                                        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getColorGradient(item.DeviceType)} flex items-center justify-center shrink-0 overflow-hidden`}>
                                                            {item.ImageURL ? <img src={`${API_URL}${item.ImageURL}`} alt="" className="w-full h-full object-cover" /> : <Package size={18} className="text-white" />}
                                                        </div>
                                                        <div className="pr-6">
                                                            <h4 className="font-bold text-slate-800 text-sm line-clamp-1">{item.ProductName}</h4>
                                                            <p className="text-xs text-slate-400 font-mono mb-1">{item.ProductID}</p>
                                                            <div className="inline-flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded text-[10px] font-bold text-indigo-600 border border-indigo-100">
                                                                <span>{item.reason}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                                        <div className="text-xs text-slate-400">คงเหลือ: {item.CurrentStock}</div>
                                                        <div className="flex items-center gap-3 bg-slate-100 rounded-lg p-1">
                                                            <button onClick={() => updateCartQty(item.ProductID, item.qty - 1)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-indigo-600"><Minus size={14} /></button>
                                                            <span className="font-bold text-sm w-4 text-center">{item.qty}</span>
                                                            <button onClick={() => updateCartQty(item.ProductID, item.qty + 1)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-indigo-600"><Plus size={14} /></button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {cart.length > 0 && (
                                        <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 space-y-3">
                                            <div className="flex justify-between items-end">
                                                <span className="text-slate-500 font-bold text-sm">รวมจำนวน</span>
                                                <span className="text-2xl font-black text-indigo-600">{getCartTotal()} <span className="text-sm text-slate-400 font-medium">ชิ้น</span></span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-3">
                                                <button onClick={() => setIsCartOpen(false)} className="col-span-1 py-2 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all border border-slate-200">
                                                    ยกเลิก
                                                </button>
                                                <button onClick={executeWithdrawAll} className="col-span-2 bg-indigo-600 text-white font-bold py-2 rounded-lg text-sm hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2">
                                                    <Check size={16} /> ยืนยันการเบิก
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            </motion.div>
                        </Portal>
                    )}
                </AnimatePresence>

                {/* SCAN MODAL */}
                <AnimatePresence>
                    {scanModal.isOpen && (
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[80] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4"
                                onClick={() => setScanModal({ isOpen: false, scannedCode: '', foundProduct: null, error: '' })}
                            >
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl relative"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <button onClick={() => setScanModal({ isOpen: false, scannedCode: '', foundProduct: null, error: '' })} className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full z-10"><X size={20} /></button>

                                    {!scanModal.foundProduct ? (
                                        <div className="p-6 flex flex-col items-center text-center">
                                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-5 animate-pulse">
                                                <ScanLine size={32} />
                                            </div>
                                            <h3 className="text-xl font-black text-slate-800 mb-2">สแกนอุปกรณ์</h3>
                                            <p className="text-slate-500 mb-5 text-sm">ยิงบาร์โค้ด หรือพิมพ์รหัส/ชื่ออุปกรณ์เพื่อค้นหา</p>

                                            <div className="w-full relative">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    className="w-full bg-slate-100 border-2 border-slate-200 rounded-xl px-4 py-3 text-center font-bold focus:border-emerald-500 focus:bg-white outline-none transition-all"
                                                    placeholder="Ready to Scan..."
                                                    value={scanModal.scannedCode}
                                                    onChange={e => setScanModal(prev => ({ ...prev, scannedCode: e.target.value, error: '' }))}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleScanLookup(scanModal.scannedCode); }}
                                                />
                                                <button onClick={() => handleScanLookup(scanModal.scannedCode)} className="absolute right-2 top-2 bottom-2 bg-emerald-500 text-white px-3 py-1 rounded-lg font-bold hover:bg-emerald-600 text-sm">Enter</button>
                                            </div>
                                            {scanModal.error && <p className="text-red-500 font-bold mt-4 flex items-center gap-2 animate-bounce"><AlertTriangle size={16} /> {scanModal.error}</p>}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50">
                                            <div className="p-5 bg-white rounded-b-2xl shadow-sm z-10 relative">
                                                <div className="flex gap-4">
                                                    <div className={`w-20 h-20 rounded-xl bg-gradient-to-br ${getColorGradient(scanModal.foundProduct.DeviceType)} flex items-center justify-center shadow-md overflow-hidden border-2 border-white`}>
                                                        {scanModal.foundProduct.ImageURL ? (
                                                            <img src={`${API_URL}${scanModal.foundProduct.ImageURL}`} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Package size={28} className="text-white" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-start">
                                                            <h3 className="font-black text-lg text-slate-800 line-clamp-2">{scanModal.foundProduct.ProductName}</h3>
                                                            <button onClick={() => setScanModal(prev => ({ ...prev, foundProduct: null, scannedCode: '' }))} className="text-indigo-600 text-xs font-bold bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100">Scan New</button>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full shadow-sm" style={{ backgroundColor: getChartColor(scanModal.foundProduct.DeviceType) }}>
                                                                {scanModal.foundProduct.DeviceType}
                                                            </span>
                                                            <p className="text-slate-500 font-mono text-xs">{scanModal.foundProduct.ProductID}</p>
                                                        </div>
                                                        <p className="mt-2 text-sm font-bold text-emerald-600 flex items-center gap-1"><Check size={14} /> พบสินค้าแล้ว (คงเหลือ: {scanModal.foundProduct.CurrentStock})</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-5 space-y-4">
                                                {/* Qty */}
                                                <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
                                                    <span className="font-bold text-slate-600 pl-2">จำนวนที่จะเบิก</span>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => setScanQty(Math.max(1, scanQty - 1))} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200"><Minus size={16} /></button>
                                                        <span className="font-bold text-xl w-8 text-center">{scanQty}</span>
                                                        <button onClick={() => setScanQty(Math.min(scanModal.foundProduct.CurrentStock, scanQty + 1))} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200"><Plus size={16} /></button>
                                                    </div>
                                                </div>

                                                {/* Reason */}
                                                <div className="space-y-3">
                                                    <p className="text-lg font-bold text-slate-400 uppercase ml-1">เหตุผล</p>
                                                    <div className="grid grid-cols-1 gap-3">
                                                        {reasonOptions.slice(0, 4).map(opt => (
                                                            <button
                                                                key={opt.ReasonID}
                                                                onClick={() => setScanReason(opt.Label)}
                                                                className={`p-2 rounded-xl text-ml font-bold border ${scanReason === opt.Label ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                                                            >
                                                                {opt.Label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="รายละเอียดเพิ่มเติม (Optional)..."
                                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none"
                                                        value={scanReasonDetail}
                                                        onChange={e => setScanReasonDetail(e.target.value)}
                                                    />
                                                </div>

                                                <div className="grid grid-cols-3 gap-3">
                                                    <button onClick={() => setScanModal({ isOpen: false, scannedCode: '', foundProduct: null, error: '' })} className="col-span-1 py-2 rounded-lg font-bold text-slate-500 hover:bg-slate-100 transition-all border border-slate-200 text-sm">
                                                        ยกเลิก
                                                    </button>
                                                    <button
                                                        onClick={handleScanWithdraw}
                                                        disabled={scanModal.foundProduct.CurrentStock <= 0}
                                                        className="col-span-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg shadow-md hover:shadow-lg transition-all text-sm disabled:opacity-50 disabled:shadow-none"
                                                    >
                                                        ยืนยันการเบิก
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            </motion.div>
                        </Portal>
                    )}
                </AnimatePresence>

            </>)}
        </div >
    );
};

export default InventoryPage;
