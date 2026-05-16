import express from 'express';
import {
    upload,
    // Rack
    getRacks, getRacksByLayout, createRack, updateRack, deleteRack,
    // Switch
    getSwitches, getSwitchesByRack, createSwitch, updateSwitch, deleteSwitch,
    // Camera
    getCameras, getCamerasByLayout,
    createCamera, updateCamera, updateCameraLocation, deleteCamera,
    pingCameraById, pingAllCameras,
} from '../controllers/cctvController.js';

const router = express.Router();

// ─── Rack ──────────────────────────────────────────────────────────────────
router.get   ('/cctv/racks',                     getRacks);
router.get   ('/cctv/racks/layout/:layout_id',   getRacksByLayout);
router.post  ('/cctv/racks',       upload.single('icon'), createRack);
router.put   ('/cctv/racks/:id',   upload.single('icon'), updateRack);
router.delete('/cctv/racks/:id',                 deleteRack);

// ─── Switch ────────────────────────────────────────────────────────────────
router.get   ('/cctv/switches',                  getSwitches);
router.get   ('/cctv/switches/rack/:rack_id',    getSwitchesByRack);
router.post  ('/cctv/switches',    upload.single('icon'), createSwitch);
router.put   ('/cctv/switches/:id',upload.single('icon'), updateSwitch);
router.delete('/cctv/switches/:id',              deleteSwitch);

// ─── Camera ────────────────────────────────────────────────────────────────
router.get   ('/cctv/cameras',                        getCameras);
router.get   ('/cctv/cameras/layout/:layout_id',      getCamerasByLayout);
router.post  ('/cctv/cameras',         upload.fields([{name:'icon',maxCount:1},{name:'snapshot',maxCount:1}]), createCamera);
router.put   ('/cctv/cameras/:id',     upload.fields([{name:'icon',maxCount:1},{name:'snapshot',maxCount:1}]), updateCamera);
router.patch ('/cctv/cameras/:id/location',            updateCameraLocation);
router.delete('/cctv/cameras/:id',                     deleteCamera);

// ─── Ping ──────────────────────────────────────────────────────────────────
router.post  ('/cctv/ping/:id',    pingCameraById);   // ping กล้องเดี่ยว
router.post  ('/cctv/ping-all',    pingAllCameras);   // ping ทุกกล้อง

export default router;