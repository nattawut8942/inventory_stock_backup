import express from 'express';
import sql from 'mssql';
import { getPool } from '../config/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { requireDbAdmin } from '../middleware/permissionMiddleware.js';
import { auditTableReady, RETENTION_DAYS } from '../services/auditLogService.js';

// ประวัติการทำงาน (Stock_AuditLog) — Admin เท่านั้น (เช็คจากฐานข้อมูล เหมือนหน้าผู้ใช้/ประวัติเข้าระบบ)
const router = express.Router();
const ACTIONS = ['create', 'update', 'delete', 'action'];

router.get('/audit-log', verifyToken, requireDbAdmin, async (req, res) => {
    if (!(await auditTableReady())) return res.json({ ready: false, retentionDays: RETENTION_DAYS, rows: [] });
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), RETENTION_DAYS);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 2000, 1), 5000);
    const action = String(req.query.action || '').toLowerCase();
    const module = String(req.query.module || '').trim();
    const empcode = String(req.query.empcode || '').trim();
    const result = String(req.query.result || '').toLowerCase(); // ok | fail
    try {
        const r = getPool().request().input('days', sql.Int, days).input('limit', sql.Int, limit);
        let where = 'a.CreatedAt >= DATEADD(DAY, -@days, SYSDATETIME())';
        if (ACTIONS.includes(action)) { r.input('action', sql.VarChar(20), action); where += ' AND a.Action = @action'; }
        if (module) { r.input('module', sql.NVarChar(60), module); where += ' AND a.Module = @module'; }
        if (empcode) { r.input('empcode', sql.NVarChar(20), empcode); where += ' AND a.EmpCode = @empcode'; }
        if (result === 'ok') where += ' AND a.Success = 1';
        if (result === 'fail') where += ' AND a.Success = 0';
        const q = await r.query(`
            SELECT TOP (@limit) a.AuditID, a.CreatedAt, a.EmpCode, a.Username, COALESCE(u.Name, a.DisplayName) AS Name, u.EmpPic,
                   a.Method, a.Action, a.Module, a.Path, a.RecordId, a.Summary, a.StatusCode, a.Success, a.DurationMs, a.IpAddress, a.Body
            FROM dbo.Stock_AuditLog a
            LEFT JOIN dbo.Stock_Users u ON u.EmpCode = a.EmpCode
            WHERE ${where}
            ORDER BY a.CreatedAt DESC, a.AuditID DESC`);
        res.json({ ready: true, retentionDays: RETENTION_DAYS, limit, rows: q.recordset });
    } catch (err) {
        console.error('Get audit log error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
