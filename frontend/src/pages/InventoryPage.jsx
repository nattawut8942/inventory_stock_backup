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

// ─── StatCard ────────────────────────────────────────────────────────────────
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
            {changeType === 'up' ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
            <span className={`text-sm font-medium ${changeType === 'up' ? 'text-green-600' : 'text-red-600'}`}>{change}</span>
          </div>
        )}
      </div>
      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
    </div>
  </motion.div>
);

// ─── Edit Modal helpers — ต้องอยู่นอก InventoryPage ────────────────────────
const InlineRow = ({ label, children }) => (
  <div className="flex items-center px-5 py-2.5 border-b border-slate-100 last:border-0 gap-4">
    <span className="text-[12px] text-slate-400 w-28 shrink-0">{label}</span>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

const inlineCls = "w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[13px] text-slate-700 bg-white focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all";

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Critical', sel: 'bg-red-50 text-red-700 border-red-200' },
  { value: 2, label: 'High',     sel: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 3, label: 'Medium',   sel: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { value: 4, label: 'Low',      sel: 'bg-green-50 text-green-700 border-green-200' },
];

const PriorityPicker = ({ name, defaultValue }) => {
  const [selected, setSelected] = React.useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={selected} />
      <div className="flex gap-1.5 flex-wrap">
        {PRIORITY_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className={`px-3 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
              selected === opt.value
                ? opt.sel
                : 'border-slate-200 text-slate-400 bg-white hover:border-slate-300 hover:text-slate-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </>
  );
};

// ─── InventoryPage ────────────────────────────────────────────────────────────
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
  const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const [locations, setLocations] = useState([]);

  useEffect(() => { fetchLocations(); }, []);

  useEffect(() => {
    if (location.state?.filter === 'lowstock' && !showLowStock) {
      setShowLowStock(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state?.filter]);

  const fetchLocations = async () => {
    try {
      const res = await fetch(`${API_BASE}/locations`);
      if (res.ok) setLocations(await res.json());
    } catch (error) { console.error('Error fetching locations:', error); }
  };

  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem('cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });
  useEffect(() => { localStorage.setItem('cart', JSON.stringify(cart)); }, [cart]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [qtyModal, setQtyModal] = useState({ isOpen: false, product: null, mode: 'cart' });
  const [selectQty, setSelectQty] = useState(1);
  const [reasons, setReasons] = useState([]);
  const [reasonOptions, setReasonOptions] = useState([]);

  useEffect(() => {
    const fetchReasons = async () => {
      try {
        const res = await fetch(`${API_BASE}/reasons`);
        if (!res.ok) throw new Error('Failed to fetch reasons');
        setReasons(await res.json());
      } catch (err) { console.error('Error fetching reasons:', err); }
    };
    fetchReasons();
  }, []);

  const [selectedReason, setSelectedReason] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/vendors`)
      .then(res => res.json())
      .then(data => setVendors(data))
      .catch(err => console.error('Failed to load vendors', err));
  }, []);

  const [scanModal, setScanModal] = useState({ isOpen: false, scannedCode: '', foundProduct: null, error: '' });
  const [scanQty, setScanQty] = useState(1);
  const [scanReason, setScanReason] = useState('New Withdrawal');
  const [scanReasonDetail, setScanReasonDetail] = useState('');

  const getFilteredReasons = (product) => {
    if (!product) return [];
    return reasons.filter(r => !r.TypeId || r.TypeId === product.DeviceType);
  };

  const openCartModal = (product) => {
    const existing = cart.find(c => c.ProductID === product.ProductID);
    setSelectQty(existing ? existing.qty : 1);
    const filtered = getFilteredReasons(product);
    setReasonOptions(filtered);
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
    if (d && d.trim()) info += `: ${d.trim()}`;
    return info;
  };

  const handleQtyConfirm = async () => {
    const product = qtyModal.product;
    if (!product || selectQty <= 0) return;
    if (qtyModal.mode === 'cart') {
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
      try {
        const res = await fetch(`${API_BASE}/products/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ProductID: product.ProductID, Qty: selectQty, UserID: user.username, RefInfo: getRefInfo() }),
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

  const removeFromCart = (id) => setCart(cart.filter(c => c.ProductID !== id));
  const updateCartQty = (id, newQty) => setCart(cart.map(c => c.ProductID === id ? { ...c, qty: Math.max(1, Math.min(c.CurrentStock, newQty)) } : c));
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
          body: JSON.stringify({ ProductID: item.ProductID, Qty: item.qty, UserID: user.username, RefInfo: getRefInfo(item.reason, item.reasonDetail) }),
        });
        if (res.ok) successCount++;
      } catch (err) { console.error(err); }
    }
    setCart([]);
    setIsCartOpen(false);
    refreshData();
    setAlertModal({ isOpen: true, type: successCount > 0 ? 'success' : 'error', title: 'ผลการเบิก', message: `ทำรายการสำเร็จ ${successCount} รายการ` });
  };

  const handleScanLookup = (code) => {
    if (!code.trim()) return;
    const found = products.find(p => p.BarcodeID && p.BarcodeID === code.trim()) ||
      products.find(p => String(p.ProductID) === code.trim()) ||
      products.find(p => p.ProductName.toLowerCase() === code.trim().toLowerCase());
    if (found) {
      setScanModal(prev => ({ ...prev, foundProduct: found, error: '' }));
      setScanQty(1);
      const filtered = getFilteredReasons(found);
      setReasonOptions(filtered);
      setScanReason(filtered.length > 0 ? filtered[0].Label : 'Other');
      setScanReasonDetail('');
    } else {
      setScanModal(prev => ({ ...prev, foundProduct: null, error: `ไม่พบอุปกรณ์: ${code}` }));
    }
  };

  const handleScanWithdraw = async () => {
    const product = scanModal.foundProduct;
    if (!product) return;
    try {
      const res = await fetch(`${API_BASE}/products/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ProductID: product.ProductID, Qty: scanQty, UserID: user.username, RefInfo: getRefInfo(scanReason, scanReasonDetail) }),
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
      if (res.ok) setHistoryData(await res.json());
    } catch (err) { console.error('Failed to fetch history'); }
  };

  const [barcodeItem, setBarcodeItem] = useState(null);
  const printRef = useRef();
  const isAdmin = user?.role === 'Staff';
  const [gridSort, setGridSort] = useState('priority');

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

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (gridSort === 'priority') {
      const urgency = (p) => {
        const isLow = p.CurrentStock <= p.MinStock && p.MinStock > 0;
        const isCritical = p.business_priority === 1;
        if (isLow && isCritical) return 0;
        if (isLow)               return 1;
        if (isCritical)          return 2;
        return 3;
      };
      const diff = urgency(a) - urgency(b);
      return diff !== 0 ? diff : a.ProductName.localeCompare(b.ProductName);
    }
    if (gridSort === 'stock')  return a.CurrentStock - b.CurrentStock;
    if (gridSort === 'price')  return (b.LastPrice || 0) - (a.LastPrice || 0);
    if (gridSort === 'name')   return a.ProductName.localeCompare(b.ProductName);
    return 0;
  });

  const totalProducts = products.length;
  const lowStockCount = products.filter(p => p.CurrentStock <= p.MinStock && p.MinStock > 0).length;
  const totalValue = products.reduce((sum, p) => sum + (p.CurrentStock * (p.LastPrice || 0)), 0);
  const typeDistribution = deviceTypes.map(t => ({ name: t.Label, count: products.filter(p => p.DeviceType === t.TypeId).length }));

  const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
      if (res.ok) return (await res.json()).imageUrl;
      setAlertModal({ isOpen: true, type: 'error', title: 'Upload Error', message: 'Server Error' });
    } catch (err) {
      setAlertModal({ isOpen: true, type: 'error', title: 'Connection Error', message: 'Cannot connect to server' });
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
    payload.MinStock = parseInt(payload.MinStock, 10) || 0;
    payload.MaxStock = parseInt(payload.MaxStock, 10) || 0;
    payload.CurrentStock = parseInt(payload.CurrentStock, 10) || 0;
    payload.LastPrice = parseFloat(payload.LastPrice) || 0;
    payload.business_priority = parseInt(payload.business_priority) || 3;
    payload.lead_time_days = parseInt(payload.lead_time_days, 10) || 7;
    payload.VendorID = payload.VendorID ? parseInt(payload.VendorID, 10) : null;
    try {
      const res = await fetch(`${API_BASE}/products/${editItem.ProductID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditItem(null);
        refreshData();
        setAlertModal({ isOpen: true, type: 'success', title: 'สำเร็จ', message: 'อัปเดตข้อมูลอุปกรณ์เรียบร้อยแล้ว' });
      } else {
        setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด', message: 'ไม่สามารถอัปเดตข้อมูลอุปกรณ์ได้' });
      }
    } catch (err) {
      setAlertModal({ isOpen: true, type: 'error', title: 'Network Error', message: 'ไม่สามารถเชื่อมต่อได้' });
    }
  };

  const handleDelete = (id) => {
    setAlertModal({
      isOpen: true, type: 'danger', title: 'ลบอุปกรณ์?',
      message: 'การดำเนินการนี้ไม่สามารถย้อนกลับได้ คุณแน่ใจหรือไม่?',
      confirmText: 'ลบ', cancelText: 'ยกเลิก',
      onConfirm: async () => {
        try {
          await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
          setAlertModal({ isOpen: true, type: 'success', title: 'ลบเรียบร้อย', message: 'ลบข้อมูลอุปกรณ์ออกจากระบบแล้ว', onConfirm: () => setAlertModal(prev => ({ ...prev, isOpen: false })) });
          refreshData();
        } catch (err) {
          setAlertModal({ isOpen: true, type: 'error', title: 'ข้อผิดพลาด', message: 'ไม่สามารถลบข้อมูลอุปกรณ์ได้' });
        }
      },
      onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher + Cart/Scan */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
          <button onClick={() => setActiveTab('inventory')} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'inventory' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'}`}>
            <Package size={18} /> คลังสินค้า
          </button>
          <button onClick={() => setActiveTab('stockcount')} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'stockcount' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'}`}>
            <ClipboardList size={18} /> ตรวจนับสต็อก
          </button>
        </div>

        {/* ✅ ย้ายมาอยู่ขวาสุดของแถว tab */}
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
      </div>

      {activeTab === 'stockcount' && <StockCountPage />}

      {activeTab === 'inventory' && (<>
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={Package} title="อุปกรณ์ทั้งหมด" value={totalProducts.toLocaleString()} color="from-blue-500 to-blue-600" />
          <StatCard icon={DollarSign} title="มูลค่าสต็อค" value={`฿${totalValue.toLocaleString()}`} color="from-purple-500 to-purple-600" />
          <StatCard icon={AlertTriangle} title="สต็อกต่ำ" value={lowStockCount} changeType={lowStockCount > 0 ? 'down' : 'up'} color="from-orange-500 to-orange-600" />
          <StatCard icon={LayoutGrid} title="หมวดหมู่" value={deviceTypes.length} color="from-pink-500 to-pink-600" />
        </div>

        {/* Header Controls */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-black mb-1 text-slate-800">INVENTORY</h2>
            <p className="text-slate-500 font-medium">จัดการและตรวจสอบสถานะอุปกรณ์</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}><List size={18} /></button>
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}><LayoutGrid size={18} /></button>
            </div>
            <div className="flex gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <Search size={18} className="text-slate-400 self-center" />
              <input type="text" placeholder="ค้นหาอุปกรณ์..." className="bg-transparent border-none outline-none text-sm w-32 sm:w-48 text-slate-700 placeholder-slate-400" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 outline-none cursor-pointer">
              <option value="all">ทุกประเภท</option>
              {deviceTypes.map(t => <option key={t.TypeId} value={t.TypeId}>{t.Label}</option>)}
            </select>
            <button onClick={() => setShowLowStock(!showLowStock)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all font-bold text-sm ${showLowStock ? 'bg-red-50 text-red-600 border-red-200 shadow-sm ring-2 ring-red-100' : 'bg-white text-slate-500 border-slate-200 hover:text-red-500 hover:border-red-200'}`}>
              <AlertTriangle size={16} className={showLowStock ? 'fill-current' : ''} />
              <span>สต็อกต่ำ</span>
            </button>
          </div>
        </motion.div>

        {/* Sort bar + Clear filter — ใช้ร่วมกันทั้ง list และ grid */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400 font-medium shrink-0">เรียงตาม</span>
          {[
            { key: 'priority', label: '🔴 ความเร่งด่วน' },
            { key: 'stock',    label: '📦 Stock น้อย→มาก' },
            { key: 'price',    label: '💰 ราคา มาก→น้อย' },
            { key: 'name',     label: '🔤 ชื่อ A–Z' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setGridSort(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                gridSort === opt.key
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
         {(
                <button
                    onClick={() => { setSearchTerm(''); setSelectedType('all'); setShowLowStock(false); setGridSort('priority'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ml-auto ${
                    (searchTerm || selectedType !== 'all' || showLowStock || gridSort !== 'priority')
                        ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                        : 'border-slate-200 bg-white text-slate-300 cursor-default'
                    }`}
                    disabled={!searchTerm && selectedType === 'all' && !showLowStock && gridSort === 'priority'}
                >
                    <X size={13} /> ล้าง filter
                </button>
                )}
        </div>

        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-lg overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 uppercase text-[12px] tracking-widest border-b border-slate-200">
                <tr>
                  <th className="p-4 pl-6">รายการ</th>
                  <th className="p-4">หมวดหมู่</th>
                  <th className="p-4">ราคาต่อหน่วย</th>
                  <th className="p-4 text-center">คงเหลือ</th>
                  <th className="p-4 text-center">ขั้นต่ำ</th>
                  <th className="p-4">ที่เก็บ</th>
                  <th className="p-4">สถานะ</th>
                  <th className="p-4">Priority</th>
                  <th className="p-4 text-center">เบิกจ่าย</th>
                  <th className="p-4 text-center">ประวัติอุปกรณ์</th>
                  {isAdmin && <th className="p-4 text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedProducts.map((p, idx) => {
                  const Icon = getIcon(p.DeviceType);
                  const inCart = isInCart(p.ProductID);
                  return (
                    <motion.tr key={p.ProductID} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }} className={`hover:bg-slate-50 transition-colors ${inCart ? 'bg-indigo-50/30' : ''}`}>
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getColorGradient(p.DeviceType)} flex items-center justify-center overflow-hidden shrink-0 shadow-md`}>
                            {p.ImageURL ? <img src={`${API_URL}${p.ImageURL}`} alt="" className="w-full h-full object-cover" /> : <Icon size={18} className="text-white" />}
                          </div>
                          <div>
                            <span className="font-bold text-slate-700 block truncate max-w-[200px]">{p.ProductName}</span>
                            {inCart && <span className="text-[10px] text-indigo-600 font-bold bg-indigo-100 px-1.5 rounded-sm">ในตะกร้า</span>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="flex items-center w-fit gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm text-white" style={{ backgroundColor: getChartColor(p.DeviceType) }}>{p.DeviceType}</span>
                      </td>
                      <td className="p-4 text-slate-500 font-mono">฿{p.LastPrice?.toLocaleString()}</td>
                      <td className={`p-4 text-center font-mono font-bold text-lg ${p.CurrentStock <= p.MinStock && p.MinStock > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{p.CurrentStock}</td>
                      <td className="p-4 text-center text-slate-400 font-mono">{p.MinStock}</td>
                      <td className="p-4 text-slate-500 font-medium text-xs">{p.Location || '-'}</td>
                      <td className="p-4">
                        {p.CurrentStock <= p.MinStock && p.MinStock > 0
                          ? <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-100 flex items-center gap-1 w-fit"><AlertTriangle size={12} /> ต่ำ</span>
                          : <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">ปกติ</span>
                        }
                      </td>
                      <td className="p-4">
                        {/* ✅ FIX: ใช้ array lookup แทน object literal ใน JSX */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          p.business_priority === 1 ? 'bg-red-100 text-red-700 border-red-200' :
                          p.business_priority === 2 ? 'bg-orange-100 text-orange-700 border-orange-200' :
                          p.business_priority === 4 ? 'bg-green-100 text-green-700 border-green-200' :
                          'bg-yellow-100 text-yellow-700 border-yellow-200'
                        }`}>
                          {(['', 'Critical', 'High', 'Medium', 'Low'][p.business_priority]) ?? 'Medium'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => openCartModal(p)} disabled={p.CurrentStock <= 0} className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg disabled:opacity-30" title="เพิ่มลงตะกร้า"><ShoppingCart size={16} /></button>
                          <button onClick={() => openWithdrawModal(p)} disabled={p.CurrentStock <= 0} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg disabled:opacity-30" title="เบิก"><ShoppingBag size={16} /></button>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => viewHistory(p)} className="text-slate-400 hover:text-indigo-600 transition-colors p-1.5 hover:bg-indigo-50 rounded-lg" title="ดูประวัติ"><Search size={16} /></button>
                          <button onClick={() => setDetailItem(p)} className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-lg" title="ดูรายละเอียด">
                            <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center font-bold text-[10px]">i</div>
                          </button>
                          <button onClick={() => setBarcodeItem(p)} className="text-slate-400 hover:text-emerald-600 transition-colors p-1.5 hover:bg-emerald-50 rounded-lg" title="พิมพ์บาร์โค้ด"><Printer size={16} /></button>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="p-4">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => setEditItem(p)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(p.ProductID)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
            {sortedProducts.length === 0 && <div className="text-center py-10 text-slate-400">ไม่พบอุปกรณ์</div>}
          </motion.div>
        )}

        {/* GRID VIEW */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedProducts.map((p, idx) => {
                const inCart = isInCart(p.ProductID);
                return (
                    <motion.div key={p.ProductID} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className={`group bg-white rounded-2xl border p-3 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden ${inCart ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-100'}`}>
                      <div className={`absolute top-0 left-0 w-full h-20 bg-gradient-to-br ${getColorGradient(p.DeviceType)} opacity-10 z-0`} />

                      {/* ✅ Priority badge — มุมซ้ายบน */}
                      <div className="absolute top-2 left-2 z-20">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                          p.business_priority === 1 ? 'bg-red-100 text-red-700 border-red-200' :
                          p.business_priority === 2 ? 'bg-orange-100 text-orange-700 border-orange-200' :
                          p.business_priority === 4 ? 'bg-green-100 text-green-700 border-green-200' :
                          'bg-yellow-100 text-yellow-700 border-yellow-200'
                        }`}>
                          {(['', 'Critical', 'High', 'Medium', 'Low'][p.business_priority]) ?? 'Medium'}
                        </span>
                      </div>

                      <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => viewHistory(p)} className="p-1.5 bg-white/90 backdrop-blur text-indigo-600 rounded-full shadow-sm hover:bg-indigo-50" title="ดูประวัติ"><List size={14} /></button>
                        <button onClick={() => setDetailItem(p)} className="p-1.5 bg-white/90 backdrop-blur text-blue-600 rounded-full shadow-sm hover:bg-blue-50" title="ดูรายละเอียด"><div className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center font-bold text-[9px]">i</div></button>
                        <button onClick={() => setBarcodeItem(p)} className="p-1.5 bg-white/90 backdrop-blur text-emerald-600 rounded-full shadow-sm hover:bg-emerald-50" title="พิมพ์บาร์โค้ด"><Printer size={14} /></button>
                        {isAdmin && (
                          <>
                            <button onClick={() => setEditItem(p)} className="p-1.5 bg-white/90 backdrop-blur text-amber-500 rounded-full shadow-sm hover:bg-amber-50"><Edit2 size={14} /></button>
                            <button onClick={() => handleDelete(p.ProductID)} className="p-1.5 bg-white/90 backdrop-blur text-red-500 rounded-full shadow-sm hover:bg-red-50"><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                      <div className="relative z-10 flex flex-col items-center text-center">
                        <div className={`w-28 h-28 mb-3 rounded-xl overflow-hidden shadow-lg flex items-center justify-center border-2 border-white group-hover:scale-105 transition-transform bg-gradient-to-br ${getColorGradient(p.DeviceType)}`}>
                          {p.ImageURL ? <img src={`${API_URL}${p.ImageURL}`} alt={p.ProductName} className="w-full h-full object-cover" /> : React.createElement(getIcon(p.DeviceType), { size: 40, className: 'text-white' })}
                        </div>
                        <h3 className="font-bold text-slate-800 text-sm mb-1 line-clamp-2 min-h-[2.5rem]">{p.ProductName}</h3>
                        {inCart && <span className="text-[10px] text-indigo-600 font-bold bg-indigo-100 px-1.5 py-0.5 rounded-sm mb-1">ในตะกร้า</span>}
                        <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full mb-2 shadow-sm text-white" style={{ backgroundColor: getChartColor(p.DeviceType) }}>{p.DeviceType}</span>
                        <div className="grid grid-cols-2 gap-2 w-full pt-2 border-t border-slate-100 mb-2">
                          <div>
                            <p className="text-[12px] text-slate-700 font-bold uppercase">คงเหลือ</p>
                            <p className={`text-lg font-black ${p.CurrentStock <= p.MinStock && p.MinStock > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{p.CurrentStock}</p>
                          </div>
                          <div>
                            <p className="text-[12px] text-slate-700 font-bold uppercase">ราคา</p>
                            <p className="text-lg font-black text-slate-700">฿{p.LastPrice?.toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="w-full mb-3 px-1">
                          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg p-2">
                            <div className="p-1.5 bg-white rounded-md shadow-sm text-indigo-500"><Archive size={14} /></div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-slate-700 font-bold uppercase leading-none mb-0.5">ที่เก็บ</p>
                              <p className="text-xs font-bold text-slate-700 truncate">{p.Location || 'Not Assigned'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex w-full gap-1">
                          <button onClick={() => openCartModal(p)} disabled={p.CurrentStock <= 0} className="flex-1 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 disabled:opacity-50">ใส่ตะกร้า</button>
                          <button onClick={() => openWithdrawModal(p)} disabled={p.CurrentStock <= 0} className="flex-1 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 disabled:opacity-50">เบิก</button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
          </div>
        )}

        {/* HISTORY MODAL */}
        {historyItem && (
          <Portal>
            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <div className="flex items-center gap-2 mb-1 opacity-90"><List size={16} /><span className="text-xs font-bold uppercase tracking-wider">ประวัติอุปกรณ์</span></div>
                      <h3 className="font-black text-lg md:text-xl tracking-tight">{historyItem.ProductName}</h3>
                      <p className="text-indigo-100 text-xs font-medium mt-1 font-mono opacity-80">{historyItem.ProductID}</p>
                    </div>
                    <button onClick={() => setHistoryItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
                  </div>
                </div>
                <div className="p-4 md:p-5 bg-slate-50/50 max-h-[60vh] overflow-y-auto">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                    <table className="w-full text-left text-xs table-auto min-w-max">
                      <thead className="bg-slate-50 border-b border-slate-100 uppercase text-xs font-bold text-slate-500 tracking-wider">
                        <tr>
                          <th className="p-4 whitespace-nowrap">วันที่</th>
                          <th className="p-4 text-center whitespace-nowrap">จำนวน</th>
                          <th className="p-4 whitespace-nowrap">เหตุผล</th>
                          <th className="p-4 whitespace-nowrap">Budget No.</th>
                          <th className="p-4 whitespace-nowrap">User</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {historyData.map((h, i) => (
                          <motion.tr key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-4 text-slate-600 font-medium whitespace-nowrap">{formatThaiDate(h.TransDate)}</td>
                            <td className={`p-4 text-center font-bold font-mono whitespace-nowrap ${(h.TransType || '').toUpperCase().trim() === 'IN' || (h.RefInfo || '').toLowerCase().includes('invoice') ? 'text-emerald-600' : 'text-red-500'}`}>
                              {(h.TransType || '').toUpperCase().trim() === 'IN' || (h.RefInfo || '').toLowerCase().includes('invoice') ? '+' : '-'}{Math.abs(h.Qty)}
                            </td>
                            <td className="p-4 text-indigo-600 font-medium whitespace-nowrap">{h.RefInfo}</td>
                            <td className="p-4 text-slate-500 font-mono text-xs whitespace-nowrap">{h.BudgetNo || '-'}</td>
                            <td className="p-4 text-xs text-slate-400 whitespace-nowrap">{h.UserID}</td>
                          </motion.tr>
                        ))}
                        {historyData.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400">ไม่มีประวัติ</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="p-4 bg-white border-t border-slate-100">
                  <button onClick={() => setHistoryItem(null)} className="w-full bg-slate-100 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-200 transition-all">ปิดหน้าต่าง</button>
                </div>
              </motion.div>
            </div>
          </Portal>
        )}

        {/* ✅ EDIT MODAL — ย้ายมาอยู่ใน JSX return ถูกต้องแล้ว */}
        {editItem && (
          <Portal>
            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="w-full max-w-[480px] bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden">
                <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
                  <div className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center overflow-hidden ${getDeviceTypeColor(editItem.DeviceType).bg}`}>
                    {editItem.ImageURL ? <img src={`${API_URL}${editItem.ImageURL}`} alt="" className="w-full h-full object-cover" /> : <Package size={20} className={getDeviceTypeColor(editItem.DeviceType).text} />}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-[11px] text-slate-400 mb-0.5">แก้ไขอุปกรณ์</p>
                    <h3 className="text-[15px] font-semibold text-slate-800 leading-snug truncate">{editItem.ProductName}</h3>
                    <span className="text-[11px] text-slate-400 font-mono">{editItem.ProductID}</span>
                  </div>
                  <button onClick={() => setEditItem(null)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors mt-0.5 shrink-0"><X size={15} /></button>
                </div>
                <form onSubmit={handleUpdate}>
                  <div className="max-h-[62vh] overflow-y-auto">
                    <div className="px-5 pt-3 pb-1"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">ข้อมูลทั่วไป</span></div>
                    <div className="divide-y divide-slate-100 border-y border-slate-100">
                      <InlineRow label="ชื่ออุปกรณ์"><input name="ProductName" defaultValue={editItem.ProductName} required className={inlineCls} /></InlineRow>
                      <InlineRow label="หมวดหมู่">
                        <select name="DeviceType" defaultValue={editItem.DeviceType} className={inlineCls}>
                          {deviceTypes.map(t => <option key={t.TypeId} value={t.TypeId}>{t.Label}</option>)}
                        </select>
                      </InlineRow>
                      <InlineRow label="ราคา/หน่วย">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[13px] pointer-events-none">฿</span>
                          <input name="LastPrice" type="number" step="0.01" defaultValue={editItem.LastPrice} className={`${inlineCls} pl-6 font-mono`} />
                        </div>
                      </InlineRow>
                      <InlineRow label="รูปอุปกรณ์">
                        <input type="file" name="imageFile" accept="image/*" className="w-full text-[11px] text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-slate-100 file:text-slate-600 hover:file:bg-slate-200 cursor-pointer" />
                      </InlineRow>
                    </div>
                    <div className="px-5 pt-3 pb-1"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">สต็อค</span></div>
                    <div className="divide-y divide-slate-100 border-y border-slate-100">
                      <InlineRow label="คงเหลือ"><input name="CurrentStock" type="number" defaultValue={editItem.CurrentStock} className={`${inlineCls} font-mono`} /></InlineRow>
                      <InlineRow label="ขั้นต่ำ / สูงสุด">
                        <div className="flex items-center gap-2">
                          <input name="MinStock" type="number" defaultValue={editItem.MinStock} className={`${inlineCls} font-mono flex-1`} />
                          <span className="text-slate-300 text-[13px] shrink-0">—</span>
                          <input name="MaxStock" type="number" defaultValue={editItem.MaxStock || 0} className={`${inlineCls} font-mono flex-1`} />
                        </div>
                      </InlineRow>
                      <InlineRow label="ที่เก็บ">
                        <select name="Location" defaultValue={editItem.Location || ''} className={inlineCls}>
                          <option value="">-- ระบุตำแหน่ง --</option>
                          {locations.map(loc => <option key={loc.LocationID} value={loc.Name}>{loc.Name}</option>)}
                        </select>
                      </InlineRow>
                    </div>
                    <div className="px-5 pt-3 pb-1"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">รายละเอียดเพิ่มเติม</span></div>
                    <div className="divide-y divide-slate-100 border-y border-slate-100">
                      <InlineRow label="ความสำคัญ"><PriorityPicker name="business_priority" defaultValue={editItem.business_priority ?? 3} /></InlineRow>
                      <InlineRow label="บาร์โค้ด">
                        <div className="relative">
                          <ScanLine size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input name="BarcodeID" defaultValue={editItem.BarcodeID || ''} placeholder="สแกนหรือพิมพ์บาร์โค้ด" className={`${inlineCls} pl-7 font-mono`} />
                        </div>
                      </InlineRow>
                      <InlineRow label="Vendor">
                        <select name="VendorID" defaultValue={editItem.VendorID || ''} className={inlineCls}>
                          <option value="">-- ไม่ระบุ --</option>
                          {vendors.map(v => <option key={v.VendorID} value={v.VendorID}>{v.VendorName} ({v.lead_time_days ?? 7} วัน)</option>)}
                        </select>
                      </InlineRow>
                      <InlineRow label="Lead time (วัน)">
                        <input type="number" name="lead_time_days" defaultValue={editItem.lead_time_days ?? 7} min={1} className={`${inlineCls} font-mono`} />
                      </InlineRow>
                    </div>
                  </div>
                  <div className="flex gap-2 px-4 py-3 border-t border-slate-100">
                    <button type="button" onClick={() => setEditItem(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-[13px] py-2.5 rounded-xl transition-colors">ยกเลิก</button>
                    <button type="submit" className="flex-[2] bg-teal-700 hover:bg-teal-800 text-white font-semibold text-[13px] py-2.5 rounded-xl transition-colors">บันทึกการแก้ไข</button>
                  </div>
                </form>
              </motion.div>
            </div>
          </Portal>
        )}

        {/* BARCODE PRINT MODAL */}
        {barcodeItem && (
          <Portal>
            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/20">
                <div className="p-4 md:p-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden print:hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <div className="flex items-center gap-2 mb-1 opacity-90"><Printer size={16} /><span className="text-sm font-bold uppercase tracking-wider">พิมพ์บาร์โค้ด</span></div>
                      <h3 className="font-black text-lg tracking-tight">{barcodeItem.ProductName}</h3>
                      <p className="text-indigo-100 text-xs font-medium mt-1 font-mono opacity-80">{barcodeItem.ProductID}</p>
                    </div>
                    <button onClick={() => setBarcodeItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={18} /></button>
                  </div>
                </div>
                <div className="p-5 bg-slate-50/50 flex flex-col items-center gap-4">
                  <div ref={printRef} className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center gap-3 w-full shadow-sm" id="barcode-print-area">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">IT INVENTORY</p>
                    <h4 className="text-sm font-bold text-slate-800 text-center leading-tight mb-2">{barcodeItem.ProductName}</h4>
                    <Barcode value={barcodeItem.ProductID} width={1.5} height={50} fontSize={12} margin={0} displayValue={true} />
                    <div className="flex gap-4 text-[10px] text-slate-400 font-medium mt-2 uppercase tracking-wide">
                      <span>Type: {barcodeItem.DeviceType}</span>
                      <span>Min: {barcodeItem.MinStock}</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-white border-t border-slate-100 flex gap-3 print:hidden">
                  <button onClick={() => setBarcodeItem(null)} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-50 transition-all">ปิด</button>
                  <button onClick={() => {
                    const printContents = document.getElementById('barcode-print-area').innerHTML;
                    const win = window.open('', '_blank', 'width=400,height=300');
                    win.document.write(`<html><head><title>Barcode - ${barcodeItem.ProductName}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.label{border:2px dashed #e2e8f0;border-radius:16px;padding:24px;display:flex;flex-direction:column;align-items:center;gap:12px}@media print{body{margin:0}.label{border:none}}</style></head><body><div class="label">${printContents}</div></body></html>`);
                    win.document.close();
                    win.focus();
                    win.print();
                  }} className="flex-1 bg-emerald-600 text-white font-bold py-2 text-sm rounded-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                    <Printer size={16} /> พิมพ์
                  </button>
                </div>
              </motion.div>
            </div>
          </Portal>
        )}

        {/* DETAIL MODAL */}
        {detailItem && (
          <Portal>
            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="w-full max-w-[480px] bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden">
                <div className="flex items-start gap-3.5 p-5 pb-0">
                  <div className={`w-14 h-14 rounded-xl shrink-0 flex items-center justify-center ${getDeviceTypeColor(detailItem.DeviceType).bg}`}>
                    <Package size={24} className={getDeviceTypeColor(detailItem.DeviceType).text} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${getDeviceTypeColor(detailItem.DeviceType).badge}`}>{detailItem.DeviceType}</span>
                      {detailItem.CurrentStock <= detailItem.MinStock && <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Low stock</span>}
                    </div>
                    <p className="text-[17px] font-bold text-slate-800 leading-snug truncate">{detailItem.ProductName}</p>
                    <p className="text-[12px] text-slate-400 font-mono mt-0.5">ID: {detailItem.ProductID}</p>
                  </div>
                  <button onClick={() => setDetailItem(null)} className="w-8 h-8 shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors mt-0.5"><X size={15} /></button>
                </div>
                <div className="grid grid-cols-3 gap-2 px-5 pt-4">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[11px] text-slate-400 mb-1">คงเหลือ</p>
                    <p className={`text-[22px] font-black leading-none ${detailItem.CurrentStock <= detailItem.MinStock ? 'text-red-500' : 'text-emerald-600'}`}>{detailItem.CurrentStock}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{detailItem.UnitOfMeasure || 'หน่วย'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[11px] text-slate-400 mb-1">ขั้นต่ำ</p>
                    <p className="text-[22px] font-black leading-none text-slate-700">{detailItem.MinStock}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{detailItem.UnitOfMeasure || 'หน่วย'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[11px] text-slate-400 mb-1">ราคา/หน่วย</p>
                    <p className="text-[18px] font-black leading-none text-slate-700">฿{detailItem.LastPrice?.toLocaleString() ?? '—'}</p>
                    <p className="text-[11px] text-slate-400 mt-1">บาท</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-100">
                  {[
                    { label: 'จัดเก็บ', value: detailItem.Location || 'ไม่ได้ระบุ' },
                    { label: 'หน่วยนับ', value: detailItem.UnitOfMeasure || '—' },
                    { label: 'สูงสุด', value: detailItem.MaxStock ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center px-5 py-2.5 border-b border-slate-100">
                      <span className="text-[13px] text-slate-400 w-28 shrink-0">{label}</span>
                      <span className="text-[13px] font-semibold text-slate-700">{value}</span>
                    </div>
                  ))}
                  <div className="flex items-center px-5 py-2.5">
                    <span className="text-[13px] text-slate-400 w-28 shrink-0">ความสำคัญ</span>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                      detailItem.business_priority === 1 ? 'bg-red-50 text-red-700 border-red-200' :
                      detailItem.business_priority === 2 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                      detailItem.business_priority === 4 ? 'bg-green-50 text-green-700 border-green-200' :
                      'bg-yellow-50 text-yellow-700 border-yellow-200'
                    }`}>
                      {(['', 'Critical', 'High', 'Medium', 'Low'][detailItem.business_priority]) ?? 'Medium'}
                    </span>
                  </div>
                </div>
                <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                  <button onClick={() => setDetailItem(null)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-[13px] py-2.5 rounded-xl transition-colors">ปิดหน้าต่าง</button>
                </div>
              </motion.div>
            </div>
          </Portal>
        )}

        {/* ALERT MODAL */}
        <AlertModal
          isOpen={alertModal.isOpen}
          type={alertModal.type}
          title={alertModal.title}
          message={alertModal.message}
          onConfirm={alertModal.onConfirm || (() => setAlertModal(prev => ({ ...prev, isOpen: false })))}
          onCancel={alertModal.onCancel}
          confirmText={alertModal.confirmText || 'ปิด'}
          cancelText={alertModal.cancelText || 'ยกเลิก'}
        />

        {/* QTY & REASON MODAL */}
        <AnimatePresence>
          {qtyModal.isOpen && qtyModal.product && (
            <Portal>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2">
                      {qtyModal.mode === 'cart' ? <ShoppingCart size={18} /> : <ShoppingBag size={18} />}
                      {qtyModal.mode === 'cart' ? 'เพิ่มลงตะกร้า' : 'เบิกด่วน'}
                    </h3>
                    <button onClick={() => setQtyModal({ isOpen: false, product: null, mode: 'cart' })} className="p-1 hover:bg-white/20 rounded-full"><X size={18} /></button>
                  </div>
                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex gap-3">
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getColorGradient(qtyModal.product.DeviceType)} flex items-center justify-center overflow-hidden`}>
                      {qtyModal.product.ImageURL ? <img src={`${API_URL}${qtyModal.product.ImageURL}`} alt="" className="w-full h-full object-cover" /> : <Package size={20} className="text-white" />}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800 line-clamp-1">{qtyModal.product.ProductName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full shadow-sm" style={{ backgroundColor: getChartColor(qtyModal.product.DeviceType) }}>{qtyModal.product.DeviceType}</span>
                        <p className="text-xs text-slate-500">คงเหลือ: <span className="font-bold text-emerald-600">{qtyModal.product.CurrentStock}</span></p>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 overflow-y-auto space-y-5">
                    <div className="flex items-center gap-4 justify-center">
                      <button onClick={() => setSelectQty(Math.max(1, selectQty - 1))} className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 shadow-sm"><Minus size={16} /></button>
                      <div className="text-center">
                        <input type="number" value={selectQty} onChange={(e) => setSelectQty(Math.max(1, Math.min(qtyModal.product.CurrentStock, parseInt(e.target.value) || 1)))} className="w-16 text-center text-xl font-black bg-transparent outline-none" />
                        <p className="text-[10px] text-slate-400 font-bold uppercase">จำนวน</p>
                      </div>
                      <button onClick={() => setSelectQty(Math.min(qtyModal.product.CurrentStock, selectQty + 1))} className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 shadow-sm"><Plus size={16} /></button>
                    </div>
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
                        <div className="flex items-center gap-2 mb-1.5 opacity-70"><FileEdit size={12} /><span className="text-xs font-bold">รายละเอียดเพิ่มเติม (Optional)</span></div>
                        <textarea value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none resize-none h-20" placeholder="เช่น ระบุชื่อโปรเจกต์ หรือหมายเลขแจ้งซ่อม..." />
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsCartOpen(false)}>
                <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="p-4 bg-indigo-600 text-white flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2 rounded-lg"><ShoppingCart size={18} /></div>
                      <div><h3 className="font-bold text-base">รายการเบิก</h3><p className="text-indigo-200 text-xs">{cart.length} รายการ</p></div>
                    </div>
                    <div className="flex items-center gap-1">
                      {cart.length > 0 && <button onClick={clearCart} className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-all mr-2"><Trash2 size={14} /> ล้างตะกร้า</button>}
                      <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                    {cart.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60"><ShoppingCart size={48} className="mb-2" /><p className="font-bold">ตะกร้าว่างเปล่า</p></div>
                    ) : cart.map(item => (
                      <div key={item.ProductID} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group">
                        <button onClick={() => removeFromCart(item.ProductID)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 p-1"><X size={16} /></button>
                        <div className="flex gap-3 mb-3">
                          <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getColorGradient(item.DeviceType)} flex items-center justify-center shrink-0 overflow-hidden`}>
                            {item.ImageURL ? <img src={`${API_URL}${item.ImageURL}`} alt="" className="w-full h-full object-cover" /> : <Package size={18} className="text-white" />}
                          </div>
                          <div className="pr-6">
                            <h4 className="font-bold text-slate-800 text-sm line-clamp-1">{item.ProductName}</h4>
                            <p className="text-xs text-slate-400 font-mono mb-1">{item.ProductID}</p>
                            <div className="inline-flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded text-[10px] font-bold text-indigo-600 border border-indigo-100"><span>{item.reason}</span></div>
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
                    ))}
                  </div>
                  {cart.length > 0 && (
                    <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 space-y-3">
                      <div className="flex justify-between items-end">
                        <span className="text-slate-500 font-bold text-sm">รวมจำนวน</span>
                        <span className="text-2xl font-black text-indigo-600">{getCartTotal()} <span className="text-sm text-slate-400 font-medium">ชิ้น</span></span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => setIsCartOpen(false)} className="col-span-1 py-2 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all border border-slate-200">ยกเลิก</button>
                        <button onClick={executeWithdrawAll} className="col-span-2 bg-indigo-600 text-white font-bold py-2 rounded-lg text-sm hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2"><Check size={16} /> ยืนยันการเบิก</button>
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setScanModal({ isOpen: false, scannedCode: '', foundProduct: null, error: '' })}>
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setScanModal({ isOpen: false, scannedCode: '', foundProduct: null, error: '' })} className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full z-10"><X size={20} /></button>
                  {!scanModal.foundProduct ? (
                    <div className="p-6 flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-5 animate-pulse"><ScanLine size={32} /></div>
                      <h3 className="text-xl font-black text-slate-800 mb-2">สแกนอุปกรณ์</h3>
                      <p className="text-slate-500 mb-5 text-sm">ยิงบาร์โค้ด หรือพิมพ์รหัส/ชื่ออุปกรณ์เพื่อค้นหา</p>
                      <div className="w-full relative">
                        <input autoFocus type="text" className="w-full bg-slate-100 border-2 border-slate-200 rounded-xl px-4 py-3 text-center font-bold focus:border-emerald-500 focus:bg-white outline-none transition-all" placeholder="Ready to Scan..." value={scanModal.scannedCode} onChange={e => setScanModal(prev => ({ ...prev, scannedCode: e.target.value, error: '' }))} onKeyDown={e => { if (e.key === 'Enter') handleScanLookup(scanModal.scannedCode); }} />
                        <button onClick={() => handleScanLookup(scanModal.scannedCode)} className="absolute right-2 top-2 bottom-2 bg-emerald-500 text-white px-3 py-1 rounded-lg font-bold hover:bg-emerald-600 text-sm">Enter</button>
                      </div>
                      {scanModal.error && <p className="text-red-500 font-bold mt-4 flex items-center gap-2 animate-bounce"><AlertTriangle size={16} /> {scanModal.error}</p>}
                    </div>
                  ) : (
                    <div className="bg-slate-50">
                      <div className="p-5 bg-white rounded-b-2xl shadow-sm z-10 relative">
                        <div className="flex gap-4">
                          <div className={`w-20 h-20 rounded-xl bg-gradient-to-br ${getColorGradient(scanModal.foundProduct.DeviceType)} flex items-center justify-center shadow-md overflow-hidden border-2 border-white`}>
                            {scanModal.foundProduct.ImageURL ? <img src={`${API_URL}${scanModal.foundProduct.ImageURL}`} alt="" className="w-full h-full object-cover" /> : <Package size={28} className="text-white" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <h3 className="font-black text-lg text-slate-800 line-clamp-2">{scanModal.foundProduct.ProductName}</h3>
                              <button onClick={() => setScanModal(prev => ({ ...prev, foundProduct: null, scannedCode: '' }))} className="text-indigo-600 text-xs font-bold bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100">Scan New</button>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full shadow-sm" style={{ backgroundColor: getChartColor(scanModal.foundProduct.DeviceType) }}>{scanModal.foundProduct.DeviceType}</span>
                              <p className="text-slate-500 font-mono text-xs">{scanModal.foundProduct.ProductID}</p>
                            </div>
                            <p className="mt-2 text-sm font-bold text-emerald-600 flex items-center gap-1"><Check size={14} /> พบสินค้าแล้ว (คงเหลือ: {scanModal.foundProduct.CurrentStock})</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
                          <span className="font-bold text-slate-600 pl-2">จำนวนที่จะเบิก</span>
                          <div className="flex items-center gap-3">
                            <button onClick={() => setScanQty(Math.max(1, scanQty - 1))} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200"><Minus size={16} /></button>
                            <span className="font-bold text-xl w-8 text-center">{scanQty}</span>
                            <button onClick={() => setScanQty(Math.min(scanModal.foundProduct.CurrentStock, scanQty + 1))} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200"><Plus size={16} /></button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <p className="text-lg font-bold text-slate-400 uppercase ml-1">เหตุผล</p>
                          <div className="grid grid-cols-1 gap-3">
                            {reasonOptions.slice(0, 4).map(opt => (
                              <button key={opt.ReasonID} onClick={() => setScanReason(opt.Label)} className={`p-2 rounded-xl text-ml font-bold border ${scanReason === opt.Label ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>{opt.Label}</button>
                            ))}
                          </div>
                          <input type="text" placeholder="รายละเอียดเพิ่มเติม (Optional)..." className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none" value={scanReasonDetail} onChange={e => setScanReasonDetail(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <button onClick={() => setScanModal({ isOpen: false, scannedCode: '', foundProduct: null, error: '' })} className="col-span-1 py-2 rounded-lg font-bold text-slate-500 hover:bg-slate-100 transition-all border border-slate-200 text-sm">ยกเลิก</button>
                          <button onClick={handleScanWithdraw} disabled={scanModal.foundProduct.CurrentStock <= 0} className="col-span-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg shadow-md hover:shadow-lg transition-all text-sm disabled:opacity-50 disabled:shadow-none">ยืนยันการเบิก</button>
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
    </div>
  );
};

export default InventoryPage;