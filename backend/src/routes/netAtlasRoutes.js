import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { devicePhoto, sitePhoto } from '../controllers/netAtlasDevicePhotoController.js';
import {
    listDeviceTypes, createDeviceType, updateDeviceType, deleteDeviceType,
} from '../controllers/netAtlasDeviceTypeController.js';
import {
    listLayouts, createLayout, updateLayout, deleteLayout, reorderLayouts,
    uploadFloorplan, setFloorplan, clearFloorplan,
    listDevices, createDevice, updateDevice, moveDevice, deleteDevice, listSources, setPortRemark,
} from '../controllers/netAtlasController.js';

// Mount: app.use('/ITinventory/api/netatlas', netAtlasRoutes)
// - ผัง (layouts) จัดการในหน้า Management → สิทธิ์ mgmt-netatlas-layouts
// - อุปกรณ์ (devices) จัดการในหน้า NetAtlas → สิทธิ์ netatlas
const router = express.Router();
const PAGE = 'netatlas';
const MGMT = 'mgmt-netatlas-layouts';

// ทุก endpoint ต้องล็อกอิน
router.use(verifyToken);

// multer error (ขนาดเกิน / ชนิดไฟล์ผิด) ให้ตอบ 400 พร้อมข้อความไทย แทน 500
const handleUpload = (uploader) => (req, res, next) => {
    uploader(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, error: err.message || 'อัปโหลดไฟล์ไม่สำเร็จ' });
        next();
    });
};

// ── Device types (master ประเภทอุปกรณ์) ── อ่านได้ทุกคนที่ login (ใช้ในหน้า NetAtlas) ──
const MGMT_TYPES = 'mgmt-netatlas-device-types';
router.get('/device-types', listDeviceTypes);
router.post('/device-types', requirePerm(MGMT_TYPES, 'create'), createDeviceType);
router.put('/device-types/:code', requirePerm(MGMT_TYPES, 'edit'), updateDeviceType);
router.delete('/device-types/:code', requirePerm(MGMT_TYPES, 'delete'), deleteDeviceType);

// ── Layouts (ผัง) ──
// รายชื่อผังเป็นข้อมูลอ้างอิงธรรมดา (ไม่ลับ) — ให้ทั้งหน้า NetAtlas และ Management ใช้ร่วมกันได้
// การเขียนข้อมูลทุกอย่างยังต้องผ่านสิทธิ์ด้านล่าง
router.get('/layouts', listLayouts);
router.post('/layouts', requirePerm(MGMT, 'create'), createLayout);
router.put('/layouts/order', requirePerm(MGMT, 'edit'), reorderLayouts);
router.put('/layouts/:id', requirePerm(MGMT, 'edit'), updateLayout);
router.delete('/layouts/:id', requirePerm(MGMT, 'delete'), deleteLayout);
router.put('/layouts/:id/floorplan', requirePerm(MGMT, 'edit'), handleUpload(uploadFloorplan), setFloorplan);
router.delete('/layouts/:id/floorplan', requirePerm(MGMT, 'edit'), clearFloorplan);

// ── Devices (อุปกรณ์) ──
router.get('/devices', requirePerm(PAGE, 'view'), listDevices);
// เครื่องจริงจาก PC / Monitor inventory ที่ยังไม่ถูกวางในผังใด (ใช้งานอยู่เท่านั้น)
router.get('/sources', requirePerm(PAGE, 'view'), listSources);
router.post('/devices', requirePerm(PAGE, 'create'), createDevice);
router.put('/devices/:id', requirePerm(PAGE, 'edit'), updateDevice);
router.patch('/devices/:id/position', requirePerm(PAGE, 'edit'), moveDevice);
router.delete('/devices/:id', requirePerm(PAGE, 'delete'), deleteDevice);
router.put('/devices/:id/ports/:portNo/remark', requirePerm(PAGE, 'edit'), setPortRemark);
router.put('/devices/:id/photo', requirePerm(PAGE, 'edit'), handleUpload(devicePhoto.upload), devicePhoto.set);
router.delete('/devices/:id/photo', requirePerm(PAGE, 'edit'), devicePhoto.clear);
router.put('/devices/:id/site-photo', requirePerm(PAGE, 'edit'), handleUpload(sitePhoto.upload), sitePhoto.set);
router.delete('/devices/:id/site-photo', requirePerm(PAGE, 'edit'), sitePhoto.clear);

export default router;
