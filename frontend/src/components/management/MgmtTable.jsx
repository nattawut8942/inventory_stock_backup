import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Edit2, Trash2, Inbox } from 'lucide-react';
import { PagerBar } from '../StockPager';

// ── ส่วนหัวของแต่ละแท็บในหน้า Management (หัวข้อภาษาไทย + จำนวน + ปุ่มหลัก) ──
export function MgmtSection({ title, count, titleExtra, subtitle, actions, children }) {
    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        {title}
                        {count !== undefined && count !== null && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold tabular-nums">{count.toLocaleString()}</span>
                        )}
                        {titleExtra}
                    </h3>
                    {subtitle && <p className="text-slate-500 text-xs mt-1 leading-relaxed">{subtitle}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
            </div>
            {children}
        </div>
    );
}

// ปุ่มหลัก (เพิ่ม…)
export function PrimaryButton({ icon: Icon, children, ...props }) {
    return (
        <button type="button" {...props}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 h-10 rounded-xl text-sm font-bold shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {Icon && <Icon size={16} />}{children}
        </button>
    );
}

// ปุ่มรอง
export function SecondaryButton({ icon: Icon, children, ...props }) {
    return (
        <button type="button" {...props}
            className="flex items-center gap-1.5 px-3 h-9 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors">
            {Icon && <Icon size={14} />}{children}
        </button>
    );
}

// ปุ่มแก้ไข/ลบ — แสดงตลอด (ไม่ซ่อนจนกว่าจะ hover จึงกดบนจอสัมผัสได้)
export function RowActions({ onEdit, onDelete, editLabel = 'แก้ไข', deleteLabel = 'ลบ', children }) {
    return (
        <div className="flex justify-end items-center gap-1">
            {children}
            {onEdit && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} title={editLabel} aria-label={editLabel}
                    className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"><Edit2 size={16} /></button>
            )}
            {onDelete && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} title={deleteLabel} aria-label={deleteLabel}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"><Trash2 size={16} /></button>
            )}
        </div>
    );
}

const cmp = (a, b) => {
    if (a === b) return 0;
    if (a === null || a === undefined || a === '') return 1;
    if (b === null || b === undefined || b === '') return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (a instanceof Date || b instanceof Date) return new Date(a) - new Date(b);
    return String(a).localeCompare(String(b), 'th', { numeric: true, sensitivity: 'base' });
};

/**
 * ตารางมาตรฐานของหน้า Management
 * columns: [{ key, label, render(row), sortValue?(row) (ไม่ใส่ = เรียงไม่ได้), align?: 'right'|'center',
 *            className?, primary?: true (หัวการ์ดบนมือถือ), mobileHidden?: true, actions?: true }]
 * - ค้นหา: searchText(row) → ข้อความที่ใช้ค้นหา
 * - groupBy(row) + renderGroup(key, rows): แสดงหัวกลุ่ม (ลำดับกลุ่มตามข้อมูลเดิม เรียงภายในกลุ่ม)
 * - pageSize: Infinity = ไม่แบ่งหน้า · sortable=false ปิดการเรียง (เช่น ตารางที่ลากเรียงเอง)
 * - rowProps(row, index): props เพิ่มของแถว (เช่น drag) · index = ลำดับในรายการที่แสดง
 */
