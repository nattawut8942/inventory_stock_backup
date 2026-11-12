// src/components/it-request/ProblemReportTab.jsx
import React, { useState, useMemo, useEffect } from 'react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
    Calendar, TrendingUp, TrendingDown, AlertTriangle,
    CheckCircle2, Laptop, Cpu, Wifi, UserCheck, FileText,
    Award, Filter, ChevronRight, Layers
} from 'lucide-react';
import {
    CATEGORY_DEFINITIONS,
    extractRowProblems,
    getMonthKey,
    formatMonthLabel,
    formatMonthLong,
    getAvailableMonths,
    getLast6MonthKeys,
    getDisplayStatus
} from './itRequestHelpers';
import IncompleteCasesTracker from './IncompleteCasesTracker';
import Portal from '../Portal';

export default function ProblemReportTab({ data, loading, onSelectRow }) {
    // 1. Available months
    const availableMonths = useMemo(() => getAvailableMonths(data), [data]);

    // 2. Month filter state: 'all' | '6m' | 'YYYY-MM'
    const [selectedMonth, setSelectedMonth] = useState('6m');
    const [activeCategoryFilter, setActiveCategoryFilter] = useState('');
    const [selectedIssueModal, setSelectedIssueModal] = useState(null); // { label, category, items: [rows] }

    useEffect(() => {
        if (!selectedIssueModal) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setSelectedIssueModal(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIssueModal]);

    // 3. Filtered data according to selectedMonth
    const filteredPeriodData = useMemo(() => {
        if (!data || data.length === 0) return [];

        if (selectedMonth === 'all') {
            return data;
        }

        if (selectedMonth === '6m') {
            const last6 = getLast6MonthKeys();
            return data.filter((r) => {
                const k = getMonthKey(r.Request_date);
                return k && last6.includes(k);
            });
        }

        // Specific month
        return data.filter((r) => getMonthKey(r.Request_date) === selectedMonth);
    }, [data, selectedMonth]);

    // 4. Data enriched with problem definitions
    const enrichedData = useMemo(() => {
        return filteredPeriodData.map((row) => ({
            ...row,
            _problems: extractRowProblems(row),
            _status: getDisplayStatus(row),
        }));
    }, [filteredPeriodData]);

    // 5. 6-Month Comparison Data (Always calculated for the last 6 months or 6 months ending in selected month)
    const comparison6Months = useMemo(() => {
        const refMonth = selectedMonth !== 'all' && selectedMonth !== '6m' ? selectedMonth : null;
        const monthKeys = getLast6MonthKeys(refMonth);

        // Group data by month key
        const monthMap = {};
        monthKeys.forEach((k) => {
            monthMap[k] = {
                monthKey: k,
                label: formatMonthLabel(k),
                HARDWARE: 0,
                SOFTWARE: 0,
                NETWORK: 0,
                UCM: 0,
                GENERAL: 0,
                total: 0,
            };
        });

        data.forEach((row) => {
            const k = getMonthKey(row.Request_date);
            if (monthMap[k]) {
                const p = extractRowProblems(row);
                monthMap[k][p.primaryCategory] = (monthMap[k][p.primaryCategory] || 0) + 1;
                monthMap[k].total += 1;
            }
        });

        return monthKeys.map((k) => monthMap[k]);
    }, [data, selectedMonth]);

    // 6. Category breakdown for the active period
    const categoryBreakdown = useMemo(() => {
        const counts = {
            HARDWARE: { ...CATEGORY_DEFINITIONS.HARDWARE, count: 0, completed: 0, pending: 0 },
            SOFTWARE: { ...CATEGORY_DEFINITIONS.SOFTWARE, count: 0, completed: 0, pending: 0 },
            NETWORK: { ...CATEGORY_DEFINITIONS.NETWORK, count: 0, completed: 0, pending: 0 },
            UCM: { ...CATEGORY_DEFINITIONS.UCM, count: 0, completed: 0, pending: 0 },
            GENERAL: { ...CATEGORY_DEFINITIONS.GENERAL, count: 0, completed: 0, pending: 0 },
        };

        let total = 0;
        enrichedData.forEach((row) => {
            const cat = row._problems.primaryCategory;
            if (counts[cat]) {
                counts[cat].count += 1;
                total += 1;
                if (row._status === 'Completed') {
                    counts[cat].completed += 1;
                } else if (row._status !== 'Cancel' && row._status !== 'Rejected') {
                    counts[cat].pending += 1;
                }
            }
        });

        return Object.values(counts).map((c) => ({
            ...c,
            percent: total > 0 ? ((c.count / total) * 100).toFixed(1) : '0.0',
        }));
    }, [enrichedData]);

    // 7. Top Frequent Issues (ปัญหาที่พบบ่อย)
    const topFrequentIssues = useMemo(() => {
        const itemMap = {}; // label -> { label, category, count, departments: {}, rows: [] }

        enrichedData.forEach((row) => {
            row._problems.tickedItems.forEach((item) => {
                const key = item.label;
                if (!itemMap[key]) {
                    itemMap[key] = {
                        label: item.label,
                        category: item.category,
                        categoryLabel: item.categoryLabel,
                        count: 0,
                        departments: {},
                        rows: [],
                    };
                }
                itemMap[key].count += 1;
                itemMap[key].rows.push(row);
                const dept = row.Section_code || 'ทั่วไป';
                itemMap[key].departments[dept] = (itemMap[key].departments[dept] || 0) + 1;
            });
        });

        const list = Object.values(itemMap);
        list.sort((a, b) => b.count - a.count);

        const totalIssueTags = list.reduce((acc, curr) => acc + curr.count, 0);

        return list.slice(0, 10).map((item, idx) => {
            // Find top department
            let topDept = '—';
            let topDeptCount = 0;
            Object.entries(item.departments).forEach(([dept, cnt]) => {
                if (cnt > topDeptCount) {
                    topDept = dept;
                    topDeptCount = cnt;
                }
            });

            return {
                ...item,
                rank: idx + 1,
                percent: totalIssueTags > 0 ? ((item.count / totalIssueTags) * 100).toFixed(1) : '0',
                topDept: `${topDept} (${topDeptCount})`,
            };
        });
    }, [enrichedData]);

    // 8. 6-Month Comparison Matrix Table (Rows = Categories, Columns = 6 Months)
    const comparisonTableData = useMemo(() => {
        const cats = [
            { key: 'HARDWARE', label: '💻 คอมพิวเตอร์ / ฮาร์ดแวร์', def: CATEGORY_DEFINITIONS.HARDWARE },
            { key: 'SOFTWARE', label: '📦 ซอฟต์แวร์ / ระบบงาน', def: CATEGORY_DEFINITIONS.SOFTWARE },
            { key: 'NETWORK',  label: '🌐 เน็ตเวิร์ก / การเชื่อมต่อ', def: CATEGORY_DEFINITIONS.NETWORK },
            { key: 'UCM',      label: '👤 สิทธิ์ผู้ใช้งาน (UCM)', def: CATEGORY_DEFINITIONS.UCM },
            { key: 'GENERAL',  label: '⚙️ อื่นๆ / ทั่วไป', def: CATEGORY_DEFINITIONS.GENERAL },
        ];

        const grandTotal6Months = comparison6Months.reduce((sum, m) => sum + m.total, 0);

        return cats.map((cat) => {
            const counts = comparison6Months.map((m) => m[cat.key] || 0);
            const total = counts.reduce((sum, n) => sum + n, 0);
            const firstMonth = counts[0] || 0;
            const lastMonth = counts[counts.length - 1] || 0;
            const trendDiff = lastMonth - firstMonth;

            return {
                key: cat.key,
                label: cat.label,
                def: cat.def,
                counts,
                total,
                percent: grandTotal6Months > 0 ? ((total / grandTotal6Months) * 100).toFixed(1) : '0.0',
                trendDiff,
            };
        });
    }, [comparison6Months]);

    const getPeriodDescription = () => {
        if (selectedMonth === 'all') return 'ข้อมูลทั้งหมดตั้งแต่เริ่มระบบ';
        if (selectedMonth === '6m') return 'ย้อนหลัง 6 เดือนล่าสุด';
        return `ประจำเดือน ${formatMonthLong(selectedMonth)}`;
    };

    if (loading) {
        return <div className="py-20 text-center text-sm text-slate-400">กำลังโหลดรายงานการแจ้งปัญหา...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header & Month Filter Controls */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                            <Layers className="w-5 h-5" />
                        </span>
                        <h2 className="text-lg font-bold text-slate-800">
                            รายงานสถิติประเภทปัญหาคำร้อง IT (IT Issue & Problem Report)
                        </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        ช่วงเวลาแสดงผล: <span className="font-semibold text-slate-700">{getPeriodDescription()}</span> · คำร้องทั้งหมด {filteredPeriodData.length} รายการ
                    </p>
                </div>

                {/* Filter Selector */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-medium">
                        <button
                            onClick={() => setSelectedMonth('6m')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                selectedMonth === '6m' ? 'bg-white text-indigo-600 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            6 เดือนล่าสุด
                        </button>
                        <button
                            onClick={() => setSelectedMonth('all')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                selectedMonth === 'all' ? 'bg-white text-indigo-600 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            ทั้งหมด
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <select
                            value={selectedMonth.includes('-') ? selectedMonth : ''}
                            onChange={(e) => {
                                if (e.target.value) setSelectedMonth(e.target.value);
                            }}
                            className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                        >
                            <option value="" disabled>เลือกเจาะจงเดือน...</option>
                            {availableMonths.map((m) => (
                                <option key={m} value={m}>
                                    {formatMonthLong(m)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Section 1: Monthly Category Breakdown Cards ──────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {categoryBreakdown.map((cat) => {
                    const isSelected = activeCategoryFilter === cat.id;
                    return (
                        <div
                            key={cat.id}
                            onClick={() => setActiveCategoryFilter((prev) => (prev === cat.id ? '' : cat.id))}
                            className={`rounded-2xl p-4 border transition-all cursor-pointer relative overflow-hidden ${
                                isSelected
                                    ? 'ring-2 ring-indigo-500 shadow-md bg-white border-indigo-400'
                                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.badge}`}>
                                    {cat.shortLabel}
                                </span>
                                <span className="text-xs font-semibold text-slate-400">
                                    {cat.percent}%
                                </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-600 truncate mb-1">
                                {cat.label}
                            </p>
                            <p className="text-2xl font-black text-slate-800">
                                {cat.count} <span className="text-xs font-normal text-slate-400">เคส</span>
                            </p>
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                                <span className="text-emerald-600 font-medium">✓ เสร็จ {cat.completed}</span>
                                <span className="text-amber-600 font-medium">⏳ ค้าง {cat.pending}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Section 2: 6-Month Comparison (แยกปัญหารายเดือน ย้อนหลัง 6 เดือน เปรียบเทียบ) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* 6-Month Comparison Chart */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-slate-800">
                                แนวโน้มปัญหารายเดือน ย้อนหลัง 6 เดือน (6-Month Problem Trend)
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                เปรียบเทียบจำนวนการแจ้งปัญหาแต่ละหมวดหมู่ในรอบ 6 เดือนล่าสุด
                            </p>
                        </div>
                    </div>

                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={comparison6Months} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                            <Bar dataKey="HARDWARE" name="Hardware" fill={CATEGORY_DEFINITIONS.HARDWARE.color} stackId="a" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="SOFTWARE" name="Software" fill={CATEGORY_DEFINITIONS.SOFTWARE.color} stackId="a" />
                            <Bar dataKey="NETWORK" name="Network" fill={CATEGORY_DEFINITIONS.NETWORK.color} stackId="a" />
                            <Bar dataKey="UCM" name="User (UCM)" fill={CATEGORY_DEFINITIONS.UCM.color} stackId="a" />
                            <Bar dataKey="GENERAL" name="Other" fill={CATEGORY_DEFINITIONS.GENERAL.color} stackId="a" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Category Share Donut */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">
                            สัดส่วนประเภทปัญหา (Category Share)
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            สัดส่วนแยกตามหมวดหมู่ในช่วงเวลาที่เลือก
                        </p>
                    </div>

                    <div className="h-[210px] my-auto">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryBreakdown}
                                    dataKey="count"
                                    nameKey="shortLabel"
                                    cx="50%" cy="50%"
                                    innerRadius={55}
                                    outerRadius={80}
                                    paddingAngle={3}
                                >
                                    {categoryBreakdown.map((entry) => (
                                        <Cell key={entry.id} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        {categoryBreakdown.map((cat) => (
                            <div key={cat.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                                    <span className="text-slate-600">{cat.label}</span>
                                </div>
                                <span className="font-semibold text-slate-800">{cat.count} เคส ({cat.percent}%)</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── 6-Month Comparison Matrix Table ────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">
                            ตารางเปรียบเทียบประเภทปัญหารายเดือน ย้อนหลัง 6 เดือน (Monthly Comparison Table)
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            แสดงสถิติเชิงปริมาณของแต่ละหมวดหมู่เทียบกันเดือนต่อเดือน
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold">
                                <th className="px-4 py-3 rounded-l-xl">หมวดหมู่ปัญหา</th>
                                {comparison6Months.map((m) => (
                                    <th key={m.monthKey} className="px-3 py-3 text-center">{m.label}</th>
                                ))}
                                <th className="px-3 py-3 text-center font-bold text-slate-700">รวม 6 เดือน</th>
                                <th className="px-3 py-3 text-center">สัดส่วน</th>
                                <th className="px-4 py-3 text-center rounded-r-xl">แนวโน้ม</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {comparisonTableData.map((row) => (
                                <tr key={row.key} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.def.color }} />
                                        {row.label}
                                    </td>
                                    {row.counts.map((cnt, i) => (
                                        <td key={i} className="px-3 py-3 text-center text-slate-700 font-mono">
                                            {cnt > 0 ? cnt : <span className="text-slate-300">0</span>}
                                        </td>
                                    ))}
                                    <td className="px-3 py-3 text-center font-bold text-indigo-700 font-mono">
                                        {row.total}
                                    </td>
                                    <td className="px-3 py-3 text-center text-slate-500 font-mono">
                                        {row.percent}%
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {row.trendDiff > 0 ? (
                                            <span className="inline-flex items-center gap-0.5 text-red-600 font-semibold text-[11px]">
                                                <TrendingUp className="w-3.5 h-3.5" /> +{row.trendDiff}
                                            </span>
                                        ) : row.trendDiff < 0 ? (
                                            <span className="inline-flex items-center gap-0.5 text-emerald-600 font-semibold text-[11px]">
                                                <TrendingDown className="w-3.5 h-3.5" /> {row.trendDiff}
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 text-[11px]">คงที่ (0)</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {/* Summary Total Row */}
                            <tr className="bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-200">
                                <td className="px-4 py-3">รวมทุกหมวดหมู่</td>
                                {comparison6Months.map((m) => (
                                    <td key={m.monthKey} className="px-3 py-3 text-center font-mono">
                                        {m.total}
                                    </td>
                                ))}
                                <td className="px-3 py-3 text-center text-indigo-700 font-mono">
                                    {comparison6Months.reduce((sum, m) => sum + m.total, 0)}
                                </td>
                                <td className="px-3 py-3 text-center">100%</td>
                                <td className="px-4 py-3 text-center text-slate-400">—</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Section 3: ปัญหาที่พบบ่อย (Top Frequent Issues / Top 10) ──── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                                <Award className="w-5 h-5" />
                            </span>
                            <h3 className="text-sm font-bold text-slate-800">
                                ปัญหาที่พบบ่อย 10 อันดับแรก (Top 10 Most Frequent Issues)
                            </h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                            จัดอันดับรายการปัญหาหรืออุปกรณ์ที่ผู้ใช้งานแจ้งคำร้องเข้ามาบ่อยที่สุดในระบบ
                        </p>
                    </div>
                </div>

                {topFrequentIssues.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">ไม่มีข้อมูลปัญหาในช่วงเวลานี้</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {topFrequentIssues.map((issue) => {
                            const catDef = CATEGORY_DEFINITIONS[issue.category] || CATEGORY_DEFINITIONS.GENERAL;
                            return (
                                <div
                                    key={issue.label}
                                    onClick={() => setSelectedIssueModal(issue)}
                                    className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer bg-slate-50/50 hover:bg-white"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                                issue.rank === 1 ? 'bg-amber-400 text-white shadow-xs' :
                                                issue.rank === 2 ? 'bg-slate-300 text-slate-800' :
                                                issue.rank === 3 ? 'bg-amber-700 text-white' :
                                                'bg-slate-100 text-slate-600'
                                            }`}>
                                                {issue.rank}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-800 truncate">
                                                    {issue.label}
                                                </p>
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${catDef.badge}`}>
                                                    {issue.categoryLabel}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-base font-black text-indigo-700">
                                                {issue.count} <span className="text-xs font-normal text-slate-400">ครั้ง</span>
                                            </p>
                                            <p className="text-[10px] text-slate-400">
                                                {issue.percent}% ของทั้งหมด
                                            </p>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="w-full bg-slate-200/80 rounded-full h-1.5 mb-2 overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${Math.min(100, Math.max(5, (issue.count / (topFrequentIssues[0]?.count || 1)) * 100))}%`,
                                                backgroundColor: catDef.color,
                                            }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                                        <span>แผนกที่พบบ่อยสุด: <span className="font-semibold text-slate-700">{issue.topDept}</span></span>
                                        <span className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5">
                                            ดู {issue.count} เคส <ChevronRight className="w-3 h-3" />
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Section 4: Incomplete Cases Tracker (เคสที่ยังไม่ได้ Completed) ── */}
            <IncompleteCasesTracker
                data={filteredPeriodData}
                onSelectRow={onSelectRow}
            />

            {/* ── Modal for Top Issue Drilldown ────────────────────────────── */}
            {selectedIssueModal && (
                <Portal>
                    <div
                        onClick={() => setSelectedIssueModal(null)}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all"
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
                        >
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800">
                                        รายการคำร้องปัญหา: {selectedIssueModal.label}
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        หมวดหมู่ {selectedIssueModal.categoryLabel} · ทั้งหมด {selectedIssueModal.rows.length} รายการ
                                    </p>
                                </div>
                                <button
                                    onClick={() => setSelectedIssueModal(null)}
                                    className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center font-bold"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100">
                                {selectedIssueModal.rows.map((r) => (
                                    <div
                                        key={r.Request_id}
                                        onClick={() => {
                                            setSelectedIssueModal(null);
                                            if (onSelectRow) onSelectRow(r);
                                        }}
                                        className="pt-2 pb-2 first:pt-0 cursor-pointer hover:bg-slate-50 rounded-lg p-2 transition-colors"
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-mono font-bold text-slate-800">{r.Request_id}</span>
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                                {getDisplayStatus(r)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-700 line-clamp-1">{r.Detail_Info || '(ไม่มีรายละเอียด)'}</p>
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            ผู้ขอ: {r.Request_by} · แผนก: {r.Section_code} · ผู้รับผิดชอบ: {r.InCharge || 'ยังไม่กำหนด'}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
                                <button
                                    onClick={() => setSelectedIssueModal(null)}
                                    className="px-4 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                                >
                                    ปิด
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
    );
}
