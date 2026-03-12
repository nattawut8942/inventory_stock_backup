import React, { useState, useMemo, useEffect } from 'react';
import { FileSpreadsheet, Calendar, Download, CheckSquare, Square, Package, TrendingUp, TrendingDown, BarChart3, PieChart, FileText, Receipt, DollarSign, Clock, User, AlertCircle, Shield, SlidersHorizontal, X, Filter } from 'lucide-react';
import { BarChart, Bar, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, LabelList } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { useData } from '../context/DataContext';
import AlertModal from '../components/AlertModal';
import { getChartColor, getBadgeStyle } from '../utils/styleHelpers';
import { formatThaiDateShort } from '../utils/formatDate';
import { API_BASE } from '../config/api';

// ─── Helper: check if date falls in range ────────────────────────────────────
const isInDateRange = (dateStr, preset, customStart, customEnd) => {
    if (!dateStr) return true;
    const d = new Date(dateStr);
    const now = new Date();

    // กำหนดวันเริ่มต้นปีงบประมาณ (1 เมษายน)
    const getFiscalYearRange = () => {
        const currentYear = now.getFullYear();
        const isBeforeApril = now.getMonth() < 3;
        const startYear = isBeforeApril ? currentYear - 1 : currentYear;
        const startDate = new Date(startYear, 3, 1); // 1 เมษายน
        const endDate = new Date(startYear + 1, 2, 31, 23, 59, 59); // 31 มีนาคม ปีถัดไป
        return { startDate, endDate };
    };

    if (preset === 'thisMonth') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (preset === 'last3months') {
        const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 3);
        return d >= cutoff;
    }
    if (preset === 'thisQuarter') {
        // ไตรมาสแบ่งเป็น: ม.ค.-มี.ค. (Q4), เม.ย.-มิ.ย. (Q1), ก.ค.-ก.ย. (Q2), ต.ค.-ธ.ค. (Q3)
        // ซึ่ง boundaries ของวันจะตรงกับ standard quarter (ทุกๆ 3 เดือน)
        const q = Math.floor(now.getMonth() / 3);
        const qStart = new Date(now.getFullYear(), q * 3, 1);
        const qEnd = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
        return d >= qStart && d <= qEnd;
    }
    if (preset === 'thisYear') {
        const { startDate, endDate } = getFiscalYearRange();
        return d >= startDate && d <= endDate;
    }
    if (preset === 'custom' && customStart && customEnd) {
        return d >= new Date(customStart) && d <= new Date(customEnd + 'T23:59:59');
    }
    return true; // 'all'
};