export function MgmtTable({
    columns, rows, rowKey, searchText, searchPlaceholder = 'ค้นหา…', search, onSearch,
    emptyText = 'ไม่มีข้อมูล', loading = false, pageSize = 20, defaultSort = null, sortable = true,
    groupBy, renderGroup, rowProps, rowClassName, toolbar, minWidth = 640, dense = false,
}) {
    // dense: แถวเตี้ย ตัวอักษรเล็ก (ใช้กับตารางประวัติที่มีหลายแถว)
    const thPad = dense ? 'px-4 py-2.5' : 'px-4 py-3';
    const tdPad = dense ? 'px-4 py-2.5 text-xs' : 'px-4 py-3 text-sm';
    const [internalQ, setInternalQ] = useState('');
    const q = search !== undefined ? search : internalQ;
    const setQ = onSearch || setInternalQ;
    const [sort, setSort] = useState(defaultSort); // { key, dir }
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        const t = q.trim().toLowerCase();
        if (!t || !searchText) return rows;
        return rows.filter((r) => String(searchText(r) || '').toLowerCase().includes(t));
    }, [rows, q, searchText]);

    const sorted = useMemo(() => {
        const col = sort && columns.find((c) => c.key === sort.key);
        let out = filtered;
        if (sortable && col?.sortValue) {
            const dir = sort.dir === 'desc' ? -1 : 1;
            out = [...filtered].sort((a, b) => dir * cmp(col.sortValue(a), col.sortValue(b)));
        }
        if (groupBy) {
            const order = [];
            const seen = new Set();
            for (const r of rows) { const g = groupBy(r); if (!seen.has(g)) { seen.add(g); order.push(g); } }
            const rank = new Map(order.map((g, i) => [g, i]));
            out = [...out].sort((a, b) => rank.get(groupBy(a)) - rank.get(groupBy(b))); // stable → ลำดับภายในกลุ่มคงเดิม
        }
        return out;
    }, [filtered, sort, columns, sortable, groupBy, rows]);

    useEffect(() => { setPage(1); }, [q, sort, rows]);

    const size = Number.isFinite(pageSize) ? pageSize : Math.max(1, sorted.length);
    const totalPages = Math.max(1, Math.ceil(sorted.length / size));
    const curPage = Math.min(page, totalPages);
    const pageStart = (curPage - 1) * size;
    const pageRows = sorted.slice(pageStart, pageStart + size);

    const toggleSort = (c) => {
        if (!sortable || !c.sortValue) return;
        setSort((s) => (s?.key === c.key ? (s.dir === 'asc' ? { key: c.key, dir: 'desc' } : null) : { key: c.key, dir: 'asc' }));
    };

    const primary = columns.find((c) => c.primary) || columns[0];
    const actionCol = columns.find((c) => c.actions);
    const metaCols = columns.filter((c) => c !== primary && !c.actions && !c.mobileHidden);
    const groupRows = (g) => sorted.filter((r) => groupBy(r) === g);

    const withGroups = (renderRow, renderHead) => {
        const out = [];
        let last = Symbol('none');
        pageRows.forEach((r, i) => {
            if (groupBy) {
                const g = groupBy(r);
                if (g !== last) { out.push(renderHead(g, i)); last = g; }
            }
            out.push(renderRow(r, i));
        });
        return out;
    };

    return (
        <div className="space-y-3">
            {(searchText || toolbar) && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    {searchText && (
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
                                className="w-full h-10 bg-white border border-slate-200 pl-9 pr-3 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                        </div>
                    )}
                    {toolbar && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{toolbar}</div>}
                </div>
            )}

            {loading && rows.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">กำลังโหลด…</div>
            ) : sorted.length === 0 ? (
                <div className="py-14 text-center text-slate-400 rounded-xl border border-dashed border-slate-200">
                    <Inbox className="mx-auto mb-2 text-slate-300" size={32} />
                    <div className="text-sm">{q.trim() ? `ไม่พบ "${q.trim()}"` : emptyText}</div>
                </div>
            ) : (
                <>
                    {/* จอคอม/แท็บเล็ต: ตาราง */}
                    <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-x-auto">
                        <table className="w-full text-left border-collapse" style={{ minWidth }}>
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                                    {columns.map((c) => {
                                        const can = sortable && c.sortValue;
                                        const active = sort?.key === c.key;
                                        return (
                                            <th key={c.key} className={`${thPad} font-bold whitespace-nowrap ${c.align === 'right' || c.actions ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}
                                                aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                                                {can ? (
                                                    <button type="button" onClick={() => toggleSort(c)} className={`inline-flex items-center gap-1 hover:text-indigo-600 ${active ? 'text-indigo-600' : ''}`}>
                                                        {c.label}
                                                        {active ? (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={12} className="text-slate-300" />}
                                                    </button>
                                                ) : c.label}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {withGroups(
                                    (r, i) => (
                                        <tr key={rowKey(r)} {...(rowProps ? rowProps(r, pageStart + i) : {})}
                                            className={`hover:bg-slate-50 transition-colors ${rowClassName ? rowClassName(r, pageStart + i) : ''}`}>
                                            {columns.map((c) => (
                                                <td key={c.key} className={`${tdPad} ${c.align === 'right' || c.actions ? 'text-right' : c.align === 'center' ? 'text-center' : ''} ${c.className || ''}`}>
                                                    {c.render(r)}
                                                </td>
                                            ))}
                                        </tr>
                                    ),
                                    (g, i) => (
                                        <tr key={`g-${g}-${i}`} className="bg-indigo-50/60">
                                            <td colSpan={columns.length} className="px-4 py-2">{renderGroup ? renderGroup(g, groupRows(g)) : g}</td>
                                        </tr>
                                    ),
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* มือถือ: การ์ด */}
                    <div className="md:hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                        {withGroups(
                            (r, i) => (
                                <div key={rowKey(r)} {...(rowProps ? rowProps(r, pageStart + i) : {})} className={`${dense ? 'px-3 py-2' : 'p-3'} ${rowClassName ? rowClassName(r, pageStart + i) : ''}`}>
                                    <div className="flex items-start gap-2">
                                        <div className={`min-w-0 flex-1 font-bold text-slate-800 ${dense ? 'text-xs' : 'text-sm'}`}>{primary.render(r)}</div>
                                        {actionCol && <div className="shrink-0 -mr-1 -mt-1">{actionCol.render(r)}</div>}
                                    </div>
                                    {metaCols.length > 0 && (
                                        <dl className={`${dense ? 'mt-1 gap-y-0.5 text-[11px]' : 'mt-2 gap-y-1 text-xs'} grid grid-cols-[auto,1fr] gap-x-3`}>
                                            {metaCols.map((c) => (
                                                <React.Fragment key={c.key}>
                                                    <dt className="text-slate-400 whitespace-nowrap">{c.label}</dt>
                                                    <dd className="text-slate-700 min-w-0 break-words">{c.render(r)}</dd>
                                                </React.Fragment>
                                            ))}
                                        </dl>
                                    )}
                                </div>
                            ),
                            (g, i) => (
                                <div key={`g-${g}-${i}`} className="px-3 py-2 bg-indigo-50/60">{renderGroup ? renderGroup(g, groupRows(g)) : g}</div>
                            ),
                        )}
                    </div>

                    <PagerBar curPage={curPage} totalPages={totalPages} setPage={setPage} pageStart={pageStart} pageSize={size} total={sorted.length} />
                </>
            )}
        </div>
    );
}
