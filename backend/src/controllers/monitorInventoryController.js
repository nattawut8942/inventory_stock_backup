import { getPool } from '../config/db.js';
import sql from 'mssql';

export const getInventory = async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT TOP 10000
        hostname, ip_address, fix_asset, manufacturer, model, serial_number,
        os_name, os_release, os_build, os_arch, os_activation,
        local_admin_users, wifi_ssid, adapter_type,
        crowdstrike_ver, tanium_ver, uems_ver,
        updated_at, collected_at,
        (SELECT STRING_AGG(username, ',') FROM [dbo].[info_mo_active_users]
          WHERE hostname = [dbo].[info_mo_inventory].hostname) as active_usernames,
        (SELECT MAX(logon_time) FROM [dbo].[info_mo_active_users]
          WHERE hostname = [dbo].[info_mo_inventory].hostname) as logon_time
      FROM [dbo].[info_mo_inventory]
      ORDER BY updated_at DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getInventory error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getInventoryByHostname = async (req, res) => {
  try {
    const { hostname } = req.params;
    const pool = getPool();
    const result = await pool.request()
      .input('hostname', sql.VarChar, hostname)
      .query(`SELECT * FROM [dbo].[info_mo_inventory] WHERE hostname = @hostname`);
    if (result.recordset.length === 0)
      return res.status(404).json({ success: false, error: 'Monitor not found' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('getInventoryByHostname error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getActiveUsers = async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request()
      .query(`SELECT * FROM [dbo].[info_mo_active_users] ORDER BY hostname, logon_time DESC`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getActiveUsers error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getActiveUsersByHostname = async (req, res) => {
  try {
    const { hostname } = req.params;
    const pool = getPool();
    const result = await pool.request()
      .input('hostname', sql.VarChar, hostname)
      .query(`SELECT * FROM [dbo].[info_mo_active_users] WHERE hostname = @hostname ORDER BY logon_time DESC`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getActiveUsersByHostname error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const searchInventory = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });
    const pool = getPool();
    const result = await pool.request()
      .input('q', sql.VarChar, `%${q}%`)
      .query(`
        SELECT TOP 1000
          hostname, ip_address, fix_asset, manufacturer, model, serial_number,
          os_name, os_release, os_build, os_arch, os_activation,
          local_admin_users, wifi_ssid, adapter_type,
          crowdstrike_ver, tanium_ver, uems_ver,
          updated_at, collected_at,
          (SELECT STRING_AGG(username, ',') FROM [dbo].[info_mo_active_users]
            WHERE hostname = [dbo].[info_mo_inventory].hostname) as active_usernames,
          (SELECT MAX(logon_time) FROM [dbo].[info_mo_active_users]
            WHERE hostname = [dbo].[info_mo_inventory].hostname) as logon_time
        FROM [dbo].[info_mo_inventory]
        WHERE hostname LIKE @q OR ip_address LIKE @q OR serial_number LIKE @q
          OR manufacturer LIKE @q OR model LIKE @q
        ORDER BY updated_at DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('searchInventory error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getSummary = async (req, res) => {
  try {
    const pool = getPool();

    // Query 1: inventory
    const { recordset: data } = await pool.request()
      .query(`SELECT * FROM [dbo].[info_mo_inventory]`);

    // Query 2: MAX(logon_time) per hostname จาก info_mo_active_users
    const { recordset: logonRows } = await pool.request()
      .query(`
        SELECT hostname, MAX(logon_time) AS last_logon
        FROM [dbo].[info_mo_active_users]
        GROUP BY hostname
      `);
    const logonMap = {};
    logonRows.forEach(r => { logonMap[r.hostname] = r.last_logon; });

    const now = Date.now();
    const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;
    const currentYear = new Date().getFullYear();

    const push = (map, key, hn) => { map[key] = map[key] || []; map[key].push(hn); };

    const summary = {
      total: data.length,

      noCrowdstrike: data
        .filter(d => !d.crowdstrike_ver || d.crowdstrike_ver.toLowerCase() === 'not installed')
        .map(d => d.hostname),

      noTanium: data
        .filter(d => !d.tanium_ver || d.tanium_ver.toLowerCase() === 'not installed')
        .map(d => d.hostname),

      noUems: data
        .filter(d => !d.uems_ver || d.uems_ver.toLowerCase() === 'not installed')
        .map(d => d.hostname),

      notActivated: data
        .filter(d => d.os_activation !== 'Activated')
        .map(d => d.hostname),

      noFixAsset: data
        .filter(d => !d.fix_asset || d.fix_asset.trim() === '')
        .map(d => d.hostname),

      // exclude "not admin"
      adminUsers: data
        .filter(d => {
          const v = (d.local_admin_users || '').toLowerCase().trim();
          return v.includes('admin') && v !== 'not admin';
        })
        .map(d => d.hostname),

      // ใช้ MAX(logon_time) จาก info_mo_active_users
      // นับเฉพาะ host ที่มี session แต่ logon ครั้งล่าสุดเกิน 30 วัน
      notUpdated: data
        .filter(d => {
          const lastLogon = logonMap[d.hostname];
          if (!lastLogon) return false; // ไม่มี session — ไม่นับ
          const t = new Date(lastLogon).getTime();
          if (isNaN(t)) return false;
          return (now - t) > MS_30_DAYS;
        })
        .map(d => d.hostname),

      // parse CO{YY} จาก fix_asset เช่น "CO19-0001" → 2019
      // age > 5 ปี = oldFixAssets (MO ไม่มี notebook type ใช้แค่ > 5)
      oldFixAssets: data
        .filter(d => {
          if (!d.fix_asset || d.fix_asset.trim() === '') return false;
          const m = d.fix_asset.match(/CO(\d{2})/);
          if (!m) return false;
          const yy = parseInt(m[1], 10);
          const year = yy > 50 ? 1900 + yy : 2000 + yy;
          return (currentYear - year) > 5;
        })
        .map(d => d.hostname),
      notDomainJoined: data
        .filter(d => !d.domain || d.domain.trim() === '' ||
          d.domain.toLowerCase() === 'workgroup')
        .map(d => d.hostname),
        
      // ── Distribution maps ───────────────────────────────────────
      crowdstrikeVerMap: {},
      taniumVerMap: {},
      uemsVerMap: {},
      manufacturerMap: {},
      modelMap: {},
      osNameMap: {},
      osReleaseMap: {},
      osBuildMap: {},
      osArchMap: {},
      wifiMap: {},
      adapterMap: {},
      subnetMap: {},   // group by /24 subnet (3 octets)
    };

    data.forEach(d => {
      push(summary.crowdstrikeVerMap, d.crowdstrike_ver || 'Not Installed', d.hostname);
      push(summary.taniumVerMap, d.tanium_ver || 'Not Installed', d.hostname);
      push(summary.uemsVerMap, d.uems_ver || 'Not Installed', d.hostname);
      push(summary.manufacturerMap, d.manufacturer || 'Unknown', d.hostname);
      push(summary.modelMap, d.model || 'Unknown', d.hostname);
      push(summary.osNameMap, d.os_name || 'Unknown', d.hostname);
      push(summary.osReleaseMap, d.os_release || 'Unknown', d.hostname);
      push(summary.osBuildMap, d.os_build || 'Unknown', d.hostname);
      push(summary.osArchMap, d.os_arch || 'Unknown', d.hostname);
      push(summary.wifiMap, d.wifi_ssid || 'Not Connected', d.hostname);
      push(summary.adapterMap, d.adapter_type || 'Unknown', d.hostname);

      // subnet: ตัด octet สุดท้ายออก → "10.194.46"
      if (d.ip_address) {
        const parts = d.ip_address.trim().split('.');
        if (parts.length === 4) {
          const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.x`;
          push(summary.subnetMap, subnet, d.hostname);
        }
      }
    });

    res.json({ success: true, data: summary });
  } catch (err) {
    console.error('getSummary error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getSoftware = async (req, res) => {
  try {
    const { hostname } = req.params;
    const pool = getPool();
    const result = await pool.request()
      .input('hostname', sql.VarChar, hostname)
      .query(`SELECT * FROM [dbo].[info_mo_software] WHERE hostname = @hostname ORDER BY name ASC`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getSoftware error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Fix #6 — PUT /mo-inventory/:hostname/asset
export const updateAsset = async (req, res) => {
  try {
    const { hostname } = req.params;
    const { fix_asset } = req.body;
    const pool = getPool();
    await pool.request()
      .input('hostname', sql.VarChar, hostname)
      .input('fix_asset', sql.NVarChar, fix_asset || null)
      .query(`UPDATE [dbo].[info_mo_inventory] SET fix_asset = @fix_asset WHERE hostname = @hostname`);
    res.json({ success: true, message: 'Fix asset updated' });
  } catch (err) {
    console.error('updateAsset error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteInventory = async (req, res) => {
  try {
    const { hostname } = req.params;
    const pool = getPool();
    await pool.request().input('hostname', sql.VarChar, hostname)
      .query(`DELETE FROM [dbo].[info_mo_inventory]    WHERE hostname = @hostname`);
    await pool.request().input('hostname', sql.VarChar, hostname)
      .query(`DELETE FROM [dbo].[info_mo_active_users] WHERE hostname = @hostname`);
    res.json({ success: true, message: 'Monitor record deleted' });
  } catch (err) {
    console.error('deleteInventory error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};