/**
 * ipReportController.js
 * รายงาน / คุณภาพข้อมูล / ค้นหา IP ว่าง ของ IP Management (อ่านอย่างเดียว)
 */

import { getPool, sql } from '../config/db.js';
import { isValidSubnet } from '../services/ipScanService.js';

const SUBNET_SQL = "PARSENAME(ip_address, 4) + '.' + PARSENAME(ip_address, 3) + '.' + PARSENAME(ip_address, 2)";
const ONLINE = "scan_result = 'Found'";
const subnetKey = (s) => s.split('.').map(n => String(n).padStart(3, '0')).join('.');
const clamp = (v, lo, hi, d) => Math.min(Math.max(parseInt(v, 10) || d, lo), hi);

// ─── GET /api/ip-scan/report?days=30&staleDays=30 ─────────────────────────────
export const getIPReport = async (req, res) => {
  const days = clamp(req.query.days, 7, 90, 30);
  const staleDays = clamp(req.query.staleDays, 1, 365, 30);
  try {
    const pool = getPool();

    const subnetRows = (await pool.request().query(`
      SELECT ${SUBNET_SQL} AS subnet,
        COUNT(*) AS total,
        SUM(CASE WHEN ${ONLINE} THEN 1 ELSE 0 END) AS online,
        SUM(CASE WHEN reservation_status = 'reserved' THEN 1 ELSE 0 END) AS reserved,
        SUM(CASE WHEN ${ONLINE} OR reservation_status = 'reserved' THEN 1 ELSE 0 END) AS used,
        SUM(CASE WHEN ${ONLINE} AND ISNULL(reservation_status, '') <> 'reserved' THEN 1 ELSE 0 END) AS onlineUnreserved,
        SUM(CASE WHEN reservation_status = 'reserved' AND NOT (${ONLINE})
                  AND (last_seen_active IS NULL OR DATEDIFF(DAY, last_seen_active, GETDATE()) > ${staleDays})
                 THEN 1 ELSE 0 END) AS staleReserved
      FROM dbo.ip_management
      GROUP BY PARSENAME(ip_address, 4), PARSENAME(ip_address, 3), PARSENAME(ip_address, 2)`)).recordset;
    const bySubnet = subnetRows
      .map(r => ({ ...r, free: r.total - r.used, usedPct: r.total ? Math.round((r.used / r.total) * 100) : 0 }))
      .sort((a, b) => subnetKey(a.subnet).localeCompare(subnetKey(b.subnet)));

    const sum = (k) => bySubnet.reduce((s, r) => s + (r[k] || 0), 0);
    const kpi = {
      subnets: bySubnet.length,
      total: sum('total'), online: sum('online'), reserved: sum('reserved'), used: sum('used'),
      onlineUnreserved: sum('onlineUnreserved'), staleReserved: sum('staleReserved'),
      nearFull: bySubnet.filter(s => s.usedPct >= 90).length,
      staleDays,
    };
    kpi.usedPct = kpi.total ? Math.round((kpi.used / kpi.total) * 100) : 0;

    // แนวโน้มรายวัน: เอาสแนปชอตล่าสุดของแต่ละ subnet ในแต่ละวันมารวมกัน
    const snaps = (await pool.request().query(`
      SELECT subnet, taken_at, total, online, reserved, inactive
      FROM dbo.ip_subnet_snapshot
      WHERE taken_at > CONVERT(varchar(19), DATEADD(DAY, -${days}, GETDATE()), 120)
      ORDER BY taken_at`)).recordset;
    const dayMap = new Map(); // day -> Map(subnet -> row)
    for (const s of snaps) {
      const day = String(s.taken_at).slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, new Map());
      dayMap.get(day).set(s.subnet, s); // ตัวหลังทับตัวก่อน = ล่าสุดของวัน
    }
    const trend = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, m]) => {
      let online = 0, reserved = 0, inactive = 0;
      for (const r of m.values()) { online += r.online || 0; reserved += r.reserved || 0; inactive += r.inactive || 0; }
      return { day, online, reserved, inactive, subnets: m.size };
    });

    // กิจกรรมการจอง/ปล่อย/แก้ไข รายวัน
    const hist = (await pool.request().query(`
      SELECT LEFT(changed_at, 10) AS day, action, COUNT(*) AS n
      FROM dbo.ip_management_history
      WHERE changed_at > CONVERT(varchar(19), DATEADD(DAY, -${days}, GETDATE()), 120)
      GROUP BY LEFT(changed_at, 10), action`)).recordset;
    const actMap = new Map();
    for (const h of hist) {
      if (!actMap.has(h.day)) actMap.set(h.day, { day: h.day, reserve: 0, release: 0, update: 0 });
      const row = actMap.get(h.day);
      row[h.action] = (row[h.action] || 0) + h.n;
    }
    const activity = [...actMap.values()].sort((a, b) => a.day.localeCompare(b.day));

    const topOwners = (await pool.request().query(`
      SELECT TOP 10 ISNULL(NULLIF(LTRIM(RTRIM(Reserveby)), ''), N'(ไม่ระบุ)') AS name, COUNT(*) AS n
      FROM dbo.ip_management WHERE reservation_status = 'reserved'
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Reserveby)), ''), N'(ไม่ระบุ)') ORDER BY COUNT(*) DESC`)).recordset;
    const byType = (await pool.request().query(`
      SELECT ISNULL(NULLIF(ip_type, ''), N'(ไม่ระบุ)') AS name, COUNT(*) AS n
      FROM dbo.ip_management WHERE reservation_status = 'reserved'
      GROUP BY ISNULL(NULLIF(ip_type, ''), N'(ไม่ระบุ)') ORDER BY COUNT(*) DESC`)).recordset;

    res.json({ generatedAt: new Date().toISOString(), days, kpi, bySubnet, trend, activity, topOwners, byType });
  } catch (err) {
    console.error('[IPReport] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /api/ip-scan/quality?staleDays=30 ────────────────────────────────────
// รายการจองที่ข้อมูลไม่ครบ / จองค้าง / IP ที่ online แต่ไม่มีใครจอง
export const getIPQuality = async (req, res) => {
  const staleDays = clamp(req.query.staleDays, 1, 365, 30);
  try {
    const pool = getPool();
    const reserved = (await pool.request().query(`
      SELECT TOP 5000 ip_address, hostname, owner_name, remark, Reserveby AS reserveby,
        device, location, contact, purpose, ip_type, mac_address,
        CASE WHEN ${ONLINE} THEN 1 ELSE 0 END AS online,
        CONVERT(varchar(19), last_seen_active, 120) AS last_seen_active,
        CASE WHEN last_seen_active IS NULL THEN NULL ELSE DATEDIFF(DAY, last_seen_active, GETDATE()) END AS idle_days,
        ${SUBNET_SQL} AS subnet
      FROM dbo.ip_management WHERE reservation_status = 'reserved'
      ORDER BY ip_address`)).recordset;

    const rogue = (await pool.request().query(`
      SELECT TOP 3000 ip_address, hostname, remark, owner_name,
        CONVERT(varchar(19), last_seen_active, 120) AS last_seen_active,
        ${SUBNET_SQL} AS subnet
      FROM dbo.ip_management
      WHERE ${ONLINE} AND ISNULL(reservation_status, '') <> 'reserved'
      ORDER BY ip_address`)).recordset;

    const blank = (v) => v == null || String(v).trim() === '';
    const missing = { contact: [], location: [], ip_type: [], device: [], mac_address: [], purpose: [] };
    const stale = [];
    for (const r of reserved) {
      for (const k of Object.keys(missing)) if (blank(r[k])) missing[k].push(r.ip_address);
      if (!r.online && (r.idle_days == null || r.idle_days > staleDays)) stale.push(r.ip_address);
    }
    const counts = Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, v.length]));
    res.json({ generatedAt: new Date().toISOString(), staleDays, reserved, rogue, stale, counts, missing });
  } catch (err) {
    console.error('[IPQuality] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /api/ip-scan/free?subnet=10.194.120&limit=10 ─────────────────────────
// แนะนำ IP ว่าง: ไม่ถูกจอง ไม่ online เรียงจาก "ไม่เคยเห็น" และ "ไม่เห็นนานที่สุด" (ตัด .0 .1 .254 .255)
export const getFreeIPs = async (req, res) => {
  const subnet = String(req.query.subnet || '');
  if (!isValidSubnet(subnet)) return res.status(400).json({ error: 'subnet ไม่ถูกต้อง' });
  const limit = clamp(req.query.limit, 1, 50, 10);
  try {
    const result = await getPool().request()
      .input('like', sql.VarChar(20), `${subnet}.%`)
      .input('n', sql.Int, limit)
      .query(`
        SELECT TOP (@n) ip_address, hostname,
          CONVERT(varchar(19), last_seen_active, 120) AS last_seen_active,
          CASE WHEN last_seen_active IS NULL THEN NULL ELSE DATEDIFF(DAY, last_seen_active, GETDATE()) END AS idle_days
        FROM dbo.ip_management
        WHERE ip_address LIKE @like
          AND ISNULL(reservation_status, '') <> 'reserved'
          AND NOT (${ONLINE})
          AND CAST(PARSENAME(ip_address, 1) AS INT) BETWEEN 2 AND 253
        ORDER BY CASE WHEN last_seen_active IS NULL THEN 0 ELSE 1 END, last_seen_active ASC,
                 CAST(PARSENAME(ip_address, 1) AS INT)`);
    const total = (await getPool().request().input('like', sql.VarChar(20), `${subnet}.%`).query(`
      SELECT COUNT(*) AS n FROM dbo.ip_management
      WHERE ip_address LIKE @like AND ISNULL(reservation_status, '') <> 'reserved' AND NOT (${ONLINE})
        AND CAST(PARSENAME(ip_address, 1) AS INT) BETWEEN 2 AND 253`)).recordset[0].n;
    res.json({ subnet, totalFree: total, suggestions: result.recordset });
  } catch (err) {
    console.error('[IPFree] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
