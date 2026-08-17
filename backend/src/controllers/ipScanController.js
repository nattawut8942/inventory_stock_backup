/**
 * ipScanController.js
 * REST endpoints + MERGE logic สำหรับ IP scan
 */

import { getPool, sql } from '../config/db.js';

// Local datetime string — ป้องกัน UTC offset issue
const nowBKK = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });
import { scanSubnet, getSubnets } from '../services/ipScanService.js';

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
        SUM(CASE WHEN status = 'Active'   THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN reservation_status = 'reserved' THEN 1 ELSE 0 END) AS reserved_count,
        SUM(CASE
          WHEN last_seen_active IS NOT NULL
           AND DATEDIFF(DAY, last_seen_active, GETDATE()) > 15
           AND (status IS NULL OR status <> 'Active')
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
  try {
    const pool   = getPool();
    const result = await pool.request()
      .input('subnet', sql.VarChar(20), (subnet || '') + '.%')
      .query(`
        SELECT
          ip_address, status, hostname, updated_by, updated_at,
          CONVERT(varchar(19), last_scan,       120) AS last_scan,
          scan_result,
          owner_name, remark, reservation_status, reserveby,
          CONVERT(varchar(19), last_seen_active, 120) AS last_seen_active,
          CASE
          
            WHEN last_seen_active IS NULL THEN NULL
            ELSE DATEDIFF(DAY, last_seen_active, GETDATE())
          END AS inactive_days
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

// ─── PUT /api/ip-scan/ips/:ip ─────────────────────────────────────────────────
export const updateIP = async (req, res) => {
  const ip      = req.params.ip;
  const allowed = ['status', 'owner_name', 'remark', 'hostname', 'reservation_status', 'reserveby', 'updated_by'];

  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );

  if (!Object.keys(updates).length)
    return res.status(400).json({ error: 'No valid fields to update' });

  try {
    const pool      = getPool();
    const request   = pool.request().input('ip', sql.VarChar(45), ip);
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
      setClauses.push('reserveby = @reserveby');
      request.input('reserveby', sql.NVarChar(120), updates.reserveby);
    }

setClauses.push('updated_at = @updated_at');
    setClauses.push('updated_by = @updated_by');
    request.input('updated_at', sql.VarChar(19),    nowBKK());
    request.input('updated_by', sql.NVarChar(120),  req.body.updated_by || 'unknown');
    const updateResult = await request.query(`
      UPDATE dbo.ip_management
      SET ${setClauses.join(', ')}
      WHERE ip_address = @ip
    `);

    // Insert if not exists
    if (updateResult.rowsAffected[0] === 0) {
      await pool.request()
        .input('ip',   sql.VarChar(45),   ip)
        .input('own',  sql.NVarChar(120), updates.owner_name  || '')
        .input('rem',  sql.NVarChar(sql.MAX), updates.remark  || '')
        .input('res',  sql.VarChar(20),   updates.reservation_status || 'available')
        .input('now',  sql.VarChar(19),   nowBKK())
        .query(`
          INSERT INTO dbo.ip_management
            (ip_address, status, owner_name, remark, last_scan, scan_result, reservation_status, last_seen_active)
          VALUES (@ip, NULL, @own, @rem, @now, 'Manual', @res, NULL)
        `);
    }

    res.json({ success: true, ip_address: ip });
  } catch (err) {
    console.error('[IPScan] updateIP error:', err.message);
    res.status(500).json({ error: err.message });
  }

  
};


// ─── POST /api/ip-scan/subnets/add ───────────────────────────────────────────
export const addSubnet = async (req, res) => {
  const { subnet } = req.body;
  const parts = (subnet || '').trim().split('.');

  if (parts.length !== 3 || !parts.every(p => /^\d+$/.test(p) && +p <= 255))
    return res.status(400).json({ error: 'รูปแบบ subnet ไม่ถูกต้อง เช่น 10.194.46' });

  try {
    const pool    = getPool();
    const existing = await pool.request()
      .input('like', sql.VarChar(20), subnet + '.%')
      .query('SELECT COUNT(*) AS cnt FROM dbo.ip_management WHERE ip_address LIKE @like');

    if (existing.recordset[0].cnt > 0)
      return res.status(409).json({ error: `Subnet ${subnet}.0/24 มีอยู่แล้ว` });

    const now = nowBKK();
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

// ─── POST /api/ip-scan/scan-result ───────────────────────────────────────────
// รับผลจาก scanner แล้ว MERGE ลง DB
export const postScanResult = async (req, res) => {
  const results = req.body;
  if (!Array.isArray(results) || !results.length)
    return res.status(400).json({ error: 'Empty payload' });

  try {
    const pool = getPool();

    for (const r of results) {
      await pool.request()
        .input('ip',       sql.VarChar(45),  r.ip)
        .input('status',   sql.VarChar(20),  r.status)
        .input('hostname', sql.VarChar(253), r.hostname)
        .query(`
          MERGE dbo.ip_management AS target
          USING (SELECT @ip AS ip_address, @status AS status,
                        @hostname AS hostname, GETDATE() AS last_scan) AS source
          ON target.ip_address = source.ip_address
          WHEN MATCHED THEN
            UPDATE SET
              hostname         = CASE WHEN source.hostname <> 'Unknown'
                                      THEN source.hostname
                                      ELSE target.hostname END,
              last_scan        = GETDATE(),
              scan_result      = CASE WHEN source.status = 'Active' THEN 'Found' ELSE 'Not Found' END,
              status           = CASE WHEN target.reservation_status = 'reserved'
                                      THEN target.status
                                      ELSE source.status END,
              last_seen_active = CASE WHEN source.status = 'Active'
                                      THEN GETDATE()
                                      ELSE target.last_seen_active END
          WHEN NOT MATCHED THEN
            INSERT (ip_address, status, hostname, last_scan, scan_result,
                    reservation_status, last_seen_active)
            VALUES (source.ip_address, source.status, source.hostname,
                    GETDATE(),
                    CASE WHEN source.status = 'Active' THEN 'Found' ELSE 'Not Found' END,
                    'available',
                    CASE WHEN source.status = 'Active' THEN GETDATE() ELSE NULL END);
        `);
    }

    res.json({ success: true, updated: results.length });
  } catch (err) {
    console.error('[IPScan] postScanResult error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/ip-scan/trigger ───────────────────────────────────────────────
// Trigger scan ทันทีจาก frontend (background)
export const triggerScan = async (req, res) => {
  const { subnet } = req.body;
  res.json({ success: true, message: subnet ? `เริ่มสแกน ${subnet}` : 'เริ่มสแกนทุก subnet' });

  // รัน background (ไม่ block response)
  setImmediate(async () => {
    try {
      const pool    = getPool();
      const subnets = subnet ? [subnet] : await getSubnets(pool);
      console.log(`[IPScan] Trigger scan: ${subnets.join(', ')}`);

      for (const sn of subnets) {
        console.log(`[IPScan] Scanning ${sn}.0/24...`);
        const results = await scanSubnet(sn);
        const active  = results.filter(r => r.status === 'Active').length;

        // MERGE ผลลัพธ์ลง DB
        for (const r of results) {
          await pool.request()
            .input('ip',       sql.VarChar(45),  r.ip)
            .input('status',   sql.VarChar(20),  r.status)
            .input('hostname', sql.VarChar(253), r.hostname)
            .query(`
              MERGE dbo.ip_management AS target
              USING (SELECT @ip AS ip_address, @status AS status,
                            @hostname AS hostname, GETDATE() AS last_scan) AS source
              ON target.ip_address = source.ip_address
              WHEN MATCHED THEN
                UPDATE SET
                  hostname         = CASE WHEN source.hostname <> 'Unknown'
                                          THEN source.hostname ELSE target.hostname END,
                  last_scan        = GETDATE(),
                  scan_result      = CASE WHEN source.status = 'Active' THEN 'Found' ELSE 'Not Found' END,
                  status           = CASE WHEN target.reservation_status = 'reserved'
                                          THEN target.status ELSE source.status END,
                  last_seen_active = CASE WHEN source.status = 'Active'
                                          THEN GETDATE() ELSE target.last_seen_active END
              WHEN NOT MATCHED THEN
                INSERT (ip_address, status, hostname, last_scan, scan_result,
                        reservation_status, last_seen_active)
                VALUES (source.ip_address, source.status, source.hostname, GETDATE(),
                        CASE WHEN source.status = 'Active' THEN 'Found' ELSE 'Not Found' END,
                        'available',
                        CASE WHEN source.status = 'Active' THEN GETDATE() ELSE NULL END);
            `);
        }
        console.log(`[IPScan] ${sn}.0/24 done — Active: ${active}/254`);
      }
    } catch (err) {
      console.error('[IPScan] Background scan error:', err.message);
    }
  });
};