// StatCard Component
const StatCard = ({ icon: Icon, title, value, subtitle, color }) => (
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
    const { products, deviceTypes, purchaseOrders, transactions } = useData();
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

    useEffect(() => {
        const timer = setTimeout(() => setIsMounted(true), 500);
        return () => clearTimeout(timer);
    }, []);

    const datePresets = [
        { id: 'all', label: 'ทั้งหมด' },
        { id: 'thisMonth', label: 'เดือนนี้' },
        { id: 'last3months', label: '3 เดือน' },
        { id: 'thisQuarter', label: 'ไตรมาสนี้' },
        { id: 'thisYear', label: 'ปีนี้' },
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

    useEffect(() => {
        fetch(`${API_BASE}/ma`)
            .then(res => res.json())
            .then(data => setMaItems(data))
            .catch(err => console.error("Failed to load MA data in reports", err));
    }, []);

    // Calculate stats from real data
    const totalProducts = products.length;
    const totalValue = products.reduce((sum, p) => sum + (p.CurrentStock * (p.LastPrice || 0)), 0);
    const lowStockCount = products.filter(p => p.CurrentStock <= p.MinStock && p.MinStock > 0).length;
    const pendingPOCount = (purchaseOrders || []).filter(po => po.Status !== 'Completed').length;
    const transactionCount = (transactions || []).length;

    // MA Stats
    const activeMACount = maItems.filter(i => i.Status === 'Active').length;
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
            // Date filter
            if (!isInDateRange(t.TransDate, filterDateRange, filterCustomStart, filterCustomEnd)) return false;
            // Transaction type filter
            if (filterTransType !== 'all') {
                const type = (t.TransType || '').toUpperCase().trim();
                if (type !== filterTransType) return false;
            }
            // Category filter (via product lookup)
            if (filterCategories.length > 0) {
                const product = products.find(p => p.ProductID === t.ProductID);
                if (!filterCategories.includes(product?.DeviceType)) return false;
            }
            return true;
        });
    }, [transactions, products, filterDateRange, filterCustomStart, filterCustomEnd, filterTransType, filterCategories]);

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
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const dataMap = {};

        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = months[d.getMonth()];
            dataMap[key] = { month: key, inbound: 0, outbound: 0 };
        }

        // Sum transactions by month
        filteredTransactions.forEach(t => {
            const date = new Date(t.TransDate);
            const monthKey = months[date.getMonth()];
            if (dataMap[monthKey]) {
                const type = (t.TransType || '').toUpperCase().trim();
                const qty = Math.abs(t.Qty);
                if (type === 'IN' && !(t.RefInfo || '').includes('ยกเลิก Invoice')) dataMap[monthKey].inbound += qty;
                if (type === 'OUT' && !(t.RefInfo || '').includes('ยกเลิก Invoice')) dataMap[monthKey].outbound += qty;
            }
        });

        return Object.values(dataMap);
    }, [filteredTransactions]);

    // NEW: Cost & Usage Analysis (Money-based)
    const costAnalysisData = useMemo(() => {
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const dataMap = {};

        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = months[d.getMonth()];
            dataMap[key] = { month: key, spending: 0, consumption: 0 };
        }

        // Create product price lookup
        const priceMap = {};
        products.forEach(p => {
            priceMap[p.ProductID] = p.LastPrice || 0;
        });

        // Sum transactions by month (value-based)
        filteredTransactions.forEach(t => {
            const date = new Date(t.TransDate);
            const monthKey = months[date.getMonth()];
            if (dataMap[monthKey]) {
                const type = (t.TransType || '').toUpperCase().trim();
                const qty = Math.abs(t.Qty);
                const price = priceMap[t.ProductID] || 0;
                const value = qty * price;

                if (type === 'IN' && !(t.RefInfo || '').includes('ยกเลิก Invoice')) dataMap[monthKey].spending += value;
                if (type === 'OUT' && !(t.RefInfo || '').includes('ยกเลิก Invoice')) dataMap[monthKey].consumption += value;
            }
        });

        return Object.values(dataMap);
    }, [filteredTransactions, products]);

    // NEW: Slow Moving Items (No OUT transactions in last 3 months)
    const slowMovingItems = useMemo(() => {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        // Get all ProductIDs that had OUT transactions in last 3 months
        const activeProductIds = new Set();
        (transactions || []).forEach(t => {
            const date = new Date(t.TransDate);
            const type = (t.TransType || '').toUpperCase().trim();
            if (type === 'OUT' && date >= threeMonthsAgo && !(t.RefInfo || '').includes('ยกเลิก Invoice')) {
                activeProductIds.add(t.ProductID);
            }
        });

        // Filter products that are NOT in the active set and have stock > 0
        return filteredProducts
            .filter(p => !activeProductIds.has(p.ProductID) && p.CurrentStock > 0)
            .sort((a, b) => (b.CurrentStock * (b.LastPrice || 0)) - (a.CurrentStock * (a.LastPrice || 0)))
            .slice(0, 10);
    }, [transactions, filteredProducts]);

    // Calculate total dead stock value
    const deadStockValue = slowMovingItems.reduce((sum, p) => sum + (p.CurrentStock * (p.LastPrice || 0)), 0);

    // NEW: Top Consumers (Users who withdraw the most)
    const topConsumers = useMemo(() => {
        const userMap = {};

        filteredTransactions.forEach(t => {
            const type = (t.TransType || '').toUpperCase().trim();
            if (type === 'OUT' && !(t.RefInfo || '').includes('ยกเลิก Invoice')) {
                const userId = t.UserID || 'Unknown';
                if (!userMap[userId]) {
                    userMap[userId] = { userId, totalQty: 0, totalValue: 0, transactionCount: 0 };
                }
                const qty = Math.abs(t.Qty);
                const price = products.find(p => p.ProductID === t.ProductID)?.LastPrice || 0;

                userMap[userId].totalQty += qty;
                userMap[userId].totalValue += qty * price;
                userMap[userId].transactionCount += 1;
            }
        });

        return Object.values(userMap)
            .sort((a, b) => b.totalValue - a.totalValue)
            .slice(0, 5);
    }, [filteredTransactions, products]);

    // NEW: Top Withdrawn Items (Most withdrawn products)
    const topWithdrawnItems = useMemo(() => {
        const itemMap = {};
        filteredTransactions.forEach(t => {
            const type = (t.TransType || '').toUpperCase().trim();
            if (type === 'OUT' && !(t.RefInfo || '').includes('ยกเลิก Invoice')) {
                const productId = t.ProductID;
                const product = products.find(p => p.ProductID === productId);
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
            .sort((a, b) => b.totalQty - a.totalQty)
            .slice(0, 10);
    }, [filteredTransactions, products]);

    // NEW: Withdrawals By Category
    const withdrawalsByCategory = useMemo(() => {
        const catMap = {};
        filteredTransactions.forEach(t => {
            const type = (t.TransType || '').toUpperCase().trim();
            if (type === 'OUT' && !(t.RefInfo || '').includes('ยกเลิก Invoice')) {
                const product = products.find(p => p.ProductID === t.ProductID);
                const category = product?.DeviceType || 'ไม่ระบุ';
                if (!catMap[category]) {
                    catMap[category] = { name: category, value: 0, transactionCount: 0 };
                }
                catMap[category].value += Math.abs(t.Qty);
                catMap[category].transactionCount += 1;
            }
        });
        return Object.values(catMap).sort((a, b) => b.value - a.value);
    }, [filteredTransactions, products]);

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
            .map(c => ({ ...c, color: getChartColor(c.name) }))
            .sort((a, b) => b.value - a.value);
    }, [filteredProducts]);

    // NEW: Net Movement Trend (IN minus OUT per month)
    const netMovementTrend = useMemo(() => {
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const dataMap = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = months[d.getMonth()];
            dataMap[key] = { month: key, inbound: 0, outbound: 0, net: 0 };
        }
        filteredTransactions.forEach(t => {
            const date = new Date(t.TransDate);
            const monthKey = months[date.getMonth()];
            if (dataMap[monthKey]) {
                const type = (t.TransType || '').toUpperCase().trim();
                const qty = Math.abs(t.Qty);
                if (type === 'IN' && !(t.RefInfo || '').includes('ยกเลิก Invoice')) dataMap[monthKey].inbound += qty;
                if (type === 'OUT' && !(t.RefInfo || '').includes('ยกเลิก Invoice')) dataMap[monthKey].outbound += qty;
            }
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
        { id: 'ma', label: '🛡️ สัญญาบริการ (MA & License)', description: 'ส่งออกข้อมูลสัญญา ค่าใช้จ่ายรายสัปดาห์/รายปี', icon: Shield, color: 'from-blue-600 to-indigo-600' }
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

        setIsExporting(true);

        try {
            const params = new URLSearchParams();
            params.append('types', selectedTypes.join(','));
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            const response = await fetch(`${API_BASE}/report/export?${params.toString()}`);

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `report_${new Date().toISOString().split('T')[0]}.xlsx`;
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
                    value={`฿${(totalValue / 1000).toFixed(1)}K`}
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
                    value={activeMACount}
                    subtitle={expiringMACount > 0 ? `ใกล้หมดอายุ ${expiringMACount} รายการ` : `ข้อมูลลิขสิทธิ์ทั้งหมด`}
                    color={expiringMACount > 0 ? "from-rose-500 to-rose-600" : "from-blue-500 to-indigo-600"}
                />
            </div>

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
                            <YAxis stroke="#64748b" tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}K`} />
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

            {/* NEW: Stock Value by Category + Net Movement Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Stock Value by Category */}
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
                                                {cat.name}
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

                {/* Net Movement Trend */}
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
            </div>

            {/* NEW: Analytics Insights Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Slow Moving Items (Dead Stock) */}
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
                                {slowMovingItems.length > 0 ? slowMovingItems.map((item, idx) => (
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
                </motion.div>

                {/* Top Consumers */}
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
                        {topConsumers.length > 0 ? topConsumers.map((user, idx) => (
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
                                    ฿{(user.totalValue / 1000).toFixed(1)}K
                                </span>
                            </motion.div>
                        )) : (
                            <div className="text-center py-8 text-slate-400">
                                <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">ยังไม่มีข้อมูลการเบิก</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

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
                                {topWithdrawnItems.length > 0 ? topWithdrawnItems.slice(0, 5).map((item, idx) => (
                                    <tr key={item.productId} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-2 px-2">
                                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold ${idx === 0 ? 'bg-rose-500' : idx === 1 ? 'bg-rose-400' : idx === 2 ? 'bg-rose-300' : 'bg-slate-300'}`}>
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
                                        dataKey="name"
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
                                        formatter={(value, name, props) => [`${value} ชิ้น — คลิกเพื่อ Filter`, props.payload.name]}
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

            {/* NEW: MA Expiry Alerts Full Width */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 mt-6"
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">สัญญาบริการ (MA & License) ที่ต้องดำเนินการ</h3>
                        <p className="text-xs text-slate-500">หมดอายุแล้ว หรือ ใกล้หมดอายุภายใน 90 วัน</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-2 px-3 text-slate-500 font-medium">ระบบ/อุปกรณ์</th>
                                <th className="text-left py-2 px-3 text-slate-500 font-medium">หมวดหมู่</th>
                                <th className="text-left py-2 px-3 text-slate-500 font-medium">วันที่หมดอายุ</th>
                                <th className="text-right py-2 px-3 text-slate-500 font-medium">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {maAlerts.length > 0 ? maAlerts.map((ma, idx) => {
                                const isExpired = ma.daysRemaining <= 0;
                                return (
                                    <motion.tr
                                        key={ma.ItemID}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="border-b border-slate-100 hover:bg-slate-50"
                                    >
                                        <td className="py-3 px-3">
                                            <p className="font-medium text-slate-800">{ma.ItemName}</p>
                                        </td>
                                        <td className="py-3 px-3">
                                            <span className="text-xs text-slate-500">{ma.Category}</span>
                                        </td>
                                        <td className="py-3 px-3">
                                            <span className="text-sm font-mono text-slate-700">{formatThaiDateShort(ma.EndDate)}</span>
                                        </td>
                                        <td className="py-3 px-3 text-right">
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg text-white ${isExpired ? 'bg-gradient-to-r from-red-500 to-red-600' : 'bg-gradient-to-r from-orange-400 to-amber-500'}`}>
                                                {isExpired ? 'หมดอายุแล้ว' : `อีก ${ma.daysRemaining} วัน`}
                                            </span>
                                        </td>
                                    </motion.tr>
                                )
                            }) : (
                                <tr>
                                    <td colSpan="4" className="py-8 text-center text-slate-400">
                                        <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        ไม่มีสัญญาหมดอายุหรือใกล้หมดอายุ 👍
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </motion.div>

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
