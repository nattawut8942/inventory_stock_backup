import React, { useEffect, useMemo } from 'react';
import { ShoppingCart, X, Check, Phone, Calendar, Clock, Package, User, Building2, Hash, MapPin, FileText } from 'lucide-react';
import Portal from './Portal';
import { formatThaiDate } from '../utils/formatDate';

const STATUS_STYLE = {
    Completed: { label: 'Completed', chip: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'from-emerald-400 to-green-500' },
    Partial: { label: 'Partial', chip: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'from-amber-400 to-orange-500' },
    Cancelled: { label: 'Cancelled', chip: 'bg-red-100 text-red-700 border-red-200', bar: 'from-red-400 to-pink-500' },
    Open: { label: 'Pending', chip: 'bg-blue-100 text-blue-700 border-blue-200', bar: 'from-blue-400 to-indigo-500' },
    Pending: { label: 'Pending', chip: 'bg-blue-100 text-blue-700 border-blue-200', bar: 'from-blue-400 to-indigo-500' },
};

const money = (n) => `฿${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
};

/**
 * PODetailModal - รายละเอียด PO (ออกแบบใหม่: สรุปยอด, ความคืบหน้า, ตารางรายการ)
 */
const PODetailModal = ({ po, vendors = [], onClose }) => {
    // ปิดด้วย Escape
    useEffect(() => {
        if (!po) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [po, onClose]);

    const items = po?.Items || [];

    const summary = useMemo(() => {
        const totalAmount = items.reduce((s, it) => s + Number(it.QtyOrdered || 0) * Number(it.UnitCost || 0), 0);
        const totalOrdered = items.reduce((s, it) => s + Number(it.QtyOrdered || 0), 0);
        const totalReceived = items.reduce((s, it) => s + Number(it.QtyReceived || 0), 0);
        const progress = totalOrdered > 0 ? Math.min(100, Math.round((totalReceived / totalOrdered) * 100)) : 0;
        const fullyReceived = items.filter(it => Number(it.QtyReceived || 0) >= Number(it.QtyOrdered || 0)).length;
        return { totalAmount, totalOrdered, totalReceived, progress, fullyReceived };
    }, [items]);

    if (!po) return null;

    const status = STATUS_STYLE[po.Status] || STATUS_STYLE.Pending;
    const vendor = vendors.find(v => (v.VendorName || '').trim().toLowerCase() === (po.VendorName || '').trim().toLowerCase());
    const due = daysUntil(po.DueDate);
    const isOpen = po.Status === 'Open' || po.Status === 'Pending';
    const overdue = isOpen && due !== null && due < 0;

    const infoRows = [
        { icon: User, label: 'ผู้บันทึก', value: po.RequestedBy || '-' },
        { icon: Building2, label: 'แผนก', value: po.Section || '-' },
        { icon: Calendar, label: 'วันที่สร้าง', value: formatThaiDate(po.RequestDate) },
        { icon: Clock, label: 'กำหนดส่ง (Due)', value: po.DueDate ? formatThaiDate(po.DueDate) : '-' },
        { icon: Hash, label: 'PR No.', value: po.PR_No || '-' },
        { icon: FileText, label: 'Budget No.', value: po.BudgetNo || '-' },
        { icon: MapPin, label: 'Delivery To', value: po.DeliveryTo || '-' },
    ];

    return (
        <Portal>
            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-6" onMouseDown={onClose}>
                <div
                    className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 text-white px-5 md:px-7 py-5 shrink-0">
                        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
                        <div className="relative flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-indigo-200 text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5"><ShoppingCart size={12} /> Purchase Order</p>
                                <h3 className="font-black text-2xl md:text-3xl tracking-tight mt-1 break-all">{po.PO_ID}</h3>
                                <p className="text-indigo-100 mt-1 text-sm break-words">{po.VendorName || 'ไม่ระบุผู้ขาย'}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-xs font-black px-3 py-1 rounded-full border shadow-sm ${status.chip}`}>{status.label}</span>
                                <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors" aria-label="ปิด">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        {vendor?.ContactInfo && (
                            <div className="relative mt-4 inline-flex items-start gap-2 text-xs bg-white/10 border border-white/15 rounded-xl px-3 py-2 max-w-full">
                                <Phone size={12} className="mt-0.5 shrink-0" />
                                <p className="whitespace-pre-wrap break-words">{vendor.ContactInfo}</p>
                            </div>
                        )}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-50/60 p-4 md:p-6 space-y-5">
                        {/* Summary cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ยอดรวม</p>
                                <p className="text-xl font-black text-slate-800 mt-1">{money(summary.totalAmount)}</p>
                            </div>
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">รายการ</p>
                                <p className="text-xl font-black text-slate-800 mt-1">{items.length} <span className="text-xs font-bold text-slate-400">รายการ</span></p>
                                <p className="text-[11px] text-emerald-600 font-bold mt-0.5">รับครบแล้ว {summary.fullyReceived}/{items.length}</p>
                            </div>
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ความคืบหน้า</p>
                                <p className="text-xl font-black text-slate-800 mt-1">{summary.progress}%</p>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                                    <div className={`h-full bg-gradient-to-r ${status.bar} transition-all`} style={{ width: `${summary.progress}%` }} />
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">{summary.totalReceived}/{summary.totalOrdered} ชิ้น</p>
                            </div>
                            <div className={`rounded-2xl border shadow-sm p-4 ${overdue ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">กำหนดส่ง</p>
                                {po.DueDate ? (
                                    <>
                                        <p className={`text-base font-black mt-1 ${overdue ? 'text-red-600' : 'text-slate-800'}`}>{formatThaiDate(po.DueDate)}</p>
                                        <p className={`text-[11px] font-bold mt-0.5 ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
                                            {isOpen && due !== null
                                                ? (due < 0 ? `เกินกำหนด ${Math.abs(due)} วัน` : due === 0 ? 'ถึงกำหนดวันนี้' : `เหลืออีก ${due} วัน`)
                                                : status.label}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-base font-black text-slate-400 mt-1">-</p>
                                )}
                            </div>
                        </div>

                        {/* Info */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">ข้อมูลใบสั่งซื้อ</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                                {infoRows.map(row => (
                                    <div key={row.label} className="flex items-start gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                                            <row.icon size={15} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{row.label}</p>
                                            <p className="text-sm font-bold text-slate-800 break-words">{row.value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Items */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-4 md:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                                <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2"><Package size={14} /> รายการสินค้า ({items.length})</h4>
                                <span className="text-xs font-bold text-indigo-600">รวม {money(summary.totalAmount)}</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[560px]">
                                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                        <tr>
                                            <th className="text-left p-3 pl-5">รายการ</th>
                                            <th className="text-left p-3">BG No.</th>
                                            <th className="text-left p-3 w-44">รับแล้ว / สั่ง</th>
                                            <th className="text-right p-3">ราคา/หน่วย</th>
                                            <th className="text-right p-3 pr-5">รวม</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {items.map((item, idx) => {
                                            const ordered = Number(item.QtyOrdered || 0);
                                            const received = Number(item.QtyReceived || 0);
                                            const full = received >= ordered;
                                            const pct = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
                                            return (
                                                <tr key={item.DetailID ?? idx} className={full ? 'bg-emerald-50/60' : ''}>
                                                    <td className="p-3 pl-5">
                                                        <div className="flex items-start gap-2">
                                                            {full && <Check size={14} className="text-emerald-600 mt-0.5 shrink-0" />}
                                                            <span className={`font-semibold break-words ${full ? 'text-emerald-700' : 'text-slate-800'}`}>
                                                                {item.ItemName || item.ProductName || `Item #${idx + 1}`}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        {item.BG_No
                                                            ? <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{item.BG_No}</span>
                                                            : <span className="text-slate-300">—</span>}
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs whitespace-nowrap">
                                                                <span className="font-bold text-slate-700">{received}</span>
                                                                <span className="text-slate-400"> / {ordered}</span>
                                                            </span>
                                                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[40px]">
                                                                <div className={`h-full ${full ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-xs text-slate-600 whitespace-nowrap">{money(item.UnitCost)}</td>
                                                    <td className="p-3 pr-5 text-right font-mono text-xs font-bold text-slate-800 whitespace-nowrap">{money(ordered * Number(item.UnitCost || 0))}</td>
                                                </tr>
                                            );
                                        })}
                                        {items.length === 0 && (
                                            <tr><td colSpan={5} className="p-6 text-center text-slate-400 text-sm">ไม่มีรายการสินค้า</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Remark */}
                        {po.Remark && (
                            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200">
                                <p className="text-[10px] text-amber-600 font-black uppercase tracking-wider mb-1">หมายเหตุ</p>
                                <p className="text-sm text-amber-900 whitespace-pre-wrap break-words">{po.Remark}</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 md:px-7 py-3 bg-white border-t border-slate-200 flex justify-end shrink-0">
                        <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-all">
                            ปิด
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

export default PODetailModal;
