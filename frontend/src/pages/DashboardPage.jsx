import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Package, TrendingUp, TrendingDown, AlertTriangle, DollarSign, ShoppingCart, Clock, ArrowRight, Flame, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { useData } from '../context/DataContext';
import { API_BASE } from '../config/api';
import { formatThaiDate } from '../utils/formatDate';
import StatCard from '../components/StatCard';
import LoadingState from '../components/LoadingState';
import { getChartColor, getBadgeStyle, getDeviceTypeColor } from '../utils/styleHelpers';

const DashboardPage = () => {
    const { products, transactions, purchaseOrders, loading } = useData();
    const navigate = useNavigate();
    const [maItems, setMaItems] = useState([]);

    const [isAnimating, setIsAnimating] = useState(true);

    React.useEffect(() => {
        // Let the route transition & Sidebar animation finish before rendering heavy charts
        const timer = setTimeout(() => setIsAnimating(false), 800);
        return () => clearTimeout(timer);
    }, []);

    React.useEffect(() => {
        const fetchMa = async () => {
            try {
                const res = await fetch(`${API_BASE}/ma`);
                if (res.ok) setMaItems(await res.json());
            } catch (err) { }
        };
        fetchMa();
    }, []);

    // 1. Calculate Stats
    const stats = useMemo(() => {
        const productCount = products.length;
        const totalStock = products.reduce((sum, p) => sum + p.CurrentStock, 0);
        const totalValue = products.reduce((sum, p) => sum + (p.CurrentStock * (p.LastPrice || 0)), 0);
        const lowStockCount = products.filter(p => p.CurrentStock <= p.MinStock && p.MinStock > 0).length;
        const activePOs = purchaseOrders.filter(po => po.Status !== 'Completed').length;

        return { productCount, totalStock, totalValue, lowStockCount, activePOs };
    }, [products, purchaseOrders]);

    // 2. Prepare Chart Data: Category Distribution
    const categoryData = useMemo(() => {
        const map = {};
        products.forEach(p => {
            if (!map[p.DeviceType]) map[p.DeviceType] = 0;
            map[p.DeviceType] += 1;
        });
        return Object.keys(map).map(key => ({
            name: key,
            value: map[key],
            fill: getChartColor(key)
        }));
    }, [products]);

    // 3. Prepare Chart Data: Stock Movement (Last 6 Months)
    const stockData = useMemo(() => {
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const dataMap = {};

        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${months[d.getMonth()]}`;
            dataMap[key] = { month: key, inbound: 0, outbound: 0 };
        }

        transactions.forEach(t => {
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
    }, [transactions]);

    // 4. Critical Low Stock Items (Top 5)
    const lowStockItems = useMemo(() => {
        return products
            .filter(p => p.CurrentStock <= p.MinStock && p.MinStock > 0)
            .sort((a, b) => (a.CurrentStock - a.MinStock) - (b.CurrentStock - b.MinStock))
            .slice(0, 5);
    }, [products]);

    // 5. Top 5 Most Withdrawn (Current Month)
    const topWithdrawn = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const withdrawMap = {};
        transactions.forEach(t => {
            const date = new Date(t.TransDate);
            const type = (t.TransType || '').toUpperCase().trim();
            const refInfo = t.RefInfo || '';
            if (type === 'OUT' && date.getMonth() === currentMonth && date.getFullYear() === currentYear && !refInfo.includes('ยกเลิก Invoice')) {
                const productId = t.ProductID;
                if (!withdrawMap[productId]) {
                    const product = products.find(p => p.ProductID === productId);
                    withdrawMap[productId] = {
                        ProductID: productId,
                        ProductName: t.ProductName || `ID: ${productId}`,
                        DeviceType: product ? product.DeviceType : 'Unknown',
                        totalQty: 0
                    };
                }
                withdrawMap[productId].totalQty += Math.abs(t.Qty);
            }
        });

        return Object.values(withdrawMap)
            .sort((a, b) => b.totalQty - a.totalQty)
            .slice(0, 5);
    }, [transactions]);

    // 6. Pending POs (Open/Partial, sorted by oldest first)
    const pendingPOs = useMemo(() => {
        return purchaseOrders
            .filter(po => po.Status !== 'Completed')
            .map(po => ({
                ...po,
                daysAgo: Math.floor((new Date() - new Date(po.RequestDate)) / (1000 * 60 * 60 * 24))
            }))
            .sort((a, b) => b.daysAgo - a.daysAgo)
            .slice(0, 5);
    }, [purchaseOrders]);

    // 8. Recommended Order Trend
    const orderTrendItems = useMemo(() => {
        return products
            .filter(p => p.CurrentStock > p.MinStock && p.MaxStock && p.MaxStock > 0)
            .map(p => {
                const orderNeedPercent = Math.round(((p.MaxStock - p.CurrentStock) / p.MaxStock) * 100);
                return {
                    ...p,
                    orderNeedPercent
                };
            })
            .sort((a, b) => b.orderNeedPercent - a.orderNeedPercent)
            .slice(0, 5);
    }, [products]);

    // 7. Recent Transactions (Last 5)
    const recentTransactions = useMemo(() => {
        return [...transactions]
            .sort((a, b) => new Date(b.TransDate) - new Date(a.TransDate))
            .slice(0, 5);
    }, [transactions]);

    // 9. MA Expiry Alerts (Expired or <= 90 days)
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
            .sort((a, b) => a.daysRemaining - b.daysRemaining)
            .slice(0, 5);
    }, [maItems]);
    
    // 10. Data for Stock Value Bar Chart
    const stockValueDistributionData = useMemo(() => {
        const data = categoryData.map(c => {
            const categoryProducts = products.filter(p => p.DeviceType === c.name);
            const dataObj = { name: c.name, fill: c.fill };
            let totalValue = 0;
            categoryProducts.forEach(p => {
                const val = p.CurrentStock * (p.LastPrice || 0);
                if (val > 0) {
                    const key = p.ProductName || `Product ID: ${p.ProductID}`;
                    dataObj[key] = (dataObj[key] || 0) + val;
                    totalValue += val;
                }
            });
            dataObj.totalValue = totalValue;
            return dataObj;
        }).sort((a, b) => b.totalValue - a.totalValue);

        const allKeys = Array.from(new Set(
            data.flatMap(d => Object.keys(d).filter(k => k !== 'name' && k !== 'fill' && k !== 'totalValue'))
        ));

        const keyToColorMap = {};
        allKeys.forEach(k => {
            const cat = data.find(d => d[k] > 0);
            if (cat) {
                keyToColorMap[k] = cat.fill;
            }
        });

        return { data, allKeys, keyToColorMap };
    }, [categoryData, products]);

    if (loading && products.length === 0) {
        return <LoadingState message="กำลังประมวลผลข้อมูล Dashboard... (Loading Dashboard...)" />;
    }

    if (isAnimating) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    // --- Custom Tooltip components ---
    const ChartTooltipStyle = {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        borderRadius: '14px',
        boxShadow: '0 20px 40px -8px rgba(0,0,0,0.35)',
        padding: '14px 18px',
        color: '#f1f5f9',
    };

    // --- Section header component ---
    const SectionHeader = ({ icon: Icon, gradient, title, actionText, onAction }) => (
        <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg shadow-${gradient.split('-')[2]}/20`}>
                    <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 text-[15px]">{title}</h3>
                </div>
            </div>
            {actionText && (
                <button onClick={onAction} className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 group">
                    {actionText} <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
            )}
        </div>
    );

    return (
        <div className="space-y-8 p-1">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-end justify-between"
            >
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 tracking-tight">DASHBOARD</h2>
                    </div>
                    <p className="text-slate-500 font-medium pl-[52px]">สรุปข้อมูลและสถานะคลังอุปกรณ์</p>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    icon={Package}
                    title="อุปกรณ์ทั้งหมด "
                    value={stats.productCount.toLocaleString()}
                    subValue={`รวม ${stats.totalStock.toLocaleString()} ชิ้น `}
                    color="from-blue-500 to-blue-600"
                />
                <StatCard
                    icon={ShoppingCart}
                    title="ใบสั่งซื้อรอส่ง "
                    value={stats.activePOs}
                    subValue="รายการ "
                    color="from-purple-500 to-purple-600"
                />
                <StatCard
                    icon={DollarSign}
                    title="มูลค่าสต็อคปัจจุบัน "
                    value={`฿${(stats.totalValue / 1000000).toFixed(2)}M`}
                    subValue={`รวมมูลค่า ฿${stats.totalValue.toLocaleString()}`}
                    color="from-pink-500 to-pink-600"
                />
                <StatCard
                    icon={AlertTriangle}
                    title="สต็อกต่ำ "
                    value={stats.lowStockCount}
                    subValue="รายการที่ต้องเติม "
                    changeType="down"
                    color="from-orange-500 to-orange-600"
                    isAlert={stats.lowStockCount > 0}
                />
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Stock Movement Chart */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="relative bg-white rounded-2xl p-6 shadow-lg border border-slate-100 overflow-hidden group hover:shadow-xl transition-shadow duration-300 min-w-0"
                >
                    {/* Subtle decorative gradient */}
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-blue-50 to-transparent rounded-bl-[60px] opacity-60 pointer-events-none" />
                    <h3 className="relative text-lg font-bold text-slate-800 mb-1">ความเคลื่อนไหวสต็อค 6 เดือน</h3>
                    <p className="relative text-xs text-slate-400 mb-6">รายงานรับเข้า-เบิกจ่ายรายเดือน</p>
                    <div className="w-full">
                        {isAnimating ? (
                            <div className="h-[300px] w-full bg-slate-50 rounded-xl animate-pulse" />
                        ) : (
                            <ResponsiveContainer width="100%" height={300} minWidth={0} debounce={50}>
                                <BarChart data={stockData}>
                                    <defs>
                                        <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8} />
                                        </linearGradient>
                                        <linearGradient id="outboundGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#a855f7" stopOpacity={1} />
                                            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis dataKey="month" stroke="#94a3b8" tickLine={false} axisLine={false} dy={10} fontSize={12} />
                                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={12} />
                                    <Tooltip
                                        contentStyle={ChartTooltipStyle}
                                        itemStyle={{ color: '#e2e8f0', fontSize: '13px' }}
                                        labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '6px' }}
                                        cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }} iconType="circle" iconSize={8} />
                                    <Bar dataKey="inbound" stackId="a" fill="url(#inboundGrad)" name="รับเข้า (Inbound)" radius={[0, 0, 0, 0]} barSize={28} />
                                    <Bar dataKey="outbound" stackId="a" fill="url(#outboundGrad)" name="เบิกจ่าย (Outbound)" radius={[6, 6, 0, 0]} barSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </motion.div>

                {/* Category Distribution (Count) */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="relative bg-white rounded-2xl p-6 shadow-lg border border-slate-100 overflow-hidden group hover:shadow-xl transition-shadow duration-300 min-w-0"
                >
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-purple-50 to-transparent rounded-bl-[60px] opacity-60 pointer-events-none" />
                    <h3 className="relative text-lg font-bold text-slate-800 mb-1">สัดส่วนอุปกรณ์</h3>
                    <p className="relative text-xs text-slate-400 mb-6">จำนวนรายการแยกตามหมวดหมู่</p>
                    <div className="w-full">
                        {isAnimating ? (
                            <div className="h-[300px] w-full bg-slate-50 rounded-xl animate-pulse" />
                        ) : (
                            <ResponsiveContainer width="100%" height={300} minWidth={0} debounce={50}>
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={65}
                                        outerRadius={90}
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="none"
                                        label={({ name, value }) => `${name} (${value})`}
                                    >
                                        {categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={ChartTooltipStyle} itemStyle={{ color: '#e2e8f0' }} />
                                    <Legend
                                        verticalAlign="middle"
                                        align="right"
                                        layout="vertical"
                                        iconType="circle"
                                        iconSize={8}
                                        wrapperStyle={{ fontSize: '13px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </motion.div>

                {/* Stock Value Distribution */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="relative bg-white rounded-2xl p-6 shadow-lg border border-slate-100 overflow-hidden lg:col-span-2 group hover:shadow-xl transition-shadow duration-300 min-w-0"
                >
                    <div className="absolute top-0 right-0 w-60 h-40 bg-gradient-to-bl from-pink-50 to-transparent rounded-bl-[60px] opacity-60 pointer-events-none" />
                    <div className="relative flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 mb-1">มูลค่าสต็อกตามหมวดหมู่</h3>
                            <p className="text-xs text-slate-400">เปรียบเทียบมูลค่าสินค้าคงคลังในแต่ละหมวด</p>
                        </div>
                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 px-4 py-2.5 rounded-xl text-right">
                            <p className="text-[10px] uppercase font-semibold text-indigo-400 tracking-wider">มูลค่ารวม</p>
                            <p className="text-base font-black text-indigo-700 font-mono">฿{stats.totalValue.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="w-full">
                        {isAnimating ? (
                            <div className="h-[320px] w-full bg-slate-50 rounded-xl animate-pulse" />
                        ) : (
                            <ResponsiveContainer width="100%" height={320} minWidth={0} debounce={50}>
                                <BarChart
                                    data={stockValueDistributionData.data}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={12} />
                                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(value) => `฿${(value / 1000).toFixed(0)}k`} fontSize={12} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(99, 102, 241, 0.04)' }}
                                        formatter={(value, name) => [`฿${value.toLocaleString()}`, name]}
                                        contentStyle={ChartTooltipStyle}
                                        itemStyle={{ color: '#e2e8f0', fontSize: '12px' }}
                                        labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '6px' }}
                                        itemSorter={(item) => -item.value}
                                    />
                                    {stockValueDistributionData.allKeys.map(key => (
                                        <Bar
                                            key={key}
                                            dataKey={key}
                                            stackId="a"
                                            fill={stockValueDistributionData.keyToColorMap[key] || '#8884d8'}
                                            stroke="rgba(255,255,255,0.5)"
                                            strokeWidth={1}
                                            barSize={36}
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Critical Alerts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Critical Low Stock */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-shadow duration-300"
                >
                    <SectionHeader
                        icon={AlertTriangle}
                        gradient="from-red-500 to-orange-500"
                        title="สต็อกวิกฤต"
                        actionText="ดูทั้งหมด"
                        onAction={() => navigate('/inventory', { state: { filter: 'lowstock' } })}
                    />
                    <div className="space-y-2.5">
                        {lowStockItems.length > 0 ? lowStockItems.map((item, idx) => (
                            <motion.div
                                key={item.ProductID}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="flex items-center justify-between p-3.5 bg-gradient-to-r from-red-50 to-orange-50/50 rounded-xl border border-red-100/80 hover:border-red-200 transition-colors"
                            >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                                        <AlertTriangle className="w-4 h-4 text-red-500" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm text-slate-800 truncate">{item.ProductName}</p>
                                        <p className="text-xs text-red-400 mt-0.5">คงเหลือ: {item.CurrentStock} | ขั้นต่ำ : {item.MinStock}</p>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-white bg-gradient-to-r from-red-500 to-red-600 px-2.5 py-1 rounded-lg shadow-sm flex-shrink-0 ml-2">
                                    ขาด  {item.MinStock - item.CurrentStock}
                                </span>
                            </motion.div>
                        )) : (
                            <div className="text-center py-10 text-slate-400">
                                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                                    <Package className="w-7 h-7 text-emerald-300" />
                                </div>
                                <p className="text-sm font-medium">สต็อกเพียงพอ 👍</p>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* MA Expiry Alerts */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-shadow duration-300"
                >
                    <SectionHeader
                        icon={Clock}
                        gradient="from-orange-400 to-red-500"
                        title="MA / License ใกล้หมดอายุ"
                        actionText="จัดการ MA"
                        onAction={() => navigate('/ma-license')}
                    />
                    <div className="space-y-2.5">
                        {maAlerts.length > 0 ? maAlerts.map((ma, idx) => {
                            const isExpired = ma.daysRemaining <= 0;
                            return (
                                <motion.div
                                    key={ma.ItemID}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${isExpired
                                        ? 'bg-gradient-to-r from-red-50 to-rose-50/50 border-red-100/80 hover:border-red-200'
                                        : 'bg-gradient-to-r from-orange-50 to-amber-50/50 border-orange-100/80 hover:border-orange-200'
                                        }`}
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isExpired ? 'bg-red-100' : 'bg-orange-100'}`}>
                                            <Clock className={`w-4 h-4 ${isExpired ? 'text-red-500' : 'text-orange-500'}`} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm text-slate-800 truncate">{ma.ItemName}</p>
                                            <p className={`text-xs truncate mt-0.5 ${isExpired ? 'text-red-400' : 'text-orange-500'}`}>หมวด: {ma.Category}</p>
                                        </div>
                                    </div>
                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm flex-shrink-0 ${isExpired
                                        ? 'bg-gradient-to-r from-red-500 to-red-600 text-white'
                                        : 'bg-gradient-to-r from-orange-400 to-amber-500 text-white'
                                        }`}>
                                        {isExpired ? 'Expired' : `${ma.daysRemaining} วัน`}
                                    </span>
                                </motion.div>
                            );
                        }) : (
                            <div className="text-center py-10 text-slate-400">
                                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                                    <Clock className="w-7 h-7 text-emerald-300" />
                                </div>
                                <p className="text-sm font-medium">ไม่มีสัญญาใกล้หมดอายุ ✅</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Operational Insights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Recommended Order Trend */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-shadow duration-300"
                >
                    <SectionHeader icon={TrendingUp} gradient="from-indigo-500 to-blue-500" title="แนวโน้มสั่งซื้อ" />
                    <div className="space-y-2.5">
                        {orderTrendItems.length > 0 ? orderTrendItems.map((item, idx) => (
                            <motion.div
                                key={item.ProductID}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="p-3.5 bg-gradient-to-r from-indigo-50/80 to-blue-50/40 rounded-xl border border-indigo-100/80 hover:border-indigo-200 transition-colors"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <p className="font-semibold text-sm text-slate-800 truncate flex-1 pr-2">{item.ProductName}</p>
                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ${item.orderNeedPercent >= 80 ? 'bg-red-500 text-white' : item.orderNeedPercent >= 50 ? 'bg-orange-400 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                                        เพิ่ม {item.orderNeedPercent}%
                                    </span>
                                </div>
                                {/* Progress bar */}
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${item.orderNeedPercent >= 80 ? 'bg-gradient-to-r from-red-400 to-red-500' : item.orderNeedPercent >= 50 ? 'bg-gradient-to-r from-orange-400 to-amber-400' : 'bg-gradient-to-r from-indigo-400 to-blue-400'}`}
                                            style={{ width: `${100 - item.orderNeedPercent}%` }}
                                        />
                                    </div>
                                    <p className="text-[11px] text-indigo-400 font-mono whitespace-nowrap">{item.CurrentStock}/{item.MaxStock}</p>
                                </div>
                            </motion.div>
                        )) : (
                            <div className="text-center py-10 text-slate-400">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
                                    <TrendingUp className="w-7 h-7 text-indigo-300" />
                                </div>
                                <p className="text-sm font-medium">ไม่มีข้อมูลแนวโน้ม</p>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Pending POs */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-shadow duration-300"
                >
                    <SectionHeader
                        icon={Clock}
                        gradient="from-amber-500 to-yellow-500"
                        title="รอรับของ"
                        actionText="รับอุปกรณ์"
                        onAction={() => navigate('/receive')}
                    />
                    <div className="space-y-2.5">
                        {pendingPOs.length > 0 ? pendingPOs.map((po, idx) => (
                            <motion.div
                                key={po.PO_ID}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="flex items-center justify-between p-3.5 bg-gradient-to-r from-amber-50/80 to-yellow-50/40 rounded-xl border border-amber-100/80 hover:border-amber-200 transition-colors"
                            >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                                        <ShoppingCart className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm text-slate-800">{po.PO_ID}</p>
                                        <p className="text-xs text-amber-500 truncate mt-0.5">{po.VendorName || 'ไม่ระบุผู้ขาย (Unknown Vendor)'}</p>
                                    </div>
                                </div>
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm flex-shrink-0 ml-2 text-white ${po.daysAgo > 7 ? 'bg-gradient-to-r from-red-500 to-red-600' : 'bg-gradient-to-r from-amber-400 to-amber-500'}`}>
                                    {po.daysAgo} วัน
                                </span>
                            </motion.div>
                        )) : (
                            <div className="text-center py-10 text-slate-400">
                                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                                    <ShoppingCart className="w-7 h-7 text-emerald-300" />
                                </div>
                                <p className="text-sm font-medium">ไม่มี PO ค้าง ✅</p>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Top Withdrawn */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-shadow duration-300"
                >
                    <SectionHeader icon={Flame} gradient="from-purple-500 to-indigo-500" title="เบิกสูงสุดเดือนนี้" />
                    <div className="space-y-2.5">
                        {topWithdrawn.length > 0 ? topWithdrawn.map((item, idx) => (
                            <motion.div
                                key={item.ProductID}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="flex items-center gap-3 p-3.5 bg-gradient-to-r from-slate-50 to-purple-50/30 rounded-xl border border-slate-100/80 hover:border-purple-200 transition-colors"
                            >
                                <span className={`w-7 h-7 rounded-lg text-white text-xs font-bold flex items-center justify-center shadow-sm bg-gradient-to-br ${getDeviceTypeColor(item.DeviceType).gradient}`}>
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-slate-800 truncate">{item.ProductName}</p>
                                </div>
                                <span className="text-sm font-bold text-purple-600 font-mono bg-purple-50 px-2 py-0.5 rounded-md">
                                    {item.totalQty} ชิ้น
                                </span>
                            </motion.div>
                        )) : (
                            <div className="text-center py-10 text-slate-400">
                                <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
                                    <TrendingDown className="w-7 h-7 text-purple-300" />
                                </div>
                                <p className="text-sm font-medium">ยังไม่มีข้อมูลการเบิกเดือนนี้</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Recent Activities */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative bg-white rounded-2xl p-8 shadow-lg border border-slate-100 overflow-hidden hover:shadow-xl transition-shadow duration-300"
            >
                <div className="absolute top-0 left-0 w-60 h-40 bg-gradient-to-br from-indigo-50 to-transparent rounded-br-[60px] opacity-50 pointer-events-none" />
                <div className="relative flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">กิจกรรมล่าสุด</h3>
                            <p className="text-xs text-slate-400">ธุรกรรมรับเข้า-เบิกจ่ายล่าสุด 5 รายการ</p>
                        </div>
                    </div>
                    <button onClick={() => navigate('/history')} className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 group">
                        ดูทั้งหมด <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>

                <div className="relative space-y-3">
                    {recentTransactions.map((t, idx) => {
                        const isIn = (t.TransType || '').toUpperCase().trim() === 'IN';
                        return (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.08 }}
                                className="flex items-center gap-4 p-4 rounded-xl bg-slate-50/70 border border-slate-100 hover:bg-white hover:shadow-md hover:border-slate-200 transition-all group"
                            >
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${isIn
                                    ? 'bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600'
                                    : 'bg-gradient-to-br from-red-100 to-red-50 text-red-600'
                                    }`}>
                                    {isIn ? <Package className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <p className="text-sm font-bold text-slate-800 truncate pr-4">
                                            {t.ProductName || `Product ID: ${t.ProductID}`}
                                        </p>
                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md flex-shrink-0 ${isIn
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-red-100 text-red-700'
                                            }`}>
                                            {isIn ? 'รับเข้า' : 'เบิกจ่าย'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center mt-1.5">
                                        <p className="text-xs text-slate-400 truncate">{t.RefInfo || 'ไม่มีข้อมูลอ้างอิง (No reference)'}</p>
                                        <p className="text-[11px] text-slate-400 font-mono ml-2 flex-shrink-0">
                                            {formatThaiDate(t.TransDate)}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right pl-4">
                                    <p className={`text-xl font-black font-mono ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {isIn ? '+' : '-'}{Math.abs(t.Qty)}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                    {recentTransactions.length === 0 && (
                        <div className="text-center py-14 text-slate-400">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                                <Package className="w-7 h-7 text-slate-300" />
                            </div>
                            <p className="font-medium">ไม่มีข้อมูล</p>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default DashboardPage;
