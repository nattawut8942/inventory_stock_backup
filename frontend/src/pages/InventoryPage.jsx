import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Monitor, Network, Archive, Database, Package, List, LayoutGrid, Edit2, Trash2, X, TrendingUp, TrendingDown, AlertTriangle, DollarSign, HardDrive, Mouse, Droplet, Printer, ShoppingBag, ShoppingCart, Minus, Plus, FileEdit, ScanLine, Check, Truck, Settings, ClipboardList, FileBarChart, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import Barcode from 'react-barcode';
import { motion, AnimatePresence, animate } from 'motion/react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useCan, useCanAct } from '../context/PermissionContext';
import AlertModal from '../components/AlertModal';
import Portal from '../components/Portal';
import AdjustStockModal from '../components/AdjustStockModal';
import { getBadgeStyle, getColorGradient, getChartColor, getDeviceTypeColor } from '../utils/styleHelpers';
import { formatThaiDate } from '../utils/formatDate';
import { MANAGEMENT_TYPES, managementTypeInfo, managementTypeOf, isLowStock, isStored } from '../utils/stockManagement';
import { API_BASE, API_URL } from '../config/api';
import StockCountPage from './StockCountPage';
import StockReportView from '../components/StockReportView';
import EmployeeCodeModal from '../components/EmployeeCodeModal';
import ManagementTypeHelp from '../components/ManagementTypeHelp';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

// ✅ รูปแบบรหัสครุภัณฑ์บังคับ: CO + ตัวเลขล้วน เช่น CO24-001-05
const FIXED_ASSET_CODE_REGEX = /^(CO|OF)\d{2}-\d{3}-\d{2}$/;
const isValidFixedAssetCode = (code) => FIXED_ASSET_CODE_REGEX.test((code || '').trim());

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');


const extractPrefixAndDigits = (str) => {
  let v = (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let prefix = '';
  if (v.startsWith('CO')) { prefix = 'CO'; v = v.slice(2); }
  else if (v.startsWith('OF')) { prefix = 'OF'; v = v.slice(2); }
  else if (v[0] === 'C') { prefix = 'CO'; v = v.slice(1); }
  else if (v[0] === 'O') { prefix = 'OF'; v = v.slice(1); }
  const digits = v.replace(/\D/g, '').slice(0, 7);
  return { prefix, digits };
};

const buildFixedAssetCode = (prefix, digits) => {
  if (!prefix) return '';
  let out = prefix;
  if (digits.length > 0) out += digits.slice(0, 2);
  if (digits.length > 2) out += '-' + digits.slice(2, 5);
  if (digits.length > 5) out += '-' + digits.slice(5, 7);
  return out;
};

// ✅ เวอร์ชันแก้บั๊ก: ลบ prefix (CO/OF) เองได้ + ลบตัวเลขผ่านขีด "-" ได้ปกติ
const nextFixedAssetCode = (newRaw, prevFormatted) => {
  const isShrinking = newRaw.length < (prevFormatted || '').length;
  const { digits: probeDigits } = extractPrefixAndDigits(newRaw);

  // กรณีกำลังลบ และยังไม่มีตัวเลขเลย -> อย่า auto-fill ทับ ปล่อยให้ลบตัวอักษรได้อิสระ
  if (isShrinking && probeDigits.length === 0) {
    return newRaw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  }

  const { prefix: newPrefix, digits: newDigits } = extractPrefixAndDigits(newRaw);
  const { digits: prevDigits } = extractPrefixAndDigits(prevFormatted);

  if (isShrinking && newDigits.length === prevDigits.length && newDigits.length > 0) {
    // กด backspace โดนตัวคั่น "-" พอดี -> ตัดเลขตัวสุดท้ายออกจริง ๆ
    return buildFixedAssetCode(newPrefix, newDigits.slice(0, -1));
  }
  return buildFixedAssetCode(newPrefix, newDigits);
};

// ─── StatCard ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, title, value, change, changeType, color, onClick, format }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    className={`bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow ${onClick ? 'cursor-pointer hover:border-indigo-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300' : ''}`}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-slate-600 mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-slate-900">{typeof value === 'number' ? <AnimatedNumber value={value} format={format} /> : value}</h3>
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

// ─── Count-up: ตัวเลขนับขึ้นเมื่อค่าเปลี่ยน ───────────────────────────────
const AnimatedNumber = ({ value, format = (n) => Math.round(n).toLocaleString() }) => {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const controls = animate(fromRef.current, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    fromRef.current = value;
    return () => controls.stop();
  }, [value]);
  return <>{format(display)}</>;
};

// ดาวน์โหลดไฟล์ CSV (ใส่ BOM ให้ Excel อ่านภาษาไทยได้ถูกต้อง)
const downloadCsv = (filename, headers, rows) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
// คืนของ: ต้องตรงกับ RETURN_WINDOW_DAYS ใน backend (productController.js)
const RETURN_WINDOW_DAYS = 7;
// Admin คืนได้ไม่จำกัดเวลา (backend ตรวจจาก DB อีกครั้ง ฝั่ง UI ใช้แค่แสดงปุ่ม)
const isReturnableRow = (h, isAdmin) =>
  (h.TransType || '').toUpperCase().trim() === 'OUT' &&
  !h.ReturnedAt &&
  (isAdmin || (Date.now() - new Date(h.TransDate).getTime()) <= RETURN_WINDOW_DAYS * 86400000);

// สถานะสต็อกของการ์ด: ใช้ทั้งป้ายข้อความและแถบสีด้านซ้าย (ไม่ต้องใช้ MinStock ก็แสดงได้)
const getStockState = (p) => {
  if (isStored(p)) {
    return { label: 'เก็บในคลัง', chip: 'bg-slate-100 text-slate-500 border-slate-200', edge: 'border-l-slate-300' };
  }
  if (!(p.MinStock > 0)) {
    return { label: 'ไม่ได้ตั้งขั้นต่ำ', chip: 'bg-slate-100 text-slate-500 border-slate-200', edge: 'border-l-slate-300' };
  }
  if (isLowStock(p)) {
    return { label: 'ต่ำกว่าขั้นต่ำ', chip: 'bg-red-50 text-red-600 border-red-200', edge: 'border-l-red-500' };
  }
  return { label: 'ปกติ', chip: 'bg-emerald-50 text-emerald-600 border-emerald-200', edge: 'border-l-emerald-500' };
};

// ─── Edit Modal helpers — ต้องอยู่นอก InventoryPage ────────────────────────
const InlineRow = ({ label, children }) => (
  <div className="flex flex-col gap-1.5 px-5 py-3">
    <span className="text-[11px] font-semibold text-slate-500 tracking-wide">{label}</span>
    <div className="min-w-0">{children}</div>
  </div>
);

const Field = ({ label, children }) => (
  <div className="flex flex-col gap-1.5 min-w-0">
    <span className="text-[11px] font-semibold text-slate-500 tracking-wide">{label}</span>
    <div className="min-w-0">{children}</div>
  </div>
);

