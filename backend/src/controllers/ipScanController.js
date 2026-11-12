/**
 * ipScanController.js
 * REST endpoints + MERGE logic สำหรับ IP scan
 */

import { getPool, sql } from '../config/db.js';
import { scanSubnet, getSubnets, isValidSubnet, isValidIP } from '../services/ipScanService.js';
import { getIpAlerts } from '../services/ipAlertService.js';

// ค่าเดียวกับ INACTIVE_THRESHOLD ใน frontend (IPManagementPage.jsx) — ถ้าเปลี่ยนต้องแก้ทั้งสองที่
const INACTIVE_THRESHOLD_DAYS = 15;

// Local datetime string — ป้องกัน UTC offset issue
const nowBKK = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });

// hostname ที่รับได้: ตัวอักษร/ตัวเลข/จุด/ขีด (รวม '-' และ 'Unknown') ไม่เกิน 253 ตัว
const HOSTNAME_RE = /^[A-Za-z0-9._-]{1,253}$/;

// สถานะการสแกนรายวง (in-memory) — subnet -> { status, startedAt, finishedAt, active, total, error }
const scanJobs = new Map();

// ออนไลน์ = scan_result 'Found' (นิยามเดียวกับ grid ใน frontend)
const ONLINE_SQL = "scan_result = 'Found'";

