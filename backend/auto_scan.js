/**
 * auto_scan.js  — standalone scanner
 * รัน: node auto_scan.js
 * หรือ import runAllSubnets() เข้า server.js แล้วใช้ cron
 *
 * รันได้ตั้งแต่ Node 14 (ไม่ต้อง npm install — ใช้โมดูลในตัวของ Node เท่านั้น)
 * ถ้าคัดลอกไปเครื่องอื่นให้คัดลอก package.json ที่มี "type": "module" ไปด้วย
 */

import { execFile }    from 'child_process';
import dns             from 'dns';
import http            from 'http';
import https           from 'https';
import path            from 'path';
import { fileURLToPath } from 'url';
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

// ─── Scan single IP ────────────────────────
async function scanIP(ip) {
  const now      = nowBKK();
  const alive    = await pingIP(ip);
  const hostname = alive ? ((await getHostname(ip)) || 'Unknown') : '-';
  return { ip, status: alive ? 'Active' : 'Available', hostname, last_scan: now };
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

// ─── HTTP helper (ใช้ http/https ของ Node โดยตรง — รันได้ตั้งแต่ Node 14, ไม่ต้องใช้ global fetch) ───
function httpRequest(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u    = new URL(urlStr);
    const lib  = u.protocol === 'https:' ? https : http;
    const data = body !== undefined ? Buffer.from(body, 'utf8') : null;
    const h    = { ...headers };
    if (data) h['Content-Length'] = data.length;
    const req = lib.request({
      method,
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      headers:  h,
      timeout:  30000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* ไม่ใช่ JSON */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Post results to API ───────────────────
async function postResults(results) {
  const res = await httpRequest('POST', `${API_BASE}/ip-scan/scan-result`,
    { 'Content-Type': 'application/json', 'x-scan-key': getScanKey() || '' },
    JSON.stringify(results));
  if (res.status !== 200) throw new Error(`scan-result HTTP ${res.status}: ${res.json?.error || ''}`);
  return res.json;
}

// ─── Get subnet list from API ──────────────
async function getSubnets() {
  const res = await httpRequest('GET', `${API_BASE}/ip-scan/subnets`, { 'x-scan-key': getScanKey() || '' });
  if (res.status !== 200 || !Array.isArray(res.json))
    throw new Error(`subnets HTTP ${res.status}: ตรวจ IP_SCAN_API และ IP_SCAN_API_KEY`);
  const data = res.json;
  // IP_SCAN_SUBNETS (คั่นด้วยคอมมา) จำกัดให้สแกนเฉพาะ subnet ที่ต้องการ
  // เช่น "10.194.40,10.194.41" — ไม่ตั้งค่า = สแกนทุก subnet ตามเดิม
  const only = (process.env.IP_SCAN_SUBNETS || '').split(',').map(s => s.trim()).filter(Boolean);
  return data.map(s => s.subnet)
    .filter(s => SUBNET_RE.test(s))
    .filter(s => only.length === 0 || only.includes(s));
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
// node auto_scan.js   → สแกนครั้งเดียวแล้วจบ
// (การตั้งเวลาอยู่ที่ server.js ของ scanner — ดู backend/site-scanner/server.js)
// (ใช้ fileURLToPath — URL.pathname บน Windows ได้ "/D:/..." ซึ่งไม่ตรงกับ argv จึงไม่เคยรันเอง)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAllSubnets().catch(console.error);
}
