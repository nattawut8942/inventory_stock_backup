/**
 * soundHealthCheckService.js
 * ping  = exec ping (เหมือน ipScanService.js)
 * http  = node-fetch หรือ http module
 */

import { exec }  from 'child_process';
import http      from 'http';
import https     from 'https';

// ── Ping (copy จาก ipScanService.js) ──────────────────────────
function pingIP(ip) {
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

// ── HTTP Check (ใช้ node built-in http module) ─────────────────
function httpCheck(ip, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = http.get(`http://${ip}`, { timeout }, (res) => {
      const responseTime = Date.now() - startTime;
      res.destroy(); // ไม่ต้องรอ body
      const ok = res.statusCode === 200 || res.statusCode === 401 ||
                 res.statusCode === 301 || res.statusCode === 302 ||
                 res.statusCode === 403;
      if (ok) {
        resolve({ status: 'Active', responseTime, error: null });
      } else {
        resolve({ status: 'Device Error', responseTime, error: `HTTP ${res.statusCode}` });
      }
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      resolve({ status: 'Device Error', responseTime: timeout, error: 'HTTP Timeout' });
    });

    req.on('error', (err) => {
      resolve({ status: 'Device Error', responseTime: Date.now() - startTime, error: err.message });
    });
  });
}

// ── Full Health Check ──────────────────────────────────────────
export async function checkDeviceHealth(ip) {
  console.log(`[🔍 HealthCheck] Checking ${ip}...`);

  // Step 1: Ping
  const alive = await pingIP(ip);

  if (!alive) {
    console.log(`[🔴 Offline] ${ip}`);
    return { ip, status: 'Offline', pingStatus: 'Offline', httpStatus: 'Offline', responseTime: null, error: 'Ping failed' };
  }

  console.log(`[🟡 Online] ${ip} — Ping OK`);

  // Step 2: HTTP
  const httpResult = await httpCheck(ip);
  console.log(`[${httpResult.status === 'Active' ? '🟢' : '🟡'} ${httpResult.status}] ${ip} — ${httpResult.responseTime}ms`);

  return {
    ip,
    status:       httpResult.status,
    pingStatus:   'Online',
    httpStatus:   httpResult.status,
    responseTime: httpResult.responseTime,
    error:        httpResult.error,
  };
}

export async function checkMultipleDevices(ips) {
  const results = await Promise.all(ips.map(ip => checkDeviceHealth(ip)));
  const summary = {
    total:       results.length,
    active:      results.filter(r => r.httpStatus === 'Active').length,
    online:      results.filter(r => r.pingStatus === 'Online').length,
    offline:     results.filter(r => r.pingStatus === 'Offline').length,
    deviceError: results.filter(r => r.httpStatus === 'Device Error').length,
  };
  console.log(`[📊 Summary] Active:${summary.active} Online:${summary.online} Offline:${summary.offline} Error:${summary.deviceError}`);
  return { results, summary };
}