// ─── GET /api/ip-scan/subnets ─────────────────────────────────────────────────
// คืนรายการ subnet ทั้งหมด + สรุปสถิติ
export const getIPSubnets = async (req, res) => {
  try {
    const pool   = getPool();
    const result = await pool.request().query(`
      SELECT
        PARSENAME(ip_address, 4) + '.' +
        PARSENAME(ip_address, 3) + '.' +
        PARSENAME(ip_address, 2) AS subnet,
        COUNT(*) AS total,
        SUM(CASE WHEN ${ONLINE_SQL} THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN reservation_status = 'reserved' THEN 1 ELSE 0 END) AS reserved_count,
        SUM(CASE
          WHEN last_seen_active IS NOT NULL
           AND DATEDIFF(DAY, last_seen_active, GETDATE()) > ${INACTIVE_THRESHOLD_DAYS}
           AND NOT (${ONLINE_SQL})
          THEN 1 ELSE 0
        END) AS inactive_count
      FROM dbo.ip_management
      GROUP BY
        PARSENAME(ip_address, 4),
        PARSENAME(ip_address, 3),
        PARSENAME(ip_address, 2)
      ORDER BY
        CAST(PARSENAME(ip_address, 4) AS INT),
        CAST(PARSENAME(ip_address, 3) AS INT),
        CAST(PARSENAME(ip_address, 2) AS INT)
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[IPScan] getSubnets error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /api/ip-scan/ips?subnet=10.194.46 ───────────────────────────────────
export const getIPsBySubnet = async (req, res) => {
  const { subnet } = req.query;
  if (!isValidSubnet(subnet))
    return res.status(400).json({ error: 'subnet ไม่ถูกต้อง เช่น 10.194.46' });
  try {
    const pool   = getPool();
    const result = await pool.request()
      .input('subnet', sql.VarChar(20), subnet + '.%')
      .query(`
        SELECT
          ip_address, status, hostname, updated_by, updated_at,
          CONVERT(varchar(19), last_scan,       120) AS last_scan,
          scan_result,
          owner_name, remark, reservation_status,
          Reserveby AS reserveby,   -- คอลัมน์ใน DB ชื่อ Reserveby (R ใหญ่); alias ให้ตรงกับที่ frontend ใช้
          CONVERT(varchar(19), last_seen_active, 120) AS last_seen_active,
          serial_number, mac_address, device, asset_tag, location, contact, purpose, ip_type,
          CASE
            WHEN last_seen_active IS NULL THEN NULL
            ELSE DATEDIFF(DAY, last_seen_active, GETDATE())
          END AS inactive_days,
          -- นิยาม inactive อยู่ที่เดียวนี้ (frontend ใช้ค่านี้ ไม่คำนวณเอง)
          CASE
            WHEN last_seen_active IS NOT NULL
             AND DATEDIFF(DAY, last_seen_active, GETDATE()) > ${INACTIVE_THRESHOLD_DAYS}
             AND NOT (${ONLINE_SQL})
            THEN 1 ELSE 0
          END AS is_inactive
        FROM dbo.ip_management
        WHERE ip_address LIKE @subnet
        ORDER BY
          CAST(PARSENAME(ip_address, 2) AS INT),
          CAST(PARSENAME(ip_address, 1) AS INT)
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[IPScan] getIPs error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── Validation helpers สำหรับ serial / MAC ───────────────────────────────────
const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
// คืน string ที่ normalize แล้ว, null ถ้าว่าง, หรือ false ถ้าผิดรูปแบบ
const normalizeMac = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = s.toUpperCase().replace(/-/g, ':');
  return MAC_RE.test(n) ? n : false;
};

// field ที่เก็บประวัติการเปลี่ยนแปลง (ชื่อตาม API — ไม่ใช่ชื่อคอลัมน์ใน DB)
// ฟิลด์ข้อความที่แก้ไขได้ → ความยาวสูงสุด (device แยกตรวจด้านล่างด้วยค่าเดียวกัน)
const TEXT_FIELDS = { asset_tag: 50, location: 150, contact: 120, purpose: 50, ip_type: 10 };
const IP_TYPES = ['Static', 'DHCP'];
const TRACKED_FIELDS = ['status', 'owner_name', 'remark', 'hostname', 'reservation_status', 'reserveby', 'serial_number', 'mac_address', 'device', 'asset_tag', 'location', 'contact', 'purpose', 'ip_type'];

// ─── PUT /api/ip-scan/ips/:ip ─────────────────────────────────────────────────
// แก้ไข + เขียนประวัติ ใน transaction เดียวกัน
export const updateIP = async (req, res) => {
  const ip = req.params.ip;
  if (!isValidIP(ip))
    return res.status(400).json({ error: 'IP address ไม่ถูกต้อง' });
  const allowed = ['status', 'owner_name', 'remark', 'hostname', 'reservation_status', 'reserveby', 'serial_number', 'mac_address', 'device', 'asset_tag', 'location', 'contact', 'purpose', 'ip_type', 'updated_by'];

  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );

  if (!Object.keys(updates).length)
    return res.status(400).json({ error: 'No valid fields to update' });

  if (updates.mac_address !== undefined) {
    const mac = normalizeMac(updates.mac_address);
    if (mac === false)
      return res.status(400).json({ error: 'MAC address ไม่ถูกต้อง เช่น 00:1A:2B:3C:4D:5E' });
    updates.mac_address = mac;
  }
  // ฟิลด์ข้อความใหม่: ตัดช่องว่าง, ค่าว่างเป็น NULL, เช็คความยาว
  for (const [f, max] of Object.entries(TEXT_FIELDS)) {
    if (updates[f] === undefined) continue;
    const v = String(updates[f] ?? '').trim();
    if (v.length > max)
      return res.status(400).json({ error: `${f} ยาวเกิน ${max} ตัวอักษร` });
    updates[f] = v || null;
  }
  if (updates.ip_type && !IP_TYPES.includes(updates.ip_type))
    return res.status(400).json({ error: 'ip_type ต้องเป็น Static หรือ DHCP' });
  if (updates.device !== undefined) {
    const device = String(updates.device ?? '').trim();
    if (device.length > 50)
      return res.status(400).json({ error: 'Device ยาวเกิน 50 ตัวอักษร' });
    updates.device = device || null;
  }
  if (updates.serial_number !== undefined) {
    const serial = String(updates.serial_number ?? '').trim();
    if (serial.length > 100)
      return res.status(400).json({ error: 'Serial number ยาวเกิน 100 ตัวอักษร' });
    updates.serial_number = serial || null;
  }

  const updatedBy = (typeof req.body.updated_by === 'string' && req.body.updated_by.trim()) || 'unknown';
  const tx = getPool().transaction();
  try {
    await tx.begin();

    // ค่าเดิมสำหรับคำนวณ diff ประวัติ
    const oldRes = await tx.request().input('ip', sql.VarChar(45), ip).query(`
      SELECT status, owner_name, remark, hostname, reservation_status,
             Reserveby AS reserveby, serial_number, mac_address, device, asset_tag, location, contact, purpose, ip_type
      FROM dbo.ip_management WHERE ip_address = @ip
    `);
    const old = oldRes.recordset[0] || null;

    const request    = tx.request().input('ip', sql.VarChar(45), ip);
    const setClauses = [];

    if (updates.status !== undefined) {
      setClauses.push('status = @status');
      request.input('status', sql.VarChar(20), updates.status);
    }
    if (updates.owner_name !== undefined) {
      setClauses.push('owner_name = @owner_name');
      request.input('owner_name', sql.NVarChar(120), updates.owner_name);
    }
    if (updates.remark !== undefined) {
      setClauses.push('remark = @remark');
      request.input('remark', sql.NVarChar(sql.MAX), updates.remark);
    }
    if (updates.hostname !== undefined) {
      setClauses.push('hostname = @hostname');
      request.input('hostname', sql.VarChar(253), updates.hostname);
    }
    if (updates.reservation_status !== undefined) {
      setClauses.push('reservation_status = @reservation_status');
      request.input('reservation_status', sql.VarChar(20), updates.reservation_status);
    }
    if (updates.reserveby !== undefined) {
      setClauses.push('Reserveby = @reserveby');
      request.input('reserveby', sql.NVarChar(30), updates.reserveby);   // DB: nvarchar(30)
    }
    for (const [f, max] of Object.entries(TEXT_FIELDS)) {
      if (updates[f] !== undefined) {
        setClauses.push(`${f} = @${f}`);
        request.input(f, sql.NVarChar(max), updates[f]);
      }
    }
    if (updates.device !== undefined) {
      setClauses.push('device = @device');
      request.input('device', sql.NVarChar(50), updates.device);
    }
    if (updates.serial_number !== undefined) {
      setClauses.push('serial_number = @serial_number');
      request.input('serial_number', sql.NVarChar(100), updates.serial_number);
    }
    if (updates.mac_address !== undefined) {
      setClauses.push('mac_address = @mac_address');
      request.input('mac_address', sql.VarChar(17), updates.mac_address);
    }

    setClauses.push('updated_at = @updated_at');
    setClauses.push('updated_by = @updated_by');
    request.input('updated_at', sql.VarChar(19), nowBKK());
    request.input('updated_by', sql.NVarChar(120), updatedBy);

    if (old) {
      if (setClauses.length) {
        await request.query(`
          UPDATE dbo.ip_management
          SET ${setClauses.join(', ')}
          WHERE ip_address = @ip
        `);
      }
    } else {
      // IP ยังไม่มีในตาราง → เพิ่มแถวใหม่
      const ins = tx.request()
        .input('ip',   sql.VarChar(45),       ip)
        .input('own',  sql.NVarChar(120),     updates.owner_name  || '')
        .input('rem',  sql.NVarChar(sql.MAX), updates.remark      || '')
        .input('res',  sql.VarChar(20),       updates.reservation_status || 'available')
        .input('rb',   sql.NVarChar(30),      updates.reserveby   || '')
        .input('ser',  sql.NVarChar(100),     updates.serial_number ?? null)
        .input('dev',  sql.NVarChar(50),      updates.device ?? null)
        .input('mac',  sql.VarChar(17),       updates.mac_address ?? null)
        .input('now',  sql.VarChar(19),       nowBKK());
      for (const [f, max] of Object.entries(TEXT_FIELDS)) ins.input(f, sql.NVarChar(max), updates[f] ?? null);
      await ins.query(`
          INSERT INTO dbo.ip_management
            (ip_address, status, owner_name, remark, last_scan, scan_result, reservation_status, Reserveby,
             serial_number, mac_address, device, asset_tag, location, contact, purpose, ip_type, last_seen_active)
          VALUES (@ip, NULL, @own, @rem, @now, 'Manual', @res, @rb, @ser, @mac, @dev,
                  @asset_tag, @location, @contact, @purpose, @ip_type, NULL)
        `);
    }

    // ── ประวัติ: เก็บเฉพาะ field ที่ค่าเปลี่ยนจริง ──
    const changes = {};
    for (const f of TRACKED_FIELDS) {
      if (updates[f] === undefined) continue;
      const from = old ? (old[f] ?? null) : null;
      const to   = updates[f] ?? null;
      if (String(from ?? '') !== String(to ?? '')) changes[f] = { from, to };
    }
    if (Object.keys(changes).length) {
      const action = changes.reservation_status
        ? (updates.reservation_status === 'reserved' ? 'reserve' : 'release')
        : 'update';
      await tx.request()
        .input('ip',     sql.VarChar(45),       ip)
        .input('action', sql.VarChar(20),       action)
        .input('changes', sql.NVarChar(sql.MAX), JSON.stringify(changes))
        .input('by',     sql.NVarChar(120),     updatedBy)
        .input('at',     sql.VarChar(19),       nowBKK())
        .query(`
          INSERT INTO dbo.ip_management_history (ip_address, action, changes, changed_by, changed_at)
          VALUES (@ip, @action, @changes, @by, @at)
        `);
    }

    await tx.commit();
    res.json({ success: true, ip_address: ip, changed: Object.keys(changes) });
  } catch (err) {
    try { await tx.rollback(); } catch { /* ไม่ได้เริ่มทรานแซกชัน */ }
    console.error('[IPScan] updateIP error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /api/ip-scan/ips/:ip/history ─────────────────────────────────────────
// ประวัติการแก้ไข/จอง/ยกเลิกของ IP (ล่าสุด 50 รายการ)
export const getIPHistory = async (req, res) => {
  const ip = req.params.ip;
  if (!isValidIP(ip))
    return res.status(400).json({ error: 'IP address ไม่ถูกต้อง' });
  try {
    const result = await getPool().request()
      .input('ip', sql.VarChar(45), ip)
      .query(`
        SELECT TOP 50 id, action, changes, changed_by, changed_at
        FROM dbo.ip_management_history
        WHERE ip_address = @ip
        ORDER BY id DESC
      `);
    res.json(result.recordset.map(r => ({
      ...r,
      changes: (() => { try { return JSON.parse(r.changes); } catch { return {}; } })(),
    })));
  } catch (err) {
    console.error('[IPScan] getIPHistory error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/ip-scan/subnets/add ───────────────────────────────────────────
export const addSubnet = async (req, res) => {
  const subnet = typeof req.body.subnet === 'string' ? req.body.subnet.trim() : '';

  if (!isValidSubnet(subnet))
    return res.status(400).json({ error: 'รูปแบบ subnet ไม่ถูกต้อง เช่น 10.194.46' });

  try {
    const pool     = getPool();
    const existing = await pool.request()
      .input('like', sql.VarChar(20), subnet + '.%')
      .query('SELECT COUNT(*) AS cnt FROM dbo.ip_management WHERE ip_address LIKE @like');

    if (existing.recordset[0].cnt > 0)
      return res.status(409).json({ error: `Subnet ${subnet}.0/24 มีอยู่แล้ว` });

    const now         = nowBKK();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      for (let i = 1; i <= 254; i++) {
        await transaction.request()
          .input('ip',  sql.VarChar(45), `${subnet}.${i}`)
          .input('now', sql.VarChar(19), now)
          .query(`
            INSERT INTO dbo.ip_management
              (ip_address, status, hostname, last_scan, scan_result, owner_name, remark, reservation_status, last_seen_active)
            VALUES (@ip, NULL, '-', @now, 'Pending', '', '', 'available', NULL)
          `);
      }
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    res.json({ success: true, subnet, inserted: 254, message: `เพิ่ม ${subnet}.0/24 สำเร็จ (254 IPs)` });
  } catch (err) {
    console.error('[IPScan] addSubnet error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /api/ip-scan/subnets/:subnet ─────────────────────────────────────
export const deleteSubnet = async (req, res) => {
  const subnet = req.params.subnet;
  if (!isValidSubnet(subnet))
    return res.status(400).json({ error: 'subnet ไม่ถูกต้อง' });
  try {
    const pool   = getPool();
    const result = await pool.request()
      .input('like', sql.VarChar(20), subnet + '.%')
      .query('DELETE FROM dbo.ip_management WHERE ip_address LIKE @like');
    res.json({ success: true, deleted: result.rowsAffected[0] });
  } catch (err) {
    console.error('[IPScan] deleteSubnet error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── MERGE ผลสแกนลง DB (ใช้ร่วมกันทั้ง scan-result และ trigger) ───────────────
// ส่งเป็นชุด (chunk) ด้วย VALUES ในคำสั่ง MERGE เอง ทั้งหมดอยู่ในทรานแซกชันเดียว
// (ไม่ใช้ temp table — driver ไม่ให้ #temp ที่สร้างในทรานแซกชันถูกมองเห็นจาก request ถัดไป)
// ip ซ้ำใน payload → ใช้แถวสุดท้ายที่ส่งมา (กัน MERGE error "multiple source rows")
export async function mergeScanResults(pool, rows) {
  const byIp = new Map();
  for (const r of rows) byIp.set(r.ip, r);
  const list = [...byIp.values()];
  if (!list.length) return 0;

  const CHUNK = 200; // 200 แถว × 3 พารามิเตอร์ = 600 (ต่ำกว่าขีดจำกัด 2100 พารามิเตอร์ และ 1000 แถวของ VALUES)
  const tx = pool.transaction();
  await tx.begin();
  try {
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk  = list.slice(i, i + CHUNK);
      const req    = tx.request();
      const values = chunk.map((r, j) => {
        req.input(`ip${j}`, sql.VarChar(45),  r.ip);
        req.input(`st${j}`, sql.VarChar(20),  r.status);
        req.input(`hn${j}`, sql.VarChar(253), r.hostname);
        return `(@ip${j}, @st${j}, @hn${j}, GETDATE())`;
      }).join(', ');

      await req.query(`
        MERGE dbo.ip_management AS target
        USING (VALUES ${values}) AS source (ip_address, status, hostname, ts)
        ON target.ip_address = source.ip_address
        WHEN MATCHED THEN
          UPDATE SET
            hostname         = CASE WHEN source.hostname <> 'Unknown' THEN source.hostname ELSE target.hostname END,
            last_scan        = source.ts,
            scan_result      = CASE WHEN source.status = 'Active' THEN 'Found' ELSE 'Not Found' END,
            status           = CASE WHEN target.reservation_status = 'reserved' THEN target.status ELSE source.status END,
            last_seen_active = CASE WHEN source.status = 'Active' THEN source.ts ELSE target.last_seen_active END
        WHEN NOT MATCHED THEN
          INSERT (ip_address, status, hostname, last_scan, scan_result, reservation_status, last_seen_active)
          VALUES (source.ip_address, source.status, source.hostname, source.ts,
                  CASE WHEN source.status = 'Active' THEN 'Found' ELSE 'Not Found' END,
                  'available',
                  CASE WHEN source.status = 'Active' THEN source.ts ELSE NULL END);
      `);
    }

    await tx.commit();
    await snapshotSubnetsFor(pool, list); // สแนปชอตรายวัน (ไม่ทำให้การ merge ล้มเหลว)
    return list.length;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// ─── POST /api/ip-scan/scan-result ───────────────────────────────────────────
// รับผลจาก scanner (auto_scan.js) แล้ว MERGE ลง DB
export const postScanResult = async (req, res) => {
  const results = req.body;
  if (!Array.isArray(results) || !results.length)
    return res.status(400).json({ error: 'Empty payload' });
  if (results.length > 5000)
    return res.status(413).json({ error: 'Payload too large' });

  // validate ทุกแถวก่อนเขียน DB — ถ้ามีแถวผิดจะไม่เขียนเลย
  const bad = results.findIndex(r =>
    !r || !isValidIP(r.ip)
    || !['Active', 'Available'].includes(r.status)
    || typeof r.hostname !== 'string' || !HOSTNAME_RE.test(r.hostname)
  );
  if (bad !== -1)
    return res.status(400).json({ error: `ข้อมูลแถวที่ ${bad} ไม่ถูกต้อง` });

  try {
    const updated = await mergeScanResults(getPool(), results);
    res.json({ success: true, updated });
  } catch (err) {
    console.error('[IPScan] postScanResult error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/ip-scan/trigger ───────────────────────────────────────────────
// สั่งสแกนเบื้องหลัง — ตอบทันที แล้ว frontend ดูสถานะที่ GET /scan-status
export const triggerScan = async (req, res) => {
  const subnet = req.body?.subnet;
  const hasSubnet = subnet !== undefined && subnet !== null && subnet !== '';
  if (hasSubnet && !isValidSubnet(subnet))
    return res.status(400).json({ error: 'subnet ไม่ถูกต้อง เช่น 10.194.46' });

  let targets;
  try {
    targets = hasSubnet ? [subnet] : await getSubnets(getPool());
  } catch (err) {
    console.error('[IPScan] trigger getSubnets error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  const busy = targets.filter(sn => scanJobs.get(sn)?.status === 'running');
  if (busy.length)
    return res.status(409).json({ error: `กำลังสแกนอยู่: ${busy.join(', ')}` });

  const startedAt = new Date().toISOString();
  for (const sn of targets) {
    scanJobs.set(sn, { status: 'running', startedAt, finishedAt: null, active: null, total: 254, error: null });
  }

  res.json({
    success: true,
    subnets: targets,
    message: hasSubnet ? `เริ่มสแกน ${subnet}` : 'เริ่มสแกนทุก subnet',
  });

  setImmediate(async () => {
    const pool = getPool();
    for (const sn of targets) {
      try {
        console.log(`[IPScan] Scanning ${sn}.0/24...`);
        const results = await scanSubnet(sn);
        const active  = results.filter(r => r.status === 'Active').length;
        await mergeScanResults(pool, results);
        scanJobs.set(sn, { ...scanJobs.get(sn), status: 'done', finishedAt: new Date().toISOString(), active });
        console.log(`[IPScan] ${sn}.0/24 done — Active: ${active}/254`);
      } catch (err) {
        console.error(`[IPScan] scan ${sn} error:`, err.message);
        scanJobs.set(sn, { ...scanJobs.get(sn), status: 'error', finishedAt: new Date().toISOString(), error: err.message });
      }
    }
  });
};

// ─── GET /api/ip-scan/scan-status?subnet=10.194.46 ───────────────────────────
// 'idle' = ไม่มีงานสแกนในหน่วยความจำ (เช่นหลัง server restart)
export const getScanStatus = (req, res) => {
  const { subnet } = req.query;
  if (!isValidSubnet(subnet))
    return res.status(400).json({ error: 'subnet ไม่ถูกต้อง' });
  res.json({ subnet, ...(scanJobs.get(subnet) || { status: 'idle' }) });
};

// ─── helper: แปลง JSON ของ changes ────────────────────────────────────────────
const parseChangesJson = (s) => { try { return JSON.parse(s); } catch { return {}; } };

// ─── GET /api/ip-scan/history?limit=50&subnet=10.194.46 ──────────────────────
// ไทม์ไลน์: ประวัติล่าสุดของทุก IP (หรือเฉพาะ subnet)
export const getRecentHistory = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 300);
  const subnet = req.query.subnet;
  if (subnet && !isValidSubnet(subnet))
    return res.status(400).json({ error: 'subnet ไม่ถูกต้อง' });
  const action = ['reserve', 'release', 'update'].includes(req.query.action) ? req.query.action : null;
  try {
    const result = await getPool().request()
      .input('action', sql.VarChar(20), action)
      .input('like', sql.VarChar(20), subnet ? subnet + '.%' : '%')
      .query(`
        SELECT TOP ${limit} id, ip_address, action, changes, changed_by, changed_at
        FROM dbo.ip_management_history
        WHERE ip_address LIKE @like
          AND (@action IS NULL OR action = @action)
        ORDER BY id DESC
      `);
    res.json(result.recordset.map(r => ({ ...r, changes: parseChangesJson(r.changes) })));
  } catch (err) {
    console.error('[IPScan] getRecentHistory error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /api/ip-scan/inactive ────────────────────────────────────────────────
// รายการ IP ที่ไม่ออนไลน์เกิน INACTIVE_THRESHOLD_DAYS (เรียงนานสุดก่อน)
export const getInactiveIPs = async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT TOP 1000
        ip_address, owner_name, remark, reservation_status, Reserveby AS reserveby,
        device, location, contact,
        CONVERT(varchar(19), last_seen_active, 120) AS last_seen_active,
        DATEDIFF(DAY, last_seen_active, GETDATE()) AS inactive_days,
        PARSENAME(ip_address, 4) + '.' + PARSENAME(ip_address, 3) + '.' + PARSENAME(ip_address, 2) AS subnet
      FROM dbo.ip_management
      WHERE last_seen_active IS NOT NULL
        AND DATEDIFF(DAY, last_seen_active, GETDATE()) > ${INACTIVE_THRESHOLD_DAYS}
        AND NOT (${ONLINE_SQL})
      ORDER BY last_seen_active ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[IPScan] getInactiveIPs error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── สแนปชอตรายวันต่อ subnet (ใช้วาดแนวโน้ม) ──────────────────────────────────
// บันทึกไม่เกิน 1 ครั้งต่อ subnet ต่อ 60 นาที และล้มเหลวได้โดยไม่กระทบการ merge
export async function snapshotSubnetsFor(pool, rows) {
  const subnets = [...new Set(rows.map(r => r.ip.split('.').slice(0, 3).join('.')))];
  for (const sn of subnets) {
    try {
      const recent = await pool.request()
        .input('sn', sql.VarChar(20), sn)
        .query(`SELECT COUNT(*) AS n FROM dbo.ip_subnet_snapshot
                WHERE subnet = @sn AND taken_at > CONVERT(varchar(19), DATEADD(MINUTE, -60, GETDATE()), 120)`);
      if (recent.recordset[0].n > 0) continue;
      await pool.request()
        .input('sn', sql.VarChar(20), sn)
        .input('like', sql.VarChar(20), sn + '.%')
        .query(`
          INSERT INTO dbo.ip_subnet_snapshot (subnet, taken_at, total, online, reserved, inactive)
          SELECT @sn, CONVERT(varchar(19), GETDATE(), 120), COUNT(*),
            SUM(CASE WHEN scan_result = 'Found' THEN 1 ELSE 0 END),
            SUM(CASE WHEN reservation_status = 'reserved' THEN 1 ELSE 0 END),
            SUM(CASE WHEN last_seen_active IS NOT NULL
                      AND DATEDIFF(DAY, last_seen_active, GETDATE()) > ${INACTIVE_THRESHOLD_DAYS}
                      AND NOT (${ONLINE_SQL}) THEN 1 ELSE 0 END)
          FROM dbo.ip_management WHERE ip_address LIKE @like
        `);
    } catch (err) {
      console.warn(`[IPScan] snapshot ${sn} skipped:`, err.message);
    }
  }
}

// ─── GET /api/ip-scan/snapshots?days=14 ───────────────────────────────────────
export const getSnapshots = async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 90);
  try {
    const result = await getPool().request().query(`
      SELECT subnet, taken_at, total, online, reserved, inactive
      FROM dbo.ip_subnet_snapshot
      WHERE taken_at > CONVERT(varchar(19), DATEADD(DAY, -${days}, GETDATE()), 120)
      ORDER BY subnet, taken_at
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[IPScan] getSnapshots error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /api/ip-scan/reserved ────────────────────────────────────────────────
// IP ที่จองอยู่ทั้งหมด (ใช้จัดกลุ่มตามผู้จอง)
export const getReservedIPs = async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT TOP 5000
        ip_address, owner_name, remark, Reserveby AS reserveby, device, location, contact, purpose, ip_type,
        CASE WHEN scan_result = 'Found' THEN 1 ELSE 0 END AS online,
        PARSENAME(ip_address, 4) + '.' + PARSENAME(ip_address, 3) + '.' + PARSENAME(ip_address, 2) AS subnet
      FROM dbo.ip_management
      WHERE reservation_status = 'reserved'
      ORDER BY reserveby, ip_address
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[IPScan] getReservedIPs error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /api/ip-scan/alerts ────────────────────────────────────────────────
// รายการที่ควรตรวจสอบ: MAC ซ้ำบนหลาย IP และ hostname ซ้ำในเครื่องที่ online
export const getAlerts = async (req, res) => {
  try {
    res.json(await getIpAlerts(getPool()));
  } catch (err) {
    console.error('[IPScan] getAlerts error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
