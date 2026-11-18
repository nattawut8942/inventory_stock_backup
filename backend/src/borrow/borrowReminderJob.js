import nodemailer from 'nodemailer';
import { getPool } from '../config/db.js';

// แจ้งเตือนรายการยืมที่เกินกำหนด/ใกล้ครบกำหนด (พรุ่งนี้) ไปยัง BORROW_ALERT_TO
// ตั้งค่า .env: BORROW_ALERT_TO=ผู้รับ1,ผู้รับ2   BORROW_ALERT_FROM=ผู้ส่ง (ไม่ตั้งจะใช้ค่าเริ่มต้น)
// ตั้ง BORROW_REMINDER_ENABLED=true ถึงจะเปิดให้ส่งอัตโนมัติทุกวันจันทร์-ศุกร์ 08:00 (ปิดไว้เป็นค่าเริ่มต้น)
const SMTP_HOST = 'smtp.dci.daikin.co.jp';
const SMTP_PORT = 25;
const DEFAULT_FROM = 'it-borrow@dci.daikin.co.jp';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (d) => (d ? new Date(d).toLocaleDateString('th-TH') : '-');

export async function runBorrowReminders() {
    const to = (process.env.BORROW_ALERT_TO || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!to.length) return { sent: false, reason: 'BORROW_ALERT_TO not set' };

    const r = await getPool().request().query(`
        SELECT brID, brname, brfixasset, brEmpname, brEmpDept, EndDate, brStatus,
               DATEDIFF(day, EndDate, CAST(GETDATE() AS DATE)) AS DaysLate
        FROM dbo.IT_Borrowings
        WHERE brStatus IN ('borrowed', 'repairing') AND EndDate <= DATEADD(day, 1, CAST(GETDATE() AS DATE))
        ORDER BY EndDate`);
    const items = r.recordset;
    if (!items.length) return { sent: false, reason: 'no-items', count: 0 };

    const overdue = items.filter(i => i.DaysLate > 0).length;
    const dueSoon = items.length - overdue;
    const pill = (i) => i.DaysLate > 0
        ? `<span style="display:inline-block;background:#fff1f2;color:#e11d48;border:1px solid #fecdd3;border-radius:999px;padding:3px 10px;font-size:15px;font-weight:bold;white-space:nowrap">เกิน ${i.DaysLate} วัน</span>`
        : `<span style="display:inline-block;background:#fffbeb;color:#b45309;border:1px solid #fde68a;border-radius:999px;padding:3px 10px;font-size:15px;font-weight:bold;white-space:nowrap">${i.DaysLate === 0 ? 'ครบวันนี้' : 'ครบพรุ่งนี้'}</span>`;
    const rows = items.map((i, idx) => `<tr style="background:${idx % 2 ? '#f8fafc' : '#ffffff'}">
        <td style="padding:16px 16px;border-bottom:1px solid #e2e8f0">
          <div style="font-weight:bold;color:#0f172a;font-size:17px">${esc(i.brname)}</div>
          <div style="color:#94a3b8;font-size:15px;margin-top:2px">${esc(i.brfixasset || '—')}</div>
        </td>
        <td style="padding:16px 16px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:16px">${esc(i.brEmpname)}<div style="color:#94a3b8;font-size:15px">แผนก ${esc(i.brEmpDept || '-')}</div></td>
        <td style="padding:16px 16px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:16px;white-space:nowrap">${fmt(i.EndDate)}</td>
        <td style="padding:16px 16px;border-bottom:1px solid #e2e8f0;text-align:right">${pill(i)}</td>
    </tr>`).join('');
    const stat = (n, label, color, bg) => `<td width="50%" style="padding:0 6px"><table role="presentation" width="100%" style="border-collapse:collapse"><tr><td bgcolor="${bg}" style="background-color:${bg};border-radius:12px;padding:18px 20px"><span style="font-size:40px;font-weight:800;color:${color};line-height:1.1">${n}</span><br><span style="font-size:15px;color:#64748b">${label}</span></td></tr></table></td>`;
    const html = `<div style="background:#f1f5f9;padding:24px 12px;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
  <table role="presentation" width="640" align="center" style="max-width:640px;width:100%;border-collapse:collapse;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.12)">
    <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);background-color:#4f46e5;padding:24px 28px">
      <div style="color:#c7d2fe;font-size:15px;letter-spacing:1px;font-weight:bold">IT BORROWING SYSTEM</div>
      <div style="color:#ffffff;font-size:30px;font-weight:800;margin-top:4px">แจ้งเตือนรายการยืมค้างคืน</div>
      <div style="color:#e0e7ff;font-size:16px;margin-top:4px">${new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</div>
    </td></tr>
    <tr><td style="padding:22px 22px 6px">
      <table role="presentation" width="100%" style="border-collapse:collapse"><tr>
        ${stat(overdue, 'เกินกำหนดแล้ว', '#e11d48', '#fff1f2')}
        ${stat(dueSoon, 'ครบกำหนดภายในพรุ่งนี้', '#b45309', '#fffbeb')}
      </tr></table>
    </td></tr>
    <tr><td style="padding:14px 28px 4px;color:#475569;font-size:17px">กรุณาติดตามรับคืนอุปกรณ์ตามรายการด้านล่าง</td></tr>
    <tr><td style="padding:8px 22px 22px">
      <table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px">
        <tr style="background:#f1f5f9">
          <th align="left" style="padding:12px 16px;font-size:13px;color:#64748b;letter-spacing:.5px">อุปกรณ์</th>
          <th align="left" style="padding:12px 16px;font-size:13px;color:#64748b;letter-spacing:.5px">ผู้ยืม</th>
          <th align="left" style="padding:12px 16px;font-size:13px;color:#64748b;letter-spacing:.5px">กำหนดคืน</th>
          <th align="right" style="padding:12px 16px;font-size:13px;color:#64748b;letter-spacing:.5px">สถานะ</th>
        </tr>${rows}
      </table>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:14px 28px;color:#94a3b8;font-size:15px;border-top:1px solid #e2e8f0">ส่งอัตโนมัติจากระบบ IT Inventory · กรุณาอย่าตอบกลับอีเมลนี้</td></tr>
  </table>
</div>`;

    const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: false, ignoreTLS: true, tls: { rejectUnauthorized: false } });
    await transporter.sendMail({
        from: process.env.BORROW_ALERT_FROM || DEFAULT_FROM,
        to,
        subject: `[ITBorrow] รายการยืมค้าง ${items.length} รายการ (เกินกำหนด ${overdue})`,
        html,
    });
    return { sent: true, count: items.length, overdue };
}

// รันด้วยมือจากหน้าเว็บ (ต้องมีสิทธิ์ borrowings:edit)
export async function runBorrowRemindersRoute(req, res) {
    try {
        res.json(await runBorrowReminders());
    } catch (err) {
        console.error('[Borrow reminder] error:', err.message);
        res.status(500).json({ error: 'ส่งการแจ้งเตือนไม่สำเร็จ' });
    }
}
