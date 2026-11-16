/**
 * soundRoutes.js
 * REST API routes สำหรับ Sound project
 * ใช้ใน app.js: app.use('/api', soundRoutes)
 */

import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
  getDevices, getDevice, addDevice, editDevice, removeDevice,
  pingDevice, checkHttp, pingAll, checkAll,
  updatePosition, getDeviceLogs,
} from '../controllers/soundDeviceController.js';

const router = express.Router();

// Devices
router.get   ('/devices',               getDevices);
router.get   ('/devices/:id',           getDevice);
router.post  ('/devices', requirePerm('sound-layout', 'create'),               addDevice);
router.put   ('/devices/:id', requirePerm('sound-layout', 'edit'),           editDevice);
router.delete('/devices/:id', requirePerm('sound-layout', 'delete'),           removeDevice);

// Canvas Position
router.put   ('/devices/:id/position', requirePerm('sound-layout', 'edit'),  updatePosition);

// Health Check — All (ต้องอยู่ก่อน :id เพื่อไม่ให้ชนกัน)
router.post  ('/devices/ping-all', requirePerm('sound-layout', 'view'),       pingAll);
router.post  ('/devices/check-all', requirePerm('sound-layout', 'view'),      checkAll);

// Health Check — Per Device
router.post  ('/devices/:id/ping', requirePerm('sound-layout', 'view'),       pingDevice);
router.post  ('/devices/:id/check-http', requirePerm('sound-layout', 'view'), checkHttp);

// Logs
router.get   ('/logs/:deviceId',         getDeviceLogs);

export default router;