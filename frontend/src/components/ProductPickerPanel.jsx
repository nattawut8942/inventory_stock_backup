import React, { useMemo, useState } from 'react';
import { Search, Package, X, Plus, AlertTriangle, ChevronUp, ChevronDown, Eye, Check } from 'lucide-react';

const normalize = (s) => (s === null || s === undefined ? '' : String(s)).toLowerCase().trim();

const MAX_ROWS = 200;

/**
 * ProductPickerPanel - รายการอุปกรณ์ Master แบบ panel (ไม่ใช่ modal) ค้นหา / กรองประเภท / ดูสต็อก
 * @param {Array} products - รายการอุปกรณ์จาก context
 * @param {Array} deviceTypes - ประเภทอุปกรณ์ [{TypeId, Label}]
 * @param {number|null} selectedProductId - ProductID ที่ถูกเลือกอยู่ในแถวที่ active (ไว้ไฮไลต์)
 * @param {string} targetLabel - ข้อความบอกว่ากำลังเลือกลงแถวไหน
 * @param {Function} onSelect - เรียกด้วย { ProductID, ItemName, LastPrice }
 * @param {Function} onCreateNew - เรียกด้วยชื่อ เมื่อต้องการสร้างอุปกรณ์ใหม่
 */
const ProductPickerPanel = ({ products = [], deviceTypes = [], orderingItems = [], selectedProductId = null, targetLabel = '', onSelect, onCreateNew }) => {
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState('master'); // 'master' | 'ordering'
    const [typeFilter, setTypeFilter] = useState('all');
    const [sortKey, setSortKey] = useState('ProductName');
    const [sortDir, setSortDir] = useState('asc');
    const [expandedId, setExpandedId] = useState(null);

    const typeLabel = useMemo(
        () => Object.fromEntries((deviceTypes || []).map(t => [t.TypeId, t.Label])),
        [deviceTypes]
    );

    // จำนวนอุปกรณ์แต่ละประเภท (ใช้แสดงบนปุ่มกรอง)
    const typeCounts = useMemo(() => {
        const counts = {};
        products.forEach(p => { counts[p.DeviceType] = (counts[p.DeviceType] || 0) + 1; });
        return counts;
    }, [products]);

    const tokens = normalize(search).split(/\s+/).filter(Boolean);

    const filtered = useMemo(() => {
        const list = products.filter(p => {
            if (typeFilter !== 'all' && p.DeviceType !== typeFilter) return false;
            if (tokens.length === 0) return true;
            // ค้นได้ทุกคำ ไม่สนลำดับ เช่น "85a toner" เจอ "HP Toner 85A"
            const hay = normalize([p.ProductName, typeLabel[p.DeviceType] || p.DeviceType, p.Location, p.BarcodeID].join(' '));
            return tokens.every(t => hay.includes(t));
        });

        const numericKeys = ['CurrentStock', 'MinStock', 'LastPrice'];
        list.sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            let cmp;
            if (numericKeys.includes(sortKey)) {
                cmp = (Number(av) || 0) - (Number(bv) || 0);
            } else {
                cmp = normalize(av).localeCompare(normalize(bv), 'th');
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [products, typeFilter, search, sortKey, sortDir, typeLabel]);

    const orderFiltered = orderingItems.filter(o => tokens.every(t => normalize(o.ItemName).includes(t)));

    const exactMatch = products.some(p => normalize(p.ProductName) === normalize(search));
    const canCreateNew = !!search.trim() && !exactMatch && !!onCreateNew;
    const shown = filtered.slice(0, MAX_ROWS);

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ k }) => {
        if (sortKey !== k) return null;
        return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
    };

    const handlePick = (product) => {
        onSelect({ ProductID: product.ProductID, ItemName: product.ProductName, LastPrice: product.LastPrice || 0 });
    };

    return (
        <div className="flex flex-col h-full min-h-0 gap-3">
            {/* Header */}
            <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm"><Package size={16} className="text-indigo-600" /> รายการอุปกรณ์ใน Master</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                    {targetLabel || 'คลิกแถวเพื่อเลือกลงรายการ PO'}
                </p>
            </div>

            {/* Tabs: Master / กำลังสั่ง */}
            <div className="flex bg-slate-100 p-1 rounded-lg text-[11px] font-bold">
                <button
                    type="button"
                    onClick={() => setTab('master')}
                    className={`flex-1 py-1.5 rounded-md transition-all ${tab === 'master' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Master ({products.length})
                </button>
                <button
                    type="button"
                    onClick={() => setTab('ordering')}
                    className={`flex-1 py-1.5 rounded-md transition-all ${tab === 'ordering' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    กำลังสั่ง ({orderingItems.length})
                </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
                <Search size={14} className="text-slate-400 shrink-0" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (filtered.length === 1) handlePick(filtered[0]);
                            else if (filtered.length === 0 && canCreateNew) onCreateNew(search.trim());
                        }
                    }}
                    placeholder="ค้นหาชื่อ / ประเภท / Location / Barcode"
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-700 placeholder-slate-400"
                />
                {search && (
                    <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                )}
            </div>

            {/* Type filter */}
            {tab === 'master' && <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    onClick={() => setTypeFilter('all')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${typeFilter === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                >
                    ทั้งหมด ({products.length})
                </button>
                {(deviceTypes || []).map(t => (
                    <button
                        type="button"
                        key={t.TypeId}
                        onClick={() => setTypeFilter(t.TypeId)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${typeFilter === t.TypeId ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                    >
                        {t.Label} ({typeCounts[t.TypeId] || 0})
                    </button>
                ))}
            </div>}

            {/* Table / กำลังสั่ง */}
            {tab === 'ordering' ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {orderFiltered.length === 0 && (
                    <div className="text-center text-xs text-slate-400 py-10">ไม่มีอุปกรณ์ที่กำลังสั่งซื้อ</div>
                )}
                {orderFiltered.map(o => (
                    <button
                        key={o.key}
                        type="button"
                        onClick={() => onSelect({ ProductID: o.ProductID, ItemName: o.ItemName, LastPrice: o.UnitCost || 0 })}
                        className="w-full text-left bg-white border border-slate-200 rounded-xl p-3 hover:border-amber-300 hover:bg-amber-50/50 transition-colors"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-slate-800 text-xs break-words">{o.ItemName}</span>
                            {!o.ProductID && (
                                <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">ยังไม่มีในระบบ</span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px]">
                            <span className="font-bold text-indigo-600">คงค้างรับ {o.remaining}</span>
                            <span className="text-slate-300">·</span>
                            {o.pos.map(p => (
                                <span key={p} className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{p}</span>
                            ))}
                        </div>
                    </button>
                ))}
            </div>
            ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden border border-slate-200 rounded-xl bg-white custom-scrollbar">
                <table className="w-full table-fixed text-xs text-left">
                    <colgroup>
                        <col className="w-[38%]" />
                        <col className="w-[18%]" />
                        <col className="w-[14%]" />
                        <col className="w-[18%]" />
                        <col className="w-[12%]" />
                    </colgroup>
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="p-2 pl-3 cursor-pointer select-none" onClick={() => toggleSort('ProductName')}>
                                <span className="inline-flex items-center gap-1">ชื่ออุปกรณ์ <SortIcon k="ProductName" /></span>
                            </th>
                            <th className="p-2 cursor-pointer select-none" onClick={() => toggleSort('DeviceType')}>
                                <span className="inline-flex items-center gap-1">ประเภท <SortIcon k="DeviceType" /></span>
                            </th>
                            <th className="p-2">Location</th>
                            <th className="p-2 text-center cursor-pointer select-none" onClick={() => toggleSort('CurrentStock')}>
                                <span className="inline-flex items-center gap-1 justify-center">สต็อก <SortIcon k="CurrentStock" /></span>
                            </th>
                            <th className="p-2 pr-3 text-right cursor-pointer select-none" onClick={() => toggleSort('LastPrice')}>
                                <span className="inline-flex items-center gap-1 justify-end">ราคา <SortIcon k="LastPrice" /></span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {shown.map(p => {
                            const isLow = p.CurrentStock != null && p.MinStock != null && Number(p.CurrentStock) <= Number(p.MinStock);
                            const isSelected = selectedProductId && p.ProductID === selectedProductId;
                            const isExpanded = expandedId === p.ProductID;
                            return (
                                <React.Fragment key={p.ProductID}>
                                    <tr
                                        onClick={() => handlePick(p)}
                                        className={`cursor-pointer transition-colors hover:bg-indigo-50 ${isSelected ? 'bg-emerald-50' : ''}`}
                                    >
                                        <td className="p-2 pl-3">
                                            <div className="flex items-center gap-1.5">
                                                {isSelected && <Check size={12} className="text-emerald-600 shrink-0" />}
                                                <span className="font-medium text-slate-800 break-words">{p.ProductName}</span>
                                            </div>
                                        </td>
                                        <td className="p-2 text-[11px] text-slate-500 break-words">{typeLabel[p.DeviceType] || p.DeviceType || '-'}</td>
                                        <td className="p-2 text-[11px] text-slate-500">{p.Location || '-'}</td>
                                        <td className="p-2 text-center">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : p.ProductID); }}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-all ${isLow ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'}`}
                                                title="ดูรายละเอียดสต็อก"
                                            >
                                                <Eye size={11} /> {p.CurrentStock ?? 0} {p.UnitOfMeasure || ''}
                                                {isLow && <AlertTriangle size={10} />}
                                            </button>
                                        </td>
                                        <td className="p-2 pr-3 text-right font-mono text-[11px] text-slate-600 whitespace-nowrap">
                                            {p.LastPrice ? `฿${Number(p.LastPrice).toLocaleString()}` : '-'}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-slate-50">
                                            <td colSpan={5} className="p-3">
                                                <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                                                    <div>
                                                        <p className="text-slate-400 font-bold uppercase text-[10px]">คงเหลือ</p>
                                                        <p className={`font-black text-sm ${isLow ? 'text-red-600' : 'text-slate-800'}`}>{p.CurrentStock ?? 0} {p.UnitOfMeasure || ''}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-slate-400 font-bold uppercase text-[10px]">ขั้นต่ำ / สูงสุด</p>
                                                        <p className="font-bold text-slate-700">{p.MinStock ?? '-'} / {p.MaxStock ?? '-'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-slate-400 font-bold uppercase text-[10px]">Location</p>
                                                        <p className="font-bold text-slate-700">{p.Location || '-'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-slate-400 font-bold uppercase text-[10px]">สถานะ</p>
                                                        {isLow
                                                            ? <p className="font-bold text-red-600">ต่ำกว่าขั้นต่ำ ควรสั่งซื้อ</p>
                                                            : <p className="font-bold text-emerald-600">ปกติ</p>}
                                                    </div>
                                                    {p.BarcodeID && (
                                                        <div className="col-span-2">
                                                            <p className="text-slate-400 font-bold uppercase text-[10px]">Barcode</p>
                                                            <p className="font-mono text-slate-700">{p.BarcodeID}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-6 text-center text-slate-400">
                                    <Package size={28} className="mx-auto mb-2 opacity-40" />
                                    <p className="text-xs">ไม่พบอุปกรณ์ที่ตรงกับการค้นหา</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

            {/* Footer */}
            <div className="space-y-2">
                <p className="text-[11px] text-slate-500">
                    พบ {filtered.length} จาก {products.length} รายการ
                    {shown.length < filtered.length && <span> · แสดง {MAX_ROWS} แรก (พิมพ์เพิ่มเพื่อกรอง)</span>}
                    {filtered.length > 0 && search.trim() && !exactMatch && (
                        <span className="text-amber-600 font-bold"> · ไม่มีชื่อตรงเป๊ะ ตรวจก่อนสร้างใหม่</span>
                    )}
                </p>
                {canCreateNew && (
                    <button
                        type="button"
                        onClick={() => onCreateNew(search.trim())}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 text-xs font-bold"
                    >
                        <Plus size={14} /> ใช้ "{search.trim()}" เป็นอุปกรณ์ใหม่
                    </button>
                )}
            </div>
        </div>
    );
};

export default ProductPickerPanel;
