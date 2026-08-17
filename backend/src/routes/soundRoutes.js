/**
 * soundRoutes.js
 * REST API routes สำหรับ Sound project
 * ใช้ใน app.js: app.use('/api', soundRoutes)
 */

import express from 'express';
import {
  getDevices, getDevice, addDevice, editDevice, removeDevice,
  pingDevice, checkHttp, pingAll, checkAll,
  updatePosition, getDeviceLogs,
} from '../controllers/soundDeviceController.js';

const router = express.Router();

// Devices
router.get   ('/devices',               getDevices);
router.get   ('/devices/:id',           getDevice);
router.post  ('/devices',               addDevice);
router.put   ('/devices/:id',           editDevice);
router.delete('/devices/:id',           removeDevice);

// Canvas Position
router.put   ('/devices/:id/position',  updatePosition);

// Health Check — All (ต้องอยู่ก่อน :id เพื่อไม่ให้ชนกัน)
router.post  ('/devices/ping-all',       pingAll);
router.post  ('/devices/check-all',      checkAll);

// Health Check — Per Device
router.post  ('/devices/:id/ping',       pingDevice);
router.post  ('/devices/:id/check-http', checkHttp);

// Logs
router.get   ('/logs/:deviceId',         getDeviceLogs);

export default router;