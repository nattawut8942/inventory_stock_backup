/**
 * server.js (ของ scanner ที่ site)
 * โครงเดียวกับ server.js ของ backend: ตั้ง cron แล้วเรียก runAllSubnets()
 *
 * วิธีติดตั้งบนเครื่อง site (โฟลเดอร์เดียวกัน):
 *   server.js        ← ไฟล์นี้
 *   auto_scan.js     ← คัดลอกจาก backend/auto_scan.js
 *   package.json     ← {"type": "module"}
 *   node_modules\node-cron, node_modules\uuid  ← คัดลอกจาก backend\node_modules
 * ตั้ง env: IP_SCAN_API, IP_SCAN_API_KEY, IP_SCAN_SUBNETS แล้วรัน: node server.js
 */

import cron from 'node-cron';
import { runAllSubnets } from './auto_scan.js';

// ตารางเดียวกับ backend (06:00 และ 20:00 เวลาไทย)
cron.schedule('0 6,20 * * *', async () => {
  console.log('[Cron] IP Auto Scan starting...');
  try {
    await runAllSubnets();
  } catch (err) {
    console.error('[Cron] IP Scan failed:', err.message);
  }
}, { scheduled: true, timezone: 'Asia/Bangkok' });

console.log('[Scanner] พร้อมทำงาน — สแกนอัตโนมัติ 06:00 และ 20:00 (Asia/Bangkok) — กด Ctrl+C เพื่อหยุด');
