/**
 * ipAlertService.js
 * ตรวจ IP ที่น่าสงสัย (MAC ซ้ำ, hostname ซ้ำในเครื่องที่ online) และส่งสรุปทางอีเมล
 * - ไม่มีการส่งอีเมลถ้าไม่ได้ตั้ง IP_ALERT_RECIPIENTS
 * - ส่งเฉพาะเมื่อมีรายการแจ้งเตือน (กันอีเมลรบกวนทุกวัน)
 */

import nodemailer from 'nodemailer';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// จัดกลุ่ม rows ตาม key (คืน array ของกลุ่มที่มีมากกว่า 1 แถว)
const groupBy = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()].map(([key, items]) => ({ key, items }));
};

export async function getIpAlerts(pool) {
  // MAC ซ้ำ: MAC เดียวกันอยู่บนมากกว่า 1 IP
  const macRows = (await pool.request().query(`
    SELECT ip_address, mac_address, hostname, scan_result, owner_name, reserveby
    FROM dbo.ip_management
    WHERE mac_address IS NOT NULL AND mac_address <> ''
      AND mac_address IN (
        SELECT mac_address FROM dbo.ip_management
        WHERE mac_address IS NOT NULL AND mac_address <> ''
        GROUP BY mac_address HAVING COUNT(*) > 1)
    ORDER BY mac_address, ip_address`)).recordset;

  // hostname ซ้ำในเครื่องที่ online ตอนนี้ (ชื่อเดียวกันตอบ ping บน IP มากกว่า 1)
  const hostRows = (await pool.request().query(`
    SELECT ip_address, mac_address, hostname, scan_result, owner_name, reserveby
    FROM dbo.ip_management
    WHERE scan_result = 'Found' AND hostname IS NOT NULL AND hostname NOT IN ('', '-', 'Unknown')
      AND hostname IN (
        SELECT hostname FROM dbo.ip_management
        WHERE scan_result = 'Found' AND hostname IS NOT NULL AND hostname NOT IN ('', '-', 'Unknown')
        GROUP BY hostname HAVING COUNT(*) > 1)
    ORDER BY hostname, ip_address`)).recordset;

  const duplicateMac = groupBy(macRows, r => r.mac_address).map(g => ({
    mac: g.key,
    ips: g.items.map(({ ip_address, hostname, scan_result, owner_name, reserveby }) => ({ ip_address, hostname, scan_result, owner_name, reserveby })),
  }));
  const duplicateHostname = groupBy(hostRows, r => r.hostname).map(g => ({
    hostname: g.key,
    ips: g.items.map(({ ip_address, mac_address, owner_name, reserveby }) => ({ ip_address, mac_address, owner_name, reserveby })),
  }));

  return { duplicateMac, duplicateHostname, total: duplicateMac.length + duplicateHostname.length };
}

const renderHtml = (alerts) => {
  const macRows = alerts.duplicateMac.map(g =>
    `<tr><td style="font-family:monospace">${esc(g.mac)}</td><td>${g.ips.map(i => `${esc(i.ip_address)} (${esc(i.hostname || '-')})`).join('<br>')}</td></tr>`).join('');
  const hostRows = alerts.duplicateHostname.map(g =>
    `<tr><td style="font-family:monospace">${esc(g.hostname)}</td><td>${g.ips.map(i => esc(i.ip_address)).join('<br>')}</td></tr>`).join('');
  const section = (title, body) => body
    ? `<h3 style="margin:18px 0 6px">${title}</h3><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px"><tr style="background:#f1f5f9"><th align="left">รายการ</th><th align="left">IP</th></tr>${body}</table>`
    : '';
  return `<div style="font-family:Tahoma,Arial,sans-serif;color:#1e293b">
    <h2 style="margin:0">แจ้งเตือน IP Management</h2>
    <p style="color:#64748b;font-size:13px">พบ ${alerts.total} รายการที่ควรตรวจสอบ</p>
    ${section('MAC ซ้ำบนหลาย IP', macRows)}
    ${section('ชื่อเครื่องซ้ำ (online)', hostRows)}
  </div>`;
};

// ส่งอีเมลสรุป — คืน { sent, reason }
export async function sendIpAlertSummary(pool) {
  const recipients = (process.env.IP_ALERT_RECIPIENTS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!recipients.length) return { sent: false, reason: 'IP_ALERT_RECIPIENTS ไม่ได้ตั้งค่า' };
  const alerts = await getIpAlerts(pool);
  if (!alerts.total) return { sent: false, reason: 'ไม่มีรายการแจ้งเตือน' };

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.dci.daikin.co.jp',
    port: Number(process.env.SMTP_PORT || 25),
    secure: false,
    ignoreTLS: true,
    tls: { rejectUnauthorized: false },
  });
  await transporter.sendMail({
    from: '"IT INVENTORY" <it-inventory@dci.daikin.co.jp>',
    to: recipients.join(', '),
    subject: `=?UTF-8?B?${Buffer.from(`⚠ IP Alert — ${alerts.total} รายการ`).toString('base64')}?=`,
    html: renderHtml(alerts),
  });
  return { sent: true, total: alerts.total };
}
