// src/components/it-request/IncompleteCasesTracker.jsx
import React, { useState, useMemo } from 'react';
import { Clock, AlertTriangle, UserCheck, ShieldAlert, ChevronDown, ChevronRight, Search, ExternalLink } from 'lucide-react';
import { getIncompleteStepInfo } from './itRequestHelpers';

export default function IncompleteCasesTracker({ data, onSelectRow }) {
    const [sideFilter, setSideFilter] = useState('all'); // 'all' | 'it' | 'user'
    const [agingFilter, setAgingFilter] = useState(false); // toggle > 3 days
    const [search, setSearch] = useState('');
    const [expandedSteps, setExpandedSteps] = useState({});

    // 1. Gather all incomplete cases
    const incompleteCases = useMemo(() => {
        return data
            .map((r) => getIncompleteStepInfo(r))
            .filter(Boolean);
    }, [data]);

    // 2. Metrics summary
    const metrics = useMemo(() => {
        const total = incompleteCases.length;
        const itSide = incompleteCases.filter((c) => c.side === 'it').length;
        const userSide = incompleteCases.filter((c) => c.side === 'user').length;
        const agingOver3 = incompleteCases.filter((c) => c.daysOpen > 3).length;
        const agingOver7 = incompleteCases.filter((c) => c.daysOpen > 7).length;
        return { total, itSide, userSide, agingOver3, agingOver7 };
    }, [incompleteCases]);

    // 3. Filtered cases
    const filteredCases = useMemo(() => {
        let list = incompleteCases;
        if (sideFilter !== 'all') {
            list = list.filter((c) => c.side === sideFilter);
        }
        if (agingFilter) {
            list = list.filter((c) => c.daysOpen > 3);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(
                (c) =>
                    c.row.Request_id?.toLowerCase().includes(q) ||
                    c.row.Request_by?.toLowerCase().includes(q) ||
                    c.row.Section_code?.toLowerCase().includes(q) ||
                    c.stepLabel?.toLowerCase().includes(q) ||
                    c.waitingFor?.toLowerCase().includes(q) ||
                    c.row.Detail_Info?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [incompleteCases, sideFilter, agingFilter, search]);

    // 4. Group by step
    const groupedByStep = useMemo(() => {
        const groups = {};
        filteredCases.forEach((item) => {
            const key = item.stepLabel;
            if (!groups[key]) {
                groups[key] = {
                    stepLabel: item.stepLabel,
                    side: item.side,
                    stepIndex: item.stepIndex,
                    totalSteps: item.totalSteps,
                    items: [],
                };
            }
            groups[key].items.push(item);
        });

        // Sort groups by stepIndex
        return Object.values(groups).sort((a, b) => a.stepIndex - b.stepIndex);
    }, [filteredCases]);

    const toggleStep = (stepLabel) => {
        setExpandedSteps((prev) => ({
            ...prev,
            [stepLabel]: !prev[stepLabel],
        }));
    };

    const expandAll = () => {
        const all = {};
        groupedByStep.forEach((g) => { all[g.stepLabel] = true; });
        setExpandedSteps(all);
    };

    const collapseAll = () => {
        setExpandedSteps({});
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                            <Clock className="w-5 h-5" />
                        </span>
                        <h3 className="text-base font-bold text-slate-800">
                            ติดตามเคสที่ยังไม่เสร็จสิ้น (Incomplete Cases Pipeline)
                        </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        ตรวจสอบว่ามีกี่เคสที่ยังค้างอยู่ แต่ละเคสติดอยู่ที่ขั้นตอนใด และกำลังรอการดำเนินการจากฝั่งใด
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={expandAll}
                        className="text-xs px-2.5 py-1 text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors font-medium"
                    >
                        ขยายทั้งหมด
                    </button>
                    <button
                        onClick={collapseAll}
                        className="text-xs px-2.5 py-1 text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors font-medium"
                    >
                        ย่อทั้งหมด
                    </button>
                </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                    onClick={() => { setSideFilter('all'); setAgingFilter(false); }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        sideFilter === 'all' && !agingFilter
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                >
                    <p className="text-[11px] opacity-75 font-medium">เคสที่ยังไม่เสร็จทั้งหมด</p>
                    <p className="text-2xl font-black mt-0.5">{metrics.total} <span className="text-xs font-normal opacity-80">เคส</span></p>
                </div>

                <div
                    onClick={() => { setSideFilter('it'); setAgingFilter(false); }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        sideFilter === 'it' && !agingFilter
                            ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                            : 'bg-amber-50/70 text-amber-900 border-amber-200 hover:bg-amber-100/60'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold">รอการดำเนินการฝั่ง IT</p>
                        <UserCheck className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-2xl font-black mt-0.5">{metrics.itSide} <span className="text-xs font-normal opacity-80">เคส</span></p>
                </div>

                <div
                    onClick={() => { setSideFilter('user'); setAgingFilter(false); }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        sideFilter === 'user' && !agingFilter
                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                            : 'bg-blue-50/70 text-blue-900 border-blue-200 hover:bg-blue-100/60'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold">รอการดำเนินการฝั่ง User</p>
                        <Clock className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-2xl font-black mt-0.5">{metrics.userSide} <span className="text-xs font-normal opacity-80">เคส</span></p>
                </div>

                <div
                    onClick={() => setAgingFilter((prev) => !prev)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        agingFilter
                            ? 'bg-red-600 text-white border-red-700 shadow-sm'
                            : 'bg-red-50/70 text-red-900 border-red-200 hover:bg-red-100/60'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold">ค้างนานเกิน 3 วัน (Aging)</p>
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    </div>
                    <p className="text-2xl font-black mt-0.5">{metrics.agingOver3} <span className="text-xs font-normal opacity-80">เคส</span></p>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between">
                <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="ค้นหาตามเลขที่คำร้อง, ชื่อผู้ขอ, แผนก, ขั้นตอน..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                    />
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                    <span className="text-xs text-slate-400">
                        แสดง <span className="font-semibold text-slate-700">{filteredCases.length}</span> จาก {incompleteCases.length} เคสที่ยังไม่เสร็จ
                    </span>
                    {(sideFilter !== 'all' || agingFilter || search) && (
                        <button
                            onClick={() => { setSideFilter('all'); setAgingFilter(false); setSearch(''); }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline ml-2"
                        >
                            ล้างตัวกรอง
                        </button>
                    )}
                </div>
            </div>

            {/* Step-by-Step Pipeline Accordion */}
            {groupedByStep.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                    <p className="text-sm">🎉 ยอดเยี่ยม! ไม่พบเคสที่ค้างอยู่ในเงื่อนไขนี้</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {groupedByStep.map((group) => {
                        const isExpanded = expandedSteps[group.stepLabel] ?? true; // default expanded
                        const isUserSide = group.side === 'user';
                        const hasUrgentAging = group.items.some((i) => i.daysOpen > 3);

                        return (
                            <div
                                key={group.stepLabel}
                                className="border border-slate-200 rounded-xl overflow-hidden transition-all shadow-xs"
                            >
                                {/* Step Header */}
                                <div
                                    onClick={() => toggleStep(group.stepLabel)}
                                    className={`px-4 py-3 flex items-center justify-between cursor-pointer select-none transition-colors ${
                                        isExpanded ? 'bg-slate-50/80 border-b border-slate-200' : 'bg-white hover:bg-slate-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <button className="text-slate-400 hover:text-slate-600">
                                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        </button>
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                            isUserSide ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                                        }`}>
                                            รอ: {isUserSide ? 'User' : 'IT'}
                                        </span>
                                        <span className="text-xs font-semibold text-slate-800 truncate">
                                            {group.stepLabel}
                                        </span>
                                        {hasUrgentAging && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                                                <AlertTriangle className="w-3 h-3" /> ค้าง &gt; 3 วัน
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                                            {group.items.length} เคส
                                        </span>
                                    </div>
                                </div>

                                {/* Step Content (Tickets List) */}
                                {isExpanded && (
                                    <div className="divide-y divide-slate-100 bg-white">
                                        {group.items.map((item) => {
                                            const r = item.row;
                                            const isOverdue = item.daysOpen > 3;

                                            return (
                                                <div
                                                    key={r.Request_id}
                                                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                                                >
                                                    {/* Left: ID & Info */}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <span className="text-xs font-mono font-bold text-slate-800">
                                                                {r.Request_id}
                                                            </span>
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                                                {r.Form_id}
                                                            </span>
                                                            <span className="text-xs text-slate-400">·</span>
                                                            <span className="text-xs font-semibold text-slate-700">
                                                                {r.Request_by || '—'}
                                                            </span>
                                                            <span className="text-xs text-slate-400">
                                                                ({r.Section_code || 'ไม่ระบุแผนก'})
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-600 line-clamp-1 leading-snug">
                                                            {r.Detail_Info || '(ไม่มีรายละเอียด)'}
                                                        </p>
                                                    </div>

                                                    {/* Middle: Waiting on & Aging */}
                                                    <div className="flex items-center gap-3 sm:flex-shrink-0">
                                                        <div className="text-right">
                                                            <p className="text-[11px] text-slate-400">รอผู้ดำเนินการ:</p>
                                                            <p className="text-xs font-semibold text-slate-700 max-w-[140px] truncate" title={item.waitingFor}>
                                                                {item.waitingFor || '—'}
                                                            </p>
                                                        </div>

                                                        <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                                                            isOverdue
                                                                ? 'bg-red-50 text-red-700 border border-red-200'
                                                                : 'bg-slate-100 text-slate-600'
                                                        }`}>
                                                            <Clock className="w-3.5 h-3.5" />
                                                            {item.daysOpen === 0 ? 'วันนี้' : `${item.daysOpen} วัน`}
                                                        </div>

                                                        {/* Action button */}
                                                        {onSelectRow && (
                                                            <button
                                                                onClick={() => onSelectRow(r)}
                                                                className="px-2.5 py-1 text-xs font-medium text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 rounded-lg transition-colors flex items-center gap-1"
                                                            >
                                                                <span>ดูรายละเอียด</span>
                                                                <ExternalLink className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
