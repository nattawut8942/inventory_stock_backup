import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useSearchParams } from 'react-router-dom';
import {
    Search, Calendar, RefreshCw, AlertTriangle, Download,
    ArrowUp, ArrowDown, ArrowUpDown, TrendingUp, TrendingDown, Package, ClipboardList
} from 'lucide-react';
import { API_BASE } from '../config/api';
import { formatThaiDate } from '../utils/formatDate';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import Pagination from '../components/Pagination';

// ประเภทรายการ: ใช้ TransType เป็นหลักเท่านั้น (IN = รับเข้า, OUT = เบิกออก)
const isInRow = (t) => (t.TransType || '').toUpperCase().trim() === 'IN';

// แปลง Date เป็น YYYY-MM-DD ตามเวลาท้องถิ่น
const toYMD = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ช่วงวันที่เริ่มต้น: ย้อนหลัง 3 เดือนจนถึงสิ้นเดือนนี้
const getDefaultDateRange = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = new Date(y, m - 2, 1);
    const lastDay = new Date(y, m + 1, 0);
    return { startDate: toYMD(start), endDate: toYMD(lastDay) };
};

// ช่วงวันที่ของ quick chips
const getQuickRange = (key) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (key) {
        case 'today':
            return { startDate: toYMD(now), endDate: toYMD(now) };
        case '7d': {
            const from = new Date(now);
            from.setDate(now.getDate() - 6);
            return { startDate: toYMD(from), endDate: toYMD(now) };
        }
        case 'month':
            return { startDate: toYMD(new Date(y, m, 1)), endDate: toYMD(new Date(y, m + 1, 0)) };
        case '3m':
        default:
            return getDefaultDateRange();
    }
};

const QUICK_RANGES = [
    { key: 'today', label: 'วันนี้' },
    { key: '7d', label: '7 วันล่าสุด' },
    { key: 'month', label: 'เดือนนี้' },
    { key: '3m', label: '3 เดือน' },
];

