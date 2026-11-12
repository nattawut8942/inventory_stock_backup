import React, { useMemo, useState } from 'react';
import { FileText, Check, CircleArrowDown, Minus, Plus, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import BaseModal, { ModalHeader } from './BaseModal';
import { money } from './receiveUtils';
import { formatThaiDate } from '../../utils/formatDate';

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

    // ยอดค้างรับทั้ง PO ก่อนและหลังรับครั้งนี้
    const totalRemaining = items.reduce((s, item) => s + Math.max(0, Number(item.QtyOrdered) - Number(item.QtyReceived || 0)), 0);
    const remainingAfter = Math.max(0, totalRemaining - summaryQty);
    const completesPO = validLines.length > 0 && remainingAfter === 0;
    const partialReceive = validLines.length > 0 && remainingAfter > 0;

    // ข้อความบอกว่าทำอะไรต่อก่อนยืนยันได้ (แสดงเฉพาะตอนปุ่มกดไม่ได้)
    const submitHint = isSubmitting || canSubmit ? null
        : !trimmedInvoice ? 'กรอกเลข Invoice ก่อนยืนยัน'
        : duplicateInvoice ? 'เลข Invoice ซ้ำกับที่มีอยู่แล้ว'
        : validLines.length === 0 ? 'เลือกอย่างน้อย 1 รายการที่ต้องการรับ'
        : 'แก้จำนวนที่ผิดก่อนยืนยัน';

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

    const submitReceive = () => {
        if (!canSubmit) return;
        onSubmit(po.PO_ID, trimmedInvoice, validLines.map(l => ({
            DetailID: l.item.DetailID,
            ProductID: l.item.ProductID,
            Qty: l.qty,
            BG_No: l.item.BG_No || null,
        })));
    };
    const handleSubmit = (e) => {
        e.preventDefault();
        submitReceive();
    };

    // ปุ่ม +/- ปรับจำนวนทีละ 1 (ไม่ต่ำกว่า 1 และไม่เกินค้างรับ)
    const bumpLine = (idx, delta) => {
        const remaining = remainingOf(items[idx]);
        const cur = Number(lines[idx]?.qty) || 0;
        const next = Math.min(remaining, Math.max(1, cur + delta));
        setLine(idx, { qty: String(next) });
    };

    // Enter ในช่องจำนวน: ย้ายไปช่องจำนวนถัดไปที่กรอกได้ (Ctrl/⌘+Enter ยืนยันการรับ)
    const handleQtyKeyDown = (e, idx) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const inputs = Array.from(e.currentTarget.form?.querySelectorAll('input[data-qty-input]:not([disabled])') || []);
        const pos = inputs.findIndex(el => Number(el.dataset.qtyInput) === idx);
        const next = inputs.slice(pos + 1)[0];
        if (next) next.focus();
    };

    const handleFormKeyDown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submitReceive();
        }
    };

    // จัดกลุ่มบรรทัดตาม BG No. (รักษาลำดับเดิมของรายการ)
    const groups = useMemo(() => {
        const map = new Map();
        lineInfo.forEach(l => {
            const key = l.item.BG_No || '';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(l);
        });
        return Array.from(map.entries()).map(([bg, rows]) => ({ bg, rows }));
    }, [lineInfo]);

    const requestClose = () => {
        if (isSubmitting) return;
        onRequestClose(!!trimmedInvoice);
    };

    const todayLabel = formatThaiDate(new Date().toISOString());

    const renderLine = (l) => {
        const { item, idx, remaining, selected, error, prodName, fullyReceived } = l;
        const unit = Number(item.UnitCost || 0);
        const lineValue = selected && !error ? l.qty * unit : null;
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
                            <span className="font-mono">@ {money(unit)}</span>
                        </div>
                        {lineValue !== null && (
                            <p className="text-xs font-mono font-bold text-indigo-600 mt-0.5">รวม {money(lineValue)}</p>
                        )}
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
                                className="flex items-center gap-1 text-indigo-600 hover:bg-indigo-50 px-1.5 py-1 rounded-lg transition-colors text-xs font-bold"
                                title={`รับทั้งหมด (${remaining})`}
                                aria-label={`รับทั้งหมด ${remaining}`}
                            >
                                <CircleArrowDown size={16} />
                                <span className="hidden sm:inline">ทั้งหมด</span>
                            </button>
                            <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => bumpLine(idx, -1)}
                                        disabled={!selected || isSubmitting || Number(lines[idx]?.qty) <= 1}
                                        aria-label={`ลดจำนวน ${prodName}`}
                                        className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                                    >
                                        <Minus size={16} />
                                    </button>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        max={remaining}
                                        step="1"
                                        data-qty-input={idx}
                                        aria-label={`จำนวนที่รับ ${prodName}`}
                                        value={lines[idx]?.qty ?? ''}
                                        onChange={(e) => setLine(idx, { qty: e.target.value })}
                                        onKeyDown={(e) => handleQtyKeyDown(e, idx)}
                                        disabled={!selected || isSubmitting}
                                        className={`w-16 sm:w-20 h-9 bg-slate-50 border p-2 rounded-lg text-center text-lg font-bold font-mono outline-none focus:border-indigo-500 focus:bg-white transition-all ${error ? 'border-red-400 text-red-600' : 'border-slate-200'}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => bumpLine(idx, 1)}
                                        disabled={!selected || isSubmitting || Number(lines[idx]?.qty) >= remaining}
                                        aria-label={`เพิ่มจำนวน ${prodName}`}
                                        className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400">สูงสุด {remaining}</span>
                            </div>
                        </div>
                    )}
                </div>
                {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
            </div>
        );
    };

    return (
        <BaseModal onClose={requestClose} label={`บันทึกรับของ ${po.PO_ID}`} maxWidth="max-w-3xl" closeOnEscape={closeOnEscape}>
            <ModalHeader
                icon={Package}
                eyebrow="บันทึกรับของ"
                title={po.PO_ID}
                subtitle={po.VendorName}
                onClose={requestClose}
                disabled={isSubmitting}
            />

            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="flex flex-col">
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
                        {duplicateInvoice ? (
                            <p className="mt-1.5 text-xs font-bold text-red-600">เลข Invoice นี้มีอยู่ในระบบแล้ว</p>
                        ) : (
                            <p className="mt-1.5 text-[11px] text-slate-400">วันที่รับ: {todayLabel} (ตามเวลาระบบ)</p>
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

                    <div className="space-y-4">
                        {groups.map(group => {
                            const groupRemaining = group.rows.reduce((s, l) => s + l.remaining, 0);
                            return (
                                <section key={group.bg || 'none'} className="space-y-2">
                                    {groups.length > 1 && (
                                        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                                            <span className="font-mono font-bold text-indigo-600">
                                                {group.bg ? `BG: ${group.bg}` : 'ไม่ระบุ BG'}
                                            </span>
                                            <span>{group.rows.length} รายการ · ค้าง {groupRemaining} ชิ้น</span>
                                        </div>
                                    )}
                                    {group.rows.map(renderLine)}
                                </section>
                            );
                        })}
                    </div>
                </div>

                {/* Summary */}
                <div className={`px-4 py-3 border-t flex flex-wrap items-center justify-between gap-2 text-sm transition-colors ${
                    completesPO ? 'bg-emerald-50 border-emerald-100'
                    : partialReceive ? 'bg-amber-50 border-amber-100'
                    : 'bg-indigo-50/60 border-indigo-100'}`}>
                    <span className="text-slate-600 flex items-center gap-1.5 flex-wrap">
                        {completesPO && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
                        {partialReceive && <AlertTriangle size={16} className="text-amber-600 shrink-0" />}
                        รับ <b className="text-slate-800">{validLines.length}</b> รายการ · รวม <b className="text-slate-800">{summaryQty}</b> ชิ้น
                        {completesPO ? (
                            <span className="font-bold text-emerald-700">· รับครบ PO นี้</span>
                        ) : partialReceive ? (
                            <span className="font-bold text-amber-700">· รับไม่ครบ เหลือค้าง {remainingAfter} ชิ้น</span>
                        ) : null}
                    </span>
                    <span className="font-mono font-bold text-slate-800">{money(summaryValue)}</span>
                </div>

                <div className="p-4 bg-white border-t border-slate-100 space-y-2">
                    {submitHint && (
                        <p className="text-xs font-bold text-slate-500 text-center">{submitHint}</p>
                    )}
                    <div className="flex gap-3">
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
                            title="Ctrl+Enter"
                            className="flex-[2] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-2 text-sm rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                        >
                            {isSubmitting
                                ? 'กำลังบันทึก...'
                                : validLines.length > 0
                                    ? <><Check size={18} /> ยืนยันรับ {validLines.length} รายการ ({summaryQty} ชิ้น)</>
                                    : <><Check size={18} /> ยืนยันการรับของ</>}
                        </button>
                    </div>
                </div>
            </form>
        </BaseModal>
    );
};

export default ReceiveFormModal;
