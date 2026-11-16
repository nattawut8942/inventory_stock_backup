import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import {
    getRacks, getRacksByLayout, createRack, updateRack, deleteRack,
    getSwitches, getSwitchesByRack, createSwitch, updateSwitch, deleteSwitch,
    getCameras, getCamerasByLayout,
    createCamera, updateCamera, updateCameraLocation, updateCameraStatus, deleteCamera,
    pingCameraById, pingAllCameras, reorderLayouts,
    getMaintenanceLogs, createMaintenanceLog, updateMaintenanceLog,
    deleteMaintenanceLog, exportMaintenanceLogs,
    getRecordServers, createRecordServer, updateRecordServer, deleteRecordServer,
} from '../controllers/cctvController.js';

const router = express.Router();

// ─── Rack ──────────────────────────────────────────────────────────────────
router.get   ('/cctv/racks',                    getRacks);
router.get   ('/cctv/racks/layout/:layout_id',  getRacksByLayout);
router.post  ('/cctv/racks', requirePerm('cctv', 'create'),                    createRack);
router.put   ('/cctv/racks/:id', requirePerm('cctv', 'edit'),                updateRack);
router.delete('/cctv/racks/:id', requirePerm('cctv', 'delete'),                deleteRack);

// ─── Switch ────────────────────────────────────────────────────────────────
router.get   ('/cctv/switches',                 getSwitches);
router.get   ('/cctv/switches/rack/:rack_id',   getSwitchesByRack);
router.post  ('/cctv/switches', requirePerm('cctv', 'create'),                 createSwitch);
router.put   ('/cctv/switches/:id', requirePerm('cctv', 'edit'),             updateSwitch);
router.delete('/cctv/switches/:id', requirePerm('cctv', 'delete'),             deleteSwitch);

// ─── Camera ────────────────────────────────────────────────────────────────
router.get   ('/cctv/cameras',                  getCameras);
router.get   ('/cctv/cameras/layout/:layout_id',getCamerasByLayout);
router.post  ('/cctv/cameras', requirePerm('cctv', 'create'),                  createCamera);
router.put   ('/cctv/cameras/:id', requirePerm('cctv', 'edit'),              updateCamera);
router.patch ('/cctv/cameras/:id/status', requirePerm('cctv', 'edit'),       updateCameraStatus);
router.patch ('/cctv/cameras/:id/location', requirePerm('cctv', 'edit', { strict: true }),     updateCameraLocation);
router.delete('/cctv/cameras/:id', requirePerm('cctv', 'delete'),              deleteCamera);

// ─── Ping ──────────────────────────────────────────────────────────────────
router.post  ('/cctv/ping/:id', requirePerm('cctv', 'view'),                 pingCameraById);
router.post  ('/cctv/ping-all', requirePerm('cctv', 'view'),                 pingAllCameras);

// ─── Layout Reorder ────────────────────────────────────────────────────────
router.patch ('/cctv/layouts/reorder', requirePerm('mgmt-factory-layouts', 'edit'),          reorderLayouts);

// ─── Maintenance Logs ──────────────────────────────────────────────────────
router.get   ('/cctv/maintenance-logs',         getMaintenanceLogs);
router.get   ('/cctv/maintenance-logs/export',  exportMaintenanceLogs);
router.post  ('/cctv/maintenance-logs', requirePerm('cctv', 'create'),         createMaintenanceLog);
router.put   ('/cctv/maintenance-logs/:id', requirePerm('cctv', 'edit'),     updateMaintenanceLog);
router.delete('/cctv/maintenance-logs/:id', requirePerm('cctv', 'delete'),     deleteMaintenanceLog);

// ─── Record Servers ────────────────────────────────────────────────────────
router.get   ('/cctv/record-servers',      getRecordServers);
router.post  ('/cctv/record-servers', requirePerm('mgmt-record-servers', 'create', { strict: true }),      createRecordServer);
router.put   ('/cctv/record-servers/:id', requirePerm('mgmt-record-servers', 'edit', { strict: true }),  updateRecordServer);
router.delete('/cctv/record-servers/:id', requirePerm('mgmt-record-servers', 'delete', { strict: true }),  deleteRecordServer);

router.post('/cctv/capture/trigger', requirePerm('cctv', 'edit'), async (req, res) => {
    // ป้องกันคนอื่นสุ่มยิง endpoint นี้เล่น
    const { secret } = req.body;
    if (secret !== '613861') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    // ตอบกลับทันทีไม่ต้องรอ (เพราะ capture ใช้เวลานาน)
    res.json({ success: true, message: 'Capture started in background' });

    // รันแบบ background ไม่ block response
    const { runCctvCaptureJob } = await import('../cctv/cctvCaptureJob.js');
    runCctvCaptureJob()
        .then(r => console.log('[Manual Trigger] Done:', r))
        .catch(e => console.error('[Manual Trigger] Error:', e.message));
});

export default router;