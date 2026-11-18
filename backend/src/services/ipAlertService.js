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

  // subnet ที่ใช้งานเกือบเต็ม (online หรือจอง ≥ 90%)
  const nearFull = (await pool.request().query(`
    SELECT PARSENAME(ip_address, 4) + '.' + PARSENAME(ip_address, 3) + '.' + PARSENAME(ip_address, 2) AS subnet,
      COUNT(*) AS total,
      SUM(CASE WHEN scan_result = 'Found' OR reservation_status = 'reserved' THEN 1 ELSE 0 END) AS used
    FROM dbo.ip_management
    GROUP BY PARSENAME(ip_address, 4), PARSENAME(ip_address, 3), PARSENAME(ip_address, 2)
    HAVING SUM(CASE WHEN scan_result = 'Found' OR reservation_status = 'reserved' THEN 1 ELSE 0 END) * 100 >= 90 * COUNT(*)`)).recordset
    .map(r => ({ ...r, pct: Math.round((r.used / r.total) * 100) }));

  // IP ที่เพิ่งโผล่ online ครั้งแรกใน 3 วันล่าสุด (คอลัมน์ first_seen_active มาจาก migration; ไม่มีก็ข้าม)
  let newIps = [];
  try {
    newIps = (await pool.request().query(`
      SELECT TOP 200 ip_address, hostname, owner_name, reservation_status,
        CONVERT(varchar(19), first_seen_active, 120) AS first_seen
      FROM dbo.ip_management
      WHERE first_seen_active >= DATEADD(DAY, -3, GETDATE()) AND scan_result = 'Found'
      ORDER BY first_seen_active DESC`)).recordset;
  } catch { /* ยังไม่ได้รัน migration first_seen_active */ }

  // MAC ของ IP เปลี่ยนในรอบ 7 วัน (จากประวัติการแก้ไข)
  const macChanged = [];
  const macHist = (await pool.request().query(`
    SELECT TOP 200 ip_address, changes, changed_by, changed_at
    FROM dbo.ip_management_history
    WHERE action = 'update' AND changes LIKE '%"mac_address"%'
      AND changed_at > CONVERT(varchar(19), DATEADD(DAY, -7, GETDATE()), 120)
    ORDER BY changed_at DESC`)).recordset;
  for (const h of macHist) {
    try {
      const c = JSON.parse(h.changes).mac_address;
      // เตือนเฉพาะกรณีเปลี่ยนจาก MAC เดิมเป็นค่าใหม่ (ไม่นับการกรอกครั้งแรก)
      if (c && c.from && c.to && c.from !== c.to) macChanged.push({ ip_address: h.ip_address, from: c.from, to: c.to, changed_by: h.changed_by, changed_at: h.changed_at });
    } catch { /* ข้ามแถวที่ JSON เสีย */ }
  }

  return {
    duplicateMac, duplicateHostname, nearFull, newIps, macChanged,
    total: duplicateMac.length + duplicateHostname.length + nearFull.length + newIps.length + macChanged.length,
  };
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
    ${section('Subnet ใช้งานเกือบเต็ม (≥ 90%)', alerts.nearFull.map(s => `<tr><td style="font-family:monospace">${esc(s.subnet)}.x</td><td>ใช้ ${s.used}/${s.total} (${s.pct}%)</td></tr>`).join(''))}
    ${section('IP ใหม่ที่เพิ่งโผล่ online (3 วันล่าสุด)', alerts.newIps.map(i => `<tr><td style="font-family:monospace">${esc(i.ip_address)}</td><td>${esc(i.hostname && i.hostname !== '-' ? i.hostname : 'ไม่มีชื่อ')} · ${i.reservation_status === 'reserved' ? 'จองแล้ว' : 'ไม่ได้จอง'} · ${esc(i.first_seen)}</td></tr>`).join(''))}
    ${section('MAC ของ IP เปลี่ยน (7 วันล่าสุด)', alerts.macChanged.map(m => `<tr><td style="font-family:monospace">${esc(m.ip_address)}</td><td style="font-family:monospace">${esc(m.from)} → ${esc(m.to)} · โดย ${esc(m.changed_by)}</td></tr>`).join(''))}
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
