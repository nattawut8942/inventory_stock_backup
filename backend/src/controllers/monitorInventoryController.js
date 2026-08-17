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
        uptime, last_boot, domain,
        updated_at, collected_at,
        factory_layout_id, location_x, location_y, location_updated_at,
        (SELECT TOP 1 username FROM [dbo].[info_mo_active_users]
          WHERE hostname = [dbo].[info_mo_inventory].hostname
          ORDER BY TRY_CONVERT(datetime, logon_time, 103) DESC) as active_usernames,
        (SELECT TOP 1 logon_time FROM [dbo].[info_mo_active_users]
          WHERE hostname = [dbo].[info_mo_inventory].hostname
          ORDER BY TRY_CONVERT(datetime, logon_time, 103) DESC) as logon_time
      FROM [dbo].[info_mo_inventory]
      ORDER BY updated_at DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getInventory error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getMOLocation = async (req, res) => {
  try {
    const { hostname } = req.params;
    const pool = getPool();
    const result = await pool.request()
      .input('hostname', sql.VarChar, hostname)
      .query(`
        SELECT m.hostname, m.factory_layout_id, m.location_x, m.location_y,
               m.location_updated_at, l.image_url, l.name as layout_name
        FROM [dbo].[info_mo_inventory] m
        LEFT JOIN dbo.factory_layouts l ON m.factory_layout_id = l.id
        WHERE m.hostname = @hostname
      `);
    res.json({ success: true, data: result.recordset[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getMOsByLayout = async (req, res) => {
  try {
    const { layout_id } = req.params;
    const pool = getPool();
    const result = await pool.request()
      .input('layout_id', sql.Int, layout_id)
      .query(`
        SELECT i.hostname, i.location_x, i.location_y, i.fix_asset, i.manufacturer,
          (SELECT TOP 1 username FROM [dbo].[info_mo_active_users]
            WHERE hostname = i.hostname
            ORDER BY TRY_CONVERT(datetime, logon_time, 103) DESC) as username
        FROM [dbo].[info_mo_inventory] i
        WHERE i.factory_layout_id = @layout_id
          AND i.location_x IS NOT NULL AND i.location_y IS NOT NULL
        ORDER BY i.hostname
      `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateMOLocation = async (req, res) => {
  try {
    const { hostname } = req.params;
    const { factory_layout_id, location_x, location_y } = req.body;
    const pool = getPool();
    await pool.request()
      .input('hostname', sql.VarChar, hostname)
      .input('factory_layout_id', sql.Int, factory_layout_id || null)
      .input('location_x', sql.Float, location_x ?? null)
      .input('location_y', sql.Float, location_y ?? null)
      .query(`
        UPDATE [dbo].[info_mo_inventory]
        SET factory_layout_id = @factory_layout_id,
            location_x = @location_x, location_y = @location_y,
            location_updated_at = GETDATE()
        WHERE hostname = @hostname
      `);
    res.json({ success: true });
  } catch (err) {
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

export const updateLocation = async (req, res) => {
  try {
    const { hostname } = req.params;
    const { factory_layout_id, location_x, location_y } = req.body;
    const pool = getPool();
    await pool.request()
      .input('hostname', sql.VarChar, hostname)
      .input('factory_layout_id', sql.Int, factory_layout_id || null)
      .input('location_x', sql.Float, location_x ?? null)
      .input('location_y', sql.Float, location_y ?? null)
      .input('location_updated_at', sql.DateTime2, new Date())
      .query(`
        UPDATE [dbo].[info_mo_inventory]
        SET factory_layout_id   = @factory_layout_id,
            location_x          = @location_x,
            location_y          = @location_y,
            location_updated_at = @location_updated_at
        WHERE hostname = @hostname
      `);
    res.json({ success: true });
  } catch (err) {
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
          uptime, last_boot, domain,
          updated_at, collected_at,
          (SELECT TOP 1 username FROM [dbo].[info_mo_active_users]
            WHERE hostname = [dbo].[info_mo_inventory].hostname
            ORDER BY TRY_CONVERT(datetime, logon_time, 103) DESC) as active_usernames,
          (SELECT TOP 1 logon_time FROM [dbo].[info_mo_active_users]
            WHERE hostname = [dbo].[info_mo_inventory].hostname
            ORDER BY TRY_CONVERT(datetime, logon_time, 103) DESC) as logon_time
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

    const { recordset: data } = await pool.request()
      .query(`SELECT * FROM [dbo].[info_mo_inventory]`);

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

    // ✅ เครื่องที่ยัง active อยู่ (ไม่รวม inactive) ใช้ตัวนี้กรอง stat ที่เป็น "ปัญหาต้องตามแก้"
    const activeOnly = data.filter(d => d.pc_status !== 'Inactive');

    const summary = {
      total: data.length,

      // ✅ เพิ่ม stat ใหม่
      inactive: data
        .filter(d => d.pc_status === 'Inactive')
        .map(d => d.hostname),

      noLocation: activeOnly
        .filter(d => d.factory_layout_id === null || d.factory_layout_id === undefined)
        .map(d => d.hostname),

      noCrowdstrike: activeOnly
        .filter(d => !d.crowdstrike_ver || d.crowdstrike_ver.toLowerCase() === 'not installed')
        .map(d => d.hostname),

      noTanium: activeOnly
        .filter(d => !d.tanium_ver || d.tanium_ver.toLowerCase() === 'not installed')
        .map(d => d.hostname),

      noUems: activeOnly
        .filter(d => !d.uems_ver || d.uems_ver.toLowerCase() === 'not installed')
        .map(d => d.hostname),

      notActivated: activeOnly
        .filter(d => d.os_activation !== 'Activated')
        .map(d => d.hostname),

      noFixAsset: activeOnly
        .filter(d => !d.fix_asset || d.fix_asset.trim() === '')
        .map(d => d.hostname),

      adminUsers: activeOnly
        .filter(d => {
          const v = (d.local_admin_users || '').toLowerCase().trim();
          return v.includes('admin') && v !== 'not admin';
        })
        .map(d => d.hostname),

      // ✅ แก้ bug เดิมด้วย: เช็คจาก updated_at แทน logonMap
      notUpdated: activeOnly
        .filter(d => {
          if (!d.updated_at) return false;
          const t = new Date(d.updated_at).getTime();
          if (isNaN(t)) return false;
          return (now - t) > MS_30_DAYS;
        })
        .map(d => d.hostname),

      oldFixAssets: activeOnly
        .filter(d => {
          if (!d.fix_asset || d.fix_asset.trim() === '') return false;
          const m = d.fix_asset.match(/CO(\d{2})/);
          if (!m) return false;
          const yy = parseInt(m[1], 10);
          const year = yy > 50 ? 1900 + yy : 2000 + yy;
          return (currentYear - year) > 5;
        })
        .map(d => d.hostname),

      notDomainJoined: activeOnly
        .filter(d => !d.domain || d.domain.trim() === '' ||
          d.domain.toLowerCase() === 'workgroup')
        .map(d => d.hostname),

      longUptime: activeOnly
        .filter(d => {
          if (!d.uptime) return false;
          const match = d.uptime.match(/^(\d+)d/);
          return match ? parseInt(match[1], 10) > 10 : false;
        })
        .map(d => d.hostname),

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
      subnetMap: {},
    };

    // ✅ distribution map ก็ใช้ activeOnly เหมือนกัน จะได้ไม่เอาเครื่อง inactive มาปนใน chart
    activeOnly.forEach(d => {
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
export const updateStatus = async (req, res) => {
  try {
    const { hostname } = req.params;
    const { pc_status } = req.body; // 'Active' | 'Inactive'
    if (!['Active', 'Inactive'].includes(pc_status)) {
      return res.status(400).json({ success: false, error: 'pc_status ไม่ถูกต้อง' });
    }
    const pool = getPool();
    await pool.request()
      .input('hostname', sql.VarChar, hostname)
      .input('pc_status', sql.VarChar, pc_status)
      .query(`UPDATE [dbo].[info_mo_inventory] SET pc_status = @pc_status WHERE hostname = @hostname`);
    res.json({ success: true, message: 'Status updated' });
  } catch (err) {
    console.error('updateStatus error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

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

export const getHistory = async (req, res) => {
  try {
    const { hostname } = req.params;
    if (!hostname || hostname.trim() === '') {
      return res.status(400).json({ success: false, error: 'hostname is required' });
    }
    const pool = getPool();
    const result = await pool.request()
      .input('hostname', sql.VarChar, hostname)
      .query(`
        SELECT
          id,
          hostname,
          change_type,
          field_name,
          old_value,
          new_value,
          changed_at
        FROM dbo.info_mo_inventory_history
        WHERE hostname = @hostname
        ORDER BY changed_at DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getHistory error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
export const getInventoryByFixAsset = async (req, res) => {
  try {
    const code = (req.params.code || '').trim();
    if (!code) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสครุภัณฑ์' });
    }
 
    const pool = getPool();
    const result = await pool.request()
      .input('fixAsset', sql.VarChar, code)
      .query(`
        SELECT TOP (1) hostname, serial_number, fix_asset, manufacturer, model
        FROM [dbo].[info_mo_inventory]
        WHERE fix_asset = @fixAsset
      `);
 
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบรหัสครุภัณฑ์นี้ในระบบ Monitor Inventory' });
    }
 
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('getInventoryByFixAsset (MO) error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
 

export const deleteInventoryWithHistory = async (req, res) => {
  try {
    const { hostname } = req.params;
    const pool = getPool();
    await pool.request().input('hostname', sql.VarChar, hostname)
      .query(`DELETE FROM dbo.info_mo_inventory_history WHERE hostname = @hostname`);
    await pool.request().input('hostname', sql.VarChar, hostname)
      .query(`DELETE FROM dbo.info_mo_software WHERE hostname = @hostname`);
    await pool.request().input('hostname', sql.VarChar, hostname)
      .query(`DELETE FROM dbo.info_mo_active_users WHERE hostname = @hostname`);
    await pool.request().input('hostname', sql.VarChar, hostname)
      .query(`DELETE FROM dbo.info_mo_inventory WHERE hostname = @hostname`);
    res.json({ success: true, message: 'Monitor record deleted' });
  } catch (err) {
    console.error('deleteInventory error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ✅ export ชื่อเดิมด้วย เพื่อไม่ให้ routes file เดิมที่ import 'deleteInventory' พัง
export const deleteInventory = deleteInventoryWithHistory;