const HistoryPage = () => {
    const [filter, setFilter] = useState('ALL'); // ALL, IN, OUT
    // รับคำค้นจากลิงก์ เช่น /history?q=ชื่อสินค้า (ใช้จากหน้าตรวจนับ)
    const [urlParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState(() => urlParams.get('q') || '');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20);
    const [sortKey, setSortKey] = useState('TransDate'); // TransDate | Qty | ProductName
    const [sortDir, setSortDir] = useState('desc');

    const defaultRange = getDefaultDateRange();
    const [dateFrom, setDateFrom] = useState(defaultRange.startDate);
    const [dateTo, setDateTo] = useState(defaultRange.endDate);
    const [activeQuick, setActiveQuick] = useState('3m');

    // ข้อมูลประวัติโหลดตามตัวกรองจาก server (ไม่ดึงทั้งตารางทุกครั้ง)
    const [rows, setRows] = useState([]);
    const [fetching, setFetching] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams();
        if (filter !== 'ALL') params.set('filter', filter);
        if (dateFrom) params.set('startDate', dateFrom);
        if (dateTo) params.set('endDate', dateTo);

        setFetching(true);
        setFetchError(null);
        fetch(`${API_BASE}/transactions?${params.toString()}`, { signal: controller.signal })
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data) => setRows(Array.isArray(data) ? data : []))
            .catch((err) => {
                if (err.name !== 'AbortError') setFetchError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setFetching(false);
            });

        return () => controller.abort();
    }, [filter, dateFrom, dateTo, reloadKey]);

    // ค้นหาข้อความ (ฝั่ง client) บนข้อมูลที่โหลดมาแล้ว
    const filteredTransactions = useMemo(() => {
        let result = rows;

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter(t =>
                (t.UserID || '').toLowerCase().includes(term) ||
                (t.ProductName || '').toLowerCase().includes(term) ||
                (t.RefInfo || '').toLowerCase().includes(term) ||
                (t.EmployeeName || '').toLowerCase().includes(term) ||
                (t.SerialNumber || '').toLowerCase().includes(term) ||
                (t.FixedAssetCode || '').toLowerCase().includes(term) ||
                (t.BG_No || '').toLowerCase().includes(term) ||
                (t.CostCenter || '').toLowerCase().includes(term)
            );
        }

        return result;
    }, [rows, searchTerm]);

    // เรียงลำดับตามคอลัมน์ที่เลือก
    const sortedTransactions = useMemo(() => {
        const dir = sortDir === 'asc' ? 1 : -1;
        const arr = [...filteredTransactions];
        arr.sort((a, b) => {
            if (sortKey === 'ProductName') {
                return (a.ProductName || '').localeCompare(b.ProductName || '', 'th') * dir;
            }
            const va = sortKey === 'Qty'
                ? Math.abs(Number(a.Qty) || 0)
                : new Date(a.TransDate).getTime() || 0;
            const vb = sortKey === 'Qty'
                ? Math.abs(Number(b.Qty) || 0)
                : new Date(b.TransDate).getTime() || 0;
            return (va - vb) * dir;
        });
        return arr;
    }, [filteredTransactions, sortKey, sortDir]);

    // สรุปตัวเลขของรายการที่แสดงอยู่
    const summary = useMemo(() => {
        let inQty = 0;
        let outQty = 0;
        const products = new Set();
        filteredTransactions.forEach((t) => {
            const q = Math.abs(Number(t.Qty) || 0);
            if (isInRow(t)) inQty += q;
            else outQty += q;
            products.add(t.ProductID ?? t.ProductName);
        });
        return { count: filteredTransactions.length, inQty, outQty, products: products.size };
    }, [filteredTransactions]);

    // Pagination Logic
    const totalPages = Math.ceil(sortedTransactions.length / itemsPerPage);
    const currentTransactions = sortedTransactions.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset page when filters or sorting change
    useEffect(() => {
        setCurrentPage(1);
    }, [filter, searchTerm, dateFrom, dateTo, sortKey, sortDir]);

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'ProductName' ? 'asc' : 'desc');
        }
    };

    const applyQuickRange = (key) => {
        const r = getQuickRange(key);
        setDateFrom(r.startDate);
        setDateTo(r.endDate);
        setActiveQuick(key);
    };

    const resetFilters = () => {
        setSearchTerm('');
        setFilter('ALL');
        applyQuickRange('3m');
    };

    const isDefaultFilters =
        dateFrom === defaultRange.startDate && dateTo === defaultRange.endDate &&
        searchTerm === '' && filter === 'ALL';

    const exportExcel = () => {
        const data = sortedTransactions.map((t) => ({
            'วันที่บันทึก': formatThaiDate(t.TransDate),
            'ประเภท': t.TransType,
            'รายการ': t.ProductName,
            'จำนวน': isInRow(t) ? Math.abs(t.Qty) : -Math.abs(t.Qty),
            'หมายเหตุ': t.RefInfo,
            'User': t.UserID,
            'เบิกให้': t.EmployeeName,
            'รหัสพนักงาน': t.EmployeeCode,
            'Cost Center': t.CostCenter,
            'BG No': t.BG_No,
            'S/N': t.SerialNumber,
            'Fixed Asset': t.FixedAssetCode,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'History');
        XLSX.writeFile(wb, `History_${dateFrom || 'all'}_${dateTo || 'all'}.xlsx`);
    };

    const renderSortTh = (key, label, className = '') => {
        const active = sortKey === key;
        return (
            <th className={`p-4 whitespace-nowrap ${className}`} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className={`inline-flex items-center gap-1 uppercase tracking-widest hover:text-indigo-600 transition-colors ${active ? 'text-indigo-600' : ''}`}
                >
                    {label}
                    {active
                        ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                        : <ArrowUpDown size={12} className="opacity-40" />}
                </button>
            </th>
        );
    };

    if (fetching && rows.length === 0 && !fetchError) {
        return <LoadingState message="กำลังโหลดประวัติการใช้งาน..." />;
    }

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-5">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h2 className="text-3xl font-black mb-2 text-slate-800">TRANSACTION HISTORY</h2>
                    <p className="text-slate-500 font-medium">ประวัติการทำรายการย้อนหลัง</p>
                </div>
                <div className="flex w-full lg:w-auto flex-wrap items-center gap-3">
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        aria-label="กรองตามประเภทรายการ"
                        className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm text-slate-600 outline-none focus:border-indigo-500 font-bold"
                    >
                        <option value="ALL">ทุกประเภท (All)</option>
                        <option value="IN">รับเข้า (INBOUND)</option>
                        <option value="OUT">เบิกออก (OUTBOUND)</option>
                    </select>
                    <div className="flex flex-1 lg:flex-none min-w-0 items-center gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                        <Search size={18} className="text-slate-400 shrink-0" />
                        <input
                            type="text"
                            aria-label="ค้นหาประวัติ"
                            placeholder="ค้นหาชื่ออุปกรณ์ / User..."
                            className="bg-transparent border-none outline-none text-sm w-full lg:w-48 min-w-0 text-slate-700 placeholder-slate-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={exportExcel}
                        disabled={sortedTransactions.length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Download size={16} /> Export Excel
                    </button>
                    <button
                        type="button"
                        onClick={() => setReloadKey((k) => k + 1)}
                        disabled={fetching}
                        title="รีเฟรชข้อมูล"
                        aria-label="รีเฟรชข้อมูล"
                        className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-indigo-600 disabled:opacity-50 transition-colors"
                    >
                        <RefreshCw size={18} className={fetching ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <SummaryCard icon={ClipboardList} label="จำนวนรายการ" value={summary.count.toLocaleString()} tone="slate" />
                <SummaryCard icon={TrendingUp} label="รับเข้ารวม (ชิ้น)" value={`+${summary.inQty.toLocaleString()}`} tone="emerald" />
                <SummaryCard icon={TrendingDown} label="เบิกออกรวม (ชิ้น)" value={`-${summary.outQty.toLocaleString()}`} tone="red" />
                <SummaryCard icon={Package} label="จำนวนสินค้า" value={summary.products.toLocaleString()} tone="indigo" />
            </div>

            {/* Date range: quick chips + custom */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex flex-wrap gap-2" role="group" aria-label="ช่วงเวลาด่วน">
                    {QUICK_RANGES.map((q) => (
                        <button
                            key={q.key}
                            type="button"
                            onClick={() => applyQuickRange(q.key)}
                            aria-pressed={activeQuick === q.key}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${activeQuick === q.key
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                                }`}
                        >
                            {q.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                    <Calendar size={18} className="text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-400 shrink-0">เริ่มต้น</span>
                    <input
                        type="date"
                        aria-label="วันที่เริ่มต้น"
                        className="bg-transparent border-none outline-none text-sm text-slate-700"
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); setActiveQuick(null); }}
                    />
                </div>
                <span className="text-slate-400 font-bold">—</span>
                <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                    <Calendar size={18} className="text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-400 shrink-0">สิ้นสุด</span>
                    <input
                        type="date"
                        aria-label="วันที่สิ้นสุด"
                        className="bg-transparent border-none outline-none text-sm text-slate-700"
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); setActiveQuick(null); }}
                    />
                </div>
                {!isDefaultFilters && (
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        CLEAR
                    </button>
                )}
                <span className="ml-auto text-xs text-slate-400 font-medium" aria-live="polite">
                    {fetching ? 'กำลังโหลด...' : `แสดง ${summary.count.toLocaleString()} รายการ`}
                </span>
            </div>

            {fetchError && (
                <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm">
                    <span className="flex items-center gap-2">
                        <AlertTriangle size={16} className="shrink-0" />
                        โหลดประวัติไม่สำเร็จ ({fetchError})
                    </span>
                    <button
                        type="button"
                        onClick={() => setReloadKey((k) => k + 1)}
                        className="font-bold text-red-700 hover:underline"
                    >
                        ลองอีกครั้ง
                    </button>
                </div>
            )}

            {/* Desktop Table View */}
            <div className={`hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto transition-opacity ${fetching ? 'opacity-60' : ''}`}>
                <table className="w-full text-left text-lg min-w-max table-auto">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[12px] tracking-widest border-b border-slate-200">
                        <tr>
                            {renderSortTh('TransDate', 'วันที่บันทึก', 'pl-6')}
                            <th className="p-4 whitespace-nowrap">หมวดหมู่</th>
                            {renderSortTh('ProductName', 'รายการ')}
                            {renderSortTh('Qty', 'จำนวน', 'text-center')}
                            <th className="p-4 whitespace-nowrap">หมายเหตุ</th>
                            <th className="p-4 whitespace-nowrap">User</th>
                            <th className="p-4 whitespace-nowrap">เบิกให้</th>
                            <th className="p-4 whitespace-nowrap">Asset Info</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {currentTransactions.map((t) => {
                            const isIn = isInRow(t);
                            return (
                                <tr key={t.TransID} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 pl-6 text-slate-500 font-mono text-xs whitespace-nowrap">
                                        {formatThaiDate(t.TransDate)}
                                    </td>
                                    <td className="p-4 whitespace-nowrap">
                                        <span
                                            className={`font-bold px-2.5 py-1 rounded-full text-[10px] border ${isIn
                                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                : "bg-red-50 text-red-600 border-red-100"
                                                }`}
                                        >
                                            {t.TransType}
                                        </span>
                                    </td>
                                    <td className="p-4 font-bold text-slate-700 whitespace-nowrap text-xs">
                                        {t.ProductName}
                                    </td>
                                    <td
                                        className={`p-4 text-center font-bold font-mono text-sm whitespace-nowrap ${isIn ? "text-emerald-600" : "text-red-500"}`}
                                    >
                                        {isIn ? "+" : "-"}
                                        {Math.abs(t.Qty)}
                                    </td>
                                    <td className="p-4 text-slate-500 text-xs max-w-[200px]">
                                        {(t.RefInfo || '').split(':').map((part, idx) => (
                                            <span key={idx}>
                                                {idx > 0 && <br />}
                                                {idx > 0 ? `: ${part.trim()}` : part}
                                            </span>
                                        ))}
                                    </td>
                                    <td className="p-4 whitespace-nowrap">
                                        <span className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                                            <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                                {t.UserID?.[0]?.toUpperCase()}
                                            </div>
                                            {(t.UserID || '').toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="p-4 whitespace-nowrap">
                                        {t.EmployeeName ? (
                                            <div className="text-xs">
                                                <span className="font-bold text-indigo-600 font-mono block">{t.EmployeeName}</span>
                                                {t.EmployeeCode && <span className="text-slate-400 text-[10px]">{t.EmployeeCode}</span>}
                                            </div>
                                        ) : (
                                            <span className="text-slate-300 text-xs">-</span>
                                        )}
                                    </td>
                                    <td className="p-4 whitespace-nowrap">
                                        {(t.SerialNumber || t.FixedAssetCode) ? (
                                            <div className="inline-flex flex-col gap-0.5 text-[10px] font-mono bg-amber-50 border border-amber-100 text-amber-700 rounded-lg px-2 py-1">
                                                <span>S/N: {t.SerialNumber || '-'}</span>
                                                <span>FIX: {t.FixedAssetCode || '-'}</span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-300 text-xs">-</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* แสดงหน้าว่างเมื่อไม่พบข้อมูล (Empty State) */}
                {sortedTransactions.length === 0 && !fetching && (
                    <div className="p-12">
                        <EmptyState
                            message="ไม่พบรายการประวัติที่ตรงกับเงื่อนไข"
                            actionLabel={isDefaultFilters ? null : "ล้างตัวกรอง"}
                            onAction={resetFilters}
                        />
                    </div>
                )}
            </div>

            {/* Mobile Card View */}
            <div className={`lg:hidden space-y-4 transition-opacity ${fetching ? 'opacity-60' : ''}`}>
                {currentTransactions.map((t) => {
                    const isIn = isInRow(t);
                    return (
                        <div key={t.TransID} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center font-black ${isIn ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                        {isIn ? '+' : '-'}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-slate-800 text-sm line-clamp-1">{t.ProductName}</h4>
                                        <p className="text-xs text-slate-500">{formatThaiDate(t.TransDate)}</p>
                                    </div>
                                </div>
                                <span className={`shrink-0 font-bold px-2 py-0.5 rounded-lg text-[10px] border ${isIn ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                    {t.TransType}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                <div className="bg-slate-50 p-2 rounded-lg">
                                    <span className="text-slate-400 block mb-0.5">อ้างอิง</span>
                                    <span className="font-medium text-slate-700 truncate block">{t.RefInfo || '-'}</span>
                                </div>
                                <div className="bg-slate-50 p-2 rounded-lg">
                                    <span className="text-slate-400 block mb-0.5">USER</span>
                                    <span className="font-medium text-slate-700 truncate block">{t.UserID}</span>
                                </div>
                            </div>
                            {t.EmployeeName && (
                                <div className="bg-indigo-50 p-2 rounded-lg mb-2">
                                    <span className="text-indigo-400 block mb-0.5 text-xs">เบิกให้</span>
                                    <span className="font-bold text-indigo-700 font-mono truncate block text-xs">
                                        {t.EmployeeName} {t.EmployeeCode && `· ${t.EmployeeCode}`}
                                    </span>
                                </div>
                            )}
                            {(t.SerialNumber || t.FixedAssetCode) && (
                                <div className="bg-amber-50 p-2 rounded-lg">
                                    <span className="text-amber-500 block mb-0.5 text-xs">Asset Info</span>
                                    <span className="font-bold text-amber-700 font-mono truncate block text-xs">
                                        S/N: {t.SerialNumber || '-'} · FA: {t.FixedAssetCode || '-'}
                                    </span>
                                </div>
                            )}

                            <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-100">
                                <span className="text-xs font-bold text-slate-400">QUANTITY</span>
                                <span className={`text-lg font-black font-mono ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {isIn ? '+' : '-'}{Math.abs(t.Qty)}
                                </span>
                            </div>
                        </div>
                    );
                })}
                {sortedTransactions.length === 0 && !fetching && (
                    <EmptyState message="ไม่พบข้อมูล" />
                )}
            </div>

            {/* Pagination */}
            {sortedTransactions.length > 0 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={sortedTransactions.length}
                />
            )}
        </div>
    );
};

const TONE_CLASSES = {
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
};

const SummaryCard = ({ icon: Icon, label, value, tone }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${TONE_CLASSES[tone]}`}>
            <Icon size={18} />
        </div>
        <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
            <p className="text-xl font-black text-slate-800 font-mono truncate">{value}</p>
        </div>
    </div>
);

export default HistoryPage;
