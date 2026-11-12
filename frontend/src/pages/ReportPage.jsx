import React, { useState, useMemo, useEffect } from 'react';
import { FileSpreadsheet, Calendar, Download, CheckSquare, Square, Package, TrendingUp, TrendingDown, BarChart3, PieChart, FileText, Receipt, DollarSign, Clock, User, AlertCircle, Shield, SlidersHorizontal, X, Filter, Monitor } from 'lucide-react';
import { BarChart, Bar, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, LabelList } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import AlertModal from '../components/AlertModal';
import { getChartColor, getBadgeStyle } from '../utils/styleHelpers';
import { formatThaiDateShort } from '../utils/formatDate';
import { API_BASE, API_URL } from '../config/api';

// ─── Helper: check if date falls in range ────────────────────────────────────
const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// หมวดหมู่ของหน้า Report — ภาพรวมเคลื่อนไหวเท่านั้น สถานะปัจจุบัน (Stock หมด / MA ใกล้หมดอายุ) อยู่ที่ Dashboard
const ABC_STYLE = {
    A: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    B: 'bg-amber-50 border-amber-200 text-amber-700',
    C: 'bg-slate-50 border-slate-200 text-slate-600',
};

const REPORT_TABS = [
    { id: 'overview', label: 'ภาพรวมการเคลื่อนไหว', icon: BarChart3 },
    { id: 'stock', label: 'Stock & มูลค่า', icon: Package },
    { id: 'usage', label: 'การเบิก', icon: User },
    { id: 'procurement', label: 'จัดซื้อ', icon: Receipt },
];

// key รูปแบบ "YYYY-MM" ใช้แยกเดือนเดียวกันของคนละปีออกจากกัน
const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabelOf = (key) => MONTHS_TH[Number(key.slice(5)) - 1];

// 6 เดือนล่าสุด (เก่า → ใหม่)
const recentMonthKeys = (count = 6) => {
    const now = new Date();
    return Array.from({ length: count }, (_, i) =>
        monthKeyOf(new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1))
    );
};

// กฎการนับความเคลื่อนไหว: ไม่รวม Invoice ที่ยกเลิกและรายการปรับยอดนับสต็อก
const isCountedMovement = (t) => {
    const ref = t.RefInfo || '';
    return !ref.includes('ยกเลิก Invoice') && !ref.includes('Stock Count Adjust');
};

// วันที่แบบ YYYY-MM-DD ตาม timezone เครื่อง
const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// แปลง preset ของตัวกรองเป็นช่วงวันที่ (ตรงกับ isInDateRange)
const presetRange = (preset, customStart, customEnd) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (preset) {
        case 'thisMonth':
            return { start: toDateKey(new Date(y, m, 1)), end: toDateKey(new Date(y, m + 1, 0)) };
        case 'last3months': {
            const start = new Date(now);
            start.setMonth(start.getMonth() - 3);
            return { start: toDateKey(start), end: toDateKey(now) };
        }
        case 'thisQuarter': {
            const q = Math.floor(m / 3) * 3;
            return { start: toDateKey(new Date(y, q, 1)), end: toDateKey(new Date(y, q + 3, 0)) };
        }
        case 'thisYear': {
            const startYear = m < 3 ? y - 1 : y;
            return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
        }
        case 'custom':
            return { start: customStart || '', end: customEnd || '' };
        default:
            return { start: '', end: '' };
    }
};

// ใช้ presetRange เป็นแหล่งเดียวของกฎช่วงวันที่ (หน้าจอและ Export ใช้กฎเดียวกัน)
const isInDateRange = (dateStr, preset, customStart, customEnd) => {
    if (!dateStr) return true;
    const { start, end } = presetRange(preset, customStart, customEnd);
    if (!start && !end) return true; // 'all' หรือ custom ที่ยังไม่กรอก
    const key = toDateKey(new Date(dateStr));
    return (!start || key >= start) && (!end || key <= end);
};

const DAY_MS = 86400000;

