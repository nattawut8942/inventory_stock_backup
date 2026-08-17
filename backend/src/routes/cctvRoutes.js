import express from 'express';
import {
    getRacks, getRacksByLayout, createRack, updateRack, deleteRack,
    getSwitches, getSwitchesByRack, createSwitch, updateSwitch, deleteSwitch,
    getCameras, getCamerasByLayout,
    createCamera, updateCamera, updateCameraLocation, updateCameraStatus, deleteCamera,
    pingCameraById, pingAllCameras, reorderLayouts,
    getMaintenanceLogs, createMaintenanceLog, updateMaintenanceLog,
    deleteMaintenanceLog, exportMaintenanceLogs,
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

export default router;