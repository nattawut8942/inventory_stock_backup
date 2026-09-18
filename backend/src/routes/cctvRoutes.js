import express from 'express';
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
router.post  ('/cctv/racks',                    createRack);
router.put   ('/cctv/racks/:id',                updateRack);
router.delete('/cctv/racks/:id',                deleteRack);

// ─── Switch ────────────────────────────────────────────────────────────────
router.get   ('/cctv/switches',                 getSwitches);
router.get   ('/cctv/switches/rack/:rack_id',   getSwitchesByRack);
router.post  ('/cctv/switches',                 createSwitch);
router.put   ('/cctv/switches/:id',             updateSwitch);
router.delete('/cctv/switches/:id',             deleteSwitch);

// ─── Camera ────────────────────────────────────────────────────────────────
router.get   ('/cctv/cameras',                  getCameras);
router.get   ('/cctv/cameras/layout/:layout_id',getCamerasByLayout);
router.post  ('/cctv/cameras',                  createCamera);
router.put   ('/cctv/cameras/:id',              updateCamera);
router.patch ('/cctv/cameras/:id/status',       updateCameraStatus);
router.patch ('/cctv/cameras/:id/location',     updateCameraLocation);
router.delete('/cctv/cameras/:id',              deleteCamera);

// ─── Ping ──────────────────────────────────────────────────────────────────
router.post  ('/cctv/ping/:id',                 pingCameraById);
router.post  ('/cctv/ping-all',                 pingAllCameras);

// ─── Layout Reorder ────────────────────────────────────────────────────────
router.patch ('/cctv/layouts/reorder',          reorderLayouts);

// ─── Maintenance Logs ──────────────────────────────────────────────────────
router.get   ('/cctv/maintenance-logs',         getMaintenanceLogs);
router.get   ('/cctv/maintenance-logs/export',  exportMaintenanceLogs);
router.post  ('/cctv/maintenance-logs',         createMaintenanceLog);
router.put   ('/cctv/maintenance-logs/:id',     updateMaintenanceLog);
router.delete('/cctv/maintenance-logs/:id',     deleteMaintenanceLog);

// ─── Record Servers ────────────────────────────────────────────────────────
router.get   ('/cctv/record-servers',      getRecordServers);
router.post  ('/cctv/record-servers',      createRecordServer);
router.put   ('/cctv/record-servers/:id',  updateRecordServer);
router.delete('/cctv/record-servers/:id',  deleteRecordServer);

router.post('/cctv/capture/trigger', async (req, res) => {
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