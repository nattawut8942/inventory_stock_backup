/**
 * auto_scan.js  — standalone scanner
 * รัน: node auto_scan.js
 * หรือ import runAllSubnets() เข้า server.js แล้วใช้ cron
 *
 * npm install node-fetch   (ถ้า Node < 18)
 */

import { exec }        from 'child_process';
import dns             from 'dns';
import { promisify }   from 'util';

const dnsReverse = promisify(dns.reverse);

// =============================================
// CONFIG
// =============================================
const API_BASE   = process.env.IP_SCAN_API || 'http://localhost:3002/ITinventory/api';
const CONCURRENCY = 50;   // ping พร้อมกันกี่ IP

// ─── Local datetime (Bangkok UTC+7) ───────────
const nowBKK = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });
// ได้ format: "2026-06-12 20:07:37"  ← SQL Server รับได้เลย

// ─── Ping ──────────────────────────────────
function pingIP(ip) {
  return new Promise(resolve => {
    const isWin = process.platform === 'win32';
    const cmd   = isWin ? `ping -n 1 -w 2000 ${ip}` : `ping -c 1 -W 2 ${ip}`;
    exec(cmd, { timeout: 5000 }, (error, stdout) => {
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
  }
  console.log();
  return results;
}

// ─── Post results to API ───────────────────
async function postResults(results) {
  const res = await fetch(`${API_BASE}/ip-scan/scan-result`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(results),
  });
  return res.json();
}

// ─── Get subnet list from API ──────────────
async function getSubnets() {
  const res  = await fetch(`${API_BASE}/ip-scan/subnets`);
  const data = await res.json();
  return data.map(s => s.subnet);
}

// ─── Main: scan all subnets ────────────────
export async function runAllSubnets() {
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

