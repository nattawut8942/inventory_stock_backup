import express from 'express';
import {
    getCaptureSettings,
    updateCaptureSettings,
    triggerCapture,
    getCaptureLogs,
    getCaptureLogDetail,
} from './cctvCaptureController.js';

const router = express.Router();

router.get ('/cctv/capture/settings',      getCaptureSettings);
router.put ('/cctv/capture/settings',      updateCaptureSettings);
router.post('/cctv/capture/run',           triggerCapture);
router.get ('/cctv/capture/logs',          getCaptureLogs);
router.get ('/cctv/capture/logs/:run_id',  getCaptureLogDetail);

export default router;