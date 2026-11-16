import express from 'express';
import { requirePerm } from '../middleware/permissionMiddleware.js';
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
router.post  ('/quota/sync', requirePerm('quota-manager', 'view'),                syncQuota);
router.post  ('/quota/send-warning-single', requirePerm('quota-manager', 'send'), sendWarningSingle);
router.post  ('/quota/send-warning', requirePerm('quota-manager', 'send'),        sendWarningEmails);
router.post  ('/quota/send-report', requirePerm('quota-manager', 'send'),         sendReportEmail);
router.post  ('/quota/cancel/:jobId', requirePerm('quota-manager', 'send'),       cancelJob);
router.get   ('/quota/log/:id',             getEmailLog);
router.delete('/quota/log/:id', requirePerm('quota-manager', 'delete'),             deleteEmailLog);
router.delete('/quota/logs', requirePerm('quota-manager', 'delete'),                clearEmailLogs);
router.post  ('/quota/reset-stale', requirePerm('quota-manager', 'delete'),         resetStaleLogs);
router.get('/quota/sync-logs', getSyncLogs);

export default router;