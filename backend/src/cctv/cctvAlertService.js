import nodemailer from 'nodemailer';

// แจ้งเตือนกล้องที่ "เพิ่งเปลี่ยนจาก online เป็น offline" — ส่งเป็นอีเมลฉบับเดียวต่อรอบ ping
// ตั้งค่าที่ .env:
//   CCTV_ALERT_TO   = ผู้รับ คั่นด้วย , (ถ้าไม่ตั้ง จะไม่ส่งอีเมลเลย)
//   CCTV_ALERT_FROM = ผู้ส่ง (ไม่ตั้งจะใช้ค่าเริ่มต้น)
const SMTP_HOST = 'smtp.dci.daikin.co.jp';
const SMTP_PORT = 25;
const DEFAULT_FROM = 'cctv-monitor@dci.daikin.co.jp';

const escapeHtml = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function notifyNewlyOffline(cams) {
    const to = (process.env.CCTV_ALERT_TO || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!cams.length || !to.length) return { sent: false, reason: to.length ? 'no-changes' : 'CCTV_ALERT_TO not set' };

    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: false,
        tls: { rejectUnauthorized: false },
    });

    const rows = cams.map(c =>
        `<tr><td style="padding:4px 8px">${escapeHtml(c.name)}</td><td style="padding:4px 8px">${escapeHtml(c.ip_address)}</td></tr>`
    ).join('');

    await transporter.sendMail({
        from: process.env.CCTV_ALERT_FROM || DEFAULT_FROM,
        to,
        subject: `[CCTV] Offline ใหม่ ${cams.length} ตัว`,
        html: `<p>กล้องต่อไปนี้เพิ่งตอบสนองไม่ได้ (ก่อนหน้านี้ online):</p>
               <table border="1" style="border-collapse:collapse">
                 <tr><th style="padding:4px 8px">ชื่อกล้อง</th><th style="padding:4px 8px">IP</th></tr>${rows}
               </table>
               <p style="color:#6b7280;font-size:12px">ส่งอัตโนมัติจากระบบ IT Inventory</p>`,
    });
    return { sent: true, count: cams.length };
}
