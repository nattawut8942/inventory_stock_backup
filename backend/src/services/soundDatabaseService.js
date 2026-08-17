/**
 * soundDatabaseService.js
 * Tables: sound_devices, sound_status_logs (ใน dbInfrastructure)
 */

import sql from 'mssql';
import { getSoundPool } from '../config/soundDb.js';

// ─── DEVICES ──────────────────────────────────────────────────

export async function getAllDevices() {
  const p = getSoundPool();
  const result = await p.request().query(
    'SELECT * FROM sound_devices ORDER BY id'
  );
  return result.recordset;
}

export async function getDeviceById(id) {
  const p = getSoundPool();
  const result = await p.request()
    .input('id', sql.Int, id)
    .query('SELECT * FROM sound_devices WHERE id = @id');
  return result.recordset[0] || null;
}

export async function createDevice({ device_name, ip_address, device_type = 'NX-100', device_subtype = null, location = '', mac_address = null, connected_switch_id = null, connected_tx_id = null }) {
  const p = getSoundPool();
  const result = await p.request()
    .input('device_name',        sql.NVarChar(100), device_name)
    .input('ip_address',         sql.VarChar(15),   ip_address)
    .input('device_type',        sql.NVarChar(50),  device_type)
    .input('device_subtype',     sql.NVarChar(50),  device_subtype || null)
    .input('location',           sql.NVarChar(100), location)
    .input('mac_address',        sql.NVarChar(17),  mac_address || null)
    .input('connected_switch_id',sql.Int,           connected_switch_id || null)
    .input('connected_tx_id',    sql.Int,           connected_tx_id || null)
    .query(`
      INSERT INTO sound_devices (device_name, ip_address, device_type, device_subtype, location, current_status, ping_status, http_status, mac_address, connected_switch_id, connected_tx_id)
      OUTPUT INSERTED.id
      VALUES (@device_name, @ip_address, @device_type, @device_subtype, @location, 'Unknown', 'Unknown', 'Unknown', @mac_address, @connected_switch_id, @connected_tx_id)
    `);
  return result.recordset[0].id;
}

export async function updateDevice(id, updates) {
  const allowed = ['device_name', 'ip_address', 'device_type', 'device_subtype', 'location', 'mac_address', 'connected_switch_id', 'connected_tx_id'];
  const fields  = Object.keys(updates).filter(k => allowed.includes(k));
  if (!fields.length) return;

  const p   = getSoundPool();
  const req = p.request().input('id', sql.Int, id);
  const setClauses = fields.map(f => {
    if (f === 'connected_switch_id' || f === 'connected_tx_id')
      req.input(f, sql.Int, updates[f] || null);
    else
      req.input(f, sql.NVarChar(200), updates[f]);
    return `${f} = @${f}`;
  });
  await req.query(`UPDATE sound_devices SET ${setClauses.join(', ')} WHERE id = @id`);
}

export async function deleteDevice(id) {
  const p = getSoundPool();
  const result = await p.request()
    .input('id', sql.Int, id)
    .query('DELETE FROM sound_devices WHERE id = @id');
  return result.rowsAffected[0];
}

// ─── STATUS UPDATE ────────────────────────────────────────────

// อัปเดต ping_status และ current_status
export async function updatePingStatus(deviceId, pingStatus) {
  const p = getSoundPool();

  // ดึง previous status สำหรับ log
  const cur = await p.request()
    .input('id', sql.Int, deviceId)
    .query('SELECT current_status, ping_status FROM sound_devices WHERE id = @id');
  const prev = cur.recordset[0]?.ping_status || 'Unknown';

  await p.request()
    .input('ping_status',    sql.NVarChar(20), pingStatus)
    .input('current_status', sql.NVarChar(20), pingStatus) // current = ping result
    .input('id',             sql.Int,          deviceId)
    .query(`
      UPDATE sound_devices
      SET ping_status    = @ping_status,
          current_status = @current_status,
          last_checked   = GETDATE()
      WHERE id = @id
    `);

  if (prev !== pingStatus) {
    await _insertLog(deviceId, prev, pingStatus, `Ping: ${prev} → ${pingStatus}`);
  }
}

// อัปเดต http_status และ current_status (ใช้ http_status เป็น current_status หลัก)
export async function updateHttpStatus(deviceId, httpStatus, responseTime = 0) {
  const p = getSoundPool();

  const cur = await p.request()
    .input('id', sql.Int, deviceId)
    .query('SELECT current_status, http_status FROM sound_devices WHERE id = @id');
  const prev = cur.recordset[0]?.http_status || 'Unknown';

  await p.request()
    .input('http_status',    sql.NVarChar(20), httpStatus)
    .input('current_status', sql.NVarChar(20), httpStatus) // current = http result (latest check)
    .input('responseTime',   sql.Int,          responseTime || 0)
    .input('id',             sql.Int,          deviceId)
    .query(`
      UPDATE sound_devices
      SET http_status      = @http_status,
          current_status   = @current_status,
          response_time_ms = @responseTime,
          last_checked     = GETDATE()
      WHERE id = @id
    `);

  if (prev !== httpStatus) {
    await _insertLog(deviceId, prev, httpStatus, `HTTP: ${prev} → ${httpStatus}`);
  }
}

// backward compat — ใช้ใน pingAll / checkAll
export async function updateDeviceStatus(deviceId, newStatus, responseTime = 0) {
  if (newStatus === 'Online' || newStatus === 'Offline') {
    await updatePingStatus(deviceId, newStatus);
  } else {
    await updateHttpStatus(deviceId, newStatus, responseTime);
  }
}

async function _insertLog(deviceId, previousStatus, newStatus, details) {
  const p = getSoundPool();
  await p.request()
    .input('device_id',       sql.Int,               deviceId)
    .input('previous_status', sql.NVarChar(20),      previousStatus)
    .input('new_status',      sql.NVarChar(20),      newStatus)
    .input('log_details',     sql.NVarChar(sql.MAX), details)
    .query(`
      INSERT INTO sound_status_logs (device_id, previous_status, new_status, log_details)
      VALUES (@device_id, @previous_status, @new_status, @log_details)
    `);
  console.log(`[📝 Sound] Device ${deviceId}: ${details}`);
}

// ─── CANVAS POSITION ──────────────────────────────────────────

export async function updateDevicePosition(deviceId, x, y) {
  const p = getSoundPool();
  await p.request()
    .input('id',    sql.Int, deviceId)
    .input('pos_x', sql.Int, Math.round(x))
    .input('pos_y', sql.Int, Math.round(y))
    .query('UPDATE sound_devices SET pos_x = @pos_x, pos_y = @pos_y WHERE id = @id');
}

export async function getStatusLogs(deviceId, limit = 50) {
  const p = getSoundPool();
  const result = await p.request()
    .input('device_id', sql.Int, deviceId)
    .input('limit',     sql.Int, limit)
    .query(`
      SELECT TOP (@limit) *
      FROM sound_status_logs
      WHERE device_id = @device_id
      ORDER BY created_at DESC
    `);
  return result.recordset;
}