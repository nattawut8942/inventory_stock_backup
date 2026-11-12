/**
 * ipScanService.js
 * Core scan logic — ping + hostname lookup (DNS + nbtstat fallback)
 */

import { execFile } from 'child_process';
import dns      from 'dns';
import { promisify } from 'util';

const dnsReverse = promisify(dns.reverse);

// ─── Input validation ─────────────────────────────────────────────────────────
// subnet = "x.y.z" (แต่ละ octet 0–255), ip = "x.y.z.w"
const OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const SUBNET_RE = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}$`);
const IP_RE = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);

export const isValidSubnet = (s) => typeof s === 'string' && SUBNET_RE.test(s);
export const isValidIP = (s) => typeof s === 'string' && IP_RE.test(s);

// ─── Ping single IP ───────────────────────────────────────────────────────────
// ใช้ execFile (ส่ง argument เป็น array) ไม่ผ่าน shell จึงไม่มี command injection
export function pingIP(ip) {
  return new Promise((resolve) => {
    if (!isValidIP(ip)) return resolve(false);
    const isWin = process.platform === 'win32';
    const args  = isWin ? ['-n', '1', '-w', '2000', ip] : ['-c', '1', '-W', '2', ip];
    execFile('ping', args, { timeout: 5000 }, (error, stdout) => {
      resolve(!error && (
        stdout.includes('TTL=') || stdout.includes('ttl=') ||
        stdout.includes('1 received') || stdout.includes('1 packets received')
      ));
    });
  });
}

// ─── Hostname lookup (DNS → nbtstat fallback) ─────────────────────────────────
export async function getHostname(ip) {
  if (!isValidIP(ip)) return null;
  // 1. DNS Reverse lookup
  try {
    const names = await dnsReverse(ip);
    if (names?.[0]) return names[0].split('.')[0];
  } catch {}

  // 2. Fallback: nbtstat -A (Windows only)
  if (process.platform === 'win32') {
    try {
      const name = await new Promise((resolve) => {
        execFile('nbtstat', ['-A', ip], { timeout: 3000 }, (err, stdout) => {
          // nbtstat output: "  COMPUTERNAME      <00>  UNIQUE"
          const match = stdout?.match(/^\s{1,}(\S+)\s+<00>\s+UNIQUE/m);
          resolve(match?.[1]?.trim() || null);
        });
      });
      if (name) return name;
    } catch {}
  }

  return null;
}

// ─── Scan single IP ───────────────────────────────────────────────────────────
export async function scanIP(ip) {
  const alive    = await pingIP(ip);
  const hostname = alive ? (await getHostname(ip) || 'Unknown') : '-';
  return {
    ip,
    status:   alive ? 'Active' : 'Available',
    hostname,
    last_scan: null, // ไม่ส่งเวลา — ใช้ GETDATE() ใน SQL แทน
  };
}

// ─── Scan entire subnet (1–254) with concurrency limit ────────────────────────
// ค่าเริ่มต้นต่ำ (16) และหน่วงสั้นๆ ระหว่างชุด เพื่อไม่ให้ ARP/ICMP พุ่งพร้อมกันเป็นพืด
// ปรับได้ด้วย env IP_SCAN_CONCURRENCY และ IP_SCAN_BATCH_PAUSE_MS
const SCAN_CONCURRENCY = Math.max(1, Number(process.env.IP_SCAN_CONCURRENCY) || 16);
const BATCH_PAUSE_MS   = Math.max(0, Number(process.env.IP_SCAN_BATCH_PAUSE_MS) ?? 200);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function scanSubnet(subnet, concurrency = SCAN_CONCURRENCY, onProgress = null) {
  if (!isValidSubnet(subnet)) throw new Error(`invalid subnet: ${subnet}`);
  const ips     = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  const results = [];
  let   done    = 0;

  for (let i = 0; i < ips.length; i += concurrency) {
    const chunk = ips.slice(i, i + concurrency);
    const batch = await Promise.all(chunk.map(scanIP));
    results.push(...batch);
    done += chunk.length;
    if (onProgress) onProgress(done, ips.length);
    if (BATCH_PAUSE_MS && i + concurrency < ips.length) await sleep(BATCH_PAUSE_MS);
  }

  return results;
}

// ─── Get subnet list from DB ──────────────────────────────────────────────────
export async function getSubnets(pool) {
  const result = await pool.request().query(`
    SELECT DISTINCT
      PARSENAME(ip_address, 4) + '.' +
      PARSENAME(ip_address, 3) + '.' +
      PARSENAME(ip_address, 2) AS subnet
    FROM dbo.ip_management
    ORDER BY subnet
  `);
  return result.recordset.map(r => r.subnet);
}