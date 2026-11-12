import React, { useMemo, useState } from 'react';
import { FileText, Check, CircleArrowDown, Package } from 'lucide-react';
import BaseModal, { ModalHeader } from './BaseModal';
import { money } from './receiveUtils';

/**
 * ReceiveFormModal - ฟอร์มบันทึกรับของเข้าสต็อกจาก PO
 * - จัดการ state ของบรรทัดและจำนวนเอง
 * - ไม่ปิดเองเมื่อมีข้อมูลค้าง: ส่งเหตุการณ์ onRequestClose(dirty) ให้ parent ตัดสินใจ
 */
const ReceiveFormModal = ({ po, products, invoices, isSubmitting, onRequestClose, onSubmit, closeOnEscape = true }) => {
    const items = Array.isArray(po?.Items) ? po.Items : [];

    // เริ่มต้น: เลือกทุกบรรทัดที่ยังค้างรับ โดยใส่จำนวนค้างรับไว้
    const [lines, setLines] = useState(() => items.map(item => {
        const remaining = Math.max(0, Number(item.QtyOrdered) - Number(item.QtyReceived || 0));
        return { selected: remaining > 0, qty: remaining > 0 ? String(remaining) : '' };
    }));
    const [invoiceNo, setInvoiceNo] = useState('');

    const trimmedInvoice = invoiceNo.trim();
    const duplicateInvoice = !!trimmedInvoice && (invoices || []).some(inv => (inv?.InvoiceNo || '').toLowerCase() === trimmedInvoice.toLowerCase());

    const lineInfo = useMemo(() => items.map((item, idx) => {
        const remaining = Math.max(0, Number(item.QtyOrdered) - Number(item.QtyReceived || 0));
        const line = lines[idx] || { selected: false, qty: '' };
        const selected = line.selected && remaining > 0;
        const qtyNum = line.qty === '' ? NaN : Number(line.qty);
        let error = null;
        if (selected) {
            if (!Number.isInteger(qtyNum) || qtyNum <= 0) error = 'กรอกจำนวนที่รับ (ต้องมากกว่า 0)';
            else if (qtyNum > remaining) error = `เกินค้างรับ (สูงสุด ${remaining})`;
        }
        const prodName = item.ItemName || (products || []).find(p => p.ProductID === item.ProductID)?.ProductName || 'Unknown';
        return {
            item, idx, remaining, selected, error, prodName,
            qty: selected && !error ? qtyNum : 0,
            fullyReceived: remaining <= 0,
        };
    }), [items, lines, products]);

    const validLines = lineInfo.filter(l => l.selected && !l.error && l.qty > 0);
    const hasLineErrors = lineInfo.some(l => l.error);
    const summaryQty = validLines.reduce((s, l) => s + l.qty, 0);
    const summaryValue = validLines.reduce((s, l) => s + l.qty * Number(l.item.UnitCost || 0), 0);
    const canSubmit = !isSubmitting && !!trimmedInvoice && !duplicateInvoice && validLines.length > 0 && !hasLineErrors;

    const setLine = (idx, patch) => setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    const remainingOf = (item) => Math.max(0, Number(item.QtyOrdered) - Number(item.QtyReceived || 0));

    const toggleLine = (idx) => {
        const cur = lines[idx];
        setLine(idx, { selected: !cur?.selected, qty: !cur?.selected && !cur?.qty ? String(remainingOf(items[idx])) : cur?.qty });
    };
    const receiveAllLine = (idx) => setLine(idx, { selected: true, qty: String(remainingOf(items[idx])) });
    const selectAllLines = (on) => {
        setLines(items.map((item, idx) => {
            const remaining = remainingOf(item);
            if (remaining <= 0) return { selected: false, qty: '' };
            return on ? { selected: true, qty: String(remaining) } : { selected: false, qty: lines[idx]?.qty || String(remaining) };
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(po.PO_ID, trimmedInvoice, validLines.map(l => ({
            DetailID: l.item.DetailID,
            ProductID: l.item.ProductID,
            Qty: l.qty,
            BG_No: l.item.BG_No || null,
        })));
    };

    const requestClose = () => {
        if (isSubmitting) return;
        onRequestClose(!!trimmedInvoice);
    };

    return (
        <BaseModal onClose={requestClose} label={`บันทึกรับของ ${po.PO_ID}`} maxWidth="max-w-xl" closeOnEscape={closeOnEscape}>
            <ModalHeader
                icon={Package}
                eyebrow="บันทึกรับของ"
                title={po.PO_ID}
                subtitle={po.VendorName}
                onClose={requestClose}
                disabled={isSubmitting}
            />

            <form onSubmit={handleSubmit} className="flex flex-col">
                <div className="p-4 space-y-4 max-h-[62vh] overflow-y-auto bg-slate-50/50">
                    {/* Invoice number */}
                    <div className={`bg-white p-4 rounded-xl border shadow-sm ${duplicateInvoice ? 'border-red-300' : 'border-indigo-100'}`}>
                        <label htmlFor="receive-invoice-no" className="text-xs font-bold text-indigo-500 uppercase mb-2 block tracking-wider flex items-center gap-1">
                            <FileText size={14} /> เลข Invoice <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="receive-invoice-no"
                            name="InvoiceNo"
                            required
                            autoFocus
                            value={invoiceNo}
                            onChange={(e) => setInvoiceNo(e.target.value)}
                            disabled={isSubmitting}
                            autoComplete="off"
                            placeholder="เช่น INV-2024-001"
                            className={`w-full bg-slate-50 border-2 p-2.5 rounded-lg outline-none font-mono text-sm font-bold text-slate-700 placeholder-indigo-200 transition-colors ${duplicateInvoice ? 'border-red-300 focus:border-red-500' : 'border-indigo-50 focus:border-indigo-500'}`}
                        />
                        {duplicateInvoice && (
                            <p className="mt-1.5 text-xs font-bold text-red-600">เลข Invoice นี้มีอยู่ในระบบแล้ว</p>
                        )}
                    </div>

                    {/* Selection toolbar */}
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">เลือกรายการที่ต้องการรับ</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => selectAllLines(true)} disabled={isSubmitting} className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg">เลือกทั้งหมด</button>
                            <button type="button" onClick={() => selectAllLines(false)} disabled={isSubmitting} className="text-xs font-bold text-slate-500 hover:bg-slate-100 px-2 py-1 rounded-lg">ไม่เลือก</button>
                        </div>
                    </div>

                    <div className="space-y-2.5">
                        {lineInfo.map(l => {
                            const { item, idx, remaining, selected, error, prodName, fullyReceived } = l;
                            return (
                                <div key={idx} className={`rounded-xl border p-3 transition-all ${fullyReceived
                                    ? 'bg-emerald-50 border-emerald-200'
                                    : error
                                        ? 'bg-white border-red-300'
                                        : selected
                                            ? 'bg-white border-indigo-400 shadow-md ring-4 ring-indigo-50'
                                            : 'bg-white border-slate-100 hover:border-indigo-200'}`}>
                                    <div className="flex gap-3 items-center">
                                        {!fullyReceived && (
                                            <input
                                                type="checkbox"
                                                aria-label={`เลือก ${prodName}`}
                                                checked={selected}
                                                onChange={() => toggleLine(idx)}
                                                disabled={isSubmitting}
                                                className="w-5 h-5 rounded border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className={`font-bold text-sm truncate ${fullyReceived ? 'text-emerald-900' : 'text-slate-800'}`}>{prodName}</p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-slate-400 font-medium">
                                                <span>สั่ง {item.QtyOrdered} · รับแล้ว {item.QtyReceived || 0} · ค้าง {remaining}</span>
                                                {item.BG_No && (
                                                    <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                        BG: {item.BG_No}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {fullyReceived ? (
                                            <span className="flex items-center gap-1.5 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">
                                                <Check size={14} /> รับครบแล้ว
                                            </span>
                                        ) : (
                                            <div className={`flex items-center gap-1.5 shrink-0 transition-opacity ${selected ? '' : 'opacity-40'}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => receiveAllLine(idx)}
                                                    disabled={isSubmitting}
                                                    className="text-indigo-400 hover:text-indigo-600 p-1 rounded-lg hover:bg-indigo-50 transition-colors"
                                                    title={`รับทั้งหมด (${remaining})`}
                                                    aria-label={`รับทั้งหมด ${remaining}`}
                                                >
                                                    <CircleArrowDown size={18} />
                                                </button>
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    min="1"
                                                    max={remaining}
                                                    step="1"
                                                    aria-label={`จำนวนที่รับ ${prodName}`}
                                                    value={lines[idx]?.qty ?? ''}
                                                    onChange={(e) => setLine(idx, { qty: e.target.value })}
                                                    disabled={!selected || isSubmitting}
                                                    className={`w-20 bg-slate-50 border p-2 rounded-lg text-center text-lg font-bold font-mono outline-none focus:border-indigo-500 focus:bg-white transition-all ${error ? 'border-red-400 text-red-600' : 'border-slate-200'}`}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Summary */}
                <div className="px-4 py-3 bg-indigo-50/60 border-t border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-600">
                        รับ <b className="text-slate-800">{validLines.length}</b> รายการ · รวม <b className="text-slate-800">{summaryQty}</b> ชิ้น
                    </span>
                    <span className="font-mono font-bold text-slate-800">{money(summaryValue)}</span>
                </div>

                <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                    <button
                        type="button"
                        onClick={requestClose}
                        disabled={isSubmitting}
                        className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2 text-sm rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all"
                    >
                        ยกเลิก
                    </button>
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2 text-sm rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                        {isSubmitting ? 'กำลังบันทึก...' : <><Check size={18} /> ยืนยันการรับของ</>}
                    </button>
                </div>
            </form>
        </BaseModal>
    );
};

export default ReceiveFormModal;
