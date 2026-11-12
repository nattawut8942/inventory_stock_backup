import React, { useState } from 'react';
import { Calendar, Check, Copy, FileText, Package, Phone, Printer, RotateCcw } from 'lucide-react';
import BaseModal, { ModalHeader } from './BaseModal';
import { formatThaiDate } from '../../utils/formatDate';
import { money, linkifyPhones, printReceipt } from './receiveUtils';

/**
 * InvoiceDetailModal - รายละเอียด Invoice + ปุ่มพิมพ์ใบรับของ + ยกเลิก
 * props.rows: [{ t, name, qty, value }] ที่คำนวณจากฝั่ง parent แล้ว
 */
const InvoiceDetailModal = ({ invoice, rows, totalQty, totalValue, vendor, contact, isStaff, onClose, onCancelRequest, onPrintBlocked, onViewPO }) => {
    const cancelled = invoice.Status === 'Cancelled';
    const [copied, setCopied] = useState(false);

    const copyInvoiceNo = async () => {
        try {
            await navigator.clipboard.writeText(invoice.InvoiceNo);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* เบราว์เซอร์ไม่อนุญาตคัดลอก */ }
    };

    const handlePrint = () => {
        const ok = printReceipt({ invoice, rows, totalQty, totalValue, vendor, contact });
        if (!ok) onPrintBlocked?.();
    };

    return (
        <BaseModal onClose={onClose} label={`Invoice ${invoice.InvoiceNo}`} maxWidth="max-w-2xl">
            <ModalHeader
                icon={FileText}
                eyebrow="รายละเอียด Invoice"
                title={invoice.InvoiceNo}
                titleClass={cancelled ? 'line-through opacity-80' : ''}
                onClose={onClose}
            >
                <button
                    type="button"
                    onClick={copyInvoiceNo}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold bg-white/15 hover:bg-white/25 border border-white/20 px-2.5 py-1 rounded-lg transition-colors"
                    aria-label="คัดลอกเลข Invoice"
                >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'คัดลอกแล้ว' : 'คัดลอกเลข Invoice'}
                </button>
                <div className="flex flex-wrap gap-2 mt-2 text-indigo-100 text-xs font-medium">
                    {onViewPO ? (
                        <button type="button" onClick={onViewPO} className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded underline-offset-2 hover:underline transition-colors" title="ดูรายละเอียด PO">
                            PO: {invoice.PO_ID} →
                        </button>
                    ) : (
                        <span className="bg-white/20 px-2 py-0.5 rounded">PO: {invoice.PO_ID}</span>
                    )}
                    <span className="bg-white/20 px-2 py-0.5 rounded flex items-center gap-1"><Calendar size={10} /> {formatThaiDate(invoice.ReceiveDate)}</span>
                </div>
                {contact && (
                    <div className="mt-2 text-xs bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/10 text-indigo-50">
                        <p className="font-bold mb-0.5 flex items-center gap-1"><Phone size={10} /> Contact Info:</p>
                        <p className="whitespace-pre-wrap break-words">{linkifyPhones(contact)}</p>
                    </div>
                )}
            </ModalHeader>

            <div className="p-4 bg-slate-50/50 max-h-[60vh] overflow-y-auto">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <Package className="text-violet-500" size={18} />
                    รายการที่รับเข้า
                </h4>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                    <table className="w-full text-sm min-w-[360px]">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="text-left p-2.5 font-bold text-slate-500">รายการ</th>
                                <th className="text-center p-2.5 font-bold text-slate-500 w-24">จำนวน</th>
                                <th className="text-right p-2.5 font-bold text-slate-500 w-36">มูลค่า</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {rows.map((r, idx) => (
                                <tr key={idx} className="hover:bg-emerald-50/50 bg-emerald-50/10">
                                    <td className="p-2">
                                        <div className="font-bold text-slate-700">{r.name}</div>
                                        <div className="text-xs text-slate-400 font-mono">{r.t.ProductID}</div>
                                    </td>
                                    <td className="p-2 text-center">
                                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-mono font-bold text-xs border border-emerald-200">
                                            +{r.qty}
                                        </span>
                                    </td>
                                    <td className="p-2 text-right font-mono text-slate-600">
                                        {r.value === null ? <span className="text-slate-300">-</span> : money(r.value)}
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan="3" className="p-8 text-center text-slate-400">ไม่พบรายการสินค้า</td>
                                </tr>
                            )}
                        </tbody>
                        {rows.length > 0 && (
                            <tfoot className="bg-slate-50 border-t border-slate-200">
                                <tr>
                                    <td className="p-2.5 font-bold text-slate-600">รวม</td>
                                    <td className="p-2.5 text-center font-mono font-bold text-slate-700">{totalQty}</td>
                                    <td className="p-2.5 text-right font-mono font-bold text-slate-800">{money(totalValue)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                <div className="mt-4 flex justify-between items-center text-xs text-slate-400">
                    <div>
                        <span className="font-bold">ผู้รับของ:</span> {(invoice.ReceivedBy || '-').toUpperCase()}
                    </div>
                    {cancelled && <span className="font-bold text-red-500">ยกเลิกแล้ว</span>}
                </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-100 flex flex-wrap gap-3">
                <button
                    onClick={onClose}
                    className="flex-1 bg-slate-100 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-200 transition-all border border-slate-200"
                >
                    ปิดหน้าต่าง
                </button>
                <button
                    onClick={handlePrint}
                    className="flex-1 bg-white text-indigo-600 font-bold py-2 text-sm rounded-lg hover:bg-indigo-50 transition-all border border-indigo-200 flex items-center justify-center gap-2"
                >
                    <Printer size={16} /> พิมพ์ใบรับของ
                </button>
                {isStaff && !cancelled && (
                    <button
                        onClick={() => onCancelRequest(invoice.InvoiceNo)}
                        className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold py-2 text-sm rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-md flex items-center justify-center gap-2"
                    >
                        <RotateCcw size={16} /> ยกเลิก Invoice
                    </button>
                )}
            </div>
        </BaseModal>
    );
};

export default InvoiceDetailModal;