const inlineCls = "w-full px-3 py-2 border border-slate-200 rounded-xl text-[13px] text-slate-700 bg-white placeholder:text-slate-300 hover:border-slate-300 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all";

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Critical', sel: 'bg-red-50 text-red-700 border-red-200' },
  { value: 2, label: 'High', sel: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 3, label: 'Medium', sel: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { value: 4, label: 'Low', sel: 'bg-green-50 text-green-700 border-green-200' },
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
            className={`px-3 py-1 rounded-lg border text-[11px] font-semibold transition-all ${selected === opt.value
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
  const [selectedMgmt, setSelectedMgmt] = useState('all');   // ประเภทการจัดการ: all | Rotating | Spare | Stored
  const [showLowStock, setShowLowStock] = useState(location.state?.filter === 'lowstock');
  const [viewMode, setViewMode] = useState('grid');
  const [listSort, setListSort] = useState({ key: null, dir: 'asc' }); // การเรียงของมุมมอง list (คลิกหัวคอลัมน์)
  const [listPage, setListPage] = useState(1);
  const [activeTab, setActiveTab] = useState('inventory');
  const [editItem, setEditItem] = useState(null);
  const [historyItem, setHistoryItem] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [detailItem, setDetailItem] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const [locations, setLocations] = useState([]);
  const [toast, setToast] = useState(null);   // ✅ แจ้งเตือนสั้น ๆ มุมจอ (แทน modal สำหรับงานที่ไม่ต้องกดรับทราบ)
  const canReturn = useCanAct('inventory', 'return');
  const isAdminUser = user?.role === 'Admin';
  const [returnTarget, setReturnTarget] = useState(null);   // แถวประวัติที่กำลังจะคืน
  const [returnReason, setReturnReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);   // ✅ เลือกหลายรายการเพื่อเพิ่มลงตะกร้าพร้อมกัน
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.duration ?? 2000);
    return () => clearTimeout(t);
  }, [toast]);

  // ✅ เปลี่ยนตัวกรองแล้วล้างการเลือก เพื่อไม่ให้เพิ่มรายการที่มองไม่เห็นลงตะกร้าโดยไม่ตั้งใจ
  useEffect(() => { setSelectedIds([]); }, [searchTerm, selectedType, showLowStock]);

  // ✅ กด "/" เพื่อโฟกัสช่องค้นหา (ข้ามเมื่อกำลังพิมพ์ในช่องอื่นอยู่)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target?.tagName || '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) return;
      if (!searchInputRef.current) return;
      e.preventDefault();
      searchInputRef.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // ตะกร้าแยกตาม user เพื่อไม่ให้ผู้ใช้คนอื่นบนเครื่องเดียวกันเห็นของของเรา
  const cartStorageKey = `cart_${(user?.username || 'guest').toLowerCase()}`;
  const [cart, setCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem(cartStorageKey);
      return savedCart ? JSON.parse(savedCart) : [];
    } catch (err) {
      return [];
    }
  });
  useEffect(() => {
    try { localStorage.setItem(cartStorageKey, JSON.stringify(cart)); } catch (err) { /* storage ไม่พร้อมใช้งาน */ }
  }, [cart, cartStorageKey]);
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
        const all = await res.json();
        setReasons(all.filter(r => r.IsActive !== 0 && r.IsActive !== false)); // เฉพาะเหตุผลที่เปิดใช้งาน
      } catch (err) { console.error('Error fetching reasons:', err); }
    };
    fetchReasons();
  }, []);

  const [selectedReason, setSelectedReason] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
const [assetSerialNumber, setAssetSerialNumber] = useState('');
  const [assetFixedCode, setAssetFixedCode] = useState('');
  const [assetCodeCheck, setAssetCodeCheck] = useState({ status: 'idle', message: '' });
  const [scanCodeCheck, setScanCodeCheck] = useState({ status: 'idle', message: '' });
  const [vendors, setVendors] = useState([]);   // ✅ เพิ่มกลับมา — หายไปจากไฟล์

  useEffect(() => {
    fetch(`${API_BASE}/vendors`)
      .then(res => res.json())
      .then(data => setVendors(data))
      .catch(err => console.error('Failed to load vendors', err));
  }, []);

  const [scanModal, setScanModal] = useState({ isOpen: false, scannedCode: '', foundProduct: null, error: '' });
  const [scanQty, setScanQty] = useState(1);
  const [scanReason, setScanReason] = useState('New Withdrawal');
  const [selfUse, setSelfUse] = useState(false); // เบิกใช้เอง: ผู้ login เป็นผู้รับ
  const [imagePreview, setImagePreview] = useState(null); // { src, name } สำหรับ modal ขยายรูป
  const [adjustItem, setAdjustItem] = useState(null); // ปรับยอดคงเหลือจริง
  const [wdHistory, setWdHistory] = useState({ productId: null, rows: [], loading: false }); // 13: ประวัติการเบิกในหน้าเบิก

  // 13: โหลดประวัติการเบิกของอุปกรณ์ที่กำลังเบิก
  useEffect(() => {
    const pid = qtyModal.isOpen && qtyModal.mode === 'withdraw' && qtyModal.product ? qtyModal.product.ProductID : null;
    if (!pid) return undefined;
    let alive = true;
    setWdHistory({ productId: pid, rows: [], loading: true });
    fetch(`${API_BASE}/transactions?filter=OUT&productId=${pid}`)
      .then(r => r.json())
      .then(d => { if (alive) setWdHistory({ productId: pid, rows: Array.isArray(d) ? d : [], loading: false }); })
      .catch(() => { if (alive) setWdHistory({ productId: pid, rows: [], loading: false }); });
    return () => { alive = false; };
  }, [qtyModal.isOpen, qtyModal.mode, qtyModal.product?.ProductID]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scanReasonDetail, setScanReasonDetail] = useState('');
  const [scanSerialNumber, setScanSerialNumber] = useState('');
  const [scanFixedCode, setScanFixedCode] = useState('');   // ✅ ประกาศก่อนถูกใช้แล้ว

  // ✅ ย้าย checkAssetCodeDuplicate + useEffect มาไว้ตรงนี้ หลังตัวแปรทุกตัวถูกประกาศครบแล้ว
  const checkAssetCodeDuplicate = async (code, setChecker) => {
    if (!isValidFixedAssetCode(code)) {
      setChecker({ status: 'idle', message: '' });
      return;
    }
    setChecker({ status: 'checking', message: 'กำลังตรวจสอบ...' });
    try {
      const res = await fetch(`${API_BASE}/products/check-asset-code/${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      setChecker(data.exists
        ? { status: 'duplicate', message: '⚠️ รหัสนี้ถูกใช้ไปแล้วในระบบ' }
        : { status: 'ok', message: '✓ รหัสนี้ใช้ได้' });
    } catch (err) {
      setChecker({ status: 'error', message: 'ตรวจสอบไม่สำเร็จ ลองใหม่' });
    }
  };

  useEffect(() => {
    const t = setTimeout(() => checkAssetCodeDuplicate(assetFixedCode, setAssetCodeCheck), 500);
    return () => clearTimeout(t);
  }, [assetFixedCode]);

  useEffect(() => {
    const t = setTimeout(() => checkAssetCodeDuplicate(scanFixedCode, setScanCodeCheck), 500);
    return () => clearTimeout(t);
  }, [scanFixedCode]);

  const [empCode, setEmpCode] = useState('');
  const [empData, setEmpData] = useState(null);
  const [empError, setEmpError] = useState('');
  const [empLoading, setEmpLoading] = useState(false);

  const lookupEmployee = async () => {
    const trimmed = empCode.trim();
    if (!trimmed) return;
    setEmpLoading(true);
    setEmpError('');
    try {
      const res = await fetch(`${API_BASE}/employees/${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        setEmpData(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setEmpData(null);
        setEmpError(data.error || 'ไม่พบรหัสพนักงาน');
      }
    } catch (err) {
      setEmpData(null);
      setEmpError('ไม่สามารถเชื่อมต่อระบบ HR ได้');
    }
    setEmpLoading(false);
  };

  const resetEmpLookup = () => {
    setEmpCode('');
    setEmpData(null);
    setEmpError('');
  };

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
    setAssetSerialNumber(existing?.serialNumber || '');
    setAssetFixedCode(existing?.fixedAssetCode || '');
    setAssetCodeCheck({ status: 'idle', message: '' });   // ✅ แก้ให้ถูกตัว
    setQtyModal({ isOpen: true, product, mode: 'cart' });
  };

  const openWithdrawModal = (product) => {
    setSelectQty(1);
    setSelfUse(false);
    const filtered = getFilteredReasons(product);
    setReasonOptions(filtered);
    const defaultReason = filtered.length > 0 ? filtered[0].Label : 'Other';
    setSelectedReason(defaultReason);
    setReasonDetail('');
    setAssetSerialNumber('');   // ✅
    setAssetFixedCode('');      // ✅
    resetEmpLookup();   // ✅ เพิ่ม
    setQtyModal({ isOpen: true, product, mode: 'withdraw' });
    setAssetCodeCheck({ status: 'idle', message: '' });
  };

  const getRefInfo = (reason, detail) => {
    let info = reason || selectedReason;
    const d = detail !== undefined ? detail : reasonDetail;
    if (d && d.trim()) info += `: ${d.trim()}`;
    return info;
  };
  const requireEmployee = (action) => {
    setPendingWithdraw(() => action);
    setEmployeeModalOpen(true);
  };

  const handleEmployeeConfirm = async (employeeData) => {
    setEmployeeModalOpen(false);
    if (pendingWithdraw) {
      await pendingWithdraw(employeeData);
    }
    setPendingWithdraw(null);
  };

 // ── ยืนยันก่อนเบิก: เปิดกล่องยืนยันพร้อมสรุปรายการ แล้วค่อยเรียกงานจริงเมื่อกด "ยืนยันการเบิก"
const askWithdrawConfirm = (summary, onYes) => {
  setAlertModal({
    isOpen: true,
    type: 'info',
    title: 'ยืนยันการเบิก',
    message: summary,
    confirmText: 'ยืนยันการเบิก',
    cancelText: 'ยกเลิก',
    onConfirm: () => {
      setAlertModal(prev => ({ ...prev, isOpen: false }));
      onYes();
    },
    onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false })),
  });
};

const handleQtyConfirm = () => {
  if (qtyModal.mode !== 'withdraw') return doQtyConfirm();
  const product = qtyModal.product;
  const recipientReady = selfUse ? !!user?.empcode : !!empData;
  // ข้อมูลไม่ครบ ปล่อยให้ doQtyConfirm ตรวจและไม่แสดงกล่องยืนยัน
  if (!product || selectQty <= 0 || !reasonDetail.trim() || !recipientReady) return doQtyConfirm();
  const who = selfUse ? (user?.name || user?.username || '-') : (empData?.FormattedName || '-');
  askWithdrawConfirm(
    `${product.ProductName} · จำนวน ${selectQty} ชิ้น · เหตุผล: ${selectedReason}${reasonDetail.trim() ? ` (${reasonDetail.trim()})` : ''} · ผู้รับ: ${who}`,
    () => doQtyConfirm()
  );
};

const doQtyConfirm = async () => {
    const product = qtyModal.product;
    if (!product || selectQty <= 0) return;
    if (!reasonDetail.trim()) return;
    if (product.DeviceType === 'Asset' && (!assetSerialNumber.trim() || !isValidFixedAssetCode(assetFixedCode))) return;
    const recipientReady = selfUse ? !!user?.empcode : !!empData;
    if (qtyModal.mode === 'withdraw' && !recipientReady) return;   // ✅ ต้องมีผู้รับ (ค้นหารหัส หรือเบิกใช้เอง)
    if (qtyModal.mode === 'cart') {
      // จับตำแหน่งรูปใน modal ก่อนปิด เพื่อใช้เป็นจุดเริ่มของแอนิเมชันบินลงตะกร้า
      const srcRect = document.getElementById('qty-modal-thumb')?.getBoundingClientRect() || null;
      flyToCart(srcRect, product);
      const existingIndex = cart.findIndex(c => c.ProductID === product.ProductID);
      let newCart = [...cart];
      if (existingIndex >= 0) {
        newCart[existingIndex] = { ...newCart[existingIndex], qty: selectQty, reason: selectedReason, reasonDetail, serialNumber: assetSerialNumber, fixedAssetCode: assetFixedCode };
      } else {
        newCart.push({ ...product, qty: selectQty, reason: selectedReason, reasonDetail, serialNumber: assetSerialNumber, fixedAssetCode: assetFixedCode });
      }
      setCart(newCart);
      setQtyModal({ isOpen: false, product: null, mode: 'cart' });
      setToast({ type: 'success', message: `เพิ่ม ${product.ProductName} ลงในตะกร้าแล้ว`, duration: 2000 });
    } else {
      // ✅ ไม่บังคับ empData อีกแล้ว — แค่ "ถ้ามีก็แนบไปด้วย"
      setQtyModal({ isOpen: false, product: null, mode: 'cart' });
      try {
       const res = await fetch(`${API_BASE}/products/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ProductID: product.ProductID,
            Qty: selectQty,
            UserID: (user?.username || '').toUpperCase(),
            RefInfo: getRefInfo(),
            EmployeeCode: selfUse ? user?.empcode : empData?.EmployeeCode,
            EmployeeName: selfUse ? user?.name : empData?.FormattedName,
            CostCenter: selfUse ? '7510' : empData?.CostCenter,
            SelfUse: selfUse,
            SerialNumber: product.DeviceType === 'Asset' ? assetSerialNumber.trim() : null,
            FixedAssetCode: product.DeviceType === 'Asset' ? assetFixedCode.trim() : null,
          }),
        });
        if (res.ok) {
          setQtyModal({ isOpen: false, product: null, mode: 'cart' });   // ✅ ปิดตอนสำเร็จเท่านั้น
          setAlertModal({ isOpen: true, type: 'success', title: 'เบิกสำเร็จ', message: `เบิก ${product.ProductName} จำนวน ${selectQty} ชิ้นเรียบร้อย` });
          refreshData();
      } else {
          const data = await res.json().catch(() => ({}));
          if (res.status === 409) {
            setScanCodeCheck({ status: 'duplicate', message: '⚠️ รหัสนี้ถูกใช้ไปแล้วในระบบ' });
          }
          setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.error || 'เบิกไม่สำเร็จ' });
        }
      } catch (err) {
        setAlertModal({ isOpen: true, type: 'error', title: 'Connection Error', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
      }
    }
  }

  const removeFromCart = (id) => setCart(cart.filter(c => c.ProductID !== id));
  const updateCartQty = (id, newQty) => setCart(cart.map(c => c.ProductID === id ? { ...c, qty: Math.max(1, Math.min(c.CurrentStock, newQty)) } : c));
  const getCartTotal = () => cart.reduce((sum, item) => sum + item.qty, 0);
  const isInCart = (id) => cart.some(c => c.ProductID === id);
  const clearCart = () => setCart([]);

  const confirmWithdrawAll = () => {
    if (cart.length === 0) return;
    askWithdrawConfirm(`ตะกร้า ${cart.length} รายการ · รวม ${getCartTotal()} ชิ้น`, () => doExecuteWithdrawAll());
  };

  const doExecuteWithdrawAll = async () => {
    if (cart.length === 0) return;
    // ✅ ห่อทั้งฟังก์ชันด้วย requireEmployee
    requireEmployee(async (employeeData) => {
      let successCount = 0;
      const failedMessages = [];   // ✅
      for (const item of cart) {
        try {
          const res = await fetch(`${API_BASE}/products/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ProductID: item.ProductID,
              Qty: item.qty,
              UserID: (user?.username || '').toUpperCase(),
              RefInfo: getRefInfo(item.reason, item.reasonDetail),
              SerialNumber: item.DeviceType === 'Asset' ? item.serialNumber : null,
              FixedAssetCode: item.DeviceType === 'Asset' ? item.fixedAssetCode : null,
              ...employeeData,
            }),
          });
          if (res.ok) {
            successCount++;
          } else {
            const data = await res.json().catch(() => ({}));   // ✅
            failedMessages.push(`${item.ProductName}: ${data.error || 'เบิกไม่สำเร็จ'}`);   // ✅
          }
        } catch (err) { console.error(err); failedMessages.push(`${item.ProductName}: เชื่อมต่อไม่ได้`); }
      }
      setCart([]);
      setIsCartOpen(false);
      refreshData();
       setAlertModal({
        isOpen: true,
        type: successCount > 0 ? 'success' : 'error',
        title: 'ผลการเบิก',
        message: `ทำรายการสำเร็จ ${successCount} รายการ` + (failedMessages.length > 0 ? `\n\nรายการที่ผิดพลาด:\n${failedMessages.join('\n')}` : ''),
      });
    });
  };   // ✅ เพิ่มบรรทัดนี้ — ปิด executeWithdrawAll

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
      setScanSerialNumber('');   // ✅
      setScanFixedCode('');      // ✅
        setScanCodeCheck({ status: 'idle', message: '' });
    } else {
      setScanModal(prev => ({ ...prev, foundProduct: null, error: `ไม่พบอุปกรณ์: ${code}` }));
    }
  };

 const handleScanWithdraw = () => {
  const product = scanModal.foundProduct;
  if (!product) return;
  if (product.DeviceType === 'Asset' && (!scanSerialNumber.trim() || !isValidFixedAssetCode(scanFixedCode))) return doScanWithdraw();
  askWithdrawConfirm(
    `${product.ProductName} · จำนวน ${scanQty} ชิ้น · เหตุผล: ${scanReason}${scanReasonDetail.trim() ? ` (${scanReasonDetail.trim()})` : ''}`,
    () => doScanWithdraw()
  );
};

const doScanWithdraw = async () => {
    const product = scanModal.foundProduct;
    if (!product) return;
    if (product.DeviceType === 'Asset' && (!scanSerialNumber.trim() || !isValidFixedAssetCode(scanFixedCode))) return;
    requireEmployee(async (employeeData) => {
      try {
        const res = await fetch(`${API_BASE}/products/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ProductID: product.ProductID,
            Qty: scanQty,
            UserID: (user?.username || '').toUpperCase(),
            RefInfo: getRefInfo(scanReason, scanReasonDetail),
            SerialNumber: product.DeviceType === 'Asset' ? scanSerialNumber.trim() : null,
            FixedAssetCode: product.DeviceType === 'Asset' ? scanFixedCode.trim() : null,
            ...employeeData,
          }),
        });
        if (res.ok) {
          setAlertModal({ isOpen: true, type: 'success', title: 'เบิกสำเร็จ', message: `เบิก ${product.ProductName} เรียบร้อย` });
          refreshData();
          setScanModal({ isOpen: false, scannedCode: '', foundProduct: null, error: '' });
        } else {
          const data = await res.json().catch(() => ({}));
          if (res.status === 409) {
            setScanCodeCheck({ status: 'duplicate', message: '⚠️ รหัสนี้ถูกใช้ไปแล้วในระบบ' });
          }
          setAlertModal({ isOpen: true, type: 'error', title: 'ผิดพลาด', message: data.error || 'เบิกไม่สำเร็จ' });
        }
      } catch (err) {
        setAlertModal({ isOpen: true, type: 'error', title: 'Connection Error', message: 'เชื่อมต่อไม่ได้' });
      }
    });
  };

  const viewHistory = async (product) => {
    setHistoryItem(product);
    try {
      const res = await fetch(`${API_BASE}/stock/history/${product.ProductID}`);
      if (res.ok) setHistoryData(await res.json());
    } catch (err) { console.error('Failed to fetch history'); }
  };

  const [barcodeItem, setBarcodeItem] = useState(null);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);   // ✅ เพิ่ม
  const [pendingWithdraw, setPendingWithdraw] = useState(null);
  const printRef = useRef();
  const canEdit = useCan('inventory', 'edit');
  const canAdjust = useCan('stock-count', 'adjust'); // ปรับยอดคงเหลือจริง (สิทธิ์เดียวกับการปรับยอดจากการนับ)
  const canDelete = useCan('inventory', 'delete');
  const isAdmin = canEdit || canDelete; // the "manage" column shows if either applies
  const canWithdraw = useCanAct('inventory', 'withdraw');
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

  const q = searchTerm.trim().toLowerCase();
  const filteredProducts = products.filter(p =>
    (!q || [p.ProductName, p.BarcodeID, p.ProductID, p.Location, p.VendorName]
      .some(v => v != null && String(v).toLowerCase().includes(q))) &&
    (selectedType === 'all' || p.DeviceType === selectedType) &&
    (selectedMgmt === 'all' || managementTypeOf(p) === selectedMgmt) &&
    (!showLowStock || isLowStock(p))
  );

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (gridSort === 'priority') {
      const urgency = (p) => {
        const isLow = isLowStock(p);
        const isCritical = p.business_priority === 1;
        if (isLow && isCritical) return 0;
        if (isLow) return 1;
        if (isCritical) return 2;
        return 3;
      };
      const diff = urgency(a) - urgency(b);
      return diff !== 0 ? diff : a.ProductName.localeCompare(b.ProductName);
    }
    if (gridSort === 'stock') {
      // เรียงตามอัตราส่วนเทียบขั้นต่ำ — รายการที่ไม่มี MinStock ไปท้ายสุด
      const ratio = (p) => (p.MinStock > 0 ? p.CurrentStock / p.MinStock : Infinity);
      const diff = ratio(a) - ratio(b);
      return Number.isNaN(diff) ? 0 : diff;
    }
    if (gridSort === 'price') return (b.LastPrice || 0) - (a.LastPrice || 0);
    if (gridSort === 'name') return a.ProductName.localeCompare(b.ProductName);
    return 0;
  });

  // เรียงแถวของมุมมอง list ตามหัวคอลัมน์ที่คลิก (ไม่กระทบมุมมอง grid)
  const LIST_SORT_VALUE = {
    name: p => p.ProductName || '',
    category: p => p.DeviceType || '',
    price: p => p.LastPrice || 0,
    stock: p => p.CurrentStock ?? 0,
    min: p => p.MinStock ?? 0,
    location: p => p.Location || '',
    status: p => (isLowStock(p) ? 0 : 1),
    priority: p => p.business_priority ?? 99,
  };
  const listProducts = listSort.key && LIST_SORT_VALUE[listSort.key]
    ? [...sortedProducts].sort((a, b) => {
      const get = LIST_SORT_VALUE[listSort.key];
      const va = get(a), vb = get(b);
      const r = typeof va === 'string' ? va.localeCompare(vb, 'th') : va - vb;
      return listSort.dir === 'asc' ? r : -r;
    })
    : sortedProducts;
  const toggleListSort = (key) => { setListPage(1); setListSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })); };
  // แบ่งหน้าเฉพาะมุมมอง list ทีละ 20 รายการ
  const LIST_PAGE_SIZE = 20;
  const listTotalPages = Math.max(1, Math.ceil(listProducts.length / LIST_PAGE_SIZE));
  const listPageSafe = Math.min(listPage, listTotalPages);
  const listPageItems = listProducts.slice((listPageSafe - 1) * LIST_PAGE_SIZE, listPageSafe * LIST_PAGE_SIZE);
  useEffect(() => { setListPage(1); }, [searchTerm, selectedType, selectedMgmt, showLowStock]);
  const listTh = (key, label, align = 'text-left') => {
    const active = listSort.key === key;
    const Arrow = !active ? ArrowUpDown : listSort.dir === 'asc' ? ChevronUp : ChevronDown;
    return (
      <th className={`px-3 py-2 ${align} cursor-pointer select-none hover:bg-slate-100 transition-colors ${active ? 'text-indigo-700' : ''}`}
        onClick={() => toggleListSort(key)} aria-sort={active ? (listSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <span className={`inline-flex items-center gap-1 ${align === 'text-center' ? 'justify-center' : ''}`}>
          {label}<Arrow size={11} className={active ? 'text-indigo-600' : 'text-slate-300'} />
        </span>
      </th>
    );
  };

  const totalProducts = products.length;
  const lowStockCount = products.filter(isLowStock).length;
  const totalValue = products.reduce((sum, p) => sum + (p.CurrentStock * (p.LastPrice || 0)), 0);
  const typeDistribution = deviceTypes.map(t => ({ name: t.Label, count: products.filter(p => p.DeviceType === t.TypeId).length }));

const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append('imageFile', file);   // ✅ เปลี่ยนจาก 'image' เป็น 'imageFile'
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
    // 0 = ไม่จำกัด (ช่องถูกปิดเมื่อติ๊ก "ไม่จำกัด" จึงไม่ถูกส่งมา)
    payload.MaxStock = parseInt(payload.MaxStock, 10) || 0;
    delete payload.UnlimitedMax;
    // 1: คงเหลือแก้จากหน้านี้ไม่ได้ (ปรับยอดผ่านการนับ/เบิก/รับเข้า) จึงส่งค่าเดิมกลับไป
    payload.CurrentStock = editItem.CurrentStock;
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

  // ─── คืนของ: ยืนยันการคืนรายการเบิก แล้วรีโหลดประวัติและยอดสต็อก ───
  const handleReturn = async () => {
    if (!returnTarget || !returnReason.trim() || returning) return;
    setReturning(true);
    try {
      const res = await fetch(`${API_BASE}/products/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          TransID: returnTarget.TransID,
          Reason: returnReason.trim(),
          UserID: (user?.username || '').toUpperCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReturnTarget(null);
        setReturnReason('');
        if (historyItem) viewHistory(historyItem);
        refreshData();
        setToast({ type: 'success', message: 'คืนของเรียบร้อย ยอดสต็อกเพิ่มแล้ว', duration: 2500 });
      } else {
        setAlertModal({ isOpen: true, type: 'error', title: 'คืนของไม่สำเร็จ', message: data.error || 'ลองใหม่อีกครั้ง' });
      }
    } catch (err) {
      setAlertModal({ isOpen: true, type: 'error', title: 'Connection Error', message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
    } finally {
      setReturning(false);
    }
  };

  // ─── Fly-to-cart: รูปอุปกรณ์บินจากจุดที่กดไปยังปุ่มตะกร้า แล้ว badge เด้ง ───
  const cartBtnRef = useRef(null);
  const [cartBump, setCartBump] = useState(0);
  const flyToCart = (srcRect, product) => {
    const target = cartBtnRef.current;
    const bump = () => setCartBump(n => n + 1);
    if (!srcRect || !target || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      bump();
      return;
    }
    const tRect = target.getBoundingClientRect();
    // ถ้าปุ่มตะกร้าเลื่อนพ้นจอ ไม่ต้องบิน ให้เด้ง badge อย่างเดียว
    if (tRect.bottom < 0 || tRect.top > window.innerHeight) {
      bump();
      return;
    }
    const size = 48;
    const sx = srcRect.left + srcRect.width / 2;
    const sy = srcRect.top + srcRect.height / 2;
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'z-index:9999', 'pointer-events:none', 'overflow:hidden',
      `width:${size}px`, `height:${size}px`, `left:${sx - size / 2}px`, `top:${sy - size / 2}px`,
      'border-radius:14px', 'background:linear-gradient(135deg,#6366f1,#4f46e5)',
      'box-shadow:0 10px 25px rgba(79,70,229,.45)', 'display:flex', 'align-items:center', 'justify-content:center',
      'color:#fff', 'font-weight:700', 'font-size:14px',
    ].join(';');
    if (product?.ImageURL) {
      const img = document.createElement('img');
      img.src = `${API_URL}${product.ImageURL}`;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      el.appendChild(img);
    } else {
      el.textContent = '+1';
    }
    document.body.appendChild(el);
    const dx = tRect.left + tRect.width / 2 - sx;
    const dy = tRect.top + tRect.height / 2 - sy;
    animate(el,
      { x: [0, dx * 0.5, dx], y: [0, dy * 0.3 - 80, dy], scale: [1, 1.15, 0.3], opacity: [1, 1, 0.4] },
      { duration: 0.75, ease: 'easeInOut' }
    ).then(() => { el.remove(); bump(); }).catch(() => { el.remove(); bump(); });
  };

  // ─── Bulk select / export helpers ───
  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const allVisibleSelected = sortedProducts.length > 0 && sortedProducts.every(p => selectedIds.includes(p.ProductID));
  const toggleSelectAll = () => setSelectedIds(allVisibleSelected ? [] : sortedProducts.map(p => p.ProductID));

  const bulkAddToCart = () => {
    const picked = products.filter(p => selectedIds.includes(p.ProductID));
    // Asset ต้องกรอก S/N ทีละชิ้น และอุปกรณ์หมดสต็อกเพิ่มไม่ได้ จึงข้ามไป
    const addable = picked.filter(p => p.DeviceType !== 'Asset' && p.CurrentStock > 0 && !isInCart(p.ProductID));
    const skipped = picked.length - addable.length;
    const newItems = addable.map(p => {
      const opts = getFilteredReasons(p);
      return { ...p, qty: 1, reason: opts.length ? opts[0].Label : 'Other', reasonDetail: '', serialNumber: '', fixedAssetCode: '' };
    });
    if (newItems.length) setCart(prev => [...prev, ...newItems]);
    setSelectedIds([]);
    setToast({
      type: 'success',
      message: newItems.length
        ? `เพิ่ม ${newItems.length} รายการลงตะกร้าแล้ว${skipped ? ` (ข้าม ${skipped} รายการ)` : ''}`
        : 'ไม่มีรายการที่เพิ่มได้ (Asset หรือหมดสต็อก)',
      duration: 3000,
    });
  };

  const exportVisibleCsv = () => {
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`inventory_${today}.csv`,
      ['รหัส', 'ชื่อ', 'หมวดหมู่', 'การจัดการ', 'คงเหลือ', 'ขั้นต่ำ', 'สูงสุด', 'ราคา/หน่วย', 'สถานที่เก็บ', 'Vendor', 'สถานะ'],
      sortedProducts.map(p => [
        p.ProductID, p.ProductName, p.DeviceType, managementTypeInfo(p).label, p.CurrentStock, p.MinStock, p.MaxStock || '',
        p.LastPrice || 0, p.Location || '', p.VendorName || '',
        isLowStock(p) ? 'ต่ำกว่าขั้นต่ำ' : 'ปกติ',
      ]));
  };

  // รายการที่ควรสั่งซื้อ: จำนวนแนะนำ = ระดับสูงสุด (หรือ 2× ขั้นต่ำ) - คงเหลือ
  const exportReorderCsv = () => {
    const today = new Date().toISOString().slice(0, 10);
    const low = products.filter(isLowStock);   // ไม่รวมของเก็บในคลัง; อุปกรณ์สำรองระบุในคอลัมน์การจัดการ
    downloadCsv(`reorder_${today}.csv`,
      ['รหัส', 'ชื่อ', 'การจัดการ', 'คงเหลือ', 'ขั้นต่ำ', 'จำนวนแนะนำให้สั่ง', 'Vendor', 'Lead time (วัน)'],
      low.map(p => [
        p.ProductID, p.ProductName, managementTypeInfo(p).label, p.CurrentStock, p.MinStock,
        Math.max(1, (p.MaxStock || p.MinStock * 2) - p.CurrentStock),
        p.VendorName || '', p.lead_time_days ?? 7,
      ]));
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
            <Package size={18} /> คลังอุปกรณ์
          </button>
          <button onClick={() => setActiveTab('stockcount')} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'stockcount' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'}`}>
            <ClipboardList size={18} /> ตรวจนับสต็อก
          </button>
          <button onClick={() => setActiveTab('report')} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'report' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'}`}>
            <FileBarChart size={18} /> Report
          </button>
        </div>

        {/* ✅ ย้ายมาอยู่ขวาสุดของแถว tab */}
        <div className="flex items-center gap-2">
          {canWithdraw && <button
            ref={cartBtnRef}
            onClick={() => setIsCartOpen(true)}
            aria-label={`เปิดตะกร้า${cart.length > 0 ? ` (${cart.length} รายการ)` : ''}`}
            className="relative bg-white hover:bg-indigo-50 text-indigo-600 border border-slate-200 font-bold px-3 py-2 rounded-xl transition-all shadow-sm flex items-center gap-2"
          >
            <ShoppingCart size={18} />
            <span className="hidden sm:inline">ตะกร้า</span>
            {cart.length > 0 && (
              <motion.span
                key={cartBump}
                initial={cartBump ? { scale: 1.7 } : false}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 14 }}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
              >
                {getCartTotal()}
              </motion.span>
            )}
          </button>}
          {canWithdraw && <button
            onClick={() => setScanModal({ isOpen: true, scannedCode: '', foundProduct: null, error: '' })}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-3 py-2 rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center gap-2"
          >
            <ScanLine size={18} />
            <span className="hidden sm:inline">สแกนเบิก</span>
          </button>}
        </div>
      </div>

      {activeTab === 'stockcount' && <StockCountPage />}

      {activeTab === 'report' && <StockReportView />}

      {activeTab === 'inventory' && (<>
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={Package} title="อุปกรณ์ทั้งหมด" value={totalProducts} color="from-blue-500 to-blue-600" />
          <StatCard icon={DollarSign} title="มูลค่าสต็อค" value={totalValue} format={(n) => `฿${Math.round(n).toLocaleString()}`} color="from-purple-500 to-purple-600" />
          <StatCard icon={AlertTriangle} title="สต็อกต่ำ" value={lowStockCount} changeType={lowStockCount > 0 ? 'down' : 'up'} color="from-orange-500 to-orange-600" onClick={() => { setShowLowStock(true); setSearchTerm(''); setSelectedType('all'); setSelectedMgmt('all'); }} />
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
              <input ref={searchInputRef} type="text" aria-label="ค้นหาอุปกรณ์" placeholder="ค้นหาอุปกรณ์... (กด / )" className="bg-transparent border-none outline-none text-sm w-32 sm:w-48 text-slate-700 placeholder-slate-400" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 outline-none cursor-pointer">
              <option value="all">ทุกประเภท</option>
              {deviceTypes.map(t => <option key={t.TypeId} value={t.TypeId}>{t.Label}</option>)}
            </select>
            <select value={selectedMgmt} onChange={(e) => setSelectedMgmt(e.target.value)} aria-label="ประเภทการจัดการ" title="ประเภทการจัดการ" className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 outline-none cursor-pointer">
              <option value="all">ทุกการจัดการ</option>
              {MANAGEMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <ManagementTypeHelp />
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
            { key: 'stock', label: '📦 ใกล้หมดก่อน' },
            { key: 'price', label: '💰 ราคา มาก→น้อย' },
            { key: 'name', label: '🔤 ชื่อ A–Z' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setGridSort(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${gridSort === opt.key
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            {(searchTerm || selectedType !== 'all' || selectedMgmt !== 'all' || showLowStock) && (
              <button
                onClick={() => { setSearchTerm(''); setSelectedType('all'); setSelectedMgmt('all'); setShowLowStock(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-all"
              >
                <X size={13} /> ล้าง filter
              </button>
            )}
            <button
              onClick={exportVisibleCsv}
              disabled={sortedProducts.length === 0}
              title="ดาวน์โหลดรายการที่แสดงอยู่เป็นไฟล์ CSV"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-all disabled:opacity-40"
            >
              <Database size={13} /> ส่งออก CSV
            </button>
          </div>
        </div>

        {/* ✅ แบนเนอร์สต็อกต่ำ — บอกสถานะชัด ๆ และดาวน์โหลดรายการที่ต้องสั่งซื้อได้ทันที */}
        {showLowStock && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle size={16} className="shrink-0" />
              {lowStockCount > 0
                ? <span>มี <b>{lowStockCount}</b> รายการที่ต่ำกว่าขั้นต่ำ ควรสั่งซื้อเพิ่ม</span>
                : <span>ไม่มีรายการสต็อกต่ำในตอนนี้ 🎉</span>}
            </div>
            {lowStockCount > 0 && (
              <button onClick={exportReorderCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-white border border-red-200 text-red-600 hover:bg-red-100 transition-all">
                <Database size={13} /> ดาวน์โหลดรายการที่ต้องสั่ง (CSV)
              </button>
            )}
          </div>
        )}

        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-lg border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 uppercase text-[11px] tracking-wide border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 pl-4 w-10">
                    <input type="checkbox" aria-label="เลือกทั้งหมด" checked={allVisibleSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                  </th>
                  {listTh('name', 'รายการ')}
                  {listTh('category', 'หมวดหมู่')}
                  {listTh('price', 'ราคาต่อหน่วย')}
                  {listTh('stock', 'คงเหลือ', 'text-center')}
                  {listTh('min', 'ขั้นต่ำ', 'text-center')}
                  {listTh('location', 'ที่เก็บ')}
                  {listTh('status', 'สถานะ')}
                  {listTh('priority', 'Priority')}
                  <th className="px-2 py-2 text-center">เบิกจ่าย</th>
                  <th className="px-2 py-2 text-center">ประวัติอุปกรณ์</th>
                  {isAdmin && <th className="px-2 py-2 text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listPageItems.map((p, idx) => {
                  const inCart = isInCart(p.ProductID);
                  return (
                    <motion.tr key={p.ProductID} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx, 12) * 0.03 }} className={`hover:bg-slate-50 transition-colors ${selectedIds.includes(p.ProductID) ? 'bg-indigo-50' : inCart ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-3 py-2 pl-4">
                        <input type="checkbox" aria-label={`เลือก ${p.ProductName}`} checked={selectedIds.includes(p.ProductID)} onChange={() => toggleSelect(p.ProductID)} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-semibold text-slate-800 block truncate max-w-[260px]">{p.ProductName}</span>
                        {inCart && <span className="text-[10px] text-indigo-600 font-bold">ในตะกร้า</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center w-fit gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: getChartColor(p.DeviceType) }}>{p.DeviceType}</span>
                        {managementTypeOf(p) !== 'Rotating' && (
                          <span title={managementTypeInfo(p).hint} className={`mt-1 inline-block px-1.5 py-px rounded border text-[9px] font-bold ${managementTypeInfo(p).cls}`}>{managementTypeInfo(p).short}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500 font-mono">฿{p.LastPrice?.toLocaleString()}</td>
                      <td className={`px-2 py-2 text-center font-mono font-bold text-sm ${isLowStock(p) ? 'text-red-500' : isStored(p) ? 'text-slate-500' : 'text-emerald-600'}`}>{p.CurrentStock}</td>
                      <td className="px-2 py-2 text-center text-slate-400 font-mono">{p.MinStock}</td>
                      <td className="px-3 py-2 text-slate-500 font-medium text-xs">{p.Location || '-'}</td>
                      <td className="px-3 py-2">
                        {isLowStock(p)
                          ? <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-100 flex items-center gap-1 w-fit"><AlertTriangle size={12} /> ต่ำ</span>
                          : isStored(p)
                          ? <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">เก็บในคลัง</span>
                          : <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">ปกติ</span>
                        }
                      </td>
                      <td className="px-3 py-2">
                        {/* ✅ FIX: ใช้ array lookup แทน object literal ใน JSX */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.business_priority === 1 ? 'bg-red-100 text-red-700 border-red-200' :
                          p.business_priority === 2 ? 'bg-orange-100 text-orange-700 border-orange-200' :
                            p.business_priority === 4 ? 'bg-green-100 text-green-700 border-green-200' :
                              'bg-yellow-100 text-yellow-700 border-yellow-200'
                          }`}>
                          {(['', 'Critical', 'High', 'Medium', 'Low'][p.business_priority]) ?? 'Medium'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <div className="flex justify-center gap-1">
                          {canWithdraw && <button onClick={() => openCartModal(p)} disabled={p.CurrentStock <= 0} className="p-1 text-indigo-600 hover:bg-indigo-100 rounded-lg disabled:opacity-30" title="เพิ่มลงตะกร้า" aria-label="เพิ่มลงตะกร้า"><ShoppingCart size={14} /></button>}
                          {canWithdraw && <button onClick={() => openWithdrawModal(p)} disabled={p.CurrentStock <= 0} className="p-1 text-emerald-600 hover:bg-emerald-100 rounded-lg disabled:opacity-30" title="เบิกด่วน" aria-label="เบิกด่วน"><ShoppingBag size={14} /></button>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => viewHistory(p)} className="text-slate-400 hover:text-indigo-600 transition-colors p-1 hover:bg-indigo-50 rounded-lg" title="ดูประวัติ" aria-label="ดูประวัติ"><Search size={14} /></button>
                          <button onClick={() => setDetailItem(p)} className="text-slate-400 hover:text-blue-600 transition-colors p-1 hover:bg-blue-50 rounded-lg" title="ดูรายละเอียด" aria-label="ดูรายละเอียด">
                            <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center font-bold text-[10px]">i</div>
                          </button>
                          <button onClick={() => setBarcodeItem(p)} className="text-slate-400 hover:text-emerald-600 transition-colors p-1 hover:bg-emerald-50 rounded-lg" title="พิมพ์บาร์โค้ด" aria-label="พิมพ์บาร์โค้ด"><Printer size={14} /></button>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2">
                          <div className="flex justify-center gap-2">
                            {canEdit && <button onClick={() => setEditItem(p)} aria-label={`แก้ไข ${p.ProductName}`} title="แก้ไข" className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={14} /></button>}
                            {canDelete && <button onClick={() => handleDelete(p.ProductID)} aria-label={`ลบ ${p.ProductName}`} title="ลบ" className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14} /></button>}
                          </div>
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
              <span>
                ทั้งหมด <span className="font-bold text-slate-800">{listProducts.length}</span> รายการ
                {listProducts.length > 0 && <> · แสดง {(listPageSafe - 1) * LIST_PAGE_SIZE + 1}–{Math.min(listPageSafe * LIST_PAGE_SIZE, listProducts.length)}</>}
              </span>
              {listTotalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setListPage(1)} disabled={listPageSafe === 1} className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40">«</button>
                  <button type="button" onClick={() => setListPage(p => Math.max(1, p - 1))} disabled={listPageSafe === 1} className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40">‹ ก่อนหน้า</button>
                  <span className="px-2 font-bold text-slate-800">หน้า {listPageSafe} / {listTotalPages}</span>
                  <button type="button" onClick={() => setListPage(p => Math.min(listTotalPages, p + 1))} disabled={listPageSafe === listTotalPages} className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40">ถัดไป ›</button>
                  <button type="button" onClick={() => setListPage(listTotalPages)} disabled={listPageSafe === listTotalPages} className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40">»</button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* GRID VIEW */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {sortedProducts.map((p, idx) => {
              const inCart = isInCart(p.ProductID);
              return (
                <motion.div key={p.ProductID} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 12) * 0.03 }} className={`group bg-white rounded-2xl border border-l-4 ${getStockState(p).edge} p-2 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden ${selectedIds.includes(p.ProductID) ? 'border-indigo-400 ring-2 ring-indigo-300' : inCart ? 'border-indigo-300 ring-2 ring-indigo-100' :isLowStock(p) ? 'border-red-200 hover:border-red-300' : 'border-slate-100 hover:border-indigo-200 hover:ring-1 hover:ring-indigo-100'}`}>
                  <div className={`absolute top-0 left-0 w-full h-20 bg-gradient-to-br ${getColorGradient(p.DeviceType)} opacity-10 z-0`} />

                  {/* ✅ เลือกหลายรายการ */}
                  <label className="absolute top-1.5 left-1.5 z-30 flex items-center justify-center w-5 h-5 bg-white/95 rounded shadow-sm cursor-pointer" title="เลือกรายการนี้">
                    <input type="checkbox" aria-label={`เลือก ${p.ProductName}`} checked={selectedIds.includes(p.ProductID)} onChange={() => toggleSelect(p.ProductID)} className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer" />
                  </label>

                  {/* ✅ Priority badge — แถวบนสุดของการ์ด (ไม่ทับรูป) */}
                  <div className="relative z-20 flex items-center gap-1 pl-7 min-h-[1.25rem] mb-0.5">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${p.business_priority === 1 ? 'bg-red-100 text-red-700 border-red-200' :
                      p.business_priority === 2 ? 'bg-orange-100 text-orange-700 border-orange-200' :
                        p.business_priority === 4 ? 'bg-green-100 text-green-700 border-green-200' :
                          'bg-yellow-100 text-yellow-700 border-yellow-200'
                      }`}>
                      {(['', 'Critical', 'High', 'Medium', 'Low'][p.business_priority]) ?? 'Medium'}
                    </span>                  </div>

                  <div className="absolute top-1.5 right-1.5 z-30 flex flex-row gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => viewHistory(p)} className="p-1.5 bg-white/90 backdrop-blur text-indigo-600 rounded-full shadow-sm hover:bg-indigo-50" title="ดูประวัติ" aria-label="ดูประวัติ"><List size={14} /></button>
                    <button onClick={() => setDetailItem(p)} className="p-1.5 bg-white/90 backdrop-blur text-blue-600 rounded-full shadow-sm hover:bg-blue-50" title="ดูรายละเอียด" aria-label="ดูรายละเอียด"><div className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center font-bold text-[9px]">i</div></button>
                    <button onClick={() => setBarcodeItem(p)} className="p-1.5 bg-white/90 backdrop-blur text-emerald-600 rounded-full shadow-sm hover:bg-emerald-50" title="พิมพ์บาร์โค้ด" aria-label="พิมพ์บาร์โค้ด"><Printer size={14} /></button>
                    {isAdmin && (
                      <>
                        {canEdit && <button onClick={() => setEditItem(p)} aria-label={`แก้ไข ${p.ProductName}`} title="แก้ไข" className="p-1.5 bg-white/90 backdrop-blur text-amber-500 rounded-full shadow-sm hover:bg-amber-50"><Edit2 size={14} /></button>}
                        {canDelete && <button onClick={() => handleDelete(p.ProductID)} aria-label={`ลบ ${p.ProductName}`} title="ลบ" className="p-1.5 bg-white/90 backdrop-blur text-red-500 rounded-full shadow-sm hover:bg-red-50"><Trash2 size={14} /></button>}
                      </>
                    )}
                  </div>
                  <div className="relative z-10 flex flex-col items-center text-center">
                    {/* 8: กดรูปเพื่อดูแบบขยาย (รูปเต็มกรอบ ไม่ถูกครอบ) */}
                    <button type="button" onClick={() => p.ImageURL && setImagePreview({ src: `${API_URL}${p.ImageURL}`, name: p.ProductName })} disabled={!p.ImageURL}
                      className={`w-20 h-20 mb-1.5 rounded-xl overflow-hidden shadow-lg flex items-center justify-center border-2 border-white group-hover:scale-105 transition-transform bg-gradient-to-br ${getColorGradient(p.DeviceType)} ${p.ImageURL ? 'cursor-zoom-in' : 'cursor-default'}`}
                      title={p.ImageURL ? 'กดเพื่อดูรูปใหญ่' : undefined} aria-label={p.ImageURL ? `ดูรูป ${p.ProductName}` : undefined}>
                      {p.ImageURL ? <img loading="lazy" src={`${API_URL}${p.ImageURL}`} alt={p.ProductName} className="w-full h-full object-contain p-1 bg-white/80" /> : React.createElement(getIcon(p.DeviceType), { size: 40, className: 'text-white' })}
                    </button>
                    <h3 className="font-bold text-slate-800 text-xs mb-1 line-clamp-2 min-h-[1.25rem]">{p.ProductName}</h3>
                    {inCart && <span className="text-[10px] text-indigo-600 font-bold bg-indigo-100 px-1.5 py-0.5 rounded-sm mb-1">ในตะกร้า</span>}
                    {(() => {
                      // ของเก็บในคลังไม่เตือน (แสดงยอดอย่างเดียว)
                      const low = isLowStock(p) || (p.CurrentStock <= 0 && !isStored(p));
                      const warn = !low && !isStored(p) && p.MinStock > 0 && p.CurrentStock <= p.MinStock * 1.5;
                      const tone = low ? 'text-red-500' : warn ? 'text-amber-500' : isStored(p) ? 'text-slate-500' : 'text-emerald-500';
                      const bar = low ? 'bg-red-400' : warn ? 'bg-amber-400' : isStored(p) ? 'bg-slate-300' : 'bg-emerald-400';
                      const cap = Math.max(p.MaxStock || 0, p.MinStock * 2, p.CurrentStock, 1);
                      const pct = Math.min(100, Math.round((Math.max(p.CurrentStock, 0) / cap) * 100));
                      return (
                        <>
                          <div className="w-full grid grid-cols-2 gap-1 pt-2 border-t border-slate-100 mb-2">
                            <div className="text-left">
                              <p className="text-[10px] text-slate-500 font-bold uppercase">คงเหลือ</p>
                              <div className="flex items-center flex-wrap gap-1">
                                <p className={`text-lg font-black tabular-nums leading-tight ${tone}`}>{p.CurrentStock}</p>
                                <span className={`text-[9px] font-bold px-1.5 py-px rounded-full border whitespace-nowrap ${getStockState(p).chip}`}>{getStockState(p).label}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-500 font-bold uppercase">ราคา</p>
                              <p className="text-sm font-black text-slate-700 tabular-nums leading-tight mt-0.5">฿{p.LastPrice?.toLocaleString() ?? '—'}</p>
                            </div>
                          </div>
                          <div className="w-full h-1 rounded-full bg-slate-100 overflow-hidden mb-1">
                            <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-full flex justify-between text-[9px] text-slate-400 mb-2 tabular-nums">
                            <span>ขั้นต่ำ {p.MinStock}</span>
                            <span>สูงสุด {p.MaxStock || 'ไม่จำกัด'}</span>
                          </div>
                          <div className="w-full flex items-center gap-1.5 text-[10px] text-slate-500 mb-2 min-w-0">
                            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-px rounded shrink-0 text-white" style={{ backgroundColor: getChartColor(p.DeviceType) }}>{p.DeviceType}</span>
                            {managementTypeOf(p) !== 'Rotating' && (
                              <span title={managementTypeInfo(p).hint} className={`text-[9px] font-bold px-1.5 py-px rounded border shrink-0 ${managementTypeInfo(p).cls}`}>{managementTypeInfo(p).short}</span>
                            )}
                            <Archive size={11} className="shrink-0 text-slate-400" />
                            <span className="truncate">{p.Location || 'ยังไม่ระบุที่เก็บ'}</span>
                          </div>
                          <div className="flex w-full gap-1.5">
                            {canWithdraw && <button onClick={() => openCartModal(p)} disabled={p.CurrentStock <= 0} aria-label="ใส่ตะกร้า" title="ใส่ตะกร้า" className="w-8 shrink-0 flex items-center justify-center rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:border-slate-200 disabled:text-slate-300"><ShoppingCart size={13} /></button>}
                            {canWithdraw && <button onClick={() => openWithdrawModal(p)} disabled={p.CurrentStock <= 0} className="flex-1 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 shadow-sm disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">{p.CurrentStock <= 0 ? 'หมดแล้ว' : 'เบิก'}</button>}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ปรับยอดคงเหลือจริง */}
        {adjustItem && (
          <AdjustStockModal
            product={adjustItem}
            userId={(user?.username || '').toUpperCase()}
            onClose={() => setAdjustItem(null)}
            onDone={() => { setDetailItem(null); refreshData(); }}
            showToast={(message, type = 'success') => setToast({ type, message, duration: 2500 })}
          />
        )}

        {/* 8: modal เล็กสำหรับดูรูปขยาย */}
        {imagePreview && (
          <Portal>
            <div className="fixed inset-0 z-[80] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setImagePreview(null)}
              onKeyDown={(e) => { if (e.key === 'Escape') setImagePreview(null); }} tabIndex={-1} ref={(el) => el && el.focus()}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                  <p className="text-sm font-bold text-slate-700 truncate pr-3">{imagePreview.name}</p>
                  <button onClick={() => setImagePreview(null)} className="p-1 rounded-full hover:bg-slate-100 text-slate-500" aria-label="ปิด"><X size={16} /></button>
                </div>
                <div className="bg-slate-50 p-4 flex items-center justify-center">
                  <img src={imagePreview.src} alt={imagePreview.name} className="max-h-[60vh] w-auto object-contain rounded-lg" />
                </div>
              </div>
            </div>
          </Portal>
        )}

        {/* ✅ EMPTY STATE — บอกสาเหตุและทางออกให้ชัดเจน */}
        {sortedProducts.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center py-14 px-6 bg-white rounded-2xl border border-dashed border-slate-300">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3"><Search size={26} /></div>
            <p className="font-bold text-slate-700">ไม่พบอุปกรณ์ที่ตรงกับการค้นหา</p>
            <p className="text-sm text-slate-400 mt-1">ลองเปลี่ยนคำค้น หรือเอาตัวกรองออกเพื่อดูรายการทั้งหมด</p>
            {(searchTerm || selectedType !== 'all' || selectedMgmt !== 'all' || showLowStock) && (
              <button onClick={() => { setSearchTerm(''); setSelectedType('all'); setSelectedMgmt('all'); setShowLowStock(false); }} className="mt-4 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all">
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </motion.div>
        )}

        {/* ✅ BULK ACTION BAR — ปรากฏเมื่อเลือกรายการ */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <Portal>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[65] flex items-center gap-3 bg-slate-900 text-white rounded-2xl shadow-2xl pl-4 pr-2 py-2"
              >
                <span className="text-sm font-semibold">เลือกแล้ว {selectedIds.length} รายการ</span>
                <button onClick={bulkAddToCart} className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 rounded-xl px-3 py-2 text-sm font-bold transition-all">
                  <ShoppingCart size={15} /> ใส่ตะกร้าทั้งหมด
                </button>
                <button onClick={() => setSelectedIds([])} className="text-slate-300 hover:text-white text-sm font-semibold px-3 py-2 rounded-xl hover:bg-white/10 transition-all">
                  ยกเลิก
                </button>
              </motion.div>
            </Portal>
          )}
        </AnimatePresence>

        {/* ✅ RETURN CONFIRM — ต้องระบุเหตุผลก่อนคืนของ */}
        {returnTarget && (
          <Portal>
            <div className="fixed inset-0 z-[75] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !returning && setReturnTarget(null)}>
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-5 space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-800">คืนของจากการเบิกนี้?</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {historyItem?.ProductName} · จำนวน <b>{Math.abs(returnTarget.Qty)}</b> ชิ้น · เบิกเมื่อ {formatThaiDate(returnTarget.TransDate)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">สต็อกจะเพิ่มกลับ และประวัติเดิมจะยังคงอยู่ครบ</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1.5">เหตุผลการคืน <span className="text-red-500">*</span></label>
                    <textarea
                      autoFocus
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      placeholder="เช่น เบิกผิดรายการ / เปลี่ยนเป็นอีกชิ้น"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-amber-100 outline-none resize-none h-20"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button onClick={() => setReturnTarget(null)} disabled={returning} className="col-span-1 py-2 rounded-lg text-sm font-bold text-slate-500 border border-slate-200 hover:bg-slate-100 disabled:opacity-50">ยกเลิก</button>
                    <button onClick={handleReturn} disabled={!returnReason.trim() || returning} className="col-span-2 py-2 rounded-lg text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-md shadow-amber-200 disabled:opacity-50 disabled:shadow-none">
                      {returning ? 'กำลังบันทึก...' : 'ยืนยันคืนของ'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </Portal>
        )}

        {/* HISTORY MODAL */}
        {historyItem && (() => {
          // ใช้ยอดล่าสุดจากรายการอุปกรณ์ (ไม่ใช้ค่าที่เก็บตอนเปิดหน้าต่าง)
          const historyStock = products.find(p => p.ProductID === historyItem.ProductID)?.CurrentStock ?? historyItem.CurrentStock;
          return (
          <Portal>
            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-[96vw] max-w-6xl bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
                  <div className="flex justify-between items-start relative z-10">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 opacity-90"><List size={16} /><span className="text-xs font-bold uppercase tracking-wider">ประวัติอุปกรณ์</span></div>
                      <h3 className="font-black text-lg md:text-xl tracking-tight truncate">{historyItem.ProductName}</h3>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-white/20 border border-white/30 font-semibold">{historyItem.DeviceType}</span>
                        <span className="font-mono opacity-80">ID {historyItem.ProductID}</span>
                        <span className="opacity-80">· ที่เก็บ {historyItem.Location || 'ยังไม่ระบุ'}</span>
                        <span className="opacity-80">· คงเหลือ {historyStock ?? '—'} ชิ้น</span>
                      </div>
                    </div>
                    <button onClick={() => setHistoryItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
                  </div>
                </div>
                {(() => {
                  const isInRow = (h) => (h.TransType || '').toUpperCase().trim() === 'IN' || (h.RefInfo || '').toLowerCase().includes('invoice');
                  const isAdjRow = (h) => (h.TransType || '').toUpperCase().trim() === 'ADJ' || (h.RefInfo || '').includes('Adjust') || (h.RefInfo || '').startsWith('ADJ');
                  const outTotal = historyData.filter(h => !isInRow(h) && !isAdjRow(h) && !h.ReturnOf).reduce((s, h) => s + Math.abs(Number(h.Qty) || 0), 0);
                  const returnTotal = historyData.filter(h => h.ReturnOf).reduce((s, h) => s + Math.abs(Number(h.Qty) || 0), 0);
                  const tiles = [
                    { label: 'รายการทั้งหมด', value: historyData.length, tone: 'text-slate-700' },
                    { label: 'เบิกรวม (ชิ้น)', value: outTotal, tone: 'text-red-500' },
                    { label: 'คืนรวม (ชิ้น)', value: returnTotal, tone: 'text-emerald-600' },
                    { label: 'คงเหลือ (ชิ้น)', value: historyStock ?? '—', tone: 'text-indigo-600' },
                  ];
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 md:px-5 pt-4 bg-slate-50/50">
                      {tiles.map(t => (
                        <div key={t.label} className="bg-white rounded-xl border border-slate-200 px-3 py-2">
                          <p className="text-[11px] text-slate-500">{t.label}</p>
                          <p className={`text-lg font-bold tabular-nums ${t.tone}`}>{t.value}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="p-3 md:p-4 bg-slate-50/50 max-h-[44vh] overflow-y-auto">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-xs table-fixed [&_th]:px-2 [&_th]:py-2.5 [&_td]:px-2 [&_td]:py-2.5">
                      <colgroup>
                        <col className="w-[12%]" />
                        <col className="w-[7%]" />
                        <col className="w-[25%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                        <col className="w-[12%]" />
                        <col className="w-[11%]" />
                      </colgroup>
                      <thead className="bg-slate-50 border-b border-slate-100 uppercase text-xs font-bold text-slate-500 tracking-wider">
                        <tr>
                          <th className="p-4 whitespace-nowrap">วันที่</th>
                          <th className="p-4 text-center whitespace-nowrap">จำนวน</th>
                          <th className="p-4 whitespace-nowrap">เหตุผล</th>
                          <th className="p-4 whitespace-nowrap">User</th>
                          <th className="p-4 whitespace-nowrap">เบิกให้</th>
                          <th className="p-4 whitespace-nowrap">S/N</th>
                          <th className="p-4 whitespace-nowrap">รหัสครุภัณฑ์</th>
                          <th className="p-4 text-center whitespace-nowrap">คืนของ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {historyData.map((h, i) => (
                          <motion.tr key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-4 text-slate-600 font-medium whitespace-nowrap">{formatThaiDate(h.TransDate)}</td>
                            <td className="p-4 text-center whitespace-nowrap">
                              {(() => {
                                const inRow = (h.TransType || '').toUpperCase().trim() === 'IN' || (h.RefInfo || '').toLowerCase().includes('invoice');
                                return <span className={`inline-block min-w-[3rem] px-2 py-0.5 rounded-full border text-xs font-bold font-mono tabular-nums ${inRow ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>{inRow ? '+' : '-'}{Math.abs(h.Qty)}</span>;
                              })()}
                            </td>
                            <td className="p-4 text-slate-700 break-words">{h.RefInfo || '—'}</td>
                            <td className="p-4 text-xs text-slate-400 whitespace-nowrap uppercase">{(h.UserID || '-').toUpperCase()}</td>
                            <td className="p-4 text-slate-600 font-medium whitespace-nowrap">{h.EmployeeName || '-'}</td>
                            <td className="p-4 text-slate-500 font-mono text-xs break-all">{h.SerialNumber || '-'}</td>
                            <td className="p-4 text-slate-500 font-mono text-xs break-all">{h.FixedAssetCode || '-'}</td>
                            <td className="p-4 text-center whitespace-nowrap">
                              {h.ReturnOf ? (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">คืนของ (จากการเบิก #{h.ReturnOf})</span>
                              ) : h.ReturnedAt ? (
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">คืนแล้ว</span>
                              ) : isReturnableRow(h, isAdminUser) && canReturn ? (
                                <button
                                  onClick={() => { setReturnTarget(h); setReturnReason(''); }}
                                  className="text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-sm px-3 py-1.5 rounded-lg transition-all"
                                >
                                  คืนของ
                                </button>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          </motion.tr>
                        ))}
                        {historyData.length === 0 && <tr><td colSpan="8" className="p-8 text-center text-slate-400">ไม่มีประวัติ</td></tr>}
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
          );
        })()}

        {/* ✅ EDIT MODAL — ย้ายมาอยู่ใน JSX return ถูกต้องแล้ว */}
        {editItem && (
          <Portal>
            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
                <div className="relative overflow-hidden flex items-start gap-3 px-5 py-5 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 text-white">
                  <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                  <div className="relative w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center overflow-hidden bg-white shadow-lg">
                    <Package size={20} className={`absolute inset-0 m-auto ${getDeviceTypeColor(editItem.DeviceType).text}`} />
                    {editItem.ImageURL && <img loading="lazy" src={`${API_URL}${editItem.ImageURL}`} alt="" className="relative w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-200 mb-0.5">แก้ไขอุปกรณ์</p>
                    <h3 className="text-[16px] font-bold leading-snug truncate">{editItem.ProductName}</h3>
                    <span className="text-[11px] text-indigo-200 font-mono">ID {editItem.ProductID}</span>
                  </div>
                  <button onClick={() => setEditItem(null)} className="relative w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors shrink-0"><X size={15} /></button>
                </div>
                <form onSubmit={handleUpdate}>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* ซ้าย: ข้อมูลอุปกรณ์ */}
                    <section className="space-y-3">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">ข้อมูลอุปกรณ์</h4>
                      <Field label="ชื่ออุปกรณ์"><input name="ProductName" defaultValue={editItem.ProductName} required className={inlineCls} /></Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="หมวดหมู่">
                          <select name="DeviceType" defaultValue={editItem.DeviceType} className={inlineCls}>
                            {deviceTypes.map(t => <option key={t.TypeId} value={t.TypeId}>{t.Label}</option>)}
                          </select>
                        </Field>
                        <Field label="ราคา/หน่วย">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[13px] pointer-events-none">฿</span>
                            <input name="LastPrice" type="number" step="0.01" defaultValue={editItem.LastPrice} className={`${inlineCls} pl-6 font-mono`} />
                          </div>
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="ที่เก็บ">
                          <select name="Location" defaultValue={editItem.Location || ''} className={inlineCls}>
                            <option value="">-- ระบุตำแหน่ง --</option>
                            {locations.map(loc => <option key={loc.LocationID} value={loc.Name}>{loc.Name}</option>)}
                          </select>
                        </Field>
                        <Field label="บาร์โค้ด">
                          <div className="relative">
                            <ScanLine size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input name="BarcodeID" defaultValue={editItem.BarcodeID || ''} placeholder="สแกนหรือพิมพ์" className={`${inlineCls} pl-7 font-mono`} />
                          </div>
                        </Field>
                      </div>
                      <Field label="รูปอุปกรณ์">
                        <input type="file" name="imageFile" accept="image/*" className="w-full text-[11px] text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />
                      </Field>
                    </section>

                    {/* ขวา: สต็อค & ผู้ขาย */}
                    <section className="space-y-3">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">สต็อค & ผู้ขาย</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="คงเหลือ">
                          <div>
                            <span className="block px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-[13px] font-mono font-bold text-slate-700">{editItem.CurrentStock}</span>
                            <span className="block text-[10px] text-slate-400 mt-1">ปรับผ่านการนับ/เบิก/รับเข้า</span>
                          </div>
                        </Field>
                        <Field label="ความสำคัญ"><PriorityPicker name="business_priority" defaultValue={editItem.business_priority ?? 3} /></Field>
                      </div>
                      <Field label="การจัดการสต็อก">
                        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="การจัดการสต็อก">
                          {MANAGEMENT_TYPES.map(t => (
                            <label key={t.id} title={t.hint} className="cursor-pointer">
                              <input type="radio" name="ManagementType" value={t.id} defaultChecked={managementTypeOf(editItem) === t.id} className="peer sr-only" />
                              <span className="block text-center px-2 py-1.5 rounded-xl border border-slate-200 text-[12px] font-semibold text-slate-500 bg-white peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-200 transition-colors">{t.label}</span>
                            </label>
                          ))}
                        </div>
                        <span className="block text-[10px] text-slate-400 mt-1">หมุนเวียน: เตือน + คาดการณ์การสั่ง · อุปกรณ์สำรอง: เตือนเมื่อต่ำกว่าขั้นต่ำ · เก็บในคลัง: ไม่เตือน ไม่สั่ง</span>
                      </Field>
                      <Field label="ขั้นต่ำ / สูงสุด">
                        <div className="flex items-center gap-2">
                          <input name="MinStock" type="number" defaultValue={editItem.MinStock} className={`${inlineCls} font-mono flex-1`} />
                          <span className="text-slate-300 text-[13px] shrink-0">—</span>
                          <input name="MaxStock" type="number" min={0} defaultValue={editItem.MaxStock || 0} disabled={!editItem.MaxStock} className={`${inlineCls} font-mono flex-1 disabled:bg-slate-100 disabled:text-slate-400`} placeholder="ไม่จำกัด" />
                        </div>
                        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
                          <input type="checkbox" name="UnlimitedMax" defaultChecked={!editItem.MaxStock} className="accent-indigo-600"
                            onChange={(e) => { const inp = e.target.form?.elements.namedItem('MaxStock'); if (!inp) return; inp.disabled = e.target.checked; if (e.target.checked) inp.value = ''; else if (!inp.value) inp.value = '1'; }} />
                          ไม่จำกัดสูงสุด (ไม่เตือนสต็อกเกิน และไม่กำหนดจำนวนสั่งสูงสุด)
                        </label>
                      </Field>
                      <Field label="Vendor">
                        <select name="VendorID" defaultValue={editItem.VendorID || ''} className={inlineCls}>
                          <option value="">-- ไม่ระบุ --</option>
                          {vendors.map(v => <option key={v.VendorID} value={v.VendorID}>{v.VendorName} ({v.lead_time_days ?? 7} วัน)</option>)}
                        </select>
                      </Field>
                      <Field label="Lead time (วัน)">
                        <input type="number" name="lead_time_days" defaultValue={editItem.lead_time_days ?? 7} min={1} className={`${inlineCls} font-mono`} />
                      </Field>
                    </section>
                  </div>
                  <div className="flex gap-3 px-5 py-4 bg-slate-50 border-t border-slate-100">
                    <button type="button" onClick={() => setEditItem(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-[13px] py-2.5 rounded-xl transition-colors">ยกเลิก</button>
                    <button type="submit" className="flex-[2] bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-[13px] py-2.5 rounded-xl shadow-md shadow-indigo-200 transition-all">บันทึกการแก้ไข</button>
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
                    win.document.write(`<html><head><title>Barcode - ${escapeHtml(barcodeItem.ProductName)}</title><style>body{font-family:'Sarabun','Segoe UI',Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.label{border:2px dashed #e2e8f0;border-radius:16px;padding:24px;display:flex;flex-direction:column;align-items:center;gap:12px}@media print{body{margin:0}.label{border:none}}</style></head><body><div class="label">${printContents}</div></body></html>`);
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
              <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 overflow-hidden">

                {/* ── Header gradient ── */}
                <div className="p-5 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center overflow-hidden bg-white/20">
                      {detailItem.ImageURL
                        ? <img loading="lazy" src={`${API_URL}${detailItem.ImageURL}`} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        : <Package size={22} className="text-white" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30">{detailItem.DeviceType}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30">{managementTypeInfo(detailItem).label}</span>
                        {isLowStock(detailItem) && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/70 text-white border border-red-400/50">Low Stock</span>
                        )}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${detailItem.business_priority === 1 ? 'bg-red-500/70 text-white border-red-400/50' :
                          detailItem.business_priority === 2 ? 'bg-orange-400/70 text-white border-orange-300/50' :
                            detailItem.business_priority === 4 ? 'bg-green-500/70 text-white border-green-400/50' :
                              'bg-yellow-400/70 text-white border-yellow-300/50'
                          }`}>
                          {(['', 'Critical', 'High', 'Medium', 'Low'][detailItem.business_priority]) ?? 'Medium'}
                        </span>
                      </div>
                      <p className="font-bold text-[15px] text-white truncate leading-snug">{detailItem.ProductName}</p>
                      <p className="text-indigo-200 text-[11px] font-mono mt-0.5 opacity-80">ID: {detailItem.ProductID}</p>
                    </div>
                    <button onClick={() => setDetailItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors shrink-0">
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* ── Metric tiles ── */}
                <div className="grid grid-cols-4 gap-1.5 px-4 pt-3 pb-1">
                  {[
                    { label: 'คงเหลือ', value: detailItem.CurrentStock, color: isLowStock(detailItem) ? 'text-red-500' : 'text-emerald-600' },
                    { label: 'ขั้นต่ำ', value: detailItem.MinStock, color: 'text-slate-700' },
                    { label: 'สูงสุด', value: detailItem.MaxStock || 'ไม่จำกัด', color: 'text-slate-700' },
                    { label: 'ราคา/หน่วย', value: `฿${detailItem.LastPrice?.toLocaleString() ?? '—'}`, color: 'text-slate-700', sm: true },
                  ].map(({ label, value, color, sm }) => (
                    <div key={label} className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-slate-400 mb-1">{label}</p>
                      <p className={`font-bold leading-none ${sm ? 'text-[13px]' : 'text-[20px]'} ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* ── Detail: 2 คอลัมน์ ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                  {/* ซ้าย: ข้อมูลอุปกรณ์ */}
                  <section className="rounded-2xl border border-slate-100 bg-white p-4">
                    <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-indigo-500">ข้อมูลอุปกรณ์</h3>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {[
                        { label: 'ชื่ออุปกรณ์', value: detailItem.ProductName, span: true },
                        { label: 'หมวดหมู่', value: detailItem.DeviceType },
                        { label: 'การจัดการ', value: managementTypeInfo(detailItem).label },
                        { label: 'หน่วยนับ', value: detailItem.UnitOfMeasure || '—' },
                        { label: 'บาร์โค้ด', value: detailItem.BarcodeID || '—', mono: true, span: true },
                        { label: 'ที่เก็บ', value: detailItem.Location || 'ไม่ได้ระบุ', span: true },
                      ].map(({ label, value, mono, span }) => (
                        <div key={label} className={span ? 'col-span-2' : ''}>
                          <dt className="text-[11px] text-slate-400">{label}</dt>
                          <dd className={`text-[13px] font-medium text-slate-800 break-words ${mono ? 'font-mono' : ''}`}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  {/* ขวา: ราคา & Vendor */}
                  <section className="rounded-2xl border border-slate-100 bg-white p-4">
                    <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-indigo-500">ราคา & Vendor</h3>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {[
                        { label: 'ราคาต่อหน่วย', value: detailItem.LastPrice != null ? `฿${detailItem.LastPrice.toLocaleString()}` : '—' },
                        { label: 'มูลค่าสต็อค', value: detailItem.LastPrice != null ? `฿${(detailItem.LastPrice * detailItem.CurrentStock).toLocaleString()}` : '—', accent: true },
                        { label: 'Vendor', value: detailItem.VendorName || vendors.find(v => v.VendorID === detailItem.VendorID)?.VendorName || '—', span: true },
                        { label: 'Lead time', value: detailItem.lead_time_days ? `${detailItem.lead_time_days} วัน` : '—' },
                      ].map(({ label, value, accent, span }) => (
                        <div key={label} className={span ? 'col-span-2' : ''}>
                          <dt className="text-[11px] text-slate-400">{label}</dt>
                          <dd className={`text-[13px] font-semibold break-words ${accent ? 'text-indigo-600' : 'text-slate-800'}`}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  {/* ล่างเต็มแถว: ความสำคัญ & สถานะ */}
                  <section className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 flex flex-wrap items-center gap-x-8 gap-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-400">ความสำคัญ</span>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${detailItem.business_priority === 1 ? 'bg-red-50 text-red-700 border-red-200' :
                        detailItem.business_priority === 2 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                          detailItem.business_priority === 4 ? 'bg-green-50 text-green-700 border-green-200' :
                            'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }`}>
                        {(['', 'Critical', 'High', 'Medium', 'Low'][detailItem.business_priority]) ?? 'Medium'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-400">สถานะสต็อค</span>
                      {isLowStock(detailItem)
                        ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">ต่ำกว่าขั้นต่ำ</span>
                        : isStored(detailItem)
                        ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">เก็บในคลัง (ไม่เตือน)</span>
                        : <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">ปกติ</span>
                      }
                    </div>
                  </section>
                </div>

                {/* ── Footer ── */}
                <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex gap-2">
                  {canAdjust && <button onClick={() => { setAdjustItem(detailItem); }} className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[13px] py-2.5 rounded-xl transition-colors">ปรับยอดคงเหลือ</button>}
                  <button onClick={() => setDetailItem(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-[13px] py-2.5 rounded-xl transition-colors">ปิด</button>
                </div>

              </motion.div>
            </div>
          </Portal>
        )}

        {/* ✅ TOAST — แจ้งเตือนสั้น ๆ มุมล่างจอ */}
        <AnimatePresence>
          {toast && (
            <Portal>
              <motion.div
                key="inventory-toast"
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 bg-slate-900 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-2xl max-w-[90vw]"
              >
                <Check size={16} className="text-emerald-400 shrink-0" />
                <span className="truncate">{toast.message}</span>
              </motion.div>
            </Portal>
          )}
        </AnimatePresence>

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
        {/* ✅ เพิ่มตัวนี้ */}
        <EmployeeCodeModal
          isOpen={employeeModalOpen}
          onClose={() => { setEmployeeModalOpen(false); setPendingWithdraw(null); }}
          onConfirm={handleEmployeeConfirm}
        />

        {/* QTY & REASON MODAL */}
        <AnimatePresence>
          {qtyModal.isOpen && qtyModal.product && (
            <Portal>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className={`w-full ${qtyModal.product.DeviceType === 'Asset' ? 'max-w-4xl' : 'max-w-xl'} bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all`}>
                  <div className="relative overflow-hidden p-5 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 text-white flex justify-between items-center">
                    <h3 className="font-bold text-[15px] flex items-center gap-2">
                      {qtyModal.mode === 'cart' ? <ShoppingCart size={18} /> : <ShoppingBag size={18} />}
                      {qtyModal.mode === 'cart' ? 'เพิ่มลงตะกร้า' : 'เบิกด่วน'}
                    </h3>
                    <button onClick={() => setQtyModal({ isOpen: false, product: null, mode: 'cart' })} className="p-1 hover:bg-white/20 rounded-full"><X size={18} /></button>
                  </div>
                  <div className="p-3 bg-slate-50 border-b border-slate-100 flex gap-3">
                    <div id="qty-modal-thumb" className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getColorGradient(qtyModal.product.DeviceType)} flex items-center justify-center overflow-hidden`}>
                      {qtyModal.product.ImageURL ? <img loading="lazy" src={`${API_URL}${qtyModal.product.ImageURL}`} alt="" className="w-full h-full object-cover" /> : <Package size={20} className="text-white" />}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800 line-clamp-1">{qtyModal.product.ProductName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full shadow-sm" style={{ backgroundColor: getChartColor(qtyModal.product.DeviceType) }}>{qtyModal.product.DeviceType}</span>
                        <p className="text-xs text-slate-500">คงเหลือ: <span className="font-bold text-emerald-600">{qtyModal.product.CurrentStock}</span></p>
                      </div>
                    </div>
                  </div>
                  <div className="flex">
                  {qtyModal.mode === 'withdraw' && qtyModal.product && (() => {
                    const h = wdHistory.productId === qtyModal.product.ProductID ? wdHistory : { rows: [], loading: true };
                    const now = new Date();
                    const fmt = (d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
                    const monthQty = h.rows.filter(r => { const d = new Date(r.TransDate); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
                      .reduce((s, r) => s + Math.abs(Number(r.Qty) || 0), 0);
                    const last = h.rows[0];
                    return (
                      <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-100/80 p-3 space-y-2.5 text-[12px] select-none">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ข้อมูลอ้างอิง · ดูอย่างเดียว</p>
                      <div className="rounded-xl bg-white border border-slate-200 p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-600">คงเหลือ</span>
                          <span className="text-lg font-black tabular-nums text-slate-800">{qtyModal.product.CurrentStock}</span>
                        </div>
                        {(() => {
                          const cur = Number(qtyModal.product.CurrentStock) || 0;
                          const min = Number(qtyModal.product.MinStock) || 0;
                          const max = Math.max(Number(qtyModal.product.MaxStock) || 0, min, cur, 1);
                          const pct = (v) => Math.min(100, (v / max) * 100);
                          const low = isLowStock(qtyModal.product);
                          return (
                            <>
                              <div className="relative mt-2 h-2 rounded-full bg-slate-100">
                                <div className={`absolute inset-y-0 left-0 rounded-full ${low ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${pct(cur)}%` }} />
                                {min > 0 && <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-500" style={{ left: `${pct(min)}%` }} title="ขั้นต่ำ" />}
                              </div>
                              <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
                                <span>ขั้นต่ำ {min}</span>
                                <span>สูงสุด {Number(qtyModal.product.MaxStock) || 'ไม่จำกัด'}</span>
                              </div>
                              <p className="mt-2 text-[11px] text-slate-500">หลังเบิก <b className="text-slate-800">{Math.max(0, cur - selectQty)}</b> ชิ้น</p>
                            </>
                          );
                        })()}
                      </div>

                        <div className="flex items-center justify-between gap-2 font-bold text-slate-600">
                          <span>ประวัติการเบิก {h.loading ? '…' : `(${h.rows.length} ครั้ง)`}</span>
                          {!h.loading && last && <span className="font-normal text-slate-400">เดือนนี้ {monthQty} ชิ้น</span>}
                        </div>
                        <div className="rounded-xl bg-white/70 border border-slate-200 p-3">
                          {h.loading ? <p className="py-2 text-slate-400">กำลังโหลด…</p> : h.rows.length === 0 ? <p className="py-2 text-slate-400">ยังไม่เคยเบิกอุปกรณ์นี้</p> : (
                            <>
                              <p className="text-[11px] text-slate-500 mb-1">ล่าสุด {fmt(last.TransDate)} โดย <span className="font-bold text-slate-700">{last.EmployeeName || last.UserID}</span></p>
                              <ul className="divide-y divide-slate-100">
                                {h.rows.slice(0, 5).map(r => (
                                  <li key={r.TransID} className="py-1.5 flex items-center gap-2">
                                    <span className="text-slate-400 w-16 shrink-0 tabular-nums">{fmt(r.TransDate)}</span>
                                    <span className="flex-1 min-w-0">
                                      <span className="block truncate font-medium text-slate-700">{r.EmployeeName || r.UserID}</span>
                                      {r.CostCenter && <span className="block text-[10px] text-slate-400">แผนก {r.CostCenter}</span>}
                                    </span>
                                    <span className="font-bold tabular-nums text-slate-700">{Math.abs(Number(r.Qty) || 0)}</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      </aside>
                    );
                  })()}
                  <div className="p-4 space-y-3 flex-1 min-w-0 bg-white">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 -mb-2">กรอกข้อมูลการเบิก</p>
                    <div className="flex items-center gap-4 justify-center">
                      <button onClick={() => setSelectQty(Math.max(1, selectQty - 1))} disabled={qtyModal.product.DeviceType === 'Asset'} className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"><Minus size={16} /></button>
                      <div className="text-center">
                        <input type="number" value={selectQty} disabled={qtyModal.product.DeviceType === 'Asset'} onChange={(e) => setSelectQty(Math.max(1, Math.min(qtyModal.product.CurrentStock, parseInt(e.target.value) || 1)))} className="w-16 text-center text-xl font-black bg-transparent outline-none disabled:text-slate-400" />
                        <p className="text-[12px] text-slate-400 font-bold uppercase">จำนวน</p>
                      </div>
                      <button onClick={() => setSelectQty(Math.min(qtyModal.product.CurrentStock, selectQty + 1))} disabled={qtyModal.product.DeviceType === 'Asset'} className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"><Plus size={16} /></button>
                    </div>
                    <p className="text-center text-[11px] text-slate-400 -mt-3">
                      {qtyModal.product.DeviceType === 'Asset' ? 'คงเหลือ 1 ชิ้นต่อ S/N' : `คงเหลือหลังเบิก ${Math.max(0, qtyModal.product.CurrentStock - selectQty)} ชิ้น`}
                    </p>
                    {qtyModal.product.DeviceType === 'Asset' && (
                      <p className="text-center text-[15px] text-amber-600 font-medium -mt-3">Asset เบิกได้ครั้งละ 1 ชิ้นต่อ S/N</p>
                    )}
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">เหตุผลการเบิก</label>
                      <div className="grid grid-cols-2 gap-2">
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
                        <div className="flex items-center gap-2 mb-1.5 opacity-70"><FileEdit size={12} /><span className="text-xs font-bold">รายละเอียดเพิ่มเติม <span className="text-red-500">*</span></span></div>
                        <textarea value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none resize-none h-14" placeholder="เช่น ระบุชื่อโปรเจกต์ หรือหมายเลขแจ้งซ่อม..." />
                      </div>
                      {/* ✅ S/N + รหัสครุภัณฑ์ + รหัสพนักงาน (Asset) ย้ายไปคอลัมน์ขวา ดูด้านล่าง */}
                      {qtyModal.mode === 'withdraw' && qtyModal.product.DeviceType !== 'Asset' && (
                        <div className="pt-2">
                          {user?.empcode && (
                            <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
                              <input type="checkbox" checked={selfUse} onChange={(e) => { setSelfUse(e.target.checked); if (e.target.checked) resetEmpLookup(); }} className="w-4 h-4 accent-indigo-600" />
                              <span className="text-xs font-bold text-slate-600">เบิกใช้เอง (ผู้ login: {user?.name || user?.empcode})</span>
                            </label>
                          )}
                          {!selfUse && <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">ค้นหาชื่อผู้ใช้งานจริง (ที่ไม่ใช่ไอที) ด้วยรหัสพนักงาน</label>}
                          {selfUse ? null : !empData ? (
                            <>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={empCode}
                                  onChange={(e) => { setEmpCode(e.target.value); setEmpError(''); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter' && empCode.trim() && !empLoading) { e.preventDefault(); lookupEmployee(); } }}
                                  placeholder="รหัสพนักงาน แล้วกด Enter"
                                  autoComplete="off"
                                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
                                />
                                <button
                                  onClick={lookupEmployee}
                                  disabled={!empCode.trim() || empLoading}
                                  className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                >
                                  {empLoading ? 'กำลังค้นหา...' : 'ค้นหา'}
                                </button>
                              </div>
                              {empError && (
                                <p className="text-red-500 font-bold mt-2 flex items-center gap-1.5 text-xs">
                                  <AlertTriangle size={14} /> {empError}
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
                              <div className="text-sm">
                                <p className="font-bold text-emerald-700">{empData.FirstName} {empData.LastName}</p>
                                <p className="text-emerald-600 text-xs font-mono">{empData.FormattedName} · {empData.CostCenter || '-'}</p>
                              </div>
                              <button onClick={resetEmpLookup} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 shrink-0">
                                เปลี่ยน
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* ✅ คอลัมน์ที่ 2 — เฉพาะ Asset: รหัสครุภัณฑ์ + S/N + รหัสพนักงาน */}
                  {qtyModal.product.DeviceType === 'Asset' && (
                    <div className="w-64 shrink-0 border-l border-slate-100 bg-slate-50/60 p-5 space-y-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><ScanLine size={13} /> ต้องกรอก Fixed Asset , S/N , รหัสพนักงาน</p>
                      <div>
                        <div className="flex items-center gap-2 mb-1.5"><span className="text-xs font-bold text-slate-500">รหัสครุภัณฑ์ (Fixed asset code) <span className="text-red-500">*</span></span></div>
 <input
                          type="text"
                          value={assetFixedCode}
                          onChange={(e) => setAssetFixedCode(nextFixedAssetCode(e.target.value, assetFixedCode))}
                          placeholder="เช่น CO24-001-05 หรือ OF24-001-05"
                          maxLength={11}
                          className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100 ${
                            assetCodeCheck.status === 'duplicate' ? 'border-red-400' :
                            !isValidFixedAssetCode(assetFixedCode) ? 'border-red-300' : 'border-slate-200'
                          }`}
                        />
                        <p className={`text-[12px] mt-1 ${
                          assetCodeCheck.status === 'duplicate' ? 'text-red-500 font-bold' :
                          assetCodeCheck.status === 'ok' ? 'text-emerald-500' :
                          assetCodeCheck.status === 'checking' ? 'text-slate-400' :
                          assetFixedCode && !isValidFixedAssetCode(assetFixedCode) ? 'text-red-500' : 'text-slate-400'
                        }`}>
                          {assetCodeCheck.message || 'รูปแบบ: (CO|OF)XX-XXX-XX (ตัวเลขล้วน)'}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1.5"><span className="text-xs font-bold text-slate-500">หมายเลขเครื่อง (S/N) <span className="text-red-500">*</span></span></div>
                        <input
                          type="text"
                          value={assetSerialNumber}
                          onChange={(e) => setAssetSerialNumber(e.target.value)}
                          placeholder="สแกนหรือกรอก S/N"
                          className={`w-full bg-white border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 ${!assetSerialNumber.trim() ? 'border-red-300' : 'border-slate-200'}`}
                        />
                      </div>
                      {/* ✅ รหัสพนักงาน — ย้ายมาอยู่คอลัมน์ขวาด้วยเมื่อเป็น Asset */}
                      {qtyModal.mode === 'withdraw' && (
                        <div className="pt-2 border-t border-slate-200">
                          {user?.empcode && (
                            <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
                              <input type="checkbox" checked={selfUse} onChange={(e) => { setSelfUse(e.target.checked); if (e.target.checked) resetEmpLookup(); }} className="w-4 h-4 accent-indigo-600" />
                              <span className="text-xs font-bold text-slate-600">เบิกใช้เอง (ผู้ login: {user?.name || user?.empcode})</span>
                            </label>
                          )}
                          {!selfUse && <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">ค้นหาชื่อผู้ใช้งานจริง (ที่ไม่ใช่ไอที) ด้วยรหัสพนักงาน</label>}
                          {selfUse ? null : !empData ? (
                            <>
                              <div className="flex flex-col gap-2">
                                <input
                                  type="text"
                                  value={empCode}
                                  onChange={(e) => { setEmpCode(e.target.value); setEmpError(''); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter' && empCode.trim() && !empLoading) { e.preventDefault(); lookupEmployee(); } }}
                                  placeholder="รหัสพนักงาน แล้วกด Enter"
                                  autoComplete="off"
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-100 outline-none"
                                />
                                <button
                                  onClick={lookupEmployee}
                                  disabled={!empCode.trim() || empLoading}
                                  className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {empLoading ? 'กำลังค้นหา...' : 'ค้นหา'}
                                </button>
                              </div>
                              {empError && (
                                <p className="text-red-500 font-bold mt-2 flex items-center gap-1.5 text-xs">
                                  <AlertTriangle size={14} /> {empError}
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-col gap-2">
                              <div className="text-sm">
                                <p className="font-bold text-emerald-700">{empData.FirstName} {empData.LastName}</p>
                                <p className="text-emerald-600 text-xs font-mono">{empData.FormattedName} · {empData.CostCenter || '-'}</p>
                              </div>
                              <button onClick={resetEmpLookup} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 self-start">
                                เปลี่ยน
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                  {(() => {
                    const missing = [];
                    if (qtyModal.mode === 'withdraw' && !(selfUse ? user?.empcode : empData)) missing.push('ผู้รับ (รหัสพนักงาน หรือเบิกใช้เอง)');
                    if (!reasonDetail.trim()) missing.push('รายละเอียดเพิ่มเติม');
                    if (qtyModal.product.DeviceType === 'Asset') {
                      if (!isValidFixedAssetCode(assetFixedCode) || assetCodeCheck.status !== 'ok') missing.push('รหัสครุภัณฑ์ที่ถูกต้อง');
                      if (!assetSerialNumber.trim()) missing.push('S/N');
                    }
                    return missing.length ? (
                      <div className="px-4 pt-3 bg-slate-50 text-[12px] text-amber-700 flex items-start gap-1.5">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span>ยังต้องกรอก: {missing.join(' · ')}</span>
                      </div>
                    ) : null;
                  })()}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                    <button onClick={() => setQtyModal({ isOpen: false, product: null, mode: 'cart' })}
                      className="px-5 py-2 text-sm rounded-lg border border-slate-200 bg-white font-bold text-slate-500 hover:bg-slate-100 transition-all">
                      ยกเลิก
                    </button>

                    <div className="relative group shrink-0">
                        <button onClick={handleQtyConfirm}
                        disabled={
                          !reasonDetail.trim() ||
                          (qtyModal.product.DeviceType === 'Asset' && (!assetSerialNumber.trim() || !isValidFixedAssetCode(assetFixedCode))) ||
                          (qtyModal.product.DeviceType === 'Asset' && assetCodeCheck.status !== 'ok') ||   // ✅ เพิ่ม
                          (qtyModal.mode === 'withdraw' && !(selfUse ? user?.empcode : empData))
                        }
                        className={`px-6 py-2 min-w-[10rem] whitespace-nowrap text-sm rounded-lg font-bold text-white shadow-md transition-all
            disabled:opacity-40 disabled:cursor-not-allowed
            ${qtyModal.mode === 'cart' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                        {qtyModal.mode === 'cart' ? 'ยืนยัน' : `เบิก ${qtyModal.product.DeviceType === 'Asset' ? 1 : selectQty} ชิ้น`}
                      </button>
                    </div>


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
                      <div className="flex flex-col items-center justify-center h-full text-center px-6 text-slate-400">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-300 flex items-center justify-center mb-3"><ShoppingCart size={30} /></div>
                        <p className="font-bold text-slate-600">ยังไม่มีรายการในตะกร้า</p>
                        <p className="text-xs mt-1">กดปุ่ม <span className="font-bold text-indigo-500">ใส่ตะกร้า</span> ที่อุปกรณ์ที่ต้องการ หรือเลือกหลายรายการในหน้ารายการ</p>
                      </div>
                    ) : cart.map(item => (
                      <div key={item.ProductID} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group">
                        <button onClick={() => removeFromCart(item.ProductID)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 p-1"><X size={16} /></button>
                        <div className="flex gap-3 mb-3">
                          <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getColorGradient(item.DeviceType)} flex items-center justify-center shrink-0 overflow-hidden`}>
                            {item.ImageURL ? <img loading="lazy" src={`${API_URL}${item.ImageURL}`} alt="" className="w-full h-full object-cover" /> : <Package size={18} className="text-white" />}
                          </div>
                          <div className="pr-6">
                            <h4 className="font-bold text-slate-800 text-sm line-clamp-1">{item.ProductName}</h4>
                            <p className="text-xs text-slate-400 font-mono mb-1">{item.ProductID}</p>
                            <div className="inline-flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded text-[10px] font-bold text-indigo-600 border border-indigo-100"><span>{item.reason}</span></div>
                          </div>
                        </div>
                        {item.DeviceType === 'Asset' && (
                          <div className="text-[10px] text-slate-500 font-mono mb-2 flex gap-3">
                            <span>S/N: {item.serialNumber || '-'}</span>
                            <span>FA: {item.fixedAssetCode || '-'}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                          <div className="text-xs text-slate-400">คงเหลือ: {item.CurrentStock}</div>
                          <div className="flex items-center gap-3 bg-slate-100 rounded-lg p-1">
                            <button onClick={() => updateCartQty(item.ProductID, item.qty - 1)} disabled={item.DeviceType === 'Asset'} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-indigo-600 disabled:opacity-30"><Minus size={14} /></button>
                            <span className="font-bold text-sm w-4 text-center">{item.qty}</span>
                            <button onClick={() => updateCartQty(item.ProductID, item.qty + 1)} disabled={item.DeviceType === 'Asset'} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-indigo-600 disabled:opacity-30"><Plus size={14} /></button>
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
                        <button onClick={confirmWithdrawAll} className="col-span-2 bg-indigo-600 text-white font-bold py-2 rounded-lg text-sm hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2"><Check size={16} /> ยืนยันการเบิก</button>
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
                      {scanModal.error && (
                        <div className="mt-4 text-left bg-red-50 border border-red-100 rounded-xl p-3">
                          <p className="text-red-600 font-bold flex items-center gap-2 text-sm"><AlertTriangle size={16} /> {scanModal.error}</p>
                          <p className="text-red-400 text-xs mt-1">ลองตรวจสอบรหัสอีกครั้ง หรือพิมพ์ชื่ออุปกรณ์บางส่วนเพื่อค้นหา</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-50">
                      <div className="p-5 bg-white rounded-b-2xl shadow-sm z-10 relative">
                        <div className="flex gap-4">
                          <div className={`w-20 h-20 rounded-xl bg-gradient-to-br ${getColorGradient(scanModal.foundProduct.DeviceType)} flex items-center justify-center shadow-md overflow-hidden border-2 border-white`}>
                            {scanModal.foundProduct.ImageURL ? <img loading="lazy" src={`${API_URL}${scanModal.foundProduct.ImageURL}`} alt="" className="w-full h-full object-cover" /> : <Package size={28} className="text-white" />}
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
                            <p className="mt-2 text-sm font-bold text-emerald-600 flex items-center gap-1"><Check size={14} /> พบอุปกรณ์แล้ว (คงเหลือ: {scanModal.foundProduct.CurrentStock})</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
                          <span className="font-bold text-slate-600 pl-2">จำนวนที่จะเบิก</span>
                          <div className="flex items-center gap-3">
                            <button onClick={() => setScanQty(Math.max(1, scanQty - 1))} disabled={scanModal.foundProduct.DeviceType === 'Asset'} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 disabled:opacity-30"><Minus size={16} /></button>
                            <span className="font-bold text-xl w-8 text-center">{scanQty}</span>
                            <button onClick={() => setScanQty(Math.min(scanModal.foundProduct.CurrentStock, scanQty + 1))} disabled={scanModal.foundProduct.DeviceType === 'Asset'} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 disabled:opacity-30"><Plus size={16} /></button>
                          </div>
                        </div>
                        {scanModal.foundProduct.DeviceType === 'Asset' && (
                          <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-slate-200">
                            <div>
                              <input
                                type="text"
                                value={scanFixedCode}
                                onChange={(e) => setScanFixedCode(nextFixedAssetCode(e.target.value, scanFixedCode))}
                                placeholder="รหัสครุภัณฑ์ เช่น CO24-001-05"
                                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-100 ${!isValidFixedAssetCode(scanFixedCode) ? 'border-red-300' : 'border-slate-200'}`}
                              />
                              <p className={`text-[10px] mt-1 ${scanFixedCode && !isValidFixedAssetCode(scanFixedCode) ? 'text-red-500' : 'text-slate-400'}`}>รูปแบบ: COXX-XXX-XX</p>
                            </div>
                            <input
                              type="text"
                              value={scanSerialNumber}
                              onChange={(e) => setScanSerialNumber(e.target.value)}
                              placeholder="หมายเลขเครื่อง (S/N) *"
                              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-100 ${!scanSerialNumber.trim() ? 'border-red-300' : 'border-slate-200'}`}
                            />
                          </div>
                        )}
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">เหตุผลการเบิก</p>
                          <div className="grid grid-cols-2 gap-2">
                            {reasonOptions.map(opt => (
                              <button key={opt.ReasonID} onClick={() => setScanReason(opt.Label)} aria-pressed={scanReason === opt.Label} className={`p-2 rounded-xl text-sm font-bold border transition-all ${scanReason === opt.Label ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>{opt.Label}</button>
                            ))}
                          </div>
                          <input type="text" placeholder="รายละเอียดเพิ่มเติม (Optional)..." className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none" value={scanReasonDetail} onChange={e => setScanReasonDetail(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <button onClick={() => setScanModal({ isOpen: false, scannedCode: '', foundProduct: null, error: '' })} className="col-span-1 py-2 rounded-lg font-bold text-slate-500 hover:bg-slate-100 transition-all border border-slate-200 text-sm">ยกเลิก</button>
                          <button
                            onClick={handleScanWithdraw}
                            disabled={scanModal.foundProduct.CurrentStock <= 0 || (scanModal.foundProduct.DeviceType === 'Asset' && (!scanSerialNumber.trim() || !isValidFixedAssetCode(scanFixedCode)))}
                            className="col-span-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg shadow-md hover:shadow-lg transition-all text-sm disabled:opacity-50 disabled:shadow-none"
                          >ยืนยันการเบิก</button>
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
