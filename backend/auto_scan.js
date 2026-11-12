/**
 * auto_scan.js  — standalone scanner
 * รัน: node auto_scan.js
 * หรือ import runAllSubnets() เข้า server.js แล้วใช้ cron
 *
 * npm install node-fetch   (ถ้า Node < 18)
 */

import { execFile }    from 'child_process';
import dns             from 'dns';
import { promisify }   from 'util';

const dnsReverse = promisify(dns.reverse);

// =============================================
// CONFIG
// =============================================
const API_BASE   = process.env.IP_SCAN_API || 'http://localhost:3002/ITinventory/api';
// ping พร้อมกันกี่ IP — ค่าต่ำเพื่อไม่ให้ ARP/ICMP พุ่งเป็นพืดบนเครือข่าย (ปรับด้วย env IP_SCAN_CONCURRENCY)
const CONCURRENCY = Math.max(1, Number(process.env.IP_SCAN_CONCURRENCY) || 16);
const BATCH_PAUSE_MS = Math.max(0, Number(process.env.IP_SCAN_BATCH_PAUSE_MS) ?? 200);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let scanRunning = false;   // กันการสแกนซ้อน (cron กับการกดสแกนพร้อมกัน)
// อ่าน env ตอนเรียกใช้ (ไม่ใช่ตอน import) เพราะ server.js import ไฟล์นี้
const getScanKey = () => process.env.IP_SCAN_API_KEY;   // ต้องตรงกับ server (header x-scan-key)
const OCTET       = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IP_RE       = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);
const SUBNET_RE   = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}$`);

// ─── Local datetime (Bangkok UTC+7) ───────────
const nowBKK = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });
// ได้ format: "2026-06-12 20:07:37"  ← SQL Server รับได้เลย

// ─── Ping ──────────────────────────────────
function pingIP(ip) {
  return new Promise(resolve => {
    if (!IP_RE.test(ip)) return resolve(false);
    const isWin = process.platform === 'win32';
    const args  = isWin ? ['-n', '1', '-w', '2000', ip] : ['-c', '1', '-W', '2', ip];
    execFile('ping', args, { timeout: 5000 }, (error, stdout) => {
      resolve(!error && (stdout.includes('TTL=') || stdout.includes('ttl=') || stdout.includes('1 received')));
    });
  });
}

// ─── Hostname ─────────────────────────────
async function getHostname(ip) {
  try {
    const names = await dnsReverse(ip);
    return names?.[0]?.split('.')?.[0] || null;
  } catch { return null; }
}

// ─── MAC จาก ARP table (Windows เท่านั้น) ──
// ต้อง ping ก่อนเพื่อให้ ARP cache มีรายการ; IP คนละ subnet จะไม่มีรายการ จึงไม่ได้ MAC ของ router
function getMacFromArp(ip) {
  return new Promise(resolve => {
    if (!IP_RE.test(ip) || process.platform !== 'win32') return resolve(null);
    execFile('arp', ['-a', ip], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.trim().match(/^(\S+)\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})\s+(dynamic|static)/i);
        if (m && m[1] === ip) {
          const mac = m[2].toUpperCase().replace(/-/g, ':');
          return resolve(mac === 'FF:FF:FF:FF:FF:FF' ? null : mac);
        }
      }
      resolve(null);
    });
  });
}

// ─── Scan single IP ────────────────────────
async function scanIP(ip) {
  const now      = nowBKK();
  const alive    = await pingIP(ip);
  const hostname = alive ? ((await getHostname(ip)) || 'Unknown') : '-';
  const mac      = alive ? await getMacFromArp(ip) : null;
  return { ip, status: alive ? 'Active' : 'Available', hostname, mac, last_scan: now };
}

// ─── Scan subnet ───────────────────────────
async function scanSubnet(subnet) {
  const ips     = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  const results = [];

  for (let i = 0; i < ips.length; i += CONCURRENCY) {
    const batch = await Promise.all(ips.slice(i, i + CONCURRENCY).map(scanIP));
    results.push(...batch);
    process.stdout.write(`\r  ${subnet}: ${Math.min(i + CONCURRENCY, 254)}/254`);
    if (BATCH_PAUSE_MS && i + CONCURRENCY < ips.length) await sleep(BATCH_PAUSE_MS);
  }
  console.log();
  return results;
}

// ─── Post results to API ───────────────────
async function postResults(results) {
  const res = await fetch(`${API_BASE}/ip-scan/scan-result`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-scan-key': getScanKey() || '' },
    body:    JSON.stringify(results),
  });
  return res.json();
}

// ─── Get subnet list from API ──────────────
async function getSubnets() {
  const res  = await fetch(`${API_BASE}/ip-scan/subnets`, { headers: { 'x-scan-key': getScanKey() || '' } });
  const data = await res.json();
  return data.map(s => s.subnet).filter(s => SUBNET_RE.test(s));
}

// ─── Main: scan all subnets ────────────────
export async function runAllSubnets() {
  if (!getScanKey()) {
    console.error('[IPScan] IP_SCAN_API_KEY is not set — ข้ามการสแกน');
    return;
  }
  if (scanRunning) {
    console.log('[IPScan] มีการสแกนที่ยังทำงานอยู่ — ข้ามรอบนี้');
    return;
  }
  scanRunning = true;
  try {
    await runAllSubnetsInner();
  } finally {
    scanRunning = false;
  }
}

async function runAllSubnetsInner() {
  const start   = Date.now();
  const ts      = new Date().toLocaleString('th-TH');
  console.log(`\n${'='.repeat(52)}`);
  console.log(`  IP Auto Scan — ${ts}`);
  console.log('='.repeat(52));

  const subnets = await getSubnets();
  console.log(`Subnets: ${subnets.join(', ')}\n`);

  let totalActive = 0;

  for (const subnet of subnets) {
    console.log(`[START] ${subnet}.0/24`);
    const results = await scanSubnet(subnet);
    const active  = results.filter(r => r.status === 'Active').length;
    totalActive  += active;

    const resp = await postResults(results);
    console.log(`  Active: ${active}/254 — DB: ${resp.updated ?? '?'} updated\n`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('-'.repeat(52));
  console.log(`  Done — Total Active: ${totalActive} | Time: ${elapsed}s`);
  console.log('='.repeat(52) + '\n');
}
console.log('Server time:', new Date().toString());
console.log('BKK time:', new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }));
console.log('Local time:', new Date().toLocaleString());

// ─── Run directly ──────────────────────────
// node auto_scan.js
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runAllSubnets().catch(console.error);
}

