/**
 * ipScanService.js
 * Core scan logic — ping + hostname lookup (DNS + nbtstat fallback)
 */

import { exec } from 'child_process';
import dns      from 'dns';
import { promisify } from 'util';

const dnsReverse = promisify(dns.reverse);

// ─── Ping single IP ───────────────────────────────────────────────────────────
export function pingIP(ip) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const cmd   = isWin ? `ping -n 1 -w 2000 ${ip}` : `ping -c 1 -W 2 ${ip}`;
    exec(cmd, { timeout: 5000 }, (error, stdout) => {
      resolve(!error && (
        stdout.includes('TTL=') || stdout.includes('ttl=') ||
        stdout.includes('1 received') || stdout.includes('1 packets received')
      ));
    });
  });
}

// ─── Hostname lookup (DNS → nbtstat fallback) ─────────────────────────────────
export async function getHostname(ip) {
  // 1. DNS Reverse lookup
  try {
    const names = await dnsReverse(ip);
    if (names?.[0]) return names[0].split('.')[0];
  } catch {}

  // 2. Fallback: nbtstat -A (Windows only)
  if (process.platform === 'win32') {
    try {
      const name = await new Promise((resolve) => {
        exec(`nbtstat -A ${ip}`, { timeout: 3000 }, (err, stdout) => {
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
export async function scanSubnet(subnet, concurrency = 50, onProgress = null) {
  const ips     = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  const results = [];
  let   done    = 0;

  for (let i = 0; i < ips.length; i += concurrency) {
    const chunk = ips.slice(i, i + concurrency);
    const batch = await Promise.all(chunk.map(scanIP));
    results.push(...batch);
    done += chunk.length;
    if (onProgress) onProgress(done, ips.length);
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