// แสดงวันที่แบบสั้นจาก key "YYYY-MM-DD"
const fmtDateKey = (key) => new Date(`${key}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

// % เปลี่ยนแปลง (null ถ้าไม่มีฐานเทียบ)
const pctChange = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

// ปุ่ม "ดูทั้งหมด" / "แสดงน้อยลง" — ไม่แสดงถ้ารายการไม่เกินจำนวนที่กำหนด
const ToggleAllButton = ({ total, limit, expanded, onToggle }) => {
    if (total <= limit) return null;
    return (
        <button
            type="button"
            onClick={onToggle}
            className="mt-3 w-full text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg py-2 border border-dashed border-indigo-200 transition-colors"
        >
            {expanded ? 'แสดงน้อยลง' : `ดูทั้งหมด (${total} รายการ)`}
        </button>
    );
};

// StatCard Component
const StatCard =({ icon: Icon, title, value, subtitle, color }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow"
    >
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm text-slate-600 mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
                {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
            </div>
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
                <Icon className="w-6 h-6 text-white" />
            </div>
        </div>
    </motion.div>
);

const ReportPage = () => {
    const { products, deviceTypes, purchaseOrders, invoices, transactions } = useData();
    const typeLabel = useMemo(
        () => Object.fromEntries((deviceTypes || []).map(t => [t.TypeId, t.Label])),
        [deviceTypes]
    );
    const [selectedTypes, setSelectedTypes] = useState(['products']);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
    const [maItems, setMaItems] = useState([]);

    // ─── Power BI-style Filter States ────────────────────────────────────────
    const [filterDateRange, setFilterDateRange] = useState('all');       // 'all','thisMonth','last3months','thisQuarter','thisYear','custom'
    const [filterCustomStart, setFilterCustomStart] = useState('');
    const [filterCustomEnd, setFilterCustomEnd] = useState('');
    const [filterCategories, setFilterCategories] = useState([]);         // e.g. ['Notebook','Desktop']
    const [filterTransType, setFilterTransType] = useState('all');        // 'all','IN','OUT'
    const [clickedCategory, setClickedCategory] = useState(null);         // chart click-to-filter
    const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [expandedMonth, setExpandedMonth] = useState(null);
    const [expandedLists, setExpandedLists] = useState({});  // ดูทั้งหมด: key -> true/false
    const toggleList = (key) => setExpandedLists(prev => ({ ...prev, [key]: !prev[key] }));

    useEffect(() => {
        const timer = setTimeout(() => setIsMounted(true), 500);
        return () => clearTimeout(timer);
    }, []);

    const datePresets = [
        { id: 'all', label: 'ทั้งหมด' },
        { id: 'thisMonth', label: 'เดือนนี้' },
        { id: 'last3months', label: '3 เดือน' },
        { id: 'thisQuarter', label: 'ไตรมาสนี้' },
        { id: 'thisYear', label: 'ปีงบประมาณ' },
        { id: 'custom', label: 'กำหนดเอง' },
    ];

    const toggleCategory = (cat) => {
        setFilterCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
        setClickedCategory(null);
    };

    const handleChartCategoryClick = (categoryName) => {
        if (clickedCategory === categoryName) {
            setClickedCategory(null);
            setFilterCategories([]);
        } else {
            setClickedCategory(categoryName);
            setFilterCategories([categoryName]);
        }
    };

    const clearAllFilters = () => {
        setFilterDateRange('all');
        setFilterCustomStart('');
        setFilterCustomEnd('');
        setFilterCategories([]);
        setFilterTransType('all');
        setClickedCategory(null);
        setShowCustomDatePicker(false);
    };

    const activeFilterCount = (filterDateRange !== 'all' ? 1 : 0)
        + filterCategories.length
        + (filterTransType !== 'all' ? 1 : 0);

    const [maLoadError, setMaLoadError] = useState(false);
    useEffect(() => {
        fetch(`${API_BASE}/ma`)
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(data => { setMaItems(Array.isArray(data) ? data : []); setMaLoadError(false); })
            .catch(err => { console.error('Failed to load MA data in reports', err); setMaLoadError(true); });
    }, []);

    const [forecastItems, setForecastItems] = useState([]);
    const [forecastError, setForecastError] = useState(false);
    useEffect(() => {
        fetch(`${API_BASE}/forecast`)
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(data => { setForecastItems(Array.isArray(data) ? data : []); setForecastError(false); })
            .catch(err => { console.error('Failed to load forecast', err); setForecastError(true); });
    }, []);

    // ─── แท็บหมวดหมู่ (เก็บใน URL ?tab=...) ─────────────────────────────────
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = REPORT_TABS.some(t => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
    const setActiveTab = (id) => setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', id);
        return next;
    }, { replace: true });

    // ค้นหาสินค้าจาก ProductID แบบ O(1) แทนการ .find() ซ้ำในทุกรอบ render
    const productById = useMemo(
        () => Object.fromEntries((products || []).map(p => [p.ProductID, p])),
        [products]
    );
    const usageMap = useMemo(() => {
        const map = {};
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        (transactions || []).forEach(t => {
            const type = (t.TransType || '').toUpperCase().trim();
            const refInfo = t.RefInfo || '';
            const date = new Date(t.TransDate);
            if (
                type === 'OUT' &&
                date >= threeMonthsAgo &&
                !refInfo.includes('ยกเลิก Invoice') &&
                !refInfo.includes('Stock Count Adjust')
            ) {
                map[t.ProductID] = (map[t.ProductID] || 0) + Math.abs(t.Qty);
            }
        });
        return map;
    }, [transactions]);
    // Calculate stats from real data
    const totalProducts = products.length;
    const totalValue = products.reduce((sum, p) => sum + (p.CurrentStock * (p.LastPrice || 0)), 0);
    const lowStockCount = products.filter(p => p.CurrentStock <= p.MinStock && p.MinStock > 0).length;
    const pendingPOCount = (purchaseOrders || []).filter(po => po.Status !== 'Completed').length;
    const transactionCount = (transactions || []).filter(isCountedMovement).length;

    // MA Stats
    // Active = ยังไม่ยกเลิก/Pending และยังไม่หมดอายุ (Expiring/Expired คำนวณจาก EndDate)
    const activeMACount = maItems.filter(i => i.Status !== 'Cancelled' && i.Status !== 'Pending' && (!i.EndDate || new Date(i.EndDate) >= new Date(new Date().toDateString()))).length;
    const maAlerts = useMemo(() => {
        return maItems
            .filter(ma => {
                if (ma.Status === 'Cancelled' || !ma.EndDate) return false;
                const daysRemaining = Math.ceil((new Date(ma.EndDate) - new Date()) / (1000 * 60 * 60 * 24));
                return daysRemaining <= 90;
            })
            .map(ma => {
                const daysRemaining = Math.ceil((new Date(ma.EndDate) - new Date()) / (1000 * 60 * 60 * 24));
                return { ...ma, daysRemaining };
            })
            .sort((a, b) => a.daysRemaining - b.daysRemaining);
    }, [maItems]);
    const expiringMACount = maAlerts.length;

    // ─── Filtered Data (affected by Power BI filters) ────────────────────────
    const filteredTransactions = useMemo(() => {
        return (transactions || []).filter(t => {
            if (!isInDateRange(t.TransDate, filterDateRange, filterCustomStart, filterCustomEnd)) return false;
            if (filterTransType !== 'all') {
                const type = (t.TransType || '').toUpperCase().trim();
                if (type !== filterTransType) return false;
            }
            if (filterCategories.length > 0) {
                const product = productById[t.ProductID];
                if (!filterCategories.includes(product?.DeviceType)) return false;
            }
            // ✅ เพิ่มตรงนี้
            const refInfo = t.RefInfo || '';
            if (refInfo.includes('ยกเลิก Invoice')) return false;
            if (refInfo.includes('Stock Count Adjust')) return false;
            return true;
        });
    }, [transactions, products, productById, filterDateRange, filterCustomStart, filterCustomEnd, filterTransType, filterCategories]);

    const filteredProducts = useMemo(() => {
        if (filterCategories.length === 0) return products;
        return products.filter(p => filterCategories.includes(p.DeviceType));
    }, [products, filterCategories]);


    // Category distribution for pie chart - Fix: Use full 'products' so other slices stay visible for blur effect
    const categoryData = deviceTypes.map((t, idx) => ({
        id: t.TypeId,
        name: t.Label,
        value: products.filter(p => p.DeviceType === t.TypeId).length,
        color: getChartColor(t.TypeId)
    })).filter(c => c.value > 0);

    // Calculate real stock movement from transactions (quantity-based)
    const stockMovementData = useMemo(() => {
        const dataMap = {};
        recentMonthKeys().forEach(key => {
            dataMap[key] = { month: monthLabelOf(key), inbound: 0, outbound: 0 };
        });

        filteredTransactions.forEach(t => {
            const bucket = dataMap[monthKeyOf(new Date(t.TransDate))];
            if (!bucket || !isCountedMovement(t)) return;
            const type = (t.TransType || '').toUpperCase().trim();
            const qty = Math.abs(t.Qty);
            if (type === 'IN') bucket.inbound += qty;
            if (type === 'OUT') bucket.outbound += qty;
        });

        return Object.values(dataMap);
    }, [filteredTransactions]);

    // NEW: Cost & Usage Analysis (Money-based)
    const costAnalysisData = useMemo(() => {
        const dataMap = {};
        recentMonthKeys().forEach(key => {
            dataMap[key] = { month: monthLabelOf(key), spending: 0, consumption: 0 };
        });

        // Create product price lookup
        const priceMap = {};
        products.forEach(p => {
            priceMap[p.ProductID] = p.LastPrice || 0;
        });

        // Sum transactions by month (value-based)
        filteredTransactions.forEach(t => {
            const bucket = dataMap[monthKeyOf(new Date(t.TransDate))];
            if (!bucket || !isCountedMovement(t)) return;
            const type = (t.TransType || '').toUpperCase().trim();
            const value = Math.abs(t.Qty) * (priceMap[t.ProductID] || 0);
            if (type === 'IN') bucket.spending += value;
            if (type === 'OUT') bucket.consumption += value;
        });

        return Object.values(dataMap);
    }, [filteredTransactions, products]);

    // NEW: Slow Moving Items (No OUT transactions in last 3 months)
    // deadStockAll = ทุกรายการที่ค้าง (ใช้คำนวณมูลค่า), slowMovingItems = 10 อันดับแรก (ใช้แสดงผล)
    const deadStockAll = useMemo(() => {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const activeProductIds = new Set();
        (transactions || []).forEach(t => {
            const date = new Date(t.TransDate);
            const type = (t.TransType || '').toUpperCase().trim();
            if (type === 'OUT' && date >= threeMonthsAgo && isCountedMovement(t)) {
                activeProductIds.add(t.ProductID);
            }
        });

        return filteredProducts
            .filter(p => !activeProductIds.has(p.ProductID) && p.CurrentStock > 0)
            .sort((a, b) => (b.CurrentStock * (b.LastPrice || 0)) - (a.CurrentStock * (a.LastPrice || 0)));
    }, [transactions, filteredProducts]);
    const slowMovingItems = deadStockAll; // ตัดจำนวนตอนแสดงผล (ดูทั้งหมดได้)

    // ─── Stock Analytics (ไม่รับผลจากตัวกรองด้านบน: ใช้ประวัติทั้งหมดและกรอบเวลาคงที่) ───
    const stockAnalytics = useMemo(() => {
        const DAY = 86400000;
        const now = Date.now();
        const lastOut = {}; // ProductID -> เวลาเบิกล่าสุด
        const out12m = {};  // ProductID -> จำนวนเบิก 12 เดือน
        const out3m = {};   // ProductID -> จำนวนเบิก 3 เดือน

        (transactions || []).forEach(t => {
            if (!isCountedMovement(t) || (t.TransType || '').toUpperCase().trim() !== 'OUT') return;
            const ts = new Date(t.TransDate).getTime();
            if (Number.isNaN(ts)) return;
            const qty = Math.abs(t.Qty) || 0;
            if (!lastOut[t.ProductID] || ts > lastOut[t.ProductID]) lastOut[t.ProductID] = ts;
            const ageDays = (now - ts) / DAY;
            if (ageDays <= 365) out12m[t.ProductID] = (out12m[t.ProductID] || 0) + qty;
            if (ageDays <= 90) out3m[t.ProductID] = (out3m[t.ProductID] || 0) + qty;
        });

        const active = products.filter(p => p.IsActive !== 0);
        const price = p => p.LastPrice || 0;

        // ABC: เรียงตามมูลค่าการเบิก 12 เดือน แบ่ง A (80%) / B (ถัดมา 15%) / C (ที่เหลือ 5%)
        const abcBase = active
            .filter(p => (out12m[p.ProductID] || 0) > 0)
            .map(p => ({ ProductID: p.ProductID, ProductName: p.ProductName, DeviceType: p.DeviceType, value: out12m[p.ProductID] * price(p) }))
            .sort((a, b) => b.value - a.value);
        const abcTotal = abcBase.reduce((s, r) => s + r.value, 0);
        let running = 0;
        const abcRows = abcBase.map(r => {
            const before = abcTotal > 0 ? running / abcTotal : 0;
            running += r.value;
            return { ...r, cls: before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C' };
        });
        const abcSummary = { A: { count: 0, value: 0 }, B: { count: 0, value: 0 }, C: { count: 0, value: 0 } };
        abcRows.forEach(r => { abcSummary[r.cls].count += 1; abcSummary[r.cls].value += r.value; });
        ['A', 'B', 'C'].forEach(c => { abcSummary[c].share = abcTotal > 0 ? Math.round((abcSummary[c].value / abcTotal) * 100) : 0; });

        // Stock Aging: มูลค่าคงเหลือแยกตามเวลาตั้งแต่เบิกล่าสุด
        const agingDefs = [
            { key: '0-90', label: 'เบิกใน 90 วัน', test: d => d <= 90 },
            { key: '91-180', label: '91–180 วัน', test: d => d > 90 && d <= 180 },
            { key: '181-365', label: '181–365 วัน', test: d => d > 180 && d <= 365 },
            { key: '365+', label: 'เกิน 1 ปี', test: d => d > 365 },
            { key: 'never', label: 'ไม่เคยเบิก', test: d => d === null },
        ];
        const agingBuckets = agingDefs.map(def => ({ ...def, count: 0, value: 0 }));
        active.filter(p => (p.CurrentStock || 0) > 0).forEach(p => {
            const days = lastOut[p.ProductID] ? (now - lastOut[p.ProductID]) / DAY : null;
            const bucket = agingBuckets.find(b => b.test(days));
            if (!bucket) return;
            bucket.count += 1;
            bucket.value += p.CurrentStock * price(p);
        });
        const agingTotal = agingBuckets.reduce((s, b) => s + b.value, 0);

        // Days of Stock: คงเหลือจะใช้หมดในกี่วัน (อิงอัตราเบิก 3 เดือน)
        const daysOfStock = active
            .filter(p => (out3m[p.ProductID] || 0) > 0)
            .map(p => {
                const daily = out3m[p.ProductID] / 90;
                return { ProductID: p.ProductID, ProductName: p.ProductName, DeviceType: p.DeviceType, CurrentStock: p.CurrentStock || 0, daily, days: (p.CurrentStock || 0) / daily };
            })
            .sort((a, b) => a.days - b.days);

        // Overstock: คงเหลือเกิน MaxStock
        const overstockAll = active
            .filter(p => (p.MaxStock || 0) > 0 && (p.CurrentStock || 0) > p.MaxStock)
            .map(p => ({ ProductID: p.ProductID, ProductName: p.ProductName, DeviceType: p.DeviceType, CurrentStock: p.CurrentStock, MaxStock: p.MaxStock, excess: (p.CurrentStock - p.MaxStock) * price(p) }))
            .sort((a, b) => b.excess - a.excess);
        const overstockValue = overstockAll.reduce((s, r) => s + r.excess, 0);

        return { abcRows, abcSummary, abcTotal, agingBuckets, agingTotal, daysOfStock, overstockAll, overstockCount: overstockAll.length, overstockValue };
    }, [transactions, products]);

    // 2. สรุปมูลค่าเบิกใช้รายเดือน
    const monthlyConsumptionSummary = useMemo(() => {
        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
        const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

        const priceMap = {};
        products.forEach(p => { priceMap[p.ProductID] = p.LastPrice || 0; });

        let thisMonthQty = 0, thisMonthValue = 0;
        let lastMonthQty = 0, lastMonthValue = 0;
        let thisMonthIn = 0, lastMonthIn = 0;

        (transactions || []).forEach(t => {
            const d = new Date(t.TransDate);
            const type = (t.TransType || '').toUpperCase().trim();
            const refInfo = t.RefInfo || '';
            if (refInfo.includes('ยกเลิก Invoice')) return;
            if (refInfo.includes('Stock Count Adjust')) return;

            const qty = Math.abs(t.Qty);
            const value = qty * (priceMap[t.ProductID] || 0);
            const isThis = d.getMonth() === thisMonth && d.getFullYear() === thisYear;
            const isLast = d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;

            if (type === 'OUT') {
                if (isThis) { thisMonthQty += qty; thisMonthValue += value; }
                if (isLast) { lastMonthQty += qty; lastMonthValue += value; }
            }
            if (type === 'IN') {
                if (isThis) thisMonthIn += value;
                if (isLast) lastMonthIn += value;
            }
        });

        const qtyChange = lastMonthQty > 0
            ? ((thisMonthQty - lastMonthQty) / lastMonthQty * 100).toFixed(1)
            : null;
        const valueChange = lastMonthValue > 0
            ? ((thisMonthValue - lastMonthValue) / lastMonthValue * 100).toFixed(1)
            : null;

        return {
            thisMonthQty, thisMonthValue, thisMonthIn,
            lastMonthQty, lastMonthValue, lastMonthIn,
            qtyChange, valueChange
        };
    }, [transactions, products]);

    // 3. MoM comparison (เดือนนี้ vs เดือนก่อน)
    const momData = useMemo(() => {
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
            'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const now = new Date();
        const priceMap = {};
        products.forEach(p => { priceMap[p.ProductID] = p.LastPrice || 0; });

        const result = [];
        for (let i = 2; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const m = d.getMonth();   // ← เพิ่ม
            const y = d.getFullYear(); // ← เพิ่ม
            const key = monthKeyOf(d);
            let inQty = 0, outQty = 0, inValue = 0, outValue = 0;

            (transactions || []).forEach(t => {
                const td = new Date(t.TransDate);
                if (td.getMonth() !== m || td.getFullYear() !== y) return;
                const type = (t.TransType || '').toUpperCase().trim();
                const refInfo = t.RefInfo || '';
                if (refInfo.includes('ยกเลิก Invoice')) return;
                if (refInfo.includes('Stock Count Adjust')) return;
                const qty = Math.abs(t.Qty);
                const val = qty * (priceMap[t.ProductID] || 0);
                if (type === 'IN') { inQty += qty; inValue += val; }
                if (type === 'OUT') { outQty += qty; outValue += val; }
            });

            result.push({ key, month: months[m], inQty, outQty, inValue, outValue });
        }
        return result;
    }, [transactions, products]);

    // ─── เทียบช่วงก่อนหน้า: ช่วงที่เลือกในตัวกรอง vs ช่วงความยาวเท่ากันก่อนหน้า (รับผลจากหมวดหมู่) ───
    const periodComparison = useMemo(() => {
        const { start, end } = presetRange(filterDateRange, filterCustomStart, filterCustomEnd);
        if (!start || !end) return null;
        const startTs = new Date(`${start}T00:00:00`).getTime();
        const endTs = new Date(`${end}T00:00:00`).getTime();
        const days = Math.round((endTs - startTs) / DAY_MS) + 1;
        const prevEndKey = toDateKey(new Date(startTs - DAY_MS));
        const prevStartKey = toDateKey(new Date(startTs - days * DAY_MS));

        const sumRange = (from, to) => {
            const acc = { inValue: 0, outValue: 0, count: 0 };
            (transactions || []).forEach(t => {
                if (!isCountedMovement(t)) return;
                const d = new Date(t.TransDate);
                if (Number.isNaN(d.getTime())) return;
                const key = toDateKey(d);
                if (key < from || key > to) return;
                const product = productById[t.ProductID];
                if (filterCategories.length > 0 && !filterCategories.includes(product?.DeviceType)) return;
                const type = (t.TransType || '').toUpperCase().trim();
                if (type !== 'IN' && type !== 'OUT') return;
                const value = Math.abs(t.Qty) * (product?.LastPrice || 0);
                if (type === 'IN') acc.inValue += value;
                else acc.outValue += value;
                acc.count += 1;
            });
            return acc;
        };

        return {
            days,
            prevStart: prevStartKey,
            prevEnd: prevEndKey,
            current: sumRange(start, end),
            previous: sumRange(prevStartKey, prevEndKey),
        };
    }, [transactions, productById, filterDateRange, filterCustomStart, filterCustomEnd, filterCategories]);

    // ─── Procurement analytics: กรองตามวันที่ขอซื้อ (RequestDate) ของตัวกรองด้านบน ───
    const procurementAnalytics = useMemo(() => {
        const now = Date.now();
        const todayKey = toDateKey(new Date());
        const pos = (purchaseOrders || []).filter(po => isInDateRange(po.RequestDate, filterDateRange, filterCustomStart, filterCustomEnd));

        // ใบรับของแรกของแต่ละ PO (ไม่นับ Invoice ที่ยกเลิก)
        const firstReceiveTs = {};
        (invoices || []).forEach(inv => {
            if (!inv.PO_ID || !inv.ReceiveDate || inv.Status === 'Cancelled') return;
            const ts = new Date(inv.ReceiveDate).getTime();
            if (Number.isNaN(ts)) return;
            if (firstReceiveTs[inv.PO_ID] === undefined || ts < firstReceiveTs[inv.PO_ID]) firstReceiveTs[inv.PO_ID] = ts;
        });

        const STATUS_ORDER = ['Pending', 'Open', 'Partial', 'Completed', 'Cancelled'];
        const statusCount = Object.fromEntries(STATUS_ORDER.map(s => [s, 0]));
        const agingDefs = [
            { key: 'a', label: '≤ 7 วัน', max: 7 },
            { key: 'b', label: '8–30 วัน', max: 30 },
            { key: 'c', label: '31–90 วัน', max: 90 },
            { key: 'd', label: 'เกิน 90 วัน', max: Infinity },
        ];
        const openAging = agingDefs.map(d => ({ ...d, count: 0 }));
        let overdueCount = 0;
        const leadDays = [];
        let onTimeBase = 0, onTimeHit = 0;
        const budgetMap = {};
        const vendorMap = {};

        pos.forEach(po => {
            const status = po.Status || 'Open';
            statusCount[status] = (statusCount[status] || 0) + 1;

            const reqTs = po.RequestDate ? new Date(po.RequestDate).getTime() : NaN;
            const isOpen = status !== 'Completed' && status !== 'Cancelled';
            if (isOpen && !Number.isNaN(reqTs)) {
                const age = Math.max(0, Math.floor((now - reqTs) / DAY_MS));
                openAging.find(d => age <= d.max).count += 1;
            }
            if (isOpen && po.DueDate && toDateKey(new Date(po.DueDate)) < todayKey) overdueCount += 1;

            // Lead time = วันรับของแรก − วันขอซื้อ ; ตรงกำหนด = รับภายในวัน DueDate
            const rec = firstReceiveTs[po.PO_ID];
            let lead = null;
            let onTime = null;
            if (rec !== undefined && !Number.isNaN(reqTs)) {
                lead = Math.max(0, Math.round((rec - reqTs) / DAY_MS));
                leadDays.push(lead);
                if (po.DueDate) {
                    onTime = toDateKey(new Date(rec)) <= toDateKey(new Date(po.DueDate));
                    onTimeBase += 1;
                    if (onTime) onTimeHit += 1;
                }
            }

            const ordered = (po.Items || []).reduce((s, i) => s + (Number(i.QtyOrdered) || 0) * (Number(i.UnitCost) || 0), 0);
            const received = (po.Items || []).reduce((s, i) => s + (Number(i.QtyReceived) || 0) * (Number(i.UnitCost) || 0), 0);

            const budgetName = po.BudgetNo || 'ไม่ระบุ';
            const b = budgetMap[budgetName] || (budgetMap[budgetName] = { name: budgetName, ordered: 0, received: 0, count: 0 });
            b.ordered += ordered; b.received += received; b.count += 1;

            const vendorName = po.VendorName || 'ไม่ระบุ';
            const v = vendorMap[vendorName] || (vendorMap[vendorName] = { name: vendorName, ordered: 0, count: 0, leadSum: 0, leadCount: 0, onTimeBase: 0, onTimeHit: 0 });
            v.ordered += ordered; v.count += 1;
            if (lead !== null) { v.leadSum += lead; v.leadCount += 1; }
            if (onTime !== null) { v.onTimeBase += 1; if (onTime) v.onTimeHit += 1; }
        });

        const sortedLead = [...leadDays].sort((a, b) => a - b);
        const medianLead = sortedLead.length ? sortedLead[Math.floor(sortedLead.length / 2)] : null;
        const avgLead = sortedLead.length ? Math.round((sortedLead.reduce((s, x) => s + x, 0) / sortedLead.length) * 10) / 10 : null;

        const budgetRows = Object.values(budgetMap).sort((a, b) => b.ordered - a.ordered);
        const vendorRows = Object.values(vendorMap)
            .map(v => ({
                ...v,
                avgLead: v.leadCount > 0 ? Math.round((v.leadSum / v.leadCount) * 10) / 10 : null,
                onTimeRate: v.onTimeBase > 0 ? Math.round((v.onTimeHit / v.onTimeBase) * 100) : null,
            }))
            .sort((a, b) => b.ordered - a.ordered);

        return {
            totalPOs: pos.length,
            openCount: pos.filter(po => po.Status !== 'Completed' && po.Status !== 'Cancelled').length,
            statusCount,
            statusOrder: STATUS_ORDER,
            openAging,
            overdueCount,
            medianLead,
            avgLead,
            onTimeRate: onTimeBase > 0 ? Math.round((onTimeHit / onTimeBase) * 100) : null,
            budgetRows,
            vendorRows,
        };
    }, [purchaseOrders, invoices, filterDateRange, filterCustomStart, filterCustomEnd]);

    // ─── MA Renewal: pipeline การต่ออายุ + พยากรณ์ค่าต่ออายุ 12 เดือน ───
    // ค่า Price ถือเป็นมูลค่าของสัญญาหนึ่งรอบ (ตรงกับหน้า MA) และนับในเดือนที่ EndDate
    const maRenewal = useMemo(() => {
        const now = new Date();
        const todayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const pipeline = { none: { count: 0, value: 0 }, QUOTATION: { count: 0, value: 0 }, PR_CREATED: { count: 0, value: 0 }, WAITING_PO: { count: 0, value: 0 }, PO_ISSUED: { count: 0, value: 0 } };
        const overdue = { count: 0, value: 0 };   // หมดอายุแล้วและยังไม่ออก PO
        const horizon = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            return { key: monthKeyOf(d), label: `${MONTHS_TH[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`, count: 0, value: 0 };
        });
        const monthIndex = Object.fromEntries(horizon.map((h, i) => [h.key, i]));

        (maItems || []).forEach(item => {
            if (item.Status === 'Cancelled' || item.Status === 'Pending' || !item.EndDate) return;
            const end = new Date(item.EndDate);
            if (Number.isNaN(end.getTime())) return;
            const endTs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
            const days = Math.round((endTs - todayTs) / DAY_MS);
            const price = Number(item.Price) || 0;
            const step = item.RenewalStatus && pipeline[item.RenewalStatus] ? item.RenewalStatus : 'none';

            if (days <= 90) {
                pipeline[step].count += 1;
                pipeline[step].value += price;
            }
            if (days < 0 && step !== 'PO_ISSUED') {
                overdue.count += 1;
                overdue.value += price;
            }
            if (days >= 0 && days <= 365) {
                const idx = monthIndex[monthKeyOf(end)];
                if (idx !== undefined) {
                    horizon[idx].count += 1;
                    horizon[idx].value += price;
                }
            }
        });

        return {
            pipeline,
            pipelineCount: Object.values(pipeline).reduce((s, x) => s + x.count, 0),
            overdue,
            forecast: horizon,
            forecastCount: horizon.reduce((s, h) => s + h.count, 0),
            forecastValue: horizon.reduce((s, h) => s + h.value, 0),
        };
    }, [maItems]);

    // Calculate total dead stock value
    const deadStockValue = deadStockAll.reduce((sum, p) => sum + (p.CurrentStock * (p.LastPrice || 0)), 0);

    // NEW: Top Consumers (Users who withdraw the most)
    const topConsumers = useMemo(() => {
        const userMap = {};

        const priceMap = {};
        products.forEach(p => { priceMap[p.ProductID] = p.LastPrice || 0; });

        filteredTransactions.forEach(t => {
            const type = (t.TransType || '').toUpperCase().trim();
            const refInfo = t.RefInfo || '';

            if (
                type === 'OUT' &&
                !refInfo.includes('ยกเลิก Invoice') &&
                !refInfo.includes('Stock Count Adjust')
            ) {
                const userId = t.UserID || 'Unknown';
                if (!userMap[userId]) {
                    userMap[userId] = { userId, totalQty: 0, totalValue: 0, transactionCount: 0 };
                }
                const qty = Math.abs(t.Qty);
                const price = priceMap[t.ProductID] || 0;

                userMap[userId].totalQty += qty;
                userMap[userId].totalValue += qty * price;
                userMap[userId].transactionCount += 1;
            }
        });

        return Object.values(userMap)
            .sort((a, b) => b.totalValue - a.totalValue);
    }, [filteredTransactions, products]);

    // NEW: Top Withdrawn Items (Most withdrawn products)
    const topWithdrawnItems = useMemo(() => {
        const itemMap = {};

        const productMap = {};
        products.forEach(p => { productMap[p.ProductID] = p; });

        filteredTransactions.forEach(t => {
            const type = (t.TransType || '').toUpperCase().trim();
            const refInfo = t.RefInfo || '';

            if (
                type === 'OUT' &&
                !refInfo.includes('ยกเลิก Invoice') &&
                !refInfo.includes('Stock Count Adjust')
            ) {
                const productId = t.ProductID;
                const product = productMap[productId];

                if (!itemMap[productId]) {
                    itemMap[productId] = {
                        productId,
                        productName: product?.ProductName || `ID: ${productId}`,
                        deviceType: product?.DeviceType || '-',
                        totalQty: 0,
                        totalValue: 0,
                        transactionCount: 0
                    };
                }
                const qty = Math.abs(t.Qty);
                const price = product?.LastPrice || 0;
                itemMap[productId].totalQty += qty;
                itemMap[productId].totalValue += qty * price;
                itemMap[productId].transactionCount += 1;
            }
        });

        return Object.values(itemMap)
            .sort((a, b) => b.totalQty - a.totalQty);
    }, [filteredTransactions, products]);

    // NEW: Withdrawals By Category
    const withdrawalsByCategory = useMemo(() => {
        const catMap = {};
        filteredTransactions.forEach(t => {
            const type = (t.TransType || '').toUpperCase().trim();
            if (type === 'OUT' && isCountedMovement(t)) {
                const product = productById[t.ProductID];
                const category = product?.DeviceType || 'ไม่ระบุ';
                if (!catMap[category]) {
                    catMap[category] = { name: category, label: typeLabel[category] ?? category, value: 0, transactionCount: 0 };
                }
                catMap[category].value += Math.abs(t.Qty);
                catMap[category].transactionCount += 1;
            }
        });
        return Object.values(catMap).sort((a, b) => b.value - a.value);
    }, [filteredTransactions, productById, typeLabel]);

    // NEW: Stock Value by Category (Bubble-style)
    const stockValueByCategory = useMemo(() => {
        const catMap = {};
        filteredProducts.forEach(p => {
            const cat = p.DeviceType || 'ไม่ระบุ';
            if (!catMap[cat]) catMap[cat] = { name: cat, value: 0, qty: 0, items: 0 };
            catMap[cat].value += (p.CurrentStock * (p.LastPrice || 0));
            catMap[cat].qty += p.CurrentStock;
            catMap[cat].items += 1;
        });
        return Object.values(catMap)
            .map(c => ({ ...c, label: typeLabel[c.name] ?? c.name, color: getChartColor(c.name) }))
            .sort((a, b) => b.value - a.value);
    }, [filteredProducts, typeLabel]);

    // NEW: Net Movement Trend (IN minus OUT per month)
    const netMovementTrend = useMemo(() => {
        const dataMap = {};
        recentMonthKeys().forEach(key => {
            dataMap[key] = { month: monthLabelOf(key), inbound: 0, outbound: 0, net: 0 };
        });
        filteredTransactions.forEach(t => {
            const bucket = dataMap[monthKeyOf(new Date(t.TransDate))];
            if (!bucket || !isCountedMovement(t)) return;
            const type = (t.TransType || '').toUpperCase().trim();
            const qty = Math.abs(t.Qty);
            if (type === 'IN') bucket.inbound += qty;
            if (type === 'OUT') bucket.outbound += qty;
        });
        Object.values(dataMap).forEach(m => { m.net = m.inbound - m.outbound; });
        return Object.values(dataMap);
    }, [filteredTransactions]);

    const [showExport, setShowExport] = useState(false);

    const dataOptions = [
        { id: 'products', label: 'Inventory / Products', description: 'อุปกรณ์ทั้งหมดและจำนวนคงเหลือ', icon: Package, color: 'from-blue-500 to-blue-600' },
        { id: 'lowstock', label: 'รายการต่ำกว่า Min Stock', description: 'คำนวณ (MaxStock - CurrentStock) × ราคา', icon: TrendingDown, color: 'from-red-500 to-red-600' },
        { id: 'transactions', label: 'Transaction History', description: 'ประวัติรับ-เบิกทั้งหมด', icon: TrendingUp, color: 'from-purple-500 to-purple-600' },
        { id: 'invoices', label: 'Invoice Records', description: 'ข้อมูล Invoice ทั้งหมด', icon: Receipt, color: 'from-pink-500 to-pink-600' },
        { id: 'pos', label: 'Purchase Orders', description: 'ใบสั่งซื้อทั้งหมด', icon: FileText, color: 'from-orange-500 to-orange-600' },
        { id: 'slowmoving', label: '🐢 อุปกรณ์ค้างสต็อค', description: 'ไม่มีการเบิกใน 3 เดือนล่าสุด (Dead Stock)', icon: Clock, color: 'from-yellow-500 to-yellow-600' },
        { id: 'topwithdrawn', label: '🔥 อุปกรณ์เบิกมากสุด', description: 'อันดับอุปกรณ์ที่ถูกเบิกมากที่สุด', icon: TrendingUp, color: 'from-rose-500 to-rose-600' },
        { id: 'topconsumers', label: '👤 ผู้เบิกมากสุด', description: 'อันดับผู้ใช้ที่เบิกมากที่สุด', icon: User, color: 'from-cyan-500 to-cyan-600' },
        { id: 'bycategory', label: '📂 เบิกตามประเภท', description: 'สรุปยอดเบิกแยกตามประเภทอุปกรณ์', icon: PieChart, color: 'from-emerald-500 to-emerald-600' },
        { id: 'pcinventory', label: '💻 PC Inventory ทั้งหมด', description: 'รายละเอียด PC/อุปกรณ์ IT ทั้งหมด', icon: Package, color: 'from-indigo-500 to-purple-600' },
        { id: 'moinventory', label: '🖥️ Monitor Inventory ทั้งหมด', description: 'รายละเอียด Monitor/อุปกรณ์ IT ทั้งหมด', icon: Monitor, color: 'from-teal-500 to-cyan-600' },
        { id: 'expiringma', label: '⏰ สัญญาที่ใกล้หมดอายุ', description: 'MA & License ที่หมดอายุภายใน 90 วันข้างหน้า', icon: AlertCircle, color: 'from-red-500 to-orange-600' },
        { id: 'ma', label: '🛡️ สัญญาบริการ (MA & License) ทั้งหมด', description: 'ส่งออกข้อมูลสัญญา ค่าใช้จ่ายรายสัปดาห์/รายปี', icon: Shield, color: 'from-blue-600 to-indigo-600' }
    ];

    const toggleType = (typeId) => {
        if (selectedTypes.includes(typeId)) {
            setSelectedTypes(selectedTypes.filter(t => t !== typeId));
        } else {
            setSelectedTypes([...selectedTypes, typeId]);
        }
    };

    const handleExport = async () => {
        if (selectedTypes.length === 0) {
            setAlertModal({ isOpen: true, type: 'warning', title: 'กรุณาเลือกข้อมูล', message: 'กรุณาเลือกอย่างน้อย 1 ประเภทข้อมูลเพื่อ Export' });
            return;
        }
        if (startDate && endDate && startDate > endDate) {
            setAlertModal({ isOpen: true, type: 'warning', title: 'ช่วงวันที่ไม่ถูกต้อง', message: 'วันที่เริ่มต้องไม่มากกว่าวันที่สิ้นสุด' });
            return;
        }

        setIsExporting(true);

        try {
            // ช่วงวันที่ในแผง Export มีความสำคัญกว่า preset ด้านบน ถ้าไม่กรอกจึงใช้ preset
            const preset = presetRange(filterDateRange, filterCustomStart, filterCustomEnd);
            const effectiveStart = startDate || preset.start;
            const effectiveEnd = endDate || preset.end;

            const params = new URLSearchParams();
            params.append('types', selectedTypes.join(','));
            if (effectiveStart) params.append('startDate', effectiveStart);
            if (effectiveEnd) params.append('endDate', effectiveEnd);
            if (filterCategories.length > 0) params.append('categories', filterCategories.join(','));
            if (filterTransType !== 'all') params.append('transType', filterTransType);

            const response = await fetch(`${API_BASE}/report/export?${params.toString()}`);

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const now = new Date(); // ใช้วันที่ตาม timezone เครื่อง ไม่ใช้ toISOString (UTC)
                const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                a.download = `report_${today}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                setAlertModal({ isOpen: true, type: 'success', title: 'Export สำเร็จ!', message: 'ไฟล์รายงานถูกดาวน์โหลดเรียบร้อยแล้ว' });
            } else {
                setAlertModal({ isOpen: true, type: 'error', title: 'Export ล้มเหลว', message: 'ไม่สามารถสร้างรายงานได้ กรุณาลองใหม่' });
            }
        } catch (err) {
            console.error('Export error:', err);
            setAlertModal({ isOpen: true, type: 'error', title: 'Connection Error', message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">

            {/* ═══ Power BI Filter Bar ════════════════════════════════════════ */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden"
            >
                {/* Top Row: Date + Type + Categories + Actions */}
                <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100">
                    {/* Filter Icon Label */}
                    <div className="flex items-center gap-2 text-slate-500 shrink-0">
                        <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Filters</span>
                    </div>
                    <div className="w-px h-5 bg-slate-200" />

                    {/* Date Range Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-slate-400 font-medium">📅</span>
                        {datePresets.map(p => (
                            <button
                                key={p.id}
                                onClick={() => {
                                    setFilterDateRange(p.id);
                                    setShowCustomDatePicker(p.id === 'custom');
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterDateRange === p.id
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-5 bg-slate-200 hidden md:block" />

                    {/* Transaction Type Toggle */}
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                        {[{ id: 'all', label: 'ทั้งหมด' }, { id: 'IN', label: '⬇ รับ' }, { id: 'OUT', label: '⬆ เบิก' }].map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => setFilterTransType(opt.id)}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterTransType === opt.id
                                    ? opt.id === 'IN'
                                        ? 'bg-emerald-500 text-white shadow-sm'
                                        : opt.id === 'OUT'
                                            ? 'bg-rose-500 text-white shadow-sm'
                                            : 'bg-white text-slate-700 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Clear All + Active Count */}
                    {activeFilterCount > 0 && (
                        <button
                            onClick={clearAllFilters}
                            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-xs font-bold"
                        >
                            <X className="w-3.5 h-3.5" />
                            ล้าง Filter ({activeFilterCount})
                        </button>
                    )}
                </div>

                {/* Custom Date Picker */}
                <AnimatePresence>
                    {showCustomDatePicker && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="flex items-center gap-3 px-5 py-3 bg-indigo-50 border-b border-indigo-100">
                                <span className="text-xs font-bold text-indigo-600">กำหนดช่วงวันที่:</span>
                                <input type="date" value={filterCustomStart} onChange={e => setFilterCustomStart(e.target.value)}
                                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-indigo-400 bg-white" />
                                <span className="text-xs text-slate-400">ถึง</span>
                                <input type="date" value={filterCustomEnd} onChange={e => setFilterCustomEnd(e.target.value)}
                                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-indigo-400 bg-white" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Category Chips Row */}
                <div className="flex flex-wrap items-center gap-2 px-5 py-3">
                    <span className="text-xs text-slate-400 font-medium shrink-0">📂 ประเภท:</span>
                    <button
                        onClick={() => { setFilterCategories([]); setClickedCategory(null); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filterCategories.length === 0
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'}`}
                    >
                        ทั้งหมด
                    </button>
                    {deviceTypes.map(dt => {
                        const isActive = filterCategories.includes(dt.TypeId);
                        const isClicked = clickedCategory === dt.TypeId;
                        return (
                            <button
                                key={dt.TypeId}
                                onClick={() => toggleCategory(dt.TypeId)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${isActive
                                    ? 'border-indigo-400 text-indigo-700 bg-indigo-50 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'}`}
                            >
                                {isClicked && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />}
                                {dt.Label}
                                <span className={`text-[10px] px-1 rounded ${isActive ? 'bg-indigo-200 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {filteredProducts.filter(p => p.DeviceType === dt.TypeId).length}
                                </span>
                            </button>
                        );
                    })}

                    {/* Active filter summary right side */}
                    {activeFilterCount > 0 && (
                        <span className="ml-auto text-xs text-indigo-600 font-semibold bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-200">
                            🎯 กรองแล้ว: {filteredTransactions.length} รายการ จาก {(transactions || []).length}
                        </span>
                    )}
                </div>
            </motion.div>

            {/* ═══ แท็บหมวดหมู่ ═══ */}
            <div role="tablist" className="flex gap-2 overflow-x-auto pb-1 px-1">
                {REPORT_TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${isActive
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'}`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>
            {activeTab === 'overview' && (<>
            {/* ═══ เทียบกับช่วงก่อนหน้า ═══ */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-5 shadow-lg border border-slate-200"
            >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                        <h3 className="font-bold text-slate-800 text-sm">เทียบกับช่วงก่อนหน้า</h3>
                        <p className="text-[10px] text-slate-400">
                            {periodComparison
                                ? `ช่วงเดียวกันความยาว ${periodComparison.days} วัน: ${fmtDateKey(periodComparison.prevStart)} – ${fmtDateKey(periodComparison.prevEnd)}${filterCategories.length > 0 ? ' • กรองตามหมวดหมู่' : ''}`
                                : 'เลือกช่วงวันที่ในตัวกรอง (เดือนนี้ / 3 เดือน / ไตรมาส / ปีงบประมาณ / กำหนดเอง) เพื่อดูการเปรียบเทียบ'}
                        </p>
                    </div>
                </div>
                {periodComparison && (() => {
                    const cur = periodComparison.current;
                    const prev = periodComparison.previous;
                    const metrics = [
                        { label: 'มูลค่ารับเข้า', cur: cur.inValue, prev: prev.inValue, money: true, goodWhenUp: true, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                        { label: 'มูลค่าเบิกออก', cur: cur.outValue, prev: prev.outValue, money: true, goodWhenUp: false, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-100' },
                        { label: 'จำนวนรายการเคลื่อนไหว', cur: cur.count, prev: prev.count, money: false, goodWhenUp: true, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' },
                    ];
                    return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {metrics.map(m => {
                                const change = pctChange(m.cur, m.prev);
                                const up = change !== null && change >= 0;
                                const tone = change === null
                                    ? 'text-slate-500 bg-slate-100'
                                    : (up === m.goodWhenUp ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100');
                                const fmt = (v) => m.money ? `฿${Math.round(v).toLocaleString('th-TH')}` : v.toLocaleString('th-TH');
                                return (
                                    <div key={m.label} className={`rounded-xl p-3 border ${m.bg}`}>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{m.label}</p>
                                        <p className={`text-xl font-black ${m.color}`}>{fmt(m.cur)}</p>
                                        <div className="flex items-center justify-between mt-1 gap-2">
                                            <p className="text-[10px] text-slate-400 font-mono truncate">ก่อนหน้า {fmt(m.prev)}</p>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${tone}`}>
                                                {change === null ? 'ไม่มีฐานเทียบ' : `${up ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%`}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </motion.div>

            {/* Stats Grid */}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={Package}
                    title="อุปกรณ์ทั้งหมด"
                    value={totalProducts.toLocaleString()}
                    subtitle="รายการในคลัง"
                    color="from-blue-500 to-blue-600"
                />
                <StatCard
                    icon={BarChart3}
                    title="มูลค่าสต็อค"
                    value={`฿${totalValue.toLocaleString('th-TH')}`}
                    subtitle="มูลค่ารวม"
                    color="from-purple-500 to-purple-600"
                />
                <StatCard
                    icon={TrendingDown}
                    title="อุปกรณ์ใกล้หมด"
                    value={lowStockCount}
                    subtitle="ต่ำกว่า Min Stock"
                    color="from-red-500 to-red-600"
                />
                <StatCard
                    icon={FileText}
                    title="PO รอดำเนินการ"
                    value={pendingPOCount}
                    subtitle="รอรับของ"
                    color="from-amber-500 to-amber-600"
                />
                <StatCard
                    icon={TrendingUp}
                    title="รายการเคลื่อนไหว"
                    value={transactionCount}
                    subtitle="ธุรกรรมทั้งหมด"
                    color="from-emerald-500 to-emerald-600"
                />
                <StatCard
                    icon={PieChart}
                    title="หมวดหมู่"
                    value={deviceTypes.length}
                    subtitle="ประเภทอุปกรณ์"
                    color="from-pink-500 to-pink-600"
                />
                <StatCard
                    icon={Shield}
                    title="สัญญาบริการ (MA)"
                    value={maLoadError ? '—' : activeMACount}
                    subtitle={maLoadError ? 'โหลดข้อมูลไม่สำเร็จ' : (expiringMACount > 0 ? `ใกล้หมดอายุ ${expiringMACount} รายการ` : `ข้อมูลลิขสิทธิ์ทั้งหมด`)}
                    color={expiringMACount > 0 && !maLoadError ? "from-rose-500 to-rose-600" : "from-blue-500 to-indigo-600"}
                />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* สรุปมูลค่าเดือนนี้ */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl p-5 shadow-lg border border-slate-200 lg:col-span-2"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart3 className="w-4 h-4 text-indigo-500" />
                        <h3 className="font-bold text-slate-800 text-sm">สรุปการเคลื่อนไหวรายเดือน</h3>
                        <span className="text-[10px] text-slate-400">(แสดง 3 เดือนล่าสุดเสมอ ไม่รับผลจากตัวกรองด้านบน)</span>
                    </div>

                    {/* ตัวเลขเดือนนี้ vs เดือนก่อน */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        {[
                            {
                                label: 'รับเข้าเดือนนี้',
                                value: `฿${monthlyConsumptionSummary.thisMonthIn.toLocaleString('th-TH')}`,
                                sub: 'มูลค่าสต็อคที่รับ',
                                change: null,
                                color: 'text-emerald-600',
                                bg: 'bg-emerald-50 border-emerald-100'
                            },
                            {
                                label: 'เบิกใช้เดือนนี้',
                                value: `฿${monthlyConsumptionSummary.thisMonthValue.toLocaleString('th-TH')}`,
                                sub: `${monthlyConsumptionSummary.thisMonthQty} ชิ้น`,
                                change: monthlyConsumptionSummary.valueChange,
                                color: 'text-rose-600',
                                bg: 'bg-rose-50 border-rose-100'
                            }
                        ].map((card, i) => (
                            <div key={i} className={`rounded-xl p-3 border ${card.bg}`}>
                                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{card.label}</p>
                                <p className={`text-xl font-black ${card.color}`}>{card.value}</p>
                                <div className="flex items-center justify-between mt-1">
                                    <p className="text-[10px] text-slate-400">{card.sub}</p>
                                    {card.change !== null && (
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${parseFloat(card.change) >= 0
                                            ? 'bg-rose-100 text-rose-600'
                                            : 'bg-emerald-100 text-emerald-600'
                                            }`}>
                                            {parseFloat(card.change) >= 0 ? '▲ เพิ่มขึ้น' : '▼ ลดลง'} {Math.abs(card.change)}% vs เดือนก่อน
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* MoM Table 3 เดือน */}
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="text-left py-1.5 text-slate-400 font-bold text-[10px] uppercase">เดือน</th>
                                <th className="text-right py-1.5 text-slate-400 font-bold text-[10px] uppercase">รับเข้า (฿)</th>
                                <th className="text-right py-1.5 text-slate-400 font-bold text-[10px] uppercase">เบิกออก (฿)</th>
                                <th className="text-right py-1.5 text-slate-400 font-bold text-[10px] uppercase">เบิกออก (ชิ้น)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {momData.map((row, i) => {
                                const isExpanded = expandedMonth === row.key;
                                const isCurrentMonth = i === momData.length - 1;

                                // หา transactions ของเดือนนี้ (ตรวจทั้งปีและเดือน)
                                const monthTransactions = (transactions || []).filter(t =>
                                    monthKeyOf(new Date(t.TransDate)) === row.key && isCountedMovement(t)
                                );

                                const inItems = monthTransactions
                                    .filter(t => (t.TransType || '').toUpperCase().trim() === 'IN')
                                    .slice(0, 10);
                                const outItems = monthTransactions
                                    .filter(t => (t.TransType || '').toUpperCase().trim() === 'OUT')
                                    .slice(0, 10);

                                const priceMap = {};
                                products.forEach(p => { priceMap[p.ProductID] = p.LastPrice || 0; });

                                return (
                                    <React.Fragment key={i}>
                                        <tr
                                            className={`cursor-pointer transition-colors ${isCurrentMonth ? 'font-bold bg-slate-50' : ''} ${isExpanded ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                                            onClick={() => setExpandedMonth(isExpanded ? null : row.key)}
                                        >
                                            <td className="py-1.5 text-slate-700">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-[9px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                                    {row.month}
                                                    {isCurrentMonth && (
                                                        <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1 rounded font-bold">เดือนนี้</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-1.5 text-right font-mono text-emerald-600">
                                                {row.inValue > 0 ? `฿${row.inValue.toLocaleString('th-TH')}` : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="py-1.5 text-right font-mono text-rose-500">
                                                {row.outValue > 0 ? `฿${row.outValue.toLocaleString('th-TH')}` : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="py-1.5 text-right font-mono text-slate-500">
                                                {row.outQty > 0 ? `${row.outQty} ชิ้น` : <span className="text-slate-300">—</span>}
                                            </td>
                                        </tr>

                                        {/* Expand row */}
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={4} className="pb-3 px-0">
                                                    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden mx-1">
                                                        <div className="grid grid-cols-2 divide-x divide-slate-200">
                                                            {/* รับเข้า */}
                                                            <div className="p-3">
                                                                <p className="text-[10px] font-bold text-emerald-600 uppercase mb-2">⬇ รับเข้า ({inItems.length} รายการ)</p>
                                                                {inItems.length === 0 ? (
                                                                    <p className="text-[10px] text-slate-400">ไม่มีรายการ</p>
                                                                ) : inItems.map((t, idx) => {
                                                                    const product = productById[t.ProductID];
                                                                    const val = Math.abs(t.Qty) * (priceMap[t.ProductID] || 0);
                                                                    return (
                                                                        <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-0">
                                                                            <div className="flex-1 min-w-0 pr-2">
                                                                                <p className="text-[10px] font-medium text-slate-700 truncate">{product?.ProductName || `ID: ${t.ProductID}`}</p>
                                                                                <p className="text-[9px] text-slate-400">{t.RefInfo || '-'}</p>
                                                                            </div>
                                                                            <div className="text-right shrink-0">
                                                                                <p className="text-[10px] font-bold text-emerald-600">+{Math.abs(t.Qty)} ชิ้น</p>
                                                                                <p className="text-[9px] text-slate-400 font-mono">฿{val.toLocaleString()}</p>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* เบิกออก */}
                                                            <div className="p-3">
                                                                <p className="text-[10px] font-bold text-rose-600 uppercase mb-2">⬆ เบิกออก ({outItems.length} รายการ)</p>
                                                                {outItems.length === 0 ? (
                                                                    <p className="text-[10px] text-slate-400">ไม่มีรายการ</p>
                                                                ) : outItems.map((t, idx) => {
                                                                    const product = productById[t.ProductID];
                                                                    const val = Math.abs(t.Qty) * (priceMap[t.ProductID] || 0);
                                                                    return (
                                                                        <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-0">
                                                                            <div className="flex-1 min-w-0 pr-2">
                                                                                <p className="text-[10px] font-medium text-slate-700 truncate">{product?.ProductName || `ID: ${t.ProductID}`}</p>
                                                                                <p className="text-[9px] text-slate-400">{t.RefInfo || '-'}</p>
                                                                            </div>
                                                                            <div className="text-right shrink-0">
                                                                                <p className="text-[10px] font-bold text-rose-500">-{Math.abs(t.Qty)} ชิ้น</p>
                                                                                <p className="text-[9px] text-slate-400 font-mono">฿{val.toLocaleString()}</p>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </motion.div>

            </div>
            </>)}
            {activeTab === 'procurement' && (<>
            {/* ═══ Procurement Analytics (กรองตามวันที่ขอซื้อ) ═══ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={FileText} title="PO ในช่วงนี้" value={procurementAnalytics.totalPOs.toLocaleString()} subtitle={`ค้างอยู่ ${procurementAnalytics.openCount} ใบ`} color="from-blue-500 to-blue-600" />
                <StatCard icon={AlertCircle} title="เกินกำหนดส่ง" value={procurementAnalytics.overdueCount} subtitle="PO ค้างที่เลย DueDate" color={procurementAnalytics.overdueCount > 0 ? 'from-rose-500 to-rose-600' : 'from-emerald-500 to-emerald-600'} />
                <StatCard icon={Clock} title="Lead time (มัธยฐาน)" value={procurementAnalytics.medianLead !== null ? `${procurementAnalytics.medianLead} วัน` : '—'} subtitle={procurementAnalytics.avgLead !== null ? `เฉลี่ย ${procurementAnalytics.avgLead} วัน (ขอซื้อ → รับของ)` : 'ยังไม่มีข้อมูลการรับของ'} color="from-indigo-500 to-indigo-600" />
                <StatCard icon={TrendingUp} title="ส่งตรงกำหนด" value={procurementAnalytics.onTimeRate !== null ? `${procurementAnalytics.onTimeRate}%` : '—'} subtitle="รับของภายใน DueDate" color="from-emerald-500 to-emerald-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Funnel สถานะ PO */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                    <h3 className="font-bold text-slate-800">สถานะใบสั่งซื้อ</h3>
                    <p className="text-xs text-slate-500 mb-4">จำนวน PO แยกตามสถานะ</p>
                    <div className="space-y-3">
                        {procurementAnalytics.statusOrder.map(s => {
                            const n = procurementAnalytics.statusCount[s] || 0;
                            const pct = procurementAnalytics.totalPOs > 0 ? (n / procurementAnalytics.totalPOs) * 100 : 0;
                            const tone = s === 'Completed' ? 'bg-emerald-500' : s === 'Cancelled' ? 'bg-slate-400' : s === 'Pending' ? 'bg-amber-400' : s === 'Partial' ? 'bg-sky-500' : 'bg-indigo-500';
                            return (
                                <div key={s}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-bold text-slate-700">{s}</span>
                                        <span className="font-mono text-slate-600">{n} ใบ • {Math.round(pct)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                {/* อายุ PO ที่ยังค้าง */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                    <h3 className="font-bold text-slate-800">อายุ PO ที่ยังค้าง</h3>
                    <p className="text-xs text-slate-500 mb-4">นับจากวันที่ขอซื้อ (สถานะที่ยังไม่ Completed / Cancelled)</p>
                    <div className="space-y-3">
                        {procurementAnalytics.openAging.map(b => {
                            const pct = procurementAnalytics.openCount > 0 ? (b.count / procurementAnalytics.openCount) * 100 : 0;
                            const tone = b.key === 'd' ? 'bg-rose-500' : b.key === 'c' ? 'bg-amber-500' : b.key === 'b' ? 'bg-yellow-400' : 'bg-emerald-500';
                            return (
                                <div key={b.key}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-bold text-slate-700">{b.label}</span>
                                        <span className="font-mono text-slate-600">{b.count} ใบ</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ยอดสั่งซื้อตามงบ */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                    <h3 className="font-bold text-slate-800">ยอดสั่งซื้อตาม Budget No.</h3>
                    <p className="text-xs text-slate-500 mb-4">มูลค่าที่สั่ง (QtyOrdered × UnitCost) และมูลค่าที่รับแล้ว</p>
                    {procurementAnalytics.budgetRows.length === 0 ? (
                        <p className="text-sm text-slate-400 py-8 text-center">ไม่มีข้อมูล PO ในช่วงนี้</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500">
                                        <th className="text-left py-1.5 px-2 font-medium">Budget No.</th>
                                        <th className="text-center py-1.5 px-2 font-medium">PO</th>
                                        <th className="text-right py-1.5 px-2 font-medium">สั่งซื้อ</th>
                                        <th className="text-right py-1.5 px-2 font-medium">รับแล้ว</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(expandedLists.budget ? procurementAnalytics.budgetRows : procurementAnalytics.budgetRows.slice(0, 10)).map(b => (
                                        <tr key={b.name} className="border-b border-slate-100">
                                            <td className="py-1.5 px-2 text-slate-800 font-medium truncate max-w-[180px]">{b.name}</td>
                                            <td className="py-1.5 px-2 text-center font-mono text-slate-500">{b.count}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-slate-800">฿{Math.round(b.ordered).toLocaleString('th-TH')}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-emerald-600">฿{Math.round(b.received).toLocaleString('th-TH')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <ToggleAllButton total={procurementAnalytics.budgetRows.length} limit={10} expanded={!!expandedLists.budget} onToggle={() => toggleList('budget')} />
                </motion.div>

                {/* Vendor Scorecard */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                    <h3 className="font-bold text-slate-800">Vendor Scorecard</h3>
                    <p className="text-xs text-slate-500 mb-4">เรียงตามยอดสั่งซื้อ • Lead time เฉลี่ย และอัตราส่งตรงกำหนด</p>
                    {procurementAnalytics.vendorRows.length === 0 ? (
                        <p className="text-sm text-slate-400 py-8 text-center">ไม่มีข้อมูล PO ในช่วงนี้</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500">
                                        <th className="text-left py-1.5 px-2 font-medium">Vendor</th>
                                        <th className="text-center py-1.5 px-2 font-medium">PO</th>
                                        <th className="text-right py-1.5 px-2 font-medium">ยอดสั่ง</th>
                                        <th className="text-center py-1.5 px-2 font-medium">Lead เฉลี่ย</th>
                                        <th className="text-center py-1.5 px-2 font-medium">ตรงกำหนด</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(expandedLists.vendor ? procurementAnalytics.vendorRows : procurementAnalytics.vendorRows.slice(0, 10)).map(v => (
                                        <tr key={v.name} className="border-b border-slate-100">
                                            <td className="py-1.5 px-2 text-slate-800 font-medium truncate max-w-[160px]">{v.name}</td>
                                            <td className="py-1.5 px-2 text-center font-mono text-slate-500">{v.count}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-slate-800">฿{Math.round(v.ordered).toLocaleString('th-TH')}</td>
                                            <td className="py-1.5 px-2 text-center font-mono text-slate-600">{v.avgLead !== null ? `${v.avgLead} วัน` : '—'}</td>
                                            <td className="py-1.5 px-2 text-center">
                                                {v.onTimeRate === null ? <span className="text-slate-300">—</span> : (
                                                    <span className={`px-1.5 py-0.5 rounded font-bold ${v.onTimeRate >= 80 ? 'bg-emerald-100 text-emerald-700' : v.onTimeRate >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{v.onTimeRate}%</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <ToggleAllButton total={procurementAnalytics.vendorRows.length} limit={10} expanded={!!expandedLists.vendor} onToggle={() => toggleList('vendor')} />
                </motion.div>
            </div>

            {/* ═══ MA Renewal Pipeline + พยากรณ์ค่าต่ออายุ 12 เดือน ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="font-bold text-slate-800">Renewal Pipeline (MA/License)</h3>
                            <p className="text-xs text-slate-500">สัญญาที่หมดอายุภายใน 90 วัน (รวมที่หมดแล้ว) แยกตามขั้นต่ออายุ</p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-black text-slate-800">{maRenewal.pipelineCount} รายการ</p>
                        </div>
                    </div>
                    {maLoadError ? (
                        <p className="text-sm text-rose-500 py-6 text-center">⚠️ โหลดข้อมูล MA ไม่สำเร็จ</p>
                    ) : (
                        <>
                            {maRenewal.overdue.count > 0 && (
                                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                    <strong>หมดอายุแล้ว {maRenewal.overdue.count} รายการ</strong> ยังไม่ออก PO มูลค่า ฿{Math.round(maRenewal.overdue.value).toLocaleString('th-TH')}
                                </div>
                            )}
                            <div className="space-y-3">
                                {[
                                    { key: 'none', label: 'ยังไม่เริ่มต่ออายุ', tone: 'bg-rose-400' },
                                    { key: 'QUOTATION', label: 'ขอใบเสนอราคา', tone: 'bg-sky-400' },
                                    { key: 'PR_CREATED', label: 'เปิด PR แล้ว', tone: 'bg-blue-500' },
                                    { key: 'WAITING_PO', label: 'รอ PO ออก', tone: 'bg-violet-500' },
                                    { key: 'PO_ISSUED', label: 'ออก PO แล้ว', tone: 'bg-emerald-500' },
                                ].map(s => {
                                    const row = maRenewal.pipeline[s.key];
                                    const pct = maRenewal.pipelineCount > 0 ? (row.count / maRenewal.pipelineCount) * 100 : 0;
                                    return (
                                        <div key={s.key}>
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="font-bold text-slate-700">{s.label}</span>
                                                <span className="font-mono text-slate-600">{row.count} รายการ • ฿{Math.round(row.value).toLocaleString('th-TH')}</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                <div className={`h-full rounded-full ${s.tone}`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="font-bold text-slate-800">พยากรณ์ค่าต่ออายุ 12 เดือน</h3>
                            <p className="text-xs text-slate-500">มูลค่าสัญญาที่ EndDate ตกในแต่ละเดือน (อิงมูลค่า Price)</p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-black text-indigo-600">฿{Math.round(maRenewal.forecastValue).toLocaleString('th-TH')}</p>
                            <p className="text-[10px] text-slate-400">{maRenewal.forecastCount} สัญญา</p>
                        </div>
                    </div>
                    {maLoadError ? (
                        <p className="text-sm text-rose-500 py-6 text-center">⚠️ โหลดข้อมูล MA ไม่สำเร็จ</p>
                    ) : maRenewal.forecastCount === 0 ? (
                        <p className="text-sm text-slate-400 py-8 text-center">ไม่มีสัญญาที่หมดอายุใน 12 เดือนข้างหน้า</p>
                    ) : (
                        <div className="h-[220px] w-full">
                            {isMounted && (
                                <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={0} debounce={50}>
                                    <BarChart data={maRenewal.forecast}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10 }} />
                                        <YAxis stroke="#64748b" tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : v} />
                                        <Tooltip
                                            formatter={(value) => `฿${Math.round(value).toLocaleString('th-TH')}`}
                                            contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                        />
                                        <Bar dataKey="value" fill="#6366f1" name="มูลค่าต่ออายุ" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>

            {/* ═══ Priority Order List ════════════════════════════════════════ */}
            {forecastItems.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-4 py-3 bg-gradient-to-r from-rose-500 to-orange-500 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-white" />
                            <div>
                                <h3 className="font-bold text-white text-sm">รายการที่ต้องสั่งซื้อ</h3>
                                <p className="text-rose-100 text-xs">เรียงตามลำดับความสำคัญ</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* ✅ เพิ่มตรงนี้ */}
                            <div className="text-center">
                                <p className="text-white font-black text-2xl leading-none">{forecastItems.length}</p>
                                <p className="text-rose-100 text-[10px]">รายการ</p>
                            </div>
                            <div className="w-px h-8 bg-white/30" />
                            <div className="text-right">
                                <p className="text-rose-100 text-[10px]">มูลค่ารวม</p>
                                <p className="text-white font-black text-base">
                                    ฿{forecastItems.reduce((sum, item) => sum + (item.EstimatedCost || 0), 0).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Priority Legend — ย่อลง */}
                    <div className="flex gap-4 px-4 py-2 bg-slate-50 border-b border-slate-100">
                        {[
                            { label: 'CRITICAL', color: 'bg-red-500' },
                            { label: 'HIGH', color: 'bg-orange-500' },
                            { label: 'MEDIUM', color: 'bg-yellow-500' },
                            { label: 'LOW', color: 'bg-green-500' },
                        ].map(p => (
                            <div key={p.label} className="flex items-center gap-1">
                                <span className={`w-2 h-2 rounded-full ${p.color}`} />
                                <span className="text-[10px] font-bold text-slate-500">{p.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="py-2 px-3 w-8"></th>
                                    <th className="text-left py-2 px-3 text-slate-500 font-bold text-[10px] uppercase">Priority</th>
                                    <th className="text-left py-2 px-3 text-slate-500 font-bold text-[10px] uppercase">ชื่อสินค้า</th>
                                    <th className="text-center py-2 px-3 text-slate-500 font-bold text-[10px] uppercase">ประเภท</th>
                                    <th className="text-center py-2 px-3 text-slate-500 font-bold text-[10px] uppercase">คงเหลือ</th>
                                    <th className="text-center py-2 px-3 text-slate-500 font-bold text-[10px] uppercase">Min</th>
                                    <th className="text-center py-2 px-3 text-slate-500 font-bold text-[10px] uppercase">Lead Time</th>
                                    <th className="text-center py-2 px-3 text-slate-500 font-bold text-[10px] uppercase">Usage 3 เดือน</th>
                                    <th className="text-center py-2 px-3 text-slate-500 font-bold text-[10px] uppercase">ต้องสั่ง</th>
                                    <th className="text-right py-2 px-3 text-slate-500 font-bold text-[10px] uppercase">ราคา/หน่วย</th>
                                    <th className="text-right py-2 px-3 text-slate-500 font-bold text-[10px] uppercase">รวม</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {forecastItems.map((item, idx) => {
                                    const priorityConfig = {
                                        CRITICAL: { color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', row: 'bg-red-50/30' },
                                        HIGH: { color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', row: 'bg-orange-50/20' },
                                        MEDIUM: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500', row: '' },
                                        LOW: { color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500', row: '' },
                                    };
                                    const label = item.priority_label || 'MEDIUM';
                                    const cfg = priorityConfig[label] || priorityConfig.MEDIUM;

                                    return (
                                        <tr key={item.ProductID} className={`hover:bg-slate-50 transition-colors ${cfg.row}`}>


                                            <td className="py-1.5 px-3">
                                                <div className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-gradient-to-br from-slate-400 to-slate-600">
                                                    {item.ImageURL ? (
                                                        <img src={`${API_URL}${item.ImageURL}`} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Package size={12} className="text-white" />
                                                    )}
                                                </div>
                                            </td>


                                            <td className="py-1.5 px-3">
                                                <span className={`flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.color}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                                    {label}
                                                </span>
                                            </td>
                                            <td className="py-1.5 px-3 font-medium text-slate-800 max-w-[180px] truncate">
                                                {item.ProductName}
                                            </td>
                                            <td className="py-1.5 px-3 text-center">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getBadgeStyle(item.DeviceType)}`}>
                                                    {item.DeviceType}
                                                </span>
                                            </td>
                                            <td className="py-1.5 px-3 text-center font-mono font-bold text-red-500">
                                                {item.CurrentStock}
                                            </td>
                                            <td className="py-1.5 px-3 text-center font-mono text-slate-400">
                                                {item.MinStock}
                                            </td>
                                            <td className="py-1.5 px-3 text-center font-mono text-slate-400">
                                                {item.lead_time_days ?? 7} วัน
                                            </td>
                                            <td className="py-1.5 px-3 text-center font-mono text-purple-600 font-bold">
                                                {usageMap[item.ProductID] || 0} ชิ้น
                                            </td>
                                            <td className="py-1.5 px-3 text-center font-mono font-bold text-indigo-600">
                                                +{item.OrderQty}
                                            </td>
                                            <td className="py-1.5 px-3 text-right font-mono text-slate-500">
                                                ฿{(item.LastPrice || 0).toLocaleString()}
                                            </td>
                                            <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-800">
                                                ฿{(item.EstimatedCost || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                                <tr>
                                    <td colSpan={10} className="py-2 px-3 text-right font-bold text-slate-600 text-xs">
                                        รวมทั้งหมด {forecastItems.length} รายการ
                                    </td>
                                    <td className="py-2 px-3 text-right font-black text-rose-600 text-sm">
                                        ฿{forecastItems.reduce((sum, i) => sum + (i.EstimatedCost || 0), 0).toLocaleString()}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </motion.div>
            )}
                {forecastItems.length === 0 && (
                    <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-sm text-slate-400">
                        {forecastError ? '⚠️ โหลดรายการที่ต้องสั่งซื้อไม่สำเร็จ' : 'ไม่มีรายการที่ต้องสั่งซื้อ 👍'}
                    </div>
                )}
            </>)}
            {activeTab === 'overview' && (<>
            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Stock Movement Chart (Quantity) */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200"
                >
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">การเคลื่อนไหวสต็อค (จำนวนชิ้น)</h3>
                    <div className="h-[250px] w-full">
                        {isMounted && (
                            <ResponsiveContainer width="100%" height={250} minWidth={0} minHeight={0} debounce={50}>
                                <BarChart data={stockMovementData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="month" stroke="#64748b" />
                                    <YAxis stroke="#64748b" />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'white',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                        }}
                                    />
                                    <Legend />
                                    <Bar dataKey="inbound" fill="#3b82f6" name="อุปกรณ์เข้า" radius={[8, 8, 0, 0]} />
                                    <Bar dataKey="outbound" fill="#8b5cf6" name="อุปกรณ์ออก" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </motion.div>

                {/* NEW: Cost & Usage Chart (Money) */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <DollarSign className="w-5 h-5 text-emerald-500" />
                        <h3 className="text-lg font-semibold text-slate-900">วิเคราะห์ค่าใช้จ่าย (บาท)</h3>
                    </div>
                    <div className="h-[250px] w-full">
                        {isMounted && (
                            <ResponsiveContainer width="100%" height={250} minWidth={0} minHeight={0} debounce={50}>
                                <LineChart data={costAnalysisData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="month" stroke="#64748b" />
                                    <YAxis stroke="#64748b" tickFormatter={(v) => v >= 1000000
                                        ? `฿${(v / 1000000).toFixed(1)}M`
                                        : v >= 1000
                                            ? `฿${(v / 1000).toFixed(0)}K`
                                            : `฿${v}`} />
                                    <Tooltip
                                        formatter={(value) => `฿${value.toLocaleString()}`}
                                        contentStyle={{
                                            backgroundColor: 'white',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                        }}
                                    />
                                    <Legend />
                                    <Line type="monotone" dataKey="spending" stroke="#10b981" strokeWidth={3} name="ซื้อเข้า (Spending)" dot={{ fill: '#10b981' }} />
                                    <Line type="monotone" dataKey="consumption" stroke="#f59e0b" strokeWidth={3} name="เบิกใช้ (Usage)" dot={{ fill: '#f59e0b' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </motion.div>
            </div>
            </>)}

            {/* NEW: Stock Value by Category + Net Movement Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Stock Value by Category */}
            {activeTab === 'stock' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200"
                >
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-emerald-500" />
                            <h3 className="text-lg font-semibold text-slate-900">มูลค่าสต็อกตามหมวดหมู่</h3>
                        </div>
                        <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1">
                            <Filter className="w-3 h-3" /> คลิกเพื่อ Filter
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">มูลค่า = จำนวนคงเหลือ × ราคาล่าสุด</p>
                    {stockValueByCategory.length > 0 ? (
                        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                            {stockValueByCategory.map((cat, idx) => {
                                const maxVal = stockValueByCategory[0]?.value || 1;
                                const pct = Math.round((cat.value / maxVal) * 100);
                                const isActive = clickedCategory === cat.name;
                                const isDimmed = clickedCategory && !isActive;
                                return (
                                    <motion.div
                                        key={cat.name}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.04 }}
                                        onClick={() => handleChartCategoryClick(cat.name)}
                                        className={`group relative rounded-xl p-3 cursor-pointer transition-all border ${isActive
                                            ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                                            : isDimmed
                                                ? 'bg-slate-50 border-slate-100 opacity-40'
                                                : 'bg-slate-50 border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                                                {cat.label}
                                            </span>
                                            <span className="text-sm font-bold text-slate-800 font-mono">฿{cat.value.toLocaleString()}</span>
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${pct}%` }}
                                                transition={{ delay: idx * 0.04 + 0.2, duration: 0.5 }}
                                                className="h-full rounded-full"
                                                style={{ backgroundColor: cat.color }}
                                            />
                                        </div>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[10px] text-slate-400">{cat.items} รายการ</span>
                                            <span className="text-[10px] text-slate-400">{cat.qty} ชิ้น</span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-center py-8 text-slate-400 text-sm">ไม่มีข้อมูล</p>
                    )}
                </motion.div>
            )}

                {/* Net Movement Trend */}
            {activeTab === 'overview' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200"
                >
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        <h3 className="text-lg font-semibold text-slate-900">แนวโน้มสต็อก (Net Movement)</h3>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">Net = รับเข้า − เบิกออก (ค่า+ = สต็อกเพิ่ม, ค่า− = สต็อกลด)</p>
                    <div className="h-[280px] w-full">
                        {isMounted && (
                            <ResponsiveContainer width="100%" height={280} minWidth={0} minHeight={0} debounce={50}>
                                <BarChart data={netMovementTrend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="month" stroke="#64748b" />
                                    <YAxis stroke="#64748b" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                        formatter={(value, name) => {
                                            const labels = { inbound: 'รับเข้า', outbound: 'เบิกออก', net: 'Net' };
                                            return [`${value} ชิ้น`, labels[name] || name];
                                        }}
                                    />
                                    <Legend formatter={(value) => {
                                        const labels = { inbound: 'รับเข้า', outbound: 'เบิกออก', net: 'Net (สุทธิ)' };
                                        return labels[value] || value;
                                    }} />
                                    <Bar dataKey="inbound" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.35} barSize={20} />
                                    <Bar dataKey="outbound" fill="#8b5cf6" radius={[4, 4, 0, 0]} opacity={0.35} barSize={20} />
                                    <Line type="monotone" dataKey="net" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 5 }} name="net" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </motion.div>
            )}
            </div>

            {/* NEW: Analytics Insights Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Slow Moving Items (Dead Stock) */}
                {activeTab === 'stock' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 lg:col-span-2"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">อุปกรณ์ค้างสต็อก (Dead Stock)</h3>
                                <p className="text-xs text-slate-500">ไม่มีการเบิกใน 3 เดือนที่ผ่านมา</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-500">มูลค่าค้าง</p>
                            <p className="text-lg font-bold text-red-500">฿{deadStockValue.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-2 px-3 text-slate-500 font-medium">อุปกรณ์</th>
                                    <th className="text-center py-2 px-3 text-slate-500 font-medium">ประเภท</th>
                                    <th className="text-center py-2 px-3 text-slate-500 font-medium">คงเหลือ</th>
                                    <th className="text-right py-2 px-3 text-slate-500 font-medium">มูลค่า</th>
                                </tr>
                            </thead>
                            <tbody>
                                {slowMovingItems.length > 0 ? (expandedLists.slowMoving ? slowMovingItems : slowMovingItems.slice(0, 10)).map((item, idx) => (
                                    <motion.tr
                                        key={item.ProductID}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="border-b border-slate-100 hover:bg-slate-50"
                                    >
                                        <td className="py-3 px-3">
                                            <p className="font-medium text-slate-800 truncate max-w-[200px]">{item.ProductName}</p>
                                        </td>
                                        <td className="py-3 px-3 text-center">
                                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getBadgeStyle(item.DeviceType)}`}>
                                                {item.DeviceType}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-center font-mono text-slate-700">{item.CurrentStock}</td>
                                        <td className="py-3 px-3 text-right font-mono text-red-500">฿{(item.CurrentStock * (item.LastPrice || 0)).toLocaleString()}</td>
                                    </motion.tr>
                                )) : (
                                    <tr>
                                        <td colSpan="4" className="py-8 text-center text-slate-400">
                                            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                            ไม่มีอุปกรณ์ค้างสต็อก 👍
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <ToggleAllButton total={slowMovingItems.length} limit={10} expanded={!!expandedLists.slowMoving} onToggle={() => toggleList('slowMoving')} />
                </motion.div>
                )}

                {/* Top Consumers */}
                {activeTab === 'usage' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                            <User className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">ผู้เบิกสูงสุด</h3>
                            <p className="text-xs text-slate-500">จัดอันดับตามมูลค่า</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {topConsumers.length > 0 ? (expandedLists.consumers ? topConsumers : topConsumers.slice(0, 5)).map((user, idx) => (
                            <motion.div
                                key={user.userId}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                            >
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : idx === 1 ? 'bg-gradient-to-br from-slate-400 to-slate-500' : idx === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' : 'bg-slate-300'}`}>
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-slate-800 truncate">{user.userId}</p>
                                    <p className="text-xs text-slate-500">{user.transactionCount} ครั้ง • {user.totalQty} ชิ้น</p>
                                </div>
                                <span className="text-sm font-bold text-indigo-600 font-mono">
                                    ฿{user.totalValue.toLocaleString('th-TH')}
                                </span>
                            </motion.div>
                        )) : (
                            <div className="text-center py-8 text-slate-400">
                                <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">ยังไม่มีข้อมูลการเบิก</p>
                            </div>
                        )}
                    </div>
                    <ToggleAllButton total={topConsumers.length} limit={5} expanded={!!expandedLists.consumers} onToggle={() => toggleList('consumers')} />
                </motion.div>
                )}
            </div>

            {activeTab === 'stock' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* ABC Analysis */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                        <h3 className="font-bold text-slate-800">ABC Analysis (มูลค่าเบิก 12 เดือน)</h3>
                        <p className="text-xs text-slate-500 mb-4">A = 80% แรกของมูลค่า • B = ถัดมา 15% • C = 5% สุดท้าย</p>
                        {stockAnalytics.abcTotal > 0 ? (
                            <>
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    {['A', 'B', 'C'].map(cls => {
                                        const s = stockAnalytics.abcSummary[cls];
                                        return (
                                            <div key={cls} className={`rounded-xl p-3 border ${ABC_STYLE[cls]}`}>
                                                <p className="text-xs font-bold">Class {cls}</p>
                                                <p className="text-xl font-black">{s.count} <span className="text-xs font-semibold">รายการ</span></p>
                                                <p className="text-[10px] text-slate-500 font-mono">฿{Math.round(s.value).toLocaleString()} ({s.share}%)</p>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="max-h-[260px] overflow-y-auto">
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-white">
                                            <tr className="border-b border-slate-200 text-slate-500">
                                                <th className="text-left py-1.5 px-2 font-medium">อุปกรณ์</th>
                                                <th className="text-center py-1.5 px-2 font-medium">Class</th>
                                                <th className="text-right py-1.5 px-2 font-medium">มูลค่าเบิก</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(expandedLists.abc ? stockAnalytics.abcRows : stockAnalytics.abcRows.slice(0, 15)).map(r => (
                                                <tr key={r.ProductID} className="border-b border-slate-100">
                                                    <td className="py-1.5 px-2 text-slate-800 truncate max-w-[220px]">{r.ProductName}</td>
                                                    <td className="py-1.5 px-2 text-center"><span className={`px-1.5 py-0.5 rounded font-bold border ${ABC_STYLE[r.cls]}`}>{r.cls}</span></td>
                                                    <td className="py-1.5 px-2 text-right font-mono text-slate-700">฿{Math.round(r.value).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <ToggleAllButton total={stockAnalytics.abcRows.length} limit={15} expanded={!!expandedLists.abc} onToggle={() => toggleList('abc')} />
                            </>
                        ) : (
                            <p className="text-sm text-slate-400 py-8 text-center">ยังไม่มีข้อมูลการเบิกใน 12 เดือน</p>
                        )}
                    </motion.div>

                    {/* Stock Aging */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                        <h3 className="font-bold text-slate-800">Stock Aging</h3>
                        <p className="text-xs text-slate-500 mb-4">มูลค่าสต็อกคงเหลือ แยกตามเวลาตั้งแต่เบิกล่าสุด</p>
                        <div className="space-y-3">
                            {stockAnalytics.agingBuckets.map(b => {
                                const pct = stockAnalytics.agingTotal > 0 ? (b.value / stockAnalytics.agingTotal) * 100 : 0;
                                const tone = b.key === 'never' || b.key === '365+' ? 'bg-rose-500' : b.key === '181-365' ? 'bg-amber-500' : b.key === '91-180' ? 'bg-yellow-400' : 'bg-emerald-500';
                                return (
                                    <div key={b.key}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="font-bold text-slate-700">{b.label}</span>
                                            <span className="font-mono text-slate-600">{b.count} รายการ • ฿{Math.round(b.value).toLocaleString()}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                            <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>

                    {/* Days of Stock */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                        <h3 className="font-bold text-slate-800">Days of Stock (ใช้หมดในกี่วัน)</h3>
                        <p className="text-xs text-slate-500 mb-4">คงเหลือ ÷ อัตราเบิกเฉลี่ยต่อวัน (ย้อนหลัง 3 เดือน) • เรียงจากใกล้หมดที่สุด</p>
                        {stockAnalytics.daysOfStock.length === 0 ? (
                            <p className="text-sm text-slate-400 py-8 text-center">ไม่มีอุปกรณ์ที่มีการเบิกใน 3 เดือน</p>
                        ) : (
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500">
                                        <th className="text-left py-1.5 px-2 font-medium">อุปกรณ์</th>
                                        <th className="text-right py-1.5 px-2 font-medium">คงเหลือ</th>
                                        <th className="text-right py-1.5 px-2 font-medium">เบิก/วัน</th>
                                        <th className="text-right py-1.5 px-2 font-medium">ใช้หมดใน</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(expandedLists.days ? stockAnalytics.daysOfStock : stockAnalytics.daysOfStock.slice(0, 10)).map(r => (
                                        <tr key={r.ProductID} className="border-b border-slate-100">
                                            <td className="py-1.5 px-2 text-slate-800 truncate max-w-[200px]">{r.ProductName}</td>
                                            <td className="py-1.5 px-2 text-right font-mono">{r.CurrentStock}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-slate-500">{r.daily.toFixed(2)}</td>
                                            <td className="py-1.5 px-2 text-right">
                                                <span className={`px-2 py-0.5 rounded-full font-bold ${r.days <= 14 ? 'bg-red-100 text-red-700' : r.days <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {Math.floor(r.days) === 0 ? '< 1' : Math.floor(r.days)} วัน
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        {stockAnalytics.daysOfStock.length > 0 && (
                            <ToggleAllButton total={stockAnalytics.daysOfStock.length} limit={10} expanded={!!expandedLists.days} onToggle={() => toggleList('days')} />
                        )}
                    </motion.div>

                    {/* Overstock */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-slate-800">Overstock (เกิน Max Stock)</h3>
                                <p className="text-xs text-slate-500">มูลค่าส่วนเกินเหนือ MaxStock</p>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-black text-amber-600">฿{Math.round(stockAnalytics.overstockValue).toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400">{stockAnalytics.overstockCount} รายการ</p>
                            </div>
                        </div>
                        {stockAnalytics.overstockCount === 0 ? (
                            <p className="text-sm text-slate-400 py-8 text-center">ไม่มีสต็อกเกินกำหนด 👍</p>
                        ) : (
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500">
                                        <th className="text-left py-1.5 px-2 font-medium">อุปกรณ์</th>
                                        <th className="text-right py-1.5 px-2 font-medium">คงเหลือ / Max</th>
                                        <th className="text-right py-1.5 px-2 font-medium">ส่วนเกิน</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(expandedLists.overstock ? stockAnalytics.overstockAll : stockAnalytics.overstockAll.slice(0, 10)).map(r => (
                                        <tr key={r.ProductID} className="border-b border-slate-100">
                                            <td className="py-1.5 px-2 text-slate-800 truncate max-w-[220px]">{r.ProductName}</td>
                                            <td className="py-1.5 px-2 text-right font-mono">{r.CurrentStock} / {r.MaxStock}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-amber-600">฿{Math.round(r.excess).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        {stockAnalytics.overstockCount > 0 && (
                            <ToggleAllButton total={stockAnalytics.overstockAll.length} limit={10} expanded={!!expandedLists.overstock} onToggle={() => toggleList('overstock')} />
                        )}
                    </motion.div>
                </div>
            )}
            {activeTab === 'stock' && (<>
            {/* Category Distribution — Click to Filter */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200"
            >
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-semibold text-slate-900">การกระจายตามหมวดหมู่</h3>
                    <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1">
                        <Filter className="w-3 h-3" /> คลิกเพื่อ Filter
                    </span>
                </div>
                {clickedCategory && (
                    <p className="text-xs text-indigo-600 mb-3 font-medium">
                        🎯 กรองตาม: <strong>{clickedCategory}</strong>
                        <button onClick={() => { setClickedCategory(null); setFilterCategories([]); }} className="ml-2 text-red-400 hover:text-red-600">× ยกเลิก</button>
                    </p>
                )}
                {/* Injected CSS for Pie focus effect - Color preserved, just blurred and faded */}
                <style>{`
                        .pie-focus-inactive {
                            filter: blur(3px) !important;
                            opacity: 0.3 !important;
                        }
                        .legend-item-inactive {
                            opacity: 0.4 !important;
                            filter: blur(0.8px);
                        }
                    `}</style>

                {categoryData.length > 0 ? (
                    <div className="h-[300px] w-full">
                        {isMounted && (
                            <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0} debounce={50}>
                                <RechartsPie>
                                    <Pie
                                        data={categoryData}
                                        cx="50%"
                                        cy="45%"
                                        innerRadius={50}
                                        outerRadius={90}
                                        paddingAngle={2}
                                        fill="#8884d8"
                                        dataKey="value"
                                        style={{ cursor: 'pointer', outline: 'none' }}
                                        onClick={(data) => {
                                            const entry = data?.payload?.payload || data?.payload || data;
                                            const categoryId = entry?.id || entry?.name;
                                            if (categoryId) handleChartCategoryClick(categoryId);
                                        }}
                                    >
                                        {categoryData.map((entry, index) => {
                                            const isActive = clickedCategory === entry.id || clickedCategory === entry.name;
                                            const isInactive = clickedCategory && !isActive;
                                            return (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={entry.color}
                                                    className={isInactive ? 'pie-focus-inactive' : ''}
                                                    stroke={isActive ? '#4f46e5' : 'white'}
                                                    strokeWidth={isActive ? 3 : 1}
                                                    style={{
                                                        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        cursor: 'pointer',
                                                        outline: 'none'
                                                    }}
                                                />
                                            );
                                        })}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(val, name) => {
                                            const total = categoryData.reduce((s, c) => s + c.value, 0);
                                            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                            return [`${val} รายการ (${pct}%)`, name];
                                        }}
                                    />
                                    <Legend
                                        layout="horizontal"
                                        verticalAlign="bottom"
                                        align="center"
                                        iconType="circle"
                                        iconSize={8}
                                        wrapperStyle={{ fontSize: '11px', paddingTop: '15px' }}
                                        formatter={(value, entry) => {
                                            const item = categoryData.find(c => c.name === value);
                                            const isActive = clickedCategory === item?.id || clickedCategory === item?.name;
                                            const isInactive = clickedCategory && !isActive;
                                            return (
                                                <span
                                                    className={isInactive ? 'legend-item-inactive' : ''}
                                                    style={{
                                                        transition: 'all 0.4s ease',
                                                        fontWeight: isActive ? 'bold' : 'normal',
                                                        color: isInactive ? '#94a3b8' : '#1e293b'
                                                    }}
                                                >
                                                    {value} ({item?.value || 0})
                                                </span>
                                            );
                                        }}
                                    />
                                </RechartsPie>
                            </ResponsiveContainer>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-[300px] text-slate-400">
                        <PieChart className="w-10 h-10 mb-2 opacity-20" />
                        <p className="text-sm">ไม่มีข้อมูลในหมวดหมู่นี้</p>
                    </div>
                )}
            </motion.div>
            </>)}

            {activeTab === 'usage' && (<>
            {/* NEW: Top Withdrawn Items & Withdrawals By Category */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Withdrawn Items */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">🔥 อุปกรณ์เบิกมากสุด</h3>
                            <p className="text-xs text-slate-500">Top 5 รายการที่ถูกเบิกมากที่สุด</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-2 px-2 text-slate-500 font-medium">#</th>
                                    <th className="text-left py-2 px-2 text-slate-500 font-medium">อุปกรณ์</th>
                                    <th className="text-center py-2 px-2 text-slate-500 font-medium">ประเภท</th>
                                    <th className="text-right py-2 px-2 text-slate-500 font-medium">จำนวน</th>
                                    <th className="text-right py-2 px-2 text-slate-500 font-medium">มูลค่า</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topWithdrawnItems.length > 0 ? (expandedLists.withdrawn ? topWithdrawnItems : topWithdrawnItems.slice(0, 5)).map((item, idx) => (
                                    <tr key={item.productId} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-2 px-2">
                                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold
                                                    ${idx === 0 ? 'bg-rose-500' : idx === 1 ? 'bg-rose-400' : idx === 2 ? 'bg-rose-300' : 'bg-slate-300'}`}>
                                                {idx + 1}
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 font-medium text-slate-800 truncate max-w-[150px]">{item.productName}</td>
                                        <td className="py-2 px-2 text-center">
                                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getBadgeStyle(item.deviceType)}`}>
                                                {item.deviceType}
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 text-right font-bold text-rose-600">{item.totalQty.toLocaleString()}</td>
                                        <td className="py-2 px-2 text-right text-slate-600">฿{item.totalValue.toLocaleString()}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-slate-400">ยังไม่มีข้อมูลการเบิก</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <ToggleAllButton total={topWithdrawnItems.length} limit={5} expanded={!!expandedLists.withdrawn} onToggle={() => toggleList('withdrawn')} />
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                                <BarChart3 className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">📂 เบิกตามประเภท</h3>
                                <p className="text-xs text-slate-500">สรุปยอดเบิกแยกตามประเภทอุปกรณ์</p>
                            </div>
                        </div>
                        <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1">
                            <Filter className="w-3 h-3" /> คลิก bar เพื่อ Filter
                        </span>
                    </div>

                    {withdrawalsByCategory.length > 0 ? (
                        <div className="h-[300px] w-full">
                            {isMounted && (
                                <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0} debounce={50}>
                                    <BarChart
                                        layout="vertical"
                                        data={withdrawalsByCategory.slice(0, 10).map((item) => ({
                                            ...item,
                                            fill: getChartColor(item.name)
                                        }))}
                                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                        onClick={(data) => {
                                            if (data?.activePayload?.[0]?.payload?.name) {
                                                handleChartCategoryClick(data.activePayload[0].payload.name);
                                            }
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                        <XAxis type="number" stroke="#64748b" />
                                        <YAxis
                                            type="category"
                                            dataKey="label"
                                            width={100}
                                            stroke="#475569"
                                            tick={{ fontSize: 12 }}
                                        />
                                        <Tooltip
                                            cursor={{ fill: '#f1f5f9' }}
                                            contentStyle={{
                                                backgroundColor: 'white',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                            }}
                                            formatter={(value, name, props) => [`${value} ชิ้น — คลิกเพื่อ Filter`, props.payload.label]}
                                        />
                                        <Bar
                                            dataKey="value"
                                            radius={[0, 4, 4, 0]}
                                            barSize={24}
                                            name="จำนวนที่เบิก"
                                        >
                                            {withdrawalsByCategory.slice(0, 10).map((item, index) => (
                                                <Cell
                                                    key={`bar-cell-${index}`}
                                                    fill={getChartColor(item.name)}
                                                    opacity={clickedCategory && clickedCategory !== item.name ? 0.25 : 1}
                                                />
                                            ))}
                                            <LabelList dataKey="value" position="right" style={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }} formatter={(val) => `${val} ชิ้น`} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-400">
                            <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">ยังไม่มีข้อมูลการเบิก</p>
                        </div>
                    )}
                </motion.div>
            </div>
            </>)}


            {/* ═══ Compact Export Panel ════════════════════════════════════ */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden"
            >
                {/* Clickable Header Bar - Changed from button to div to avoid nested button error */}
                <div
                    onClick={() => setShowExport(!showExport)}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                        <FileSpreadsheet size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-800 text-sm">Export รายงาน</h3>
                        <p className="text-xs text-slate-400 truncate">
                            {selectedTypes.length > 0
                                ? `${selectedTypes.length} ประเภทข้อมูลที่เลือก${startDate && endDate ? ` • ${formatThaiDateShort(startDate)} – ${formatThaiDateShort(endDate)}` : ''}`
                                : 'เลือกข้อมูลและช่วงวันที่เพื่อดาวน์โหลด'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {!showExport && selectedTypes.length > 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleExport(); }}
                                disabled={isExporting}
                                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all shadow-sm"
                            >
                                {isExporting ? (
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Download size={14} />
                                )}
                                {isExporting ? 'กำลังสร้าง...' : 'Export'}
                            </button>
                        )}
                        <motion.div animate={{ rotate: showExport ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <TrendingDown className="w-4 h-4 text-slate-400" />
                        </motion.div>
                    </div>
                </div>

                {/* Collapsible Content */}
                <AnimatePresence>
                    {showExport && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                        >
                            <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
                                {/* Data Types — Chip Grid */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">เลือกข้อมูล</span>
                                        <div className="flex gap-1.5">
                                            <button type="button" onClick={() => setSelectedTypes(dataOptions.map(o => o.id))}
                                                className="text-[10px] px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded font-bold hover:bg-indigo-200 transition-colors">ทั้งหมด</button>
                                            <button type="button" onClick={() => setSelectedTypes([])}
                                                className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-bold hover:bg-slate-200 transition-colors">ล้าง</button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {dataOptions.map(option => {
                                            const isSelected = selectedTypes.includes(option.id);
                                            const Icon = option.icon;
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => toggleType(option.id)}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${isSelected
                                                        ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-300 text-indigo-700'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}
                                                >
                                                    <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${option.color} flex items-center justify-center`}>
                                                        <Icon size={12} className="text-white" />
                                                    </div>
                                                    {option.label}
                                                    {isSelected && <CheckSquare size={14} className="text-indigo-500" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Export ใช้ตัวกรองด้านบนร่วมด้วย (ช่วงวันที่ ถ้าไม่กรอกช่วงด้านล่าง, ประเภทอุปกรณ์, IN/OUT ใช้กับชีต Transaction) */}
                                <p className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                                    🎯 ใช้ตัวกรองด้านบนร่วมด้วย:{' '}
                                    {activeFilterCount === 0
                                        ? 'ไม่มีตัวกรอง (Export ข้อมูลทั้งหมด)'
                                        : [
                                            filterDateRange !== 'all' && `ช่วงวันที่ ${datePresets.find(p => p.id === filterDateRange)?.label}`,
                                            filterCategories.length > 0 && `ประเภท ${filterCategories.length} รายการ`,
                                            filterTransType !== 'all' && `${filterTransType === 'IN' ? 'รับเข้า' : 'เบิกออก'} (ชีต Transaction)`
                                        ].filter(Boolean).join(' • ')}
                                </p>

                                {/* Date Range + Export — Single Row */}
                                <div className="flex flex-wrap items-end gap-3">
                                    <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                                        <Calendar size={14} className="text-slate-400 shrink-0" />
                                        <div className="flex items-center gap-2 flex-1">
                                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                                className="border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 bg-slate-50 focus:outline-none focus:border-indigo-400 flex-1" />
                                            <span className="text-xs text-slate-400">ถึง</span>
                                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                                                className="border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 bg-slate-50 focus:outline-none focus:border-indigo-400 flex-1" />
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleExport}
                                        disabled={isExporting || selectedTypes.length === 0}
                                        className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-400 text-white font-bold text-sm rounded-xl flex items-center gap-2 transition-all shadow-sm hover:shadow-md shrink-0"
                                    >
                                        {isExporting ? (
                                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังสร้าง...</>
                                        ) : (
                                            <><Download size={16} /> Export .xlsx</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Alert Modal */}
            <AlertModal
                isOpen={alertModal.isOpen}
                type={alertModal.type}
                title={alertModal.title}
                message={alertModal.message}
                onConfirm={() => setAlertModal({ ...alertModal, isOpen: false })}
            />
        </div>
    );
};

export default ReportPage;
