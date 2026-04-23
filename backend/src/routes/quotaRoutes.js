import express from 'express';
import {
    getQuotaUsers, getQuotaStats, getEmailLogs,
    getFsrmStatus, syncQuota,getSyncLogs,
    sendWarningSingle, sendWarningEmails,
    sendReportEmail, getJobStatus,
    cancelJob, getEmailLog, deleteEmailLog, clearEmailLogs, resetStaleLogs,
} from '../controllers/quotaController.js';

const router = express.Router();

router.get   ('/quota/users',               getQuotaUsers);
router.get   ('/quota/stats',               getQuotaStats);
router.get   ('/quota/logs',                getEmailLogs);
router.get   ('/quota/fsrm-status',         getFsrmStatus);
router.get   ('/quota/job/:id',             getJobStatus);
router.post  ('/quota/sync',                syncQuota);
router.post  ('/quota/send-warning-single', sendWarningSingle);
router.post  ('/quota/send-warning',        sendWarningEmails);
router.post  ('/quota/send-report',         sendReportEmail);
router.post  ('/quota/cancel/:jobId',       cancelJob);
router.get   ('/quota/log/:id',             getEmailLog);
router.delete('/quota/log/:id',             deleteEmailLog);
router.delete('/quota/logs',                clearEmailLogs);
router.post  ('/quota/reset-stale',         resetStaleLogs);
router.get('/quota/sync-logs', getSyncLogs);

export default router;