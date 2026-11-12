import React from 'react';
import { formatThaiDate } from '../../utils/formatDate';

const BKK = 'Asia/Bangkok';

// วันที่แบบ YYYY-MM-DD ตามเวลาไทย (ใช้เทียบวันเสมอ เพื่อไม่ให้คลาดเคลื่อนเพราะ UTC)
export const toDateKey = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: BKK });
};
export const todayKey = () => toDateKey(new Date());

// จำนวนวันระหว่าง key สองค่า (a - b)
export const dayDiff = (a, b) => {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
};

export const money = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isOpenStatus = (s) => s === 'Open' || s === 'Pending';

// จำนวนวันที่เลยกำหนด (0 = ยังไม่เลย)
export const getOverdue = (po, today) => {
    if (!po?.DueDate || po.Status === 'Completed') return 0;
    const due = toDateKey(po.DueDate);
    if (!due || due >= today) return 0;
    return dayDiff(today, due);
};

export const poProgress = (po) => {
    const items = Array.isArray(po?.Items) ? po.Items : [];
    const ordered = items.reduce((s, it) => s + Number(it.QtyOrdered || 0), 0);
    const received = items.reduce((s, it) => s + Number(it.QtyReceived || 0), 0);
    const value = items.reduce((s, it) => s + Number(it.QtyOrdered || 0) * Number(it.UnitCost || 0), 0);
    const pct = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
    return { itemCount: items.length, ordered, received, pct, value };
};

// ทำเบอร์โทรในข้อความให้กดโทรได้
export const linkifyPhones = (text) =>
    String(text).split(/(\+?\d[\d\- ]{6,}\d)/).map((part, i) =>
        i % 2 === 1
            ? <a key={i} href={`tel:${part.replace(/[^\d+]/g, '')}`} className="underline font-bold">{part}</a>
            : <React.Fragment key={i}>{part}</React.Fragment>
    );

export const getStatusColor = (status) => {
    switch (status) {
        case 'Completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        case 'Partial': return 'bg-amber-100 text-amber-700 border-amber-200';
        default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
};

export const statusText = (s) => (s === 'Open' || s === 'Pending' ? 'Pending' : s);

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * พิมพ์ใบรับของ (เปิดหน้าต่างใหม่แล้วสั่ง print)
 * คืนค่า false ถ้าเบราว์เซอร์บล็อกหน้าต่างใหม่
 */
export const printReceipt = ({ invoice, rows, totalQty, totalValue, vendor, contact }) => {
    const w = window.open('', '_blank', 'width=820,height=960');
    if (!w) return false;

    const cancelled = invoice.Status === 'Cancelled';
    const lineRows = rows.map((r, i) => `
        <tr>
            <td class="c">${i + 1}</td>
            <td>${escHtml(r.name)}<div class="sub">${escHtml(r.t.ProductID)}${r.t.BG_No ? ' · BG: ' + escHtml(r.t.BG_No) : ''}</div></td>
            <td class="r">${escHtml(r.qty)}</td>
            <td class="r">${r.value === null ? '-' : escHtml(money(r.value))}</td>
        </tr>`).join('');

    const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>ใบรับของ ${escHtml(invoice.InvoiceNo)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: 'Sarabun', 'Tahoma', sans-serif; color: #0f172a; font-size: 13px; position: relative; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .muted { color: #64748b; font-size: 12px; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 8px; margin-bottom: 14px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 14px; }
  .meta div b { display: inline-block; width: 110px; color: #475569; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 12px; }
  .c { text-align: center; width: 36px; }
  .r { text-align: right; white-space: nowrap; }
  .sub { color: #64748b; font-size: 11px; font-family: monospace; }
  tfoot td { font-weight: bold; background: #f8fafc; }
  .sign { display: flex; justify-content: space-between; margin-top: 48px; text-align: center; }
  .sign div { width: 40%; }
  .sign .line { border-bottom: 1px solid #334155; height: 36px; margin-bottom: 4px; }
  .stamp { position: absolute; top: 260px; right: 40px; transform: rotate(-15deg); border: 4px solid #dc2626; color: #dc2626; font-size: 28px; font-weight: bold; padding: 6px 16px; opacity: .7; }
  .contact { margin-top: 10px; font-size: 12px; color: #334155; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>ใบรับของเข้าคลัง (Goods Receipt)</h1>
      <div class="muted">IT Inventory Management System</div>
    </div>
    <div style="text-align:right">
      <div><b>Invoice:</b> ${escHtml(invoice.InvoiceNo)}</div>
      <div><b>วันที่รับ:</b> ${escHtml(formatThaiDate(invoice.ReceiveDate))}</div>
    </div>
  </div>

  <div class="meta">
    <div><b>PO Ref.</b>${escHtml(invoice.PO_ID)}</div>
    <div><b>Budget No.</b>${escHtml(invoice.BudgetNo || '-')}</div>
    <div><b>Vendor</b>${escHtml(vendor || invoice.VendorName || '-')}</div>
    <div><b>ผู้รับของ</b>${escHtml((invoice.ReceivedBy || '-').toUpperCase())}</div>
  </div>

  <table>
    <thead>
      <tr><th class="c">#</th><th>รายการ</th><th class="r">จำนวน</th><th class="r">มูลค่า</th></tr>
    </thead>
    <tbody>${lineRows || '<tr><td colspan="4" class="c">ไม่พบรายการสินค้า</td></tr>'}</tbody>
    <tfoot>
      <tr><td colspan="2" class="r">รวม</td><td class="r">${escHtml(totalQty)}</td><td class="r">${escHtml(money(totalValue))}</td></tr>
    </tfoot>
  </table>

  ${contact ? `<div class="contact"><b>ติดต่อผู้ขาย:</b> ${escHtml(contact)}</div>` : ''}

  <div class="sign">
    <div><div class="line"></div>ผู้รับของ</div>
    <div><div class="line"></div>ผู้ตรวจรับ</div>
  </div>

  ${cancelled ? '<div class="stamp">ยกเลิกแล้ว</div>' : ''}
</body>
</html>`;

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    // รอให้ฟอนต์/เลย์เอาต์โหลดก่อนสั่งพิมพ์
    setTimeout(() => { try { w.print(); } catch { /* ผู้ใช้อาจปิดหน้าต่างก่อน */ } }, 300);
    return true;
};
