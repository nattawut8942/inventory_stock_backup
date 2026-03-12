import React, { useState, useMemo } from 'react';
import { Search, Calendar } from 'lucide-react';
import { useData } from '../context/DataContext';
import { formatThaiDate } from '../utils/formatDate';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import Pagination from '../components/Pagination';

const HistoryPage = () => {
    const { transactions, loading } = useData();
    const [filter, setFilter] = useState('ALL'); // ALL, IN, OUT
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20);

    // Default to 3 months date range for UX
    const getDefaultDateRange = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();

        // ย้อนหลัง 3 เดือน
        const start = new Date(y, m - 2, 1);
        const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;

        const lastDay = new Date(y, m + 1, 0).getDate();
        const endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        return { startDate, endDate };
    };
    const defaultRange = getDefaultDateRange();
    const [dateFrom, setDateFrom] = useState(defaultRange.startDate);
    const [dateTo, setDateTo] = useState(defaultRange.endDate);

    const filteredTransactions = useMemo(() => {
        let result = transactions || [];

        // Filter by type
        if (filter !== 'ALL') {
            result = result.filter(t => t.TransType === filter);
        }

        // Filter by search term (UserID, ProductName, or RefInfo)
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter(t =>
                (t.UserID || '').toLowerCase().includes(term) ||
                (t.ProductName || '').toLowerCase().includes(term) ||
                (t.RefInfo || '').toLowerCase().includes(term)
            );
        }

        // Date range filter
        result = result.filter(t => {
            if (!t.TransDate) return true;
            const d = t.TransDate.slice(0, 10);
            if (dateFrom && d < dateFrom) return false;
            if (dateTo && d > dateTo) return false;
            return true;
        });

        return result;
        return result;
    }, [transactions, filter, searchTerm, dateFrom, dateTo]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
    const currentTransactions = filteredTransactions.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset page when filters change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [filter, searchTerm, dateFrom, dateTo]);

    if (loading && transactions.length === 0) {
        return <LoadingState message="กำลังโหลดประวัติการใช้งาน..." />;
    }

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-5">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black mb-2 text-slate-800">TRANSACTION HISTORY</h2>
                    <p className="text-slate-500 font-medium">ประวัติการทำรายการย้อนหลัง</p>
                </div>
                <div className="flex items-center gap-4">
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm text-slate-600 outline-none focus:border-indigo-500 font-bold"
                    >
                        <option value="ALL">ทุกประเภท (All)</option>
                        <option value="IN">รับเข้า (INBOUND)</option>
                        <option value="OUT">เบิกออก (OUTBOUND)</option>
                    </select>
                    <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                        <Search size={18} className="text-slate-400" />
                        <input
                            type="text"
                            placeholder="ค้นหาชื่ออุปกรณ์ / User..."
                            className="bg-transparent border-none outline-none text-sm w-32 lg:w-48 text-slate-700 placeholder-slate-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Date Range Filter */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                    <Calendar size={18} className="text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-400 shrink-0">เริ่มต้น</span>
                    <input
                        type="date"
                        className="bg-transparent border-none outline-none text-sm text-slate-700"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                    />
                </div>
                <span className="text-slate-400 font-bold">—</span>
                <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                    <Calendar size={18} className="text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-400 shrink-0">สิ้นสุด</span>
                    <input
                        type="date"
                        className="bg-transparent border-none outline-none text-sm text-slate-700"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                    />
                </div>
                {(dateFrom !== defaultRange.startDate || dateTo !== defaultRange.endDate || searchTerm !== '' || filter !== 'ALL') && (
                    <button
                        onClick={() => { setSearchTerm(''); setDateFrom(defaultRange.startDate); setDateTo(defaultRange.endDate); setFilter('ALL'); }}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        CLEAR
                    </button>
                )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left text-lg min-w-max table-auto">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[12px] tracking-widest border-b border-slate-200">
                        <tr>
                            <th className="p-4 pl-6 whitespace-nowrap">วันที่บันทึก</th>
                            <th className="p-4 whitespace-nowrap">หมวดหมู่</th>
                            <th className="p-4 whitespace-nowrap">รายการ</th>
                            <th className="p-4 text-center whitespace-nowrap">จำนวน</th>
                            <th className="p-4 whitespace-nowrap">หมายเหตุ</th>
                            <th className="p-4 whitespace-nowrap">ผู้ใช้</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {currentTransactions.map((t) => {
                            const isIn =
                                (t.TransType || "").toUpperCase().trim() === "IN" ||
                                (t.RefInfo || "").toLowerCase().includes("invoice");
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
                                    <td className="p-4 font-bold text-slate-700 whitespace-nowrap">
                                        {t.ProductName}
                                    </td>
                                    <td
                                        className={`p-4 text-center font-bold font-mono text-sm whitespace-nowrap ${isIn ? "text-emerald-600" : "text-red-500"
                                            }`}
                                    >
                                        {isIn ? "+" : "-"}
                                        {Math.abs(t.Qty)}
                                    </td>
                                    <td className="p-4 text-slate-500 text-xs whitespace-nowrap">
                                        {t.RefInfo}
                                    </td>
                                    <td className="p-4 whitespace-nowrap">
                                        <span className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                                            <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                                {t.UserID?.[0]}
                                            </div>
                                            {t.UserID}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* แสดงหน้าว่างเมื่อไม่พบข้อมูล (Empty State) */}
                {filteredTransactions.length === 0 && (
                    <div className="p-12">
                        <EmptyState
                            message="ไม่พบรายการประวัติที่ตรงกับเงื่อนไข"
                            actionLabel={
                                searchTerm ||
                                    filter !== "ALL" ||
                                    dateFrom !== defaultRange.startDate
                                    ? "ล้างตัวกรอง"
                                    : null
                            }
                            onAction={() => {
                                setSearchTerm("");
                                setFilter("ALL");
                                setDateFrom(defaultRange.startDate);
                                setDateTo(defaultRange.endDate);
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-4">
                {currentTransactions.map((t) => {
                    const isIn = (t.TransType || '').toUpperCase().trim() === 'IN' || (t.RefInfo || '').toLowerCase().includes('invoice');
                    return (
                        <div key={t.TransID} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isIn ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                        {isIn ? '+' : '-'}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-sm line-clamp-1">{t.ProductName}</h4>
                                        <p className="text-xs text-slate-500">{formatThaiDate(t.TransDate)}</p>
                                    </div>
                                </div>
                                <span className={`font-bold px-2 py-0.5 rounded-lg text-[10px] border ${isIn ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
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

                            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                <span className="text-xs font-bold text-slate-400">QUANTITY</span>
                                <span className={`text-lg font-black font-mono ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {isIn ? '+' : '-'}{Math.abs(t.Qty)}
                                </span>
                            </div>
                        </div>
                    );
                })}
                {filteredTransactions.length === 0 && (
                    <EmptyState message="ไม่พบข้อมูล" />
                )}

            </div>

            {/* Pagination */}
            {filteredTransactions.length > 0 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={filteredTransactions.length}
                />
            )}
        </div>
    );

};

export default HistoryPage;
