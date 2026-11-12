// src/components/it-request/TeamWorkloadTab.jsx
import React, { useState, useMemo, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
    Users, UserCheck, Calendar, Filter, CheckCircle2, Clock,
    ChevronRight, ExternalLink, Award, Laptop, AlertTriangle
} from 'lucide-react';
import {
    CATEGORY_DEFINITIONS,
    extractRowProblems,
    getMonthKey,
    formatMonthLabel,
    formatMonthLong,
    getAvailableMonths,
    getLast6MonthKeys,
    getDisplayStatus,
    getWaitingSide
} from './itRequestHelpers';
import IncompleteCasesTracker from './IncompleteCasesTracker';
import Portal from '../Portal';

const EMP_PIC = (empCode) => `http://dcidmc.dci.daikin.co.jp/PICTURE/${empCode}.jpg`;

function Avatar({ empCode, name, size = 38 }) {
    const [err, setErr] = useState(false);
    const initials = (name || empCode || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    if (!empCode || err) {
        return (
            <div
                style={{ width: size, height: size }}
                className="rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0 border border-indigo-200"
            >
                {initials}
            </div>
        );
    }
    return (
        <img
            src={EMP_PIC(empCode)}
            alt={name}
            style={{ width: size, height: size }}
            className="rounded-full object-cover flex-shrink-0 border border-slate-200"
            onError={() => setErr(true)}
        />
    );
}

export default function TeamWorkloadTab({ data, loading, onSelectRow }) {
    // 1. Available months
    const availableMonths = useMemo(() => getAvailableMonths(data), [data]);

    // 2. Month filter state: 'all' | '6m' | 'YYYY-MM'
    const [selectedMonth, setSelectedMonth] = useState('6m');
    const [selectedMemberModal, setSelectedMemberModal] = useState(null); // { name, empCode, items: [rows] }
    const [searchName, setSearchName] = useState('');

    useEffect(() => {
        if (!selectedMemberModal) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setSelectedMemberModal(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedMemberModal]);

    // 3. Filter data by month
    const filteredPeriodData = useMemo(() => {
        if (!data || data.length === 0) return [];
        if (selectedMonth === 'all') return data;
        if (selectedMonth === '6m') {
            const last6 = getLast6MonthKeys();
            return data.filter((r) => {
                const k = getMonthKey(r.Request_date);
                return k && last6.includes(k);
            });
        }
        return data.filter((r) => getMonthKey(r.Request_date) === selectedMonth);
    }, [data, selectedMonth]);

    // 4. Enrich data with problems and statuses
    const enrichedData = useMemo(() => {
        return filteredPeriodData.map((row) => ({
            ...row,
            _problems: extractRowProblems(row),
            _status: getDisplayStatus(row),
        }));
    }, [filteredPeriodData]);

    // 5. Workload by InCharge × Problem Category
    const teamWorkload = useMemo(() => {
        const memberMap = {}; // name -> { name, empCode, HARDWARE: 0, SOFTWARE: 0, NETWORK: 0, UCM: 0, GENERAL: 0, total: 0, completed: 0, inprogress: 0, otherStatus: 0, specificIssues: {}, rows: [] }

        enrichedData.forEach((row) => {
            const inChargeName = row.InCharge || 'ยังไม่กำหนด (Unassigned)';
            if (!memberMap[inChargeName]) {
                memberMap[inChargeName] = {
                    name: inChargeName,
                    empCode: row.CodeInCharge || '',
                    HARDWARE: 0,
                    SOFTWARE: 0,
                    NETWORK: 0,
                    UCM: 0,
                    GENERAL: 0,
                    total: 0,
                    completed: 0,
                    inprogress: 0,
                    otherStatus: 0,
                    specificIssues: {},
                    rows: [],
                };
            }

            const p = row._problems;
            memberMap[inChargeName][p.primaryCategory] += 1;
            memberMap[inChargeName].total += 1;
            memberMap[inChargeName].rows.push(row);

            // Tally status
            if (row._status === 'Completed') {
                memberMap[inChargeName].completed += 1;
            } else if (row._status === 'Inprogress' || row._status === 'Approved') {
                memberMap[inChargeName].inprogress += 1;
            } else {
                memberMap[inChargeName].otherStatus += 1;
            }

            // Tally specific issues
            p.tickedItems.forEach((t) => {
                memberMap[inChargeName].specificIssues[t.label] = (memberMap[inChargeName].specificIssues[t.label] || 0) + 1;
            });
        });

        let list = Object.values(memberMap);

        // Filter by name search
        if (searchName.trim()) {
            const q = searchName.toLowerCase();
            list = list.filter((m) => m.name.toLowerCase().includes(q) || m.empCode?.toLowerCase().includes(q));
        }

        // Sort by total jobs descending (Unassigned at the end if exists)
        list.sort((a, b) => {
            if (a.name.startsWith('ยังไม่กำหนด')) return 1;
            if (b.name.startsWith('ยังไม่กำหนด')) return -1;
            return b.total - a.total;
        });

        return list;
    }, [enrichedData, searchName]);

    // 6. Summary metrics
    const teamMetrics = useMemo(() => {
        const assignedMembers = teamWorkload.filter((m) => !m.name.startsWith('ยังไม่กำหนด'));
        const totalAssignedJobs = assignedMembers.reduce((sum, m) => sum + m.total, 0);
        const totalCompleted = assignedMembers.reduce((sum, m) => sum + m.completed, 0);
        const totalActive = assignedMembers.reduce((sum, m) => sum + m.inprogress, 0);
        const completionRate = totalAssignedJobs > 0 ? ((totalCompleted / totalAssignedJobs) * 100).toFixed(1) : '0';
        const topHandler = assignedMembers[0] || null;

        return {
            memberCount: assignedMembers.length,
            totalAssignedJobs,
            totalCompleted,
            totalActive,
            completionRate,
            topHandler,
        };
    }, [teamWorkload]);

    const getPeriodDescription = () => {
        if (selectedMonth === 'all') return 'ข้อมูลทั้งหมด';
        if (selectedMonth === '6m') return 'ย้อนหลัง 6 เดือนล่าสุด';
        return `ประจำเดือน ${formatMonthLong(selectedMonth)}`;
    };

    if (loading) {
        return <div className="py-20 text-center text-sm text-slate-400">กำลังโหลดข้อมูลภาระงานทีม IT...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header & Filter Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                            <Users className="w-5 h-5" />
                        </span>
                        <h2 className="text-lg font-bold text-slate-800">
                            ภาระงานและการรับงานของทีมงาน IT (IT Team Workload & Issue Allocation)
                        </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        สรุปการรับงานของทีมงาน IT แต่ละคน แยกตามประเภทปัญหา จำนวนงานที่รับผิดชอบ และอัตราปิดงานสำเร็จ · {getPeriodDescription()}
                    </p>
                </div>

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

            {/* Team Summary KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <p className="text-xs font-semibold text-slate-400">จนท. IT ที่รับงาน</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">
                        {teamMetrics.memberCount} <span className="text-xs font-normal text-slate-400">ท่าน</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                        งานเฉลี่ย ~{(teamMetrics.totalAssignedJobs / (teamMetrics.memberCount || 1)).toFixed(1)} เคส/คน
                    </p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <p className="text-xs font-semibold text-slate-400">งานที่มอบหมายทั้งหมด</p>
                    <p className="text-2xl font-black text-indigo-700 mt-1">
                        {teamMetrics.totalAssignedJobs} <span className="text-xs font-normal text-slate-400">เคส</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                        ช่วงเวลา: {getPeriodDescription()}
                    </p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-400">ปิดงานสำเร็จ</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {teamMetrics.completionRate}%
                        </span>
                    </div>
                    <p className="text-2xl font-black text-emerald-600 mt-1">
                        {teamMetrics.totalCompleted} <span className="text-xs font-normal text-slate-400">เคส</span>
                    </p>
                    <p className="text-[11px] text-amber-600 font-medium mt-1">
                        ⏳ กำลังทำอยู่ {teamMetrics.totalActive} เคส
                    </p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <p className="text-xs font-semibold text-slate-400">ผู้รับงานสูงสุด</p>
                    <p className="text-base font-bold text-slate-800 mt-1 truncate">
                        {teamMetrics.topHandler ? teamMetrics.topHandler.name : '—'}
                    </p>
                    <p className="text-[11px] text-indigo-600 font-semibold mt-1">
                        {teamMetrics.topHandler ? `${teamMetrics.topHandler.total} เคส (เสร็จ ${teamMetrics.topHandler.completed})` : '—'}
                    </p>
                </div>
            </div>

            {/* Stacked Bar Chart: Workload by Category per IT Member */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">
                            การกระจายประเภทปัญหาของแต่ละคน (Issue Categories by InCharge)
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            แสดงสัดส่วนประเภทปัญหา (Hardware, Software, Network, UCM, อื่นๆ) ที่ทีมงานแต่ละคนรับผิดชอบ
                        </p>
                    </div>
                </div>

                {teamWorkload.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">ไม่มีข้อมูลการรับงานในช่วงเวลานี้</p>
                ) : (
                    <ResponsiveContainer width="100%" height={Math.max(260, teamWorkload.length * 42)}>
                        <BarChart data={teamWorkload} layout="vertical" margin={{ left: 30, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                            <Bar dataKey="HARDWARE" name="Hardware" stackId="a" fill={CATEGORY_DEFINITIONS.HARDWARE.color} />
                            <Bar dataKey="SOFTWARE" name="Software" stackId="a" fill={CATEGORY_DEFINITIONS.SOFTWARE.color} />
                            <Bar dataKey="NETWORK" name="Network" stackId="a" fill={CATEGORY_DEFINITIONS.NETWORK.color} />
                            <Bar dataKey="UCM" name="User (UCM)" stackId="a" fill={CATEGORY_DEFINITIONS.UCM.color} />
                            <Bar dataKey="GENERAL" name="Other" stackId="a" fill={CATEGORY_DEFINITIONS.GENERAL.color} radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* ── Team Workload Matrix Table ────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">
                            ตารางแจกแจงงานตามประเภทปัญหาของทีมงาน IT (Workload Matrix Table)
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            แสดงรายละเอียดว่าแต่ละคนรับปัญหาประเภทไหนไปกี่งาน และผลการดำเนินงาน
                        </p>
                    </div>
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อเจ้าหน้าที่ IT..."
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                        className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full sm:w-56"
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold">
                                <th className="px-4 py-3 rounded-l-xl">เจ้าหน้าที่ IT</th>
                                <th className="px-3 py-3 text-center" style={{ color: CATEGORY_DEFINITIONS.HARDWARE.color }}>💻 Hardware</th>
                                <th className="px-3 py-3 text-center" style={{ color: CATEGORY_DEFINITIONS.SOFTWARE.color }}>📦 Software</th>
                                <th className="px-3 py-3 text-center" style={{ color: CATEGORY_DEFINITIONS.NETWORK.color }}>🌐 Network</th>
                                <th className="px-3 py-3 text-center" style={{ color: CATEGORY_DEFINITIONS.UCM.color }}>👤 UCM</th>
                                <th className="px-3 py-3 text-center text-slate-500">⚙️ Other</th>
                                <th className="px-3 py-3 text-center text-amber-700 font-bold">⏳ งานค้าง</th>
                                <th className="px-3 py-3 text-center text-emerald-700 font-bold">✅ เสร็จสิ้น</th>
                                <th className="px-3 py-3 text-center font-black text-slate-800">รวมทั้งหมด</th>
                                <th className="px-3 py-3 text-center">ความสำเร็จ</th>
                                <th className="px-4 py-3 text-center rounded-r-xl">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {teamWorkload.map((member) => {
                                const rate = member.total > 0 ? ((member.completed / member.total) * 100).toFixed(0) : '0';
                                return (
                                    <tr key={member.name} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <Avatar empCode={member.empCode} name={member.name} size={32} />
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-slate-800 truncate">{member.name}</p>
                                                    {member.empCode && (
                                                        <p className="text-[10px] text-slate-400 font-mono">รหัส: {member.empCode}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-center font-mono font-medium">
                                            {member.HARDWARE > 0 ? (
                                                <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 font-bold">{member.HARDWARE}</span>
                                            ) : <span className="text-slate-300">0</span>}
                                        </td>
                                        <td className="px-3 py-3 text-center font-mono font-medium">
                                            {member.SOFTWARE > 0 ? (
                                                <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold">{member.SOFTWARE}</span>
                                            ) : <span className="text-slate-300">0</span>}
                                        </td>
                                        <td className="px-3 py-3 text-center font-mono font-medium">
                                            {member.NETWORK > 0 ? (
                                                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold">{member.NETWORK}</span>
                                            ) : <span className="text-slate-300">0</span>}
                                        </td>
                                        <td className="px-3 py-3 text-center font-mono font-medium">
                                            {member.UCM > 0 ? (
                                                <span className="px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-700 font-bold">{member.UCM}</span>
                                            ) : <span className="text-slate-300">0</span>}
                                        </td>
                                        <td className="px-3 py-3 text-center font-mono font-medium">
                                            {member.GENERAL > 0 ? (
                                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{member.GENERAL}</span>
                                            ) : <span className="text-slate-300">0</span>}
                                        </td>
                                        <td className="px-3 py-3 text-center font-mono font-bold text-amber-600">
                                            {member.inprogress}
                                        </td>
                                        <td className="px-3 py-3 text-center font-mono font-bold text-emerald-600">
                                            {member.completed}
                                        </td>
                                        <td className="px-3 py-3 text-center font-mono font-black text-slate-800 text-sm">
                                            {member.total}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                                parseInt(rate, 10) >= 80 ? 'bg-emerald-100 text-emerald-800' :
                                                parseInt(rate, 10) >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-slate-100 text-slate-700'
                                            }`}>
                                                {rate}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => setSelectedMemberModal(member)}
                                                className="px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 rounded-lg transition-colors inline-flex items-center gap-1"
                                            >
                                                <span>ดูเคส</span>
                                                <ChevronRight className="w-3 h-3" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── IT Member Profile Cards ──────────────────────────────────── */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">
                        การ์ดสรุปปัญหาและงานที่รับผิดชอบของแต่ละท่าน (Member Responsibility Cards)
                    </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teamWorkload.map((member) => {
                        const topIssues = Object.entries(member.specificIssues)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5);

                        const rate = member.total > 0 ? ((member.completed / member.total) * 100).toFixed(0) : '0';

                        return (
                            <div
                                key={member.name}
                                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between"
                            >
                                <div>
                                    {/* Header */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <Avatar empCode={member.empCode} name={member.name} size={46} />
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-800 truncate">{member.name}</p>
                                            <p className="text-xs text-slate-400 font-mono">
                                                {member.empCode ? `Emp ID: ${member.empCode}` : '—'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Stats Badges */}
                                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center mb-3">
                                        <div>
                                            <p className="text-[10px] text-slate-400 font-medium">รวมทั้งหมด</p>
                                            <p className="text-sm font-black text-slate-800">{member.total}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-400 font-medium">เสร็จแล้ว</p>
                                            <p className="text-sm font-black text-emerald-600">{member.completed}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-400 font-medium">ค้างอยู่</p>
                                            <p className="text-sm font-black text-amber-600">{member.inprogress}</p>
                                        </div>
                                    </div>

                                    {/* Top Problem Types Handled */}
                                    <p className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                                        ปัญหาที่รับผิดชอบบ่อย:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 min-h-[48px]">
                                        {topIssues.length === 0 ? (
                                            <span className="text-xs text-slate-400 italic">ไม่มีข้อมูลปัญหาเฉพาะ</span>
                                        ) : (
                                            topIssues.map(([label, cnt]) => (
                                                <span
                                                    key={label}
                                                    className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                                                >
                                                    <span>{label}</span>
                                                    <span className="font-bold text-indigo-600">({cnt})</span>
                                                </span>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Footer Action */}
                                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                                    <span className="text-xs text-slate-500">
                                        อัตราสำเร็จ: <span className="font-bold text-slate-800">{rate}%</span>
                                    </span>
                                    <button
                                        onClick={() => setSelectedMemberModal(member)}
                                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                                    >
                                        ดู {member.total} เคส <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Incomplete Cases Tracker ─────────────────────────────────── */}
            <IncompleteCasesTracker
                data={filteredPeriodData}
                onSelectRow={onSelectRow}
            />

            {/* ── Modal for IT Member Ticket Drilldown ──────────────────────── */}
            {selectedMemberModal && (
                <Portal>
                    <div
                        onClick={() => setSelectedMemberModal(null)}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all"
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
                        >
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                                <div className="flex items-center gap-3">
                                    <Avatar empCode={selectedMemberModal.empCode} name={selectedMemberModal.name} size={40} />
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-800">
                                            เคสที่รับผิดชอบโดย: {selectedMemberModal.name}
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            ทั้งหมด {selectedMemberModal.rows.length} เคส · เสร็จ {selectedMemberModal.completed} · ค้าง {selectedMemberModal.inprogress}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedMemberModal(null)}
                                    className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center font-bold"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100">
                                {selectedMemberModal.rows.map((r) => {
                                    const side = getWaitingSide(r);
                                    return (
                                        <div
                                            key={r.Request_id}
                                            onClick={() => {
                                                setSelectedMemberModal(null);
                                                if (onSelectRow) onSelectRow(r);
                                            }}
                                            className="pt-2 pb-2 first:pt-0 cursor-pointer hover:bg-slate-50 rounded-lg p-2 transition-colors"
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono font-bold text-slate-800">{r.Request_id}</span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                                        {r.Form_id}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    {side && (
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                            side === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            รอ: {side === 'user' ? 'User' : 'IT'}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                                        {getDisplayStatus(r)}
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-700 line-clamp-1">{r.Detail_Info || '(ไม่มีรายละเอียด)'}</p>
                                            <p className="text-[11px] text-slate-400 mt-1">
                                                ผู้ขอ: {r.Request_by} · แผนก: {r.Section_code} · วันที่ยื่น: {r.Request_date ? new Date(r.Request_date).toLocaleDateString('th-TH') : '—'}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
                                <button
                                    onClick={() => setSelectedMemberModal(null)}
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
