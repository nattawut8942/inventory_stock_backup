import React, { useState } from 'react';
import { AlertTriangle, Check, Clock, Copy, FileText, Package, Phone } from 'lucide-react';
import BaseModal, { ModalHeader } from './BaseModal';
import { formatThaiDate } from '../../utils/formatDate';
import { money, linkifyPhones, getStatusColor, statusText, poProgress, getOverdue, todayKey, toDateKey, dayDiff } from './receiveUtils';

/**
 * ReceivePODetailModal - รายละเอียด PO ในหน้า Receive (สรุปยอด ความคืบหน้า ตารางรายการ)
 */
const ReceivePODetailModal = ({ po, products, contact, invoices, isStaff, onClose, onReceive, onOpenInvoice }) => {
    const prog = poProgress(po);
    const today = todayKey();
    const overdueDays = getOverdue(po, today);
    const dueInDays = po.DueDate && !overdueDays && po.Status !== 'Completed' ? dayDiff(toDateKey(po.DueDate), today) : null;
    const items = Array.isArray(po.Items) ? po.Items : [];
    const remainingValue = items.reduce((s, it) => s + Math.max(0, Number(it.QtyOrdered || 0) - Number(it.QtyReceived || 0)) * Number(it.UnitCost || 0), 0);
    const poInvoices = (invoices || [])
        .filter(inv => inv && inv.PO_ID === po.PO_ID)
        .sort((a, b) => new Date(b.ReceiveDate) - new Date(a.ReceiveDate));
    const [copied, setCopied] = useState(false);

    const copyPoId = async () => {
        try {
            await navigator.clipboard.writeText(po.PO_ID);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* เบราว์เซอร์ไม่อนุญาตคัดลอก */ }
    };

    return (
        <BaseModal onClose={onClose} label={`ใบสั่งซื้อ ${po.PO_ID}`} maxWidth="max-w-2xl">
            <ModalHeader
                icon={Package}
                eyebrow="ใบสั่งซื้อ"
                title={po.PO_ID}
                subtitle={po.VendorName || 'ไม่ระบุผู้ขาย (Unknown Vendor)'}
                onClose={onClose}
            >
                <button
                    type="button"
                    onClick={copyPoId}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold bg-white/15 hover:bg-white/25 border border-white/20 px-2.5 py-1 rounded-lg transition-colors"
                    aria-label="คัดลอกเลข PO"
                >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'คัดลอกแล้ว' : 'คัดลอกเลข PO'}
                </button>
                {contact && (
                    <div className="mt-2 text-xs bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/10 text-indigo-50">
                        <p className="font-bold mb-0.5 flex items-center gap-1"><Phone size={10} /> Contact Info:</p>
                        <p className="whitespace-pre-wrap break-words">{linkifyPhones(contact)}</p>
                    </div>
                )}
            </ModalHeader>

            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto bg-slate-50/50">
                {overdueDays > 0 && (
                    <div className="flex items-center gap-2 text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                        <AlertTriangle size={16} /> เลยกำหนดส่งมาแล้ว {overdueDays} วัน
                    </div>
                )}

                {/* Summary */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white rounded-xl border border-slate-100 p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">ความคืบหน้า</p>
                        <p className="text-lg font-black text-slate-800">{prog.pct}%</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-100 p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">รับแล้ว / สั่ง</p>
                        <p className="text-lg font-black text-slate-800 font-mono">{prog.received}/{prog.ordered}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-100 p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">ค้างรับ (มูลค่า)</p>
                        <p className="text-sm sm:text-lg font-black text-slate-800 font-mono break-all">{money(remainingValue)}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">จากรวม {money(prog.value)}</p>
                    </div>
                </div>

                {/* Info */}
                <div className="bg-white rounded-2xl overflow-hidden divide-y divide-slate-100 border border-slate-100 shadow-sm">
                    <InfoRow label="สถานะ">
                        <span className={`text-sm font-bold px-3 py-1 rounded-full border ${getStatusColor(po.Status)}`}>{statusText(po.Status)}</span>
                    </InfoRow>
                    <InfoRow label="REQUEST DATE"><span className="text-sm font-bold text-slate-800">{formatThaiDate(po.RequestDate)}</span></InfoRow>
                    {po.DueDate && (
                        <InfoRow label="DUE DATE">
                            <span className={`text-sm font-bold ${overdueDays > 0 ? 'text-red-600' : 'text-slate-800'}`}>{formatThaiDate(po.DueDate)}</span>
                            {dueInDays !== null && dueInDays <= 7 && (
                                <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                                    {dueInDays === 0 ? 'ครบกำหนดวันนี้' : `อีก ${dueInDays} วัน`}
                                </span>
                            )}
                        </InfoRow>
                    )}
                    {po.BudgetNo && <InfoRow label="BUDGET NO."><span className="text-sm font-bold text-slate-800 font-mono break-all">{po.BudgetNo}</span></InfoRow>}
                    {po.PR_No && <InfoRow label="PR NO."><span className="text-sm font-bold text-slate-800 font-mono break-all">{po.PR_No}</span></InfoRow>}
                    {po.DeliveryTo && <InfoRow label="ผู้เปิด PR"><span className="text-sm font-bold text-slate-800 break-words">{po.DeliveryTo}</span></InfoRow>}
                </div>

                {/* Items */}
                <div>
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <Package className="text-indigo-500" size={18} />
                        รายการอุปกรณ์ ({items.length})
                    </h4>
                    <div className="bg-white rounded-2xl overflow-x-auto border border-slate-200 shadow-sm">
                        <table className="w-full text-sm min-w-[480px]">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="text-left p-3 font-bold text-slate-500">รายการ</th>
                                    <th className="text-left p-3 font-bold text-slate-500 w-24">BG No.</th>
                                    <th className="text-center p-3 font-bold text-slate-500 w-28">รับแล้ว/สั่ง</th>
                                    <th className="text-center p-3 font-bold text-slate-500 w-24">สถานะ</th>
                                    <th className="text-right p-3 font-bold text-slate-500 w-32">ราคา/หน่วย</th>
                                    <th className="text-right p-3 font-bold text-slate-500 w-32">รวม</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => {
                                    const prodName = item.ItemName || (products || []).find(p => p.ProductID === item.ProductID)?.ProductName || `Item #${idx + 1}`;
                                    const isFullyReceived = (item.QtyReceived || 0) >= item.QtyOrdered;
                                    const lineTotal = Number(item.QtyOrdered || 0) * Number(item.UnitCost || 0);
                                    return (
                                        <tr key={idx} className={`border-b border-slate-50 last:border-0 ${isFullyReceived ? 'bg-emerald-50' : ''}`}>
                                            <td className={`p-2 font-medium ${isFullyReceived ? 'text-emerald-900' : 'text-slate-700'}`}>{prodName}</td>
                                            <td className="p-2">
                                                {item.BG_No ? (
                                                    <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{item.BG_No}</span>
                                                ) : (
                                                    <span className="text-xs text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="p-2 text-center">
                                                <div className={`inline-flex items-center rounded-lg px-2 py-1 font-mono text-xs ${isFullyReceived ? 'bg-emerald-200/50 text-emerald-800' : 'bg-slate-100'}`}>
                                                    <span className="font-bold">{item.QtyReceived || 0}</span>
                                                    <span className="mx-1 opacity-50">/</span>
                                                    <span className="font-bold">{item.QtyOrdered}</span>
                                                </div>
                                            </td>
                                            <td className="p-2 text-center">
                                                {isFullyReceived ? (
                                                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold border border-emerald-200">
                                                        <Check size={12} /> รับแล้ว
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full text-xs font-bold border border-amber-100">
                                                        <Clock size={12} /> รอของ
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-2 text-right font-mono text-slate-600">{money(item.UnitCost)}</td>
                                            <td className="p-2 text-right font-mono text-slate-800 font-bold">{money(lineTotal)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Receive history */}
                <div>
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <FileText className="text-violet-500" size={18} />
                        ประวัติการรับของ ({poInvoices.length})
                    </h4>
                    {poInvoices.length === 0 ? (
                        <p className="text-sm text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 p-4 text-center">ยังไม่มีการรับของสำหรับ PO นี้</p>
                    ) : (
                        <ul className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                            {poInvoices.map(inv => {
                                const cancelled = inv.Status === 'Cancelled';
                                return (
                                    <li key={inv.InvoiceNo}>
                                        <button
                                            type="button"
                                            onClick={() => onOpenInvoice?.(inv)}
                                            className="w-full text-left p-3 flex items-center gap-3 hover:bg-violet-50/50 transition-colors"
                                        >
                                            <span className={`w-2 h-8 rounded-full shrink-0 ${cancelled ? 'bg-red-300' : 'bg-emerald-400'}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-mono font-bold text-sm text-slate-800 truncate ${cancelled ? 'line-through opacity-60' : ''}`}>{inv.InvoiceNo}</p>
                                                <p className="text-xs text-slate-400">{formatThaiDate(inv.ReceiveDate)} · {(inv.ReceivedBy || '-').toUpperCase()}</p>
                                            </div>
                                            {cancelled && <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">ยกเลิกแล้ว</span>}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                <button
                    onClick={onClose}
                    className="flex-1 bg-white border-2 border-slate-100 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-50 hover:border-slate-200 transition-all"
                >
                    ปิด
                </button>
                {isStaff && (
                    <button
                        onClick={() => onReceive(po)}
                        className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold py-2 text-sm rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-md flex items-center justify-center gap-2"
                    >
                        <Check size={18} /> รับของ
                    </button>
                )}
            </div>
        </BaseModal>
    );
};

const InfoRow = ({ label, children }) => (
    <div className="flex items-center p-3 sm:px-4">
        <span className="text-xs text-slate-500 font-bold uppercase w-28 sm:w-52 shrink-0">{label}</span>
        <span className="min-w-0">{children}</span>
    </div>
);

export default ReceivePODetailModal;
