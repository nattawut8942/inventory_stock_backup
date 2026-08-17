/**
 * soundDeviceController.js
 * ping_status  = Online / Offline
 * http_status  = Active / Device Error / Offline
 */

import {
  getAllDevices, getDeviceById, createDevice,
  updateDevice, deleteDevice, updatePingStatus, updateHttpStatus,
  updateDeviceStatus, updateDevicePosition, getStatusLogs,
} from '../services/soundDatabaseService.js';

import { checkDeviceHealth } from '../services/soundHealthCheckService.js';
import { getSoundPool } from '../config/soundDb.js';
import sql from 'mssql';

// ─── DEVICES ──────────────────────────────────────────────────

export async function getDevices(req, res) {
  try { res.json(await getAllDevices()); }
  catch (err) { res.status(500).json({ error: err.message }); }
}

export async function getDevice(req, res) {
  try {
    const device = await getDeviceById(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json(device);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

export async function addDevice(req, res) {
  try {
    const { device_name, ip_address, device_type, device_subtype, location, mac_address, connected_switch_id, connected_tx_id } = req.body;
    if (!device_name || !ip_address)
      return res.status(400).json({ error: 'device_name and ip_address are required' });
    const id = await createDevice({ device_name, ip_address, device_type, device_subtype, location, mac_address, connected_switch_id, connected_tx_id });
    res.status(201).json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

export async function editDevice(req, res) {
  try {
    const { device_name, ip_address, device_type, device_subtype, location, mac_address, connected_switch_id, connected_tx_id } = req.body;
    await updateDevice(req.params.id, { device_name, ip_address, device_type, device_subtype, location, mac_address, connected_switch_id, connected_tx_id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

export async function removeDevice(req, res) {
  try {
    const id = parseInt(req.params.id);
    const p  = getSoundPool();

    // Clear references ก่อนลบ (กรณีเป็น Switch หรือ TX ที่มีคนอ้างถึง)
    await p.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE sound_devices SET connected_switch_id = NULL WHERE connected_switch_id = @id;
        UPDATE sound_devices SET connected_tx_id     = NULL WHERE connected_tx_id     = @id;
      `);

    await deleteDevice(id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── PING ONLY → ping_status = Online / Offline ───────────────

export async function pingDevice(req, res) {
  try {
    const device = await getDeviceById(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const result = await checkDeviceHealth(device.ip_address);
    await updatePingStatus(device.id, result.pingStatus);

    res.json({
      success:     true,
      ip:          device.ip_address,
      alive:       result.pingStatus === 'Online',
      ping_status: result.pingStatus,
      message:     result.pingStatus === 'Online'
        ? `✓ Ping OK — ${device.ip_address} is Online`
        : `✗ Ping failed — ${device.ip_address} is Offline`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── CHECK HTTP → http_status = Active / Device Error / Offline ─

export async function checkHttp(req, res) {
  try {
    const device = await getDeviceById(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const result = await checkDeviceHealth(device.ip_address);
    await updatePingStatus(device.id, result.pingStatus);
    await updateHttpStatus(device.id, result.httpStatus, result.responseTime);

    res.json({
      success:      result.httpStatus === 'Active',
      ip:           device.ip_address,
      http_status:  result.httpStatus,
      responseTime: result.responseTime,
      message:      result.error || `HTTP Check — ${result.httpStatus}`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── PING ALL ─────────────────────────────────────────────────

export async function pingAll(req, res) {
  try {
    const devices = await getAllDevices();
    const results = await Promise.all(
      devices.map(async d => {
        const r = await checkDeviceHealth(d.ip_address);
        await updatePingStatus(d.id, r.pingStatus);
        return r;
      })
    );
    res.json({
      success: true,
      total:   results.length,
      online:  results.filter(r => r.pingStatus === 'Online').length,
      offline: results.filter(r => r.pingStatus === 'Offline').length,
      active:  0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── CHECK ALL ────────────────────────────────────────────────

export async function checkAll(req, res) {
  try {
    const devices = await getAllDevices();
    const results = await Promise.all(
      devices.map(async d => {
        const r = await checkDeviceHealth(d.ip_address);
        await updatePingStatus(d.id, r.pingStatus);
        await updateHttpStatus(d.id, r.httpStatus, r.responseTime);
        return r;
      })
    );
    res.json({
      success:     true,
      total:       results.length,
      active:      results.filter(r => r.httpStatus === 'Active').length,
      online:      results.filter(r => r.pingStatus === 'Online').length,
      offline:     results.filter(r => r.pingStatus === 'Offline').length,
      deviceError: results.filter(r => r.httpStatus === 'Device Error').length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── CANVAS POSITION ──────────────────────────────────────────

// PUT /api/sound/devices/:id/position
export async function updatePosition(req, res) {
  try {
    const { x, y } = req.body;
    if (x === undefined || y === undefined)
      return res.status(400).json({ error: 'x and y are required' });
    await updateDevicePosition(req.params.id, x, y);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── LOGS ─────────────────────────────────────────────────────

export async function getDeviceLogs(req, res) {
  try { res.json(await getStatusLogs(req.params.deviceId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
}