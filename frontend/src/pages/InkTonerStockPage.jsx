import React, { useState, useEffect } from 'react';
import { Search, Printer, Package, AlertTriangle, List, LayoutGrid, TrendingDown, Truck, Droplet, RefreshCw, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { API_BASE } from '../config/api';
import Pagination from '../components/Pagination';

// StatCard Component (same style as InventoryPage)
const StatCard = ({ icon: Icon, title, value, color }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow"
    >
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm text-slate-600 mb-1">{title}</p>
                <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
            </div>
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center`}>
                <Icon className="w-7 h-7 text-white" />
            </div>
        </div>
    </motion.div>
);

const InkTonerStockPage = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('list');
    const [showLowStock, setShowLowStock] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState(null);
    const itemsPerPage = 10;

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/ink-toner`);
            if (!res.ok) throw new Error('Failed to fetch data');
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error('Error fetching ink & toner stock:', err);
            setError('ไม่สามารถดึงข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filtered data
    const filteredData = data.filter(item => {
        const matchesSearch =
            item.Prt_Code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.Prt_Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.Vender?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLowStock = !showLowStock || (item.CurrentStock <= item.Minimum);
        return matchesSearch && matchesLowStock;
    });

    // Sorting Data
    const sortedData = [...filteredData].sort((a, b) => {
        if (!sortConfig) return 0;
        let aVal = a[sortConfig.key] || '';
        let bVal = b[sortConfig.key] || '';

        // Handle numeric sorting for stock fields
        if (['CurrentStock', 'SaftyStock', 'Minimum'].includes(sortConfig.key)) {
            aVal = Number(aVal) || 0;
            bVal = Number(bVal) || 0;
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    // Pagination
    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const paginatedData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, showLowStock]);

    // Stats
    const totalItems = data.length;
    const lowStockCount = data.filter(item => item.CurrentStock <= item.Minimum).length;
    const uniqueVendors = [...new Set(data.map(item => item.Vender).filter(Boolean))].length;
    const outOfStockCount = data.filter(item => item.CurrentStock <= 0).length;

    // Check if item is low stock (CurrentStock <= Minimum)
    const isLowStock = (item) => item.CurrentStock <= item.Minimum;
    const isOutOfStock = (item) => item.CurrentStock <= 0;
    const isHealthy = (item) => item.CurrentStock >= item.SaftyStock;

    // Detect toner color from name
    const getTonerType = (item) => {
        const name = (item.Spect || '').toUpperCase();
        if (name.includes('CYAN')) return 'cyan';
        if (name.includes('BLACK')) return 'black';
        if (name.includes('MAGENTA')) return 'magenta';
        if (name.includes('YELLOW')) return 'yellow';
        return 'default';
    };

    // Gradient for card icon & background based on toner color
    const getTonerGradient = (item) => {
        switch (getTonerType(item)) {
            case 'cyan': return 'from-pink-400 to-pink-600';       // ชมพู
            case 'black': return 'from-slate-700 to-slate-900';     // ดำ
            case 'magenta': return 'from-blue-500 to-blue-700';       // น้ำเงิน
            case 'yellow': return 'from-yellow-400 to-yellow-500';   // เหลือง
            default: return 'from-indigo-500 to-indigo-600';
        }
    };

    // Badge background color
    const getTonerBadgeBg = (item) => {
        switch (getTonerType(item)) {
            case 'cyan': return 'bg-pink-500';
            case 'black': return 'bg-slate-800';
            case 'magenta': return 'bg-blue-600';
            case 'yellow': return 'bg-yellow-500';
            default: return 'bg-indigo-600';
        }
    };

    // Icon text color for Droplet (for yellow we use darker text)
    const getTonerIconColor = (item) => {
        return getTonerType(item) === 'yellow' ? 'text-yellow-900' : 'text-white';
    };

    // Color helper for stock status
    const getStockColor = (item) => {
        if (isOutOfStock(item)) return 'text-red-600';
        if (isLowStock(item)) return 'text-orange-500';
        if (isHealthy(item)) return 'text-emerald-600';
        return 'text-amber-500'; // between Minimum and SaftyStock
    };

    const getStockBg = (item) => {
        if (isOutOfStock(item)) return 'bg-red-50 border-red-100';
        if (isLowStock(item)) return 'bg-orange-50 border-orange-100';
        return 'bg-emerald-50 border-emerald-100';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full"
                />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">เกิดข้อผิดพลาด</h3>
                <p className="text-slate-500">{error}</p>
                <button
                    onClick={fetchData}
                    className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                    ลองใหม่อีกครั้ง
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    icon={Printer}
                    title="รายการทั้งหมด"
                    value={totalItems.toLocaleString()}
                    color="from-blue-500 to-blue-600"
                />
                <StatCard
                    icon={AlertTriangle}
                    title="สต็อกต่ำ"
                    value={lowStockCount}
                    color="from-orange-500 to-orange-600"
                />
                <StatCard
                    icon={Package}
                    title="หมดสต็อก"
                    value={outOfStockCount}
                    color="from-red-500 to-red-600"
                />
                <StatCard
                    icon={Truck}
                    title="ผู้จัดจำหน่าย"
                    value={uniqueVendors}
                    color="from-purple-500 to-purple-600"
                />
            </div>

            {/* Header Controls */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
            >
                <div>
                    <h2 className="text-3xl font-black mb-1 text-slate-800">INK & TONER STOCK</h2>
                    <p className="text-slate-500 font-medium">ข้อมูลสต็อกหมึกและโทนเนอร์จากระบบ DCI</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Refresh Button */}
                    <button
                        onClick={fetchData}
                        className="bg-white hover:bg-indigo-50 text-indigo-600 border border-slate-200 font-bold px-3 py-2 rounded-xl transition-all shadow-sm flex items-center gap-2"
                        title="รีเฟรชข้อมูล"
                    >
                        <RefreshCw size={18} />
                        <span className="hidden sm:inline">รีเฟรช</span>
                    </button>

                    {/* View Mode Toggle */}
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
                            placeholder="ค้นหาหมึก/โทนเนอร์..."
                            className="bg-transparent border-none outline-none text-sm w-48 text-slate-700 placeholder-slate-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Low Stock Filter */}
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
                                <th className="p-4 pl-6 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('Prt_Code')}>
                                    <div className="flex items-center gap-1">รหัส {sortConfig?.key === 'Prt_Code' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('Prt_Name')}>
                                    <div className="flex items-center gap-1">ชื่อรายการ {sortConfig?.key === 'Prt_Name' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('Spect')}>
                                    <div className="flex items-center gap-1">สเปค {sortConfig?.key === 'Spect' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('CurrentStock')}>
                                    <div className="flex items-center justify-center gap-1">คงเหลือ {sortConfig?.key === 'CurrentStock' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('SaftyStock')}>
                                    <div className="flex items-center justify-center gap-1">Safety Stock {sortConfig?.key === 'SaftyStock' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('Minimum')}>
                                    <div className="flex items-center justify-center gap-1">Minimum {sortConfig?.key === 'Minimum' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('Um')}>
                                    <div className="flex items-center gap-1">หน่วย {sortConfig?.key === 'Um' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 cursor-pointer hover:bg-slate-100 group transition-colors" onClick={() => handleSort('Vender')}>
                                    <div className="flex items-center gap-1">ผู้จัดจำหน่าย {sortConfig?.key === 'Vender' ? (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}</div>
                                </th>
                                <th className="p-4 text-center">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.map((item, idx) => (
                                <motion.tr
                                    key={item.Prt_Code}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.02 }}
                                    className={`hover:bg-slate-50 transition-colors ${isLowStock(item) ? 'bg-orange-50/30' : ''} ${isOutOfStock(item) ? 'bg-red-50/30' : ''}`}
                                >
                                    <td className="p-4 pl-6">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getTonerGradient(item)} flex items-center justify-center shrink-0 shadow-md`}>
                                                <Droplet size={18} className={getTonerIconColor(item)} />
                                            </div>
                                            <span className="font-mono font-bold text-slate-700 text-xs">{item.Prt_Code}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className="font-bold text-slate-700 block whitespace-nowrap">{item.Prt_Name}</span>
                                    </td>
                                    <td className="p-4 text-slate-500 text-xs whitespace-nowrap">{item.Spect || '-'}</td>
                                    <td className={`p-4 text-center font-mono font-bold text-lg ${getStockColor(item)}`}>
                                        {item.CurrentStock ?? 0}
                                    </td>
                                    <td className="p-4 text-center text-slate-400 font-mono">{item.SaftyStock ?? 0}</td>
                                    <td className="p-4 text-center text-slate-400 font-mono">{item.Minimum ?? 0}</td>
                                    <td className="p-4 text-slate-500 font-medium text-xs">{item.Um || '-'}</td>
                                    <td className="p-4">
                                        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-lg whitespace-nowrap">
                                            {item.Vender || '-'}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {isOutOfStock(item) ? (
                                            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-100 flex items-center gap-1 w-fit">
                                                <AlertTriangle size={12} /> หมด
                                            </span>
                                        ) : isLowStock(item) ? (
                                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg border border-orange-100 flex items-center gap-1 w-fit">
                                                <TrendingDown size={12} /> ต่ำ
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">ปกติ</span>
                                        )}
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredData.length === 0 && (
                        <div className="text-center py-10 text-slate-400">ไม่พบรายการ</div>
                    )}
                </motion.div>
            )}

            {/* GRID VIEW */}
            {viewMode === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {paginatedData.map((item, idx) => (
                        <motion.div
                            key={item.Prt_Code}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            className={`group bg-white rounded-2xl border p-4 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden ${isLowStock(item) ? 'border-orange-200 ring-1 ring-orange-100' : 'border-slate-100'} ${isOutOfStock(item) ? 'border-red-200 ring-1 ring-red-100' : ''}`}
                        >
                            {/* Decorative Gradient Background */}
                            <div className={`absolute top-0 left-0 w-full h-20 bg-gradient-to-br ${getTonerGradient(item)} opacity-10 z-0`}></div>

                            {/* Status Badge */}
                            {(isOutOfStock(item) || isLowStock(item)) && (
                                <div className="absolute top-2 right-2 z-20">
                                    {isOutOfStock(item) ? (
                                        <span className="text-[9px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full shadow-sm">หมดสต็อก</span>
                                    ) : (
                                        <span className="text-[9px] font-bold text-white bg-orange-500 px-2 py-0.5 rounded-full shadow-sm">สต็อกต่ำ</span>
                                    )}
                                </div>
                            )}

                            <div className="relative z-10 flex flex-col items-center text-center">
                                {/* Icon */}
                                <div className={`w-20 h-20 mb-3 rounded-xl overflow-hidden shadow-lg flex items-center justify-center border-2 border-white group-hover:scale-105 transition-transform bg-gradient-to-br ${getTonerGradient(item)}`}>
                                    <Droplet size={32} className={getTonerIconColor(item)} />
                                </div>

                                <h3 className="font-bold text-slate-800 text-sm mb-1 line-clamp-2 min-h-[2.5rem]">{item.Prt_Name}</h3>
                                <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full mb-2 shadow-sm text-white ${getTonerBadgeBg(item)}`}>
                                    {item.Prt_Code}
                                </span>

                                <div className="grid grid-cols-2 gap-2 w-full pt-2 border-t border-slate-100 mb-2">
                                    <div>
                                        <p className="text-[11px] text-slate-500 font-bold uppercase">คงเหลือ</p>
                                        <p className={`text-lg font-black ${getStockColor(item)}`}>
                                            {item.CurrentStock ?? 0}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] text-slate-500 font-bold uppercase">Safety</p>
                                        <p className="text-lg font-black text-slate-700">{item.SaftyStock ?? 0}</p>
                                    </div>
                                </div>

                                {/* Vendor Info */}
                                <div className="w-full mb-1 px-1">
                                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg p-2">
                                        <div className="p-1.5 bg-white rounded-md shadow-sm text-purple-500">
                                            <Truck size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] text-slate-500 font-bold uppercase leading-none mb-0.5">ผู้จัดจำหน่าย</p>
                                            <p className="text-xs font-bold text-slate-700 truncate">{item.Vender || '-'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Unit & Spec */}
                                <div className="w-full px-1 mt-1">
                                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                                        <span>หน่วย: <strong className="text-slate-600">{item.Um || '-'}</strong></span>
                                        <span>Min: <strong className="text-slate-600">{item.Minimum ?? 0}</strong></span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {filteredData.length === 0 && viewMode === 'grid' && (
                <div className="text-center py-10 text-slate-400">ไม่พบรายการ</div>
            )}

            {/* Pagination */}
            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                totalItems={filteredData.length}
            />

            {/* Results Count */}
            <div className="text-center text-sm text-slate-400 pb-4">
                แสดง {paginatedData.length} จาก {filteredData.length} รายการ
            </div>
        </div>
    );
};

export default InkTonerStockPage;
